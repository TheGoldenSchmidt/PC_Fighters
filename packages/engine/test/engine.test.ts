import { describe, expect, it } from 'vitest';
import {
  applyAction,
  buildDeck,
  buildFactionTree,
  buildClientView,
  createGame,
  createSeededRandom,
  getEffectiveAttack,
  getMaxHealth,
  matchesScope,
  roundEnergy,
  topOf,
  validateCheerleaderSelection,
  validateDeck,
  validateGameData
} from '../src/index.js';
import { recalcBoard } from '../src/internal.js';
import { applyShedding, onPlayAbilities, onRoundStartAbilities } from '../src/abilities.js';
import { aktiviereStatistik } from '../src/stats.js';
import { data, emptyState, passBoth, put } from './helpers.js';
import type { GameState, PlayerIndex } from '../src/types.js';

describe('Cheerleader-Auswahl', () => {
  const valid = ['pc_principal', 'pc_babies', 'alter_wissenschaftler'] as const;

  it('lädt fünf konfigurierte Kandidaten und drei feste Plätze', () => {
    expect(data.config.cheerleaders).toMatchObject({
      candidates: [
        'pc_principal',
        'pc_babies',
        'alter_wissenschaftler',
        'junger_neffe',
        'randy_marsh'
      ],
      selectionSize: 3,
      maxInDeck: 2
    });
  });

  it('akzeptiert genau drei unterschiedliche konfigurierte Figuren', () => {
    expect(validateCheerleaderSelection(valid, null, data)).toEqual(valid);
  });

  it('lehnt falsche Anzahl, Duplikate und unbekannte IDs ab', () => {
    expect(() => validateCheerleaderSelection(valid.slice(0, 2), null, data)).toThrow(/exakt 3/);
    expect(() =>
      validateCheerleaderSelection(['pc_principal', 'pc_principal', 'pc_babies'], null, data)
    ).toThrow(/nur einmal/);
    expect(() =>
      validateCheerleaderSelection(['pc_principal', 'pc_babies', 'unbekannt'], null, data)
    ).toThrow(/Unbekannter Cheerleader/);
  });

  it('schließt Figuren aus, die Bestandteil des Decks sind', () => {
    const deck = { cards: [{ cardId: 'pc_principal', count: 1 }] };
    expect(() => validateCheerleaderSelection(valid, deck, data)).toThrow(
      /Bestandteil des Decks/
    );
  });
});

describe('Kampflogik', () => {
  it('kampfbereite Kreaturen schaden sich gleichzeitig', () => {
    const s = emptyState();
    put(s, 0, 0, 'ritter'); // 4/5
    put(s, 1, 0, 'wolf'); // 2/3 (rudel inaktiv: allein)
    const after = passBoth(s);
    // Wolf (2 ATK) trifft Ritter → 5-2=3 Leben; Ritter (4 ATK) tötet Wolf (3 HP).
    expect(after.board[1][0]).toBeNull();
    expect(after.board[0][0]?.currentHealth).toBe(3);
  });

  it('erschöpfte Kreaturen greifen nicht an, verteidigen aber', () => {
    const s = emptyState();
    put(s, 0, 0, 'rekrut'); // 2/1, kampfbereit
    put(s, 1, 0, 'baer', { exhausted: true }); // 4/5, erschöpft
    const after = passBoth(s);
    expect(after.board[1][0]?.currentHealth).toBe(3); // Bär nimmt 2
    expect(after.board[0][0]?.currentHealth).toBe(1); // Rekrut unversehrt
    expect(after.players[1].base).toBe(data.config.baseHealth); // kein Basis-Schaden
  });

  it('leere gegnerische Lane → Angriff trifft die Basis', () => {
    const s = emptyState();
    put(s, 0, 1, 'rekrut'); // 2 ATK
    const after = passBoth(s);
    expect(after.players[1].base).toBe(data.config.baseHealth - 2);
    expect(after.players[0].base).toBe(data.config.baseHealth);
  });

  it('Basis auf 0 → Spiel endet mit Sieger', () => {
    const s = emptyState();
    s.players[1].base = 2;
    put(s, 0, 0, 'ritter'); // 4 ATK auf leere Lane
    const after = passBoth(s);
    expect(after.phase).toBe('ended');
    expect(after.winner).toBe(0);
  });

  it('Kampf-Log enthält strukturierte Angriffs-Events (für UI-Animationen)', () => {
    const s = emptyState();
    put(s, 0, 1, 'rekrut'); // 2 ATK, gegnerische Lane leer → Basis
    const after = passBoth(s);
    const event = after.log.find((l) => l.event?.kind === 'attack')?.event;
    expect(event).toMatchObject({ lane: 1, attacker: 0, damage: 2, toBase: true });
  });

  it('Kampf-Log enthält Sterbe-Events nach den Angriffen derselben Lane', () => {
    const s = emptyState();
    put(s, 0, 0, 'ritter'); // 4/4
    put(s, 1, 0, 'wolf'); // 3/2 → stirbt
    const after = passBoth(s);
    const events = after.log.filter((l) => l.event).map((l) => l.event!);
    const attackIdx = events.findIndex((e) => e.kind === 'attack');
    const deathIdx = events.findIndex((e) => e.kind === 'death');
    expect(deathIdx).toBeGreaterThan(attackIdx);
    expect(events[deathIdx]).toMatchObject({ kind: 'death', lane: 0, owner: 1 });
  });
});

describe('Themen (Topics)', () => {
  it('topics.json wird geladen und validiert', () => {
    expect(data.topics.length).toBeGreaterThanOrEqual(1);
    for (const topic of data.topics) {
      expect(topic.id).toBeTruthy();
      expect(topic.colors.background).toBeTruthy();
      expect(topic.colors.lane).toBeTruthy();
    }
  });
});

describe('Gift (Schlange, seit Phase 7a Ability-Primitiv statt Alt-Keyword)', () => {
  it('fügt Giftmarken hinzu statt sofort zu töten (V2: Tod erst ab GIFT_TOD_SCHWELLE=3 Marken)', () => {
    const s = emptyState();
    put(s, 1, 0, 'schlange'); // 1/1, gift 2
    put(s, 0, 0, 'baer'); // 4/5
    const after = passBoth(s);
    // Schlange stirbt am Gegenschlag des Bären (4 Schaden auf 1 HP). Der Bär
    // nimmt 1 Kampfschaden + 2 Giftmarken, stirbt aber NICHT mehr sofort
    // (Alt-Keyword-Verhalten) – die Marken bleiben unter der Todesschwelle.
    expect(after.board[1][0]).toBeNull();
    expect(after.board[0][0]?.currentHealth).toBe(4);
    expect(after.board[0][0]?.poison).toBe(2);
  });

  it('wirkt nicht, wenn die Schlange erschöpft ist (kein Angriff)', () => {
    const s = emptyState();
    put(s, 1, 0, 'schlange', { exhausted: true });
    put(s, 0, 0, 'baer');
    const after = passBoth(s);
    // Bär greift die erschöpfte, verteidigende Schlange an und tötet sie:
    expect(after.board[1][0]).toBeNull();
    expect(after.board[0][0]?.poison).toBe(0); // Schlange hat nicht angegriffen -> kein Gift
  });
});

describe('Keyword rudel', () => {
  it('+1 Angriff nur mit anderem verbündeten Animal', () => {
    const s = emptyState();
    put(s, 1, 0, 'wolf');
    expect(getEffectiveAttack(s, 1, 0)).toBe(2); // allein: kein Bonus
    put(s, 1, 2, 'ratte');
    expect(getEffectiveAttack(s, 1, 0)).toBe(3); // Rudel aktiv
    s.board[1][2] = null;
    expect(getEffectiveAttack(s, 1, 0)).toBe(2); // Bonus dynamisch weg
  });
});

describe('Auren', () => {
  it('schild_nachbarn: +0/+1 für Nachbarn, dynamisch beim Wegfall gedeckelt', () => {
    const s = emptyState();
    put(s, 0, 0, 'rekrut'); // 2/1
    put(s, 0, 1, 'schildwache'); // Aura: Nachbarn +0/+1
    expect(getMaxHealth(s, 0, 0)).toBe(2);
    expect(s.board[0][0]?.currentHealth).toBe(2); // Aura hebt aktuelles Leben mit an
    // Aura-Quelle stirbt → Maximum sinkt, aktuelles Leben höchstens auf neues Maximum
    s.board[0][1] = null;
    recalcBoard(s);
    expect(getMaxHealth(s, 0, 0)).toBe(1);
    expect(s.board[0][0]?.currentHealth).toBe(1);
  });

  it('schild_nachbarn: bereits erlittener Schaden wird nicht doppelt bestraft', () => {
    const s = emptyState();
    const wache = put(s, 0, 0, 'schildwache'); // 1/4
    put(s, 0, 1, 'kommandantin'); // aura_alle: +1/+1 → Wache 2/5
    wache.currentHealth -= 1; // Wache auf 4/5
    s.board[0][1] = null; // Aura fällt weg → Maximum wieder 4
    recalcBoard(s);
    // aktuelles Leben (4) liegt nicht über dem neuen Maximum (4) → bleibt 4
    expect(s.board[0][0]?.currentHealth).toBe(4);
  });

  it('aura_alle (Kommandantin): +1/+1 für alle anderen Verbündeten', () => {
    const s = emptyState();
    put(s, 0, 0, 'rekrut'); // 2/1
    put(s, 0, 2, 'kommandantin'); // 3/6
    expect(getEffectiveAttack(s, 0, 0)).toBe(3);
    expect(getMaxHealth(s, 0, 0)).toBe(2);
    // Die Kommandantin bufft sich nicht selbst:
    expect(getEffectiveAttack(s, 0, 2)).toBe(3);
    expect(getMaxHealth(s, 0, 2)).toBe(6);
  });

  it('alpha_aura bufft nur andere Animals', () => {
    const s = emptyState();
    put(s, 1, 0, 'alphawolf'); // 4/4
    put(s, 1, 1, 'ratte'); // 2/1 → 3/1
    expect(getEffectiveAttack(s, 1, 1)).toBe(3);
    expect(getEffectiveAttack(s, 1, 0)).toBe(4); // nicht sich selbst
  });

  it('banner_nachbarn wirkt nur auf direkte Nachbarn', () => {
    const s = emptyState();
    put(s, 0, 0, 'bannertraeger'); // Nachbarn +1/+0
    put(s, 0, 1, 'rekrut');
    put(s, 0, 2, 'ritter');
    expect(getEffectiveAttack(s, 0, 1)).toBe(3); // Nachbar: 2+1
    expect(getEffectiveAttack(s, 0, 2)).toBe(4); // Lane 3 ist KEIN Nachbar von Lane 1
  });
});

describe('Rundenende', () => {
  it('heilt_nachbarn heilt am Rundenende um 1, nie über das Maximum', () => {
    const s = emptyState();
    const ritter = put(s, 0, 0, 'ritter', { exhausted: true }); // 4/4
    put(s, 0, 1, 'feldscherin', { exhausted: true });
    put(s, 0, 2, 'rekrut', { exhausted: true }); // unverletzt → keine Heilung
    ritter.currentHealth = 2;
    const after = passBoth(s); // Kampf (nichts passiert) → Rundenende
    expect(after.round).toBe(2);
    expect(after.board[0][0]?.currentHealth).toBe(3); // 2 + 1
    expect(after.board[0][2]?.currentHealth).toBe(1); // blieb beim Maximum
  });

  it('temporäre Buffs verfallen, Erschöpfung wird aufgehoben', () => {
    const s = emptyState();
    const baer = put(s, 1, 0, 'baer', { exhausted: true });
    baer.tempAttackBonus = 2;
    expect(getEffectiveAttack(s, 1, 0)).toBe(6);
    const after = passBoth(s);
    expect(getEffectiveAttack(after, 1, 0)).toBe(4);
    expect(after.board[1][0]?.exhausted).toBe(false);
  });
});

describe('Ausspielen & Energie', () => {
  it('flink ist sofort kampfbereit, andere Kreaturen erschöpft', () => {
    let s = emptyState();
    s.players[0].hand = ['rekrut'];
    s.players[1].hand = ['ratte'];
    s = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(s.board[0][0]?.exhausted).toBe(true);
    s = applyAction(s, 1, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(s.board[1][0]?.exhausted).toBe(false); // flink
  });

  it('ohne Energie kann keine Karte gespielt werden', () => {
    const s = emptyState();
    s.players[0].hand = ['ritter'];
    s.players[0].energy = 3; // Ritter kostet 4
    expect(() =>
      applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data)
    ).toThrow(/Energie/);
  });

  it('Deckbau: deckSize Karten, parent-aware, maxCopies/Signatur respektiert', () => {
    const tree = buildFactionTree(data.factions);
    const deck = buildDeck(data, 'humans', Math.random);
    expect(deck).toHaveLength(data.config.deckbuilding.size);
    // Alle Karten gehören zur Oberfraktion "humans" (inkl. Sub-Fraktionen).
    for (const id of deck) {
      expect(topOf(tree, data.cardsById[id].faction)).toBe('humans');
    }
    // Keine Karte öfter als maxCopies; Signaturkarten höchstens einmal.
    const counts = new Map<string, number>();
    for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, n] of counts) {
      const max = data.cardsById[id].signature
        ? (data.config.deckbuilding.maxCopiesSignature ?? 1)
        : data.config.deckbuilding.maxCopies;
      expect(n).toBeLessThanOrEqual(max);
    }
  });

  it('createGame: Starthand, Mulligan und danach Runde 1 mit 1 Energie', () => {
    let g = createGame(data, ['humans', 'animals'], () => 0.42);
    expect(g.phase).toBe('mulligan');
    expect(g.round).toBe(0);
    g = applyAction(g, 0, { type: 'mulligan', handIndices: [] }, data, () => 0.42);
    g = applyAction(g, 1, { type: 'mulligan', handIndices: [] }, data, () => 0.42);
    expect(g.round).toBe(1);
    expect(g.players[0].hand).toHaveLength(data.config.startingHand);
    expect(g.players[0].base).toBe(data.config.baseHealth);
    expect(g.players[0].energy).toBe(1);
    expect(g.players[0].deck).toHaveLength(data.config.deckbuilding.size - data.config.startingHand);
  });

  it('Mulligan zieht Ersatz vor dem Zurückmischen und wartet auf beide Spieler', () => {
    let g = createGame(data, ['humans', 'animals'], () => 0.42);
    g.players[0].hand = ['rekrut', 'feldscherin', 'generalstreik', 'die_massen'];
    g.players[0].deck = ['flugblatt_verteiler', 'streikposten', 'basisdemokratie', 'schrottsammlerin', ...g.players[0].deck];
    g = applyAction(g, 0, { type: 'mulligan', handIndices: [0, 1, 2, 3] }, data, () => 0);
    expect(g.phase).toBe('mulligan');
    expect(g.players[0].hand).toEqual(['flugblatt_verteiler', 'streikposten', 'basisdemokratie', 'schrottsammlerin']);
    expect(g.players[0].mulliganDone).toBe(true);
    expect(g.players[1].mulliganDone).toBe(false);
    g = applyAction(g, 1, { type: 'mulligan', handIndices: [] }, data, () => 0);
    expect(g.phase).toBe('play');
    expect(g.round).toBe(1);
  });
});

describe('Fraktionsbaum', () => {
  const tree = buildFactionTree(data.factions);

  it('löst Sub-Fraktionen zur Oberfraktion auf (topOf)', () => {
    expect(topOf(tree, 'katzen')).toBe('animals');
    expect(topOf(tree, 'sozis')).toBe('humans');
    expect(topOf(tree, 'humans')).toBe('humans');
    expect(topOf(tree, 'animals')).toBe('animals');
  });

  it('matchesScope: same_sub / same_top / any', () => {
    expect(matchesScope(tree, 'same_sub', 'katzen', 'katzen')).toBe(true);
    expect(matchesScope(tree, 'same_sub', 'katzen', 'voegel')).toBe(false);
    expect(matchesScope(tree, 'same_top', 'katzen', 'voegel')).toBe(true);
    expect(matchesScope(tree, 'same_top', 'katzen', 'sozis')).toBe(false);
    expect(matchesScope(tree, 'any', 'katzen', 'sozis')).toBe(true);
  });

  it('parent-Validierung: unbekannte Oberfraktion wird abgelehnt', () => {
    const bad = [{ id: 'x', name: 'X', parent: 'gibtsnicht' }];
    expect(() =>
      validateGameData({ config: data.config, factions: bad, topics: [], cardFiles: [] })
    ).toThrow(/Oberfraktion "gibtsnicht" gibt es nicht/);
  });
});

describe('Neue Fähigkeiten – Skalierung & Auren', () => {
  it('skalierung wächst mit Anzahl und schrumpft dynamisch beim Sterben', () => {
    const s = emptyState();
    put(s, 0, 0, 'basisdemokratie'); // 1/5, +1 ATK je weiterem Menschen (cap 2)
    expect(getEffectiveAttack(s, 0, 0)).toBe(1);
    put(s, 0, 1, 'rekrut');
    put(s, 0, 2, 'ritter');
    expect(getEffectiveAttack(s, 0, 0)).toBe(3); // +2 (zwei weitere Menschen)
    s.board[0][2] = null; // einer stirbt
    recalcBoard(s);
    expect(getEffectiveAttack(s, 0, 0)).toBe(2); // dynamisch zurück auf +1
  });

  it('skalierung cap begrenzt den Bonus', () => {
    const s = emptyState();
    const c = put(s, 0, 0, 'die_massen'); // Sozi
    c.abilities = [{ kind: 'skalierung', scope: 'same_sub', per: { atk: 1, hp: 0 }, cap: 1 }];
    put(s, 0, 1, 'flugblatt_verteiler'); // Sozi
    put(s, 0, 2, 'basisdemokratie'); // Sozi
    recalcBoard(s);
    expect(getEffectiveAttack(s, 0, 0)).toBe(6); // Basis 5 + cap 1
  });

  it('skalierung includeSelf zählt sich selbst mit', () => {
    const s = emptyState();
    const c = put(s, 0, 0, 'basisdemokratie');
    c.abilities = [{ kind: 'skalierung', scope: 'same_top', per: { atk: 1, hp: 0 }, includeSelf: true }];
    recalcBoard(s);
    expect(getEffectiveAttack(s, 0, 0)).toBe(2); // allein: self zählt
  });

  it('aura dauerhaft verschwindet, wenn die Quelle stirbt', () => {
    const s = emptyState();
    put(s, 0, 0, 'spinosaurus'); // Dino, Aura same_sub +1 ATK
    put(s, 0, 1, 'triceratops'); // Dino 3/6
    expect(getEffectiveAttack(s, 0, 1)).toBe(4); // 3 + Aura 1
    s.board[0][0] = null;
    recalcBoard(s);
    expect(getEffectiveAttack(s, 0, 1)).toBe(3);
  });

  it('neugier gilt nur allein in der Lane', () => {
    const s = emptyState();
    put(s, 0, 0, 'hauskater'); // 2/2, Pirsch +1 ATK solo
    expect(getEffectiveAttack(s, 0, 0)).toBe(3);
    put(s, 1, 0, 'moewe'); // Gegner in der Lane
    expect(getEffectiveAttack(s, 0, 0)).toBe(2);
  });
});

describe('Neue Fähigkeiten – Kampf', () => {
  it('wucht: Überschussschaden trifft die Basis', () => {
    const s = emptyState();
    put(s, 0, 0, 'kranfuehrer'); // 4/4 Wucht
    put(s, 1, 0, 'streunerkatze', { exhausted: true }); // 2/1, wehrt sich nicht
    const after = passBoth(s);
    expect(after.board[1][0]).toBeNull();
    expect(after.players[1].base).toBe(data.config.baseHealth - 3); // 4 - 1 HP = 3 Überschuss
  });

  it('dornen: der Angreifer nimmt Schaden', () => {
    const s = emptyState();
    put(s, 0, 0, 'ritter'); // 4/5, greift an
    put(s, 1, 0, 'gecko', { exhausted: true }); // 1/4 Dornen 1
    const after = passBoth(s);
    expect(after.board[1][0]).toBeNull(); // Gecko stirbt (4 Schaden)
    expect(after.board[0][0]?.currentHealth).toBe(4); // Ritter nimmt 1 Dornen-Schaden
  });

  it('gift: Marken machen selbst keinen Schaden, sammeln sich aber an (V2: Tod erst ab 3 Marken)', () => {
    const s = emptyState();
    put(s, 0, 0, 'klapperschlange'); // 2/3 Gift 2
    put(s, 1, 0, 'brachiosaurus', { exhausted: true }); // 6/9, wehrt sich nicht
    const after = passBoth(s);
    // Nur der Kampf-Treffer (2) mindert das Leben; Gift zählt Marken statt direkt zu schaden.
    expect(after.board[1][0]?.currentHealth).toBe(6);
    expect(after.board[1][0]?.poison).toBe(2);
  });

  it('gift: bei 3 Marken stirbt die Kreatur sofort (GIFT_TOD_SCHWELLE)', () => {
    const s = emptyState();
    put(s, 0, 0, 'klapperschlange'); // 2/3 Gift 2
    const opfer = put(s, 1, 0, 'brachiosaurus', { exhausted: true }); // 6/9, wehrt sich nicht
    opfer.poison = 1; // + 2 aus dem Kampf = 3 -> Tod
    const after = passBoth(s);
    expect(after.board[1][0]).toBeNull();
  });

  it('hinrichten überspringt urgewalt und trifft einen anderen schwachen Gegner', () => {
    const s = emptyState();
    const krokodil = put(s, 0, 0, 'krokodil'); // 5/5; hinrichten manuell statt hunter, greift Lane 0 an
    krokodil.abilities = [{ kind: 'hinrichten', maxHp: 2 }];
    put(s, 1, 0, 'die_massen', { exhausted: true }); // 5/7 (>2 HP, kein Ziel), überlebt Kampf
    const brachio = put(s, 1, 1, 'brachiosaurus', { exhausted: true }); // urgewalt
    brachio.currentHealth = 2; // verwundet, aber immun gegen Hinrichten
    put(s, 1, 2, 'moewe', { exhausted: true }); // 3/1 (≤2 HP) – gültiges Hinrichten-Ziel
    const after = passBoth(s);
    expect(after.board[1][1]).not.toBeNull(); // urgewalt überlebt das Hinrichten
    expect(after.board[1][2]).toBeNull(); // stattdessen wird die Möwe hingerichtet
  });

  it('todesfluch: der Angreifer verliert dauerhaft ATK', () => {
    const s = emptyState();
    put(s, 0, 0, 'schwarze_katze'); // 3/2, beim Tod: Angreifer −1 ATK
    put(s, 1, 0, 'die_massen'); // 5/7, tötet die Katze
    const after = passBoth(s);
    expect(after.board[0][0]).toBeNull();
    expect(getEffectiveAttack(after, 1, 0)).toBe(4); // 5 − 1 (Todesfluch)
  });
});

describe('Neue Fähigkeiten – Rettung, Trigger & Wachstum', () => {
  it('Todes-Rettung greift genau einmal pro Spiel', () => {
    const s = emptyState();
    put(s, 0, 0, 'der_alte_hund'); // 1/4, survive_1hp
    put(s, 1, 0, 'wildkatze'); // 5/4, tödlich
    const r1 = passBoth(s);
    expect(r1.board[0][0]?.currentHealth).toBe(1); // gerettet bei 1 HP
    expect(r1.board[0][0]?.rettungUsed).toBe(true);
    const r2 = passBoth(r1);
    expect(r2.board[0][0]).toBeNull(); // zweiter tödlicher Treffer: keine Rettung mehr
  });

  it('sammeln: dauerhafter Bonus, wenn eine Kreatur stirbt', () => {
    const s = emptyState();
    put(s, 0, 0, 'streuner'); // 2/1, sammeln +0/+1 (any); Lane 0 frei → trifft Basis, überlebt
    put(s, 0, 1, 'ritter'); // 4/4
    put(s, 1, 1, 'moewe'); // 3/1 – stirbt im Kampf
    const after = passBoth(s);
    expect(after.board[1][1]).toBeNull();
    expect(getMaxHealth(after, 0, 0)).toBe(2); // Streuner 1 HP + Sammeln 1
  });

  it('beschwoeren beim Ausspielen: Katzenmutter erzeugt ein Kätzchen', () => {
    const s = emptyState();
    s.players[0].hand = ['katzenmutter'];
    const after = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(after.board[0].filter(Boolean)).toHaveLength(2); // Mutter + 1 Kätzchen
    const kitten = after.board[0].find((c) => c?.name === 'Kätzchen');
    expect(kitten?.faction).toBe('katzen'); // Token erbt die Sub-Fraktion
  });

  it('beschwoeren beim Tod: Schrottsammlerin hinterlässt einen Fund-Token', () => {
    const s = emptyState();
    put(s, 0, 0, 'schrottsammlerin'); // 3/3
    put(s, 1, 0, 'wildkatze'); // 5/4, tötet sie
    const after = passBoth(s);
    const token = after.board[0].find((c) => c?.name === 'Fund-Token');
    expect(token).toBeTruthy();
    expect(token?.faction).toBe('obdachlose');
  });

  it('lernen zieht beim Ausspielen eine Karte', () => {
    const s = emptyState();
    s.players[0].deck = ['ritter', 'wolf'];
    s.players[0].hand = ['erstsemester'];
    const after = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(after.players[0].hand).toEqual(['ritter']);
  });

  it('wissen füllt den spielerweiten Pool', () => {
    const s = emptyState();
    s.players[0].hand = ['nachhilfe'];
    const after = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(after.players[0].knowledge).toBe(1);
  });

  it('Rundenwachstum stapelt jede Runde', () => {
    const s = emptyState();
    put(s, 0, 0, 'lehrling'); // 1/2, Rundenwachstum +0/+1; Lane frei → überlebt
    const after = passBoth(s); // eine volle Runde → Rundenbeginn 2 löst Wachstum aus
    expect(getMaxHealth(after, 0, 0)).toBe(3); // 2 + 1
  });

  it('ueberstunden löst nur einmal aus', () => {
    let s = emptyState();
    put(s, 0, 0, 'schichtwechsel'); // 3/3, ueberstunden +2/+1
    s = passBoth(s);
    s = passBoth(s);
    s = passBoth(s);
    expect(getMaxHealth(s, 0, 0)).toBe(4); // 3 + 1, nicht +2
    expect(s.board[0][0]?.ueberstundenDone).toBe(true);
  });
});

describe('Heroes & PC Principal', () => {
  it('Vogelmensch bewegt einen blockierten Verbündeten in eine freie Lane (+1 ATK)', () => {
    const s = emptyState();
    const ritter = put(s, 0, 0, 'ritter'); // steht einem Gegner gegenüber
    put(s, 1, 0, 'wolf');
    put(s, 0, 1, 'vogelmensch');
    onPlayAbilities(s, 0, 1);
    expect(s.board[0][0]).toBeNull();
    expect(s.board[0][2]).toBe(ritter);
    expect(ritter.tempAttackBonus).toBe(1);
  });

  it('Vogelmensch bewegt nichts, wenn kein Verbündeter blockiert ist', () => {
    const s = emptyState();
    const ritter = put(s, 0, 0, 'ritter'); // kein Gegner gegenüber
    put(s, 0, 1, 'vogelmensch');
    onPlayAbilities(s, 0, 1);
    expect(s.board[0][0]).toBe(ritter);
    expect(ritter.tempAttackBonus).toBe(0);
  });

  it('PC Babies senken die ATK aller Gegner bis zum Rundenende um 1', () => {
    let s = emptyState();
    put(s, 1, 0, 'ritter'); // 4/5
    put(s, 1, 1, 'wolf');
    put(s, 0, 2, 'pc_babies');
    onPlayAbilities(s, 0, 2);
    expect(getEffectiveAttack(s, 1, 0)).toBe(3);
    expect(s.board[1][1]?.tempAttackBonus).toBe(-1);
    // Rundenende hebt den temporären Malus wieder auf.
    s = passBoth(s);
    expect(s.board[1][0]?.tempAttackBonus).toBe(0);
  });

  it('Alter Wissenschaftler: Schaden, wenn ein Gegner in der Lane steht', () => {
    const s = emptyState();
    const ritter = put(s, 1, 0, 'ritter'); // 4/5
    put(s, 0, 0, 'alter_wissenschaftler');
    onPlayAbilities(s, 0, 0);
    expect(ritter.currentHealth).toBe(3);
    expect(s.players[0].hand).toHaveLength(0);
    expect(s.players[0].knowledge).toBe(0);
  });

  it('Alter Wissenschaftler: sonst 1 Karte und 1 Wissen', () => {
    const s = emptyState();
    s.players[0].deck = ['rekrut'];
    put(s, 0, 0, 'alter_wissenschaftler');
    onPlayAbilities(s, 0, 0);
    expect(s.players[0].hand).toEqual(['rekrut']);
    expect(s.players[0].knowledge).toBe(1);
  });

  it('Junger Neffe zieht eine Karte, wenn Zäh auslöst', () => {
    const s = emptyState();
    s.players[0].deck = ['rekrut'];
    const neffe = put(s, 0, 0, 'junger_neffe'); // 2/3, zäh
    neffe.currentHealth -= 5;
    recalcBoard(s);
    expect(s.board[0][0]).toBe(neffe);
    expect(neffe.currentHealth).toBe(1);
    expect(neffe.rettungUsed).toBe(true);
    expect(s.players[0].hand).toEqual(['rekrut']);
  });

  it('Randy Marsh: Rückstoß trifft ihn und den Gegner in seiner Lane', () => {
    const s = emptyState();
    const wolf = put(s, 1, 0, 'wolf'); // 2/3
    const randy = put(s, 0, 0, 'randy_marsh'); // 5/6
    onPlayAbilities(s, 0, 0);
    expect(randy.currentHealth).toBe(4);
    expect(wolf.currentHealth).toBe(1);
  });

  it('Randy Marsh: ohne Gegner erleidet nur er selbst Schaden', () => {
    const s = emptyState();
    const randy = put(s, 0, 1, 'randy_marsh');
    onPlayAbilities(s, 0, 1);
    expect(randy.currentHealth).toBe(4);
  });

  it('PC Principal peinigt alle Gegner dauerhaft auf 0 ATK / 1 Verteidigung', () => {
    const s = emptyState();
    put(s, 1, 0, 'ritter'); // 4/5
    put(s, 1, 1, 'tyrannosaurus_rex');
    put(s, 0, 2, 'pc_principal');
    onPlayAbilities(s, 0, 2);
    recalcBoard(s);
    for (const lane of [0, 1]) {
      expect(getEffectiveAttack(s, 1, lane)).toBe(0);
      expect(getMaxHealth(s, 1, lane)).toBe(1);
      expect(s.board[1][lane]?.currentHealth).toBe(1);
    }
    // Eine NEUE Aura hebt die Peinigung nicht auf (Deckel greift zuletzt).
    put(s, 1, 2, 'kommandantin'); // +1/+1 für andere Menschen
    recalcBoard(s);
    expect(getEffectiveAttack(s, 1, 0)).toBe(0);
    expect(getMaxHealth(s, 1, 0)).toBe(1);
  });
});

describe('Deckbau-Regeln (Zod)', () => {
  const katzenVoegel = [
    { cardId: 'streunerkatze', count: 2 },
    { cardId: 'getigerter', count: 2 },
    { cardId: 'hauskater', count: 2 },
    { cardId: 'schwarze_katze', count: 2 },
    { cardId: 'katzenmutter', count: 2 },
    { cardId: 'luchs', count: 1 },
    { cardId: 'spatz', count: 2 },
    { cardId: 'kraehe', count: 2 },
    { cardId: 'moewe', count: 2 },
    { cardId: 'der_schwarm', count: 1 },
    { cardId: 'eule', count: 2 }
  ]; // Summe 20, Oberfraktion animals

  it('akzeptiert ein gültiges 20er-singleTop-Deck', () => {
    expect(() => validateDeck({ cards: katzenVoegel }, data)).not.toThrow();
  });

  it('lehnt zu große Decks ab', () => {
    const deck = { cards: [...katzenVoegel, { cardId: 'moewe', count: 1 }] };
    // moewe doppelt → wird als "mehrfach aufgeführt" ODER Größe erkannt
    expect(() => validateDeck(deck, data)).toThrow(/21 Karten, erlaubt sind 20|mehrfach/);
  });

  it('lehnt zu viele Kopien ab', () => {
    const deck = { cards: [{ cardId: 'streunerkatze', count: 20 }] };
    expect(() => validateDeck(deck, data)).toThrow(/Zu viele Kopien von "Streunerkatze": 20, erlaubt sind 3/);
  });

  it('lehnt Signaturkarten über maxCopiesSignature (2) ab', () => {
    const deck = {
      cards: [
        { cardId: 'luchs', count: 3 },
        { cardId: 'streunerkatze', count: 2 },
        { cardId: 'getigerter', count: 2 },
        { cardId: 'hauskater', count: 2 },
        { cardId: 'schwarze_katze', count: 2 },
        { cardId: 'katzenmutter', count: 2 },
        { cardId: 'spatz', count: 2 },
        { cardId: 'kraehe', count: 2 },
        { cardId: 'moewe', count: 2 },
        { cardId: 'der_schwarm', count: 2 }
      ]
    };
    expect(() => validateDeck(deck, data)).toThrow(/Zu viele Kopien von "Luchs": 3, erlaubt sind 2/);
  });

  it('lehnt gemischte Oberfraktionen (singleTop) ab', () => {
    const deck = {
      cards: [
        { cardId: 'streunerkatze', count: 2 },
        { cardId: 'getigerter', count: 2 },
        { cardId: 'hauskater', count: 2 },
        { cardId: 'schwarze_katze', count: 2 },
        { cardId: 'katzenmutter', count: 2 },
        { cardId: 'spatz', count: 2 },
        { cardId: 'kraehe', count: 2 },
        { cardId: 'moewe', count: 2 },
        { cardId: 'lehrling', count: 2 }, // Mensch!
        { cardId: 'fliessbandarbeiter', count: 2 }
      ]
    };
    expect(() => validateDeck(deck, data)).toThrow(/mehrere Oberfraktionen/);
  });

  // 17 reguläre Menschen-Karten – Platz für 2 Heroes + 1 PC Principal (=20).
  const menschenBasis = [
    { cardId: 'rekrut', count: 3 },
    { cardId: 'schildwache', count: 3 },
    { cardId: 'ritter', count: 3 },
    { cardId: 'lehrling', count: 3 },
    { cardId: 'fliessbandarbeiter', count: 3 },
    { cardId: 'bannertraeger', count: 2 }
  ];

  it('akzeptiert 2 Heroes plus 1 PC Principal (Principal zählt nicht zum Hero-Limit)', () => {
    const deck = {
      cards: [
        ...menschenBasis,
        { cardId: 'junger_neffe', count: 1 },
        { cardId: 'randy_marsh', count: 1 },
        { cardId: 'pc_principal', count: 1 }
      ]
    };
    expect(() => validateDeck(deck, data)).toThrow(
      /Zu viele Cheerleader-Kandidaten im Deck: 3, erlaubt sind 2/
    );
  });

  it('Heroes und PC Principal zählen zur Deckgröße', () => {
    const deck = {
      cards: [
        ...menschenBasis,
        { cardId: 'junger_neffe', count: 1 },
        { cardId: 'randy_marsh', count: 1 }
      ]
    };
    expect(() => validateDeck(deck, data)).toThrow(/19 Karten, erlaubt sind 20/);
  });

  it('lehnt mehr als 2 Heroes ab', () => {
    const deck = {
      cards: [
        ...menschenBasis.slice(0, 5),
        { cardId: 'bannertraeger', count: 1 },
        { cardId: 'junger_neffe', count: 1 },
        { cardId: 'randy_marsh', count: 1 },
        { cardId: 'pc_babies', count: 1 },
        { cardId: 'pc_principal', count: 1 }
      ]
    };
    expect(() => validateDeck(deck, data)).toThrow(/Zu viele Heroes: 3, erlaubt sind 2/);
  });

  it('lehnt denselben Hero mehrfach ab', () => {
    const deck = {
      cards: [...menschenBasis, { cardId: 'junger_neffe', count: 2 }, { cardId: 'pc_principal', count: 1 }]
    };
    expect(() => validateDeck(deck, data)).toThrow(/Zu viele Kopien von "Junger Neffe": 2, erlaubt sind 1/);
  });

  it('lehnt mehr als einen PC Principal ab', () => {
    const deck = {
      cards: [...menschenBasis, { cardId: 'junger_neffe', count: 1 }, { cardId: 'pc_principal', count: 2 }]
    };
    expect(() => validateDeck(deck, data)).toThrow(/Zu viele Kopien von "PC Principal": 2, erlaubt sind 1/);
  });

  it('der neutrale PC Principal verstößt nicht gegen singleTop', () => {
    const deck = { cards: [...katzenVoegel.slice(0, 10), { cardId: 'eule', count: 1 }, { cardId: 'pc_principal', count: 1 }] };
    // 18 Katzen/Vögel + 1 Eule + 1 Principal = 20, keine Oberfraktions-Meldung.
    expect(() => validateDeck(deck, data)).not.toThrow();
  });

  it('lehnt unbekannte Karten ab', () => {
    expect(() => validateDeck({ cards: [{ cardId: 'gibtsnicht', count: 20 }] }, data)).toThrow(
      /Unbekannte Karte "gibtsnicht"/
    );
  });
});

describe('Energie (ungedeckelt)', () => {
  it('roundEnergy: Runde n = start + (n-1)*perRound, ohne Cap', () => {
    expect(roundEnergy(data.config, 1)).toBe(1);
    expect(roundEnergy(data.config, 6)).toBe(6);
    expect(roundEnergy(data.config, 7)).toBe(7); // Brachiosaurus (7) ab Runde 7 spielbar
    expect(roundEnergy(data.config, 12)).toBe(12);
  });
});

describe('Balancing V2 Phase 1: Determinismus, Bugfixes, Log-Schalter', () => {
  it('createSeededRandom: gleicher Seed erzeugt exakt dieselbe Partie', () => {
    const gA = createGame(data, ['humans', 'animals'], createSeededRandom(1234));
    const gB = createGame(data, ['humans', 'animals'], createSeededRandom(1234));
    expect(gA.startingPlayer).toBe(gB.startingPlayer);
    expect(gA.players[0].deck).toEqual(gB.players[0].deck);
    expect(gA.players[1].deck).toEqual(gB.players[1].deck);
    expect(gA.players[0].hand).toEqual(gB.players[0].hand);
    expect(gA.players[1].hand).toEqual(gB.players[1].hand);
    // Andere Seeds erzeugen (mit überwältigender Wahrscheinlichkeit) andere Decks.
    const gC = createGame(data, ['humans', 'animals'], createSeededRandom(9999));
    expect(gC.players[0].deck).not.toEqual(gA.players[0].deck);
  });

  it('Bugfix: Basisschaden aus einem Aktionskarten-Effekt beendet die Partie sofort in der Play-Phase', () => {
    // Vorher prüfte nur resolveCombat() checkBaseDestroyed; Basisschaden aus
    // einem Effekt in der Play-Phase (hier: spendKnowledge bei leerem
    // Gegnerfeld) konnte die Basis auf ≤0 senken, ohne dass die Partie endete.
    // (Sturzflug ist seit Phase 6/V2 auf denselben-Lane-Treffer beschränkt und
    // hat keinen Basis-Fallback mehr, kann diesen Fall also nicht mehr auslösen.)
    const s = emptyState();
    s.players[1].base = 6;
    s.players[0].knowledge = 3;
    s.players[0].hand = ['experimentelle_formel']; // spendKnowledge, gegnerisches Feld ist leer → Basis
    const after = applyAction(s, 0, { type: 'playAction', handIndex: 0 }, data);
    expect(after.players[1].base).toBe(0);
    expect(after.phase).toBe('ended');
    expect(after.winner).toBe(0);
  });

  it('Bugfix: kaltbluetig-Bonus kehrt in der Folgerunde zurück (attackedThisRound wird zurückgesetzt)', () => {
    const s = emptyState();
    put(s, 0, 0, 'koenig_der_kobras'); // 3/5, kaltbluetig +0/+1 solange nicht angegriffen
    expect(getMaxHealth(s, 0, 0)).toBe(5); // Bonus aktiv (noch nie angegriffen)
    put(s, 1, 0, 'streunerkatze', { exhausted: true }); // wehrt sich nicht, stirbt
    const after = passBoth(s); // Kobra greift an; Runde endet danach automatisch
    expect(after.board[1][0]).toBeNull();
    // Vorher blieb attackedThisRound für immer true → Bonus wäre dauerhaft weg.
    expect(getMaxHealth(after, 0, 0)).toBe(5);
  });

  it('Bugfix: mehrere gleichartige Abilities stapeln (getAbilities statt getAbility)', () => {
    const s = emptyState();
    put(s, 0, 0, 'ritter'); // 4/5, greift an
    const gecko = put(s, 1, 0, 'gecko', { exhausted: true }); // 1/4, Dornen 1
    gecko.abilities.push({ kind: 'dornen', x: 1 }); // zweite Dornen-Fähigkeit auf derselben Karte
    const after = passBoth(s);
    expect(after.board[1][0]).toBeNull(); // Gecko stirbt (4 Schaden)
    expect(after.board[0][0]?.currentHealth).toBe(3); // 5 − (1+1) Dornen statt nur 1
  });

  it("logModus:'aus' unterdrückt weiteres Loggen, ohne den Spielausgang zu ändern", () => {
    const seed = 42;
    let logged = createGame(data, ['humans', 'animals'], createSeededRandom(seed));
    let silent = createGame(data, ['humans', 'animals'], createSeededRandom(seed));
    silent.logModus = 'aus';
    const silentLogLengthAtStart = silent.log.length;

    for (let i = 0; i < 4 && logged.phase !== 'ended'; i++) {
      logged = passBoth(logged);
      silent = passBoth(silent);
    }

    expect(silent.log).toHaveLength(silentLogLengthAtStart); // kein einziger neuer Eintrag
    expect(logged.winner).toBe(silent.winner);
    expect(logged.round).toBe(silent.round);
    expect(logged.players[0].base).toBe(silent.players[0].base);
    expect(logged.players[1].base).toBe(silent.players[1].base);
  });
});

describe('Balancing V2 Phase 6: neue Engine-Primitive', () => {
  it('bedingt: Bonus nur, solange genug weitere Kreaturen im Wirkungsbereich stehen', () => {
    const s = emptyState();
    const c = put(s, 0, 0, 'ritter'); // 4/4
    c.abilities = [{ kind: 'bedingt', scope: 'any', mindestAnzahl: 1, bonus: { atk: 2, hp: 1 } }];
    recalcBoard(s);
    expect(getEffectiveAttack(s, 0, 0)).toBe(4); // allein -> kein Bonus
    put(s, 0, 1, 'rekrut'); // beliebige zweite eigene Kreatur
    expect(getEffectiveAttack(s, 0, 0)).toBe(6); // Bedingung erfüllt -> Bonus aktiv
  });

  it('hunter: Kampfbonus nur gegen ein vergiftetes Ziel', () => {
    const s = emptyState();
    const jaeger = put(s, 0, 0, 'ritter'); // 4/4
    jaeger.abilities = [{ kind: 'hunter', bonusAtk: 3 }];
    const opfer = put(s, 1, 0, 'brachiosaurus', { exhausted: true }); // 6/9, wehrt sich nicht
    opfer.poison = 1; // vergiftet -> Hunter-Bonus greift
    const after = passBoth(s);
    expect(after.board[1][0]?.currentHealth).toBe(1); // 8 - (4 + 3 Hunter-Bonus)
  });

  it('hunter: kein Bonus gegen ein ungiftiges Ziel', () => {
    const s = emptyState();
    const jaeger = put(s, 0, 0, 'ritter'); // 4/4
    jaeger.abilities = [{ kind: 'hunter', bonusAtk: 3 }];
    put(s, 1, 0, 'brachiosaurus', { exhausted: true }); // 6/9, kein Gift
    const after = passBoth(s);
    expect(after.board[1][0]?.currentHealth).toBe(4); // 8 - 4, kein Bonus
  });

  it('shedding: heilt proaktiv bei Erreichen der Schwelle, entfernt optional Gift, löst nur einmal pro Spiel aus', () => {
    const s = emptyState();
    const c = put(s, 0, 0, 'brachiosaurus'); // 6/9
    c.abilities = [{ kind: 'shedding', schwelle: 3, heilung: 4, entferntGift: true }];
    c.currentHealth = 3;
    c.poison = 2;
    applyShedding(s);
    expect(c.currentHealth).toBe(7); // 3 + 4
    expect(c.poison).toBe(0);

    c.currentHealth = 1; // erneut unter der Schwelle
    applyShedding(s);
    expect(c.currentHealth).toBe(1); // kein zweites Mal in diesem Spiel
  });

  it('synergie: Bonus nur, wenn der Besitzer diese Runde schon eine passende Karte gespielt hat', () => {
    const s = emptyState();
    const c = put(s, 0, 0, 'ritter');
    c.abilities = [{ kind: 'synergie', scope: 'any', bonus: { atk: 1, hp: 1 } }];

    onPlayAbilities(s, 0, 0); // noch nichts diese Runde gespielt -> kein Bonus
    expect(c.permAttackBonus).toBe(0);

    s.players[0].gespieltDieseRunde = ['ritter'];
    onPlayAbilities(s, 0, 0);
    expect(c.permAttackBonus).toBe(1);
    expect(c.permHealthBonus).toBe(1);
  });

  it('wahl (handKlein): bevorzugt Ziehen bei kleiner Hand', () => {
    const s = emptyState();
    const c = put(s, 0, 0, 'ritter');
    c.abilities = [
      { kind: 'wahl', optionA: { art: 'ziehen', n: 1 }, optionB: { art: 'wissen', x: 2 }, regel: 'handKlein' }
    ];
    s.players[0].hand = [];
    s.players[0].deck = ['rekrut'];
    onRoundStartAbilities(s);
    expect(s.players[0].hand).toEqual(['rekrut']);
    expect(s.players[0].knowledge).toBe(0);
  });

  it('wahl (wissenKnapp): bevorzugt Wissen, wenn der Pool knapp ist', () => {
    const s = emptyState();
    const c = put(s, 0, 0, 'ritter');
    c.abilities = [
      { kind: 'wahl', optionA: { art: 'ziehen', n: 1 }, optionB: { art: 'wissen', x: 2 }, regel: 'wissenKnapp' }
    ];
    s.players[0].knowledge = 0; // < 2 -> knapp
    s.players[0].deck = ['rekrut'];
    onRoundStartAbilities(s);
    expect(s.players[0].knowledge).toBe(2);
    expect(s.players[0].hand).toEqual([]);
  });

  it('wachstum.maxTriggers: löst höchstens so oft aus (spielweiter Zähler)', () => {
    const s = emptyState();
    const c = put(s, 0, 0, 'ritter');
    c.abilities = [{ kind: 'wachstum', per_round: { atk: 0, hp: 1 }, maxTriggers: 2 }];
    onRoundStartAbilities(s);
    onRoundStartAbilities(s);
    onRoundStartAbilities(s); // sollte nicht mehr triggern
    expect(c.permHealthBonus).toBe(2);
  });

  it('verstaerker.firstOnlyPerRound: nur der erste Wachstumstrigger einer Runde wird verstärkt; Reset erst in endRound (I2)', () => {
    const s = emptyState();
    const wachser1 = put(s, 0, 0, 'ritter');
    wachser1.abilities = [{ kind: 'wachstum', per_round: { atk: 0, hp: 1 } }];
    const wachser2 = put(s, 0, 1, 'rekrut');
    wachser2.abilities = [{ kind: 'wachstum', per_round: { atk: 0, hp: 1 } }];
    const verstaerker = put(s, 0, 2, 'wolf');
    verstaerker.abilities = [
      { kind: 'verstaerker', ziel: 'wachstum', scope: 'any', faktor: 2, firstOnlyPerRound: true }
    ];

    onRoundStartAbilities(s);
    expect(wachser1.permHealthBonus).toBe(2); // erster Trigger dieser Runde -> verdoppelt
    expect(wachser2.permHealthBonus).toBe(1); // zweiter Trigger -> kein Verstärker mehr

    // Ohne endRound bleibt rundenZaehler gesetzt -> derselbe Effekt wie eben.
    onRoundStartAbilities(s);
    expect(wachser1.permHealthBonus).toBe(3);
    expect(wachser2.permHealthBonus).toBe(2);

    // endRound leert rundenZaehler -> in der neuen Runde greift der Verstärker wieder beim ersten Trigger.
    const after = passBoth(s);
    expect(after.board[0][0]?.permHealthBonus).toBe(5);
    expect(after.board[0][1]?.permHealthBonus).toBe(3);
  });

  it('tempHealthBonus fließt in getMaxHealth ein und wird in endRound zurückgesetzt', () => {
    const s = emptyState();
    const c = put(s, 0, 0, 'ritter'); // 4/5
    expect(getMaxHealth(s, 0, 0)).toBe(5);
    c.tempHealthBonus = 3;
    recalcBoard(s);
    expect(getMaxHealth(s, 0, 0)).toBe(8);
    const after = passBoth(s);
    expect(after.board[0][0]?.tempHealthBonus).toBe(0);
  });

  it('Zermürbung: ab config.zermuerbung.abRunde verlieren beide Basen am Rundenende Leben', () => {
    const s = emptyState();
    const z = data.config.zermuerbung!;
    s.round = z.abRunde;
    const after = passBoth(s);
    expect(after.players[0].base).toBe(data.config.baseHealth - z.schaden);
    expect(after.players[1].base).toBe(data.config.baseHealth - z.schaden);
  });

  it('I1: Klasse-A-Hooks schreiben nie in zaehler (sonst nicht-idempotente recalcBoard-Fixpunktschleife)', () => {
    const s = emptyState();
    const c = put(s, 0, 0, 'ritter');
    c.abilities = [{ kind: 'bedingt', scope: 'any', mindestAnzahl: 0, bonus: { atk: 1, hp: 1 } }];
    put(s, 0, 1, 'rekrut');
    recalcBoard(s);
    recalcBoard(s);
    recalcBoard(s);
    expect(c.zaehler).toEqual({});
  });
});

describe('Schadensübernahme: der Nachbar opfert sich', () => {
  /** Streikposten (nachbar/schadensuebernahme, same_top) neben einem sterbenden Menschen. */
  function stellung(opferLane: number, beschuetzerLane: number) {
    const s = emptyState();
    const opfer = put(s, 0, opferLane, 'rekrut'); // 2/1
    const beschuetzer = put(s, 0, beschuetzerLane, 'streikposten'); // 2/3
    return { s, opfer, beschuetzer };
  }

  it('rettet den Nachbarn auf 1 Leben und geht dabei selbst auf 0', () => {
    const { s, opfer, beschuetzer } = stellung(1, 2);
    opfer.currentHealth = -3; // tödlicher Treffer
    recalcBoard(s);
    expect(s.board[0][1]).toBe(opfer);
    expect(opfer.currentHealth).toBe(1);
    expect(beschuetzer.schutzUsed).toBe(true);
    expect(s.board[0][2]).toBeNull(); // hat sich geopfert
  });

  it('greift nur einmal pro Spiel', () => {
    const { s, opfer, beschuetzer } = stellung(1, 2);
    beschuetzer.schutzUsed = true;
    opfer.currentHealth = 0;
    recalcBoard(s);
    expect(s.board[0][1]).toBeNull(); // niemand fängt den Treffer ab
    expect(s.board[0][2]).toBe(beschuetzer); // der Beschützer lebt weiter
  });

  it('wirkt nur auf direkte Nachbarn, nicht über eine Lane hinweg', () => {
    const { s, opfer, beschuetzer } = stellung(0, 2); // Lane 0 und 2 sind keine Nachbarn
    opfer.currentHealth = 0;
    recalcBoard(s);
    expect(s.board[0][0]).toBeNull();
    expect(beschuetzer.schutzUsed).toBe(false);
  });

  it('wirkt nicht über den scope hinaus (same_top: kein Tier)', () => {
    const s = emptyState();
    const tier = put(s, 1, 1, 'wolf');
    put(s, 1, 2, 'streikposten'); // steht hier bei den Tieren, scope same_top passt nicht
    tier.currentHealth = 0;
    recalcBoard(s);
    expect(s.board[1][1]).toBeNull();
    expect(s.board[1][2]?.schutzUsed).toBe(false);
  });

  it('die Rettung geht der Schadensübernahme vor', () => {
    const s = emptyState();
    const opfer = put(s, 0, 1, 'der_alte_hund'); // rettung
    const beschuetzer = put(s, 0, 2, 'streikposten');
    opfer.currentHealth = 0;
    recalcBoard(s);
    expect(opfer.rettungUsed).toBe(true);
    expect(beschuetzer.schutzUsed).toBe(false); // musste nicht einspringen
    expect(s.board[0][2]).toBe(beschuetzer);
  });
});

describe('Bisher ungetestete Primitive', () => {
  it('werkzeug gibt genau einer anderen Karte gleicher Sub-Fraktion +ATK', () => {
    const s = emptyState();
    put(s, 0, 1, 'werkzeugkiste'); // werkzeug +2, arbeiter
    const lehrling = put(s, 0, 0, 'lehrling'); // arbeiter, 2 ATK
    const rekrut = put(s, 0, 2, 'rekrut'); // humans, andere Sub-Fraktion
    recalcBoard(s);
    expect(getEffectiveAttack(s, 0, 0)).toBe(lehrling.baseAttack + 2);
    expect(getEffectiveAttack(s, 0, 2)).toBe(rekrut.baseAttack); // kein zweites Ziel
  });

  it('werkzeug springt weiter, wenn das bisherige Ziel stirbt', () => {
    const s = emptyState();
    put(s, 0, 1, 'werkzeugkiste');
    const ersterEmpfaenger = put(s, 0, 0, 'lehrling');
    put(s, 0, 2, 'fliessbandarbeiter'); // ebenfalls arbeiter, höhere Lane
    recalcBoard(s);
    expect(getEffectiveAttack(s, 0, 0)).toBe(4); // niedrigste Lane gewinnt
    expect(getEffectiveAttack(s, 0, 2)).toBe(3);

    ersterEmpfaenger.currentHealth = 0;
    recalcBoard(s);
    expect(s.board[0][0]).toBeNull();
    expect(getEffectiveAttack(s, 0, 2)).toBe(5); // Bonus wandert weiter
  });

  it('improvisation (Modus schwelle) schaltet erst unter der Basis-Schwelle frei', () => {
    const s = emptyState();
    put(s, 0, 1, 'improvisiertes_lager'); // Schwelle 7
    const rekrut = put(s, 0, 0, 'rekrut');
    recalcBoard(s);
    expect(getEffectiveAttack(s, 0, 0)).toBe(rekrut.baseAttack); // Basis 15 > 7

    s.players[0].base = 7;
    recalcBoard(s);
    expect(getEffectiveAttack(s, 0, 0)).toBe(rekrut.baseAttack + 1);
  });

  it('improvisation (Modus pro_fehlende_hp) skaliert mit fehlenden Basis-HP und ist gedeckelt', () => {
    const s = emptyState();
    const meute = put(s, 0, 0, 'meute_der_vergessenen'); // +1/+1 je 4 fehlende HP, cap 2
    recalcBoard(s);
    expect(getEffectiveAttack(s, 0, 0)).toBe(meute.baseAttack);

    s.players[0].base = data.config.baseHealth - 4;
    recalcBoard(s);
    expect(getEffectiveAttack(s, 0, 0)).toBe(meute.baseAttack + 1);

    s.players[0].base = 0; // 15 fehlende HP → 3 Stufen, aber cap 2
    recalcBoard(s);
    expect(getEffectiveAttack(s, 0, 0)).toBe(meute.baseAttack + 2);
  });

  it('entwaffnen entfernt die konfigurierten Keywords beim Ausspielen', () => {
    const s = emptyState();
    put(s, 1, 0, 'spatz'); // fliegend + flink
    s.players[0].hand = ['eule'];
    const nach = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(nach.board[1][0]!.keywords).not.toContain('fliegend');
    expect(nach.board[1][0]!.keywords).not.toContain('flink');
    expect(nach.board[0][0]!.keywords).toContain('fliegend'); // die Eule selbst behält es
  });

  it('experiment verbraucht Wissen und wandelt es in dauerhafte Werte', () => {
    const s = emptyState();
    s.players[0].knowledge = 5;
    s.players[0].hand = ['doktorandin']; // proMarker +1/+1, max 3
    const nach = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    const dok = nach.board[0][0]!;
    expect(dok.permAttackBonus).toBe(3); // max 3 Marker
    expect(dok.permHealthBonus).toBe(3);
    expect(nach.players[0].knowledge).toBe(2); // Rest bleibt liegen
  });

  it('experiment ohne Wissen bleibt wirkungslos', () => {
    const s = emptyState();
    s.players[0].knowledge = 0;
    s.players[0].hand = ['doktorandin'];
    const nach = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(nach.board[0][0]!.permAttackBonus).toBe(0);
  });

  it('beschwoeren beim Ausspielen läuft ins Leere, wenn keine Lane frei ist', () => {
    const s = emptyState();
    put(s, 0, 0, 'rekrut');
    put(s, 0, 2, 'rekrut');
    s.players[0].hand = ['katzenmutter'];
    // Lane 1 ist das einzige freie Feld – dorthin kommt die Katzenmutter selbst.
    const nach = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 1 }, data);
    expect(nach.board[0].filter((c) => c?.isToken)).toHaveLength(0);
    expect(nach.board[0][1]?.cardId).toBe('katzenmutter');
  });

  it('verstaerker ohne firstOnlyPerRound verdoppelt jedes Wachstum der Runde', () => {
    const s = emptyState();
    const verstaerker = put(s, 0, 0, 'betriebsrat');
    verstaerker.abilities = [
      { kind: 'verstaerker', ziel: 'wachstum', scope: 'same_sub', faktor: 2, firstOnlyPerRound: false }
    ];
    const a = put(s, 0, 1, 'lehrling'); // wachstum +0/+1
    const b = put(s, 0, 2, 'fliessbandarbeiter'); // wachstum +1/+0
    onRoundStartAbilities(s);
    // Beide Arbeiter wachsen doppelt, nicht nur der erste der Runde.
    expect(a.permHealthBonus).toBe(2);
    expect(b.permAttackBonus).toBe(2);
  });

  it('verstaerker mit firstOnlyPerRound verstärkt nur den ersten Wachstumstrigger', () => {
    const s = emptyState();
    put(s, 0, 0, 'betriebsrat'); // firstOnlyPerRound: true (Kartenwert)
    const a = put(s, 0, 1, 'lehrling');
    const b = put(s, 0, 2, 'fliessbandarbeiter');
    onRoundStartAbilities(s);
    expect(a.permHealthBonus).toBe(2); // verdoppelt
    expect(b.permAttackBonus).toBe(1); // einfach
  });
});

describe('Aktionskarten-Effekte (effects.ts)', () => {
  /** Spielt eine Aktionskarte aus Spieler 0s Hand. */
  function spieleAktion(s: GameState, cardId: string, targetLane?: number, toLane?: number) {
    s.players[0].hand = [cardId];
    return applyAction(s, 0, { type: 'playAction', handIndex: 0, targetLane, toLane }, data);
  }

  it('buffHealth braucht eine eigene Kreatur als Ziel', () => {
    const s = emptyState();
    expect(() => spieleAktion(s, 'schildwall', 0)).toThrow(/keine eigene Kreatur/);
    expect(() => spieleAktion(s, 'schildwall', undefined)).toThrow(/eigene Kreatur als Ziel/);
    expect(() => spieleAktion(s, 'schildwall', 99)).toThrow(/eigene Kreatur als Ziel/);
  });

  it('buffHealth hebt Maximum und aktuelles Leben und meldet ein spell-Ereignis', () => {
    const s = emptyState();
    put(s, 0, 1, 'rekrut'); // 2/1
    const nach = spieleAktion(s, 'schildwall', 1);
    expect(nach.board[0][1]!.permHealthBonus).toBe(3);
    expect(getMaxHealth(nach, 0, 1)).toBe(4);
    expect(nach.board[0][1]!.currentHealth).toBe(4);
    expect(nach.log.at(-1)?.event).toMatchObject({ kind: 'spell', lane: 1, effect: 'buff' });
  });

  it('moveCreature lehnt besetzte und identische Ziel-Lanes mit je eigener Meldung ab', () => {
    const s = emptyState();
    put(s, 0, 0, 'wolf');
    put(s, 0, 1, 'ratte');
    expect(() => spieleAktion(s, 'hetzjagd', 0, 1)).toThrow(/Ziel-Lane ist nicht frei/);
    expect(() => spieleAktion(s, 'hetzjagd', 0, undefined)).toThrow(/Ziel-Lane wählen/);
    expect(() => spieleAktion(s, 'hetzjagd', 0, 0)).toThrow(/steht schon in dieser Lane/);
  });

  it('moveCreature versetzt die Kreatur und gibt den temporären Bonus', () => {
    const s = emptyState();
    put(s, 0, 0, 'wolf');
    const nach = spieleAktion(s, 'hetzjagd', 0, 2);
    expect(nach.board[0][0]).toBeNull();
    expect(nach.board[0][2]?.cardId).toBe('wolf');
    expect(nach.board[0][2]?.tempAttackBonus).toBe(1);
    expect(nach.log.at(-1)?.event).toMatchObject({ kind: 'spell', lane: 2, effect: 'move' });
  });

  it('summon füllt nur die freien Lanes und wird bei vollem Brett abgelehnt', () => {
    const s = emptyState();
    put(s, 0, 0, 'rekrut');
    const nach = spieleAktion(s, 'mobilmachung', undefined); // 2 Token, 2 freie Lanes
    expect(nach.board[0].filter((c) => c?.isToken)).toHaveLength(2);
    expect(nach.log.filter((l) => l.event?.kind === 'spell')).toHaveLength(2);

    const voll = emptyState();
    for (let lane = 0; lane < data.config.lanes; lane++) put(voll, 0, lane, 'rekrut');
    expect(() => spieleAktion(voll, 'mobilmachung')).toThrow(/Keine freie Lane/);
  });

  it('debuff senkt den Angriff aller Gegner und niemals unter 0', () => {
    const s = emptyState();
    put(s, 1, 0, 'ratte'); // 2 ATK
    put(s, 1, 2, 'wolf');
    const nach = spieleAktion(s, 'generalstreik'); // −2 ATK
    expect(nach.board[1][0]!.tempAttackBonus).toBe(-2);
    expect(getEffectiveAttack(nach, 1, 0)).toBe(0); // nie negativ
    expect(nach.log.at(-1)?.event).toMatchObject({ kind: 'spell', effect: 'attackBuff' });
  });

  it('spendKnowledge verteilt Schaden reihum auf die gegnerischen Kreaturen', () => {
    const s = emptyState();
    s.players[0].knowledge = 2; // 2 Marker × 2 Schaden = 4
    put(s, 1, 0, 'schildkroete'); // 0/7
    put(s, 1, 1, 'gecko'); // 1/4
    const nach = spieleAktion(s, 'experimentelle_formel');
    expect(nach.players[0].knowledge).toBe(0);
    expect(nach.board[1][0]!.currentHealth).toBe(5); // 2 von 4 Treffern
    expect(nach.board[1][1]!.currentHealth).toBe(2);
  });

  it('spendKnowledge trifft die Basis, wenn der Gegner kein Brett hat', () => {
    const s = emptyState();
    s.players[0].knowledge = 3;
    const nach = spieleAktion(s, 'experimentelle_formel'); // 3 × 2 = 6
    expect(nach.players[1].base).toBe(data.config.baseHealth - 6);
  });

  it('spendKnowledge ohne Wissen ist ein Leerlauf (kostet aber die Karte)', () => {
    const s = emptyState();
    s.players[0].knowledge = 0;
    put(s, 1, 0, 'gecko');
    const nach = spieleAktion(s, 'experimentelle_formel');
    expect(nach.board[1][0]!.currentHealth).toBe(4);
    expect(nach.players[0].hand).toHaveLength(0);
  });
});

describe('buildClientView: die Grenze zur verdeckten Information', () => {
  function aufgebauterZustand(): GameState {
    const s = emptyState();
    s.players[0].hand = ['rekrut', 'schildwall'];
    s.players[1].hand = ['wolf', 'ratte', 'schlange'];
    s.players[0].deck = ['ritter', 'kommandantin'];
    s.players[1].deck = ['baer'];
    s.players[0].knowledge = 4;
    put(s, 0, 0, 'rekrut');
    put(s, 1, 1, 'adler');
    return s;
  }

  it('liefert die eigene Hand vollständig, die gegnerische nur als Anzahl', () => {
    const s = aufgebauterZustand();
    const sicht = buildClientView(s, 0, data);
    expect(sicht.hand.map((c) => c.id)).toEqual(['rekrut', 'schildwall']);
    expect(sicht.players[1].handCount).toBe(3);
    expect(sicht.players[1].deckCount).toBe(1);
    expect(JSON.stringify(sicht)).not.toContain('baer'); // gegnerisches Deck bleibt geheim
  });

  it('gibt weder knowledge noch stats noch die Deck-Listen heraus', () => {
    const s = aufgebauterZustand();
    aktiviereStatistik(s);
    const sicht = buildClientView(s, 0, data);
    expect(sicht).not.toHaveProperty('stats');
    expect(sicht.players[0]).not.toHaveProperty('knowledge');
    expect(sicht.players[0]).not.toHaveProperty('deck');
    expect(sicht.players[0]).not.toHaveProperty('hand');
    expect(JSON.stringify(sicht)).not.toContain('knowledge');
  });

  it('meldet Rundenenergie als energyCap und die Konfiguration des Bretts', () => {
    const s = aufgebauterZustand();
    s.round = 4;
    const sicht = buildClientView(s, 1, data);
    expect(sicht.you).toBe(1);
    expect(sicht.energyCap).toBe(roundEnergy(data.config, 4));
    expect(sicht.lanes).toBe(data.config.lanes);
    expect(sicht.roundLimit).toBe(data.config.roundLimit);
    expect(sicht.board[0]).toHaveLength(data.config.lanes);
  });

  it('reicht berechnete Kreaturenwerte durch, nicht die Rohwerte', () => {
    const s = emptyState();
    put(s, 0, 0, 'schildwache'); // nachbar/schild +1 Leben
    const rekrut = put(s, 0, 1, 'rekrut');
    recalcBoard(s);
    const ansicht = buildClientView(s, 0, data).board[0][1]!;
    expect(ansicht.baseMaxHealth).toBe(rekrut.baseMaxHealth);
    expect(ansicht.maxHealth).toBe(getMaxHealth(s, 0, 1));
    expect(ansicht.attack).toBe(getEffectiveAttack(s, 0, 1));
    expect(ansicht.uid).toBe(rekrut.uid);
  });

  it('kappt das Log auf die letzten 60 Einträge', () => {
    const s = emptyState();
    for (let i = 0; i < 80; i++) s.log.push({ id: i, round: 1, text: `Eintrag ${i}` });
    const sicht = buildClientView(s, 0, data);
    expect(sicht.log).toHaveLength(60);
    expect(sicht.log[0].text).toBe('Eintrag 20');
    expect(sicht.log.at(-1)?.text).toBe('Eintrag 79');
  });
});

describe('Die drei Wege zum Spielende', () => {
  it('zerstörte Basis: der andere Spieler gewinnt', () => {
    const s = emptyState();
    s.players[1].base = 1;
    put(s, 0, 0, 'ritter'); // 4 ATK auf eine leere Lane
    const nach = passBoth(s);
    expect(nach.phase).toBe('ended');
    expect(nach.winner).toBe(0);
  });

  it('der Kampf bricht ab, sobald eine Basis fällt – spätere Lanes schlagen nicht mehr zu', () => {
    const s = emptyState();
    s.players[1].base = 1;
    put(s, 0, 0, 'ritter'); // Lane 0 zuerst: beendet die Partie
    put(s, 1, 1, 'baer'); // Lane 1 käme danach – kommt nicht mehr dran
    const nach = passBoth(s);
    expect(nach.phase).toBe('ended');
    expect(nach.winner).toBe(0);
    expect(nach.players[0].base).toBe(data.config.baseHealth); // unangetastet
  });

  it('beide Basen gleichzeitig auf 0 (Zermürbung): Unentschieden', () => {
    const s = emptyState();
    const z = data.config.zermuerbung!;
    s.round = z.abRunde;
    // Die Zermürbung trifft beide Basen im selben Schritt.
    s.players[0].base = z.schaden;
    s.players[1].base = z.schaden;
    const nach = passBoth(s);
    expect(nach.phase).toBe('ended');
    expect(nach.winner).toBe('draw');
    expect(nach.log.some((l) => l.text.includes('Beide Basen zerstört'))).toBe(true);
  });

  it('Zermürbung beendet eine sonst festgefahrene Partie', () => {
    const s = emptyState();
    const z = data.config.zermuerbung!;
    s.round = z.abRunde;
    s.players[0].base = z.schaden; // genau tödlich
    s.players[1].base = 10;
    const nach = passBoth(s);
    expect(nach.phase).toBe('ended');
    expect(nach.winner).toBe(1);
    expect(nach.log.some((l) => l.text.includes('Zermürbung'))).toBe(true);
  });

  it('Rundenlimit: die höhere Basis gewinnt', () => {
    const s = emptyState();
    s.round = data.config.roundLimit;
    s.config = { ...data.config, zermuerbung: undefined }; // sonst greift vorher die Zermürbung
    s.players[0].base = 9;
    s.players[1].base = 4;
    const nach = passBoth(s);
    expect(nach.phase).toBe('ended');
    expect(nach.winner).toBe(0);
    expect(nach.log.some((l) => l.text.includes('Rundenlimit erreicht'))).toBe(true);
  });

  it('Rundenlimit bei Gleichstand: Unentschieden', () => {
    const s = emptyState();
    s.round = data.config.roundLimit;
    s.config = { ...data.config, zermuerbung: undefined };
    const nach = passBoth(s);
    expect(nach.phase).toBe('ended');
    expect(nach.winner).toBe('draw');
  });
});

describe('Cheerleader-Superkräfte: noch offener Vertrag', () => {
  // Umgesetzt sind Auswahl, drei stabile Bankplätze und der öffentliche Typ
  // CheerleaderSacrificeEvent. Die eigentliche Opfer-Mechanik fehlt noch;
  // die offenen Punkte stehen in docs/Arena_Cheerleader_Erweiterung.md §3/§4.

  it('heute erzeugt die Engine kein cheerleaderSacrifice-Ereignis', () => {
    const s = emptyState();
    put(s, 0, 0, 'ritter');
    put(s, 1, 0, 'wolf');
    const nach = passBoth(s);
    expect(nach.log.some((l) => l.event?.kind === 'cheerleaderSacrifice')).toBe(false);
    expect(nach.players[0].cheerleaders).toEqual(s.players[0].cheerleaders);
  });

  it('die Bankplätze sind öffentlich und stehen in beiden Client-Sichten', () => {
    const s = emptyState();
    for (const ich of [0, 1] as PlayerIndex[]) {
      const sicht = buildClientView(s, ich, data);
      expect(sicht.players[0].cheerleaders).toEqual(s.players[0].cheerleaders);
      expect(sicht.players[1].cheerleaders).toEqual(s.players[1].cheerleaders);
    }
  });

  it.todo('PlayerAction sacrificeCheerleader mit Slot 0|1|2 wird angenommen');
  it.todo('ein leerer Bankplatz kann nicht geopfert werden');
  it.todo('nur der Besitzer darf seinen eigenen Bankplatz opfern');
  it.todo('der geopferte Slot wird stabil auf null gesetzt');
  it.todo('das CheerleaderSacrificeEvent steht im Log VOR der Wirkung der Superkraft');
  it.todo('nach dem Opfer werden Todesfälle, Folgetrigger und zerstörte Basen geprüft');
});
