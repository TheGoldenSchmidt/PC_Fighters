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

export function onPlayAbilities(state: GameState, owner: PlayerIndex, lane: number): void {
  const c = state.board[owner][lane];
  if (!c) return;
  const enemy = otherPlayer(owner);

  for (const ab of c.abilities) {
    switch (ab.kind) {
      case 'sturzflug': {
        const tLane = pickEnemyLane(state, enemy, lane);
        if (tLane >= 0) {
          const target = state.board[enemy][tLane]!;
          target.currentHealth -= ab.x;
          log(state, `${c.name}: Sturzflug trifft ${target.name} für ${ab.x}.`, {
            kind: 'spell',
            lane: tLane,
            effect: 'attackBuff',
            faction: c.faction
          });
        } else {
          state.players[enemy].base -= ab.x;
          log(state, `${c.name}: Sturzflug trifft die gegnerische Basis für ${ab.x}.`);
        }
        break;
      }
      case 'lernen':
        if (!ab.proRunde) draw(state, owner, ab.n);
        break;
      case 'wissen':
        if (!ab.proRunde) {
          state.players[owner].knowledge += ab.x;
          log(state, `${c.name}: +${ab.x} Wissen (Pool: ${state.players[owner].knowledge}).`);
        }
        break;
      case 'aura':
        if (ab.timing === 'einmal_beim_ausspielen') pulseAura(state, owner, lane, ab);
        break;
      case 'umverteilung':
        applyUmverteilung(state, owner, lane, ab);
        break;
      case 'beschwoeren':
        if (ab.timing === 'beim_ausspielen') summonTokens(state, owner, ab.count, ab.token, c.faction);
        break;
      case 'entwaffnen': {
        const tLane = pickEnemyLane(state, enemy, lane);
        if (tLane >= 0) {
          const target = state.board[enemy][tLane]!;
          target.keywords = target.keywords.filter((k) => !ab.entfernt.includes(k));
          log(state, `${c.name}: ${target.name} verliert ${ab.entfernt.join('/')}.`);
        }
        break;
      }
      case 'experiment':
        applyExperiment(state, owner, lane, ab);
        break;
      default:
        break;
    }
  }
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
    let total = markers * ab.schadenProMarker;
    const liveLanes: number[] = [];
    for (let j = 0; j < state.board[enemy].length; j++) if (state.board[enemy][j]) liveLanes.push(j);
    if (liveLanes.length === 0) {
      state.players[enemy].base -= total;
    } else {
      let i = 0;
      while (total > 0) {
        const t = state.board[enemy][liveLanes[i % liveLanes.length]];
        if (t) t.currentHealth -= 1;
        total -= 1;
        i += 1;
      }
    }
    log(state, `${c.name}: Experiment verteilt ${markers * ab.schadenProMarker} Schaden.`);
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
      for (const ab of c.abilities) {
        if (ab.kind === 'wachstum') {
          const mult = wachstumMultiplier(state, owner, c);
          const atk = ab.per_round.atk * mult;
          const hp = ab.per_round.hp * mult;
          if (ab.ziel === 'verbuendeter') {
            const tLane = firstScopeAlly(state, owner, lane, ab.scope ?? 'same_sub');
            const target = tLane >= 0 ? state.board[owner][tLane] : null;
            if (target) {
              target.permAttackBonus += atk;
              target.permHealthBonus += hp;
              log(state, `${c.name}: ${target.name} wächst um +${atk}/+${hp}.`);
            }
          } else {
            c.permAttackBonus += atk;
            c.permHealthBonus += hp;
          }
        } else if (ab.kind === 'lernen' && ab.proRunde) {
          draw(state, owner, ab.n);
        } else if (ab.kind === 'wissen' && ab.proRunde) {
          state.players[owner].knowledge += ab.x;
        }
      }
    });
  }
}

// ---------------------------------------------------------------- Rundenende

export function onRoundEndAbilities(state: GameState): void {
  for (const owner of [0, 1] as PlayerIndex[]) {
    state.board[owner].forEach((c, lane) => {
      if (!c) return;
      for (const ab of c.abilities) {
        if (ab.kind === 'heilung') applyHeilung(state, owner, lane, ab);
        else if (ab.kind === 'ueberstunden') {
          if (!c.ueberstundenDone && state.round > c.spawnRound) {
            c.permAttackBonus += ab.bonus.atk;
            c.permHealthBonus += ab.bonus.hp;
            c.ueberstundenDone = true;
            log(state, `${c.name}: Überstunden +${ab.bonus.atk}/+${ab.bonus.hp}.`);
          }
        }
      }
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
      t.currentHealth = Math.min(max, t.currentHealth + amount);
      log(state, `${source.name} heilt ${t.name} um ${amount}.`);
    }
  }
}

// ---------------------------------------------------------------- Beim Tod

/** Reagiert auf gesammelte Todesfälle: todesfluch, beschwoeren(tod), sammeln. */
export function onDeathTriggers(state: GameState, deaths: DeathInfo[]): void {
  for (const d of deaths) {
    const dead = d.creature;
    const tf = getAbility(dead, 'todesfluch');
    if (tf) {
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

  // sammeln: lebende Kreaturen reagieren auf jeden Tod (trigger-abhängig).
  for (const d of deaths) {
    for (const owner of [0, 1] as PlayerIndex[]) {
      for (const c of state.board[owner]) {
        if (!c) continue;
        const sm = getAbility(c, 'sammeln');
        if (!sm) continue;
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

// ---------------------------------------------------------------- Kampf-Helfer

/** Gift-Zermürbung am Kampfende: jede Marke macht 1 Schaden, Marken bleiben bestehen. */
export function resolvePoison(state: GameState): void {
  for (const owner of [0, 1] as PlayerIndex[]) {
    for (const c of state.board[owner]) {
      if (!c || c.poison <= 0) continue;
      c.currentHealth -= c.poison;
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
    if (!e || isUnremovable(e)) continue;
    if (e.currentHealth <= maxHp) {
      e.currentHealth = 0;
      log(state, `${state.board[attackerOwner][attackerLane]?.name}: Hinrichten zerstört ${e.name}.`);
      return;
    }
  }
}
