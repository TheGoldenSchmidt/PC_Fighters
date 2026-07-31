// Zod-Schemas für alle Datendateien. Ziel: Wenn jemand eine JSON-Datei
// fehlerhaft ändert, gibt es eine verständliche deutsche Fehlermeldung
// (welche Datei, welche Karte, welches Feld).

import { z } from 'zod';
import { buildFactionTree, topOf } from './factions.js';
import { KEYWORDS } from './keywords.js';
import type {
  Animations,
  CardDef,
  CheerleaderSelection,
  DeckbuildingConfig,
  DeckList,
  Faction,
  FactionTree,
  FigureDef,
  GameConfig,
  GameData,
  Topic
} from './types.js';

/**
 * Superkräfte des Basis-Schilds. Neue Superkraft = neuer Zweig hier, eine
 * Variante in `Superkraft` (types.ts) und ein Eintrag in SUPERKRAEFTE (schild.ts).
 */
export const superkraftSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('keinSchaden'), name: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('kartenZiehen'), name: z.string().min(1), n: z.number().int().min(1) }).strict(),
  z
    .object({
      kind: z.literal('schwaechung'),
      name: z.string().min(1),
      atk: z.number().int().min(0),
      hp: z.number().int().min(0)
    })
    .strict()
]);

export const schildSchema = z
  .object({
    abschnitte: z.number().int().min(1),
    ladung: z.object({
      min: z.number().int().min(1),
      max: z.number().int().min(1)
    }),
    // Ohne Superkräfte würde ein Block ins Leere laufen.
    superkraefte: z.array(superkraftSchema).min(1)
  })
  .refine((s) => s.ladung.max >= s.ladung.min, {
    message: 'ladung.max muss mindestens so groß sein wie ladung.min'
  });

/**
 * Wirkung einer Cheerleader-Kraft. Neue Wirkung = neuer Zweig hier, eine
 * Variante in `CheerleaderWirkung` (types.ts) und ein Eintrag in
 * CHEERLEADER_WIRKUNGEN (cheerleader.ts).
 *
 * `wahl` verschachtelt zwei weitere Wirkungen, deshalb z.lazy: das Schema
 * referenziert sich selbst und kann erst beim Prüfen aufgelöst werden.
 * Verschachtelte `wahl`-Wirkungen sind bewusst NICHT erlaubt (siehe unten) –
 * eine Kraft stellt höchstens eine Frage.
 */
const einfacheWirkungSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('peinigenAlle'),
      atkDeckel: z.number().int().min(0),
      hpDeckel: z.number().int().min(1)
    })
    .strict(),
  z.object({ kind: z.literal('schwaechungRunde'), atk: z.number().int().min(1) }).strict(),
  z
    .object({
      kind: z.literal('ziehenUndWissen'),
      karten: z.number().int().min(0),
      wissen: z.number().int().min(0)
    })
    .strict(),
  z.object({ kind: z.literal('schadenAufAusloeser'), x: z.number().int().min(1) }).strict(),
  z.object({ kind: z.literal('gegenseitigerSchaden'), x: z.number().int().min(1) }).strict(),
  z
    .object({
      kind: z.literal('rettenUndZiehen'),
      hp: z.number().int().min(1),
      karten: z.number().int().min(0)
    })
    .strict()
]);

const cheerleaderWahlOptionSchema = z
  .object({ name: z.string().min(1), wirkung: einfacheWirkungSchema })
  .strict();

export const cheerleaderWirkungSchema = z.union([
  einfacheWirkungSchema,
  z
    .object({
      kind: z.literal('wahl'),
      optionA: cheerleaderWahlOptionSchema,
      optionB: cheerleaderWahlOptionSchema
    })
    .strict()
]);

export const cheerleaderKraftSchema = z
  .object({
    name: z.string().min(1),
    text: z.string().min(1),
    ausloeser: z.enum(['gegnerischeKreatur', 'gegnerischeKreaturGegenueber', 'eigenerTod']),
    wirkung: cheerleaderWirkungSchema
  })
  .strict();

export const configSchema = z.object({
  lanes: z.number().int().min(1).max(6),
  baseHealth: z.number().int().min(1),
  startingHand: z.number().int().min(0),
  cardsDrawnPerTurn: z.number().int().min(0),
  roundLimit: z.number().int().min(1),
  energy: z.object({
    start: z.number().int().min(0),
    perRound: z.number().int().min(0),
    cap: z.number().int().min(1).nullable()
  }),
  deckbuilding: z.object({
    size: z.number().int().min(1),
    maxCopies: z.number().int().min(1),
    maxCopiesSignature: z.number().int().min(1).optional(),
    maxHeroes: z.number().int().min(0).optional(),
    maxHeroCopies: z.number().int().min(1).optional(),
    maxPrincipals: z.number().int().min(0).optional(),
    factionRule: z.enum(['singleTop', 'singleSub', 'free'])
  }),
  cheerleaders: z.object({
    candidates: z.array(z.string().min(1)).min(3),
    selectionSize: z.literal(3),
    maxInDeck: z.number().int().min(0),
    // Ohne Eintrag sitzt ein Cheerleader nur dekorativ auf der Bank.
    kraefte: z.record(z.string().min(1), cheerleaderKraftSchema).default({})
  }),
  zermuerbung: z
    .object({
      abRunde: z.number().int().min(1),
      schaden: z.number().int().min(1),
      steigerung: z.number().int().min(0)
    })
    .optional(),
  /** Ohne diesen Block nimmt die Basis Treffer ungehindert (Verhalten vor dem Schild-Feature). */
  schild: schildSchema.optional()
});

export const factionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parent: z.string().min(1).nullable().default(null),
  color: z.string().min(1).optional(),
  description: z.string().optional(),
  theme: z.object({ color: z.string().min(1) }).optional(),
  neutral: z.boolean().optional()
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
  }),
  environment: z.enum(['wald', 'hoehle', 'stadt', 'mond', 'mars', 'c137']).optional()
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
    target: z.literal('friendlyCreature'),
    tempAtkBonus: z.number().int().min(1).optional()
  }),
  z.object({
    kind: z.literal('debuff'),
    amount: z.number().int().min(1)
  }),
  z.object({
    kind: z.literal('spendKnowledge'),
    max: z.number().int().min(1),
    damagePerMarker: z.number().int().min(1)
  })
]);

// --- Fähigkeiten (parametrisierte Primitive) ---
const statSchema = z.object({ atk: z.number().int(), hp: z.number().int() });
const scopeSchema = z.enum(['same_sub', 'same_top', 'any']);

const wahlOptionSchema = z.discriminatedUnion('art', [
  z.object({ art: z.literal('ziehen'), n: z.number().int().min(1) }).strict(),
  z.object({ art: z.literal('wissen'), x: z.number().int().min(1) }).strict()
]);

/** Baustein eines `ausspielwahl`-Pakets (wahlOption + Schaden auf die Lane). */
const ausspielTeilSchema = z.discriminatedUnion('art', [
  z.object({ art: z.literal('ziehen'), n: z.number().int().min(1) }).strict(),
  z.object({ art: z.literal('wissen'), x: z.number().int().min(1) }).strict(),
  z.object({ art: z.literal('schaden'), x: z.number().int().min(1) }).strict()
]);

// .strict() auf jedem Zweig: unbekannte Zusatzfelder (Tippfehler in Parameter-
// Namen wie "starke" statt "staerke") werden abgelehnt statt still gestrippt.
export const abilitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('skalierung'), scope: scopeSchema, per: statSchema, cap: z.number().int().min(0).optional(), includeSelf: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('aura'), scope: scopeSchema, buff: statSchema, timing: z.enum(['dauerhaft', 'einmal_beim_ausspielen']) }).strict(),
  z.object({ kind: z.literal('nachbar'), effect: z.enum(['schild', 'banner', 'schadensuebernahme']), scope: scopeSchema, amount: z.number().int() }).strict(),
  z.object({ kind: z.literal('heilung'), scope: scopeSchema, reichweite: z.enum(['nachbarn', 'scope']), amount: z.number().int().min(1), mehrWennBasisUnter: z.object({ schwelle: z.number().int(), amount: z.number().int().min(1) }).strict().optional(), maxTargets: z.number().int().min(1).optional() }).strict(),
  z.object({ kind: z.literal('wachstum'), per_round: statSchema, ziel: z.enum(['selbst', 'verbuendeter']).optional(), scope: scopeSchema.optional(), maxTriggers: z.number().int().min(1).optional() }).strict(),
  z.object({ kind: z.literal('verstaerker'), ziel: z.literal('wachstum'), scope: scopeSchema, faktor: z.number().int().min(1), firstOnlyPerRound: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('rettung'), mode: z.enum(['survive_1hp', 'revive_1hp', 'full_heal']), bonusWennAusgeloest: statSchema.optional(), ziehenWennAusgeloest: z.number().int().min(1).optional() }).strict(),
  z.object({ kind: z.literal('ueberstunden'), bonus: statSchema }).strict(),
  z.object({ kind: z.literal('werkzeug'), atk: z.number().int().min(1) }).strict(),
  z.object({ kind: z.literal('improvisation'), scope: scopeSchema, mode: z.enum(['schwelle', 'pro_fehlende_hp']), bonus: statSchema, schwelle: z.number().int().optional(), proHp: z.number().int().min(1).optional(), cap: z.number().int().min(1).optional() }).strict(),
  z.object({ kind: z.literal('sammeln'), bonus: statSchema, trigger: z.enum(['any', 'own', 'enemy']), firstPerRound: z.boolean().optional(), maxTriggers: z.number().int().min(1).optional() }).strict(),
  z.object({ kind: z.literal('lernen'), n: z.number().int().min(1), proRunde: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('wissen'), x: z.number().int().min(1), proRunde: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('experiment'), schadenProMarker: z.number().int().min(1).optional(), proMarker: statSchema.optional(), max: z.number().int().min(1).optional() }).strict(),
  z.object({ kind: z.literal('neugier'), bonus: statSchema.optional(), basisschaden: z.number().int().min(1).optional() }).strict(),
  z.object({ kind: z.literal('umverteilung'), menge: z.number().int().min(1), schwelle: z.number().int().optional(), ziel: z.enum(['einer', 'alle']), art: z.enum(['atk', 'gift']).optional(), dauer: z.enum(['dauerhaft', 'runde']).optional() }).strict(),
  z.object({ kind: z.literal('kaltbluetig'), bonus: statSchema }).strict(),
  z.object({ kind: z.literal('dornen'), x: z.number().int().min(1) }).strict(),
  z.object({ kind: z.literal('sturzflug'), x: z.number().int().min(1) }).strict(),
  z.object({ kind: z.literal('wucht') }).strict(),
  z.object({ kind: z.literal('urgewalt') }).strict(),
  z.object({ kind: z.literal('gift'), staerke: z.number().int().min(1) }).strict(),
  z.object({ kind: z.literal('beschwoeren'), timing: z.enum(['beim_ausspielen', 'beim_tod']), count: z.number().int().min(1), token: tokenSchema }).strict(),
  z.object({ kind: z.literal('entwaffnen'), entfernt: z.array(z.string().min(1)).min(1) }).strict(),
  z.object({ kind: z.literal('todesfluch'), atk: z.number().int().min(1) }).strict(),
  z.object({ kind: z.literal('hinrichten'), maxHp: z.number().int().min(1) }).strict(),
  z.object({ kind: z.literal('bedingt'), scope: scopeSchema, mindestAnzahl: z.number().int().min(1), bonus: statSchema }).strict(),
  z.object({ kind: z.literal('hunter'), bonusAtk: z.number().int().min(1) }).strict(),
  z.object({ kind: z.literal('shedding'), schwelle: z.number().int().min(1), heilung: z.number().int().min(1), entferntGift: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('synergie'), scope: scopeSchema, bonus: statSchema }).strict(),
  z.object({ kind: z.literal('wahl'), optionA: wahlOptionSchema, optionB: wahlOptionSchema, regel: z.enum(['handKlein', 'wissenKnapp']) }).strict(),
  z.object({ kind: z.literal('ausspielwahl'), optionA: z.array(ausspielTeilSchema).min(1), optionB: z.array(ausspielTeilSchema).min(1), regel: z.literal('zielVorhanden') }).strict(),
  z.object({ kind: z.literal('umgruppieren'), tempAtkBonus: z.number().int().min(1).optional() }).strict(),
  z.object({ kind: z.literal('rueckstoss'), selbst: z.number().int().min(1), gegner: z.number().int().min(1).optional() }).strict(),
  z.object({ kind: z.literal('peinigen'), atkDeckel: z.number().int().min(0), hpDeckel: z.number().int().min(1) }).strict()
]);

// ---------------------------------------------------------------- Visuals
// Aussehen & Animation als reine Daten. Die Engine validiert nur die Struktur;
// interpretiert (gerendert) wird ausschließlich im Client.

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const PART_SHAPES = ['ico', 'box', 'cyl', 'cone', 'sph', 'capsule', 'torus', 'group'] as const;

const visualPartSchema = z.object({
  id: z.string().min(1),
  shape: z.enum(PART_SHAPES),
  size: z.union([z.number(), z.array(z.number()).min(1)]).optional(),
  detail: z.enum(['low', 'mid', 'high']).optional(),
  pos: vec3.optional(),
  rot: vec3.optional(),
  scale: z.union([z.number(), vec3]).optional(),
  color: z.string().min(1).optional(),
  parent: z.string().min(1).optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  transparent: z.boolean().optional(),
  opacity: z.number().min(0).max(1).optional(),
  arc: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional()
});

const visualSchema = z
  .object({
    detailLevel: z.enum(['low', 'mid', 'high']).optional(),
    height: z.number().positive('height muss größer als 0 sein').optional(),
    palette: z.record(z.string().min(1)).optional(),
    parts: z.array(visualPartSchema).min(1, 'eine Figur braucht mindestens einen Baustein in "parts"')
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < v.parts.length; i++) {
      const p = v.parts[i];
      if (p.id === 'root') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['parts', i, 'id'],
          message: '"root" ist reserviert und darf kein Baustein-Name sein'
        });
      }
      if (seen.has(p.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['parts', i, 'id'],
          message: `der Baustein-Name "${p.id}" kommt mehrfach vor – Namen müssen eindeutig sein`
        });
      }
      seen.add(p.id);
      if (p.shape !== 'group' && p.size === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['parts', i, 'size'],
          message: `Form "${p.shape}" braucht ein Feld "size" (Maße)`
        });
      }
      if (p.color && !HEX.test(p.color) && !(v.palette && p.color in v.palette)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['parts', i, 'color'],
          message: `Farbe "${p.color}" ist weder eine Hex-Farbe (#rrggbb) noch eine Rolle in "palette"`
        });
      }
    }
    const ids = new Set(v.parts.map((p) => p.id));
    for (let i = 0; i < v.parts.length; i++) {
      const p = v.parts[i];
      if (p.parent && p.parent !== 'root' && !ids.has(p.parent)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['parts', i, 'parent'],
          message: `"parent" verweist auf unbekannten Baustein "${p.parent}"`
        });
      }
    }
  });

const ANIM_PROPS = [
  'pos.x',
  'pos.y',
  'pos.z',
  'rot.x',
  'rot.y',
  'rot.z',
  'scale',
  'emissive',
  'opacity'
] as const;

const animTrackSchema = z.object({
  part: z.string().min(1),
  prop: z.enum(ANIM_PROPS),
  keys: z
    .array(z.tuple([z.number(), z.number()]))
    .min(1, 'ein Track braucht mindestens einen Keyframe [zeit, wert]')
});

const animClipSchema = z.object({
  duration: z.number().positive('duration muss größer als 0 sein'),
  loop: z.boolean().optional(),
  tracks: z.array(animTrackSchema)
});

export const animationsSchema = z.record(animClipSchema);

/** Eine Figur-Datei aus data/figures/ (Dateiname = cardId). */
export const figureFileSchema = z.object({
  cardId: z.string().min(1),
  visual: visualSchema,
  animations: animationsSchema.optional()
});

const cardBase = {
  id: z.string().min(1),
  name: z.string().min(1),
  faction: z.string().min(1),
  cost: z.number().int().min(0),
  signature: z.boolean().optional(),
  category: z.enum(['hero', 'principal']).optional(),
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
  /** data/animations.json – geteilte Standard-Klips (optional; Default: {}). */
  animations?: unknown;
  /** data/figures/*.json – 3D-Figuren (optional; Default: keine). */
  figureFiles?: { file: string; content: unknown }[];
}): {
  config: GameConfig;
  factions: Faction[];
  topics: Topic[];
  cards: CardDef[];
  defaultClips: Animations;
  figures: Record<string, FigureDef>;
} {
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

  const defaultClipsResult = animationsSchema.safeParse(raw.animations ?? {});
  if (!defaultClipsResult.success) {
    throw new DataError('animations.json', describeZodError(defaultClipsResult.error));
  }
  const defaultClips = defaultClipsResult.data as Animations;

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

  const cheerleaderProblems: string[] = [];
  const cheerleaderIds = configResult.data.cheerleaders.candidates;
  if (new Set(cheerleaderIds).size !== cheerleaderIds.length) {
    cheerleaderProblems.push('Cheerleader-Kandidaten dürfen nicht doppelt konfiguriert sein.');
  }
  for (const id of cheerleaderIds) {
    const card = cards.find((candidate) => candidate.id === id);
    if (!card) {
      cheerleaderProblems.push(`Cheerleader-Kandidat "${id}" ist keine bekannte Karte.`);
    } else if (card.type !== 'creature') {
      cheerleaderProblems.push(`Cheerleader-Kandidat "${id}" ist keine Kreatur.`);
    }
  }
  if (configResult.data.cheerleaders.maxInDeck > cheerleaderIds.length) {
    cheerleaderProblems.push('"maxInDeck" darf nicht größer als der Kandidatenpool sein.');
  }
  // Eine Kraft ohne zugehörigen Kandidaten wäre stumm: sie könnte nie auf der
  // Bank landen und damit auch nie ausgelöst werden. Das ist fast immer ein
  // Tippfehler in der cardId, deshalb ein harter Datenfehler.
  for (const id of Object.keys(configResult.data.cheerleaders.kraefte)) {
    if (!cheerleaderIds.includes(id)) {
      cheerleaderProblems.push(
        `Superkraft für "${id}" konfiguriert, aber "${id}" steht nicht in "candidates".`
      );
    }
  }
  if (cheerleaderProblems.length > 0) throw new DataError('config.json', cheerleaderProblems);

  // ---- 3D-Figuren (data/figures/*.json) ----
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const figures: Record<string, FigureDef> = {};
  for (const { file, content } of raw.figureFiles ?? []) {
    const parsed = figureFileSchema.safeParse(content);
    if (!parsed.success) {
      throw new DataError(file, describeZodError(parsed.error));
    }
    const fig = parsed.data as FigureDef;
    const expectedId = file.replace(/^.*[/\\]/, '').replace(/\.json$/i, '');
    const problems: string[] = [];
    if (fig.cardId !== expectedId) {
      problems.push(
        `"cardId" ist "${fig.cardId}", muss aber zum Dateinamen passen ("${expectedId}")`
      );
    }
    const card = cardById.get(fig.cardId);
    if (!card) {
      problems.push(`Es gibt keine Karte mit der id "${fig.cardId}"`);
    } else if (card.type !== 'creature') {
      problems.push(`Karte "${fig.cardId}" ist keine Kreatur – nur Kreaturen haben Figuren`);
    }
    if (figures[fig.cardId]) {
      problems.push(`Für "${fig.cardId}" gibt es schon eine Figur-Datei`);
    }
    // Animations-Tracks dürfen nur existierende Bausteine (oder "root") adressieren.
    const partIds = new Set<string>(['root', ...fig.visual.parts.map((p) => p.id)]);
    for (const [clip, def] of Object.entries(fig.animations ?? {})) {
      def.tracks.forEach((tr, i) => {
        if (!partIds.has(tr.part)) {
          problems.push(
            `Animation "${clip}", Track ${i + 1} verweist auf unbekannten Baustein "${tr.part}"`
          );
        }
      });
    }
    if (problems.length > 0) throw new DataError(file, problems);
    figures[fig.cardId] = fig;
  }

  return {
    config: configResult.data,
    factions: factionsResult.data,
    topics: topicsResult.data,
    cards,
    defaultClips,
    figures
  };
}

// ---------------------------------------------------------------- Deckbau

export const deckSchema = z.object({
  name: z.string().min(1).optional(),
  faction: z.string().min(1).optional(),
  cards: z
    .array(
      z.object({
        cardId: z.string().min(1),
        count: z.number().int().min(1)
      })
    )
    .min(1, 'ein Deck braucht mindestens eine Karte')
});

/** Deck-Validierung mit deutschen, konkreten Fehlermeldungen. */
export class DeckError extends Error {
  constructor(public problems: string[]) {
    super('Deck ungültig:\n' + problems.map((p) => `  • ${p}`).join('\n'));
    this.name = 'DeckError';
  }
}

/** Kopiengrenze einer Karte: Kategorie (Hero/Principal) vor Signatur vor Normalfall. */
export function maxCopiesOf(card: CardDef, rules: DeckbuildingConfig): number {
  if (card.category === 'hero') return rules.maxHeroCopies ?? 1;
  if (card.category === 'principal') return rules.maxPrincipals ?? 1;
  return card.signature ? (rules.maxCopiesSignature ?? 1) : rules.maxCopies;
}

/**
 * Neutrale Karten (Oberfraktion mit `"neutral": true`, z. B. der PC Principal)
 * gehören zu keiner Seite und sind daher in jedem Deck erlaubt – die
 * factionRule ignoriert sie.
 */
export function isNeutralCard(card: CardDef, factions: Faction[], tree: FactionTree): boolean {
  const top = topOf(tree, card.faction);
  return factions.some((f) => f.id === top && f.neutral);
}

/**
 * Prüft eine Deckliste gegen Größe, maxCopies (Signaturkarten max. 1), die
 * Hero-/Principal-Limits und die konfigurierte factionRule. Gibt das geprüfte
 * Deck zurück oder wirft DeckError.
 */
export function validateDeck(deck: unknown, data: GameData): DeckList {
  const parsed = deckSchema.safeParse(deck);
  if (!parsed.success) {
    throw new DeckError(describeZodError(parsed.error));
  }
  const dl = parsed.data;
  const rules = data.config.deckbuilding;
  const { size, factionRule } = rules;
  const maxHeroes = rules.maxHeroes ?? 2;
  const maxPrincipals = rules.maxPrincipals ?? 1;
  const tree = buildFactionTree(data.factions);
  const problems: string[] = [];

  let total = 0;
  // Heroes und Principals zählen regulär zur Deckgröße, haben daneben aber je
  // ein eigenes Limit; Principals zählen NICHT zum Hero-Limit.
  let heroes = 0;
  let principals = 0;
  const seen = new Set<string>();
  const tops = new Set<string>();
  const subs = new Set<string>();
  const cheerleaderIds = new Set(data.config.cheerleaders.candidates);
  let cheerleadersInDeck = 0;

  for (const entry of dl.cards) {
    const card = data.cardsById[entry.cardId];
    if (!card) {
      problems.push(`Unbekannte Karte "${entry.cardId}".`);
      continue;
    }
    if (seen.has(entry.cardId)) {
      problems.push(`Karte "${card.name}" ist mehrfach aufgeführt – bitte zusammenfassen.`);
    }
    seen.add(entry.cardId);
    if (cheerleaderIds.has(entry.cardId)) cheerleadersInDeck += 1;
    total += entry.count;
    if (card.category === 'hero') heroes += entry.count;
    if (card.category === 'principal') principals += entry.count;
    const max = maxCopiesOf(card, rules);
    if (entry.count > max) {
      problems.push(`Zu viele Kopien von "${card.name}": ${entry.count}, erlaubt sind ${max}.`);
    }
    if (isNeutralCard(card, data.factions, tree)) continue;
    tops.add(topOf(tree, card.faction));
    subs.add(card.faction);
  }

  if (total !== size) {
    problems.push(`Deck ungültig: ${total} Karten, erlaubt sind ${size}.`);
  }
  if (heroes > maxHeroes) {
    problems.push(`Zu viele Heroes: ${heroes}, erlaubt sind ${maxHeroes}.`);
  }
  if (principals > maxPrincipals) {
    problems.push(`Zu viele PC Principals: ${principals}, erlaubt ist ${maxPrincipals}.`);
  }
  if (cheerleadersInDeck > data.config.cheerleaders.maxInDeck) {
    problems.push(
      `Zu viele Cheerleader-Kandidaten im Deck: ${cheerleadersInDeck}, erlaubt sind ${data.config.cheerleaders.maxInDeck}.`
    );
  }
  if (factionRule === 'singleTop' && tops.size > 1) {
    problems.push('Deck mischt mehrere Oberfraktionen – erlaubt ist nur Mensch ODER Tier.');
  }
  if (factionRule === 'singleSub' && subs.size > 1) {
    problems.push('Deck mischt mehrere Sub-Fraktionen – erlaubt ist nur eine.');
  }

  if (problems.length > 0) throw new DeckError(problems);
  return dl;
}

/** Konkrete, servergeeignete Validierung der geordneten Dreierauswahl. */
export function validateCheerleaderSelection(
  selection: unknown,
  deck: DeckList | null,
  data: GameData
): CheerleaderSelection {
  const expected = data.config.cheerleaders.selectionSize;
  if (!Array.isArray(selection) || selection.length !== expected) {
    throw new DeckError([`Wähle exakt ${expected} Cheerleader.`]);
  }
  const problems: string[] = [];
  const ids = selection.filter((id): id is string => typeof id === 'string');
  if (ids.length !== expected) problems.push('Alle Cheerleader-Plätze müssen belegt sein.');
  if (new Set(ids).size !== ids.length) problems.push('Jeder Cheerleader darf nur einmal gewählt werden.');
  const allowed = new Set(data.config.cheerleaders.candidates);
  for (const id of ids) {
    if (!allowed.has(id)) problems.push(`Unbekannter Cheerleader "${id}".`);
  }
  const deckIds = new Set(
    deck?.cards.filter((entry) => entry.count > 0).map((entry) => entry.cardId) ?? []
  );
  for (const id of ids) {
    if (deckIds.has(id)) {
      const name = data.cardsById[id]?.name ?? id;
      problems.push(`"${name}" ist Bestandteil des Decks und kann nicht zugleich Cheerleader sein.`);
    }
  }
  if (problems.length > 0) throw new DeckError(problems);
  return ids as CheerleaderSelection;
}

/** Deterministische Migration historischer Räume ohne Auswahl. */
export function defaultCheerleaderSelection(
  deck: DeckList | null,
  data: GameData
): CheerleaderSelection {
  const deckIds = new Set(
    deck?.cards.filter((entry) => entry.count > 0).map((entry) => entry.cardId) ?? []
  );
  const selection = data.config.cheerleaders.candidates
    .filter((id) => !deckIds.has(id))
    .slice(0, data.config.cheerleaders.selectionSize);
  return validateCheerleaderSelection(selection, deck, data);
}
