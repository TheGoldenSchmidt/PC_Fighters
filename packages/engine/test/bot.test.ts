// Tests für den Legal-Move-Generator (legal.ts) und den Heuristik-Bot (bot.ts).

import { describe, expect, it } from 'vitest';
import {
  applyAction,
  BOT_PROFILE,
  bewerteZustand,
  buildFactionTree,
  createGame,
  createSeededRandom,
  legaleAktionen,
  loadGameData,
  waehleAktion
} from '../src/index.js';
import { recalcBoard } from '../src/internal.js';
import type { Creature, CreatureCard, GameData, GameState, PlayerIndex, PlayerState } from '../src/types.js';

const data: GameData = loadGameData();

function player(faction: string): PlayerState {
  return {
    faction,
    cheerleaders: ['pc_principal', 'pc_babies', 'alter_wissenschaftler'],
    deck: [],
    hand: [],
    base: data.config.baseHealth,
    energy: 10,
    knowledge: 0,
    flyDone: false,
    mulliganDone: false,
    schild: 0,
    basisImmun: false,
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
    uidCounter: 0,
    // Fester Seed: macht die Schild-Zufallszahlen im Test reproduzierbar.
    rngState: 1,
    aufloesung: [],
    reaktion: null,
    naechsteReaktionsId: 1
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

describe('legaleAktionen', () => {
  it('generiert playCreature nur für bezahlbare Karten auf freie Lanes, plus pass', () => {
    const s = emptyState();
    put(s, 0, 0, 'ritter');
    s.players[0].hand = ['rekrut']; // 1 Energie, 10 vorhanden
    const aktionen = legaleAktionen(s, 0, data);
    const creatureAktionen = aktionen.filter((a) => a.type === 'playCreature');
    expect(creatureAktionen).toHaveLength(data.config.lanes - 1); // Lane 0 ist belegt
    expect(aktionen.some((a) => a.type === 'pass')).toBe(true);
  });

  it('lässt zu teure Karten aus', () => {
    const s = emptyState();
    s.players[0].hand = ['brachiosaurus']; // Kosten 7
    s.players[0].energy = 1;
    const aktionen = legaleAktionen(s, 0, data);
    expect(aktionen.filter((a) => a.type === 'playCreature')).toHaveLength(0);
    expect(aktionen).toEqual([{ type: 'pass' }]);
  });

  it('generiert für moveCreature alle besetzte→freie Lane-Kombinationen', () => {
    const s = emptyState();
    put(s, 0, 0, 'ritter');
    s.players[0].hand = ['hetzjagd']; // moveCreature, Kosten 1
    const aktionen = legaleAktionen(s, 0, data);
    const zuege = aktionen.filter((a) => a.type === 'playAction');
    expect(zuege).toHaveLength(data.config.lanes - 1); // von Lane 0 zu jeder freien Lane
  });

  it('lässt eine nicht spielbare Aktionskarte aus (kein eigenes Ziel vorhanden)', () => {
    const s = emptyState();
    s.players[0].hand = ['schildwall']; // buffHealth, braucht eine eigene Kreatur
    const aktionen = legaleAktionen(s, 0, data);
    expect(aktionen).toEqual([{ type: 'pass' }]);
  });

  it('jede generierte Aktion wird von applyAction akzeptiert (Property-Test über mehrere volle Partien)', () => {
    for (let seed = 0; seed < 8; seed++) {
      const random = createSeededRandom(seed * 1000 + 1);
      let s = createGame(data, ['humans', 'animals'], random);
      let steps = 0;
      while (s.phase !== 'ended' && steps < 500) {
        const kandidaten = legaleAktionen(s, s.active, data);
        expect(kandidaten.length).toBeGreaterThan(0);
        for (const kandidat of kandidaten) {
          // Wirft GameRuleError, wenn legaleAktionen() eine ungültige Aktion
          // generiert hätte - das ist der eigentliche Test.
          expect(() => applyAction(s, s.active, kandidat, data)).not.toThrow();
        }
        const gewaehlt = waehleAktion(s, s.active, data, BOT_PROFILE.ausgewogen, random);
        s = applyAction(s, s.active, gewaehlt, data);
        steps++;
      }
      // Smoke-Test: die Partie terminiert (Rundenlimit oder Basis zerstört),
      // nie über das Rundenlimit hinaus.
      expect(s.phase).toBe('ended');
      expect(s.winner).not.toBeNull();
      expect(s.round).toBeLessThanOrEqual(data.config.roundLimit);
    }
  });
});

describe('bewerteZustand', () => {
  it('Sieg/Niederlage/Unentschieden dominieren jede andere Bewertung', () => {
    const s = emptyState();
    s.phase = 'ended';
    s.winner = 0;
    expect(bewerteZustand(s, 0, BOT_PROFILE.ausgewogen)).toBeGreaterThan(1e8);
    expect(bewerteZustand(s, 1, BOT_PROFILE.ausgewogen)).toBeLessThan(-1e8);

    s.winner = 'draw';
    expect(bewerteZustand(s, 0, BOT_PROFILE.ausgewogen)).toBe(0);
  });

  it('höhere eigene Basis-HP werten strikt besser (bei sonst gleichem Zustand)', () => {
    const schwach = emptyState();
    const stark = emptyState();
    stark.players[0].base = schwach.players[0].base + 5;
    expect(bewerteZustand(stark, 0, BOT_PROFILE.ausgewogen)).toBeGreaterThan(
      bewerteZustand(schwach, 0, BOT_PROFILE.ausgewogen)
    );
  });

  // Ohne diese drei Faelle war der Bot blind fuer die halbe Schild-Mechanik:
  // „Sicherer Raum" sah aus wie ein verschenkter Bankplatz, und ein fast
  // voller Schild war ihm nichts wert.
  it('Basis-Immunitaet wertet besser als keine', () => {
    const ohne = emptyState();
    const mit = emptyState();
    mit.players[0].basisImmun = true;
    expect(bewerteZustand(mit, 0, BOT_PROFILE.ausgewogen)).toBeGreaterThan(
      bewerteZustand(ohne, 0, BOT_PROFILE.ausgewogen)
    );
  });

  it('ein weiter geladener Schild wertet besser', () => {
    const leer = emptyState();
    const geladen = emptyState();
    geladen.players[0].schild = data.config.schild!.abschnitte - 1;
    expect(bewerteZustand(geladen, 0, BOT_PROFILE.ausgewogen)).toBeGreaterThan(
      bewerteZustand(leer, 0, BOT_PROFILE.ausgewogen)
    );
  });

  it('bei leerer Bank ist die Schildladung wertlos - es gibt dann keinen Schild', () => {
    const leer = emptyState();
    const geladen = emptyState();
    for (const s of [leer, geladen]) s.players[0].cheerleaders = [null, null, null];
    geladen.players[0].schild = data.config.schild!.abschnitte - 1;
    expect(bewerteZustand(geladen, 0, BOT_PROFILE.ausgewogen)).toBe(
      bewerteZustand(leer, 0, BOT_PROFILE.ausgewogen)
    );
  });
});

describe('waehleAktion: Policy-Verhalten', () => {
  it('nimmt eine sofort verfügbare Lethal-Aktion (Experimentelle Formel auf die leere Basis)', () => {
    const s = emptyState();
    // experimentelle_formel: spendKnowledge, gegnerisches Feld ist leer -> trifft die Basis.
    s.players[0].hand = ['rekrut', 'experimentelle_formel'];
    s.players[0].knowledge = 2;
    s.players[1].base = 2;
    const gewaehlt = waehleAktion(s, 0, data, BOT_PROFILE.ausgewogen, createSeededRandom(1));
    const folge = applyAction(s, 0, gewaehlt, data);
    expect(folge.phase).toBe('ended');
    expect(folge.winner).toBe(0);
  });

  it('blockt eine unbeantwortete gegnerische Bedrohung statt zu passen', () => {
    const s = emptyState();
    put(s, 1, 0, 'wolf'); // 3/2, unopponiert
    s.players[0].hand = ['ritter']; // 4/4 - gewinnt den Tausch klar
    const gewaehlt = waehleAktion(s, 0, data, BOT_PROFILE.ausgewogen, createSeededRandom(2));
    expect(gewaehlt.type).toBe('playCreature');
  });

  it('verheizt eine wertvolle Kreatur nicht in einem klar schlechten Tausch, wenn eine sichere Lane frei ist', () => {
    const s = emptyState();
    put(s, 1, 0, 'tyrannosaurus_rex'); // 6/5, unopponiert
    s.players[0].hand = ['ratte', 'ritter']; // Ritter würde gegen den T-Rex sterben, ohne ihn zu töten
    const gewaehlt = waehleAktion(s, 0, data, BOT_PROFILE.ausgewogen, createSeededRandom(5));
    // Der Ritter darf nicht in Lane 0 (gegen den T-Rex) geopfert werden.
    expect(gewaehlt).not.toEqual({ type: 'playCreature', handIndex: 1, lane: 0 });
  });

  it('passt, wenn keine Karte bezahlbar ist', () => {
    const s = emptyState();
    s.players[0].hand = ['brachiosaurus']; // Kosten 7
    s.players[0].energy = 1;
    const gewaehlt = waehleAktion(s, 0, data, BOT_PROFILE.ausgewogen, createSeededRandom(4));
    expect(gewaehlt).toEqual({ type: 'pass' });
  });

  it('Zufalls-Profil ignoriert die Bewertung und wählt aus allen legalen Zügen', () => {
    const s = emptyState();
    s.players[0].hand = ['rekrut'];
    const gewaehlt = waehleAktion(s, 0, data, BOT_PROFILE.zufall, createSeededRandom(9));
    const legal = legaleAktionen(s, 0, data);
    expect(legal).toContainEqual(gewaehlt);
  });
});
