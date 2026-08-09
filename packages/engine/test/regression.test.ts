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
import { BOT_PROFILE, ladeDecks, loadGameData, spielePartie } from '../src/index.js';
import type { BotProfil } from '../src/index.js';

const data = loadGameData();
const decks = ladeDecks(data);
const profil: BotProfil = { ...BOT_PROFILE.ausgewogen, epsilonBand: 0 };

/** deckA, deckB, Saat, erwarteter Hash `sieger:runden:basisA:basisB:uidCounter`. */
// Neu erzeugt, weil der Basis-Schild jetzt ACHT statt sieben Abschnitte hat:
// ein Treffer laedt ihn um 1/8 bis 3/8 statt um 1/7 bis 3/7. Ein Block braucht
// dadurch im Schnitt vier Treffer statt dreieinhalb, faellt also seltener –
// bewusste Regeländerung, Decklisten und Kartenwerte sind unverändert.
//
// Bei dieser Gelegenheit deckt die Tabelle wieder ab, was der Generator
// tatsächlich aufzählt: Seit die vier Alpha-Decks (`forschung_muskelkraft`,
// `rudeljaeger`, `solidaritaet_ueberleben`, `urzeitliche_kolosse`) unter
// `data/decks/` liegen, gehören sie zur Paarung – die alte Liste kannte nur die
// sieben a*/h*-Decks und die neuen Decks liefen ungeprüft mit. Ab Saat 5003
// verschieben sich dadurch auch die Paarungen selbst.
//
// Davor: neu erzeugt nach dem finalen Alpha-Balancing vom 2026-08-02: 10 statt 12
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
const GOLDEN_MASTER: [string, string, number, string][] = [
  ['a1_rudeljaeger', 'a2_luftangriff', 5000, '0:7:3:-2:17'],
  ['a1_rudeljaeger', 'a3_gift_urgewalt', 5001, '0:7:9:-2:18'],
  ['a1_rudeljaeger', 'a4_urzeitliches_rudel', 5002, '0:7:7:0:16'],
  ['a1_rudeljaeger', 'forschung_muskelkraft', 5003, '0:5:4:-2:10'],
  ['a1_rudeljaeger', 'h1_solidaritaet', 5004, '0:7:4:0:19'],
  ['a1_rudeljaeger', 'h2_schicht', 5005, '1:7:-1:1:17'],
  ['a1_rudeljaeger', 'h3_campus', 5006, '0:8:9:-2:18'],
  ['a1_rudeljaeger', 'rudeljaeger', 5007, '0:5:5:0:13'],
  ['a1_rudeljaeger', 'solidaritaet_ueberleben', 5008, '1:7:-2:2:16'],
  ['a1_rudeljaeger', 'urzeitliche_kolosse', 5009, '1:12:0:1:29'],
  ['a2_luftangriff', 'a3_gift_urgewalt', 5010, '0:6:9:0:14'],
  ['a2_luftangriff', 'a4_urzeitliches_rudel', 5011, '0:10:8:-4:24'],
  ['a2_luftangriff', 'forschung_muskelkraft', 5012, '0:5:10:-2:9'],
  ['a2_luftangriff', 'h1_solidaritaet', 5013, '1:8:-3:7:22'],
  ['a2_luftangriff', 'h2_schicht', 5014, '1:10:0:1:25'],
  ['a2_luftangriff', 'h3_campus', 5015, '0:13:1:-1:30'],
  ['a2_luftangriff', 'rudeljaeger', 5016, '0:11:3:-1:24'],
  ['a2_luftangriff', 'solidaritaet_ueberleben', 5017, '0:8:2:-2:18'],
  ['a2_luftangriff', 'urzeitliche_kolosse', 5018, '0:6:1:-2:11'],
  ['a3_gift_urgewalt', 'a4_urzeitliches_rudel', 5019, '1:6:-1:10:11']
];

describe('Golden Master: Partie-Simulation bleibt bei Refactors unverändert', () => {
  it.each(GOLDEN_MASTER)('%s vs %s (Saat %i)', (deckAId, deckBId, saat, erwarteterHash) => {
    const r = spielePartie(data, decks[deckAId], decks[deckBId], { saat, profilA: profil, profilB: profil });
    const hash = `${r.gewinner}:${r.runden}:${r.endState.players[0].base}:${r.endState.players[1].base}:${r.endState.uidCounter}`;
    expect(hash).toBe(erwarteterHash);
  });
});
