// Verbindungs-Logik des Clients: WebSocket zum Server, automatisches
// Wiederverbinden mit Raum-Code + Token, und der komplette UI-Zustand.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientView, PlayerAction, Topic } from '@pcf/engine';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';
export type Screen = 'start' | 'lobby' | 'game';

export interface GameClientState {
  screen: Screen;
  status: ConnectionStatus;
  view: ClientView | null;
  roomCode: string | null;
  serverAddress: string | null;
  /** Vom Raum-Ersteller gewählter Schauplatz (kommt vom Server). */
  topic: Topic | null;
  error: string | null;
  dataError: string | null;
  opponentConnected: boolean;
}

const initial: GameClientState = {
  screen: 'start',
  status: 'idle',
  view: null,
  roomCode: null,
  serverAddress: null,
  topic: null,
  error: null,
  dataError: null,
  opponentConnected: true
};

/** "192.168.1.5", "192.168.1.5:3000" oder "http://..." → ws-URL. */
export function toWsUrl(input: string): string {
  let s = input.trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/+$/, '');
  if (!s.includes(':')) s += ':3000';
  return `ws://${s}`;
}

export function useGame() {
  const [state, setState] = useState<GameClientState>(initial);
  const ws = useRef<WebSocket | null>(null);
  const session = useRef<{ url: string; code: string; token: string } | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const errorTimer = useRef<number | null>(null);
  const intentionalClose = useRef(false);

  const patch = (p: Partial<GameClientState>) => setState((s) => ({ ...s, ...p }));

  const showError = useCallback((message: string) => {
    patch({ error: message });
    if (errorTimer.current) window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => patch({ error: null }), 4000);
  }, []);

  const handleMessage = useCallback(
    (msg: Record<string, unknown>) => {
      switch (msg.type) {
        case 'created':
          session.current = {
            url: session.current!.url,
            code: msg.code as string,
            token: msg.token as string
          };
          saveSession();
          patch({ screen: 'lobby', roomCode: msg.code as string, topic: msg.topic as Topic });
          break;
        case 'joined':
        case 'rejoined':
          if (msg.token) session.current!.token = msg.token as string;
          session.current!.code = msg.code as string;
          saveSession();
          patch({ roomCode: msg.code as string, topic: (msg.topic as Topic) ?? null });
          break;
        case 'state':
          patch({
            screen: 'game',
            view: msg.view as ClientView,
            ...(msg.topic ? { topic: msg.topic as Topic } : {})
          });
          break;
        case 'opponent':
          patch({ opponentConnected: Boolean(msg.connected) });
          break;
        case 'dataError':
          patch({ dataError: msg.message as string });
          break;
        case 'error':
          showError(msg.message as string);
          break;
      }
    },
    [showError]
  );

  function saveSession() {
    if (!session.current) return;
    sessionStorage.setItem('pcf.session', JSON.stringify(session.current));
  }

  const open = useCallback(
    (url: string, onOpen: (socket: WebSocket) => void, reconnect = false) => {
      intentionalClose.current = false;
      patch({ status: reconnect ? 'reconnecting' : 'connecting' });
      const socket = new WebSocket(url);
      ws.current = socket;

      socket.onopen = () => {
        patch({ status: 'connected' });
        onOpen(socket);
      };
      socket.onmessage = (ev) => {
        try {
          handleMessage(JSON.parse(ev.data as string));
        } catch {
          /* kaputte Nachricht ignorieren */
        }
      };
      socket.onclose = () => {
        if (intentionalClose.current || ws.current !== socket) return;
        // Verbindung verloren → automatisch neu verbinden, falls wir in
        // einer Partie sind (Raum-Code + Token vorhanden).
        const s = session.current;
        if (s && s.code && s.token) {
          patch({ status: 'reconnecting' });
          reconnectTimer.current = window.setTimeout(() => {
            open(s.url, (sock) => sock.send(JSON.stringify({ type: 'rejoin', code: s.code, token: s.token })), true);
          }, 1500);
        } else {
          patch({ status: 'idle' });
          showError('Verbindung zum Server fehlgeschlagen. Stimmt die Adresse?');
        }
      };
      socket.onerror = () => socket.close();
    },
    [handleMessage, showError]
  );

  const createGame = useCallback(
    (serverInput: string, faction: string, topicId: string) => {
      const url = toWsUrl(serverInput);
      session.current = { url, code: '', token: '' };
      patch({ serverAddress: serverInput.trim() });
      open(url, (socket) =>
        socket.send(JSON.stringify({ type: 'create', faction, topic: topicId }))
      );
    },
    [open]
  );

  const joinGame = useCallback(
    (serverInput: string, code: string, faction: string) => {
      const url = toWsUrl(serverInput);
      session.current = { url, code: '', token: '' };
      patch({ serverAddress: serverInput.trim() });
      open(url, (socket) =>
        socket.send(JSON.stringify({ type: 'join', code: code.trim(), faction }))
      );
    },
    [open]
  );

  const sendAction = useCallback(
    (action: PlayerAction) => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'action', action }));
      } else {
        showError('Gerade keine Verbindung – einen Moment …');
      }
    },
    [showError]
  );

  const leaveGame = useCallback(() => {
    intentionalClose.current = true;
    if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
    ws.current?.close();
    session.current = null;
    sessionStorage.removeItem('pcf.session');
    setState(initial);
  }, []);

  // Nach einem Seiten-Reload: laufende Partie automatisch wieder aufnehmen.
  useEffect(() => {
    const stored = sessionStorage.getItem('pcf.session');
    if (!stored) return;
    try {
      const s = JSON.parse(stored) as { url: string; code: string; token: string };
      if (s.url && s.code && s.token) {
        session.current = s;
        open(s.url, (socket) =>
          socket.send(JSON.stringify({ type: 'rejoin', code: s.code, token: s.token }))
        );
      }
    } catch {
      sessionStorage.removeItem('pcf.session');
    }
    return () => {
      intentionalClose.current = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, createGame, joinGame, sendAction, leaveGame };
}
