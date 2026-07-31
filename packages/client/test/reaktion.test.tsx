// Client-Tests für die Cheerleader-Reaktionen.
//
// Die Fixtures kommen aus der ECHTEN Engine (createGame + applyAction), nicht
// aus handgeschriebenen Objekten: sonst würde diese Suite grün bleiben, während
// sich der ClientView-Vertrag darunter verschiebt.
//
// Geprüft wird, was der Plan verlangt: Besitzer- gegen Gegneransicht, gesperrte
// Normalaktionen, die Auswahl selbst und die stabile Replay-Reihenfolge.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import {
  applyAction,
  buildClientView,
  createGame,
  createSeededRandom,
  loadGameData
} from '@pcf/engine';
import type { ClientView, GameState, PlayerAction, PlayerIndex } from '@pcf/engine';
import { GameScreen } from '../src/GameScreen';

const data = loadGameData();

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * Baut einen Zustand mit offenem Reaktionsfenster: Spieler 0 spielt eine
 * Kreatur, Spieler 1 hat einen passenden Cheerleader auf der Bank.
 */
function zustandMitOffenemFenster(bank1: [string | null, string | null, string | null]): GameState {
  let s = createGame(
    data,
    ['humans', 'animals'],
    createSeededRandom(4242),
    undefined,
    [
      ['pc_principal', 'pc_babies', 'alter_wissenschaftler'],
      ['pc_principal', 'pc_babies', 'alter_wissenschaftler']
    ]
  );
  s = applyAction(s, 0, { type: 'mulligan', handIndices: [] }, data);
  s = applyAction(s, 1, { type: 'mulligan', handIndices: [] }, data);
  // Definierte Bank und eine sicher bezahlbare Handkarte.
  s.players[1].cheerleaders = [...bank1];
  s.players[0].cheerleaders = [null, null, null];
  s.players[0].hand = ['rekrut'];
  s.players[0].energy = 9;
  s.active = 0;
  s = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
  if (!s.reaktion) throw new Error('Fixture öffnet kein Reaktionsfenster.');
  return s;
}

function sicht(s: GameState, spieler: PlayerIndex): ClientView {
  return buildClientView(s, spieler, data);
}

function zeige(view: ClientView, onAction: (a: PlayerAction) => void = () => {}) {
  return render(
    <GameScreen
      view={view}
      topic={null}
      keywordInfo={null}
      catalog={null}
      status="connected"
      opponentConnected
      onAction={onAction}
      onLeave={() => {}}
    />
  );
}

describe('Cheerleader-Reaktion im Client', () => {
  it('zeigt dem Berechtigten die Angebote, dem Gegner nur den Wartezustand', () => {
    const s = zustandMitOffenemFenster(['pc_principal', null, 'alter_wissenschaftler']);

    // Besitzer des Fensters (Spieler 1)
    const { unmount } = zeige(sicht(s, 1));
    const dialog = screen.getByRole('dialog', { name: /Cheerleader-Reaktion/i });
    expect(within(dialog).getByRole('button', { name: /Machtwort einsetzen/i })).toBeTruthy();
    // Feldforschung stellt eine Wahl, hat also zwei Options-Knöpfe statt einem.
    expect(within(dialog).getByRole('button', { name: /Karte und Wissen/i })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /Verzichten/i })).toBeTruthy();
    // Platz 2 ist leer und darf nicht auftauchen.
    expect(within(dialog).queryByText(/Platz 2/)).toBeNull();
    unmount();

    // Gegner (Spieler 0): kein Dialog, nur Wartehinweis
    zeige(sicht(s, 0));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/Gegner entscheidet/i);
  });

  it('sperrt normale Aktionen auf BEIDEN Seiten', () => {
    const s = zustandMitOffenemFenster(['pc_principal', null, null]);

    const { unmount } = zeige(sicht(s, 1));
    expect(screen.queryByRole('button', { name: /^Passen$/ })).toBeNull();
    unmount();

    zeige(sicht(s, 0));
    expect(screen.queryByRole('button', { name: /^Passen$/ })).toBeNull();
  });

  it('meldet Verzicht und Opfer mit der richtigen Reaktions-Id', async () => {
    const s = zustandMitOffenemFenster(['pc_principal', null, null]);
    const view = sicht(s, 1);
    const gesendet: PlayerAction[] = [];

    const { unmount } = zeige(view, (a) => gesendet.push(a));
    screen.getByRole('button', { name: /Verzichten/i }).click();
    expect(gesendet).toEqual([
      { type: 'cheerleaderReaction', reactionId: view.reaktion!.id, slot: null }
    ]);
    unmount();

    gesendet.length = 0;
    zeige(view, (a) => gesendet.push(a));
    screen.getByRole('button', { name: /Machtwort einsetzen/i }).click();
    expect(gesendet).toEqual([
      { type: 'cheerleaderReaction', reactionId: view.reaktion!.id, slot: 0 }
    ]);
  });

  it('stellt eine Wahl als zwei getrennte Optionen dar und sendet choice mit', () => {
    const s = zustandMitOffenemFenster(['alter_wissenschaftler', null, null]);
    const view = sicht(s, 1);
    const gesendet: PlayerAction[] = [];
    zeige(view, (a) => gesendet.push(a));

    screen.getByRole('button', { name: /Karte und Wissen/i }).click();
    screen.getByRole('button', { name: /2 Schaden/i }).click();

    expect(gesendet).toEqual([
      { type: 'cheerleaderReaction', reactionId: view.reaktion!.id, slot: 0, choice: 'A' },
      { type: 'cheerleaderReaction', reactionId: view.reaktion!.id, slot: 0, choice: 'B' }
    ]);
  });

  it('haelt die Replay-Reihenfolge Opfer → Kraft ein', () => {
    const s = zustandMitOffenemFenster(['pc_principal', null, null]);
    const vorher = sicht(s, 1);
    const nachher = applyAction(
      s,
      1,
      { type: 'cheerleaderReaction', reactionId: s.reaktion!.id, slot: 0 },
      data
    );
    const neueEvents = nachher.log
      .filter((e) => e.id > (vorher.log.at(-1)?.id ?? -1) && e.event)
      .map((e) => e.event!.kind);
    // Der Replay-Vertrag: erst leert sich der Bankplatz, dann wirkt die Kraft.
    expect(neueEvents.slice(0, 2)).toEqual(['cheerleaderSacrifice', 'cheerleaderPower']);
  });

  it('fragt erst NACH der Kampfabspielung, wenn ein Tod das Fenster oeffnet', async () => {
    vi.useFakeTimers();
    // Nur Spieler 1 hat eine Bank, und zwar mit dem Todes-Ausloeser. Ein
    // Ausspielen oeffnet damit kein Fenster – erst der Kampftod.
    let s = createGame(
      data,
      ['humans', 'animals'],
      createSeededRandom(99),
      undefined,
      [
        ['pc_principal', 'pc_babies', 'alter_wissenschaftler'],
        ['pc_principal', 'pc_babies', 'junger_neffe']
      ]
    );
    s = applyAction(s, 0, { type: 'mulligan', handIndices: [] }, data);
    s = applyAction(s, 1, { type: 'mulligan', handIndices: [] }, data);
    s.players[0].cheerleaders = [null, null, null];
    s.players[1].cheerleaders = ['junger_neffe', null, null];
    s.players[0].hand = ['ritter'];
    s.players[1].hand = ['rekrut'];
    s.players[0].energy = 9;
    s.players[1].energy = 9;
    s.active = 0;
    s = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    s = applyAction(s, 1, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(s.reaktion).toBeNull();
    // Sicher toedlich machen, damit der Kampf das Fenster oeffnet.
    s.board[1][0]!.currentHealth = 1;
    s.board[0][0]!.exhausted = false;

    const vorKampf = sicht(s, 1);
    const { rerender } = render(
      <GameScreen
        view={vorKampf}
        topic={null}
        keywordInfo={null}
        catalog={null}
        status="connected"
        opponentConnected
        onAction={() => {}}
        onLeave={() => {}}
      />
    );

    s = applyAction(s, s.active, { type: 'pass' }, data);
    s = applyAction(s, s.active, { type: 'pass' }, data);
    expect(s.reaktion?.ausloeser).toBe('eigenerTod');
    const nachKampf = sicht(s, 1);
    // Es gibt echte Kampf-Events zum Abspielen – sonst prueft dieser Test nichts.
    const frisch = nachKampf.log.filter(
      (e) => e.id > (vorKampf.log.at(-1)?.id ?? -1) && e.event
    );
    expect(frisch.length).toBeGreaterThan(0);

    rerender(
      <GameScreen
        view={nachKampf}
        topic={null}
        keywordInfo={null}
        catalog={null}
        status="connected"
        opponentConnected
        onAction={() => {}}
        onLeave={() => {}}
      />
    );

    // Waehrend die Lanes abgespielt werden, darf noch nicht gefragt werden.
    expect(screen.queryByRole('dialog')).toBeNull();

    // Kein waitFor: das würde mit falschen Zeitgebern auf echte Zeit warten.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Zweite Chance einsetzen/i })).toBeTruthy();
  });
});
