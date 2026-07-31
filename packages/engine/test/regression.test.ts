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
// Neu erzeugt nach Einführung der CHEERLEADER-SUPERKRÄFTE (reaktive Kräfte mit
// pausierbarer Auflösung, siehe cheerleader.ts und die Schrittmaschine in
// game.ts). Bewusste Regeländerung gleich doppelt: die Kräfte selbst wirken auf
// den Spielverlauf, und der Bot bewertet einen besetzten Bankplatz jetzt mit
// einem eigenen Gewicht (`bank`), wählt also auch sonst teils andere Züge.
// Decklisten und Kartenwerte sind unverändert.
//
// Davor: neu erzeugt nach Einführung des Basis-Schilds (7 Abschnitte, Block +
// zufällige Superkraft, siehe schild.ts).
const GOLDEN_MASTER: [string, string, number, string][] = [
  ['a1_rudeljaeger', 'a2_luftangriff', 5000, '0:14:8:-1:33'],
  ['a1_rudeljaeger', 'a3_gift_urgewalt', 5001, '1:15:-1:12:26'],
  ['a1_rudeljaeger', 'a4_urzeitliches_rudel', 5002, '1:12:-2:8:20'],
  ['a1_rudeljaeger', 'h1_solidaritaet', 5003, '1:10:-1:10:20'],
  ['a1_rudeljaeger', 'h2_schicht', 5004, '0:16:2:-1:37'],
  ['a1_rudeljaeger', 'h3_campus', 5005, '1:11:0:15:21'],
  ['a2_luftangriff', 'a3_gift_urgewalt', 5006, '1:16:-4:9:32'],
  ['a2_luftangriff', 'a4_urzeitliches_rudel', 5007, '0:15:4:-1:31'],
  ['a2_luftangriff', 'h1_solidaritaet', 5008, '1:14:0:9:27'],
  ['a2_luftangriff', 'h2_schicht', 5009, '1:15:-1:9:32'],
  ['a2_luftangriff', 'h3_campus', 5010, '0:16:5:-2:33'],
  ['a3_gift_urgewalt', 'a4_urzeitliches_rudel', 5011, '1:15:0:7:25'],
  ['a3_gift_urgewalt', 'h1_solidaritaet', 5012, '0:14:5:-1:26'],
  ['a3_gift_urgewalt', 'h2_schicht', 5013, '1:15:-1:4:31'],
  ['a3_gift_urgewalt', 'h3_campus', 5014, '0:16:9:-1:29'],
  ['a4_urzeitliches_rudel', 'h1_solidaritaet', 5015, '0:12:8:-3:20'],
  ['a4_urzeitliches_rudel', 'h2_schicht', 5016, '0:15:9:0:32'],
  ['a4_urzeitliches_rudel', 'h3_campus', 5017, 'draw:16:-2:0:33'],
  ['h1_solidaritaet', 'h2_schicht', 5018, '1:11:0:11:19'],
  ['h1_solidaritaet', 'h3_campus', 5019, 'draw:17:0:-4:29']
];

describe('Golden Master: Partie-Simulation bleibt bei Refactors unverändert', () => {
  it.each(GOLDEN_MASTER)('%s vs %s (Saat %i)', (deckAId, deckBId, saat, erwarteterHash) => {
    const r = spielePartie(data, decks[deckAId], decks[deckBId], { saat, profilA: profil, profilB: profil });
    const hash = `${r.gewinner}:${r.runden}:${r.endState.players[0].base}:${r.endState.players[1].base}:${r.endState.uidCounter}`;
    expect(hash).toBe(erwarteterHash);
  });
});
