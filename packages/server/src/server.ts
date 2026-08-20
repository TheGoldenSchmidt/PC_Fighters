// Multiplayer-Server: verwaltet Räume, nimmt Aktionen entgegen, ruft die
// Engine auf und schickt jedem Client seine GEFILTERTE Sicht zurück.
// Der Server ist die einzige Quelle der Wahrheit über den Spielzustand.

import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
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
  ladeDecks,
  ladeDeckStatus,
  validateDeck,
  DeckError,
  type DeckList,
  type DeckSelection,
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
  championId: string;
  deck: DeckList | null;
  socket: WebSocket | null;
}

interface Room {
  code: string;
  players: RoomPlayer[];
  state: GameState | null;
  /** Vom Raum-Ersteller gewählter Schauplatz (rein optisch). */
  topic: Topic;
  /** Verbindliche Feldbreite. Sie ist nicht je Raum konfigurierbar. */
  lanes: 5;
  /** Testmodus: beide Hände starten mit allen Karten, die eine 3D-Figur
   * (visual) haben, plus viel Energie – zum schnellen Prüfen neuer Figuren,
   * ohne eine Runde durchzuspielen. Rein server-seitig, Engine bleibt unberührt. */
  testMode?: boolean;
  /** Zustimmung beider Spieler zu einem Rueckspiel im selben Raum. */
  rematchReady: [boolean, boolean];
  /** Laufende Matchnummer innerhalb des Raums, damit lokale Statistiken idempotent bleiben. */
  matchNumber: number;
}

/** Alle Kreaturen-Karten, die eine datengetriebene 3D-Figur mitbringen. */
function testCardIds(d: GameData): string[] {
  return d.cards.filter((c) => c.type === 'creature' && d.figures[c.id]?.visual).map((c) => c.id);
}

/** PC Fighters wird dauerhaft auf genau fünf Bahnen gespielt. */
const FESTE_BAHNEN = 5 as const;

/** Testmodus-Variante der Spieldaten: großzügige, ungedeckelte Energie. */
function testGameData(d: GameData): GameData {
  return {
    ...d,
    config: {
      ...d.config,
      energy: { start: 40, perRound: 40, cap: null },
      // Superblock nach EINEM Treffer voll: Im Testmodus lassen sich Block und
      // gewährte Champ-Superkraft sofort prüfen (regulär: 8 Abschnitte).
      ...(d.config.schild ? { schild: { ...d.config.schild, abschnitte: 1 } } : {})
    }
  };
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
/** Wird atomar über persistFilePath umbenannt – siehe saveRooms(). */
const persistTempPath = persistFilePath + '.tmp';

/**
 * Aktuelle Version des Dateiformats.
 *
 * 1 (implizit) – nacktes Array von Räumen, ohne Versionsfeld. Der Loader
 *   erkennt es daran, dass die geparste Wurzel ein Array ist.
 * 2 – { version, rooms }. Eingeführt mit den Cheerleader-Reaktionen: seitdem
 *   trägt GameState einen Auflösungszustand, der ein offenes Reaktionsfenster
 *   über einen Serverneustart hinweg erhalten muss.
 * 3 – Rückspiel-Bereitschaft und Matchnummer werden mit dem Raum gespeichert.
 * 4 – Champ, Zwei-Klassen-Deck und Superkräfte ersetzen das alte Loadout.
 */
const PERSIST_VERSION = 4;

interface PersistedRoom {
  code: string;
  topic: Topic;
  state: GameState | null;
  /** Historisches Feld; neue und geladene Räume verwenden immer fünf. */
  lanes?: number;
  testMode?: boolean;
  rematchReady?: [boolean, boolean];
  matchNumber?: number;
  players: Array<{
    token: string;
    championId?: string;
    deck?: DeckList | null;
  }>;
}

interface PersistedFile {
  version: number;
  rooms: PersistedRoom[];
}

function saveRooms(rooms: Map<string, Room>) {
  try {
    const dataToSave: PersistedFile = {
      version: PERSIST_VERSION,
      rooms: Array.from(rooms.values()).map((room) => ({
        code: room.code,
        topic: room.topic,
        state: room.state,
        lanes: room.lanes,
        testMode: room.testMode,
        rematchReady: room.rematchReady,
        matchNumber: room.matchNumber,
        players: room.players.map((p) => ({
          token: p.token,
          championId: p.championId,
          deck: p.deck
        }))
      }))
    };
    // Atomar schreiben: erst vollständig in eine temporäre Datei, dann
    // umbenennen. Ein Absturz mitten im Schreiben kann so nicht mehr eine halb
    // geschriebene und damit unlesbare Datei hinterlassen – bisher wäre in dem
    // Fall jeder laufende Raum verloren gewesen.
    writeFileSync(persistTempPath, JSON.stringify(dataToSave, null, 2), 'utf-8');
    renameSync(persistTempPath, persistFilePath);
  } catch (err) {
    console.error('Failed to persist rooms:', err);
  }
}

/** Vervollständigt optionale Auflösungsfelder eines Zustands derselben Version. */
function migriereZustand(state: GameState): GameState {
  state.aufloesung ??= [];
  state.reaktion ??= null;
  state.naechsteReaktionsId ??= 1;
  return state;
}

function loadRooms(data: GameData): Map<string, Room> {
  const map = new Map<string, Room>();
  try {
    if (existsSync(persistFilePath)) {
      const content = readFileSync(persistFilePath, 'utf-8');
      const wurzel = JSON.parse(content) as PersistedFile | PersistedRoom[];
      // Version 1 war ein nacktes Array ohne Versionsfeld – daran wird sie
      // erkannt. Neuere Versionen tragen { version, rooms }.
      const parsed: PersistedRoom[] = Array.isArray(wurzel) ? wurzel : (wurzel.rooms ?? []);
      const version = Array.isArray(wurzel) ? 1 : wurzel.version;
      if (version < PERSIST_VERSION) {
        console.warn(`Historische Räume (Version ${version}) werden wegen der Champion-Migration verworfen.`);
        return map;
      }
      if (!Array.isArray(wurzel) && version > PERSIST_VERSION) {
        // Neuere Datei als dieser Server sie versteht: lieber mit leerem
        // Raumverzeichnis starten, als Zustände halb interpretiert zu laden.
        console.warn(
          `rooms_persist.json hat Version ${version}, dieser Server kennt nur bis ${PERSIST_VERSION}. Räume werden ignoriert.`
        );
        return map;
      }
      for (const item of parsed) {
        try {
          if (item.state && item.state.config.lanes !== FESTE_BAHNEN) {
            throw new GameRuleError(
              `Der gespeicherte Raum verwendet ${item.state.config.lanes} statt ${FESTE_BAHNEN} Bahnen.`
            );
          }
          const players = item.players.map((p, idx) => {
            const deck = p.deck ?? null;
            const championId = p.championId ?? deck?.championId;
            if (!championId || !data.champions.some((champion) => champion.id === championId)) {
              throw new GameRuleError(`Der gespeicherte Champ von Spieler ${idx + 1} ist ungültig.`);
            }
            return { token: p.token, championId, deck, socket: null };
          });
          map.set(item.code, {
            code: item.code,
            topic: item.topic,
            state: item.state ? migriereZustand(item.state) : null,
            lanes: FESTE_BAHNEN,
            testMode: item.testMode,
            rematchReady: item.rematchReady ?? [false, false],
            matchNumber: Math.max(1, item.matchNumber ?? 1),
            players
          });
        } catch (error) {
          const grund = error instanceof Error ? error.message : String(error);
          console.warn(`Historischer Raum ${item.code} wurde übersprungen: ${grund}`);
        }
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
    if (data.config.lanes !== FESTE_BAHNEN) {
      throw new DataError('config.json', [
        `lanes: PC Fighters verwendet dauerhaft ${FESTE_BAHNEN} Bahnen.`
      ]);
    }
  } catch (e) {
    // Fehlerhafte Datendateien: Server läuft trotzdem und zeigt die Meldung
    // jedem Client an, statt einfach abzustürzen.
    dataError = e instanceof DataError ? e.message : String(e);
    console.error('\n⚠ Datendateien fehlerhaft:\n' + dataError + '\n');
  }

  const rooms = data ? loadRooms(data) : new Map<string, Room>();

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
          matchNumber: room.matchNumber,
          view: buildClientView(room.state!, idx as PlayerIndex, data!)
        });
      }
    });
  };

  const broadcastRematchState = (room: Room): void => {
    room.players.forEach((player) => {
      if (player.socket) send(player.socket, { type: 'rematchState', ready: room.rematchReady });
    });
  };

  const startRoomGame = (room: Room): void => {
    if (!data || room.players.length !== 2) {
      throw new GameRuleError('Die Partie kann noch nicht gestartet werden.');
    }
    room.state = createGame(
      room.testMode ? testGameData(data) : data,
      [room.players[0].championId, room.players[1].championId],
      Math.random,
      [room.players[0].deck, room.players[1].deck]
    );
    if (room.testMode) {
      const testCards = testCardIds(data);
      if (testCards.length > 0) {
        room.state.players[0].hand = [...testCards];
        room.state.players[1].hand = [...testCards];
      }
    }
    room.rematchReady = [false, false];
    room.matchNumber += 1;
    saveRooms(rooms);
    broadcastRematchState(room);
    broadcastState(room);
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

    // /snap: NUR-DEV-Werkzeug für die Figuren-Werkstatt. Der Client schickt ein
    // Canvas-Bild (data-URL/base64) per POST; der Server legt es als PNG ab.
    // Aktiv nur, wenn PCF_SNAP=<Zielordner> gesetzt ist – in Produktion inaktiv.
    if (req.method === 'POST' && req.url?.startsWith('/snap') && process.env.PCF_SNAP) {
      const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'snap').replace(
        /[^a-z0-9_-]/gi,
        '_'
      );
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const b64 = body.replace(/^data:image\/\w+;base64,/, '');
          writeFileSync(join(process.env.PCF_SNAP!, `${name}.png`), Buffer.from(b64, 'base64'));
          res.writeHead(200, cors);
          res.end('ok');
        } catch (e) {
          res.writeHead(500, cors);
          res.end(String(e));
        }
      });
      return;
    }
    if (req.url?.startsWith('/info')) {
      if (dataError) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', ...cors });
        res.end(JSON.stringify({ dataError }));
        return;
      }
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...cors
      });
      const deckStatus = ladeDeckStatus(data!);
      const alleDecks = ladeDecks(data!);
      const aktiveDecks = Object.fromEntries(
        deckStatus.active.flatMap((id) => (alleDecks[id] ? [[id, alleDecks[id]]] : []))
      );
      res.end(
        JSON.stringify({
          name: 'Political Correct Fighters',
          factions: data!.factions,
          champions: data!.champions,
          topics: data!.topics,
          // Aussehen/Animation als OPAKE Daten – der Server interpretiert sie nie,
          // er reicht sie nur weiter (wie factions/keywords). Der Client rendert.
          visuals: buildVisualCatalog(data!),
          cards: data!.cards,
          deckbuilding: data!.config.deckbuilding,
          // Aus Kompatibilitätsgründen bleibt die bisherige Form erhalten,
          // enthält aber nur noch die verbindliche Feldbreite.
          lanes: { optionen: [FESTE_BAHNEN], standard: FESTE_BAHNEN },
          // Nur freigegebene Decks verlassen den Server. Die übrigen Dateien
          // bleiben erhalten und können später über deck-status.json aktiviert werden.
          decks: aktiveDecks,
          deckStatus
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

    function validChampion(championId: unknown): string {
      const d = requireData();
      if (typeof championId !== 'string' || !d.champions.some((champion) => champion.id === championId)) {
        throw new GameRuleError(
          `Unbekannter Champ. Verfügbar: ${d.champions.map((champion) => champion.id).join(', ')}`
        );
      }
      return championId;
    }

    function resolveDeck(selection: unknown, requestedChampion: unknown): { championId: string; deck: DeckList | null } {
      const d = requireData();
      if (!selection || typeof selection !== 'object') {
        return { championId: validChampion(requestedChampion), deck: null };
      }
      const value = selection as DeckSelection;
      let deck: DeckList;
      if (value.kind === 'preset') {
        const preset = ladeDecks(d)[value.id];
        if (!preset) throw new GameRuleError(`Unbekanntes Prebuild-Deck "${value.id}".`);
        if (!ladeDeckStatus(d).active.includes(value.id)) {
          throw new GameRuleError(
            `Das Prebuild-Deck "${value.id}" ist während der Alpha-Balancingphase deaktiviert.`
          );
        }
        deck = preset;
      } else if (value.kind === 'custom') {
        if (!ladeDeckStatus(d).allowCustomDecks) {
          throw new GameRuleError('Eigene Decks sind während der Alpha-Balancingphase deaktiviert.');
        }
        try {
          deck = validateDeck(value.deck, d);
        } catch (e) {
          if (e instanceof DeckError) throw new GameRuleError(e.message);
          throw e;
        }
      } else {
        throw new GameRuleError('Ungültige Deckauswahl.');
      }
      const championId = validChampion(deck.championId ?? requestedChampion);
      if (deck.championId && deck.championId !== championId) {
        throw new GameRuleError('Deck und ausgewählter Champ passen nicht zusammen.');
      }
      return { championId, deck };
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

    /** Alte Clients dürfen noch `lanes: 5` senden; jede Abweichung ist ungültig. */
    function validLanes(roh: unknown): 5 {
      if (roh == null) return FESTE_BAHNEN;
      const n = Number(roh);
      if (n !== FESTE_BAHNEN) {
        throw new GameRuleError(
          `Ungültige Bahnenzahl. PC Fighters verwendet dauerhaft ${FESTE_BAHNEN} Bahnen.`
        );
      }
      return FESTE_BAHNEN;
    }

    function attach(room: Room, idx: PlayerIndex): void {
      ctx.room = room;
      ctx.playerIndex = idx;
      room.players[idx].socket = socket;
    }

    function handleMessage(msg: Record<string, unknown>): void {
      switch (msg.type) {
        case 'create': {
          const { championId, deck } = resolveDeck(msg.deckSelection, msg.championId ?? msg.faction);
          const topic = validTopic(msg.topic);
          const lanes = validLanes(msg.lanes);
          const room: Room = {
            code: newRoomCode(),
            players: [{
              token: randomBytes(12).toString('hex'),
              championId,
              deck,
              socket: null
            }],
            state: null,
            topic,
            lanes,
            testMode: Boolean(msg.testMode),
            rematchReady: [false, false],
            matchNumber: 1
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
            lanes: room.lanes,
            testMode: room.testMode,
            keywords: keywordInfo,
            abilities: abilityInfo,
            factions: requireData().factions,
            champions: requireData().champions
          });
          break;
        }

        case 'join': {
          const { championId, deck } = resolveDeck(msg.deckSelection, msg.championId ?? msg.faction);
          const room = rooms.get(String(msg.code));
          if (!room) {
            throw new GameRuleError('Diesen Raum-Code gibt es nicht. Tippfehler?');
          }
          if (room.players.length >= 2) {
            throw new GameRuleError('Dieser Raum ist schon voll (2 Spieler).');
          }
          room.players.push({
            token: randomBytes(12).toString('hex'),
            championId,
            deck,
            socket: null
          });
          attach(room, 1);
          send(socket, {
            type: 'joined',
            code: room.code,
            token: room.players[1].token,
            playerIndex: 1,
            topic: room.topic,
            lanes: room.lanes,
            testMode: room.testMode,
            keywords: keywordInfo,
            abilities: abilityInfo
          });
          // Beide Spieler da → Partie starten
          const d = requireData();
          room.state = createGame(
            room.testMode ? testGameData(d) : d,
            [room.players[0].championId, championId],
            Math.random,
            [room.players[0].deck, deck]
          );
          if (room.testMode) {
            // Beide Hände direkt mit allen Figuren-Karten füllen, damit sich
            // neue 3D-Figuren ohne Ziehen/Runden-Warten prüfen lassen.
            const testCards = testCardIds(d);
            if (testCards.length > 0) {
              room.state.players[0].hand = [...testCards];
              room.state.players[1].hand = [...testCards];
            }
          }
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
            lanes: room.lanes,
            testMode: room.testMode,
            keywords: keywordInfo,
            abilities: abilityInfo
          });
          notifyOpponentConnection(room, idx as PlayerIndex);
          if (room.state) {
            send(socket, {
              type: 'state',
              topic: room.topic,
              matchNumber: room.matchNumber,
              view: buildClientView(room.state, idx as PlayerIndex, requireData())
            });
            send(socket, {
              type: 'opponent',
              connected: room.players[idx === 0 ? 1 : 0]?.socket !== null
            });
            send(socket, { type: 'rematchState', ready: room.rematchReady });
          }
          break;
        }

        case 'rematchReady': {
          if (!ctx.room || ctx.playerIndex === null || !ctx.room.state) {
            throw new GameRuleError('Du bist noch in keiner laufenden Partie.');
          }
          if (ctx.room.state.phase !== 'ended') {
            throw new GameRuleError('Ein Rueckspiel ist erst nach Matchende moeglich.');
          }
          ctx.room.rematchReady[ctx.playerIndex] = Boolean(msg.ready);
          saveRooms(rooms);
          broadcastRematchState(ctx.room);
          if (ctx.room.rematchReady[0] && ctx.room.rematchReady[1]) {
            startRoomGame(ctx.room);
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
