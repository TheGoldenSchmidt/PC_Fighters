import { describe, expect, it } from 'vitest';
import { buildVisualCatalog, loadGameData, validateGameData } from '../src/index.js';
import type { GameData } from '../src/types.js';

const data: GameData = loadGameData();

/** Basiskarte (Fraktion "humans" existiert), auf die eine Figur verweisen kann. */
function creature(extra: Record<string, unknown> = {}) {
  return {
    id: 'testfigur',
    name: 'Testfigur',
    faction: 'humans',
    type: 'creature',
    cost: 1,
    attack: 1,
    health: 1,
    ...extra
  };
}

/** Validiert eine Figur-Datei gegen die echten Daten + eine Referenzkarte. */
function checkFig(
  figure: unknown,
  opts: {
    file?: string;
    cards?: unknown[];
    figureBases?: { file: string; content: unknown }[];
    animationProfiles?: { file: string; content: unknown }[];
  } = {}
) {
  const superblockCards = (data.config.schild?.cheerleaders ?? []).map((id) => data.cardsById[id]);
  return validateGameData({
    config: data.config,
    factions: data.factions,
    topics: data.topics,
    cardFiles: [{
      file: 'cards/test.json',
      content: [...superblockCards, ...(opts.cards ?? [creature()])]
    }],
    figureBaseFiles: opts.figureBases,
    animationProfileFiles: opts.animationProfiles,
    figureFiles: [{ file: opts.file ?? 'figures/testfigur.json', content: figure }]
  });
}

const okVisual = {
  detailLevel: 'mid',
  palette: { main: '#c46a30' },
  parts: [
    { id: 'body', shape: 'ico', size: 0.9, pos: [0, 1, 0], color: 'main' },
    { id: 'nase', shape: 'ico', size: 0.1, pos: [0, 1, 0.5], color: '#241812' }
  ]
};
const fig = (visual: unknown, animations?: unknown) => ({
  cardId: 'testfigur',
  visual,
  ...(animations ? { animations } : {})
});

const testAttachments = {
  head: 'head',
  leftHand: 'hand',
  rightHand: 'hand',
  back: 'body',
  weapon: 'hand',
  mount: 'root'
};

function variantSetup(baseExtra: Record<string, unknown> = {}) {
  return {
    figureBases: [{
      file: 'figure-bases/test-base.json',
      content: {
        baseId: 'test-base',
        rigId: 'test-rig',
        attachments: testAttachments,
        animationProfileId: 'test-rig',
        visual: {
          palette: { main: '#112233', accent: '#445566' },
          parts: [
            { id: 'body', shape: 'ico', size: 1, color: 'main' },
            { id: 'head', shape: 'ico', size: 0.4, parent: 'body', color: 'main' },
            { id: 'hand', shape: 'ico', size: 0.2, parent: 'body', color: 'main' },
            { id: 'remove-me', shape: 'group', parent: 'body' },
            { id: 'remove-child', shape: 'ico', size: 0.1, parent: 'remove-me', color: 'accent' }
          ]
        },
        animations: {
          attack: { duration: 0.7, tracks: [{ part: 'body', prop: 'rot.x', keys: [[0, 0], [0.7, 0.2]] }] }
        },
        ...baseExtra
      }
    }],
    animationProfiles: [{
      file: 'animation-profiles/test-rig.json',
      content: {
        profileId: 'test-rig',
        animations: {
          idle: { duration: 2, loop: true, tracks: [{ part: 'root', prop: 'pos.y', keys: [[0, 0], [2, 0]] }] },
          attack: { duration: 1, tracks: [{ part: 'root', prop: 'pos.z', keys: [[0, 0], [1, 0.5]] }] }
        }
      }
    }]
  };
}

describe('Figuren – Schema-Validierung', () => {
  it('akzeptiert eine gültige Figur mit visual + animations', () => {
    const res = checkFig(
      fig(okVisual, {
        idle: { duration: 2, loop: true, tracks: [{ part: 'body', prop: 'pos.y', keys: [[0, 0], [1, 0.05], [2, 0]] }] }
      })
    );
    expect(res.figures.testfigur?.visual).toBeTruthy();
  });

  it('bestehende Daten (inkl. echter Figuren) laden ohne Fehler', () => {
    expect(() => loadGameData()).not.toThrow();
    expect(data.figures.rekrut.visual.parts.length).toBeGreaterThan(20);
    expect(data.figures.rekrut.animations?.idle).toBeTruthy();
  });

  it('löst eine kleine Variante samt Palette, Größe, Anschlüssen und Teilbaum-Entfernung auf', () => {
    const setup = variantSetup();
    const res = checkFig(
      {
        cardId: 'testfigur',
        baseId: 'test-base',
        palette: { main: '#abcdef' },
        height: 1.2,
        patchParts: [{ id: '@head', scale: 1.1 }],
        removeParts: ['remove-me'],
        addParts: [{ id: 'tool', shape: 'box', size: [0.1, 0.4, 0.1], parent: '@weapon', color: 'accent' }],
        animations: {
          death: { duration: 0.4, tracks: [{ part: 'head', prop: 'rot.z', keys: [[0, 0], [0.4, 0.1]] }] }
        }
      },
      setup
    );
    const resolved = res.figures.testfigur;
    expect(resolved.visual.height).toBe(1.2);
    expect(resolved.visual.palette?.main).toBe('#abcdef');
    expect(resolved.visual.parts.find((part) => part.id === 'head')?.scale).toBe(1.1);
    expect(resolved.visual.parts.find((part) => part.id === 'tool')?.parent).toBe('hand');
    expect(resolved.visual.parts.some((part) => part.id === 'remove-me' || part.id === 'remove-child')).toBe(false);
    expect(resolved.animations?.idle.duration).toBe(2);
    expect(resolved.animations?.attack.duration).toBe(0.7);
    expect(resolved.animations?.death.duration).toBe(0.4);
  });

  it('lehnt unbekannte Basen, Patch-Teile, Anschlüsse und Eltern verständlich ab', () => {
    expect(() => checkFig({ cardId: 'testfigur', baseId: 'fehlt' })).toThrow(/Unbekanntes Grundgerüst/);
    const setup = variantSetup();
    expect(() => checkFig({ cardId: 'testfigur', baseId: 'test-base', patchParts: [{ id: 'fehlt', scale: 2 }] }, setup))
      .toThrow(/patchParts verweist auf unbekannten/);
    expect(() => checkFig({ cardId: 'testfigur', baseId: 'test-base', addParts: [{ id: 'x', shape: 'ico', size: 1, parent: '@tentakel' }] }, setup))
      .toThrow(/Unbekannter Anschluss/);
    expect(() => checkFig({ cardId: 'testfigur', baseId: 'test-base', addParts: [{ id: 'x', shape: 'ico', size: 1, parent: 'fehlt' }] }, setup))
      .toThrow(/unbekannten Baustein "fehlt"/);
  });

  it('meldet Animationen, die nach einer Teilbaum-Entfernung ins Leere zeigen', () => {
    const setup = variantSetup({
      animations: {
        idle: { duration: 1, tracks: [{ part: 'remove-child', prop: 'rot.x', keys: [[0, 0]] }] }
      }
    });
    expect(() => checkFig({ cardId: 'testfigur', baseId: 'test-base', removeParts: ['remove-me'] }, setup))
      .toThrow(/Animation "idle".*unbekannten Baustein "remove-child"/);
  });

  it('lehnt doppelte Baustein-Namen ab', () => {
    expect(() =>
      checkFig(
        fig({ parts: [
          { id: 'body', shape: 'ico', size: 1, color: '#fff' },
          { id: 'body', shape: 'ico', size: 1, color: '#fff' }
        ] })
      )
    ).toThrow(/kommt mehrfach vor/);
  });

  it('lehnt den reservierten Namen "root" ab', () => {
    expect(() => checkFig(fig({ parts: [{ id: 'root', shape: 'ico', size: 1, color: '#fff' }] }))).toThrow(
      /"root" ist reserviert/
    );
  });

  it('lehnt unbekannte Farbrolle ab (kein Hex, nicht in palette)', () => {
    expect(() => checkFig(fig({ parts: [{ id: 'body', shape: 'ico', size: 1, color: 'main' }] }))).toThrow(
      /weder eine Hex-Farbe/
    );
  });

  it('lehnt parent auf unbekannten Baustein ab', () => {
    expect(() =>
      checkFig(fig({ parts: [{ id: 'body', shape: 'ico', size: 1, color: '#fff', parent: 'gibtsnicht' }] }))
    ).toThrow(/unbekannten Baustein "gibtsnicht"/);
  });

  it('verlangt "size" für nicht-group-Formen, erlaubt group ohne size', () => {
    expect(() => checkFig(fig({ parts: [{ id: 'body', shape: 'ico', color: '#fff' }] }))).toThrow(
      /braucht ein Feld "size"/
    );
    expect(() => checkFig(fig({ parts: [{ id: 'huelle', shape: 'group' }] }))).not.toThrow();
  });

  it('lehnt Animations-Track auf unbekannten Baustein ab', () => {
    expect(() =>
      checkFig(fig(okVisual, { idle: { duration: 1, tracks: [{ part: 'schwanz', prop: 'rot.z', keys: [[0, 0]] }] } }))
    ).toThrow(/Track 1 verweist auf unbekannten Baustein "schwanz"/);
  });

  it('akzeptiert optionale height, lehnt height <= 0 ab', () => {
    expect(() => checkFig(fig({ ...okVisual, height: 1.25 }))).not.toThrow();
    expect(() => checkFig(fig({ ...okVisual, height: 0 }))).toThrow(/visual\.height.*zu klein/);
  });

  it('akzeptiert neue Formen capsule/torus und per-part detail', () => {
    expect(() =>
      checkFig(
        fig({ parts: [
          { id: 'arm', shape: 'capsule', size: [0.1, 0.6], color: '#fff', detail: 'high' },
          { id: 'ring', shape: 'torus', size: [0.3, 0.08], color: '#fff' }
        ] })
      )
    ).not.toThrow();
  });

  it('cardId muss zum Dateinamen passen', () => {
    expect(() => checkFig(fig(okVisual), { file: 'figures/anders.json' })).toThrow(
      /muss aber zum Dateinamen passen/
    );
  });

  it('cardId muss auf eine existierende Kreatur verweisen', () => {
    expect(() => checkFig({ cardId: 'gibtsnicht', visual: okVisual }, { file: 'figures/gibtsnicht.json' })).toThrow(
      /keine Karte mit der id "gibtsnicht"/
    );
  });
});

describe('Standard-Klips & Katalog', () => {
  it('lädt die Default-Klips aus animations.json', () => {
    for (const name of ['entrance', 'attack', 'hit', 'death']) {
      expect(data.defaultClips[name]).toBeTruthy();
      expect(data.defaultClips[name].tracks.every((t) => t.part === 'root')).toBe(true);
    }
  });

  it('buildVisualCatalog liefert die echten Figuren (wolf, pfandsammler)', () => {
    const cat = buildVisualCatalog(data);
    expect(cat.cards.wolf?.visual).toBeTruthy();
    expect(cat.cards.pfandsammler?.visual).toBeTruthy();
    expect(cat.defaultClips.attack).toBeTruthy();
    expect(cat.palettes.humans).toBeTruthy();
    expect(cat.cards.rekrut?.visual?.parts.length).toBeGreaterThan(20);
    expect((cat.cards.rekrut as unknown as { baseId?: string }).baseId).toBeUndefined();
  });

  it('liefert für jeden konfigurierten Bankplatz ein echtes Modell statt Golem-Fallback', () => {
    const cat = buildVisualCatalog(data);
    for (const cardId of data.config.schild?.cheerleaders ?? []) {
      expect(cat.cards[cardId]?.visual, cardId).toBeTruthy();
    }
  });
});
