// Spielfeld: gegnerische Basis oben, eigene unten, Lanes dazwischen
// (dynamisch aus der Config – auch 4+ Lanes funktionieren), Handkarten
// als scrollbare Leiste. Bedienung über große Tap-Flächen statt Drag & Drop.
//
// Optik: Der vom Raum-Ersteller gewählte Schauplatz (Topic) färbt Hintergrund
// und Lanes über CSS-Variablen ein. Animationen: Kreaturen "ploppen" beim
// Ausspielen aufs Feld (Mount-Animation über den uid-Key) und machen beim
// Angriff einen Ausfallschritt – gesteuert über die Kampf-Events im Log.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type {
  CardDef,
  ClientView,
  CreatureView,
  PlayerAction,
  PlayerIndex,
  Topic
} from '@pcf/engine';
import type { ConnectionStatus } from './useGame';

interface Props {
  view: ClientView;
  topic: Topic | null;
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

/** Ein gerade laufender Angriffs-Effekt (Ausfallschritt + Schadenszahl). */
interface HitFx {
  key: string;
  lane: number;
  attacker: PlayerIndex;
  damage: number;
  toBase: boolean;
}

const FX_STAGGER_MS = 500; // Abstand zwischen zwei Angriffs-Animationen
const FX_DURATION_MS = 650; // Dauer eines einzelnen Effekts

export function GameScreen({ view, topic, status, opponentConnected, onAction, onLeave }: Props) {
  const [selection, setSelection] = useState<Selection>(null);
  const [fx, setFx] = useState<HitFx[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const lastLogId = useRef<number | null>(null);
  const fxTimers = useRef<number[]>([]);

  const me = view.you;
  const opp = me === 0 ? 1 : 0;
  const myTurn = view.active === me && view.winner === null;
  const myBoard = view.board[me];
  const energy = view.players[me].energy;

  // Auswahl zurücksetzen, wenn ein neuer Zustand kommt (Karte könnte weg sein)
  useEffect(() => setSelection(null), [view]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [view.log.length]);

  // Neue Kampf-Events aus dem Log ziehen und nacheinander abspielen.
  useEffect(() => {
    const maxId = view.log.length > 0 ? view.log[view.log.length - 1].id : -1;
    if (lastLogId.current === null) {
      // Erster Zustand (auch nach Reconnect): alte Einträge nicht nachspielen.
      lastLogId.current = maxId;
      return;
    }
    const fresh = view.log.filter((e) => e.id > lastLogId.current! && e.event?.kind === 'attack');
    lastLogId.current = maxId;

    fresh.forEach((entry, i) => {
      const ev = entry.event!;
      const item: HitFx = {
        key: `fx-${entry.id}`,
        lane: ev.lane,
        attacker: ev.attacker,
        damage: ev.damage,
        toBase: ev.toBase
      };
      const start = window.setTimeout(() => {
        setFx((f) => [...f, item]);
        const stop = window.setTimeout(
          () => setFx((f) => f.filter((x) => x.key !== item.key)),
          FX_DURATION_MS
        );
        fxTimers.current.push(stop);
      }, i * FX_STAGGER_MS);
      fxTimers.current.push(start);
    });
  }, [view.log]);

  useEffect(() => () => fxTimers.current.forEach((t) => window.clearTimeout(t)), []);

  const selectedCard: CardDef | null =
    selection && (selection.kind === 'hand' || selection.kind === 'move')
      ? view.hand[selection.index] ?? null
      : null;

  /** Welche eigenen Lanes sind gerade gültige Tap-Ziele? */
  function laneTargets(): { lanes: Set<number>; needs: 'free' | 'occupied' | null } {
    const free = new Set<number>();
    const occupied = new Set<number>();
    myBoard.forEach((c, i) => (c ? occupied.add(i) : free.add(i)));

    if (selection?.kind === 'fly' || selection?.kind === 'move') {
      return { lanes: free, needs: 'free' };
    }
    if (selection?.kind === 'hand' && selectedCard) {
      if (selectedCard.type === 'creature') return { lanes: free, needs: 'free' };
      const kind = selectedCard.effect.kind;
      if (kind === 'buffHealth' || kind === 'buffAttackTemp' || kind === 'moveCreature') {
        return { lanes: occupied, needs: 'occupied' };
      }
    }
    return { lanes: new Set(), needs: null };
  }

  const targets = laneTargets();

  function tapOwnLane(lane: number) {
    if (!myTurn) return;

    // Flug-Phase: eigene fliegende Kreatur wählen bzw. Ziel-Lane antippen
    if (view.phase === 'fly') {
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
    if (!myTurn || view.phase !== 'play') return;
    const card = view.hand[index];
    if (!card || card.cost > energy) return;
    setSelection(
      selection?.kind === 'hand' && selection.index === index ? null : { kind: 'hand', index }
    );
  }

  const showSummonConfirm =
    selection?.kind === 'hand' && selectedCard?.type === 'action' &&
    selectedCard.effect.kind === 'summon';

  const statusText =
    view.winner !== null
      ? 'Partie beendet'
      : view.phase === 'fly'
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

  // ---- Animations-Helfer ----
  const isAttacking = (side: PlayerIndex, lane: number) =>
    fx.some((f) => f.attacker === side && f.lane === lane);
  /** Schadenszahl, die gerade über der Kreatur von `side` in `lane` schwebt. */
  const incomingDamage = (side: PlayerIndex, lane: number) =>
    fx.find((f) => !f.toBase && f.lane === lane && f.attacker !== side);
  /** Basis von `side` wird gerade getroffen? */
  const baseHit = (side: PlayerIndex) => fx.find((f) => f.toBase && f.attacker !== side);

  const themeVars = (
    topic
      ? {
          '--lane-bg': topic.colors.lane,
          '--lane-border': topic.colors.laneBorder,
          '--theme-accent': topic.colors.accent
        }
      : {}
  ) as CSSProperties;

  return (
    <div className="screen game-screen" style={themeVars}>
      {/* ---- Kopfzeile: Gegner ---- */}
      <header className="player-bar opponent-bar">
        <div className={`base-chip ${baseHit(opp) ? 'hit' : ''}`}>
          🏰 {Math.max(0, view.players[opp].base)}
          {baseHit(opp) && <span className="dmg-float">-{baseHit(opp)!.damage}</span>}
        </div>
        <div className="hand-backs" aria-label={`Gegner hat ${view.players[opp].handCount} Handkarten`}>
          {Array.from({ length: Math.min(view.players[opp].handCount, 10) }, (_, i) => (
            <span key={i} className="card-back" />
          ))}
          <span className="hand-count">{view.players[opp].handCount}</span>
        </div>
        <div className="deck-chip">📚 {view.players[opp].deckCount}</div>
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
          Runde {view.round}/{view.roundLimit}
        </span>
        <span className={`turn-indicator ${myTurn ? 'my-turn' : ''}`}>{statusText}</span>
        <span className={`conn-dot ${status === 'connected' ? 'ok' : 'lost'}`}
          title={status === 'connected' ? 'Verbunden' : 'Verbindung verloren'}
        />
      </div>

      {/* ---- Lanes ---- */}
      <main className="lanes" style={{ '--lanes': view.lanes } as CSSProperties}>
        {Array.from({ length: view.lanes }, (_, lane) => {
          const targetable = myTurn && targets.lanes.has(lane);
          const flySource = selection?.kind === 'fly' && selection.fromLane === lane;
          const moveSource = selection?.kind === 'move' && selection.fromLane === lane;
          const enemyCreature = view.board[opp][lane];
          const ownCreature = myBoard[lane];
          const enemyDmg = incomingDamage(opp, lane);
          const ownDmg = incomingDamage(me, lane);
          return (
            <div className="lane" key={lane}>
              <div className="slot enemy-slot">
                <CreatureTile
                  key={enemyCreature?.uid ?? 'leer'}
                  creature={enemyCreature}
                  attacking={isAttacking(opp, lane)}
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
                onClick={() => tapOwnLane(lane)}
              >
                <CreatureTile
                  key={ownCreature?.uid ?? 'leer'}
                  creature={ownCreature}
                  own
                  attacking={isAttacking(me, lane)}
                />
                {ownDmg && <span className="dmg-float">-{ownDmg.damage}</span>}
              </button>
            </div>
          );
        })}
      </main>

      {/* ---- Kampf-Log ---- */}
      <div className="log" ref={logRef}>
        {view.log.map((entry) => (
          <div key={entry.id} className="log-entry">
            {entry.text}
          </div>
        ))}
      </div>

      {/* ---- Fußzeile: eigene Werte, Buttons, Hand ---- */}
      <footer className="own-area">
        <div className="player-bar own-bar">
          <div className={`base-chip ${baseHit(me) ? 'hit' : ''}`}>
            🏰 {Math.max(0, view.players[me].base)}
            {baseHit(me) && <span className="dmg-float">-{baseHit(me)!.damage}</span>}
          </div>
          <div className="energy-chip">
            ⚡ {energy}/{view.energyCap}
          </div>
          <div className="deck-chip">📚 {view.players[me].deckCount}</div>
          {view.phase === 'play' && myTurn && (
            <button className="pass-button" onClick={() => onAction({ type: 'pass' })}>
              Passen
            </button>
          )}
          {view.phase === 'fly' && myTurn && (
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
          {view.hand.map((card, i) => (
            <HandCard
              key={`${card.id}-${i}`}
              card={card}
              selected={selection?.kind === 'hand' && selection.index === i}
              playable={myTurn && view.phase === 'play' && card.cost <= energy}
              onTap={() => tapHandCard(i)}
            />
          ))}
          {view.hand.length === 0 && <div className="hint empty-hand">Keine Handkarten</div>}
        </div>
      </footer>

      {/* ---- Spielende ---- */}
      {view.winner !== null && (
        <div className="overlay">
          <div className="overlay-box">
            <h1>
              {view.winner === 'draw'
                ? '🤝 Unentschieden!'
                : view.winner === me
                  ? '🏆 Du gewinnst!'
                  : '💀 Du verlierst!'}
            </h1>
            <p>
              Basis-Leben: Du {Math.max(0, view.players[me].base)} – Gegner{' '}
              {Math.max(0, view.players[opp].base)}
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
  attacking
}: {
  creature: CreatureView | null;
  own?: boolean;
  attacking?: boolean;
}) {
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
        ` card-${creature.cardId}`
      }
    >
      <div className="figure-frame">
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
  onTap
}: {
  card: CardDef;
  selected: boolean;
  playable: boolean;
  onTap: () => void;
}) {
  return (
    <button
      className={
        'hand-card' +
        (selected ? ' selected' : '') +
        (playable ? ' playable' : ' unplayable') +
        (card.signature ? ' signature-card' : '') +
        ` faction-${card.faction}`
      }
      onClick={onTap}
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
