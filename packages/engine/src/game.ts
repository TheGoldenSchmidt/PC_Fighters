// Spiellogik: reine Funktionen auf dem GameState, kein Netzwerk, kein UI.
// applyAction(state, spieler, aktion) → neuer Zustand (oder GameRuleError).

import {
  applyHinrichten,
  getAbility,
  hasAbility,
  onDeathTriggers,
  onPlayAbilities,
  onRoundEndAbilities,
  onRoundStartAbilities,
  resolvePoison
} from './abilities.js';
import { resolveEffect } from './effects.js';
import { buildFactionTree, matchesScope } from './factions.js';
import {
  freeLanes,
  GameRuleError,
  getEffectiveAttack,
  getMaxHealth,
  log,
  makeCreature,
  otherPlayer,
  recalcBoard
} from './internal.js';
import { hasKeyword, KEYWORDS } from './keywords.js';
import type {
  CardDef,
  ClientView,
  Creature,
  CreatureView,
  GameConfig,
  GameData,
  GameState,
  PlayerAction,
  PlayerIndex,
  PlayerState
} from './types.js';

export { GameRuleError, getEffectiveAttack, getMaxHealth };

/**
 * Auren neu berechnen, Tote entfernen und als Sterbe-Events loggen. Beim-Tod-
 * Effekte (todesfluch, beschwoeren, sammeln) können neue Tode auslösen – daher
 * bis zur Stabilität wiederholen.
 */
function logDeaths(state: GameState): void {
  let deaths = recalcBoard(state);
  let guard = 0;
  while (deaths.length > 0 && guard < 100) {
    for (const d of deaths) {
      log(state, `${d.name} wird zerstört.`, { kind: 'death', lane: d.lane, owner: d.owner });
    }
    onDeathTriggers(state, deaths);
    deaths = recalcBoard(state);
    guard += 1;
  }
}

// ---------------------------------------------------------------- Deck & Start

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Baut das Deck einer Fraktion: jede Karte maxCopiesPerCard-mal,
 * Signaturkarten (★) nur einmal. Ist das Ergebnis größer als deckSize,
 * wird nach dem Mischen auf deckSize gekürzt.
 */
export function buildDeck(data: GameData, faction: string, random: () => number): string[] {
  // Parent-aware: wählt der Spieler eine Oberfraktion, gehören alle Karten ihrer
  // Sub-Fraktionen dazu (same_top). Eine Sub-Fraktion liefert nur ihre Karten.
  const tree = buildFactionTree(data.factions);
  const cards = data.cards.filter((c) => matchesScope(tree, 'same_top', c.faction, faction));
  if (cards.length === 0) {
    throw new GameRuleError(`Für die Fraktion "${faction}" gibt es keine Karten.`);
  }
  const deck: string[] = [];
  for (const card of cards) {
    const copies = card.signature ? 1 : data.config.maxCopiesPerCard;
    for (let i = 0; i < copies; i++) deck.push(card.id);
  }
  return shuffle(deck, random).slice(0, data.config.deckSize);
}

function drawCards(state: GameState, player: PlayerIndex, amount: number): void {
  const p = state.players[player];
  for (let i = 0; i < amount; i++) {
    const card = p.deck.shift();
    if (!card) return; // leeres Deck: es wird einfach nicht mehr gezogen
    p.hand.push(card);
  }
}

export function createGame(
  data: GameData,
  factions: [string, string],
  random: () => number = Math.random
): GameState {
  const makePlayer = (faction: string): PlayerState => ({
    faction,
    deck: buildDeck(data, faction, random),
    hand: [],
    base: data.config.baseHealth,
    energy: 0,
    knowledge: 0,
    flyDone: false
  });

  const state: GameState = {
    config: data.config,
    factionTree: buildFactionTree(data.factions),
    round: 0,
    phase: 'play',
    startingPlayer: random() < 0.5 ? 0 : 1,
    active: 0,
    consecutivePasses: 0,
    players: [makePlayer(factions[0]), makePlayer(factions[1])],
    board: [
      Array.from({ length: data.config.lanes }, () => null),
      Array.from({ length: data.config.lanes }, () => null)
    ],
    log: [],
    winner: null,
    uidCounter: 0
  };

  drawCards(state, 0, data.config.startingHand);
  drawCards(state, 1, data.config.startingHand);
  startRound(state);
  return state;
}

// ---------------------------------------------------------------- Rundenablauf

function startRound(state: GameState): void {
  state.round += 1;
  if (state.round > 1) {
    state.startingPlayer = otherPlayer(state.startingPlayer);
    // 1. Ziehen (in Runde 1 gibt es bereits die Starthand)
    drawCards(state, 0, state.config.cardsDrawnPerTurn);
    drawCards(state, 1, state.config.cardsDrawnPerTurn);
  }
  // 2. Energie: Rundenzahl, gedeckelt – Rest verfällt am Rundenende
  const energy = Math.min(state.round, state.config.energyCap);
  state.players[0].energy = energy;
  state.players[1].energy = energy;

  state.phase = 'play';
  state.active = state.startingPlayer;
  state.consecutivePasses = 0;
  state.players[0].flyDone = false;
  state.players[1].flyDone = false;
  // Rundenbeginn-Effekte (Rundenwachstum, lernen/wissen pro Runde) – wirkt auf
  // Kreaturen, die aus einer früheren Runde übrig sind (Runde 1: leeres Feld).
  onRoundStartAbilities(state);
  recalcBoard(state);
  log(state, `— Runde ${state.round} beginnt (${energy} Energie, Spieler ${state.startingPlayer + 1} fängt an) —`);
}

function endRound(state: GameState): void {
  // Rundenende-Effekte: Alt-Keywords (z. B. heilt_nachbarn) …
  for (const owner of [0, 1] as PlayerIndex[]) {
    state.board[owner].forEach((creature, lane) => {
      if (!creature) return;
      for (const kw of creature.keywords) {
        const hook = KEYWORDS[kw]?.onRoundEnd;
        if (hook) {
          for (const msg of hook(state, owner, lane)) log(state, msg);
        }
      }
    });
  }
  // … und neue Fähigkeiten (heilung, ueberstunden).
  onRoundEndAbilities(state);
  // Temporäre Buffs entfernen, Erschöpfung aufheben
  for (const row of state.board) {
    for (const creature of row) {
      if (!creature) continue;
      creature.tempAttackBonus = 0;
      creature.exhausted = false;
      creature.movedThisFlyPhase = false;
    }
  }
  logDeaths(state);

  if (state.round >= state.config.roundLimit) {
    const [a, b] = state.players;
    state.phase = 'ended';
    state.winner = a.base > b.base ? 0 : b.base > a.base ? 1 : 'draw';
    log(
      state,
      state.winner === 'draw'
        ? `Rundenlimit erreicht – Unentschieden (${a.base} : ${b.base}).`
        : `Rundenlimit erreicht – Spieler ${(state.winner as number) + 1} gewinnt (${a.base} : ${b.base}).`
    );
    return;
  }
  startRound(state);
}

// ---------------------------------------------------------------- Kampfphase

function checkBaseDestroyed(state: GameState): boolean {
  const dead0 = state.players[0].base <= 0;
  const dead1 = state.players[1].base <= 0;
  if (!dead0 && !dead1) return false;
  state.phase = 'ended';
  state.winner = dead0 && dead1 ? 'draw' : dead0 ? 1 : 0;
  log(
    state,
    state.winner === 'draw'
      ? 'Beide Basen zerstört – Unentschieden!'
      : `Die Basis von Spieler ${state.winner === 0 ? 2 : 1} ist zerstört – Spieler ${(state.winner as number) + 1} gewinnt!`
  );
  return true;
}

/** Extra Basisschaden von `neugier`, wenn die Kreatur allein in ihrer Lane angreift. */
function soloBasisschaden(c: Creature): number {
  const n = getAbility(c, 'neugier');
  return n?.basisschaden ?? 0;
}

/** Ein Angriff Kreatur→Kreatur inkl. Gift, Wucht (Überschuss→Basis) und Dornen. */
function creatureStrike(
  state: GameState,
  attacker: Creature,
  defender: Creature,
  atk: number,
  attackerIdx: PlayerIndex,
  lane: number
): void {
  const defenderHealthBefore = defender.currentHealth;
  defender.currentHealth -= atk;
  attacker.attackedThisRound = true;
  log(state, `Lane ${lane + 1}: ${attacker.name} trifft ${defender.name} für ${atk}.`, {
    kind: 'attack',
    lane,
    attacker: attackerIdx,
    damage: atk,
    toBase: false
  });
  // Alt-Keyword Gift (Sofort-Tod) …
  if (hasKeyword(attacker, 'poison') && defender.currentHealth > 0) {
    defender.currentHealth = 0;
    log(state, `Lane ${lane + 1}: Gift! ${defender.name} stirbt sofort.`);
  }
  // … neue Gift-Marken (Zermürbung).
  const gift = getAbility(attacker, 'gift');
  if (gift) defender.poison += gift.staerke;
  // Wucht: Überschussschaden trifft die gegnerische Basis.
  if (hasAbility(attacker, 'wucht')) {
    const overflow = Math.max(0, atk - defenderHealthBefore);
    if (overflow > 0) {
      state.players[otherPlayer(attackerIdx)].base -= overflow;
      log(state, `Lane ${lane + 1}: Wucht! ${overflow} Überschuss trifft die Basis.`);
    }
  }
  // Dornen: Verteidiger fügt dem Angreifer Schaden zu.
  const dornen = getAbility(defender, 'dornen');
  if (dornen) {
    attacker.currentHealth -= dornen.x;
    log(state, `Lane ${lane + 1}: Dornen! ${defender.name} verletzt ${attacker.name} um ${dornen.x}.`);
  }
}

function resolveCombat(state: GameState): void {
  log(state, '— Kampfphase —');
  for (let lane = 0; lane < state.config.lanes; lane++) {
    if (state.phase === 'ended') return;
    const a = state.board[0][lane];
    const b = state.board[1][lane];

    if (a && b) {
      // Beide Lanes besetzt: kampfbereite Kreaturen schlagen GLEICHZEITIG zu.
      // Erschöpfte Kreaturen greifen nicht an, verteidigen aber normal.
      const atkA = a.exhausted ? 0 : getEffectiveAttack(state, 0, lane);
      const atkB = b.exhausted ? 0 : getEffectiveAttack(state, 1, lane);
      if (atkA === 0 && atkB === 0) continue;

      // Hinrichten (beim Angriff, vor dem Schaden).
      if (atkA > 0) {
        const h = getAbility(a, 'hinrichten');
        if (h) applyHinrichten(state, 0, lane, h.maxHp);
      }
      if (atkB > 0) {
        const h = getAbility(b, 'hinrichten');
        if (h) applyHinrichten(state, 1, lane, h.maxHp);
      }

      if (atkA > 0) creatureStrike(state, a, b, atkA, 0, lane);
      if (atkB > 0) creatureStrike(state, b, a, atkB, 1, lane);
      logDeaths(state);
      if (checkBaseDestroyed(state)) return; // Wucht kann die Basis zerstören
    } else if (a && !b && !a.exhausted) {
      const dmg = getEffectiveAttack(state, 0, lane) + soloBasisschaden(a);
      a.attackedThisRound = true;
      state.players[1].base -= dmg;
      log(state, `Lane ${lane + 1}: ${a.name} trifft die gegnerische Basis für ${dmg}.`, {
        kind: 'attack',
        lane,
        attacker: 0,
        damage: dmg,
        toBase: true
      });
      if (checkBaseDestroyed(state)) return;
    } else if (b && !a && !b.exhausted) {
      const dmg = getEffectiveAttack(state, 1, lane) + soloBasisschaden(b);
      b.attackedThisRound = true;
      state.players[0].base -= dmg;
      log(state, `Lane ${lane + 1}: ${b.name} trifft die gegnerische Basis für ${dmg}.`, {
        kind: 'attack',
        lane,
        attacker: 1,
        damage: dmg,
        toBase: true
      });
      if (checkBaseDestroyed(state)) return;
    }
  }

  // Gift-Zermürbung am Ende der Kampfphase (Marken bleiben bestehen).
  resolvePoison(state);
  logDeaths(state);
}

// ---------------------------------------------------------------- Flug-Phase

function playerHasFlyers(state: GameState, player: PlayerIndex): boolean {
  return state.board[player].some((c) => c && hasKeyword(c, 'flying') && !c.movedThisFlyPhase);
}

/** Nach dem Kampf: Flug-Phase starten oder direkt die Runde beenden. */
function afterCombat(state: GameState): void {
  if (state.phase === 'ended') return;
  state.players[0].flyDone = !playerHasFlyers(state, 0);
  state.players[1].flyDone = !playerHasFlyers(state, 1);
  if (state.players[0].flyDone && state.players[1].flyDone) {
    endRound(state);
    return;
  }
  state.phase = 'fly';
  state.active = state.players[state.startingPlayer].flyDone
    ? otherPlayer(state.startingPlayer)
    : state.startingPlayer;
  log(state, 'Fliegende Kreaturen dürfen jetzt die Lane wechseln.');
}

function advanceFlyPhase(state: GameState): void {
  const [a, b] = state.players;
  if (a.flyDone && b.flyDone) {
    endRound(state);
    return;
  }
  if (state.players[state.active].flyDone) {
    state.active = otherPlayer(state.active);
  }
}

// ---------------------------------------------------------------- Aktionen

function playPhaseAction(state: GameState, player: PlayerIndex, action: PlayerAction, data: GameData): void {
  if (state.active !== player) {
    throw new GameRuleError('Du bist gerade nicht am Zug.');
  }

  if (action.type === 'pass') {
    state.consecutivePasses += 1;
    log(state, `Spieler ${player + 1} passt.`);
    if (state.consecutivePasses >= 2) {
      resolveCombat(state);
      afterCombat(state);
    } else {
      state.active = otherPlayer(player);
    }
    return;
  }

  if (action.type !== 'playCreature' && action.type !== 'playAction') {
    throw new GameRuleError('Diese Aktion ist in der Ausspielphase nicht möglich.');
  }

  const p = state.players[player];
  const cardId = p.hand[action.handIndex];
  if (!cardId) throw new GameRuleError('Diese Handkarte gibt es nicht (mehr).');
  const card = data.cardsById[cardId];
  if (!card) throw new GameRuleError(`Unbekannte Karte "${cardId}".`);
  if (card.cost > p.energy) {
    throw new GameRuleError(`Nicht genug Energie: ${card.name} kostet ${card.cost}, du hast ${p.energy}.`);
  }

  if (action.type === 'playCreature') {
    if (card.type !== 'creature') {
      throw new GameRuleError(`${card.name} ist eine Aktionskarte – bitte ohne Lane ausspielen.`);
    }
    if (action.lane < 0 || action.lane >= state.config.lanes) {
      throw new GameRuleError('Diese Lane gibt es nicht.');
    }
    if (state.board[player][action.lane]) {
      throw new GameRuleError('In dieser Lane steht schon eine eigene Kreatur.');
    }
    const creature = makeCreature(state, { cardId: card.id, ...card }, { isToken: false });
    state.board[player][action.lane] = creature;
    log(
      state,
      `Spieler ${player + 1} spielt ${card.name} in Lane ${action.lane + 1}` +
        (creature.exhausted ? '.' : ' – flink und sofort kampfbereit!')
    );
    // Beim-Ausspielen-Effekte (sturzflug, lernen, wissen, Puls, umverteilung,
    // beschwoeren, entwaffnen, experiment).
    onPlayAbilities(state, player, action.lane);
  } else {
    if (card.type !== 'action') {
      throw new GameRuleError(`${card.name} ist eine Kreatur – bitte eine Lane wählen.`);
    }
    resolveEffect({ state, player, card, action });
  }

  p.energy -= card.cost;
  p.hand.splice(action.handIndex, 1);
  state.consecutivePasses = 0;
  logDeaths(state);
  state.active = otherPlayer(player);
}

function flyPhaseAction(state: GameState, player: PlayerIndex, action: PlayerAction): void {
  if (state.active !== player) {
    throw new GameRuleError('Der andere Spieler bewegt gerade seine fliegenden Kreaturen.');
  }

  if (action.type === 'flyDone') {
    state.players[player].flyDone = true;
    state.active = otherPlayer(player);
    advanceFlyPhase(state);
    return;
  }

  if (action.type !== 'flyMove') {
    throw new GameRuleError('Gerade ist die Flug-Phase: nur fliegende Kreaturen bewegen oder "Fertig".');
  }

  const creature = state.board[player][action.fromLane];
  if (!creature) throw new GameRuleError('In dieser Lane steht keine eigene Kreatur.');
  if (!hasKeyword(creature, 'flying')) {
    throw new GameRuleError(`${creature.name} kann nicht fliegen.`);
  }
  if (creature.movedThisFlyPhase) {
    throw new GameRuleError(`${creature.name} ist in dieser Runde schon geflogen.`);
  }
  if (
    action.toLane < 0 ||
    action.toLane >= state.config.lanes ||
    state.board[player][action.toLane]
  ) {
    throw new GameRuleError('Die Ziel-Lane ist nicht frei.');
  }
  state.board[player][action.toLane] = creature;
  state.board[player][action.fromLane] = null;
  creature.movedThisFlyPhase = true;
  log(state, `${creature.name} fliegt in Lane ${action.toLane + 1}.`);
  logDeaths(state);

  if (!playerHasFlyers(state, player)) {
    state.players[player].flyDone = true;
    state.active = otherPlayer(player);
    advanceFlyPhase(state);
  }
}

/**
 * Wendet eine Spieler-Aktion auf den Zustand an und gibt den NEUEN Zustand
 * zurück (der alte bleibt unverändert). Unerlaubte Aktionen werfen GameRuleError.
 */
export function applyAction(
  state: GameState,
  player: PlayerIndex,
  action: PlayerAction,
  data: GameData
): GameState {
  if (state.phase === 'ended') {
    throw new GameRuleError('Die Partie ist bereits beendet.');
  }
  const next = structuredClone(state);
  if (next.phase === 'play') {
    playPhaseAction(next, player, action, data);
  } else {
    flyPhaseAction(next, player, action);
  }
  return next;
}

// ---------------------------------------------------------------- Client-Sicht

/**
 * Baut die client-spezifische Sicht: eigene Hand offen, gegnerische Hand nur
 * als Anzahl. Der komplette Serverzustand verlässt den Server NIE ungefiltert.
 */
export function buildClientView(state: GameState, player: PlayerIndex, data: GameData): ClientView {
  const creatureView = (owner: PlayerIndex, lane: number): CreatureView | null => {
    const c = state.board[owner][lane];
    if (!c) return null;
    const cardDef = data.cardsById[c.cardId];
    return {
      uid: c.uid,
      cardId: c.cardId,
      name: c.name,
      keywords: c.keywords,
      abilities: c.abilities,
      poison: c.poison,
      attack: getEffectiveAttack(state, owner, lane),
      baseAttack: c.baseAttack,
      health: c.currentHealth,
      maxHealth: getMaxHealth(state, owner, lane),
      baseMaxHealth: c.baseMaxHealth,
      exhausted: c.exhausted,
      canFly:
        state.phase === 'fly' &&
        owner === player &&
        hasKeyword(c, 'flying') &&
        !c.movedThisFlyPhase,
      projectile: cardDef?.type === 'creature' ? cardDef.projectile : undefined,
      text: cardDef?.text ?? (c.isToken ? 'Token' : undefined)
    };
  };

  const publicView = (idx: PlayerIndex) => ({
    faction: state.players[idx].faction,
    base: state.players[idx].base,
    energy: state.players[idx].energy,
    deckCount: state.players[idx].deck.length,
    handCount: state.players[idx].hand.length,
    flyDone: state.players[idx].flyDone
  });

  return {
    you: player,
    round: state.round,
    roundLimit: state.config.roundLimit,
    lanes: state.config.lanes,
    energyCap: state.config.energyCap,
    phase: state.phase,
    active: state.active,
    winner: state.winner,
    players: [publicView(0), publicView(1)],
    hand: state.players[player].hand.map((id) => data.cardsById[id]),
    board: [
      state.board[0].map((_, lane) => creatureView(0, lane)),
      state.board[1].map((_, lane) => creatureView(1, lane))
    ],
    log: state.log.slice(-60)
  };
}
