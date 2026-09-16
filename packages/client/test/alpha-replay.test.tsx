import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { applyAction, buildClientView, createGame, createSeededRandom, loadGameData } from '@pcf/engine';
import { makeCreature } from '../../engine/src/internal.js';
import { syncHands } from '../../engine/src/alpha.js';
import { useKampfReplay } from '../src/arena/useKampfReplay';
import { LANE_PAUSE_MS, SPELL_MS } from '../src/arena/fx';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('zeigt Heilung vor Verstärkung und kündigt reine Kartenwirkungen nicht als Kampf an', async () => {
  vi.useFakeTimers();
  const data = loadGameData();
  const state = createGame(data, ['rostbolzen', 'kaeptn_kompostible'], createSeededRandom(17));
  state.phase = 'play'; state.round = 2; state.active = 0; state.log = [];
  state.players[0].hand = ['alpha_south_park_mint']; state.players[0].energy = 10;
  const def = data.cardsById.alpha_human_kite;
  if (def.type !== 'creature') throw Error('Testfigur fehlt');
  const creature = makeCreature(state, { ...def, cardId: def.id }, { isToken: false });
  state.board[0][0] = creature; creature.currentHealth = 1;
  syncHands(state);
  const before = buildClientView(state, 0, data);
  const action = before.legalActions!.find(a => a.type === 'playAction');
  if (!action) throw Error('Testaktion fehlt');
  const after = buildClientView(applyAction(state, 0, action, data), 0, data);
  const { result, rerender } = renderHook(({ view }) => useKampfReplay(view), { initialProps: { view: before } });
  rerender({ view: after });
  expect(result.current.replayKind).toBe('effect');
  expect(result.current.banner).toBeNull();
  expect(result.current.fx.spells[0].effect).toBe('heal');
  expect(result.current.shownView.board[0][0]!.attack).toBe(before.board[0][0]!.attack);
  expect(result.current.shownView.board[0][0]!.health).toBeGreaterThan(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(SPELL_MS + LANE_PAUSE_MS); });
  expect(result.current.fx.spells[0].effect).toBe('buff');
  expect(result.current.shownView.board[0][0]!.attack).toBe(after.board[0][0]!.attack);
  await act(async () => { await vi.runAllTimersAsync(); });
  expect(result.current.isReplaying).toBe(false);
  expect(result.current.shownView).toEqual(after);
});
