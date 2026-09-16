import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createGame, createSeededRandom, ladeAktiveDecks, loadGameData } from '@pcf/engine';
import type { ClientView } from '@pcf/engine';
import { startServer, type RunningServer } from '../src/server.js';
import { messageSchema } from '../src/protocol.js';

const servers: RunningServer[] = [];
const sockets: WebSocket[] = [];
afterEach(async () => { sockets.splice(0).forEach(s => s.terminate()); await Promise.all(servers.splice(0).map(s => s.close())); });
async function start(persistPath: string | null = null) { const s = await startServer(0, { persistPath, accessCredentials: null }); servers.push(s); return s; }
async function client(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`); sockets.push(ws);
  const queue: Record<string, unknown>[] = [];
  const waiters: { type: string; done: (v: Record<string, unknown>) => void }[] = [];
  let revision = 0;
  ws.on('message', raw => { const m = JSON.parse(String(raw)); if (m.type === 'state') revision = m.revision; const i = waiters.findIndex(w => w.type === m.type); if (i >= 0) waiters.splice(i, 1)[0].done(m); else queue.push(m); });
  await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return {
    send: (m: Record<string, unknown>) => ws.send(JSON.stringify({ ...(m.type === 'action' ? { revision } : {}), ...m })),
    next: (type: string): Promise<Record<string, unknown>> => { const i = queue.findIndex(m => m.type === type); if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]); return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error(`Nachricht fehlt: ${type}`)), 3000); waiters.push({ type, done: m => { clearTimeout(timer); resolve(m); } }); }); },
  };
}

describe('Alpha-Online-Vertrag', () => {
  it.each([null, [], { type: 'action', action: { type: 'pass' } }, { type: 'action', revision: 0, action: { type: 'playCreature', handIndex: -1, lane: 0 } }, { type: 'action', revision: 0, action: { type: 'flyMove', fromLane: 0, toLane: 1.5 } }])('weist fehlerhafte Nachrichten ab: %j', message => {
    expect(messageSchema.safeParse(message).success).toBe(false);
  });
  it('weist eine alte Revision ohne Verbrauch ab und erlaubt ausdrückliches Aufgeben', async () => {
    const s = await start(); const a = await client(s.port); const b = await client(s.port);
    a.send({ type: 'create', championId: 'rostbolzen' }); const created = await a.next('created');
    b.send({ type: 'join', code: created.code, championId: 'sonnenfackel' }); await b.next('joined');
    await a.next('state'); await b.next('state');
    a.send({ type: 'action', action: { type: 'mulligan', handIndices: [] } }); await a.next('state'); await b.next('state');
    b.send({ type: 'action', action: { type: 'mulligan', handIndices: [] } }); const before = await a.next('state'); await b.next('state');
    a.send({ type: 'action', revision: 0, action: { type: 'pass' } });
    expect((await a.next('error')).code).toBe('stale_state');
    const unchanged = await a.next('state'); await b.next('state');
    expect(unchanged.view).toEqual(before.view); expect(unchanged.revision).toBe(before.revision);
    b.send({ type: 'action', action: { type: 'surrender' } });
    expect(((await a.next('state')).view as ClientView).winner).toBe(0);
    expect(((await b.next('state')).view as ClientView).phase).toBe('ended');
    expect(await (await fetch(`http://127.0.0.1:${s.port}/health`)).json()).toMatchObject({ ok: true, version: 5 });
  });
  it('erhält Handkopien, Rabatte und eine offene Abwurfauswahl über Neustart', async () => {
    const data = loadGameData(); const decks = ladeAktiveDecks(data);
    const state = createGame(data, ['rostbolzen', 'super_brainz'], createSeededRandom(45), [decks.rostbolzen, decks.super_brainz]);
    state.phase = 'play'; state.active = 0; state.round = 2;
    state.choice = { id: 900, owner: 0, kind: 'discard', title: 'Karte abwerfen' };
    state.players[0].handInstances![1].discount = 2;
    state.players[0].graveyard = [{ id: 123, cardId: 'alpha_wolf' }];
    const selected = state.players[0].handInstances![1].id;
    const file = join(mkdtempSync(join(tmpdir(), 'pcf-alpha-')), 'rooms.json');
    writeFileSync(file, JSON.stringify({ version: 5, rooms: [{ code: '4321', topic: data.topics[0], lanes: 5, revision: 7, updatedAt: Date.now(), state, players: [{ token: 'test-a', championId: 'rostbolzen', deck: decks.rostbolzen }, { token: 'test-b', championId: 'super_brainz', deck: decks.super_brainz }] }] }));
    let s = await start(file); const a = await client(s.port);
    a.send({ type: 'rejoin', code: '4321', token: 'test-a' }); await a.next('rejoined');
    const first = await a.next('state'); const view = first.view as ClientView;
    expect(first.revision).toBe(7); expect(view.choice?.id).toBe(900); expect(view.handInstanceIds?.[1]).toBe(selected);
    expect(view.graveyard?.[0].id).toBe(123);
    expect(view.hand[1].cost).toBe(Math.max(0, data.cardsById[state.players[0].hand[1]].cost - 2));
    await s.close(); servers.splice(servers.indexOf(s), 1);
    s = await start(file); const resumed = await client(s.port);
    resumed.send({ type: 'rejoin', code: '4321', token: 'test-a' }); await resumed.next('rejoined'); await resumed.next('state');
    resumed.send({ type: 'action', action: { type: 'chooseCard', choiceId: 900, instanceId: selected } });
    const after = await resumed.next('state');
    expect((after.view as ClientView).choice).toBeNull(); expect((after.view as ClientView).handInstanceIds).not.toContain(selected);
    expect(after.revision).toBe(8);
    const persisted = JSON.parse(readFileSync(file, 'utf8')); expect(persisted.rooms[0].state.choice).toBeNull();
  });
  it('beendet die Wiederverbindung zu unbekannten Räumen eindeutig', async () => {
    const s = await start(); const a = await client(s.port);
    a.send({ type: 'rejoin', code: '9999', token: 'test' });
    expect((await a.next('error')).code).toBe('session_expired');
  });
  it('unterscheidet eine inkompatible Speicherdatei von einem unbekannten Raum', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'pcf-alpha-version-')), 'rooms.json');
    writeFileSync(file, JSON.stringify({ version: 4, rooms: [{ code: '4321' }] }));
    const s = await start(file); const a = await client(s.port);
    a.send({ type: 'rejoin', code: '4321', token: 'test' });
    const error = await a.next('error');
    expect(error.code).toBe('incompatible_state');
    expect(error.message).toContain('nicht kompatibel');
    a.send({ type: 'rejoin', code: '9999', token: 'test' });
    expect((await a.next('error')).code).toBe('session_expired');
  });
});
