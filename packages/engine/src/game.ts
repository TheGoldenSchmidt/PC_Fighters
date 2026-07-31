// Spiellogik: reine Funktionen auf dem GameState, kein Netzwerk, kein UI.
// applyAction(state, spieler, aktion) → neuer Zustand (oder GameRuleError).

import {
  applyHinrichten,
  applyShedding,
  getAbilities,
  hasAbility,
  onDeathTriggers,
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
import { buildFactionTree, matchesScope } from './factions.js';
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
import { basisSchaden } from './schild.js';
import { registriereAusspielen, registriereEnergie, registriereMulligan, registriereZug, zaehleCheerleader, zaehleKarte, zaehleSpieler } from './stats.js';
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
  PlayerAction,
  PlayerIndex,
  PlayerState
} from './types.js';

export { GameRuleError, getEffectiveAttack, getMaxHealth };

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
      log(state, `${d.name} wird zerstört.`, { kind: 'death', lane: d.lane, owner: d.owner });
    }
    if (deaths.length > 0) onDeathTriggers(state, deaths);
    if (deaths.length === 0) return;
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
  const cards = data.cards.filter((c) => matchesScope(tree, 'same_top', c.faction, faction));
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
  const p = state.players[player];
  for (let i = 0; i < amount; i++) {
    const card = p.deck.shift();
    if (!card) return; // leeres Deck: es wird einfach nicht mehr gezogen
    p.hand.push(card);
    registriereZug(state, player);
    zaehleSpieler(state, player, 'kartenGezogen');
  }
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
    faction: string,
    deck: DeckList | null,
    selection: CheerleaderSelection
  ): PlayerState => ({
    faction,
    deckName: deck?.name,
    cheerleaders: [...selection],
    deck: deck ? buildDeckFromList(data, deck, random) : buildDeck(data, faction, random),
    hand: [],
    base: data.config.baseHealth,
    energy: 0,
    knowledge: 0,
    flyDone: false,
    mulliganDone: false,
    schild: 0,
    basisImmun: false,
    gespieltDieseRunde: []
  });

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
        cheerleaders?.[0] ?? defaultCheerleaderSelection(decks?.[0] ?? null, data)
      ),
      makePlayer(
        factions[1],
        decks?.[1] ?? null,
        cheerleaders?.[1] ?? defaultCheerleaderSelection(decks?.[1] ?? null, data)
      )
    ],
    board: [
      Array.from({ length: data.config.lanes }, () => null),
      Array.from({ length: data.config.lanes }, () => null)
    ],
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
  return state;
}

/** Einmaliger Mulligan: erst Ersatz ziehen, dann abgelegte Karten zurückmischen. */
function mulliganAction(
  state: GameState,
  player: PlayerIndex,
  action: Extract<PlayerAction, { type: 'mulligan' }>,
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
  if (state.players[0].mulliganDone && state.players[1].mulliganDone) startRound(state);
  else state.active = otherPlayer(player);
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
  // 2. Energie: start + (Runde-1)*perRound, optional gedeckelt – Rest verfällt.
  // Telemetrie: die noch übrige Energie aus der vorigen Runde wird gerade
  // überschrieben (Runde 1: immer 0, da PlayerState mit energy:0 startet).
  registriereEnergie(state, 0);
  registriereEnergie(state, 1);
  zaehleSpieler(state, 0, 'energieVerfallen', state.players[0].energy);
  zaehleSpieler(state, 1, 'energieVerfallen', state.players[1].energy);
  const energy = roundEnergy(state.config, state.round);
  state.players[0].energy = energy;
  state.players[1].energy = energy;

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
  for (const row of state.board) {
    for (const creature of row) {
      if (!creature) continue;
      creature.tempAttackBonus = 0;
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

function zermuerbungUndNaechsteRunde(state: GameState): void {
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
  startRound(state);
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
  const defenderIdx = otherPlayer(attackerIdx);
  defender.currentHealth -= atk;
  defender.letzterSchaden = { art: 'kampf', quelle: attacker.cardId, owner: attackerIdx };
  attacker.attackedThisRound = true;
  zaehleKarte(state, attackerIdx, attacker.cardId, 'schadenKreatur', atk);
  if (attacker.spawnRound === state.round) {
    zaehleSpieler(state, attackerIdx, 'flinkAngriffe');
    zaehleKarte(state, attackerIdx, attacker.cardId, 'flinkAngriffe');
  }
  log(state, `Lane ${lane + 1}: ${attacker.name} trifft ${defender.name} für ${atk}.`, {
    kind: 'attack',
    lane,
    attacker: attackerIdx,
    damage: atk,
    toBase: false
  });
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
      zaehleSpieler(state, attackerIdx, 'wuchtSchaden', echt);
      if (echt > 0) log(state, `Lane ${lane + 1}: Wucht! ${echt} Überschuss trifft die Basis.`);
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

    if (atkA > 0) creatureStrike(state, a, b, atkA, 0, lane);
    if (atkB > 0) creatureStrike(state, b, a, atkB, 1, lane);
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
    const echt = basisSchaden(state, 1, dmg);
    zaehleKarte(state, 0, a.cardId, 'schadenBasis', echt);
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
    const echt = basisSchaden(state, 0, dmg);
    zaehleKarte(state, 1, b.cardId, 'schadenBasis', echt);
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
function fahreAufloesungFort(state: GameState): void {
  let guard = 0;
  while (state.aufloesung.length > 0 && !state.reaktion && state.phase !== 'ended' && guard < 500) {
    guard += 1;
    const schritt = state.aufloesung.shift();
    if (!schritt) break;
    switch (schritt.art) {
      case 'kampfLane':
        kampfLane(state, schritt.lane);
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
        zermuerbungUndNaechsteRunde(state);
        break;
    }
    checkBaseDestroyed(state);
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
      log(state, '— Kampfphase —');
      state.aufloesung.push(...kampfSchritte(state));
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
    mulliganAction(next, player, action, random);
  } else if (next.phase === 'play') {
    playPhaseAction(next, player, action, data);
  } else {
    flyPhaseAction(next, player, action);
  }

  fahreAufloesungFort(next);
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
    basisImmun: state.players[idx].basisImmun
  });

  return {
    you: player,
    round: state.round,
    roundLimit: state.config.roundLimit,
    lanes: state.config.lanes,
    // 0 = Schild-Regel in der Config abgeschaltet, der Client blendet sie dann aus.
    schildAbschnitte: state.config.schild?.abschnitte ?? 0,
    // Energie ist rundenbasiert (ggf. ungedeckelt): der Client zeigt die
    // Rundenenergie als "Cap" an (⚡ n/n).
    energyCap: roundEnergy(state.config, state.round),
    phase: state.phase,
    active: state.active,
    winner: state.winner,
    players: [publicView(0), publicView(1)],
    hand: state.players[player].hand.map((id) => data.cardsById[id]),
    board: [
      state.board[0].map((_, lane) => creatureView(0, lane)),
      state.board[1].map((_, lane) => creatureView(1, lane))
    ],
    log: state.log.slice(-60),
    // Der Gegner erfährt DASS gewartet wird, aber nicht, welche Optionen der
    // andere hat – `angebote` bleibt für ihn leer.
    ...(state.reaktion
      ? {
          reaktion: {
            id: state.reaktion.id,
            spieler: state.reaktion.spieler,
            ausloeser: state.reaktion.ausloeser,
            angebote: state.reaktion.spieler === player ? angebote(state, state.reaktion) : []
          }
        }
      : {})
  };
}
