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
// Neu erzeugt nach Einführung des BASIS-SCHILDS (7 Abschnitte, Block + zufällige
// Superkraft, siehe schild.ts). Das ist eine bewusste Regeländerung: Treffer an
// der Basis werden jetzt teilweise geblockt, deshalb laufen die Partien im
// Schnitt ein bis zwei Runden länger. Decklisten und Kartenwerte sind unverändert.
const GOLDEN_MASTER: [string, string, number, string][] = [
  ['a1_rudeljaeger', 'a2_luftangriff', 5000, '1:14:-1:2:32'],
  ['a1_rudeljaeger', 'a3_gift_urgewalt', 5001, '1:11:0:8:21'],
  ['a1_rudeljaeger', 'a4_urzeitliches_rudel', 5002, '0:7:15:0:14'],
  ['a1_rudeljaeger', 'h1_solidaritaet', 5003, '0:6:15:0:12'],
  ['a1_rudeljaeger', 'h2_schicht', 5004, '1:14:0:11:31'],
  ['a1_rudeljaeger', 'h3_campus', 5005, '1:15:-2:2:32'],
  ['a2_luftangriff', 'a3_gift_urgewalt', 5006, '1:16:-1:5:34'],
  ['a2_luftangriff', 'a4_urzeitliches_rudel', 5007, '0:15:4:-2:34'],
  ['a2_luftangriff', 'h1_solidaritaet', 5008, '1:14:-1:4:28'],
  ['a2_luftangriff', 'h2_schicht', 5009, '0:17:1:-2:36'],
  ['a2_luftangriff', 'h3_campus', 5010, 'draw:16:0:-3:34'],
  ['a3_gift_urgewalt', 'a4_urzeitliches_rudel', 5011, '1:12:-1:11:25'],
  ['a3_gift_urgewalt', 'h1_solidaritaet', 5012, '0:14:3:0:29'],
  ['a3_gift_urgewalt', 'h2_schicht', 5013, '0:15:2:-1:29'],
  ['a3_gift_urgewalt', 'h3_campus', 5014, '1:15:0:7:27'],
  ['a4_urzeitliches_rudel', 'h1_solidaritaet', 5015, '0:11:7:0:22'],
  ['a4_urzeitliches_rudel', 'h2_schicht', 5016, '0:17:4:-2:38'],
  ['a4_urzeitliches_rudel', 'h3_campus', 5017, '1:14:0:9:27'],
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
