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
// Neu erzeugt in Phase 8 (V2-Kartendaten + V2-Testdecks): alle 20 Zeilen
// ändern sich zwangsläufig – Kartenwerte, Fähigkeiten und die 7 Testdecks
// selbst wurden komplett auf die V2-Tabellen aus docs/regelwerk-v2.md §5
// umgeschrieben (vorher liefen hier noch vorläufige Phase-4-Decks aus dem
// Ist-Kartenpool). Siehe den Phase-8-Commit für die Kartenliste.
const GOLDEN_MASTER: [string, string, number, string][] = [
  ['a1_rudeljaeger', 'a2_luftangriff', 5000, '0:8:15:-2:19'],
  ['a1_rudeljaeger', 'a3_gift_urgewalt', 5001, '1:11:-5:8:23'],
  ['a1_rudeljaeger', 'a4_urzeitliches_rudel', 5002, '0:7:10:0:12'],
  ['a1_rudeljaeger', 'h1_solidaritaet', 5003, '0:11:15:0:22'],
  ['a1_rudeljaeger', 'h2_schicht', 5004, '0:5:15:-1:8'],
  ['a1_rudeljaeger', 'h3_campus', 5005, '1:13:0:5:25'],
  ['a2_luftangriff', 'a3_gift_urgewalt', 5006, '1:9:-3:15:17'],
  ['a2_luftangriff', 'a4_urzeitliches_rudel', 5007, '1:8:-4:11:18'],
  ['a2_luftangriff', 'h1_solidaritaet', 5008, '1:13:-1:10:26'],
  ['a2_luftangriff', 'h2_schicht', 5009, '1:16:0:3:33'],
  ['a2_luftangriff', 'h3_campus', 5010, '1:11:-1:14:21'],
  ['a3_gift_urgewalt', 'a4_urzeitliches_rudel', 5011, '1:12:0:15:26'],
  ['a3_gift_urgewalt', 'h1_solidaritaet', 5012, '0:14:8:-1:27'],
  ['a3_gift_urgewalt', 'h2_schicht', 5013, '0:11:12:-3:20'],
  ['a3_gift_urgewalt', 'h3_campus', 5014, '0:11:15:-3:19'],
  ['a4_urzeitliches_rudel', 'h1_solidaritaet', 5015, '0:8:9:-1:11'],
  ['a4_urzeitliches_rudel', 'h2_schicht', 5016, '0:10:15:-2:20'],
  ['a4_urzeitliches_rudel', 'h3_campus', 5017, '0:12:15:-1:27'],
  ['h1_solidaritaet', 'h2_schicht', 5018, '0:13:15:-2:26'],
  ['h1_solidaritaet', 'h3_campus', 5019, '0:9:15:-4:12']
];

describe('Golden Master: Partie-Simulation bleibt bei Refactors unverändert', () => {
  it.each(GOLDEN_MASTER)('%s vs %s (Saat %i)', (deckAId, deckBId, saat, erwarteterHash) => {
    const r = spielePartie(data, decks[deckAId], decks[deckBId], { saat, profilA: profil, profilB: profil });
    const hash = `${r.gewinner}:${r.runden}:${r.endState.players[0].base}:${r.endState.players[1].base}:${r.endState.uidCounter}`;
    expect(hash).toBe(erwarteterHash);
  });
});
