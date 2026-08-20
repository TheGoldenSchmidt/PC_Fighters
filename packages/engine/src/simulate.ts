// Reine Partie-Simulation: treibt eine komplette Partie über den Heuristik-Bot
// (bot.ts) an, ohne I/O (kein Datei-/Netzwerkzugriff hier). Wird sowohl vom
// Backtest-CLI (scripts/backtest/) als auch vom Golden-Master-Regressionstest
// genutzt – eine einzige Simulationsschleife, damit beide garantiert
// dasselbe Verhalten treiben.

import { BOT_PROFILE, waehleAktion, waehleAktionMitAktionssuche, waehleMulligan } from './bot.js';
import { applyAction, createGame, getEffectiveAttack, getMaxHealth } from './game.js';
import { createSeededRandom } from './rng.js';
import { aktiviereStatistik, finalisiereStatistik, markiereLegaleHandkarten } from './stats.js';
import { legaleAktionen } from './legal.js';
import type { BotProfil } from './bot.js';
import type { BotSuchGrenzen } from './bot.js';
import type {
  CheerleaderSelection,
  DeckList,
  GameData,
  GameState,
  MatchStatistik,
  PlayerAction,
  PlayerIndex
} from './types.js';

export interface SimulationsAktion {
  index: number;
  runde: number;
  spieler: PlayerIndex;
  aktion: PlayerAction;
  energieVorher: number;
  energieNachher: number;
  zustand: string;
  cardId?: string;
  zieleBetroffen?: number;
  attackRemoved?: number;
  healthRemoved?: number;
  boardValueBefore?: number;
  boardValueAfter?: number;
}

export interface RundenSnapshot {
  runde: number;
  basis: [number, number];
  energie: [number, number];
  hand: [number, number];
  deck: [number, number];
  brett: [number, number];
  kontrollierteLanes: [number, number];
  laneBelegt: [boolean[], boolean[]];
}

export interface PartieReplay {
  version: 1;
  matchId: string;
  saat: number;
  startspieler: PlayerIndex;
  cheerleaders: [CheerleaderSelection, CheerleaderSelection];
  aktionen: SimulationsAktion[];
  runden: RundenSnapshot[];
  endzustand: string;
  log: GameState['log'];
}

export interface PartieErgebnis {
  gewinner: PlayerIndex | 'draw';
  runden: number;
  /** true = die Partie endete über das technische roundLimit (Notbremse), nicht durch Basiszerstörung. */
  amRundenlimit: boolean;
  startspieler: PlayerIndex;
  stats: MatchStatistik;
  endState: GameState;
  aktionen: SimulationsAktion[];
  rundenSnapshots: RundenSnapshot[];
  replay?: PartieReplay;
}

export interface PartieOptionen {
  saat: number;
  profilA?: BotProfil;
  profilB?: BotProfil;
  /** Sicherheitsnetz gegen Endlosschleifen bei Datenfehlern (nicht das Spiel-roundLimit). */
  maxSchritte?: number;
  /**
   * Bank-Auswahl je Spieler. Ohne Angabe greift die Standardauswahl (die ersten
   * gültigen Kandidaten) – dann kommen Kräfte am Ende des Kandidatenpools in
   * keiner simulierten Partie vor. Der Backtest rotiert deshalb bewusst.
   */
  cheerleaders?: [CheerleaderSelection, CheerleaderSelection];
  /** Vollstaendiges Engine-Log und Replay-Metadaten mitschreiben. */
  aufzeichnen?: boolean;
  matchId?: string;
  aktionssuche?: boolean;
  suchGrenzen?: Partial<BotSuchGrenzen>;
  /** Erzwingt fuer Sitzordnungs-Tests den Startspieler; ohne Angabe entscheidet der Seed. */
  startspieler?: PlayerIndex;
}

function snapshot(state: GameState): RundenSnapshot {
  const brett = [0, 0] as [number, number];
  const kontrolliert = [0, 0] as [number, number];
  for (const owner of [0, 1] as PlayerIndex[]) {
    for (let lane = 0; lane < state.config.lanes; lane++) {
      if (state.board[owner][lane]) brett[owner] += 1;
      if (state.board[owner][lane] && !state.board[owner === 0 ? 1 : 0][lane]) kontrolliert[owner] += 1;
    }
  }
  return {
    runde: state.round,
    basis: [state.players[0].base, state.players[1].base],
    energie: [state.players[0].energy, state.players[1].energy],
    hand: [state.players[0].hand.length, state.players[1].hand.length],
    deck: [state.players[0].deck.length, state.players[1].deck.length],
    brett,
    kontrollierteLanes: kontrolliert,
    laneBelegt: [
      state.board[0].map(Boolean),
      state.board[1].map(Boolean)
    ]
  };
}

/** Kurzer deterministischer Fingerabdruck ohne Node-/Krypto-Abhaengigkeit. */
export function zustandsFingerabdruck(state: GameState): string {
  const text = JSON.stringify({
    round: state.round,
    phase: state.phase,
    active: state.active,
    players: state.players,
    board: state.board,
    winner: state.winner,
    rngState: state.rngState,
    aufloesung: state.aufloesung,
    reaktion: state.reaktion
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Spielt eine komplette Partie deckA (Spieler 0) gegen deckB (Spieler 1) mit
 * dem Heuristik-Bot auf beiden Seiten. Deterministisch bei gleicher `saat`
 * (siehe rng.ts) – zwei Aufrufe mit identischen Argumenten liefern exakt
 * dasselbe Ergebnis.
 */
export function spielePartie(
  data: GameData,
  deckA: DeckList,
  deckB: DeckList,
  opts: PartieOptionen
): PartieErgebnis {
  const random = createSeededRandom(opts.saat);
  const profilA = opts.profilA ?? BOT_PROFILE.ausgewogen;
  const profilB = opts.profilB ?? BOT_PROFILE.ausgewogen;
  let s = createGame(
    data,
    [deckA.championId ?? deckA.faction ?? 'humans', deckB.championId ?? deckB.faction ?? 'animals'],
    random,
    [deckA, deckB],
    opts.cheerleaders
  );
  if (opts.startspieler !== undefined) {
    s.startingPlayer = opts.startspieler;
    s.active = opts.startspieler;
  }
  const verwendeteCheerleaders = [
    [...s.players[0].cheerleaders],
    [...s.players[1].cheerleaders]
  ] as [CheerleaderSelection, CheerleaderSelection];
  aktiviereStatistik(s);
  s.logModus = opts.aufzeichnen ? 'voll' : 'aus';
  const startspieler = s.startingPlayer;
  const aktionen: SimulationsAktion[] = [];
  const rundenSnapshots: RundenSnapshot[] = [];
  const anwenden = (spieler: PlayerIndex, aktion: PlayerAction, mulligan = false) => {
    const energieVorher = s.players[spieler].energy;
    const cardId = aktion.type === 'playCreature' || aktion.type === 'playAction'
      ? s.players[spieler].hand[aktion.handIndex]
      : undefined;
    let zieleBetroffen: number | undefined;
    let attackRemoved: number | undefined;
    let healthRemoved: number | undefined;
    let boardValueBefore: number | undefined;
    if (cardId === 'pc_principal') {
      const gegner = spieler === 0 ? 1 : 0;
      zieleBetroffen = 0;
      attackRemoved = 0;
      healthRemoved = 0;
      boardValueBefore = 0;
      for (let lane = 0; lane < s.config.lanes; lane++) {
        const ziel = s.board[gegner][lane];
        if (!ziel) continue;
        zieleBetroffen += 1;
        attackRemoved += Math.max(0, getEffectiveAttack(s, gegner, lane));
        healthRemoved += Math.max(0, getMaxHealth(s, gegner, lane) - 1);
        boardValueBefore += getEffectiveAttack(s, gegner, lane) + getMaxHealth(s, gegner, lane);
      }
    }
    s = mulligan
      ? applyAction(s, spieler, aktion, data, random)
      : applyAction(s, spieler, aktion, data);
    const boardValueAfter = cardId === 'pc_principal'
      ? s.board[spieler === 0 ? 1 : 0].reduce((sum, creature, lane) =>
          sum + (creature ? getEffectiveAttack(s, spieler === 0 ? 1 : 0, lane) + getMaxHealth(s, spieler === 0 ? 1 : 0, lane) : 0), 0)
      : undefined;
    aktionen.push({
      index: aktionen.length,
      runde: s.round,
      spieler,
      aktion,
      energieVorher,
      energieNachher: s.players[spieler].energy,
      zustand: zustandsFingerabdruck(s),
      cardId,
      zieleBetroffen,
      attackRemoved,
      healthRemoved
      ,boardValueBefore
      ,boardValueAfter
    });
  };
  anwenden(0, waehleMulligan(s, 0, data, random), true);
  anwenden(1, waehleMulligan(s, 1, data, random), true);
  rundenSnapshots.push(snapshot(s));

  const maxSchritte = opts.maxSchritte ?? 2000;
  let schritte = 0;
  while (s.phase !== 'ended' && schritte < maxSchritte) {
    const profil = s.active === 0 ? profilA : profilB;
    const legal = legaleAktionen(s, s.active, data);
    markiereLegaleHandkarten(s, s.active, legal.flatMap((a) =>
      a.type === 'playCreature' || a.type === 'playAction' ? [a.handIndex] : []
    ));
    const aktion = opts.aktionssuche
      ? waehleAktionMitAktionssuche(s, s.active, data, profil, random, {
          maxActionsPerTurn: opts.suchGrenzen?.maxActionsPerTurn ?? 3,
          maxBranchesPerDecision: opts.suchGrenzen?.maxBranchesPerDecision ?? 12
        })
      : waehleAktion(s, s.active, data, profil, random);
    const rundeVorher = s.round;
    const spieler = s.active;
    anwenden(spieler, aktion);
    // `anwenden` ersetzt `s`; TypeScript sieht die Mutation durch den Closure-Aufruf
    // nicht und behält sonst die Eingangs-Narrowing-Annahme `phase !== 'ended'`.
    if (s.round !== rundeVorher || (s as GameState).phase === 'ended') rundenSnapshots.push(snapshot(s));
    schritte += 1;
  }
  if (s.phase !== 'ended') {
    throw new Error(`Partie terminierte nicht nach ${maxSchritte} Schritten (Saat ${opts.saat}).`);
  }
  finalisiereStatistik(s);

  const replay = opts.aufzeichnen ? {
    version: 1 as const,
    matchId: opts.matchId ?? `match-${opts.saat}`,
    saat: opts.saat,
    startspieler,
    cheerleaders: verwendeteCheerleaders,
    aktionen,
    runden: rundenSnapshots,
    endzustand: zustandsFingerabdruck(s),
    log: s.log
  } : undefined;

  return {
    gewinner: s.winner as PlayerIndex | 'draw',
    runden: s.round,
    amRundenlimit: s.round >= s.config.roundLimit,
    startspieler,
    stats: s.stats!,
    endState: s,
    aktionen,
    rundenSnapshots,
    replay
  };
}
