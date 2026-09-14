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

// Referenzen vom 14.09.2026 nach der Integration des aktuellen Champ-Kartensets.
// Alle aktiven Decks werden in beiden Sitzordnungen geprüft. Alte Alpha-Decks
// sind ersetzt; Kurzstand und Zustandsfingerabdruck sichern das heutige Verhalten.
const GOLDEN_MASTER: [string, string, number, string, string][] = [
  ['der_zerschmetterer', 'kaeptn_kompostible', 5000, '0:6:20:-3:14', '9f685d94'],
  ['kaeptn_kompostible', 'der_zerschmetterer', 5001, '1:11:0:17:24', 'f4210a96'],
  ['der_zerschmetterer', 'rostbolzen', 5002, '0:15:20:-2:28', '74938eb1'],
  ['rostbolzen', 'der_zerschmetterer', 5003, '1:10:-2:20:20', '81362974'],
  ['der_zerschmetterer', 'sonnenfackel', 5004, '0:11:13:-1:26', '58ed169d'],
  ['sonnenfackel', 'der_zerschmetterer', 5005, '1:9:0:16:21', '2422121c'],
  ['der_zerschmetterer', 'super_brainz', 5006, '0:11:16:-4:23', '9c2298ac'],
  ['super_brainz', 'der_zerschmetterer', 5007, '1:10:0:8:18', '3e3a741e'],
  ['der_zerschmetterer', 'wall_halla', 5008, '0:11:13:-1:25', '4c6870e4'],
  ['wall_halla', 'der_zerschmetterer', 5009, '1:15:-2:20:27', '290dcb7d'],
  ['kaeptn_kompostible', 'rostbolzen', 5010, '0:11:6:-4:24', 'bb8921b7'],
  ['rostbolzen', 'kaeptn_kompostible', 5011, '1:11:-3:15:27', '5bfc35f1'],
  ['kaeptn_kompostible', 'sonnenfackel', 5012, '0:8:18:-1:17', '6d956be1'],
  ['sonnenfackel', 'kaeptn_kompostible', 5013, '0:8:14:0:19', '2d97b230'],
  ['kaeptn_kompostible', 'super_brainz', 5014, '0:9:12:-1:16', '511ffd72'],
  ['super_brainz', 'kaeptn_kompostible', 5015, '0:8:14:0:20', '0ada22da'],
  ['kaeptn_kompostible', 'wall_halla', 5016, '1:10:0:11:20', '7fc39b69'],
  ['wall_halla', 'kaeptn_kompostible', 5017, '1:10:-1:13:19', '06f717e1'],
  ['rostbolzen', 'sonnenfackel', 5018, '0:12:11:-1:21', 'adc1e82d'],
  ['sonnenfackel', 'rostbolzen', 5019, '0:11:14:-4:26', '6d6cc206'],
  ['rostbolzen', 'super_brainz', 5020, '1:11:0:6:21', 'dec111da'],
  ['super_brainz', 'rostbolzen', 5021, '1:13:-1:16:26', 'c7f915c1'],
  ['rostbolzen', 'wall_halla', 5022, '0:15:6:0:32', 'c3ee9e07'],
  ['wall_halla', 'rostbolzen', 5023, '1:11:-1:9:21', 'e6870e49'],
  ['sonnenfackel', 'super_brainz', 5024, '0:8:12:0:17', '8d627180'],
  ['super_brainz', 'sonnenfackel', 5025, '1:12:-3:2:21', 'd544798e'],
  ['sonnenfackel', 'wall_halla', 5026, '0:13:13:-5:29', '117cfe4e'],
  ['wall_halla', 'sonnenfackel', 5027, '0:16:3:-1:33', 'a3ef6557'],
  ['super_brainz', 'wall_halla', 5028, '0:17:11:0:37', 'c05449e9'],
  ['wall_halla', 'super_brainz', 5029, '1:13:0:20:24', '1bf5d548'],
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
