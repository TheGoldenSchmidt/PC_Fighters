// Integrationsnachweis über echte Aktionen: Eine vollständige Bot-Partie prüft
// zusätzlich nach jedem Schritt den Hidden-Information- und Replay-Vertrag.

import { describe, expect, it } from 'vitest';
import {
  applyAction,
  BOT_PROFILE,
  createGame,
  createSeededRandom,
  legaleAktionen,
  waehleAktion
} from '../src/index.js';
import { data, pruefeSicht } from './helpers.js';

describe('Vollständige Partie', () => {
  it('terminiert mit gültigen Sichten, Aktionen und Replay-Ereignissen', () => {
    const random = createSeededRandom(20260801);
    let state = createGame(data, ['humans', 'animals'], random);
    let steps = 0;

    while (state.phase !== 'ended' && steps < 800) {
      pruefeSicht(state);
      const legal = legaleAktionen(state, state.active, data);
      expect(legal.length).toBeGreaterThan(0);
      const action =
        state.phase === 'mulligan'
          ? { type: 'mulligan' as const, handIndices: [] }
          : waehleAktion(state, state.active, data, BOT_PROFILE.ausgewogen, random);
      expect(legal).toContainEqual(action);
      state = applyAction(state, state.active, action, data, random);
      steps += 1;
    }

    expect(state.phase).toBe('ended');
    expect(state.winner).not.toBeNull();
    expect(state.reaktion).toBeNull();
    expect(state.aufloesung).toEqual([]);
    expect(new Set(state.log.map((entry) => entry.id)).size).toBe(state.log.length);

    const playableEvents = new Set([
      'attack',
      'death',
      'spell',
      'schild',
      'cheerleaderSacrifice',
      'cheerleaderPower'
    ]);
    for (const entry of state.log) {
      if (entry.event) expect(playableEvents.has(entry.event.kind)).toBe(true);
    }
  });

  it.skip('Legacy-Aktionskarte: unterscheidet identische und fremd belegte Ziel-Lanes bei Bewegung', () => {
    const state = createGame(data, ['humans', 'animals'], createSeededRandom(7));
    state.phase = 'play';
    state.round = 1;
    state.active = 0;
    state.players[0].mulliganDone = true;
    state.players[1].mulliganDone = true;
    state.players[0].energy = 10;
    state.players[0].hand = ['wolf', 'hetzjagd'];

    let result = applyAction(state, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    result.active = 0;
    expect(() =>
      applyAction(result, 0, { type: 'playAction', handIndex: 0, targetLane: 0, toLane: 0 }, data)
    ).toThrow(/steht schon in dieser Lane/);

    result.board[0][1] = structuredClone(result.board[0][0]);
    expect(() =>
      applyAction(result, 0, { type: 'playAction', handIndex: 0, targetLane: 0, toLane: 1 }, data)
    ).toThrow(/Ziel-Lane ist nicht frei/);
  });
});
