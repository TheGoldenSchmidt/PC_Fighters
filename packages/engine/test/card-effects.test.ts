// Verhaltensverträge für sämtliche konkreten Karteneffekt-Primitiven der
// Starterdecks. Diese Suite läuft über `npm test` in jedem CI-Lauf.

import { describe, expect, it } from 'vitest';
import {
  ABILITY_KINDS,
  EFFECTS,
  applyAction,
  buildClientView,
  getEffectiveAttack,
  getMaxHealth,
  ladeDecks,
  legaleAktionen
} from '../src/index.js';
import type { GameState } from '../src/types.js';
import { data, emptyState, passBoth, put, setzeDeck, setzeHand } from './helpers.js';

function playAction(
  state: GameState,
  cardId: string,
  target: { targetLane?: number; toLane?: number } = {}
): GameState {
  setzeHand(state, 0, [cardId]);
  state.players[0].energy = 20;
  state.active = 0;
  return applyAction(state, 0, { type: 'playAction', handIndex: 0, ...target }, data);
}

describe('Konkrete Aktionskarten-Effekte', () => {
  it('jede konkrete Effektart aus den Kartendaten besitzt einen Resolver', () => {
    const kinds = new Set(
      data.cards.flatMap((card) => card.type === 'creature' || card.effect.kind === 'referenz'
        ? []
        : [card.effect.kind])
    );
    for (const kind of kinds) expect(EFFECTS[kind], kind).toBeTypeOf('function');
  });

  it('Schaden trifft eine Kreatur oder bei freier Lane die Basis', () => {
    let creatureState = emptyState();
    const target = put(creatureState, 1, 1, 'wall_nut');
    creatureState = playAction(creatureState, 'berry_blast', { targetLane: 1 });
    expect(creatureState.board[1][1]?.currentHealth).toBe(target.currentHealth - 3);

    let baseState = emptyState();
    baseState.players[1].cheerleaders = [null, null, null];
    const before = baseState.players[1].base;
    baseState = playAction(baseState, 'berry_blast', { targetLane: 1 });
    expect(baseState.players[1].base).toBe(before - 3);
  });

  it('Zerstören beachtet Angriffslimit, Trickresistenz und Todesauflösung', () => {
    let limited = emptyState();
    put(limited, 1, 0, 'baer');
    expect(() => playAction(limited, 'rolling_stone', { targetLane: 0 })).toThrow(/mehr als 2 Angriff/);

    let valid = emptyState();
    const victim = put(valid, 1, 0, 'button_mushroom');
    valid = playAction(valid, 'rolling_stone', { targetLane: 0 });
    expect(valid.board[1][0]).toBeNull();
    expect(valid.log.some((entry) => entry.event?.kind === 'death' && entry.event.uid === victim.uid)).toBe(true);
  });

  it('legale Ziele schließen Trickresistenz und Zerstörungsimmunität bereits vor dem Ausspielen aus', () => {
    const resistant = emptyState();
    put(resistant, 1, 0, 'gravitree');
    setzeHand(resistant, 0, ['berry_blast']);
    resistant.players[0].energy = 20;
    const damageTargets = legaleAktionen(resistant, 0, data)
      .filter((action) => action.type === 'playAction')
      .map((action) => action.targetLane);
    expect(damageTargets).not.toContain(0);
    expect(damageTargets).toContain(1);
    expect(() => playAction(resistant, 'berry_blast', { targetLane: 0 })).toThrow(/trickresistent/);

    const unremovable = emptyState();
    const victim = put(unremovable, 1, 0, 'button_mushroom');
    victim.abilities.push({ kind: 'urgewalt' });
    setzeHand(unremovable, 0, ['rolling_stone']);
    unremovable.players[0].energy = 20;
    expect(legaleAktionen(unremovable, 0, data)).not.toContainEqual({
      type: 'playAction',
      handIndex: 0,
      targetLane: 0
    });
  });

  it('dauerhafter Buff erhöht Angriff, maximales und aktuelles Leben', () => {
    let state = emptyState();
    put(state, 0, 2, 'peashooter');
    state = playAction(state, 'fertilize', { targetLane: 2 });
    expect(getEffectiveAttack(state, 0, 2)).toBe(5);
    expect(getMaxHealth(state, 0, 2)).toBe(5);
    expect(state.board[0][2]?.currentHealth).toBe(5);
  });

  it('Kartenziehen zieht exakt die angegebene Menge', () => {
    const state = emptyState();
    setzeDeck(state, 0, ['rekrut', 'baer', 'wolf']);
    const next = playAction(state, 'flourish');
    expect(next.players[0].hand).toEqual(['rekrut', 'baer']);
    expect(next.players[0].deck).toEqual(['wolf']);
  });

  it('Bonusangriff nutzt den normalen Kampftreffer ohne Gegenschlag', () => {
    let state = emptyState();
    const attacker = put(state, 0, 1, 'peashooter');
    const defender = put(state, 1, 1, 'baer');
    state = playAction(state, 'lurch_for_lunch', { targetLane: 1 });
    expect(state.board[1][1]?.currentHealth).toBe(defender.currentHealth - attacker.baseAttack);
    expect(state.board[0][1]?.currentHealth).toBe(attacker.currentHealth);
  });

  it('Bewegung versetzt die Kreatur und gibt den temporären Angriffsbonus', () => {
    let state = emptyState();
    put(state, 0, 0, 'imp');
    state = playAction(state, 'smoke_bomb', { targetLane: 0, toLane: 2 });
    expect(state.board[0][0]).toBeNull();
    expect(state.board[0][2]?.cardId).toBe('imp');
    expect(state.board[0][2]?.tempAttackBonus).toBe(1);
  });

  it('bestehende Primitive für Leben, temporären Angriff, Beschwörung und Wissen bleiben ausführbar', () => {
    let health = emptyState();
    put(health, 0, 0, 'rekrut');
    health = playAction(health, 'schildwall', { targetLane: 0 });
    expect(getMaxHealth(health, 0, 0)).toBe(4);

    let attack = emptyState();
    put(attack, 0, 0, 'rekrut');
    attack = playAction(attack, 'wilder_instinkt', { targetLane: 0 });
    expect(attack.board[0][0]?.tempAttackBonus).toBe(2);

    const summon = playAction(emptyState(), 'mobilmachung');
    expect(summon.board[0].filter(Boolean)).toHaveLength(2);

    let knowledge = emptyState();
    knowledge.players[0].knowledge = 3;
    put(knowledge, 1, 0, 'baer');
    knowledge = playAction(knowledge, 'experimentelle_formel');
    expect(knowledge.players[0].knowledge).toBe(0);
    expect(knowledge.board[1][0]).toBeNull();
  });
});

describe('Starterdeck-Kreatureneffekte', () => {
  it('alle Starterdeck-Karten verwenden getestete Primitive statt wirkungsloser Referenzregeln', () => {
    const starterIds = new Set(Object.values(ladeDecks(data)).flatMap((deck) =>
      deck.cards.map((entry) => entry.cardId)
    ));
    for (const cardId of starterIds) {
      const card = data.cardsById[cardId];
      if (card.type !== 'creature') expect(card.effect.kind, cardId).not.toBe('referenz');
      else expect((card.abilities ?? []).some((ability) => ability.kind === 'referenz'), cardId).toBe(false);
    }
  });

  it('jede Ability-Art aus den Daten ist in der zentrale Registry erfasst', () => {
    const registered = new Set(ABILITY_KINDS);
    for (const card of data.cards) {
      if (card.type !== 'creature') continue;
      for (const ability of card.abilities ?? []) expect(registered.has(ability.kind), `${card.id}: ${ability.kind}`).toBe(true);
    }
  });

  it('Krawall-Stinktier verwandelt sich am nächsten Rundenstart deterministisch in ein Animal bis Kosten 6', () => {
    const state = emptyState();
    const seedling = put(state, 0, 0, 'seedling', { spawnRound: 0 });
    const next = passBoth(state);
    const transformed = next.board[0][0];
    expect(transformed?.uid).not.toBe(seedling.uid);
    expect(transformed?.cardId).not.toBe('seedling');
    const card = data.cardsById[transformed!.cardId];
    expect(card.type).toBe('creature');
    expect(card.cost).toBeLessThanOrEqual(6);
    expect(card.faction === 'animals' || data.factions.find((entry) => entry.id === card.faction)?.parent === 'animals').toBe(true);
  });

  it('Krawall-Hornisse stärkt alle eigenen Krawall-Kreaturen beim Ausspielen', () => {
    let state = emptyState();
    put(state, 0, 0, 'button_mushroom');
    setzeHand(state, 0, ['buff_shroom']);
    state = applyAction(state, 0, { type: 'playCreature', handIndex: 0, lane: 1 }, data);
    expect(state.board[0][0]?.permAttackBonus).toBe(1);
    expect(state.board[0][0]?.permHealthBonus).toBe(1);
  });

  it('Wolf skaliert nur mit einem weiteren Rudel-Mitglied', () => {
    const state = emptyState();
    put(state, 0, 0, 'wolf');
    expect(getEffectiveAttack(state, 0, 0)).toBe(2);
    put(state, 0, 1, 'peashooter');
    expect(getEffectiveAttack(state, 0, 0)).toBe(3);
  });

  it('Flugblatt-Verteiler erhält seinen Bonus mit einem weiteren Human', () => {
    const state = emptyState();
    put(state, 0, 0, 'flugblatt_verteiler');
    expect(getEffectiveAttack(state, 0, 0)).toBe(1);
    put(state, 0, 1, 'rekrut');
    expect(getEffectiveAttack(state, 0, 0)).toBe(2);
  });

  it('Kessel-Wächter schwächt sein Gegenüber erst beim Aufdecken', () => {
    let state = emptyState();
    const opponent = put(state, 1, 1, 'wall_nut');
    setzeHand(state, 0, ['pied_piper']);
    state = applyAction(state, 0, { type: 'playCreature', handIndex: 0, lane: 1 }, data);
    expect(state.board[0][1]?.faceDown).toBe(true);
    expect(opponent.permAttackBonus).toBe(0);
    state = passBoth(state);
    expect(state.log.some((entry) => entry.event?.kind === 'reveal' && entry.event.lane === 1)).toBe(true);
    expect(state.board[1][1]?.permAttackBonus).toBe(-1);
    expect(state.board[1][1]?.permHealthBonus).toBe(-1);
  });

  it('Fließbandarbeiter verstärkt passende Kreaturen bei jedem passenden Ausspielen', () => {
    let state = emptyState();
    put(state, 0, 0, 'fliessbandarbeiter');
    setzeHand(state, 0, ['skunk_punk']);
    state.players[0].energy = 20;
    state = applyAction(state, 0, { type: 'playCreature', handIndex: 0, lane: 1 }, data);
    expect(state.board[0][0]?.permAttackBonus).toBe(1);
    expect(state.board[0][1]?.permAttackBonus).toBe(1);
  });

  it('Barrikaden-Sanitäter heilt die Basis beim Ausspielen höchstens bis zum Maximum', () => {
    let state = emptyState();
    state.players[0].base = state.config.baseHealth - 2;
    setzeHand(state, 0, ['medic']);
    state.players[0].energy = 20;
    state = applyAction(state, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(state.players[0].base).toBe(state.config.baseHealth);
  });

  it('Mauer-Stachelmaus stärkt alle passenden Kreaturen mit null Angriff', () => {
    let state = emptyState();
    put(state, 0, 0, 'torchwood');
    setzeHand(state, 0, ['spineapple']);
    state.players[0].energy = 20;
    state = applyAction(state, 0, { type: 'playCreature', handIndex: 0, lane: 1 }, data);
    expect(state.board[0][0]?.permAttackBonus).toBe(2);
    expect(state.board[0][1]?.permAttackBonus).toBe(2);
  });

  it('Licht-Eule erzeugt auch aus dem hinteren Team-Up-Slot Rundenenergie', () => {
    let state = emptyState();
    put(state, 0, 0, 'wall_nut', { spawnRound: 0 });
    setzeHand(state, 0, ['sunflower']);
    state = applyAction(state, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    state.board[0][0]!.exhausted = true;
    state.teamBoard![0][0]!.exhausted = true;
    const next = passBoth(state);
    expect(next.round).toBe(2);
    expect(next.players[0].energy).toBe(3);
  });

  it('Team-Up-Boni unterscheiden Front und hinteren Partner regelwirksam', () => {
    let state = emptyState();
    put(state, 0, 0, 'torchwood');
    setzeHand(state, 0, ['peashooter']);
    state = applyAction(state, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(state.teamBoard?.[0][0]?.cardId).toBe('peashooter');
    const view = buildClientView(state, 0, data);
    expect(view.teamBoard[0][0]?.attack).toBe(3);
  });

  it('Nuss-Mischung erhält Angriff und Leben nur mit Team-Up-Partner', () => {
    let state = emptyState();
    put(state, 0, 0, 'mixed_nuts');
    expect(getEffectiveAttack(state, 0, 0)).toBe(2);
    expect(getMaxHealth(state, 0, 0)).toBe(2);
    setzeHand(state, 0, ['rekrut']);
    state.players[0].energy = 20;
    state = applyAction(state, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(getEffectiveAttack(state, 0, 0)).toBe(4);
    expect(getMaxHealth(state, 0, 0)).toBe(4);
  });

  it('ein hinterer Team-Up-Partner rückt nach dem Tod der Front in den Lane-Slot vor', () => {
    let state = emptyState();
    const front = put(state, 1, 0, 'wall_nut');
    setzeHand(state, 1, ['rekrut']);
    state.players[1].energy = 20;
    state.active = 1;
    state = applyAction(state, 1, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(state.teamBoard?.[1][0]?.cardId).toBe('rekrut');

    setzeHand(state, 0, ['locust_swarm']);
    state.players[0].energy = 20;
    state = applyAction(state, 0, { type: 'playAction', handIndex: 0, targetLane: 0 }, data);
    expect(state.log.some((entry) => entry.event?.kind === 'death' && entry.event.uid === front.uid)).toBe(true);
    expect(state.board[1][0]?.cardId).toBe('rekrut');
    expect(state.teamBoard?.[1][0]).toBeNull();
  });

  it('Nacht-Klinge nutzt Anti-Held nur gegen eine freie Lane', () => {
    const state = emptyState();
    put(state, 0, 2, 'mini_ninja');
    state.players[1].cheerleaders = [null, null, null];
    const next = passBoth(state);
    const strike = next.log.find((entry) =>
      entry.event?.kind === 'attack' && entry.event.attacker === 0 && entry.event.lane === 2
    );
    expect(strike?.event?.kind === 'attack' ? strike.event.damage : 0).toBe(4);
  });

  it('Starter-Keywords erlauben Wasser, töten mit Tödlich und umgehen mit Bullseye den Schildzähler', () => {
    let water = emptyState();
    setzeHand(water, 0, ['dolphin_rider']);
    water.players[0].energy = 20;
    water = applyAction(water, 0, {
      type: 'playCreature',
      handIndex: 0,
      lane: water.config.lanes - 1
    }, data);
    expect(water.board[0][water.config.lanes - 1]?.cardId).toBe('dolphin_rider');

    const deadly = emptyState();
    put(deadly, 0, 0, 'smelly_zombie');
    put(deadly, 1, 0, 'wall_nut');
    const afterDeadly = passBoth(deadly);
    expect(afterDeadly.board[1][0]).toBeNull();

    const bullseye = emptyState();
    put(bullseye, 0, 1, 'sting_bean');
    bullseye.players[1].schild = 2;
    const afterBullseye = passBoth(bullseye);
    expect(afterBullseye.players[1].schild).toBe(2);
  });
});
