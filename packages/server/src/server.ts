// Multiplayer-Server: verwaltet Räume, nimmt Aktionen entgegen, ruft die
// Engine auf und schickt jedem Client seine GEFILTERTE Sicht zurück.
// Der Server ist die einzige Quelle der Wahrheit über den Spielzustand.

import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  applyAction,
  buildClientView,
  createGame,
  DataError,
  GameRuleError,
  loadGameData,
  type GameData,
  type GameState,
  type PlayerAction,
  type PlayerIndex,
  type Topic
} from '@pcf/engine';

interface RoomPlayer {
  token: string;
  faction: string;
  socket: WebSocket | null;
}

interface Room {
  code: string;
  players: RoomPlayer[];
  state: GameState | null;
  /** Vom Raum-Ersteller gewählter Schauplatz (rein optisch). */
  topic: Topic;
}

interface SocketContext {
  room: Room | null;
  playerIndex: PlayerIndex | null;
}

export interface RunningServer {
  port: number;
  close: () => Promise<void>;
}

function send(socket: WebSocket, message: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export function startServer(port: number): Promise<RunningServer> {
  let data: GameData | null = null;
  let dataError: string | null = null;
  try {
    data = loadGameData();
  } catch (e) {
    // Fehlerhafte Datendateien: Server läuft trotzdem und zeigt die Meldung
    // jedem Client an, statt einfach abzustürzen.
    dataError = e instanceof DataError ? e.message : String(e);
    console.error('\n⚠ Datendateien fehlerhaft:\n' + dataError + '\n');
  }

  const rooms = new Map<string, Room>();

  const newRoomCode = (): string => {
    for (let i = 0; i < 1000; i++) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      if (!rooms.has(code)) return code;
    }
    throw new Error('Keine freien Raum-Codes mehr.');
  };

  const broadcastState = (room: Room): void => {
    if (!room.state || !data) return;
    room.players.forEach((player, idx) => {
      if (player.socket) {
        send(player.socket, {
          type: 'state',
          topic: room.topic,
          view: buildClientView(room.state!, idx as PlayerIndex, data!)
        });
      }
    });
  };

  const notifyOpponentConnection = (room: Room, about: PlayerIndex): void => {
    const opponent = room.players[about === 0 ? 1 : 0];
    if (opponent?.socket) {
      send(opponent.socket, {
        type: 'opponent',
        connected: room.players[about].socket !== null
      });
    }
  };

  const httpServer: Server = createServer((req, res) => {
    // /info: Fraktionsliste für den Startbildschirm des Clients.
    // CORS offen, weil der Client vom Vite-Server (anderer Port) kommt.
    const cors = { 'access-control-allow-origin': '*' };
    if (req.url?.startsWith('/info')) {
      if (dataError) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', ...cors });
        res.end(JSON.stringify({ dataError }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', ...cors });
      res.end(
        JSON.stringify({
          name: 'Political Correct Fighters',
          factions: data!.factions,
          topics: data!.topics
        })
      );
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', ...cors });
    res.end('Political Correct Fighters – Spielserver läuft. Verbinde dich per WebSocket.');
  });
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (socket) => {
    const ctx: SocketContext = { room: null, playerIndex: null };

    if (dataError) {
      send(socket, { type: 'dataError', message: dataError });
    }

    socket.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        send(socket, { type: 'error', message: 'Ungültige Nachricht (kein JSON).' });
        return;
      }

      try {
        handleMessage(msg);
      } catch (e) {
        if (e instanceof GameRuleError) {
          send(socket, { type: 'error', message: e.message });
        } else {
          console.error(e);
          send(socket, { type: 'error', message: 'Interner Serverfehler.' });
        }
      }
    });

    socket.on('close', () => {
      if (ctx.room !== null && ctx.playerIndex !== null) {
        const player = ctx.room.players[ctx.playerIndex];
        if (player && player.socket === socket) {
          player.socket = null;
          notifyOpponentConnection(ctx.room, ctx.playerIndex);
        }
        // Raum aufräumen, wenn die Partie vorbei ist und niemand mehr da ist
        if (
          ctx.room.state?.phase === 'ended' &&
          ctx.room.players.every((p) => p.socket === null)
        ) {
          rooms.delete(ctx.room.code);
        }
      }
    });

    function requireData(): GameData {
      if (!data) {
        throw new GameRuleError(
          'Der Server kann wegen fehlerhafter Datendateien keine Partie starten.'
        );
      }
      return data;
    }

    function validFaction(faction: unknown): string {
      const d = requireData();
      if (typeof faction !== 'string' || !d.factions.some((f) => f.id === faction)) {
        throw new GameRuleError(
          `Unbekannte Fraktion. Verfügbar: ${d.factions.map((f) => f.id).join(', ')}`
        );
      }
      return faction;
    }

    /** Thema auflösen; ohne Angabe gilt das erste Thema aus topics.json. */
    function validTopic(topicId: unknown): Topic {
      const d = requireData();
      if (topicId === undefined || topicId === null || topicId === '') {
        return d.topics[0];
      }
      const topic = d.topics.find((t) => t.id === topicId);
      if (!topic) {
        throw new GameRuleError(
          `Unbekanntes Thema. Verfügbar: ${d.topics.map((t) => t.id).join(', ')}`
        );
      }
      return topic;
    }

    function attach(room: Room, idx: PlayerIndex): void {
      ctx.room = room;
      ctx.playerIndex = idx;
      room.players[idx].socket = socket;
    }

    function handleMessage(msg: Record<string, unknown>): void {
      switch (msg.type) {
        case 'create': {
          const faction = validFaction(msg.faction);
          const topic = validTopic(msg.topic);
          const room: Room = {
            code: newRoomCode(),
            players: [{ token: randomBytes(12).toString('hex'), faction, socket: null }],
            state: null,
            topic
          };
          rooms.set(room.code, room);
          attach(room, 0);
          send(socket, {
            type: 'created',
            code: room.code,
            token: room.players[0].token,
            playerIndex: 0,
            topic,
            factions: requireData().factions
          });
          break;
        }

        case 'join': {
          const faction = validFaction(msg.faction);
          const room = rooms.get(String(msg.code));
          if (!room) {
            throw new GameRuleError('Diesen Raum-Code gibt es nicht. Tippfehler?');
          }
          if (room.players.length >= 2) {
            throw new GameRuleError('Dieser Raum ist schon voll (2 Spieler).');
          }
          room.players.push({
            token: randomBytes(12).toString('hex'),
            faction,
            socket: null
          });
          attach(room, 1);
          send(socket, {
            type: 'joined',
            code: room.code,
            token: room.players[1].token,
            playerIndex: 1,
            topic: room.topic
          });
          // Beide Spieler da → Partie starten
          room.state = createGame(requireData(), [room.players[0].faction, faction]);
          broadcastState(room);
          break;
        }

        case 'rejoin': {
          const room = rooms.get(String(msg.code));
          const idx = room?.players.findIndex((p) => p.token === msg.token) ?? -1;
          if (!room || idx === -1) {
            throw new GameRuleError('Wiederverbinden fehlgeschlagen: Raum oder Spieler unbekannt.');
          }
          // Alte Verbindung (falls noch offen) ersetzen
          room.players[idx].socket?.close();
          attach(room, idx as PlayerIndex);
          send(socket, { type: 'rejoined', code: room.code, playerIndex: idx, topic: room.topic });
          notifyOpponentConnection(room, idx as PlayerIndex);
          if (room.state) {
            send(socket, {
              type: 'state',
              topic: room.topic,
              view: buildClientView(room.state, idx as PlayerIndex, requireData())
            });
            send(socket, {
              type: 'opponent',
              connected: room.players[idx === 0 ? 1 : 0]?.socket !== null
            });
          }
          break;
        }

        case 'action': {
          if (!ctx.room || ctx.playerIndex === null) {
            throw new GameRuleError('Du bist noch in keinem Raum.');
          }
          if (!ctx.room.state) {
            throw new GameRuleError('Die Partie hat noch nicht begonnen (Gegner fehlt).');
          }
          ctx.room.state = applyAction(
            ctx.room.state,
            ctx.playerIndex,
            msg.action as PlayerAction,
            requireData()
          );
          broadcastState(ctx.room);
          break;
        }

        default:
          send(socket, { type: 'error', message: `Unbekannter Nachrichtentyp "${msg.type}".` });
      }
    }
  });

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      const address = httpServer.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        port: actualPort,
        close: () =>
          new Promise<void>((done) => {
            for (const client of wss.clients) client.terminate();
            wss.close(() => httpServer.close(() => done()));
          })
      });
    });
  });
}
