// Auswahl beim Schild-Block.

import type { ReaktionsView } from '@pcf/engine';

const AUSLOESER_TEXT: Record<ReaktionsView['ausloeser'], string> = {
  schildBlock: 'Dein Schild hat den Treffer geblockt.'
};

/**
 * Auswahl für ein offenes Reaktionsfenster. Bewusst ein DOM-Overlay statt einer
 * Interaktion auf der Bank: so ist die Bedienung in 3D und im `?no3d`-Fallback
 * exakt dieselbe.
 *
 * Es gibt bewusst KEIN „Verzichten": Der Block ist bereits eingelöst und wird
 * mit dem Bankplatz bezahlt – gewählt wird nur, wer sich opfert.
 */
export function ReaktionsAuswahl({
  reaktion,
  onEntscheiden
}: {
  reaktion: ReaktionsView;
  onEntscheiden: (slot: 0 | 1 | 2, choice?: 'A' | 'B') => void;
}) {
  return (
    <div className="overlay reaction-overlay">
      <div className="reaction-box" role="dialog" aria-label="Cheerleader-Reaktion">
        <h2 className="reaction-title">📣 Cheerleader-Reaktion</h2>
        <p className="reaction-trigger">{AUSLOESER_TEXT[reaktion.ausloeser]}</p>
        <p className="reaction-cost">
          Ein Cheerleader opfert sich dafür. Wähle, wer – das kostet weder
          Energie noch deinen Zug, nur den Bankplatz.
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
            <p className="hint">Kein Cheerleader mehr auf der Bank.</p>
          )}
        </div>
      </div>
    </div>
  );
}

