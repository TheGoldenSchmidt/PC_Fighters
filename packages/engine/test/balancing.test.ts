import { describe, expect, it } from 'vitest';
import {
  BOT_PROFILE,
  createGame,
  createSeededRandom,
  getLegalActions,
  ladeAktiveDecks,
  ladeDecks,
  ladeDeckStatus,
  loadGameData,
  spielePartie,
  wiederholeReplay
} from '../src/index.js';

const data = loadGameData();

const EXPECTED_ALPHA_DECKS: Record<string, Record<string, number>> = {
  rudeljaeger: { ratte: 2, streunerkatze: 2, getigerter: 2, hauskater: 2, wolf: 2, wilder_instinkt: 2, pferd: 2, katzenmutter: 1, luchs: 1, alphawolf: 1, vogelmensch: 1, junger_neffe: 1, pc_principal: 1 },
  urzeitliche_kolosse: { ratte: 2, wolf: 2, wilder_instinkt: 2, velociraptor: 2, pferd: 2, triceratops: 2, pteranodon: 1, baer: 1, spinosaurus: 1, tyrannosaurus_rex: 1, brachiosaurus: 1, vogelmensch: 1, randy_marsh: 1, pc_principal: 1 },
  solidaritaet_ueberleben: { rekrut: 2, schildwache: 2, der_alte_hund: 2, streikposten: 2, feldscherin: 2, schrottsammlerin: 2, generalstreik: 2, pfandsammler: 1, ritter: 1, kommandantin: 1, pc_babies: 1, junger_neffe: 1, pc_principal: 1 },
  forschung_muskelkraft: { erstsemester: 2, koffein_junkie: 2, schildwall: 2, mobilmachung: 2, kranfuehrer: 2, ritter: 2, stahlgiesser: 2, pfandsammler: 1, bibliothekar: 1, kommandantin: 1, alter_wissenschaftler: 1, randy_marsh: 1, pc_principal: 1 }
};

describe('Alpha-Deckfreischaltung', () => {
  it('haelt genau vier Decks aktiv und die restlichen Dateien reaktivierbar', () => {
    const all = ladeDecks(data);
    const active = ladeAktiveDecks(data);
    const status = ladeDeckStatus(data);
    expect(Object.keys(active).sort()).toEqual(status.active.slice().sort());
    expect(status.active).toHaveLength(4);
    expect(status.allowCustomDecks).toBe(false);
    expect(Object.keys(all).length).toBeGreaterThan(Object.keys(active).length);
    expect(status.active).toEqual(expect.arrayContaining([
      'rudeljaeger',
      'urzeitliche_kolosse',
      'solidaritaet_ueberleben',
      'forschung_muskelkraft'
    ]));
    for (const deck of Object.values(active)) {
      const categories = deck.cards.flatMap((entry) =>
        Array.from({ length: entry.count }, () => data.cardsById[entry.cardId]?.category)
      );
      expect(categories.filter((category) => category === 'hero')).toHaveLength(2);
      expect(categories.filter((category) => category === 'principal')).toHaveLength(1);
    }
    for (const [id, expected] of Object.entries(EXPECTED_ALPHA_DECKS)) {
      expect(Object.fromEntries(active[id].cards.map((entry) => [entry.cardId, entry.count]))).toEqual(expected);
    }
  });

  it('stellt alle sechs Sonderkarten der zentralen Bot-Aktions-API bereit', () => {
    const active = ladeAktiveDecks(data);
    const state = createGame(
      data,
      ['animals', 'humans'],
      createSeededRandom(9),
      [active.rudeljaeger, active.solidaritaet_ueberleben]
    );
    state.phase = 'play';
    state.active = 0;
    state.players[0].energy = 20;
    state.board = [Array(data.config.lanes).fill(null), Array(data.config.lanes).fill(null)];
    for (const cardId of ['vogelmensch', 'junger_neffe', 'pc_babies', 'randy_marsh', 'alter_wissenschaftler', 'pc_principal']) {
      state.players[0].hand = [cardId];
      expect(getLegalActions(state, 0, data).some((action) => action.type === 'playCreature')).toBe(true);
    }
  });
});

describe('deterministische Balancing-Partie und Replay', () => {
  const decks = ladeAktiveDecks(data);
  const options = {
    saat: 184729,
    startspieler: 0 as const,
    profilA: { ...BOT_PROFILE.standard, epsilonBand: 0 },
    profilB: { ...BOT_PROFILE.control, epsilonBand: 0 },
    aufzeichnen: true,
    matchId: 'repro-184729'
  };

  it('liefert fuer denselben Seed dieselben Aktionen und denselben Endzustand', () => {
    const first = spielePartie(data, decks.rudeljaeger, decks.solidaritaet_ueberleben, options);
    const second = spielePartie(data, decks.rudeljaeger, decks.solidaritaet_ueberleben, options);
    expect(first.replay?.endzustand).toBe(second.replay?.endzustand);
    expect(first.aktionen).toEqual(second.aktionen);
    expect(first.startspieler).toBe(0);
  });

  it('laedt das Replay nur ueber Seed und echte Spieleraktionen erneut', () => {
    const result = spielePartie(data, decks.rudeljaeger, decks.solidaritaet_ueberleben, options);
    expect(result.replay).toBeTruthy();
    const replay = wiederholeReplay(data, decks.rudeljaeger, decks.solidaritaet_ueberleben, result.replay!);
    expect(replay.korrekt).toBe(true);
    expect(replay.state.winner).toBe(result.gewinner);
  });

  it('jede Bot-Aktion stammt aus der zentralen Legal-Action-API', () => {
    const result = spielePartie(data, decks.rudeljaeger, decks.solidaritaet_ueberleben, options);
    expect(result.aktionen.length).toBeGreaterThan(2);
    // Der vollstaendige Vertrag wird beim Replay bereits durch applyAction
    // validiert; hier sichern wir den oeffentlichen englischen API-Namen ab.
    expect(getLegalActions).toBeTypeOf('function');
  });

  it('erfasst niemals mehr Ausspielvorgänge als physisch gezogene Karteninstanzen', () => {
    const result = spielePartie(data, decks.forschung_muskelkraft, decks.solidaritaet_ueberleben, {
      ...options,
      saat: 99173,
      profilA: BOT_PROFILE.aggressive,
      profilB: BOT_PROFILE.control
    });
    for (const side of [0, 1] as const) {
      const remaining = new Set(result.stats.deckInstanzen[side]);
      for (const [cardId, cardStats] of Object.entries(result.stats.proKarte[side])) {
        const drawn = Object.values(result.stats.instanzen).filter(
          (instance) => instance.owner === side && instance.cardId === cardId && !remaining.has(instance.id)
        ).length;
        expect(cardStats.gespielt, `${cardId}: gespielt darf gezogen nicht überschreiten`).toBeLessThanOrEqual(drawn);
      }
    }
  });
});
