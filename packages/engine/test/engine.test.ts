import { describe, expect, it } from 'vitest';
import {
  applyAction,
  buildDeck,
  buildFactionTree,
  createGame,
  createSeededRandom,
  getEffectiveAttack,
  getMaxHealth,
  loadGameData,
  matchesScope,
  roundEnergy,
  topOf,
  validateDeck,
  validateGameData
} from '../src/index.js';
import { recalcBoard } from '../src/internal.js';
import { applyShedding, onPlayAbilities, onRoundStartAbilities } from '../src/abilities.js';
import type {
  Creature,
  CreatureCard,
  GameData,
  GameState,
  PlayerIndex,
  PlayerState
} from '../src/types.js';

const data: GameData = loadGameData();

function player(faction: string): PlayerState {
  return {
    faction,
    deck: [],
    hand: [],
    base: data.config.baseHealth,
    energy: 10,
    knowledge: 0,
    flyDone: false,
    gespieltDieseRunde: []
  };
}

/** Leerer Testzustand: Runde 1, Ausspielphase, Spieler 0 am Zug. */
function emptyState(): GameState {
  return {
    config: data.config,
    factionTree: buildFactionTree(data.factions),
    round: 1,
    phase: 'play',
    startingPlayer: 0,
    active: 0,
    consecutivePasses: 0,
    players: [player('humans'), player('animals')],
    board: [
      Array.from({ length: data.config.lanes }, () => null),
      Array.from({ length: data.config.lanes }, () => null)
    ],
    log: [],
    winner: null,
    uidCounter: 0
  };
}

/** Stellt eine Kreatur direkt aufs Feld (Standard: kampfbereit). */
function put(
  state: GameState,
  owner: PlayerIndex,
  lane: number,
  cardId: string,
  opts: { exhausted?: boolean } = {}
): Creature {
  const card = data.cardsById[cardId] as CreatureCard;
  state.uidCounter += 1;
  const c: Creature = {
    uid: state.uidCounter,
    cardId,
    name: card.name,
    faction: card.faction,
    keywords: card.keywords,
    abilities: (card.abilities ?? []).map((a) => ({ ...a })),
    baseAttack: card.attack,
    baseMaxHealth: card.health,
    permHealthBonus: 0,
    permAttackBonus: 0,
    tempAttackBonus: 0,
    tempHealthBonus: 0,
    currentHealth: card.health,
    lastMaxHealth: card.health,
    exhausted: opts.exhausted ?? false,
    movedThisFlyPhase: false,
    isToken: false,
    poison: 0,
    attackedThisRound: false,
    spawnRound: state.round,
    ueberstundenDone: false,
    rettungUsed: false,
    schutzUsed: false,
    zaehler: {},
    rundenZaehler: {}
  };
  state.board[owner][lane] = c;
  recalcBoard(state);
  return c;
}

/** Beide Spieler passen → Kampfphase läuft, danach Rundenende/Flugphase. */
function passBoth(state: GameState): GameState {
  const afterFirst = applyAction(state, state.active, { type: 'pass' }, data);
  return applyAction(afterFirst, afterFirst.active, { type: 'pass' }, data);
}

describe('Kampflogik', () => {
  it('kampfbereite Kreaturen schaden sich gleichzeitig', () => {
    const s = emptyState();
    put(s, 0, 0, 'ritter'); // 4/4
    put(s, 1, 0, 'wolf'); // 3/2 (rudel inaktiv: allein)
    const after = passBoth(s);
    // Wolf (3 ATK) trifft Ritter → 4-3=1 Leben; Ritter (4 ATK) tötet Wolf.
    expect(after.board[1][0]).toBeNull();
    expect(after.board[0][0]?.currentHealth).toBe(1);
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
    expect(getEffectiveAttack(s, 1, 0)).toBe(3); // allein: kein Bonus
    put(s, 1, 2, 'ratte');
    expect(getEffectiveAttack(s, 1, 0)).toBe(4); // Rudel aktiv
    s.board[1][2] = null;
    expect(getEffectiveAttack(s, 1, 0)).toBe(3); // Bonus dynamisch weg
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
    const wache = put(s, 0, 0, 'schildwache'); // 1/3
    put(s, 0, 1, 'kommandantin'); // aura_alle: +1/+1 → Wache 2/4
    wache.currentHealth -= 1; // Wache auf 3/4
    s.board[0][1] = null; // Aura fällt weg → Maximum wieder 3
    recalcBoard(s);
    // aktuelles Leben (3) liegt nicht über dem neuen Maximum (3) → bleibt 3
    expect(s.board[0][0]?.currentHealth).toBe(3);
  });

  it('aura_alle (Kommandantin): +1/+1 für alle anderen Verbündeten', () => {
    const s = emptyState();
    put(s, 0, 0, 'rekrut'); // 2/1
    put(s, 0, 2, 'kommandantin'); // 3/5
    expect(getEffectiveAttack(s, 0, 0)).toBe(3);
    expect(getMaxHealth(s, 0, 0)).toBe(2);
    // Die Kommandantin bufft sich nicht selbst:
    expect(getEffectiveAttack(s, 0, 2)).toBe(3);
    expect(getMaxHealth(s, 0, 2)).toBe(5);
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

  it('createGame: Starthand, Basisleben und Runde 1 mit 1 Energie', () => {
    const g = createGame(data, ['humans', 'animals'], () => 0.42);
    expect(g.round).toBe(1);
    expect(g.players[0].hand).toHaveLength(data.config.startingHand);
    expect(g.players[0].base).toBe(data.config.baseHealth);
    expect(g.players[0].energy).toBe(1);
    expect(g.players[0].deck).toHaveLength(data.config.deckbuilding.size - data.config.startingHand);
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
    put(s, 0, 0, 'flugblatt_verteiler'); // 1/2, +1 ATK je weiterem Sozi (cap 3)
    expect(getEffectiveAttack(s, 0, 0)).toBe(1);
    put(s, 0, 1, 'solidaritaetskasse'); // Sozi
    put(s, 0, 2, 'basisdemokratie'); // Sozi
    expect(getEffectiveAttack(s, 0, 0)).toBe(3); // +2 (zwei weitere Sozis)
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
    put(s, 0, 0, 'basisdemokratie'); // 1/6, +1 ATK je Sozi inkl. sich selbst
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
    put(s, 0, 0, 'hauskater'); // 2/2, neugier +2 ATK solo
    expect(getEffectiveAttack(s, 0, 0)).toBe(4);
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
    put(s, 0, 0, 'ritter'); // 4/4, greift an
    put(s, 1, 0, 'gecko', { exhausted: true }); // 1/3 Dornen 1
    const after = passBoth(s);
    expect(after.board[1][0]).toBeNull(); // Gecko stirbt (4 Schaden)
    expect(after.board[0][0]?.currentHealth).toBe(3); // Ritter nimmt 1 Dornen-Schaden
  });

  it('gift: Marken machen selbst keinen Schaden, sammeln sich aber an (V2: Tod erst ab 3 Marken)', () => {
    const s = emptyState();
    put(s, 0, 0, 'klapperschlange'); // 2/3 Gift 2
    put(s, 1, 0, 'brachiosaurus', { exhausted: true }); // 6/9, wehrt sich nicht
    const after = passBoth(s);
    // Nur der Kampf-Treffer (2) mindert das Leben; Gift zählt Marken statt direkt zu schaden.
    expect(after.board[1][0]?.currentHealth).toBe(7);
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
    put(s, 0, 0, 'krokodil'); // 5/6, hinrichten ≤2 HP; greift Lane 0 an
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

  it('beschwoeren beim Ausspielen: Katzenmutter erzeugt zwei Kätzchen', () => {
    const s = emptyState();
    s.players[0].hand = ['katzenmutter'];
    const after = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(after.board[0].filter(Boolean)).toHaveLength(3); // Mutter + 2 Kätzchen
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
    put(s, 0, 0, 'schichtwechsel'); // 3/4, ueberstunden +2/+2
    s = passBoth(s);
    s = passBoth(s);
    s = passBoth(s);
    expect(getMaxHealth(s, 0, 0)).toBe(6); // 4 + 2, nicht +4
    expect(s.board[0][0]?.ueberstundenDone).toBe(true);
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

  it('Bugfix: Basisschaden aus einer onPlay-Fähigkeit beendet die Partie sofort in der Play-Phase', () => {
    // Vorher prüfte nur resolveCombat() checkBaseDestroyed; Basisschaden aus
    // onPlayAbilities (hier: experiment.schadenProMarker bei leerem Gegnerfeld)
    // konnte die Basis auf ≤0 senken, ohne dass die Partie endete.
    // (Sturzflug ist seit Phase 6/V2 auf denselben-Lane-Treffer beschränkt und
    // hat keinen Basis-Fallback mehr, kann diesen Fall also nicht mehr auslösen.)
    const s = emptyState();
    s.players[1].base = 3;
    s.players[0].knowledge = 3;
    s.players[0].hand = ['experimentelle_formel']; // schadenProMarker 1, gegnerisches Feld ist leer → Basis
    const after = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(after.players[1].base).toBe(0);
    expect(after.phase).toBe('ended');
    expect(after.winner).toBe(0);
  });

  it('Bugfix: kaltbluetig-Bonus kehrt in der Folgerunde zurück (attackedThisRound wird zurückgesetzt)', () => {
    const s = emptyState();
    put(s, 0, 0, 'koenig_der_kobras'); // 3/5, kaltbluetig +0/+2 solange nicht angegriffen
    expect(getMaxHealth(s, 0, 0)).toBe(7); // Bonus aktiv (noch nie angegriffen)
    put(s, 1, 0, 'streunerkatze', { exhausted: true }); // wehrt sich nicht, stirbt
    const after = passBoth(s); // Kobra greift an; Runde endet danach automatisch
    expect(after.board[1][0]).toBeNull();
    // Vorher blieb attackedThisRound für immer true → Bonus wäre dauerhaft weg.
    expect(getMaxHealth(after, 0, 0)).toBe(7);
  });

  it('Bugfix: mehrere gleichartige Abilities stapeln (getAbilities statt getAbility)', () => {
    const s = emptyState();
    put(s, 0, 0, 'ritter'); // 4/4, greift an
    const gecko = put(s, 1, 0, 'gecko', { exhausted: true }); // 1/3, Dornen 1
    gecko.abilities.push({ kind: 'dornen', x: 1 }); // zweite Dornen-Fähigkeit auf derselben Karte
    const after = passBoth(s);
    expect(after.board[1][0]).toBeNull(); // Gecko stirbt (4 Schaden)
    expect(after.board[0][0]?.currentHealth).toBe(2); // 4 − (1+1) Dornen statt nur 1
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
    expect(after.board[1][0]?.currentHealth).toBe(2); // 9 - (4 + 3 Hunter-Bonus)
  });

  it('hunter: kein Bonus gegen ein ungiftiges Ziel', () => {
    const s = emptyState();
    const jaeger = put(s, 0, 0, 'ritter'); // 4/4
    jaeger.abilities = [{ kind: 'hunter', bonusAtk: 3 }];
    put(s, 1, 0, 'brachiosaurus', { exhausted: true }); // 6/9, kein Gift
    const after = passBoth(s);
    expect(after.board[1][0]?.currentHealth).toBe(5); // 9 - 4, kein Bonus
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
    const c = put(s, 0, 0, 'ritter'); // 4/4
    expect(getMaxHealth(s, 0, 0)).toBe(4);
    c.tempHealthBonus = 3;
    recalcBoard(s);
    expect(getMaxHealth(s, 0, 0)).toBe(7);
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
