// Basis-Schild.
//
// Jeder Treffer auf eine Basis läuft durch basisSchaden(). Der lädt zuerst den
// Schild des Verteidigers zufällig auf; erreicht der Schild seine volle Zahl an
// Abschnitten, wird GENAU DIESER Treffer komplett geblockt und der Schild geht
// auf 0 zurück.
//
// Im Champ-Spiel verbraucht ein Block einen von drei Superblocks und gibt eine
// noch übrige Champ-Superkraft. Historische Zustände ohne Champ-Felder können
// weiterhin das frühere Bankfenster durchlaufen.
//
// Warum ein eigenes Modul: basisSchaden() wird von game.ts, abilities.ts UND
// effects.ts gebraucht, muss also unterhalb von abilities.ts liegen. Deshalb
// importiert diese Datei nur types/internal/rng – kein Zirkelimport.

import { log } from './internal.js';
import { wuerfle } from './rng.js';
import type { GameState, PlayerIndex, SchildEvent } from './types.js';

/** Champ-Spiel: verbleibende Blocks; historische Zustände: besetzte Bank. */
export function schildAktiv(state: GameState, spieler: PlayerIndex): boolean {
  if (!state.config.schild) return false;
  if (state.players[spieler].blocksRemaining != null) {
    return (state.players[spieler].blocksRemaining ?? 0) > 0;
  }
  return state.players[spieler].cheerleaders.some((cardId) => cardId !== null);
}

/**
 * Einzige Stelle, an der die Basis Kampf- oder Effektschaden nimmt (Zermürbung
 * ist bewusst ausgenommen und rechnet weiterhin direkt auf `base`).
 *
 * Reihenfolge: erst laden, dann prüfen – ein Treffer, der den Schild voll macht,
 * wird selbst schon geblockt.
 *
 * @returns den TATSÄCHLICH angerichteten Schaden (0 = geblockt oder immun).
 */
export function basisSchaden(
  state: GameState,
  ziel: PlayerIndex,
  menge: number,
  optionen: { bullseye?: boolean } = {}
): number {
  if (menge <= 0) return 0;
  const p = state.players[ziel];

  if (p.basisImmun) {
    log(state, `Schutzschild: der Treffer auf Spieler ${ziel + 1} verpufft (${menge} Schaden verhindert).`);
    return 0;
  }

  const cfg = state.config.schild;
  // Kein Schild – weil die Regel abgeschaltet oder das Block-Kontingent leer ist.
  if (!cfg || !schildAktiv(state, ziel) || optionen.bullseye) {
    p.base -= menge;
    return menge;
  }

  const ladung = wuerfle(state, cfg.ladung.min, cfg.ladung.max);
  p.schild += ladung;

  if (p.schild >= cfg.abschnitte) {
    p.schild = 0;
    if (p.blocksRemaining != null) p.blocksRemaining = Math.max(0, p.blocksRemaining - 1);
    const ereignis: SchildEvent = {
      kind: 'schild',
      owner: ziel,
      ladung,
      stand: 0,
      abschnitte: cfg.abschnitte,
      blockiert: true
    };
    log(state, `Schild von Spieler ${ziel + 1} blockt den Angriff (${menge} Schaden verhindert)!`, ereignis);
    // Die eigentliche Auswahl darf nicht tief in der Schadensabrechnung
    // geöffnet werden. Die Auflösungsmaschine zeigt nach diesem Treffer die
    // drei verbliebenen Cheerleader-Superkräfte an.
    state.aufloesung.unshift({ art: 'schildFenster', spieler: ziel });
    return 0;
  }

  log(
    state,
    `Schild von Spieler ${ziel + 1} lädt sich um ${ladung} auf (${p.schild}/${cfg.abschnitte}).`,
    { kind: 'schild', owner: ziel, ladung, stand: p.schild, abschnitte: cfg.abschnitte }
  );
  p.base -= menge;
  return menge;
}
