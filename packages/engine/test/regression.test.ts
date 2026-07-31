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
// Neu erzeugt, nachdem der Bot Schild und Basis-Immunitaet SIEHT. Beides fehlte
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
  ['a1_rudeljaeger', 'a2_luftangriff', 5000, '1:14:0:4:33'],
  ['a1_rudeljaeger', 'a3_gift_urgewalt', 5001, '1:14:-3:9:31'],
  ['a1_rudeljaeger', 'a4_urzeitliches_rudel', 5002, '0:10:2:0:23'],
  ['a1_rudeljaeger', 'h1_solidaritaet', 5003, '1:9:-1:4:23'],
  ['a1_rudeljaeger', 'h2_schicht', 5004, '0:6:7:0:14'],
  ['a1_rudeljaeger', 'h3_campus', 5005, '1:12:-1:8:30'],
  ['a2_luftangriff', 'a3_gift_urgewalt', 5006, '0:16:1:0:37'],
  ['a2_luftangriff', 'a4_urzeitliches_rudel', 5007, '1:10:0:3:23'],
  ['a2_luftangriff', 'h1_solidaritaet', 5008, '0:12:7:0:28'],
  ['a2_luftangriff', 'h2_schicht', 5009, '0:11:8:-2:28'],
  ['a2_luftangriff', 'h3_campus', 5010, '0:12:8:-2:32'],
  ['a3_gift_urgewalt', 'a4_urzeitliches_rudel', 5011, '1:9:-2:3:20'],
  ['a3_gift_urgewalt', 'h1_solidaritaet', 5012, '1:13:0:5:28'],
  ['a3_gift_urgewalt', 'h2_schicht', 5013, '1:16:-1:4:34'],
  ['a3_gift_urgewalt', 'h3_campus', 5014, '1:16:-2:1:35'],
  ['a4_urzeitliches_rudel', 'h1_solidaritaet', 5015, '1:9:-2:8:18'],
  ['a4_urzeitliches_rudel', 'h2_schicht', 5016, '1:12:-3:3:29'],
  ['a4_urzeitliches_rudel', 'h3_campus', 5017, '1:13:-1:9:30'],
  ['h1_solidaritaet', 'h2_schicht', 5018, '0:14:8:0:31'],
  ['h1_solidaritaet', 'h3_campus', 5019, '0:15:6:0:34']
];

describe('Golden Master: Partie-Simulation bleibt bei Refactors unverändert', () => {
  it.each(GOLDEN_MASTER)('%s vs %s (Saat %i)', (deckAId, deckBId, saat, erwarteterHash) => {
    const r = spielePartie(data, decks[deckAId], decks[deckBId], { saat, profilA: profil, profilB: profil });
    const hash = `${r.gewinner}:${r.runden}:${r.endState.players[0].base}:${r.endState.players[1].base}:${r.endState.uidCounter}`;
    expect(hash).toBe(erwarteterHash);
  });
});
