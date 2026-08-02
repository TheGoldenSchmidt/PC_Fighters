import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ladeDecks,
  loadGameData,
  wiederholeReplay,
  type PartieReplay
} from '../src/index.js';

const artifact = process.env.PCF_REPLAY_ARTIFACT;

describe('gespeichertes Balancing-Replay', () => {
  it.runIf(Boolean(artifact))('ist Schritt fuer Schritt reproduzierbar', () => {
    const file = JSON.parse(readFileSync(artifact!, 'utf8')) as {
      deckA: string;
      deckB: string;
      replay: PartieReplay;
    };
    const data = loadGameData();
    const decks = ladeDecks(data);
    const result = wiederholeReplay(data, decks[file.deckA], decks[file.deckB], file.replay);
    expect(result.korrekt, JSON.stringify(result)).toBe(true);
  });
});
