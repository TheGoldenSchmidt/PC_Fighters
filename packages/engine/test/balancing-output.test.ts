import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runBalancing } from '../../../scripts/balancing/run.js';

const externalOutput = process.env.PCF_BALANCING_OUTPUT;
const temp = externalOutput ?? mkdtempSync(join(tmpdir(), 'pcf-balancing-'));

afterAll(() => {
  if (!externalOutput) rmSync(temp, { recursive: true, force: true });
});

describe('Balancing-Berichtsausgabe', () => {
  it('erzeugt den vollstaendigen Export fuer alle sechs Alpha-Matchups', async () => {
    const output = await runBalancing([
      '--mode=full',
      `--games=${process.env.PCF_BALANCING_GAMES ?? '1'}`,
      '--no-mirrors',
      `--workers=${process.env.PCF_BALANCING_WORKERS ?? '1'}`,
      `--out=${temp}`
    ]);
    for (const file of [
      'summary.json',
      'matches.jsonl',
      'deck_matchups.csv',
      'card_statistics.csv',
      'round_statistics.csv',
      'match_statistics.csv',
      'pc_principal_statistics.csv',
      'lane_statistics.csv',
      'anomalies.json',
      'report.md'
    ]) expect(existsSync(join(output, file)), file).toBe(true);
    const summary = JSON.parse(readFileSync(join(output, 'summary.json'), 'utf8')) as {
      totalMatches: number;
      activeDecks: string[];
      matchups: unknown[];
    };
    expect(summary.activeDecks).toHaveLength(4);
    expect(summary.totalMatches).toBe(12 * Number(process.env.PCF_BALANCING_GAMES ?? '1'));
    expect(summary.matchups).toHaveLength(12);
  }, 900_000);

  it('erzeugt valide PC-Principal-Vergleichsserien', async () => {
    if (externalOutput) return;
    const output = await runBalancing([
      '--mode=pc',
      '--games=1',
      '--no-mirrors',
      '--workers=1',
      `--out=${join(temp, 'pc-series')}`
    ]);
    const summary = JSON.parse(readFileSync(join(output, 'summary.json'), 'utf8')) as {
      totalMatches: number;
      deckContracts: Record<string, { heroes: number; principals: number; pcPrincipal: boolean }>;
    };
    expect(summary.totalMatches).toBe(48);
    for (const [id, contract] of Object.entries(summary.deckContracts)) {
      expect(contract.principals, id).toBe(id.endsWith('__mit_pc') ? 1 : 0);
      expect(contract.pcPrincipal, id).toBe(id.endsWith('__mit_pc'));
    }
    expect(readFileSync(join(output, 'card_statistics.csv'), 'utf8')).toContain('pc_principal');
    expect(readFileSync(join(output, 'pc_principal_statistics.csv'), 'utf8')).toContain('boardValueRemoved');
    expect(readFileSync(join(output, 'report.md'), 'utf8')).toContain('PC Principal');
  }, 120_000);
});
