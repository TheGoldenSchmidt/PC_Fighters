// Integrationstest: zwei simulierte Clients, Raum erstellen, beitreten,
// Aktion senden – und der Nachweis, dass Spieler A die Handkarten von
// Spieler B NIE im Netzwerkverkehr sieht.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ClientView } from '@pcf/engine';
import { startServer, type RunningServer } from '../src/server.js';

interface TestClient {
  ws: WebSocket;
  /** Alle jemals empfangenen Nachrichten (Roh-Protokoll für die Sicht-Prüfung). */
  received: { type: string; [k: string]: unknown }[];
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

    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      received.push(msg);
      const i = waiters.findIndex((w) => w.type === msg.type);
      if (i !== -1) waiters.splice(i, 1)[0].resolve(msg);
      else unread.push(msg);
    });
    ws.on('open', () =>
      resolve({
        ws,
        received,
        send: (msg) => ws.send(JSON.stringify(msg)),
        next: (type) => {
          const i = unread.findIndex((m) => m.type === type);
          if (i !== -1) return Promise.resolve(unread.splice(i, 1)[0]);
          return new Promise((res) => waiters.push({ type, resolve: res }));
        }
      })
    );
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
  });

  it('Spieler B tritt bei, beide erhalten den Startzustand', async () => {
    b = await connect(server.port);
    b.send({ type: 'join', code, faction: 'animals' });
    await b.next('joined');

    const stateA = (await a.next('state')).view as ClientView;
    const stateB = (await b.next('state')).view as ClientView;

    expect(stateA.you).toBe(0);
    expect(stateB.you).toBe(1);
    expect(stateA.round).toBe(1);
    expect(stateA.hand).toHaveLength(4);
    expect(stateB.hand).toHaveLength(4);
    // Gegnerische Hand nur als Anzahl:
    expect(stateA.players[1].handCount).toBe(4);
  });

  it('ein dritter Spieler kann nicht beitreten', async () => {
    const c = await connect(server.port);
    c.send({ type: 'join', code, faction: 'humans' });
    const err = await c.next('error');
    expect(String(err.message)).toContain('voll');
    c.ws.close();
  });

  it('nur der aktive Spieler darf handeln; beide erhalten den neuen Zustand', async () => {
    // Wer anfängt, ist zufällig – wir versuchen es mit A:
    a.send({ type: 'action', action: { type: 'pass' } });
    const first = await Promise.race([a.next('state'), a.next('error')]);

    let stateA: ClientView;
    let stateB: ClientView;
    if (first.type === 'error') {
      // A war nicht dran → Zugsperre funktioniert; jetzt passt B.
      expect(String(first.message)).toContain('nicht am Zug');
      b.send({ type: 'action', action: { type: 'pass' } });
      stateA = (await a.next('state')).view as ClientView;
      stateB = (await b.next('state')).view as ClientView;
    } else {
      stateA = first.view as ClientView;
      stateB = (await b.next('state')).view as ClientView;
    }
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
      expect(view.you).toBe(0);
      for (const card of view.hand) expect(card.faction).toBe('humans');
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
    expect(view.round).toBeGreaterThanOrEqual(1);

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
});
