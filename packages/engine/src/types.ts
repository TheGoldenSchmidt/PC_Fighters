// Zentrale Typen der Engine. Die Engine kennt weder Netzwerk noch UI:
// sie bekommt einen Zustand + eine Aktion und liefert den neuen Zustand.

export type PlayerIndex = 0 | 1;

export interface EnergyConfig {
  start: number;
  perRound: number;
  /** null = ungedeckelt (Runde n = start + (n-1)*perRound Energie). */
  cap: number | null;
}

export type FactionRule = 'singleTop' | 'singleSub' | 'free';

export interface DeckbuildingConfig {
  size: number;
  maxCopies: number;
  /** Kopiengrenze für Signature-Karten (★). Ohne Angabe: 1 (Abwärtskompatibilität). */
  maxCopiesSignature?: number;
  /** Wie viele Hero-Karten (category:"hero") ein Deck insgesamt enthalten darf. Ohne Angabe: 2. */
  maxHeroes?: number;
  /** Kopiengrenze je einzelnem Hero. Ohne Angabe: 1 (jeder Hero nur einmal). */
  maxHeroCopies?: number;
  /** Wie viele Principal-Karten (category:"principal") ein Deck enthalten darf. Ohne Angabe: 1. */
  maxPrincipals?: number;
  factionRule: FactionRule;
}

/**
 * Wann eine Cheerleader-Kraft angeboten wird.
 *
 * Es gibt genau einen Auslöser: Die Bank IST der Basis-Schild. Läuft er voll,
 * blockt er den Treffer, und ein Cheerleader opfert sich, um seine Kraft zu
 * wirken. Der Union bleibt als solcher bestehen, damit später weitere Auslöser
 * ohne Umbau der Fenster-Mechanik dazukommen können.
 */
export type CheerleaderAusloeser =
  // Der eigene Basis-Schild hat gerade einen Treffer geblockt.
  'schildBlock';

/**
 * Was eine Cheerleader-Kraft tut.
 *
 * Alle Wirkungen kommen ohne Auslöser-Kreatur aus: Ein Schild-Block hat keine
 * „neue" oder „sterbende" Kreatur, auf die man zielen könnte.
 *
 * Neue Wirkung = Variante hier + Eintrag in CHEERLEADER_WIRKUNGEN
 * (cheerleader.ts) + Zweig im wirkungSchema (schema.ts) + Eintrag in
 * data/config.json.
 */
export type CheerleaderWirkung =
  // Alle gegnerischen Kreaturen bekommen dauerhafte Deckel auf ATK/Leben.
  | { kind: 'peinigenAlle'; atkDeckel: number; hpDeckel: number }
  // Die eigene Basis nimmt bis zum Rundenende keinen Schaden mehr.
  | { kind: 'keinBasisSchaden' }
  // Der Besitzer zieht Karten und erhält Wissen.
  | { kind: 'ziehenUndWissen'; karten: number; wissen: number }
  // x Schaden auf jede gegnerische Kreatur.
  | { kind: 'schadenAlleGegner'; x: number }
  // x Schaden auf JEDE Kreatur im Feld – auch die eigenen.
  | { kind: 'schadenAlle'; x: number }
  // Alle eigenen Kreaturen werden voll geheilt; der Besitzer zieht Karten.
  | { kind: 'heilenUndZiehen'; karten: number }
  // Der Spieler wählt beim Einlösen zwischen zwei Wirkungen (A oder B).
  | {
      kind: 'wahl';
      optionA: { name: string; wirkung: CheerleaderWirkung };
      optionB: { name: string; wirkung: CheerleaderWirkung };
    };

/** Superkraft eines Cheerleaders auf der Bank. */
export interface CheerleaderKraft {
  /** Anzeigename der Kraft (nicht der Kartenname). */
  name: string;
  /** Regeltext für die Bank-Anzeige. */
  text: string;
  ausloeser: CheerleaderAusloeser;
  wirkung: CheerleaderWirkung;
}

/** Datengetriebene Regel für die Mannschaftsbank neben der Arena. */
export interface CheerleaderConfig {
  candidates: string[];
  selectionSize: 3;
  maxInDeck: number;
  /** Alpha-Regel: dieselbe Figur darf als Kartenkopie und Bankfigur vorkommen. */
  allowDeckOverlap?: boolean;
  /**
   * Kraft je Kandidat, Schlüssel ist die cardId. Fehlt ein Eintrag, sitzt der
   * Cheerleader nur dekorativ auf der Bank – die Auswahl bleibt gültig.
   */
  kraefte: Record<string, CheerleaderKraft>;
}

/**
 * Zermürbung (Regelwerk V2): ab Runde `abRunde` verlieren beide Basen am
 * Rundenende Leben – eine echte Spielentscheidung statt eines harten
 * Rundenlimit-Abbruchs. `roundLimit` bleibt daneben als technische Notbremse
 * bestehen (im Normalspiel unerreichbar, siehe config.json-Kommentar).
 */
export interface ZermuerbungConfig {
  abRunde: number;
  schaden: number;
  steigerung: number;
}

/**
 * Schild der Basis: jeder Treffer lädt ihn zufällig um `ladung.min`–`ladung.max`
 * Abschnitte auf. Erreicht er `abschnitte`, wird DIESER Treffer komplett
 * geblockt und der Schild geht auf 0 zurück.
 *
 * Die Bank IST der Schild: Was der Block bewirkt, entscheidet der Cheerleader,
 * der sich dafür opfert (`config.cheerleaders.kraefte`). Ist die Bank leer,
 * gibt es keinen Schild mehr – Treffer gehen dann ungehindert durch.
 */
export interface SchildConfig {
  /** Wie viele Abschnitte der Schild hat (Standard-Regel: 7). */
  abschnitte: number;
  /** Spanne, um die ein Treffer den Schild auflädt (Standard-Regel: 1–3). */
  ladung: { min: number; max: number };
}

export interface GameConfig {
  lanes: number;
  baseHealth: number;
  startingHand: number;
  cardsDrawnPerTurn: number;
  roundLimit: number;
  energy: EnergyConfig;
  deckbuilding: DeckbuildingConfig;
  cheerleaders: CheerleaderConfig;
  /** Optional: ohne sie endet eine Partie nur über roundLimit/Basiszerstörung (V1-Verhalten). */
  zermuerbung?: ZermuerbungConfig;
  /** Optional: ohne sie nimmt die Basis Treffer ungehindert (Verhalten vor dem Schild-Feature). */
  schild?: SchildConfig;
}

/** Deck-Datenstruktur (spielergewählt) – für den kommenden Deck-Editor. */
export interface DeckEntry {
  cardId: string;
  count: number;
}

export interface DeckList {
  /** Optional: Anzeigename (rein informativ, z. B. für Backtest-Reports). */
  name?: string;
  /** Optional: Oberfraktion des Decks (rein informativ). */
  faction?: string;
  cards: DeckEntry[];
}

/** Vom Client gewählte Deckquelle. Presets werden serverseitig aufgelöst. */
export type DeckSelection =
  | { kind: 'preset'; id: string }
  | { kind: 'custom'; deck: DeckList };

/** Geordnete Auswahl; die Reihenfolge entspricht den drei festen Bankplätzen. */
export type CheerleaderSelection = [string, string, string];
/** Ein geopferter Platz bleibt stabil und wird nicht nachbesetzt. */
export type CheerleaderSlots = [string | null, string | null, string | null];

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
  /**
   * Fraktionslose Oberfraktion ("neutral"): Karten darin gehören zu keiner
   * Seite, sind daher in JEDEM Deck erlaubt (die factionRule ignoriert sie) und
   * werden nicht als spielbare Oberfraktion angeboten.
   */
  neutral?: boolean;
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

/** Prozedurale 3D-Umgebung eines Schauplatzes (rein optisch, lane-frei). */
export type EnvironmentKind = 'wald' | 'hoehle' | 'stadt' | 'mond' | 'mars' | 'c137';

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
  /**
   * Optionale prozedurale 3D-Umgebung (Bäume, Höhle, Häuser …), die das
   * Battlefield lane-frei um das Spielfeld herum aufbaut. Fehlt das Feld,
   * bleibt es bei der reinen Farbgebung.
   */
  environment?: EnvironmentKind;
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
  // tempAtkBonus: die bewegte Kreatur erhält zusätzlich bis zum Rundenende +X ATK (Hetzjagd).
  | { kind: 'moveCreature'; target: 'friendlyCreature'; tempAtkBonus?: number }
  // Alle gegnerischen Kreaturen verlieren `amount` ATK bis zum Rundenende (Generalstreik).
  | { kind: 'debuff'; amount: number }
  // Verbraucht bis zu `max` Wissen aus dem eigenen Pool; verteilt
  // `damagePerMarker` Schaden je verbrauchtem Marker auf gegnerische Kreaturen
  // (reihum wie bei der Ability `experiment`, sonst auf die Basis).
  | { kind: 'spendKnowledge'; max: number; damagePerMarker: number };

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
  // maxTargets: begrenzt die Anzahl geheilter Kreaturen (Board-Reihenfolge, niedrigste Lane zuerst).
  | { kind: 'heilung'; scope: Scope; reichweite: 'nachbarn' | 'scope'; amount: number; mehrWennBasisUnter?: { schwelle: number; amount: number }; maxTargets?: number }
  // Rundenwachstum, dauerhaft stapelnd, zu Beginn deiner Runde (ersetzt schicht).
  // maxTriggers: löst insgesamt höchstens so oft aus (spielweiter Zähler).
  | { kind: 'wachstum'; per_round: Stat; ziel?: 'selbst' | 'verbuendeter'; scope?: Scope; maxTriggers?: number }
  // Verstärkt Rundenwachstum verbündeter Karten (Betriebsrat). firstOnlyPerRound:
  // wirkt nur auf den ERSTEN Wachstumstrigger einer Runde statt auf jeden.
  | { kind: 'verstaerker'; ziel: 'wachstum'; scope: Scope; faktor: number; firstOnlyPerRound?: boolean }
  // Todes-Rettung, einmal pro Spiel (ersetzt zaeh/neun_leben/haeutung).
  // bonusWennAusgeloest: dauerhafter Stat-Bonus, NUR wenn die Rettung tatsächlich auslöst.
  // ziehenWennAusgeloest: Karten, die der Besitzer zieht, wenn sie auslöst.
  | {
      kind: 'rettung';
      mode: 'survive_1hp' | 'revive_1hp' | 'full_heal';
      bonusWennAusgeloest?: Stat;
      ziehenWennAusgeloest?: number;
    }
  // Einmalig +X/+Y, wenn die Karte eine volle Runde überlebt.
  | { kind: 'ueberstunden'; bonus: Stat }
  // Ausrüstung: gibt genau einer anderen Karte gleicher Sub-Fraktion +X ATK
  // (springt beim Tod des Trägers automatisch weiter — dynamisch berechnet).
  | { kind: 'werkzeug'; atk: number }
  // Bonus abhängig von der eigenen Basis-HP (Schwellen- oder Pro-fehlende-HP-Modus).
  // cap: begrenzt den pro_fehlende_hp-Multiplikator (Schwellen-Modus ist ohnehin 0/1).
  | { kind: 'improvisation'; scope: Scope; mode: 'schwelle' | 'pro_fehlende_hp'; bonus: Stat; schwelle?: number; proHp?: number; cap?: number }
  // Dauerhaft +X/+Y, wenn eine Kreatur stirbt (trigger any/own/enemy).
  // firstPerRound: löst höchstens einmal je Runde aus; maxTriggers: spielweiter Deckel.
  | { kind: 'sammeln'; bonus: Stat; trigger: 'any' | 'own' | 'enemy'; firstPerRound?: boolean; maxTriggers?: number }
  // Ziehe n Karten (beim Ausspielen; proRunde = jede Runde).
  | { kind: 'lernen'; n: number; proRunde?: boolean }
  // Erzeugt x Wissens-Marker im spielerweiten Pool (proRunde = jede Runde).
  | { kind: 'wissen'; x: number; proRunde?: boolean }
  // Verbraucht Wissens-Marker; Schaden auf Gegner und/oder Selbst-Buff je Marker.
  // max: verbraucht höchstens so viele Marker (Default: den ganzen Pool).
  | { kind: 'experiment'; schadenProMarker?: number; proMarker?: Stat; max?: number }
  // Bonus/Effekt, solange die Karte allein in ihrer Lane steht (solo).
  | { kind: 'neugier'; bonus?: Stat; basisschaden?: number }
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
  | { kind: 'hinrichten'; maxHp: number }
  // Bonus, solange mindestens `mindestAnzahl` weitere Kreaturen im scope
  // kontrolliert werden (ersetzt V2s "kollektiv"/"bonus(condition:…)"/"twoOtherHumans").
  | { kind: 'bedingt'; scope: Scope; mindestAnzahl: number; bonus: Stat }
  // Kampfbonus gegen ein vergiftetes Ziel, nur für diesen Schlagabtausch.
  | { kind: 'hunter'; bonusAtk: number }
  // Einmal pro Spiel: sobald die HP auf `schwelle` oder darunter fallen, sofort
  // um `heilung` heilen (nie über das Maximum) und optional Gift entfernen.
  | { kind: 'shedding'; schwelle: number; heilung: number; entferntGift?: boolean }
  // Kommt mit Bonus ins Spiel, wenn der Besitzer in dieser Runde schon eine
  // andere Karte im scope gespielt hat (Gruppenarbeit).
  | { kind: 'synergie'; scope: Scope; bonus: Stat }
  // Rundenbeginn: automatisch aufgelöste Wahl zwischen zwei Optionen (kein
  // Spieler-Interaktionstyp – die Engine entscheidet deterministisch nach `regel`).
  | { kind: 'wahl'; optionA: WahlOption; optionB: WahlOption; regel: 'handKlein' | 'wissenKnapp' }
  // Beim Ausspielen: automatisch aufgelöste Wahl zwischen zwei Effekt-Paketen
  // (wie `wahl`, aber zum Ausspiel-Zeitpunkt und mit Schadens-Option). regel
  // "zielVorhanden": Paket B, wenn in derselben Lane ein Gegner steht, sonst A.
  | { kind: 'ausspielwahl'; optionA: AusspielTeil[]; optionB: AusspielTeil[]; regel: 'zielVorhanden' }
  // Beim Ausspielen: bewegt eine ANDERE verbündete Kreatur in eine freie eigene
  // Lane (optional, nur wenn es der Kreatur nützt – siehe abilities.ts).
  // tempAtkBonus: die bewegte Kreatur erhält bis zum Rundenende +X ATK.
  | { kind: 'umgruppieren'; tempAtkBonus?: number }
  // Beim Ausspielen: Rückstoß – Schaden auf sich selbst und optional auf die
  // gegnerische Kreatur in derselben Lane (`gegner`).
  | { kind: 'rueckstoss'; selbst: number; gegner?: number }
  // Beim Ausspielen: setzt bei ALLEN gegnerischen Kreaturen auf dem Feld ATK und
  // Verteidigung dauerhaft auf einen Deckel (Peinigung, siehe Creature.atkDeckel).
  | { kind: 'peinigen'; atkDeckel: number; hpDeckel: number };

/** Option einer `wahl`-Fähigkeit (siehe oben). */
export type WahlOption = { art: 'ziehen'; n: number } | { art: 'wissen'; x: number };

/**
 * Baustein eines `ausspielwahl`-Pakets. Ein Paket ist eine Liste davon und wird
 * komplett ausgeführt, wenn die Regel es auswählt.
 */
export type AusspielTeil =
  | { art: 'ziehen'; n: number }
  | { art: 'wissen'; x: number }
  /** Schaden auf die gegnerische Kreatur in derselben Lane (leere Lane = kein Effekt). */
  | { art: 'schaden'; x: number };

// ---- Aussehen & Animation (reine Daten – interpretiert ausschließlich der
// Client beim Rendern; die Engine validiert nur die Struktur). ----

export type DetailLevel = 'low' | 'mid' | 'high';

/** Primitiv-Bausteine. `group` ist ein reiner Container ohne Geometrie. */
export type PartShape = 'ico' | 'box' | 'cyl' | 'cone' | 'sph' | 'capsule' | 'torus' | 'group';

export interface VisualPart {
  /** Eindeutig je Figur; von Animations-Tracks adressierbar. "root" ist reserviert. */
  id: string;
  shape: PartShape;
  /**
   * Formabhängige Maße: ico/sph = Radius (Zahl); box = Zahl oder [x,y,z];
   * cyl = [rOben, rUnten, höhe]; cone = [radius, höhe]; capsule = [radius, länge];
   * torus = [radius, röhre]. Bei `group` entfällt es.
   */
  size?: number | number[];
  /** Überschreibt das Detail-Level der Figur nur für diesen Baustein. */
  detail?: DetailLevel;
  pos?: [number, number, number];
  /** Rotation in Radiant. */
  rot?: [number, number, number];
  scale?: number | [number, number, number];
  /** Palettenrolle (Schlüssel in `visual.palette`) ODER Hex-Farbe (#rrggbb). */
  color?: string;
  /** Optionale Hierarchie: id eines anderen Bausteins (Default: Figur-Wurzel). */
  parent?: string;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  /** Nur `sph`: partielle Kugel [phiStart, phiLength, thetaStart, thetaLength]. */
  arc?: [number, number, number, number];
}

export interface Visual {
  /** Auflösung der Geometrie (Default "mid"). */
  detailLevel?: DetailLevel;
  /** Relative Zielhöhe (1 = Normalgröße). Größere Kreaturen z. B. 1.25. */
  height?: number;
  /** Benannte Farbrollen, die Bausteine per `color` referenzieren. */
  palette?: Record<string, string>;
  parts: VisualPart[];
}

/** Auf welche Baustein-Eigenschaft ein Keyframe-Track wirkt. */
export type AnimProp =
  | 'pos.x'
  | 'pos.y'
  | 'pos.z'
  | 'rot.x'
  | 'rot.y'
  | 'rot.z'
  | 'scale'
  | 'emissive'
  | 'opacity';

export interface AnimationTrack {
  /** id eines Bausteins oder "root" (ganze Figur). */
  part: string;
  prop: AnimProp;
  /** Keyframes [zeit, wert], nach Zeit aufsteigend. pos/rot sind Offsets, scale ein Faktor. */
  keys: [number, number][];
}

export interface AnimationClip {
  duration: number;
  /** Idle läuft als Loop; Einzel-Klips (entrance/attack/hit/death) spielen einmal. */
  loop?: boolean;
  tracks: AnimationTrack[];
}

/** Klip-Name (z. B. "idle", "attack") → Klip. Fehlende Klips erben aus den Defaults. */
export type Animations = Record<string, AnimationClip>;

/**
 * Deckbau-Kategorie einer Karte. Beide Kategorien haben EIGENE Deck-Limits
 * (siehe `DeckbuildingConfig` / `validateDeck`), zählen aber regulär zur
 * Deckgröße. `principal` zählt NICHT zum Hero-Limit.
 */
export type CardCategory = 'hero' | 'principal';

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
  /** Deckbau-Kategorie mit eigenem Limit (Hero/Principal). */
  category?: CardCategory;
  /** Emoji, das beim Angriff als Projektil fliegt (z. B. "🗡️"). */
  projectile?: string;
  text?: string;
}

/**
 * Eine Figur-Datei aus data/figures/ (Dateiname = cardId + ".json").
 * Figur ablegen = Karte bekommt ein 3D-Modell; Datei löschen = Golem-Fallback.
 */
export interface FigureDef {
  cardId: string;
  visual: Visual;
  /** Eigene Klips (überschreiben die geteilten Defaults aus animations.json). */
  animations?: Animations;
}

export interface ActionCard {
  id: string;
  name: string;
  faction: string;
  type: 'action';
  cost: number;
  effect: Effect;
  signature?: boolean;
  /** Deckbau-Kategorie mit eigenem Limit (Hero/Principal). */
  category?: CardCategory;
  text?: string;
}

export type CardDef = CreatureCard | ActionCard;

export interface GameData {
  config: GameConfig;
  factions: Faction[];
  topics: Topic[];
  cards: CardDef[];
  cardsById: Record<string, CardDef>;
  /** Geteilte Standard-Animations-Klips (data/animations.json). */
  defaultClips: Animations;
  /** 3D-Figuren aus data/figures/ (cardId → Figur). */
  figures: Record<string, FigureDef>;
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
  /** Telemetrie: temporärer ATK-Anteil nach verursachender Karte. */
  tempAttackSources?: Record<string, number>;
  /** Lebens-Bonus bis zum Rundenende (analog tempAttackBonus). */
  tempHealthBonus: number;
  currentHealth: number;
  /** Zuletzt berechnetes Maximum – nötig, um Auren-Änderungen sauber anzuwenden. */
  lastMaxHealth: number;
  exhausted: boolean;
  /** Fliegend: wurde in dieser Flug-Phase schon bewegt? */
  movedThisFlyPhase: boolean;
  isToken: boolean;
  /** Anzahl Giftmarken (Zermürbung durch `gift`), bleibt über Runden bestehen. */
  poison: number;
  /**
   * Dauerhafte Obergrenzen ("Deckel") für Angriff bzw. Lebens-Maximum, gesetzt
   * durch `peinigen`. Sie greifen NACH allen Boni und Auren (internal.ts) – ein
   * gepeinigter Angriff bleibt also auch unter einer neuen Aura beim Deckel.
   * undefined = kein Deckel.
   */
  atkDeckel?: number;
  hpDeckel?: number;
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
  /**
   * Generische SPIELWEITE Auslöse-Zähler (für `maxTriggers` u. ä.). Schlüssel:
   * `${abilityIndex}:${kind}` – nicht nur `kind`, damit zwei gleichartige
   * Fähigkeiten auf derselben Karte getrennt zählen. Wird NIE zurückgesetzt.
   * WICHTIG: nur von Klasse-B/C-Hooks (Zeitpunkt-Auslöser) schreiben, NIEMALS
   * von Klasse-A-Hooks (beitragSelbst/beitragAura in abilityHooks.ts) – sonst
   * wird die recalcBoard-Fixpunktschleife nicht-idempotent.
   */
  zaehler: Record<string, number>;
  /** Wie `zaehler`, aber RUNDENWEISE – wird in jedem endRound() geleert. */
  rundenZaehler: Record<string, number>;
  /**
   * Telemetrie-only: letzte Schadensquelle. Hat KEINE Regelwirkung – wird nur
   * gelesen, um einen Tod in der Backtest-Statistik (stats.ts) der richtigen
   * Ursache/Karte zuzuordnen (z. B. "Giftzerstörungen", "Kills je Karte").
   */
  letzterSchaden?: SchadensUrsache;
}

// ---- Telemetrie (Backtest-Sidecar) --------------------------------------
// Rein additive Statistik über eine Partie. NICHT regelwirksam: `state.stats`
// bleibt ohne einen expliziten `aktiviereStatistik()`-Aufruf (stats.ts) immer
// `undefined`, und `buildClientView` liefert es nie aus – Server/Client sehen
// also keinen Unterschied. Nur das Backtest-Harness aktiviert und liest es.

export interface SchadensUrsache {
  art: 'kampf' | 'gift' | 'hinrichten' | 'effekt' | 'dornen';
  /** cardId der verursachenden Karte, falls eindeutig zuordenbar. */
  quelle?: string;
  /** Besitzer der verursachenden Karte. */
  owner?: PlayerIndex;
}

export interface KartenStatistik {
  gespielt: number;
  schadenKreatur: number;
  schadenBasis: number;
  kills: number;
  gestorben: number;
  geheilt: number;
  verhindert: number;
  atkGewaehrt: number;
  hpGewaehrt: number;
  atkEntfernt: number;
  hpEntfernt: number;
  buffSchadenKreatur: number;
  buffSchadenBasis: number;
  tokensErzeugt: number;
  bewegungenErzeugt: number;
  auraAusloesungen: number;
  wachstumAusloesungen: number;
  giftZerstoerungen: number;
  flinkAngriffe: number;
  mulliganAngeboten: number;
  mulliganBehalten: number;
  legaleGelegenheiten: number;
  endhandNieLegal: number;
  endhandNichtGewaehlt: number;
}

export interface SpielerStatistik {
  giftZerstoerungen: number;
  flinkAngriffe: number;
  heilung: number;
  verhinderterSchaden: number;
  dornenSchaden: number;
  wuchtSchaden: number;
  hinrichtungen: number;
  wachstumAtk: number;
  wachstumHp: number;
  energieVerfallen: number;
  kartenGezogen: number;
  energieJeRunde: { runde: number; ungenutzt: number }[];
  anfangshand: string[];
  mulliganGetauscht: string[];
  mulliganBehalten: string[];
  endhand: string[];
}

/**
 * Telemetrie je Cheerleader (Schlüssel ist die cardId). Beantwortet die Frage,
 * welche Kraft der Spieler beim Schild-Block tatsächlich wählt: ein
 * Cheerleader, der oft danebensitzt und selten geopfert wird, ist die
 * schwächste Option auf der Bank.
 *
 * Es gibt bewusst KEIN `verzichtet` mehr: Verzichten ist unmöglich, der Block
 * wird immer mit einem Opfer bezahlt.
 */
export interface CheerleaderStatistik {
  /** Wie oft dieser Bankplatz in einem Fenster als Option auftauchte. */
  angeboten: number;
  /** Wie oft dieser Cheerleader tatsächlich geopfert wurde. */
  geopfert: number;
  /** Direkt zugefügter Schaden (Handgemenge, Feldforschung-Option B). */
  schadenVerursacht: number;
  /** Verhinderter bzw. geheilter Schaden (Zweite Chance). */
  schadenVerhindert: number;
}

export interface KartenInstanzStatistik {
  id: number;
  cardId: string;
  owner: PlayerIndex;
  legalGesehen: boolean;
  ausgespielt: boolean;
}

export interface MatchStatistik {
  /** proKarte[spieler][cardId] – nur Karten, die tatsächlich vorkamen. */
  proKarte: [Record<string, KartenStatistik>, Record<string, KartenStatistik>];
  proSpieler: [SpielerStatistik, SpielerStatistik];
  /** proCheerleader[spieler][cardId] – nur Cheerleader, die vorkamen. */
  proCheerleader: [Record<string, CheerleaderStatistik>, Record<string, CheerleaderStatistik>];
  /** Interne Zuordnung physischer Kartenkopien; nur während einer Simulation. */
  instanzen: Record<number, KartenInstanzStatistik>;
  deckInstanzen: [number[], number[]];
  handInstanzen: [number[], number[]];
  naechsteInstanz: number;
}

export interface PlayerState {
  faction: string;
  /** Öffentlicher Anzeigename, niemals die gegnerische Deckliste. */
  deckName?: string;
  cheerleaders: CheerleaderSlots;
  deck: string[];
  hand: string[];
  base: number;
  energy: number;
  /** Spielerweiter, spielübergreifend persistenter Wissens-Pool (`wissen`/`experiment`). */
  knowledge: number;
  /** Flug-Phase: Spieler hat "Fertig" gedrückt (oder hat keine fliegenden Kreaturen). */
  flyDone: boolean;
  /** Vor Runde 1: dieser Spieler hat seinen einmaligen Mulligan bestätigt. */
  mulliganDone: boolean;
  /**
   * Ladung des Basis-Schilds in Abschnitten. Erreicht sie
   * `config.schild.abschnitte`, blockt der Schild den Treffer, löst eine
   * zufällige Superkraft aus und geht auf 0 zurück (siehe schild.ts).
   */
  schild: number;
  /**
   * Superkraft „Schutzschild": die eigene Basis ignoriert bis zum Rundenende
   * jeden Treffer. Wird in startRound() zurückgesetzt.
   */
  basisImmun: boolean;
  /**
   * Fraktionen der in DIESER Runde bereits gespielten Karten (für `synergie` –
   * Hooks bekommen nur `GameState`, keine `GameData`, daher Fraktion statt
   * cardId gespeichert). Wird in startRound() geleert.
   */
  gespieltDieseRunde: string[];
}

export type Phase = 'mulligan' | 'play' | 'fly' | 'ended';

/**
 * Strukturierte Kampf-Ereignisse am Log-Eintrag – die UI spielt sie als
 * Sequenz ab (Lane für Lane: Projektil, Schaden, Sterbeanimation).
 */
export interface AttackEvent {
  kind: 'attack';
  lane: number;
  attacker: PlayerIndex;
  /**
   * TATSÄCHLICH angerichteter Schaden – 0, wenn der Schild geblockt hat. Der
   * Client rechnet damit direkt auf seiner angezeigten Lage weiter, deshalb darf
   * hier nie der ungefilterte Rohschaden stehen.
   */
  damage: number;
  /** true = der Angriff ging auf die Basis statt auf eine Kreatur. */
  toBase: boolean;
  /** Gesetzt, wenn der Basis-Schild den Treffer komplett abgefangen hat. */
  blockiert?: boolean;
}

export interface DeathEvent {
  kind: 'death';
  lane: number;
  /** Besitzer der zerstörten Kreatur. */
  owner: PlayerIndex;
}

/** Ein Cheerleader verlässt die Bank – die UI spielt darauf den Opfer-Clip ab. */
export interface CheerleaderSacrificeEvent {
  kind: 'cheerleaderSacrifice';
  owner: PlayerIndex;
  slot: 0 | 1 | 2;
  cardId: string;
}

/**
 * Die Superkraft des geopferten Cheerleaders wirkt. Kommt IMMER direkt nach
 * dem zugehörigen `cheerleaderSacrifice`; die UI blendet darauf das Kraft-Banner
 * ein, bevor Schaden, Rettung und Tode animiert werden.
 */
export interface CheerleaderPowerEvent {
  kind: 'cheerleaderPower';
  owner: PlayerIndex;
  cardId: string;
  /** Anzeigename der Kraft (nicht der Kartenname). */
  kraft: string;
  /** Art der Wirkung – bestimmt Farbe/Form der Animation. */
  wirkung: CheerleaderWirkung['kind'];
  /** Gewählte Option, falls die Kraft eine Wahl gestellt hat. */
  wahl?: 'A' | 'B';
}

export type CombatEvent =
  | AttackEvent
  | DeathEvent
  | CheerleaderSacrificeEvent
  | CheerleaderPowerEvent;

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

/**
 * Schild-Ereignis: entsteht bei JEDEM Treffer auf eine Basis, solange
 * `config.schild` gesetzt ist UND der Verteidiger noch Cheerleader auf der Bank
 * hat. Die UI zeigt damit den Ladebalken animiert und bei `blockiert` den
 * Block; was der Block bewirkt, folgt als eigenes Cheerleader-Ereignis.
 */
export interface SchildEvent {
  kind: 'schild';
  /** Besitzer des Schilds – immer der Verteidiger. */
  owner: PlayerIndex;
  /** Um wie viele Abschnitte dieser Treffer aufgeladen hat. */
  ladung: number;
  /** Stand NACH dem Treffer – 0, wenn geblockt wurde. */
  stand: number;
  /** Gesamtzahl der Abschnitte, damit der Client nichts hartkodieren muss. */
  abschnitte: number;
  /** Gesetzt, wenn der Treffer komplett abgefangen wurde. */
  blockiert?: boolean;
}

/** Alles, was als strukturiertes Ereignis an einem Log-Eintrag hängen kann. */
export type LogEvent = CombatEvent | SpellEvent | SchildEvent;

export interface LogEntry {
  /** Fortlaufende Nummer über die ganze Partie (stabil trotz gekürzter Sicht). */
  id: number;
  round: number;
  text: string;
  event?: LogEvent;
}

/**
 * Ein noch offener Schritt der pausierbaren Auflösung. Bewusst reine Daten:
 * eine Closure würde weder `structuredClone` in applyAction noch die
 * JSON-Persistenz des Servers überleben – und genau das muss ein
 * Reaktionsfenster können (Reconnect, Serverneustart).
 *
 * Die Liste wird von vorn abgearbeitet; ein Schritt darf neue Schritte VORNE
 * einfügen (verschachtelte Auflösung) oder hinten anhängen.
 */
export type AufloesungsSchritt =
  /** Kampf in dieser Lane abhandeln (Angriffe, Basisschaden). */
  | { art: 'kampfLane'; lane: number }
  /** Nach allen Lanes: Gift-Zermürbung und Häutung. */
  | { art: 'kampfAbschluss' }
  /** Flugphase starten oder direkt zur Rundenabrechnung. */
  | { art: 'nachKampf' }
  /** Rundenende-Effekte und Zurücksetzen der temporären Werte. */
  | { art: 'rundenAbschluss' }
  /** Zermürbungsschaden, Rundenlimit, nächste Runde starten. */
  | { art: 'zermuerbung' }
  /** Tode auflösen, bis das Feld stabil ist. */
  | { art: 'todeStabilisieren' }
  /**
   * Der Schild von `spieler` hat geblockt: Bank-Fenster öffnen, damit ein
   * Cheerleader sich opfert. `basisSchaden()` plant diesen Schritt ein, statt
   * das Fenster selbst zu öffnen – sonst stünde mitten in einer laufenden
   * Schadensabrechnung plötzlich ein Fenster offen.
   */
  | { art: 'schildFenster'; spieler: PlayerIndex };

/**
 * Ein offenes Reaktionsfenster. Solange es steht, sind ALLE normalen Aktionen
 * gesperrt und nur `cheerleaderReaction` von `spieler` ist erlaubt. Es gibt
 * bewusst keinen Timeout: der Zug wartet, bis der Spieler entscheidet.
 *
 * Verzichten ist NICHT möglich: Der Block ist bereits passiert und wird durch
 * das Opfer bezahlt. Der Spieler wählt nur, WELCHER Cheerleader sich opfert.
 */
export interface OffeneReaktion {
  /** Monoton steigend über die Partie – verhindert doppelt gesendete Antworten. */
  id: number;
  /** Wer reagieren darf. Während des Fensters ist das auch `state.active`. */
  spieler: PlayerIndex;
  ausloeser: CheerleaderAusloeser;
  /** Belegte Bankplätze, deren Kraft zu diesem Auslöser passt. */
  slots: (0 | 1 | 2)[];
  /** Auf welchen Spieler `active` nach dem Fenster zurückfällt. */
  fortsetzenMit: PlayerIndex;
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
  /**
   * Zustand des spielinternen Zufallsgenerators (mulberry32, siehe rng.ts).
   * Bewusst eine Zahl statt einer Closure: nur so übersteht der Zufall das
   * structuredClone in applyAction UND die JSON-Persistenz des Servers.
   */
  rngState: number;
  /**
   * Noch abzuarbeitende Auflösungsschritte. Leer, solange ein Spieler normal am
   * Zug ist; gefüllt, sobald Kampf oder Rundenende laufen und ein
   * Reaktionsfenster sie unterbrechen könnte.
   */
  aufloesung: AufloesungsSchritt[];
  /** Offenes Cheerleader-Reaktionsfenster – blockiert jede andere Aktion. */
  reaktion: OffeneReaktion | null;
  /** Zähler für `OffeneReaktion.id`. */
  naechsteReaktionsId: number;
  /**
   * Log-Schalter für Massensimulationen (Backtest): 'aus' unterdrückt jeden
   * `log()`-Aufruf (state.log bleibt leer). Ohne Angabe (undefined) wird wie
   * bisher immer geloggt – Server/Client sehen daher keinen Unterschied.
   */
  logModus?: 'voll' | 'aus';
  /** Telemetrie-Sidecar für Backtests (siehe stats.ts). Wird nie an den Client ausgeliefert. */
  stats?: MatchStatistik;
}

export type PlayerAction =
  | { type: 'mulligan'; handIndices: number[] }
  | { type: 'playCreature'; handIndex: number; lane: number }
  | { type: 'playAction'; handIndex: number; targetLane?: number; toLane?: number }
  | { type: 'pass' }
  | { type: 'flyMove'; fromLane: number; toLane: number }
  | { type: 'flyDone' }
  /**
   * Antwort auf ein offenes Reaktionsfenster. `slot: null` bleibt als
   * explizit validierbarer ungültiger Drahtwert im Vertrag; die Schildregel
   * erlaubt keinen Verzicht. `choice` ist nur bei einer Wahl-Kraft gesetzt.
   */
  | { type: 'cheerleaderReaction'; reactionId: number; slot: 0 | 1 | 2 | null; choice?: 'A' | 'B' };

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
  deckName?: string;
  cheerleaders: CheerleaderSlots;
  base: number;
  energy: number;
  deckCount: number;
  handCount: number;
  flyDone: boolean;
  mulliganDone: boolean;
  /** Aktuelle Schild-Ladung in Abschnitten (öffentlich, wie das Basis-Leben). */
  schild: number;
  /** Superkraft „Schutzschild" aktiv: die Basis ist bis Rundenende unverwundbar. */
  basisImmun: boolean;
}

/** Ein einlösbarer Bankplatz im offenen Reaktionsfenster. */
export interface ReaktionsAngebot {
  slot: 0 | 1 | 2;
  cardId: string;
  /** Anzeigename der Kraft. */
  kraft: string;
  text: string;
  /** Gesetzt, wenn diese Kraft beim Einlösen eine Wahl verlangt. */
  wahl?: { a: string; b: string };
}

/**
 * Öffentlicher Teil eines Reaktionsfensters. Der Gegner bekommt dieselbe
 * Struktur mit leeren `angebote` – er sieht also, DASS gewartet wird, aber
 * nicht, welche Optionen der andere hat.
 */
export interface ReaktionsView {
  id: number;
  /** Wer entscheiden muss. Ist das nicht `you`, zeigt die UI einen Wartezustand. */
  spieler: PlayerIndex;
  ausloeser: CheerleaderAusloeser;
  /** Nur für `spieler` gefüllt. */
  angebote: ReaktionsAngebot[];
}

/** Kompakte, aus dem vollstaendigen Ereignislog abgeleitete Match-Bilanz. */
export interface MatchSummaryView {
  round: number;
  /** Tatsaechlich an der gegnerischen Basis angerichteter Kampfschaden. */
  baseDamageDealt: [number, number];
  /** Im Match verlorene Kreaturen, nach Besitzer gezaehlt. */
  creaturesLost: [number, number];
  /** Vollstaendig geblockte Basistreffer, nach Schildbesitzer gezaehlt. */
  shieldsBlocked: [number, number];
  /** Fuer einen Schildblock geopferte Cheerleader, nach Besitzer gezaehlt. */
  cheerleadersUsed: [number, number];
}

export interface ClientView {
  you: PlayerIndex;
  round: number;
  roundLimit: number;
  lanes: number;
  /** Startleben einer Basis – Bezugswert für den Lebensbalken. */
  baseMax: number;
  /** Abschnitte des Basis-Schilds; 0 = Schild-Regel in der Config abgeschaltet. */
  schildAbschnitte: number;
  energyCap: number;
  phase: Phase;
  active: PlayerIndex;
  winner: PlayerIndex | 'draw' | null;
  players: [PlayerPublicView, PlayerPublicView];
  hand: CardDef[];
  board: (CreatureView | null)[][];
  log: LogEntry[];
  /** Nur nach Matchende gesetzt; wird vor dem Kuerzen des sichtbaren Logs berechnet. */
  matchSummary?: MatchSummaryView;
  /**
   * Offenes Cheerleader-Reaktionsfenster. Solange gesetzt, sind alle normalen
   * Aktionen gesperrt – die UI darf nur die Reaktion anbieten (bzw. warten).
   */
  reaktion?: ReaktionsView;
}
