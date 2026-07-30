// Cheerleader-Superkräfte: welches Fenster wann aufgeht und was das Opfer bewirkt.
//
// Reaktionen sind immer OPTIONAL und kosten weder Energie noch einen Zug – der
// Preis ist der Bankplatz. Pro Auslöser darf höchstens ein Cheerleader geopfert
// werden; die Folgewirkung darf aber neue Auslöser erzeugen.
//
// Warum ein eigenes Modul: game.ts sequenziert die Auflösung, diese Datei kennt
// nur die Kräfte. Sie importiert bewusst NICHT aus game.ts (Zirkelimport) und
// auch nicht aus abilities.ts – die Wirkungen sind hier eigenständig
// ausgeschrieben, so wie schild.ts es für die Schild-Superkräfte tut.

import { log, otherPlayer } from './internal.js';
import { zaehleSpieler } from './stats.js';
import type {
  CheerleaderAusloeser,
  CheerleaderKraft,
  CheerleaderWirkung,
  Creature,
  GameData,
  GameState,
  OffeneReaktion,
  PlayerIndex,
  ReaktionsAngebot
} from './types.js';

/** Bankplätze sind fest dreistellig (config.cheerleaders.selectionSize === 3). */
export type SlotIndex = 0 | 1 | 2;
const SLOTS: SlotIndex[] = [0, 1, 2];

/** Kraft eines Bankplatzes – `undefined`, wenn der Platz leer oder ohne Kraft ist. */
export function kraftVonSlot(
  state: GameState,
  spieler: PlayerIndex,
  slot: SlotIndex
): { cardId: string; kraft: CheerleaderKraft } | undefined {
  const cardId = state.players[spieler].cheerleaders[slot];
  if (!cardId) return undefined;
  const kraft = state.config.cheerleaders.kraefte?.[cardId];
  return kraft ? { cardId, kraft } : undefined;
}

/** Alle belegten Bankplätze, deren Kraft zu diesem Auslöser passt. */
export function passendeSlots(
  state: GameState,
  spieler: PlayerIndex,
  ausloeser: CheerleaderAusloeser
): SlotIndex[] {
  return SLOTS.filter((slot) => kraftVonSlot(state, spieler, slot)?.kraft.ausloeser === ausloeser);
}

/** Öffentliche Beschreibung der einlösbaren Plätze (für die Client-Sicht). */
export function angebote(state: GameState, reaktion: OffeneReaktion): ReaktionsAngebot[] {
  const out: ReaktionsAngebot[] = [];
  for (const slot of reaktion.slots) {
    const eintrag = kraftVonSlot(state, reaktion.spieler, slot);
    if (!eintrag) continue; // Platz wurde zwischenzeitlich geleert
    const { cardId, kraft } = eintrag;
    out.push({
      slot,
      cardId,
      kraft: kraft.name,
      text: kraft.text,
      ...(kraft.wirkung.kind === 'wahl'
        ? { wahl: { a: kraft.wirkung.optionA.name, b: kraft.wirkung.optionB.name } }
        : {})
    });
  }
  return out;
}

// ---------------------------------------------------------------- Fenster öffnen

/**
 * Öffnet ein Fenster, falls `spieler` einen passenden Cheerleader auf der Bank
 * hat. Gibt zurück, ob tatsächlich eines geöffnet wurde – der Aufrufer muss
 * seine Auflösung dann anhalten.
 */
export function oeffneFenster(
  state: GameState,
  spieler: PlayerIndex,
  ausloeser: CheerleaderAusloeser,
  ausloeserKreatur: Creature,
  lane: number,
  ausloeserOwner: PlayerIndex,
  fortsetzenMit: PlayerIndex
): boolean {
  if (state.reaktion) return false; // es kann immer nur ein Fenster offen sein
  const slots = passendeSlots(state, spieler, ausloeser);
  if (slots.length === 0) return false;
  state.reaktion = {
    id: state.naechsteReaktionsId,
    spieler,
    ausloeser,
    slots,
    lane,
    ausloeserUid: ausloeserKreatur.uid,
    ausloeserOwner,
    fortsetzenMit
  };
  state.naechsteReaktionsId += 1;
  state.active = spieler;
  return true;
}

/** Findet eine Kreatur über ihre uid – sie kann die Lane gewechselt haben. */
function findeKreatur(
  state: GameState,
  uid: number
): { creature: Creature; owner: PlayerIndex; lane: number } | undefined {
  for (const owner of [0, 1] as PlayerIndex[]) {
    for (let lane = 0; lane < state.board[owner].length; lane++) {
      const c = state.board[owner][lane];
      if (c && c.uid === uid) return { creature: c, owner, lane };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------- Wirkungen

interface WirkungsKontext {
  state: GameState;
  /** Besitzer des geopferten Cheerleaders. */
  spieler: PlayerIndex;
  /** Auslöser-Kreatur, falls sie noch im Feld steht. */
  ausloeser?: { creature: Creature; owner: PlayerIndex; lane: number };
}

type WirkungsResolver<K extends CheerleaderWirkung['kind']> = (
  ctx: WirkungsKontext,
  wirkung: Extract<CheerleaderWirkung, { kind: K }>
) => void;

/**
 * Registry der Wirkungen. Der Mapped Type erzwingt Vollständigkeit: eine neue
 * Variante in `CheerleaderWirkung` (types.ts) ohne Eintrag hier ist ein
 * Typfehler.
 *
 * Wichtig: keine dieser Wirkungen räumt Tote selbst ab. Das übernimmt der
 * Schritt `todeStabilisieren` im Aufrufer – nur so entstehen Sterbe-Events für
 * die Animation und Beim-Tod-Effekte (todesfluch, sammeln, beschwoeren).
 */
export const CHEERLEADER_WIRKUNGEN: {
  [K in CheerleaderWirkung['kind']]: WirkungsResolver<K>;
} = {
  peinigenAlle({ state, spieler }, wirkung) {
    const gegner = otherPlayer(spieler);
    let getroffen = 0;
    for (const c of state.board[gegner]) {
      if (!c) continue;
      c.atkDeckel = c.atkDeckel != null ? Math.min(c.atkDeckel, wirkung.atkDeckel) : wirkung.atkDeckel;
      c.hpDeckel = c.hpDeckel != null ? Math.min(c.hpDeckel, wirkung.hpDeckel) : wirkung.hpDeckel;
      getroffen += 1;
    }
    log(
      state,
      getroffen === 0
        ? 'Machtwort: der Gegner hat keine Kreaturen im Feld.'
        : `Machtwort: ${getroffen} gegnerische Kreatur${getroffen === 1 ? '' : 'en'} auf ${wirkung.atkDeckel} ATK und ${wirkung.hpDeckel} Verteidigung gedeckelt.`
    );
  },

  schwaechungRunde({ state, spieler }, wirkung) {
    const gegner = otherPlayer(spieler);
    let getroffen = 0;
    for (const c of state.board[gegner]) {
      if (!c) continue;
      c.tempAttackBonus -= wirkung.atk;
      getroffen += 1;
    }
    log(
      state,
      getroffen === 0
        ? 'Sicherer Raum: der Gegner hat keine Kreaturen im Feld.'
        : getroffen === 1
          ? `Sicherer Raum: 1 gegnerische Kreatur erhält bis Rundenende −${wirkung.atk} ATK.`
          : `Sicherer Raum: ${getroffen} gegnerische Kreaturen erhalten bis Rundenende −${wirkung.atk} ATK.`
    );
  },

  ziehenUndWissen({ state, spieler }, wirkung) {
    let gezogen = 0;
    for (let i = 0; i < wirkung.karten; i++) {
      const card = state.players[spieler].deck.shift();
      if (!card) break;
      state.players[spieler].hand.push(card);
      zaehleSpieler(state, spieler, 'kartenGezogen');
      gezogen += 1;
    }
    state.players[spieler].knowledge += wirkung.wissen;
    log(
      state,
      `Feldforschung: Spieler ${spieler + 1} zieht ${gezogen} Karte${gezogen === 1 ? '' : 'n'} und erhält ${wirkung.wissen} Wissen.`
    );
  },

  schadenAufAusloeser({ state, spieler, ausloeser }, wirkung) {
    if (!ausloeser) {
      log(state, 'Feldforschung: das Ziel steht nicht mehr im Feld.');
      return;
    }
    ausloeser.creature.currentHealth -= wirkung.x;
    ausloeser.creature.letzterSchaden = { art: 'effekt', quelle: 'cheerleader', owner: spieler };
    log(state, `Feldforschung: ${ausloeser.creature.name} erleidet ${wirkung.x} Schaden.`);
  },

  gegenseitigerSchaden({ state, spieler, ausloeser }, wirkung) {
    if (!ausloeser) {
      log(state, 'Handgemenge: das Ziel steht nicht mehr im Feld.');
      return;
    }
    ausloeser.creature.currentHealth -= wirkung.x;
    ausloeser.creature.letzterSchaden = { art: 'effekt', quelle: 'cheerleader', owner: spieler };
    // „gegenüber" heißt: dieselbe Lane auf der eigenen Seite. Steht dort nichts
    // (mehr), trifft es nur den Auslöser – die Kraft verpufft nicht komplett.
    const eigene = state.board[spieler][ausloeser.lane];
    if (eigene) {
      eigene.currentHealth -= wirkung.x;
      eigene.letzterSchaden = { art: 'effekt', quelle: 'cheerleader', owner: spieler };
      log(
        state,
        `Handgemenge: ${ausloeser.creature.name} und ${eigene.name} erleiden je ${wirkung.x} Schaden.`
      );
      return;
    }
    log(state, `Handgemenge: ${ausloeser.creature.name} erleidet ${wirkung.x} Schaden.`);
  },

  rettenUndZiehen({ state, spieler, ausloeser }, wirkung) {
    if (!ausloeser) {
      log(state, 'Zweite Chance: die Kreatur ist nicht mehr zu retten.');
      return;
    }
    const c = ausloeser.creature;
    c.currentHealth = wirkung.hp;
    // Ein späterer tödlicher Treffer ist ein NEUER Auslöser und darf wieder
    // gefragt werden – deshalb die Sperre hier aufheben.
    c.todesReaktionAngeboten = false;
    const verhindert = Math.max(1, wirkung.hp);
    zaehleSpieler(state, spieler, 'verhinderterSchaden', verhindert);
    let gezogen = 0;
    for (let i = 0; i < wirkung.karten; i++) {
      const card = state.players[spieler].deck.shift();
      if (!card) break;
      state.players[spieler].hand.push(card);
      zaehleSpieler(state, spieler, 'kartenGezogen');
      gezogen += 1;
    }
    log(
      state,
      `Zweite Chance: ${c.name} überlebt mit ${wirkung.hp} Leben` +
        (gezogen > 0 ? ` – Spieler ${spieler + 1} zieht ${gezogen} Karte${gezogen === 1 ? '' : 'n'}.` : '.')
    );
  },

  wahl() {
    // Wird nie direkt ausgeführt: fuehreWirkungAus() löst die Wahl vorher auf.
    // Der Eintrag existiert nur, damit der Mapped Type vollständig bleibt.
  }
};

/**
 * Führt eine Wirkung aus und löst dabei eine `wahl` anhand der Spielerantwort
 * auf. Gibt zurück, welche Wirkung tatsächlich gelaufen ist (für das Log-Event).
 */
export function fuehreWirkungAus(
  ctx: WirkungsKontext,
  wirkung: CheerleaderWirkung,
  choice: 'A' | 'B' | undefined
): CheerleaderWirkung {
  if (wirkung.kind === 'wahl') {
    const gewaehlt = choice === 'B' ? wirkung.optionB.wirkung : wirkung.optionA.wirkung;
    return fuehreWirkungAus(ctx, gewaehlt, undefined);
  }
  // Der Cast ist nötig, weil TypeScript den Union-Zweig nicht mit dem Resolver
  // korreliert; die Registry oben garantiert, dass jede Variante bedient wird.
  (CHEERLEADER_WIRKUNGEN[wirkung.kind] as WirkungsResolver<CheerleaderWirkung['kind']>)(ctx, wirkung);
  return wirkung;
}

/** Baut den Kontext für eine Wirkung aus dem offenen Fenster. */
export function wirkungsKontext(state: GameState, reaktion: OffeneReaktion): WirkungsKontext {
  return {
    state,
    spieler: reaktion.spieler,
    ausloeser: findeKreatur(state, reaktion.ausloeserUid)
  };
}
