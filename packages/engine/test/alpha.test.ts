import { describe, expect, it } from 'vitest';
import { applyAction, buildClientView, createGame, createSeededRandom, getLegalActions, ladeAktiveDecks, loadGameData } from '../src/index.js';
import { cardCost, damageCreature, figures, syncHands } from '../src/alpha.js';
import { getEffectiveAttack, getMaxHealth, makeCreature, recalcBoard } from '../src/internal.js';
import { onRoundStartAbilities, onRoundEndAbilities } from '../src/abilities.js';
import type { CardDef, GameState, PlayerIndex, SpellEvent } from '../src/types.js';

const data = loadGameData();
const decks = ladeAktiveDecks(data);
const ids = Object.keys(decks);
const cards = data.cards.filter(c => c.id.startsWith('alpha_'));
const powers = [...new Set(data.champions.filter(c => ids.includes(c.id)).flatMap(c => c.superpowers))].map(id => data.cardsById[id]);
function game(card?: CardDef) {
  const s = createGame(data, ['rostbolzen', 'kaeptn_kompostible'], createSeededRandom(14), [decks.rostbolzen, decks.kaeptn_kompostible]);
  s.phase = 'play'; s.round = 3; s.active = 0; s.log = []; s.aufloesung = []; s.reaktion = null;
  s.players.forEach(p => { p.energy = 20; p.base = 10; p.cheerleaders = [null, null, null]; p.hand = []; p.handInstances = []; p.deck = Array(20).fill('alpha_wolf'); });
  if (card) s.players[0].hand = [card.id, 'alpha_wolf', 'alpha_wolf'];
  syncHands(s);
  return s;
}
function put(s: GameState, owner: PlayerIndex, lane: number, id = 'alpha_wolf', rear = false) {
  const d = data.cardsById[id]; if (d.type !== 'creature') throw Error(id);
  const c = makeCreature(s, { cardId: id, ...d }, { isToken: false });
  c.exhausted = false;
  if (rear) s.teamBoard![owner][lane] = c; else s.board[owner][lane] = c;
  return c;
}
function prepared(card: CardDef) {
  const s = game(card);
  put(s, 0, 0, 'alpha_human_kite'); put(s, 0, 0, 'alpha_wolf', true); put(s, 0, 1, 'alpha_hauskater');
  put(s, 1, 0, 'alpha_tyrannosaurus_rex').baseAttack = 6; put(s, 1, 0, 'alpha_wolf', true); put(s, 1, 1, 'alpha_wolf');
  s.players[0].graveyard = [{ id: 900, cardId: 'alpha_wolf', name: 'Wolf' }];
  recalcBoard(s);
  for (const q of figures(s)) q.creature.currentHealth = Math.max(1, q.creature.currentHealth - 1);
  return s;
}
function play(s: GameState) {
  const a = getLegalActions(s, 0, data).find(a => 'handIndex' in a && a.handIndex === 0);
  expect(a).toBeDefined();
  return applyAction(s, 0, a!, data);
}
const action = (suffix: string) => cards.find(c => c.type === 'action' && c.id.endsWith(suffix))!;

describe('Verbindlicher Alpha-Katalog', () => {
  it('enthält vier vollständige 40-Karten-Decks mit genau 80 Figuren und 32 Aktionen', () => {
    expect(ids).toHaveLength(4);
    expect(cards.filter(c => c.deckable && c.type === 'creature')).toHaveLength(80);
    expect(cards.filter(c => c.type === 'action')).toHaveLength(32);
    expect(new Set([...cards, ...powers].map(c => c.name)).size).toBe(cards.length + powers.length);
    for (const card of [...cards, ...powers]) {
      const identity = data.identityCatalog.cards.find(entry => entry.cardId === card.id)!;
      expect(identity.concept.startsWith(`${card.name}:`)).toBe(true);
      expect(identity.concept.endsWith(`Spielrolle: ${card.text}`)).toBe(true);
    }
    for (const deck of Object.values(decks)) {
      expect(deck.cards).toHaveLength(28);
      expect(deck.cards.reduce((n, c) => n + c.count, 0)).toBe(40);
      expect(deck.cards.every(c => c.count >= 1 && c.count <= 4)).toBe(true);
      expect(new Set(deck.cards.map(c => data.cardsById[c.cardId].teamId)).size).toBe(1);
    }
  });
  it.each(cards.filter(c => c.type === 'creature'))('$name: Werte, Instanz und Fähigkeit beim Ausspielen', card => {
    if (card.type !== 'creature') return;
    const s = game(card);
    const next = applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 1 }, data);
    const c = next.board[0][1]!;
    expect(c.cardId).toBe(card.id); expect(c.baseAttack).toBe(card.attack); expect(c.baseMaxHealth).toBe(card.health);
    expect(c.abilities).toEqual(card.abilities ?? []);
    expect(next.players[0].energy).toBe(20 - card.cost);
    const heal = card.abilities?.find(a => a.kind === 'basisHeilung');
    if (heal?.kind === 'basisHeilung') expect(next.players[0].base).toBe(10 + heal.amount);
    const draw = card.abilities?.find(a => a.kind === 'lernen');
    if (draw?.kind === 'lernen') expect(next.players[0].hand.length).toBe(2 + draw.n);
    expect(c.exhausted).toBe(!card.keywords.includes('flink'));
    if (card.keywords.includes('amphibious')) {
      expect(applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 4 }, data).board[0][4]?.cardId).toBe(card.id);
    } else expect(() => applyAction(s, 0, { type: 'playCreature', handIndex: 0, lane: 4 }, data)).toThrow();
    if (card.keywords.includes('team_up')) {
      const shared = game(card); put(shared, 0, 1, 'alpha_mr_nimbus');
      const paired = applyAction(shared, 0, { type: 'playCreature', handIndex: 0, lane: 1 }, data);
      expect(paired.teamBoard![0][1]?.cardId).toBe(card.id);
    }
    if (card.keywords.includes('fliegend')) {
      next.phase = 'fly'; next.active = 0;
      const fly = getLegalActions(next, 0, data).find(a => a.type === 'flyMove' && a.targetUid === c.uid && a.toLane === 3);
      expect(fly).toBeDefined();
      expect(applyAction(next, 0, fly!, data).board[0][3]?.uid).toBe(c.uid);
    }
    if (card.keywords.includes('armored')) {
      const before = c.currentHealth;
      expect(damageCreature(next, { owner: 0, lane: 1, rear: false, creature: c }, 3, undefined, true)).toBe(2);
      expect(c.currentHealth).toBe(before - 2);
    }
    for (const ability of card.abilities ?? []) {
      if (ability.kind === 'aura') {
        const allyId = card.teamId === 'south_park' ? 'alpha_human_kite' : 'alpha_jesse_solar_opposites';
        const neighbor = put(next, 0, 2, allyId);
        const rear = put(next, 0, 1, allyId, true);
        expect(getEffectiveAttack(next, 0, 2)).toBe(neighbor.baseAttack + 1);
        expect(getEffectiveAttack(next, 0, 1, true)).toBe(rear.baseAttack + 1);
        expect(getEffectiveAttack(next, 0, 1)).toBe(c.baseAttack);
      }
      if (ability.kind === 'rettung') {
        c.currentHealth = 0; recalcBoard(next);
        expect(next.board[0][1]?.currentHealth).toBe(1);
        c.currentHealth = 0; recalcBoard(next);
        expect(next.board[0][1]).toBeNull();
      }
      if (ability.kind === 'heilung') {
        const neighbor = put(next, 0, 0, 'alpha_human_kite');
        const rear = put(next, 0, 0, 'alpha_human_kite', true);
        const distant = put(next, 0, 3, 'alpha_human_kite');
        const enemy = put(next, 1, 0, 'alpha_human_kite');
        for (const x of [neighbor, rear, distant, enemy]) x.currentHealth = 1;
        onRoundEndAbilities(next);
        expect([neighbor.currentHealth, rear.currentHealth, distant.currentHealth, enemy.currentHealth]).toEqual([2, 2, 1, 1]);
      }
      if (ability.kind === 'energie') {
        next.players[0].energy = 0; onRoundStartAbilities(next);
        expect(next.players[0].energy).toBe(1);
      }
      if (ability.kind === 'wachstum') {
        for (let round = 0; round < 4; round++) { next.round++; onRoundStartAbilities(next); recalcBoard(next); }
        expect(getEffectiveAttack(next, 0, 1)).toBe(card.attack + 3);
        expect(getMaxHealth(next, 0, 1)).toBe(card.health + 3);
      }
      if (ability.kind === 'bedingt' || ability.kind === 'skalierung') {
        put(next, 0, 0, 'alpha_jesse_solar_opposites'); recalcBoard(next);
        expect(getEffectiveAttack(next, 0, 1)).toBe(card.attack + (ability.kind === 'skalierung' ? 1 : 0));
        put(next, 0, 0, 'alpha_jesse_solar_opposites', true); recalcBoard(next);
        expect(getEffectiveAttack(next, 0, 1)).toBe(card.attack + (ability.kind === 'skalierung' ? 2 : 1));
        expect(getMaxHealth(next, 0, 1)).toBe(card.health + (ability.kind === 'bedingt' ? 1 : 0));
        put(next, 0, 3, 'alpha_jesse_solar_opposites'); recalcBoard(next);
        expect(getEffectiveAttack(next, 0, 1)).toBe(card.attack + (ability.kind === 'skalierung' ? 2 : 1));
      }
    }
  });
  it.each([...cards.filter(c => c.type === 'action'), ...powers])('$name: jedes angebotene Ziel ist ausführbar und wird eindeutig protokolliert', card => {
    const s = prepared(card);
    expect(card.type === 'action' || card.type === 'superpower').toBe(true);
    if (card.type !== 'action' && card.type !== 'superpower') return;
    expect(card.effect.kind).toBe('script');
    const actions = getLegalActions(s, 0, data).filter(a => 'handIndex' in a && a.handIndex === 0);
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      const next = applyAction(s, 0, a, data);
      expect(next.players[0].handInstances?.some(h => h.id === s.players[0].handInstances![0].id)).toBe(false);
      const events = next.log.flatMap(l => l.event?.kind === 'spell' ? [l.event] : []);
      expect(events.some(e => e.sourceCardId === card.id)).toBe(true);
      expect(events.every(e => e.owner !== undefined && e.boardAfter !== undefined)).toBe(true);
    }
  });
});

describe('Alpha-Regeln und Regressionen', () => {
  it('holt eine besiegte Figur frisch und mit neuer Identität zurück', () => {
    const s = game(action('_kenny'));
    s.players[0].graveyard = [{ id: 123, cardId: 'alpha_wolf' }];
    const next = play(s); const c = figures(next, 0)[0].creature;
    expect(c.cardId).toBe('alpha_wolf'); expect(c.uid).not.toBe(123);
    expect(c.permAttackBonus).toBe(0); expect(c.shieldHits).toBeUndefined();
    expect(next.players[0].graveyard).toEqual([]);
  });
  it('rettet bei voller Hand eine Figur in den durch Ausspielen frei gewordenen Platz', () => {
    const s = game(action('_going_home')); put(s, 0, 1).permAttackBonus = 8;
    s.players[0].hand = [action('_going_home').id, ...Array(9).fill('alpha_wolf')]; syncHands(s);
    const next = play(s);
    expect(next.players[0].hand).toHaveLength(10); expect(next.board[0][1]).toBeNull();
    expect(next.players[0].handInstances!.at(-1)?.discount).toBe(1);
  });
  it('Abwerfen sperrt weitere Aktionen und entfernt nur die gewählte Kopie', () => {
    const s = play(game(action('_plan'))); const choice = s.choice!;
    expect(choice.kind).toBe('discard'); expect(s.players[0].hand).toHaveLength(4);
    expect(() => applyAction(s, 1, { type: 'pass' }, data)).toThrow();
    const selected = s.players[0].handInstances![1].id;
    expect(() => applyAction(s, 0, { type: 'chooseCard', choiceId: choice.id + 1, instanceId: selected }, data)).toThrow();
    const next = applyAction(s, 0, { type: 'chooseCard', choiceId: choice.id, instanceId: selected }, data);
    expect(next.players[0].hand).toHaveLength(3); expect(next.players[0].handInstances?.some(h => h.id === selected)).toBe(false);
    expect(next.choice).toBeNull(); expect(next.active).toBe(1);
  });
  it('zeigt die Zwischenstände von Heilung und anschließendem Buff in dieser Reihenfolge', () => {
    const s = prepared(action('_mint')); const next = play(s);
    const events = next.log.flatMap(l => l.event?.kind === 'spell' && l.event.targetUid === s.board[0][0]!.uid ? [l.event] : []);
    expect(events.map(e => e.effect)).toEqual(['heal', 'buff']);
    expect(events[0].boardAfter![0][0]!.attack).toBe(s.board[0][0]!.baseAttack);
    expect(events[1].boardAfter![0][0]!.attack).toBe(events[0].boardAfter![0][0]!.attack + 1);
  });
  it('Schutzübernahme protokolliert den tatsächlichen Empfänger statt des anvisierten Verbündeten', () => {
    const s = game(data.cardsById.super_meteor_strike); const protectedC = put(s, 1, 0);
    const protector = put(s, 1, 2, 'alpha_human_kite'); protectedC.protectorUid = protector.uid;
    const hp = protectedC.currentHealth;
    const next = applyAction(s, 0, { type: 'playAction', handIndex: 0, targetLane: 0, targetUid: protectedC.uid }, data);
    expect(next.board[1][0]?.currentHealth).toBe(hp);
    const hit = next.log.find(l => l.event?.kind === 'spell' && l.event.effect === 'damage')?.event as SpellEvent;
    expect(hit.targetUid).toBe(protector.uid); expect(hit.lane).toBe(2); expect(hit.delta).toBe(-3);
    expect(next.players[1].graveyard?.some(g => g.cardId === protector.cardId)).toBe(true);
  });
  it('kurzlebige Meeseeks verschwinden zum nächsten Rundenbeginn', () => {
    let s = play(game(action('_meeseeks_box'))); const uid = figures(s, 0)[0].creature.uid;
    const round = s.round;
    for (let i = 0; i < 12 && s.round === round; i++) s = applyAction(s, s.active, { type: s.phase === 'fly' ? 'flyDone' : 'pass' }, data);
    expect(s.round).toBe(round + 1); expect(figures(s).some(q => q.creature.uid === uid)).toBe(false);
    expect(s.players[0].graveyard).toEqual([]);
  });
  it('Verstecken endet am nächsten Rundenbeginn und verhindert den Angriff der Figur', () => {
    const initial = game(action('_saeure')); const c = put(initial, 0, 1);
    let s = play(initial); const round = s.round;
    expect(getLegalActions(s, 0, data)).toEqual([]);
    for (let i = 0; i < 12 && s.round === round; i++) s = applyAction(s, s.active, { type: s.phase === 'fly' ? 'flyDone' : 'pass' }, data);
    expect(s.board[0][1]!.hiddenUntil).toBeUndefined();
    expect(s.log.some(l => l.event?.kind === 'attack' && l.event.attackerUid === c.uid)).toBe(false);
  });
  it('Bewegung plus Bonusangriff trifft aus der neuen Bahn', () => {
    const s = game(action('_hinterhalt')); const c = put(s, 0, 0, 'alpha_human_kite');
    const enemy = put(s, 1, 2, 'alpha_cthulhu'); const hp = enemy.currentHealth;
    const next = applyAction(s, 0, { type: 'playAction', handIndex: 0, targetLane: 0, targetUid: c.uid, toLane: 2 }, data);
    expect(next.board[0][0]).toBeNull(); expect(next.board[0][2]?.uid).toBe(c.uid);
    expect(next.board[1][2]!.currentHealth).toBe(hp - c.baseAttack);
    expect(next.log.some(l => l.event?.kind === 'attack' && l.event.lane === 2 && l.event.attackerUid === c.uid)).toBe(true);
  });
  it('kann bei gefüllten Landbahnen nur den amphibischen Token im Wasser beschwören', () => {
    const s = game(action('_nachwuchs')); for (let l = 0; l < 4; l++) put(s, 0, l);
    expect(play(s).board[0][4]?.cardId).toBe('alpha_pteranodon');
    s.players[0].hand[0] = action('_wall').id; syncHands(s);
    expect(getLegalActions(s, 0, data).some(a => 'handIndex' in a && a.handIndex === 0)).toBe(false);
  });
  it('kontrollierter Zufall erzeugt nur freigegebene Teamkarten und bleibt deterministisch', () => {
    const s = game(action('_kabel'));
    const a = play(s); const b = play(s);
    expect(a).toEqual(b);
    const generated = data.cardsById[a.players[0].hand.at(-1)!];
    expect(generated.teamId).toBe('rick_morty'); expect(generated.deckable).toBe(true);
  });
  it('beendet eine Effektfolge sofort nach dem tödlichen Basistreffer', () => {
    const s = game(data.cardsById.super_sunburn); s.players[1].base = 1;
    const next = applyAction(s, 0, { type: 'playAction', handIndex: 0, targetLane: -1 }, data);
    expect(next.winner).toBe(0); expect(next.players[0].energyPerRoundBonus ?? 0).toBe(0);
  });
  it('Super Stench gewährt Tödlich auch hinten und zieht tatsächlich eine Karte', () => {
    const s = prepared(data.cardsById.super_super_stench);
    const next = play(s);
    expect(figures(next, 0).every(q => q.creature.keywords.includes('deadly'))).toBe(true);
    expect(next.players[0].hand.length).toBe(s.players[0].hand.length);
  });
  it('Cut Down akzeptiert nur mindestens fünf effektiven Angriff und verändert bei Fehler nichts', () => {
    const s = game(data.cardsById.super_cut_down_to_size); const c = put(s, 1, 0);
    const before = structuredClone(s);
    expect(() => applyAction(s, 0, { type: 'playAction', handIndex: 0, targetLane: 0, targetUid: c.uid }, data)).toThrow();
    expect(s).toEqual(before);
    c.permAttackBonus = 6;
    expect(play(s).board[1][0]).toBeNull();
  });
  it('Rabatte bleiben eindeutig bei zwei gleichen Handkarten', () => {
    const card = action('_replikanten'); const s = game(card);
    const chosen = s.players[0].handInstances![2].id;
    const a = getLegalActions(s, 0, data).find(a => a.type === 'playAction' && a.handInstanceId === chosen)!;
    const next = applyAction(s, 0, a, data);
    expect(cardCost(next, 0, 0, data.cardsById.alpha_wolf)).toBe(data.cardsById.alpha_wolf.cost);
    expect(cardCost(next, 0, 1, data.cardsById.alpha_wolf)).toBe(Math.max(0, data.cardsById.alpha_wolf.cost - 2));
    expect(next.players[0].handInstances![1].id).toBe(chosen);
  });
  it('Schadensschutz verbraucht genau einen Treffer', () => {
    const s = game(); put(s, 0, 0); const q = figures(s, 0)[0]; q.creature.shieldHits = 1;
    const hp = q.creature.currentHealth;
    expect(damageCreature(s, q, 2)).toBe(0); expect(q.creature.currentHealth).toBe(hp);
    expect(damageCreature(s, q, 2)).toBe(2); expect(q.creature.currentHealth).toBe(hp - 2);
  });
  it('Heilungsereignisse nennen die tatsächliche Menge und den hinteren Empfänger', () => {
    const card = action('_mint'); const s = prepared(card);
    const next = play(s);
    const heals = next.log.flatMap(l => l.event?.kind === 'spell' && l.event.effect === 'heal' ? [l.event] : []);
    expect(heals.length).toBeGreaterThan(0);
    expect(heals.every(e => e.delta === 1)).toBe(true);
    expect(heals.some(e => e.targetUid === s.teamBoard![0][0]!.uid)).toBe(true);
  });
  it('Pupa-Fortschritt löst erst beim dritten Punkt aus', () => {
    const card = action('_evolution'); let s = prepared(card);
    for (let i = 1; i <= 3; i++) {
      s.active = 0; s.players[0].hand = [card.id]; s.players[0].energy = 20; syncHands(s);
      s = play(s); expect(s.players[0].evolution).toBe(i % 3);
    }
    expect(s.board[0][0]!.permAttackBonus).toBe(2);
  });
  it('verbirgt gegnerische Hand und Auswahloptionen', () => {
    const s = prepared(data.cardsById.super_super_stench);
    s.choice = { id: 77, owner: 0, kind: 'discard', title: 'Karte abwerfen' };
    const view = buildClientView(s, 1, data);
    expect(view.legalActions).toEqual([]);
    expect(JSON.stringify(view)).not.toContain('handInstances');
    expect(view.hand).toEqual([]);
  });
  it('führt geplante Team-Up-Gegenschläge trotz tödlichen ersten Treffers aus', () => {
    let s = game(); const a = put(s, 0, 1, 'alpha_human_kite'); const b = put(s, 1, 1, 'alpha_human_kite');
    put(s, 0, 1, 'alpha_human_kite', true); put(s, 1, 1, 'alpha_human_kite', true);
    for (const q of figures(s)) { q.creature.baseAttack = 2; q.creature.currentHealth = 1; }
    s = applyAction(s, 0, { type: 'pass' }, data); s = applyAction(s, 1, { type: 'pass' }, data);
    const attacking = s.log.flatMap(l => l.event?.kind === 'attack' ? [l.event.attackerUid] : []);
    expect(attacking).toContain(a.uid); expect(attacking).toContain(b.uid);
  });
});
