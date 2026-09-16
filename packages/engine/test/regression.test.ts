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

// Referenzen vom 15.09.2026: vier vollständige Teams und explizite Alpha-Regeln.
// Sechs Paarungen in beiden Sitzordnungen plus vier Spiegelpartien. Der Hash
// umfasst auch Team-Up, Handinstanzen und offene Auswahlen; die Botbewertung
// berücksichtigt beide Figurenplätze.
const GOLDEN_MASTER: [string, string, number, string, string][] = [
  ['kaeptn_kompostible', 'kaeptn_kompostible', 5000, '1:10:-4:4:18', '34af2491'],
  ['kaeptn_kompostible', 'rostbolzen', 5001, '0:12:1:-1:25', '7e56b19f'],
  ['rostbolzen', 'kaeptn_kompostible', 5002, '1:9:-3:20:12', '1c27636b'],
  ['kaeptn_kompostible', 'sonnenfackel', 5003, '0:12:14:-4:28', '817a0ece'],
  ['sonnenfackel', 'kaeptn_kompostible', 5004, '1:10:0:10:23', '517ee9b4'],
  ['kaeptn_kompostible', 'super_brainz', 5005, '1:7:0:5:8', '5d8f3f82'],
  ['super_brainz', 'kaeptn_kompostible', 5006, '1:9:0:15:19', 'bde587d4'],
  ['rostbolzen', 'rostbolzen', 5007, '1:15:0:8:27', 'c36feabf'],
  ['rostbolzen', 'sonnenfackel', 5008, '0:9:20:-1:19', '8b48f123'],
  ['sonnenfackel', 'rostbolzen', 5009, '1:9:-1:20:19', '29d9bd34'],
  ['rostbolzen', 'super_brainz', 5010, '1:14:-4:2:30', 'dda5f8c1'],
  ['super_brainz', 'rostbolzen', 5011, '1:12:-6:10:28', '2d80a19d'],
  ['sonnenfackel', 'sonnenfackel', 5012, '0:15:15:-4:31', 'db74496d'],
  ['sonnenfackel', 'super_brainz', 5013, '0:12:10:-3:24', '74a5ac90'],
  ['super_brainz', 'sonnenfackel', 5014, '0:8:18:0:19', '915e9852'],
  ['super_brainz', 'super_brainz', 5015, '0:14:10:0:38', 'db6163a0'],
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
