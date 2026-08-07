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
import { CardArt, HandCard, KartenDetail, type DetailData } from './arena/Karten';
import { CreatureTile } from './arena/CreatureTile';
import { BasisAnzeige, CheerleaderStrip } from './arena/Anzeigen';
import { ReaktionsAuswahl } from './arena/ReaktionsAuswahl';
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
  const { shownView, isReplaying, fx, moveFx, banner, showBanner } = useKampfReplay(view);
  const [detail, setDetail] = useState<DetailData | null>(null);
  /** Kampf-Log: normal nur als Ticker sichtbar, auf Tippen als Overlay. */
  const [logOffen, setLogOffen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

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

  // Zaehler-Blitz: die drei Chips aendern sich sonst lautlos mitten im Spiel.
  const energiePuls = useWertPuls(energy);
  const deckPuls = useWertPuls(shownView.players[me].deckCount);
  const rundenPuls = useWertPuls(shownView.round);

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
            <div className={'energy-chip' + (canPlaySomething ? ' pulse' : '') + energiePuls}>
              ⚡ {energy}/{shownView.energyCap}
            </div>
          </div>

          <div className="zone-mitte">
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
      <footer className="own-area">
        {/* role=status: Die Zeile ist die Live-Region der Partie – sie meldet
            Zugwechsel, Kampf und wartende Cheerleader-Reaktionen. */}
        <div className={`status-band ${myTurn ? 'my-turn' : ''}`} role="status">
          {statusText}
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

      {/* ---- Karten-Detailansicht ---- */}
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
