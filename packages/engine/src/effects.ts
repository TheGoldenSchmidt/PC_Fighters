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
import { zieheKarten } from './draw.js';
import { registriereAktionsBuff, zaehleKarte } from './stats.js';
import type { ActionCard, Effect, EnvironmentCard, GameState, PlayerAction, PlayerIndex, SuperpowerCard } from './types.js';

type EffectOf<K extends Effect['kind']> = Extract<Effect, { kind: K }>;

interface EffectContext {
  state: GameState;
  player: PlayerIndex;
  card: ActionCard | EnvironmentCard | SuperpowerCard;
  action: Extract<PlayerAction, { type: 'playAction' | 'playEnvironment' }>;
}

function targetLane(action: EffectContext['action']): number | undefined {
  return action.type === 'playEnvironment' ? action.lane : action.targetLane;
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
    const { creature, lane } = requireFriendlyCreature(ctx, targetLane(ctx.action));
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
    const { creature, lane } = requireFriendlyCreature(ctx, targetLane(ctx.action));
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
    const { creature, lane } = requireFriendlyCreature(ctx, targetLane(ctx.action));
    const to = ctx.action.type === 'playAction' ? ctx.action.toLane : undefined;
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
            lane: targetLane(ctx.action) ?? 0,
            attacker: owner,
            damage: basisschaden,
            toBase: true
          }
        : undefined
    );
  },

  referenz(ctx, effect) {
    // Häufige Grundmuster der Kartenreferenz sind sofort spielbar. Spezielle
    // Texte bleiben sichtbar und können später ohne Datenmigration durch ein
    // festes Effekt-Primitiv ersetzt werden.
    const text = effect.text;
    const lane = targetLane(ctx.action);
    const enemy = otherPlayer(ctx.player);
    let applied = false;

    const drawMatch = text.match(/(?:ziehe|karten? ziehen)[^0-9]*(\d+)|(\d+)\s+karten?\s+ziehen/i);
    const drawCount = Number(drawMatch?.[1] ?? drawMatch?.[2] ?? 0);
    if (drawCount > 0) {
      zieheKarten(ctx.state, ctx.player, drawCount);
      applied = true;
    }

    const healMatch = text.match(/(?:heile?|heilung)[^0-9]*(\d+)|(\d+)\s+(?:leben|heilen)/i);
    const heal = Number(healMatch?.[1] ?? healMatch?.[2] ?? 0);
    if (heal > 0 && /held|basis|heilen|heilung/i.test(text)) {
      const player = ctx.state.players[ctx.player];
      player.base = Math.min(ctx.state.config.baseHealth, player.base + heal);
      applied = true;
    }

    const buff = text.match(/\+(\d+)\s*\/\s*\+(\d+)/);
    if (buff && lane != null) {
      const target = ctx.state.board[ctx.player][lane];
      if (target) {
        target.permAttackBonus += Number(buff[1]);
        target.permHealthBonus += Number(buff[2]);
        applied = true;
      }
    }

    const attackBuff = text.match(/\+(\d+)\s+angriff/i);
    if (attackBuff && lane != null) {
      const target = ctx.state.board[ctx.player][lane];
      if (target) {
        target.permAttackBonus += Number(attackBuff[1]);
        applied = true;
      }
    }

    const healthBuff = text.match(/\+(\d+)\s+(?:leben|gesundheit|hp)/i);
    if (healthBuff && lane != null && !/held|basis/i.test(text)) {
      const target = ctx.state.board[ctx.player][lane];
      if (target) {
        target.permHealthBonus += Number(healthBuff[1]);
        applied = true;
      }
    }

    const debuff = text.match(/-(\d+)\s+angriff/i);
    if (debuff && lane != null) {
      const target = ctx.state.board[enemy][lane];
      if (target) {
        if (ctx.card.type === 'action' && target.keywords.includes('untrickable')) {
          throw new GameRuleError(`${target.name} ist trickresistent.`);
        }
        target.permAttackBonus -= Number(debuff[1]);
        applied = true;
      }
    }

    const damageMatch = text.match(/(\d+)\s+schaden/i);
    if (damageMatch) {
      const damage = Number(damageMatch[1]);
      const target = lane == null ? null : ctx.state.board[enemy][lane];
      if (target) {
        if (ctx.card.type === 'action' && target.keywords.includes('untrickable')) {
          throw new GameRuleError(`${target.name} ist trickresistent.`);
        }
        target.currentHealth -= Math.max(0, damage - (target.keywords.includes('armored') ? 1 : 0));
        target.letzterSchaden = { art: 'effekt', quelle: ctx.card.id, owner: ctx.player };
      } else {
        basisSchaden(ctx.state, enemy, damage);
      }
      applied = true;
    }

    const token = text.match(/(\d+)\s*\/\s*(\d+).*(?:erzeug|beschwör|in gewählte Lane)/i);
    if (token) {
      const summonLane = lane != null && !ctx.state.board[ctx.player][lane]
        ? lane
        : freeLanes(ctx.state, ctx.player)[0];
      if (summonLane != null) {
        const creature = makeTokenCreature(ctx.state, ctx.card.faction, {
          name: 'Beschworener Kämpfer', attack: Number(token[1]), health: Number(token[2]), keywords: []
        });
        ctx.state.board[ctx.player][summonLane] = creature;
        applied = true;
      }
    }

    if (/dauerhaft\s+\+1\s+(?:sun|brain|energie)\s+pro\s+runde/i.test(text)) {
      ctx.state.players[ctx.player].energyPerRoundBonus = (ctx.state.players[ctx.player].energyPerRoundBonus ?? 0) + 1;
      applied = true;
    }

    if (/schutzschild|unverwundbar.*basis|basis.*unverwundbar/i.test(text)) {
      ctx.state.players[ctx.player].basisImmun = true;
      applied = true;
    }

    if (/zerstöre|vernichte/i.test(text) && lane != null) {
      const target = ctx.state.board[enemy][lane];
      if (target && (ctx.card.type !== 'action' || !target.keywords.includes('untrickable'))) {
        target.currentHealth = 0;
        target.letzterSchaden = { art: 'effekt', quelle: ctx.card.id, owner: ctx.player };
        applied = true;
      }
    }

    log(
      ctx.state,
      applied ? `${ctx.card.name}: ${text}` : `${ctx.card.name}: Referenzregel vorgemerkt – ${text}`,
      { kind: 'spell', lane: lane ?? 0, effect: 'superpower', faction: ctx.card.faction }
    );
  }
};

export function resolveEffect(ctx: EffectContext): void {
  const effect = ctx.card.effect;
  const resolver = EFFECTS[effect.kind] as EffectResolver<typeof effect.kind>;
  resolver(ctx, effect);
  recalcBoard(ctx.state);
}
