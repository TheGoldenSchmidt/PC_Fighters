// Eigenständige Abdeckung der Flugphase. Alle Übergänge laufen über
// applyAction, damit Auflösungsmaschine, Legal Actions und ClientView gemeinsam
// geprüft werden.

import { describe, expect, it } from 'vitest';
import { applyAction, buildClientView, legaleAktionen } from '../src/index.js';
import { data, emptyState, passBoth, put } from './helpers.js';
import type { GameState, PlayerIndex } from '../src/types.js';

function bisFlugphase(state: GameState): GameState {
  const result = passBoth(state);
  expect(result.phase).toBe('fly');
  return result;
}

describe('Flugphase', () => {
  it('wird ohne Flieger vollständig übersprungen', () => {
    const state = emptyState();
    put(state, 0, 0, 'rekrut');
    put(state, 1, 1, 'wolf');

    const result = passBoth(state);
    expect(result.phase).toBe('play');
    expect(result.round).toBe(2);
  });

  it('aktiviert nur den Spieler mit einem beweglichen Flieger', () => {
    const state = emptyState();
    put(state, 0, 0, 'rekrut');
    put(state, 1, 1, 'eule');

    const result = bisFlugphase(state);
    expect(result.players[0].flyDone).toBe(true);
    expect(result.players[1].flyDone).toBe(false);
    expect(result.active).toBe(1);
  });

  it('beendet die Runde erst, nachdem beide Seiten fertig sind', () => {
    const state = emptyState();
    put(state, 0, 0, 'falke');
    put(state, 1, 1, 'eule');
    const flight = bisFlugphase(state);

    const first = applyAction(flight, flight.active, { type: 'flyDone' }, data);
    expect(first.phase).toBe('fly');
    const second = applyAction(first, first.active, { type: 'flyDone' }, data);
    expect(second.phase).toBe('play');
    expect(second.round).toBe(2);
  });

  it('bewegt einen Flieger genau einmal und setzt die Markierung am Rundenende zurück', () => {
    const state = emptyState();
    put(state, 0, 0, 'falke');
    put(state, 0, 1, 'adler_voegel');
    put(state, 1, 4, 'eule');
    const flight = bisFlugphase(state);
    const player = flight.active;
    const fromLane = player === 0 ? 0 : 4;
    const toLane = player === 0 ? 2 : 3;

    const moved = applyAction(
      flight,
      player,
      { type: 'flyMove', fromLane, toLane },
      data
    );
    expect(moved.board[player][fromLane]).toBeNull();
    expect(moved.board[player][toLane]?.movedThisFlyPhase).toBe(true);

    if (moved.active === player) {
      expect(() =>
        applyAction(moved, player, { type: 'flyMove', fromLane: toLane, toLane: fromLane }, data)
      ).toThrow(/schon geflogen/);
    }

    let next = moved;
    while (next.phase === 'fly') {
      next = applyAction(next, next.active, { type: 'flyDone' }, data);
    }
    expect(next.board[player][toLane]?.movedThisFlyPhase).toBe(false);
  });

  it('weist Nichtflieger, leere Quellen und eigene belegte Ziele zurück', () => {
    const state = emptyState();
    put(state, 1, 0, 'wolf');
    put(state, 1, 1, 'eule');
    const flight = bisFlugphase(state);

    expect(() =>
      applyAction(flight, 1, { type: 'flyMove', fromLane: 0, toLane: 2 }, data)
    ).toThrow(/kann nicht fliegen/);
    expect(() =>
      applyAction(flight, 1, { type: 'flyMove', fromLane: 3, toLane: 2 }, data)
    ).toThrow(/keine eigene Kreatur/);
    expect(() =>
      applyAction(flight, 1, { type: 'flyMove', fromLane: 1, toLane: 0 }, data)
    ).toThrow(/Ziel-Lane ist nicht frei/);
  });

  it('erlaubt als Ziel eine gegnerisch, aber nicht selbst belegte Lane', () => {
    const state = emptyState();
    put(state, 1, 1, 'eule');
    put(state, 0, 2, 'rekrut', { exhausted: true });
    const flight = bisFlugphase(state);

    const result = applyAction(
      flight,
      1,
      { type: 'flyMove', fromLane: 1, toLane: 2 },
      data
    );
    expect(result.board[1][2]?.cardId).toBe('eule');
  });

  it('grenzt das Aktionsvokabular gegen Ausspiel- und gegnerische Züge ab', () => {
    const state = emptyState();
    put(state, 0, 0, 'falke');
    put(state, 1, 1, 'eule');
    const flight = bisFlugphase(state);
    const waiting = (flight.active === 0 ? 1 : 0) as PlayerIndex;

    expect(() => applyAction(flight, flight.active, { type: 'pass' }, data)).toThrow(
      /Gerade ist die Flug-Phase/
    );
    expect(() => applyAction(flight, waiting, { type: 'flyDone' }, data)).toThrow(
      /Der andere Spieler bewegt gerade/
    );
    expect(() =>
      applyAction(emptyState(), 0, { type: 'flyMove', fromLane: 0, toLane: 1 }, data)
    ).toThrow(/in der Ausspielphase nicht möglich/);
  });

  it('generiert ausschließlich von applyAction akzeptierte Flugaktionen', () => {
    const state = emptyState();
    put(state, 1, 0, 'eule');
    put(state, 1, 1, 'adler_voegel');
    const flight = bisFlugphase(state);
    const actions = legaleAktionen(flight, 1, data);
    const freeOwnLanes = data.config.lanes - 2;

    expect(actions).toHaveLength(2 * freeOwnLanes + 1);
    expect(actions.filter((action) => action.type === 'flyDone')).toHaveLength(1);
    for (const action of actions) {
      expect(() => applyAction(flight, 1, action, data)).not.toThrow();
    }
  });

  it('zeigt canFly nur dem Besitzer und nur während der Flugphase', () => {
    const state = emptyState();
    put(state, 0, 0, 'falke');
    put(state, 1, 1, 'eule');
    const flight = bisFlugphase(state);

    const view0 = buildClientView(flight, 0, data);
    const view1 = buildClientView(flight, 1, data);
    expect(view0.board[0][0]?.canFly).toBe(true);
    expect(view0.board[1][1]?.canFly).toBe(false);
    expect(view1.board[1][1]?.canFly).toBe(true);
    expect(view1.board[0][0]?.canFly).toBe(false);
  });
});
