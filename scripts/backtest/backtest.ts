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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
import type { BacktestErgebnis, BotSensitivitaet, CheerleaderKennzahl, KartenKennzahl, Korridore, MatchupErgebnis, ZufallsGrundlinie } from './report.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const korridoreJson = JSON.parse(readFileSync(join(HIER, 'korridore.json'), 'utf8'));

// ---------------------------------------------------------------- CLI-Optionen

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const werte: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const m = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    if (m[2] !== undefined) werte[m[1]] = m[2];
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) werte[m[1]] = argv[++i];
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

interface RohPartie {
  saat: number;
  decksNachSitz: [string, string];
  gewinner: string | 'draw';
  gewinnerOberfraktion: string | null;
  startspieler: number;
  startspielerDeck: string;
  endrunde: number;
  amRundenlimit: boolean;
  basisHp: [number, number];
  spieler: unknown[];
  proKarte: unknown[];
}

function rohPartie(r: import('../../packages/engine/src/index.js').PartieErgebnis, saat: number, decks: [string, string], fraktionen: [string, string]): RohPartie {
  const winner = r.gewinner === 'draw' ? 'draw' : decks[r.gewinner];
  return {
    saat,
    decksNachSitz: decks,
    gewinner: winner,
    gewinnerOberfraktion: r.gewinner === 'draw' ? null : fraktionen[r.gewinner],
    startspieler: r.startspieler,
    startspielerDeck: decks[r.startspieler],
    endrunde: r.runden,
    amRundenlimit: r.amRundenlimit,
    basisHp: [r.endState.players[0].base, r.endState.players[1].base],
    spieler: r.stats.proSpieler,
    proKarte: r.stats.proKarte
  };
}

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
): MatchupErgebnis & { proKarte: [Record<string, number>, Record<string, number>][]; kartenStats: import('../../packages/engine/src/index.js').PartieErgebnis['stats'][]; rohPartien: RohPartie[] } {
  const ergebnis: MatchupErgebnis = {
    deckA: deckAId,
    deckB: deckBId,
    spiele: 0,
    siegeA: 0,
    siegeB: 0,
    unentschieden: 0,
    rundenSumme: 0,
    amRundenlimit: 0,
    erreichtZermuerbung: 0,
    siegeStartspieler: 0
  };
  const abRunde = data.config.zermuerbung?.abRunde ?? Infinity;
  const statsListe: import('../../packages/engine/src/index.js').PartieErgebnis['stats'][] = [];
  const rohPartien: RohPartie[] = [];

  for (let g = 0; g < spiele; g++) {
    // Sitzplatz-Spiegelung: dieselbe Saat für "A auf Platz 0" und "A auf Platz 1".
    const saat = mische(saatBasis, g);

    const r1 = spielePartie(data, deckA, deckB, { saat, profilA, profilB });
    ergebnis.spiele += 1;
    ergebnis.rundenSumme += r1.runden;
    if (r1.amRundenlimit) ergebnis.amRundenlimit += 1;
    if (r1.runden >= abRunde) ergebnis.erreichtZermuerbung += 1;
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
    rohPartien.push(rohPartie(r1, saat, [deckAId, deckBId], [deckA.faction ?? '?', deckB.faction ?? '?']));

    const r2 = spielePartie(data, deckB, deckA, { saat, profilA: profilB, profilB: profilA });
    ergebnis.spiele += 1;
    ergebnis.rundenSumme += r2.runden;
    if (r2.amRundenlimit) ergebnis.amRundenlimit += 1;
    if (r2.runden >= abRunde) ergebnis.erreichtZermuerbung += 1;
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
    statsListe.push({ ...r2.stats, proKarte: [r2.stats.proKarte[1], r2.stats.proKarte[0]], proSpieler: [r2.stats.proSpieler[1], r2.stats.proSpieler[0]] });
    rohPartien.push(rohPartie(r2, saat, [deckBId, deckAId], [deckB.faction ?? '?', deckA.faction ?? '?']));
  }

  return { ...ergebnis, proKarte: [], kartenStats: statsListe, rohPartien };
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
  const rohPartien: RohPartie[] = [];
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
      const { kartenStats, rohPartien: laufRohPartien, proKarte: _proKarte, ...matchup } = lauf;
      matchups.push(matchup);
      kartenStatsGesamt.push(...kartenStats);
      rohPartien.push(...laufRohPartien);

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
    { schadenKreatur: number; schadenBasis: number; kills: number; gestorben: number; geheilt: number; verhindert: number; gespielt: number; auraAusloesungen: number; wachstumAusloesungen: number; giftZerstoerungen: number; flinkAngriffe: number; mulliganAngeboten: number; mulliganBehalten: number; endhandNieLegal: number; endhandNichtGewaehlt: number }
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
          gespielt: 0,
          auraAusloesungen: 0,
          wachstumAusloesungen: 0,
          giftZerstoerungen: 0,
          flinkAngriffe: 0,
          mulliganAngeboten: 0,
          mulliganBehalten: 0,
          endhandNieLegal: 0,
          endhandNichtGewaehlt: 0
        };
        acc.schadenKreatur += k.schadenKreatur;
        acc.schadenBasis += k.schadenBasis;
        acc.kills += k.kills;
        acc.gestorben += k.gestorben;
        acc.geheilt += k.geheilt;
        acc.verhindert += k.verhindert;
        acc.gespielt += k.gespielt;
        acc.auraAusloesungen += k.auraAusloesungen;
        acc.wachstumAusloesungen += k.wachstumAusloesungen;
        acc.giftZerstoerungen += k.giftZerstoerungen;
        acc.flinkAngriffe += k.flinkAngriffe;
        acc.mulliganAngeboten += k.mulliganAngeboten;
        acc.mulliganBehalten += k.mulliganBehalten;
        acc.endhandNieLegal += k.endhandNieLegal;
        acc.endhandNichtGewaehlt += k.endhandNichtGewaehlt;
        kartenAggregat.set(cardId, acc);
      }
    }
  }

  // Deck-Präsenz je Oberfraktion (statisch aus den Decklisten, nicht
  // simulationsabhängig): Anteil der Testdecks DERSELBEN Oberfraktion wie die
  // Karte, die sie mindestens einmal enthalten.
  const factionTree = buildFactionTree(data.factions);
  const karten: KartenKennzahl[] = [...kartenAggregat.entries()]
    // Tokens sind keine Deckkarten. Ebenso wenig die Pseudo-Quellen, unter
    // denen Effektschaden verbucht wird ("schild", "cheerleader") – die
    // tauchten sonst als Karten mit Kills, aber ohne Deck-Präsenz auf.
    .filter(([cardId]) => !cardId.startsWith('token:') && data.cardsById[cardId] != null)
    .map(([cardId, acc]) => {
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
      verhindert: acc.verhindert,
      auraAusloesungen: acc.auraAusloesungen,
      wachstumAusloesungen: acc.wachstumAusloesungen,
      giftZerstoerungen: acc.giftZerstoerungen,
      flinkAngriffe: acc.flinkAngriffe,
      mulliganKeepRate: acc.mulliganAngeboten > 0 ? acc.mulliganBehalten / acc.mulliganAngeboten : null,
      endhandNieLegal: acc.endhandNieLegal,
      endhandNichtGewaehlt: acc.endhandNichtGewaehlt
    };
  });

  // Cheerleader-Nutzung über alle Partien und beide Seiten summieren.
  const cheerleaderAggregat = new Map<
    string,
    { angeboten: number; verzichtet: number; geopfert: number; schadenVerursacht: number; schadenVerhindert: number; rettungen: number }
  >();
  for (const stats of kartenStatsGesamt) {
    for (const seite of [0, 1] as const) {
      for (const [cardId, c] of Object.entries(stats.proCheerleader?.[seite] ?? {})) {
        const acc = cheerleaderAggregat.get(cardId) ?? {
          angeboten: 0,
          verzichtet: 0,
          geopfert: 0,
          schadenVerursacht: 0,
          schadenVerhindert: 0,
          rettungen: 0
        };
        acc.angeboten += c.angeboten;
        acc.verzichtet += c.verzichtet;
        acc.geopfert += c.geopfert;
        acc.schadenVerursacht += c.schadenVerursacht;
        acc.schadenVerhindert += c.schadenVerhindert;
        acc.rettungen += c.rettungen;
        cheerleaderAggregat.set(cardId, acc);
      }
    }
  }
  const cheerleader: CheerleaderKennzahl[] = [...cheerleaderAggregat.entries()].map(([cardId, acc]) => ({
    cardId,
    name: data.cardsById[cardId]?.name ?? cardId,
    ...acc
  }));

  const ergebnis: BacktestErgebnis = {
    erzeugtAm: new Date().toISOString(),
    saat: grundSaat,
    spieleProSitzung,
    profil: profilName,
    matchups,
    karten,
    botSensitivitaet,
    zufallsGrundlinien,
    deckFraktion,
    cheerleader
  };

  const korridore = korridoreJson as unknown as Korridore;
  const report = erzeugeReport(ergebnis, korridore);
  if (flags.has('stdout')) console.log(report);
  const stamp = ergebnis.erzeugtAm.replace(/[:.]/g, '-');
  const outputDir = resolve(outDatei && !outDatei.toLowerCase().endsWith('.md')
    ? outDatei
    : outDatei ? dirname(outDatei) : join('backtest-results', stamp));
  const reportPath = resolve(outDatei?.toLowerCase().endsWith('.md') ? outDatei : join(outputDir, 'report.md'));
  const summaryPath = join(outputDir, 'summary.json');
  const matchesPath = join(outputDir, 'matches.jsonl');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(reportPath, report, 'utf8');
  writeFileSync(summaryPath, JSON.stringify(ergebnis, null, 2), 'utf8');
  writeFileSync(matchesPath, rohPartien.map((p) => JSON.stringify(p)).join('\n') + '\n', 'utf8');
  console.error(`Report:   ${reportPath}`);
  console.error(`Kurzdata: ${summaryPath}`);
  console.error(`Partien:  ${matchesPath}`);

  console.error(`Fertig: ${rohPartien.length} Hauptpartien in ${((Date.now() - start) / 1000).toFixed(1)} s.`);

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
