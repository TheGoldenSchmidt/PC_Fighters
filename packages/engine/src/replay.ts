import { applyAction, createGame } from './game.js';
import { createSeededRandom } from './rng.js';
import { zustandsFingerabdruck } from './simulate.js';
import type { PartieReplay } from './simulate.js';
import type { DeckList, GameData, GameState } from './types.js';

export interface ReplayPruefung {
  state: GameState;
  korrekt: boolean;
  fehlerIndex?: number;
  erwartet?: string;
  erhalten?: string;
}

/**
 * Fuehrt ausschliesslich die gespeicherten Spieleraktionen erneut durch. Damit
 * prueft ein Replay nicht den Bot, sondern den eigentlichen Engine-Vertrag.
 */
export function wiederholeReplay(
  data: GameData,
  deckA: DeckList,
  deckB: DeckList,
  replay: PartieReplay
): ReplayPruefung {
  const random = createSeededRandom(replay.saat);
  let state = createGame(
    data,
    [deckA.faction ?? 'humans', deckB.faction ?? 'animals'],
    random,
    [deckA, deckB],
    replay.cheerleaders
  );
  state.startingPlayer = replay.startspieler;
  state.active = replay.startspieler;
  state.logModus = 'aus';
  for (const eintrag of replay.aktionen) {
    if (eintrag.aktion.type === 'mulligan') {
      // waehleMulligan verbraucht in der Originalsimulation genau einen Wert
      // fuer die Auswahl unter gleich guten Kandidaten. Die Aktion ist bereits
      // gespeichert; fuer denselben anschliessenden Deck-Shuffle muss der
      // gemeinsame Seed-Strom dennoch um diesen Wert weitergeschoben werden.
      random();
      state = applyAction(state, eintrag.spieler, eintrag.aktion, data, random);
    } else {
      state = applyAction(state, eintrag.spieler, eintrag.aktion, data);
    }
    const erhalten = zustandsFingerabdruck(state);
    if (erhalten !== eintrag.zustand) {
      return {
        state,
        korrekt: false,
        fehlerIndex: eintrag.index,
        erwartet: eintrag.zustand,
        erhalten
      };
    }
  }
  const erhalten = zustandsFingerabdruck(state);
  return erhalten === replay.endzustand
    ? { state, korrekt: true }
    : { state, korrekt: false, erwartet: replay.endzustand, erhalten };
}
