import { useEffect } from 'react';
import { FigurePreview } from './FigurePreview';
import { GameScreen } from './GameScreen';
import { LobbyScreen } from './LobbyScreen';
import { MulliganScreen } from './MulliganScreen';
import { StartScreen } from './StartScreen';
import { useGame } from './useGame';

// Figuren-Werkstatt: /?viewer=figures öffnet den Katalog auch im Production-Build,
// ?figure=<cardId> springt direkt zu einer Figur und bleibt mit snap.mjs
// rückwärtskompatibel.
// Stabil pro Seitenaufruf – daher vor allen Hooks; die Reihenfolge bleibt gleich.
const previewParams = new URLSearchParams(window.location.search);
const previewCardId = previewParams.get('figure');
const showFigureViewer = Boolean(
  previewCardId || previewParams.get('viewer') === 'figures'
);

export function App() {
  if (showFigureViewer) return <FigurePreview cardId={previewCardId} />;
  return <Game />;
}

function Game() {
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
      {state.screen === 'game' && state.view?.phase === 'mulligan' && (
        <MulliganScreen view={state.view} onAction={sendAction} onLeave={leaveGame} />
      )}
      {state.screen === 'game' && state.view && state.view.phase !== 'mulligan' && (
        <GameScreen
          view={state.view}
          topic={state.topic}
          keywordInfo={state.keywordInfo}
          catalog={state.catalog}
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
      {state.testMode && state.screen !== 'start' && <div className="test-badge">🧪 Testmodus</div>}
    </>
  );
}
