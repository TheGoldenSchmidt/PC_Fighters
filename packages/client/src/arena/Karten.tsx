// Alles, was eine KARTE zeigt: Artwork, die kompakte Handkarte und die
// Detailansicht, die ein kurzes Antippen oeffnet.

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { CardDef } from '@pcf/engine';
import type { KeywordInfo } from '../useGame';
import { useDialogFocus } from './useDialogFocus';

/** Daten für die Detailansicht (Handkarte oder Figur auf dem Feld). */
export interface DetailData {
  cardId: string;
  faction?: string;
  type?: CardDef['type'];
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

/**
 * Karten-Artwork: Es wird immer /assets/cards/<id>.png versucht – existiert
 * das Bild nicht, erscheint der Fallback. So braucht ein neues Artwork nur
 * als PNG mit der Karten-id abgelegt zu werden, ohne Codeänderung.
 */
export function CardArt({
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

/** Lesbarer, gemeinsamer Ersatz für Karten ohne individuelles Artwork. */
export function CardPosterFallback({
  faction,
  type,
  name,
  compact = false
}: {
  faction?: string;
  type?: CardDef['type'];
  name: string;
  compact?: boolean;
}) {
  return (
    <div className={`card-poster ${faction ? `faction-${faction}` : ''} ${compact ? 'compact' : ''}`}>
      <span className="card-poster-show">PC FIGHTERS</span>
      <strong>
        {type === 'action'
          ? 'AKTION'
          : type === 'environment'
            ? 'UMGEBUNG'
            : type === 'superpower'
              ? 'SUPERKRAFT'
              : type === 'creature'
                ? 'KÄMPFER'
                : 'DUELLKARTE'}
      </strong>
      {!compact && <small>{name}</small>}
    </div>
  );
}


/**
 * Kompakte Handkarte: Artwork füllt die Karte, Kosten als Kreis oben rechts,
 * ATK/HP als kleine Marken unten. Der Regeltext steht bewusst NICHT mehr auf
 * der Karte – ihn zeigt das Antippen im Detailfenster. Ausgespielt wird per
 * Ziehen, deshalb kommen alle Zeiger-Ereignisse von `useKartenZug`.
 */
export function HandCard({
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
          <CardPosterFallback faction={card.faction} type={card.type} name={card.name} compact />
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

/**
 * Detailansicht einer Karte oder Feldfigur. Der `Ausspielen`-Knopf erscheint
 * nur fuer Handkarten, die gerade bezahlbar sind – er ist die Rueckfallebene
 * zum Ziehen und der einzige Weg fuer Karten ohne Lane-Ziel.
 */
export function KartenDetail({
  detail,
  keywordInfo,
  spielbar,
  onAusspielen,
  onSchliessen
}: {
  detail: DetailData;
  keywordInfo: KeywordInfo | null;
  spielbar: boolean;
  onAusspielen: (handIndex: number) => void;
  onSchliessen: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>(true, onSchliessen);
  return (
    <div className="overlay detail-overlay" onClick={onSchliessen}>
      <div
        ref={dialogRef}
        className="detail-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-card-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-art">
          <CardArt
            cardId={detail.cardId}
            className="detail-art-img"
            alt={detail.name}
            fallback={
              <CardPosterFallback faction={detail.faction} type={detail.type} name={detail.name} />
            }
          />
          {detail.cost !== undefined && <span className="cost detail-cost">{detail.cost}</span>}
        </div>
        <h2 className="detail-name" id="detail-card-title">
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
        {detail.handIndex !== undefined && spielbar && (
          <button className="primary" onClick={() => onAusspielen(detail.handIndex!)}>
            Ausspielen
          </button>
        )}
        <button className="secondary" onClick={onSchliessen}>
          Schließen
        </button>
      </div>
    </div>
  );
}
