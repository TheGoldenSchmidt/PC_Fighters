import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildVisualCatalog, ladeAktiveDecks, loadGameData } from '../src/index.js';

const data = loadGameData();
const catalog = buildVisualCatalog(data);
const source = (id: string) => JSON.parse(readFileSync(new URL(`../../../tools/figuren-viewer/standalone-figures/${id}.json`, import.meta.url), 'utf8'));

describe('Freigegebene Figuren im Spiel', () => {
  it('enthält Cartman und The Coon gemeinsam im gültigen South-Park-Starterdeck', () => {
    const deck = ladeAktiveDecks(data).rostbolzen;
    expect(deck.cards.find(c => c.cardId === 'alpha_eric_cartman')?.count).toBe(1);
    expect(deck.cards.find(c => c.cardId === 'alpha_the_coon')?.count).toBe(1);
    expect(deck.cards.reduce((sum, c) => sum + c.count, 0)).toBe(40);
  });
  it('unterscheidet Eric Cartman von The Coon und benennt Rick Sanchez korrekt', () => {
    expect(data.cardsById.alpha_eric_cartman.name).toBe('Eric Cartman');
    expect(data.cardsById.alpha_the_coon.name).toContain('The Coon');
    expect(data.cardsById.alpha_rick_prime.name).toBe('Rick Sanchez');
    expect(catalog.cards.alpha_eric_cartman.visual).not.toEqual(catalog.cards.alpha_the_coon.visual);
  });
  it.each([
    ['alpha_rick_prime', 'rick_sanchez_3'],
    ['alpha_eric_cartman', 'eric_cartman_3'],
    ['alpha_the_coon', 'the_coon'],
    ['alpha_korvo', 'korvo_3'],
    ['alpha_vogelmensch', 'vogelmensch_2'],
    ['vogelmensch', 'vogelmensch_2'],
    ['alpha_pupa', 'pupa_2']
  ])('liefert %s mit der freigegebenen Figur %s an den Client', (cardId, modelId) => {
    const figure = source(modelId);
    expect(catalog.cards[cardId].visual).toEqual(figure.visual);
    expect(catalog.cards[cardId].animations).toEqual(figure.animations);
  });
});
