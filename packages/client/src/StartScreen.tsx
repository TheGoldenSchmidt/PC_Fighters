// Startbildschirm: Fraktion wählen, dann Partie erstellen oder beitreten.
// Die Fraktionsliste kommt vom Server (/info) – neue Fraktionen in den
// Datendateien erscheinen hier automatisch.

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { Faction } from '@pcf/engine';
import type { ConnectionStatus } from './useGame';

const params = new URLSearchParams(window.location.search);
const defaultServer = params.get('server') ?? `${window.location.hostname}:3000`;
const defaultRoom = params.get('room') ?? '';

function infoUrl(serverInput: string): string {
  let s = serverInput.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!s.includes(':')) s += ':3000';
  return `http://${s}/info`;
}

interface Props {
  status: ConnectionStatus;
  onCreate: (server: string, faction: string) => void;
  onJoin: (server: string, code: string, faction: string) => void;
}

export function StartScreen({ status, onCreate, onJoin }: Props) {
  const [server, setServer] = useState(defaultServer);
  const [mode, setMode] = useState<'create' | 'join'>(defaultRoom ? 'join' : 'create');
  const [room, setRoom] = useState(defaultRoom);
  const [faction, setFaction] = useState<string | null>(null);
  const [factions, setFactions] = useState<Faction[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadFactions = useCallback(async (serverInput: string) => {
    setLoadError(null);
    try {
      const res = await fetch(infoUrl(serverInput));
      const json = await res.json();
      if (json.dataError) {
        setLoadError(json.dataError as string);
        setFactions(null);
      } else {
        setFactions(json.factions as Faction[]);
      }
    } catch {
      setFactions(null);
      setLoadError(
        `Server unter "${serverInput}" nicht erreichbar. Läuft er? Stimmt die Adresse?`
      );
    }
  }, []);

  useEffect(() => {
    loadFactions(server);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = status === 'connecting';
  const ready = faction !== null && factions !== null && !busy;

  return (
    <div className="screen start-screen">
      <header className="start-header">
        <h1>Political Correct Fighters</h1>
        <p className="subtitle">Humans vs. Animals – das Karten-Duell</p>
      </header>

      <section className="panel">
        <label htmlFor="server">Server-Adresse</label>
        <div className="row">
          <input
            id="server"
            type="text"
            value={server}
            onChange={(e) => setServer(e.target.value)}
            onBlur={() => loadFactions(server)}
            placeholder="z. B. 192.168.1.23:3000"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button className="secondary" onClick={() => loadFactions(server)}>
            Prüfen
          </button>
        </div>
        {loadError && <p className="hint error-hint">{loadError}</p>}
      </section>

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
              <strong>{f.name}</strong>
              <span>{f.description}</span>
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
          <button className="primary big" disabled={!ready} onClick={() => onCreate(server, faction!)}>
            {busy ? 'Verbinde …' : 'Partie erstellen'}
          </button>
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
          </>
        )}
        {faction === null && factions && <p className="hint">Bitte zuerst eine Fraktion wählen.</p>}
      </section>
    </div>
  );
}
