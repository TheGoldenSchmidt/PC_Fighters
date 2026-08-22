import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeckList } from '@pcf/engine';

export interface UserStats {
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
}

export interface SavedUserDeck extends DeckList {
  id: string;
  name: string;
  faction: string;
  championId: string;
  updatedAt: string;
}

export interface UserAccountSnapshot {
  username: string;
  stats: UserStats;
  decks: SavedUserDeck[];
}

interface PersistedUser {
  stats: UserStats;
  decks: SavedUserDeck[];
  countedMatches: string[];
}

interface PersistedUsersFile {
  version: 1;
  users: Record<string, PersistedUser>;
}

interface UserConfigFile {
  users?: unknown;
}

export interface UserStore {
  login(username: unknown): UserAccountSnapshot;
  saveDeck(username: unknown, deck: SavedUserDeck): UserAccountSnapshot;
  recordMatch(
    username: string,
    matchId: string,
    result: 'win' | 'loss' | 'draw'
  ): UserAccountSnapshot;
}

export class UserAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserAccountError';
  }
}

interface CreateUserStoreOptions {
  /** Tests können die Freigabeliste direkt übergeben. Produktion liest users.json. */
  allowedUsernames?: string[];
  configPath?: string;
  persistPath?: string;
}

const EMPTY_STATS: UserStats = {
  wins: 0,
  losses: 0,
  draws: 0,
  currentStreak: 0,
  bestStreak: 0
};

function nonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function validConfiguredUsername(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value === value.trim() &&
    value.length >= 1 &&
    value.length <= 32 &&
    /^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u.test(value)
  );
}

function loadConfiguredUsers(configPath: string): string[] {
  if (!existsSync(configPath)) {
    console.error(`Benutzerliste fehlt: ${configPath}`);
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as UserConfigFile | string[];
    const values = Array.isArray(parsed) ? parsed : parsed.users;
    if (!Array.isArray(values)) {
      throw new Error('Das Feld "users" muss eine Liste sein.');
    }
    return values.filter((entry): entry is string => {
      if (validConfiguredUsername(entry)) return true;
      console.warn(`Ungültiger Benutzername in users.json wird ignoriert: ${JSON.stringify(entry)}`);
      return false;
    });
  } catch (error) {
    console.error(`users.json konnte nicht geladen werden: ${String(error)}`);
    return [];
  }
}

function cleanStats(raw: unknown): UserStats {
  const value = raw && typeof raw === 'object' ? (raw as Partial<UserStats>) : {};
  return {
    wins: nonNegativeInt(value.wins),
    losses: nonNegativeInt(value.losses),
    draws: nonNegativeInt(value.draws),
    currentStreak: nonNegativeInt(value.currentStreak),
    bestStreak: nonNegativeInt(value.bestStreak)
  };
}

function cleanPersistedUser(raw: unknown): PersistedUser {
  const value = raw && typeof raw === 'object' ? (raw as Partial<PersistedUser>) : {};
  return {
    stats: cleanStats(value.stats),
    decks: Array.isArray(value.decks)
      ? value.decks.flatMap((deck) => {
          if (!deck || typeof deck !== 'object') return [];
          const entry = deck as Partial<SavedUserDeck>;
          if (
            typeof entry.id !== 'string' ||
            typeof entry.name !== 'string' ||
            typeof entry.faction !== 'string' ||
            typeof entry.championId !== 'string' ||
            typeof entry.updatedAt !== 'string' ||
            !Array.isArray(entry.cards)
          ) return [];
          const cards = entry.cards.flatMap((card) =>
            card &&
            typeof card.cardId === 'string' &&
            Number.isInteger(card.count) &&
            card.count > 0
              ? [{ cardId: card.cardId, count: card.count }]
              : []
          );
          if (cards.length !== entry.cards.length) return [];
          return [{
            id: entry.id,
            name: entry.name,
            faction: entry.faction,
            championId: entry.championId,
            updatedAt: entry.updatedAt,
            cards
          }];
        })
      : [],
    countedMatches: Array.isArray(value.countedMatches)
      ? value.countedMatches.filter((id): id is string => typeof id === 'string').slice(-200)
      : []
  };
}

function cloneSnapshot(username: string, user: PersistedUser): UserAccountSnapshot {
  return {
    username,
    stats: { ...user.stats },
    decks: user.decks.map((deck) => ({
      ...deck,
      cards: deck.cards.map((entry) => ({ ...entry }))
    }))
  };
}

export function createUserStore(options: CreateUserStoreOptions = {}): UserStore {
  // npm führt Workspace-Skripte mit packages/server als Arbeitsordner aus.
  // Die Konfiguration liegt aber bewusst im Repository-Hauptordner. Der Pfad
  // relativ zu diesem Modul bleibt bei `npm start`, Tests und direktem tsx-
  // Aufruf identisch; process.cwd() tat das nicht.
  const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const configPath = options.configPath ?? join(repositoryRoot, 'users.json');
  const persistPath = options.persistPath ?? join(repositoryRoot, 'users_persist.json');
  const tempPath = persistPath + '.tmp';
  const configured = options.allowedUsernames ?? loadConfiguredUsers(configPath);
  const canonicalByLower = new Map<string, string>();

  for (const username of configured) {
    if (!validConfiguredUsername(username)) continue;
    const key = username.toLocaleLowerCase('de-DE');
    if (canonicalByLower.has(key)) {
      console.warn(`Doppelter Benutzername in users.json wird ignoriert: ${username}`);
      continue;
    }
    canonicalByLower.set(key, username);
  }

  let persisted: PersistedUsersFile = { version: 1, users: {} };
  try {
    if (existsSync(persistPath)) {
      const parsed = JSON.parse(readFileSync(persistPath, 'utf-8')) as Partial<PersistedUsersFile>;
      if (parsed.version === 1 && parsed.users && typeof parsed.users === 'object') {
        for (const username of canonicalByLower.values()) {
          persisted.users[username] = cleanPersistedUser(parsed.users[username]);
        }
      }
    }
  } catch (error) {
    console.error(`Benutzerdaten konnten nicht geladen werden: ${String(error)}`);
  }

  for (const username of canonicalByLower.values()) {
    persisted.users[username] ??= cleanPersistedUser(null);
  }

  const resolve = (raw: unknown): string => {
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new UserAccountError('Bitte einen Benutzernamen eingeben.');
    }
    const username = canonicalByLower.get(raw.trim().toLocaleLowerCase('de-DE'));
    if (!username) {
      throw new UserAccountError('Dieser Benutzername ist nicht freigeschaltet.');
    }
    return username;
  };

  const save = (): void => {
    try {
      writeFileSync(tempPath, JSON.stringify(persisted, null, 2), 'utf-8');
      renameSync(tempPath, persistPath);
    } catch (error) {
      console.error(`Benutzerdaten konnten nicht gespeichert werden: ${String(error)}`);
    }
  };

  return {
    login(rawUsername) {
      const username = resolve(rawUsername);
      return cloneSnapshot(username, persisted.users[username]);
    },

    saveDeck(rawUsername, deck) {
      const username = resolve(rawUsername);
      const user = persisted.users[username];
      user.decks = [...user.decks.filter((entry) => entry.id !== deck.id), deck]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 50);
      save();
      return cloneSnapshot(username, user);
    },

    recordMatch(rawUsername, matchId, result) {
      const username = resolve(rawUsername);
      const user = persisted.users[username];
      if (user.countedMatches.includes(matchId)) return cloneSnapshot(username, user);

      if (result === 'win') {
        user.stats.wins += 1;
        user.stats.currentStreak += 1;
        user.stats.bestStreak = Math.max(user.stats.bestStreak, user.stats.currentStreak);
      } else if (result === 'loss') {
        user.stats.losses += 1;
        user.stats.currentStreak = 0;
      } else {
        user.stats.draws += 1;
        user.stats.currentStreak = 0;
      }
      user.countedMatches = [...user.countedMatches, matchId].slice(-200);
      save();
      return cloneSnapshot(username, user);
    }
  };
}
