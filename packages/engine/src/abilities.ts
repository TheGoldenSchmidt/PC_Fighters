// Fähigkeiten-Registry: das parametrisierte Gegenstück zur Keyword-Registry.
// Karten referenzieren Primitive über `abilities` (siehe types.ts `Ability`);
// die gesamte Semantik lebt zentral hier bzw. in internal.ts (Werte-Berechnung).
// Ein neues Primitiv = ein neuer Union-Zweig in `Ability`, ein Eintrag in ABILITIES
// (Anzeige) und – je nach Auslöser – ein Fall in den Dispatch-Funktionen unten.

import { matchesScope } from './factions.js';
import {
  freeLanes,
  getEffectiveAttack,
  getMaxHealth,
  log,
  makeTokenCreature,
  otherPlayer
} from './internal.js';
import type { DeathInfo } from './internal.js';
import { zaehleKarte, zaehleSpieler } from './stats.js';
import type { Ability, Creature, GameState, PlayerIndex, Scope, TokenDef } from './types.js';

/** Anzeige-Infos je Primitiv (wird u. a. an den Client relayed). */
export const ABILITIES: Record<Ability['kind'], { label: string; description: string }> = {
  skalierung: { label: 'Skalierung', description: 'Wird pro verbündeter Kreatur im Wirkungsbereich stärker.' },
  aura: { label: 'Aura', description: 'Verstärkt verbündete Kreaturen – dauerhaft oder als einmaliger Puls.' },
  nachbar: { label: 'Nachbar-Effekt', description: 'Schild/Banner für Nachbarn oder fängt einen tödlichen Treffer ab.' },
  heilung: { label: 'Heilung', description: 'Heilt am Rundenende Nachbarn oder den ganzen Wirkungsbereich.' },
  wachstum: { label: 'Rundenwachstum', description: 'Wird zu Beginn jeder Runde dauerhaft stärker.' },
  verstaerker: { label: 'Verstärker', description: 'Verdoppelt/verstärkt das Rundenwachstum verbündeter Karten.' },
  rettung: { label: 'Todes-Rettung', description: 'Überlebt den ersten tödlichen Treffer einmal pro Spiel.' },
  ueberstunden: { label: 'Überstunden', description: 'Einmalig stärker, wenn die Karte eine volle Runde überlebt.' },
  werkzeug: { label: 'Werkzeug', description: 'Gibt einer verbündeten Karte +ATK; springt beim Tod weiter.' },
  improvisation: { label: 'Improvisation', description: 'Stärker abhängig von der eigenen Basis-HP.' },
  sammeln: { label: 'Sammeln', description: 'Wird dauerhaft stärker, wenn eine Kreatur stirbt.' },
  lernen: { label: 'Lernen', description: 'Zieht Karten.' },
  wissen: { label: 'Wissen', description: 'Erzeugt Wissens-Marker im spielweiten Pool.' },
  experiment: { label: 'Experiment', description: 'Verbraucht Wissens-Marker; Effekt skaliert mit der Anzahl.' },
  neugier: { label: 'Neugier', description: 'Bonus, solange die Karte allein in ihrer Lane steht.' },
  umverteilung: { label: 'Umverteilung', description: 'Senkt beim Ausspielen die ATK von Gegnern (oder setzt Gift).' },
  kaltbluetig: { label: 'Kaltblütig', description: '+X/+Y, solange die Karte nicht angegriffen hat.' },
  dornen: { label: 'Dornen', description: 'Fügt Angreifern Schaden zu.' },
  sturzflug: { label: 'Sturzflug', description: 'Beim Ausspielen Schaden auf ein Ziel.' },
  wucht: { label: 'Wucht', description: 'Überschussschaden im Kampf trifft die gegnerische Basis.' },
  urgewalt: { label: 'Urgewalt', description: 'Immun gegen Zerstörung; nur im Kampf besiegbar.' },
  gift: { label: 'Gift', description: 'Setzt Giftmarken – Zermürbung über mehrere Runden.' },
  beschwoeren: { label: 'Beschwören', description: 'Erzeugt Token (beim Ausspielen oder beim Tod).' },
  entwaffnen: { label: 'Entwaffnen', description: 'Ein Gegner verliert angegebene Keywords.' },
  todesfluch: { label: 'Todesfluch', description: 'Beim Tod: der Angreifer verliert ATK.' },
  hinrichten: { label: 'Hinrichten', description: 'Beim Angriff: zerstört einen schwachen Gegner.' }
};

export const ABILITY_KINDS = Object.keys(ABILITIES) as Ability['kind'][];

// ---------------------------------------------------------------- kleine Helfer

export function getAbility<K extends Ability['kind']>(
  c: Creature,
  kind: K
): Extract<Ability, { kind: K }> | undefined {
  return c.abilities.find((a) => a.kind === kind) as Extract<Ability, { kind: K }> | undefined;
}

/**
 * Wie `getAbility`, aber liefert ALLE Vorkommen einer `kind` auf der Karte.
 * `getAbility` gibt nur das erste zurück – hat eine Karte dieselbe Fähigkeit
 * mehrfach (z. B. zwei `gift`-Einträge), stapelt sie mit `getAbility` still
 * nicht. Aufrufer, die Boni/Schaden aus mehreren gleichartigen Fähigkeiten
 * aufsummieren wollen, iterieren über das Ergebnis dieser Funktion.
 */
export function getAbilities<K extends Ability['kind']>(
  c: Creature,
  kind: K
): Extract<Ability, { kind: K }>[] {
  return c.abilities.filter((a) => a.kind === kind) as Extract<Ability, { kind: K }>[];
}

export function hasAbility(c: Creature, kind: Ability['kind']): boolean {
  return c.abilities.some((a) => a.kind === kind);
}

/** Immun gegen Zerstörungs-/Entfernungseffekte (nicht gegen Kampfschaden). */
export function isUnremovable(c: Creature): boolean {
  return hasAbility(c, 'urgewalt');
}

function draw(state: GameState, player: PlayerIndex, n: number): void {
  for (let i = 0; i < n; i++) {
    const card = state.players[player].deck.shift();
    if (!card) return;
    state.players[player].hand.push(card);
    zaehleSpieler(state, player, 'kartenGezogen');
  }
}

function summonTokens(
  state: GameState,
  owner: PlayerIndex,
  count: number,
  token: TokenDef,
  faction: string
): void {
  const lanes = freeLanes(state, owner);
  const n = Math.min(count, lanes.length);
  for (let i = 0; i < n; i++) {
    const creature = makeTokenCreature(state, faction, token);
    state.board[owner][lanes[i]] = creature;
    log(state, `${token.name} (${token.attack}/${token.health}) erscheint in Lane ${lanes[i] + 1}.`, {
      kind: 'spell',
      lane: lanes[i],
      effect: 'summon',
      faction
    });
  }
}

/** Ziel-Lane für einen Einzeleffekt auf einen Gegner: gleiche Lane bevorzugt, sonst erster Gegner. */
function pickEnemyLane(state: GameState, enemy: PlayerIndex, preferredLane: number): number {
  if (state.board[enemy][preferredLane]) return preferredLane;
  for (let j = 0; j < state.board[enemy].length; j++) {
    if (state.board[enemy][j]) return j;
  }
  return -1;
}

// ---------------------------------------------------------------- Beim Ausspielen

function applySturzflug(
  state: GameState,
  owner: PlayerIndex,
  lane: number,
  ab: Extract<Ability, { kind: 'sturzflug' }>
): void {
  const c = state.board[owner][lane]!;
  const enemy = otherPlayer(owner);
  const tLane = pickEnemyLane(state, enemy, lane);
  if (tLane >= 0) {
    const target = state.board[enemy][tLane]!;
    target.currentHealth -= ab.x;
    target.letzterSchaden = { art: 'effekt', quelle: c.cardId, owner };
    zaehleKarte(state, owner, c.cardId, 'schadenKreatur', ab.x);
    log(state, `${c.name}: Sturzflug trifft ${target.name} für ${ab.x}.`, {
      kind: 'spell',
      lane: tLane,
      effect: 'attackBuff',
      faction: c.faction
    });
  } else {
    state.players[enemy].base -= ab.x;
    zaehleKarte(state, owner, c.cardId, 'schadenBasis', ab.x);
    log(state, `${c.name}: Sturzflug trifft die gegnerische Basis für ${ab.x}.`);
  }
}

function applyEntwaffnen(
  state: GameState,
  owner: PlayerIndex,
  lane: number,
  ab: Extract<Ability, { kind: 'entwaffnen' }>
): void {
  const c = state.board[owner][lane]!;
  const enemy = otherPlayer(owner);
  const tLane = pickEnemyLane(state, enemy, lane);
  if (tLane >= 0) {
    const target = state.board[enemy][tLane]!;
    target.keywords = target.keywords.filter((k) => !ab.entfernt.includes(k));
    log(state, `${c.name}: ${target.name} verliert ${ab.entfernt.join('/')}.`);
  }
}

function applyWachstum(
  state: GameState,
  owner: PlayerIndex,
  lane: number,
  ab: Extract<Ability, { kind: 'wachstum' }>
): void {
  const c = state.board[owner][lane]!;
  const mult = wachstumMultiplier(state, owner, c);
  const atk = ab.per_round.atk * mult;
  const hp = ab.per_round.hp * mult;
  if (ab.ziel === 'verbuendeter') {
    const tLane = firstScopeAlly(state, owner, lane, ab.scope ?? 'same_sub');
    const target = tLane >= 0 ? state.board[owner][tLane] : null;
    if (target) {
      target.permAttackBonus += atk;
      target.permHealthBonus += hp;
      zaehleSpieler(state, owner, 'wachstumAtk', atk);
      zaehleSpieler(state, owner, 'wachstumHp', hp);
      log(state, `${c.name}: ${target.name} wächst um +${atk}/+${hp}.`);
    }
  } else {
    c.permAttackBonus += atk;
    c.permHealthBonus += hp;
    zaehleSpieler(state, owner, 'wachstumAtk', atk);
    zaehleSpieler(state, owner, 'wachstumHp', hp);
  }
}

function applyUeberstunden(
  state: GameState,
  owner: PlayerIndex,
  lane: number,
  ab: Extract<Ability, { kind: 'ueberstunden' }>
): void {
  const c = state.board[owner][lane]!;
  if (c.ueberstundenDone || state.round <= c.spawnRound) return;
  c.permAttackBonus += ab.bonus.atk;
  c.permHealthBonus += ab.bonus.hp;
  c.ueberstundenDone = true;
  log(state, `${c.name}: Überstunden +${ab.bonus.atk}/+${ab.bonus.hp}.`);
}

interface KlasseBHooks<K extends Ability['kind']> {
  /** Beim Ausspielen (nach dem Platzieren auf dem Feld). */
  onPlay?: (state: GameState, owner: PlayerIndex, lane: number, ab: Extract<Ability, { kind: K }>) => void;
  /** Zu Beginn jeder Runde des Besitzers. */
  onRoundStart?: (state: GameState, owner: PlayerIndex, lane: number, ab: Extract<Ability, { kind: K }>) => void;
  /** Am Ende jeder Runde des Besitzers. */
  onRoundEnd?: (state: GameState, owner: PlayerIndex, lane: number, ab: Extract<Ability, { kind: K }>) => void;
}

/**
 * "Klasse B": imperative Zeitpunkt-Hooks für Fähigkeiten, die EINE Kreatur
 * auf EIN eigenes Ereignis reagieren lässt (Ausspielen/Rundenbeginn/
 * Rundenende), mit fixer äußerer Iteration (Brett-Reihenfolge). Analog zu
 * KLASSE_A_HOOKS in abilityHooks.ts, aber hier (statt dort), weil diese
 * Hooks Helfer aus internal.ts brauchen (log, makeTokenCreature, freeLanes,
 * getEffectiveAttack, getMaxHealth) – abilityHooks.ts darf internal.ts NICHT
 * importieren (Zirkelimport, siehe dortiger Kommentar).
 *
 * NICHT hier: `sammeln` (reagiert auf JEDEN Tod, nicht nur den eigenen –
 * zwei verschachtelte Kreatur-Schleifen statt "eine Kreatur, ein Ereignis"),
 * `todesfluch`/`beschwoeren(beim_tod)` (Beim-Tod-Reihenfolge ist an
 * onDeathTriggers' Doppel-Schleife gebunden), Gift/Hinrichten/Rettung/
 * Schutz/Wachstums-Verstärker/Kampf-Interna (kartenübergreifende Ordnung).
 */
const KLASSE_B_HOOKS: { [K in Ability['kind']]?: KlasseBHooks<K> } = {
  sturzflug: { onPlay: applySturzflug },
  lernen: {
    onPlay: (state, owner, _lane, ab) => {
      if (!ab.proRunde) draw(state, owner, ab.n);
    },
    onRoundStart: (state, owner, _lane, ab) => {
      if (ab.proRunde) draw(state, owner, ab.n);
    }
  },
  wissen: {
    onPlay: (state, owner, lane, ab) => {
      if (ab.proRunde) return;
      state.players[owner].knowledge += ab.x;
      const c = state.board[owner][lane]!;
      log(state, `${c.name}: +${ab.x} Wissen (Pool: ${state.players[owner].knowledge}).`);
    },
    onRoundStart: (state, owner, _lane, ab) => {
      if (ab.proRunde) state.players[owner].knowledge += ab.x;
    }
  },
  aura: {
    onPlay: (state, owner, lane, ab) => {
      if (ab.timing === 'einmal_beim_ausspielen') pulseAura(state, owner, lane, ab);
    }
  },
  umverteilung: { onPlay: applyUmverteilung },
  beschwoeren: {
    onPlay: (state, owner, lane, ab) => {
      if (ab.timing !== 'beim_ausspielen') return;
      const c = state.board[owner][lane]!;
      summonTokens(state, owner, ab.count, ab.token, c.faction);
    }
  },
  entwaffnen: { onPlay: applyEntwaffnen },
  experiment: { onPlay: applyExperiment },
  wachstum: { onRoundStart: applyWachstum },
  heilung: { onRoundEnd: applyHeilung },
  ueberstunden: { onRoundEnd: applyUeberstunden }
};

/** Ruft für jede Fähigkeit einer Kreatur den passenden Klasse-B-Hook auf (No-Op, wenn keiner registriert ist). */
function rufeKlasseBHook(
  zeitpunkt: 'onPlay' | 'onRoundStart' | 'onRoundEnd',
  state: GameState,
  owner: PlayerIndex,
  lane: number,
  c: Creature
): void {
  for (const ab of c.abilities) {
    const hook = KLASSE_B_HOOKS[ab.kind]?.[zeitpunkt];
    if (hook) (hook as (s: GameState, o: PlayerIndex, l: number, a: Ability) => void)(state, owner, lane, ab);
  }
}

export function onPlayAbilities(state: GameState, owner: PlayerIndex, lane: number): void {
  const c = state.board[owner][lane];
  if (!c) return;
  rufeKlasseBHook('onPlay', state, owner, lane, c);
}

function pulseAura(
  state: GameState,
  owner: PlayerIndex,
  lane: number,
  ab: Extract<Ability, { kind: 'aura' }>
): void {
  const source = state.board[owner][lane];
  if (!source) return;
  state.board[owner].forEach((t, i) => {
    if (!t || i === lane) return;
    if (matchesScope(state.factionTree, ab.scope, source.faction, t.faction)) {
      t.permAttackBonus += ab.buff.atk;
      t.permHealthBonus += ab.buff.hp;
    }
  });
  log(state, `${source.name}: Puls +${ab.buff.atk}/+${ab.buff.hp} für Verbündete.`);
}

function applyUmverteilung(
  state: GameState,
  owner: PlayerIndex,
  lane: number,
  ab: Extract<Ability, { kind: 'umverteilung' }>
): void {
  const enemy = otherPlayer(owner);
  const art = ab.art ?? 'atk';
  const schwelle = ab.schwelle ?? 0;

  const candidates: number[] = [];
  for (let j = 0; j < state.board[enemy].length; j++) {
    const e = state.board[enemy][j];
    if (!e) continue;
    if (art === 'atk' && getEffectiveAttack(state, enemy, j) < schwelle) continue;
    candidates.push(j);
  }
  if (candidates.length === 0) return;

  let targets = candidates;
  if (ab.ziel === 'einer') {
    if (art === 'gift') {
      targets = [candidates.includes(lane) ? lane : candidates[0]];
    } else {
      // stärkster Gegner
      let best = candidates[0];
      for (const j of candidates) {
        if (getEffectiveAttack(state, enemy, j) > getEffectiveAttack(state, enemy, best)) best = j;
      }
      targets = [best];
    }
  }

  for (const j of targets) {
    const e = state.board[enemy][j]!;
    if (art === 'gift') {
      e.poison += ab.menge;
      log(state, `${state.board[owner][lane]?.name}: ${e.name} erhält ${ab.menge} Gift.`);
    } else if (ab.dauer === 'dauerhaft') {
      e.permAttackBonus -= ab.menge;
      log(state, `${state.board[owner][lane]?.name}: ${e.name} verliert dauerhaft ${ab.menge} ATK.`);
    } else {
      e.tempAttackBonus -= ab.menge;
      log(state, `${state.board[owner][lane]?.name}: ${e.name} verliert diese Runde ${ab.menge} ATK.`);
    }
  }
}

function applyExperiment(
  state: GameState,
  owner: PlayerIndex,
  lane: number,
  ab: Extract<Ability, { kind: 'experiment' }>
): void {
  const c = state.board[owner][lane];
  if (!c) return;
  const markers = state.players[owner].knowledge;
  if (markers <= 0) return;

  if (ab.proMarker) {
    c.permAttackBonus += markers * ab.proMarker.atk;
    c.permHealthBonus += markers * ab.proMarker.hp;
    log(state, `${c.name}: +${markers * ab.proMarker.atk}/+${markers * ab.proMarker.hp} aus ${markers} Wissen.`);
  }
  if (ab.schadenProMarker) {
    const enemy = otherPlayer(owner);
    const gesamt = markers * ab.schadenProMarker;
    let total = gesamt;
    const liveLanes: number[] = [];
    for (let j = 0; j < state.board[enemy].length; j++) if (state.board[enemy][j]) liveLanes.push(j);
    if (liveLanes.length === 0) {
      state.players[enemy].base -= total;
      zaehleKarte(state, owner, c.cardId, 'schadenBasis', total);
    } else {
      let i = 0;
      while (total > 0) {
        const t = state.board[enemy][liveLanes[i % liveLanes.length]];
        if (t) {
          t.currentHealth -= 1;
          t.letzterSchaden = { art: 'effekt', quelle: c.cardId, owner };
        }
        total -= 1;
        i += 1;
      }
      zaehleKarte(state, owner, c.cardId, 'schadenKreatur', gesamt);
    }
    log(state, `${c.name}: Experiment verteilt ${gesamt} Schaden.`);
  }
  state.players[owner].knowledge = 0;
}

// ---------------------------------------------------------------- Rundenbeginn

/** Verstärker-Multiplikator für das Wachstum einer bestimmten Kreatur. */
function wachstumMultiplier(state: GameState, owner: PlayerIndex, growing: Creature): number {
  let mult = 1;
  for (const s of state.board[owner]) {
    if (!s) continue;
    for (const ab of s.abilities) {
      if (ab.kind === 'verstaerker' && ab.ziel === 'wachstum') {
        if (matchesScope(state.factionTree, ab.scope, s.faction, growing.faction)) mult *= ab.faktor;
      }
    }
  }
  return mult;
}

function firstScopeAlly(
  state: GameState,
  owner: PlayerIndex,
  lane: number,
  scope: Scope
): number {
  const self = state.board[owner][lane];
  if (!self) return -1;
  for (let j = 0; j < state.board[owner].length; j++) {
    if (j === lane) continue;
    const c = state.board[owner][j];
    if (c && matchesScope(state.factionTree, scope, self.faction, c.faction)) return j;
  }
  return -1;
}

export function onRoundStartAbilities(state: GameState): void {
  for (const owner of [0, 1] as PlayerIndex[]) {
    state.board[owner].forEach((c, lane) => {
      if (!c) return;
      rufeKlasseBHook('onRoundStart', state, owner, lane, c);
    });
  }
}

// ---------------------------------------------------------------- Rundenende

export function onRoundEndAbilities(state: GameState): void {
  for (const owner of [0, 1] as PlayerIndex[]) {
    state.board[owner].forEach((c, lane) => {
      if (!c) return;
      rufeKlasseBHook('onRoundEnd', state, owner, lane, c);
    });
  }
}

function applyHeilung(
  state: GameState,
  owner: PlayerIndex,
  lane: number,
  ab: Extract<Ability, { kind: 'heilung' }>
): void {
  const source = state.board[owner][lane];
  if (!source) return;
  const amount =
    ab.mehrWennBasisUnter && state.players[owner].base <= ab.mehrWennBasisUnter.schwelle
      ? ab.mehrWennBasisUnter.amount
      : ab.amount;

  const targetLanes: number[] =
    ab.reichweite === 'nachbarn'
      ? [lane - 1, lane + 1]
      : state.board[owner].map((_, i) => i);

  for (const tLane of targetLanes) {
    const t = state.board[owner]?.[tLane];
    if (!t) continue;
    if (!matchesScope(state.factionTree, ab.scope, source.faction, t.faction)) continue;
    const max = getMaxHealth(state, owner, tLane);
    if (t.currentHealth < max) {
      const vorher = t.currentHealth;
      t.currentHealth = Math.min(max, t.currentHealth + amount);
      const geheilt = t.currentHealth - vorher;
      zaehleKarte(state, owner, source.cardId, 'geheilt', geheilt);
      zaehleSpieler(state, owner, 'heilung', geheilt);
      log(state, `${source.name} heilt ${t.name} um ${amount}.`);
    }
  }
}

// ---------------------------------------------------------------- Beim Tod

/** Reagiert auf gesammelte Todesfälle: todesfluch, beschwoeren(tod), sammeln. */
export function onDeathTriggers(state: GameState, deaths: DeathInfo[]): void {
  for (const d of deaths) {
    const dead = d.creature;
    // Mehrere todesfluch-Einträge auf derselben Karte stapeln (getAbility gäbe
    // nur den ersten zurück).
    for (const tf of getAbilities(dead, 'todesfluch')) {
      const enemy = otherPlayer(d.owner);
      const attacker = state.board[enemy][d.lane];
      if (attacker) {
        attacker.permAttackBonus -= tf.atk;
        log(state, `${dead.name} (Todesfluch): ${attacker.name} verliert ${tf.atk} ATK.`);
      }
    }
    for (const ab of dead.abilities) {
      if (ab.kind === 'beschwoeren' && ab.timing === 'beim_tod') {
        summonTokens(state, d.owner, ab.count, ab.token, dead.faction);
      }
    }
  }

  // sammeln: lebende Kreaturen reagieren auf jeden Tod (trigger-abhängig);
  // mehrere sammeln-Einträge auf derselben Karte stapeln.
  for (const d of deaths) {
    for (const owner of [0, 1] as PlayerIndex[]) {
      for (const c of state.board[owner]) {
        if (!c) continue;
        for (const sm of getAbilities(c, 'sammeln')) {
          const isOwn = d.owner === owner;
          const match =
            sm.trigger === 'any' || (sm.trigger === 'own' && isOwn) || (sm.trigger === 'enemy' && !isOwn);
          if (match) {
            c.permAttackBonus += sm.bonus.atk;
            c.permHealthBonus += sm.bonus.hp;
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------- Kampf-Helfer

/** Gift-Zermürbung am Kampfende: jede Marke macht 1 Schaden, Marken bleiben bestehen. */
export function resolvePoison(state: GameState): void {
  for (const owner of [0, 1] as PlayerIndex[]) {
    for (const c of state.board[owner]) {
      if (!c || c.poison <= 0) continue;
      c.currentHealth -= c.poison;
      // Poison-Herkunft ist nicht mehr eindeutig einer Karte zuordenbar (Marken
      // stapeln über mehrere Runden/Angreifer) – daher ohne quelle/owner.
      c.letzterSchaden = { art: 'gift' };
      log(state, `Gift: ${c.name} nimmt ${c.poison} Schaden.`);
    }
  }
}

/** Hinrichten beim Angriff: zerstört einen (nicht immunen) Gegner mit ≤ maxHp Leben. */
export function applyHinrichten(
  state: GameState,
  attackerOwner: PlayerIndex,
  attackerLane: number,
  maxHp: number
): void {
  const enemy = otherPlayer(attackerOwner);
  const order = [attackerLane, ...state.board[enemy].map((_, i) => i).filter((i) => i !== attackerLane)];
  for (const j of order) {
    const e = state.board[enemy][j];
    // currentHealth <= 0: bereits durch eine vorherige (gestapelte) Hinrichten-
    // Fähigkeit getroffen, aber recalcBoard hat sie noch nicht entfernt – sonst
    // würde eine zweite Hinrichten-Fähigkeit dasselbe Ziel doppelt loggen.
    if (!e || isUnremovable(e) || e.currentHealth <= 0) continue;
    if (e.currentHealth <= maxHp) {
      e.currentHealth = 0;
      const attackerCard = state.board[attackerOwner][attackerLane];
      if (attackerCard) {
        e.letzterSchaden = { art: 'hinrichten', quelle: attackerCard.cardId, owner: attackerOwner };
        zaehleSpieler(state, attackerOwner, 'hinrichtungen');
      }
      log(state, `${attackerCard?.name}: Hinrichten zerstört ${e.name}.`);
      return;
    }
  }
}
