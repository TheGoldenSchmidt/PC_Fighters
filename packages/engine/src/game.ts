// Spiellogik: reine Funktionen auf dem GameState, kein Netzwerk, kein UI.
// applyAction(state, spieler, aktion) → neuer Zustand (oder GameRuleError).

import {
  applyHinrichten,
  applyShedding,
  getAbilities,
  hasAbility,
  onDeathTriggers,
  onCardPlayedAbilities,
  onPlayAbilities,
  onRoundEndAbilities,
  onRoundStartAbilities,
  resolvePoison
} from './abilities.js';
import {
  angebote,
  fuehreWirkungAus,
  kraftVonSlot,
  oeffneFenster,
  wirkungsKontext
} from './cheerleader.js';
import { resolveEffect } from './effects.js';
import { zieheKarten } from './draw.js';
import { buildFactionTree, matchesScope, topOf } from './factions.js';
import { defaultCheerleaderSelection, maxCopiesOf, validateDeck } from './schema.js';
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
import { hasKeyword } from './keywords.js';
import { wuerfle } from './rng.js';
import { basisSchaden } from './schild.js';
import { rechneBuffSchadenZu, registriereAusspielen, registriereEnergie, registriereMulligan, zaehleCheerleader, zaehleKarte, zaehleSpieler } from './stats.js';
import type {
  AufloesungsSchritt,
  CardDef,
  CheerleaderSelection,
  CheerleaderSlots,
  ClientView,
  Creature,
  CreatureView,
  DeckList,
  GameConfig,
  GameData,
  GameState,
  MatchSummaryView,
  PlayerAction,
  PlayerIndex,
  PlayerState,
  ReaktionsAngebot
} from './types.js';

export { GameRuleError, getEffectiveAttack, getMaxHealth };

function matchSummary(state: GameState): MatchSummaryView {
  const summary: MatchSummaryView = {
    round: state.round,
    baseDamageDealt: [0, 0],
    creaturesLost: [0, 0],
    shieldsBlocked: [0, 0],
    cheerleadersUsed: [0, 0]
  };

  for (const entry of state.log) {
    const event = entry.event;
    if (!event) continue;
    if (event.kind === 'attack' && event.toBase) {
      summary.baseDamageDealt[event.attacker] += event.damage;
    } else if (event.kind === 'death') {
      summary.creaturesLost[event.owner] += 1;
    } else if (event.kind === 'schild' && event.blockiert) {
      summary.shieldsBlocked[event.owner] += 1;
    } else if (event.kind === 'cheerleaderSacrifice') {
      summary.cheerleadersUsed[event.owner] += 1;
    }
  }
  return summary;
}

/**
 * Auren neu berechnen, Tote entfernen und als Sterbe-Events loggen. Beim-Tod-
 * Effekte (todesfluch, beschwoeren, sammeln) können neue Tode auslösen – daher
 * bis zur Stabilität wiederholen.
 *
 * Tode öffnen KEIN Cheerleader-Fenster mehr: Die Bank ist der Basis-Schild und
 * wird ausschließlich von einem Block angezapft (siehe schild.ts).
 */
function logDeaths(state: GameState): void {
  let guard = 0;
  while (guard < 100) {
    const deaths = recalcBoard(state);
    for (const d of deaths) {
      log(state, `${d.name} wird zerstört.`, {
        kind: 'death', lane: d.lane, owner: d.owner, uid: d.creature.uid
      });
    }
    // Fällt der vordere Team-Up-Kämpfer, rückt der überlebende Partner in den
    // normalen Lane-Slot vor. Das hält Regelzustand und Kampf-Replay identisch
    // und entfernt den Team-Bonus beim nächsten recalcBoard-Durchlauf sauber.
    for (const owner of [0, 1] as PlayerIndex[]) {
      for (let lane = 0; lane < state.config.lanes; lane++) {
        const rear = state.teamBoard?.[owner]?.[lane];
        if (!state.board[owner][lane] && rear && rear.currentHealth > 0) {
          state.board[owner][lane] = rear;
          state.teamBoard![owner][lane] = null;
        }
      }
    }
    const teamDeaths = [] as typeof deaths;
    for (const owner of [0, 1] as PlayerIndex[]) {
      for (let lane = 0; lane < state.config.lanes; lane++) {
        const creature = state.teamBoard?.[owner]?.[lane];
        if (!creature || creature.currentHealth > 0) continue;
        state.teamBoard![owner][lane] = null;
        teamDeaths.push({ owner, lane, name: creature.name, faction: creature.faction, creature });
        log(state, `${creature.name} wird zerstört.`, {
          kind: 'death', lane, owner, uid: creature.uid
        });
      }
    }
    const allDeaths = [...deaths, ...teamDeaths];
    if (allDeaths.length > 0) onDeathTriggers(state, allDeaths);
    // Ist der vordere Kämpfer gefallen, rückt der Team-Up-Partner nach.
    for (const owner of [0, 1] as PlayerIndex[]) {
      for (let lane = 0; lane < state.config.lanes; lane++) {
        if (!state.board[owner][lane] && state.teamBoard?.[owner]?.[lane]) {
          state.board[owner][lane] = state.teamBoard[owner][lane];
          state.teamBoard[owner][lane] = null;
        }
      }
    }
    if (allDeaths.length === 0) return;
    guard += 1;
  }
}

// ---------------------------------------------------------------- Deck & Start

/** Energie einer Runde: start + (Runde-1)*perRound, optional durch cap gedeckelt. */
export function roundEnergy(config: GameConfig, round: number): number {
  const { start, perRound, cap } = config.energy;
  const value = start + Math.max(0, round - 1) * perRound;
  return cap != null ? Math.min(value, cap) : value;
}

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
 *
 * Heroes/Principals (category) bekommen ihre eigenen Limits: das Auto-Deck darf
 * nach dem Kürzen nicht mehr davon enthalten, als `validateDeck` erlaubt – daher
 * werden sie VOR dem Mischen auf maxHeroes/maxPrincipals begrenzt (zufällige
 * Auswahl aus den in Frage kommenden Karten).
 */
export function buildDeck(data: GameData, faction: string, random: () => number): string[] {
  // Parent-aware: wählt der Spieler eine Oberfraktion, gehören alle Karten ihrer
  // Sub-Fraktionen dazu (same_top). Eine Sub-Fraktion liefert nur ihre Karten.
  const tree = buildFactionTree(data.factions);
  const cards = data.cards.filter(
    (c) => c.deckable !== false && matchesScope(tree, 'same_top', c.faction, faction)
  );
  if (cards.length === 0) {
    throw new GameRuleError(`Für die Fraktion "${faction}" gibt es keine Karten.`);
  }
  const rules = data.config.deckbuilding;
  const kategorieLimit: Record<string, number> = {
    hero: rules.maxHeroes ?? 2,
    principal: rules.maxPrincipals ?? 1
  };
  // Zufällige Reihenfolge, damit nicht immer dieselben Heroes gezogen werden.
  const gemischteKarten = shuffle(cards, random);
  const kategorieAnzahl: Record<string, number> = {};
  const deck: string[] = [];
  for (const card of gemischteKarten) {
    const copies = maxCopiesOf(card, rules);
    if (card.category) {
      const limit = kategorieLimit[card.category] ?? 0;
      const bisher = kategorieAnzahl[card.category] ?? 0;
      const rest = Math.max(0, limit - bisher);
      if (rest === 0) continue;
      const n = Math.min(copies, rest);
      kategorieAnzahl[card.category] = bisher + n;
      for (let i = 0; i < n; i++) deck.push(card.id);
      continue;
    }
    for (let i = 0; i < copies; i++) deck.push(card.id);
  }
  return shuffle(deck, random).slice(0, rules.size);
}

/** Automatisches 40-Karten-Deck aus genau den beiden Klassen eines Champs. */
function buildChampionDeck(data: GameData, championId: string, random: () => number): string[] {
  const champion = data.champions.find((entry) => entry.id === championId);
  if (!champion) throw new GameRuleError(`Unbekannter Champ "${championId}".`);
  const tree = buildFactionTree(data.factions);
  const candidates = shuffle(
    data.cards.filter(
      (card) =>
        card.deckable !== false &&
        (champion.classes.includes(card.faction) || isNeutralForGame(card, data, tree))
    ),
    random
  );
  const deck: string[] = [];
  for (const card of candidates) {
    for (let copy = 0; copy < maxCopiesOf(card, data.config.deckbuilding); copy++) deck.push(card.id);
    if (deck.length >= data.config.deckbuilding.size) break;
  }
  if (deck.length < data.config.deckbuilding.size) {
    throw new GameRuleError(`Für ${champion.name} gibt es nicht genug Karten für ein vollständiges Deck.`);
  }
  return shuffle(deck.slice(0, data.config.deckbuilding.size), random);
}

function isNeutralForGame(card: CardDef, data: GameData, tree: ReturnType<typeof buildFactionTree>): boolean {
  const top = topOf(tree, card.faction);
  return data.factions.some((faction) => faction.id === top && faction.neutral);
}

/** Baut den Ziehstapel aus einer geprüften Deckliste (spielergewählt). */
export function buildDeckFromList(data: GameData, deck: DeckList, random: () => number): string[] {
  validateDeck(deck, data); // wirft DeckError bei ungültigem Deck
  const ids: string[] = [];
  for (const entry of deck.cards) {
    for (let i = 0; i < entry.count; i++) ids.push(entry.cardId);
  }
  return shuffle(ids, random);
}

function drawCards(state: GameState, player: PlayerIndex, amount: number): void {
  zieheKarten(state, player, amount);
}

export function createGame(
  data: GameData,
  factions: [string, string],
  random: () => number = Math.random,
  /** Optionale spielergewählte Decks (Deck-Editor). Ohne Angabe: Auto-Deck. */
  decks?: [DeckList | null, DeckList | null],
  cheerleaders?: [CheerleaderSelection, CheerleaderSelection]
): GameState {
  const makePlayer = (
    selectionId: string,
    deck: DeckList | null,
    selection: CheerleaderSelection | null
  ): PlayerState => {
    const champion = data.champions.find((entry) => entry.id === selectionId);
    const championCheerleaders = data.config.schild?.cheerleaders ?? [null, null, null];
    return {
      faction: champion?.side ?? selectionId,
      championId: champion?.id,
      classes: champion ? [...champion.classes] : undefined,
      deckName: deck?.name,
      cheerleaders: champion
        ? [...championCheerleaders] as CheerleaderSlots
        : !selection
          ? [null, null, null]
          : [...selection],
      cheerleaderPowers: champion ? [null, null, null] : undefined,
      deck: deck
        ? buildDeckFromList(data, deck, random)
        : champion
          ? buildChampionDeck(data, champion.id, random)
          : buildDeck(data, selectionId, random),
      hand: [],
      base: data.config.baseHealth,
      energy: 0,
      knowledge: 0,
      flyDone: false,
      mulliganDone: false,
      schild: 0,
      basisImmun: false,
      gespieltDieseRunde: [],
      superpowersRemaining: champion ? [...champion.superpowers] : undefined,
      blocksRemaining: champion ? 3 : undefined
    };
  };

  const state: GameState = {
    config: data.config,
    factionTree: buildFactionTree(data.factions),
    round: 0,
    phase: 'mulligan',
    startingPlayer: random() < 0.5 ? 0 : 1,
    active: 0,
    consecutivePasses: 0,
    players: [
      makePlayer(
        factions[0],
        decks?.[0] ?? null,
        data.champions.some((champion) => champion.id === factions[0]) || !data.config.cheerleaders
          ? null
          : cheerleaders?.[0] ?? defaultCheerleaderSelection(decks?.[0] ?? null, data)
      ),
      makePlayer(
        factions[1],
        decks?.[1] ?? null,
        data.champions.some((champion) => champion.id === factions[1]) || !data.config.cheerleaders
          ? null
          : cheerleaders?.[1] ?? defaultCheerleaderSelection(decks?.[1] ?? null, data)
      )
    ],
    board: [
      Array.from({ length: data.config.lanes }, () => null),
      Array.from({ length: data.config.lanes }, () => null)
    ],
    teamBoard: [
      Array.from({ length: data.config.lanes }, () => null),
      Array.from({ length: data.config.lanes }, () => null)
    ],
    environments: Array.from({ length: data.config.lanes }, () => null),
    log: [],
    winner: null,
    uidCounter: 0,
    aufloesung: [],
    reaktion: null,
    naechsteReaktionsId: 1,
    // Einmalig aus der injizierten Zufallsquelle gezogen: ab hier bezieht die
    // Engine jeden weiteren Zufall aus diesem Feld (wuerfle(), siehe rng.ts),
    // damit ein gesetzter Seed die ganze Partie deterministisch macht.
    rngState: Math.floor(random() * 0x100000000) >>> 0
  };

  drawCards(state, 0, data.config.startingHand);
  drawCards(state, 1, data.config.startingHand);
  // Jeder Champ beginnt mit einer zufälligen seiner vier Superkräfte; die
  // übrigen drei kommen über die höchstens drei Superblocks ins Spiel.
  for (const player of [0, 1] as PlayerIndex[]) {
    const remaining = state.players[player].superpowersRemaining;
    if (!remaining?.length) continue;
    const index = Math.floor(random() * remaining.length);
    state.players[player].hand.push(remaining.splice(index, 1)[0]);
    state.players[player].cheerleaderPowers = [
      remaining[0] ?? null,
      remaining[1] ?? null,
      remaining[2] ?? null
    ];
  }
  return state;
}

/** Einmaliger Mulligan: erst Ersatz ziehen, dann abgelegte Karten zurückmischen. */
function mulliganAction(
  state: GameState,
  player: PlayerIndex,
  action: Extract<PlayerAction, { type: 'mulligan' }>,
  data: GameData,
  random: () => number
): void {
  if (state.phase !== 'mulligan') throw new GameRuleError('Der Mulligan ist bereits vorbei.');
  const p = state.players[player];
  if (p.mulliganDone) throw new GameRuleError('Du hast deinen Mulligan bereits bestätigt.');
  const indices = [...new Set(action.handIndices)].sort((a, b) => b - a);
  if (indices.some((i) => !Number.isInteger(i) || i < 0 || i >= p.hand.length)) {
    throw new GameRuleError('Ungültige Kartenauswahl für den Mulligan.');
  }
  const zurueckInstanzen = registriereMulligan(state, player, indices);
  const zurueck: string[] = [];
  for (const i of indices) zurueck.push(p.hand.splice(i, 1)[0]);
  drawCards(state, player, zurueck.length);
  if (state.stats) {
    const paare = p.deck.map((card, i) => ({ card, id: state.stats!.deckInstanzen[player][i] }))
      .concat(zurueck.map((card, i) => ({ card, id: zurueckInstanzen[i] })));
    const gemischt = shuffle(paare, random);
    p.deck = gemischt.map((x) => x.card);
    state.stats.deckInstanzen[player] = gemischt.map((x) => x.id);
  } else {
    p.deck = shuffle([...p.deck, ...zurueck], random);
  }
  p.mulliganDone = true;
  log(state, `Spieler ${player + 1} hat den Mulligan bestätigt.`);
  if (state.players[0].mulliganDone && state.players[1].mulliganDone) startRound(state, data);
  else state.active = otherPlayer(player);
}

// ---------------------------------------------------------------- Rundenablauf

function startRound(state: GameState, data: GameData): void {
  state.round += 1;
  if (state.round > 1) {
    state.startingPlayer = otherPlayer(state.startingPlayer);
    // 1. Ziehen (in Runde 1 gibt es bereits die Starthand)
    drawCards(state, 0, state.config.cardsDrawnPerTurn);
    drawCards(state, 1, state.config.cardsDrawnPerTurn);
  }
  // 2. Energie: start + (Runde-1)*perRound, optional gedeckelt – Rest verfällt.
  // Telemetrie: die noch übrige Energie aus der vorigen Runde wird gerade
  // überschrieben (Runde 1: immer 0, da PlayerState mit energy:0 startet).
  registriereEnergie(state, 0);
  registriereEnergie(state, 1);
  zaehleSpieler(state, 0, 'energieVerfallen', state.players[0].energy);
  zaehleSpieler(state, 1, 'energieVerfallen', state.players[1].energy);
  const energy = roundEnergy(state.config, state.round);
  state.players[0].energy = Math.min(state.config.energy.cap ?? Infinity, energy + (state.players[0].energyPerRoundBonus ?? 0));
  state.players[1].energy = Math.min(state.config.energy.cap ?? Infinity, energy + (state.players[1].energyPerRoundBonus ?? 0));

  state.phase = 'play';
  state.active = state.startingPlayer;
  state.consecutivePasses = 0;
  state.players[0].flyDone = false;
  state.players[1].flyDone = false;
  state.players[0].gespieltDieseRunde = [];
  state.players[1].gespieltDieseRunde = [];
  // Superkraft „Schutzschild" gilt nur für ihre eigene Runde. Die Schild-Ladung
  // selbst bleibt bewusst über Runden hinweg stehen.
  state.players[0].basisImmun = false;
  state.players[1].basisImmun = false;
  // Rundenbeginn-Effekte (Rundenwachstum, lernen/wissen pro Runde) – wirkt auf
  // Kreaturen, die aus einer früheren Runde übrig sind (Runde 1: leeres Feld).
  onRoundStartAbilities(state);
  // Datenabhängige Rundenstart-Verwandlungen laufen nach den normalen Hooks:
  // die Ausgangskreatur erhält ihren bisherigen Trigger noch, die neue nicht
  // rückwirkend ein zweites Mal.
  for (const owner of [0, 1] as PlayerIndex[]) {
    for (let lane = 0; lane < state.config.lanes; lane++) {
      for (const teamSlot of [false, true]) {
        const row = teamSlot ? state.teamBoard?.[owner] : state.board[owner];
        const creature = row?.[lane];
        if (!creature) continue;
        const ability = creature.abilities.find(
          (entry): entry is Extract<(typeof creature.abilities)[number], { kind: 'verwandlung' }> =>
            entry.kind === 'verwandlung' && entry.timing === 'rundenstart'
        );
        if (!ability) continue;
        const candidates = data.cards.filter((card): card is Extract<CardDef, { type: 'creature' }> =>
          card.type === 'creature' &&
          card.id !== creature.cardId &&
          card.cost <= ability.maxKosten &&
          matchesScope(state.factionTree, ability.scope, creature.faction, card.faction)
        );
        if (candidates.length === 0) continue;
        const target = candidates[wuerfle(state, 0, candidates.length - 1)];
        const replacement = makeCreature(state, { cardId: target.id, ...target }, { isToken: false });
        replacement.faceDown = false;
        replacement.exhausted = false;
        row![lane] = replacement;
        log(state, `${creature.name} verwandelt sich in ${replacement.name}.`, {
          kind: 'spell', lane, effect: 'summon', faction: replacement.faction
        });
      }
    }
  }
  recalcBoard(state);
  log(state, `— Runde ${state.round} beginnt (${energy} Energie, Spieler ${state.startingPlayer + 1} fängt an) —`);
}

/**
 * Erster Teil des Rundenendes: Rundenende-Effekte und Zurücksetzen der
 * temporären Werte. Die anschließende Todesauflösung und die Zermürbung sind
 * eigene Schritte, weil dazwischen ein Reaktionsfenster aufgehen kann.
 */
function rundenAbschluss(state: GameState): void {
  onRoundEndAbilities(state);
  // Temporäre Buffs entfernen, Erschöpfung aufheben, Rundenzustand zurücksetzen.
  for (const row of [...state.board, ...(state.teamBoard ?? [])]) {
    for (const creature of row) {
      if (!creature) continue;
      creature.tempAttackBonus = 0;
      creature.tempAttackSources = {};
      creature.tempHealthBonus = 0;
      creature.exhausted = false;
      creature.movedThisFlyPhase = false;
      // Bugfix: wurde bisher nie zurückgesetzt, wodurch `kaltbluetig` faktisch
      // "hat noch nie angegriffen" statt "diese Runde nicht angegriffen" prüfte.
      creature.attackedThisRound = false;
      creature.rundenZaehler = {};
    }
  }
}

function zermuerbungUndNaechsteRunde(state: GameState, data: GameData): void {
  // Zermürbung (Regelwerk V2): ab config.zermuerbung.abRunde verlieren beide
  // Basen am Rundenende Leben – das ist die REGULÄRE Terminierung für lange
  // Partien (eine echte Spielentscheidung statt eines harten Abbruchs).
  // roundLimit bleibt daneben als technische Notbremse bestehen (siehe unten).
  const z = state.config.zermuerbung;
  if (z && state.round >= z.abRunde) {
    const schaden = z.schaden + (state.round - z.abRunde) * z.steigerung;
    state.players[0].base -= schaden;
    state.players[1].base -= schaden;
    log(state, `Zermürbung: beide Basen verlieren ${schaden} Leben.`);
    if (checkBaseDestroyed(state)) return;
  }

  if (state.round >= state.config.roundLimit) {
    const [a, b] = state.players;
    state.phase = 'ended';
    state.aufloesung = [];
    state.reaktion = null;
    state.winner = a.base > b.base ? 0 : b.base > a.base ? 1 : 'draw';
    log(
      state,
      state.winner === 'draw'
        ? `Rundenlimit erreicht – Unentschieden (${a.base} : ${b.base}).`
        : `Rundenlimit erreicht – Spieler ${(state.winner as number) + 1} gewinnt (${a.base} : ${b.base}).`
    );
    return;
  }
  startRound(state, data);
}

// ---------------------------------------------------------------- Kampfphase

function checkBaseDestroyed(state: GameState): boolean {
  // Bereits beendet: nicht erneut prüfen, sonst stünde die Sieg-Meldung doppelt
  // im Log (die Basis bleibt ja auf ≤0 stehen).
  if (state.phase === 'ended') return false;
  const dead0 = state.players[0].base <= 0;
  const dead1 = state.players[1].base <= 0;
  if (!dead0 && !dead1) return false;
  state.phase = 'ended';
  state.winner = dead0 && dead1 ? 'draw' : dead0 ? 1 : 0;
  // Nichts mehr auflösen und kein Fenster offen lassen – die Partie ist vorbei.
  state.aufloesung = [];
  state.reaktion = null;
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
  // Summiert über alle neugier-Einträge (eine Karte kann theoretisch mehrere haben).
  return getAbilities(c, 'neugier').reduce((sum, n) => sum + (n.basisschaden ?? 0), 0);
}

function referenzZahl(creature: Creature, begriff: string, fallback: number): number {
  for (const ability of creature.abilities) {
    if (ability.kind !== 'referenz') continue;
    const match = ability.text.match(new RegExp(`${begriff}\\s*(\\d+)`, 'i'));
    if (match) return Number(match[1]);
  }
  return fallback;
}

function antiHeroBonus(creature: Creature): number {
  const abilities = getAbilities(creature, 'antiHero');
  return abilities.length > 0
    ? abilities.reduce((sum, ability) => sum + ability.bonusAtk, 0)
    : referenzZahl(creature, 'Anti-Hero', 3);
}

/** Effektive Werte des hinteren Team-Up-Slots. Er läuft nicht durch die
 * board-basierten Aura-Helfer und braucht deshalb seine Team-Primitiven hier. */
function rearTeamAttack(state: GameState, owner: PlayerIndex, lane: number, creature: Creature): number {
  let attack = creature.baseAttack + creature.permAttackBonus + creature.tempAttackBonus;
  for (const bonus of getAbilities(creature, 'teamBonus')) attack += bonus.bonus.atk;
  const front = state.board[owner][lane];
  if (front) {
    for (const buff of getAbilities(front, 'teamBuff')) {
      if (matchesScope(state.factionTree, buff.scope, front.faction, creature.faction)) attack += buff.atk;
    }
  }
  return Math.max(0, attack);
}

function rearTeamMaxHealth(creature: Creature): number {
  const teamHealth = getAbilities(creature, 'teamBonus').reduce(
    (sum, bonus) => sum + bonus.bonus.hp,
    0
  );
  return Math.max(
    1,
    creature.baseMaxHealth + creature.permHealthBonus + creature.tempHealthBonus + teamHealth
  );
}

/** Ein Angriff Kreatur→Kreatur inkl. Gift, Wucht (Überschuss→Basis) und Dornen. */
function creatureStrike(
  state: GameState,
  attacker: Creature,
  defender: Creature,
  atk: number,
  attackerIdx: PlayerIndex,
  lane: number
): boolean {
  const defenderHealthBefore = defender.currentHealth;
  const defenderIdx = otherPlayer(attackerIdx);
  const damage = Math.max(0, atk - (hasKeyword(defender, 'armored') ? referenzZahl(defender, 'Armored', 1) : 0));
  defender.currentHealth -= damage;
  if (damage > 0 && hasKeyword(attacker, 'deadly')) defender.currentHealth = 0;
  defender.letzterSchaden = { art: 'kampf', quelle: attacker.cardId, owner: attackerIdx };
  attacker.attackedThisRound = true;
  zaehleKarte(state, attackerIdx, attacker.cardId, 'schadenKreatur', damage);
  const aktionsBuff = Object.values(attacker.tempAttackSources ?? {}).reduce((sum, amount) => sum + Math.max(0, amount), 0);
  const angriffOhneAktionsBuff = Math.max(0, atk - aktionsBuff);
  const echterKreaturenschaden = Math.min(damage, defenderHealthBefore);
  const buffKreaturenschaden = Math.max(0, echterKreaturenschaden - Math.min(angriffOhneAktionsBuff, defenderHealthBefore));
  rechneBuffSchadenZu(state, attackerIdx, attacker, buffKreaturenschaden, 'Kreatur');
  if (attacker.spawnRound === state.round) {
    zaehleSpieler(state, attackerIdx, 'flinkAngriffe');
    zaehleKarte(state, attackerIdx, attacker.cardId, 'flinkAngriffe');
  }
  log(state, `Lane ${lane + 1}: ${attacker.name} trifft ${defender.name} für ${damage}.`, {
    kind: 'attack',
    lane,
    attacker: attackerIdx,
    damage,
    toBase: false
  });
  if (hasKeyword(attacker, 'strikethrough')) {
    const basis = basisSchaden(state, defenderIdx, atk, { bullseye: hasKeyword(attacker, 'bullseye') });
    if (basis > 0) log(state, `Durchschlag: ${attacker.name} trifft zusätzlich die Basis für ${basis}.`, {
      kind: 'attack', lane, attacker: attackerIdx, damage: basis, toBase: true
    });
  }
  // Gift-Marken (Zermürbung, siehe resolvePoison). Mehrere gift-Einträge stapeln.
  const giftStaerke = getAbilities(attacker, 'gift').reduce((sum, g) => sum + g.staerke, 0);
  if (giftStaerke > 0) defender.poison += giftStaerke;
  // Wucht: Überschussschaden trifft die gegnerische Basis.
  if (hasAbility(attacker, 'wucht')) {
    const overflow = Math.max(0, atk - defenderHealthBefore);
    if (overflow > 0) {
      // Läuft durch den Schild: ein Wucht-Überschuss kann geblockt werden und
      // lädt genauso auf wie ein direkter Basis-Angriff.
      const echt = basisSchaden(state, defenderIdx, overflow);
      zaehleKarte(state, attackerIdx, attacker.cardId, 'schadenBasis', echt);
      const natuerlicherOverflow = Math.max(0, angriffOhneAktionsBuff - defenderHealthBefore);
      rechneBuffSchadenZu(state, attackerIdx, attacker, Math.max(0, echt - natuerlicherOverflow), 'Basis');
      zaehleSpieler(state, attackerIdx, 'wuchtSchaden', echt);
      if (echt > 0) {
        log(state, `Lane ${lane + 1}: Wucht! ${echt} Überschuss trifft die Basis.`, {
          kind: 'attack', lane, attacker: attackerIdx, damage: echt, toBase: true
        });
      }
    }
  }
  // Dornen: Verteidiger fügt dem Angreifer Schaden zu. Mehrere dornen-Einträge stapeln.
  const dornenX = getAbilities(defender, 'dornen').reduce((sum, d) => sum + d.x, 0);
  if (dornenX > 0) {
    attacker.currentHealth -= dornenX;
    attacker.letzterSchaden = { art: 'dornen', quelle: defender.cardId, owner: defenderIdx };
    zaehleSpieler(state, defenderIdx, 'dornenSchaden', dornenX);
    log(state, `Lane ${lane + 1}: Dornen! ${defender.name} verletzt ${attacker.name} um ${dornenX}.`);
  }
  return defender.currentHealth <= 0;
}

/** Zusätzlicher Kampf-Angriffsbonus, der nur für DIESEN Schlagabtausch gilt (`hunter` gegen vergiftete Ziele). */
function kampfAngriffsBonus(state: GameState, attackerOwner: PlayerIndex, lane: number): number {
  const attacker = state.board[attackerOwner][lane];
  const defender = state.board[otherPlayer(attackerOwner)][lane];
  if (!attacker || !defender || defender.poison <= 0) return 0;
  return getAbilities(attacker, 'hunter').reduce((sum, h) => sum + h.bonusAtk, 0);
}

/**
 * Kampf EINER Lane. Räumt bewusst keine Toten ab – das erledigt der direkt
 * danach eingeplante Schritt `todeStabilisieren`, der dabei ein
 * Reaktionsfenster öffnen kann.
 */
function kampfLane(state: GameState, lane: number): void {
  const a = state.board[0][lane];
  const b = state.board[1][lane];
  const teamA = state.teamBoard?.[0]?.[lane] ?? null;
  const teamB = state.teamBoard?.[1]?.[lane] ?? null;

  if (teamA || teamB) {
    const rows: [Creature[], Creature[]] = [
      [a, teamA].filter((creature): creature is Creature => Boolean(creature)),
      [b, teamB].filter((creature): creature is Creature => Boolean(creature))
    ];
    for (const attackerIdx of [0, 1] as PlayerIndex[]) {
      for (const attacker of rows[attackerIdx]) {
        if (attacker.exhausted || attacker.currentHealth <= 0) continue;
        const defenderIdx = otherPlayer(attackerIdx);
        const defender = rows[defenderIdx].find((creature) => creature.currentHealth > 0);
        let attack = rearTeamAttack(state, attackerIdx, lane, attacker);
        if (state.board[attackerIdx][lane]?.uid === attacker.uid) attack = getEffectiveAttack(state, attackerIdx, lane);
        if (!defender && hasKeyword(attacker, 'antiHero')) attack += antiHeroBonus(attacker);
        let strikes = hasKeyword(attacker, 'doubleStrike') ? 2 : 1;
        let frenzyAdded = false;
        for (let strike = 0; strike < strikes; strike++) {
          const currentDefender = rows[defenderIdx].find((creature) => creature.currentHealth > 0);
          if (currentDefender) {
            const killed = creatureStrike(state, attacker, currentDefender, attack, attackerIdx, lane);
            if (killed && hasKeyword(attacker, 'frenzy') && !frenzyAdded) {
              strikes += 1;
              frenzyAdded = true;
            }
          }
          else {
            const damage = basisSchaden(state, defenderIdx, attack, { bullseye: hasKeyword(attacker, 'bullseye') });
            log(state, `Lane ${lane + 1}: ${attacker.name} trifft die gegnerische Basis für ${damage}.`, {
              kind: 'attack', lane, attacker: attackerIdx, damage, toBase: true, ...(damage === 0 ? { blockiert: true } : {})
            });
          }
        }
      }
    }
    applyShedding(state);
    return;
  }

  if (a && b) {
    // Beide Lanes besetzt: kampfbereite Kreaturen schlagen GLEICHZEITIG zu.
    // Erschöpfte Kreaturen greifen nicht an, verteidigen aber normal.
    const atkA = a.exhausted ? 0 : getEffectiveAttack(state, 0, lane) + kampfAngriffsBonus(state, 0, lane);
    const atkB = b.exhausted ? 0 : getEffectiveAttack(state, 1, lane) + kampfAngriffsBonus(state, 1, lane);
    if (atkA === 0 && atkB === 0) return;

    // Hinrichten (beim Angriff, vor dem Schaden). Mehrere hinrichten-Einträge
    // auf derselben Karte lösen nacheinander aus (applyHinrichten überspringt
    // bereits getroffene Ziele, siehe dortiger Kommentar).
    if (atkA > 0) {
      for (const h of getAbilities(a, 'hinrichten')) applyHinrichten(state, 0, lane, h.maxHp);
    }
    if (atkB > 0) {
      for (const h of getAbilities(b, 'hinrichten')) applyHinrichten(state, 1, lane, h.maxHp);
    }

    const killedB = atkA > 0 ? creatureStrike(state, a, b, atkA, 0, lane) : false;
    const killedA = atkB > 0 ? creatureStrike(state, b, a, atkB, 1, lane) : false;
    if (a.currentHealth > 0 && (hasKeyword(a, 'doubleStrike') || (killedB && hasKeyword(a, 'frenzy')))) {
      if (b.currentHealth > 0) creatureStrike(state, a, b, atkA, 0, lane);
      else {
        const damage = basisSchaden(state, 1, atkA, { bullseye: hasKeyword(a, 'bullseye') });
        log(state, `${a.name} setzt nach und trifft die Basis für ${damage}.`, { kind: 'attack', lane, attacker: 0, damage, toBase: true });
      }
    }
    if (b.currentHealth > 0 && (hasKeyword(b, 'doubleStrike') || (killedA && hasKeyword(b, 'frenzy')))) {
      if (a.currentHealth > 0) creatureStrike(state, b, a, atkB, 1, lane);
      else {
        const damage = basisSchaden(state, 0, atkB, { bullseye: hasKeyword(b, 'bullseye') });
        log(state, `${b.name} setzt nach und trifft die Basis für ${damage}.`, { kind: 'attack', lane, attacker: 1, damage, toBase: true });
      }
    }
    // Häutung (`shedding`) VOR der Todesauflösung: proaktive Heilung bei
    // niedrigem Leben, bevor recalcBoard über Tod/Rettung entscheidet. Läuft
    // bewusst außerhalb der recalcBoard-Fixpunktschleife (siehe Kommentar an
    // Creature.zaehler in types.ts).
    applyShedding(state);
    return;
  }

  if (a && !b && !a.exhausted) {
    const dmg = getEffectiveAttack(state, 0, lane) + soloBasisschaden(a);
    a.attackedThisRound = true;
    // Der Schild entscheidet, wie viel wirklich ankommt. Das AttackEvent trägt
    // den effektiven Schaden, weil der Client damit direkt weiterrechnet.
    const echt = basisSchaden(state, 1, dmg + (hasKeyword(a, 'antiHero') ? antiHeroBonus(a) : 0), {
      bullseye: hasKeyword(a, 'bullseye')
    });
    zaehleKarte(state, 0, a.cardId, 'schadenBasis', echt);
    rechneBuffSchadenZu(state, 0, a, Math.min(echt, Object.values(a.tempAttackSources ?? {}).reduce((sum, amount) => sum + Math.max(0, amount), 0)), 'Basis');
    if (a.spawnRound === state.round) {
      zaehleSpieler(state, 0, 'flinkAngriffe');
      zaehleKarte(state, 0, a.cardId, 'flinkAngriffe');
    }
    log(
      state,
      echt > 0
        ? `Lane ${lane + 1}: ${a.name} trifft die gegnerische Basis für ${echt}.`
        : `Lane ${lane + 1}: ${a.name} greift die gegnerische Basis an – abgewehrt.`,
      { kind: 'attack', lane, attacker: 0, damage: echt, toBase: true, ...(echt === 0 ? { blockiert: true } : {}) }
    );
    return;
  }

  if (b && !a && !b.exhausted) {
    const dmg = getEffectiveAttack(state, 1, lane) + soloBasisschaden(b);
    b.attackedThisRound = true;
    const echt = basisSchaden(state, 0, dmg + (hasKeyword(b, 'antiHero') ? antiHeroBonus(b) : 0), {
      bullseye: hasKeyword(b, 'bullseye')
    });
    zaehleKarte(state, 1, b.cardId, 'schadenBasis', echt);
    rechneBuffSchadenZu(state, 1, b, Math.min(echt, Object.values(b.tempAttackSources ?? {}).reduce((sum, amount) => sum + Math.max(0, amount), 0)), 'Basis');
    if (b.spawnRound === state.round) {
      zaehleSpieler(state, 1, 'flinkAngriffe');
      zaehleKarte(state, 1, b.cardId, 'flinkAngriffe');
    }
    log(
      state,
      echt > 0
        ? `Lane ${lane + 1}: ${b.name} trifft die gegnerische Basis für ${echt}.`
        : `Lane ${lane + 1}: ${b.name} greift die gegnerische Basis an – abgewehrt.`,
      { kind: 'attack', lane, attacker: 1, damage: echt, toBase: true, ...(echt === 0 ? { blockiert: true } : {}) }
    );
  }
}

/** Ein einzelner zusätzlicher Angriff, ausgelöst durch eine Aktionskarte. Der
 * Schlag benutzt denselben Trefferpfad wie der normale Kampf (Rüstung,
 * Tödlich, Gift, Wucht, Dornen und Schild), ohne einen Gegenschlag. */
function bonusAngriff(state: GameState, owner: PlayerIndex, lane: number): void {
  const attacker = state.board[owner][lane];
  if (!attacker || attacker.currentHealth <= 0 || attacker.exhausted) return;
  const enemy = otherPlayer(owner);
  const defender = state.board[enemy][lane];
  const attack = getEffectiveAttack(state, owner, lane) + kampfAngriffsBonus(state, owner, lane);
  if (defender) {
    creatureStrike(state, attacker, defender, attack, owner, lane);
    applyShedding(state);
    return;
  }
  attacker.attackedThisRound = true;
  const raw = attack + (hasKeyword(attacker, 'antiHero') ? antiHeroBonus(attacker) : 0);
  const damage = basisSchaden(state, enemy, raw, { bullseye: hasKeyword(attacker, 'bullseye') });
  zaehleKarte(state, owner, attacker.cardId, 'schadenBasis', damage);
  log(state, `${attacker.name} macht einen Bonusangriff auf die Basis für ${damage}.`, {
    kind: 'attack', lane, attacker: owner, damage, toBase: true
  });
}

/** Nach allen Lanes: Gift-Zermürbung und Häutung, danach wieder Tode auflösen. */
function kampfAbschluss(state: GameState): void {
  // Gift-Zermürbung am Ende der Kampfphase: bei ≥3 Marken sofortiger Tod
  // (Marken bleiben sonst bestehen). Häutung davor, damit sie noch eingreifen kann.
  resolvePoison(state);
  applyShedding(state);
}

/** Die vollständige Kampfauflösung als Schrittfolge (Lane für Lane). */
function kampfSchritte(state: GameState): AufloesungsSchritt[] {
  const schritte: AufloesungsSchritt[] = [];
  for (let lane = 0; lane < state.config.lanes; lane++) {
    schritte.push({ art: 'kampfLane', lane }, { art: 'todeStabilisieren' });
  }
  schritte.push({ art: 'kampfAbschluss' }, { art: 'todeStabilisieren' }, { art: 'nachKampf' });
  return schritte;
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
    state.aufloesung.unshift(...rundenSchritte());
    return;
  }
  state.phase = 'fly';
  state.active = state.players[state.startingPlayer].flyDone
    ? otherPlayer(state.startingPlayer)
    : state.startingPlayer;
  log(state, 'Fliegende Kreaturen dürfen jetzt die Lane wechseln.');
}

/** Rundenende als Schrittfolge – dazwischen kann ein Fenster aufgehen. */
function rundenSchritte(): AufloesungsSchritt[] {
  return [{ art: 'rundenAbschluss' }, { art: 'todeStabilisieren' }, { art: 'zermuerbung' }];
}

function advanceFlyPhase(state: GameState): void {
  const [a, b] = state.players;
  if (a.flyDone && b.flyDone) {
    state.aufloesung.push(...rundenSchritte());
    return;
  }
  if (state.players[state.active].flyDone) {
    state.active = otherPlayer(state.active);
  }
}

// ---------------------------------------------------------------- Schrittmaschine

/**
 * Arbeitet die eingeplanten Auflösungsschritte ab, bis entweder nichts mehr
 * offen ist, ein Reaktionsfenster aufgeht oder die Partie endet. Jeder Aufruf
 * von applyAction endet hier – dadurch steht der Zustand danach IMMER entweder
 * auf "ein Spieler ist normal am Zug" oder auf "ein Fenster wartet".
 */
function fahreAufloesungFort(state: GameState, data: GameData): void {
  let guard = 0;
  while (state.aufloesung.length > 0 && !state.reaktion && state.phase !== 'ended' && guard < 500) {
    guard += 1;
    const schritt = state.aufloesung.shift();
    if (!schritt) break;
    switch (schritt.art) {
      case 'kampfLane':
        kampfLane(state, schritt.lane);
        break;
      case 'bonusAngriff':
        bonusAngriff(state, schritt.spieler, schritt.lane);
        break;
      case 'kampfAbschluss':
        kampfAbschluss(state);
        break;
      case 'todeStabilisieren':
        logDeaths(state);
        break;
      case 'schildFenster':
        // Der Block ist bereits passiert; hier wird nur noch bezahlt. Öffnet
        // sich kein Fenster (Bank inzwischen leer), geht es einfach weiter.
        oeffneFenster(state, schritt.spieler, 'schildBlock', state.active);
        break;
      case 'nachKampf':
        afterCombat(state);
        break;
      case 'rundenAbschluss':
        rundenAbschluss(state);
        break;
      case 'zermuerbung':
        zermuerbungUndNaechsteRunde(state, data);
        break;
    }
    checkBaseDestroyed(state);
  }
}

// ---------------------------------------------------------------- Aktionen

function jagdAusloesen(state: GameState, gespieltVon: PlayerIndex, zielLane: number): void {
  const jaeger = otherPlayer(gespieltVon);
  if (state.board[jaeger][zielLane]) return;
  for (let lane = 0; lane < state.config.lanes; lane++) {
    const creature = state.board[jaeger][lane];
    if (!creature || !hasKeyword(creature, 'hunt') || lane === zielLane) continue;
    state.board[jaeger][zielLane] = creature;
    state.board[jaeger][lane] = null;
    log(state, `${creature.name} jagt den neu ausgespielten Gegner in Lane ${zielLane + 1}.`, {
      kind: 'spell', lane: zielLane, effect: 'move', faction: creature.faction
    });
    return;
  }
}

/** Öffnet alle Grabsteine genau einmal und liefert der Kampf-Abspielung die
 * vollständige sichtbare Figur, bevor der erste Angriff beginnt. */
function deckeGrabsteineAuf(state: GameState, data: GameData): void {
  const revealed: { owner: PlayerIndex; lane: number; teamSlot: boolean; creature: Creature }[] = [];
  for (const owner of [0, 1] as PlayerIndex[]) {
    for (let lane = 0; lane < state.config.lanes; lane++) {
      const slots = [
        { creature: state.board[owner][lane], teamSlot: false },
        { creature: state.teamBoard?.[owner]?.[lane] ?? null, teamSlot: true }
      ];
      for (const slot of slots) {
        if (!slot.creature?.faceDown) continue;
        slot.creature.faceDown = false;
        revealed.push({ owner, lane, teamSlot: slot.teamSlot, creature: slot.creature });
      }
    }
  }

  if (revealed.length === 0) return;
  log(state, '— Grabsteine werden direkt vor dem Kampf aufgedeckt —');
  for (const item of revealed) {
    const { owner, lane, teamSlot, creature } = item;
    const card = data.cardsById[creature.cardId];
    const maxHealth = Math.max(
      1,
      creature.baseMaxHealth + creature.permHealthBonus + creature.tempHealthBonus
    );
    const isFront = state.board[owner][lane]?.uid === creature.uid;
    log(state, `${creature.name} wird in Lane ${lane + 1} aufgedeckt.`, {
      kind: 'reveal',
      lane,
      owner,
      faction: creature.faction,
      teamSlot,
      creature: {
        uid: creature.uid,
        cardId: creature.cardId,
        name: creature.name,
        keywords: creature.keywords,
        abilities: creature.abilities,
        poison: creature.poison,
        attack: isFront
          ? getEffectiveAttack(state, owner, lane)
          : Math.max(0, creature.baseAttack + creature.permAttackBonus + creature.tempAttackBonus),
        baseAttack: creature.baseAttack,
        health: creature.currentHealth,
        maxHealth,
        baseMaxHealth: creature.baseMaxHealth,
        exhausted: creature.exhausted,
        canFly: false,
        projectile: card?.type === 'creature' ? card.projectile : undefined,
        text: card?.text,
        faceDown: false
      }
    });

    if (!hasKeyword(creature, 'overshoot')) continue;
    const amount = referenzZahl(creature, 'Overshoot', 2);
    const damage = basisSchaden(state, otherPlayer(owner), amount, {
      bullseye: hasKeyword(creature, 'bullseye')
    });
    log(state, `${creature.name}: Overshoot trifft die Basis für ${damage}.`, {
      kind: 'attack', lane, attacker: owner, damage, toBase: true
    });
  }

  for (const item of revealed) {
    const debuffs = item.creature.abilities.filter(
      (ability): ability is Extract<(typeof item.creature.abilities)[number], { kind: 'aufdeckenDebuff' }> =>
        ability.kind === 'aufdeckenDebuff'
    );
    for (const debuff of debuffs) {
      const enemy = otherPlayer(item.owner);
      for (const target of [state.board[enemy][item.lane], state.teamBoard?.[enemy]?.[item.lane]]) {
        if (!target) continue;
        target.permAttackBonus -= debuff.atk;
        target.permHealthBonus -= debuff.hp;
      }
    }
  }
}

function playPhaseAction(state: GameState, player: PlayerIndex, action: PlayerAction, data: GameData): void {
  if (state.active !== player) {
    throw new GameRuleError('Du bist gerade nicht am Zug.');
  }

  if (action.type === 'pass') {
    // Wer die beim Superblock gerade kostenlose Kraft nicht sofort nutzt,
    // behält sie regulär für 1 Energie auf der Hand.
    state.players[player].freeSuperpowerId = undefined;
    state.consecutivePasses += 1;
    log(state, `Spieler ${player + 1} passt.`);
    if (state.consecutivePasses >= 2) {
      deckeGrabsteineAuf(state, data);
      logDeaths(state);
      log(state, '— Kampfphase —');
      state.aufloesung.push(...kampfSchritte(state));
    } else {
      state.active = otherPlayer(player);
    }
    return;
  }

  if (action.type !== 'playCreature' && action.type !== 'playAction' && action.type !== 'playEnvironment') {
    throw new GameRuleError('Diese Aktion ist in der Ausspielphase nicht möglich.');
  }
  if (state.phase === 'precombat' && action.type === 'playCreature') {
    throw new GameRuleError('Im Vor-Kampf-Fenster können nur Aktionen, Umgebungen und Superkräfte gespielt werden.');
  }

  const p = state.players[player];
  const cardId = p.hand[action.handIndex];
  if (!cardId) throw new GameRuleError('Diese Handkarte gibt es nicht (mehr).');
  const card = data.cardsById[cardId];
  if (!card) throw new GameRuleError(`Unbekannte Karte "${cardId}".`);
  const freeSuperpower = card.type === 'superpower' && p.freeSuperpowerId === card.id;
  const cost = freeSuperpower ? 0 : card.cost;
  if (cost > p.energy) {
    throw new GameRuleError(`Nicht genug Energie: ${card.name} kostet ${cost}, du hast ${p.energy}.`);
  }

  if (action.type === 'playCreature') {
    if (card.type !== 'creature') {
      throw new GameRuleError(`${card.name} ist eine Aktionskarte – bitte ohne Lane ausspielen.`);
    }
    if (action.lane < 0 || action.lane >= state.config.lanes) {
      throw new GameRuleError('Diese Lane gibt es nicht.');
    }
    if (action.lane === state.config.lanes - 1 && !card.keywords.includes('amphibious')) {
      throw new GameRuleError('In der Wasser-Lane dürfen nur amphibische Kämpfer stehen.');
    }
    const creature = makeCreature(state, { cardId: card.id, ...card }, { isToken: false });
    const existing = state.board[player][action.lane];
    let teamSlot = false;
    if (existing) {
      state.teamBoard ??= [
        Array.from({ length: state.config.lanes }, () => null),
        Array.from({ length: state.config.lanes }, () => null)
      ];
      if (state.teamBoard[player][action.lane]) {
        throw new GameRuleError('In dieser Lane stehen bereits zwei eigene Kämpfer.');
      }
      if (!hasKeyword(existing, 'teamUp') && !hasKeyword(creature, 'teamUp')) {
        throw new GameRuleError('Nur mit Team-Up dürfen zwei eigene Kämpfer dieselbe Lane teilen.');
      }
      state.teamBoard[player][action.lane] = creature;
      teamSlot = true;
      // Der hintere Slot wird von recalcBoard nicht durchlaufen. Einen eigenen
      // Team-Bonus daher beim Betreten auf aktuelles und letztes Maximum legen.
      const teamHealth = getAbilities(creature, 'teamBonus').reduce(
        (sum, bonus) => sum + bonus.bonus.hp,
        0
      );
      creature.currentHealth += teamHealth;
      creature.lastMaxHealth += teamHealth;
    } else {
      state.board[player][action.lane] = creature;
    }
    log(
      state,
      `Spieler ${player + 1} spielt ${card.name} in Lane ${action.lane + 1}` +
        (creature.exhausted ? '.' : ' – flink und sofort kampfbereit!')
    );
    // Beim-Ausspielen-Effekte (sturzflug, lernen, wissen, Puls, umverteilung,
    // beschwoeren, entwaffnen, experiment).
    onPlayAbilities(state, player, action.lane, teamSlot);
    onCardPlayedAbilities(state, player, card.faction);
    jagdAusloesen(state, player, action.lane);
  } else if (action.type === 'playEnvironment') {
    if (card.type !== 'environment') {
      throw new GameRuleError(`${card.name} ist keine Umgebung.`);
    }
    if (action.lane < 0 || action.lane >= state.config.lanes) throw new GameRuleError('Diese Lane gibt es nicht.');
    state.environments ??= Array.from({ length: state.config.lanes }, () => null);
    state.environments[action.lane] = { cardId: card.id, owner: player };
    resolveEffect({ state, player, card, action });
    log(state, `${card.name} prägt jetzt Lane ${action.lane + 1}.`, {
      kind: 'spell', lane: action.lane, effect: 'environment', faction: card.faction
    });
  } else {
    if (card.type !== 'action' && card.type !== 'superpower') {
      throw new GameRuleError(`${card.name} muss in eine Lane gespielt werden.`);
    }
    resolveEffect({ state, player, card, action });
  }

  p.energy -= cost;
  p.freeSuperpowerId = undefined;
  registriereAusspielen(state, player, action.handIndex);
  p.hand.splice(action.handIndex, 1);
  state.consecutivePasses = 0;
  zaehleKarte(state, player, card.id, 'gespielt');
  // Für `synergie`: NACH den Beim-Ausspielen-Effekten dieser Karte eintragen,
  // damit die eigene Karte sich nicht selbst als "zuvor gespielt" zählt.
  p.gespieltDieseRunde.push(card.faction);
  logDeaths(state);
  state.active = otherPlayer(player);

}

// ---------------------------------------------------------------- Reaktion

/**
 * Antwort auf ein offenes Reaktionsfenster.
 *
 * Verzichten gibt es NICHT: Das Fenster geht nur auf, wenn der Schild gerade
 * einen Treffer geblockt hat – der Block ist also schon eingelöst und wird mit
 * dem Bankplatz bezahlt. Gewählt wird nur, WER sich opfert. Ein Opfer kostet
 * weiterhin weder Energie noch einen Zug.
 */
function reaktionsAktion(
  state: GameState,
  player: PlayerIndex,
  action: Extract<PlayerAction, { type: 'cheerleaderReaction' }>,
  data: GameData
): void {
  const reaktion = state.reaktion;
  if (!reaktion) throw new GameRuleError('Gerade wartet keine Cheerleader-Reaktion.');
  if (reaktion.spieler !== player) {
    throw new GameRuleError('Diese Cheerleader-Reaktion gehört dem anderen Spieler.');
  }
  // Schützt gegen doppelt gesendete oder verspätete Antworten nach Reconnect.
  if (action.reactionId !== reaktion.id) {
    throw new GameRuleError('Diese Reaktion ist nicht mehr aktuell.');
  }

  const fortsetzenMit = reaktion.fortsetzenMit;

  if (action.slot == null) {
    throw new GameRuleError('Der Schild hat geblockt – ein Cheerleader muss sich dafür opfern.');
  }
  if (!reaktion.slots.includes(action.slot)) {
    throw new GameRuleError('Dieser Bankplatz passt nicht zu diesem Auslöser.');
  }
  const p = state.players[player];
  const championPowerId = p.cheerleaderPowers?.[action.slot] ?? null;
  if (p.cheerleaderPowers && championPowerId) {
    const carrierId = p.cheerleaders[action.slot];
    if (!carrierId) throw new GameRuleError('Auf diesem Bankplatz sitzt kein Cheerleader.');
    const power = data.cardsById[championPowerId];
    if (!power || power.type !== 'superpower') {
      throw new GameRuleError('Die zugewiesene Champ-Superkraft ist ungültig.');
    }

    state.reaktion = null;
    state.active = fortsetzenMit;
    p.cheerleaders[action.slot] = null;
    p.cheerleaderPowers[action.slot] = null;
    const remainingIndex = p.superpowersRemaining?.indexOf(championPowerId) ?? -1;
    if (remainingIndex >= 0) p.superpowersRemaining!.splice(remainingIndex, 1);
    if (p.hand.length >= (state.config.handLimit ?? 10)) {
      p.hand.shift();
      log(state, `Die Hand von Spieler ${player + 1} war voll; die älteste Karte weicht der Superkraft.`);
    }
    p.hand.push(championPowerId);
    p.freeSuperpowerId = championPowerId;

    const carrierName = data.cardsById[carrierId]?.name ?? carrierId;
    log(state, `Spieler ${player + 1} wählt ${power.name} bei ${carrierName}.`, {
      kind: 'cheerleaderSacrifice',
      owner: player,
      slot: action.slot,
      cardId: carrierId
    });
    log(state, `${power.name} ist jetzt sofort kostenlos spielbar.`);
    zaehleCheerleader(state, player, carrierId, 'geopfert');
    state.aufloesung.unshift({ art: 'todeStabilisieren' });
    return;
  }

  const eintrag = kraftVonSlot(state, player, action.slot);
  if (!eintrag) throw new GameRuleError('Auf diesem Bankplatz sitzt kein Cheerleader.');
  const { cardId, kraft } = eintrag;
  if (kraft.wirkung.kind === 'wahl' && action.choice !== 'A' && action.choice !== 'B') {
    throw new GameRuleError(`${kraft.name} verlangt eine Wahl zwischen A und B.`);
  }

  // Fenster VOR der Wirkung schließen: die Wirkung darf ein neues öffnen.
  state.reaktion = null;
  state.active = fortsetzenMit;

  // Reihenfolge ist der Replay-Vertrag: erst der Bankplatz leert sich, dann
  // wirkt die Kraft, dann erst folgen Schaden, Rettung und Tode.
  state.players[player].cheerleaders[action.slot] = null;
  // Kartenname statt cardId: Log-Zeilen sieht der Spieler.
  const anzeigeName = data.cardsById[cardId]?.name ?? cardId;
  log(state, `Spieler ${player + 1} opfert ${anzeigeName} von der Bank.`, {
    kind: 'cheerleaderSacrifice',
    owner: player,
    slot: action.slot,
    cardId
  });
  log(state, `Superkraft: ${kraft.name}!`, {
    kind: 'cheerleaderPower',
    owner: player,
    cardId,
    kraft: kraft.name,
    wirkung: kraft.wirkung.kind,
    ...(kraft.wirkung.kind === 'wahl' ? { wahl: action.choice } : {})
  });
  zaehleCheerleader(state, player, cardId, 'geopfert');
  fuehreWirkungAus(wirkungsKontext(state, reaktion, cardId), kraft.wirkung, action.choice);
  // Die Kraft kann Kreaturen getötet oder geheilt haben – in beiden Fällen muss
  // das Feld neu stabilisiert werden, bevor es normal weitergeht.
  state.aufloesung.unshift({ art: 'todeStabilisieren' });
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
  data: GameData,
  random: () => number = Math.random
): GameState {
  if (state.phase === 'ended') {
    throw new GameRuleError('Die Partie ist bereits beendet.');
  }
  const next = structuredClone(state);
  // Verteidigung gegen Zustände aus älteren Persistenz-Ständen, die diese
  // Felder noch nicht kannten (der Server migriert sie ebenfalls, siehe dort).
  next.aufloesung ??= [];
  next.reaktion ??= null;
  next.naechsteReaktionsId ??= 1;

  if (next.reaktion) {
    // Ein offenes Fenster sperrt JEDE andere Aktion – auch die des Gegners.
    if (action.type !== 'cheerleaderReaction') {
      throw new GameRuleError('Es wartet eine Cheerleader-Reaktion – bitte zuerst entscheiden.');
    }
    reaktionsAktion(next, player, action, data);
  } else if (action.type === 'cheerleaderReaction') {
    throw new GameRuleError('Gerade wartet keine Cheerleader-Reaktion.');
  } else if (next.aufloesung.length > 0) {
    // Sollte nicht vorkommen: applyAction endet immer mit leerer Warteschlange
    // oder offenem Fenster. Lieber laut scheitern als still Züge verschlucken.
    throw new GameRuleError('Die Auflösung läuft noch – bitte kurz warten.');
  } else if (next.phase === 'mulligan') {
    if (action.type !== 'mulligan') throw new GameRuleError('Bitte zuerst den Mulligan bestätigen.');
    mulliganAction(next, player, action, data, random);
  } else if (next.phase === 'play' || next.phase === 'precombat') {
    playPhaseAction(next, player, action, data);
  } else {
    flyPhaseAction(next, player, action);
  }

  fahreAufloesungFort(next, data);
  // Sicherheitsnetz: resolveCombat prüft checkBaseDestroyed nur innerhalb der
  // Kampfphase. Basisschaden AUSSERHALB des Kampfes (z. B. sturzflug/experiment
  // beim Ausspielen) konnte die Basis bisher auf ≤0 senken, ohne die Partie zu
  // beenden. Nur aufrufen, wenn noch nicht beendet – sonst würde die bereits
  // geloggte Sieg-Meldung doppelt erscheinen.
  if (next.phase !== 'ended') {
    checkBaseDestroyed(next);
  }
  return next;
}

// ---------------------------------------------------------------- Client-Sicht

/**
 * Baut die client-spezifische Sicht: eigene Hand offen, gegnerische Hand nur
 * als Anzahl. Der komplette Serverzustand verlässt den Server NIE ungefiltert.
 */
export function buildClientView(state: GameState, player: PlayerIndex, data: GameData): ClientView {
  const hiddenGravestone = (creature: Creature): CreatureView => ({
    uid: creature.uid,
    cardId: 'hidden:gravestone',
    name: 'Grabstein',
    keywords: ['gravestone'],
    abilities: [],
    poison: 0,
    attack: 0,
    baseAttack: 0,
    health: 1,
    maxHealth: 1,
    baseMaxHealth: 1,
    exhausted: true,
    canFly: false,
    text: 'Wird vor dem Kampf aufgedeckt.',
    faceDown: true
  });

  const creatureView = (owner: PlayerIndex, lane: number): CreatureView | null => {
    const c = state.board[owner][lane];
    if (!c) return null;
    if (c.faceDown && owner !== player) {
      return hiddenGravestone(c);
    }
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
      text: cardDef?.text ?? (c.isToken ? 'Token' : undefined),
      faceDown: c.faceDown
    };
  };

  const teamCreatureView = (owner: PlayerIndex, lane: number): CreatureView | null => {
    const creature = state.teamBoard?.[owner]?.[lane];
    if (!creature) return null;
    if (creature.faceDown && owner !== player) return hiddenGravestone(creature);
    const card = data.cardsById[creature.cardId];
    return {
      uid: creature.uid,
      cardId: creature.cardId,
      name: creature.name,
      keywords: creature.keywords,
      abilities: creature.abilities,
      poison: creature.poison,
      attack: rearTeamAttack(state, owner, lane, creature),
      baseAttack: creature.baseAttack,
      health: creature.currentHealth,
      maxHealth: rearTeamMaxHealth(creature),
      baseMaxHealth: creature.baseMaxHealth,
      exhausted: creature.exhausted,
      canFly: false,
      projectile: card?.type === 'creature' ? card.projectile : undefined,
      text: card?.text,
      faceDown: creature.faceDown
    };
  };

  const publicView = (idx: PlayerIndex) => ({
    faction: state.players[idx].faction,
    championId: state.players[idx].championId,
    classes: state.players[idx].classes,
    deckName: state.players[idx].deckName,
    cheerleaders: [...state.players[idx].cheerleaders] as CheerleaderSlots,
    base: state.players[idx].base,
    energy: state.players[idx].energy,
    deckCount: state.players[idx].deck.length,
    handCount: state.players[idx].hand.length,
    flyDone: state.players[idx].flyDone,
    mulliganDone: state.players[idx].mulliganDone,
    // Schildstand ist öffentlich – wie das Basis-Leben auch.
    schild: state.players[idx].schild,
    basisImmun: state.players[idx].basisImmun,
    blocksRemaining: state.players[idx].blocksRemaining
  });

  const reactionOffers = (): ReaktionsAngebot[] => {
    if (!state.reaktion) return [];
    const owner = state.reaktion.spieler;
    const powers = state.players[owner].cheerleaderPowers;
    if (!powers) return angebote(state, state.reaktion);
    const offers: ReaktionsAngebot[] = [];
    for (const slot of state.reaktion.slots) {
      const carrierId = state.players[owner].cheerleaders[slot];
      const powerId = powers[slot];
      const power = powerId ? data.cardsById[powerId] : undefined;
      if (!carrierId || !power || power.type !== 'superpower') continue;
      offers.push({
        slot,
        cardId: carrierId,
        traeger: data.cardsById[carrierId]?.name ?? carrierId,
        kraft: power.name,
        text: power.text ?? 'Champ-Superkraft'
      });
    }
    return offers;
  };

  return {
    you: player,
    round: state.round,
    roundLimit: state.config.roundLimit,
    lanes: state.config.lanes,
    // Startleben der Basis: Bezugswert für den Lebensbalken im Client.
    baseMax: state.config.baseHealth,
    // 0 = Schild-Regel in der Config abgeschaltet, der Client blendet sie dann aus.
    schildAbschnitte: state.config.schild?.abschnitte ?? 0,
    // Energie ist rundenbasiert (ggf. ungedeckelt): der Client zeigt die
    // Rundenenergie als "Cap" an (⚡ n/n).
    energyCap: roundEnergy(state.config, state.round),
    phase: state.phase,
    active: state.active,
    winner: state.winner,
    players: [publicView(0), publicView(1)],
    hand: state.players[player].hand.map((id) => {
      const card = data.cardsById[id];
      if (card.type === 'superpower' && state.players[player].freeSuperpowerId === id) {
        return { ...card, cost: 0 };
      }
      return card;
    }),
    board: [
      state.board[0].map((_, lane) => creatureView(0, lane)),
      state.board[1].map((_, lane) => creatureView(1, lane))
    ],
    teamBoard: [
      (state.teamBoard?.[0] ?? []).map((_, lane) => teamCreatureView(0, lane)),
      (state.teamBoard?.[1] ?? []).map((_, lane) => teamCreatureView(1, lane))
    ],
    environments: (state.environments ?? []).map((environment) => {
      if (!environment) return null;
      const card = data.cardsById[environment.cardId];
      return { cardId: environment.cardId, owner: environment.owner, name: card?.name ?? environment.cardId, text: card?.text };
    }),
    laneKinds: ['height', 'ground', 'ground', 'ground', 'water'],
    log: state.log.slice(-60),
    ...(state.winner !== null ? { matchSummary: matchSummary(state) } : {}),
    // Der Gegner erfährt DASS gewartet wird, aber nicht, welche Optionen der
    // andere hat – `angebote` bleibt für ihn leer.
    ...(state.reaktion
      ? {
          reaktion: {
            id: state.reaktion.id,
            spieler: state.reaktion.spieler,
            ausloeser: state.reaktion.ausloeser,
            angebote: state.reaktion.spieler === player ? reactionOffers() : []
          }
        }
      : {})
  };
}
