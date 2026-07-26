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
  }
};

export function hasKeyword(creature: Creature, flag: keyof KeywordDef): boolean {
  return creature.keywords.some((k) => Boolean(KEYWORDS[k]?.[flag]));
}
