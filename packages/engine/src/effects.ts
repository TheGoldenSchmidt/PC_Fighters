// Effekt-Registry für Aktionskarten. Neue Effekt-Art = neuer Eintrag hier
// plus ein Eintrag im effectSchema (schema.ts), damit die Validierung ihn kennt.

import {
  freeLanes,
  GameRuleError,
  log,
  makeTokenCreature,
  recalcBoard
} from './internal.js';
import type { ActionCard, Effect, GameState, PlayerAction, PlayerIndex } from './types.js';

type EffectOf<K extends Effect['kind']> = Extract<Effect, { kind: K }>;

interface EffectContext {
  state: GameState;
  player: PlayerIndex;
  card: ActionCard;
  action: Extract<PlayerAction, { type: 'playAction' }>;
}

type EffectResolver<K extends Effect['kind']> = (ctx: EffectContext, effect: EffectOf<K>) => void;

function requireFriendlyCreature(ctx: EffectContext, lane: number | undefined) {
  if (lane === undefined || lane < 0 || lane >= ctx.state.config.lanes) {
    throw new GameRuleError('Bitte eine eigene Kreatur als Ziel wählen.');
  }
  const creature = ctx.state.board[ctx.player][lane];
  if (!creature) {
    throw new GameRuleError('In dieser Lane steht keine eigene Kreatur.');
  }
  return { creature, lane };
}

export const EFFECTS: { [K in Effect['kind']]: EffectResolver<K> } = {
  buffHealth(ctx, effect) {
    const { creature, lane } = requireFriendlyCreature(ctx, ctx.action.targetLane);
    // Nur das Maximum erhöhen – recalcBoard() hebt das aktuelle Leben mit an.
    creature.permHealthBonus += effect.amount;
    log(ctx.state, `${ctx.card.name}: ${creature.name} erhält dauerhaft +${effect.amount} Leben.`, {
      kind: 'spell',
      lane,
      effect: 'buff',
      faction: ctx.card.faction
    });
  },

  buffAttackTemp(ctx, effect) {
    const { creature, lane } = requireFriendlyCreature(ctx, ctx.action.targetLane);
    creature.tempAttackBonus += effect.amount;
    log(
      ctx.state,
      `${ctx.card.name}: ${creature.name} erhält +${effect.amount} Angriff bis zum Rundenende.`,
      { kind: 'spell', lane, effect: 'attackBuff', faction: ctx.card.faction }
    );
  },

  summon(ctx, effect) {
    const lanes = freeLanes(ctx.state, ctx.player);
    if (lanes.length === 0) {
      throw new GameRuleError('Keine freie Lane – es kann nichts beschworen werden.');
    }
    const count = Math.min(effect.count, lanes.length);
    for (let i = 0; i < count; i++) {
      const creature = makeTokenCreature(ctx.state, ctx.card.faction, effect.token);
      ctx.state.board[ctx.player][lanes[i]] = creature;
      log(
        ctx.state,
        `${ctx.card.name}: ${creature.name} (${effect.token.attack}/${effect.token.health}) erscheint in Lane ${lanes[i] + 1}.`,
        { kind: 'spell', lane: lanes[i], effect: 'summon', faction: ctx.card.faction }
      );
    }
  },

  moveCreature(ctx) {
    const { creature, lane } = requireFriendlyCreature(ctx, ctx.action.targetLane);
    const to = ctx.action.toLane;
    if (to === undefined || to < 0 || to >= ctx.state.config.lanes) {
      throw new GameRuleError('Bitte eine Ziel-Lane wählen.');
    }
    if (ctx.state.board[ctx.player][to]) {
      throw new GameRuleError('Die Ziel-Lane ist nicht frei.');
    }
    if (to === lane) {
      throw new GameRuleError('Die Kreatur steht schon in dieser Lane.');
    }
    ctx.state.board[ctx.player][to] = creature;
    ctx.state.board[ctx.player][lane] = null;
    log(ctx.state, `${ctx.card.name}: ${creature.name} wechselt in Lane ${to + 1}.`, {
      kind: 'spell',
      lane: to,
      effect: 'move',
      faction: ctx.card.faction
    });
  }
};

export function resolveEffect(ctx: EffectContext): void {
  const effect = ctx.card.effect;
  const resolver = EFFECTS[effect.kind] as EffectResolver<typeof effect.kind>;
  resolver(ctx, effect);
  recalcBoard(ctx.state);
}
