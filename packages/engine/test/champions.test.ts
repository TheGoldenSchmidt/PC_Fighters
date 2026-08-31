import { describe, expect, it } from 'vitest';
import {
  applyAction,
  basisSchaden,
  buildClientView,
  createGame,
  createSeededRandom,
  ladeDecks,
  loadGameData,
  spielePartie,
  validateDeck
} from '../src/index.js';

const data = loadGameData();
const decks = ladeDecks(data);

function championGame() {
  return createGame(
    data,
    ['wall_halla', 'rostbolzen'],
    createSeededRandom(42),
    [decks.wall_halla, decks.rostbolzen]
  );
}

describe('Humans-vs-Animals-Kartenset', () => {
  it('lädt 401 Deckkarten, 22 Superkräfte, acht Klassen und sechs Champs', () => {
    expect(data.cards.filter((card) => card.deckable !== false)).toHaveLength(401);
    expect(data.cards.filter((card) => card.type === 'superpower')).toHaveLength(22);
    expect(data.factions.filter((faction) => faction.parent === 'animals' || faction.parent === 'humans')).toHaveLength(8);
    expect(data.champions).toHaveLength(6);
  });

  it('behält jede Karte mit 3D-Figur als Kreatur', () => {
    for (const cardId of Object.keys(data.figures)) {
      expect(data.cardsById[cardId]?.type, cardId).toBe('creature');
    }
  });

  it('liefert pro Champ ein valides 40-Karten-Deck aus beiden Klassen', () => {
    expect(Object.keys(decks)).toHaveLength(6);
    for (const champion of data.champions) {
      const deck = decks[champion.id];
      expect(() => validateDeck(deck, data), champion.id).not.toThrow();
      expect(deck.cards.reduce((sum, entry) => sum + entry.count, 0)).toBe(40);
      expect(deck.championId).toBe(champion.id);
      for (const classId of champion.classes) {
        expect(deck.cards.some((entry) => data.cardsById[entry.cardId]?.faction === classId)).toBe(true);
      }
      expect(Math.max(...deck.cards.map((entry) => entry.count))).toBeLessThanOrEqual(4);
    }
  });

  it('weist fremde Klassen und Superkräfte im Deck zurück', () => {
    const invalid = structuredClone(decks.wall_halla);
    invalid.cards[0] = { cardId: decks.rostbolzen.cards[0].cardId, count: invalid.cards[0].count };
    expect(() => validateDeck(invalid, data)).toThrow(/gehört nicht zu den Klassen/);

    const power = data.champions[0].superpowers[0];
    invalid.cards[0] = { cardId: power, count: 4 };
    expect(() => validateDeck(invalid, data)).toThrow(/Superkraft/);
  });
});

describe('Champ-Partie', () => {
  it('lässt zwei neue Starterdecks deterministisch bis zu einem Ergebnis durchspielen', () => {
    const first = spielePartie(data, decks.sonnenfackel, decks.super_brainz, { saat: 73 });
    const second = spielePartie(data, decks.sonnenfackel, decks.super_brainz, { saat: 73 });
    expect(first.gewinner).not.toBeNull();
    expect(first.runden).toBeGreaterThan(0);
    expect(first.gewinner).toBe(second.gewinner);
    expect(first.runden).toBe(second.runden);
  });

  it('startet mit 20 Leben, einer Superkraft und drei verfügbaren Superblocks', () => {
    const state = championGame();
    expect(state.config.lanes).toBe(5);
    expect(state.config.handLimit).toBe(10);
    expect(state.players[0].base).toBe(20);
    expect(state.players[0].hand).toHaveLength(5);
    expect(state.players[0].hand.filter((id) => data.cardsById[id]?.type === 'superpower')).toHaveLength(1);
    expect(state.players[0].superpowersRemaining).toHaveLength(3);
    expect(state.players[0].cheerleaders).toEqual(state.config.schild?.cheerleaders);
    expect(state.players[0].cheerleaderPowers).toEqual(state.players[0].superpowersRemaining);
    expect(state.players[0].blocksRemaining).toBe(3);
    expect(state.teamBoard?.[0]).toHaveLength(5);
    expect(state.environments).toHaveLength(5);
  });

  it('beginnt nach zwei Pässen sofort den Kampf, ohne zweites Aktionsfenster', () => {
    let state = championGame();
    state = applyAction(state, 0, { type: 'mulligan', handIndices: [] }, data);
    state = applyAction(state, 1, { type: 'mulligan', handIndices: [] }, data);
    const round = state.round;
    state = applyAction(state, state.active, { type: 'pass' }, data);
    state = applyAction(state, state.active, { type: 'pass' }, data);
    expect(state.round).toBe(round + 1);
    expect(state.phase).toBe('play');
    expect(state.log.some((entry) => entry.text.includes('letzte Aktionsphase'))).toBe(false);
  });

  it('deckt Front- und Team-Up-Grabsteine erst nach dem zweiten Pass direkt vor Angriffen auf', () => {
    let state = championGame();
    state.phase = 'play';
    state.active = 0;
    const gravestones = data.cards.filter(
      (card) => card.type === 'creature' && card.keywords.includes('gravestone')
    );
    expect(gravestones.length).toBeGreaterThan(0);
    const card = gravestones[0];
    state.players[0].energy = 20;
    state.players[0].hand = [card.id];
    state = applyAction(state, 0, { type: 'playCreature', handIndex: 0, lane: 1 }, data);
    const rear = structuredClone(state.board[0][1]!);
    rear.uid = ++state.uidCounter;
    state.teamBoard![0][1] = rear;
    state.board[0][1]!.exhausted = true;
    state.teamBoard![0][1]!.exhausted = true;

    state = applyAction(state, state.active, { type: 'pass' }, data);
    expect(state.board[0][1]?.faceDown).toBe(true);
    expect(state.teamBoard?.[0][1]?.faceDown).toBe(true);
    state = applyAction(state, state.active, { type: 'pass' }, data);

    const events = state.log.flatMap((entry) => entry.event ? [entry.event] : []);
    const revealIndices = events.flatMap((event, index) => event.kind === 'reveal' ? [index] : []);
    const firstAttack = events.findIndex((event) => event.kind === 'attack');
    expect(revealIndices).toHaveLength(2);
    expect(events.filter((event) => event.kind === 'reveal').map((event) =>
      event.kind === 'reveal' ? event.teamSlot : false
    )).toEqual([false, true]);
    expect(firstAttack === -1 || Math.max(...revealIndices) < firstAttack).toBe(true);
  });

  it('setzt Wasser-, Team-Up- und Environment-Lanes durch', () => {
    let state = championGame();
    state.phase = 'play';
    state.active = 0;
    state.players[0].energy = 20;
    state.players[0].hand = ['baer'];
    expect(() => applyAction(state, 0, { type: 'playCreature', handIndex: 0, lane: 4 }, data)).toThrow(/amphibisch/);

    state.players[0].hand = ['sting_bean'];
    state = applyAction(state, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    state.active = 0;
    state.players[0].hand = ['baer'];
    state = applyAction(state, 0, { type: 'playCreature', handIndex: 0, lane: 0 }, data);
    expect(state.board[0][0]?.cardId).toBe('sting_bean');
    expect(state.teamBoard?.[0][0]?.cardId).toBe('baer');

    const environment = data.cards.find((card) => card.type === 'environment');
    expect(environment).toBeTruthy();
    state.active = 0;
    state.players[0].hand = [environment!.id];
    state.players[0].energy = 20;
    state = applyAction(state, 0, { type: 'playEnvironment', handIndex: 0, lane: 2 }, data);
    expect(state.environments?.[2]).toEqual({ cardId: environment!.id, owner: 0 });
  });

  it('lässt beim Superblock die auf Cheerleader verteilte Kraft wählen und kennt Bullseye', () => {
    let state = championGame();
    state.phase = 'play';
    state.active = 1;
    state.players[0].hand = [];
    state.players[0].schild = 7;
    const damageAction = data.cards.find(
      (card) => card.type === 'action' && /\d+\s+Schaden/i.test(card.text ?? '')
    );
    expect(damageAction).toBeTruthy();
    state.players[1].hand = [damageAction!.id];
    state.players[1].energy = 20;
    const remaining = state.players[0].superpowersRemaining!.length;
    const selectedPower = state.players[0].cheerleaderPowers![1]!;
    const selectedCarrier = state.players[0].cheerleaders[1];
    state = applyAction(state, 1, { type: 'playAction', handIndex: 0, targetLane: 0 }, data);
    expect(state.players[0].base).toBe(20);
    expect(state.players[0].blocksRemaining).toBe(2);
    expect(state.players[0].superpowersRemaining).toHaveLength(remaining);
    expect(state.reaktion?.spieler).toBe(0);
    const ownView = buildClientView(state, 0, data);
    const opponentView = buildClientView(state, 1, data);
    expect(ownView.reaktion?.angebote).toHaveLength(3);
    expect(ownView.reaktion?.angebote[1]).toMatchObject({
      slot: 1,
      cardId: selectedCarrier,
      kraft: data.cardsById[selectedPower].name
    });
    expect(opponentView.reaktion?.angebote).toEqual([]);

    state = applyAction(state, 0, {
      type: 'cheerleaderReaction',
      reactionId: state.reaktion!.id,
      slot: 1
    }, data);
    expect(state.players[0].superpowersRemaining).toHaveLength(remaining - 1);
    expect(state.players[0].hand).toContain(selectedPower);
    expect(state.players[0].cheerleaders[1]).toBeNull();
    expect(state.players[0].cheerleaderPowers![1]).toBeNull();
    expect(data.cardsById[selectedPower].cost).toBe(1);
    expect(buildClientView(state, 0, data).hand.find((card) => card.id === selectedPower)?.cost).toBe(0);
    expect(state.reaktion).toBeNull();

    const shield = state.players[0].schild;
    expect(basisSchaden(state, 0, 2, { bullseye: true })).toBe(2);
    expect(state.players[0].schild).toBe(shield);
  });

  it('liefert Lane-Arten, Champ-Daten, Team-Slots und Umgebungen an den Client', () => {
    const view = buildClientView(championGame(), 0, data);
    expect(view.laneKinds).toEqual(['height', 'ground', 'ground', 'ground', 'water']);
    expect(view.players[0].championId).toBe('wall_halla');
    expect(view.players[0].classes).toEqual(['guardian', 'solar']);
    expect(view.teamBoard[0]).toHaveLength(5);
    expect(view.environments).toHaveLength(5);
  });

  it('hält gegnerische Grabsteine auch im Team-Up-Slot geheim', () => {
    let state = championGame();
    const gravestone = data.cards.find(
      (card) => card.type === 'creature' && card.keywords.includes('gravestone')
    );
    expect(gravestone).toBeTruthy();
    state.phase = 'play';
    state.active = 1;
    state.players[1].energy = 20;
    state.players[1].hand = [gravestone!.id];
    state = applyAction(state, 1, { type: 'playCreature', handIndex: 0, lane: 1 }, data);
    state.teamBoard![1][1] = state.board[1][1];
    state.board[1][1] = null;

    const opponentView = buildClientView(state, 0, data);
    const ownerView = buildClientView(state, 1, data);
    expect(opponentView.teamBoard[1][1]?.cardId).toBe('hidden:gravestone');
    expect(ownerView.teamBoard[1][1]?.cardId).toBe(gravestone!.id);
  });
});
