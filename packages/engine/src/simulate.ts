// Reine Partie-Simulation: treibt eine komplette Partie über den Heuristik-Bot
// (bot.ts) an, ohne I/O (kein Datei-/Netzwerkzugriff hier). Wird sowohl vom
// Backtest-CLI (scripts/backtest/) als auch vom Golden-Master-Regressionstest
// genutzt – eine einzige Simulationsschleife, damit beide garantiert
// dasselbe Verhalten treiben.

import { BOT_PROFILE, waehleAktion, waehleMulligan } from './bot.js';
import { applyAction, createGame } from './game.js';
import { createSeededRandom } from './rng.js';
import { aktiviereStatistik, finalisiereStatistik, markiereLegaleHandkarten } from './stats.js';
import { legaleAktionen } from './legal.js';
import type { BotProfil } from './bot.js';
import type {
  CheerleaderSelection,
  DeckList,
  GameData,
  GameState,
  MatchStatistik,
  PlayerIndex
} from './types.js';

export interface PartieErgebnis {
  gewinner: PlayerIndex | 'draw';
  runden: number;
  /** true = die Partie endete über das technische roundLimit (Notbremse), nicht durch Basiszerstörung. */
  amRundenlimit: boolean;
  startspieler: PlayerIndex;
  stats: MatchStatistik;
  endState: GameState;
}

export interface PartieOptionen {
  saat: number;
  profilA?: BotProfil;
  profilB?: BotProfil;
  /** Sicherheitsnetz gegen Endlosschleifen bei Datenfehlern (nicht das Spiel-roundLimit). */
  maxSchritte?: number;
  /**
   * Bank-Auswahl je Spieler. Ohne Angabe greift die Standardauswahl (die ersten
   * gültigen Kandidaten) – dann kommen Kräfte am Ende des Kandidatenpools in
   * keiner simulierten Partie vor. Der Backtest rotiert deshalb bewusst.
   */
  cheerleaders?: [CheerleaderSelection, CheerleaderSelection];
}

/**
 * Spielt eine komplette Partie deckA (Spieler 0) gegen deckB (Spieler 1) mit
 * dem Heuristik-Bot auf beiden Seiten. Deterministisch bei gleicher `saat`
 * (siehe rng.ts) – zwei Aufrufe mit identischen Argumenten liefern exakt
 * dasselbe Ergebnis.
 */
export function spielePartie(
  data: GameData,
  deckA: DeckList,
  deckB: DeckList,
  opts: PartieOptionen
): PartieErgebnis {
  const random = createSeededRandom(opts.saat);
  const profilA = opts.profilA ?? BOT_PROFILE.ausgewogen;
  const profilB = opts.profilB ?? BOT_PROFILE.ausgewogen;
  let s = createGame(
    data,
    [deckA.faction ?? 'humans', deckB.faction ?? 'animals'],
    random,
    [deckA, deckB],
    opts.cheerleaders
  );
  aktiviereStatistik(s);
  s.logModus = 'aus'; // Massensimulation: Log-Wachstum ist der dominante Klon-Kostenfaktor.
  const startspieler = s.startingPlayer;
  s = applyAction(s, 0, waehleMulligan(s, 0, data, random), data, random);
  s = applyAction(s, 1, waehleMulligan(s, 1, data, random), data, random);

  const maxSchritte = opts.maxSchritte ?? 2000;
  let schritte = 0;
  while (s.phase !== 'ended' && schritte < maxSchritte) {
    const profil = s.active === 0 ? profilA : profilB;
    const legal = legaleAktionen(s, s.active, data);
    markiereLegaleHandkarten(s, s.active, legal.flatMap((a) =>
      a.type === 'playCreature' || a.type === 'playAction' ? [a.handIndex] : []
    ));
    const aktion = waehleAktion(s, s.active, data, profil, random);
    s = applyAction(s, s.active, aktion, data);
    schritte += 1;
  }
  if (s.phase !== 'ended') {
    throw new Error(`Partie terminierte nicht nach ${maxSchritte} Schritten (Saat ${opts.saat}).`);
  }
  finalisiereStatistik(s);

  return {
    gewinner: s.winner as PlayerIndex | 'draw',
    runden: s.round,
    amRundenlimit: s.round >= s.config.roundLimit,
    startspieler,
    stats: s.stats!,
    endState: s
  };
}
