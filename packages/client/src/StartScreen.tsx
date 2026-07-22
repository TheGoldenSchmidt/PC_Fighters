// Startbildschirm: Fraktion wählen, dann Partie erstellen oder beitreten.
// Fraktions- und Themenliste kommen vom Server (/info) – neue Einträge in
// den Datendateien erscheinen hier automatisch.

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { Faction, Topic } from '@pcf/engine';
import type { ConnectionStatus } from './useGame';
import { defaultServerHost, isCloud, toInfoUrl } from './config';

const params = new URLSearchParams(window.location.search);
const defaultServer = params.get('server') ?? defaultServerHost();
const defaultRoom = params.get('room') ?? '';

interface Props {
  status: ConnectionStatus;
  onCreate: (server: string, faction: string, topicId: string, testMode?: boolean) => void;
  onJoin: (server: string, code: string, faction: string) => void;
}

export function StartScreen({ status, onCreate, onJoin }: Props) {
  const [server, setServer] = useState(defaultServer);
  const [mode, setMode] = useState<'create' | 'join'>(defaultRoom ? 'join' : 'create');
  const [room, setRoom] = useState(defaultRoom);
  const [faction, setFaction] = useState<string | null>(null);
  const [factions, setFactions] = useState<Faction[] | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Testmodus: beide Hände starten mit allen Figuren-Karten + viel Energie –
  // zum schnellen Prüfen neuer 3D-Figuren ohne Runden abzuwarten.
  const [testMode, setTestMode] = useState(false);

  const loadInfo = useCallback(async (serverInput: string) => {
    setLoadError(null);
    try {
      const res = await fetch(toInfoUrl(serverInput));
      const json = await res.json();
      if (json.dataError) {
        setLoadError(json.dataError as string);
        setFactions(null);
      } else {
        setFactions(json.factions as Faction[]);
        const loadedTopics = (json.topics as Topic[]) ?? [];
        setTopics(loadedTopics);
        setTopicId((current) => current ?? loadedTopics[0]?.id ?? null);
      }
    } catch {
      setFactions(null);
      setLoadError(
        `Server unter "${serverInput}" nicht erreichbar. Läuft er? Stimmt die Adresse?`
      );
    }
  }, []);

  useEffect(() => {
    loadInfo(server);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = status === 'connecting';
  const ready = faction !== null && factions !== null && !busy;

  return (
    <div className="screen start-screen">
      <header className="start-header">
        <div className="logo-container">
          <img src="/assets/logo.png" className="main-logo" alt="Political Correct Fighters Logo" />
        </div>
        <p className="subtitle">Das ultimative Duell: Humans vs. Animals</p>
      </header>

      {/* Server-Adresse nur im lokalen Betrieb. Im Cloud-Build liefert der
          Server die Seite selbst aus – es gibt nichts einzutippen. */}
      {!isCloud && (
        <section className="panel">
          <label htmlFor="server">Server-Adresse</label>
          <div className="row">
            <input
              id="server"
              type="text"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              onBlur={() => loadInfo(server)}
              placeholder="z. B. 192.168.1.23:3000"
              autoCapitalize="off"
              autoCorrect="off"
            />
            <button className="secondary" onClick={() => loadInfo(server)}>
              Prüfen
            </button>
          </div>
        </section>
      )}
      {loadError && (
        <section className="panel">
          <p className="hint error-hint">{loadError}</p>
        </section>
      )}

      <section className="panel">
        <h2>Fraktion wählen</h2>
        {!factions && !loadError && <p className="hint">Lade Fraktionen …</p>}
        <div className="faction-grid">
          {factions?.map((f) => (
            <button
              key={f.id}
              className={`faction-card ${faction === f.id ? 'selected' : ''}`}
              style={{ '--faction-color': f.color } as CSSProperties}
              onClick={() => setFaction(f.id)}
            >
              <div className="faction-emblem-wrapper">
                <img src={`/assets/emblems/${f.id}.png`} className="faction-emblem" alt={`${f.name} Emblem`} />
              </div>
              <strong className="faction-name">{f.name}</strong>
              <span className="faction-desc">{f.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="tabs">
          <button
            className={mode === 'create' ? 'tab active' : 'tab'}
            onClick={() => setMode('create')}
          >
            Partie erstellen
          </button>
          <button
            className={mode === 'join' ? 'tab active' : 'tab'}
            onClick={() => setMode('join')}
          >
            Partie beitreten
          </button>
        </div>

        {mode === 'create' ? (
          <>
            {topics.length > 0 && (
              <>
                <h2>Schauplatz wählen</h2>
                <div className="topic-grid">
                  {topics.map((t) => (
                    <button
                      key={t.id}
                      className={`topic-card ${topicId === t.id ? 'selected' : ''}`}
                      style={{ '--topic-accent': t.colors.accent } as CSSProperties}
                      onClick={() => setTopicId(t.id)}
                    >
                      <span className="topic-emoji">{t.emoji}</span>
                      <span className="topic-name">{t.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={testMode}
                onChange={(e) => setTestMode(e.target.checked)}
              />
              🧪 Testmodus (alle Figuren-Karten sofort auf der Hand, viel Energie)
            </label>
            <button
              className="primary big"
              disabled={!ready || topicId === null}
              onClick={() => onCreate(server, faction!, topicId!, testMode)}
            >
              {busy ? 'Verbinde …' : 'Partie erstellen'}
            </button>
          </>
        ) : (
          <>
            <label htmlFor="room">Raum-Code</label>
            <input
              id="room"
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={room}
              onChange={(e) => setRoom(e.target.value.replace(/\D/g, ''))}
              placeholder="z. B. 4217"
            />
            <button
              className="primary big"
              disabled={!ready || room.length !== 4}
              onClick={() => onJoin(server, room, faction!)}
            >
              {busy ? 'Verbinde …' : 'Beitreten'}
            </button>
            <p className="hint">Den Schauplatz wählt der Spieler, der die Partie erstellt.</p>
          </>
        )}
        {faction === null && factions && <p className="hint">Bitte zuerst eine Fraktion wählen.</p>}
      </section>
    </div>
  );
}
