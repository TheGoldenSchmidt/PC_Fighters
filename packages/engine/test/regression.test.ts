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
// Neu erzeugt, nachdem die BANK ZUM SCHILD geworden ist: Der Basis-Schild hat
// keine eigenen Superkräfte mehr, ein Block wird mit einem Cheerleader-Opfer
// bezahlt, und ohne Cheerleader gibt es gar keinen Schild. Damit fallen die
// alten Auslöser (Ausspielen, eigener Tod) weg und alle fünf Kräfte sind neu
// geschrieben. Bewusste Regeländerung – Decklisten und Kartenwerte sind
// unverändert.
//
// Davor: neu erzeugt nach Einführung der Cheerleader-Superkräfte, und davor
// nach Einführung des Basis-Schilds.
const GOLDEN_MASTER: [string, string, number, string][] = [
  ['a1_rudeljaeger', 'a2_luftangriff', 5000, '1:14:0:5:30'],
  ['a1_rudeljaeger', 'a3_gift_urgewalt', 5001, '1:15:-2:2:30'],
  ['a1_rudeljaeger', 'a4_urzeitliches_rudel', 5002, '1:14:-2:6:27'],
  ['a1_rudeljaeger', 'h1_solidaritaet', 5003, '1:10:-1:4:22'],
  ['a1_rudeljaeger', 'h2_schicht', 5004, '1:16:-1:2:37'],
  ['a1_rudeljaeger', 'h3_campus', 5005, '0:16:1:-1:34'],
  ['a2_luftangriff', 'a3_gift_urgewalt', 5006, '1:16:-1:5:34'],
  ['a2_luftangriff', 'a4_urzeitliches_rudel', 5007, '0:15:1:0:32'],
  ['a2_luftangriff', 'h1_solidaritaet', 5008, '1:14:-1:6:29'],
  ['a2_luftangriff', 'h2_schicht', 5009, '0:17:1:-2:36'],
  ['a2_luftangriff', 'h3_campus', 5010, 'draw:16:0:-3:34'],
  ['a3_gift_urgewalt', 'a4_urzeitliches_rudel', 5011, 'draw:15:0:-1:33'],
  ['a3_gift_urgewalt', 'h1_solidaritaet', 5012, '1:15:-2:1:23'],
  ['a3_gift_urgewalt', 'h2_schicht', 5013, '0:15:2:-1:29'],
  ['a3_gift_urgewalt', 'h3_campus', 5014, '0:16:2:-1:28'],
  ['a4_urzeitliches_rudel', 'h1_solidaritaet', 5015, '0:15:1:-1:28'],
  ['a4_urzeitliches_rudel', 'h2_schicht', 5016, 'draw:16:-3:-1:35'],
  ['a4_urzeitliches_rudel', 'h3_campus', 5017, '1:15:-2:1:28'],
  ['h1_solidaritaet', 'h2_schicht', 5018, '1:11:-1:15:19'],
  ['h1_solidaritaet', 'h3_campus', 5019, '1:15:0:5:26']
];

describe('Golden Master: Partie-Simulation bleibt bei Refactors unverändert', () => {
  it.each(GOLDEN_MASTER)('%s vs %s (Saat %i)', (deckAId, deckBId, saat, erwarteterHash) => {
    const r = spielePartie(data, decks[deckAId], decks[deckBId], { saat, profilA: profil, profilB: profil });
    const hash = `${r.gewinner}:${r.runden}:${r.endState.players[0].base}:${r.endState.players[1].base}:${r.endState.uidCounter}`;
    expect(hash).toBe(erwarteterHash);
  });
});
