import type { ReactNode } from 'react';

export function CoachHint({
  title,
  children,
  onDone,
  onSkip
}: {
  title: string;
  children: ReactNode;
  onDone: () => void;
  onSkip: () => void;
}) {
  return (
    <aside className="coach-hint" aria-label="Spieleinstieg">
      <span className="coach-kicker">Kurz erklärt</span>
      <strong>{title}</strong>
      <p>{children}</p>
      <div className="coach-actions">
        <button type="button" onClick={onDone}>Verstanden</button>
        <button type="button" onClick={onSkip}>Alle Hinweise aus</button>
      </div>
    </aside>
  );
}
