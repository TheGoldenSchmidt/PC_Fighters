// Zentrale Typen der Engine. Die Engine kennt weder Netzwerk noch UI:
// sie bekommt einen Zustand + eine Aktion und liefert den neuen Zustand.

export type PlayerIndex = 0 | 1;

export interface GameConfig {
  lanes: number;
  baseHealth: number;
  deckSize: number;
  startingHand: number;
  cardsDrawnPerTurn: number;
  energyCap: number;
  roundLimit: number;
  maxCopiesPerCard: number;
}

export interface Faction {
  id: string;
  name: string;
  color: string;
  description: string;
}

export interface TokenDef {
  name: string;
  attack: number;
  health: number;
  keywords: string[];
}

export type Effect =
  | { kind: 'buffHealth'; amount: number; target: 'friendlyCreature' }
  | { kind: 'buffAttackTemp'; amount: number; target: 'friendlyCreature' }
  | { kind: 'summon'; count: number; token: TokenDef }
  | { kind: 'moveCreature'; target: 'friendlyCreature' };

export interface CreatureCard {
  id: string;
  name: string;
  faction: string;
  type: 'creature';
  cost: number;
  attack: number;
  health: number;
  keywords: string[];
  signature?: boolean;
  text?: string;
}

export interface ActionCard {
  id: string;
  name: string;
  faction: string;
  type: 'action';
  cost: number;
  effect: Effect;
  signature?: boolean;
  text?: string;
}

export type CardDef = CreatureCard | ActionCard;

export interface GameData {
  config: GameConfig;
  factions: Faction[];
  cards: CardDef[];
  cardsById: Record<string, CardDef>;
}

// Eine Kreatur auf dem Spielfeld.
export interface Creature {
  uid: number;
  cardId: string;
  name: string;
  faction: string;
  keywords: string[];
  baseAttack: number;
  baseMaxHealth: number;
  /** Dauerhafter Lebens-Bonus (z. B. durch "Schildwall"). */
  permHealthBonus: number;
  /** Angriffs-Bonus bis zum Rundenende (z. B. "Wilder Instinkt"). */
  tempAttackBonus: number;
  currentHealth: number;
  /** Zuletzt berechnetes Maximum – nötig, um Auren-Änderungen sauber anzuwenden. */
  lastMaxHealth: number;
  exhausted: boolean;
  /** Fliegend: wurde in dieser Flug-Phase schon bewegt? */
  movedThisFlyPhase: boolean;
  isToken: boolean;
}

export interface PlayerState {
  faction: string;
  deck: string[];
  hand: string[];
  base: number;
  energy: number;
  /** Flug-Phase: Spieler hat "Fertig" gedrückt (oder hat keine fliegenden Kreaturen). */
  flyDone: boolean;
}

export type Phase = 'play' | 'fly' | 'ended';

export interface LogEntry {
  round: number;
  text: string;
}

export interface GameState {
  config: GameConfig;
  round: number;
  phase: Phase;
  startingPlayer: PlayerIndex;
  active: PlayerIndex;
  consecutivePasses: number;
  players: [PlayerState, PlayerState];
  /** board[spieler][lane] – pro Lane maximal eine Kreatur pro Spieler. */
  board: (Creature | null)[][];
  log: LogEntry[];
  winner: PlayerIndex | 'draw' | null;
  uidCounter: number;
}

export type PlayerAction =
  | { type: 'playCreature'; handIndex: number; lane: number }
  | { type: 'playAction'; handIndex: number; targetLane?: number; toLane?: number }
  | { type: 'pass' }
  | { type: 'flyMove'; fromLane: number; toLane: number }
  | { type: 'flyDone' };

// ---- Client-Sicht (gefiltert, wird vom Server an die Clients geschickt) ----

export interface CreatureView {
  uid: number;
  cardId: string;
  name: string;
  keywords: string[];
  attack: number;
  baseAttack: number;
  health: number;
  maxHealth: number;
  baseMaxHealth: number;
  exhausted: boolean;
  canFly: boolean;
  text?: string;
}

export interface PlayerPublicView {
  faction: string;
  base: number;
  energy: number;
  deckCount: number;
  handCount: number;
  flyDone: boolean;
}

export interface ClientView {
  you: PlayerIndex;
  round: number;
  roundLimit: number;
  lanes: number;
  energyCap: number;
  phase: Phase;
  active: PlayerIndex;
  winner: PlayerIndex | 'draw' | null;
  players: [PlayerPublicView, PlayerPublicView];
  hand: CardDef[];
  board: (CreatureView | null)[][];
  log: LogEntry[];
}
