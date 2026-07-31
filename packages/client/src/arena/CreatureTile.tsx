// Eine Figur auf dem Feld: im 3D-Modus nur noch der unsichtbare Traeger fuer
// ATK/HP-Marken und Namensschild, im 2D-Fallback zusaetzlich das Artwork.

import type { CSSProperties } from 'react';
import type { CreatureView } from '@pcf/engine';
import { CardArt } from './Karten';
import { useLongPress } from './useLongPress';

export function CreatureTile({
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
