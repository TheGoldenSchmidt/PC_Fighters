// Spielfeld als bildschirmfüllende Arena: Das Lane-Raster (dynamisch aus der
// Config – auch 4+ Lanes funktionieren) liegt in einem mittleren Band, davor
// und dahinter steht mittig die Cheerleader-Bank mit der Basis dahinter. Alle
// Anzeigen (Basis, Schild, Energie, Deck, Runde) schweben als Chips darüber,
// es gibt bewusst KEINE Kopf-/Fußleiste mehr: der tote Rand oben und unten war
// genau das, was hier verschwinden sollte.
//
// Bedienung: Handkarten werden in eine Lane GEZOGEN (`useKartenZug`, Pointer-
// Events). Kurzes Antippen öffnet stattdessen die Detailansicht mit dem
// Karteneffekt; von dort führt „Ausspielen" in die alte Tap-auf-Lane-Auswahl,
// die Karten ohne Lane-Ziel (Beschwörung) und die Flug-Phase weiterhin braucht.
//
// Kampf-Abspielung: Der Server schickt nach dem Kampf den fertigen Zustand
// PLUS strukturierte Events (Angriffe, Tode). Der Client zeigt den alten
// Zustand weiter an ("shownView") und spielt die Events Lane für Lane ab:
// Projektil fliegt → Schaden erscheint → Sterbeanimation → nächste Lane.
// Erst danach wird auf den neuen Serverzustand umgeschaltet.
//
// Lebendigkeit: Figuren haben Idle-Animationen (CSS), laufen bei
// Lane-Wechseln sichtbar hinüber (uid-Diff → lane-move-Animation), und
// Phasen-Banner kündigen Runde/Kampf/Zug an. Langes Drücken auf Karten
// oder Figuren öffnet eine Detailansicht mit Keyword-Erklärungen.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react';
import type {
  AttackEvent,
  CardDef,
  CheerleaderPowerEvent,
  CheerleaderSacrificeEvent,
  CheerleaderSlots,
  ClientView,
  CreatureView,
  DeathEvent,
  LogEvent,
  PlayerAction,
  PlayerIndex,
  ReaktionsView,
  SpellEvent,
  Topic,
  VisualCatalog
} from '@pcf/engine';
import type { ConnectionStatus, KeywordInfo } from './useGame';
import { Battlefield3D, webglSupported, type SpellEffectKind } from './Battlefield3D';
import { eigeneLaneRects, useKartenZug } from './useKartenZug';

interface Props {
  view: ClientView;
  topic: Topic | null;
  keywordInfo: KeywordInfo | null;
  catalog: VisualCatalog | null;
  status: ConnectionStatus;
  opponentConnected: boolean;
  onAction: (action: PlayerAction) => void;
  onLeave: () => void;
}

type Selection =
  | { kind: 'hand'; index: number }
  | { kind: 'move'; index: number; fromLane: number }
  | { kind: 'fly'; fromLane: number }
  | null;

interface FxProjectile {
  key: string;
  lane: number;
  attacker: PlayerIndex;
  toBase: boolean;
  emoji: string;
}

interface FxImpact {
  key: string;
  lane: number;
  side: PlayerIndex;
  damage: number;
}

interface FxBaseImpact {
  key: string;
  side: PlayerIndex;
  damage: number;
}

interface FxSpell {
  key: string;
  lane: number;
  effect: SpellEffectKind;
  faction: string;
}

/** Aktiver Schild-Effekt: Aufladen oder Block samt Superkraft. */
interface FxShield {
  owner: PlayerIndex;
  blockiert: boolean;
}

/** Wirkende Cheerleader-Superkraft: kurzer Effekt auf der Auslöser-Lane. */
interface FxPower {
  key: string;
  owner: PlayerIndex;
  lane: number;
  kraft: string;
}

interface FxState {
  projectiles: FxProjectile[];
  impacts: FxImpact[];
  baseImpacts: FxBaseImpact[];
  dying: { lane: number; owner: PlayerIndex }[];
  spells: FxSpell[];
  shield: FxShield | null;
  sacrifices: {
    key: string;
    owner: PlayerIndex;
    slot: 0 | 1 | 2;
    cardId: string;
  }[];
  power: FxPower | null;
  activeLane: number | null;
}

const EMPTY_FX: FxState = {
  projectiles: [],
  impacts: [],
  baseImpacts: [],
  dying: [],
  spells: [],
  shield: null,
  sacrifices: [],
  power: null,
  activeLane: null
};

/** Daten für die Detailansicht (Handkarte oder Figur auf dem Feld). */
interface DetailData {
  cardId: string;
  name: string;
  cost?: number;
  attack?: number;
  health?: number;
  maxHealth?: number;
  keywords: string[];
  text?: string;
  signature?: boolean;
  /**
   * Nur bei Handkarten gesetzt: erlaubt „Ausspielen" direkt aus dem Detail.
   * Das ist die Rückfallebene zum Ziehen – und der einzige Weg für Karten
   * ohne Lane-Ziel (Beschwörung), die man nirgendwohin ziehen kann.
   */
  handIndex?: number;
}

// Timing der Kampf-Abspielung (Millisekunden)
const PROJECTILE_MS = 500;
const IMPACT_MS = 650;
const DEATH_MS = 600;
const SPELL_MS = 750;
const SHIELD_MS = 550;
/** Block ist der Höhepunkt: länger, damit Banner und Superkraft lesbar sind. */
const SHIELD_BLOCK_MS = 1200;
/** Cheerleader-Kraft: lang genug, dass das Banner mit dem Kraftnamen lesbar ist. */
const POWER_MS = 1100;
const LANE_PAUSE_MS = 200;
const BANNER_MS = 1500;
const LONG_PRESS_MS = 450;

const CHEERLEADER_NAMES: Record<string, string> = {
  pc_principal: 'PC Principal',
  pc_babies: 'PC Babies',
  alter_wissenschaftler: 'Alter Wissenschaftler',
  junger_neffe: 'Junger Neffe',
  randy_marsh: 'Randy Marsh'
};

function CheerleaderStrip({
  slots,
  sacrifice,
  position,
  bereiteSlots
}: {
  side: PlayerIndex;
  slots: CheerleaderSlots;
  sacrifice?: { slot: 0 | 1 | 2; cardId: string };
  position: 'own' | 'opponent';
  /** Plätze, die gerade auf ein offenes Fenster antworten könnten. */
  bereiteSlots?: (0 | 1 | 2)[];
}) {
  return (
    <div className={`team-strip team-strip-${position}`} aria-label={`${position === 'own' ? 'Eigene' : 'Gegnerische'} Cheerleader`}>
      <span className={`team-base ${sacrifice ? 'shield-flash' : ''}`} aria-hidden />
      <div className="team-bench">
        {slots.map((cardId, slot) => (
          <div
            key={slot}
            className={
              `team-seat ${cardId ? 'occupied' : 'empty'}` +
              (sacrifice?.slot === slot ? ' sacrificing' : '') +
              (bereiteSlots?.includes(slot as 0 | 1 | 2) ? ' ready' : '')
            }
            title={cardId ? CHEERLEADER_NAMES[cardId] ?? cardId : `Bankplatz ${slot + 1} ist leer`}
          >
            <span>{slot + 1}</span>
            {cardId && <strong>{(CHEERLEADER_NAMES[cardId] ?? cardId).charAt(0)}</strong>}
          </div>
        ))}
      </div>
    </div>
  );
}

const AUSLOESER_TEXT: Record<ReaktionsView['ausloeser'], string> = {
  gegnerischeKreatur: 'Der Gegner hat eine Kreatur ausgespielt.',
  gegnerischeKreaturGegenueber: 'Der Gegner hat eine Kreatur genau gegenüber deiner ausgespielt.',
  eigenerTod: 'Eine deiner Kreaturen würde jetzt sterben.'
};

/**
 * Auswahl für ein offenes Reaktionsfenster. Bewusst ein DOM-Overlay statt einer
 * Interaktion auf der Bank: so ist die Bedienung in 3D und im `?no3d`-Fallback
 * exakt dieselbe. Verzichten ist immer möglich und steht deshalb fest unten.
 */
function ReaktionsAuswahl({
  reaktion,
  onEntscheiden
}: {
  reaktion: ReaktionsView;
  onEntscheiden: (slot: 0 | 1 | 2 | null, choice?: 'A' | 'B') => void;
}) {
  return (
    <div className="overlay reaction-overlay">
      <div className="reaction-box" role="dialog" aria-label="Cheerleader-Reaktion">
        <h2 className="reaction-title">📣 Cheerleader-Reaktion</h2>
        <p className="reaction-trigger">
          {AUSLOESER_TEXT[reaktion.ausloeser]} (Lane {reaktion.lane + 1})
        </p>
        <p className="reaction-cost">
          Ein Opfer kostet weder Energie noch deinen Zug – nur den Bankplatz.
        </p>

        <div className="reaction-offers">
          {reaktion.angebote.map((angebot) => (
            <div key={angebot.slot} className="reaction-offer">
              <div className="reaction-offer-head">
                <span className="reaction-slot">Platz {angebot.slot + 1}</span>
                <strong>{angebot.kraft}</strong>
              </div>
              <p className="reaction-offer-text">{angebot.text}</p>
              {angebot.wahl ? (
                <div className="reaction-choices">
                  <button className="primary" onClick={() => onEntscheiden(angebot.slot, 'A')}>
                    {angebot.wahl.a}
                  </button>
                  <button className="primary" onClick={() => onEntscheiden(angebot.slot, 'B')}>
                    {angebot.wahl.b}
                  </button>
                </div>
              ) : (
                <button className="primary" onClick={() => onEntscheiden(angebot.slot)}>
                  {angebot.kraft} einsetzen
                </button>
              )}
            </div>
          ))}
          {reaktion.angebote.length === 0 && (
            <p className="hint">Kein passender Cheerleader mehr auf der Bank.</p>
          )}
        </div>

        <button className="secondary reaction-decline" onClick={() => onEntscheiden(null)}>
          Verzichten
        </button>
      </div>
    </div>
  );
}

/** Langes Drücken (Touch oder Maus) erkennen, ohne den normalen Tap zu stören. */
function useLongPress(onLongPress: (() => void) | undefined, ms = LONG_PRESS_MS) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  return {
    fired,
    handlers: {
      onPointerDown: () => {
        if (!onLongPress) return;
        fired.current = false;
        clear();
        timer.current = window.setTimeout(() => {
          fired.current = true;
          onLongPress();
        }, ms);
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (e: ReactMouseEvent) => {
        if (onLongPress) e.preventDefault();
      }
    }
  };
}

export function GameScreen({
  view,
  topic,
  keywordInfo,
  catalog,
  status,
  opponentConnected,
  onAction,
  onLeave
}: Props) {
  const [selection, setSelection] = useState<Selection>(null);
  // 3D-Figuren nur, wenn der Browser WebGL kann – sonst 2D-Fallback (Artwork)
  const [use3d, setUse3d] = useState(
    () => !new URLSearchParams(window.location.search).has('no3d') && webglSupported(),
  );
  const [shownView, setShownViewState] = useState<ClientView>(view);
  const [isReplaying, setIsReplaying] = useState(false);
  const [fx, setFx] = useState<FxState>(EMPTY_FX);
  const [moveFx, setMoveFx] = useState<Record<number, number>>({});
  const [banner, setBanner] = useState<{ key: number; text: string } | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  /** Kampf-Log: normal nur als Ticker sichtbar, auf Tippen als Overlay. */
  const [logOffen, setLogOffen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const shownViewRef = useRef(view);
  const latestViewRef = useRef(view);
  const queueRef = useRef<LogEvent[]>([]);
  const runningRef = useRef(false);
  const cancelledRef = useRef(false);
  const lastLogId = useRef<number | null>(null);
  const moveTimer = useRef<number | null>(null);
  const bannerTimer = useRef<number | null>(null);

  /** Zeigt kurz ein großes Phasen-Banner in der Bildschirmmitte. */
  const showBanner = (text: string) => {
    setBanner({ key: Date.now(), text });
    if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBanner(null), BANNER_MS);
  };

  /**
   * Neue Sicht anzeigen. Vergleicht vorher die Lanes: Kreaturen, die die
   * Lane gewechselt haben (fliegend, Hetzjagd), bekommen eine sichtbare
   * Lauf-Animation statt einfach an der neuen Position aufzutauchen.
   */
  const setShown = (v: ClientView) => {
    const prev = shownViewRef.current;
    const moved: Record<number, number> = {};
    for (const side of [0, 1] as PlayerIndex[]) {
      const prevLane = new Map<number, number>();
      prev.board[side].forEach((c, i) => {
        if (c) prevLane.set(c.uid, i);
      });
      v.board[side].forEach((c, i) => {
        if (!c) return;
        const from = prevLane.get(c.uid);
        if (from !== undefined && from !== i) moved[c.uid] = from - i;
      });
    }
    if (Object.keys(moved).length > 0) {
      setMoveFx(moved);
      if (moveTimer.current) window.clearTimeout(moveTimer.current);
      moveTimer.current = window.setTimeout(() => setMoveFx({}), 600);
    }
    shownViewRef.current = v;
    setShownViewState(v);
  };

  const me = view.you;
  const opp: PlayerIndex = me === 0 ? 1 : 0;

  // Reaktionsfenster kommen IMMER aus der neuesten Serversicht, nicht aus
  // shownView: während einer Abspielung hinkt die angezeigte Lage absichtlich
  // hinterher, die Frage an den Spieler darf das aber nicht.
  const reaktion: ReaktionsView | null = view.reaktion ?? null;
  const meineReaktion = reaktion !== null && reaktion.spieler === me;
  // Erst fragen, wenn die Animation durch ist – sonst klickt man blind.
  const zeigeReaktionsAuswahl = meineReaktion && !isReplaying && view.winner === null;

  // Ein offenes Fenster sperrt jede normale Aktion, auch die des Gegners.
  const myTurn =
    shownView.active === me && shownView.winner === null && !isReplaying && reaktion === null;
  const myBoard = shownView.board[me];
  const energy = shownView.players[me].energy;
  const canPlaySomething =
    myTurn && shownView.phase === 'play' && shownView.hand.some((c) => c.cost <= energy);

  // Auswahl zurücksetzen, wenn sich die angezeigte Lage ändert
  useEffect(() => setSelection(null), [shownView]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [shownView.log.length, logOffen]);

  // Phasen-Banner: Rundenwechsel, Flug-Phase, eigener Zug.
  const prevMeta = useRef<{ round: number; phase: string; myTurn: boolean; init: boolean }>({
    round: view.round,
    phase: view.phase,
    myTurn: false,
    init: false
  });
  useEffect(() => {
    const m = prevMeta.current;
    if (!m.init) {
      m.init = true;
    } else if (shownView.round !== m.round) {
      showBanner(`Runde ${shownView.round}`);
    } else if (shownView.phase === 'fly' && m.phase !== 'fly') {
      showBanner('🕊 Flug-Phase');
    } else if (myTurn && !m.myTurn && shownView.phase === 'play' && shownView.round > 1) {
      showBanner('Du bist am Zug!');
    }
    m.round = shownView.round;
    m.phase = shownView.phase;
    m.myTurn = myTurn;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownView, myTurn]);

  useEffect(() => {
    if (isReplaying) showBanner('⚔️ Kampf!');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReplaying]);

  // Neue Kampf-Events sammeln und die Abspielung starten.
  useEffect(() => {
    latestViewRef.current = view;
    const maxId = view.log.length > 0 ? view.log[view.log.length - 1].id : -1;
    if (lastLogId.current === null) {
      // Erster Zustand (auch nach Reconnect): alte Einträge nicht nachspielen.
      lastLogId.current = maxId;
      setShown(view);
      return;
    }
    const fresh = view.log.filter((e) => e.id > lastLogId.current! && e.event);
    lastLogId.current = Math.max(lastLogId.current, maxId);

    if (fresh.length === 0) {
      if (!runningRef.current) setShown(view);
      return;
    }
    queueRef.current.push(...fresh.map((e) => e.event!));
    if (!runningRef.current) void runReplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    // Wichtig: beim (Re-)Mount zurücksetzen – Reacts StrictMode mountet im
    // Dev-Modus doppelt, sonst bliebe das Abbruch-Flag dauerhaft gesetzt.
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  async function runReplay() {
    runningRef.current = true;
    setIsReplaying(true);
    const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

    while (queueRef.current.length > 0 && !cancelledRef.current) {
      const ev = queueRef.current.shift()!;

      if (ev.kind === 'attack') {
        // Gleichzeitige Angriffe derselben Lane zusammen abspielen
        const group: AttackEvent[] = [ev];
        while (
          queueRef.current[0]?.kind === 'attack' &&
          (queueRef.current[0] as AttackEvent).lane === ev.lane
        ) {
          group.push(queueRef.current.shift() as AttackEvent);
        }

        const board = shownViewRef.current.board;
        const projectiles: FxProjectile[] = group.map((g, i) => {
          const attackerCreature = board[g.attacker][g.lane];
          return {
            key: `p-${g.lane}-${g.attacker}-${Date.now()}-${i}`,
            lane: g.lane,
            attacker: g.attacker,
            toBase: g.toBase,
            emoji:
              attackerCreature?.projectile ??
              (attackerCreature?.abilities.some((a) => a.kind === 'gift') ? '☠️' : '💥')
          };
        });
        setFx((f) => ({ ...f, activeLane: ev.lane, projectiles }));
        await sleep(PROJECTILE_MS);
        if (cancelledRef.current) break;

        // Einschlag: Schaden sichtbar auf die angezeigte Lage anwenden
        const next = structuredClone(shownViewRef.current);
        const impacts: FxImpact[] = [];
        const baseImpacts: FxBaseImpact[] = [];
        group.forEach((g, i) => {
          const defender: PlayerIndex = g.attacker === 0 ? 1 : 0;
          if (g.toBase) {
            next.players[defender].base -= g.damage;
            // Bei einem vom Schild geblockten Treffer ist damage 0 – dann keine
            // "-0"-Schadenszahl zeigen, das übernimmt der Schild-Effekt.
            if (g.damage > 0) {
              baseImpacts.push({ key: `b-${g.lane}-${i}-${Date.now()}`, side: defender, damage: g.damage });
            }
          } else {
            const target = next.board[defender][g.lane];
            if (target) target.health = Math.max(0, target.health - g.damage);
            impacts.push({ key: `i-${g.lane}-${i}-${Date.now()}`, lane: g.lane, side: defender, damage: g.damage });
          }
        });
        setShown(next);
        setFx((f) => ({ ...f, projectiles: [], impacts, baseImpacts }));
        await sleep(IMPACT_MS);
        setFx((f) => ({ ...f, impacts: [], baseImpacts: [] }));
        await sleep(LANE_PAUSE_MS);
      } else if (ev.kind === 'death') {
        // Tode derselben Lane (gleichzeitiger Kampf) gemeinsam abspielen
        const deaths: DeathEvent[] = [ev];
        while (
          queueRef.current[0]?.kind === 'death' &&
          (queueRef.current[0] as DeathEvent).lane === ev.lane
        ) {
          deaths.push(queueRef.current.shift() as DeathEvent);
        }
        setFx((f) => ({
          ...f,
          activeLane: ev.lane,
          dying: [...f.dying, ...deaths.map((d) => ({ lane: d.lane, owner: d.owner }))]
        }));
        await sleep(DEATH_MS);
        if (cancelledRef.current) break;
        const next = structuredClone(shownViewRef.current);
        for (const d of deaths) next.board[d.owner][d.lane] = null;
        setShown(next);
        setFx((f) => ({
          ...f,
          dying: f.dying.filter((x) => !deaths.some((d) => d.lane === x.lane && d.owner === x.owner))
        }));
      } else if (ev.kind === 'schild') {
        // Basis-Schild: Ladebalken auf den Stand aus dem Event setzen. Beim Block
        // zusätzlich das Banner mit der ausgelösten Superkraft.
        const next = structuredClone(shownViewRef.current);
        next.players[ev.owner].schild = ev.stand;
        setShown(next);
        setFx((f) => ({ ...f, shield: { owner: ev.owner, blockiert: Boolean(ev.blockiert) } }));
        if (ev.blockiert) showBanner(`🛡️ ${ev.superkraft ?? 'Angriff geblockt'}!`);
        await sleep(ev.blockiert ? SHIELD_BLOCK_MS : SHIELD_MS);
        if (cancelledRef.current) break;
        setFx((f) => ({ ...f, shield: null }));
        await sleep(LANE_PAUSE_MS);
      } else if (ev.kind === 'spell') {
        // Zauber-Effekte einer Aktionskarte: alle direkt aufeinanderfolgenden
        // Spell-Events gemeinsam zeigen (z. B. Beschwörung mehrerer Tokens).
        const spellEvents: SpellEvent[] = [ev];
        while (queueRef.current[0]?.kind === 'spell') {
          spellEvents.push(queueRef.current.shift() as SpellEvent);
        }
        const spells: FxSpell[] = spellEvents.map((s, i) => ({
          key: `s-${s.lane}-${i}-${Date.now()}`,
          lane: s.lane,
          effect: s.effect,
          faction: s.faction
        }));
        // Neuen Serverzustand direkt zeigen: beschworene Kreatur erscheint,
        // Buff-Zahlen/Lane-Wechsel werden sichtbar – parallel zum Effekt.
        setShown(latestViewRef.current);
        setFx((f) => ({ ...f, activeLane: ev.lane, spells }));
        await sleep(SPELL_MS);
        if (cancelledRef.current) break;
        setFx((f) => ({ ...f, spells: [] }));
        await sleep(LANE_PAUSE_MS);
      } else if (ev.kind === 'cheerleaderSacrifice') {
        const sacrifice: CheerleaderSacrificeEvent = ev;
        const item = {
          key: `c-${sacrifice.owner}-${sacrifice.slot}-${Date.now()}`,
          owner: sacrifice.owner,
          slot: sacrifice.slot,
          cardId: sacrifice.cardId
        };
        setFx((current) => ({ ...current, sacrifices: [item] }));
        await sleep(1250);
        if (cancelledRef.current) break;
        const next = structuredClone(shownViewRef.current);
        if (next.players[sacrifice.owner].cheerleaders[sacrifice.slot] === sacrifice.cardId) {
          next.players[sacrifice.owner].cheerleaders[sacrifice.slot] = null;
        }
        setShown(next);
        setFx((current) => ({ ...current, sacrifices: [] }));
        await sleep(LANE_PAUSE_MS);
      } else if (ev.kind === 'cheerleaderPower') {
        // Kommt immer direkt nach dem Opfer: erst leert sich der Bankplatz,
        // dann wirkt die Kraft. Die Lage wird hier BEWUSST nicht auf den
        // Serverstand gezogen – was die Kraft anrichtet, kommt gleich als
        // eigene Angriffs- und Sterbe-Events bzw. am Ende der Abspielung.
        const power: CheerleaderPowerEvent = ev;
        setFx((current) => ({
          ...current,
          activeLane: power.lane,
          power: {
            key: `k-${power.owner}-${power.lane}-${Date.now()}`,
            owner: power.owner,
            lane: power.lane,
            kraft: power.kraft
          }
        }));
        showBanner(`📣 ${power.kraft}!`);
        await sleep(POWER_MS);
        if (cancelledRef.current) break;
        setFx((current) => ({ ...current, power: null }));
        await sleep(LANE_PAUSE_MS);
      }
    }

    setFx(EMPTY_FX);
    setShown(latestViewRef.current);
    runningRef.current = false;
    setIsReplaying(false);
  }

  const selectedCard: CardDef | null =
    selection && (selection.kind === 'hand' || selection.kind === 'move')
      ? shownView.hand[selection.index] ?? null
      : null;

  /**
   * Gültige eigene Ziel-Lanes für eine Karte. Eine Stelle für beide
   * Bedienwege – Ziehen fragt sie mit der gezogenen Karte, das Antippen mit
   * der ausgewählten. Karten ohne Lane-Ziel liefern eine leere Menge und sind
   * damit auch nicht ziehbar.
   */
  function laneZieleFuerKarte(card: CardDef | null): Set<number> {
    const free = new Set<number>();
    const occupied = new Set<number>();
    myBoard.forEach((c, i) => (c ? occupied.add(i) : free.add(i)));
    if (!card) return new Set<number>();
    if (card.type === 'creature') return free;
    const kind = card.effect.kind;
    if (kind === 'buffHealth' || kind === 'buffAttackTemp' || kind === 'moveCreature') {
      return occupied;
    }
    return new Set<number>();
  }

  /** Welche eigenen Lanes sind gerade gültige Tap-Ziele? */
  function laneTargets(): { lanes: Set<number> } {
    if (selection?.kind === 'fly' || selection?.kind === 'move') {
      const free = new Set<number>();
      myBoard.forEach((c, i) => {
        if (!c) free.add(i);
      });
      return { lanes: free };
    }
    if (selection?.kind === 'hand') return { lanes: laneZieleFuerKarte(selectedCard) };
    return { lanes: new Set<number>() };
  }

  const targets = laneTargets();

  function tapOwnLane(lane: number) {
    if (!myTurn) return;

    // Flug-Phase: eigene fliegende Kreatur wählen bzw. Ziel-Lane antippen
    if (shownView.phase === 'fly') {
      if (selection?.kind === 'fly' && targets.lanes.has(lane)) {
        onAction({ type: 'flyMove', fromLane: selection.fromLane, toLane: lane });
        setSelection(null);
      } else if (myBoard[lane]?.canFly) {
        setSelection({ kind: 'fly', fromLane: lane });
      }
      return;
    }

    if (!selection || !targets.lanes.has(lane)) {
      setSelection(null);
      return;
    }

    if (selection.kind === 'move') {
      onAction({
        type: 'playAction',
        handIndex: selection.index,
        targetLane: selection.fromLane,
        toLane: lane
      });
      setSelection(null);
      return;
    }

    if (selection.kind === 'hand') {
      karteAufLane(selection.index, lane);
    }
  }

  /**
   * Handkarte auf eine Lane bringen – gemeinsamer Endpunkt für Ziehen und für
   * den Tap-Weg aus dem Detailfenster. Die Regelprüfung ist vorher passiert
   * (`laneZieleFuerKarte`); hier steht nur noch, welche Aktion daraus wird.
   */
  function karteAufLane(handIndex: number, lane: number) {
    const card = shownView.hand[handIndex];
    if (!card) return;
    if (card.type === 'creature') {
      onAction({ type: 'playCreature', handIndex, lane });
    } else if (card.effect.kind === 'moveCreature') {
      // Zwei Schritte: erst die zu versetzende Kreatur, dann die Ziel-Lane.
      setSelection({ kind: 'move', index: handIndex, fromLane: lane });
      return;
    } else {
      onAction({ type: 'playAction', handIndex, targetLane: lane });
    }
    setSelection(null);
  }

  /** Kann diese Handkarte gerade bezahlt und gespielt werden? */
  function karteSpielbar(index: number): boolean {
    const card = shownView.hand[index];
    return Boolean(myTurn && shownView.phase === 'play' && card && card.cost <= energy);
  }

  const kartenZug = useKartenZug({
    // Nur Karten mit Lane-Ziel sind ziehbar; alles andere läuft über das Detail.
    ziehbar: (index) =>
      karteSpielbar(index) && laneZieleFuerKarte(shownView.hand[index] ?? null).size > 0,
    laneRects: () => eigeneLaneRects(me, shownView.lanes),
    gueltig: (lane, index) => laneZieleFuerKarte(shownView.hand[index] ?? null).has(lane),
    onAblegen: karteAufLane,
    onTippen: (index) => {
      // Eine bereits ausgewählte Karte wieder abwählen, sonst den Effekt zeigen.
      if (selection?.kind === 'hand' && selection.index === index) {
        setSelection(null);
        return;
      }
      const card = shownView.hand[index];
      if (card) openCardDetail(card, index);
    }
  });

  function openCreatureDetail(c: CreatureView) {
    setDetail({
      cardId: c.cardId,
      name: c.name,
      attack: c.attack,
      health: c.health,
      maxHealth: c.maxHealth,
      keywords: c.keywords,
      text: c.text
    });
  }

  function openCardDetail(card: CardDef, handIndex?: number) {
    setDetail({
      cardId: card.id,
      name: card.name,
      cost: card.cost,
      attack: card.type === 'creature' ? card.attack : undefined,
      health: card.type === 'creature' ? card.health : undefined,
      keywords: card.type === 'creature' ? card.keywords : [],
      text: card.text,
      signature: card.signature,
      handIndex
    });
  }

  const showSummonConfirm =
    selection?.kind === 'hand' && selectedCard?.type === 'action' &&
    selectedCard.effect.kind === 'summon';

  const statusText = isReplaying
    ? '⚔️ Kampf läuft …'
    : shownView.winner !== null
      ? 'Partie beendet'
      : reaktion !== null
        ? meineReaktion
          ? '📣 Cheerleader-Reaktion: entscheide dich'
          : 'Gegner entscheidet über eine Cheerleader-Reaktion …'
      : shownView.phase === 'fly'
        ? myTurn
          ? '🕊 Flug-Phase: fliegende Kreatur antippen und Ziel-Lane wählen'
          : 'Flug-Phase des Gegners …'
        : myTurn
          ? selection
            ? selection.kind === 'move'
              ? 'Ziel-Lane wählen'
              : 'Ziel-Lane antippen (oder Karte erneut antippen zum Abwählen)'
            : 'Du bist am Zug – Karte in eine Lane ziehen'
          : 'Gegner ist am Zug …';

  // ---- Effekt-Abfragen fürs Rendering ----
  const isAttacking = (side: PlayerIndex, lane: number) =>
    fx.projectiles.some((p) => p.attacker === side && p.lane === lane);
  const isDying = (side: PlayerIndex, lane: number) =>
    fx.dying.some((d) => d.owner === side && d.lane === lane);
  const incomingDamage = (side: PlayerIndex, lane: number) =>
    fx.impacts.find((i) => i.side === side && i.lane === lane);
  const baseHit = (side: PlayerIndex) => fx.baseImpacts.find((b) => b.side === side);
  const shieldFx = (side: PlayerIndex) => (fx.shield?.owner === side ? fx.shield : null);
  // Zauber-Effekte treffen immer eigene Lanes (Aktionskarten zielen auf sich selbst)
  const spellOnLane = (lane: number) => fx.spells.find((s) => s.lane === lane);

  const themeVars = (
    topic
      ? {
          '--lane-bg': topic.colors.lane,
          '--lane-border': topic.colors.laneBorder,
          '--theme-accent': topic.colors.accent
        }
      : {}
  ) as CSSProperties;

  // Konfetti fürs Sieges-Overlay (einmalig ausgewürfelt)
  const confetti = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 2,
        duration: 2.5 + Math.random() * 2,
        color: ['#f59e0b', '#3b82f6', '#34d399', '#f87171', '#a78bfa'][i % 5],
        size: 6 + Math.random() * 6
      })),
    []
  );

  // Beim Ziehen ersetzt die gezogene Karte die Auswahl als Quelle der
  // Lane-Markierung – sonst blieben die gültigen Ziele unsichtbar.
  const zugZiele = kartenZug.zug
    ? laneZieleFuerKarte(shownView.hand[kartenZug.zug.handIndex] ?? null)
    : null;
  const letzteLogZeile = shownView.log.at(-1)?.text ?? '';

  return (
    <div className="screen game-screen" style={themeVars}>
      {/* ---- Arena: bildschirmfüllende Bühne. Sie ist zugleich der layoutRoot
           für Battlefield3D – die 3D-Figuren, Bänke und Basen werden über die
           data-slot- und data-zone-Anker darin auf das DOM projiziert. ---- */}
      <div className="arena" style={{ '--lanes': shownView.lanes } as CSSProperties}>
        {use3d && (
          <Battlefield3D
            view={shownView}
            me={me}
            fx={fx}
            topic={topic}
            catalog={catalog}
            onUnsupported={() => setUse3d(false)}
          />
        )}

        {/* ---- Gegnerische Zone: Basis und Bank mittig über den Lanes ---- */}
        <div className="zone-band zone-oben">
          <div className="hud-gruppe">
            <div
              className="hand-backs"
              aria-label={`Gegner hat ${shownView.players[opp].handCount} Handkarten`}
            >
              {Array.from({ length: Math.min(shownView.players[opp].handCount, 5) }, (_, i) => (
                <span key={i} className="card-back" />
              ))}
              <span className="hand-count">{shownView.players[opp].handCount}</span>
            </div>
            <div className="deck-chip">📚 {shownView.players[opp].deckCount}</div>
          </div>

          <div className="zone-mitte">
            <BasisAnzeige
              leben={shownView.players[opp].base}
              treffer={baseHit(opp)}
              schild={shownView.players[opp].schild}
              abschnitte={shownView.schildAbschnitte}
              schildFx={shieldFx(opp)}
              immun={shownView.players[opp].basisImmun}
            />
            <div className="bank-anker" data-zone={opp}>
              {!use3d && (
                <CheerleaderStrip
                  side={opp}
                  slots={shownView.players[opp].cheerleaders}
                  sacrifice={fx.sacrifices.find((item) => item.owner === opp)}
                  position="opponent"
                />
              )}
            </div>
          </div>

          <div className="hud-gruppe rechts">
            <span className="runden-chip">
              {topic && (
                <span className="topic-badge" title={`Schauplatz: ${topic.name}`}>
                  {topic.emoji}{' '}
                </span>
              )}
              {shownView.round}/{shownView.roundLimit}
            </span>
            <span
              className={`conn-dot ${opponentConnected ? 'ok' : 'lost'}`}
              title={opponentConnected ? 'Gegner verbunden' : 'Gegner: Verbindung verloren'}
            />
            <span
              className={`conn-dot ${status === 'connected' ? 'ok' : 'lost'}`}
              title={status === 'connected' ? 'Verbunden' : 'Verbindung verloren'}
            />
          </div>
        </div>

        {/* ---- Lanes ---- */}
        <main className="lane-grid">
          {Array.from({ length: shownView.lanes }, (_, lane) => {
            const targetable = myTurn && (zugZiele ?? targets.lanes).has(lane);
            const dropHover = kartenZug.zug?.lane === lane;
            const flySource = selection?.kind === 'fly' && selection.fromLane === lane;
            const moveSource = selection?.kind === 'move' && selection.fromLane === lane;
            const enemyCreature = shownView.board[opp][lane];
            const ownCreature = myBoard[lane];
            const enemyDmg = incomingDamage(opp, lane);
            const ownDmg = incomingDamage(me, lane);
            const combatActive = isReplaying && fx.activeLane === lane;
            return (
              <div className={'lane' + (combatActive ? ' combat-active' : '')} key={lane}>
                <div className="slot enemy-slot" data-slot={`${opp}-${lane}`}>
                  <CreatureTile
                    key={enemyCreature?.uid ?? 'leer'}
                    creature={enemyCreature}
                    flat3d={use3d}
                    attacking={isAttacking(opp, lane)}
                    dying={isDying(opp, lane)}
                    moveDelta={enemyCreature ? moveFx[enemyCreature.uid] : undefined}
                    onDetail={openCreatureDetail}
                  />
                  {enemyDmg && <span className="dmg-float">-{enemyDmg.damage}</span>}
                </div>
                <div className="lane-label">{lane + 1}</div>
                <button
                  className={
                    'slot own-slot' +
                    (targetable ? ' targetable' : '') +
                    (dropHover ? ' drop-hover' : '') +
                    (flySource || moveSource ? ' selected-slot' : '')
                  }
                  data-slot={`${me}-${lane}`}
                  onClick={() => tapOwnLane(lane)}
                >
                  <CreatureTile
                    key={ownCreature?.uid ?? 'leer'}
                    creature={ownCreature}
                    own
                    flat3d={use3d}
                    attacking={isAttacking(me, lane)}
                    dying={isDying(me, lane)}
                    moveDelta={ownCreature ? moveFx[ownCreature.uid] : undefined}
                    onDetail={openCreatureDetail}
                  />
                  {ownDmg && <span className="dmg-float">-{ownDmg.damage}</span>}
                  {/* Zauber-Effekt (2D-Fallback ohne WebGL) */}
                  {!use3d && spellOnLane(lane) && (
                    <span className={`spell-burst spell-${spellOnLane(lane)!.effect}`} aria-hidden />
                  )}
                  {/* Cheerleader-Kraft auf dieser Lane (2D-Fallback) */}
                  {!use3d && fx.power?.lane === lane && <span className="power-burst" aria-hidden />}
                </button>
                {/* Fliegende Projektile dieser Lane (2D-Fallback – in 3D
                    übernehmen die Leucht-Geschosse des Schlachtfelds) */}
                {!use3d &&
                  fx.projectiles
                    .filter((p) => p.lane === lane)
                    .map((p) => (
                      <span
                        key={p.key}
                        className={'projectile ' + (p.attacker === me ? 'from-own' : 'from-enemy')}
                      >
                        {p.emoji}
                      </span>
                    ))}
              </div>
            );
          })}
        </main>

        {/* ---- Eigene Zone: Bank mittig, Basis dahinter ---- */}
        <div className="zone-band zone-unten">
          <div className="hud-gruppe">
            <div className={'energy-chip' + (canPlaySomething ? ' pulse' : '')}>
              ⚡ {energy}/{shownView.energyCap}
            </div>
          </div>

          <div className="zone-mitte">
            <BasisAnzeige
              leben={shownView.players[me].base}
              treffer={baseHit(me)}
              schild={shownView.players[me].schild}
              abschnitte={shownView.schildAbschnitte}
              schildFx={shieldFx(me)}
              immun={shownView.players[me].basisImmun}
            />
            <div className="bank-anker" data-zone={me}>
              {!use3d && (
                <CheerleaderStrip
                  side={me}
                  slots={shownView.players[me].cheerleaders}
                  sacrifice={fx.sacrifices.find((item) => item.owner === me)}
                  position="own"
                  bereiteSlots={
                    zeigeReaktionsAuswahl ? reaktion?.angebote.map((a) => a.slot) : undefined
                  }
                />
              )}
            </div>
          </div>

          <div className="hud-gruppe rechts">
            <div className="deck-chip">📚 {shownView.players[me].deckCount}</div>
            {shownView.phase === 'play' && myTurn && (
              <button className="pass-button" onClick={() => onAction({ type: 'pass' })}>
                Passen
              </button>
            )}
            {shownView.phase === 'fly' && myTurn && (
              <button className="pass-button" onClick={() => onAction({ type: 'flyDone' })}>
                Fertig
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---- Kampf-Log: nur die letzte Zeile schwebt mit, Tippen klappt auf ---- */}
      {letzteLogZeile && (
        <button
          className="log-ticker"
          onClick={() => setLogOffen(true)}
          aria-label="Kampf-Log öffnen"
        >
          {letzteLogZeile}
        </button>
      )}

      {/* ---- Fußbereich: Status und Hand, direkt über der Arena ---- */}
      <footer className="own-area">
        <div className={`status-band ${myTurn ? 'my-turn' : ''}`}>{statusText}</div>

        {showSummonConfirm && (
          <button
            className="primary summon-confirm"
            onClick={() => {
              onAction({ type: 'playAction', handIndex: (selection as { index: number }).index });
              setSelection(null);
            }}
          >
            {selectedCard?.name} ausspielen (freie Lanes werden automatisch gefüllt)
          </button>
        )}

        <div className="hand">
          {shownView.hand.map((card, i) => (
            <HandCard
              key={`${card.id}-${i}`}
              card={card}
              selected={selection?.kind === 'hand' && selection.index === i}
              playable={karteSpielbar(i)}
              dragging={kartenZug.zug?.handIndex === i}
              handlers={kartenZug.handlers(i)}
            />
          ))}
          {shownView.hand.length === 0 && <div className="hint empty-hand">Keine Handkarten</div>}
        </div>
      </footer>

      {/* ---- Gezogene Karte am Finger ---- */}
      {kartenZug.zug && shownView.hand[kartenZug.zug.handIndex] && (
        <div
          className={'zug-geist' + (kartenZug.zug.lane !== null ? ' ueber-ziel' : '')}
          style={{ left: kartenZug.zug.x, top: kartenZug.zug.y }}
          aria-hidden
        >
          <CardArt
            cardId={shownView.hand[kartenZug.zug.handIndex].id}
            className="zug-geist-art"
            alt=""
            fallback={
              <div className="zug-geist-fallback">
                {shownView.hand[kartenZug.zug.handIndex].type === 'creature' ? '🛡️' : '⚡'}
              </div>
            }
          />
        </div>
      )}

      {/* ---- Vollständiges Kampf-Log ---- */}
      {logOffen && (
        <div className="overlay log-overlay" onClick={() => setLogOffen(false)}>
          <div className="log-box" onClick={(e) => e.stopPropagation()}>
            <h2>Kampf-Log</h2>
            <div className="log" ref={logRef}>
              {shownView.log.map((entry) => (
                <div key={entry.id} className="log-entry">
                  {entry.text}
                </div>
              ))}
            </div>
            <button className="secondary" onClick={() => setLogOffen(false)}>
              Schließen
            </button>
          </div>
        </div>
      )}

      {/* ---- Phasen-Banner ---- */}
      {banner && (
        <div key={banner.key} className="phase-banner">
          {banner.text}
        </div>
      )}

      {/* ---- Cheerleader-Reaktion ---- */}
      {zeigeReaktionsAuswahl && reaktion && (
        <ReaktionsAuswahl
          reaktion={reaktion}
          onEntscheiden={(slot, choice) =>
            onAction({
              type: 'cheerleaderReaction',
              reactionId: reaktion.id,
              slot,
              ...(choice ? { choice } : {})
            })
          }
        />
      )}

      {/* Gegner entscheidet: nur ein Wartehinweis, keine Angebote (die Sicht
          des Gegners enthält sie ohnehin nicht). */}
      {reaktion !== null && !meineReaktion && !isReplaying && view.winner === null && (
        <div className="reaction-waiting" role="status">
          📣 Der Gegner entscheidet über eine Cheerleader-Reaktion …
        </div>
      )}

      {/* ---- Karten-Detailansicht ---- */}
      {detail && (
        <div className="overlay detail-overlay" onClick={() => setDetail(null)}>
          <div className="detail-card" onClick={(e) => e.stopPropagation()}>
            <div className="detail-art">
              <CardArt
                cardId={detail.cardId}
                className="detail-art-img"
                alt={detail.name}
                fallback={<div className="detail-art-fallback">🃏</div>}
              />
              {detail.cost !== undefined && <span className="cost detail-cost">{detail.cost}</span>}
            </div>
            <h2 className="detail-name">
              {detail.signature ? '★ ' : ''}
              {detail.name}
            </h2>
            {detail.attack !== undefined && (
              <div className="detail-stats">
                <span className="detail-stat">⚔ {detail.attack}</span>
                <span className="detail-stat">
                  ♥ {detail.health}
                  {detail.maxHealth !== undefined ? `/${detail.maxHealth}` : ''}
                </span>
              </div>
            )}
            {detail.keywords.length > 0 && (
              <div className="detail-keywords">
                {detail.keywords.map((k) => (
                  <div key={k} className="detail-keyword">
                    <strong>{keywordInfo?.[k]?.label ?? k}</strong>
                    <span>{keywordInfo?.[k]?.description ?? ''}</span>
                  </div>
                ))}
              </div>
            )}
            {detail.text && <p className="detail-text">{detail.text}</p>}
            {/* Rückfallebene zum Ziehen – und der einzige Weg für Karten ohne
                Lane-Ziel. Danach greift die normale Tap-auf-Lane-Auswahl. */}
            {detail.handIndex !== undefined && karteSpielbar(detail.handIndex) && (
              <button
                className="primary"
                onClick={() => {
                  setSelection({ kind: 'hand', index: detail.handIndex! });
                  setDetail(null);
                }}
              >
                Ausspielen
              </button>
            )}
            <button className="secondary" onClick={() => setDetail(null)}>
              Schließen
            </button>
          </div>
        </div>
      )}

      {/* ---- Spielende ---- */}
      {shownView.winner !== null && (
        <div className="overlay">
          {shownView.winner === me && (
            <div className="confetti" aria-hidden>
              {confetti.map((c, i) => (
                <span
                  key={i}
                  style={{
                    left: `${c.left}%`,
                    background: c.color,
                    width: c.size,
                    height: c.size * 0.6,
                    animationDelay: `${c.delay}s`,
                    animationDuration: `${c.duration}s`
                  }}
                />
              ))}
            </div>
          )}
          <div
            className={
              'overlay-box ' +
              (shownView.winner === 'draw' ? 'draw' : shownView.winner === me ? 'win' : 'lose')
            }
          >
            <h1>
              {shownView.winner === 'draw'
                ? '🤝 Unentschieden!'
                : shownView.winner === me
                  ? '🏆 Du gewinnst!'
                  : '💀 Du verlierst!'}
            </h1>
            <p>
              Basis-Leben: Du {Math.max(0, shownView.players[me].base)} – Gegner{' '}
              {Math.max(0, shownView.players[opp].base)}
            </p>
            <button className="primary big" onClick={onLeave}>
              Zurück zum Start
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Karten-Artwork: Es wird immer /assets/cards/<id>.png versucht – existiert
 * das Bild nicht, erscheint der Fallback. So braucht ein neues Artwork nur
 * als PNG mit der Karten-id abgelegt zu werden, ohne Codeänderung.
 */
function CardArt({
  cardId,
  className,
  alt,
  fallback
}: {
  cardId: string;
  className: string;
  alt: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <img
      src={`/assets/cards/${cardId}.png`}
      className={className}
      alt={alt}
      // Ohne das startet der Browser beim Ziehen seinen eigenen Bild-Drag,
      // schickt ein `pointercancel` – und der Kartenzug bricht sofort ab.
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Basis-Schild als Segmentbalken. Jeder Treffer an der Basis füllt 1–3
 * Abschnitte; ist der Balken voll, blockt der Schild und löst eine Superkraft
 * aus (der Server schickt dann ein SchildEvent mit `blockiert`).
 */
function ShieldMeter({
  stand,
  abschnitte,
  fx,
  immun
}: {
  stand: number;
  abschnitte: number;
  fx: FxShield | null;
  immun: boolean;
}) {
  // 0 Abschnitte = Schild-Regel in der Config abgeschaltet: gar nichts rendern.
  if (abschnitte <= 0) return null;
  const klassen = [
    'shield-meter',
    fx?.blockiert ? 'blocked' : '',
    fx && !fx.blockiert ? 'charging' : '',
    immun ? 'immun' : ''
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={klassen}
      title={immun ? 'Schutzschild aktiv: keine Basis-Treffer in dieser Runde' : `Schild ${stand}/${abschnitte}`}
      aria-label={`Schild ${stand} von ${abschnitte}`}
    >
      {Array.from({ length: abschnitte }, (_, i) => (
        <span key={i} className={`shield-seg ${i < stand ? 'filled' : ''}`} />
      ))}
    </div>
  );
}

/**
 * Basis einer Seite: Leben und Schildbalken direkt neben der Bank, statt in
 * einer eigenen Leiste am Bildschirmrand. Die Trefferanimation (`hit`) und die
 * aufsteigende Schadenszahl bleiben unverändert, sie hängen nur an einem
 * anderen Element.
 */
function BasisAnzeige({
  leben,
  treffer,
  schild,
  abschnitte,
  schildFx,
  immun
}: {
  leben: number;
  treffer?: FxBaseImpact;
  schild: number;
  abschnitte: number;
  schildFx: FxShield | null;
  immun: boolean;
}) {
  return (
    <div className={`basis-anzeige${treffer ? ' hit' : ''}`}>
      <div className="basis-wert" title={`Basis-Leben: ${Math.max(0, leben)}`}>
        <span aria-hidden>🏰</span>
        <strong>{Math.max(0, leben)}</strong>
        {treffer && <span className="dmg-float">-{treffer.damage}</span>}
      </div>
      <ShieldMeter stand={schild} abschnitte={abschnitte} fx={schildFx} immun={immun} />
    </div>
  );
}

function CreatureTile({
  creature,
  own,
  flat3d,
  attacking,
  dying,
  moveDelta,
  onDetail
}: {
  creature: CreatureView | null;
  own?: boolean;
  /** 3D-Modus: Figur zeichnet das Schlachtfeld-Canvas, hier nur Overlays. */
  flat3d?: boolean;
  attacking?: boolean;
  dying?: boolean;
  /** Lane-Differenz (alt − neu), wenn die Figur gerade die Lane gewechselt hat. */
  moveDelta?: number;
  onDetail?: (c: CreatureView) => void;
}) {
  const longPress = useLongPress(
    creature && onDetail ? () => onDetail(creature) : undefined
  );
  if (!creature) return <span className="empty-slot">frei</span>;
  const attackBuffed = creature.attack > creature.baseAttack;
  const attackReduced = creature.attack < creature.baseAttack;
  const healthBuffed = creature.maxHealth > creature.baseMaxHealth;
  const damaged = creature.health < creature.maxHealth;

  return (
    <div
      className={
        'creature-figure' +
        (creature.exhausted ? ' exhausted' : '') +
        (own ? ' own' : ' enemy') +
        (creature.canFly ? ' can-fly' : '') +
        (attacking ? ' attacking' : '') +
        (dying ? ' dying' : '') +
        (moveDelta !== undefined ? ' lane-move' : '') +
        (flat3d ? ' figure-3d' : '') +
        ` card-${creature.cardId}`
      }
      style={
        moveDelta !== undefined
          ? ({ '--move-x': `calc(${moveDelta} * (100% + 20px))` } as CSSProperties)
          : undefined
      }
      {...longPress.handlers}
      onClick={(e) => {
        // Nach langem Drücken den normalen Tap unterdrücken (sonst würde
        // z. B. die Lane darunter ausgewählt).
        if (longPress.fired.current) {
          e.preventDefault();
          e.stopPropagation();
          longPress.fired.current = false;
        }
      }}
    >
      <div
        className="figure-frame"
        style={flat3d ? undefined : { animationDelay: `${-((creature.uid % 7) * 0.4)}s` }}
      >
        {/* Im 3D-Modus steht hier die WebGL-Figur – der Rahmen bleibt als
            unsichtbarer Träger für die ATK/HP-Badges erhalten. */}
        {!flat3d && (
          <CardArt
            cardId={creature.cardId}
            className="figure-image"
            alt={creature.name}
            fallback={
              <div className="figure-image-fallback">
                {creature.cardId === 'ratte' ? '🐀' : creature.canFly ? '🕊️' : '⚔️'}
              </div>
            }
          />
        )}
        <div className={`figure-stat stat-atk ${attackBuffed ? 'buffed' : attackReduced ? 'reduced' : ''}`}>
          {creature.attack}
        </div>
        <div className={`figure-stat stat-hp ${damaged ? 'damaged' : healthBuffed ? 'buffed' : ''}`}>
          {creature.health}
        </div>
      </div>
      <div className="figure-plaque" title={creature.name}>
        {creature.name}
      </div>
      {creature.keywords.length > 0 && (
        <div className="figure-keywords" title={creature.keywords.join(' · ')}>
          {creature.keywords[0]}
        </div>
      )}
    </div>
  );
}

/**
 * Kompakte Handkarte: Artwork füllt die Karte, Kosten als Kreis oben rechts,
 * ATK/HP als kleine Marken unten. Der Regeltext steht bewusst NICHT mehr auf
 * der Karte – ihn zeigt das Antippen im Detailfenster. Ausgespielt wird per
 * Ziehen, deshalb kommen alle Zeiger-Ereignisse von `useKartenZug`.
 */
function HandCard({
  card,
  selected,
  playable,
  dragging,
  handlers
}: {
  card: CardDef;
  selected: boolean;
  playable: boolean;
  dragging: boolean;
  handlers: Record<string, unknown>;
}) {
  return (
    <button
      className={
        'hand-card' +
        (selected ? ' selected' : '') +
        (playable ? ' playable' : ' unplayable') +
        (dragging ? ' dragging' : '') +
        (card.signature ? ' signature-card' : '') +
        ` faction-${card.faction}`
      }
      type="button"
      aria-label={`${card.name}, Kosten ${card.cost}`}
      {...handlers}
    >
      <CardArt
        cardId={card.id}
        className="hand-card-art"
        alt=""
        fallback={
          <div className={`hand-card-art-fallback theme-${card.faction}`}>
            <span className="fallback-symbol">{card.type === 'creature' ? '🛡️' : '⚡'}</span>
          </div>
        }
      />
      <span className="cost">{card.cost}</span>
      <span className="hand-card-name">
        {card.signature ? '★ ' : ''}
        {card.name}
      </span>
      {card.type === 'creature' ? (
        <span className="hand-card-stats">
          <span className="hand-stat atk">{card.attack}</span>
          <span className="hand-stat hp">{card.health}</span>
        </span>
      ) : (
        <span className="hand-card-stats action-label">Aktion</span>
      )}
    </button>
  );
}
