import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CardDef, DeckbuildingConfig, DeckList, DeckSelection, Faction, Topic } from '@pcf/engine';
import { DeckEditor } from './DeckEditor';
import { deckProblems, loadDeckLibrary, newDeckId, saveDeckLibrary, type SavedDeck } from './deckLibrary';
import type { ConnectionStatus } from './useGame';
import { defaultServerHost, isCloud, toInfoUrl } from './config';

const params = new URLSearchParams(window.location.search);
const defaultServer = params.get('server') ?? defaultServerHost();
const defaultRoom = params.get('room') ?? '';

interface Props {
  status: ConnectionStatus;
  onCreate: (server: string, selection: DeckSelection, topicId: string, testMode?: boolean) => void;
  onJoin: (server: string, code: string, selection: DeckSelection) => void;
}

interface Info {
  factions: Faction[];
  topics: Topic[];
  cards: CardDef[];
  deckbuilding: DeckbuildingConfig;
  decks: Record<string, DeckList>;
}

export function StartScreen({ status, onCreate, onJoin }: Props) {
  const [server, setServer] = useState(defaultServer);
  const [mode, setMode] = useState<'create' | 'join'>(defaultRoom ? 'join' : 'create');
  const [room, setRoom] = useState(defaultRoom);
  const [info, setInfo] = useState<Info | null>(null);
  const [topFaction, setTopFaction] = useState<string | null>(null);
  const [selection, setSelection] = useState<DeckSelection | null>(null);
  const [library, setLibrary] = useState(loadDeckLibrary);
  const [editor, setEditor] = useState<{ initial?: SavedDeck; sub?: string } | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const loadInfo = useCallback(async (serverInput: string) => {
    setLoadError(null);
    try {
      const res = await fetch(toInfoUrl(serverInput));
      const json = await res.json();
      if (json.dataError) throw new Error(json.dataError as string);
      const loaded = json as Info;
      setInfo(loaded);
      setTopicId((current) => current ?? loaded.topics?.[0]?.id ?? null);
    } catch (e) {
      setInfo(null);
      setLoadError(e instanceof Error && e.message ? e.message : `Server unter "${serverInput}" nicht erreichbar.`);
    }
  }, []);
  useEffect(() => { void loadInfo(server); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Neutrale Oberfraktionen (z. B. "neutral" für den PC Principal) sind keine
  // spielbare Seite – ihre Karten stehen aber in jedem Deck zur Auswahl.
  const topFactions = info?.factions.filter((f) => f.parent === null && !f.neutral) ?? [];
  const presetEntries = Object.entries(info?.decks ?? {}).filter(([, d]) => d.faction === topFaction);
  const ownDecks = library.filter((d) => d.faction === topFaction);
  const selectedValid = selection?.kind === 'preset' || (selection?.kind === 'custom' && !!info && deckProblems(selection.deck, topFaction!, info.cards, info.factions, info.deckbuilding).length === 0);
  const busy = status === 'connecting';

  const chooseFaction = (id: string) => { setTopFaction(id); setSelection(null); setEditor(null); };
  const saveEditor = (deck: SavedDeck) => {
    const next = [...library.filter((d) => d.id !== deck.id), deck];
    setLibrary(next); saveDeckLibrary(next); setEditor(null); setSelection({ kind: 'custom', deck });
  };
  const removeDeck = (id: string) => {
    const next = library.filter((d) => d.id !== id); setLibrary(next); saveDeckLibrary(next);
    if (selection?.kind === 'custom' && (selection.deck as SavedDeck).id === id) setSelection(null);
  };
  const cloneDeck = (deck: DeckList) => setEditor({ initial: { id: newDeckId(), name: `${deck.name ?? 'Deck'} – Kopie`, faction: topFaction!, cards: deck.cards, updatedAt: new Date().toISOString() } });
  const exportDeck = (deck: SavedDeck) => {
    const blob = new Blob([JSON.stringify(deck, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${deck.name.replace(/[^a-z0-9_-]+/gi, '_')}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  const importDeck = async (file?: File) => {
    if (!file || !info || !topFaction) return;
    try {
      const raw = JSON.parse(await file.text()) as DeckList;
      const imported: SavedDeck = { ...raw, id: newDeckId(), name: raw.name?.trim() || 'Importiertes Deck', faction: topFaction, updatedAt: new Date().toISOString() };
      setEditor({ initial: imported });
    } catch { setLoadError('Die Deckdatei ist kein gültiges JSON.'); }
  };

  if (editor && info && topFaction) return <div className="screen start-screen"><DeckEditor faction={topFaction} factions={info.factions} cards={info.cards} rules={info.deckbuilding} initial={editor.initial} initialSub={editor.sub} onSave={saveEditor} onCancel={() => setEditor(null)} /></div>;

  return <div className="screen start-screen">
    <header className="start-header"><div className="logo-container"><img src="/assets/logo.png" className="main-logo" alt="Political Correct Fighters" /></div><p className="subtitle">Das ultimative Duell: Humans vs. Animals</p></header>
    <section className="panel"><div className="tabs"><button className={mode === 'create' ? 'tab active' : 'tab'} onClick={() => setMode('create')}>Partie erstellen</button><button className={mode === 'join' ? 'tab active' : 'tab'} onClick={() => setMode('join')}>Partie beitreten</button></div></section>
    {!isCloud && <section className="panel"><label htmlFor="server">Server-Adresse</label><div className="row"><input id="server" value={server} onChange={(e) => setServer(e.target.value)} onBlur={() => loadInfo(server)} /><button className="secondary" onClick={() => loadInfo(server)}>Prüfen</button></div></section>}
    {loadError && <section className="panel"><p className="hint error-hint">{loadError}</p></section>}
    <section className="panel wizard-step"><h2><span>1</span> Oberfraktion wählen</h2><div className="faction-grid top-faction-grid">{topFactions.map((f) => <button key={f.id} className={`faction-card ${topFaction === f.id ? 'selected' : ''}`} style={{ '--faction-color': f.color } as CSSProperties} onClick={() => chooseFaction(f.id)}><div className="faction-emblem-wrapper"><FactionEmblem faction={f} /></div><strong className="faction-name">{f.name}</strong><span className="faction-desc">{f.description}</span></button>)}</div></section>
    {topFaction && info && <section className="panel wizard-step"><h2><span>2</span> Deck wählen</h2>
      <h3>Prebuilds</h3><div className="preset-grid">{presetEntries.map(([id, deck]) => <DeckChoice key={id} id={id} deck={deck} cards={info.cards} factions={info.factions} selected={selection?.kind === 'preset' && selection.id === id} onChoose={() => setSelection({ kind: 'preset', id })} onClone={() => cloneDeck(deck)} />)}</div>
      <div className="deck-section-head"><h3>Eigene Decks</h3><div><button className="secondary" onClick={() => setEditor({})}>+ Neues Deck</button><button className="secondary" onClick={() => importRef.current?.click()}>Importieren</button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(e) => void importDeck(e.target.files?.[0])} /></div></div>
      <div className="subfaction-templates">{info.factions.filter((f) => f.parent === topFaction).map((f) => <button className="secondary" key={f.id} onClick={() => setEditor({ sub: f.id })}>Leer mit Filter: {f.name}</button>)}</div>
      {ownDecks.length === 0 ? <p className="hint">Noch keine eigenen Decks gespeichert.</p> : <div className="preset-grid">{ownDecks.map((deck) => { const invalid = deckProblems(deck, topFaction, info.cards, info.factions, info.deckbuilding); return <article key={deck.id} className={`preset-card ${selection?.kind === 'custom' && (selection.deck as SavedDeck).id === deck.id ? 'selected' : ''}`}><button className="preset-main" disabled={invalid.length > 0} onClick={() => setSelection({ kind: 'custom', deck })}><strong>{deck.name}</strong><span>{deck.cards.reduce((s,e)=>s+e.count,0)} Karten</span>{invalid.length > 0 && <small>{invalid.join(' · ')}</small>}</button><div className="preset-actions"><button onClick={() => setEditor({ initial: deck })}>Bearbeiten</button><button onClick={() => cloneDeck(deck)}>Duplizieren</button><button onClick={() => exportDeck(deck)}>Export</button><button onClick={() => removeDeck(deck.id)}>Löschen</button></div></article>; })}</div>}
    </section>}
    {topFaction && selection && info && <section className="panel wizard-step"><h2><span>3</span> {mode === 'create' ? 'Partie einrichten' : 'Raum beitreten'}</h2>{mode === 'create' ? <><h3>Schauplatz</h3><div className="topic-grid">{info.topics.map((t) => <button key={t.id} className={`topic-card ${topicId === t.id ? 'selected' : ''}`} style={{ '--topic-accent': t.colors.accent } as CSSProperties} onClick={() => setTopicId(t.id)}><span className="topic-emoji">{t.emoji}</span><span className="topic-name">{t.name}</span></button>)}</div><label className="checkbox-row"><input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />🧪 Testmodus</label><button className="primary big" disabled={!selectedValid || !topicId || busy} onClick={() => onCreate(server, selection, topicId!, testMode)}>{busy ? 'Verbinde …' : 'Partie erstellen'}</button></> : <><label htmlFor="room">Raum-Code</label><input id="room" inputMode="numeric" maxLength={4} value={room} onChange={(e) => setRoom(e.target.value.replace(/\D/g, ''))} placeholder="z. B. 4217" /><button className="primary big" disabled={!selectedValid || room.length !== 4 || busy} onClick={() => onJoin(server, room, selection)}>{busy ? 'Verbinde …' : 'Beitreten'}</button></>}</section>}
  </div>;
}

function DeckChoice({ id, deck, cards, factions, selected, onChoose, onClone }: { id: string; deck: DeckList; cards: CardDef[]; factions: Faction[]; selected: boolean; onChoose: () => void; onClone: () => void }) {
  const defs = deck.cards.flatMap((e) => Array.from({ length: e.count }, () => cards.find((c) => c.id === e.cardId))).filter(Boolean) as CardDef[];
  const subs = [...new Set(defs.map((c) => factions.find((f) => f.id === c.faction)?.name ?? c.faction))];
  const curve = [1,2,3,4,5].map((cost) => defs.filter((c) => cost < 5 ? c.cost === cost : c.cost >= 5).length);
  return <article className={`preset-card ${selected ? 'selected' : ''}`}><button className="preset-main" onClick={onChoose}><strong>{deck.name}</strong><span>{subs.join(' · ')}</span><small>{curve.map((n,i) => `⚡${i+1}${i===4?'+':''}: ${n}`).join('  ')}</small></button><div className="preset-actions"><button onClick={onClone}>Als eigenes Deck kopieren</button></div></article>;
}

function FactionEmblem({ faction }: { faction: Faction }) {
  const candidates = [faction.id, ...(faction.parent ? [faction.parent] : [])];
  const [step, setStep] = useState(0);
  if (step >= candidates.length) return <span className="faction-emblem-fallback">{faction.name.charAt(0)}</span>;
  return <img src={`/assets/emblems/${candidates[step]}.png`} className="faction-emblem" alt={`${faction.name} Emblem`} onError={() => setStep((s) => s + 1)} />;
}
