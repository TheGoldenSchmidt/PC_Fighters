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
  parent: z.string().min(1).nullable().default(null),
  color: z.string().min(1).optional(),
  description: z.string().optional(),
  theme: z.object({ color: z.string().min(1) }).optional()
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

// --- Fähigkeiten (parametrisierte Primitive) ---
const statSchema = z.object({ atk: z.number().int(), hp: z.number().int() });
const scopeSchema = z.enum(['same_sub', 'same_top', 'any']);

export const abilitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('skalierung'), scope: scopeSchema, per: statSchema, cap: z.number().int().min(0).optional(), includeSelf: z.boolean().optional() }),
  z.object({ kind: z.literal('aura'), scope: scopeSchema, buff: statSchema, timing: z.enum(['dauerhaft', 'einmal_beim_ausspielen']) }),
  z.object({ kind: z.literal('nachbar'), effect: z.enum(['schild', 'banner', 'schadensuebernahme']), scope: scopeSchema, amount: z.number().int() }),
  z.object({ kind: z.literal('heilung'), scope: scopeSchema, reichweite: z.enum(['nachbarn', 'scope']), amount: z.number().int().min(1), mehrWennBasisUnter: z.object({ schwelle: z.number().int(), amount: z.number().int().min(1) }).optional() }),
  z.object({ kind: z.literal('wachstum'), per_round: statSchema, ziel: z.enum(['selbst', 'verbuendeter']).optional(), scope: scopeSchema.optional() }),
  z.object({ kind: z.literal('verstaerker'), ziel: z.literal('wachstum'), scope: scopeSchema, faktor: z.number().int().min(1) }),
  z.object({ kind: z.literal('rettung'), mode: z.enum(['survive_1hp', 'revive_1hp', 'full_heal']) }),
  z.object({ kind: z.literal('ueberstunden'), bonus: statSchema }),
  z.object({ kind: z.literal('werkzeug'), atk: z.number().int().min(1) }),
  z.object({ kind: z.literal('improvisation'), scope: scopeSchema, mode: z.enum(['schwelle', 'pro_fehlende_hp']), bonus: statSchema, schwelle: z.number().int().optional(), proHp: z.number().int().min(1).optional() }),
  z.object({ kind: z.literal('sammeln'), bonus: statSchema, trigger: z.enum(['any', 'own', 'enemy']) }),
  z.object({ kind: z.literal('lernen'), n: z.number().int().min(1), proRunde: z.boolean().optional() }),
  z.object({ kind: z.literal('wissen'), x: z.number().int().min(1), proRunde: z.boolean().optional() }),
  z.object({ kind: z.literal('experiment'), schadenProMarker: z.number().int().min(1).optional(), proMarker: statSchema.optional() }),
  z.object({ kind: z.literal('neugier'), bonus: statSchema.optional(), basisschaden: z.number().int().min(1).optional(), wucht: z.boolean().optional() }),
  z.object({ kind: z.literal('umverteilung'), menge: z.number().int().min(1), schwelle: z.number().int().optional(), ziel: z.enum(['einer', 'alle']), art: z.enum(['atk', 'gift']).optional(), dauer: z.enum(['dauerhaft', 'runde']).optional() }),
  z.object({ kind: z.literal('kaltbluetig'), bonus: statSchema }),
  z.object({ kind: z.literal('dornen'), x: z.number().int().min(1) }),
  z.object({ kind: z.literal('sturzflug'), x: z.number().int().min(1) }),
  z.object({ kind: z.literal('wucht') }),
  z.object({ kind: z.literal('urgewalt') }),
  z.object({ kind: z.literal('gift'), staerke: z.number().int().min(1) }),
  z.object({ kind: z.literal('beschwoeren'), timing: z.enum(['beim_ausspielen', 'beim_tod']), count: z.number().int().min(1), token: tokenSchema }),
  z.object({ kind: z.literal('entwaffnen'), entfernt: z.array(z.string().min(1)).min(1) }),
  z.object({ kind: z.literal('todesfluch'), atk: z.number().int().min(1) }),
  z.object({ kind: z.literal('hinrichten'), maxHp: z.number().int().min(1) })
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
    abilities: z.array(abilitySchema).default([]),
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

  // Fraktionsbaum prüfen: jede parent-Referenz muss existieren und selbst eine
  // Oberfraktion sein (kein tiefer verschachtelter Baum, nur zwei Ebenen).
  const factionProblems: string[] = [];
  const byId = new Map(factionsResult.data.map((f) => [f.id, f]));
  for (const f of factionsResult.data) {
    if (f.parent == null) continue;
    const parent = byId.get(f.parent);
    if (!parent) {
      factionProblems.push(
        `Fraktion "${f.name}": Oberfraktion "${f.parent}" gibt es nicht in factions.json`
      );
    } else if (parent.parent != null) {
      factionProblems.push(
        `Fraktion "${f.name}": "${f.parent}" ist selbst eine Sub-Fraktion – erlaubt sind nur zwei Ebenen`
      );
    }
  }
  if (factionProblems.length > 0) throw new DataError('factions.json', factionProblems);

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
