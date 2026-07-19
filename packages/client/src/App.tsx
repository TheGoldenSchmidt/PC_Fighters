import { useEffect } from 'react';
import { GameScreen } from './GameScreen';
import { LobbyScreen } from './LobbyScreen';
import { StartScreen } from './StartScreen';
import { useGame } from './useGame';

export function App() {
  const { state, createGame, joinGame, sendAction, leaveGame } = useGame();

  // Schauplatz-Hintergrund auf die ganze Seite anwenden (Lobby + Spiel).
  useEffect(() => {
    document.body.style.background = state.topic ? state.topic.colors.background : '';
    return () => {
      document.body.style.background = '';
    };
  }, [state.topic]);

  if (state.dataError) {
    return (
      <div className="fatal">
        <h1>⚠ Datendateien fehlerhaft</h1>
        <p>
          Der Server konnte die Spieldaten nicht laden. Bitte die letzte Änderung an den
          JSON-Dateien prüfen (oder rückgängig machen) und den Server neu starten.
        </p>
        <pre>{state.dataError}</pre>
      </div>
    );
  }

  return (
    <>
      {state.screen === 'start' && (
        <StartScreen onCreate={createGame} onJoin={joinGame} status={state.status} />
      )}
      {state.screen === 'lobby' && (
        <LobbyScreen
          roomCode={state.roomCode!}
          serverAddress={state.serverAddress ?? ''}
          topic={state.topic}
          onCancel={leaveGame}
        />
      )}
      {state.screen === 'game' && state.view && (
        <GameScreen
          view={state.view}
          topic={state.topic}
          keywordInfo={state.keywordInfo}
          status={state.status}
          opponentConnected={state.opponentConnected}
          onAction={sendAction}
          onLeave={leaveGame}
        />
      )}
      {state.error && <div className="toast">{state.error}</div>}
      {state.status === 'reconnecting' && (
        <div className="reconnect-banner">Verbindung verloren – versuche neu zu verbinden …</div>
      )}
    </>
  );
}
