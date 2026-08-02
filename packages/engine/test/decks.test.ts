// Sicherheitsnetz während der gesamten Balancing-Phase: jede Deck-Datei unter
// data/decks/ muss ein gültiges Deck sein (Größe, Kopienlimits, Fraktionsregel).
// ladeDecks() wirft bereits DeckError beim Laden - dieser Test macht das
// Ergebnis nur explizit sichtbar und prüft die Grunddaten je Deck.

import { describe, expect, it } from 'vitest';
import { ladeDecks, loadGameData } from '../src/index.js';

const data = loadGameData();

describe('Backtest-Testdecks (data/decks/)', () => {
  const decks = ladeDecks(data);

  it('mindestens ein Deck ist vorhanden', () => {
    expect(Object.keys(decks).length).toBeGreaterThan(0);
  });

  for (const [id, deck] of Object.entries(ladeDecks(data))) {
    it(`${id}: genau ${data.config.deckbuilding.size} Karten, gültige Fraktion, Name gesetzt`, () => {
      const total = deck.cards.reduce((sum, c) => sum + c.count, 0);
      expect(total).toBe(data.config.deckbuilding.size);
      expect(deck.name).toBeTruthy();
      expect(deck.faction).toBeTruthy();
    });
  }

  it('jedes Deck besteht aus Karten genau einer Oberfraktion (singleTop)', () => {
    // ladeDecks() hätte sonst schon beim Laden eine DeckError geworfen -
    // dieser Test dokumentiert die Erwartung explizit und bricht den Testlauf
    // mit einer klaren Fehlermeldung, statt nur beim Import zu crashen.
    expect(() => ladeDecks(data)).not.toThrow();
    expect(Object.keys(decks).sort()).toEqual(
      [
        'a1_rudeljaeger',
        'a2_luftangriff',
        'a3_gift_urgewalt',
        'a4_urzeitliches_rudel',
        'forschung_muskelkraft',
        'h1_solidaritaet',
        'h2_schicht',
        'h3_campus'
        ,'rudeljaeger'
        ,'solidaritaet_ueberleben'
        ,'urzeitliche_kolosse'
      ].sort()
    );
  });
});
