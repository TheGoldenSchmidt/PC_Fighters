import { useMemo, useState } from 'react';
import type { CardDef, ChampionDef, DeckbuildingConfig, Faction } from '@pcf/engine';
import {
  deckProblems,
  isNeutralFaction,
  maxCopiesOfCard,
  newDeckId,
  setCardCount,
  type SavedDeck
} from './deckLibrary';

interface Props {
  champion: ChampionDef;
  factions: Faction[];
  cards: CardDef[];
  rules: DeckbuildingConfig;
  initial?: SavedDeck;
  onSave: (deck: SavedDeck) => void;
  onCancel: () => void;
}

export function DeckEditor({ champion, factions, cards, rules, initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? `${champion.name} Deck`);
  const [entries, setEntries] = useState(initial?.cards ?? []);
  const [classFilter, setClassFilter] = useState('all');
  const [type, setType] = useState<'all' | CardDef['type']>('all');
  const [cost, setCost] = useState('all');
  const parent = useMemo(() => Object.fromEntries(factions.map((faction) => [faction.id, faction.parent])), [factions]);
  const allowed = useMemo(
    () => cards.filter((card) => {
      if (card.deckable === false) return false;
      const top = parent[card.faction] ?? card.faction;
      return champion.classes.includes(card.faction) || isNeutralFaction(top, factions);
    }),
    [cards, champion, factions, parent]
  );
  const visible = allowed.filter(
    (card) =>
      (classFilter === 'all' || card.faction === classFilter) &&
      (type === 'all' || card.type === type) &&
      (cost === 'all' || card.cost === Number(cost))
  );
  const deck = { name, faction: champion.side, championId: champion.id, cards: entries };
  const problems = deckProblems(deck, champion, cards, factions, rules);
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  const countOf = (id: string) => entries.find((entry) => entry.cardId === id)?.count ?? 0;

  return (
    <section className="panel deck-editor">
      <div className="deck-editor-head">
        <div><h2>{champion.name}: eigenes Deck</h2><small>{champion.classes.join(' + ')}</small></div>
        <button className="secondary" onClick={onCancel}>Schließen</button>
      </div>
      <label>Deckname<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} /></label>
      <div className="deck-curve"><strong>{total}/{rules.size}</strong><span>Maximal {rules.maxCopies} Kopien je Karte</span></div>
      <div className="deck-filters">
        <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
          <option value="all">Beide Klassen + Neutral</option>
          {champion.classes.map((classId) => <option key={classId} value={classId}>{factions.find((faction) => faction.id === classId)?.name ?? classId}</option>)}
        </select>
        <select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
          <option value="all">Alle Kartentypen</option>
          <option value="creature">Kämpfer</option>
          <option value="action">Aktionen</option>
          <option value="environment">Umgebungen</option>
        </select>
        <select value={cost} onChange={(event) => setCost(event.target.value)}>
          <option value="all">Alle Kosten</option>
          {[0, 1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>⚡ {value}</option>)}
        </select>
      </div>
      <div className="deck-card-list">
        {visible.map((card) => {
          const count = countOf(card.id);
          const max = maxCopiesOfCard(card, rules);
          return (
            <article key={card.id} className="deck-builder-card">
              <div className="deck-art"><span>🃏</span><img src={`/assets/cards/${card.id}.png`} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /></div>
              <div><strong>{card.name}</strong><small>⚡ {card.cost} · {factions.find((faction) => faction.id === card.faction)?.name}</small><p>{card.text}</p></div>
              <div className="copy-stepper">
                <button aria-label={`${card.name} entfernen`} disabled={count === 0} onClick={() => setEntries(setCardCount(entries, card.id, count - 1))}>−</button>
                <b>{count}</b>
                <button aria-label={`${card.name} hinzufügen`} disabled={count >= max || total >= rules.size} onClick={() => setEntries(setCardCount(entries, card.id, count + 1))}>+</button>
              </div>
            </article>
          );
        })}
      </div>
      <div className={problems.length ? 'deck-validation invalid' : 'deck-validation valid'}>{problems.length ? problems.join(' · ') : 'Deck ist spielbereit.'}</div>
      <button
        className="primary big"
        disabled={problems.length > 0}
        onClick={() => onSave({
          id: initial?.id ?? newDeckId(), name: name.trim(), faction: champion.side,
          championId: champion.id, cards: entries, updatedAt: new Date().toISOString()
        })}
      >Deck speichern</button>
    </section>
  );
}
