import { beforeEach, describe, expect, it } from 'vitest';
import { defaultProfile, localProfileRepository } from '../src/profile';

describe('lokales Profil', () => {
  beforeEach(() => localStorage.clear());

  it('fällt bei beschädigten Werten sicher auf Defaults zurück', () => {
    localStorage.setItem('pcf.profile.v1', '{kaputt');
    expect(localProfileRepository.load()).toEqual(defaultProfile());
  });

  it('migriert Teilwerte und begrenzt ungültige Zahlen und Replay-Stufen', () => {
    localStorage.setItem(
      'pcf.profile.v1',
      JSON.stringify({
        version: 0,
        stats: { wins: 3.8, losses: -4, draws: 2, currentStreak: 1, bestStreak: 7 },
        settings: { sound: false, haptics: true, replaySpeed: 9 },
        onboarding: { mulligan: true }
      })
    );

    const profile = localProfileRepository.load();
    expect(profile.version).toBe(1);
    expect(profile.stats.wins).toBe(3);
    expect(profile.stats.losses).toBe(0);
    expect(profile.settings).toEqual({ sound: false, haptics: true, replaySpeed: 1 });
    expect(profile.onboarding.mulligan).toBe(true);
    expect(profile.onboarding.firstTurn).toBe(false);
  });

  it('speichert Onboarding zusätzlich unter dem vereinbarten Versionsschlüssel', () => {
    const profile = defaultProfile();
    profile.onboarding.mulligan = true;
    localProfileRepository.save(profile);
    expect(JSON.parse(localStorage.getItem('pcf.onboarding.v1') ?? '{}').mulligan).toBe(true);
  });
});
