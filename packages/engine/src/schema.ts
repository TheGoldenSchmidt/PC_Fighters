// Zod-Schemas für alle Datendateien. Ziel: Wenn jemand eine JSON-Datei
// fehlerhaft ändert, gibt es eine verständliche deutsche Fehlermeldung
// (welche Datei, welche Karte, welches Feld).

import { z } from 'zod';
import { KEYWORDS } from './keywords.js';
import type { CardDef, Faction, GameConfig, Topic } from './types.js';

export const configSchema = z.object({
  lanes: z.number().int().min(1).max(6),
  baseHealth: z.number().int().min(1),
  deckSize: z.number().int().min(1),
  startingHand: z.number().int().min(0),
  cardsDrawnPerTurn: z.number().int().min(0),
  energyCap: z.number().int().min(1),
  roundLimit: z.number().int().min(1),
  maxCopiesPerCard: z.number().int().min(1)
});

export const factionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
  description: z.string()
});

export const factionsSchema = z.array(factionSchema);

export const topicSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  emoji: z.string().min(1),
  colors: z.object({
    background: z.string().min(1),
    lane: z.string().min(1),
    laneBorder: z.string().min(1),
    accent: z.string().min(1)
  })
});

export const topicsSchema = z.array(topicSchema).min(1, 'mindestens ein Thema wird benötigt');

const keywordSchema = z.string().refine((k) => k in KEYWORDS, {
  message: `unbekanntes Keyword – erlaubt sind: ${Object.keys(KEYWORDS).join(', ')}`
});

const tokenSchema = z.object({
  name: z.string().min(1),
  attack: z.number().int().min(0),
  health: z.number().int().min(1),
  keywords: z.array(keywordSchema).default([])
});

export const effectSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('buffHealth'),
    amount: z.number().int().min(1),
    target: z.literal('friendlyCreature')
  }),
  z.object({
    kind: z.literal('buffAttackTemp'),
    amount: z.number().int().min(1),
    target: z.literal('friendlyCreature')
  }),
  z.object({
    kind: z.literal('summon'),
    count: z.number().int().min(1),
    token: tokenSchema
  }),
  z.object({
    kind: z.literal('moveCreature'),
    target: z.literal('friendlyCreature')
  })
]);

const cardBase = {
  id: z.string().min(1),
  name: z.string().min(1),
  faction: z.string().min(1),
  cost: z.number().int().min(0),
  signature: z.boolean().optional(),
  text: z.string().optional()
};

export const cardSchema = z.discriminatedUnion('type', [
  z.object({
    ...cardBase,
    type: z.literal('creature'),
    attack: z.number().int().min(0),
    health: z.number().int().min(1),
    keywords: z.array(keywordSchema).default([]),
    projectile: z.string().min(1).optional()
  }),
  z.object({
    ...cardBase,
    type: z.literal('action'),
    effect: effectSchema
  })
]);

export const cardFileSchema = z.array(cardSchema);

/** Fehler beim Laden/Validieren der Datendateien – mit lesbarer Meldung. */
export class DataError extends Error {
  constructor(
    public file: string,
    public problems: string[]
  ) {
    super(`Fehler in ${file}:\n` + problems.map((p) => `  • ${p}`).join('\n'));
    this.name = 'DataError';
  }
}

/** Macht aus einem Zod-Fehler verständliche deutsche Meldungen. */
export function describeZodError(
  error: z.ZodError,
  cardNames?: (index: number) => string
): string[] {
  return error.issues.map((issue) => {
    const [first, ...rest] = issue.path;
    let where = issue.path.join('.');
    if (typeof first === 'number' && cardNames) {
      const field = rest.join('.') || '(ganze Karte)';
      where = `Karte ${cardNames(first)}, Feld "${field}"`;
    } else if (where === '') {
      where = '(Datei-Inhalt)';
    } else {
      where = `Feld "${where}"`;
    }
    return `${where}: ${translateIssue(issue)}`;
  });
}

function translateIssue(issue: z.ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return `erwartet wurde ${translateType(issue.expected)}, gefunden wurde ${translateType(issue.received)}`;
    case 'too_small':
      return `Wert ist zu klein (mindestens ${issue.minimum})`;
    case 'too_big':
      return `Wert ist zu groß (höchstens ${issue.maximum})`;
    case 'invalid_union_discriminator':
      return `"type" muss einer dieser Werte sein: ${issue.options.map(String).join(', ')}`;
    case 'invalid_literal':
      return `Wert muss genau ${JSON.stringify(issue.expected)} sein`;
    default:
      return issue.message;
  }
}

function translateType(t: string): string {
  const map: Record<string, string> = {
    string: 'ein Text (in Anführungszeichen)',
    number: 'eine Zahl',
    boolean: 'true oder false',
    array: 'eine Liste [ ... ]',
    object: 'ein Objekt { ... }',
    undefined: 'nichts (Feld fehlt)'
  };
  return map[t] ?? t;
}

/**
 * Validiert alle geladenen Daten zusammen (Querbezüge inklusive:
 * Karten-Fraktion muss in factions.json existieren, IDs müssen eindeutig sein).
 */
export function validateGameData(raw: {
  config: unknown;
  factions: unknown;
  topics: unknown;
  cardFiles: { file: string; content: unknown }[];
}): { config: GameConfig; factions: Faction[]; topics: Topic[]; cards: CardDef[] } {
  const configResult = configSchema.safeParse(raw.config);
  if (!configResult.success) {
    throw new DataError('config.json', describeZodError(configResult.error));
  }

  const factionsResult = factionsSchema.safeParse(raw.factions);
  if (!factionsResult.success) {
    throw new DataError('factions.json', describeZodError(factionsResult.error));
  }
  const factionIds = new Set(factionsResult.data.map((f) => f.id));

  const topicsResult = topicsSchema.safeParse(raw.topics);
  if (!topicsResult.success) {
    throw new DataError('topics.json', describeZodError(topicsResult.error));
  }

  const cards: CardDef[] = [];
  const seenIds = new Map<string, string>();
  for (const { file, content } of raw.cardFiles) {
    const parsed = cardFileSchema.safeParse(content);
    if (!parsed.success) {
      const arr = Array.isArray(content) ? (content as Record<string, unknown>[]) : [];
      throw new DataError(
        file,
        describeZodError(parsed.error, (i) => {
          const c = arr[i];
          const label = c && (c.name ?? c.id);
          return typeof label === 'string' ? `"${label}" (Nr. ${i + 1})` : `Nr. ${i + 1}`;
        })
      );
    }
    const problems: string[] = [];
    for (const card of parsed.data) {
      if (!factionIds.has(card.faction)) {
        problems.push(
          `Karte "${card.name}": Fraktion "${card.faction}" gibt es nicht in factions.json`
        );
      }
      const prev = seenIds.get(card.id);
      if (prev) {
        problems.push(`Karte "${card.name}": die id "${card.id}" wird schon in ${prev} benutzt`);
      }
      seenIds.set(card.id, file);
    }
    if (problems.length > 0) throw new DataError(file, problems);
    cards.push(...(parsed.data as CardDef[]));
  }

  return {
    config: configResult.data,
    factions: factionsResult.data,
    topics: topicsResult.data,
    cards
  };
}
