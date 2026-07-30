// Eine komplette Partie Menschen (Spieler 0) gegen Tiere (Spieler 1), von Hand
// gedreht: Mulligan → 10 Runden → zerstörte Basis. Jede Runde stellt eine
// Mechanik in den Mittelpunkt und prüft sie im echten Zusammenspiel.
//
// Warum eine Skript-Partie und nicht `emptyState()` + `put()` wie in den
// übrigen Suiten: nur so laufen Phasenmaschine, Zugreihenfolge, Energie,
// Erschöpfung, Rundenende und Log wirklich mit. JEDER Zug geht deshalb durch
// `applyAction` – es wird nie direkt aufs Brett geschrieben. Gesteuert wird die
// Partie ausschließlich über Hand und Deck (setzeHand/setzeDeck), weil die
// Ziehreihenfolge sonst vom Deck-Shuffle abhinge.
//
// Aufbau: ein `it` pro Runde auf einem gemeinsamen `s`, in Ausführungs-
// reihenfolge. Ein Fehler in Runde n lässt die Folgerunden mitfallen – der
// erste rote Test ist die Ursache.

import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyAction,
  buildClientView,
  createGame,
  createSeededRandom,
  getMaxHealth,
  legaleAktionen
} from '../src/index.js';
import { data, pruefeSicht, setzeDeck, setzeHand } from './helpers.js';
import type { GameState, LogEntry, PlayerAction, PlayerIndex } from '../src/types.js';

let s: GameState;
/** Log-Index, ab dem die Einträge der laufenden Runde stehen. */
let logMarke = 0;

/** Führt eine Aktion aus und schreibt den neuen Zustand zurück. */
function tu(spieler: PlayerIndex, aktion: PlayerAction): void {
  s = applyAction(s, spieler, aktion, data);
}

/** Spielt eine Karte aus der Hand (Kreatur mit Lane, Aktionskarte mit Ziel-Lane). */
function spiele(spieler: PlayerIndex, karte: string, lane?: number): void {
  const handIndex = s.players[spieler].hand.indexOf(karte);
  expect(handIndex, `${karte} liegt nicht in der Hand von Spieler ${spieler + 1}`).toBeGreaterThanOrEqual(0);
  const card = data.cardsById[karte];
  tu(
    spieler,
    card.type === 'creature'
      ? { type: 'playCreature', handIndex, lane: lane! }
      : { type: 'playAction', handIndex, targetLane: lane }
  );
}

/** Beide Spieler passen nacheinander → Kampfphase. */
function passeBeide(): void {
  tu(s.active, { type: 'pass' });
  tu(s.active, { type: 'pass' });
}

/** Meldet beide Seiten aus einer laufenden Flugphase ab. */
function flugphaseBeenden(): void {
  while (s.phase === 'fly') tu(s.active, { type: 'flyDone' });
}

/** Merkt sich den Log-Stand, damit `ereignisse()` nur die neue Runde liefert. */
function neueRunde(): void {
  logMarke = s.log.length;
  pruefeSicht(s);
}

/** Log-Einträge seit der letzten `neueRunde()`-Marke. */
function ereignisse(): LogEntry[] {
  return s.log.slice(logMarke);
}

/** Texte seit der Marke, als ein String – für lesbare "enthält"-Prüfungen. */
function protokoll(): string {
  return ereignisse()
    .map((l) => l.text)
    .join('\n');
}

beforeAll(() => {
  const random = createSeededRandom(42);
  s = createGame(data, ['humans', 'animals'], random);
  // `startingPlayer` wird in createGame ausgewürfelt – für ein festes Drehbuch
  // wird er hier gesetzt, bevor der Mulligan die erste Runde startet.
  s.startingPlayer = 0;
  s = applyAction(s, 0, { type: 'mulligan', handIndices: [] }, data, random);
  s = applyAction(s, 1, { type: 'mulligan', handIndices: [] }, data, random);
});

describe('Vollständige Partie: Mulligan bis zur zerstörten Basis', () => {
  it('Start: nach dem Mulligan läuft Runde 1 mit 1 Energie', () => {
    expect(s.phase).toBe('play');
    expect(s.round).toBe(1);
    expect(s.active).toBe(0);
    expect(s.players[0].energy).toBe(1);
    expect(s.players[1].energy).toBe(1);
    expect(s.players[0].mulliganDone).toBe(true);
    expect(s.players[1].mulliganDone).toBe(true);
    expect(s.winner).toBeNull();
    // Beide Bänke sind besetzt und bleiben es die ganze Partie über.
    expect(s.players[0].cheerleaders).toHaveLength(3);
    pruefeSicht(s);
  });

  it('Runde 1 – flink schlägt sofort zu, frisch gespielte Kreaturen sind erschöpft', () => {
    neueRunde();
    setzeHand(s, 0, ['rekrut']);
    setzeHand(s, 1, ['ratte']);
    setzeDeck(s, 0, ['schildwache']);
    setzeDeck(s, 1, ['schlange']);

    spiele(0, 'rekrut', 1);
    expect(s.board[0][1]!.exhausted).toBe(true); // kein flink
    spiele(1, 'ratte', 1);
    expect(s.board[1][1]!.exhausted).toBe(false); // flink → sofort kampfbereit
    expect(protokoll()).toContain('flink und sofort kampfbereit');

    passeBeide();

    // Nur die Ratte schlägt zu; der erschöpfte Rekrut verteidigt bloß.
    expect(s.board[1][1]?.cardId).toBe('ratte');
    expect(s.board[0][1]).toBeNull();
    const angriffe = ereignisse().filter((l) => l.event?.kind === 'attack');
    expect(angriffe).toHaveLength(1);
    expect(angriffe[0].event).toMatchObject({
      kind: 'attack',
      lane: 1,
      attacker: 1,
      damage: 2,
      toBase: false
    });
    expect(ereignisse().filter((l) => l.event?.kind === 'death')[0].event).toMatchObject({
      kind: 'death',
      lane: 1,
      owner: 0
    });
    // Keine Flieger → die Flugphase wird übersprungen.
    expect(s.phase).toBe('play');
    expect(s.round).toBe(2);
  });

  it('Runde 2 – zwei erschöpfte Kreaturen kämpfen nicht, die freie Lane trifft die Basis', () => {
    neueRunde();
    expect(s.active).toBe(1); // Startspieler wechselt jede Runde
    expect(s.players[0].energy).toBe(2);
    setzeHand(s, 0, ['schildwache']);
    setzeHand(s, 1, ['schlange']);

    spiele(1, 'schlange', 0);
    spiele(0, 'schildwache', 0);
    passeBeide();

    // Lane 0: beide frisch gespielt und erschöpft → kein Schlagabtausch.
    expect(s.board[0][0]?.currentHealth).toBe(4);
    expect(s.board[1][0]?.currentHealth).toBe(2);
    // Lane 1: die Ratte steht allein → Basisschaden.
    const basisTreffer = ereignisse().filter((l) => l.event?.kind === 'attack');
    expect(basisTreffer).toHaveLength(1);
    expect(basisTreffer[0].event).toMatchObject({ kind: 'attack', attacker: 1, toBase: true, damage: 2 });
    expect(s.players[0].base).toBe(13);
    expect(s.players[1].base).toBe(15);
  });

  it('Runde 3 – Schild hebt das Maximum des Nachbarn, der Streikposten opfert sich', () => {
    neueRunde();
    setzeHand(s, 0, ['rekrut', 'streikposten']);
    setzeHand(s, 1, ['wilder_instinkt']);

    // Schild: die Schildwache in Lane 0 gibt dem Nachbarn in Lane 1 +1 Leben.
    spiele(0, 'rekrut', 1);
    expect(s.board[0][1]!.baseMaxHealth).toBe(1);
    expect(getMaxHealth(s, 0, 1)).toBe(2);
    expect(s.board[0][1]!.currentHealth).toBe(2); // Bonus wird sofort mitgeheilt
    expect(buildClientView(s, 0, data).board[0][1]).toMatchObject({ maxHealth: 2, baseMaxHealth: 1 });

    // Aktionskarte: +2 Angriff bis Rundenende, mit Replay-Ereignis.
    spiele(1, 'wilder_instinkt', 1);
    const zauber = ereignisse().filter((l) => l.event?.kind === 'spell');
    expect(zauber).toHaveLength(1);
    expect(zauber[0].event).toMatchObject({ kind: 'spell', effect: 'attackBuff' });
    expect(s.board[1][1]!.tempAttackBonus).toBe(2);

    // Der Streikposten wird Nachbar des Rekruts und fängt gleich den tödlichen Treffer ab.
    spiele(0, 'streikposten', 2);
    passeBeide();

    // Ratte schlägt mit 2+2 zu; der Rekrut (2 Leben) wäre tot …
    expect(protokoll()).toContain('Ratte trifft Rekrut für 4');
    // … der Streikposten opfert sich stattdessen.
    expect(s.board[0][2]).toBeNull();
    expect(s.board[0][1]?.cardId).toBe('rekrut');
    expect(s.board[0][1]?.currentHealth).toBe(1);
    const tode = ereignisse().filter((l) => l.event?.kind === 'death');
    expect(tode).toHaveLength(1);
    expect(tode[0].event).toMatchObject({ kind: 'death', owner: 0, lane: 2 });
    expect(protokoll()).toContain('Streikposten wird zerstört');

    // Die Schlange hat der Schildwache zwei Giftmarken gesetzt (noch kein Tod).
    expect(s.board[0][0]?.poison).toBe(2);
    expect(s.board[0][0]?.currentHealth).toBe(3);
  });

  it('Runde 4 – Gift tötet ab drei Marken, danach beginnt die Flugphase', () => {
    neueRunde();
    setzeHand(s, 1, ['adler']);
    setzeHand(s, 0, ['feldscherin']);

    spiele(1, 'adler', 2);
    spiele(0, 'feldscherin', 2);
    passeBeide();

    // Lane 0: Schildwache und Schlange erledigen sich fast gegenseitig,
    // die Schlange setzt dabei zwei weitere Giftmarken.
    expect(protokoll()).toContain('Schlange wird zerstört');
    // Gift wird ERST am Ende der Kampfphase ausgewertet – ab 3 Marken tödlich.
    expect(protokoll()).toContain('Gift: Schildwache wird bei 4 Giftmarken zerstört');
    // Lane 1: Rekrut und Ratte vernichten sich gegenseitig.
    expect(s.board[0][0]).toBeNull();
    expect(s.board[0][1]).toBeNull();
    expect(s.board[1][0]).toBeNull();
    expect(s.board[1][1]).toBeNull();
    // Die Gift-Zerstörung steht im Log NACH allen Angriffen dieser Runde.
    const kinds = ereignisse().flatMap((l) => (l.event ? [l.event.kind] : []));
    expect(kinds.lastIndexOf('death')).toBeGreaterThan(kinds.lastIndexOf('attack'));

    // Nur der Adler fliegt → Flugphase, Spieler 0 ist automatisch fertig.
    expect(s.phase).toBe('fly');
    expect(s.players[0].flyDone).toBe(true);
    expect(s.players[1].flyDone).toBe(false);
    expect(s.active).toBe(1);
    expect(buildClientView(s, 1, data).board[1][2]?.canFly).toBe(true);
    expect(buildClientView(s, 0, data).board[1][2]?.canFly).toBe(false); // nie beim Gegner
    // Zwei freie Lanes → zwei Flugziele plus "fertig".
    expect(legaleAktionen(s, 1, data)).toEqual([
      { type: 'flyMove', fromLane: 2, toLane: 0 },
      { type: 'flyMove', fromLane: 2, toLane: 1 },
      { type: 'flyDone' }
    ]);

    tu(1, { type: 'flyMove', fromLane: 2, toLane: 0 });
    // Kein weiterer Flieger → automatisch fertig → Runde endet.
    expect(s.board[1][0]?.cardId).toBe('adler');
    expect(s.board[1][2]).toBeNull();
    expect(s.phase).toBe('play');
    expect(s.round).toBe(5);
  });

  it('Runde 5 – Stellungskampf, volle Lanes begrenzen die Flugziele', () => {
    neueRunde();
    setzeHand(s, 0, ['kranfuehrer']);
    setzeHand(s, 1, ['gecko']);

    spiele(0, 'kranfuehrer', 1);
    spiele(1, 'gecko', 1);
    passeBeide();

    // Beide unbesetzten Lanes schlagen auf die Basis durch.
    expect(s.players[0].base).toBe(11);
    expect(s.players[1].base).toBe(14);

    // Der Adler hat jetzt nur noch eine freie Ziel-Lane.
    expect(s.phase).toBe('fly');
    expect(legaleAktionen(s, 1, data)).toEqual([
      { type: 'flyMove', fromLane: 0, toLane: 2 },
      { type: 'flyDone' }
    ]);
    flugphaseBeenden();
    expect(s.round).toBe(6);
  });

  it('Runde 6 – Aktionskarte, Dornen und Heilung am Rundenende', () => {
    neueRunde();
    setzeHand(s, 1, ['baer']);
    setzeHand(s, 0, ['junger_neffe', 'schildwall']);

    spiele(1, 'baer', 2);
    spiele(0, 'junger_neffe', 0);
    tu(1, { type: 'pass' });
    spiele(0, 'schildwall', 1); // +3 dauerhaftes Leben auf den Kranführer
    expect(s.board[0][1]!.permHealthBonus).toBe(3);
    expect(getMaxHealth(s, 0, 1)).toBe(7);
    expect(ereignisse().filter((l) => l.event?.kind === 'spell')[0].event).toMatchObject({
      kind: 'spell',
      effect: 'buff'
    });

    passeBeide();

    // Der Kranführer tötet den Gecko und kassiert dessen Dornen.
    expect(protokoll()).toContain('Dornen! Gecko verletzt Kranführer um 1');
    expect(s.board[1][1]).toBeNull();
    expect(s.board[0][1]!.currentHealth).toBe(5); // 7 − 1 Angriff − 1 Dornen

    flugphaseBeenden();
    // Rundenende: die Feldscherin heilt den beschädigten Nachbarn um 1.
    expect(protokoll()).toContain('Feldscherin heilt Kranführer um 1');
    expect(s.board[0][1]!.currentHealth).toBe(6);
    expect(s.round).toBe(7);
  });

  it('Runde 7 – Rettung fängt den tödlichen Treffer ab, Wucht trifft die Basis', () => {
    neueRunde();
    setzeHand(s, 1, ['compsognathus']);
    setzeHand(s, 0, []);
    setzeDeck(s, 0, ['ritter']); // Zäh zieht beim Auslösen eine Karte

    expect(s.board[0][0]!.currentHealth).toBe(1); // Junger Neffe steht auf der Kippe
    tu(0, { type: 'pass' });
    spiele(1, 'compsognathus', 1);
    passeBeide();

    // Rettung: −1 Leben wird auf 1 hochgesetzt, genau einmal pro Spiel.
    const neffe = s.board[0][0]!;
    expect(neffe.cardId).toBe('junger_neffe');
    expect(neffe.currentHealth).toBe(1);
    expect(neffe.rettungUsed).toBe(true);
    expect(s.players[0].hand).toEqual(['ritter']); // ziehenWennAusgeloest

    // Wucht: 4 Angriff auf 1 Leben → 3 Überschuss auf die Basis.
    expect(protokoll()).toContain('Wucht! 3 Überschuss trifft die Basis');
    expect(s.players[1].base).toBe(11);

    flugphaseBeenden();
    expect(s.round).toBe(8);
  });

  it('Runde 8 – die verbrauchte Rettung greift kein zweites Mal', () => {
    neueRunde();
    setzeHand(s, 0, []);
    setzeHand(s, 1, []);
    passeBeide();
    flugphaseBeenden();

    // Junger Neffe und Steinadler erledigen sich gegenseitig – diesmal ohne Rettung.
    expect(protokoll()).toContain('Junger Neffe wird zerstört');
    expect(s.board[0][0]).toBeNull();
    expect(s.board[1][0]).toBeNull();
    expect(s.players[0].base).toBe(7);
    expect(s.players[1].base).toBe(7);
    expect(s.round).toBe(9);
  });

  it('Runde 9 – beide Seiten dreschen ungehindert auf die Basen ein', () => {
    neueRunde();
    setzeHand(s, 0, []);
    setzeHand(s, 1, []);
    passeBeide();
    flugphaseBeenden();

    expect(s.players[0].base).toBe(3);
    expect(s.players[1].base).toBe(3);
    expect(s.phase).toBe('play');
    expect(s.round).toBe(10);
  });

  it('Runde 10 – die zerstörte Basis beendet die Partie sofort', () => {
    neueRunde();
    setzeHand(s, 0, []);
    setzeHand(s, 1, []);
    passeBeide();

    expect(s.phase).toBe('ended');
    expect(s.winner).toBe(0);
    expect(s.players[1].base).toBeLessThanOrEqual(0);
    expect(protokoll()).toContain('Die Basis von Spieler 2 ist zerstört – Spieler 1 gewinnt!');
    // Der Kampf bricht mitten in der Lane-Schleife ab: der Bär in Lane 3 kommt
    // nicht mehr zum Zug, die Basis von Spieler 1 bleibt unangetastet.
    expect(s.players[0].base).toBe(3);
    pruefeSicht(s);
  });

  it('nach dem Spielende wird jede weitere Aktion abgewiesen', () => {
    expect(() => applyAction(s, 0, { type: 'pass' }, data)).toThrow(/bereits beendet/);
    expect(() => applyAction(s, 1, { type: 'flyDone' }, data)).toThrow(/bereits beendet/);
  });
});

describe('Vollständige Partie: Auswertung des gesamten Protokolls', () => {
  it('Log-Ids sind lückenlos und eindeutig', () => {
    expect(s.log.map((l) => l.id)).toEqual(s.log.map((_, i) => i));
  });

  it('jede Runde der Partie ist im Log verzeichnet', () => {
    for (let runde = 1; runde <= 10; runde++) {
      expect(s.log.some((l) => l.text.startsWith(`— Runde ${runde} beginnt`))).toBe(true);
    }
    // Energie wächst mit der Rundennummer (start 1, +1 je Runde, ungedeckelt).
    expect(s.log.some((l) => l.text.includes('— Runde 10 beginnt (10 Energie'))).toBe(true);
  });

  it('alle Ereignisse gehören zu den Arten, die der Client abspielen kann', () => {
    // Vertrag mit GameScreen.tsx#runReplay: eine neue Kampfmechanik OHNE
    // passendes Ereignis lässt den Client stumm springen statt zu animieren.
    const erlaubt = new Set(['attack', 'death', 'spell', 'cheerleaderSacrifice']);
    for (const eintrag of s.log) {
      if (!eintrag.event) continue;
      expect(erlaubt, `unbekannte Ereignisart "${eintrag.event.kind}"`).toContain(eintrag.event.kind);
    }
  });

  it('jedes Ereignis liegt in einer gültigen Lane und hat einen gültigen Besitzer', () => {
    for (const { event } of s.log) {
      if (!event) continue;
      if (event.kind === 'attack') {
        expect(event.lane).toBeGreaterThanOrEqual(0);
        expect(event.lane).toBeLessThan(data.config.lanes);
        expect([0, 1]).toContain(event.attacker);
        expect(event.damage).toBeGreaterThanOrEqual(0);
      } else if (event.kind === 'death') {
        expect(event.lane).toBeGreaterThanOrEqual(0);
        expect(event.lane).toBeLessThan(data.config.lanes);
        expect([0, 1]).toContain(event.owner);
      }
    }
  });

  it('die Partie hat tatsächlich alle vorgesehenen Mechaniken ausgelöst', () => {
    // Schutz gegen ein stillschweigend totes Drehbuch: fällt eine Mechanik aus
    // (z. B. weil sich Kartenwerte ändern), schlägt genau dieser Test an.
    const alles = s.log.map((l) => l.text).join('\n');
    for (const beleg of [
      'flink und sofort kampfbereit', // flink
      'Wilder Instinkt', // Aktionskarte buffAttackTemp
      'Schildwall', // Aktionskarte buffHealth
      'Streikposten wird zerstört', // Schadensübernahme („opfert sich")
      'Giftmarken zerstört', // Gift-Zermürbung
      'fliegt in Lane', // Flugphase
      'Dornen!', // Dornen
      'Wucht!', // Wucht-Überschuss
      'heilt Kranführer', // Heilung am Rundenende
      'trifft die gegnerische Basis', // Basisschaden bei freier Lane
      'ist zerstört – Spieler 1 gewinnt' // Spielende
    ]) {
      expect(alles, `Mechanik nicht ausgelöst: ${beleg}`).toContain(beleg);
    }
  });

  it('die Cheerleader-Bänke blieben die ganze Partie unverändert', () => {
    // Heutiger Vertrag: die Engine erzeugt KEIN cheerleaderSacrifice-Ereignis
    // und räumt keinen Bankplatz. Die Superkräfte sind noch nicht umgesetzt
    // (docs/Arena_Cheerleader_Erweiterung.md). Schlägt dieser Test an, wurde
    // die Erweiterung gebaut – dann gehören hier echte Erwartungen hin.
    expect(s.players[0].cheerleaders).toEqual(['pc_principal', 'pc_babies', 'alter_wissenschaftler']);
    expect(s.players[1].cheerleaders).toEqual(['pc_principal', 'pc_babies', 'alter_wissenschaftler']);
    expect(s.log.some((l) => l.event?.kind === 'cheerleaderSacrifice')).toBe(false);
  });

  it('die Client-Sicht des Endstands verrät keine verdeckten Informationen', () => {
    pruefeSicht(s);
    const sicht = buildClientView(s, 0, data);
    expect(sicht.winner).toBe(0);
    expect(sicht.phase).toBe('ended');
    expect(sicht.round).toBe(10);
    expect(sicht.log.length).toBeLessThanOrEqual(60);
  });
});
