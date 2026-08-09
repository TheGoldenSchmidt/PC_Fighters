import { useCallback, useState } from 'react';
import type { CheerleaderSelection, DeckSelection } from '@pcf/engine';

const STORAGE_KEY = 'pcf.profile.v1';
const ONBOARDING_KEY = 'pcf.onboarding.v1';

export type ReplaySpeed = 1 | 1.5 | 2;

export interface StoredLoadout {
  deckSelection: DeckSelection;
  cheerleaders: CheerleaderSelection;
  topicId: string;
}

export interface LocalProfileV1 {
  version: 1;
  stats: {
    wins: number;
    losses: number;
    draws: number;
    currentStreak: number;
    bestStreak: number;
  };
  lastLoadouts: Record<string, StoredLoadout>;
  onboarding: {
    mulligan: boolean;
    firstTurn: boolean;
    combat: boolean;
    shield: boolean;
    skipped: boolean;
  };
  settings: {
    sound: boolean;
    haptics: boolean;
    replaySpeed: ReplaySpeed;
  };
  countedMatches: string[];
}

export interface ProfileRepository {
  load(): LocalProfileV1;
  save(profile: LocalProfileV1): void;
}

export function defaultProfile(): LocalProfileV1 {
  return {
    version: 1,
    stats: { wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0 },
    lastLoadouts: {},
    onboarding: {
      mulligan: false,
      firstTurn: false,
      combat: false,
      shield: false,
      skipped: false
    },
    settings: { sound: true, haptics: true, replaySpeed: 1 },
    countedMatches: []
  };
}

function positiveInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function migrate(raw: unknown): LocalProfileV1 {
  const fallback = defaultProfile();
  if (!raw || typeof raw !== 'object') return fallback;
  const value = raw as Partial<LocalProfileV1>;
  const stats = value.stats ?? fallback.stats;
  const onboarding = value.onboarding ?? fallback.onboarding;
  const settings = value.settings ?? fallback.settings;
  const replaySpeed: ReplaySpeed = [1, 1.5, 2].includes(Number(settings.replaySpeed))
    ? (Number(settings.replaySpeed) as ReplaySpeed)
    : 1;
  return {
    version: 1,
    stats: {
      wins: positiveInt(stats.wins),
      losses: positiveInt(stats.losses),
      draws: positiveInt(stats.draws),
      currentStreak: positiveInt(stats.currentStreak),
      bestStreak: positiveInt(stats.bestStreak)
    },
    lastLoadouts:
      value.lastLoadouts && typeof value.lastLoadouts === 'object' ? value.lastLoadouts : {},
    onboarding: {
      mulligan: Boolean(onboarding.mulligan),
      firstTurn: Boolean(onboarding.firstTurn),
      combat: Boolean(onboarding.combat),
      shield: Boolean(onboarding.shield),
      skipped: Boolean(onboarding.skipped)
    },
    settings: {
      sound: settings.sound !== false,
      haptics: settings.haptics !== false,
      replaySpeed
    },
    countedMatches: Array.isArray(value.countedMatches)
      ? value.countedMatches.filter((id): id is string => typeof id === 'string').slice(-20)
      : []
  };
}

export const localProfileRepository: ProfileRepository = {
  load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const profile = stored ? migrate(JSON.parse(stored)) : defaultProfile();
      const onboarding = localStorage.getItem(ONBOARDING_KEY);
      return onboarding
        ? migrate({ ...profile, onboarding: JSON.parse(onboarding) })
        : profile;
    } catch {
      return defaultProfile();
    }
  },
  save(profile) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      localStorage.setItem(ONBOARDING_KEY, JSON.stringify(profile.onboarding));
    } catch {
      // Volle oder gesperrte Browser-Speicher duerfen das Match nicht stoeren.
    }
  }
};

export function useLocalProfile(repository: ProfileRepository = localProfileRepository) {
  const [profile, setProfile] = useState<LocalProfileV1>(() => repository.load());

  const updateProfile = useCallback(
    (change: (current: LocalProfileV1) => LocalProfileV1) => {
      setProfile((current) => {
        const next = change(current);
        repository.save(next);
        return next;
      });
    },
    [repository]
  );

  const rememberLoadout = useCallback(
    (faction: string, loadout: StoredLoadout) =>
      updateProfile((current) => ({
        ...current,
        lastLoadouts: { ...current.lastLoadouts, [faction]: loadout }
      })),
    [updateProfile]
  );

  const recordMatch = useCallback(
    (matchId: string, result: 'win' | 'loss' | 'draw') =>
      updateProfile((current) => {
        if (current.countedMatches.includes(matchId)) return current;
        const stats = { ...current.stats };
        if (result === 'win') {
          stats.wins += 1;
          stats.currentStreak += 1;
          stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
        } else if (result === 'loss') {
          stats.losses += 1;
          stats.currentStreak = 0;
        } else {
          stats.draws += 1;
          stats.currentStreak = 0;
        }
        return {
          ...current,
          stats,
          countedMatches: [...current.countedMatches, matchId].slice(-20)
        };
      }),
    [updateProfile]
  );

  return { profile, updateProfile, rememberLoadout, recordMatch };
}
