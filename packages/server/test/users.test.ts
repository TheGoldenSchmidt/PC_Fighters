import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createUserStore, UserAccountError, type SavedUserDeck } from '../src/users.js';

const testRoot = join(process.cwd(), 'tmp', 'users-tests');
const paths: string[] = [];

function persistPath(name: string): string {
  mkdirSync(testRoot, { recursive: true });
  const path = join(testRoot, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  paths.push(path);
  return path;
}

const deck: SavedUserDeck = {
  id: 'deck-1',
  name: 'Testdeck',
  faction: 'humans',
  championId: 'rostbolzen',
  updatedAt: '2026-08-20T12:00:00.000Z',
  cards: [{ cardId: 'testkarte', count: 1 }]
};

afterEach(() => {
  for (const path of paths.splice(0)) {
    if (existsSync(path)) rmSync(path);
    if (existsSync(path + '.tmp')) rmSync(path + '.tmp');
  }
});

describe('Benutzerspeicher', () => {
  it('erlaubt nur konfigurierte Namen und behandelt die Schreibweise tolerant', () => {
    const store = createUserStore({
      allowedUsernames: ['Ada Lovelace'],
      persistPath: persistPath('login')
    });

    expect(store.login('  ada lovelace  ').username).toBe('Ada Lovelace');
    expect(() => store.login('Unbekannt')).toThrow(UserAccountError);
  });

  it('speichert Decks und zählt dasselbe Match auch nach Neustart nur einmal', () => {
    const path = persistPath('persistenz');
    const first = createUserStore({ allowedUsernames: ['Ada'], persistPath: path });
    expect(first.saveDeck('Ada', deck).decks).toEqual([deck]);
    first.recordMatch('Ada', '1234:1', 'win');
    first.recordMatch('Ada', '1234:1', 'win');

    const reloaded = createUserStore({ allowedUsernames: ['Ada'], persistPath: path });
    const account = reloaded.login('Ada');
    expect(account.decks).toEqual([deck]);
    expect(account.stats).toMatchObject({ wins: 1, currentStreak: 1, bestStreak: 1 });

    expect(reloaded.recordMatch('Ada', '1234:2', 'loss').stats).toMatchObject({
      wins: 1,
      losses: 1,
      currentStreak: 0,
      bestStreak: 1
    });
  });
});
