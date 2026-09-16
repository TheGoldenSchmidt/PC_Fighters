// Multiplayer-Server: verwaltet Räume, nimmt Aktionen entgegen, ruft die
// Engine auf und schickt jedem Client seine GEFILTERTE Sicht zurück.
// Der Server ist die einzige Quelle der Wahrheit über den Spielzustand.

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';
import { messageSchema } from './protocol.js';
import {
  createUserStore,
  UserAccountError,
  type SavedUserDeck,
  type UserStore
} from './users.js';
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
  /** null = Gast. Benutzerkonten werden ausschließlich über users.json freigeschaltet. */
  username: string | null;
  championId: string;
  deck: DeckList | null;
  socket: WebSocket | null;
}

interface Room {
  revision: number;
  updatedAt: number;
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

export interface StartServerOptions {
  /** null deaktiviert Persistenz für isolierte Tests. */
  persistPath?: string | null;
  /** Austauschbarer Speicher für Integrationstests. */
  userStore?: UserStore;
  /** Optionaler gemeinsamer Zugangsschutz. undefined liest die Render-Umgebung,
   * null deaktiviert ihn ausdrücklich (praktisch für gezielte Tests). */
  accessCredentials?: AccessCredentials | null;
}

export interface AccessCredentials {
  username: string;
  password: string;
}

interface AccessGuard {
  expectedAuthorization: Buffer;
}

/** Liest den optionalen gemeinsamen Zugang aus der Server-Umgebung.
 * Sobald eine der beiden Variablen gesetzt ist, müssen beide vollständig sein:
 * Eine halbe Konfiguration darf den Dienst nie versehentlich offen lassen. */
function createAccessGuard(override: AccessCredentials | null | undefined): AccessGuard | null {
  if (override === null) return null;

  const usernameValue = override?.username ?? process.env.PCF_ACCESS_USER;
  const passwordValue = override?.password ?? process.env.PCF_ACCESS_PASSWORD;
  const configured = usernameValue !== undefined || passwordValue !== undefined;
  if (!configured) return null;

  const username = usernameValue?.trim();
  const password = passwordValue;
  if (!username || !password) {
    throw new Error(
      'Passwortschutz unvollständig: PCF_ACCESS_USER und PCF_ACCESS_PASSWORD müssen beide gesetzt sein.'
    );
  }
  if (username.includes(':')) {
    throw new Error('PCF_ACCESS_USER darf keinen Doppelpunkt enthalten.');
  }

  const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
  return { expectedAuthorization: Buffer.from(`Basic ${encoded}`, 'utf8') };
}

function isAccessAllowed(request: IncomingMessage, guard: AccessGuard | null): boolean {
  if (!guard) return true;
  const header = request.headers.authorization;
  if (typeof header !== 'string') return false;

  const actual = Buffer.from(header, 'utf8');
  const expected = guard.expectedAuthorization;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function rejectUnauthorized(response: ServerResponse): void {
  response.writeHead(401, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'www-authenticate': 'Basic realm="PC Fighters", charset="UTF-8"'
  });
  response.end('Zugangsdaten erforderlich.');
}

function send(socket: WebSocket, message: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendHttpJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string>
): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  response.end(JSON.stringify(body));
}

function readJsonRequest(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    let tooLarge = false;
    request.setEncoding('utf-8');
    request.on('data', (chunk: string) => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > 1_000_000) tooLarge = true;
    });
    request.on('end', () => {
      if (tooLarge) {
        reject(new UserAccountError('Die Anfrage ist zu groß.'));
        return;
      }
      try {
        const parsed = JSON.parse(body) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('kein Objekt');
        }
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(new UserAccountError('Ungültige Konto-Anfrage.'));
      }
    });
    request.on('error', reject);
  });
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
 *     Der optionale Benutzername ist innerhalb dieses Formats abwärtskompatibel.
 * 5 – Vier Teams, Handinstanzen, Auswahlen, temporäre Zustände und Revisionen.
 */
const PERSIST_VERSION = 5;
const ABANDONED_ROOM_MS = 7 * 24 * 60 * 60 * 1000;
const LOBBY_ROOM_MS = 24 * 60 * 60 * 1000;

interface PersistedRoom {
  revision?: number;
  updatedAt?: number;
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
    username?: string | null;
    championId?: string;
    deck?: DeckList | null;
  }>;
}

interface PersistedFile {
  version: number;
  rooms: PersistedRoom[];
}

function saveRoomsFile(rooms: Map<string, Room>, file: string | null = persistFilePath) {
  if (file === null) return;
  try {
    const dataToSave: PersistedFile = {
      version: PERSIST_VERSION,
      rooms: Array.from(rooms.values()).map((room) => ({
        code: room.code,
        revision: room.revision,
        updatedAt: room.updatedAt,
        topic: room.topic,
        state: room.state,
        lanes: room.lanes,
        testMode: room.testMode,
        rematchReady: room.rematchReady,
        matchNumber: room.matchNumber,
        players: room.players.map((p) => ({
          token: p.token,
          username: p.username,
          championId: p.championId,
          deck: p.deck
        }))
      }))
    };
    // Atomar schreiben: erst vollständig in eine temporäre Datei, dann
    // umbenennen. Ein Absturz mitten im Schreiben kann so nicht mehr eine halb
    // geschriebene und damit unlesbare Datei hinterlassen – bisher wäre in dem
    // Fall jeder laufende Raum verloren gewesen.
    writeFileSync(file + '.tmp', JSON.stringify(dataToSave, null, 2), 'utf-8');
    renameSync(file + '.tmp', file);
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

function loadRooms(data: GameData, file: string | null = persistFilePath, incompatible = new Set<string>()): Map<string, Room> {
  const map = new Map<string, Room>();
  if (file === null) return map;
  try {
    if (existsSync(file)) {
      const content = readFileSync(file, 'utf-8');
      const wurzel = JSON.parse(content) as PersistedFile | PersistedRoom[];
      // Version 1 war ein nacktes Array ohne Versionsfeld – daran wird sie
      // erkannt. Neuere Versionen tragen { version, rooms }.
      const parsed: PersistedRoom[] = Array.isArray(wurzel) ? wurzel : (wurzel.rooms ?? []);
      const version = Array.isArray(wurzel) ? 1 : wurzel.version;
      if (version !== PERSIST_VERSION) {
        for (const item of parsed) if (typeof item.code === 'string') incompatible.add(item.code);
        console.warn(`Gespeicherte Räume mit Version ${version} sind mit Version ${PERSIST_VERSION} nicht kompatibel.`);
        return map;
      }
      for (const item of parsed) {
        try {
          if (!Number.isSafeInteger(item.revision) || !Number.isFinite(item.updatedAt)) throw new GameRuleError('Unvollständiger Alpha-Spielstand.');
          if (Date.now() - item.updatedAt! > (item.state?.phase !== 'ended' && item.state ? ABANDONED_ROOM_MS : LOBBY_ROOM_MS)) continue;
          if (item.state && item.state.config.lanes !== FESTE_BAHNEN) {
            throw new GameRuleError(
              `Der gespeicherte Raum verwendet ${item.state.config.lanes} statt ${FESTE_BAHNEN} Bahnen.`
            );
          }
          if (item.state) {
            const ids = new Set<number>();
            if (item.state.players.length !== 2 || !Number.isSafeInteger(item.state.nextHandId)) throw new GameRuleError('Unvollständige Handkarteninstanzen.');
            for (const p of item.state.players) {
              if (p.handInstances?.length !== p.hand.length || !Array.isArray(p.graveyard)) throw new GameRuleError('Unvollständige Handkarten oder Friedhof.');
              p.handInstances.forEach((card, i) => {
                if (!Number.isSafeInteger(card.id) || ids.has(card.id) || card.id >= item.state!.nextHandId! || card.cardId !== p.hand[i] || !data.cardsById[card.cardId] || !Number.isFinite(card.discount) || card.discount < 0) throw new GameRuleError('Ungültige Handkarteninstanz.');
                ids.add(card.id);
              });
            }
          }
          const players = item.players.map((p, idx) => {
            const deck = p.deck ?? null;
            const championId = p.championId ?? deck?.championId;
            if (!championId || !data.champions.some((champion) => champion.id === championId)) {
              throw new GameRuleError(`Der gespeicherte Champ von Spieler ${idx + 1} ist ungültig.`);
            }
            return { token: p.token, username: p.username ?? null, championId, deck, socket: null };
          });
          map.set(item.code, {
            revision: item.revision!,
            updatedAt: item.updatedAt!,
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
          incompatible.add(item.code);
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

export function startServer(port: number, options: StartServerOptions = {}): Promise<RunningServer> {
  const accessGuard = createAccessGuard(options.accessCredentials);
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

  const incompatibleRooms = new Set<string>();
  const rooms = data ? loadRooms(data, options.persistPath, incompatibleRooms) : new Map<string, Room>();
  const saveRooms = (value: Map<string, Room>) => saveRoomsFile(value, options.persistPath);
  const cleanupTimer = setInterval(() => {
    let changed = false;
    for (const [code, room] of rooms) {
      const ttl = room.state && room.state.phase !== 'ended' ? ABANDONED_ROOM_MS : LOBBY_ROOM_MS;
      if (room.players.every(p => p.socket === null) && Date.now() - room.updatedAt > ttl) { rooms.delete(code); changed = true; }
    }
    if (changed) saveRooms(rooms);
  }, 60_000);
  cleanupTimer.unref();
  const users = options.userStore ?? createUserStore();

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
          revision: room.revision,
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

  const sendAccount = (player: RoomPlayer): void => {
    if (!player.socket || !player.username) return;
    try {
      send(player.socket, { type: 'account', account: users.login(player.username) });
    } catch (error) {
      if (error instanceof UserAccountError) {
        // Aus users.json entfernte Konten werden in alten Räumen zu Gästen.
        player.username = null;
        return;
      }
      throw error;
    }
  };

  /** Eine beendete Partie wird je Raum/Match genau einmal im Benutzerkonto verbucht. */
  const recordRoomResult = (room: Room): void => {
    if (room.testMode || !room.state || room.state.winner === null) return;
    const matchId = `${room.code}:${room.matchNumber}`;
    room.players.forEach((player, index) => {
      if (!player.username) return;
      const result = room.state!.winner === 'draw'
        ? 'draw'
        : room.state!.winner === index
          ? 'win'
          : 'loss';
      try {
        users.recordMatch(player.username, matchId, result);
        sendAccount(player);
      } catch (error) {
        if (error instanceof UserAccountError) player.username = null;
        else throw error;
      }
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
    room.revision += 1;
    room.updatedAt = Date.now();
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
    if (!isAccessAllowed(req, accessGuard)) {
      rejectUnauthorized(res);
      return;
    }

    // /info: Fraktions- und Themenliste für den Startbildschirm des Clients.
    // CORS offen, weil der Client lokal von einem anderen Port (Vite) kommt.
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type'
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    if (req.url?.startsWith('/account')) {
      if (req.method !== 'POST') {
        sendHttpJson(res, 405, { error: 'Nur POST ist erlaubt.' }, cors);
        return;
      }
      readJsonRequest(req)
        .then((body) => {
          if (body.action === 'login') {
            sendHttpJson(res, 200, { account: users.login(body.username) }, cors);
            return;
          }
          if (body.action === 'saveDeck') {
            if (!data) throw new UserAccountError('Decks sind wegen fehlerhafter Spieldaten nicht verfügbar.');
            const account = users.login(body.username);
            const raw = body.deck && typeof body.deck === 'object'
              ? body.deck as Record<string, unknown>
              : {};
            const checked = validateDeck(raw, data);
            const id = typeof raw.id === 'string' && /^[a-zA-Z0-9._:-]{1,100}$/.test(raw.id)
              ? raw.id
              : randomBytes(12).toString('hex');
            const name = checked.name?.trim();
            const championId = checked.championId;
            if (!name || name.length > 60 || !championId) {
              throw new UserAccountError('Deckname oder Champ fehlt beziehungsweise ist zu lang.');
            }
            const champion = data.champions.find((entry) => entry.id === championId);
            if (!champion) throw new UserAccountError('Der Champ des Decks ist unbekannt.');
            const deck: SavedUserDeck = {
              ...checked,
              id,
              name,
              championId,
              faction: champion.side,
              updatedAt: new Date().toISOString()
            };
            sendHttpJson(res, 200, { account: users.saveDeck(account.username, deck) }, cors);
            return;
          }
          throw new UserAccountError('Unbekannte Konto-Aktion.');
        })
        .catch((error) => {
          const expected = error instanceof UserAccountError || error instanceof DeckError;
          if (!expected) console.error(error);
          sendHttpJson(
            res,
            expected ? 400 : 500,
            { error: expected ? error.message : 'Interner Serverfehler.' },
            cors
          );
        });
      return;
    }

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
    if (req.url === '/health') {
      sendHttpJson(res, dataError ? 503 : 200, { ok: !dataError, version: PERSIST_VERSION, activeRooms: rooms.size }, cors);
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
          champions: data!.champions.filter(c => ladeDeckStatus(data!).active.includes(c.id)),
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
  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: 64 * 1024,
    // Der Browser übernimmt nach dem HTTP-Passwortdialog die Basic-Auth-Daten
    // auch für den WebSocket-Handshake derselben Origin. Direkte Verbindungen
    // ohne Zugangsdaten werden damit ebenfalls abgewiesen.
    verifyClient: ({ req }: { req: IncomingMessage }) => isAccessAllowed(req, accessGuard)
  });

  wss.on('connection', (socket) => {
    const ctx: SocketContext = { room: null, playerIndex: null };

    if (dataError) {
      send(socket, { type: 'dataError', message: dataError });
    }

    socket.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        const parsed = messageSchema.safeParse(JSON.parse(String(raw)));
        if (!parsed.success) {
          send(socket, { type: 'error', code: 'invalid_message', message: 'Ungültige Nachricht. Bitte die aktuelle Spielversion neu laden.' });
          return;
        }
        msg = parsed.data;
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
          console.error({ version: PERSIST_VERSION, match: ctx.room ? `${ctx.room.code}:${ctx.room.matchNumber}` : null, error: e instanceof Error ? e.message : 'Unbekannter Fehler' });
          send(socket, { type: 'error', message: `Interner Serverfehler (Alpha ${PERSIST_VERSION}, Partie ${ctx.room?.code ?? '–'}).` });
        }
      }
    });

    socket.on('close', () => {
      if (ctx.room !== null && ctx.playerIndex !== null) {
        const player = ctx.room.players[ctx.playerIndex];
        if (player && player.socket === socket) {
          player.socket = null;
          ctx.room.updatedAt = Date.now();
          notifyOpponentConnection(ctx.room, ctx.playerIndex);
          saveRooms(rooms);
        }
        // Raum aufräumen, wenn die Partie vorbei ist und niemand mehr da ist
        if (
          Date.now() - ctx.room.updatedAt > LOBBY_ROOM_MS &&
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
      if (typeof championId !== 'string' || !ladeDeckStatus(d).active.includes(championId)) {
        throw new GameRuleError(
          `Unbekannter Champ. Verfügbar: ${d.champions.map((champion) => champion.id).join(', ')}`
        );
      }
      return championId;
    }

    function optionalUsername(raw: unknown): string | null {
      if (raw === undefined || raw === null || raw === '') return null;
      try {
        return users.login(raw).username;
      } catch (error) {
        if (error instanceof UserAccountError) throw new GameRuleError(error.message);
        throw error;
      }
    }

    function resolveDeck(selection: unknown, requestedChampion: unknown): { championId: string; deck: DeckList | null } {
      const d = requireData();
      if (!selection || typeof selection !== 'object') {
        const championId = validChampion(requestedChampion);
        return { championId, deck: ladeDecks(d)[championId] };
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
      if (requestedChampion && requestedChampion !== championId) {
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
      room.updatedAt = Date.now();
      ctx.room = room;
      ctx.playerIndex = idx;
      room.players[idx].socket = socket;
    }

    function handleMessage(msg: Record<string, unknown>): void {
      if (ctx.room && ctx.playerIndex !== null && ctx.room.players[ctx.playerIndex].socket !== socket) throw new GameRuleError('Diese Verbindung wurde durch eine neue Anmeldung ersetzt.');
      if (ctx.room && (msg.type === 'create' || msg.type === 'join')) throw new GameRuleError('Du bist bereits in einem Raum.');
      switch (msg.type) {
        case 'create': {
          const username = optionalUsername(msg.username);
          const { championId, deck } = resolveDeck(msg.deckSelection, msg.championId ?? msg.faction);
          const topic = validTopic(msg.topic);
          const lanes = validLanes(msg.lanes);
          const room: Room = {
            revision: 0,
            updatedAt: Date.now(),
            code: newRoomCode(),
            players: [{
              token: randomBytes(12).toString('hex'),
              username,
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
          sendAccount(room.players[0]);
          break;
        }

        case 'join': {
          const username = optionalUsername(msg.username);
          const { championId, deck } = resolveDeck(msg.deckSelection, msg.championId ?? msg.faction);
          const room = rooms.get(String(msg.code));
          if (!room) {
            throw new GameRuleError('Diesen Raum-Code gibt es nicht. Tippfehler?');
          }
          if (room.players.length >= 2) {
            throw new GameRuleError('Dieser Raum ist schon voll (2 Spieler).');
          }
          if (username && room.players.some((player) => player.username === username)) {
            throw new GameRuleError('Dieses Benutzerkonto spielt bereits in diesem Raum.');
          }
          room.players.push({
            token: randomBytes(12).toString('hex'),
            username,
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
          sendAccount(room.players[1]);
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
            const incompatible = incompatibleRooms.has(String(msg.code));
            send(socket, { type: 'error', code: incompatible ? 'incompatible_state' : 'session_expired', message: incompatible ? 'Dieser gespeicherte Spielstand ist mit der aktuellen Spielversion nicht kompatibel. Bitte einen neuen Raum starten.' : 'Diese Partie ist nicht mehr verfügbar oder der Zugang ist ungültig. Bitte einen neuen Raum starten.' });
            return;
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
          sendAccount(room.players[idx]);
          notifyOpponentConnection(room, idx as PlayerIndex);
          if (room.state) {
            send(socket, {
              type: 'state',
              revision: room.revision,
              topic: room.topic,
              matchNumber: room.matchNumber,
              view: buildClientView(room.state, idx as PlayerIndex, requireData())
            });
            send(socket, {
              type: 'opponent',
              connected: Boolean(room.players[idx === 0 ? 1 : 0]?.socket)
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
          const wasEnded = ctx.room.state.phase === 'ended';
          if (msg.revision !== ctx.room.revision) {
            send(socket, { type: 'error', code: 'stale_state', message: 'Der Spielstand hat sich geändert. Deine Aktion wurde nicht ausgeführt.' });
            broadcastState(ctx.room);
            return;
          }
          ctx.room.state = applyAction(
            ctx.room.state,
            ctx.playerIndex,
            msg.action as PlayerAction,
            requireData()
          );
          ctx.room.revision += 1;
          ctx.room.updatedAt = Date.now();
          if (!wasEnded && ctx.room.state.phase === 'ended') recordRoomResult(ctx.room);
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
            clearInterval(cleanupTimer);
            for (const client of wss.clients) client.terminate();
            wss.close(() => httpServer.close(() => done()));
          })
      });
    });
  });
}
