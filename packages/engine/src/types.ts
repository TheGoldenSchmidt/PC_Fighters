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
  /** Oberfraktion (z. B. "animals") oder null bei einer Oberfraktion selbst. */
  parent: string | null;
  /** Optional – nur Oberfraktionen tragen heute eine Anzeigefarbe für die UI. */
  color?: string;
  description?: string;
  /** Optionales Design (Farbe) für das kommende UI-Rework. */
  theme?: { color: string };
}

/** Parent-Lookup: fraktion-id → Oberfraktion-id (null = ist selbst Oberfraktion). */
export type FactionTree = Record<string, string | null>;

/** Reichweite eines Effekts über den Fraktionsbaum. */
export type Scope = 'same_sub' | 'same_top' | 'any';

/** Angriffs-/Lebens-Paar (z. B. für Buffs, Skalierung, Wachstum). */
export interface Stat {
  atk: number;
  hp: number;
}

/** Schauplatz einer Partie – rein optisch, wird vom Raum-Ersteller gewählt. */
export interface Topic {
  id: string;
  name: string;
  emoji: string;
  colors: {
    /** CSS-Hintergrund der ganzen Seite (Farbe oder Gradient). */
    background: string;
    /** Füllfarbe der Lane-Slots. */
    lane: string;
    /** Rahmenfarbe der Lane-Slots. */
    laneBorder: string;
    /** Akzentfarbe (Lane-Beschriftung, Hervorhebungen). */
    accent: string;
  };
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

/**
 * Kreatur-Fähigkeiten: parametrisierte, generische Primitive (Daten, keine
 * kartenspezifische Engine-Logik). Analog zu `Effect`, aber für Kreaturen und
 * mit vielen Auslöse-Zeitpunkten (kontinuierlich / beim Ausspielen / Rundenbeginn
 * / Rundenende / im Kampf / beim Tod). Semantik lebt in `abilities.ts`.
 */
export type Ability =
  // Kontinuierliche Skalierung nach Anzahl (ersetzt rudel/kollektiv/schwarm).
  | { kind: 'skalierung'; scope: Scope; per: Stat; cap?: number; includeSelf?: boolean }
  // Aura: dauerhaft (aura_alle/alpha_aura) oder einmaliger Puls beim Ausspielen (brüllen).
  | { kind: 'aura'; scope: Scope; buff: Stat; timing: 'dauerhaft' | 'einmal_beim_ausspielen' }
  // Nachbar-Effekt: schild (+HP), banner (+ATK) an Nachbarn, oder schadensuebernahme
  // (fängt einen tödlichen Treffer für einen Nachbarn im scope ab – einmal pro Spiel).
  | { kind: 'nachbar'; effect: 'schild' | 'banner' | 'schadensuebernahme'; scope: Scope; amount: number }
  // Heilung am Rundenende: Nachbarn oder ganzer scope; optional mehr bei niedriger Basis.
  | { kind: 'heilung'; scope: Scope; reichweite: 'nachbarn' | 'scope'; amount: number; mehrWennBasisUnter?: { schwelle: number; amount: number } }
  // Rundenwachstum, dauerhaft stapelnd, zu Beginn deiner Runde (ersetzt schicht).
  | { kind: 'wachstum'; per_round: Stat; ziel?: 'selbst' | 'verbuendeter'; scope?: Scope }
  // Verstärkt Rundenwachstum verbündeter Karten (Betriebsrat).
  | { kind: 'verstaerker'; ziel: 'wachstum'; scope: Scope; faktor: number }
  // Todes-Rettung, einmal pro Spiel (ersetzt zaeh/neun_leben/haeutung).
  | { kind: 'rettung'; mode: 'survive_1hp' | 'revive_1hp' | 'full_heal' }
  // Einmalig +X/+Y, wenn die Karte eine volle Runde überlebt.
  | { kind: 'ueberstunden'; bonus: Stat }
  // Ausrüstung: gibt genau einer anderen Karte gleicher Sub-Fraktion +X ATK
  // (springt beim Tod des Trägers automatisch weiter — dynamisch berechnet).
  | { kind: 'werkzeug'; atk: number }
  // Bonus abhängig von der eigenen Basis-HP (Schwellen- oder Pro-fehlende-HP-Modus).
  | { kind: 'improvisation'; scope: Scope; mode: 'schwelle' | 'pro_fehlende_hp'; bonus: Stat; schwelle?: number; proHp?: number }
  // Dauerhaft +X/+Y, wenn eine Kreatur stirbt (trigger any/own/enemy).
  | { kind: 'sammeln'; bonus: Stat; trigger: 'any' | 'own' | 'enemy' }
  // Ziehe n Karten (beim Ausspielen; proRunde = jede Runde).
  | { kind: 'lernen'; n: number; proRunde?: boolean }
  // Erzeugt x Wissens-Marker im spielerweiten Pool (proRunde = jede Runde).
  | { kind: 'wissen'; x: number; proRunde?: boolean }
  // Verbraucht Wissens-Marker; Schaden auf Gegner und/oder Selbst-Buff je Marker.
  | { kind: 'experiment'; schadenProMarker?: number; proMarker?: Stat }
  // Bonus/Effekt, solange die Karte allein in ihrer Lane steht (solo).
  | { kind: 'neugier'; bonus?: Stat; basisschaden?: number; wucht?: boolean }
  // Senkt ATK eines/aller Gegner (oder setzt Gift), beim Ausspielen.
  | { kind: 'umverteilung'; menge: number; schwelle?: number; ziel: 'einer' | 'alle'; art?: 'atk' | 'gift'; dauer?: 'dauerhaft' | 'runde' }
  // +X/+Y, wenn die Karte in ihrer Runde nicht angreift.
  | { kind: 'kaltbluetig'; bonus: Stat }
  // Fügt Angreifern x Schaden zu.
  | { kind: 'dornen'; x: number }
  // Beim Ausspielen x Schaden auf ein Ziel.
  | { kind: 'sturzflug'; x: number }
  // Überschussschaden im Kampf (ATK − Verteidiger-HP) trifft die Basis.
  | { kind: 'wucht' }
  // Immun gegen Zerstörungs-/Entfernungseffekte; nur im Kampf besiegbar.
  | { kind: 'urgewalt' }
  // Gift: setzt Giftmarken; jede Marke macht `staerke` Schaden pro Kampf, bleibt bestehen.
  | { kind: 'gift'; staerke: number }
  // Beschwört Token beim Ausspielen oder beim Tod (Token erben die Sub-Fraktion).
  | { kind: 'beschwoeren'; timing: 'beim_ausspielen' | 'beim_tod'; count: number; token: TokenDef }
  // Ziel-Gegner verliert die angegebenen Keywords (z. B. fliegend/flink).
  | { kind: 'entwaffnen'; entfernt: string[] }
  // Beim Tod: der Angreifer (Gegner in derselben Lane) verliert X ATK.
  | { kind: 'todesfluch'; atk: number }
  // Beim Angriff: zerstöre einen Gegner mit ≤ maxHp Leben.
  | { kind: 'hinrichten'; maxHp: number };

export interface CreatureCard {
  id: string;
  name: string;
  faction: string;
  type: 'creature';
  cost: number;
  attack: number;
  health: number;
  keywords: string[];
  /** Parametrisierte Primitive (siehe `Ability` / `abilities.ts`). */
  abilities?: Ability[];
  signature?: boolean;
  /** Emoji, das beim Angriff als Projektil fliegt (z. B. "🗡️"). */
  projectile?: string;
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
  topics: Topic[];
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
  /** Kopie der Karten-Fähigkeiten (parametrisierte Primitive). */
  abilities: Ability[];
  baseAttack: number;
  baseMaxHealth: number;
  /** Dauerhafter Lebens-Bonus (Schildwall, Wachstum, Sammeln, Puls …). */
  permHealthBonus: number;
  /** Dauerhafter Angriffs-Bonus (Wachstum, Sammeln, Puls, Umverteilung −). */
  permAttackBonus: number;
  /** Angriffs-Bonus bis zum Rundenende (z. B. "Wilder Instinkt"). */
  tempAttackBonus: number;
  currentHealth: number;
  /** Zuletzt berechnetes Maximum – nötig, um Auren-Änderungen sauber anzuwenden. */
  lastMaxHealth: number;
  exhausted: boolean;
  /** Fliegend: wurde in dieser Flug-Phase schon bewegt? */
  movedThisFlyPhase: boolean;
  isToken: boolean;
  /** Anzahl Giftmarken (Zermürbung durch `gift`), bleibt über Runden bestehen. */
  poison: number;
  /** Hat die Kreatur in ihrer letzten Runde angegriffen? (für `kaltbluetig`). */
  attackedThisRound: boolean;
  /** Runde, in der die Kreatur erzeugt wurde (für `ueberstunden`). */
  spawnRound: number;
  /** `ueberstunden` bereits ausgelöst? */
  ueberstundenDone: boolean;
  /** Todes-Rettung (`rettung`) bereits verbraucht? */
  rettungUsed: boolean;
  /** Schadensübernahme (`nachbar` schadensuebernahme) bereits verbraucht? */
  schutzUsed: boolean;
}

export interface PlayerState {
  faction: string;
  deck: string[];
  hand: string[];
  base: number;
  energy: number;
  /** Spielerweiter, spielübergreifend persistenter Wissens-Pool (`wissen`/`experiment`). */
  knowledge: number;
  /** Flug-Phase: Spieler hat "Fertig" gedrückt (oder hat keine fliegenden Kreaturen). */
  flyDone: boolean;
}

export type Phase = 'play' | 'fly' | 'ended';

/**
 * Strukturierte Kampf-Ereignisse am Log-Eintrag – die UI spielt sie als
 * Sequenz ab (Lane für Lane: Projektil, Schaden, Sterbeanimation).
 */
export interface AttackEvent {
  kind: 'attack';
  lane: number;
  attacker: PlayerIndex;
  damage: number;
  /** true = der Angriff ging auf die Basis statt auf eine Kreatur. */
  toBase: boolean;
}

export interface DeathEvent {
  kind: 'death';
  lane: number;
  /** Besitzer der zerstörten Kreatur. */
  owner: PlayerIndex;
}

export type CombatEvent = AttackEvent | DeathEvent;

/**
 * Zauber-Ereignis einer Aktionskarte – die UI spielt es als kurzen Effekt auf
 * der Ziel-Lane ab (Schild-Glühen, Funken, Staub …). Kreaturen brauchen kein
 * eigenes Event: ihr Erscheinen löst die Spawn-Animation über die neue uid aus.
 */
export interface SpellEvent {
  kind: 'spell';
  lane: number;
  /** Welche Art Effekt gespielt wird (bestimmt Farbe/Form der Animation). */
  effect: 'buff' | 'attackBuff' | 'summon' | 'move';
  /** Fraktion des Ausspielenden – färbt den Effekt ein. */
  faction: string;
}

/** Alles, was als strukturiertes Ereignis an einem Log-Eintrag hängen kann. */
export type LogEvent = CombatEvent | SpellEvent;

export interface LogEntry {
  /** Fortlaufende Nummer über die ganze Partie (stabil trotz gekürzter Sicht). */
  id: number;
  round: number;
  text: string;
  event?: LogEvent;
}

export interface GameState {
  config: GameConfig;
  /** Fraktionsbaum (parent-Lookup), damit scope=same_top ohne GameData auflösbar ist. */
  factionTree: FactionTree;
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
  /** Fähigkeiten (für die künftige UI-Anzeige; heute optional genutzt). */
  abilities: Ability[];
  /** Aktuelle Giftmarken (für Anzeige). */
  poison: number;
  attack: number;
  baseAttack: number;
  health: number;
  maxHealth: number;
  baseMaxHealth: number;
  exhausted: boolean;
  canFly: boolean;
  /** Emoji des Angriffs-Projektils (aus der Kartendatei, optional). */
  projectile?: string;
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
