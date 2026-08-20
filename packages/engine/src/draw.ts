// Zentraler Kartenzieh-Pfad. Jeder reguläre und durch Fähigkeiten ausgelöste
// Ziehvorgang muss hierdurch laufen, damit Spielzustand und Telemetrie dieselbe
// physische Karteninstanz verschieben.

import { registriereZug, zaehleSpieler } from './stats.js';
import type { GameState, PlayerIndex } from './types.js';

export function zieheKarten(state: GameState, spieler: PlayerIndex, anzahl: number): number {
  let gezogen = 0;
  for (let i = 0; i < anzahl; i++) {
    const card = state.players[spieler].deck.shift();
    if (!card) break;
    if (state.players[spieler].hand.length >= (state.config.handLimit ?? 10)) {
      zaehleSpieler(state, spieler, 'kartenGezogen');
      continue;
    }
    state.players[spieler].hand.push(card);
    registriereZug(state, spieler);
    zaehleSpieler(state, spieler, 'kartenGezogen');
    gezogen += 1;
  }
  return gezogen;
}
