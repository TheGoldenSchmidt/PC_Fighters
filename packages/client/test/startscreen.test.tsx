import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ladeAktiveDecks, loadGameData } from '@pcf/engine';
import { StartScreen } from '../src/StartScreen';
import { defaultProfile } from '../src/profile';

const data = loadGameData();
const decks = ladeAktiveDecks(data);

describe('Champ-Auswahl', () => {
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
          champions: data.champions,
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

  it('startet mit dem gewählten Champ und dessen passendem Deck', async () => {
    const onCreate = vi.fn();
    render(
      <StartScreen
        status="connected"
        profile={defaultProfile()}
        account={null}
        accountBusy={false}
        onLogin={async () => false}
        onLogout={() => {}}
        onSaveAccountDeck={async () => false}
        onRememberLoadout={() => {}}
        onCreate={onCreate}
        onJoin={() => {}}
      />
    );

    const champion = data.champions[1];
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(champion.name) }));
    const [deckId] = Object.entries(decks).find(([, deck]) => deck.championId === champion.id)!;
    const start = screen.getByRole('button', { name: 'Partie erstellen' });
    await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(start);
    expect(onCreate).toHaveBeenCalledWith(
      expect.any(String), { kind: 'preset', id: deckId }, champion.id, data.topics[0].id, false
    );
  });
});
