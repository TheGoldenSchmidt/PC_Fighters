// Interne Helfer: Werte-Berechnung (Auren + Fähigkeiten!) und Kreatur-Erzeugung.
// Auren/Skalierungen werden nie gespeichert, sondern immer dynamisch aus dem Feld
// berechnet: verschwindet die Quelle, verschwindet automatisch auch der Bonus.

import { matchesScope } from './factions.js';
import { KEYWORDS } from './keywords.js';
import type { Ability, Creature, GameState, LogEvent, PlayerIndex, Scope, TokenDef } from './types.js';

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

interface Bonus {
  attack: number;
  health: number;
}

/** Zählt verbündete Kreaturen im scope (optional inkl. sich selbst). */
export function countScope(
  state: GameState,
  owner: PlayerIndex,
  lane: number,
  scope: Scope,
  includeSelf: boolean
): number {
  const self = state.board[owner][lane];
  if (!self) return 0;
  let n = 0;
  state.board[owner].forEach((c, i) => {
    if (!c) return;
    if (i === lane) {
      if (includeSelf) n += 1;
      return;
    }
    if (matchesScope(state.factionTree, scope, self.faction, c.faction)) n += 1;
  });
  return n;
}

/** "solo": keine andere Kreatur in derselben Lane – weder eigene noch gegnerische. */
export function isSoloInLane(state: GameState, owner: PlayerIndex, lane: number): boolean {
  return !state.board[otherPlayer(owner)][lane];
}

/** Multiplikator für `improvisation` je nach Basis-HP des Besitzers. */
function improvisationMultiplier(
  state: GameState,
  owner: PlayerIndex,
  ab: Extract<Ability, { kind: 'improvisation' }>
): number {
  const base = state.players[owner].base;
  if (ab.mode === 'schwelle') {
    return ab.schwelle != null && base <= ab.schwelle ? 1 : 0;
  }
  const fehlend = Math.max(0, state.config.baseHealth - base);
  return Math.floor(fehlend / (ab.proHp ?? 1));
}

/** Lane der einen Karte, an die ein `werkzeug` seinen Bonus vergibt (niedrigste Lane, gleiche Sub-Fraktion). */
function werkzeugTargetLane(state: GameState, owner: PlayerIndex, sourceLane: number): number {
  const src = state.board[owner][sourceLane];
  if (!src) return -1;
  for (let j = 0; j < state.board[owner].length; j++) {
    if (j === sourceLane) continue;
    const c = state.board[owner][j];
    if (c && matchesScope(state.factionTree, 'same_sub', src.faction, c.faction)) return j;
  }
  return -1;
}

/** Beitrag EINER Quell-Kreatur (deren Auren/werkzeug/improvisation) an eine Ziel-Lane. */
function sourceContribution(
  state: GameState,
  owner: PlayerIndex,
  sourceLane: number,
  targetLane: number
): Bonus {
  const source = state.board[owner][sourceLane];
  const target = state.board[owner][targetLane];
  if (!source || !target) return { attack: 0, health: 0 };
  let attack = 0;
  let health = 0;

  // Alt-Keyword-Auren (schild_nachbarn, aura_alle, …) – unverändert.
  for (const kw of source.keywords) {
    const aura = KEYWORDS[kw]?.aura;
    if (!aura) continue;
    const bonus = aura(state, owner, sourceLane, targetLane);
    if (bonus) {
      attack += bonus.attack;
      health += bonus.health;
    }
  }

  const tree = state.factionTree;
  for (const ab of source.abilities) {
    if (ab.kind === 'aura' && ab.timing === 'dauerhaft') {
      if (sourceLane !== targetLane && matchesScope(tree, ab.scope, source.faction, target.faction)) {
        attack += ab.buff.atk;
        health += ab.buff.hp;
      }
    } else if (ab.kind === 'nachbar' && (ab.effect === 'schild' || ab.effect === 'banner')) {
      const neighbor = Math.abs(sourceLane - targetLane) === 1;
      if (neighbor && matchesScope(tree, ab.scope, source.faction, target.faction)) {
        if (ab.effect === 'banner') attack += ab.amount;
        else health += ab.amount;
      }
    } else if (ab.kind === 'improvisation') {
      // Wirkt auch auf sich selbst (kein Ausschluss der Quell-Lane).
      if (matchesScope(tree, ab.scope, source.faction, target.faction)) {
        const mult = improvisationMultiplier(state, owner, ab);
        attack += ab.bonus.atk * mult;
        health += ab.bonus.hp * mult;
      }
    } else if (ab.kind === 'werkzeug') {
      if (sourceLane !== targetLane && targetLane === werkzeugTargetLane(state, owner, sourceLane)) {
        attack += ab.atk;
      }
    }
  }
  return { attack, health };
}

/** Summe aller Fremd-Boni (Auren, Nachbar, improvisation, werkzeug) für eine Lane. */
function auraBonus(state: GameState, owner: PlayerIndex, lane: number): Bonus {
  let attack = 0;
  let health = 0;
  for (let sourceLane = 0; sourceLane < state.board[owner].length; sourceLane++) {
    const b = sourceContribution(state, owner, sourceLane, lane);
    attack += b.attack;
    health += b.health;
  }
  return { attack, health };
}

/** Selbst-Boni einer Kreatur (skalierung, neugier, kaltbluetig). */
function selfAbilityBonus(state: GameState, owner: PlayerIndex, lane: number): Bonus {
  const c = state.board[owner][lane];
  if (!c) return { attack: 0, health: 0 };
  let attack = 0;
  let health = 0;
  for (const ab of c.abilities) {
    if (ab.kind === 'skalierung') {
      const count = countScope(state, owner, lane, ab.scope, ab.includeSelf ?? false);
      const eff = ab.cap != null ? Math.min(count, ab.cap) : count;
      attack += ab.per.atk * eff;
      health += ab.per.hp * eff;
    } else if (ab.kind === 'neugier' && ab.bonus) {
      if (isSoloInLane(state, owner, lane)) {
        attack += ab.bonus.atk;
        health += ab.bonus.hp;
      }
    } else if (ab.kind === 'kaltbluetig') {
      if (!c.attackedThisRound) {
        attack += ab.bonus.atk;
        health += ab.bonus.hp;
      }
    }
  }
  return { attack, health };
}

/** Effektiver Angriff inkl. Alt-Keywords (rudel), Fähigkeiten, Buffs und Auren. */
export function getEffectiveAttack(state: GameState, owner: PlayerIndex, lane: number): number {
  const c = state.board[owner][lane];
  if (!c) return 0;
  let attack = c.baseAttack + c.permAttackBonus + c.tempAttackBonus;
  for (const kw of c.keywords) {
    const bonus = KEYWORDS[kw]?.selfAttackBonus;
    if (bonus) attack += bonus(state, owner, lane);
  }
  attack += selfAbilityBonus(state, owner, lane).attack;
  attack += auraBonus(state, owner, lane).attack;
  return Math.max(0, attack);
}

/** Effektives Lebens-Maximum inkl. dauerhafter Buffs, Fähigkeiten und Auren. */
export function getMaxHealth(state: GameState, owner: PlayerIndex, lane: number): number {
  const c = state.board[owner][lane];
  if (!c) return 0;
  const bonus = selfAbilityBonus(state, owner, lane).health + auraBonus(state, owner, lane).health;
  return Math.max(1, c.baseMaxHealth + c.permHealthBonus + bonus);
}

export interface DeathInfo {
  owner: PlayerIndex;
  lane: number;
  name: string;
  faction: string;
  /** Snapshot der toten Kreatur – für Beim-Tod-Effekte (todesfluch, beschwoeren). */
  creature: Creature;
}

/** Todes-Rettung (einmal pro Spiel): fängt currentHealth ≤ 0 ab. */
function tryRettung(creature: Creature, maxHealth: number): boolean {
  if (creature.rettungUsed) return false;
  const rescue = creature.abilities.find(
    (a): a is Extract<Ability, { kind: 'rettung' }> => a.kind === 'rettung'
  );
  if (!rescue) return false;
  creature.rettungUsed = true;
  if (rescue.mode === 'full_heal') {
    creature.currentHealth = maxHealth;
    creature.poison = 0; // Häutung entfernt Gift
  } else {
    creature.currentHealth = 1; // survive_1hp / revive_1hp
  }
  return true;
}

/** Schadensübernahme: ein Nachbar im scope opfert sich für einen tödlichen Treffer. */
function trySchutz(state: GameState, owner: PlayerIndex, lane: number): boolean {
  const dying = state.board[owner][lane];
  if (!dying) return false;
  for (const nLane of [lane - 1, lane + 1]) {
    const protector = state.board[owner]?.[nLane];
    if (!protector || protector.schutzUsed) continue;
    const ab = protector.abilities.find(
      (a) => a.kind === 'nachbar' && a.effect === 'schadensuebernahme'
    ) as Extract<Ability, { kind: 'nachbar' }> | undefined;
    if (!ab) continue;
    if (!matchesScope(state.factionTree, ab.scope, protector.faction, dying.faction)) continue;
    protector.schutzUsed = true;
    protector.currentHealth = 0; // opfert sich
    dying.currentHealth = 1; // gerettet
    return true;
  }
  return false;
}

/**
 * Nach jeder Zustandsänderung aufrufen: gleicht Lebenspunkte an geänderte
 * Auren an und entfernt tote Kreaturen (außer Todes-Rettung/Schutz greift).
 */
export function recalcBoard(state: GameState): DeathInfo[] {
  const deaths: DeathInfo[] = [];
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
          if (tryRettung(c, max)) {
            changed = true; // gerettet – Auren neu rechnen
            continue;
          }
          if (trySchutz(state, owner, lane)) {
            changed = true; // Nachbar opfert sich – neu rechnen
            continue;
          }
          state.board[owner][lane] = null;
          deaths.push({ owner, lane, name: c.name, faction: c.faction, creature: c });
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
    abilities?: Ability[];
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
    abilities: def.abilities ? def.abilities.map((a) => ({ ...a })) : [],
    baseAttack: def.attack,
    baseMaxHealth: def.health,
    permHealthBonus: 0,
    permAttackBonus: 0,
    tempAttackBonus: 0,
    currentHealth: def.health,
    lastMaxHealth: def.health, // recalcBoard() gleicht Auren direkt danach an
    exhausted: !entersReady,
    movedThisFlyPhase: false,
    isToken: opts.isToken,
    poison: 0,
    attackedThisRound: false,
    spawnRound: state.round,
    ueberstundenDone: false,
    rettungUsed: false,
    schutzUsed: false
  };
}

export function makeTokenCreature(state: GameState, faction: string, token: TokenDef): Creature {
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

export function log(state: GameState, text: string, event?: LogEvent): void {
  state.log.push({ id: state.log.length, round: state.round, text, ...(event ? { event } : {}) });
}
