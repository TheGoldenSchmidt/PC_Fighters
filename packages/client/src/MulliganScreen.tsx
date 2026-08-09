import { useState } from 'react';
import type { ClientView, PlayerAction } from '@pcf/engine';
import { CardArt, CardPosterFallback, KartenDetail, type DetailData } from './arena/Karten';
import { CoachHint } from './arena/CoachHint';
import type { LocalProfileV1 } from './profile';

export function MulliganScreen({
  view,
  profile,
  onUpdateProfile,
  onAction,
  onLeave
}: {
  view: ClientView;
  profile: LocalProfileV1;
  onUpdateProfile: (change: (current: LocalProfileV1) => LocalProfileV1) => void;
  onAction: (a: PlayerAction) => void;
  onLeave: () => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const me = view.you;
  const done = view.players[me].mulliganDone;
  const opponentDone = view.players[me === 0 ? 1 : 0].mulliganDone;
  const showCoach = !profile.onboarding.skipped && !profile.onboarding.mulligan;
  const toggle = (i: number) =>
    setSelected((current) =>
      current.includes(i) ? current.filter((index) => index !== i) : [...current, i]
    );
  const finishCoach = (skipped = false) =>
    onUpdateProfile((current) => ({
      ...current,
      onboarding: {
        ...current.onboarding,
        mulligan: true,
        ...(skipped ? { skipped: true } : {})
      }
    }));

  return (
    <div className="screen mulligan-screen">
      <header>
        <span className="eyebrow">Vor dem Anpfiff</span>
        <h1>Starthand</h1>
        <p>Markiere Karten, die du einmalig austauschen möchtest.</p>
      </header>
      {showCoach && (
        <CoachHint
          title="Baue eine spielbare Kurve"
          onDone={() => finishCoach()}
          onSkip={() => finishCoach(true)}
        >
          Frühe Karten kosten wenig Energie. Tippe auf „Details“, um die Wirkung zu lesen,
          und auf die Karte, um sie zum Tausch zu markieren.
        </CoachHint>
      )}
      <div className="mulligan-hand">
        {view.hand.map((card, i) => (
          <article
            key={`${card.id}-${i}`}
            className={`mulligan-card ${selected.includes(i) ? 'selected' : ''}`}
          >
            <button
              type="button"
              className="mulligan-select"
              disabled={done}
              aria-pressed={selected.includes(i)}
              onClick={() => toggle(i)}
            >
              <div className="mulligan-art">
                <CardArt
                  cardId={card.id}
                  className="mulligan-art-img"
                  alt=""
                  fallback={
                    <CardPosterFallback faction={card.faction} type={card.type} name={card.name} />
                  }
                />
              </div>
              <strong>{card.name}</strong>
              <span className="mulligan-cost">⚡ {card.cost}</span>
              {card.type === 'creature' && (
                <small>⚔ {card.attack} · ♥ {card.health}</small>
              )}
              <span className="mulligan-choice">
                {selected.includes(i) ? 'Wird getauscht' : 'Behalten'}
              </span>
            </button>
            <button
              type="button"
              className="mulligan-info"
              onClick={() =>
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
                  signature: card.signature
                })
              }
              aria-label={`${card.name}: Details öffnen`}
            >
              Details
            </button>
          </article>
        ))}
      </div>
      {!done ? (
        <button
          className="primary big"
          onClick={() => onAction({ type: 'mulligan', handIndices: selected })}
        >
          {selected.length
            ? `${selected.length} Karte${selected.length === 1 ? '' : 'n'} tauschen`
            : 'Alle behalten'}
        </button>
      ) : (
        <p className="mulligan-wait" role="status">
          ✓ Bestätigt. {opponentDone ? 'Partie startet …' : 'Warte auf den Gegner …'}
        </p>
      )}
      <button className="secondary" onClick={onLeave}>Partie verlassen</button>
      {detail && (
        <KartenDetail
          detail={detail}
          keywordInfo={null}
          spielbar={false}
          onAusspielen={() => {}}
          onSchliessen={() => setDetail(null)}
        />
      )}
    </div>
  );
}
