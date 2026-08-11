import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ladeAktiveDecks, loadGameData } from '@pcf/engine';
import { StartScreen } from '../src/StartScreen';
import { defaultProfile } from '../src/profile';

const data = loadGameData();
const decks = ladeAktiveDecks(data);

describe('Cheerleader-Auswahl', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({
          factions: data.factions,
          topics: data.topics,
          cards: data.cards,
          deckbuilding: data.config.deckbuilding,
          cheerleaders: data.config.cheerleaders,
          decks,
          deckStatus: {
            active: Object.keys(decks),
            allowCustomDecks: true,
            disabledReason: ''
          }
        })
      }))
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('zeigt die Schildblock-Kraft statt der normalen Kartenfähigkeit', async () => {
    render(
      <StartScreen
        status="connected"
        profile={defaultProfile()}
        onRememberLoadout={() => {}}
        onCreate={() => {}}
        onJoin={() => {}}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: /Menschen Emblem Menschen/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ausrüstung ändern' }));

    expect(await screen.findByText(/Machtwort: Wenn dein Schild blockt:/)).toBeTruthy();
    expect(screen.queryByText(/Beim Ausspielen: Peinige alle gegnerischen Kreaturen/)).toBeNull();
    expect(screen.getByText(/Dieselbe Figur darf gleichzeitig im Deck und auf der Bank stehen/)).toBeTruthy();
  });
});
