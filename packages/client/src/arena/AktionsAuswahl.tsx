import { useState } from 'react';
import type { ClientView, PlayerAction, CardDef } from '@pcf/engine';

type Play = Extract<PlayerAction, { type: 'playAction' }>;
const fields = ['graveId', 'handInstanceId', 'targetUid', 'secondUid', 'toLane'] as const;
export function AktionsAuswahl({ view, card, actions, initialUid, onAction, onCancel }: {
  view: ClientView; card: CardDef; actions: Play[]; initialUid?: number;
  onAction: (a: PlayerAction) => void; onCancel: () => void;
}) {
  const [chosen, setChosen] = useState<Partial<Play>>(initialUid === undefined ? {} : { targetUid: initialUid });
  const candidates = actions.filter(a => Object.entries(chosen).every(([k, v]) => a[k as keyof Play] === v));
  const field = fields.find(k => chosen[k] === undefined && candidates.some(a => a[k] !== undefined));
  const labels: Record<typeof fields[number], string> = { graveId: 'Besiegte Figur wählen', handInstanceId: 'Handkarte wählen', targetUid: 'Figur wählen oder direkt auf dem Feld antippen', secondUid: 'Zweiten Verbündeten wählen', toLane: 'Zielbahn wählen' };
  const name = (uid: number) => {
    for (const side of [0, 1]) for (const rear of [false, true]) {
      const row = rear ? view.teamBoard[side] : view.board[side];
      const lane = row.findIndex(c => c?.uid === uid);
      if (lane >= 0) return `${row[lane]!.name} · Bahn ${lane + 1}${rear ? ' · hinten' : ''}`;
    }
    return `Figur ${uid}`;
  };
  const label = (k: typeof fields[number], id: number) => {
    if (k === 'toLane') return `Bahn ${id + 1}`;
    if (k === 'handInstanceId') {
      const index = view.handInstanceIds?.indexOf(id) ?? -1;
      return `${view.hand[index]?.name ?? 'Handkarte'} · Karte ${index + 1} · ${view.hand[index]?.cost ?? 0} Energie`;
    }
    return k === 'graveId' ? `${view.graveyard?.find(g => g.id === id)?.name ?? 'Besiegte Figur'} · ${id}` : name(id);
  };
  const pick = (k: typeof fields[number], id: number) => {
    const next = { ...chosen, [k]: id };
    const remaining = candidates.filter(a => a[k] === id);
    if (remaining.length === 1 && fields.every(f => remaining[0][f] === undefined || next[f] !== undefined)) onAction(remaining[0]);
    else setChosen(next);
  };
  return <aside className="alpha-action-panel" aria-label="Karte ausspielen">
    <div className="alpha-action-head"><strong>{card.name} · {card.cost} Energie</strong><button onClick={onCancel} aria-label="Auswahl abbrechen">✕</button></div>
    <p>{card.text}</p>
    {field && <small>Auswahl {Object.keys(chosen).length + 1} von {fields.filter(k => actions.some(a => a[k] !== undefined)).length}</small>}
    {field ? <><span>{labels[field]}</span><div className="alpha-target-options">{[...new Set(candidates.map(a => a[field]).filter((v): v is number => v !== undefined))].map(id => <button key={id} onClick={() => pick(field, id)}>{label(field, id)}</button>)}{field === 'targetUid' && candidates.some(a => a.targetLane === -1) && <button onClick={() => onAction(candidates.find(a => a.targetLane === -1)!)}>Gegnerische Basis</button>}</div></> : candidates.length ? <button onClick={() => onAction(candidates[0])}>Ausspielen</button> : <p>Momentan kein gültiges Ziel.</p>}
    {Object.keys(chosen).length > 0 && <button className="secondary" onClick={() => setChosen({})}>Ziel neu wählen</button>}
  </aside>;
}
