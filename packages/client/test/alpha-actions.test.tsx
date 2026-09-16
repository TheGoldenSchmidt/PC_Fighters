import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createGame, buildClientView, loadGameData, createSeededRandom, applyAction } from '@pcf/engine';
import type { PlayerAction } from '@pcf/engine';
import { makeCreature } from '../../engine/src/internal.js';
import { syncHands } from '../../engine/src/alpha.js';
import { GameScreen } from '../src/GameScreen';

const data = loadGameData();
afterEach(cleanup);
function fixture(cardId: string) {
  const s = createGame(data, ['rostbolzen', 'super_brainz'], createSeededRandom(8));
  s.phase = 'play'; s.round = 2; s.active = 0; s.log = [];
  s.players[0].hand = [cardId]; s.players[0].energy = 10;
  s.players.forEach(p => { p.cheerleaders = [null, null, null]; });
  const card = data.cardsById.alpha_human_kite;
  if (card.type !== 'creature') throw Error('Figur fehlt');
  for (const side of [0, 1] as const) {
    s.board[side][0] = makeCreature(s, { cardId: card.id, ...card }, { isToken: false });
    s.teamBoard![side][0] = makeCreature(s, { cardId: card.id, ...card }, { isToken: false });
  }
  syncHands(s);
  const sent: PlayerAction[] = [];
  render(<GameScreen view={buildClientView(s, 0, data)} topic={null} catalog={null} keywordInfo={null} status="connected" opponentConnected onAction={a => sent.push(a)} onLeave={() => {}} />);
  return { s, sent, card: document.querySelector<HTMLElement>('.hand-card')! };
}

describe('Alpha-Zielauswahl aus echten Engine-Angeboten', () => {
  it('spielt eine Verstärkung auf die hintere eigene Figur', () => {
    const { s, sent, card } = fixture('alpha_south_park_kite_schild');
    fireEvent.click(card);
    const uid = s.teamBoard![0][0]!.uid;
    fireEvent.click(document.querySelector(`[data-target-uid="${uid}"]`)!);
    expect(sent).toEqual([{ type: 'playAction', handIndex: 0, targetLane: 0, targetUid: uid }]);
    expect(applyAction(s, 0, sent[0], data).teamBoard![0][0]!.shieldHits).toBe(1);
  });
  it('weist bei gegnerischem Schaden eigene Figuren zurück', () => {
    const { s, sent, card } = fixture('super_meteor_strike'); fireEvent.click(card);
    fireEvent.click(document.querySelector(`[data-target-uid="${s.board[0][0]!.uid}"]`)!); expect(sent).toEqual([]);
    const uid = s.teamBoard![1][0]!.uid;
    fireEvent.click(document.querySelector(`[data-target-uid="${uid}"]`)!);
    expect(sent[0]).toMatchObject({ type: 'playAction', targetUid: uid });
    expect(() => applyAction(s, 0, sent[0], data)).not.toThrow();
  });
  it('wählt beim Portal zuerst die Figur und danach eine freie Bahn', () => {
    const { s, sent, card } = fixture('alpha_rick_morty_portal'); fireEvent.click(card);
    const uid = s.teamBoard![0][0]!.uid;
    fireEvent.click(document.querySelector(`[data-target-uid="${uid}"]`)!);
    expect(sent).toEqual([]); expect(screen.getByText('Auswahl 2 von 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bahn 3' }));
    expect(sent[0]).toMatchObject({ targetUid: uid, toLane: 2 });
    expect(applyAction(s, 0, sent[0], data).board[0][2]?.uid).toBe(uid);
  });
  it('bricht eine mehrstufige Auswahl ohne Aktion ab', () => {
    const { sent, card } = fixture('alpha_rick_morty_portal'); fireEvent.click(card);
    fireEvent.click(screen.getByRole('button', { name: 'Auswahl abbrechen' }));
    expect(sent).toEqual([]); expect(screen.queryByLabelText('Karte ausspielen')).toBeNull();
  });
});
