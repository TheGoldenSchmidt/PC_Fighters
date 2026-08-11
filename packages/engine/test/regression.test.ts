// Golden-Master-Regressionstest für die Partie-Simulation (simulate.ts).
//
// Das ist ein CHARAKTERISIERUNGSTEST, kein Verhaltens-Vertrag: er hält fest,
// was die Simulation HEUTE tut, damit ein Refactor (insbesondere die
// Ability-Registry in Phase 5) nachweisbar NICHTS am Spielverhalten ändert.
// Bei einer BEWUSSTEN Regeländerung (Phase 6+: neue Gift-Schwelle, Zermürbung,
// V2-Kartendaten, …) SOLL sich der Hash ändern – dann diese Tabelle mit
// `npx tsx scripts/backtest/erzeuge-golden-master.ts` neu erzeugen und im
// selben Commit wie die Regeländerung aktualisieren, mit Begründung in der
// Commit-Message. Ein unerwarteter Diff ohne eine solche Begründung ist ein
// Bug.
//
// epsilonBand:0 (siehe bot.ts) macht den Bot für diesen Test streng
// deterministisch bestmöglich (keine Zufalls-Tiebreaks unter nahezu gleich
// guten Zügen) – das reduziert False Positives durch winzige
// Bewertungsverschiebungen, die die beste Zugwahl nicht ändern.

import { describe, expect, it } from 'vitest';
import {
  BOT_PROFILE,
  ladeAktiveDecks,
  loadGameData,
  spielePartie,
  zustandsFingerabdruck
} from '../src/index.js';
import type { BotProfil } from '../src/index.js';

const data = loadGameData();
const decks = ladeAktiveDecks(data);
const profil: BotProfil = { ...BOT_PROFILE.ausgewogen, epsilonBand: 0 };

/**
 * deckA, deckB, Saat, lesbarer Kurzstand und Fingerabdruck des Endzustands.
 *
 * Der Golden Master folgt bewusst `deck-status.json`: Er prüft jede Paarung
 * der vier veröffentlichten Alpha-Decks in beiden Sitzordnungen. Inaktive
 * Legacy-Presets werden weiterhin als Deckdaten validiert, gehören aber nicht
 * zum Verhaltensvertrag der aktuellen Alpha.
 */
// Neu erzeugt am 2026-08-09, nachdem Test und Generator auf die vier in
// `deck-status.json` freigegebenen Alpha-Decks umgestellt wurden. Jede der
// sechs Paarungen läuft in beiden Sitzordnungen; zusätzlich zum lesbaren
// Kurzstand wird der vollständige deterministische Endzustand fingerprinted.
// Neu erzeugt nach dem finalen Alpha-Balancing vom 2026-08-02: 10 statt 12
// Basisleben sowie die bewusst angepassten Werte von T-Rex und PC Principal.
// Die geänderte Konfiguration beeinflusst jede Partie.
//
// Davor: neu erzeugt, nachdem der Bot Schild und Basis-Immunitaet SIEHT. Beides fehlte
// in `bewerteZustand`; „Sicherer Raum" sah fuer ihn aus wie ein verschenkter
// Bankplatz. Die Spielregeln sind unveraendert – nur die Zugwahl des Bots.
//
// Davor: neu erzeugt nach der Feld- und Tempo-Aenderung: 5 statt 3 Bahnen und
// Zermuerbung erst ab Runde 15 statt 13. Beides sind Zahlen in config.json,
// aendert aber jede Partie von Grund auf. Bewusste Regeländerung – Decklisten
// und Kartenwerte sind unverändert.
//
// Davor: neu erzeugt, nachdem die BANK ZUM SCHILD geworden ist: Der Basis-Schild hat
// keine eigenen Superkräfte mehr, ein Block wird mit einem Cheerleader-Opfer
// bezahlt, und ohne Cheerleader gibt es gar keinen Schild. Damit fallen die
// alten Auslöser (Ausspielen, eigener Tod) weg und alle fünf Kräfte sind neu
// geschrieben. Bewusste Regeländerung – Decklisten und Kartenwerte sind
// unverändert.
//
// Davor: neu erzeugt nach Einführung der Cheerleader-Superkräfte, und davor
// nach Einführung des Basis-Schilds.
const GOLDEN_MASTER: [string, string, number, string, string][] = [
  ['forschung_muskelkraft', 'rudeljaeger', 5000, '1:5:0:10:11', 'c3ff8929'],
  ['rudeljaeger', 'forschung_muskelkraft', 5001, '1:9:-4:1:21', '2231ff25'],
  ['forschung_muskelkraft', 'solidaritaet_ueberleben', 5002, '0:10:6:-2:24', 'aab39f6d'],
  ['solidaritaet_ueberleben', 'forschung_muskelkraft', 5003, '0:9:4:-5:18', 'c673c8f7'],
  ['forschung_muskelkraft', 'urzeitliche_kolosse', 5004, '0:6:6:-2:12', '3fe5d753'],
  ['urzeitliche_kolosse', 'forschung_muskelkraft', 5005, '0:5:7:0:8', 'c44ca8a0'],
  ['rudeljaeger', 'solidaritaet_ueberleben', 5006, '0:6:6:-1:14', 'e209b0e1'],
  ['solidaritaet_ueberleben', 'rudeljaeger', 5007, '0:14:1:-3:33', '73c04bea'],
  ['rudeljaeger', 'urzeitliche_kolosse', 5008, '1:9:-1:4:24', 'dc937fcd'],
  ['urzeitliche_kolosse', 'rudeljaeger', 5009, '1:8:0:5:18', '7d3a02fd'],
  ['solidaritaet_ueberleben', 'urzeitliche_kolosse', 5010, '0:5:6:0:9', '29e3ff0f'],
  ['urzeitliche_kolosse', 'solidaritaet_ueberleben', 5011, '1:10:-4:4:23', '42f8baec']
];

describe('Golden Master: Partie-Simulation bleibt bei Refactors unverändert', () => {
  it.each(GOLDEN_MASTER)(
    '%s vs %s (Saat %i)',
    (deckAId, deckBId, saat, erwarteterKurzstand, erwarteterZustand) => {
      const r = spielePartie(data, decks[deckAId], decks[deckBId], {
        saat,
        profilA: profil,
        profilB: profil
      });
      const kurzstand = `${r.gewinner}:${r.runden}:${r.endState.players[0].base}:${r.endState.players[1].base}:${r.endState.uidCounter}`;
      expect(kurzstand).toBe(erwarteterKurzstand);
      expect(zustandsFingerabdruck(r.endState)).toBe(erwarteterZustand);
    }
  );
});
