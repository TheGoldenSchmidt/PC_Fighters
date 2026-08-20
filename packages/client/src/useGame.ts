// Verbindungs-Logik des Clients: WebSocket zum Server, automatisches
// Wiederverbinden mit Raum-Code + Token, und der komplette UI-Zustand.

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientView,
  DeckSelection,
  PlayerAction,
  Topic,
  VisualCatalog
} from '@pcf/engine';
import { toAccountUrl, toInfoUrl, toWsUrl } from './config';
import type { SavedDeck } from './deckLibrary';
import type { LocalProfileV1 } from './profile';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';
export type Screen = 'start' | 'lobby' | 'game';

/** Keyword-Erklärungen (id → Label + Beschreibung), kommen vom Server. */
export type KeywordInfo = Record<string, { label: string; description: string }>;

export interface UserAccount {
  username: string;
  stats: LocalProfileV1['stats'];
  decks: SavedDeck[];
  /** Server, zu dem dieses Konto gehört (nur clientseitig ergänzt). */
  server: string;
}

export interface GameClientState {
  screen: Screen;
  status: ConnectionStatus;
  view: ClientView | null;
  roomCode: string | null;
  serverAddress: string | null;
  /** Vom Raum-Ersteller gewählter Schauplatz (kommt vom Server). */
  topic: Topic | null;
  keywordInfo: KeywordInfo | null;
  /** Aussehen/Animation aller Karten (vom /info-Endpunkt, opak durchgereicht). */
  catalog: VisualCatalog | null;
  /** Testmodus: beide Hände starten mit allen Figuren-Karten + viel Energie. */
  testMode: boolean;
  error: string | null;
  dataError: string | null;
  opponentConnected: boolean;
  rematchReady: [boolean, boolean];
  matchNumber: number;
  account: UserAccount | null;
  accountBusy: boolean;
}

const initial: GameClientState = {
  screen: 'start',
  status: 'idle',
  view: null,
  roomCode: null,
  serverAddress: null,
  topic: null,
  keywordInfo: null,
  catalog: null,
  testMode: false,
  error: null,
  dataError: null,
  opponentConnected: true,
  rematchReady: [false, false],
  matchNumber: 1,
  account: null,
  accountBusy: false
};

async function accountRequest(
  server: string,
  body: Record<string, unknown>
): Promise<Omit<UserAccount, 'server'>> {
  const response = await fetch(toAccountUrl(server), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await response.json() as {
    account?: Omit<UserAccount, 'server'>;
    error?: string;
  };
  if (!response.ok || !json.account) {
    throw new Error(json.error || 'Das Benutzerkonto konnte nicht geladen werden.');
  }
  return json.account;
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

  // Aussehen/Animation aller Karten einmalig über /info holen (fire-and-forget;
  // blockiert das Spiel nicht – fehlt der Katalog, greift der Golem-Fallback).
  const loadCatalog = useCallback((serverInput: string) => {
    fetch(toInfoUrl(serverInput))
      .then((r) => r.json())
      .then((j) => {
        if (j && j.visuals) patch({ catalog: j.visuals as VisualCatalog });
      })
      .catch(() => {
        /* ohne Katalog: Golem-Fallback im Client */
      });
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
          patch({
            screen: 'lobby',
            roomCode: msg.code as string,
            topic: msg.topic as Topic,
            keywordInfo: (msg.keywords as KeywordInfo) ?? null,
            testMode: Boolean(msg.testMode)
          });
          break;
        case 'joined':
        case 'rejoined':
          if (msg.token) session.current!.token = msg.token as string;
          session.current!.code = msg.code as string;
          saveSession();
          patch({
            roomCode: msg.code as string,
            topic: (msg.topic as Topic) ?? null,
            keywordInfo: (msg.keywords as KeywordInfo) ?? null,
            testMode: Boolean(msg.testMode)
          });
          break;
        case 'state':
          patch({
            screen: 'game',
            view: msg.view as ClientView,
            matchNumber: Number(msg.matchNumber) || 1,
            ...(msg.topic ? { topic: msg.topic as Topic } : {})
          });
          break;
        case 'opponent':
          patch({ opponentConnected: Boolean(msg.connected) });
          break;
        case 'rematchState':
          patch({ rematchReady: msg.ready as [boolean, boolean] });
          break;
        case 'account':
          setState((current) => current.account
            ? {
                ...current,
                account: {
                  ...(msg.account as Omit<UserAccount, 'server'>),
                  server: current.account.server
                }
              }
            : current);
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
    (
      serverInput: string,
      deckSelection: DeckSelection,
      championId: string,
      topicId: string,
      testMode = false
    ) => {
      const url = toWsUrl(serverInput);
      session.current = { url, code: '', token: '' };
      patch({ serverAddress: serverInput.trim() });
      loadCatalog(serverInput);
      open(url, (socket) =>
        socket.send(
          JSON.stringify({
            type: 'create',
            deckSelection,
            championId,
            topic: topicId,
            testMode,
            username: state.account?.server === serverInput.trim()
              ? state.account.username
              : null
          })
        )
      );
    },
    [open, loadCatalog, state.account?.username]
  );

  const joinGame = useCallback(
    (
      serverInput: string,
      code: string,
      deckSelection: DeckSelection,
      championId: string
    ) => {
      const url = toWsUrl(serverInput);
      session.current = { url, code: '', token: '' };
      patch({ serverAddress: serverInput.trim() });
      loadCatalog(serverInput);
      open(url, (socket) =>
        socket.send(
          JSON.stringify({
            type: 'join',
            code: code.trim(),
            deckSelection,
            championId,
            username: state.account?.server === serverInput.trim()
              ? state.account.username
              : null
          })
        )
      );
    },
    [open, loadCatalog, state.account?.username]
  );

  const loginAccount = useCallback(
    async (serverInput: string, username: string): Promise<boolean> => {
      patch({ accountBusy: true });
      try {
        const server = serverInput.trim();
        const account = { ...(await accountRequest(server, { action: 'login', username })), server };
        localStorage.setItem(
          'pcf.account.v1',
          JSON.stringify({ server, username: account.username })
        );
        patch({ account, accountBusy: false });
        return true;
      } catch (error) {
        patch({ accountBusy: false });
        showError(error instanceof Error ? error.message : 'Anmeldung fehlgeschlagen.');
        return false;
      }
    },
    [showError]
  );

  const logoutAccount = useCallback(() => {
    localStorage.removeItem('pcf.account.v1');
    patch({ account: null, accountBusy: false });
  }, []);

  const saveAccountDeck = useCallback(
    async (deck: SavedDeck): Promise<boolean> => {
      const current = state.account;
      if (!current) return false;
      patch({ accountBusy: true });
      try {
        const account = {
          ...(await accountRequest(current.server, {
            action: 'saveDeck',
            username: current.username,
            deck
          })),
          server: current.server
        };
        patch({ account, accountBusy: false });
        return true;
      } catch (error) {
        patch({ accountBusy: false });
        showError(error instanceof Error ? error.message : 'Deck konnte nicht gespeichert werden.');
        return false;
      }
    },
    [showError, state.account]
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

  const setRematchReady = useCallback(
    (ready: boolean) => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'rematchReady', ready }));
      } else {
        showError('Gerade keine Verbindung â€“ einen Moment â€¦');
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
    setState((current) => ({
      ...initial,
      account: current.account,
      accountBusy: false
    }));
  }, []);

  // Benutzerkonten bleiben nach einem Seiten-Reload auf diesem Gerät angemeldet.
  useEffect(() => {
    const stored = localStorage.getItem('pcf.account.v1');
    if (!stored) return;
    try {
      const value = JSON.parse(stored) as { server?: string; username?: string };
      if (value.server && value.username) void loginAccount(value.server, value.username);
    } catch {
      localStorage.removeItem('pcf.account.v1');
    }
  }, [loginAccount]);

  // Nach einem Seiten-Reload: laufende Partie automatisch wieder aufnehmen.
  useEffect(() => {
    const stored = sessionStorage.getItem('pcf.session');
    if (!stored) return;
    try {
      const s = JSON.parse(stored) as { url: string; code: string; token: string };
      if (s.url && s.code && s.token) {
        session.current = s;
        loadCatalog(s.url);
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

  return {
    state,
    createGame,
    joinGame,
    loginAccount,
    logoutAccount,
    saveAccountDeck,
    sendAction,
    setRematchReady,
    leaveGame
  };
}
