// Integrationstest: zwei simulierte Clients, Raum erstellen, beitreten,
// Aktion senden – und der Nachweis, dass Spieler A die Handkarten von
// Spieler B NIE im Netzwerkverkehr sieht.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ClientView } from '@pcf/engine';
import { buildFactionTree, loadGameData, topOf } from '@pcf/engine';
import { startServer, type RunningServer } from '../src/server.js';

const factionTree = buildFactionTree(loadGameData().factions);
const DEFAULT_CHEERLEADERS = ['pc_principal', 'pc_babies', 'alter_wissenschaftler'] as const;

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
          const deckSelection =
            value.deckSelection ??
            (faction === 'animals'
              ? { kind: 'preset', id: 'a1_rudeljaeger' }
              : { kind: 'preset', id: 'h1_solidaritaet' });
          ws.send(JSON.stringify({
            ...value,
            deckSelection,
            cheerleaders: value.cheerleaders ?? DEFAULT_CHEERLEADERS
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
    expect(stateA.hand).toHaveLength(4);
    expect(stateB.hand).toHaveLength(4);
    expect(stateA.players[0].cheerleaders).toEqual(DEFAULT_CHEERLEADERS);
    expect(stateA.players[1].cheerleaders).toEqual(DEFAULT_CHEERLEADERS);
    expect(stateB.players[0].cheerleaders).toEqual(DEFAULT_CHEERLEADERS);
    // Gegnerische Hand nur als Anzahl:
    expect(stateA.players[1].handCount).toBe(4);

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
      // Handkarten können Sub-Fraktionen sein, ihre Oberfraktion ist "humans".
      expect(view.you).toBe(0);
      for (const card of view.hand) expect(topOf(factionTree, card.faction)).toBe('humans');
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
    expect(view.players[0].cheerleaders).toEqual(DEFAULT_CHEERLEADERS);
    expect(view.players[1].cheerleaders).toEqual(DEFAULT_CHEERLEADERS);

    rejoined.ws.close();
    host.ws.close();
    guest.ws.close();
    await restarted.close();
  });

  it('lehnt ungültige Cheerleader-Auswahlen mit deutscher Meldung ab', async () => {
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
    expect(Object.keys(info.decks as object)).toContain('h1_solidaritaet');
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

  it('Preset-Decks werden serverseitig aufgelöst; manipulierte Custom-Decks werden abgelehnt', async () => {
    const host = await connect(server.port);
    host.send({ type: 'create', deckSelection: { kind: 'preset', id: 'h1_solidaritaet' } });
    const created = await host.next('created');
    const guest = await connect(server.port);
    guest.send({ type: 'join', code: created.code, deckSelection: { kind: 'preset', id: 'a1_rudeljaeger' } });
    await guest.next('joined');
    const hostView = (await host.next('state')).view as ClientView;
    expect(hostView.players[0].deckName).toContain('Solidarität');
    expect(hostView.players[1].deckName).toContain('Rudeljäger');

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
