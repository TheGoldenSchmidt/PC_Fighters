// Erzeugt die GOLDEN_MASTER-Tabelle für packages/engine/test/regression.test.ts
// neu. Nur nach einer BEWUSSTEN Regeländerung ausführen (Phase 6+: neue
// Gift-Schwelle, Zermürbung, V2-Kartendaten, Ability-Registry-Umbau in
// Phase 5 sollte dagegen NICHTS ändern – siehe Kommentar in regression.test.ts).
//
// Aufruf: npx tsx scripts/backtest/erzeuge-golden-master.ts
// Ausgabe kopieren und GOLDEN_MASTER in regression.test.ts ersetzen.

import { BOT_PROFILE, ladeDecks, loadGameData, spielePartie } from '../../packages/engine/src/index.js';
import type { BotProfil } from '../../packages/engine/src/index.js';

const data = loadGameData();
const decks = ladeDecks(data);
const ids = Object.keys(decks).sort();
const profil: BotProfil = { ...BOT_PROFILE.ausgewogen, epsilonBand: 0 };

const paare: [string, string][] = [];
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) paare.push([ids[i], ids[j]]);
}

const zeilen: string[] = [];
for (let k = 0; k < 20; k++) {
  const [a, b] = paare[k % paare.length];
  const saat = 5000 + k;
  const r = spielePartie(data, decks[a], decks[b], { saat, profilA: profil, profilB: profil });
  const hash = `${r.gewinner}:${r.runden}:${r.endState.players[0].base}:${r.endState.players[1].base}:${r.endState.uidCounter}`;
  zeilen.push(`  ['${a}', '${b}', ${saat}, '${hash}'],`);
}
console.log(zeilen.join('\n'));
