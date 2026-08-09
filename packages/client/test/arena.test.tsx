// Client-Tests für die Arena-Bedienung: Karten per Ziehen ausspielen und den
// Karteneffekt per Antippen ansehen.
//
// Wie in `reaktion.test.tsx` kommen die Fixtures aus der ECHTEN Engine – ein
// handgeschriebener ClientView würde diese Suite grün halten, während sich der
// Vertrag darunter verschiebt.
//
// jsdom rechnet kein Layout: `getBoundingClientRect()` liefert überall Nullen.
// Die Lane-Rechtecke werden deshalb gestubbt. Genau deswegen prüft der
// Kartenzug per Rechteck-Treffer und nicht per `document.elementFromPoint`.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { applyAction, buildClientView, createGame, createSeededRandom, loadGameData } from '@pcf/engine';
import type { ClientView, GameState, PlayerAction, PlayerIndex } from '@pcf/engine';
import { GameScreen } from '../src/GameScreen';

const data = loadGameData();

afterEach(() => {
  cleanup();
  document.querySelectorAll('*').forEach((el) => {
    delete (el as HTMLElement).dataset.testRect;
  });
});

/** Spieler 0 ist am Zug, hat Energie satt und eine Kreatur auf der Hand. */
function spielbereit(): GameState {
  let s = createGame(data, ['humans', 'animals'], createSeededRandom(7), undefined, [
    ['pc_principal', 'pc_babies', 'alter_wissenschaftler'],
    ['pc_principal', 'pc_babies', 'alter_wissenschaftler']
  ]);
  s = applyAction(s, 0, { type: 'mulligan', handIndices: [] }, data);
  s = applyAction(s, 1, { type: 'mulligan', handIndices: [] }, data);
  // Keine Bank auf beiden Seiten: sonst öffnet das Ausspielen ein
  // Reaktionsfenster und sperrt genau die Aktionen, die hier geprüft werden.
  s.players[0].cheerleaders = [null, null, null];
  s.players[1].cheerleaders = [null, null, null];
  s.players[0].hand = ['rekrut'];
  s.players[0].energy = 9;
  s.active = 0;
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

/**
 * Handkarte gezielt greifen. Über den Kartennamen allein ginge es nicht: steht
 * dieselbe Kreatur schon auf dem Feld, trägt ihr Slot-Knopf denselben Namen.
 */
function handkarte(name: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${name}, Kosten `) });
}

/**
 * Jeder eigenen Lane ein eigenes Rechteck geben: Lane n liegt bei
 * x = 100 + n * 100, y = 300. Die Handkarte startet weit darunter.
 */
function laneRechtecke(me: PlayerIndex, lanes: number) {
  for (let lane = 0; lane < lanes; lane++) {
    const el = document.querySelector<HTMLElement>(`[data-slot="${me}-${lane}"]`);
    if (!el) throw new Error(`Lane-Slot ${lane} fehlt im DOM.`);
    const left = 60 + lane * 100;
    el.getBoundingClientRect = () =>
      ({ left, right: left + 80, top: 260, bottom: 360, width: 80, height: 100 }) as DOMRect;
  }
}

/** Vollständige Zieh-Geste von der Handkarte auf einen Punkt. */
function ziehe(karte: HTMLElement, ziel: { x: number; y: number }) {
  fireEvent.pointerDown(karte, { button: 0, pointerId: 1, clientX: 40, clientY: 700 });
  // Erster Move überschreitet die Schwelle und startet den Zug.
  fireEvent.pointerMove(karte, { pointerId: 1, clientX: 60, clientY: 640 });
  fireEvent.pointerMove(karte, { pointerId: 1, clientX: ziel.x, clientY: ziel.y });
  fireEvent.pointerUp(karte, { pointerId: 1, clientX: ziel.x, clientY: ziel.y });
}

describe('Handkarten in der Arena', () => {
  it('spielt eine Kreatur aus, wenn sie auf eine freie Lane gezogen wird', () => {
    const view = sicht(spielbereit(), 0);
    const gesendet: PlayerAction[] = [];
    zeige(view, (a) => gesendet.push(a));

    laneRechtecke(0, view.lanes);
    ziehe(handkarte('Rekrut'), { x: 200, y: 300 });

    expect(gesendet).toEqual([{ type: 'playCreature', handIndex: 0, lane: 1 }]);
  });

  it('legt nichts ab, wenn die Lane besetzt ist', () => {
    let s = spielbereit();
    // Lane 1 blockieren und danach wieder Spieler 0 am Zug lassen.
    s.players[0].hand = ['rekrut', 'rekrut'];
    s = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 1 }, data);
    s.active = 0;
    const view = sicht(s, 0);
    expect(view.board[0][1]).not.toBeNull();

    const gesendet: PlayerAction[] = [];
    zeige(view, (a) => gesendet.push(a));

    laneRechtecke(0, view.lanes);
    ziehe(handkarte('Rekrut'), { x: 200, y: 300 });

    expect(gesendet).toEqual([]);
  });

  it('legt nichts ab, wenn losgelassen wird, ohne eine Lane zu treffen', () => {
    const view = sicht(spielbereit(), 0);
    const gesendet: PlayerAction[] = [];
    zeige(view, (a) => gesendet.push(a));

    laneRechtecke(0, view.lanes);
    // y = 700 liegt unter allen Lane-Rechtecken.
    ziehe(handkarte('Rekrut'), { x: 200, y: 700 });

    expect(gesendet).toEqual([]);
  });

  it('zeigt beim Antippen den Karteneffekt statt auszuspielen', () => {
    const view = sicht(spielbereit(), 0);
    const gesendet: PlayerAction[] = [];
    zeige(view, (a) => gesendet.push(a));

    const karte = handkarte('Rekrut');
    fireEvent.pointerDown(karte, { button: 0, pointerId: 1, clientX: 40, clientY: 700 });
    fireEvent.pointerUp(karte, { pointerId: 1, clientX: 40, clientY: 700 });

    expect(gesendet).toEqual([]);
    // Die Detailansicht zeigt Werte der Karte – hier reicht der Name als Beleg.
    expect(screen.getByRole('heading', { name: /Rekrut/i })).toBeTruthy();
  });

  it('spielt über den Ausspielen-Knopf im Detail und einen Lane-Tap aus', () => {
    const view = sicht(spielbereit(), 0);
    const gesendet: PlayerAction[] = [];
    const { container } = zeige(view, (a) => gesendet.push(a));

    const karte = handkarte('Rekrut');
    fireEvent.pointerDown(karte, { button: 0, pointerId: 1, clientX: 40, clientY: 700 });
    fireEvent.pointerUp(karte, { pointerId: 1, clientX: 40, clientY: 700 });
    fireEvent.click(screen.getByRole('button', { name: /^Ausspielen$/ }));

    const lane2 = container.querySelector<HTMLElement>('[data-slot="0-2"]');
    expect(lane2).not.toBeNull();
    fireEvent.click(lane2!);

    expect(gesendet).toEqual([{ type: 'playCreature', handIndex: 0, lane: 2 }]);
  });
});

describe('Arena-Aufbau', () => {
  it('verankert Lanes und Bänke im DOM, damit die 3D-Bühne sie findet', () => {
    const view = sicht(spielbereit(), 0);
    const { container } = zeige(view);

    for (let lane = 0; lane < view.lanes; lane++) {
      expect(container.querySelector(`[data-slot="0-${lane}"]`)).not.toBeNull();
      expect(container.querySelector(`[data-slot="1-${lane}"]`)).not.toBeNull();
    }
    // Bank-Anker beider Seiten – Battlefield3D setzt darauf Bank und Basis.
    expect(container.querySelector('.arena [data-zone="0"]')).not.toBeNull();
    expect(container.querySelector('.arena [data-zone="1"]')).not.toBeNull();
  });

  it('warnt einmalig mit der Anzahl spielbarer Karten vor dem Rundenende', () => {
    const view = sicht(spielbereit(), 0);
    const gesendet: PlayerAction[] = [];
    zeige(view, (action) => gesendet.push(action));

    fireEvent.click(screen.getByRole('button', { name: 'Runde abschließen' }));
    expect(screen.getByRole('dialog', { name: 'Runde abschließen' })).toBeTruthy();
    expect(screen.getByText(/noch 1 bezahlbare Karte/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Weiterspielen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Runde abschließen' }));

    expect(gesendet).toEqual([{ type: 'pass' }]);
  });

  it('zeigt am Spielende Bilanz und RÃ¼ckspiel als primÃ¤re Aktion', () => {
    const state = spielbereit();
    state.phase = 'ended';
    state.winner = 0;
    state.round = 8;
    state.log.push({
      id: state.log.length,
      round: 8,
      text: 'Basis getroffen',
      event: { kind: 'attack', lane: 0, attacker: 0, damage: 3, toBase: true }
    });
    zeige(sicht(state, 0));

    expect(screen.getByRole('dialog', { name: 'Spielergebnis' })).toBeTruthy();
    expect(screen.getByText('Basisschaden').previousSibling?.textContent).toBe('3');
    expect(screen.getByRole('button', { name: 'Rückspiel' })).toBeTruthy();
  });
});
