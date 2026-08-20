// Keyword-Registry: für die letzten zwei verbliebenen Keywords, die keine
// Wertbeiträge sind, sondern feste Regel-Flags (siehe Ability-Primitive in
// abilities.ts/abilityHooks.ts für alles Parametrisierbare – rudel, gift,
// die vier Auren-Keywords und heilt_nachbarn wurden in Phase 7 dorthin
// migriert und aus dieser Registry entfernt).

import type { Creature } from './types.js';

export interface KeywordDef {
  /** Anzeigename für die UI / README. */
  label: string;
  /** Erklärung in einfachen Worten (wird auch in der README-Tabelle benutzt). */
  description: string;
  /** flink: Kreatur ist beim Ausspielen nicht erschöpft. */
  entersReady?: boolean;
  /** fliegend: darf nach der Kampfphase in eine freie eigene Lane ziehen. */
  flying?: boolean;
  teamUp?: boolean;
  amphibious?: boolean;
  bullseye?: boolean;
  armored?: boolean;
  deadly?: boolean;
  doubleStrike?: boolean;
  frenzy?: boolean;
  hunt?: boolean;
  strikethrough?: boolean;
  untrickable?: boolean;
  gravestone?: boolean;
  overshoot?: boolean;
  antiHero?: boolean;
}

export const KEYWORDS: Record<string, KeywordDef> = {
  flink: {
    label: 'Flink',
    description: 'Kreatur ist beim Ausspielen nicht erschöpft und kämpft sofort mit.',
    entersReady: true
  },

  fliegend: {
    label: 'Fliegend',
    description:
      'Nach der Kampfphase darf der Besitzer die Kreatur in eine freie eigene Lane bewegen (optional).',
    flying: true
  },
  team_up: { label: 'Team-Up', description: 'Kann sich eine Lane mit einem zweiten Verbündeten teilen.', teamUp: true },
  amphibious: { label: 'Amphibisch', description: 'Darf in der Wasser-Lane gespielt werden.', amphibious: true },
  bullseye: { label: 'Bullseye', description: 'Basisschaden lädt den Superblock nicht auf.', bullseye: true },
  armored: { label: 'Gepanzert', description: 'Erleidet durch Treffer einen Schaden weniger.', armored: true },
  deadly: { label: 'Tödlich', description: 'Jeder Kampftreffer zerstört die getroffene Kreatur.', deadly: true },
  double_strike: { label: 'Doppelschlag', description: 'Greift nach dem normalen Kampf ein zweites Mal an.', doubleStrike: true },
  frenzy: { label: 'Raserei', description: 'Greift nach dem Zerstören einer Kreatur erneut an.', frenzy: true },
  hunt: { label: 'Jagd', description: 'Reagiert auf ausgespielte gegnerische Kreaturen.', hunt: true },
  strikethrough: { label: 'Durchschlag', description: 'Trifft Kreatur und Basis.', strikethrough: true },
  untrickable: { label: 'Trickresistent', description: 'Kann nicht von gegnerischen Aktionen anvisiert werden.', untrickable: true },
  gravestone: { label: 'Grabstein', description: 'Wird vor dem Kampf verdeckt ausgespielt und dann aufgedeckt.', gravestone: true },
  overshoot: { label: 'Überschuss', description: 'Verursacht vor dem Kampf zusätzlichen Basisschaden.', overshoot: true },
  anti_hero: { label: 'Anti-Held', description: 'Erhält einen Bonus beim Angriff auf eine freie Lane.', antiHero: true }
};

export function hasKeyword(creature: Creature, flag: keyof KeywordDef): boolean {
  return creature.keywords.some((k) => Boolean(KEYWORDS[k]?.[flag]));
}
