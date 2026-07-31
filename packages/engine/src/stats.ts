// Telemetrie-Sidecar für Backtest-Simulationen (siehe scripts/backtest/).
// NICHT regelwirksam: state.stats bleibt ohne einen aktiviereStatistik()-Aufruf
// für immer undefined, und buildClientView liefert es nie aus – Server und
// Client sehen also keinen Unterschied. Alle Schreibhelfer hier sind No-Ops,
// solange state.stats fehlt (Guard-Pattern), kosten im Produktivbetrieb also
// nur einen Feldzugriff.

import type {
  CheerleaderStatistik,
  GameState,
  KartenStatistik,
  MatchStatistik,
  PlayerIndex,
  SpielerStatistik
} from './types.js';

function leereKartenStatistik(): KartenStatistik {
  return {
    gespielt: 0,
    schadenKreatur: 0,
    schadenBasis: 0,
    kills: 0,
    gestorben: 0,
    geheilt: 0,
    verhindert: 0
    ,auraAusloesungen: 0
    ,wachstumAusloesungen: 0
    ,giftZerstoerungen: 0
    ,flinkAngriffe: 0
    ,mulliganAngeboten: 0
    ,mulliganBehalten: 0
    ,legaleGelegenheiten: 0
    ,endhandNieLegal: 0
    ,endhandNichtGewaehlt: 0
  };
}

function leereSpielerStatistik(): SpielerStatistik {
  return {
    giftZerstoerungen: 0,
    flinkAngriffe: 0,
    heilung: 0,
    verhinderterSchaden: 0,
    dornenSchaden: 0,
    wuchtSchaden: 0,
    hinrichtungen: 0,
    wachstumAtk: 0,
    wachstumHp: 0,
    energieVerfallen: 0,
    kartenGezogen: 0,
    energieJeRunde: [],
    anfangshand: [],
    mulliganGetauscht: [],
    mulliganBehalten: [],
    endhand: []
  };
}

export function leereStatistik(): MatchStatistik {
  return {
    proKarte: [{}, {}],
    proSpieler: [leereSpielerStatistik(), leereSpielerStatistik()],
    proCheerleader: [{}, {}],
    instanzen: {},
    deckInstanzen: [[], []],
    handInstanzen: [[], []],
    naechsteInstanz: 1
  };
}

/** Aktiviert die Telemetrie für eine Partie. Nur vom Backtest-Harness aufrufen. */
export function aktiviereStatistik(state: GameState): void {
  state.stats = leereStatistik();
  for (const owner of [0, 1] as PlayerIndex[]) {
    const player = state.players[owner];
    const make = (cardId: string) => {
      const id = state.stats!.naechsteInstanz++;
      state.stats!.instanzen[id] = { id, cardId, owner, legalGesehen: false, ausgespielt: false };
      return id;
    };
    state.stats.handInstanzen[owner] = player.hand.map(make);
    state.stats.deckInstanzen[owner] = player.deck.map(make);
    state.stats.proSpieler[owner].kartenGezogen = player.hand.length;
    state.stats.proSpieler[owner].anfangshand = [...player.hand];
  }
}

export function registriereZug(state: GameState, owner: PlayerIndex): void {
  if (!state.stats) return;
  const id = state.stats.deckInstanzen[owner].shift();
  if (id != null) state.stats.handInstanzen[owner].push(id);
}

export function registriereAusspielen(state: GameState, owner: PlayerIndex, handIndex: number): void {
  if (!state.stats) return;
  const [id] = state.stats.handInstanzen[owner].splice(handIndex, 1);
  if (id != null) state.stats.instanzen[id].ausgespielt = true;
}

export function registriereMulligan(
  state: GameState,
  owner: PlayerIndex,
  selected: number[]
): number[] {
  if (!state.stats) return [];
  const chosen = new Set(selected);
  const ids: number[] = [];
  const hand = state.players[owner].hand;
  hand.forEach((cardId, i) => {
    zaehleKarte(state, owner, cardId, 'mulliganAngeboten');
    if (chosen.has(i)) state.stats!.proSpieler[owner].mulliganGetauscht.push(cardId);
    else {
      state.stats!.proSpieler[owner].mulliganBehalten.push(cardId);
      zaehleKarte(state, owner, cardId, 'mulliganBehalten');
    }
  });
  for (const i of [...selected].sort((a, b) => b - a)) {
    const [id] = state.stats.handInstanzen[owner].splice(i, 1);
    if (id != null) ids.push(id);
  }
  return ids;
}

export function markiereLegaleHandkarten(state: GameState, owner: PlayerIndex, handIndices: number[]): void {
  if (!state.stats) return;
  for (const index of new Set(handIndices)) {
    const id = state.stats.handInstanzen[owner][index];
    const instance = id == null ? undefined : state.stats.instanzen[id];
    if (!instance) continue;
    instance.legalGesehen = true;
    zaehleKarte(state, owner, instance.cardId, 'legaleGelegenheiten');
  }
}

export function registriereEnergie(state: GameState, owner: PlayerIndex): void {
  if (!state.stats || state.round <= 0) return;
  const list = state.stats.proSpieler[owner].energieJeRunde;
  if (!list.some((e) => e.runde === state.round)) list.push({ runde: state.round, ungenutzt: state.players[owner].energy });
}

export function finalisiereStatistik(state: GameState): void {
  if (!state.stats) return;
  for (const owner of [0, 1] as PlayerIndex[]) {
    registriereEnergie(state, owner);
    const ps = state.stats.proSpieler[owner];
    ps.endhand = [...state.players[owner].hand];
    state.stats.handInstanzen[owner].forEach((id) => {
      const instance = state.stats!.instanzen[id];
      if (!instance) return;
      zaehleKarte(state, owner, instance.cardId, instance.legalGesehen ? 'endhandNichtGewaehlt' : 'endhandNieLegal');
    });
  }
}

function kartenEintrag(
  state: GameState,
  owner: PlayerIndex,
  cardId: string
): KartenStatistik | undefined {
  if (!state.stats) return undefined;
  const bucket = state.stats.proKarte[owner];
  let entry = bucket[cardId];
  if (!entry) {
    entry = leereKartenStatistik();
    bucket[cardId] = entry;
  }
  return entry;
}

/** Zählt ein Karten-Feld hoch – No-Op, solange state.stats nicht aktiviert ist. */
export function zaehleKarte(
  state: GameState,
  owner: PlayerIndex,
  cardId: string,
  feld: keyof KartenStatistik,
  n = 1
): void {
  const entry = kartenEintrag(state, owner, cardId);
  if (!entry) return;
  entry[feld] += n;
}

/** Zählt ein Spieler-Feld hoch – No-Op, solange state.stats nicht aktiviert ist. */
export function zaehleSpieler(
  state: GameState,
  owner: PlayerIndex,
  feld: { [K in keyof SpielerStatistik]: SpielerStatistik[K] extends number ? K : never }[keyof SpielerStatistik],
  n = 1
): void {
  if (!state.stats) return;
  state.stats.proSpieler[owner][feld] += n;
}

/** Zählt ein Cheerleader-Feld hoch – No-Op ohne aktivierte Statistik. */
export function zaehleCheerleader(
  state: GameState,
  owner: PlayerIndex,
  cardId: string,
  feld: keyof CheerleaderStatistik,
  n = 1
): void {
  if (!state.stats) return;
  const je = state.stats.proCheerleader[owner];
  je[cardId] ??= {
    angeboten: 0,
    geopfert: 0,
    schadenVerursacht: 0,
    schadenVerhindert: 0
  };
  je[cardId][feld] += n;
}
