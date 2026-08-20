import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type {
  CardDef,
  ChampionDef,
  DeckbuildingConfig,
  DeckList,
  DeckSelection,
  Faction,
  Topic
} from '@pcf/engine';
import { DeckEditor } from './DeckEditor';
import { deckProblems, loadDeckLibrary, saveDeckLibrary, type SavedDeck } from './deckLibrary';
import type { ConnectionStatus, UserAccount } from './useGame';
import type { LocalProfileV1, StoredLoadout } from './profile';
import { defaultServerHost, isCloud, toInfoUrl } from './config';

const params = new URLSearchParams(window.location.search);
const defaultServer = params.get('server') ?? defaultServerHost();
const defaultRoom = params.get('room') ?? '';

interface Props {
  status: ConnectionStatus;
  profile: LocalProfileV1;
  account: UserAccount | null;
  accountBusy: boolean;
  onLogin: (server: string, username: string) => Promise<boolean>;
  onLogout: () => void;
  onSaveAccountDeck: (deck: SavedDeck) => Promise<boolean>;
  onRememberLoadout: (championId: string, loadout: StoredLoadout) => void;
  onCreate: (server: string, selection: DeckSelection, championId: string, topicId: string, testMode?: boolean) => void;
  onJoin: (server: string, code: string, selection: DeckSelection, championId: string) => void;
}

interface Info {
  factions: Faction[];
  champions: ChampionDef[];
  topics: Topic[];
  cards: CardDef[];
  deckbuilding: DeckbuildingConfig;
  decks: Record<string, DeckList>;
  deckStatus?: { active: string[]; allowCustomDecks: boolean; disabledReason: string };
}

function deckFor(info: Info, selection: DeckSelection): DeckList | null {
  return selection.kind === 'preset' ? info.decks[selection.id] ?? null : selection.deck;
}

export function StartScreen({
  status,
  profile,
  account,
  accountBusy,
  onLogin,
  onLogout,
  onSaveAccountDeck,
  onRememberLoadout,
  onCreate,
  onJoin
}: Props) {
  const [server, setServer] = useState(defaultServer);
  const [mode, setMode] = useState<'create' | 'join'>(defaultRoom ? 'join' : 'create');
  const [room, setRoom] = useState(defaultRoom);
  const [info, setInfo] = useState<Info | null>(null);
  const [championId, setChampionId] = useState<string | null>(null);
  const [selection, setSelection] = useState<DeckSelection | null>(null);
  const [library, setLibrary] = useState(loadDeckLibrary);
  const [editor, setEditor] = useState<SavedDeck | 'new' | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [username, setUsername] = useState('');

  const loadInfo = useCallback(async (serverInput: string) => {
    setLoadError(null);
    try {
      const response = await fetch(toInfoUrl(serverInput));
      const json = await response.json();
      if (json.dataError) throw new Error(json.dataError as string);
      const loaded = json as Info;
      setInfo(loaded);
      setTopicId((current) => current ?? loaded.topics[0]?.id ?? null);
      setChampionId((current) => current ?? loaded.champions[0]?.id ?? null);
    } catch (error) {
      setInfo(null);
      setLoadError(error instanceof Error ? error.message : `Server unter "${serverInput}" nicht erreichbar.`);
    }
  }, []);

  useEffect(() => { void loadInfo(server); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLibrary(account?.decks ?? loadDeckLibrary());
  }, [account]);

  const champion = info?.champions.find((entry) => entry.id === championId) ?? null;
  const activeIds = useMemo(() => new Set(info?.deckStatus?.active ?? Object.keys(info?.decks ?? {})), [info]);
  const presets = Object.entries(info?.decks ?? {}).filter(
    ([id, deck]) => activeIds.has(id) && deck.championId === championId
  );
  const customDecks = library.filter((deck) => deck.championId === championId);
  const chosenDeck = selection && info ? deckFor(info, selection) : null;
  const problems = info && champion && chosenDeck
    ? deckProblems(chosenDeck, champion, info.cards, info.factions, info.deckbuilding)
    : ['Bitte Champ und Deck wählen'];
  const ready = Boolean(info && champion && selection && chosenDeck && problems.length === 0 && topicId);
  const busy = status === 'connecting' || status === 'reconnecting';

  useEffect(() => {
    if (!info || !championId) return;
    const remembered = profile.lastLoadouts[championId]?.deckSelection;
    if (remembered && deckFor(info, remembered)) {
      setSelection(remembered);
      return;
    }
    const preset = Object.entries(info.decks).find(([id, deck]) => activeIds.has(id) && deck.championId === championId);
    setSelection(preset ? { kind: 'preset', id: preset[0] } : null);
  }, [championId, info]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveEditedDeck = async (deck: SavedDeck) => {
    if (account) {
      if (!(await onSaveAccountDeck(deck))) return;
    } else {
      const next = [...library.filter((entry) => entry.id !== deck.id), deck];
      saveDeckLibrary(next);
      setLibrary(next);
    }
    setSelection({ kind: 'custom', deck });
    setEditor(null);
  };

  if (editor && info && champion) {
    return (
      <main className="screen start-screen">
        <DeckEditor
          champion={champion}
          factions={info.factions}
          cards={info.cards}
          rules={info.deckbuilding}
          initial={editor === 'new' ? undefined : editor}
          onCancel={() => setEditor(null)}
          onSave={(deck) => void saveEditedDeck(deck)}
        />
      </main>
    );
  }

  const submit = () => {
    if (!ready || !selection || !championId || !topicId) return;
    onRememberLoadout(championId, { deckSelection: selection, championId, topicId });
    if (mode === 'create') onCreate(server, selection, championId, topicId, testMode);
    else onJoin(server, room, selection, championId);
  };

  return (
    <main className="screen start-screen">
      <header className="start-hero">
        <p className="eyebrow">HUMANS VS. ANIMALS</p>
        <h1>PC Fighters</h1>
        <p>Wähle einen Champ. Seine zwei Klassen bestimmen, welche 40 Karten dein Deck enthalten darf.</p>
      </header>

      {!isCloud && (
        <section className="panel connection-panel">
          <label>Spielserver<input value={server} onChange={(event) => setServer(event.target.value)} /></label>
          <button className="secondary" onClick={() => void loadInfo(server)}>Daten laden</button>
        </section>
      )}
      <section className="panel account-panel">
        {account ? (
          <>
            <div className="account-head">
              <div>
                <span className="eyebrow">Benutzerkonto</span>
                <h2>{account.username}</h2>
              </div>
              <button className="secondary" onClick={onLogout}>Abmelden</button>
            </div>
            <div className="profile-strip" aria-label="Gespeicherte Bilanz">
              <span><strong>{account.stats.wins}</strong> Siege</span>
              <span><strong>{account.stats.losses}</strong> Niederlagen</span>
              <span><strong>{account.stats.draws}</strong> Unentschieden</span>
              <span><strong>{account.stats.bestStreak}</strong> beste Serie</span>
            </div>
            <p className="hint">Eigene Decks und Ergebnisse werden auf diesem Spielserver gespeichert.</p>
          </>
        ) : (
          <>
            <h2>Optional anmelden</h2>
            <p>Mit Benutzername werden Bilanz und eigene Decks gespeichert. Als Gast kannst du genauso spielen.</p>
            <div className="account-login-row">
              <label>
                Benutzername
                <input
                  value={username}
                  maxLength={32}
                  autoComplete="username"
                  onChange={(event) => setUsername(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && username.trim() && !accountBusy) {
                      void onLogin(server, username);
                    }
                  }}
                />
              </label>
              <button
                className="secondary"
                disabled={!username.trim() || accountBusy}
                onClick={() => void onLogin(server, username)}
              >
                {accountBusy ? 'Anmelden …' : 'Anmelden'}
              </button>
            </div>
          </>
        )}
      </section>
      {loadError && <div className="error-box">{loadError}</div>}

      {info && (
        <>
          <section className="panel wizard-step">
            <h2>1. Champ wählen</h2>
            <div className="faction-grid top-faction-grid">
              {info.champions.map((entry) => {
                const side = info.factions.find((faction) => faction.id === entry.side);
                return (
                  <button
                    key={entry.id}
                    className={`faction-card ${championId === entry.id ? 'selected' : ''}`}
                    style={{ '--faction-color': side?.color } as CSSProperties}
                    onClick={() => setChampionId(entry.id)}
                  >
                    <span className="faction-emblem-fallback">{entry.name.charAt(0)}</span>
                    <strong className="faction-name">{entry.name}</strong>
                    <span className="faction-desc">{entry.side === 'animals' ? 'Animals' : 'Humans'} · {entry.classes.map((id) => info.factions.find((faction) => faction.id === id)?.name ?? id).join(' + ')}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {champion && (
            <section className="panel wizard-step">
              <h2>2. Deck wählen</h2>
              <p>Exakt 40 Karten, höchstens 4 Kopien und mindestens eine Karte aus jeder Champ-Klasse.</p>
              <div className="deck-choice-list">
                {presets.map(([id, deck]) => (
                  <button key={id} className={`secondary ${selection?.kind === 'preset' && selection.id === id ? 'selected' : ''}`} onClick={() => setSelection({ kind: 'preset', id })}>{deck.name ?? id}</button>
                ))}
                {customDecks.map((deck) => (
                  <div key={deck.id} className="deck-choice-row">
                    <button className={`secondary ${selection?.kind === 'custom' && (selection.deck as SavedDeck).id === deck.id ? 'selected' : ''}`} onClick={() => setSelection({ kind: 'custom', deck })}>{deck.name}</button>
                    <button className="secondary" onClick={() => setEditor(deck)}>Bearbeiten</button>
                  </div>
                ))}
                {info.deckStatus?.allowCustomDecks !== false && <button className="secondary" onClick={() => setEditor('new')}>+ Eigenes Deck</button>}
              </div>
              {selection && problems.length > 0 && <div className="deck-validation invalid">{problems.join(' · ')}</div>}
            </section>
          )}

          <section className="panel wizard-step">
            <h2>3. Partie starten</h2>
            {mode === 'create' ? (
              <label>Schauplatz<select value={topicId ?? ''} onChange={(event) => setTopicId(event.target.value)}>{info.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.emoji} {topic.name}</option>)}</select></label>
            ) : (
              <label>Raum-Code<input value={room} onChange={(event) => setRoom(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" /></label>
            )}
            <div className="mode-switch">
              <button className={mode === 'create' ? 'primary' : 'secondary'} onClick={() => setMode('create')}>Raum erstellen</button>
              <button className={mode === 'join' ? 'primary' : 'secondary'} onClick={() => setMode('join')}>Raum beitreten</button>
            </div>
            {mode === 'create' && <label className="check"><input type="checkbox" checked={testMode} onChange={(event) => setTestMode(event.target.checked)} /> Figuren-Testmodus</label>}
            <button className="primary big" disabled={!ready || busy || (mode === 'join' && room.length !== 4)} onClick={submit}>{busy ? 'Verbinde …' : mode === 'create' ? 'Partie erstellen' : 'Beitreten'}</button>
          </section>
        </>
      )}
    </main>
  );
}
