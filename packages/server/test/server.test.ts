// Integrationstest: zwei simulierte Clients, Raum erstellen, beitreten,
// Aktion senden – und der Nachweis, dass Spieler A die Handkarten von
// Spieler B NIE im Netzwerkverkehr sieht.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';
import type { ClientView } from '@pcf/engine';
import { buildFactionTree, ladeDecks, loadGameData, topOf } from '@pcf/engine';
import { startServer, type RunningServer } from '../src/server.js';
import { createUserStore } from '../src/users.js';

const factionTree = buildFactionTree(loadGameData().factions);
const SUPERPOWER_BANK = ['pc_principal', 'pc_babies', 'alter_wissenschaftler'] as const;

interface TestClient {
  ws: WebSocket;
  /** Alle jemals empfangenen Nachrichten (Roh-Protokoll für die Sicht-Prüfung). */
  received: { type: string; [k: string]: unknown }[];
  /** Zuletzt empfangene Spielsicht (unabhängig von next()-Konsumenten). */
  lastView: ClientView | null;
  /** Wartet auf die nächste noch nicht abgeholte Nachricht dieses Typs. */
  next: (type: string) => Promise<Record<string, unknown>>;
  send: (msg: unknown) => void;
}

function connect(port: number): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const received: TestClient['received'] = [];
    const unread: Record<string, unknown>[] = [];
    const waiters: { type: string; resolve: (m: Record<string, unknown>) => void }[] = [];

    const client: TestClient = {
      ws,
      received,
      lastView: null,
      send: (msg) => {
        const value = msg as Record<string, unknown>;
        if (value.type === 'create' || value.type === 'join') {
          const faction = value.faction;
          const championId = value.championId ?? (faction === 'animals' ? 'sonnenfackel' : 'rostbolzen');
          const deckSelection =
            value.deckSelection ??
            { kind: 'preset', id: championId };
          ws.send(JSON.stringify({
            ...value,
            deckSelection,
            championId
          }));
          return;
        }
        ws.send(JSON.stringify(msg));
      },
      next: (type) => {
        const i = unread.findIndex((m) => m.type === type);
        if (i !== -1) return Promise.resolve(unread.splice(i, 1)[0]);
        return new Promise((res) => waiters.push({ type, resolve: res }));
      }
    };

    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      received.push(msg);
      if (msg.type === 'state') client.lastView = msg.view as ClientView;
      const i = waiters.findIndex((w) => w.type === msg.type);
      if (i !== -1) waiters.splice(i, 1)[0].resolve(msg);
      else unread.push(msg);
    });
    ws.on('open', () => resolve(client));
    ws.on('error', reject);
  });
}

let server: RunningServer;
let a: TestClient;
let b: TestClient;
let code: string;

beforeAll(async () => {
  server = await startServer(0); // Port 0 = freier Zufallsport
});

afterAll(async () => {
  a?.ws.close();
  b?.ws.close();
  await server.close();
});

describe('Server: Raum, Beitritt, Aktionen, gefilterte Sicht', () => {
  it('Spieler A erstellt einen Raum und bekommt einen 4-stelligen Code', async () => {
    a = await connect(server.port);
    a.send({ type: 'create', faction: 'humans' });
    const created = await a.next('created');
    code = created.code as string;
    expect(code).toMatch(/^\d{4}$/);
    expect(created.token).toBeTruthy();
    // Keyword-Erklärungen für die Detailansicht werden mitgeliefert (seit
    // Phase 7b nur noch die zwei reinen Regel-Flags flink/fliegend – alle
    // anderen Alt-Keywords sind Ability-Primitive geworden, siehe abilities).
    const keywords = created.keywords as Record<string, { label: string; description: string }>;
    expect(keywords.flink.label).toBeTruthy();
    expect(keywords.fliegend.description).toContain('Lane');
  });

  it('Spieler B tritt bei, beide erhalten den Startzustand', async () => {
    b = await connect(server.port);
    b.send({ type: 'join', code, faction: 'animals' });
    await b.next('joined');

    const stateA = (await a.next('state')).view as ClientView;
    const stateB = (await b.next('state')).view as ClientView;

    expect(stateA.you).toBe(0);
    expect(stateB.you).toBe(1);
    expect(stateA.phase).toBe('mulligan');
    expect(stateA.round).toBe(0);
    expect(stateA.hand).toHaveLength(5);
    expect(stateB.hand).toHaveLength(5);
    expect(stateA.players[0].cheerleaders).toEqual(SUPERPOWER_BANK);
    expect(stateA.players[1].cheerleaders).toEqual(SUPERPOWER_BANK);
    expect(stateB.players[0].cheerleaders).toEqual(SUPERPOWER_BANK);
    // Gegnerische Hand nur als Anzahl:
    expect(stateA.players[1].handCount).toBe(5);

    a.send({ type: 'action', action: { type: 'mulligan', handIndices: [] } });
    const waitingA = (await a.next('state')).view as ClientView;
    await b.next('state');
    expect(waitingA.players[0].mulliganDone).toBe(true);
    expect(waitingA.players[1].mulliganDone).toBe(false);
    b.send({ type: 'action', action: { type: 'mulligan', handIndices: [] } });
    const readyA = (await a.next('state')).view as ClientView;
    const readyB = (await b.next('state')).view as ClientView;
    expect(readyA.phase).toBe('play');
    expect(readyB.round).toBe(1);
  });

  it('ein dritter Spieler kann nicht beitreten', async () => {
    const c = await connect(server.port);
    c.send({ type: 'join', code, faction: 'humans' });
    const err = await c.next('error');
    expect(String(err.message)).toContain('voll');
    c.ws.close();
  });

  it('nur der aktive Spieler darf handeln; beide erhalten den neuen Zustand', async () => {
    // Wer anfängt, ist zufällig – aus der zuletzt empfangenen Sicht ablesen.
    const active = a.lastView!.active;
    const activeClient = active === 0 ? a : b;
    const inactiveClient = active === 0 ? b : a;

    // Der nicht-aktive Spieler versucht zu handeln → Zugsperre greift.
    inactiveClient.send({ type: 'action', action: { type: 'pass' } });
    const err = await inactiveClient.next('error');
    expect(String(err.message)).toContain('nicht am Zug');

    // Der aktive Spieler passt → beide Clients erhalten den neuen Zustand.
    activeClient.send({ type: 'action', action: { type: 'pass' } });
    const stateA = (await a.next('state')).view as ClientView;
    const stateB = (await b.next('state')).view as ClientView;
    expect(stateA.log.some((l) => l.text.includes('passt'))).toBe(true);
    expect(stateB.log.some((l) => l.text.includes('passt'))).toBe(true);
  });

  it('Spieler A sieht die Handkarten von Spieler B nie im Netzwerkverkehr', () => {
    const views = a.received
      .map((m) => (m as { view?: ClientView }).view)
      .filter((v): v is ClientView => Boolean(v));
    expect(views.length).toBeGreaterThan(0);

    for (const view of views) {
      // Nur die eigene Hand ist enthalten – und A (Humans) darf niemals
      // Animals-Karten als Handkarten geschickt bekommen (B spielt Animals).
      // PC Principal ist die vereinbarte neutrale Ausnahme im Alpha-Deck.
      expect(view.you).toBe(0);
      for (const card of view.hand) {
        expect(['humans', 'neutral']).toContain(topOf(factionTree, card.faction));
      }
      // Der Gegner-Eintrag enthält nur Zähler, keine Kartenlisten:
      const opponent = view.players[1] as unknown as Record<string, unknown>;
      expect(opponent.hand).toBeUndefined();
      expect(opponent.deck).toBeUndefined();
      expect(typeof opponent.handCount).toBe('number');
      expect(typeof opponent.deckCount).toBe('number');
    }
  });

  it('Reconnect: mit Raum-Code + Token gibt es den Zustand erneut', async () => {
    const c1 = await connect(server.port);
    c1.send({ type: 'create', faction: 'animals' });
    const created = await c1.next('created');

    const c2 = await connect(server.port);
    c2.send({ type: 'join', code: created.code, faction: 'humans' });
    const joined = await c2.next('joined');
    await c2.next('state');

    // Verbindung von c2 "reißt ab":
    c2.ws.close();
    await new Promise((r) => setTimeout(r, 50));

    const c2b = await connect(server.port);
    c2b.send({ type: 'rejoin', code: created.code, token: joined.token });
    await c2b.next('rejoined');
    const view = (await c2b.next('state')).view as ClientView;
    expect(view.you).toBe(1);
    expect(view.round).toBeGreaterThanOrEqual(0);

    c1.ws.close();
    c2b.ws.close();
  });

  it('Reconnect mit falschem Token wird abgelehnt', async () => {
    const c = await connect(server.port);
    c.send({ type: 'rejoin', code, token: 'falsch' });
    const err = await c.next('error');
    expect(String(err.message)).toContain('Wiederverbinden');
    c.ws.close();
  });

  it('Reconnect nach Serverneustart übernimmt beide öffentlichen Bankroster', async () => {
    const host = await connect(server.port);
    host.send({ type: 'create', faction: 'humans' });
    const created = await host.next('created');
    const guest = await connect(server.port);
    guest.send({ type: 'join', code: created.code, faction: 'animals' });
    const joined = await guest.next('joined');
    await host.next('state');
    await guest.next('state');

    const restarted = await startServer(0);
    const rejoined = await connect(restarted.port);
    rejoined.send({ type: 'rejoin', code: created.code, token: joined.token });
    await rejoined.next('rejoined');
    const view = (await rejoined.next('state')).view as ClientView;
    expect(view.players[0].cheerleaders).toEqual(SUPERPOWER_BANK);
    expect(view.players[1].cheerleaders).toEqual(SUPERPOWER_BANK);

    rejoined.ws.close();
    host.ws.close();
    guest.ws.close();
    await restarted.close();
  });

  it.skip('Ersetztes Cheerleader-Auswahlprotokoll', async () => {
    const tooShort = await connect(server.port);
    tooShort.send({
      type: 'create',
      faction: 'humans',
      cheerleaders: ['pc_principal', 'pc_babies']
    });
    expect(String((await tooShort.next('error')).message)).toContain('exakt 3');

    const duplicate = await connect(server.port);
    duplicate.send({
      type: 'create',
      faction: 'humans',
      cheerleaders: ['pc_principal', 'pc_principal', 'randy_marsh']
    });
    expect(String((await duplicate.next('error')).message)).toContain('nur einmal');
    tooShort.ws.close();
    duplicate.ws.close();
  });

  it('Schauplatz: der Ersteller wählt das Thema, beide Clients bekommen es', async () => {
    const c1 = await connect(server.port);
    c1.send({ type: 'create', faction: 'humans', topic: 'mars' });
    const created = await c1.next('created');
    expect((created.topic as { id: string }).id).toBe('mars');

    const c2 = await connect(server.port);
    c2.send({ type: 'join', code: created.code, faction: 'animals' });
    const joined = await c2.next('joined');
    expect((joined.topic as { id: string }).id).toBe('mars');

    const state1 = await c1.next('state');
    const state2 = await c2.next('state');
    expect((state1.topic as { id: string }).id).toBe('mars');
    expect((state2.topic as { id: string }).id).toBe('mars');
    // Das Thema kommt mit allen Anzeigedaten (Farben) beim Client an:
    expect((state2.topic as { colors: { background: string } }).colors.background).toBeTruthy();

    c1.ws.close();
    c2.ws.close();
  });

  it('unbekanntes Thema wird abgelehnt', async () => {
    const c = await connect(server.port);
    c.send({ type: 'create', faction: 'humans', topic: 'unterwasser' });
    const err = await c.next('error');
    expect(String(err.message)).toContain('Thema');
    c.ws.close();
  });

  it('/info liefert Karten, Deckbauregeln und Prebuilds', async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/info`);
    const info = await response.json() as Record<string, unknown>;
    expect(Array.isArray(info.cards)).toBe(true);
    expect(info.deckbuilding).toBeTruthy();
    const angeboteneDecks = Object.keys(info.decks as object).sort();
    const aktiveDecks = (info.deckStatus as { active: string[] }).active.sort();
    expect(angeboteneDecks).toEqual(aktiveDecks);
    expect(angeboteneDecks).toHaveLength(6);
    expect((info.champions as unknown[])).toHaveLength(6);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const visuals = info.visuals as { cards: Record<string, unknown> };
    expect(Object.keys(visuals.cards)).toEqual(expect.arrayContaining([
      'ratte',
      'baer',
      'uralte_schlange',
      'spinosaurus',
      'velociraptor',
      'ritter',
      'feldscherin',
      'kranfuehrer',
      'schrottsammlerin',
      'eule'
    ]));
  });

  it('/account meldet nur freigeschaltete Namen an und speichert validierte Decks', async () => {
    const accountPath = join(process.cwd(), 'tmp', `server-account-${Date.now()}.json`);
    const accountServer = await startServer(0, {
      userStore: createUserStore({ allowedUsernames: ['Ada'], persistPath: accountPath })
    });
    try {
      const post = (body: unknown) => fetch(`http://127.0.0.1:${accountServer.port}/account`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });

      const rejected = await post({ action: 'login', username: 'Nicht Ada' });
      expect(rejected.status).toBe(400);

      const loggedIn = await post({ action: 'login', username: 'ada' });
      expect(loggedIn.status).toBe(200);
      expect((await loggedIn.json() as { account: { username: string } }).account.username).toBe('Ada');

      const preset = ladeDecks(loadGameData()).rostbolzen;
      const saved = await post({
        action: 'saveDeck',
        username: 'Ada',
        deck: { ...preset, id: 'adas-deck', name: 'Adas Deck' }
      });
      expect(saved.status).toBe(200);
      const account = (await saved.json() as { account: { decks: Array<{ id: string }> } }).account;
      expect(account.decks.map((deck) => deck.id)).toContain('adas-deck');
    } finally {
      await accountServer.close();
      if (existsSync(accountPath)) rmSync(accountPath);
      if (existsSync(accountPath + '.tmp')) rmSync(accountPath + '.tmp');
    }
  });

  it('nicht angebotene Preset-Decks koennen auch manipuliert nicht gestartet werden', async () => {
    const client = await connect(server.port);
    client.send({ type: 'create', deckSelection: { kind: 'preset', id: 'a2_luftangriff' } });
    const error = await client.next('error');
    expect(String(error.message)).toContain('Unbekanntes Prebuild-Deck');
    client.ws.close();
  });

  it('Preset-Decks werden serverseitig aufgelöst; manipulierte Custom-Decks werden abgelehnt', async () => {
    const host = await connect(server.port);
    host.send({ type: 'create', championId: 'rostbolzen', deckSelection: { kind: 'preset', id: 'rostbolzen' } });
    const created = await host.next('created');
    const guest = await connect(server.port);
    guest.send({ type: 'join', code: created.code, championId: 'sonnenfackel', deckSelection: { kind: 'preset', id: 'sonnenfackel' } });
    await guest.next('joined');
    const hostView = (await host.next('state')).view as ClientView;
    expect(hostView.players[0].deckName).toContain('Doktor Stahlbund');
    expect(hostView.players[1].deckName).toContain('Funkenfeder');

    const bad = await connect(server.port);
    bad.send({ type: 'create', deckSelection: { kind: 'custom', deck: { name: 'Cheat', cards: [{ cardId: 'wolf', count: 99 }] } } });
    const err = await bad.next('error');
    expect(String(err.message)).toContain('Deck ungültig');
    host.ws.close(); guest.ws.close(); bad.ws.close();
  });

  it('Testmodus: beide Hände starten mit den Figuren-Karten und viel Energie', async () => {
    const data = loadGameData();
    const figureCardIds = data.cards
      .filter((c) => c.type === 'creature' && data.figures[c.id]?.visual)
      .map((c) => c.id);
    expect(figureCardIds.length).toBeGreaterThan(0);

    const c1 = await connect(server.port);
    c1.send({ type: 'create', faction: 'humans', testMode: true });
    const created = await c1.next('created');
    expect(created.testMode).toBe(true);

    const c2 = await connect(server.port);
    c2.send({ type: 'join', code: created.code, faction: 'animals' });
    const joined = await c2.next('joined');
    expect(joined.testMode).toBe(true);

    await c1.next('state');
    await c2.next('state');
    c1.send({ type: 'action', action: { type: 'mulligan', handIndices: [] } });
    await c1.next('state'); await c2.next('state');
    c2.send({ type: 'action', action: { type: 'mulligan', handIndices: [] } });
    const state1 = (await c1.next('state')).view as ClientView;
    const state2 = (await c2.next('state')).view as ClientView;
    expect(state1.hand.map((c) => c.id).sort()).toEqual([...figureCardIds].sort());
    expect(state2.hand.map((c) => c.id).sort()).toEqual([...figureCardIds].sort());
    expect(state1.you === 0 ? state1.players[0].energy : state1.players[1].energy).toBeGreaterThanOrEqual(40);

    c1.ws.close();
    c2.ws.close();
  });
});

describe('Verbindliche Bahnenzahl', () => {
  it('erstellt das Spielfeld dauerhaft mit fuenf Bahnen', async () => {
    const srv = await startServer(0);
    const c1 = await connect(srv.port);
    c1.send({ type: 'create', faction: 'humans', lanes: 5 });
    const created = await c1.next('created');
    expect(created.lanes).toBe(5);

    const c2 = await connect(srv.port);
    c2.send({ type: 'join', code: created.code, faction: 'animals' });
    await c2.next('joined');
    const sicht = (await c1.next('state')).view as ClientView;
    // Nicht nur die Zahl: das Brett muss wirklich so breit sein.
    expect(sicht.lanes).toBe(5);
    expect(sicht.board[0]).toHaveLength(5);
    expect(sicht.board[1]).toHaveLength(5);

    c1.ws.close();
    c2.ws.close();
    await srv.close();
  });

  it('verwendet auch ohne Angabe exakt fuenf Bahnen', async () => {
    const srv = await startServer(0);
    const c1 = await connect(srv.port);
    c1.send({ type: 'create', faction: 'humans' });
    const created = await c1.next('created');
    const c2 = await connect(srv.port);
    c2.send({ type: 'join', code: created.code, faction: 'animals' });
    await c2.next('joined');
    const sicht = (await c1.next('state')).view as ClientView;
    expect(sicht.lanes).toBe(5);

    c1.ws.close();
    c2.ws.close();
    await srv.close();
  });

  it('weist jede andere Bahnenzahl ab', async () => {
    const srv = await startServer(0);
    const c1 = await connect(srv.port);
    c1.send({ type: 'create', faction: 'humans', lanes: 3 });
    const fehler = await c1.next('error');
    expect(String(fehler.message)).toMatch(/Bahnenzahl/);

    c1.ws.close();
    await srv.close();
  });
});

describe('Rückspiel', () => {
  it('wartet auf beide Spieler, überlebt Reconnect und startet dieselben Loadouts neu', async () => {
    let c1 = await connect(server.port);
    let c2 = await connect(server.port);
    c1.send({ type: 'create', faction: 'humans' });
    const created = await c1.next('created');
    const rematchCode = created.code as string;
    const token1 = created.token as string;
    c2.send({ type: 'join', code: rematchCode, faction: 'animals' });
    await c2.next('joined');
    await c1.next('state');
    await c2.next('state');

    c1.send({ type: 'action', action: { type: 'mulligan', handIndices: [] } });
    await c1.next('state'); await c2.next('state');
    c2.send({ type: 'action', action: { type: 'mulligan', handIndices: [] } });
    await c1.next('state'); await c2.next('state');

    // Ohne ausgespielte Kreaturen beendet die direkte Zermürbung die Partie
    // deterministisch. So testet der Serverpfad keine Bot-Entscheidungen mit.
    for (let step = 0; step < 100 && c1.lastView!.phase !== 'ended'; step++) {
      const active = c1.lastView!.active === c1.lastView!.you ? c1 : c2;
      active.send({ type: 'action', action: { type: 'pass' } });
      await c1.next('state');
      await c2.next('state');
    }
    expect(c1.lastView!.phase).toBe('ended');
    expect(c1.lastView!.matchSummary).toBeTruthy();

    c1.send({ type: 'rematchReady', ready: true });
    expect((await c1.next('rematchState')).ready).toEqual([true, false]);
    await c2.next('rematchState');

    c1.ws.close();
    c1 = await connect(server.port);
    c1.send({ type: 'rejoin', code: rematchCode, token: token1 });
    await c1.next('rejoined');
    await c1.next('state');
    expect((await c1.next('rematchState')).ready).toEqual([true, false]);

    c2.send({ type: 'rematchReady', ready: true });
    expect((await c1.next('rematchState')).ready).toEqual([true, true]);
    expect((await c2.next('rematchState')).ready).toEqual([true, true]);
    const freshMessage1 = await c1.next('state');
    const freshMessage2 = await c2.next('state');
    const fresh1 = freshMessage1.view as ClientView;
    const fresh2 = freshMessage2.view as ClientView;
    expect(freshMessage1.matchNumber).toBe(2);
    expect(freshMessage2.matchNumber).toBe(2);
    expect(fresh1.phase).toBe('mulligan');
    expect(fresh2.phase).toBe('mulligan');
    expect(fresh1.round).toBe(0);
    expect(fresh1.players[0].cheerleaders).toEqual(SUPERPOWER_BANK);
    expect(fresh1.players[1].cheerleaders).toEqual(SUPERPOWER_BANK);

    c1.ws.close();
    c2.ws.close();
  });
});

describe.skip('Ersetzte Persistenzversionen und Cheerleader-Reaktionsfenster', () => {
  const persistPfad = join(process.cwd(), 'rooms_persist.json');
  let gesichert: string | null = null;

  beforeAll(() => {
    // Die Datei liegt im Arbeitsverzeichnis und wird von diesen Tests
    // ueberschrieben - vorher sichern, hinterher zurueckspielen.
    gesichert = existsSync(persistPfad) ? readFileSync(persistPfad, 'utf-8') : null;
  });

  afterAll(() => {
    if (gesichert !== null) writeFileSync(persistPfad, gesichert, 'utf-8');
    else if (existsSync(persistPfad)) rmSync(persistPfad);
  });

  /** Beide Spieler passen, bis der Spieler am Zug eine Kreatur bezahlen kann. */
  async function spieleBisKreaturBezahlbar(
    c1: TestClient,
    c2: TestClient
  ): Promise<{ aktiv: TestClient; passiv: TestClient; handIndex: number; lane: number }> {
    for (let versuch = 0; versuch < 40; versuch++) {
      const sicht = c1.lastView!;
      const amZug = sicht.active === sicht.you ? c1 : c2;
      const anderer = amZug === c1 ? c2 : c1;
      const v = amZug.lastView!;
      const energie = v.players[v.you].energy;
      const idx = v.hand.findIndex((k) => k.type === 'creature' && k.cost <= energie);
      const freieLane = v.board[v.you].findIndex((slot) => slot === null);
      if (idx >= 0 && freieLane >= 0 && v.phase === 'play') {
        return { aktiv: amZug, passiv: anderer, handIndex: idx, lane: freieLane };
      }
      // Nichts bezahlbar: passen und weiter (Energie waechst je Runde).
      amZug.send({ type: 'action', action: { type: 'pass' } });
      await c1.next('state');
      await c2.next('state');
    }
    throw new Error('Keine bezahlbare Kreatur nach 40 Zuegen.');
  }

  it('haelt ein offenes Fenster ueber Serverneustart und Reconnect', async () => {
    if (existsSync(persistPfad)) rmSync(persistPfad);
    let srv = await startServer(0);
    let c1 = await connect(srv.port);
    // Testmodus: der Schild ist nach EINEM Treffer voll, ein Basisangriff
    // loest also zuverlaessig den Block und damit das Bank-Fenster aus.
    c1.send({ type: 'create', faction: 'humans', testMode: true });
    const created = await c1.next('created');
    const raumCode = created.code as string;
    const token1 = created.token as string;

    let c2 = await connect(srv.port);
    c2.send({ type: 'join', code: raumCode, faction: 'animals' });
    const token2 = (await c2.next('joined')).token as string;
    await c1.next('state');
    await c2.next('state');
    c1.send({ type: 'action', action: { type: 'mulligan', handIndices: [] } });
    await c1.next('state'); await c2.next('state');
    c2.send({ type: 'action', action: { type: 'mulligan', handIndices: [] } });
    await c1.next('state'); await c2.next('state');

    const { aktiv, passiv, handIndex, lane } = await spieleBisKreaturBezahlbar(c1, c2);
    aktiv.send({ type: 'action', action: { type: 'playCreature', handIndex, lane } });
    await c1.next('state');
    await c2.next('state');

    // Die Kreatur ist beim Ausspielen erschoepft. Erst der Kampf der FOLGENDEN
    // Runde schlaegt gegen die leere Lane, trifft die Basis und laesst den
    // Schild blocken. Bis dahin gibt der jeweils Aktive nur ab – in der
    // Flugphase heisst das `flyDone`, sonst `pass`.
    for (let i = 0; i < 30 && !c1.lastView!.reaktion && !c2.lastView!.reaktion; i++) {
      const amZug = c1.lastView!.active === c1.lastView!.you ? c1 : c2;
      const v = amZug.lastView!;
      if (v.phase === 'ended') break;
      amZug.send({
        type: 'action',
        action: v.phase === 'fly' ? { type: 'flyDone' } : { type: 'pass' }
      });
      await c1.next('state');
      await c2.next('state');
    }

    // Der Schildbesitzer bezahlt den Block mit einem Bankplatz: er sieht die
    // Angebote, der andere nur, DASS gewartet wird.
    const sichtPassiv = passiv.lastView!;
    const sichtAktiv = aktiv.lastView!;
    expect(sichtPassiv.reaktion).toBeTruthy();
    expect(sichtPassiv.reaktion!.spieler).toBe(sichtPassiv.you);
    expect(sichtPassiv.reaktion!.angebote.length).toBeGreaterThan(0);
    expect(sichtAktiv.reaktion).toBeTruthy();
    expect(sichtAktiv.reaktion!.angebote).toEqual([]);
    const reaktionsId = sichtPassiv.reaktion!.id;

    // Waehrend des Fensters ist jede normale Aktion gesperrt.
    passiv.send({ type: 'action', action: { type: 'pass' } });
    const fehler = await passiv.next('error');
    expect(String(fehler.message)).toMatch(/Cheerleader-Reaktion/);

    // ---- Serverneustart ----
    const wardPassivSpieler = sichtPassiv.you;
    c1.ws.close();
    c2.ws.close();
    await srv.close();

    // Die Datei muss versioniert sein und darf keine .tmp-Reste hinterlassen.
    const roh = JSON.parse(readFileSync(persistPfad, 'utf-8'));
    expect(Array.isArray(roh)).toBe(false);
    expect(roh.version).toBe(3);
    expect(existsSync(persistPfad + '.tmp')).toBe(false);

    srv = await startServer(0);
    c1 = await connect(srv.port);
    c2 = await connect(srv.port);
    c1.send({ type: 'rejoin', code: raumCode, token: token1 });
    c2.send({ type: 'rejoin', code: raumCode, token: token2 });
    await c1.next('rejoined');
    await c2.next('rejoined');
    await c1.next('state');
    await c2.next('state');

    const neuPassiv = (c1.lastView!.you === wardPassivSpieler ? c1 : c2).lastView!;
    expect(neuPassiv.reaktion).toBeTruthy();
    expect(neuPassiv.reaktion!.id).toBe(reaktionsId);
    expect(neuPassiv.reaktion!.angebote.length).toBeGreaterThan(0);

    // Und die Antwort wirkt nach dem Neustart normal weiter. Verzichten gibt es
    // nicht mehr – der Block wird mit einem konkreten Bankplatz bezahlt.
    const clientPassiv = c1.lastView!.you === wardPassivSpieler ? c1 : c2;
    const slot = neuPassiv.reaktion!.angebote[0].slot;
    clientPassiv.send({
      type: 'action',
      action: { type: 'cheerleaderReaction', reactionId: reaktionsId, slot }
    });
    await c1.next('state');
    await c2.next('state');
    expect(clientPassiv.lastView!.reaktion).toBeUndefined();
    expect(clientPassiv.lastView!.players[wardPassivSpieler].cheerleaders[slot]).toBeNull();

    c1.ws.close();
    c2.ws.close();
    await srv.close();
  }, 30000);

  it('laedt das alte unversionierte Array-Format weiter', async () => {
    // Aus dem eben geschriebenen v2-Stand ein v1-Dokument bauen.
    const v2 = JSON.parse(readFileSync(persistPfad, 'utf-8'));
    expect(v2.rooms.length).toBeGreaterThan(0);
    const code0 = v2.rooms[0].code as string;
    const token0 = v2.rooms[0].players[0].token as string;
    // Zusaetzlich die Felder der Aufloesungssteuerung entfernen - genau so
    // sahen Zustaende vor den Cheerleader-Reaktionen aus.
    for (const raum of v2.rooms) {
      if (!raum.state) continue;
      delete raum.state.aufloesung;
      delete raum.state.reaktion;
      delete raum.state.naechsteReaktionsId;
    }
    writeFileSync(persistPfad, JSON.stringify(v2.rooms, null, 2), 'utf-8');

    const srv = await startServer(0);
    const c = await connect(srv.port);
    c.send({ type: 'rejoin', code: code0, token: token0 });
    await c.next('rejoined');
    const sicht = (await c.next('state')).view as ClientView;
    // Migriert: kein offenes Fenster, Partie normal weiterspielbar.
    expect(sicht.reaktion).toBeUndefined();
    expect(sicht.round).toBeGreaterThanOrEqual(1);
    c.ws.close();
    await srv.close();
  }, 20000);
});
