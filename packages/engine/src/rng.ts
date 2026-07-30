// Seedbarer Zufallsgenerator für reproduzierbare Partien und Backtests.
// createGame() akzeptiert eine beliebige `() => number`-Funktion als `random`-
// Parameter (Default Math.random). Daraus wird einmalig `state.rngState`
// gezogen; jeden weiteren Zufall im Spielverlauf (Schild-Ladung, Superkraft-
// Auswahl) liefert `wuerfle()` aus genau diesem State-Feld – bei injiziertem
// Seed ist eine Partie damit vollständig deterministisch.

import type { GameState } from './types.js';

/** Ein mulberry32-Schritt: aus dem Zustand `a` wird [Wert in [0,1), neuer Zustand]. */
function schritt(a: number): [number, number] {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

/**
 * Erzeugt eine deterministische Zufallsfunktion aus einem 32-Bit-Seed
 * (mulberry32: klein, schnell, für Spielsimulationen ausreichend – kein
 * kryptografischer Anspruch). Zwei Aufrufe mit demselben Seed liefern exakt
 * dieselbe Zahlenfolge in [0, 1).
 */
export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function random(): number {
    a |= 0;
    const [wert, naechster] = schritt(a);
    a = naechster;
    return wert;
  };
}

/**
 * Zieht eine ganze Zahl aus [min, max] (beide inklusive) aus dem im GameState
 * mitgeführten RNG-Zustand und schreibt den fortgeschrittenen Zustand zurück.
 *
 * Anders als eine Closure übersteht das sowohl das `structuredClone` in
 * `applyAction` als auch die JSON-Persistenz des Servers (`saveRooms`).
 */
export function wuerfle(state: GameState, min: number, max: number): number {
  // Räume, die vor Einführung des Schilds auf Platte geschrieben wurden, haben
  // kein rngState-Feld – dann einmalig neu seeden statt NaN zu produzieren.
  const aktuell = typeof state.rngState === 'number' ? state.rngState : Date.now() >>> 0;
  const [wert, naechster] = schritt(aktuell | 0);
  state.rngState = naechster;
  if (max <= min) return min;
  return min + Math.floor(wert * (max - min + 1));
}
