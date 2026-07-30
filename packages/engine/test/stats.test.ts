// Tests für den Telemetrie-Sidecar (stats.ts). Zwei Dinge werden geprüft:
// 1. Wirkungsfreiheit – aktivierte Statistik darf den Spielausgang NICHT ändern.
// 2. Exakte Zählerwerte auf konstruierten Brettern für die zentralen Mechaniken.

import { describe, expect, it } from 'vitest';
import {
  aktiviereStatistik,
  applyAction,
  buildClientView,
  createGame,
  createSeededRandom,
  ladeDecks,
  spielePartie
} from '../src/index.js';
import { data, emptyState, passBoth, put } from './helpers.js';
import type { GameState } from '../src/types.js';

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
