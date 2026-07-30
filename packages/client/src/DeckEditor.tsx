import { useMemo, useState } from 'react';
import type { CardDef, DeckbuildingConfig, Faction } from '@pcf/engine';
import { deckProblems, isNeutralFaction, maxCopiesOfCard, newDeckId, setCardCount, type SavedDeck } from './deckLibrary';

interface Props {
  faction: string;
  factions: Faction[];
  cards: CardDef[];
  rules: DeckbuildingConfig;
  initial?: SavedDeck;
  initialSub?: string;
  onSave: (deck: SavedDeck) => void;
  onCancel: () => void;
}

export function DeckEditor({ faction, factions, cards, rules, initial, initialSub, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? (initialSub ? `${factions.find((f) => f.id === initialSub)?.name ?? ''} Deck` : 'Neues Deck'));
  const [entries, setEntries] = useState(initial?.cards ?? []);
  const [sub, setSub] = useState(initialSub ?? 'all');
  const [type, setType] = useState<'all' | 'creature' | 'action'>('all');
  const [cost, setCost] = useState('all');
  const parent = useMemo(() => Object.fromEntries(factions.map((f) => [f.id, f.parent])), [factions]);
  // Neutrale Karten (z. B. der PC Principal) gehören zu keiner Seite und stehen
  // daher in jedem Deck zur Auswahl.
  const allowed = useMemo(() => cards.filter((c) => {
    const top = parent[c.faction] ?? c.faction;
    return top === faction || isNeutralFaction(top, factions);
  }), [cards, faction, factions, parent]);
  const visible = allowed.filter((c) => (sub === 'all' || c.faction === sub) && (type === 'all' || c.type === type) && (cost === 'all' || c.cost === Number(cost)));
  const deck = { name, faction, cards: entries };
  const problems = deckProblems(deck, faction, cards, factions, rules);
  const total = entries.reduce((s, e) => s + e.count, 0);
  const curve = Array.from({ length: 6 }, (_, n) => entries.reduce((sum, e) => {
    const c = cards.find((x) => x.id === e.cardId);
    return sum + (c && (n < 5 ? c.cost === n : c.cost >= 5) ? e.count : 0);
  }, 0));
  const countOf = (id: string) => entries.find((e) => e.cardId === id)?.count ?? 0;
  // Eigene Deck-Limits für Heroes/Principals (zählen daneben regulär zur Deckgröße).
  const countCategory = (category: 'hero' | 'principal') => entries.reduce((sum, e) => {
    const c = cards.find((x) => x.id === e.cardId);
    return sum + (c?.category === category ? e.count : 0);
  }, 0);
  const heroes = countCategory('hero');
  const principals = countCategory('principal');
  const categoryFull = (card: CardDef) =>
    (card.category === 'hero' && heroes >= (rules.maxHeroes ?? 2)) ||
    (card.category === 'principal' && principals >= (rules.maxPrincipals ?? 1));
  const CATEGORY_LABEL: Record<'hero' | 'principal', string> = { hero: 'Hero', principal: 'PC Principal' };

  return <section className="panel deck-editor">
    <div className="deck-editor-head"><h2>Eigenes Deck</h2><button className="secondary" onClick={onCancel}>Schließen</button></div>
    <label>Deckname<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
    <div className="deck-curve"><strong>{total}/{rules.size}</strong>{curve.map((n, i) => <span key={i}>⚡{i === 5 ? '5+' : i}: {n}</span>)}<span>Heroes: {heroes}/{rules.maxHeroes ?? 2}</span><span>PC Principal: {principals}/{rules.maxPrincipals ?? 1}</span></div>
    <div className="deck-filters">
      <select value={sub} onChange={(e) => setSub(e.target.value)}><option value="all">Alle Unterfraktionen</option>{factions.filter((f) => f.parent === faction).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
      <select value={type} onChange={(e) => setType(e.target.value as typeof type)}><option value="all">Alle Kartentypen</option><option value="creature">Kreaturen</option><option value="action">Aktionen</option></select>
      <select value={cost} onChange={(e) => setCost(e.target.value)}><option value="all">Alle Kosten</option>{[0,1,2,3,4,5,6].map((n) => <option key={n} value={n}>⚡ {n}</option>)}</select>
    </div>
    <div className="deck-card-list">{visible.map((card) => {
      const count = countOf(card.id); const max = maxCopiesOfCard(card, rules);
      return <article key={card.id} className="deck-builder-card">
        <div className="deck-art"><span>🃏</span><img src={`/assets/cards/${card.id}.png`} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} /></div>
        <div><strong>{card.name}{card.signature ? ' ★' : ''}</strong><small>⚡ {card.cost} · {factions.find((f) => f.id === card.faction)?.name}{card.category ? ` · ${CATEGORY_LABEL[card.category]}` : ''}</small><p>{card.text}</p></div>
        <div className="copy-stepper"><button aria-label={`${card.name} entfernen`} disabled={count === 0} onClick={() => setEntries(setCardCount(entries, card.id, count - 1))}>−</button><b>{count}</b><button aria-label={`${card.name} hinzufügen`} disabled={count >= max || total >= rules.size || categoryFull(card)} onClick={() => setEntries(setCardCount(entries, card.id, count + 1))}>+</button></div>
      </article>;
    })}</div>
    <div className={problems.length ? 'deck-validation invalid' : 'deck-validation valid'}>{problems.length ? problems.join(' · ') : 'Deck ist spielbereit.'}</div>
    <button className="primary big" onClick={() => onSave({ id: initial?.id ?? newDeckId(), name: name.trim(), faction, cards: entries, updatedAt: new Date().toISOString() })}>Entwurf speichern</button>
  </section>;
}
