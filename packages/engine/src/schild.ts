// Basis-Schild und Superkräfte.
//
// Jeder Treffer auf eine Basis läuft durch basisSchaden(). Der lädt zuerst den
// Schild des Verteidigers zufällig auf; erreicht der Schild seine volle Zahl an
// Abschnitten, wird GENAU DIESER Treffer komplett geblockt, eine zufällige
// Superkraft löst aus und der Schild geht auf 0 zurück.
//
// Warum ein eigenes Modul: basisSchaden() wird von game.ts, abilities.ts UND
// effects.ts gebraucht, muss also unterhalb von abilities.ts liegen. Deshalb
// importiert diese Datei nur types/internal/rng/stats – kein Zirkelimport.

import { log, otherPlayer } from './internal.js';
import { wuerfle } from './rng.js';
import { zaehleSpieler } from './stats.js';
import type { GameState, PlayerIndex, SchildEvent, Superkraft } from './types.js';

type SuperkraftResolver<K extends Superkraft['kind']> = (
  state: GameState,
  spieler: PlayerIndex,
  superkraft: Extract<Superkraft, { kind: K }>
) => void;

/**
 * Registry der Superkräfte. Der Mapped Type erzwingt Vollständigkeit: eine neue
 * Variante in `Superkraft` (types.ts) ohne Eintrag hier ist ein Typfehler.
 *
 * Neue Superkraft hinzufügen = Variante in types.ts + Eintrag hier + Zweig im
 * superkraftSchema (schema.ts) + Eintrag in data/config.json.
 */
export const SUPERKRAEFTE: { [K in Superkraft['kind']]: SuperkraftResolver<K> } = {
  keinSchaden(state, spieler) {
    state.players[spieler].basisImmun = true;
    log(state, `Schutzschild: Spieler ${spieler + 1} nimmt in dieser Runde keinen Basisschaden mehr.`);
  },

  kartenZiehen(state, spieler, superkraft) {
    // Bewusst inline statt über draw() aus abilities.ts: diese Datei darf
    // abilities.ts nicht importieren (Zirkelimport, siehe Kopfkommentar).
    let gezogen = 0;
    for (let i = 0; i < superkraft.n; i++) {
      const card = state.players[spieler].deck.shift();
      if (!card) break;
      state.players[spieler].hand.push(card);
      zaehleSpieler(state, spieler, 'kartenGezogen');
      gezogen += 1;
    }
    log(state, `Nachschub: Spieler ${spieler + 1} zieht ${gezogen} Karte${gezogen === 1 ? '' : 'n'}.`);
  },

  schwaechung(state, spieler, superkraft) {
    const gegner = otherPlayer(spieler);
    let getroffen = 0;
    for (const c of state.board[gegner]) {
      if (!c) continue;
      c.permAttackBonus -= superkraft.atk;
      c.permHealthBonus -= superkraft.hp;
      // Zusätzlich echter Schaden aufs aktuelle Leben: getMaxHealth() deckelt
      // das Maximum bei 1, ein reiner Max-Leben-Debuff könnte also nie töten.
      // Genau das soll -1/-1 aber können.
      c.currentHealth -= superkraft.hp;
      c.letzterSchaden = { art: 'effekt', quelle: 'schild', owner: spieler };
      getroffen += 1;
    }
    if (getroffen === 0) {
      log(state, `Störfeuer: der Gegner hat keine Kreaturen im Feld.`);
      return;
    }
    log(
      state,
      `Störfeuer: alle ${getroffen} gegnerischen Kreaturen erhalten dauerhaft -${superkraft.atk}/-${superkraft.hp}.`
    );
    // Bewusst KEIN recalcBoard hier: das Aufräumen der Toten übernimmt
    // logDeaths() im aufrufenden Spielfluss (resolveCombat bzw. playPhaseAction).
    // Würden wir hier selbst abräumen, gäbe es weder Sterbe-Events für die
    // Animation noch Beim-Tod-Effekte (todesfluch, sammeln, beschwoeren).
  }
};

function fuehreSuperkraftAus(state: GameState, spieler: PlayerIndex, kraft: Superkraft): void {
  // Der Cast ist nötig, weil TypeScript den Union-Zweig nicht mit dem Resolver
  // korreliert; die Registry oben garantiert, dass jede Variante bedient wird.
  (SUPERKRAEFTE[kraft.kind] as SuperkraftResolver<Superkraft['kind']>)(state, spieler, kraft);
}

/**
 * Einzige Stelle, an der die Basis Kampf- oder Effektschaden nimmt (Zermürbung
 * ist bewusst ausgenommen und rechnet weiterhin direkt auf `base`).
 *
 * Reihenfolge: erst laden, dann prüfen – ein Treffer, der den Schild voll macht,
 * wird selbst schon geblockt.
 *
 * @returns den TATSÄCHLICH angerichteten Schaden (0 = geblockt oder immun).
 */
export function basisSchaden(state: GameState, ziel: PlayerIndex, menge: number): number {
  if (menge <= 0) return 0;
  const p = state.players[ziel];

  if (p.basisImmun) {
    log(state, `Schutzschild: der Treffer auf Spieler ${ziel + 1} verpufft (${menge} Schaden verhindert).`);
    return 0;
  }

  const cfg = state.config.schild;
  if (!cfg) {
    // Schild-Regel abgeschaltet: exakt das Verhalten vor diesem Feature.
    p.base -= menge;
    return menge;
  }

  const ladung = wuerfle(state, cfg.ladung.min, cfg.ladung.max);
  p.schild += ladung;

  if (p.schild >= cfg.abschnitte) {
    p.schild = 0;
    // Superkraft ZIEHEN, aber erst nach dem Block-Log ausführen: so steht im
    // Log (und damit in der Replay-Reihenfolge des Clients) zuerst der Block
    // und danach das, was die Superkraft anrichtet.
    const kraft =
      cfg.superkraefte.length > 0 ? cfg.superkraefte[wuerfle(state, 0, cfg.superkraefte.length - 1)] : null;
    const ereignis: SchildEvent = {
      kind: 'schild',
      owner: ziel,
      ladung,
      stand: 0,
      abschnitte: cfg.abschnitte,
      blockiert: true,
      ...(kraft ? { superkraft: kraft.name } : {})
    };
    log(
      state,
      `Schild von Spieler ${ziel + 1} blockt den Angriff (${menge} Schaden verhindert)` +
        (kraft ? ` – Superkraft: ${kraft.name}!` : '!'),
      ereignis
    );
    if (kraft) fuehreSuperkraftAus(state, ziel, kraft);
    return 0;
  }

  log(
    state,
    `Schild von Spieler ${ziel + 1} lädt sich um ${ladung} auf (${p.schild}/${cfg.abschnitte}).`,
    { kind: 'schild', owner: ziel, ladung, stand: p.schild, abschnitte: cfg.abschnitte }
  );
  p.base -= menge;
  return menge;
}
