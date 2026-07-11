// Spielfeld: gegnerische Basis oben, eigene unten, Lanes dazwischen
// (dynamisch aus der Config – auch 4+ Lanes funktionieren), Handkarten
// als scrollbare Leiste. Bedienung über große Tap-Flächen statt Drag & Drop.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CardDef, ClientView, CreatureView, PlayerAction } from '@pcf/engine';
import type { ConnectionStatus } from './useGame';

interface Props {
  view: ClientView;
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

export function GameScreen({ view, status, opponentConnected, onAction, onLeave }: Props) {
  const [selection, setSelection] = useState<Selection>(null);
  const logRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="screen game-screen">
      {/* ---- Kopfzeile: Gegner ---- */}
      <header className="player-bar opponent-bar">
        <div className="base-chip">🏰 {Math.max(0, view.players[opp].base)}</div>
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
          return (
            <div className="lane" key={lane}>
              <div className="slot enemy-slot">
                <CreatureTile creature={view.board[opp][lane]} />
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
                <CreatureTile creature={myBoard[lane]} own />
              </button>
            </div>
          );
        })}
      </main>

      {/* ---- Kampf-Log ---- */}
      <div className="log" ref={logRef}>
        {view.log.map((entry, i) => (
          <div key={i} className="log-entry">
            {entry.text}
          </div>
        ))}
      </div>

      {/* ---- Fußzeile: eigene Werte, Buttons, Hand ---- */}
      <footer className="own-area">
        <div className="player-bar own-bar">
          <div className="base-chip">🏰 {Math.max(0, view.players[me].base)}</div>
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

function CreatureTile({ creature, own }: { creature: CreatureView | null; own?: boolean }) {
  if (!creature) return <span className="empty-slot">frei</span>;
  const attackBuffed = creature.attack > creature.baseAttack;
  const attackReduced = creature.attack < creature.baseAttack;
  const healthBuffed = creature.maxHealth > creature.baseMaxHealth;
  const damaged = creature.health < creature.maxHealth;
  return (
    <div
      className={
        'creature' +
        (creature.exhausted ? ' exhausted' : '') +
        (own ? ' own' : ' enemy') +
        (creature.canFly ? ' can-fly' : '')
      }
    >
      <div className="creature-name">
        {creature.canFly && '🕊 '}
        {creature.name}
      </div>
      <div className="creature-stats">
        <span className={attackBuffed ? 'stat buffed' : attackReduced ? 'stat reduced' : 'stat'}>
          ⚔ {creature.attack}
        </span>
        <span className={damaged ? 'stat damaged' : healthBuffed ? 'stat buffed' : 'stat'}>
          ♥ {creature.health}/{creature.maxHealth}
        </span>
      </div>
      {creature.keywords.length > 0 && (
        <div className="creature-keywords">{creature.keywords.join(' · ')}</div>
      )}
      {creature.exhausted && <div className="exhausted-label">erschöpft</div>}
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
        'hand-card' + (selected ? ' selected' : '') + (playable ? '' : ' unplayable')
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
