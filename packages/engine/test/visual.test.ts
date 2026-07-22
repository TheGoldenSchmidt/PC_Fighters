import { describe, expect, it } from 'vitest';
import { buildVisualCatalog, loadGameData, validateGameData } from '../src/index.js';
import type { GameData } from '../src/types.js';

const data: GameData = loadGameData();

/** Validiert eine Kartenliste gegen die echten config/factions/topics. */
function check(cards: unknown[], animations: unknown = {}) {
  return validateGameData({
    config: data.config,
    factions: data.factions,
    topics: data.topics,
    cardFiles: [{ file: 'cards/test.json', content: cards }],
    animations
  });
}

/** Basiskarte (Fraktion "humans" existiert) mit einstellbarem visual/animations. */
function creature(extra: Record<string, unknown>) {
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

const okVisual = {
  detailLevel: 'mid',
  palette: { main: '#c46a30' },
  parts: [
    { id: 'body', shape: 'ico', size: 0.9, pos: [0, 1, 0], color: 'main' },
    { id: 'nase', shape: 'ico', size: 0.1, pos: [0, 1, 0.5], color: '#241812' }
  ]
};

describe('Visual/Animations – Schema-Validierung', () => {
  it('akzeptiert eine gültige Figur mit visual + animations', () => {
    const res = check([
      creature({
        visual: okVisual,
        animations: {
          idle: { duration: 2, loop: true, tracks: [{ part: 'body', prop: 'pos.y', keys: [[0, 0], [1, 0.05], [2, 0]] }] }
        }
      })
    ]);
    expect(res.cards).toHaveLength(1);
  });

  it('bestehende Karten ohne visual bleiben gültig', () => {
    expect(() => loadGameData()).not.toThrow();
  });

  it('lehnt doppelte Baustein-Namen ab', () => {
    expect(() =>
      check([
        creature({
          visual: { parts: [
            { id: 'body', shape: 'ico', size: 1, color: '#fff' },
            { id: 'body', shape: 'ico', size: 1, color: '#fff' }
          ] }
        })
      ])
    ).toThrow(/kommt mehrfach vor/);
  });

  it('lehnt den reservierten Namen "root" ab', () => {
    expect(() =>
      check([creature({ visual: { parts: [{ id: 'root', shape: 'ico', size: 1, color: '#fff' }] } })])
    ).toThrow(/"root" ist reserviert/);
  });

  it('lehnt unbekannte Farbrolle ab (kein Hex, nicht in palette)', () => {
    expect(() =>
      check([creature({ visual: { parts: [{ id: 'body', shape: 'ico', size: 1, color: 'main' }] } })])
    ).toThrow(/weder eine Hex-Farbe/);
  });

  it('lehnt parent auf unbekannten Baustein ab', () => {
    expect(() =>
      check([
        creature({
          visual: { parts: [{ id: 'body', shape: 'ico', size: 1, color: '#fff', parent: 'gibtsnicht' }] }
        })
      ])
    ).toThrow(/unbekannten Baustein "gibtsnicht"/);
  });

  it('verlangt "size" für nicht-group-Formen, erlaubt group ohne size', () => {
    expect(() =>
      check([creature({ visual: { parts: [{ id: 'body', shape: 'ico', color: '#fff' }] } })])
    ).toThrow(/braucht ein Feld "size"/);
    expect(() =>
      check([creature({ visual: { parts: [{ id: 'huelle', shape: 'group' }] } })])
    ).not.toThrow();
  });

  it('lehnt Animations-Track auf unbekannten Baustein ab', () => {
    expect(() =>
      check([
        creature({
          visual: okVisual,
          animations: { idle: { duration: 1, tracks: [{ part: 'schwanz', prop: 'rot.z', keys: [[0, 0]] }] } }
        })
      ])
    ).toThrow(/Track 1 verweist auf unbekannten Baustein "schwanz"/);
  });

  it('akzeptiert optionale height, lehnt height <= 0 ab', () => {
    expect(() => check([creature({ visual: { ...okVisual, height: 1.25 } })])).not.toThrow();
    expect(() => check([creature({ visual: { ...okVisual, height: 0 } })])).toThrow(
      /visual\.height.*zu klein/
    );
  });

  it('erlaubt Track auf "root" auch ohne visual', () => {
    expect(() =>
      check([
        creature({ animations: { attack: { duration: 1, tracks: [{ part: 'root', prop: 'pos.z', keys: [[0, 0]] }] } } })
      ])
    ).not.toThrow();
  });
});

describe('Standard-Klips & Katalog', () => {
  it('lädt die Default-Klips aus animations.json', () => {
    for (const name of ['entrance', 'attack', 'hit', 'death']) {
      expect(data.defaultClips[name]).toBeTruthy();
      expect(data.defaultClips[name].tracks.every((t) => t.part === 'root')).toBe(true);
    }
  });

  it('buildVisualCatalog enthält nur Karten mit visual/animations', () => {
    const res = check([
      creature({ id: 'mitfigur', visual: okVisual }),
      creature({ id: 'ohnefigur' })
    ]);
    const game: GameData = {
      ...data,
      cards: res.cards,
      cardsById: Object.fromEntries(res.cards.map((c) => [c.id, c])),
      defaultClips: data.defaultClips
    };
    const catalog = buildVisualCatalog(game);
    expect(catalog.cards.mitfigur?.visual).toBeTruthy();
    expect(catalog.cards.ohnefigur).toBeUndefined();
    expect(catalog.defaultClips.attack).toBeTruthy();
    expect(catalog.palettes.humans).toBeTruthy();
  });
});
