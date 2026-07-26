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
// Neu erzeugt nach Einführung des Mulligans und der anschließenden
// Korridor-Iteration. Decklisten und Mechaniken blieben unverändert; angepasst
// wurden ausschließlich numerische Kartenwerte.
const GOLDEN_MASTER: [string, string, number, string][] = [
  ['a1_rudeljaeger', 'a2_luftangriff', 5000, '0:12:13:-1:28'],
  ['a1_rudeljaeger', 'a3_gift_urgewalt', 5001, '1:12:-2:8:25'],
  ['a1_rudeljaeger', 'a4_urzeitliches_rudel', 5002, '1:11:-1:3:25'],
  ['a1_rudeljaeger', 'h1_solidaritaet', 5003, '0:9:15:0:21'],
  ['a1_rudeljaeger', 'h2_schicht', 5004, '0:15:2:-2:34'],
  ['a1_rudeljaeger', 'h3_campus', 5005, '1:14:0:4:29'],
  ['a2_luftangriff', 'a3_gift_urgewalt', 5006, '1:15:-2:8:33'],
  ['a2_luftangriff', 'a4_urzeitliches_rudel', 5007, '1:12:0:1:27'],
  ['a2_luftangriff', 'h1_solidaritaet', 5008, '1:9:0:9:19'],
  ['a2_luftangriff', 'h2_schicht', 5009, 'draw:16:-2:-1:35'],
  ['a2_luftangriff', 'h3_campus', 5010, '1:15:-1:1:29'],
  ['a3_gift_urgewalt', 'a4_urzeitliches_rudel', 5011, '1:8:-2:11:14'],
  ['a3_gift_urgewalt', 'h1_solidaritaet', 5012, '0:12:10:-3:21'],
  ['a3_gift_urgewalt', 'h2_schicht', 5013, '1:13:0:8:23'],
  ['a3_gift_urgewalt', 'h3_campus', 5014, '1:13:0:8:23'],
  ['a4_urzeitliches_rudel', 'h1_solidaritaet', 5015, '1:12:-4:1:24'],
  ['a4_urzeitliches_rudel', 'h2_schicht', 5016, '0:11:15:-1:22'],
  ['a4_urzeitliches_rudel', 'h3_campus', 5017, '0:14:5:0:29'],
  ['h1_solidaritaet', 'h2_schicht', 5018, '1:11:0:12:21'],
  ['h1_solidaritaet', 'h3_campus', 5019, '1:13:0:8:19']
];

describe('Golden Master: Partie-Simulation bleibt bei Refactors unverändert', () => {
  it.each(GOLDEN_MASTER)('%s vs %s (Saat %i)', (deckAId, deckBId, saat, erwarteterHash) => {
    const r = spielePartie(data, decks[deckAId], decks[deckBId], { saat, profilA: profil, profilB: profil });
    const hash = `${r.gewinner}:${r.runden}:${r.endState.players[0].base}:${r.endState.players[1].base}:${r.endState.uidCounter}`;
    expect(hash).toBe(erwarteterHash);
  });
});
