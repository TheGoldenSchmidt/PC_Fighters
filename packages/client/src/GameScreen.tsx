// Spielfeld: gegnerische Basis oben, eigene unten, Lanes dazwischen
// (dynamisch aus der Config – auch 4+ Lanes funktionieren), Handkarten
// als scrollbare Leiste. Bedienung über große Tap-Flächen statt Drag & Drop.
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
  ClientView,
  CreatureView,
  DeathEvent,
  LogEvent,
  PlayerAction,
  PlayerIndex,
  SpellEvent,
  Topic,
  VisualCatalog
} from '@pcf/engine';
import type { ConnectionStatus, KeywordInfo } from './useGame';
import { Battlefield3D, webglSupported, type SpellEffectKind } from './Battlefield3D';

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

interface FxState {
  projectiles: FxProjectile[];
  impacts: FxImpact[];
  baseImpacts: FxBaseImpact[];
  dying: { lane: number; owner: PlayerIndex }[];
  spells: FxSpell[];
  activeLane: number | null;
}

const EMPTY_FX: FxState = {
  projectiles: [],
  impacts: [],
  baseImpacts: [],
  dying: [],
  spells: [],
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
}

// Timing der Kampf-Abspielung (Millisekunden)
const PROJECTILE_MS = 500;
const IMPACT_MS = 650;
const DEATH_MS = 600;
const SPELL_MS = 750;
const LANE_PAUSE_MS = 200;
const BANNER_MS = 1500;
const LONG_PRESS_MS = 450;

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
  const [use3d, setUse3d] = useState(webglSupported);
  const [shownView, setShownViewState] = useState<ClientView>(view);
  const [isReplaying, setIsReplaying] = useState(false);
  const [fx, setFx] = useState<FxState>(EMPTY_FX);
  const [moveFx, setMoveFx] = useState<Record<number, number>>({});
  const [banner, setBanner] = useState<{ key: number; text: string } | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
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
  const myTurn = shownView.active === me && shownView.winner === null && !isReplaying;
  const myBoard = shownView.board[me];
  const energy = shownView.players[me].energy;
  const canPlaySomething =
    myTurn && shownView.phase === 'play' && shownView.hand.some((c) => c.cost <= energy);

  // Auswahl zurücksetzen, wenn sich die angezeigte Lage ändert
  useEffect(() => setSelection(null), [shownView]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [shownView.log.length]);

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
              (attackerCreature?.keywords.includes('gift') ? '☠️' : '💥')
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
            baseImpacts.push({ key: `b-${g.lane}-${i}-${Date.now()}`, side: defender, damage: g.damage });
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
      } else {
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

  /** Welche eigenen Lanes sind gerade gültige Tap-Ziele? */
  function laneTargets(): { lanes: Set<number> } {
    const free = new Set<number>();
    const occupied = new Set<number>();
    myBoard.forEach((c, i) => (c ? occupied.add(i) : free.add(i)));

    if (selection?.kind === 'fly' || selection?.kind === 'move') {
      return { lanes: free };
    }
    if (selection?.kind === 'hand' && selectedCard) {
      if (selectedCard.type === 'creature') return { lanes: free };
      const kind = selectedCard.effect.kind;
      if (kind === 'buffHealth' || kind === 'buffAttackTemp' || kind === 'moveCreature') {
        return { lanes: occupied };
      }
    }
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

    if (selection.kind === 'hand' && selectedCard) {
      if (selectedCard.type === 'creature') {
        onAction({ type: 'playCreature', handIndex: selection.index, lane });
      } else if (selectedCard.effect.kind === 'moveCreature') {
        setSelection({ kind: 'move', index: selection.index, fromLane: lane });
        return;
      } else {
        onAction({ type: 'playAction', handIndex: selection.index, targetLane: lane });
      }
      setSelection(null);
    }
  }

  function tapHandCard(index: number) {
    if (!myTurn || shownView.phase !== 'play') return;
    const card = shownView.hand[index];
    if (!card || card.cost > energy) return;
    setSelection(
      selection?.kind === 'hand' && selection.index === index ? null : { kind: 'hand', index }
    );
  }

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

  function openCardDetail(card: CardDef) {
    setDetail({
      cardId: card.id,
      name: card.name,
      cost: card.cost,
      attack: card.type === 'creature' ? card.attack : undefined,
      health: card.type === 'creature' ? card.health : undefined,
      keywords: card.type === 'creature' ? card.keywords : [],
      text: card.text,
      signature: card.signature
    });
  }

  const showSummonConfirm =
    selection?.kind === 'hand' && selectedCard?.type === 'action' &&
    selectedCard.effect.kind === 'summon';

  const statusText = isReplaying
    ? '⚔️ Kampf läuft …'
    : shownView.winner !== null
      ? 'Partie beendet'
      : shownView.phase === 'fly'
        ? myTurn
          ? '🕊 Flug-Phase: fliegende Kreatur antippen und Ziel-Lane wählen'
          : 'Flug-Phase des Gegners …'
        : myTurn
          ? selection
            ? selection.kind === 'move'
              ? 'Ziel-Lane wählen'
              : 'Ziel antippen (oder Karte erneut antippen zum Abwählen)'
            : 'Du bist am Zug'
          : 'Gegner ist am Zug …';

  // ---- Effekt-Abfragen fürs Rendering ----
  const isAttacking = (side: PlayerIndex, lane: number) =>
    fx.projectiles.some((p) => p.attacker === side && p.lane === lane);
  const isDying = (side: PlayerIndex, lane: number) =>
    fx.dying.some((d) => d.owner === side && d.lane === lane);
  const incomingDamage = (side: PlayerIndex, lane: number) =>
    fx.impacts.find((i) => i.side === side && i.lane === lane);
  const baseHit = (side: PlayerIndex) => fx.baseImpacts.find((b) => b.side === side);
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

  return (
    <div className="screen game-screen" style={themeVars}>
      {/* ---- Kopfzeile: Gegner ---- */}
      <header className="player-bar opponent-bar">
        <div className={`base-chip ${baseHit(opp) ? 'hit' : ''}`}>
          🏰 {Math.max(0, shownView.players[opp].base)}
          {baseHit(opp) && <span className="dmg-float">-{baseHit(opp)!.damage}</span>}
        </div>
        <div
          className="hand-backs"
          aria-label={`Gegner hat ${shownView.players[opp].handCount} Handkarten`}
        >
          {Array.from({ length: Math.min(shownView.players[opp].handCount, 10) }, (_, i) => (
            <span key={i} className="card-back" />
          ))}
          <span className="hand-count">{shownView.players[opp].handCount}</span>
        </div>
        <div className="deck-chip">📚 {shownView.players[opp].deckCount}</div>
        <div
          className={`conn-dot ${opponentConnected ? 'ok' : 'lost'}`}
          title={opponentConnected ? 'Gegner verbunden' : 'Gegner: Verbindung verloren'}
        />
      </header>

      <div className="round-bar">
        <span>
          {topic && (
            <span className="topic-badge" title={`Schauplatz: ${topic.name}`}>
              {topic.emoji}{' '}
            </span>
          )}
          Runde {shownView.round}/{shownView.roundLimit}
        </span>
        <span className={`turn-indicator ${myTurn ? 'my-turn' : ''}`}>{statusText}</span>
        <span
          className={`conn-dot ${status === 'connected' ? 'ok' : 'lost'}`}
          title={status === 'connected' ? 'Verbunden' : 'Verbindung verloren'}
        />
      </div>

      {/* ---- Lanes ---- */}
      <main className="lanes" style={{ '--lanes': shownView.lanes } as CSSProperties}>
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
        {Array.from({ length: shownView.lanes }, (_, lane) => {
          const targetable = myTurn && targets.lanes.has(lane);
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
              <div className="lane-label">Lane {lane + 1}</div>
              <button
                className={
                  'slot own-slot' +
                  (targetable ? ' targetable' : '') +
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

      {/* ---- Kampf-Log ---- */}
      <div className="log" ref={logRef}>
        {shownView.log.map((entry) => (
          <div key={entry.id} className="log-entry">
            {entry.text}
          </div>
        ))}
      </div>

      {/* ---- Fußzeile: eigene Werte, Buttons, Hand ---- */}
      <footer className="own-area">
        <div className="player-bar own-bar">
          <div className={`base-chip ${baseHit(me) ? 'hit' : ''}`}>
            🏰 {Math.max(0, shownView.players[me].base)}
            {baseHit(me) && <span className="dmg-float">-{baseHit(me)!.damage}</span>}
          </div>
          <div className={'energy-chip' + (canPlaySomething ? ' pulse' : '')}>
            ⚡ {energy}/{shownView.energyCap}
          </div>
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
              playable={myTurn && shownView.phase === 'play' && card.cost <= energy}
              onTap={() => tapHandCard(i)}
              onDetail={openCardDetail}
            />
          ))}
          {shownView.hand.length === 0 && <div className="hint empty-hand">Keine Handkarten</div>}
        </div>
        <p className="hint press-hint">Tipp: Karte oder Figur lange gedrückt halten für Details</p>
      </footer>

      {/* ---- Phasen-Banner ---- */}
      {banner && (
        <div key={banner.key} className="phase-banner">
          {banner.text}
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
      onError={() => setFailed(true)}
    />
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

function HandCard({
  card,
  selected,
  playable,
  onTap,
  onDetail
}: {
  card: CardDef;
  selected: boolean;
  playable: boolean;
  onTap: () => void;
  onDetail: (card: CardDef) => void;
}) {
  const longPress = useLongPress(() => onDetail(card));
  return (
    <button
      className={
        'hand-card' +
        (selected ? ' selected' : '') +
        (playable ? ' playable' : ' unplayable') +
        (card.signature ? ' signature-card' : '') +
        ` faction-${card.faction}`
      }
      {...longPress.handlers}
      onClick={() => {
        if (longPress.fired.current) {
          longPress.fired.current = false;
          return;
        }
        onTap();
      }}
    >
      <div className="hand-card-top">
        <span className="cost">{card.cost}</span>
        <span className="hand-card-name">
          {card.signature ? '★ ' : ''}
          {card.name}
        </span>
      </div>

      <div className="hand-card-art-container">
        <CardArt
          cardId={card.id}
          className="hand-card-art"
          alt={card.name}
          fallback={
            <div className={`hand-card-art-fallback theme-${card.faction}`}>
              <span className="fallback-symbol">{card.type === 'creature' ? '🛡️' : '⚡'}</span>
            </div>
          }
        />
      </div>

      {card.type === 'creature' ? (
        <div className="hand-card-stats">
          ⚔ {card.attack} &nbsp; ♥ {card.health}
        </div>
      ) : (
        <div className="hand-card-stats action-label">Aktion</div>
      )}
      {card.text && <div className="hand-card-text">{card.text}</div>}
    </button>
  );
}
