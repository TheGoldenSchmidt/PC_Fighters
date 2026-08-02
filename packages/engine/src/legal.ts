// Legale-Züge-Generator: zählt für einen Spieler ALLE regelkonformen Aktionen
// im aktuellen Zustand auf, statt (wie ein naiver Bot) zu raten und
// applyAction() als Filter zu missbrauchen. applyAction klont den kompletten
// GameState VOR der Validierung (game.ts) – ein Bot, der Züge abtastet,
// verwirft dadurch die meisten seiner Klone. legaleAktionen() generiert
// stattdessen nur Züge, die applyAction garantiert akzeptiert.

import { kraftVonSlot } from './cheerleader.js';
import { hasKeyword } from './keywords.js';
import type { ActionCard, GameData, GameState, PlayerAction, PlayerIndex } from './types.js';

function freieLanes(state: GameState, player: PlayerIndex): number[] {
  const lanes: number[] = [];
  for (let i = 0; i < state.config.lanes; i++) {
    if (!state.board[player][i]) lanes.push(i);
  }
  return lanes;
}

function belegteLanes(state: GameState, player: PlayerIndex): number[] {
  const lanes: number[] = [];
  for (let i = 0; i < state.config.lanes; i++) {
    if (state.board[player][i]) lanes.push(i);
  }
  return lanes;
}

/** Sinnvolle Ziel-Kombinationen für eine Aktionskarte – leer, wenn die Karte gerade nicht spielbar ist. */
function aktionskartenZuege(
  state: GameState,
  player: PlayerIndex,
  handIndex: number,
  card: ActionCard
): PlayerAction[] {
  switch (card.effect.kind) {
    case 'buffHealth':
    case 'buffAttackTemp':
      // Braucht eine eigene Kreatur als Ziel (effects.ts: requireFriendlyCreature).
      return belegteLanes(state, player).map((targetLane) => ({
        type: 'playAction' as const,
        handIndex,
        targetLane
      }));
    case 'summon':
      // Kein explizites Ziel – braucht nur mindestens eine freie Lane.
      return freieLanes(state, player).length > 0 ? [{ type: 'playAction', handIndex }] : [];
    case 'debuff':
    case 'spendKnowledge':
      // Kein explizites Ziel – wirkt spielerweit (alle Gegner bzw. der eigene Wissens-Pool).
      return [{ type: 'playAction', handIndex }];
    case 'moveCreature': {
      // Jede eigene besetzte Lane → jede eigene freie Lane.
      const out: PlayerAction[] = [];
      for (const targetLane of belegteLanes(state, player)) {
        for (const toLane of freieLanes(state, player)) {
          out.push({ type: 'playAction', handIndex, targetLane, toLane });
        }
      }
      return out;
    }
    default:
      return [];
  }
}

function legaleSpielAktionen(state: GameState, player: PlayerIndex, data: GameData): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const p = state.players[player];
  const frei = freieLanes(state, player);
  p.hand.forEach((cardId, handIndex) => {
    const card = data.cardsById[cardId];
    if (!card || card.cost > p.energy) return;
    if (card.type === 'creature') {
      for (const lane of frei) actions.push({ type: 'playCreature', handIndex, lane });
    } else {
      actions.push(...aktionskartenZuege(state, player, handIndex, card));
    }
  });
  actions.push({ type: 'pass' });
  return actions;
}

function legaleFlugAktionen(state: GameState, player: PlayerIndex): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const frei = freieLanes(state, player);
  state.board[player].forEach((c, fromLane) => {
    if (!c || !hasKeyword(c, 'flying') || c.movedThisFlyPhase) return;
    for (const toLane of frei) actions.push({ type: 'flyMove', fromLane, toLane });
  });
  actions.push({ type: 'flyDone' });
  return actions;
}

/**
 * Alle regelkonformen Aktionen für `player` im aktuellen `state` – jede
 * zurückgegebene Aktion wird von `applyAction` garantiert akzeptiert. Der
 * Aufrufer muss sicherstellen, dass `player` tatsächlich am Zug ist
 * (`state.active === player`); das prüft diese Funktion nicht extra, weil
 * jeder Aufrufer (Bot, Backtest) diese Invariante ohnehin selbst hält.
 */
export function legaleAktionen(state: GameState, player: PlayerIndex, data: GameData): PlayerAction[] {
  // Ein offenes Reaktionsfenster sperrt alles andere: hier gibt es nur die
  // passenden Opfer (mit Wahl, wo die Kraft eine stellt).
  if (state.reaktion) {
    if (state.reaktion.spieler !== player) return [];
    const reactionId = state.reaktion.id;
    // Kein Verzicht: der Block ist schon eingelöst, es geht nur noch darum,
    // WER sich dafür opfert.
    const actions: PlayerAction[] = [];
    for (const slot of state.reaktion.slots) {
      const eintrag = kraftVonSlot(state, player, slot);
      if (!eintrag) continue;
      if (eintrag.kraft.wirkung.kind === 'wahl') {
        actions.push(
          { type: 'cheerleaderReaction', reactionId, slot, choice: 'A' },
          { type: 'cheerleaderReaction', reactionId, slot, choice: 'B' }
        );
      } else {
        actions.push({ type: 'cheerleaderReaction', reactionId, slot });
      }
    }
    return actions;
  }
  if (state.phase === 'mulligan') return [{ type: 'mulligan', handIndices: [] }];
  return state.phase === 'fly'
    ? legaleFlugAktionen(state, player)
    : legaleSpielAktionen(state, player, data);
}

/** Englischer API-Name fuer Simulatoren und externe Werkzeuge. */
export const getLegalActions = legaleAktionen;
