// Die Zahlen-Anzeigen der Arena: Basis-Schild, Basis-Leben und die
// Cheerleader-Bank (letztere nur im 2D-Fallback – in 3D zeichnet sie
// Battlefield3D auf denselben DOM-Anker).

import type { CheerleaderSlots, PlayerIndex } from '@pcf/engine';
import type { FxBaseImpact, FxShield } from './fx';

/**
 * Basis-Schild als Segmentbalken. Jeder Treffer an der Basis füllt 1–3
 * Abschnitte; ist der Balken voll, blockt der Schild und löst eine Superkraft
 * aus (der Server schickt dann ein SchildEvent mit `blockiert`).
 */
export function ShieldMeter({
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
export function BasisAnzeige({
  leben,
  max,
  treffer,
  schild,
  abschnitte,
  schildFx,
  immun
}: {
  leben: number;
  /** Startleben – Bezugswert des Balkens. */
  max: number;
  treffer?: FxBaseImpact;
  schild: number;
  abschnitte: number;
  schildFx: FxShield | null;
  immun: boolean;
}) {
  const rest = Math.max(0, leben);
  const anteil = max > 0 ? Math.min(1, rest / max) : 0;
  // Farbstufen statt eines Farbverlaufs: „noch gut / wird eng / gleich vorbei"
  // liest man auf einem Handydisplay schneller als einen Prozentwert.
  const stufe = anteil > 0.6 ? 'hoch' : anteil > 0.3 ? 'mittel' : 'tief';
  return (
    <div className={`basis-anzeige${treffer ? ' hit' : ''}`}>
      <div className="basis-wert" title={`Basis-Leben: ${rest} von ${max}`}>
        <span aria-hidden>🏰</span>
        <strong>{rest}</strong>
        {treffer && <span className="dmg-float">-{treffer.damage}</span>}
      </div>
      {/* aria-hidden: die Zahl darüber sagt dasselbe, nur genauer. */}
      <div className={`basis-balken ${stufe}`} aria-hidden>
        <span className="basis-balken-fuellung" style={{ width: `${anteil * 100}%` }} />
      </div>
      <ShieldMeter stand={schild} abschnitte={abschnitte} fx={schildFx} immun={immun} />
    </div>
  );
}

const CHEERLEADER_NAMES: Record<string, string> = {
  pc_principal: 'PC Principal',
  pc_babies: 'PC Babies',
  alter_wissenschaftler: 'Alter Wissenschaftler',
  junger_neffe: 'Junger Neffe',
  randy_marsh: 'Randy Marsh'
};

export function CheerleaderStrip({
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
