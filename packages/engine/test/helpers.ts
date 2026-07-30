// Gemeinsame Test-Fixtures für alle Engine-Suites.
//
// Bewusst KEINE *.test.ts-Datei: Vitest läuft hier ohne Config und sammelt nur
// `**/*.test.ts` ein – diese Datei wird also importiert, nicht ausgeführt.
//
// Die Helper `player`/`emptyState`/`put`/`passBoth` lagen bis hierher wortgleich
// dreifach in engine.test.ts, bot.test.ts und stats.test.ts. Beim Zusammenführen
// wurde die Vereinigungsmenge übernommen (u. a. `opts.spawnRound` aus
// stats.test.ts, das die `flinkAngriffe`-Telemetrie aushebelt).

import { expect } from 'vitest';
import { applyAction, buildClientView, buildFactionTree, loadGameData } from '../src/index.js';
import { recalcBoard } from '../src/internal.js';
import type {
  Creature,
  CreatureCard,
  GameData,
  GameState,
  PlayerIndex,
  PlayerState
} from '../src/types.js';

export const data: GameData = loadGameData();

export function player(faction: string): PlayerState {
  return {
    faction,
    cheerleaders: ['pc_principal', 'pc_babies', 'alter_wissenschaftler'],
    deck: [],
    hand: [],
    base: data.config.baseHealth,
    energy: 10,
    knowledge: 0,
    flyDone: false,
    mulliganDone: false,
    gespieltDieseRunde: []
  };
}

/** Leerer Testzustand: Runde 1, Ausspielphase, Spieler 0 am Zug. */
export function emptyState(): GameState {
  return {
    config: data.config,
    factionTree: buildFactionTree(data.factions),
    round: 1,
    phase: 'play',
    startingPlayer: 0,
    active: 0,
    consecutivePasses: 0,
    players: [player('humans'), player('animals')],
    board: [
      Array.from({ length: data.config.lanes }, () => null),
      Array.from({ length: data.config.lanes }, () => null)
    ],
    log: [],
    winner: null,
    uidCounter: 0
  };
}

/** Stellt eine Kreatur direkt aufs Feld (Standard: kampfbereit, spawnRound = state.round). */
export function put(
  state: GameState,
  owner: PlayerIndex,
  lane: number,
  cardId: string,
  opts: { exhausted?: boolean; spawnRound?: number } = {}
): Creature {
  const card = data.cardsById[cardId] as CreatureCard;
  state.uidCounter += 1;
  const c: Creature = {
    uid: state.uidCounter,
    cardId,
    name: card.name,
    faction: card.faction,
    keywords: card.keywords,
    abilities: (card.abilities ?? []).map((a) => ({ ...a })),
    baseAttack: card.attack,
    baseMaxHealth: card.health,
    permHealthBonus: 0,
    permAttackBonus: 0,
    tempAttackBonus: 0,
    tempHealthBonus: 0,
    currentHealth: card.health,
    lastMaxHealth: card.health,
    exhausted: opts.exhausted ?? false,
    movedThisFlyPhase: false,
    isToken: false,
    poison: 0,
    attackedThisRound: false,
    spawnRound: opts.spawnRound ?? state.round,
    ueberstundenDone: false,
    rettungUsed: false,
    schutzUsed: false,
    zaehler: {},
    rundenZaehler: {}
  };
  state.board[owner][lane] = c;
  recalcBoard(state);
  return c;
}

/** Beide Spieler passen → Kampfphase läuft, danach Rundenende/Flugphase. */
export function passBoth(state: GameState): GameState {
  if (state.phase === 'mulligan') {
    state = applyAction(state, 0, { type: 'mulligan', handIndices: [] }, data);
    state = applyAction(state, 1, { type: 'mulligan', handIndices: [] }, data);
  }
  const afterFirst = applyAction(state, state.active, { type: 'pass' }, data);
  return applyAction(afterFirst, afterFirst.active, { type: 'pass' }, data);
}

// ------------------------------------------------------ Skript-Partie-Helper

/**
 * Setzt die Hand eines Spielers direkt. Notwendig für determinierte Partien:
 * jeder `random()`-Verbraucher der Engine sitzt im Deck-Shuffle (game.ts), und
 * selbst ein Leer-Mulligan mischt das Deck neu – die Ziehreihenfolge ist also
 * nicht über einen Seed vorhersagbar, ohne den Shuffle nachzubauen.
 */
export function setzeHand(state: GameState, spieler: PlayerIndex, karten: string[]): void {
  state.players[spieler].hand = [...karten];
}

/** Setzt das Nachziehdeck direkt (Index 0 = nächste gezogene Karte). */
export function setzeDeck(state: GameState, spieler: PlayerIndex, karten: string[]): void {
  state.players[spieler].deck = [...karten];
}

/** Meldet beide Spieler aus der Flugphase ab (No-Op außerhalb der Flugphase). */
export function beendeFlugphase(state: GameState): GameState {
  let s = state;
  while (s.phase === 'fly') {
    s = applyAction(s, s.active, { type: 'flyDone' }, data);
  }
  return s;
}

/**
 * Invariante der Server-Architektur: die Client-Sicht ist eine echte Teilmenge
 * des GameState. Sie darf niemals gegnerische Handkarten, gegnerisches Deck,
 * `knowledge` oder `stats` enthalten (siehe CLAUDE.md, "Filtered views").
 */
export function pruefeSicht(state: GameState): void {
  for (const ich of [0, 1] as PlayerIndex[]) {
    const gegner = (ich === 0 ? 1 : 0) as PlayerIndex;
    const view = buildClientView(state, ich, data);
    expect(view.you).toBe(ich);
    // Eigene Hand vollständig, gegnerische nur als Zähler.
    expect(view.hand).toHaveLength(state.players[ich].hand.length);
    expect(view.players[gegner].handCount).toBe(state.players[gegner].hand.length);
    expect(view.players[gegner].deckCount).toBe(state.players[gegner].deck.length);
    const serialisiert = JSON.stringify(view);
    expect(serialisiert).not.toContain('"knowledge"');
    expect(serialisiert).not.toContain('"stats"');
    for (const feld of ['hand', 'deck'] as const) {
      expect(view.players[gegner]).not.toHaveProperty(feld);
      expect(view.players[ich]).not.toHaveProperty(feld);
    }
  }
}
