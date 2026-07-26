import { useState } from 'react';
import type { ClientView, PlayerAction } from '@pcf/engine';

export function MulliganScreen({ view, onAction, onLeave }: { view: ClientView; onAction: (a: PlayerAction) => void; onLeave: () => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const me = view.you;
  const done = view.players[me].mulliganDone;
  const opponentDone = view.players[me === 0 ? 1 : 0].mulliganDone;
  const toggle = (i: number) => setSelected((s) => s.includes(i) ? s.filter((x) => x !== i) : [...s, i]);
  return <div className="screen mulligan-screen">
    <header><h1>Starthand</h1><p>Wähle beliebig viele Karten, die du einmalig austauschen möchtest.</p></header>
    <div className="mulligan-hand">{view.hand.map((card, i) => <button key={`${card.id}-${i}`} disabled={done} className={`mulligan-card ${selected.includes(i) ? 'selected' : ''}`} onClick={() => toggle(i)}><div className="mulligan-art"><span>🃏</span><img src={`/assets/cards/${card.id}.png`} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} /></div><strong>{card.name}</strong><span>⚡ {card.cost}</span><small>{selected.includes(i) ? 'Wird getauscht' : 'Behalten'}</small></button>)}</div>
    {!done ? <button className="primary big" onClick={() => onAction({ type: 'mulligan', handIndices: selected })}>{selected.length ? `${selected.length} Karte${selected.length === 1 ? '' : 'n'} tauschen` : 'Alle behalten'}</button> : <p className="mulligan-wait">✓ Bestätigt. {opponentDone ? 'Partie startet …' : 'Warte auf den Gegner …'}</p>}
    <button className="secondary" onClick={onLeave}>Partie verlassen</button>
  </div>;
}
