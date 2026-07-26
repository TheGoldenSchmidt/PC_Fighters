// Telemetrie-Sidecar für Backtest-Simulationen (siehe scripts/backtest/).
// NICHT regelwirksam: state.stats bleibt ohne einen aktiviereStatistik()-Aufruf
// für immer undefined, und buildClientView liefert es nie aus – Server und
// Client sehen also keinen Unterschied. Alle Schreibhelfer hier sind No-Ops,
// solange state.stats fehlt (Guard-Pattern), kosten im Produktivbetrieb also
// nur einen Feldzugriff.

import type {
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
    kartenGezogen: 0
  };
}

export function leereStatistik(): MatchStatistik {
  return {
    proKarte: [{}, {}],
    proSpieler: [leereSpielerStatistik(), leereSpielerStatistik()]
  };
}

/** Aktiviert die Telemetrie für eine Partie. Nur vom Backtest-Harness aufrufen. */
export function aktiviereStatistik(state: GameState): void {
  state.stats = leereStatistik();
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
  feld: keyof SpielerStatistik,
  n = 1
): void {
  if (!state.stats) return;
  state.stats.proSpieler[owner][feld] += n;
}
