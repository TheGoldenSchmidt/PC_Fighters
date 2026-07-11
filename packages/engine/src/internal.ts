// Interne Helfer: Werte-Berechnung (Auren!) und Kreatur-Erzeugung.
// Auren werden nie gespeichert, sondern immer dynamisch aus dem Feld berechnet:
// verschwindet die Quelle, verschwindet automatisch auch der Bonus.

import { KEYWORDS } from './keywords.js';
import type { Creature, GameState, PlayerIndex, TokenDef } from './types.js';

/** Fehlerhafte/unerlaubte Aktion eines Spielers (Meldung ist für den Client gedacht). */
export class GameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameRuleError';
  }
}

export function otherPlayer(p: PlayerIndex): PlayerIndex {
  return p === 0 ? 1 : 0;
}

/** Summe aller Aura-Boni, die verbündete Kreaturen dieser Lane geben. */
function auraBonus(state: GameState, owner: PlayerIndex, lane: number) {
  let attack = 0;
  let health = 0;
  state.board[owner].forEach((source, sourceLane) => {
    if (!source) return;
    for (const kw of source.keywords) {
      const aura = KEYWORDS[kw]?.aura;
      if (!aura) continue;
      const bonus = aura(state, owner, sourceLane, lane);
      if (bonus) {
        attack += bonus.attack;
        health += bonus.health;
      }
    }
  });
  return { attack, health };
}

/** Effektiver Angriff inkl. Keyword-Boni (rudel), temporärer Buffs und Auren. */
export function getEffectiveAttack(state: GameState, owner: PlayerIndex, lane: number): number {
  const c = state.board[owner][lane];
  if (!c) return 0;
  let attack = c.baseAttack + c.tempAttackBonus;
  for (const kw of c.keywords) {
    const bonus = KEYWORDS[kw]?.selfAttackBonus;
    if (bonus) attack += bonus(state, owner, lane);
  }
  attack += auraBonus(state, owner, lane).attack;
  return Math.max(0, attack);
}

/** Effektives Lebens-Maximum inkl. dauerhafter Buffs und Auren. */
export function getMaxHealth(state: GameState, owner: PlayerIndex, lane: number): number {
  const c = state.board[owner][lane];
  if (!c) return 0;
  return c.baseMaxHealth + c.permHealthBonus + auraBonus(state, owner, lane).health;
}

/**
 * Nach jeder Zustandsänderung aufrufen: gleicht Lebenspunkte an geänderte
 * Auren an und entfernt tote Kreaturen.
 * Regel: Steigt das Maximum (Aura kommt dazu), steigt das aktuelle Leben mit.
 * Fällt das Maximum (Aura fällt weg), sinkt das aktuelle Leben höchstens
 * auf das neue Maximum – bereits erlittener Schaden wird nicht doppelt bestraft.
 */
export function recalcBoard(state: GameState): string[] {
  const deaths: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const owner of [0, 1] as PlayerIndex[]) {
      for (let lane = 0; lane < state.board[owner].length; lane++) {
        const c = state.board[owner][lane];
        if (!c) continue;
        const max = getMaxHealth(state, owner, lane);
        if (max > c.lastMaxHealth) {
          c.currentHealth += max - c.lastMaxHealth;
        } else if (max < c.lastMaxHealth) {
          c.currentHealth = Math.min(c.currentHealth, max);
        }
        c.lastMaxHealth = max;
        if (c.currentHealth <= 0) {
          state.board[owner][lane] = null;
          deaths.push(`${c.name} wird zerstört.`);
          changed = true; // Auren der toten Kreatur fallen weg → neu rechnen
        }
      }
    }
  }
  return deaths;
}

export function makeCreature(
  state: GameState,
  def: {
    cardId: string;
    name: string;
    faction: string;
    attack: number;
    health: number;
    keywords: string[];
  },
  opts: { isToken: boolean }
): Creature {
  state.uidCounter += 1;
  const entersReady = def.keywords.some((k) => KEYWORDS[k]?.entersReady);
  return {
    uid: state.uidCounter,
    cardId: def.cardId,
    name: def.name,
    faction: def.faction,
    keywords: def.keywords,
    baseAttack: def.attack,
    baseMaxHealth: def.health,
    permHealthBonus: 0,
    tempAttackBonus: 0,
    currentHealth: def.health,
    lastMaxHealth: def.health, // recalcBoard() gleicht Auren direkt danach an
    exhausted: !entersReady,
    movedThisFlyPhase: false,
    isToken: opts.isToken
  };
}

export function makeTokenCreature(
  state: GameState,
  faction: string,
  token: TokenDef
): Creature {
  return makeCreature(
    state,
    {
      cardId: `token:${token.name}`,
      name: token.name,
      faction,
      attack: token.attack,
      health: token.health,
      keywords: token.keywords
    },
    { isToken: true }
  );
}

export function freeLanes(state: GameState, owner: PlayerIndex): number[] {
  const lanes: number[] = [];
  for (let i = 0; i < state.config.lanes; i++) {
    if (!state.board[owner][i]) lanes.push(i);
  }
  return lanes;
}

export function log(state: GameState, text: string): void {
  state.log.push({ round: state.round, text });
}
