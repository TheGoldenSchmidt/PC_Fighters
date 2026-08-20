import { describe, expect, it } from 'vitest';
import { loadGameData, validateGameData } from '../src/index.js';
import type { IdentityCatalog } from '../src/types.js';

const data = loadGameData();

function validateCatalog(identityCatalog: IdentityCatalog) {
  return validateGameData({
    config: data.config,
    factions: data.factions,
    champions: data.champions,
    topics: data.topics,
    animations: data.defaultClips,
    cardFiles: [{ file: 'cards/alle.json', content: data.cards }],
    identityCatalog
  });
}

describe('Humans-vs.-Animals-Identitätskatalog', () => {
  it('deckt alle Karten und Champs exakt einmal ab', () => {
    expect(data.cards).toHaveLength(423);
    expect(data.identityCatalog.cards).toHaveLength(data.cards.length);
    expect(data.identityCatalog.champions).toHaveLength(data.champions.length);
    expect(new Set(data.identityCatalog.cards.map((entry) => entry.cardId)).size).toBe(data.cards.length);
    expect(new Set(data.identityCatalog.champions.map((entry) => entry.championId)).size).toBe(data.champions.length);
  });

  it('ordnet Humans humanoid/technisch und Animals tierisch ein', () => {
    const creatures = data.identityCatalog.cards.filter((entry) => entry.cardType === 'creature');
    expect(creatures.filter((entry) => entry.side === 'animals')).toHaveLength(162);
    expect(creatures.filter((entry) => entry.side === 'humans')).toHaveLength(156);
    expect(
      creatures
        .filter((entry) => entry.side === 'animals')
        .every((entry) => ['animal', 'animalMachine', 'vehicle'].includes(entry.form))
    ).toBe(true);
    expect(
      creatures
        .filter((entry) => entry.side === 'humans')
        .every((entry) => ['livingHuman', 'undeadHuman', 'humanMachine', 'vehicle'].includes(entry.form))
    ).toBe(true);
    expect(
      data.identityCatalog.champions
        .filter((entry) => entry.side === 'animals')
        .every((entry) => ['animal', 'animalMachine', 'vehicle'].includes(entry.form))
    ).toBe(true);
    expect(
      data.identityCatalog.champions
        .filter((entry) => entry.side === 'humans')
        .every((entry) => ['livingHuman', 'undeadHuman', 'humanMachine', 'vehicle'].includes(entry.form))
    ).toBe(true);
    expect(data.identityCatalog.champions.every((entry) => entry.classIds.length === 2 && entry.rigId.length > 0)).toBe(true);
  });

  it('lehnt fehlende, doppelte und widersprüchliche Identitäten ab', () => {
    const missing = structuredClone(data.identityCatalog);
    missing.cards.pop();
    expect(() => validateCatalog(missing)).toThrow(/fehlt die Identität/);

    const duplicate = structuredClone(data.identityCatalog);
    duplicate.cards.push(structuredClone(duplicate.cards[0]));
    expect(() => validateCatalog(duplicate)).toThrow(/kommt mehrfach vor/);

    const wrongSide = structuredClone(data.identityCatalog);
    const animal = wrongSide.cards.find((entry) => entry.side === 'animals')!;
    animal.side = 'humans';
    expect(() => validateCatalog(wrongSide)).toThrow(/Katalog-Seite/);

    const wrongChampionClass = structuredClone(data.identityCatalog);
    wrongChampionClass.champions[0].classIds = ['guardian', 'solar'];
    expect(() => validateCatalog(wrongChampionClass)).toThrow(/Katalog-Klassen/);
  });

  it('verschiebt die Hundefigur ohne Karten-IDs oder Regeln zu vertauschen', () => {
    expect(data.cardsById.sea_shroom.name).toBe('Der alte Hund');
    expect(data.cardsById.sea_shroom.faction).toBe('guardian');
    expect(data.cardsById.der_alte_hund.name).toBe('Betriebsschwimmer');
    expect(data.cardsById.der_alte_hund.faction).toBe('beastly');
    expect(data.figures.sea_shroom?.cardId).toBe('sea_shroom');
    expect(data.figures.der_alte_hund).toBeUndefined();
  });

  it('enthält in sichtbaren Regeltexten keine alten Seitenbegriffe mehr', () => {
    const visibleText = data.cards.map((card) => card.text ?? '').join('\n');
    expect(visibleText).not.toMatch(
      /Pflanz|\bPlant|Zombie|\bSun\b|Mushroom|Shroom|Wall-Nut|\bPea\b|Vimpire|Lil['’]? Budd/i
    );
  });
});
