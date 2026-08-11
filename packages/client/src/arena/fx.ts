// Datenvertrag der Kampf-Abspielung.
//
// Der Server schickt nach dem Kampf den fertigen Zustand PLUS strukturierte
// Ereignisse. `useKampfReplay` verwandelt die in kurzlebige Effekt-Zustaende
// (Projektile, Einschlaege, Sterbende …), die die Arena rendert. Diese Datei
// haelt nur die Formen und das Timing – keine Logik, kein React.

import type { PlayerIndex } from '@pcf/engine';
import type { SpellEffectKind } from '../Battlefield3D';

export interface FxProjectile {
  key: string;
  lane: number;
  attacker: PlayerIndex;
  toBase: boolean;
  emoji: string;
}

export interface FxImpact {
  key: string;
  lane: number;
  side: PlayerIndex;
  damage: number;
}

export interface FxBaseImpact {
  key: string;
  side: PlayerIndex;
  damage: number;
}

export interface FxSpell {
  key: string;
  lane: number;
  effect: SpellEffectKind;
  faction: string;
}

/** Aktiver Schild-Effekt: Aufladen oder Block samt Superkraft. */
export interface FxShield {
  owner: PlayerIndex;
  blockiert: boolean;
}

/** Wirkende Cheerleader-Superkraft: kurzer Effekt über der ganzen Arena. */
export interface FxPower {
  key: string;
  owner: PlayerIndex;
  kraft: string;
}

export interface FxState {
  projectiles: FxProjectile[];
  impacts: FxImpact[];
  baseImpacts: FxBaseImpact[];
  dying: { lane: number; owner: PlayerIndex }[];
  spells: FxSpell[];
  shield: FxShield | null;
  sacrifices: {
    key: string;
    owner: PlayerIndex;
    slot: 0 | 1 | 2;
    cardId: string;
  }[];
  power: FxPower | null;
  activeLane: number | null;
}

export const EMPTY_FX: FxState = {
  projectiles: [],
  impacts: [],
  baseImpacts: [],
  dying: [],
  spells: [],
  shield: null,
  sacrifices: [],
  power: null,
  activeLane: null
};

// Timing der Kampf-Abspielung (Millisekunden)
//
// Ein einziger Regler fuer das Kampftempo: kleiner = langsamer. Alle Dauern
// unten sind die Werte bei Tempo 1 und werden durch den Regler geteilt, damit
// das Verhaeltnis der Schritte zueinander erhalten bleibt. 0.8 = ein Viertel
// mehr Zeit pro Schritt.
export const KAMPF_TEMPO = 0.8;

/** Basisdauer auf das eingestellte Kampftempo umrechnen. */
const takt = (ms: number) => Math.round(ms / KAMPF_TEMPO);

export const PROJECTILE_MS = takt(500);
export const IMPACT_MS = takt(650);
export const DEATH_MS = takt(600);
export const SPELL_MS = takt(750);
export const SHIELD_MS = takt(550);
/** Block ist der Höhepunkt: länger, damit Banner und Superkraft lesbar sind. */
export const SHIELD_BLOCK_MS = takt(1200);
/** Cheerleader-Kraft: lang genug, dass das Banner mit dem Kraftnamen lesbar ist. */
export const POWER_MS = takt(1100);
/** Opfer auf der Bank: die Figur springt vor die Basis, das braucht Zeit. */
export const SACRIFICE_MS = takt(1250);
export const LANE_PAUSE_MS = takt(200);
export const BANNER_MS = takt(1500);
/** Eingabe, kein Kampf – bleibt vom Tempo-Regler bewusst unberührt. */
export const LONG_PRESS_MS = 450;
