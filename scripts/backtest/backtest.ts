// Backtest-CLI: spielt alle Testdecks (data/decks/*.json) paarweise gegeneinander
// (Sitzplatz-gespiegelt), erfasst die Punkt-7-Kennzahlen aus Regelwerk V2 und
// schreibt einen Markdown-Report.
//
// Aufruf:
//   npx tsx scripts/backtest/backtest.ts [Optionen]
//   npm run backtest -- --schnell
//
// Optionen (alle optional):
//   --spiele=N          Partien je Sitzordnung und Matchup (Default 100)
//   --saat=N             Grund-Saat für die Reproduzierbarkeit (Default 1)
//   --decks=a,b,c        Nur diese Deck-IDs statt aller aus data/decks/
//   --profil=name         Bot-Profil für die Hauptmatrix (Default "ausgewogen")
//   --profile-vergleich  Zusätzlich aggro/kontrolle fahren -> Bot-Sensitivität
//   --zufalls-basis=N    Partien je Deck für die Zufalls-Grundlinie (Default 30)
//   --streng             Exit-Code 1, wenn Zielkorridore verletzt sind
//   --schnell            Kurzlauf (spiele=10, zufalls-basis=10) für schnelle Checks
//   --out=datei.md       Report zusätzlich in eine Datei schreiben

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOT_PROFILE,
  buildFactionTree,
  ladeDecks,
  loadGameData,
  spielePartie,
  topOf
} from '../../packages/engine/src/index.js';
import type { BotProfil, DeckList, GameData } from '../../packages/engine/src/index.js';
import { erzeugeReport, sammleVerletzungen } from './report.js';
import type { BacktestErgebnis, BotSensitivitaet, KartenKennzahl, Korridore, MatchupErgebnis, ZufallsGrundlinie } from './report.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const korridoreJson = JSON.parse(readFileSync(join(HIER, 'korridore.json'), 'utf8'));

// ---------------------------------------------------------------- CLI-Optionen

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const werte: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    if (m[2] !== undefined) werte[m[1]] = m[2];
    else flags.add(m[1]);
  }
  return { flags, werte };
}

const { flags, werte } = parseArgs(process.argv.slice(2));
const schnell = flags.has('schnell');
const spieleProSitzung = Number(werte['spiele'] ?? (schnell ? 10 : 100));
const grundSaat = Number(werte['saat'] ?? 1);
const profilName = werte['profil'] ?? 'ausgewogen';
const profileVergleich = flags.has('profile-vergleich');
const zufallsBasisSpiele = Number(werte['zufalls-basis'] ?? (schnell ? 10 : 30));
const streng = flags.has('streng');
const outDatei = werte['out'];

if (!(profilName in BOT_PROFILE)) {
  console.error(`Unbekanntes Bot-Profil "${profilName}". Verfügbar: ${Object.keys(BOT_PROFILE).join(', ')}`);
  process.exit(2);
}

// ---------------------------------------------------------------- Deterministische Saat pro Partie

/** Kleine, deterministische Hash-Mischung aus mehreren Ganzzahlen (kein Krypto-Anspruch). */
function mische(...teile: number[]): number {
  let h = 0x9e3779b9;
  for (const t of teile) {
    h = Math.imul(h ^ t, 0x85ebca6b);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function spieleMatchup(
  data: GameData,
  deckA: DeckList,
  deckAId: string,
  deckB: DeckList,
  deckBId: string,
  spiele: number,
  profilA: BotProfil,
  profilB: BotProfil,
  saatBasis: number
): MatchupErgebnis & { proKarte: [Record<string, number>, Record<string, number>][]; kartenStats: import('../../packages/engine/src/index.js').PartieErgebnis['stats'][] } {
  const ergebnis: MatchupErgebnis = {
    deckA: deckAId,
    deckB: deckBId,
    spiele: 0,
    siegeA: 0,
    siegeB: 0,
    unentschieden: 0,
    rundenSumme: 0,
    amRundenlimit: 0,
    siegeStartspieler: 0
  };
  const statsListe: import('../../packages/engine/src/index.js').PartieErgebnis['stats'][] = [];

  for (let g = 0; g < spiele; g++) {
    // Sitzplatz-Spiegelung: dieselbe Saat für "A auf Platz 0" und "A auf Platz 1".
    const saat = mische(saatBasis, g);

    const r1 = spielePartie(data, deckA, deckB, { saat, profilA, profilB });
    ergebnis.spiele += 1;
    ergebnis.rundenSumme += r1.runden;
    if (r1.amRundenlimit) ergebnis.amRundenlimit += 1;
    if (r1.gewinner === 0) {
      ergebnis.siegeA += 1;
      if (r1.startspieler === 0) ergebnis.siegeStartspieler += 1;
    } else if (r1.gewinner === 1) {
      ergebnis.siegeB += 1;
      if (r1.startspieler === 1) ergebnis.siegeStartspieler += 1;
    } else {
      ergebnis.unentschieden += 1;
    }
    statsListe.push(r1.stats);

    const r2 = spielePartie(data, deckB, deckA, { saat, profilA: profilB, profilB: profilA });
    ergebnis.spiele += 1;
    ergebnis.rundenSumme += r2.runden;
    if (r2.amRundenlimit) ergebnis.amRundenlimit += 1;
    if (r2.gewinner === 0) {
      ergebnis.siegeB += 1;
      if (r2.startspieler === 0) ergebnis.siegeStartspieler += 1;
    } else if (r2.gewinner === 1) {
      ergebnis.siegeA += 1;
      if (r2.startspieler === 1) ergebnis.siegeStartspieler += 1;
    } else {
      ergebnis.unentschieden += 1;
    }
    // Für Kartenstatistik: proKarte[0] gehört immer zu deckA, proKarte[1] zu deckB.
    statsListe.push({ proKarte: [r2.stats.proKarte[1], r2.stats.proKarte[0]], proSpieler: [r2.stats.proSpieler[1], r2.stats.proSpieler[0]] });
  }

  return { ...ergebnis, proKarte: [], kartenStats: statsListe };
}

async function main() {
  const data = loadGameData();
  const alleDecks = ladeDecks(data);
  const deckIds = (werte['decks'] ? werte['decks'].split(',') : Object.keys(alleDecks)).sort();
  for (const id of deckIds) {
    if (!alleDecks[id]) {
      console.error(`Unbekannte Deck-ID "${id}". Verfügbar: ${Object.keys(alleDecks).sort().join(', ')}`);
      process.exit(2);
    }
  }
  if (deckIds.length < 2) {
    console.error('Mindestens zwei Decks nötig.');
    process.exit(2);
  }

  const deckFraktion: Record<string, string> = {};
  for (const id of deckIds) deckFraktion[id] = alleDecks[id].faction ?? '?';

  const profilHaupt = BOT_PROFILE[profilName];
  const matchups: MatchupErgebnis[] = [];
  const kartenStatsGesamt: import('../../packages/engine/src/index.js').PartieErgebnis['stats'][] = [];
  // Für die Ausspielrate: pro Karte, wie oft war sie im Spiel (im Deck einer
  // Partie) und wie oft wurde sie tatsächlich gespielt.
  const kartenImSpiel = new Map<string, number>();
  const kartenGespieltGesamt = new Map<string, number>();

  const botSensitivitaet: BotSensitivitaet[] = [];

  console.error(`Spiele ${(deckIds.length * (deckIds.length - 1)) / 2} Matchups × 2 Sitzordnungen × ${spieleProSitzung} Partien …`);
  const start = Date.now();

  for (let i = 0; i < deckIds.length; i++) {
    for (let j = i + 1; j < deckIds.length; j++) {
      const idA = deckIds[i];
      const idB = deckIds[j];
      const saatBasis = mische(grundSaat, i, j);
      const lauf = spieleMatchup(
        data,
        alleDecks[idA],
        idA,
        alleDecks[idB],
        idB,
        spieleProSitzung,
        profilHaupt,
        profilHaupt,
        saatBasis
      );
      matchups.push(lauf);
      kartenStatsGesamt.push(...lauf.kartenStats);

      // Deck-Zusammensetzung für die Ausspielrate erfassen (jede Partie zählt
      // für jede enthaltene Karte als "im Spiel").
      for (const [deckId, deck] of [[idA, alleDecks[idA]], [idB, alleDecks[idB]]] as [string, DeckList][]) {
        for (const entry of deck.cards) {
          kartenImSpiel.set(entry.cardId, (kartenImSpiel.get(entry.cardId) ?? 0) + lauf.spiele);
        }
      }

      if (profileVergleich) {
        const abweichungen: number[] = [];
        for (const zweitProfil of ['aggro', 'kontrolle'] as const) {
          const p = BOT_PROFILE[zweitProfil];
          const lauf2 = spieleMatchup(data, alleDecks[idA], idA, alleDecks[idB], idB, spieleProSitzung, p, p, saatBasis + 1);
          const wr1 = lauf.siegeA / (lauf.siegeA + lauf.siegeB || 1);
          const wr2 = lauf2.siegeA / (lauf2.siegeA + lauf2.siegeB || 1);
          abweichungen.push(Math.abs(wr1 - wr2) * 100);
        }
        botSensitivitaet.push({ matchup: `${idA} vs ${idB}`, maxAbweichungPp: Math.max(...abweichungen) });
      }
    }
  }

  // Ausspielrate: proKarte[.].gespielt > 0 in jeder Partie aufsummieren.
  for (const stats of kartenStatsGesamt) {
    for (const seite of [0, 1] as const) {
      for (const [cardId, k] of Object.entries(stats.proKarte[seite])) {
        if (k.gespielt > 0) kartenGespieltGesamt.set(cardId, (kartenGespieltGesamt.get(cardId) ?? 0) + 1);
      }
    }
  }

  // Zufalls-Grundlinie: jedes Deck (ausgewogen) gegen sich selbst, Gegner zufällig.
  const zufallsGrundlinien: ZufallsGrundlinie[] = [];
  for (const id of deckIds) {
    let siege = 0;
    for (let g = 0; g < zufallsBasisSpiele; g++) {
      const saat = mische(grundSaat, 0xdead, deckIds.indexOf(id), g);
      const r = spielePartie(data, alleDecks[id], alleDecks[id], {
        saat,
        profilA: profilHaupt,
        profilB: BOT_PROFILE.zufall
      });
      if (r.gewinner === 0) siege += 1;
    }
    zufallsGrundlinien.push({ deck: id, winrateGegenZufall: siege / zufallsBasisSpiele, partien: zufallsBasisSpiele });
  }

  // Kartenaggregation: Summe über alle Partien und beide Seiten, gruppiert nach Karte.
  const kartenAggregat = new Map<
    string,
    { schadenKreatur: number; schadenBasis: number; kills: number; gestorben: number; geheilt: number; verhindert: number; gespielt: number }
  >();
  for (const stats of kartenStatsGesamt) {
    for (const seite of [0, 1] as const) {
      for (const [cardId, k] of Object.entries(stats.proKarte[seite])) {
        const acc = kartenAggregat.get(cardId) ?? {
          schadenKreatur: 0,
          schadenBasis: 0,
          kills: 0,
          gestorben: 0,
          geheilt: 0,
          verhindert: 0,
          gespielt: 0
        };
        acc.schadenKreatur += k.schadenKreatur;
        acc.schadenBasis += k.schadenBasis;
        acc.kills += k.kills;
        acc.gestorben += k.gestorben;
        acc.geheilt += k.geheilt;
        acc.verhindert += k.verhindert;
        acc.gespielt += k.gespielt;
        kartenAggregat.set(cardId, acc);
      }
    }
  }

  // Deck-Präsenz je Oberfraktion (statisch aus den Decklisten, nicht
  // simulationsabhängig): Anteil der Testdecks DERSELBEN Oberfraktion wie die
  // Karte, die sie mindestens einmal enthalten.
  const factionTree = buildFactionTree(data.factions);
  const karten: KartenKennzahl[] = [...kartenAggregat.entries()].map(([cardId, acc]) => {
    const card = data.cardsById[cardId];
    const name = card?.name ?? cardId;
    const faction = card?.faction ?? '?';
    const imSpiel = kartenImSpiel.get(cardId) ?? 0;
    const gespieltPartien = kartenGespieltGesamt.get(cardId) ?? 0;

    const kartenOberfraktion = card ? topOf(factionTree, card.faction) : undefined;
    const relevanteDecks = deckIds.filter((id) => deckFraktion[id] === kartenOberfraktion);
    const decksImSpiel = relevanteDecks.length;
    const decksMitKarte = relevanteDecks.filter((id) => alleDecks[id].cards.some((c) => c.cardId === cardId)).length;
    const deckPraesenzAnteil = decksImSpiel > 0 ? decksMitKarte / decksImSpiel : 0;

    return {
      cardId,
      name,
      faction,
      deckPraesenzAnteil,
      ausspielrateAnteil: imSpiel > 0 ? gespieltPartien / imSpiel : 0,
      gespielt: acc.gespielt,
      schadenKreatur: acc.schadenKreatur,
      schadenBasis: acc.schadenBasis,
      kills: acc.kills,
      gestorben: acc.gestorben,
      geheilt: acc.geheilt,
      verhindert: acc.verhindert
    };
  });

  const ergebnis: BacktestErgebnis = {
    erzeugtAm: new Date().toISOString(),
    saat: grundSaat,
    spieleProSitzung,
    profil: profilName,
    matchups,
    karten,
    botSensitivitaet,
    zufallsGrundlinien,
    deckFraktion
  };

  const korridore = korridoreJson as unknown as Korridore;
  const report = erzeugeReport(ergebnis, korridore);
  console.log(report);
  if (outDatei) {
    writeFileSync(outDatei, report, 'utf8');
    console.error(`Report zusätzlich geschrieben nach ${outDatei}`);
  }

  console.error(`Fertig in ${((Date.now() - start) / 1000).toFixed(1)} s.`);

  if (streng) {
    const verletzungen = sammleVerletzungen(ergebnis, korridore);
    if (verletzungen.length > 0) {
      console.error(`\n${verletzungen.length} Korridor-Verletzung(en):`);
      for (const v of verletzungen) console.error(`  • ${v}`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
