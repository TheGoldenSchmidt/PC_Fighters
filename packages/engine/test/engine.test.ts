import { describe, expect, it } from 'vitest';
import {
  applyAction,
  buildDeck,
  buildFactionTree,
  createGame,
  getEffectiveAttack,
  getMaxHealth,
  loadGameData,
  matchesScope,
  topOf,
  validateGameData
} from '../src/index.js';
import { recalcBoard } from '../src/internal.js';
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
    flyDone: false
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
    schutzUsed: false
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

describe('Keyword gift', () => {
  it('tötet das Ziel sofort, auch wenn es mehr Leben hat', () => {
    const s = emptyState();
    put(s, 1, 0, 'schlange'); // 1/1, gift
    put(s, 0, 0, 'baer'); // 4/5
    const after = passBoth(s);
    // Schlange macht 1 Schaden → Gift tötet den Bären; Bär tötet die Schlange gleichzeitig.
    expect(after.board[0][0]).toBeNull();
    expect(after.board[1][0]).toBeNull();
  });

  it('wirkt nicht, wenn die Schlange erschöpft ist (kein Angriff)', () => {
    const s = emptyState();
    put(s, 1, 0, 'schlange', { exhausted: true });
    put(s, 0, 0, 'baer');
    const after = passBoth(s);
    expect(after.board[0][0]?.currentHealth).toBe(5); // Bär unversehrt? Nein –
    // Bär greift die erschöpfte Schlange an (sie verteidigt) und tötet sie:
    expect(after.board[1][0]).toBeNull();
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
    expect(deck).toHaveLength(data.config.deckSize);
    // Alle Karten gehören zur Oberfraktion "humans" (inkl. Sub-Fraktionen).
    for (const id of deck) {
      expect(topOf(tree, data.cardsById[id].faction)).toBe('humans');
    }
    // Keine Karte öfter als maxCopies; Signaturkarten höchstens einmal.
    const counts = new Map<string, number>();
    for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, n] of counts) {
      const max = data.cardsById[id].signature ? 1 : data.config.maxCopiesPerCard;
      expect(n).toBeLessThanOrEqual(max);
    }
  });

  it('createGame: Starthand, Basisleben und Runde 1 mit 1 Energie', () => {
    const g = createGame(data, ['humans', 'animals'], () => 0.42);
    expect(g.round).toBe(1);
    expect(g.players[0].hand).toHaveLength(data.config.startingHand);
    expect(g.players[0].base).toBe(data.config.baseHealth);
    expect(g.players[0].energy).toBe(1);
    expect(g.players[0].deck).toHaveLength(data.config.deckSize - data.config.startingHand);
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
