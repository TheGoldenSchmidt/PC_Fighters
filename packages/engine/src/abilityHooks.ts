// Registry für Fähigkeiten, deren Semantik EIN Zeitpunkt/EINE Kreatur betrifft
// UND die als reiner Wertbeitrag in der recalcBoard-Fixpunktschleife laufen
// ("Klasse A" – siehe abilities.ts für "Klasse B", die imperativen
// Zeitpunkt-Hooks onPlay/onRoundStart/onRoundEnd). Bewusst eine EIGENE Datei
// statt Teil von abilities.ts: sourceContribution/selfAbilityBonus (internal.ts)
// müssen diese Registry lesen, und abilities.ts importiert bereits von
// internal.ts (log, makeTokenCreature, …) – eine Registry in abilities.ts
// hätte internal.ts → abilities.ts → internal.ts zirkulär gemacht. Diese Datei
// hat daher AUSSCHLIESSLICH factions.ts/types.ts als Abhängigkeit.
//
// NICHT hier (Klasse C – kartenübergreifende Ordnung ist Teil der Semantik):
// Gift-Zermürbung, Hinrichten, Rettung/Schutz, Wachstums-Verstärker,
// Kampf-Interna, `sammeln` (reagiert auf JEDEN Tod, nicht nur den eigenen).
// Ein `kind` ohne Eintrag hier ist normal.

import { matchesScope } from './factions.js';
import type { Ability, GameState, PlayerIndex, Scope } from './types.js';

export interface Bonus {
  attack: number;
  health: number;
}

const NULL_BONUS: Bonus = { attack: 0, health: 0 };

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
  const gegner = owner === 0 ? 1 : 0;
  return !state.board[gegner][lane];
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
  const mult = Math.floor(fehlend / (ab.proHp ?? 1));
  return ab.cap != null ? Math.min(mult, ab.cap) : mult;
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

interface KlasseAHooks<K extends Ability['kind']> {
  /** Bonus, den die Kreatur SELBST durch diese eigene Fähigkeit bekommt. */
  beitragSelbst?: (state: GameState, owner: PlayerIndex, lane: number, ab: Extract<Ability, { kind: K }>) => Bonus;
  /** Bonus, den DIESE Kreatur (Quelle) einer anderen verbündeten Kreatur (Ziel) gibt. */
  beitragAura?: (
    state: GameState,
    owner: PlayerIndex,
    sourceLane: number,
    targetLane: number,
    ab: Extract<Ability, { kind: K }>
  ) => Bonus;
}

export const KLASSE_A_HOOKS: { [K in Ability['kind']]?: KlasseAHooks<K> } = {
  aura: {
    beitragAura: (state, owner, sourceLane, targetLane, ab) => {
      if (ab.timing !== 'dauerhaft' || sourceLane === targetLane) return NULL_BONUS;
      const source = state.board[owner][sourceLane]!;
      const target = state.board[owner][targetLane]!;
      if (!matchesScope(state.factionTree, ab.scope, source.faction, target.faction)) return NULL_BONUS;
      return { attack: ab.buff.atk, health: ab.buff.hp };
    }
  },
  nachbar: {
    beitragAura: (state, owner, sourceLane, targetLane, ab) => {
      if (ab.effect !== 'schild' && ab.effect !== 'banner') return NULL_BONUS;
      if (Math.abs(sourceLane - targetLane) !== 1) return NULL_BONUS;
      const source = state.board[owner][sourceLane]!;
      const target = state.board[owner][targetLane]!;
      if (!matchesScope(state.factionTree, ab.scope, source.faction, target.faction)) return NULL_BONUS;
      return ab.effect === 'banner' ? { attack: ab.amount, health: 0 } : { attack: 0, health: ab.amount };
    }
  },
  improvisation: {
    beitragAura: (state, owner, sourceLane, targetLane, ab) => {
      // Wirkt auch auf sich selbst (kein Ausschluss der Quell-Lane).
      const source = state.board[owner][sourceLane]!;
      const target = state.board[owner][targetLane]!;
      if (!matchesScope(state.factionTree, ab.scope, source.faction, target.faction)) return NULL_BONUS;
      const mult = improvisationMultiplier(state, owner, ab);
      return { attack: ab.bonus.atk * mult, health: ab.bonus.hp * mult };
    }
  },
  werkzeug: {
    beitragAura: (state, owner, sourceLane, targetLane, ab) => {
      if (sourceLane === targetLane) return NULL_BONUS;
      if (targetLane !== werkzeugTargetLane(state, owner, sourceLane)) return NULL_BONUS;
      return { attack: ab.atk, health: 0 };
    }
  },
  skalierung: {
    beitragSelbst: (state, owner, lane, ab) => {
      const count = countScope(state, owner, lane, ab.scope, ab.includeSelf ?? false);
      const eff = ab.cap != null ? Math.min(count, ab.cap) : count;
      return { attack: ab.per.atk * eff, health: ab.per.hp * eff };
    }
  },
  neugier: {
    beitragSelbst: (state, owner, lane, ab) => {
      if (!ab.bonus) return NULL_BONUS;
      if (!isSoloInLane(state, owner, lane)) return NULL_BONUS;
      return { attack: ab.bonus.atk, health: ab.bonus.hp };
    }
  },
  kaltbluetig: {
    beitragSelbst: (state, owner, lane, ab) => {
      const c = state.board[owner][lane]!;
      if (c.attackedThisRound) return NULL_BONUS;
      return { attack: ab.bonus.atk, health: ab.bonus.hp };
    }
  },
  bedingt: {
    beitragSelbst: (state, owner, lane, ab) => {
      const count = countScope(state, owner, lane, ab.scope, false);
      if (count < ab.mindestAnzahl) return NULL_BONUS;
      return { attack: ab.bonus.atk, health: ab.bonus.hp };
    }
  }
};
