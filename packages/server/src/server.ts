// Multiplayer-Server: verwaltet Räume, nimmt Aktionen entgegen, ruft die
// Engine auf und schickt jedem Client seine GEFILTERTE Sicht zurück.
// Der Server ist die einzige Quelle der Wahrheit über den Spielzustand.

import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';
import {
  applyAction,
  buildClientView,
  buildVisualCatalog,
  createGame,
  DataError,
  GameRuleError,
  loadGameData,
  type GameData,
  type GameState,
  type PlayerAction,
  ABILITIES,
  KEYWORDS,
  type PlayerIndex,
  type Topic
} from '@pcf/engine';

/** Keyword-Erklärungen für die Karten-Detailansicht des Clients (einmal berechnet). */
const keywordInfo = Object.fromEntries(
  Object.entries(KEYWORDS).map(([id, k]) => [id, { label: k.label, description: k.description }])
);

/** Fähigkeiten-Erklärungen (parametrisierte Primitive) für die Karten-Detailansicht. */
const abilityInfo = Object.fromEntries(
  Object.entries(ABILITIES).map(([id, a]) => [id, { label: a.label, description: a.description }])
);

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

const persistFilePath = join(process.cwd(), 'rooms_persist.json');

function saveRooms(rooms: Map<string, Room>) {
  try {
    const dataToSave = Array.from(rooms.entries()).map(([code, room]) => {
      return {
        code: room.code,
        topic: room.topic,
        state: room.state,
        players: room.players.map(p => ({
          token: p.token,
          faction: p.faction
        }))
      };
    });
    writeFileSync(persistFilePath, JSON.stringify(dataToSave, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist rooms:', err);
  }
}

function loadRooms(): Map<string, Room> {
  const map = new Map<string, Room>();
  try {
    if (existsSync(persistFilePath)) {
      const content = readFileSync(persistFilePath, 'utf-8');
      const parsed = JSON.parse(content) as Array<{
        code: string;
        topic: Topic;
        state: GameState | null;
        players: Array<{ token: string; faction: string }>;
      }>;
      for (const item of parsed) {
        map.set(item.code, {
          code: item.code,
          topic: item.topic,
          state: item.state,
          players: item.players.map(p => ({
            token: p.token,
            faction: p.faction,
            socket: null
          }))
        });
      }
    }
  } catch (err) {
    console.error('Failed to load persisted rooms:', err);
  }
  return map;
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

  const rooms = loadRooms();

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

  // Im Cloud-Betrieb liefert dieser Server auch die gebaute Client-Seite aus
  // (packages/client/dist). Existiert der Ordner nicht (lokale Entwicklung mit
  // separatem Vite-Server), bleibt der statische Teil einfach inaktiv.
  const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
  const serveClient = existsSync(clientDist)
    ? sirv(clientDist, { single: true, gzip: true })
    : null;

  const httpServer: Server = createServer((req, res) => {
    // /info: Fraktions- und Themenliste für den Startbildschirm des Clients.
    // CORS offen, weil der Client lokal von einem anderen Port (Vite) kommt.
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
          topics: data!.topics,
          // Aussehen/Animation als OPAKE Daten – der Server interpretiert sie nie,
          // er reicht sie nur weiter (wie factions/keywords). Der Client rendert.
          visuals: buildVisualCatalog(data!)
        })
      );
      return;
    }
    if (serveClient) {
      serveClient(req, res, () => {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Nicht gefunden.');
      });
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
          saveRooms(rooms);
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
          saveRooms(rooms);
          attach(room, 0);
          send(socket, {
            type: 'created',
            code: room.code,
            token: room.players[0].token,
            playerIndex: 0,
            topic,
            keywords: keywordInfo,
            abilities: abilityInfo,
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
            topic: room.topic,
            keywords: keywordInfo,
            abilities: abilityInfo
          });
          // Beide Spieler da → Partie starten
          room.state = createGame(requireData(), [room.players[0].faction, faction]);
          saveRooms(rooms);
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
          send(socket, {
            type: 'rejoined',
            code: room.code,
            playerIndex: idx,
            topic: room.topic,
            keywords: keywordInfo,
            abilities: abilityInfo
          });
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
          saveRooms(rooms);
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
