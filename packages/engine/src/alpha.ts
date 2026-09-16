import { GameRuleError, getEffectiveAttack, getMaxHealth, log, makeCreature, otherPlayer } from './internal.js';
import { zieheKarten } from './draw.js';
import { wuerfle } from './rng.js';
import { basisSchaden } from './schild.js';
import type { ScriptEffect, ScriptStep } from './alphaTypes.js';
import type { CardDef, Creature, CreatureView, GameData, GameState, PlayerAction, PlayerIndex, SpellEvent } from './types.js';

type Play = Extract<PlayerAction, { type: 'playAction' }>;
export interface Place { owner: PlayerIndex; lane: number; rear: boolean; creature: Creature }
export function figures(state: GameState, owner?: PlayerIndex): Place[] {
  return ([0, 1] as PlayerIndex[]).filter(p => owner === undefined || p === owner).flatMap(p =>
    state.board[p].flatMap((front, lane) => [
      ...(front ? [{ owner: p, lane, rear: false, creature: front }] : []),
      ...(state.teamBoard?.[p]?.[lane] ? [{ owner: p, lane, rear: true, creature: state.teamBoard[p][lane]! }] : [])
    ]));
}
/** Ergänzt Instanzen für historische Fixtures; reguläres Ausspielen entfernt beide Einträge zusammen. */
export function syncHands(state: GameState): void {
  state.nextHandId ??= 1;
  for (const p of state.players) {
    const remaining = [...(p.handInstances ?? [])];
    p.handInstances = p.hand.map(cardId => {
      const i = remaining.findIndex(x => x.cardId === cardId);
      return i >= 0 ? remaining.splice(i, 1)[0] : { id: state.nextHandId!++, cardId, discount: 0 };
    });
    p.graveyard ??= [];
  }
}
export function cardCost(state: GameState, owner: PlayerIndex, index: number, card: CardDef): number {
  const p = state.players[owner];
  return card.type === 'superpower' && p.freeSuperpowerId === card.id ? 0 : Math.max(0, card.cost - (p.handInstances?.[index]?.discount ?? 0));
}
export function addHand(state: GameState, owner: PlayerIndex, cardId: string, discount = 0): void {
  syncHands(state);
  const p = state.players[owner];
  if (p.hand.length >= (state.config.handLimit ?? 10)) throw new GameRuleError('Deine Hand ist voll.');
  p.hand.push(cardId);
  p.handInstances!.push({ id: state.nextHandId!++, cardId, discount });
}
export function removeHand(state: GameState, owner: PlayerIndex, index: number): void {
  syncHands(state);
  state.players[owner].hand.splice(index, 1);
  state.players[owner].handInstances!.splice(index, 1);
}
export function damageCreature(state: GameState, place: Place, amount: number, onTarget?: (target: Place) => void, combat = false): number {
  const c = place.creature;
  if (amount <= 0 || (c.hiddenUntil ?? 0) > state.round) { onTarget?.(place); return 0; }
  if ((c.shieldHits ?? 0) > 0) { onTarget?.(place); c.shieldHits!--; return 0; }
  if (c.protectorUid) {
    const protector = figures(state, place.owner).find(x => x.creature.uid === c.protectorUid && x.creature.currentHealth > 0);
    c.protectorUid = undefined;
    if (protector) return damageCreature(state, protector, amount, onTarget, combat);
  }
  onTarget?.(place);
  if (combat && c.keywords.includes('armored')) amount = Math.max(0, amount - 1);
  c.currentHealth -= amount;
  return amount;
}
function removeFigure(state: GameState, p: Place): void {
  if (p.rear) state.teamBoard![p.owner][p.lane] = null;
  else { state.board[p.owner][p.lane] = state.teamBoard?.[p.owner]?.[p.lane] ?? null; if (state.teamBoard) state.teamBoard[p.owner][p.lane] = null; }
}
export function expireAlpha(state: GameState): void {
  for (const p of figures(state)) {
    const c = p.creature;
    if (c.expiresRound !== undefined && c.expiresRound < state.round) { c.currentHealth = 0; c.destroyed = true; }
    if ((c.hiddenUntil ?? 0) <= state.round) c.hiddenUntil = undefined;
    if ((c.stunnedUntil ?? 0) <= state.round) c.stunnedUntil = undefined;
    if (c.temporaryDeadly) { c.keywords = c.keywords.filter(k => k !== 'deadly'); c.temporaryDeadly = false; }
    c.protectorUid = undefined;
  }
}
function publicCreature(state: GameState, p: Place, data: GameData): CreatureView {
  const c = p.creature;
  if (c.faceDown) return { uid: c.uid, cardId: 'hidden:gravestone', name: 'Verdeckte Figur', attack: 0, health: 1, maxHealth: 1, baseAttack: 0, baseMaxHealth: 1, keywords: [], abilities: [], poison: 0, exhausted: true, canFly: false, faceDown: true };
  const hp = getMaxHealth(state, p.owner, p.lane, p.rear);
  return { uid: c.uid, cardId: c.cardId, name: c.name, attack: getEffectiveAttack(state, p.owner, p.lane, p.rear), health: c.currentHealth, maxHealth: hp, baseAttack: c.baseAttack, baseMaxHealth: c.baseMaxHealth, keywords: [...c.keywords], abilities: structuredClone(c.abilities), poison: c.poison, exhausted: c.exhausted, canFly: false, text: data.cardsById[c.cardId]?.text, shieldHits: c.shieldHits, hiddenUntil: c.hiddenUntil, stunnedUntil: c.stunnedUntil };
}
export function effectEvent(state: GameState, data: GameData, card: CardDef, owner: PlayerIndex, effect: SpellEvent['effect'], targets: Place[] = [], delta?: number, batch?: number): void {
  if (state.logModus === 'aus') return;
  const snapshot = (rear: boolean): [Array<CreatureView | null>, Array<CreatureView | null>] => ([0, 1] as PlayerIndex[]).map(p =>
    state.board[p].map((_, lane) => { const place = figures(state, p).find(x => x.lane === lane && x.rear === rear); return place ? publicCreature(state, place, data) : null; })
  ) as [Array<CreatureView | null>, Array<CreatureView | null>];
  const common = { boardAfter: snapshot(false), teamBoardAfter: snapshot(true), basesAfter: state.players.map(p => p.base) as [number, number], energyAfter: state.players.map(p => p.energy) as [number, number] };
  for (const target of targets.length ? targets : [null]) log(state, `${card.name}: ${effect === 'hand' ? 'Hand verändert' : card.text ?? card.name}`, {
    kind: 'spell', batch, sourceCardId: card.id, owner: target?.owner ?? owner, lane: target?.lane ?? -1, targetUid: target?.creature.uid, effect, faction: card.faction, delta, ...common
  });
}
export function scriptActions(state: GameState, owner: PlayerIndex, handIndex: number, effect: ScriptEffect, data: GameData): Play[] {
  const base: Play = { type: 'playAction', handIndex };
  const own = figures(state, owner).filter(p => p.creature.currentHealth > 0 && !p.creature.hiddenUntil);
  const enemy = figures(state, otherPlayer(owner)).filter(p => p.creature.currentHealth > 0 && !p.creature.hiddenUntil && !p.creature.faceDown && !p.creature.keywords.includes('untrickable'));
  const lanes = [0, 1, 2, 3, 4];
  let out: Play[] = [];
  switch (effect.target) {
    case 'none': out = [base]; break;
    case 'friendly': case 'damaged': case 'sacrifice':
      out = own.filter(p => effect.target !== 'damaged' || p.creature.currentHealth < (getMaxHealth(state, owner, p.lane, p.rear)))
        .flatMap(p => effect.target === 'sacrifice' ? own.filter(q => q.creature.uid !== p.creature.uid && (data.cardsById[p.creature.cardId]?.cost ?? 99) <= 2).map(q => ({ ...base, targetUid: p.creature.uid, targetLane: p.lane, secondUid: q.creature.uid })) : [{ ...base, targetUid: p.creature.uid, targetLane: p.lane }]); break;
    case 'enemy': case 'enemyOrBase':
      out = enemy.filter(p => effect.steps.every(s => (s.minAttack === undefined || getEffectiveAttack(state, p.owner, p.lane, p.rear) >= s.minAttack) && (s.maxAttack === undefined || getEffectiveAttack(state, p.owner, p.lane, p.rear) <= s.maxAttack) && (s.op !== 'destroy' || !p.creature.abilities.some(a => a.kind === 'urgewalt'))))
        .map(p => ({ ...base, targetUid: p.creature.uid, targetLane: p.lane }));
      if (effect.target === 'enemyOrBase') out.push({ ...base, targetLane: -1 }); break;
    case 'move': out = own.flatMap(p => lanes.filter(l => l !== p.lane && !state.board[owner][l] && (l !== 4 || p.creature.keywords.includes('amphibious'))).map(toLane => ({ ...base, targetLane: p.lane, targetUid: p.creature.uid, toLane }))); break;
    case 'hand': out = (state.players[owner].handInstances ?? []).filter((h, i) => i !== handIndex && data.cardsById[h.cardId]?.type === 'creature').map(h => ({ ...base, handInstanceId: h.id })); break;
    case 'grave': out = (state.players[owner].graveyard ?? []).filter(g => (data.cardsById[g.cardId]?.cost ?? 99) <= (effect.steps.find(s => s.op === 'revive')?.maxCost ?? 3)).flatMap(g => lanes.filter(l => !state.board[owner][l] && (l !== 4 || (data.cardsById[g.cardId] as { keywords?: string[] })?.keywords?.includes('amphibious'))).map(toLane => ({ ...base, graveId: g.id, toLane }))); break;
  }
  if (effect.steps.some(s => s.op === 'return' || s.op === 'conjure') && state.players[owner].hand.length > (state.config.handLimit ?? 10)) return [];
  if (effect.steps.some(s => s.op === 'summon' && lanes.every(l => !!state.board[owner][l] || (l === 4 && !(data.cardsById[s.cardId ?? 'alpha_pteranodon'] as { keywords?: string[] })?.keywords?.includes('amphibious'))))) return [];
  return out;
}
export function resolveScript(state: GameState, owner: PlayerIndex, card: CardDef, action: Play, effect: ScriptEffect, data: GameData): void {
  const selected = () => figures(state).find(p => p.creature.uid === action.targetUid);
  const p = state.players[owner];
  const targets = (s: ScriptStep): Place[] => {
    if (!s.scope || s.scope === 'selected') return selected() ? [selected()!] : [];
    if (s.scope === 'base') return [];
    return figures(state, s.scope === 'enemy' || s.scope === 'groundEnemy' ? otherPlayer(owner) : owner).filter(x => {
      if (x.creature.currentHealth <= 0 || x.creature.hiddenUntil || x.creature.faceDown) return false;
      if (x.owner !== owner && x.creature.keywords.includes('untrickable')) return false;
      if (s.scope === 'groundEnemy') return x.lane > 0 && x.lane < 4;
      if (s.scope === 'adjacent') return Math.abs(x.lane - (selected()?.lane ?? -10)) <= 1;
      if (s.scope === 'wolvesCats') return data.cardsById[x.creature.cardId]?.tribes?.some(t => t === 'wolf' || t === 'cat');
      return true;
    });
  };
  for (const step of effect.steps) {
    const before = new Map(figures(state).map(q => [q.creature.uid, { hp: q.creature.currentHealth, atk: q.creature.permAttackBonus + q.creature.tempAttackBonus, hpBonus: q.creature.permHealthBonus + q.creature.tempHealthBonus }]));
    const baseBefore = state.players.map(p => p.base);
    const energyBefore = p.energy;
    const amount = step.amount ?? 1;
    let list = targets(step);
    let visual: SpellEvent['effect'] = 'buff';
    switch (step.op) {
      case 'buff':
        for (const { creature: c } of list) { c[step.temporary ? 'tempAttackBonus' : 'permAttackBonus'] += step.atk ?? 0; c[step.temporary ? 'tempHealthBonus' : 'permHealthBonus'] += step.hp ?? 0; if (step.hp) { c.currentHealth += step.hp; c.lastMaxHealth = Math.max(1, c.lastMaxHealth + step.hp); } }
        visual = (step.atk ?? 0) < 0 || (step.hp ?? 0) < 0 ? 'debuff' : 'buff'; break;
      case 'heal':
        if (step.scope === 'base') p.base = Math.min(state.config.baseHealth, p.base + amount);
        for (const q of list) q.creature.currentHealth = Math.min(getMaxHealth(state, q.owner, q.lane, q.rear), q.creature.currentHealth + amount);
        visual = 'heal'; break;
      case 'shield': for (const q of list) q.creature.shieldHits = (q.creature.shieldHits ?? 0) + amount; visual = 'shield'; break;
      case 'protect': { const q = selected(); const dest = figures(state, owner).find(x => x.creature.uid === action.secondUid); if (!q || !dest) throw new GameRuleError('Bitte Beschützer und Verbündeten wählen.'); dest.creature.protectorUid = q.creature.uid; list = [dest]; visual = 'shield'; break; }
      case 'stun': for (const q of list) q.creature.stunnedUntil = state.round + 1; visual = 'debuff'; break;
      case 'hide': for (const q of list) q.creature.hiddenUntil = state.round + 1; visual = 'shield'; break;
      case 'deadly': for (const q of list) if (!q.creature.keywords.includes('deadly')) { q.creature.keywords.push('deadly'); q.creature.temporaryDeadly = true; } break;
      case 'damage':
        if (action.targetLane === -1 || step.scope === 'base') basisSchaden(state, otherPlayer(owner), amount);
        { const hit: Place[] = []; for (const q of list) damageCreature(state, q, amount, actual => { actual.creature.letzterSchaden = { art: 'effekt', quelle: card.id, owner }; hit.push(actual); }); list = hit; } visual = 'damage'; break;
      case 'destroy': for (const q of list) { q.creature.currentHealth = 0; q.creature.destroyed = true; q.creature.letzterSchaden = { art: 'effekt', quelle: card.id, owner }; } visual = 'damage'; break;
      case 'move': {
        const q = selected(); if (!q || action.toLane === undefined) throw new GameRuleError('Bitte Figur und freie Zielbahn wählen.');
        removeFigure(state, q); state.board[owner][action.toLane] = q.creature; q.creature.exhausted = false; list = [selected()!];
        visual = 'move'; break;
      }
      case 'moveAll': {
        const front = state.board[owner].slice(0, 4); const rear = (state.teamBoard?.[owner] ?? []).slice(0, 4);
        for (let l = 0; l < 4; l++) { state.board[owner][(l + 1) % 4] = front[l]; if (state.teamBoard) state.teamBoard[owner][(l + 1) % 4] = rear[l] ?? null; }
        for (const q of figures(state, owner)) if (q.lane < 4) q.creature.exhausted = false;
        visual = 'move'; break;
      }
      case 'bonus': for (const q of list) { q.creature.exhausted = false; state.aufloesung.push({ art: 'bonusAngriff', spieler: owner, lane: q.lane, uid: q.creature.uid }, { art: 'todeStabilisieren' }); } break;
      case 'draw': zieheKarten(state, owner, amount); syncHands(state); visual = 'hand'; break;
      case 'discard': if (p.hand.length) state.choice = { id: state.nextHandId!++, owner, kind: 'discard', title: 'Wähle eine Handkarte zum Abwerfen.' }; visual = 'hand'; break;
      case 'return': { const q = selected(); if (!q) throw new GameRuleError('Die Figur ist nicht mehr vorhanden.'); addHand(state, owner, q.creature.cardId, amount); removeFigure(state, q); visual = 'hand'; break; }
      case 'discount': { const h = p.handInstances?.find(h => h.id === action.handInstanceId); if (!h) throw new GameRuleError('Bitte eine Figurenkarte auf deiner Hand wählen.'); h.discount += amount; visual = 'hand'; break; }
      case 'revive': { const g = p.graveyard?.find(g => g.id === action.graveId); const def = g && data.cardsById[g.cardId]; if (!g || !def || def.type !== 'creature' || action.toLane === undefined) throw new GameRuleError('Bitte besiegte Figur und Zielbahn wählen.'); state.board[owner][action.toLane] = makeCreature(state, { cardId: def.id, ...def }, { isToken: false }); p.graveyard = p.graveyard!.filter(x => x.id !== g.id); visual = 'summon'; break; }
      case 'energy': p.energy = Math.min(state.config.energy.cap ?? 99, p.energy + amount); visual = 'energy'; break;
      case 'ramp': p.energyPerRoundBonus = (p.energyPerRoundBonus ?? 0) + amount; visual = 'energy'; break;
      case 'random':
        if (step.scope === 'base') { basisSchaden(state, owner, wuerfle(state, 1, amount)); visual = 'damage'; }
        else if (wuerfle(state, 0, 1) === 0) { p.energy = Math.min(state.config.energy.cap ?? 99, p.energy + amount); visual = 'energy'; }
        else { zieheKarten(state, owner, amount); visual = 'hand'; }
        syncHands(state); break;
      case 'evolve': p.evolution = (p.evolution ?? 0) + amount; if (p.evolution >= 3) { p.evolution -= 3; for (const q of figures(state, owner)) { q.creature.permAttackBonus += 2; q.creature.permHealthBonus += 2; q.creature.currentHealth += 2; q.creature.lastMaxHealth += 2; } } break;
      case 'conjure': { const pool = data.cards.filter(c => c.teamId === card.teamId && c.deckable !== false); if (!pool.length) throw new GameRuleError('Keine freigegebene Teamkarte vorhanden.'); addHand(state, owner, pool[wuerfle(state, 0, pool.length - 1)].id); visual = 'hand'; break; }
      case 'summon': {
        const def = data.cardsById[step.cardId ?? 'alpha_pteranodon']; if (!def || def.type !== 'creature') throw new GameRuleError('Beschwörungsfigur fehlt.');
        for (let i = 0; i < amount; i++) { const lane = state.board[owner].findIndex((c, l) => !c && (l !== 4 || def.keywords.includes('amphibious'))); if (lane < 0) break;
          const c = makeCreature(state, { cardId: def.id, ...def }, { isToken: true }); if (step.temporary) c.expiresRound = state.round; if (step.atk) { const bonus = Math.min(p.energy, step.atk); p.energy -= bonus; c.permAttackBonus += bonus; c.permHealthBonus += bonus; c.currentHealth += bonus; c.lastMaxHealth += bonus; } state.board[owner][lane] = c; }
        visual = 'summon'; break;
      }
      case 'sacrifice': {
        const source = selected();
        const dest = figures(state, owner).find(q => q.creature.uid === action.secondUid);
        if (!source || !dest) throw new GameRuleError('Bitte zwei verschiedene Tiere wählen.');
        const attack = getEffectiveAttack(state, source.owner, source.lane, source.rear);
        const health = Math.max(0, source.creature.currentHealth);
        dest.creature.permAttackBonus += attack;
        dest.creature.permHealthBonus += health;
        dest.creature.currentHealth += health;
        dest.creature.lastMaxHealth += health;
        source.creature.currentHealth = 0;
        source.creature.destroyed = true;
        break;
      }
      case 'spendEnergy': { const bonus = Math.min(p.energy, amount); p.energy -= bonus; for (const q of list) { q.creature.permAttackBonus += bonus; q.creature.permHealthBonus += bonus; q.creature.currentHealth += bonus; q.creature.lastMaxHealth += bonus; } break; }
    }
    const batch = state.log.length;
    if (step.op === 'summon' || step.op === 'revive') list = figures(state, owner).filter(q => !before.has(q.creature.uid));
    if (step.op === 'moveAll') list = figures(state, owner).filter(q => q.lane < 4);
    if (step.op === 'sacrifice' || step.op === 'evolve') list = figures(state).filter(q => q.creature.currentHealth !== before.get(q.creature.uid)?.hp);
    for (const q of list) {
      const prev = before.get(q.creature.uid);
      const delta = visual === 'heal' || visual === 'damage' ? q.creature.currentHealth - (prev?.hp ?? q.creature.currentHealth)
        : step.op === 'buff' || step.op === 'spendEnergy' || step.op === 'evolve' || step.op === 'sacrifice' ? (q.creature.permAttackBonus + q.creature.tempAttackBonus - (prev?.atk ?? 0)) || (q.creature.permHealthBonus + q.creature.tempHealthBonus - (prev?.hpBonus ?? 0)) : undefined;
      effectEvent(state, data, card, owner, visual, [q], delta, batch);
    }
    if (!list.length) {
      const baseOwner = step.op === 'damage' ? otherPlayer(owner) : owner;
      const delta = visual === 'heal' || visual === 'damage' ? state.players[baseOwner].base - baseBefore[baseOwner] : visual === 'energy' ? p.energy - energyBefore : undefined;
      effectEvent(state, data, card, baseOwner, visual, [], delta, batch);
    }
    if (state.players.some(p => p.base <= 0)) break;
  }
}
