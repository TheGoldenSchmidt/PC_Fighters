// Seedbarer Zufallsgenerator für reproduzierbare Partien und Backtests.
// createGame() akzeptiert eine beliebige `() => number`-Funktion als `random`-
// Parameter (Default Math.random); nach der Deck-Initialisierung ruft die
// Engine selbst keinen Zufall mehr auf (siehe game.ts) – bei injiziertem Seed
// ist eine Partie damit vollständig deterministisch.

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
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
