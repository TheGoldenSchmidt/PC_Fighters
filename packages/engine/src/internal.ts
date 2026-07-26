// Interne Helfer: Werte-Berechnung (Auren + Fähigkeiten!) und Kreatur-Erzeugung.
// Auren/Skalierungen werden nie gespeichert, sondern immer dynamisch aus dem Feld
// berechnet: verschwindet die Quelle, verschwindet automatisch auch der Bonus.

import { countScope, isSoloInLane, KLASSE_A_HOOKS } from './abilityHooks.js';
import { matchesScope } from './factions.js';
import { KEYWORDS } from './keywords.js';
import { zaehleKarte, zaehleSpieler } from './stats.js';
import type { Ability, Creature, GameState, LogEvent, PlayerIndex, TokenDef } from './types.js';

// Re-Export für Rückwärtskompatibilität (countScope/isSoloInLane lebten bis
// zum Ability-Registry-Umbau in dieser Datei; abilityHooks.ts ist jetzt die
// Quelle, weil dort auch die Klasse-A-Registry liegt – siehe deren Kommentar
// zum Zirkelimport-Grund).
export { countScope, isSoloInLane };

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

/**
 * Beitrag EINER Quell-Kreatur (deren Auren/werkzeug/improvisation) an eine
 * Ziel-Lane. Dispatcht über KLASSE_A_HOOKS (abilityHooks.ts) statt eines
 * manuellen if/else-if pro `kind` – ein neues Primitiv braucht dadurch nur
 * noch einen Registry-Eintrag, keine Änderung an dieser Schleife.
 */
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

  for (const ab of source.abilities) {
    const hook = KLASSE_A_HOOKS[ab.kind]?.beitragAura;
    if (!hook) continue;
    // TypeScript kann die Ability-Union hier nicht anhand von `ab.kind` auf
    // den zur Registry-Kind passenden Zweig einengen (Lookup über ein
    // generisches Record) – der Aufbau von KLASSE_A_HOOKS stellt sicher,
    // dass jeder Hook nur für sein eigenes `kind` registriert ist.
    const bonus = (hook as (s: GameState, o: PlayerIndex, sl: number, tl: number, a: Ability) => Bonus)(
      state,
      owner,
      sourceLane,
      targetLane,
      ab
    );
    attack += bonus.attack;
    health += bonus.health;
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

/**
 * Selbst-Boni einer Kreatur (skalierung, neugier, kaltbluetig). Dispatcht
 * über KLASSE_A_HOOKS wie sourceContribution oben.
 */
function selfAbilityBonus(state: GameState, owner: PlayerIndex, lane: number): Bonus {
  const c = state.board[owner][lane];
  if (!c) return { attack: 0, health: 0 };
  let attack = 0;
  let health = 0;
  for (const ab of c.abilities) {
    const hook = KLASSE_A_HOOKS[ab.kind]?.beitragSelbst;
    if (!hook) continue;
    const bonus = (hook as (s: GameState, o: PlayerIndex, l: number, a: Ability) => Bonus)(state, owner, lane, ab);
    attack += bonus.attack;
    health += bonus.health;
  }
  return { attack, health };
}

/** Effektiver Angriff inkl. Fähigkeiten, Buffs und Auren. */
export function getEffectiveAttack(state: GameState, owner: PlayerIndex, lane: number): number {
  const c = state.board[owner][lane];
  if (!c) return 0;
  let attack = c.baseAttack + c.permAttackBonus + c.tempAttackBonus;
  attack += selfAbilityBonus(state, owner, lane).attack;
  attack += auraBonus(state, owner, lane).attack;
  return Math.max(0, attack);
}

/** Effektives Lebens-Maximum inkl. dauerhafter Buffs, Fähigkeiten und Auren. */
export function getMaxHealth(state: GameState, owner: PlayerIndex, lane: number): number {
  const c = state.board[owner][lane];
  if (!c) return 0;
  const bonus = selfAbilityBonus(state, owner, lane).health + auraBonus(state, owner, lane).health;
  return Math.max(1, c.baseMaxHealth + c.permHealthBonus + c.tempHealthBonus + bonus);
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
function tryRettung(
  state: GameState,
  owner: PlayerIndex,
  creature: Creature,
  maxHealth: number
): boolean {
  if (creature.rettungUsed) return false;
  const rescue = creature.abilities.find(
    (a): a is Extract<Ability, { kind: 'rettung' }> => a.kind === 'rettung'
  );
  if (!rescue) return false;
  creature.rettungUsed = true;
  // Telemetrie: verhinderter Schaden = wie weit currentHealth unter 0 lag
  // (mindestens 1, da currentHealth <= 0 hier gilt).
  const verhindert = 1 - creature.currentHealth;
  if (rescue.mode === 'full_heal') {
    creature.currentHealth = maxHealth;
    creature.poison = 0; // Häutung entfernt Gift
  } else {
    creature.currentHealth = 1; // survive_1hp / revive_1hp
  }
  zaehleKarte(state, owner, creature.cardId, 'verhindert', verhindert);
  zaehleSpieler(state, owner, 'verhinderterSchaden', verhindert);
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
    const verhindert = 1 - dying.currentHealth;
    protector.currentHealth = 0; // opfert sich
    dying.currentHealth = 1; // gerettet
    zaehleKarte(state, owner, protector.cardId, 'verhindert', verhindert);
    zaehleSpieler(state, owner, 'verhinderterSchaden', verhindert);
    return true;
  }
  return false;
}

/**
 * Telemetrie: ordnet einen Tod seiner Ursache zu (Karten-Kill + ggf.
 * Giftzerstörung als Spieler-Statistik). Liest nur `c.letzterSchaden`
 * (keine Regelwirkung, siehe types.ts). No-Op, solange state.stats fehlt.
 */
function verarbeiteTodesstatistik(state: GameState, owner: PlayerIndex, c: Creature): void {
  zaehleKarte(state, owner, c.cardId, 'gestorben');
  const ursache = c.letzterSchaden;
  if (!ursache) return;
  if (ursache.art === 'gift') {
    // Gift-Herkunft ist über mehrere Runden/Quellen oft nicht mehr eindeutig
    // einer Karte zuordenbar – wird deshalb nur der gegnerischen Seite gezählt.
    zaehleSpieler(state, otherPlayer(owner), 'giftZerstoerungen');
  }
  if (ursache.owner != null && ursache.quelle) {
    zaehleKarte(state, ursache.owner, ursache.quelle, 'kills');
  }
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
          if (tryRettung(state, owner, c, max)) {
            changed = true; // gerettet – Auren neu rechnen
            continue;
          }
          if (trySchutz(state, owner, lane)) {
            changed = true; // Nachbar opfert sich – neu rechnen
            continue;
          }
          state.board[owner][lane] = null;
          deaths.push({ owner, lane, name: c.name, faction: c.faction, creature: c });
          verarbeiteTodesstatistik(state, owner, c);
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
    tempHealthBonus: 0,
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
    schutzUsed: false,
    zaehler: {},
    rundenZaehler: {}
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
  // Backtest-Massensimulationen schalten das Log per logModus:'aus' ab (der
  // dominante Performance-Faktor bei structuredClone, siehe rng.ts/Backtest-
  // Kommentare). state.log.length bleibt dabei 0, die id-Vergabe kollidiert
  // also nicht, sollte das Log später wieder eingeschaltet werden.
  if (state.logModus === 'aus') return;
  state.log.push({ id: state.log.length, round: state.round, text, ...(event ? { event } : {}) });
}
