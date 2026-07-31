// Basis-Schild.
//
// Jeder Treffer auf eine Basis läuft durch basisSchaden(). Der lädt zuerst den
// Schild des Verteidigers zufällig auf; erreicht der Schild seine volle Zahl an
// Abschnitten, wird GENAU DIESER Treffer komplett geblockt und der Schild geht
// auf 0 zurück.
//
// Die Bank IST der Schild: Was ein Block bewirkt, entscheidet der Cheerleader,
// der sich dafür opfert. Deshalb gibt es hier keine Superkräfte mehr – der
// Block plant nur einen `schildFenster`-Schritt ein, den die Schrittmaschine in
// game.ts abarbeitet. Direkt ein Fenster zu öffnen wäre falsch: basisSchaden()
// steckt mitten in einer laufenden Schadensabrechnung.
//
// Zweite Folge derselben Regel: Ohne Cheerleader auf der Bank gibt es KEINEN
// Schild. Treffer gehen dann ungehindert durch, und der Ladebalken bewegt sich
// nicht mehr.
//
// Warum ein eigenes Modul: basisSchaden() wird von game.ts, abilities.ts UND
// effects.ts gebraucht, muss also unterhalb von abilities.ts liegen. Deshalb
// importiert diese Datei nur types/internal/rng – kein Zirkelimport.

import { log } from './internal.js';
import { wuerfle } from './rng.js';
import type { GameState, PlayerIndex, SchildEvent } from './types.js';

/** Sitzt überhaupt noch jemand auf der Bank? Nur dann existiert ein Schild. */
export function schildAktiv(state: GameState, spieler: PlayerIndex): boolean {
  if (!state.config.schild) return false;
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
export function basisSchaden(state: GameState, ziel: PlayerIndex, menge: number): number {
  if (menge <= 0) return 0;
  const p = state.players[ziel];

  if (p.basisImmun) {
    log(state, `Schutzschild: der Treffer auf Spieler ${ziel + 1} verpufft (${menge} Schaden verhindert).`);
    return 0;
  }

  const cfg = state.config.schild;
  // Kein Schild – weil die Regel abgeschaltet ist ODER die Bank leer ist.
  // Beides ist derselbe Fall: der Treffer geht voll durch.
  if (!cfg || !schildAktiv(state, ziel)) {
    p.base -= menge;
    return menge;
  }

  const ladung = wuerfle(state, cfg.ladung.min, cfg.ladung.max);
  p.schild += ladung;

  if (p.schild >= cfg.abschnitte) {
    p.schild = 0;
    const ereignis: SchildEvent = {
      kind: 'schild',
      owner: ziel,
      ladung,
      stand: 0,
      abschnitte: cfg.abschnitte,
      blockiert: true
    };
    log(state, `Schild von Spieler ${ziel + 1} blockt den Angriff (${menge} Schaden verhindert)!`, ereignis);
    // Die Bank zahlt den Block. Vorne einreihen, damit das Fenster direkt nach
    // dem laufenden Schritt aufgeht und nicht erst am Ende der Auflösung.
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
