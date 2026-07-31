// Tests für den Telemetrie-Sidecar (stats.ts). Zwei Dinge werden geprüft:
// 1. Wirkungsfreiheit – aktivierte Statistik darf den Spielausgang NICHT ändern.
// 2. Exakte Zählerwerte auf konstruierten Brettern für die zentralen Mechaniken.

import { describe, expect, it } from 'vitest';
import {
  aktiviereStatistik,
  applyAction,
  buildFactionTree,
  buildClientView,
  createGame,
  createSeededRandom,
  ladeDecks,
  spielePartie,
  loadGameData
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

/** Stellt eine Kreatur direkt aufs Feld (Standard: kampfbereit, spawnRound = state.round). */
function put(
  state: GameState,
  owner: PlayerIndex,
  lane: number,
  cardId: string,
  opts: { exhausted?: boolean; spawnRound?: number } = {}
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
    spawnRound: opts.spawnRound ?? state.round,
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
  if (state.phase === 'mulligan') {
    state = applyAction(state, 0, { type: 'mulligan', handIndices: [] }, data);
    state = applyAction(state, 1, { type: 'mulligan', handIndices: [] }, data);
  }
  const afterFirst = applyAction(state, state.active, { type: 'pass' }, data);
  return applyAction(afterFirst, afterFirst.active, { type: 'pass' }, data);
}

describe('Telemetrie-Sidecar: Wirkungsfreiheit', () => {
  it('state.stats ist ohne aktiviereStatistik() undefined', () => {
    const s = emptyState();
    expect(s.stats).toBeUndefined();
  });

  it('buildClientView liefert stats nie aus, auch wenn aktiviert', () => {
    const s = emptyState();
    aktiviereStatistik(s);
    put(s, 0, 0, 'wolf');
    const view = buildClientView(s, 0, data) as unknown as Record<string, unknown>;
    expect('stats' in view).toBe(false);
  });

  it('dieselbe gesäte Partie hat mit/ohne aktivierte Statistik denselben Ausgang', () => {
    const bauePartie = (mitStatistik: boolean) => {
      const random = createSeededRandom(1234);
      let s = createGame(data, ['humans', 'animals'], random);
      if (mitStatistik) aktiviereStatistik(s);
      // 6 volle Runden (12x pass) reichen, um Kampf/Rundenende mehrfach durchzuspielen.
      for (let i = 0; i < 6 && s.phase !== 'ended'; i++) {
        s = passBoth(s);
      }
      return s;
    };
    const ohne = bauePartie(false);
    const mit = bauePartie(true);
    expect(mit.winner).toEqual(ohne.winner);
    expect(mit.round).toEqual(ohne.round);
    expect(mit.players[0].base).toEqual(ohne.players[0].base);
    expect(mit.players[1].base).toEqual(ohne.players[1].base);
    expect(mit.uidCounter).toEqual(ohne.uidCounter);
    // board-Vergleich ohne die (bei "mit" zusätzlich gesetzten) letzterSchaden-Felder,
    // die nur Telemetrie sind und keine Regelwirkung haben.
    const strip = (b: GameState['board']) =>
      b.map((row) => row.map((c) => (c ? { ...c, letzterSchaden: undefined } : null)));
    expect(strip(mit.board)).toEqual(strip(ohne.board));
  });
});

describe('Telemetrie-Sidecar: exakte Zählerwerte', () => {
  it('Wucht-Überschuss zählt als schadenBasis + wuchtSchaden, Dornen als dornenSchaden', () => {
    const s = emptyState();
    aktiviereStatistik(s);
    const kranfuehrer = put(s, 0, 0, 'kranfuehrer'); // 4/4, wucht
    kranfuehrer.spawnRound = 0; // nicht "flink" für diesen Test
    const gecko = put(s, 1, 0, 'gecko'); // 1/4, dornen 1
    gecko.spawnRound = 0;
    gecko.currentHealth = 3; // 1 HP vorgeschädigt, damit Wucht exakt 1 Überschuss erzeugt

    const next = passBoth(s);

    // gecko: 3 verbleibende HP, nimmt 4 Schaden -> stirbt, Überschuss 1 trifft die Basis.
    expect(next.stats!.proKarte[0]['kranfuehrer'].schadenKreatur).toBe(4);
    expect(next.stats!.proKarte[0]['kranfuehrer'].schadenBasis).toBe(1);
    expect(next.stats!.proSpieler[0].wuchtSchaden).toBe(1);
    expect(next.players[1].base).toBe(data.config.baseHealth - 1);

    // gecko stirbt durch den Kampfangriff des kranfuehrer (kills-Attribution).
    expect(next.stats!.proKarte[1]['gecko'].gestorben).toBe(1);
    expect(next.stats!.proKarte[0]['kranfuehrer'].kills).toBe(1);

    // gecko selbst greift zurück (1 Schaden) UND hat dornen (1 Schaden) - beides
    // an kranfuehrer, gezählt über schadenKreatur (gecko) bzw. dornenSchaden (Spieler 1).
    expect(next.stats!.proKarte[1]['gecko'].schadenKreatur).toBe(1);
    expect(next.stats!.proSpieler[1].dornenSchaden).toBe(1);
  });

  it('Gift-Zermürbung: Tod wird als giftZerstoerungen dem Gegner gutgeschrieben', () => {
    const s = emptyState();
    aktiviereStatistik(s);
    const gecko = put(s, 1, 0, 'gecko', { exhausted: true, spawnRound: 0 }); // 1/3
    gecko.poison = 5; // stirbt sicher an der Gift-Zermürbung

    const next = passBoth(s);

    expect(next.stats!.proKarte[1]['gecko'].gestorben).toBe(1);
    expect(next.stats!.proSpieler[0].giftZerstoerungen).toBe(1);
    // Poison-Herkunft ist nicht eindeutig einer Karte zuordenbar -> kein Kill-Eintrag.
    expect(next.stats!.proKarte[0]['gecko']).toBeUndefined();
  });

  it('Heilung über die heilung-Fähigkeit (Feldscherin, seit Phase 7a Ability-Primitiv) wird gezählt', () => {
    const s = emptyState();
    aktiviereStatistik(s);
    const feldscherin = put(s, 0, 1, 'feldscherin', { spawnRound: 0 });
    feldscherin.exhausted = true;
    const verwundeter = put(s, 0, 0, 'ritter', { spawnRound: 0 }); // Nachbar in Lane 0
    verwundeter.exhausted = true;
    verwundeter.currentHealth = 1; // beschädigt, max ist 4

    const next = passBoth(s);

    expect(next.stats!.proKarte[0]['feldscherin'].geheilt).toBe(1);
    expect(next.stats!.proSpieler[0].heilung).toBe(1);
  });

  it('Rettung (rettungUsed) zählt als verhindert/verhinderterSchaden', () => {
    const s = emptyState();
    aktiviereStatistik(s);
    const hund = put(s, 0, 0, 'der_alte_hund', { spawnRound: 0 }); // 1/4, rettung survive_1hp
    hund.exhausted = true;
    const angreifer = put(s, 1, 0, 'brachiosaurus', { spawnRound: 0 }); // 4/8, würde 4 Schaden machen

    const next = passBoth(s);

    // Hund lebt mit 1 HP weiter (Rettung ausgelöst).
    const hundImFeld = next.board[0][0];
    expect(hundImFeld?.currentHealth).toBe(1);
    // 4 HP - 4 Schaden = 0 -> Rettung setzt auf 1, also 1 Schaden verhindert.
    expect(next.stats!.proKarte[0]['der_alte_hund'].verhindert).toBe(1);
    expect(next.stats!.proSpieler[0].verhinderterSchaden).toBe(1);
  });

  it('Wachstum wird als wachstumAtk/wachstumHp beim Rundenbeginn gezählt', () => {
    const s = emptyState();
    aktiviereStatistik(s);
    put(s, 0, 0, 'lehrling'); // Wachstum +0/+1 pro Runde
    s.board[0][0]!.exhausted = true;

    // Kampf (kein Effekt, keine Gegner) + Rundenende + neue Runde -> onRoundStartAbilities.
    const next = passBoth(s);

    expect(next.stats!.proSpieler[0].wachstumHp).toBe(1);
    expect(next.stats!.proSpieler[0].wachstumAtk).toBe(0);
  });

  it('gespielte Karten werden gezählt', () => {
    const s = emptyState();
    aktiviereStatistik(s);
    s.players[0].hand = ['rekrut'];

    const next = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);

    expect(next.stats!.proKarte[0]['rekrut'].gespielt).toBe(1);
  });

  it('flinkAngriffe zählt Angriffe im Ausspiel-Kreis (spawnRound === round)', () => {
    const s = emptyState();
    aktiviereStatistik(s);
    put(s, 0, 0, 'ratte'); // flink, spawnRound = state.round per Default

    const next = passBoth(s);

    expect(next.stats!.proSpieler[0].flinkAngriffe).toBe(1);
    expect(next.stats!.proKarte[0]['ratte'].schadenBasis).toBe(2);
  });

  it('vollständige Simulation erfasst Mulligan, Energie je Runde, Endhand und Karteninstanzen', () => {
    const decks = ladeDecks(data);
    const result = spielePartie(data, decks.h1_solidaritaet, decks.a1_rudeljaeger, { saat: 77 });
    for (const side of [0, 1] as const) {
      const p = result.stats.proSpieler[side];
      expect(p.anfangshand).toHaveLength(data.config.startingHand);
      expect(p.kartenGezogen).toBeGreaterThanOrEqual(data.config.startingHand);
      expect(p.energieJeRunde).toHaveLength(result.runden);
      expect(p.endhand).toEqual(result.endState.players[side].hand);
    }
    expect(Object.keys(result.stats.instanzen).length).toBe(data.config.deckbuilding.size * 2);
    const kartenwerte = Object.values(result.stats.proKarte[0]);
    expect(kartenwerte.some((k) => k.mulliganAngeboten > 0)).toBe(true);
  });
});

describe('Cheerleader-Telemetrie', () => {
  const SCHILD = data.config.schild!;

  /** Spieler 1 in einen Schild-Block bringen; danach wartet sein Bank-Fenster. */
  function nachBlock(bank1: [string | null, string | null, string | null]): GameState {
    const s = emptyState();
    aktiviereStatistik(s);
    s.players[0].cheerleaders = [null, null, null];
    s.players[1].cheerleaders = [...bank1];
    s.players[1].schild = SCHILD.abschnitte - 1;
    put(s, 0, 0, 'rekrut'); // Basisangriff auf die freie Lane 0
    let t = applyAction(s, 0, { type: 'pass' }, data);
    return applyAction(t, t.active, { type: 'pass' }, data);
  }

  it('zaehlt Angebot, Opfer und Schaden je Cheerleader', () => {
    // --- Angebot: jeder besetzte Bankplatz taucht im Fenster auf ---
    const s = nachBlock(['pc_principal', 'alter_wissenschaftler', null]);
    expect(s.reaktion?.spieler).toBe(1);
    expect(s.stats!.proCheerleader[1].pc_principal.angeboten).toBe(1);
    expect(s.stats!.proCheerleader[1].alter_wissenschaftler.angeboten).toBe(1);

    // --- Opfer mit Schaden (Feldforschung, Option B trifft alle Gegner) ---
    const geopfert = applyAction(
      s,
      1,
      { type: 'cheerleaderReaction', reactionId: s.reaktion!.id, slot: 1, choice: 'B' },
      data
    );
    const w = geopfert.stats!.proCheerleader[1].alter_wissenschaftler;
    expect(w.geopfert).toBe(1);
    // Der Angreifer aus Lane 0 steht noch und kassiert die 2 Schaden.
    expect(w.schadenVerursacht).toBe(2);
    // Der nicht gewaehlte Platz bleibt bei 0 Opfern.
    expect(geopfert.stats!.proCheerleader[1].pc_principal.geopfert).toBe(0);
  });

  it('zaehlt geheilten Schaden bei Zweiter Chance', () => {
    const vor = emptyState();
    aktiviereStatistik(vor);
    vor.players[0].cheerleaders = [null, null, null];
    vor.players[1].cheerleaders = ['junger_neffe', null, null];
    vor.players[1].schild = SCHILD.abschnitte - 1;
    put(vor, 0, 0, 'rekrut');
    const verwundet = put(vor, 1, 1, 'eisbaer');
    verwundet.currentHealth = 1;

    let r = applyAction(vor, 0, { type: 'pass' }, data);
    r = applyAction(r, r.active, { type: 'pass' }, data);
    r = applyAction(
      r,
      1,
      { type: 'cheerleaderReaction', reactionId: r.reaktion!.id, slot: 0 },
      data
    );
    const n = r.stats!.proCheerleader[1].junger_neffe;
    expect(n.geopfert).toBe(1);
    expect(n.schadenVerhindert).toBeGreaterThan(0);
  });
});
