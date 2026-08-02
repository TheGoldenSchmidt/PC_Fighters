// Gemeinsame Fixtures für Engine-Tests. Diese Datei wird importiert und nicht
// selbst als Suite eingesammelt.

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
    schild: 0,
    basisImmun: false,
    gespieltDieseRunde: []
  };
}

/** Leerer Testzustand: Runde 1, Ausspielphase, Spieler 0 am Zug. */
export function emptyState(): GameState {
  return {
    config: structuredClone(data.config),
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
    uidCounter: 0,
    rngState: 1,
    aufloesung: [],
    reaktion: null,
    naechsteReaktionsId: 1
  };
}

/** Stellt eine Kreatur direkt aufs Feld (Standard: kampfbereit). */
export function put(
  state: GameState,
  owner: PlayerIndex,
  lane: number,
  cardId: string,
  opts: { exhausted?: boolean; spawnRound?: number } = {}
): Creature {
  const card = data.cardsById[cardId] as CreatureCard;
  state.uidCounter += 1;
  const creature: Creature = {
    uid: state.uidCounter,
    cardId,
    name: card.name,
    faction: card.faction,
    keywords: card.keywords,
    abilities: (card.abilities ?? []).map((ability) => ({ ...ability })),
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
  state.board[owner][lane] = creature;
  recalcBoard(state);
  return creature;
}

/** Beide Spieler passen und die automatische Auflösung läuft bis zur Eingabe. */
export function passBoth(state: GameState): GameState {
  let current = state;
  if (current.phase === 'mulligan') {
    current = applyAction(current, 0, { type: 'mulligan', handIndices: [] }, data);
    current = applyAction(current, 1, { type: 'mulligan', handIndices: [] }, data);
  }
  const afterFirst = applyAction(current, current.active, { type: 'pass' }, data);
  return applyAction(afterFirst, afterFirst.active, { type: 'pass' }, data);
}

export function setzeHand(state: GameState, playerIndex: PlayerIndex, cards: string[]): void {
  state.players[playerIndex].hand = [...cards];
}

export function setzeDeck(state: GameState, playerIndex: PlayerIndex, cards: string[]): void {
  state.players[playerIndex].deck = [...cards];
}

export function beendeFlugphase(state: GameState): GameState {
  let current = state;
  while (current.phase === 'fly') {
    current = applyAction(current, current.active, { type: 'flyDone' }, data);
  }
  return current;
}

/** Prüft, dass die gefilterte Sicht keine gegnerischen Geheimnisse enthält. */
export function pruefeSicht(state: GameState): void {
  for (const me of [0, 1] as PlayerIndex[]) {
    const opponent = (me === 0 ? 1 : 0) as PlayerIndex;
    const view = buildClientView(state, me, data);
    expect(view.you).toBe(me);
    expect(view.hand).toHaveLength(state.players[me].hand.length);
    expect(view.players[opponent].handCount).toBe(state.players[opponent].hand.length);
    expect(view.players[opponent].deckCount).toBe(state.players[opponent].deck.length);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('"knowledge"');
    expect(serialized).not.toContain('"stats"');
    expect(view.players[opponent]).not.toHaveProperty('hand');
    expect(view.players[opponent]).not.toHaveProperty('deck');
  }
}
