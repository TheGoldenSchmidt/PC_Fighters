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
  opts: { file?: string; cards?: unknown[] } = {}
) {
  return validateGameData({
    config: data.config,
    factions: data.factions,
    topics: data.topics,
    cardFiles: [{ file: 'cards/test.json', content: opts.cards ?? [creature()] }],
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
  });
});
