import { Suspense, lazy, useEffect } from 'react';
import { GameScreen } from './GameScreen';
import { LobbyScreen } from './LobbyScreen';
import { MulliganScreen } from './MulliganScreen';
import { StartScreen } from './StartScreen';
import { useGame } from './useGame';
import { useLocalProfile } from './profile';

// Die Figuren-Werkstatt zieht three.js und den kompletten Figurenkatalog nach.
// Sie ist ein Sonderweg (?viewer=figures) – normale Spieler sollen den Code
// nicht mitladen muessen.
const FigurePreview = lazy(() =>
  import('./FigurePreview').then((m) => ({ default: m.FigurePreview }))
);

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
  if (showFigureViewer) {
    return (
      <Suspense fallback={<div className="screen">Figuren werden geladen …</div>}>
        <FigurePreview cardId={previewCardId} />
      </Suspense>
    );
  }
  return <Game />;
}

function Game() {
  const { state, createGame, joinGame, sendAction, setRematchReady, leaveGame } = useGame();
  const { profile, updateProfile, rememberLoadout, recordMatch } = useLocalProfile();

  // Schauplatz-Hintergrund auf die ganze Seite anwenden (Lobby + Spiel).
  useEffect(() => {
    document.body.style.background = state.topic ? state.topic.colors.background : '';
    return () => {
      document.body.style.background = '';
    };
  }, [state.topic]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [state.screen, state.view?.phase]);

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
        <StartScreen
          onCreate={createGame}
          onJoin={joinGame}
          status={state.status}
          profile={profile}
          onRememberLoadout={rememberLoadout}
        />
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
        <MulliganScreen
          view={state.view}
          profile={profile}
          onUpdateProfile={updateProfile}
          onAction={sendAction}
          onLeave={leaveGame}
        />
      )}
      {state.screen === 'game' && state.view && state.view.phase !== 'mulligan' && (
        <GameScreen
          view={state.view}
          topic={state.topic}
          keywordInfo={state.keywordInfo}
          catalog={state.catalog}
          status={state.status}
          opponentConnected={state.opponentConnected}
          profile={profile}
          roomCode={state.roomCode ?? ''}
          matchNumber={state.matchNumber}
          rematchReady={state.rematchReady}
          onUpdateProfile={updateProfile}
          onRecordMatch={recordMatch}
          onRematchReady={setRematchReady}
          onAction={sendAction}
          onLeave={leaveGame}
        />
      )}
      {state.error && <div className="toast" role="alert">{state.error}</div>}
      {state.status === 'reconnecting' && (
        <div className="reconnect-banner" role="status">Verbindung verloren – versuche neu zu verbinden …</div>
      )}
      {state.testMode && state.screen !== 'start' && <div className="test-badge">🧪 Testmodus</div>}
    </>
  );
}
