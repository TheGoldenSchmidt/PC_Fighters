// Effekt-Registry für Aktionskarten. Neue Effekt-Art = neuer Eintrag hier
// plus ein Eintrag im effectSchema (schema.ts), damit die Validierung ihn kennt.

import {
  freeLanes,
  GameRuleError,
  log,
  makeTokenCreature,
  otherPlayer,
  recalcBoard
} from './internal.js';
import { basisSchaden } from './schild.js';
import { registriereAktionsBuff, zaehleKarte } from './stats.js';
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
    zaehleKarte(ctx.state, ctx.player, ctx.card.id, 'hpGewaehrt', effect.amount);
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
    registriereAktionsBuff(ctx.state, ctx.player, creature, ctx.card.id, effect.amount);
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
    zaehleKarte(ctx.state, ctx.player, ctx.card.id, 'tokensErzeugt', count);
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

  moveCreature(ctx, effect) {
    const { creature, lane } = requireFriendlyCreature(ctx, ctx.action.targetLane);
    const to = ctx.action.toLane;
    if (to === undefined || to < 0 || to >= ctx.state.config.lanes) {
      throw new GameRuleError('Bitte eine Ziel-Lane wählen.');
    }
    if (to === lane) {
      throw new GameRuleError('Die Kreatur steht schon in dieser Lane.');
    }
    if (ctx.state.board[ctx.player][to]) {
      throw new GameRuleError('Die Ziel-Lane ist nicht frei.');
    }
    ctx.state.board[ctx.player][to] = creature;
    ctx.state.board[ctx.player][lane] = null;
    if (effect.tempAtkBonus) {
      creature.tempAttackBonus += effect.tempAtkBonus;
      registriereAktionsBuff(ctx.state, ctx.player, creature, ctx.card.id, effect.tempAtkBonus);
    }
    zaehleKarte(ctx.state, ctx.player, ctx.card.id, 'bewegungenErzeugt');
    log(ctx.state, `${ctx.card.name}: ${creature.name} wechselt in Lane ${to + 1}.`, {
      kind: 'spell',
      lane: to,
      effect: 'move',
      faction: ctx.card.faction
    });
  },

  debuff(ctx, effect) {
    const enemy = otherPlayer(ctx.player);
    for (const c of ctx.state.board[enemy]) {
      if (!c) continue;
      c.tempAttackBonus -= effect.amount;
      zaehleKarte(ctx.state, ctx.player, ctx.card.id, 'atkEntfernt', Math.min(effect.amount, Math.max(0, c.baseAttack + c.permAttackBonus + c.tempAttackBonus + effect.amount)));
    }
    log(
      ctx.state,
      `${ctx.card.name}: alle gegnerischen Kreaturen verlieren bis zum Rundenende ${effect.amount} ATK.`,
      { kind: 'spell', lane: 0, effect: 'attackBuff', faction: ctx.card.faction }
    );
  },

  spendKnowledge(ctx, effect) {
    const owner = ctx.player;
    const enemy = otherPlayer(owner);
    const markers = Math.min(ctx.state.players[owner].knowledge, effect.max);
    if (markers <= 0) return;
    ctx.state.players[owner].knowledge -= markers;
    const gesamt = markers * effect.damagePerMarker;
    let rest = gesamt;
    const liveLanes: number[] = [];
    for (let j = 0; j < ctx.state.board[enemy].length; j++) if (ctx.state.board[enemy][j]) liveLanes.push(j);
    let basisschaden = 0;
    if (liveLanes.length === 0) {
      // Über den Schild-Trichter: auch Effektschaden lädt auf und ist blockbar.
      basisschaden = basisSchaden(ctx.state, enemy, rest);
      zaehleKarte(ctx.state, owner, ctx.card.id, 'schadenBasis', basisschaden);
    } else {
      let i = 0;
      while (rest > 0) {
        const t = ctx.state.board[enemy][liveLanes[i % liveLanes.length]];
        if (t) {
          t.currentHealth -= 1;
          t.letzterSchaden = { art: 'effekt', quelle: ctx.card.id, owner };
        }
        rest -= 1;
        i += 1;
      }
      zaehleKarte(ctx.state, owner, ctx.card.id, 'schadenKreatur', gesamt);
    }
    log(
      ctx.state,
      `${ctx.card.name}: verbraucht ${markers} Wissen, verteilt ${gesamt} Schaden.`,
      basisschaden > 0
        ? {
            kind: 'attack',
            lane: ctx.action.targetLane ?? 0,
            attacker: owner,
            damage: basisschaden,
            toBase: true
          }
        : undefined
    );
  }
};

export function resolveEffect(ctx: EffectContext): void {
  const effect = ctx.card.effect;
  const resolver = EFFECTS[effect.kind] as EffectResolver<typeof effect.kind>;
  resolver(ctx, effect);
  recalcBoard(ctx.state);
}
