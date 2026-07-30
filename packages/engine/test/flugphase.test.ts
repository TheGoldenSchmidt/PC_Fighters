// Tests für die Flug-Phase (game.ts: afterCombat/flyPhaseAction/advanceFlyPhase).
//
// Diese Phase war bis hierher komplett ungetestet, obwohl sie eine eigene
// Phase mit eigenem Aktions-Vokabular (flyMove/flyDone) und eigener
// Zugreihenfolge ist. Alles läuft hier bewusst über applyAction – nur so
// werden Phasenwechsel, Zugübergabe und Rundenende wirklich mitgeprüft.

import { describe, expect, it } from 'vitest';
import { applyAction, buildClientView, legaleAktionen } from '../src/index.js';
import { data, emptyState, passBoth, put } from './helpers.js';
import type { GameState } from '../src/types.js';

/** Beide Spieler passen; danach steht der Zustand in der Flug-Phase. */
function bisFlugphase(state: GameState): GameState {
  const s = passBoth(state);
  expect(s.phase).toBe('fly');
  return s;
}

describe('Flug-Phase: Einstieg und Ausstieg', () => {
  it('ohne Flieger auf beiden Seiten wird die Flug-Phase übersprungen', () => {
    const s = emptyState();
    put(s, 0, 0, 'rekrut');
    put(s, 1, 1, 'wolf');
    const nach = passBoth(s);
    // Direkt Rundenende → Runde 2, wieder Ausspielphase.
    expect(nach.phase).toBe('play');
    expect(nach.round).toBe(2);
  });

  it('ein Flieger genügt: Phase wird "fly", der Spieler ohne Flieger ist automatisch fertig', () => {
    const s = emptyState();
    put(s, 0, 0, 'rekrut');
    put(s, 1, 1, 'adler'); // fliegend
    const fly = bisFlugphase(s);
    expect(fly.players[0].flyDone).toBe(true); // keine Flieger → nichts zu tun
    expect(fly.players[1].flyDone).toBe(false);
    expect(fly.active).toBe(1); // der Zug geht an den, der noch fliegen darf
    expect(fly.log.at(-1)?.text).toContain('Fliegende Kreaturen');
  });

  it('flyDone des letzten Spielers beendet die Runde', () => {
    const s = emptyState();
    put(s, 1, 1, 'adler');
    const fly = bisFlugphase(s);
    const nach = applyAction(fly, 1, { type: 'flyDone' }, data);
    expect(nach.phase).toBe('play');
    expect(nach.round).toBe(2);
  });

  it('beide Seiten mit Fliegern: erst wenn beide fertig sind, endet die Runde', () => {
    const s = emptyState();
    put(s, 0, 0, 'pteranodon'); // fliegend
    put(s, 1, 1, 'adler');
    const fly = bisFlugphase(s);
    expect(fly.players[0].flyDone).toBe(false);
    expect(fly.players[1].flyDone).toBe(false);
    expect(fly.active).toBe(fly.startingPlayer);

    const nachErstem = applyAction(fly, fly.active, { type: 'flyDone' }, data);
    expect(nachErstem.phase).toBe('fly'); // der andere ist noch dran
    expect(nachErstem.active).not.toBe(fly.active);

    const nachZweitem = applyAction(nachErstem, nachErstem.active, { type: 'flyDone' }, data);
    expect(nachZweitem.phase).toBe('play');
    expect(nachZweitem.round).toBe(2);
  });
});

describe('Flug-Phase: Bewegung', () => {
  it('flyMove versetzt den Flieger und markiert ihn als bewegt', () => {
    const s = emptyState();
    put(s, 1, 1, 'adler');
    const fly = bisFlugphase(s);
    const nach = applyAction(fly, 1, { type: 'flyMove', fromLane: 1, toLane: 2 }, data);
    // Nach dem Zug hat Spieler 1 keinen beweglichen Flieger mehr → Runde endet.
    expect(nach.board[1][1]).toBeNull();
    expect(nach.board[1][2]?.cardId).toBe('adler');
    expect(nach.phase).toBe('play');
    expect(nach.round).toBe(2);
  });

  it('movedThisFlyPhase wird erst am Rundenende zurückgesetzt', () => {
    const s = emptyState();
    put(s, 0, 0, 'pteranodon');
    put(s, 1, 1, 'adler');
    const fly = bisFlugphase(s);
    const bewegt = applyAction(fly, fly.active, { type: 'flyMove', fromLane: fly.active === 0 ? 0 : 1, toLane: 2 }, data);
    const flieger = bewegt.board[fly.active][2]!;
    expect(flieger.movedThisFlyPhase).toBe(true);

    // Runde zu Ende bringen: der andere Spieler meldet sich ab.
    const naechsteRunde = applyAction(bewegt, bewegt.active, { type: 'flyDone' }, data);
    expect(naechsteRunde.round).toBe(2);
    expect(naechsteRunde.board[fly.active][2]?.movedThisFlyPhase).toBe(false);
  });

  it('ein zweiter Zug derselben Kreatur wird abgelehnt', () => {
    const s = emptyState();
    put(s, 0, 0, 'pteranodon');
    put(s, 1, 1, 'adler');
    const fly = bisFlugphase(s);
    const wer = fly.active;
    const von = wer === 0 ? 0 : 1;
    const bewegt = applyAction(fly, wer, { type: 'flyMove', fromLane: von, toLane: 2 }, data);
    // playerHasFlyers ist jetzt false → der Spieler wurde automatisch abgemeldet.
    expect(bewegt.players[wer].flyDone).toBe(true);
    expect(bewegt.active).not.toBe(wer);
    expect(() => applyAction(bewegt, wer, { type: 'flyMove', fromLane: 2, toLane: von }, data)).toThrow(
      /bewegt gerade seine fliegenden/
    );
  });

  it('mit zwei Fliegern bleibt der Spieler am Zug und die bereits bewegte Kreatur ist gesperrt', () => {
    const s = emptyState();
    put(s, 1, 0, 'adler');
    put(s, 1, 1, 'moewe'); // ebenfalls fliegend
    const fly = bisFlugphase(s);
    expect(fly.active).toBe(1);
    const nach = applyAction(fly, 1, { type: 'flyMove', fromLane: 0, toLane: 2 }, data);
    expect(nach.phase).toBe('fly'); // die Möwe darf noch
    expect(nach.active).toBe(1);
    expect(() => applyAction(nach, 1, { type: 'flyMove', fromLane: 2, toLane: 0 }, data)).toThrow(
      /schon geflogen/
    );
  });

  it('nicht fliegende Kreaturen, leere Lanes und besetzte Ziel-Lanes werden abgelehnt', () => {
    const s = emptyState();
    put(s, 1, 0, 'wolf'); // kann nicht fliegen
    put(s, 1, 1, 'adler');
    const fly = bisFlugphase(s);
    expect(() => applyAction(fly, 1, { type: 'flyMove', fromLane: 0, toLane: 2 }, data)).toThrow(
      /kann nicht fliegen/
    );
    expect(() => applyAction(fly, 1, { type: 'flyMove', fromLane: 2, toLane: 0 }, data)).toThrow(
      /keine eigene Kreatur/
    );
    expect(() => applyAction(fly, 1, { type: 'flyMove', fromLane: 1, toLane: 0 }, data)).toThrow(
      /Ziel-Lane ist nicht frei/
    );
    expect(() => applyAction(fly, 1, { type: 'flyMove', fromLane: 1, toLane: 99 }, data)).toThrow(
      /Ziel-Lane ist nicht frei/
    );
  });

  it('gegnerische Kreaturen blockieren das Ziel NICHT – nur eigene', () => {
    const s = emptyState();
    put(s, 1, 1, 'adler');
    put(s, 0, 2, 'rekrut', { exhausted: true }); // steht in Lane 2, aber auf der anderen Seite
    const fly = bisFlugphase(s);
    const nach = applyAction(fly, 1, { type: 'flyMove', fromLane: 1, toLane: 2 }, data);
    expect(nach.board[1][2]?.cardId).toBe('adler');
  });
});

describe('Flug-Phase: Abgrenzung zu anderen Phasen', () => {
  it('Ausspiel-Aktionen sind in der Flug-Phase gesperrt', () => {
    const s = emptyState();
    put(s, 1, 1, 'adler');
    s.players[1].hand = ['ratte'];
    const fly = bisFlugphase(s);
    expect(() => applyAction(fly, 1, { type: 'playCreature', handIndex: 0, lane: 0 }, data)).toThrow(
      /Gerade ist die Flug-Phase/
    );
    expect(() => applyAction(fly, 1, { type: 'pass' }, data)).toThrow(/Gerade ist die Flug-Phase/);
  });

  it('flyMove ist in der Ausspielphase gesperrt', () => {
    const s = emptyState();
    put(s, 0, 0, 'pteranodon');
    expect(() => applyAction(s, 0, { type: 'flyMove', fromLane: 0, toLane: 1 }, data)).toThrow(
      /in der Ausspielphase nicht möglich/
    );
    expect(() => applyAction(s, 0, { type: 'flyDone' }, data)).toThrow(
      /in der Ausspielphase nicht möglich/
    );
  });

  it('der wartende Spieler darf nicht handeln', () => {
    const s = emptyState();
    put(s, 0, 0, 'pteranodon');
    put(s, 1, 1, 'adler');
    const fly = bisFlugphase(s);
    const anderer = fly.active === 0 ? 1 : 0;
    expect(() => applyAction(fly, anderer, { type: 'flyDone' }, data)).toThrow(
      /Der andere Spieler bewegt gerade/
    );
  });
});

describe('Flug-Phase: Wechselwirkungen', () => {
  it('legaleAktionen liefert genau die Züge, die applyAction akzeptiert', () => {
    const s = emptyState();
    put(s, 1, 0, 'adler');
    put(s, 1, 1, 'moewe');
    const fly = bisFlugphase(s);
    const aktionen = legaleAktionen(fly, 1, data);
    // 2 Flieger × 1 freie Lane (Lane 2) + flyDone
    expect(aktionen).toHaveLength(3);
    expect(aktionen.filter((a) => a.type === 'flyDone')).toHaveLength(1);
    for (const aktion of aktionen) {
      expect(() => applyAction(fly, 1, aktion, data)).not.toThrow();
    }
  });

  it('entwaffnen (Eule) nimmt ein Ziel dauerhaft aus der Flug-Phase', () => {
    const s = emptyState();
    put(s, 1, 0, 'adler');
    s.players[0].hand = ['eule'];
    s.players[0].energy = 3;
    // Die Eule entfernt fliegend/flink beim Ausspielen von einem Gegner.
    const gespielt = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(gespielt.board[1][0]!.keywords).not.toContain('fliegend');

    const nach = passBoth(gespielt);
    // Nur noch die Eule selbst fliegt → Spieler 1 hat keine Flug-Optionen mehr.
    expect(nach.phase).toBe('fly');
    expect(nach.players[1].flyDone).toBe(true);
    expect(nach.players[0].flyDone).toBe(false);
    expect(nach.active).toBe(0);
    expect(legaleAktionen(nach, 1, data)).toEqual([{ type: 'flyDone' }]);
  });

  it('canFly in der Client-Sicht gilt nur für den Besitzer und nur vor dem Zug', () => {
    const s = emptyState();
    put(s, 1, 1, 'adler');
    put(s, 0, 0, 'pteranodon');
    const fly = bisFlugphase(s);

    const sichtEins = buildClientView(fly, 1, data);
    expect(sichtEins.board[1][1]!.canFly).toBe(true); // eigener Flieger
    expect(sichtEins.board[0][0]!.canFly).toBe(false); // gegnerischer Flieger nie

    const sichtNull = buildClientView(fly, 0, data);
    expect(sichtNull.board[0][0]!.canFly).toBe(true);
    expect(sichtNull.board[1][1]!.canFly).toBe(false);

    // Außerhalb der Flug-Phase ist canFly immer false.
    expect(buildClientView(emptyState(), 0, data).board[0][0]).toBeNull();
  });

  it('ein in der Flug-Phase verlassenes Duell trifft in der Folgerunde die Basis', () => {
    const s = emptyState();
    put(s, 1, 0, 'adler'); // 2 ATK, steht Lane 0 dem Rekrut gegenüber
    put(s, 0, 0, 'schildkroete'); // 0/7, blockt
    const fly = bisFlugphase(s);
    // Adler weicht in die freie Lane 2 aus → dort steht niemand.
    const nach = applyAction(fly, 1, { type: 'flyMove', fromLane: 0, toLane: 2 }, data);
    expect(nach.round).toBe(2);
    const basisVorher = nach.players[0].base;
    const nachKampf = passBoth(nach);
    expect(nachKampf.players[0].base).toBeLessThan(basisVorher);
    const basisTreffer = nachKampf.log.filter(
      (l) => l.event?.kind === 'attack' && l.event.toBase && l.event.lane === 2
    );
    expect(basisTreffer.length).toBeGreaterThan(0);
  });
});
