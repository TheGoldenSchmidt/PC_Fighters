// Die Arena: Layout, Bedienung und Zusammenbau.
//
// Diese Datei orchestriert nur noch – sie haelt den Bildschirmzustand
// (Auswahl, Detailfenster, 3D an/aus), uebersetzt Eingaben in `PlayerAction`s
// und setzt die Teile zusammen. Alles andere liegt daneben in `arena/`:
//
//   fx.ts              Formen und Timing der Kampf-Abspielung
//   useKampfReplay.ts  die Abspielung selbst (shownView, Effekte, Banner)
//   Karten.tsx         Artwork, Handkarte, Detailansicht
//   CreatureTile.tsx   Figur auf dem Feld
//   Anzeigen.tsx       Schild, Basis, Cheerleader-Bank
//   ReaktionsAuswahl.tsx  Auswahl beim Schild-Block
//   useLongPress.ts    langes Druecken
//   useWertPuls.ts     kurzer Blitz, wenn sich ein Zaehler aendert
//
// Zum Layout: Das Lane-Raster folgt der verbindlichen Fünf-Bahnen-Konfiguration.
// liegt in einem mittleren Band, davor und dahinter steht mittig die
// Cheerleader-Bank mit der Basis dahinter. Alle Anzeigen schweben als Chips
// darueber; es gibt bewusst KEINE Kopf-/Fusszeile mehr – der tote Rand oben
// und unten war genau das, was hier verschwinden sollte.
//
// Bedienung: Handkarten werden in eine Lane GEZOGEN (`useKartenZug`, Pointer-
// Events). Kurzes Antippen oeffnet stattdessen die Detailansicht mit dem
// Karteneffekt; von dort fuehrt „Ausspielen" in die alte Tap-auf-Lane-Auswahl,
// die Karten ohne Lane-Ziel (Beschwoerung) und die Flug-Phase weiterhin braucht.

import { Suspense, lazy, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type {
  CardDef,
  ClientView,
  CreatureView,
  PlayerAction,
  PlayerIndex,
  ReaktionsView,
  Topic,
  VisualCatalog
} from '@pcf/engine';
import type { ConnectionStatus, KeywordInfo } from './useGame';
import { webglSupported } from './webgl';
import { eigeneLaneRects, useKartenZug } from './useKartenZug';
import { useKampfReplay } from './arena/useKampfReplay';
import { CardArt, CardPosterFallback, HandCard, KartenDetail, type DetailData } from './arena/Karten';
import { CreatureTile } from './arena/CreatureTile';
import { BasisAnzeige, CheerleaderStrip } from './arena/Anzeigen';
import { ReaktionsAuswahl } from './arena/ReaktionsAuswahl';
import { CoachHint } from './arena/CoachHint';
import { AktionsAuswahl } from './arena/AktionsAuswahl';
import { useDialogFocus } from './arena/useDialogFocus';
import { playFeedback } from './feedback';
import { defaultProfile, type LocalProfileV1 } from './profile';
import { useWertPuls } from './arena/useWertPuls';

/**
 * Das 3D-Schlachtfeld zieht three.js nach (gut 600 kB). Es wird erst geladen,
 * wenn wirklich in 3D gespielt wird – der Startbildschirm und der
 * `?no3d`-Fallback kommen ohne aus. `Suspense` faellt derweil auf nichts
 * zurueck: Die Arena steht auch ohne Canvas vollstaendig da.
 */
const Battlefield3D = lazy(() =>
  import('./Battlefield3D').then((m) => ({ default: m.Battlefield3D }))
);

interface Props {
  pendingAction?: boolean;
  view: ClientView;
  topic: Topic | null;
  keywordInfo: KeywordInfo | null;
  catalog: VisualCatalog | null;
  status: ConnectionStatus;
  opponentConnected: boolean;
  profile?: LocalProfileV1;
  roomCode?: string;
  matchNumber?: number;
  rematchReady?: [boolean, boolean];
  onUpdateProfile?: (change: (current: LocalProfileV1) => LocalProfileV1) => void;
  onRecordMatch?: (matchId: string, result: 'win' | 'loss' | 'draw') => void;
  onRematchReady?: (ready: boolean) => void;
  onAction: (action: PlayerAction) => void;
  onLeave: () => void;
}

type Selection =
  | { kind: 'hand'; index: number }
  | { kind: 'move'; index: number; fromLane: number }
  | { kind: 'fly'; fromLane: number; targetUid?: number }
  | null;

export function GameScreen({
  pendingAction = false,
  view,
  topic,
  keywordInfo,
  catalog,
  status,
  opponentConnected,
  profile = defaultProfile(),
  roomCode = '',
  matchNumber = 1,
  rematchReady = [false, false],
  onUpdateProfile = () => {},
  onRecordMatch = () => {},
  onRematchReady = () => {},
  onAction,
  onLeave
}: Props) {
  const [selection, setSelection] = useState<Selection>(null);
  const [targetUid, setTargetUid] = useState<number | undefined>();
  // 3D-Figuren nur, wenn der Browser WebGL kann – sonst 2D-Fallback (Artwork)
  const [use3d, setUse3d] = useState(
    () => !new URLSearchParams(window.location.search).has('no3d') && webglSupported(),
  );
  const { shownView, isReplaying, replayKind, fx, moveFx, banner, showBanner } = useKampfReplay(
    view,
    profile.settings.replaySpeed
  );
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Kampf-Log: normal nur als Ticker sichtbar, auf Tippen als Overlay. */
  const [logOffen, setLogOffen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const settingsDialogRef = useDialogFocus<HTMLDivElement>(settingsOpen, () => setSettingsOpen(false));
  const logDialogRef = useDialogFocus<HTMLDivElement>(logOffen, () => setLogOffen(false));
  const resultDialogRef = useDialogFocus<HTMLDivElement>(shownView.winner !== null);

  const me = view.you;
  const opp: PlayerIndex = me === 0 ? 1 : 0;

  const setSetting = <K extends keyof LocalProfileV1['settings'],>(
    key: K,
    value: LocalProfileV1['settings'][K]
  ) =>
    onUpdateProfile((current) => ({
      ...current,
      settings: { ...current.settings, [key]: value }
    }));

  const finishCoach = (key: 'firstTurn' | 'combat' | 'shield', skipped = false) =>
    onUpdateProfile((current) => ({
      ...current,
      onboarding: {
        ...current.onboarding,
        [key]: true,
        ...(skipped ? { skipped: true } : {})
      }
    }));

  // Reaktionsfenster kommen IMMER aus der neuesten Serversicht, nicht aus
  // shownView: während einer Abspielung hinkt die angezeigte Lage absichtlich
  // hinterher, die Frage an den Spieler darf das aber nicht.
  const reaktion: ReaktionsView | null = view.reaktion ?? null;
  const meineReaktion = reaktion !== null && reaktion.spieler === me;
  // Erst fragen, wenn die Animation durch ist – sonst klickt man blind.
  const zeigeReaktionsAuswahl = meineReaktion && !isReplaying && view.winner === null;

  // Ein offenes Fenster sperrt jede normale Aktion, auch die des Gegners.
  const myTurn =
    shownView.active === me && shownView.winner === null && !isReplaying && reaktion === null && !view.choice && status === 'connected' && !pendingAction;
  const myBoard = shownView.board[me];
  const energy = shownView.players[me].energy;
  // Zaehler-Blitz: die drei Chips aendern sich sonst lautlos mitten im Spiel.
  const energiePuls = useWertPuls(energy);
  const deckPuls = useWertPuls(shownView.players[me].deckCount);
  const rundenPuls = useWertPuls(shownView.round);

  // Auswahl zurücksetzen, wenn sich die angezeigte Lage ändert
  useEffect(() => { setSelection(null); setTargetUid(undefined); }, [shownView]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [shownView.log.length, logOffen]);

  useEffect(() => {
    if (fx.projectiles.length > 0) {
      playFeedback('attack', profile.settings.sound, profile.settings.haptics);
    }
  }, [fx.projectiles.length, profile.settings.haptics, profile.settings.sound]);

  useEffect(() => {
    if (fx.impacts.length > 0) {
      playFeedback('impact', profile.settings.sound, profile.settings.haptics);
    }
    if (fx.baseImpacts.length > 0) {
      playFeedback('base', profile.settings.sound, profile.settings.haptics);
    }
  }, [fx.baseImpacts.length, fx.impacts.length, profile.settings.haptics, profile.settings.sound]);

  useEffect(() => {
    if (fx.shield?.blockiert) {
      playFeedback('shield', profile.settings.sound, profile.settings.haptics);
    }
  }, [fx.shield?.blockiert, profile.settings.haptics, profile.settings.sound]);

  useEffect(() => {
    if (fx.power) playFeedback('power', profile.settings.sound, profile.settings.haptics);
  }, [fx.power, profile.settings.haptics, profile.settings.sound]);

  const recordedWinner = useRef<string | null>(null);
  useEffect(() => {
    if (view.winner === null) return;
    const matchId = `${roomCode}:${matchNumber}`;
    if (recordedWinner.current === matchId) return;
    recordedWinner.current = matchId;
    const result = view.winner === 'draw' ? 'draw' : view.winner === me ? 'win' : 'loss';
    onRecordMatch(matchId, result);
    playFeedback(result === 'win' ? 'win' : 'lose', profile.settings.sound, profile.settings.haptics);
  }, [
    me,
    onRecordMatch,
    profile.settings.haptics,
    profile.settings.sound,
    roomCode,
    matchNumber,
    view.log,
    view.round,
    view.winner
  ]);

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
    if (card && shownView.legalActions && (card.type === 'action' || card.type === 'superpower') && card.effect.kind === 'script') {
      const index = shownView.hand.indexOf(card);
      return new Set(shownView.legalActions.flatMap(a => a.type === 'playAction' && a.handIndex === index && a.targetLane !== undefined ? [a.targetLane] : []));
    }
    if (card && shownView.legalActions && card.type === 'creature') {
      const index = shownView.hand.indexOf(card);
      return new Set(shownView.legalActions.flatMap(a => a.type === 'playCreature' && a.handIndex === index ? [a.lane] : []));
    }
    const free = new Set<number>();
    const occupied = new Set<number>();
    myBoard.forEach((c, i) => (c ? occupied.add(i) : free.add(i)));
    if (!card) return new Set<number>();
    if (card.type === 'creature') {
      if (shownView.phase !== 'play') return new Set<number>();
      const result = new Set<number>();
      myBoard.forEach((creature, lane) => {
        const team = shownView.teamBoard[me]?.[lane];
        const waterAllowed = lane !== shownView.lanes - 1 || card.keywords.includes('amphibious');
        if (!waterAllowed || team) return;
        if (!creature || creature.keywords.includes('team_up') || card.keywords.includes('team_up')) result.add(lane);
      });
      return result;
    }
    if (card.type === 'environment') return new Set(Array.from({ length: shownView.lanes }, (_, lane) => lane));
    const kind = card.effect.kind;
    if (kind === 'buffHealth' || kind === 'buffAttackTemp' || kind === 'buff' || kind === 'bonusAttack' || kind === 'moveCreature') {
      return occupied;
    }
    if (kind === 'damage') return new Set(Array.from({ length: shownView.lanes }, (_, lane) => lane));
    if (kind === 'destroy') {
      return new Set(shownView.board[opp].flatMap((creature, lane) => creature ? [lane] : []));
    }
    if (kind === 'referenz') return new Set(Array.from({ length: shownView.lanes }, (_, lane) => lane));
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
        onAction({ type: 'flyMove', fromLane: selection.fromLane, toLane: lane, ...(selection.targetUid !== undefined ? { targetUid: selection.targetUid } : {}) });
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
  function karteAufLane(handIndex: number, lane: number, uid?: number) {
    const card = shownView.hand[handIndex];
    if (!card) return;
    if ((card.type === 'action' || card.type === 'superpower') && card.effect.kind === 'script') {
      const actions = (shownView.legalActions ?? []).filter((a): a is Extract<PlayerAction, { type: 'playAction' }> => a.type === 'playAction' && a.handIndex === handIndex && a.targetLane === lane && (uid === undefined || a.targetUid === uid));
      setSelection({ kind: 'hand', index: handIndex });
      if (actions.length === 1 && actions[0].toLane === undefined && actions[0].secondUid === undefined) { onAction(actions[0]); setSelection(null); }
      else setTargetUid(uid);
      return;
    }
    playFeedback('card', profile.settings.sound, profile.settings.haptics);
    if (card.type === 'creature') {
      onAction({ type: 'playCreature', handIndex, lane });
    } else if (card.type === 'environment') {
      onAction({ type: 'playEnvironment', handIndex, lane });
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
    if (shownView.legalActions) return myTurn && shownView.legalActions.some(a => 'handIndex' in a && a.handIndex === index);
    return Boolean(
      myTurn &&
      (shownView.phase === 'play' || shownView.phase === 'precombat') &&
      card &&
      card.cost <= energy &&
      (shownView.phase !== 'precombat' || card.type !== 'creature')
    );
  }

  const kartenZug = useKartenZug({
    // Nur Karten mit Lane-Ziel sind ziehbar; alles andere läuft über das Detail.
    ziehbar: (index) =>
      karteSpielbar(index) && laneZieleFuerKarte(shownView.hand[index] ?? null).size > 0,
    laneRects: (index) => {
      const card = shownView.hand[index];
      if (card && (card.type === 'action' || card.type === 'superpower') && card.effect.kind === 'script') {
        const actions = shownView.legalActions?.filter(a => a.type === 'playAction' && a.handIndex === index) ?? [];
        return actions.flatMap(a => {
          if (a.type !== 'playAction' || a.targetUid === undefined || a.targetLane === undefined) return [];
          const el = document.querySelector<HTMLElement>(`[data-target-uid="${a.targetUid}"]`);
          if (!el) return [];
          const r = el.getBoundingClientRect();
          return [{ lane: a.targetLane, uid: a.targetUid, left: r.left, right: r.right, top: r.top, bottom: r.bottom }];
        });
      }
      return eigeneLaneRects(me, shownView.lanes);
    },
    gueltig: (lane, index) => laneZieleFuerKarte(shownView.hand[index] ?? null).has(lane),
    onAblegen: karteAufLane,
    onTippen: (index) => {
      // Eine bereits ausgewählte Karte wieder abwählen, sonst den Effekt zeigen.
      if (selection?.kind === 'hand' && selection.index === index) {
        setSelection(null);
        return;
      }
      const card = shownView.hand[index];
      if (card && myTurn) { setSelection({ kind: 'hand', index }); setTargetUid(undefined); }
      else if (card) openCardDetail(card, index);
    }
  });

  function openCreatureDetail(c: CreatureView) {
    setDetail({
      cardId: c.cardId,
      type: 'creature',
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
      faction: card.faction,
      type: card.type,
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

  const scriptSelected = selectedCard && (selectedCard.type === 'action' || selectedCard.type === 'superpower') && selectedCard.effect.kind === 'script';
  const scriptOptions = scriptSelected && selection?.kind === 'hand' ? (shownView.legalActions ?? []).filter((a): a is Extract<PlayerAction, { type: 'playAction' }> => a.type === 'playAction' && a.handIndex === selection.index) : [];
  const figureTarget = (uid?: number) => uid !== undefined && scriptOptions.some(a => a.targetUid === uid);
  function chooseFigure(uid?: number) {
    if (!myTurn || !figureTarget(uid)) return;
    const actions = scriptOptions.filter(a => a.targetUid === uid);
    if (actions.length === 1 && actions[0].toLane === undefined && actions[0].secondUid === undefined) { onAction(actions[0]); setSelection(null); }
    else setTargetUid(uid);
  }
  const targetEffect = (uid?: number) => fx.spells.filter(s => uid !== undefined && s.targetUid === uid).map(s => <span key={s.key} className={`alpha-target-fx alpha-fx-${s.effect}`} aria-hidden>{s.delta === undefined ? (s.effect === 'shield' ? '🛡' : '✦') : `${s.delta > 0 ? '+' : ''}${s.delta}`}</span>);
  const showDirectConfirm = !scriptSelected &&
    selection?.kind === 'hand' &&
    selectedCard != null &&
    selectedCard.type !== 'creature' &&
    selectedCard.type !== 'environment' &&
    selectedCard.effect.kind !== 'moveCreature' &&
    laneZieleFuerKarte(selectedCard).size === 0;

  const statusText = status !== 'connected' ? 'Verbindung unterbrochen – Wiederverbindung läuft …' : view.choice ? (view.choice.owner === me ? view.choice.title : 'Gegner wählt eine Karte …') : isReplaying
    ? replayKind === 'combat' ? '⚔️ Kampf läuft …' : 'Kartenwirkung wird angezeigt …'
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
        : shownView.phase === 'precombat'
          ? myTurn ? 'Letzte Aktionen vor dem Kampf' : 'Gegner spielt die letzten Aktionen …'
        : myTurn
          ? selection
            ? selection.kind === 'move'
              ? 'Ziel-Lane wählen'
              : 'Markiertes Ziel wählen oder Auswahl abbrechen'
            : 'Du bist am Zug – Karte antippen oder ziehen'
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
  const hudEffects = (side: PlayerIndex, zone: 'base' | 'resources') => fx.spells.filter(s => s.lane < 0 && s.owner === side && ((s.effect === 'energy' || s.effect === 'hand') === (zone === 'resources'))).map(s => <span key={s.key} className={`alpha-hud-fx alpha-fx-${s.effect}`}>{s.effect === 'hand' ? 'Hand verändert' : s.effect === 'energy' ? '⚡ Energie' : s.effect === 'heal' ? '♥' : '✦'} {s.delta ? `${s.delta > 0 ? '+' : ''}${s.delta}` : ''}</span>);
  // Ältere Effekte ohne Figuren-ID verwenden weiterhin die eigene Bahn.
  const spellOnLane = (lane: number) => fx.spells.find((s) => s.lane === lane && s.owner === me && s.targetUid === undefined);

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
  const coachKey: 'firstTurn' | 'combat' | 'shield' | null = profile.onboarding.skipped
    ? null
    : zeigeReaktionsAuswahl && !profile.onboarding.shield
      ? 'shield'
      : isReplaying && replayKind === 'combat' && !profile.onboarding.combat
        ? 'combat'
        : myTurn && shownView.phase === 'play' && !profile.onboarding.firstTurn
          ? 'firstTurn'
          : null;

  return (
    <div className="screen game-screen" style={themeVars}>
      {/* ---- Arena: bildschirmfüllende Bühne. Sie ist zugleich der layoutRoot
           für Battlefield3D – die 3D-Figuren, Bänke und Basen werden über die
           data-slot- und data-zone-Anker darin auf das DOM projiziert. ---- */}
      <div className="arena" style={{ '--lanes': shownView.lanes } as CSSProperties}>
        {use3d && (
          <Suspense fallback={null}>
            <Battlefield3D
              view={shownView}
              me={me}
              fx={fx}
              topic={topic}
              catalog={catalog}
              onUnsupported={() => setUse3d(false)}
            />
          </Suspense>
        )}

        {/* ---- Gegnerische Zone: Basis und Bank mittig über den Lanes ---- */}
        <div className="zone-band zone-oben">
          <div className="hud-gruppe">
            {hudEffects(opp, 'resources')}
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
            {hudEffects(opp, 'base')}
            <BasisAnzeige
              leben={shownView.players[opp].base}
              max={shownView.baseMax}
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
            <span className={'runden-chip' + rundenPuls}>
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
            <button
              type="button"
              className="arena-settings-button"
              aria-label="Arena-Einstellungen"
              onClick={() => setSettingsOpen(true)}
            >
              ⚙
            </button>
          </div>
        </div>

        {/* ---- Lanes ---- */}
        <main className="lane-grid">
          {Array.from({ length: shownView.lanes }, (_, lane) => {
            const targetable = myTurn && (zugZiele ?? targets.lanes).has(lane);
            const targeting = myTurn && (selection !== null || kartenZug.zug !== null);
            const dropHover = kartenZug.zug?.lane === lane;
            const flySource = selection?.kind === 'fly' && selection.fromLane === lane;
            const moveSource = selection?.kind === 'move' && selection.fromLane === lane;
            const enemyCreature = shownView.board[opp][lane];
            const enemyTeamCreature = shownView.teamBoard[opp]?.[lane] ?? null;
            const ownCreature = myBoard[lane];
            const ownTeamCreature = shownView.teamBoard[me]?.[lane] ?? null;
            const enemyDmg = incomingDamage(opp, lane);
            const ownDmg = incomingDamage(me, lane);
            const combatActive = isReplaying && fx.activeLane === lane;
            return (
              <div className={'lane' + (combatActive ? ' combat-active' : '')} key={lane}>
                <div className={'slot enemy-slot' + (enemyTeamCreature ? ' team-up-lane' : '')} data-slot={`${opp}-${lane}`}>
                  <div data-target-uid={enemyCreature?.uid} className={(enemyTeamCreature ? 'team-up-primary' : 'team-up-solo') + (figureTarget(enemyCreature?.uid) ? ' alpha-valid-target' : '')} onClickCapture={e => { if (scriptSelected) { e.stopPropagation(); chooseFigure(enemyCreature?.uid); } }}>
                    {targetEffect(enemyCreature?.uid)}
                    <CreatureTile
                      key={enemyCreature?.uid ?? 'leer'}
                      creature={enemyCreature}
                      flat3d={use3d}
                      attacking={isAttacking(opp, lane)}
                      dying={isDying(opp, lane)}
                      moveDelta={enemyCreature ? moveFx[enemyCreature.uid] : undefined}
                      onDetail={openCreatureDetail}
                    />
                  </div>
                  {enemyTeamCreature && <div data-target-uid={enemyTeamCreature.uid} className={'team-up-secondary' + (figureTarget(enemyTeamCreature.uid) ? ' alpha-valid-target' : '')} onClickCapture={e => { if (scriptSelected) { e.stopPropagation(); chooseFigure(enemyTeamCreature.uid); } }}>{targetEffect(enemyTeamCreature.uid)}<CreatureTile creature={enemyTeamCreature} flat3d={use3d} onDetail={openCreatureDetail} /></div>}
                  {enemyDmg && <span className="dmg-float">-{enemyDmg.damage}</span>}
                </div>
                <div className="lane-label">{lane + 1} {shownView.laneKinds[lane] === 'height' ? '▲ Höhe' : shownView.laneKinds[lane] === 'water' ? '≋ Wasser' : ''}</div>
                {shownView.environments[lane] && <div className="lane-environment" title={shownView.environments[lane]?.text}>{shownView.environments[lane]?.name}</div>}
                <button
                  className={
                    'slot own-slot' +
                    (targetable ? ' targetable' : '') +
                    (targeting && !targetable ? ' invalid-target' : '') +
                    (dropHover ? ' drop-hover' : '') +
                    (flySource || moveSource ? ' selected-slot' : '')
                  }
                  data-slot={`${me}-${lane}`}
                  aria-label={
                    ownCreature
                      ? `Lane ${lane + 1}: ${ownCreature.name}`
                      : targetable
                        ? `Karte in Lane ${lane + 1} ausspielen`
                        : `Lane ${lane + 1}, frei`
                  }
                  onClick={() => tapOwnLane(lane)}
                >
                  <div data-target-uid={ownCreature?.uid} className={(ownTeamCreature ? 'team-up-primary' : 'team-up-solo') + (figureTarget(ownCreature?.uid) ? ' alpha-valid-target' : '')} onClickCapture={e => { if (scriptSelected) { e.stopPropagation(); chooseFigure(ownCreature?.uid); } }}>
                    {targetEffect(ownCreature?.uid)}
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
                  </div>
                  {ownTeamCreature && <div data-target-uid={ownTeamCreature.uid} className={'team-up-secondary' + (figureTarget(ownTeamCreature.uid) ? ' alpha-valid-target' : '')} onClickCapture={e => { if (myTurn && ownTeamCreature.canFly) { e.stopPropagation(); setSelection({ kind: 'fly', fromLane: lane, targetUid: ownTeamCreature.uid }); } else if (scriptSelected) { e.stopPropagation(); chooseFigure(ownTeamCreature.uid); } }}>{targetEffect(ownTeamCreature.uid)}<CreatureTile creature={ownTeamCreature} own flat3d={use3d} onDetail={openCreatureDetail} /></div>}
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

        {/* ---- Eigene Zone: Bank mittig, Basis dahinter ---- */}
        <div className="zone-band zone-unten">
          <div className="hud-gruppe">
            {hudEffects(me, 'resources')}
            <div className={'energy-chip' + energiePuls}>
              ⚡ {energy}/{shownView.energyCap}
            </div>
            {shownView.players[me].championId === 'sonnenfackel' && <div className="deck-chip">Pupa: {shownView.evolution ?? 0}/3</div>}
          </div>

          <div className="zone-mitte">
            {hudEffects(me, 'base')}
            <BasisAnzeige
              leben={shownView.players[me].base}
              max={shownView.baseMax}
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
            <div className={'deck-chip' + deckPuls}>📚 {shownView.players[me].deckCount}</div>
            {(shownView.phase === 'play' || shownView.phase === 'precombat') && myTurn && (
              <button
                className="pass-button"
                disabled={selection !== null}
                onClick={() => onAction({ type: 'pass' })}
              >
                {shownView.consecutivePasses ? 'Passen · Kampf starten' : 'Passen'}
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

      {/* ---- Wirkende Cheerleader-Kraft: Aufblitzen über der ganzen Arena ---- */}
      {fx.power && <span key={fx.power.key} className="power-burst" aria-hidden />}

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
      {coachKey && (
        <CoachHint
          title={
            coachKey === 'firstTurn'
              ? 'Eine Karte, eine Entscheidung'
              : coachKey === 'combat'
                ? 'Jetzt wird abgerechnet'
                : 'Dein Schild verlangt ein Opfer'
          }
          onDone={() => finishCoach(coachKey)}
          onSkip={() => finishCoach(coachKey, true)}
        >
          {coachKey === 'firstTurn'
            ? 'Tippe eine Karte: Lies ihren Text und wähle ein markiertes Ziel. Du kannst sie auch direkt dorthin ziehen. Danach ist dein Gegner am Zug.'
            : coachKey === 'combat'
              ? 'Wenn beide Seiten nacheinander passen, beginnt der simultane Kampf. Die Angriffe werden der Reihe nach gezeigt.'
              : 'Wähle den Cheerleader, dessen Kraft jetzt wirken soll. Der belegte Bankplatz ist danach verbraucht.'}
        </CoachHint>
      )}
      <footer className="own-area">
        {selectedCard?.type === 'creature' && selection?.kind === 'hand' && myTurn && <aside className="alpha-action-panel" aria-label="Figur ausspielen"><div className="alpha-action-head"><strong>{selectedCard.name} · {selectedCard.cost} Energie</strong><button aria-label="Auswahl abbrechen" onClick={() => setSelection(null)}>✕</button></div><p>{selectedCard.attack} Angriff · {selectedCard.health} Leben. {selectedCard.text}</p><p>{targets.lanes.size ? 'Tippe eine markierte eigene Bahn.' : 'Momentan keine erlaubte Bahn oder zu wenig Energie.'}</p><button onClick={() => openCardDetail(selectedCard, shownView.hand.indexOf(selectedCard))}>Vergrößern</button></aside>}
        {scriptSelected && selectedCard && myTurn && <AktionsAuswahl key={`${selection?.kind === 'hand' ? selection.index : ''}:${targetUid ?? ''}`} view={shownView} card={selectedCard} actions={scriptOptions} initialUid={targetUid} onAction={a => { onAction(a); setSelection(null); }} onCancel={() => { setSelection(null); setTargetUid(undefined); }} />}
        {view.choice?.owner === me && !isReplaying && status === 'connected' && <aside className="alpha-action-panel" role="dialog" aria-label={view.choice.title}><strong>{view.choice.title}</strong><div className="alpha-target-options">{view.hand.map((card, i) => <button key={view.handInstanceIds?.[i] ?? i} onClick={() => onAction({ type: 'chooseCard', choiceId: view.choice!.id, instanceId: view.handInstanceIds![i] })}>{card.name}</button>)}</div></aside>}
        {/* role=status: Die Zeile ist die Live-Region der Partie – sie meldet
            Zugwechsel, Kampf und wartende Cheerleader-Reaktionen. */}
        <div
          className={`schlagabtausch-band ${myTurn ? 'my-turn' : ''} ${isReplaying ? 'replay' : ''}`}
          role="status"
        >
          <span className="schlagabtausch-kicker">
            {isReplaying
              ? `${replayKind === 'combat' ? 'Kampf' : 'Kartenwirkung'}${fx.activeLane !== null && fx.activeLane >= 0 ? ` · Bahn ${fx.activeLane + 1}` : ''}`
              : myTurn
                ? 'Dein Auftritt'
                : 'Gegner am Zug'}
          </span>
          <strong>{statusText}</strong>
          {letzteLogZeile && (
            <button type="button" onClick={() => setLogOffen(true)}>
              {letzteLogZeile}
            </button>
          )}
        </div>

        {showDirectConfirm && (
          <button
            className="primary summon-confirm"
            onClick={() => {
              playFeedback('card', profile.settings.sound, profile.settings.haptics);
              onAction({ type: 'playAction', handIndex: (selection as { index: number }).index });
              setSelection(null);
            }}
          >
            {selectedCard?.name} ausspielen
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
              <CardPosterFallback
                faction={shownView.hand[kartenZug.zug.handIndex].faction}
                type={shownView.hand[kartenZug.zug.handIndex].type}
                name={shownView.hand[kartenZug.zug.handIndex].name}
                compact
              />
            }
          />
        </div>
      )}

      {/* ---- Vollständiges Kampf-Log ---- */}
      {logOffen && (
        <div className="overlay log-overlay" onClick={() => setLogOffen(false)}>
          <div
            ref={logDialogRef}
            className="log-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby="combat-log-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="combat-log-title">Kampf-Log</h2>
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

      {settingsOpen && (
        <div className="overlay" onClick={() => setSettingsOpen(false)}>
          <div
            ref={settingsDialogRef}
            className="overlay-box arena-settings"
            role="dialog"
            aria-modal="true"
            aria-label="Arena-Einstellungen"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="eyebrow">Arena-Regie</span>
            <h1>Einstellungen</h1>
            <label className="setting-row">
              <span>Soundeffekte</span>
              <input
                type="checkbox"
                checked={profile.settings.sound}
                onChange={(event) => setSetting('sound', event.target.checked)}
              />
            </label>
            <label className="setting-row">
              <span>Haptisches Feedback</span>
              <input
                type="checkbox"
                checked={profile.settings.haptics}
                onChange={(event) => setSetting('haptics', event.target.checked)}
              />
            </label>
            <label className="setting-row">
              <span>Kampfgeschwindigkeit</span>
              <select
                value={profile.settings.replaySpeed}
                onChange={(event) =>
                  setSetting('replaySpeed', Number(event.target.value) as 1 | 1.5 | 2)
                }
              >
                <option value={1}>1×</option>
                <option value={1.5}>1,5×</option>
                <option value={2}>2×</option>
              </select>
            </label>
            <label className="setting-row">
              <span>3D-Arena</span>
              <input type="checkbox" checked={use3d} onChange={(event) => setUse3d(event.target.checked)} />
            </label>
            <button className="primary" onClick={() => setSettingsOpen(false)}>Fertig</button>
            {view.winner === null && <button className="secondary" disabled={status !== 'connected'} onClick={() => { onAction({ type: 'surrender' }); setSettingsOpen(false); }}>Partie aufgeben</button>}
          </div>
        </div>
      )}

      {detail && (
        <KartenDetail
          detail={detail}
          keywordInfo={keywordInfo}
          spielbar={detail.handIndex !== undefined && karteSpielbar(detail.handIndex)}
          onAusspielen={(handIndex) => {
            setSelection({ kind: 'hand', index: handIndex });
            setDetail(null);
          }}
          onSchliessen={() => setDetail(null)}
        />
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
            ref={resultDialogRef}
            className={
              'overlay-box ' +
              (shownView.winner === 'draw' ? 'draw' : shownView.winner === me ? 'win' : 'lose')
            }
            role="dialog"
            aria-modal="true"
            aria-label="Spielergebnis"
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
            {shownView.matchSummary && (
              <div className="match-summary">
                <div><strong>{shownView.matchSummary.round}</strong><span>Runden</span></div>
                <div><strong>{shownView.matchSummary.baseDamageDealt[me]}</strong><span>Basisschaden</span></div>
                <div><strong>{shownView.matchSummary.creaturesLost[opp]}</strong><span>Gegner besiegt</span></div>
                <div><strong>{shownView.matchSummary.shieldsBlocked[me]}</strong><span>Schildblocks</span></div>
                <div><strong>{shownView.matchSummary.cheerleadersUsed[me]}</strong><span>Cheerleader</span></div>
              </div>
            )}
            <div className="result-actions">
              <button
                className="primary big"
                disabled={rematchReady[me]}
                onClick={() => onRematchReady(!rematchReady[me])}
              >
                {rematchReady[me]
                  ? rematchReady[opp]
                    ? 'Rückspiel startet …'
                    : 'Warte auf Gegner …'
                  : 'Rückspiel'}
              </button>
              <button
                className="secondary"
                onClick={() => {
                  sessionStorage.setItem('pcf.openLoadout', '1');
                  onLeave();
                }}
              >
                Ausrüstung ändern
              </button>
              <button className="result-link" onClick={onLeave}>
                Zum Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
