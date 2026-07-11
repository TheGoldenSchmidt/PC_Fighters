// Keyword-Registry: Das Herzstück der Erweiterbarkeit.
// Karten referenzieren Keywords nur per Name; die Semantik lebt zentral hier.
// Ein neues Keyword = ein neuer Eintrag in KEYWORDS (plus ggf. ein Hook-Aufruf).

import type { Creature, GameState, PlayerIndex } from './types.js';

export interface AuraBonus {
  attack: number;
  health: number;
}

export interface KeywordDef {
  /** Anzeigename für die UI / README. */
  label: string;
  /** Erklärung in einfachen Worten (wird auch in der README-Tabelle benutzt). */
  description: string;
  /** flink: Kreatur ist beim Ausspielen nicht erschöpft. */
  entersReady?: boolean;
  /** gift: Zugefügter Schaden ≥ 1 an einer Kreatur tötet sie sofort. */
  poison?: boolean;
  /** fliegend: darf nach der Kampfphase in eine freie eigene Lane ziehen. */
  flying?: boolean;
  /** Angriffs-Bonus für die Kreatur selbst (z. B. rudel), dynamisch berechnet. */
  selfAttackBonus?: (state: GameState, owner: PlayerIndex, lane: number) => number;
  /**
   * Aura: Bonus, den DIESE Kreatur (Quelle) einer anderen verbündeten Kreatur
   * (Ziel) gibt. null = kein Bonus für dieses Ziel. Dynamisch: Quelle weg → Bonus weg.
   */
  aura?: (
    state: GameState,
    owner: PlayerIndex,
    sourceLane: number,
    targetLane: number
  ) => AuraBonus | null;
  /** Wird am Rundenende ausgeführt (z. B. heilt_nachbarn). Darf state mutieren. */
  onRoundEnd?: (state: GameState, owner: PlayerIndex, lane: number) => string[];
}

function isAnimal(c: Creature | null): c is Creature {
  return c !== null && c.faction === 'animals';
}

const neighbors = (a: number, b: number) => Math.abs(a - b) === 1;

export const KEYWORDS: Record<string, KeywordDef> = {
  flink: {
    label: 'Flink',
    description: 'Kreatur ist beim Ausspielen nicht erschöpft und kämpft sofort mit.',
    entersReady: true
  },

  rudel: {
    label: 'Rudel',
    description:
      '+1 Angriff, solange mindestens eine andere verbündete Animal-Kreatur auf dem Feld ist.',
    selfAttackBonus: (state, owner, lane) => {
      const others = state.board[owner].some((c, i) => i !== lane && isAnimal(c));
      return others ? 1 : 0;
    }
  },

  gift: {
    label: 'Gift',
    description:
      'Fügt diese Kreatur einer anderen Kreatur mindestens 1 Schaden zu, stirbt diese sofort.',
    poison: true
  },

  fliegend: {
    label: 'Fliegend',
    description:
      'Nach der Kampfphase darf der Besitzer die Kreatur in eine freie eigene Lane bewegen (optional).',
    flying: true
  },

  schild_nachbarn: {
    label: 'Schild',
    description: 'Verbündete Kreaturen in direkt benachbarten Lanes erhalten +0/+1 (Aura).',
    aura: (_state, _owner, sourceLane, targetLane) =>
      neighbors(sourceLane, targetLane) ? { attack: 0, health: 1 } : null
  },

  banner_nachbarn: {
    label: 'Banner',
    description: 'Verbündete Kreaturen in direkt benachbarten Lanes erhalten +1/+0 (Aura).',
    aura: (_state, _owner, sourceLane, targetLane) =>
      neighbors(sourceLane, targetLane) ? { attack: 1, health: 0 } : null
  },

  aura_alle: {
    label: 'Große Aura',
    description: 'Alle anderen verbündeten Kreaturen erhalten +1/+1 (Aura).',
    aura: (_state, _owner, sourceLane, targetLane) =>
      sourceLane !== targetLane ? { attack: 1, health: 1 } : null
  },

  alpha_aura: {
    label: 'Alpha-Aura',
    description: 'Andere verbündete Animal-Kreaturen erhalten +1/+0 (Aura).',
    aura: (state, owner, sourceLane, targetLane) => {
      if (sourceLane === targetLane) return null;
      return isAnimal(state.board[owner][targetLane]) ? { attack: 1, health: 0 } : null;
    }
  },

  heilt_nachbarn: {
    label: 'Heilerin',
    description:
      'Am Rundenende: Heilt verbündete Kreaturen in benachbarten Lanes um 1 (nie über das Maximum).',
    onRoundEnd: (state, owner, lane) => {
      const messages: string[] = [];
      for (const nLane of [lane - 1, lane + 1]) {
        const target = state.board[owner]?.[nLane];
        if (!target) continue;
        if (target.currentHealth < target.lastMaxHealth) {
          target.currentHealth += 1;
          const healer = state.board[owner][lane];
          messages.push(`${healer?.name ?? 'Heiler'} heilt ${target.name} um 1.`);
        }
      }
      return messages;
    }
  }
};

export function hasKeyword(creature: Creature, flag: keyof KeywordDef): boolean {
  return creature.keywords.some((k) => Boolean(KEYWORDS[k]?.[flag]));
}
