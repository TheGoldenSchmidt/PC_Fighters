import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { availableParallelism, tmpdir } from 'node:os';
import { isMainThread, Worker } from 'node:worker_threads';
import {
  BOT_PROFILE,
  ladeAktiveDecks,
  loadGameData,
  maxCopiesOf,
  validateDeck,
  spielePartie,
  type BotProfil,
  type DeckList,
  type GameData,
  type MatchStatistik,
  type PartieErgebnis,
  type PlayerIndex,
  type RundenSnapshot,
  type SimulationsAktion
} from '../../packages/engine/src/index.js';

type BotId = 'standard' | 'aggressive' | 'control' | 'random';
type Mode = 'technical' | 'full' | 'pc';

export interface Config {
  simulation: {
    gamesPerMatchupPerStartingSide: number;
    technicalGamesPerConfiguration: number;
    pcPrincipalGamesPerConfiguration: number;
    includeMirrorMatches: boolean;
    parallelWorkers: number | 'auto';
    maxActionsPerTurn: number;
    maxBranchesPerDecision: number;
  };
  technicalBotMatchups: [BotId, BotId][];
  replays: {
    saveOnCrash: boolean;
    saveOnIllegalState: boolean;
    saveOnRoundLimit: boolean;
    saveOnHighSingleRoundDamage: number;
    saveOnWinBeforeRound: number;
    saveOnCardPlayWinRateAbove: number;
    maxSavedPerRun: number;
  };
  thresholds: {
    deckWinRateWarningMin: number;
    deckWinRateWarningMax: number;
    deckWinRateCriticalMin: number;
    deckWinRateCriticalMax: number;
    firstPlayerWarning: number;
    firstPlayerCritical: number;
  };
}

export interface Task {
  index: number;
  matchId: string;
  seed: number;
  deckA: string;
  deckB: string;
  botA: BotId;
  botB: BotId;
  startingPlayer: PlayerIndex;
}

export interface MatchRecord {
  matchId: string;
  seed: number;
  deckA: string;
  deckB: string;
  botA: BotId;
  botB: BotId;
  startingPlayer: PlayerIndex;
  winner: PlayerIndex | 'draw';
  roundsPlayed: number;
  endReason: 'baseDestroyed' | 'roundLimit' | 'draw';
  baseHealth: [number, number];
  maxSingleRoundDamage: number;
  firstHeroPlayer?: PlayerIndex;
  firstHeroCardId?: string;
  firstHeroRound?: number;
  stats: MatchStatistik;
  actions: SimulationsAktion[];
  rounds: RundenSnapshot[];
}

interface Anomaly {
  severity: 'warning' | 'critical';
  type: string;
  message: string;
  matchId?: string;
  replay?: string;
  details?: Record<string, unknown>;
}

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]) {
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!match) continue;
    if (match[2] !== undefined) values[match[1]] = match[2];
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) values[match[1]] = argv[++i];
    else flags.add(match[1]);
  }
  return { values, flags };
}

function seedMix(...parts: number[]): number {
  let hash = 0x9e3779b9;
  for (const part of parts) {
    hash = Math.imul(hash ^ part, 0x85ebca6b);
    hash = (hash << 13) | (hash >>> 19);
  }
  return hash >>> 0;
}

function csv(rows: (string | number | null | undefined)[][]): string {
  const field = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(field).join(',')).join('\n') + '\n';
}

function count(values: string[], wanted: string): number {
  return values.reduce((sum, value) => sum + (value === wanted ? 1 : 0), 0);
}

function deckContracts(decks: Record<string, DeckList>, data: GameData) {
  return Object.fromEntries(Object.entries(decks).map(([id, deck]) => {
    let size = 0;
    let heroes = 0;
    let principals = 0;
    const heroIds: string[] = [];
    for (const entry of deck.cards) {
      size += entry.count;
      const category = data.cardsById[entry.cardId]?.category;
      if (category === 'hero') {
        heroes += entry.count;
        heroIds.push(entry.cardId);
      }
      if (category === 'principal') principals += entry.count;
    }
    return [id, { size, heroes, heroIds, principals, pcPrincipal: deck.cards.some((entry) => entry.cardId === 'pc_principal') }];
  }));
}

function maxRoundDamage(snapshots: RundenSnapshot[]): number {
  let max = 0;
  for (let i = 1; i < snapshots.length; i++) {
    max = Math.max(
      max,
      Math.max(0, snapshots[i - 1].basis[0] - snapshots[i].basis[0]),
      Math.max(0, snapshots[i - 1].basis[1] - snapshots[i].basis[1])
    );
  }
  return max;
}

export function toRecord(task: Task, result: PartieErgebnis, data: GameData): MatchRecord {
  const firstHero = result.aktionen.find(
    (action) => action.cardId && data.cardsById[action.cardId]?.category === 'hero'
  );
  return {
    matchId: task.matchId,
    seed: task.seed,
    deckA: task.deckA,
    deckB: task.deckB,
    botA: task.botA,
    botB: task.botB,
    startingPlayer: task.startingPlayer,
    winner: result.gewinner,
    roundsPlayed: result.runden,
    endReason: result.amRundenlimit ? 'roundLimit' : result.gewinner === 'draw' ? 'draw' : 'baseDestroyed',
    baseHealth: [result.endState.players[0].base, result.endState.players[1].base],
    maxSingleRoundDamage: maxRoundDamage(result.rundenSnapshots),
    ...(firstHero ? {
      firstHeroPlayer: firstHero.spieler,
      firstHeroCardId: firstHero.cardId,
      firstHeroRound: firstHero.runde
    } : {}),
    stats: result.stats,
    actions: result.aktionen,
    rounds: result.rundenSnapshots
  };
}

export function runTask(task: Task, decks: Record<string, DeckList>, data: GameData, config: Config, recordReplay = false): PartieErgebnis {
  return spielePartie(data, decks[task.deckA], decks[task.deckB], {
    saat: task.seed,
    startspieler: task.startingPlayer,
    profilA: BOT_PROFILE[task.botA] as BotProfil,
    profilB: BOT_PROFILE[task.botB] as BotProfil,
    aktionssuche: task.botA !== 'random' || task.botB !== 'random',
    suchGrenzen: {
      maxActionsPerTurn: config.simulation.maxActionsPerTurn,
      maxBranchesPerDecision: config.simulation.maxBranchesPerDecision
    },
    aufzeichnen: recordReplay,
    matchId: task.matchId
  });
}

interface TaskFailure { task: Task; message: string }

async function runTasks(
  tasks: Task[],
  decks: Record<string, DeckList>,
  data: GameData,
  config: Config,
  workers: number,
  sourceDir: string,
  onProgress: (done: number, errors: number) => void
): Promise<{ records: MatchRecord[]; failures: TaskFailure[] }> {
  if (workers <= 1) {
    const records: MatchRecord[] = [];
    const failures: TaskFailure[] = [];
    for (const task of tasks) {
      try {
        records.push(toRecord(task, runTask(task, decks, data, config), data));
      } catch (error) {
        failures.push({ task, message: error instanceof Error ? error.message : String(error) });
      }
      onProgress(records.length + failures.length, failures.length);
    }
    return { records, failures };
  }

  const chunks = Array.from({ length: workers }, () => [] as Task[]);
  tasks.forEach((task, index) => chunks[index % workers].push(task));
  const records: MatchRecord[] = [];
  const failures: TaskFailure[] = [];
  let done = 0;
  const workerTemp = mkdtempSync(join(tmpdir(), 'pcf-balancing-worker-'));
  const workerBundle = join(workerTemp, 'worker.mjs');
  try {
    const { buildSync } = await import('esbuild');
    buildSync({
      stdin: {
        contents: readFileSync(join(sourceDir, 'worker.ts'), 'utf8'),
        resolveDir: sourceDir,
        sourcefile: 'worker.ts',
        loader: 'ts'
      },
      outfile: workerBundle,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      sourcemap: false,
      external: ['esbuild'],
      absWorkingDir: resolve(HERE, '../..'),
      nodePaths: [resolve(HERE, '../../node_modules')]
    });
    await Promise.all(chunks.filter((chunk) => chunk.length > 0).map((chunk) => new Promise<void>((resolveWorker, rejectWorker) => {
      const worker = new Worker(pathToFileURL(workerBundle), {
        workerData: { tasks: chunk, config, data, decks }
      });
      worker.on('message', (message: { record?: MatchRecord; failure?: TaskFailure; done?: boolean }) => {
        if (message.record) { records.push(message.record); done += 1; }
        if (message.failure) { failures.push(message.failure); done += 1; }
        if (message.record || message.failure) onProgress(done, failures.length);
        if (message.done) resolveWorker();
      });
      worker.on('error', rejectWorker);
      worker.on('exit', (code) => {
        if (code !== 0) rejectWorker(new Error(`Balancing-Worker endete mit Code ${code}.`));
      });
    })));
  } finally {
    rmSync(workerTemp, { recursive: true, force: true });
  }
  const indexByMatch = new Map(tasks.map((task) => [task.matchId, task.index]));
  records.sort((a, b) => (indexByMatch.get(a.matchId) ?? 0) - (indexByMatch.get(b.matchId) ?? 0));
  return { records, failures };
}

function tasksFor(
  deckIds: string[],
  mode: Mode,
  games: number,
  includeMirrors: boolean,
  baseSeed: number,
  technicalBotMatchups: [BotId, BotId][],
  botOverride?: [BotId, BotId]
): Task[] {
  const pairs: [string, string][] = [];
  for (let a = 0; a < deckIds.length; a++) {
    for (let b = a + 1; b < deckIds.length; b++) pairs.push([deckIds[a], deckIds[b]]);
    if (includeMirrors && mode === 'technical') pairs.push([deckIds[a], deckIds[a]]);
  }
  const bots = botOverride ? [botOverride] : mode === 'technical'
    ? technicalBotMatchups
    : [['standard', 'standard'] as [BotId, BotId]];
  const tasks: Task[] = [];
  for (const [deckA, deckB] of pairs) {
    for (let botIndex = 0; botIndex < bots.length; botIndex++) {
      const [botA, botB] = bots[botIndex];
      for (const startingPlayer of [0, 1] as PlayerIndex[]) {
        for (let game = 0; game < games; game++) {
          const index = tasks.length;
          const seed = seedMix(baseSeed, deckIds.indexOf(deckA), deckIds.indexOf(deckB), botIndex, startingPlayer, game);
          tasks.push({
            index,
            matchId: `match-${seed.toString(16).padStart(8, '0')}-${index}`,
            seed,
            deckA,
            deckB,
            botA,
            botB,
            startingPlayer
          });
        }
      }
    }
  }
  return tasks;
}

function withoutPcPrincipal(deck: DeckList, data: GameData): DeckList {
  const principal = deck.cards.find((entry) => entry.cardId === 'pc_principal');
  if (!principal) return validateDeck({ ...deck, cards: deck.cards.map((entry) => ({ ...entry })) }, data);
  if (principal.count !== 1) throw new Error(`Deck "${deck.name ?? '?'}" enthält PC Principal nicht exakt einmal.`);
  const cards = deck.cards.filter((entry) => entry.cardId !== 'pc_principal').map((entry) => ({ ...entry }));
  const replacement = cards.find((entry) => {
    const card = data.cardsById[entry.cardId];
    return card?.category !== 'hero' && card?.category !== 'principal' && entry.count < Math.min(2, maxCopiesOf(card, data.config.deckbuilding));
  });
  if (!replacement) throw new Error(`Deck "${deck.name ?? '?'}" hat keine zulässige Ersatzkopie für die Ohne-PC-Serie.`);
  replacement.count += 1;
  return validateDeck({ ...deck, name: `${deck.name ?? 'Deck'} – ohne PC Principal`, cards }, data);
}

function withPcPrincipal(deck: DeckList, data: GameData): DeckList {
  if (deck.cards.some((entry) => entry.cardId === 'pc_principal')) return deck;
  const cards = deck.cards.map((entry) => ({ ...entry }));
  const replacement = cards.find((entry) => {
    const card = data.cardsById[entry.cardId];
    return entry.count > 1 && card?.category !== 'hero' && card?.category !== 'principal';
  });
  if (!replacement) throw new Error(`Deck "${deck.name ?? '?'}" hat keine ersetzbare Karte fuer die PC-Principal-Serie.`);
  replacement.count -= 1;
  cards.push({ cardId: 'pc_principal', count: 1 });
  return validateDeck({ ...deck, name: `${deck.name ?? 'Deck'} + PC Principal`, cards }, data);
}

function pcSeriesTasks(
  active: Record<string, DeckList>,
  data: GameData,
  games: number,
  baseSeed: number
): { tasks: Task[]; decks: Record<string, DeckList> } {
  const baseIds = Object.keys(active).sort();
  const decks: Record<string, DeckList> = {};
  for (const id of baseIds) {
    decks[`${id}__ohne_pc`] = withoutPcPrincipal(active[id], data);
    decks[`${id}__mit_pc`] = withPcPrincipal(active[id], data);
  }
  const configurations: [string, string][] = [];
  for (let a = 0; a < baseIds.length; a++) for (let b = a + 1; b < baseIds.length; b++) {
    const left = baseIds[a];
    const right = baseIds[b];
    configurations.push(
      [`${left}__ohne_pc`, `${right}__ohne_pc`],
      [`${left}__mit_pc`, `${right}__mit_pc`],
      [`${left}__mit_pc`, `${right}__ohne_pc`],
      [`${left}__ohne_pc`, `${right}__mit_pc`]
    );
  }
  const tasks: Task[] = [];
  for (let configIndex = 0; configIndex < configurations.length; configIndex++) {
    const [deckA, deckB] = configurations[configIndex];
    for (const startingPlayer of [0, 1] as PlayerIndex[]) for (let game = 0; game < games; game++) {
      const index = tasks.length;
      const seed = seedMix(baseSeed, 0x5043, configIndex, startingPlayer, game);
      tasks.push({ index, matchId: `pc-${seed.toString(16).padStart(8, '0')}-${index}`, seed, deckA, deckB, botA: 'control', botB: 'control', startingPlayer });
    }
  }
  return { tasks, decks };
}

function basicAnomalies(matches: MatchRecord[], config: Config): Anomaly[] {
  const anomalies: Anomaly[] = [];
  for (const match of matches) {
    for (const side of [0, 1] as PlayerIndex[]) {
      const remainingDeck = new Set(match.stats.deckInstanzen[side]);
      for (const [cardId, stats] of Object.entries(match.stats.proKarte[side])) {
        const drawn = Object.values(match.stats.instanzen).filter(
          (instance) => instance.owner === side && instance.cardId === cardId && !remainingDeck.has(instance.id)
        ).length;
        if (stats.gespielt > drawn) {
          anomalies.push({
            severity: 'critical',
            type: 'DRAW_INSTANCE_MISMATCH',
            message: `${cardId}: ${stats.gespielt} ausgespielt, aber nur ${drawn} physische Ziehungen erfasst.`,
            matchId: match.matchId,
            details: { side, cardId, played: stats.gespielt, drawn }
          });
        }
      }
    }
    if (match.endReason === 'roundLimit' && config.replays.saveOnRoundLimit) {
      anomalies.push({ severity: 'critical', type: 'ROUND_LIMIT', message: 'Partie erreichte das technische Rundenlimit.', matchId: match.matchId });
    }
    if (match.maxSingleRoundDamage > config.replays.saveOnHighSingleRoundDamage) {
      anomalies.push({
        severity: 'warning',
        type: 'HIGH_SINGLE_ROUND_DAMAGE',
        message: `${match.maxSingleRoundDamage} Basisschaden innerhalb einer Runde.`,
        matchId: match.matchId,
        details: { damage: match.maxSingleRoundDamage }
      });
    }
    if (match.winner !== 'draw' && match.roundsPlayed < config.replays.saveOnWinBeforeRound) {
      anomalies.push({ severity: 'warning', type: 'EARLY_WIN', message: `Sieg bereits in Runde ${match.roundsPlayed}.`, matchId: match.matchId });
    }
    for (const action of match.actions.filter((entry) => entry.cardId === 'pc_principal')) {
      if ((action.zieleBetroffen ?? 0) >= 3 || (action.attackRemoved ?? 0) >= 10 || (action.healthRemoved ?? 0) >= 10) {
        anomalies.push({
          severity: 'warning',
          type: 'PC_PRINCIPAL_SWING',
          message: 'PC Principal erzeugte einen auffaelligen Mehrzielwert.',
          matchId: match.matchId,
          details: {
            targetsAffected: action.zieleBetroffen,
            attackRemoved: action.attackRemoved,
            healthRemoved: action.healthRemoved
          }
        });
      }
      if (match.winner === action.spieler && match.roundsPlayed - action.runde <= 2) {
        anomalies.push({
          severity: 'warning',
          type: 'PC_PRINCIPAL_QUICK_WIN',
          message: 'Sieg innerhalb von zwei Runden nach PC Principal.',
          matchId: match.matchId,
          details: { playRound: action.runde, winRound: match.roundsPlayed }
        });
      }
    }
  }
  return anomalies;
}

function aggregate(matches: MatchRecord[], decks: Record<string, DeckList>, config: Config, anomalies: Anomaly[]) {
  const matchup = new Map<string, { deckA: string; deckB: string; botA: BotId; botB: BotId; startingPlayer: number; games: number; winsA: number; winsB: number; draws: number; rounds: number; base: number }>();
  const deck = new Map<string, { games: number; wins: number; losses: number; draws: number }>();
  let firstWins = 0;
  let decisive = 0;
  for (const match of matches) {
    const key = [match.deckA, match.deckB, match.botA, match.botB, match.startingPlayer].join('|');
    const row = matchup.get(key) ?? { deckA: match.deckA, deckB: match.deckB, botA: match.botA, botB: match.botB, startingPlayer: match.startingPlayer, games: 0, winsA: 0, winsB: 0, draws: 0, rounds: 0, base: 0 };
    row.games += 1;
    row.rounds += match.roundsPlayed;
    row.base += Math.max(0, match.baseHealth[0]) + Math.max(0, match.baseHealth[1]);
    if (match.winner === 0) row.winsA += 1;
    else if (match.winner === 1) row.winsB += 1;
    else row.draws += 1;
    matchup.set(key, row);
    for (const side of [0, 1] as PlayerIndex[]) {
      const id = side === 0 ? match.deckA : match.deckB;
      const d = deck.get(id) ?? { games: 0, wins: 0, losses: 0, draws: 0 };
      d.games += 1;
      if (match.winner === 'draw') d.draws += 1;
      else if (match.winner === side) d.wins += 1;
      else d.losses += 1;
      deck.set(id, d);
    }
    if (match.winner !== 'draw') {
      decisive += 1;
      if (match.winner === match.startingPlayer) firstWins += 1;
    }
  }

  for (const [id, value] of deck) {
    const rate = value.wins / Math.max(1, value.wins + value.losses);
    if (rate < config.thresholds.deckWinRateCriticalMin || rate > config.thresholds.deckWinRateCriticalMax) {
      anomalies.push({ severity: 'critical', type: 'DECK_WIN_RATE', message: `${id}: kritische Winrate ${(rate * 100).toFixed(1)} %.`, details: { deckId: id, winRate: rate } });
    } else if (rate < config.thresholds.deckWinRateWarningMin || rate > config.thresholds.deckWinRateWarningMax) {
      anomalies.push({ severity: 'warning', type: 'DECK_WIN_RATE', message: `${id}: auffaellige Winrate ${(rate * 100).toFixed(1)} %.`, details: { deckId: id, winRate: rate } });
    }
  }
  const firstPlayerWinRate = firstWins / Math.max(1, decisive);
  if (firstPlayerWinRate >= config.thresholds.firstPlayerCritical) anomalies.push({ severity: 'critical', type: 'FIRST_PLAYER_ADVANTAGE', message: `Kritischer Startspieler-Vorteil ${(firstPlayerWinRate * 100).toFixed(1)} %.` });
  else if (firstPlayerWinRate >= config.thresholds.firstPlayerWarning) anomalies.push({ severity: 'warning', type: 'FIRST_PLAYER_ADVANTAGE', message: `Auffaelliger Startspieler-Vorteil ${(firstPlayerWinRate * 100).toFixed(1)} %.` });

  const matchups = [...matchup.values()].map((row) => ({
    ...row,
    winRateA: row.winsA / Math.max(1, row.winsA + row.winsB),
    averageRounds: row.rounds / row.games,
    averageRemainingBaseHealth: row.base / row.games
  }));
  const decksSummary = Object.fromEntries([...deck].map(([id, value]) => [id, {
    ...value,
    winRate: value.wins / Math.max(1, value.wins + value.losses)
  }]));
  return { matchups, decksSummary, firstPlayerWinRate };
}

function cardRows(matches: MatchRecord[], decks: Record<string, DeckList>) {
  interface CardAgg {
    cardId: string; deckId: string; botType: string; gamesDeck: number; inDeck: number; startHand: number; drawn: number; played: number; endHand: number; winsDeck: number; winsDrawn: number; gamesDrawn: number; winsPlayed: number; gamesPlayed: number; playRoundSum: number; playEvents: number; creatureDamage: number; baseDamage: number; healing: number; kills: number; attackGranted: number; healthGranted: number; attackRemoved: number; healthRemoved: number; buffCreatureDamage: number; buffBaseDamage: number; tokensGenerated: number; movesGenerated: number;
  }
  const map = new Map<string, CardAgg>();
  for (const match of matches) {
    for (const side of [0, 1] as PlayerIndex[]) {
      const deckId = side === 0 ? match.deckA : match.deckB;
      const botType = side === 0 ? match.botA : match.botB;
      const won = match.winner === side;
      for (const entry of decks[deckId].cards) {
        const key = `${entry.cardId}|${deckId}|${botType}`;
        const agg = map.get(key) ?? { cardId: entry.cardId, deckId, botType, gamesDeck: 0, inDeck: 0, startHand: 0, drawn: 0, played: 0, endHand: 0, winsDeck: 0, winsDrawn: 0, gamesDrawn: 0, winsPlayed: 0, gamesPlayed: 0, playRoundSum: 0, playEvents: 0, creatureDamage: 0, baseDamage: 0, healing: 0, kills: 0, attackGranted: 0, healthGranted: 0, attackRemoved: 0, healthRemoved: 0, buffCreatureDamage: 0, buffBaseDamage: 0, tokensGenerated: 0, movesGenerated: 0 };
        const playerStats = match.stats.proSpieler[side];
        const cardStats = match.stats.proKarte[side][entry.cardId];
        const instanceIds = Object.values(match.stats.instanzen).filter((instance) => instance.owner === side && instance.cardId === entry.cardId).map((instance) => instance.id);
        const remainingDeck = new Set(match.stats.deckInstanzen[side]);
        const drawn = instanceIds.filter((id) => !remainingDeck.has(id)).length;
        const played = cardStats?.gespielt ?? 0;
        agg.gamesDeck += 1;
        agg.inDeck += entry.count;
        agg.startHand += count(playerStats.anfangshand, entry.cardId);
        agg.drawn += drawn;
        agg.played += played;
        agg.endHand += count(playerStats.endhand, entry.cardId);
        if (won) agg.winsDeck += 1;
        if (drawn > 0) { agg.gamesDrawn += 1; if (won) agg.winsDrawn += 1; }
        if (played > 0) { agg.gamesPlayed += 1; if (won) agg.winsPlayed += 1; }
        for (const action of match.actions.filter((a) => a.spieler === side && a.cardId === entry.cardId)) {
          agg.playRoundSum += action.runde;
          agg.playEvents += 1;
        }
        agg.creatureDamage += cardStats?.schadenKreatur ?? 0;
        agg.baseDamage += cardStats?.schadenBasis ?? 0;
        agg.healing += cardStats?.geheilt ?? 0;
        agg.kills += cardStats?.kills ?? 0;
        agg.attackGranted += cardStats?.atkGewaehrt ?? 0;
        agg.healthGranted += cardStats?.hpGewaehrt ?? 0;
        agg.attackRemoved += cardStats?.atkEntfernt ?? 0;
        agg.healthRemoved += cardStats?.hpEntfernt ?? 0;
        agg.buffCreatureDamage += cardStats?.buffSchadenKreatur ?? 0;
        agg.buffBaseDamage += cardStats?.buffSchadenBasis ?? 0;
        agg.tokensGenerated += cardStats?.tokensErzeugt ?? 0;
        agg.movesGenerated += cardStats?.bewegungenErzeugt ?? 0;
        map.set(key, agg);
      }
    }
  }
  return [...map.values()].map((agg) => ({
    ...agg,
    notPlayed: Math.max(0, agg.drawn - agg.played),
    playRate: agg.drawn > 0 ? agg.played / agg.drawn : 0,
    winRateInDeck: agg.winsDeck / Math.max(1, agg.gamesDeck),
    winRateDrawn: agg.winsDrawn / Math.max(1, agg.gamesDrawn),
    winRatePlayed: agg.winsPlayed / Math.max(1, agg.gamesPlayed),
    averagePlayRound: agg.playRoundSum / Math.max(1, agg.playEvents)
  }));
}

function roundRows(matches: MatchRecord[]) {
  const map = new Map<string, { deckId: string; round: number; n: number; base: number; board: number; hand: number; energy: number; lanes: number }>();
  for (const match of matches) for (const snap of match.rounds) for (const side of [0, 1] as PlayerIndex[]) {
    const deckId = side === 0 ? match.deckA : match.deckB;
    const key = `${deckId}|${snap.runde}`;
    const row = map.get(key) ?? { deckId, round: snap.runde, n: 0, base: 0, board: 0, hand: 0, energy: 0, lanes: 0 };
    row.n += 1; row.base += snap.basis[side]; row.board += snap.brett[side]; row.hand += snap.hand[side]; row.energy += snap.energie[side]; row.lanes += snap.kontrollierteLanes[side];
    map.set(key, row);
  }
  return [...map.values()].map((row) => ({
    deckId: row.deckId,
    round: row.round,
    averageBaseHealth: row.base / row.n,
    averageBoardSize: row.board / row.n,
    averageHandSize: row.hand / row.n,
    averageUnusedEnergy: row.energy / row.n,
    averageControlledLanes: row.lanes / row.n
  })).sort((a, b) => a.deckId.localeCompare(b.deckId) || a.round - b.round);
}

function matchRows(matches: MatchRecord[], data: GameData) {
  return matches.flatMap((match) => ([0, 1] as PlayerIndex[]).map((side) => {
    const actions = match.actions.filter((action) => action.spieler === side);
    const cardStats = Object.values(match.stats.proKarte[side]);
    const opponentStats = Object.values(match.stats.proKarte[side === 0 ? 1 : 0]);
    const cardActions = actions.filter((action) => action.aktion.type === 'playCreature' || action.aktion.type === 'playAction');
    return {
      matchId: match.matchId,
      deckId: side === 0 ? match.deckA : match.deckB,
      botType: side === 0 ? match.botA : match.botB,
      side,
      winner: match.winner === side ? 1 : match.winner === 'draw' ? null : 0,
      startingPlayer: match.startingPlayer === side ? 1 : 0,
      roundsPlayed: match.roundsPlayed,
      baseHealth: match.baseHealth[side],
      cardsDrawn: match.stats.proSpieler[side].kartenGezogen,
      cardsPlayed: cardActions.length,
      energySpent: actions.reduce((sum, action) => sum + Math.max(0, action.energieVorher - action.energieNachher), 0),
      energyUnused: match.stats.proSpieler[side].energieVerfallen,
      creaturesSummoned: actions.filter((action) => action.aktion.type === 'playCreature').length,
      creaturesDestroyed: opponentStats.reduce((sum, card) => sum + card.gestorben, 0),
      baseDamage: cardStats.reduce((sum, card) => sum + card.schadenBasis, 0),
      healing: match.stats.proSpieler[side].heilung,
      laneMoves: actions.filter((action) => {
        if (action.aktion.type === 'flyMove') return true;
        const card = action.cardId ? data.cardsById[action.cardId] : undefined;
        return card?.type === 'action' && card.effect.kind === 'moveCreature';
      }).length
    };
  }));
}

function pcPrincipalRows(matches: MatchRecord[]) {
  return matches.flatMap((match) => match.actions
    .filter((action) => action.cardId === 'pc_principal')
    .map((action) => ({
      matchId: match.matchId,
      deckId: action.spieler === 0 ? match.deckA : match.deckB,
      botType: action.spieler === 0 ? match.botA : match.botB,
      side: action.spieler,
      round: action.runde,
      targetsAffected: action.zieleBetroffen ?? 0,
      attackRemoved: action.attackRemoved ?? 0,
      healthRemoved: action.healthRemoved ?? 0,
      boardValueBefore: action.boardValueBefore ?? 0,
      boardValueAfter: action.boardValueAfter ?? 0,
      boardValueRemoved: Math.max(0, (action.boardValueBefore ?? 0) - (action.boardValueAfter ?? 0)),
      won: match.winner === action.spieler,
      winWithinOneRound: match.winner === action.spieler && match.roundsPlayed - action.runde <= 1,
      winWithinTwoRounds: match.winner === action.spieler && match.roundsPlayed - action.runde <= 2
    })));
}

function advancedAnalysis(matches: MatchRecord[], decks: Record<string, DeckList>, data: GameData) {
  const comeback = {
    trailingBy5BaseHealth: { chances: 0, wins: 0 },
    trailingBy2Creatures: { chances: 0, wins: 0 },
    losingTwoLanes: { chances: 0, wins: 0 }
  };
  const snowball = {
    moreCreaturesRound3: { chances: 0, wins: 0 },
    moreCreaturesRound5: { chances: 0, wins: 0 },
    moreBaseRound3: { chances: 0, wins: 0 },
    moreBaseRound5: { chances: 0, wins: 0 },
    firstTwoLanes: { chances: 0, wins: 0 },
    firstHero: { chances: 0, wins: 0 },
    firstCost5: { chances: 0, wins: 0 }
  };
  const observe = (bucket: { chances: number; wins: number }, side: PlayerIndex, winner: PlayerIndex | 'draw') => {
    bucket.chances += 1;
    if (winner === side) bucket.wins += 1;
  };
  const deckCost = new Map<string, { plays: Record<number, number>; energyUsed: number; energyAvailable: number; startCost: number; startCards: number; games: number }>();
  const lanes = new Map<string, { deckId: string; lane: number; occupied: number; snapshots: number }>();

  for (const match of matches) {
    for (const side of [0, 1] as PlayerIndex[]) {
      if (match.rounds.some((round) => round.basis[side] + 5 <= round.basis[side === 0 ? 1 : 0])) observe(comeback.trailingBy5BaseHealth, side, match.winner);
      if (match.rounds.some((round) => round.brett[side] + 2 <= round.brett[side === 0 ? 1 : 0])) observe(comeback.trailingBy2Creatures, side, match.winner);
      if (match.rounds.some((round) => round.kontrollierteLanes[side] + 2 <= round.kontrollierteLanes[side === 0 ? 1 : 0])) observe(comeback.losingTwoLanes, side, match.winner);
    }
    for (const roundNumber of [3, 5]) {
      const round = match.rounds.find((snapshot) => snapshot.runde === roundNumber);
      if (!round) continue;
      const creatureLeader = round.brett[0] === round.brett[1] ? null : round.brett[0] > round.brett[1] ? 0 : 1;
      const baseLeader = round.basis[0] === round.basis[1] ? null : round.basis[0] > round.basis[1] ? 0 : 1;
      if (creatureLeader != null) observe(roundNumber === 3 ? snowball.moreCreaturesRound3 : snowball.moreCreaturesRound5, creatureLeader, match.winner);
      if (baseLeader != null) observe(roundNumber === 3 ? snowball.moreBaseRound3 : snowball.moreBaseRound5, baseLeader, match.winner);
    }
    const firstTwo = match.rounds.find((round) => round.kontrollierteLanes[0] >= 2 !== (round.kontrollierteLanes[1] >= 2));
    if (firstTwo) observe(snowball.firstTwoLanes, firstTwo.kontrollierteLanes[0] >= 2 ? 0 : 1, match.winner);
    if (match.firstHeroPlayer !== undefined) observe(snowball.firstHero, match.firstHeroPlayer, match.winner);
    const highCost = match.actions.find((action) => action.cardId && (data.cardsById[action.cardId]?.cost ?? 0) >= 5);
    if (highCost) observe(snowball.firstCost5, highCost.spieler, match.winner);

    for (const side of [0, 1] as PlayerIndex[]) {
      const deckId = side === 0 ? match.deckA : match.deckB;
      const curve = deckCost.get(deckId) ?? { plays: {}, energyUsed: 0, energyAvailable: 0, startCost: 0, startCards: 0, games: 0 };
      curve.games += 1;
      for (const cardId of match.stats.proSpieler[side].anfangshand) {
        curve.startCost += data.cardsById[cardId]?.cost ?? 0;
        curve.startCards += 1;
      }
      let usedThisMatch = 0;
      for (const action of match.actions.filter((entry) => entry.spieler === side && entry.cardId)) {
        const cost = data.cardsById[action.cardId!]?.cost;
        if (cost != null) curve.plays[cost] = (curve.plays[cost] ?? 0) + 1;
        usedThisMatch += Math.max(0, action.energieVorher - action.energieNachher);
      }
      curve.energyUsed += usedThisMatch;
      curve.energyAvailable += usedThisMatch + match.stats.proSpieler[side].energieVerfallen;
      deckCost.set(deckId, curve);
      for (const round of match.rounds) round.laneBelegt?.[side]?.forEach((occupied, lane) => {
        const key = `${deckId}|${lane}`;
        const row = lanes.get(key) ?? { deckId, lane, occupied: 0, snapshots: 0 };
        row.snapshots += 1;
        if (occupied) row.occupied += 1;
        lanes.set(key, row);
      });
    }
  }
  const rate = (value: { chances: number; wins: number }) => ({ ...value, winRate: value.wins / Math.max(1, value.chances) });
  return {
    comeback: Object.fromEntries(Object.entries(comeback).map(([key, value]) => [key, rate(value)])),
    snowball: Object.fromEntries(Object.entries(snowball).map(([key, value]) => [key, rate(value)])),
    costCurves: Object.fromEntries([...deckCost].map(([deckId, value]) => [deckId, {
      playsByCost: value.plays,
      averageEnergyUtilization: value.energyUsed / Math.max(1, value.energyAvailable),
      averageStartingHandCost: value.startCost / Math.max(1, value.startCards)
    }])),
    laneUsage: [...lanes.values()].map((row) => ({ ...row, occupancyRate: row.occupied / Math.max(1, row.snapshots) }))
  };
}

function reportMarkdown(mode: Mode, games: number, lanes: number, contracts: ReturnType<typeof deckContracts>, matches: MatchRecord[], summary: ReturnType<typeof aggregate>, cards: ReturnType<typeof cardRows>, advanced: ReturnType<typeof advancedAnalysis>, anomalies: Anomaly[]) {
  const lines: string[] = [];
  lines.push('# PC Fighters – Balancing-Bericht', '', `Erzeugt: ${new Date().toISOString()}`, `Modus: ${mode} · Lanes: ${lanes} · Partien: ${matches.length} · Partien je Startseite/Konfiguration: ${games}`, '');
  lines.push('## Verwendete Deckverträge', '', '| Deck | Karten | Heroes | Hero-IDs | PC Principal |', '|---|---:|---:|---|---:|');
  for (const [id, contract] of Object.entries(contracts)) lines.push(`| ${id} | ${contract.size} | ${contract.heroes} | ${contract.heroIds.join(', ')} | ${contract.principals} |`);
  lines.push('## Deck-Gesamtwinrates', '', '| Deck | Partien | Siege | Niederlagen | Winrate |', '|---|---:|---:|---:|---:|');
  for (const [id, value] of Object.entries(summary.decksSummary)) lines.push(`| ${id} | ${value.games} | ${value.wins} | ${value.losses} | ${(value.winRate * 100).toFixed(1)} % |`);
  lines.push('', '## Startspieler', '', `Startspieler-Winrate (nur entschiedene Partien): **${(summary.firstPlayerWinRate * 100).toFixed(1)} %**`, '');
  lines.push('## Matchups', '', '| Deck A | Deck B | Bots | Start | Spiele | Winrate A | Ø Runden |', '|---|---|---|---:|---:|---:|---:|');
  for (const row of summary.matchups) lines.push(`| ${row.deckA} | ${row.deckB} | ${row.botA}/${row.botB} | ${row.startingPlayer} | ${row.games} | ${(row.winRateA * 100).toFixed(1)} % | ${row.averageRounds.toFixed(2)} |`);
  lines.push('', '## Auffaellige Karten', '', '| Karte | Deck | Bot | Ausspielrate | Winrate gezogen | Winrate gespielt | Ø Ausspielrunde |', '|---|---|---|---:|---:|---:|---:|');
  for (const card of [...cards].sort((a, b) => b.winRatePlayed - a.winRatePlayed).slice(0, 20)) lines.push(`| ${card.cardId} | ${card.deckId} | ${card.botType} | ${(card.playRate * 100).toFixed(1)} % | ${(card.winRateDrawn * 100).toFixed(1)} % | ${(card.winRatePlayed * 100).toFixed(1)} % | ${card.averagePlayRound.toFixed(2)} |`);
  lines.push('', '## Kostenkurven', '', '| Deck | Ø Energieauslastung | Ø Kosten der Starthand | Ausgespielt nach Kosten |', '|---|---:|---:|---|');
  for (const [deckId, curve] of Object.entries(advanced.costCurves)) lines.push(`| ${deckId} | ${(curve.averageEnergyUtilization * 100).toFixed(1)} % | ${curve.averageStartingHandCost.toFixed(2)} | ${Object.entries(curve.playsByCost).map(([cost, amount]) => `${cost}: ${amount}`).join(' · ')} |`);
  lines.push('', '## Lane-Nutzung', '', '| Deck | Lane | Belegungsrate |', '|---|---:|---:|');
  for (const lane of advanced.laneUsage) lines.push(`| ${lane.deckId} | ${lane.lane + 1} | ${(lane.occupancyRate * 100).toFixed(1)} % |`);
  lines.push('', '## Schneeball und Comebacks', '', '| Messung | Fälle | Siegerfolge |', '|---|---:|---:|');
  for (const [key, value] of Object.entries({ ...advanced.snowball, ...advanced.comeback })) lines.push(`| ${key} | ${value.chances} | ${(value.winRate * 100).toFixed(1)} % |`);
  lines.push('', '## Auffaelligkeiten und Replays', '');
  if (anomalies.length === 0) lines.push('Keine automatisch erkannten Auffaelligkeiten.');
  else for (const anomaly of anomalies.slice(0, 100)) lines.push(`- **${anomaly.severity.toUpperCase()} / ${anomaly.type}:** ${anomaly.message}${anomaly.replay ? ` – [Replay](${anomaly.replay.replace(/\\/g, '/')})` : ''}`);
  lines.push('', '## PC Principal', '');
  const pcActions = matches.flatMap((match) => match.actions.map((action) => ({ match, action }))).filter(({ action }) => action.cardId === 'pc_principal');
  if (pcActions.length === 0) lines.push('In den aktuell aktiven, rebalancierten Decklisten wurde PC Principal nicht ausgespielt. Die Messfelder bleiben aktiv und werden automatisch befuellt, sobald er in einem Testdeck vorkommt.');
  else lines.push(`Ausgespielt: ${pcActions.length} · Ø Ziele: ${(pcActions.reduce((s, x) => s + (x.action.zieleBetroffen ?? 0), 0) / pcActions.length).toFixed(2)} · Ø entfernte ATK: ${(pcActions.reduce((s, x) => s + (x.action.attackRemoved ?? 0), 0) / pcActions.length).toFixed(2)}.`);
  lines.push('', '## Hinweise', '', '- Alle Aktionen liefen ueber `applyAction`; Kartendaten und Effekte wurden nicht im Simulator dupliziert.', '- Seeds sind unabhaengig von der Ausfuehrungsreihenfolge.', '- `matches.jsonl` enthaelt kompakte Matchdaten; auffaellige Vollreplays liegen unter `replays/`.');
  return lines.join('\n') + '\n';
}

export async function runBalancing(argv: string[] = process.argv.slice(2)): Promise<string> {
  const { values, flags } = parseArgs(argv);
  const configPath = resolve(values.config ?? join(HERE, 'balancing.config.json'));
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as Config;
  const mode = (values.mode ?? 'technical') as Mode;
  if (mode !== 'technical' && mode !== 'full' && mode !== 'pc') throw new Error('--mode muss technical, full oder pc sein.');
  const defaultGames = mode === 'full'
    ? config.simulation.gamesPerMatchupPerStartingSide
    : mode === 'pc'
      ? config.simulation.pcPrincipalGamesPerConfiguration
      : config.simulation.technicalGamesPerConfiguration;
  const games = Number(values.games ?? defaultGames);
  if (!Number.isInteger(games) || games < 1) throw new Error('--games muss eine positive ganze Zahl sein.');
  const baseSeed = Number(values.seed ?? 1) >>> 0;
  const dataDir = values['data-dir'] ? resolve(values['data-dir']) : undefined;
  const loadedData = loadGameData(dataDir);
  const lanes = Number(values.lanes ?? loadedData.config.lanes);
  if (loadedData.config.lanes !== 5 || lanes !== 5) {
    throw new Error('PC Fighters und alle Balancing-Läufe verwenden dauerhaft genau 5 Lanes.');
  }
  const data: GameData = loadedData;
  const activeDecks = ladeAktiveDecks(data, dataDir);
  let decks = activeDecks;
  let deckIds = Object.keys(decks).sort();
  if (values['deck-a'] || values['deck-b']) {
    if (!values['deck-a'] || !values['deck-b']) throw new Error('--deck-a und --deck-b muessen gemeinsam gesetzt werden.');
    deckIds = [...new Set([values['deck-a'], values['deck-b']])];
  }
  for (const id of deckIds) if (!decks[id]) throw new Error(`Deck "${id}" ist nicht fuer die Alpha freigeschaltet.`);
  const botOverride = values['bot-a'] || values['bot-b']
    ? [values['bot-a'] ?? 'standard', values['bot-b'] ?? 'standard'] as [BotId, BotId]
    : undefined;
  if (botOverride) for (const id of botOverride) if (!BOT_PROFILE[id]) throw new Error(`Unbekanntes Bot-Profil "${id}".`);
  const includeMirrors = flags.has('mirrors') || (!flags.has('no-mirrors') && config.simulation.includeMirrorMatches);
  let tasks: Task[];
  if (mode === 'pc') {
    const pc = pcSeriesTasks(activeDecks, data, games, baseSeed);
    tasks = pc.tasks;
    decks = pc.decks;
    deckIds = Object.keys(decks).sort();
  } else {
    tasks = tasksFor(deckIds, mode, games, includeMirrors, baseSeed, config.technicalBotMatchups, botOverride);
  }
  if (values['deck-a'] && values['deck-b']) tasks = tasks.filter((task) => task.deckA === values['deck-a'] && task.deckB === values['deck-b']);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = resolve(values.out ?? join('balancing-results', `${stamp}-${mode}`));
  const replayDir = join(outputDir, 'replays');
  mkdirSync(replayDir, { recursive: true });

  const matches: MatchRecord[] = [];
  const anomalies: Anomaly[] = [];
  const started = Date.now();
  const configuredWorkers = values.workers ?? config.simulation.parallelWorkers;
  const workerCount = configuredWorkers === 'auto'
    ? Math.min(4, Math.max(1, availableParallelism() - 1), tasks.length)
    : Math.min(tasks.length, Math.max(1, Number(configuredWorkers)));
  if (!Number.isFinite(workerCount)) throw new Error('--workers muss auto oder eine positive Zahl sein.');
  console.error(`Balancing: ${tasks.length} Partien, ${deckIds.length} aktive Decks, Modus ${mode}, Worker ${workerCount}.`);
  let lastReported = 0;
  const sourceDir = values['source-dir'] ? resolve(values['source-dir']) : HERE;
  const run = await runTasks(tasks, decks, data, config, workerCount, sourceDir, (done, errors) => {
    const interval = Math.max(1, Math.floor(tasks.length / 20));
    if (done === tasks.length || done - lastReported >= interval) {
      lastReported = done;
      console.error(`Simulation ${done} / ${tasks.length} · Fehler: ${errors} · verbleibend: ${tasks.length - done}`);
    }
  });
  matches.push(...run.records);
  for (const failure of run.failures) anomalies.push({
    severity: 'critical',
    type: 'ERROR',
    message: failure.message,
    matchId: failure.task.matchId,
    details: { task: failure.task }
  });

  anomalies.push(...basicAnomalies(matches, config));
  const taskById = new Map(tasks.map((task) => [task.matchId, task]));
  const replayCandidates = [...new Set(anomalies.map((a) => a.matchId).filter(Boolean) as string[])].slice(0, config.replays.maxSavedPerRun);
  for (const matchId of replayCandidates) {
    const task = taskById.get(matchId);
    if (!task) continue;
    try {
      const replayResult = runTask(task, decks, data, config, true);
      const replayPath = join(replayDir, `${matchId}.json`);
      writeFileSync(replayPath, JSON.stringify({ deckA: task.deckA, deckB: task.deckB, botA: task.botA, botB: task.botB, replay: replayResult.replay }, null, 2), 'utf8');
      for (const anomaly of anomalies.filter((a) => a.matchId === matchId)) anomaly.replay = `replays/${matchId}.json`;
    } catch (error) {
      // Ein Crash-Replay kann scheitern; die Task-Konfiguration steht dennoch in anomalies.json.
    }
  }

  const summary = aggregate(matches, decks, config, anomalies);
  const cards = cardRows(matches, decks);
  const rounds = roundRows(matches);
  const matchStatistics = matchRows(matches, data);
  const pcStatistics = pcPrincipalRows(matches);
  const advanced = advancedAnalysis(matches, decks, data);
  const contracts = deckContracts(decks, data);
  const report = reportMarkdown(mode, games, data.config.lanes, contracts, matches, summary, cards, advanced, anomalies);
  const generatedAt = new Date().toISOString();
  writeFileSync(join(outputDir, 'summary.json'), JSON.stringify({ generatedAt, mode, lanes: data.config.lanes, baseSeed, gamesPerConfiguration: games, activeDecks: deckIds, deckContracts: contracts, totalMatches: matches.length, durationMs: Date.now() - started, ...summary, ...advanced }, null, 2), 'utf8');
  writeFileSync(join(outputDir, 'matches.jsonl'), matches.map((match) => JSON.stringify({ ...match, stats: undefined, actions: undefined, rounds: undefined })).join('\n') + '\n', 'utf8');
  writeFileSync(join(outputDir, 'deck_matchups.csv'), csv([
    ['deckA', 'deckB', 'botA', 'botB', 'startingPlayer', 'games', 'winsA', 'winsB', 'draws', 'winRateA', 'averageRounds', 'averageRemainingBaseHealth'],
    ...summary.matchups.map((row) => [row.deckA, row.deckB, row.botA, row.botB, row.startingPlayer, row.games, row.winsA, row.winsB, row.draws, row.winRateA, row.averageRounds, row.averageRemainingBaseHealth])
  ]), 'utf8');
  writeFileSync(join(outputDir, 'card_statistics.csv'), csv([
    ['cardId', 'deckId', 'botType', 'inDeck', 'startHand', 'drawn', 'played', 'notPlayed', 'endHand', 'playRate', 'winRateInDeck', 'winRateDrawn', 'winRatePlayed', 'averagePlayRound', 'creatureDamage', 'baseDamage', 'healing', 'kills', 'attackGranted', 'healthGranted', 'attackRemoved', 'healthRemoved', 'buffCreatureDamage', 'buffBaseDamage', 'tokensGenerated', 'movesGenerated'],
    ...cards.map((row) => [row.cardId, row.deckId, row.botType, row.inDeck, row.startHand, row.drawn, row.played, row.notPlayed, row.endHand, row.playRate, row.winRateInDeck, row.winRateDrawn, row.winRatePlayed, row.averagePlayRound, row.creatureDamage, row.baseDamage, row.healing, row.kills, row.attackGranted, row.healthGranted, row.attackRemoved, row.healthRemoved, row.buffCreatureDamage, row.buffBaseDamage, row.tokensGenerated, row.movesGenerated])
  ]), 'utf8');
  writeFileSync(join(outputDir, 'round_statistics.csv'), csv([
    ['deckId', 'round', 'averageBaseHealth', 'averageBoardSize', 'averageHandSize', 'averageUnusedEnergy', 'averageControlledLanes'],
    ...rounds.map((row) => [row.deckId, row.round, row.averageBaseHealth, row.averageBoardSize, row.averageHandSize, row.averageUnusedEnergy, row.averageControlledLanes])
  ]), 'utf8');
  writeFileSync(join(outputDir, 'match_statistics.csv'), csv([
    ['matchId', 'deckId', 'botType', 'side', 'winner', 'startingPlayer', 'roundsPlayed', 'baseHealth', 'cardsDrawn', 'cardsPlayed', 'energySpent', 'energyUnused', 'creaturesSummoned', 'creaturesDestroyed', 'baseDamage', 'healing', 'laneMoves'],
    ...matchStatistics.map((row) => Object.values(row))
  ]), 'utf8');
  writeFileSync(join(outputDir, 'pc_principal_statistics.csv'), csv([
    ['matchId', 'deckId', 'botType', 'side', 'round', 'targetsAffected', 'attackRemoved', 'healthRemoved', 'boardValueBefore', 'boardValueAfter', 'boardValueRemoved', 'won', 'winWithinOneRound', 'winWithinTwoRounds'],
    ...pcStatistics.map((row) => Object.values(row) as (string | number)[])
  ]), 'utf8');
  writeFileSync(join(outputDir, 'lane_statistics.csv'), csv([
    ['deckId', 'lane', 'occupiedSnapshots', 'snapshots', 'occupancyRate'],
    ...advanced.laneUsage.map((row) => [row.deckId, row.lane + 1, row.occupied, row.snapshots, row.occupancyRate])
  ]), 'utf8');
  writeFileSync(join(outputDir, 'anomalies.json'), JSON.stringify(anomalies, null, 2), 'utf8');
  writeFileSync(join(outputDir, 'report.md'), report, 'utf8');
  console.error(`Fertig: ${matches.length} Partien in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  console.error(`Bericht: ${join(outputDir, 'report.md')}`);
  if (anomalies.some((anomaly) => anomaly.type === 'ERROR')) {
    throw new Error('Mindestens eine Simulation ist fehlgeschlagen; Details stehen in anomalies.json.');
  }
  return outputDir;
}

const isMain = isMainThread && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runBalancing().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
