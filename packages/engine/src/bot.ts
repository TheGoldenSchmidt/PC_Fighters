// Heuristik-Bot für den Backtest: zählt alle legalen Züge auf (legal.ts) und
// bewertet den jeweils resultierenden Zustand KARTENBLIND – die Bewertung
// kennt keine Karten-IDs, nur Effektivwerte (getEffectiveAttack/getMaxHealth).
// Dadurch "versteht" der Bot Auren/Skalierungen automatisch (die Engine
// rechnet sie in die Effektivwerte ein), ohne Kartenwissen im Bot zu brauchen –
// das gilt automatisch auch für jede neue Karte, ohne Bot-Änderung.

import { applyAction } from './game.js';
import { getEffectiveAttack, getMaxHealth, otherPlayer } from './internal.js';
import { legaleAktionen } from './legal.js';
import type { GameData, GameState, PlayerAction, PlayerIndex } from './types.js';

export interface BotGewichte {
  /** Basis-HP-Differenz (Ich - Gegner). */
  basis: number;
  /** Brettwert-Differenz: Summe aus effektivem Angriff + aktuellem Leben je Kreatur. */
  brett: number;
  /** Handkarten-Differenz. */
  hand: number;
  /** Wissens-Pool-Differenz. */
  wissen: number;
  /** Gewicht der Kampf-Prognose (siehe kampfprognose()). */
  kampf: number;
  /** Strafe je Punkt ungenutzter Energie (Anreiz, Energie auszugeben). */
  energieVerfall: number;
  /**
   * Wert eines noch besetzten Bankplatzes (Differenz Ich - Gegner).
   *
   * Seit die Bank der Schild IST, ist ein Bankplatz doppelt wertvoll: Er ist
   * die Kraft, die man einlösen kann, UND die Bedingung dafür, dass der Schild
   * überhaupt noch lädt. Beim Schild-Block ist ein Opfer allerdings Pflicht –
   * dieses Gewicht steuert dann nur noch, WIE teuer der Bot den Verlust
   * empfindet, nicht mehr OB er opfert.
   */
  bank: number;
}

export interface BotProfil {
  name: string;
  gewichte: BotGewichte;
  /** Zufalls-Bot: ignoriert jede Bewertung, zieht gleichverteilt aus den legalen Zügen. */
  zufall?: boolean;
  /** Score-Band um den Bestwert, in dem gleichverteilt gezogen wird (Varianz für Backtests). 0 = immer der beste Zug. */
  epsilonBand: number;
}

export interface BotSuchGrenzen {
  maxActionsPerTurn: number;
  maxBranchesPerDecision: number;
}

export const STANDARD_SUCHGRENZEN: BotSuchGrenzen = {
  maxActionsPerTurn: 3,
  maxBranchesPerDecision: 12
};

export const BOT_PROFILE: Record<string, BotProfil> = {
  ausgewogen: {
    name: 'ausgewogen',
    gewichte: { basis: 3, brett: 1, hand: 0.5, wissen: 0.2, kampf: 1, energieVerfall: 0.3, bank: 1.5 },
    epsilonBand: 0.25
  },
  aggro: {
    name: 'aggro',
    gewichte: { basis: 5, brett: 0.6, hand: 0.2, wissen: 0.1, kampf: 1.5, energieVerfall: 0.2, bank: 1 },
    epsilonBand: 0.25
  },
  kontrolle: {
    name: 'kontrolle',
    gewichte: { basis: 2, brett: 1.4, hand: 0.8, wissen: 0.3, kampf: 0.8, energieVerfall: 0.4, bank: 2 },
    epsilonBand: 0.25
  },
  zufall: {
    name: 'zufall',
    gewichte: { basis: 0, brett: 0, hand: 0, wissen: 0, kampf: 0, energieVerfall: 0, bank: 0 },
    zufall: true,
    epsilonBand: 0
  }
};

// Englische IDs aus der Balancing-Konfiguration; die historischen deutschen
// IDs bleiben fuer bestehende Skripte und Golden Master stabil.
BOT_PROFILE.standard = { ...BOT_PROFILE.ausgewogen, name: 'standard' };
BOT_PROFILE.aggressive = { ...BOT_PROFILE.aggro, name: 'aggressive' };
BOT_PROFILE.control = { ...BOT_PROFILE.kontrolle, name: 'control' };
BOT_PROFILE.random = { ...BOT_PROFILE.zufall, name: 'random' };

/**
 * Kartenblinder Mulligan für die Vierer-Starthand. Er bevorzugt eine Kurve
 * für Runde 1–3 und tauscht teure Karten sowie überzählige Duplikate.
 */
export function waehleMulligan(
  state: GameState,
  player: PlayerIndex,
  data: GameData,
  random: () => number = Math.random
): Extract<PlayerAction, { type: 'mulligan' }> {
  const hand = state.players[player].hand;
  let best = -Infinity;
  const candidates: number[][] = [];
  for (let mask = 0; mask < 1 << hand.length; mask++) {
    const kept = hand.map((id, i) => ({ id, i, card: data.cardsById[id] })).filter((_, i) => (mask & (1 << i)) === 0);
    const counts = new Map<string, number>();
    let score = 0;
    for (const { id, card } of kept) {
      const n = (counts.get(id) ?? 0) + 1; counts.set(id, n);
      score += card.cost === 1 ? 4 : card.cost === 2 ? 3 : card.cost === 3 ? 1.5 : card.cost === 0 ? 1 : -1;
      if (n > 1) score -= 1.25;
    }
    if (kept.some(({ card }) => card.type === 'creature')) score += 1;
    if ([1, 2, 3].every((cost) => kept.some(({ card }) => card.cost === cost))) score += 2;
    const discard = hand.map((_, i) => i).filter((i) => (mask & (1 << i)) !== 0);
    if (score > best) { best = score; candidates.length = 0; candidates.push(discard); }
    else if (score === best) candidates.push(discard);
  }
  return { type: 'mulligan', handIndices: candidates[Math.floor(random() * candidates.length)] };
}

const SIEG_WERT = 1_000_000_000;

/** Grober Wert einer Kreatur (für die Kampf-Prognose): Angriff + aktuelles Leben. */
function kreaturWert(state: GameState, owner: PlayerIndex, lane: number): number {
  const c = state.board[owner][lane];
  if (!c) return 0;
  return getEffectiveAttack(state, owner, lane) + c.currentHealth;
}

/**
 * Reine Kampf-Prognose (KEIN applyAction!): wie würde der bevorstehende Kampf
 * aus Sicht von `ich` ausgehen, wenn er JETZT stattfände? Notwendig, damit
 * "passen" (löst den Kampf sofort aus) und "eine Karte spielen" (der Kampf
 * steht noch bevor) auf derselben Skala bewertbar sind – siehe bewerteZustand().
 * Positiv = vorteilhaft für `ich`, negativ = nachteilig.
 */
export function kampfprognose(state: GameState, ich: PlayerIndex): number {
  if (state.phase === 'ended') return 0;
  const gegner = otherPlayer(ich);
  let wert = 0;
  for (let lane = 0; lane < state.config.lanes; lane++) {
    const eigene = state.board[ich][lane];
    const fremde = state.board[gegner][lane];
    const eigeneAtk = eigene && !eigene.exhausted ? getEffectiveAttack(state, ich, lane) : 0;
    const fremdeAtk = fremde && !fremde.exhausted ? getEffectiveAttack(state, gegner, lane) : 0;
    if (eigene && fremde) {
      if (eigeneAtk === 0 && fremdeAtk === 0) continue;
      // Simultaner Schlagabtausch (wie resolveCombat): beide treffen gleichzeitig.
      const fremdeVerlust = Math.min(eigeneAtk, getMaxHealth(state, gegner, lane));
      const eigeneVerlust = Math.min(fremdeAtk, getMaxHealth(state, ich, lane));
      const fremdeStirbt = fremdeVerlust >= fremde.currentHealth;
      const eigeneStirbt = eigeneVerlust >= eigene.currentHealth;
      wert += fremdeStirbt ? kreaturWert(state, gegner, lane) : fremdeVerlust * 0.5;
      wert -= eigeneStirbt ? kreaturWert(state, ich, lane) : eigeneVerlust * 0.5;
    } else if (eigene && !fremde && eigeneAtk > 0) {
      wert += eigeneAtk; // droht unbeantworteten Basisschaden beim Gegner
    } else if (fremde && !eigene && fremdeAtk > 0) {
      wert -= fremdeAtk; // droht unbeantworteten Basisschaden bei mir
    }
  }
  return wert;
}

/**
 * Wie viele Basis-Leben eine Runde Unverwundbarkeit ungefähr wert ist.
 * Grob der durchschnittliche Basisschaden, der in einer Runde durchkommt.
 */
const IMMUN_IN_BASISLEBEN = 2;

/**
 * Wie viele Basis-Leben ein VOLLER Schild wert ist: Er blockt einen Treffer
 * und löst zusätzlich eine Cheerleader-Kraft aus. Ein halb geladener Schild
 * zählt anteilig.
 */
const SCHILD_VOLL_IN_BASISLEBEN = 3;

/**
 * Basis-Reserve eines Spielers in Basis-Leben: das nackte Leben plus das, was
 * Schild und Immunität faktisch davor abfangen.
 *
 * Ohne diese beiden Posten waere der Bot blind fuer die halbe Schild-Mechanik:
 * „Sicherer Raum" (Immunitaet) sah fuer ihn aus wie ein verschenkter
 * Bankplatz, und ein fast voller Schild war ihm nichts wert. Beides in
 * Basis-Leben auszudruecken haelt die Profile frei von neuen Gewichten – ihr
 * `basis`-Gewicht entscheidet weiterhin, wie wichtig das Ganze ist.
 */
function basisReserve(state: GameState, spieler: PlayerIndex): number {
  const p = state.players[spieler];
  let wert = p.base;
  if (p.basisImmun) wert += IMMUN_IN_BASISLEBEN;
  const cfg = state.config.schild;
  // Ohne Cheerleader auf der Bank gibt es keinen Schild – die Ladung ist dann
  // wertlos (siehe schild.ts::schildAktiv).
  const bankBesetzt = p.cheerleaders.some((c) => c !== null);
  if (cfg && bankBesetzt) {
    wert += (Math.min(p.schild, cfg.abschnitte) / cfg.abschnitte) * SCHILD_VOLL_IN_BASISLEBEN;
  }
  return wert;
}

/**
 * Kartenblinde Zustandsbewertung aus Sicht von `ich`. Kennt keine Karten-IDs –
 * nur Basis-Reserve (Leben + Schild + Immunität), Brettwert (aus
 * Effektivwerten), Handgröße, Wissen und die Kampf-Prognose. Gewinn/Verlust
 * dominiert alles andere.
 */
export function bewerteZustand(state: GameState, ich: PlayerIndex, profil: BotProfil): number {
  if (state.phase === 'ended') {
    if (state.winner === ich) return SIEG_WERT;
    if (state.winner === 'draw' || state.winner === null) return 0;
    return -SIEG_WERT;
  }
  const gegner = otherPlayer(ich);
  const p = state.players[ich];
  const g = state.players[gegner];
  const g_ = profil.gewichte;

  let brettIch = 0;
  let brettGegner = 0;
  for (let lane = 0; lane < state.config.lanes; lane++) {
    if (state.board[ich][lane]) brettIch += kreaturWert(state, ich, lane);
    if (state.board[gegner][lane]) brettGegner += kreaturWert(state, gegner, lane);
  }

  const bankIch = p.cheerleaders.filter((c) => c != null).length;
  const bankGegner = g.cheerleaders.filter((c) => c != null).length;

  return (
    g_.basis * (basisReserve(state, ich) - basisReserve(state, gegner)) +
    g_.brett * (brettIch - brettGegner) +
    g_.hand * (p.hand.length - g.hand.length) +
    g_.wissen * (p.knowledge - g.knowledge) +
    g_.bank * (bankIch - bankGegner) +
    g_.kampf * kampfprognose(state, ich) -
    g_.energieVerfall * p.energy
  );
}

/**
 * Wählt eine Aktion für `player` im aktuellen `state`. Enumeriert alle
 * legalen Züge (legal.ts), bewertet jeden resultierenden Folgezustand und
 * wählt – außer beim Zufalls-Profil – gleichverteilt unter den Zügen im
 * `epsilonBand` um den Bestwert (Varianz für Backtest-Konfidenzintervalle).
 */
export function waehleAktion(
  state: GameState,
  player: PlayerIndex,
  data: GameData,
  profil: BotProfil,
  random: () => number = Math.random
): PlayerAction {
  const kandidaten = legaleAktionen(state, player, data);
  if (profil.zufall) {
    return kandidaten[Math.floor(random() * kandidaten.length)];
  }

  let beste = -Infinity;
  const bewertet: { aktion: PlayerAction; wert: number }[] = [];
  for (const aktion of kandidaten) {
    const folge = applyAction(state, player, aktion, data);
    const wert = bewerteZustand(folge, player, profil);
    bewertet.push({ aktion, wert });
    if (wert > beste) beste = wert;
  }
  const nahAmBesten = bewertet.filter((b) => b.wert >= beste - profil.epsilonBand);
  return nahAmBesten[Math.floor(random() * nahAmBesten.length)].aktion;
}

/**
 * One-Turn-Beam-Search: plant mehrere eigene Aktionen bis Zugende, gibt aber
 * nur den ersten legalen Schritt zurueck. Nach jedem Engine-Schritt wird neu
 * geplant, sodass Reaktionen und Zufall niemals am Regelwerk vorbeilaufen.
 */
export function waehleAktionMitAktionssuche(
  state: GameState,
  player: PlayerIndex,
  data: GameData,
  profil: BotProfil,
  random: () => number = Math.random,
  grenzen: BotSuchGrenzen = STANDARD_SUCHGRENZEN
): PlayerAction {
  const direkt = legaleAktionen(state, player, data);
  if (profil.zufall || direkt.length <= 1 || grenzen.maxActionsPerTurn <= 1) {
    return waehleAktion(state, player, data, profil, random);
  }

  interface Knoten { state: GameState; folge: PlayerAction[]; wert: number }
  let frontier: Knoten[] = [{ state, folge: [], wert: bewerteZustand(state, player, profil) }];
  const kandidaten: Knoten[] = [];
  const gesehen = new Set<string>();

  for (let tiefe = 0; tiefe < grenzen.maxActionsPerTurn; tiefe++) {
    const erweitert: Knoten[] = [];
    for (const knoten of frontier) {
      for (const aktion of legaleAktionen(knoten.state, player, data)) {
        const folgeState = applyAction(knoten.state, player, aktion, data);
        const folge = [...knoten.folge, aktion];
        const wert = bewerteZustand(folgeState, player, profil);
        const next = { state: folgeState, folge, wert };
        const beendet = folgeState.phase === 'ended' || folgeState.active !== player;
        if (beendet || aktion.type === 'pass' || aktion.type === 'flyDone') {
          kandidaten.push(next);
          continue;
        }
        const key = JSON.stringify([
          folgeState.round,
          folgeState.phase,
          folgeState.active,
          folgeState.players,
          folgeState.board,
          folgeState.rngState,
          folgeState.reaktion
        ]);
        if (!gesehen.has(key)) {
          gesehen.add(key);
          erweitert.push(next);
        }
      }
    }
    erweitert.sort((a, b) => b.wert - a.wert);
    frontier = erweitert.slice(0, Math.max(1, grenzen.maxBranchesPerDecision));
    if (frontier.length === 0) break;
  }
  kandidaten.push(...frontier);
  if (kandidaten.length === 0) return waehleAktion(state, player, data, profil, random);
  const beste = Math.max(...kandidaten.map((k) => k.wert));
  const nahAmBesten = kandidaten.filter((k) => k.wert >= beste - profil.epsilonBand && k.folge.length > 0);
  return nahAmBesten[Math.floor(random() * nahAmBesten.length)].folge[0];
}
