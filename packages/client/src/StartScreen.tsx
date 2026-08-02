import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import type {
  CardDef,
  CheerleaderConfig,
  CheerleaderSelection,
  DeckbuildingConfig,
  DeckList,
  DeckSelection,
  Faction,
  Topic
} from '@pcf/engine';
import { DeckEditor } from './DeckEditor';
import {
  deckProblems,
  loadDeckLibrary,
  newDeckId,
  saveDeckLibrary,
  type SavedDeck
} from './deckLibrary';
import {
  cheerleaderStorageKey,
  deckContains,
  loadCheerleaderSelection,
  saveCheerleaderSelection
} from './cheerleaderSelection';
import type { ConnectionStatus } from './useGame';
import { defaultServerHost, isCloud, toInfoUrl } from './config';

const params = new URLSearchParams(window.location.search);
const defaultServer = params.get('server') ?? defaultServerHost();
const defaultRoom = params.get('room') ?? '';

interface Props {
  status: ConnectionStatus;
  onCreate: (
    server: string,
    selection: DeckSelection,
    cheerleaders: CheerleaderSelection,
    topicId: string,
    testMode?: boolean
  ) => void;
  onJoin: (
    server: string,
    code: string,
    selection: DeckSelection,
    cheerleaders: CheerleaderSelection
  ) => void;
}

interface Info {
  factions: Faction[];
  topics: Topic[];
  cards: CardDef[];
  deckbuilding: DeckbuildingConfig;
  cheerleaders: CheerleaderConfig;
  decks: Record<string, DeckList>;
  deckStatus?: { active: string[]; allowCustomDecks: boolean; disabledReason: string };
}

function selectedDeck(info: Info, selection: DeckSelection): DeckList | null {
  return selection.kind === 'preset' ? info.decks[selection.id] ?? null : selection.deck;
}

export function StartScreen({ status, onCreate, onJoin }: Props) {
  const [server, setServer] = useState(defaultServer);
  const [mode, setMode] = useState<'create' | 'join'>(defaultRoom ? 'join' : 'create');
  const [room, setRoom] = useState(defaultRoom);
  const [info, setInfo] = useState<Info | null>(null);
  const [topFaction, setTopFaction] = useState<string | null>(null);
  const [selection, setSelection] = useState<DeckSelection | null>(null);
  const [cheerleaders, setCheerleaders] = useState<string[]>([]);
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
    } catch (error) {
      setInfo(null);
      setLoadError(
        error instanceof Error && error.message
          ? error.message
          : `Server unter "${serverInput}" nicht erreichbar.`
      );
    }
  }, []);

  useEffect(() => {
    void loadInfo(server);
    // Die Startadresse wird nur beim Mount automatisch geprüft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topFactions = info?.factions.filter((f) => f.parent === null && !f.neutral) ?? [];
  const activeDeckIds = new Set(info?.deckStatus?.active ?? Object.keys(info?.decks ?? {}));
  const presetEntries = Object.entries(info?.decks ?? {}).filter(
    ([id, deck]) => activeDeckIds.has(id) && deck.faction === topFaction
  );
  const customDecksEnabled = info?.deckStatus?.allowCustomDecks ?? true;
  const ownDecks = library.filter((deck) => deck.faction === topFaction);
  const deck = selection && info ? selectedDeck(info, selection) : null;
  const selectionKey = selection ? cheerleaderStorageKey(selection) : '';
  const deckValid =
    selection?.kind === 'preset' ||
    (selection?.kind === 'custom' &&
      customDecksEnabled &&
      !!info &&
      deckProblems(
        selection.deck,
        topFaction!,
        info.cards,
        info.factions,
        info.deckbuilding
      ).length === 0);
  const cheerleadersValid =
    !!info &&
    !!deck &&
    cheerleaders.length === info.cheerleaders.selectionSize &&
    new Set(cheerleaders).size === cheerleaders.length &&
    cheerleaders.every(
      (id) =>
        info.cheerleaders.candidates.includes(id) &&
        (info.cheerleaders.allowDeckOverlap || !deckContains(deck, id))
    );
  const busy = status === 'connecting';

  useEffect(() => {
    if (!selection || !info || !deck) {
      setCheerleaders([]);
      return;
    }
    setCheerleaders(loadCheerleaderSelection(selection, deck, info.cheerleaders) ?? []);
    // selectionKey bildet Preset-ID bzw. stabile eigene Deck-ID ab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, info]);

  useEffect(() => {
    if (selection && cheerleadersValid) {
      saveCheerleaderSelection(selection, cheerleaders as CheerleaderSelection);
    }
  }, [selection, selectionKey, cheerleaders, cheerleadersValid]);

  const cardById = useMemo(
    () => new Map(info?.cards.map((card) => [card.id, card]) ?? []),
    [info]
  );

  const chooseFaction = (id: string) => {
    setTopFaction(id);
    setSelection(null);
    setCheerleaders([]);
    setEditor(null);
  };

  const chooseDeck = (next: DeckSelection) => {
    setSelection(next);
    setCheerleaders([]);
  };

  const toggleCheerleader = (cardId: string) => {
    if (!deck || (!info?.cheerleaders.allowDeckOverlap && deckContains(deck, cardId))) return;
    setCheerleaders((current) => {
      if (current.includes(cardId)) return current.filter((id) => id !== cardId);
      if (!info || current.length >= info.cheerleaders.selectionSize) return current;
      return [...current, cardId];
    });
  };

  const saveEditor = (saved: SavedDeck) => {
    const next = [...library.filter((deckEntry) => deckEntry.id !== saved.id), saved];
    setLibrary(next);
    saveDeckLibrary(next);
    setEditor(null);
    chooseDeck({ kind: 'custom', deck: saved });
  };

  const removeDeck = (id: string) => {
    const next = library.filter((deckEntry) => deckEntry.id !== id);
    setLibrary(next);
    saveDeckLibrary(next);
    if (selection?.kind === 'custom' && (selection.deck as SavedDeck).id === id) {
      setSelection(null);
      setCheerleaders([]);
    }
  };

  const cloneDeck = (source: DeckList) =>
    setEditor({
      initial: {
        id: newDeckId(),
        name: `${source.name ?? 'Deck'} – Kopie`,
        faction: topFaction!,
        cards: source.cards,
        updatedAt: new Date().toISOString()
      }
    });

  const exportDeck = (saved: SavedDeck) => {
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${saved.name.replace(/[^a-z0-9_-]+/gi, '_')}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  const importDeck = async (file?: File) => {
    if (!file || !info || !topFaction) return;
    try {
      const raw = JSON.parse(await file.text()) as DeckList;
      setEditor({
        initial: {
          ...raw,
          id: newDeckId(),
          name: raw.name?.trim() || 'Importiertes Deck',
          faction: topFaction,
          updatedAt: new Date().toISOString()
        }
      });
    } catch {
      setLoadError('Die Deckdatei ist kein gültiges JSON.');
    }
  };

  if (editor && info && topFaction) {
    return (
      <div className="screen start-screen">
        <DeckEditor
          faction={topFaction}
          factions={info.factions}
          cards={info.cards}
          rules={info.deckbuilding}
          initial={editor.initial}
          initialSub={editor.sub}
          onSave={saveEditor}
          onCancel={() => setEditor(null)}
        />
      </div>
    );
  }

  return (
    <div className="screen start-screen">
      <header className="start-header">
        <div className="logo-container">
          <img src="/assets/logo.png" className="main-logo" alt="Political Correct Fighters" />
        </div>
        <p className="subtitle">Das ultimative Duell: Humans vs. Animals</p>
      </header>

      <section className="panel">
        <div className="tabs">
          <button className={mode === 'create' ? 'tab active' : 'tab'} onClick={() => setMode('create')}>
            Partie erstellen
          </button>
          <button className={mode === 'join' ? 'tab active' : 'tab'} onClick={() => setMode('join')}>
            Partie beitreten
          </button>
        </div>
      </section>

      {!isCloud && (
        <section className="panel">
          <label htmlFor="server">Server-Adresse</label>
          <div className="row">
            <input id="server" value={server} onChange={(event) => setServer(event.target.value)} onBlur={() => loadInfo(server)} />
            <button className="secondary" onClick={() => loadInfo(server)}>Prüfen</button>
          </div>
        </section>
      )}

      {loadError && <section className="panel"><p className="hint error-hint">{loadError}</p></section>}

      <section className="panel wizard-step">
        <h2><span>1</span> Oberfraktion wählen</h2>
        <div className="faction-grid top-faction-grid">
          {topFactions.map((faction) => (
            <button
              key={faction.id}
              className={`faction-card ${topFaction === faction.id ? 'selected' : ''}`}
              style={{ '--faction-color': faction.color } as CSSProperties}
              onClick={() => chooseFaction(faction.id)}
            >
              <div className="faction-emblem-wrapper"><FactionEmblem faction={faction} /></div>
              <strong className="faction-name">{faction.name}</strong>
              <span className="faction-desc">{faction.description}</span>
            </button>
          ))}
        </div>
      </section>

      {topFaction && info && (
        <section className="panel wizard-step">
          <h2><span>2</span> Deck wählen</h2>
          <h3>Prebuilds</h3>
          <div className="preset-grid">
            {presetEntries.map(([id, preset]) => (
              <DeckChoice
                key={id}
                deck={preset}
                cards={info.cards}
                factions={info.factions}
                selected={selection?.kind === 'preset' && selection.id === id}
                disabled={!activeDeckIds.has(id)}
                disabledReason={info.deckStatus?.disabledReason}
                onChoose={() => chooseDeck({ kind: 'preset', id })}
                onClone={() => cloneDeck(preset)}
              />
            ))}
          </div>
          <div className={`deck-section-head ${customDecksEnabled ? '' : 'disabled'}`}>
            <h3>Eigene Decks</h3>
            <div>
              <button className="secondary" disabled={!customDecksEnabled} onClick={() => setEditor({})}>+ Neues Deck</button>
              <button className="secondary" disabled={!customDecksEnabled} onClick={() => importRef.current?.click()}>Importieren</button>
              <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importDeck(event.target.files?.[0])} />
            </div>
          </div>
          {!customDecksEnabled && <p className="hint">Eigene Decks bleiben gespeichert und werden nach der Alpha-Balancingphase wieder freigeschaltet.</p>}
          <div className="subfaction-templates">
            {info.factions.filter((faction) => faction.parent === topFaction).map((faction) => (
              <button className="secondary" disabled={!customDecksEnabled} key={faction.id} onClick={() => setEditor({ sub: faction.id })}>
                Leer mit Filter: {faction.name}
              </button>
            ))}
          </div>
          {ownDecks.length === 0 ? (
            <p className="hint">Noch keine eigenen Decks gespeichert.</p>
          ) : (
            <div className="preset-grid">
              {ownDecks.map((ownDeck) => {
                const invalid = deckProblems(ownDeck, topFaction, info.cards, info.factions, info.deckbuilding);
                const selected = selection?.kind === 'custom' && (selection.deck as SavedDeck).id === ownDeck.id;
                return (
                  <article key={ownDeck.id} className={`preset-card ${selected ? 'selected' : ''} ${customDecksEnabled ? '' : 'disabled'}`}>
                    <button className="preset-main" disabled={!customDecksEnabled || invalid.length > 0} onClick={() => chooseDeck({ kind: 'custom', deck: ownDeck })}>
                      <strong>{ownDeck.name}</strong>
                      <span>{ownDeck.cards.reduce((sum, entry) => sum + entry.count, 0)} Karten</span>
                      {invalid.length > 0 && <small>{invalid.join(' · ')}</small>}
                    </button>
                    <div className="preset-actions">
                      <button onClick={() => setEditor({ initial: ownDeck })}>Bearbeiten</button>
                      <button onClick={() => cloneDeck(ownDeck)}>Duplizieren</button>
                      <button onClick={() => exportDeck(ownDeck)}>Export</button>
                      <button onClick={() => removeDeck(ownDeck.id)}>Löschen</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {topFaction && selection && info && deck && (
        <section className="panel wizard-step cheerleader-step">
          <div className="wizard-title-row">
            <h2><span>3</span> Cheerleader wählen</h2>
            <small>{cheerleaders.length}/{info.cheerleaders.selectionSize} aufgestellt</small>
          </div>
          <div className="cheerleader-slots" aria-label="Drei feste Bankplätze">
            {Array.from({ length: info.cheerleaders.selectionSize }, (_, slot) => {
              const id = cheerleaders[slot];
              return (
                <div key={slot} className={`cheerleader-slot ${id ? 'filled' : ''}`}>
                  <span className="slot-number">{slot + 1}</span>
                  <strong>{id ? cardById.get(id)?.name ?? id : 'Platz frei'}</strong>
                </div>
              );
            })}
          </div>
          <div className="cheerleader-candidates">
            {info.cheerleaders.candidates.map((id) => {
              const card = cardById.get(id);
              const locked = !info.cheerleaders.allowDeckOverlap && deckContains(deck, id);
              const slot = cheerleaders.indexOf(id);
              return (
                <button
                  type="button"
                  key={id}
                  className={`cheerleader-candidate ${slot >= 0 ? 'selected' : ''} ${locked ? 'locked' : ''}`}
                  disabled={locked}
                  onClick={() => toggleCheerleader(id)}
                  aria-pressed={slot >= 0}
                >
                  <span className="candidate-portrait">{card?.name.charAt(0) ?? '?'}</span>
                  <span>
                    <strong>{card?.name ?? id}</strong>
                    <small>{locked ? 'Im Deck · nicht verfügbar' : slot >= 0 ? `Bankplatz ${slot + 1}` : 'Für die Bank verfügbar'}</small>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="hint">Die Reihenfolge bestimmt die festen Plätze. Deckfiguren bleiben sichtbar, sind aber gesperrt.</p>
        </section>
      )}

      {topFaction && selection && info && (
        <section className="panel wizard-step">
          <h2><span>4</span> {mode === 'create' ? 'Partie einrichten' : 'Raum beitreten'}</h2>
          {mode === 'create' ? (
            <>
              <h3>Schauplatz</h3>
              <div className="topic-grid">
                {info.topics.map((topic) => (
                  <button
                    key={topic.id}
                    className={`topic-card ${topicId === topic.id ? 'selected' : ''}`}
                    style={{ '--topic-accent': topic.colors.accent } as CSSProperties}
                    onClick={() => setTopicId(topic.id)}
                  >
                    <span className="topic-emoji">{topic.emoji}</span>
                    <span className="topic-name">{topic.name}</span>
                  </button>
                ))}
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={testMode} onChange={(event) => setTestMode(event.target.checked)} />
                🧪 Testmodus
              </label>
              <button
                className="primary big"
                disabled={!deckValid || !cheerleadersValid || !topicId || busy}
                onClick={() =>
                  onCreate(server, selection, cheerleaders as CheerleaderSelection, topicId!, testMode)
                }
              >
                {busy ? 'Verbinde …' : 'Partie erstellen'}
              </button>
            </>
          ) : (
            <>
              <label htmlFor="room">Raum-Code</label>
              <input id="room" inputMode="numeric" maxLength={4} value={room} onChange={(event) => setRoom(event.target.value.replace(/\D/g, ''))} placeholder="z. B. 4217" />
              <button
                className="primary big"
                disabled={!deckValid || !cheerleadersValid || room.length !== 4 || busy}
                onClick={() => onJoin(server, room, selection, cheerleaders as CheerleaderSelection)}
              >
                {busy ? 'Verbinde …' : 'Beitreten'}
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function DeckChoice({
  deck,
  cards,
  factions,
  selected,
  disabled,
  disabledReason,
  onChoose,
  onClone
}: {
  deck: DeckList;
  cards: CardDef[];
  factions: Faction[];
  selected: boolean;
  disabled: boolean;
  disabledReason?: string;
  onChoose: () => void;
  onClone: () => void;
}) {
  const defs = deck.cards
    .flatMap((entry) => Array.from({ length: entry.count }, () => cards.find((card) => card.id === entry.cardId)))
    .filter(Boolean) as CardDef[];
  const subs = [...new Set(defs.map((card) => factions.find((faction) => faction.id === card.faction)?.name ?? card.faction))];
  const curve = [1, 2, 3, 4, 5].map((cost) => defs.filter((card) => cost < 5 ? card.cost === cost : card.cost >= 5).length);
  return (
    <article className={`preset-card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}>
      <button className="preset-main" disabled={disabled} onClick={onChoose}>
        <strong>{deck.name}</strong>
        <span>{subs.join(' · ')}</span>
        <small>{curve.map((amount, index) => `⚡${index + 1}${index === 4 ? '+' : ''}: ${amount}`).join('  ')}</small>
        {disabled && (
          <small className="preset-disabled-note">
            Später wieder verfügbar{disabledReason ? `: ${disabledReason}` : '.'}
          </small>
        )}
      </button>
      {!disabled && <div className="preset-actions"><button onClick={onClone}>Als eigenes Deck kopieren</button></div>}
    </article>
  );
}

function FactionEmblem({ faction }: { faction: Faction }) {
  const candidates = [faction.id, ...(faction.parent ? [faction.parent] : [])];
  const [step, setStep] = useState(0);
  if (step >= candidates.length) {
    return <span className="faction-emblem-fallback">{faction.name.charAt(0)}</span>;
  }
  return (
    <img
      src={`/assets/emblems/${candidates[step]}.png`}
      className="faction-emblem"
      alt={`${faction.name} Emblem`}
      onError={() => setStep((value) => value + 1)}
    />
  );
}
