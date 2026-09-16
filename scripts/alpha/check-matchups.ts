// Reproduzierbarer Alpha-Durchlauf: alle Paarungen, beide Plätze und Startseiten.
import { writeFileSync } from 'node:fs';
import { BOT_PROFILE, ladeAktiveDecks, loadGameData, spielePartie } from '../../packages/engine/src/index.js';

const data = loadGameData();
const decks = Object.values(ladeAktiveDecks(data));
const names = new Map(data.champions.map(c => [c.id, c.name]));
const rows: string[] = [];
let total = 0;
for (let i = 0; i < decks.length; i++) for (let j = i; j < decks.length; j++) {
  let games = 0, winsA = 0, winsB = 0, draws = 0, rounds = 0, limits = 0;
  const orders = i === j ? [[i, j]] : [[i, j], [j, i]];
  for (const [a, b] of orders) for (const start of [0, 1] as const) for (let seed = 0; seed < 5; seed++) {
    const result = spielePartie(data, decks[a], decks[b], {
      saat: 9100 + seed, startspieler: start,
      profilA: BOT_PROFILE.ausgewogen, profilB: BOT_PROFILE.ausgewogen, maxSchritte: 3000,
    });
    if (result.endState.phase !== 'ended') throw Error('Partie nicht beendet');
    games++; total++; rounds += result.runden; limits += Number(result.amRundenlimit);
    if (result.gewinner === 'draw') draws++;
    else if ((result.gewinner === 0 ? a : b) === i) winsA++;
    else winsB++;
  }
  rows.push(`| ${names.get(decks[i].championId!)} | ${names.get(decks[j].championId!)} | ${games} | ${i === j ? '–' : `${winsA} / ${winsB} / ${draws}`} | ${(rounds / games).toFixed(1)} | ${limits} |`);
}
const report = `# Alpha-Simulation\n\nErzeugt am ${new Date().toISOString().slice(0, 10)} mit Kartenkatalog Version 1. ${total} vollständige Botpartien; fünf Seeds (9100–9104), beide Startspieler und bei unterschiedlichen Teams beide Sitzordnungen.\n\n| Team A | Team B | Partien | Siege A / B / Remis | Runden im Mittel | Rundenlimit |\n|---|---|---:|---:|---:|---:|\n${rows.join('\n')}\n\nSpiegelpartien dienen der technischen Prüfung. Siegverteilungen dieser kleinen Stichprobe sind eine Diagnose, kein Nachweis fairer Balance. Der Bot bewertet Team-Up-Figuren, seine Kampfprognose bleibt vereinfacht. Zwölf menschliche Testpartien und reale Touch-Prüfungen bleiben erforderlich.\n\nWiederholen: \`node --import tsx scripts/alpha/check-matchups.ts\`.\n`;
writeFileSync('docs/ALPHA-SIMULATION.md', report);
console.log(`${total} vollständige Partien geprüft: docs/ALPHA-SIMULATION.md`);
