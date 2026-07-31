// Reine Report-Erzeugung: nimmt die vom Backtest aggregierten Kennzahlen und
// die Zielkorridore (korridore.json) entgegen und baut daraus einen
// Markdown-Report auf stdout-Niveau (siehe list-missing-art.mjs für den
// Stil, den dieses Skript weiterführt). Kein I/O hier – das macht backtest.ts.

export interface Korridore {
  mindestPartienJeMatchup: number;
  gesamtWinrateOberfraktion: { min: number; max: number };
  deckWinrateGegenTestfeld: { min: number; max: number };
  startspielerVorteil: { max: number };
  durchschnittlicheSpieldauerRunden: { min: number; max: number };
  anteilPartienErreichenZermuerbung: { max: number };
  anteilPartienErreichenNotbremse: { max: number };
  einzelkartePraesenzInDecksDerOberfraktion: { maxAnteil: number; hinweis?: string };
  einzelkarteMulliganKeepRate: { maxAnteil: number; hinweis?: string };
  einzelkarteAusspielrate: { minAnteil: number; hinweis?: string };
  prioritaetErsterTest: string[];
}

export interface MatchupErgebnis {
  deckA: string;
  deckB: string;
  /** Partien mit deckA auf Platz 0 + Partien mit deckA auf Platz 1 (Sitzplatz-Spiegelung). */
  spiele: number;
  siegeA: number;
  siegeB: number;
  unentschieden: number;
  rundenSumme: number;
  amRundenlimit: number;
  /** Partien, die mindestens die Zermürbungs-Startrunde (config.zermuerbung.abRunde) erreicht haben. */
  erreichtZermuerbung: number;
  /** Siege des jeweils startenden Spielers (für den Startspieler-Vorteil). */
  siegeStartspieler: number;
}

export interface KartenKennzahl {
  cardId: string;
  name: string;
  faction: string;
  /** In wie vielen der Testdecks (dieser Oberfraktion) kommt die Karte vor? */
  deckPraesenzAnteil: number;
  /** Anteil der Partien (mit dieser Karte im Deck), in denen sie ausgespielt wurde. */
  ausspielrateAnteil: number;
  gespielt: number;
  schadenKreatur: number;
  schadenBasis: number;
  kills: number;
  gestorben: number;
  geheilt: number;
  verhindert: number;
  auraAusloesungen: number;
  wachstumAusloesungen: number;
  giftZerstoerungen: number;
  flinkAngriffe: number;
  mulliganKeepRate: number | null;
  endhandNieLegal: number;
  endhandNichtGewaehlt: number;
}

export interface BotSensitivitaet {
  matchup: string;
  maxAbweichungPp: number;
}

export interface ZufallsGrundlinie {
  deck: string;
  winrateGegenZufall: number;
  partien: number;
}

export interface BacktestErgebnis {
  erzeugtAm: string;
  saat: number;
  spieleProSitzung: number;
  profil: string;
  matchups: MatchupErgebnis[];
  karten: KartenKennzahl[];
  botSensitivitaet: BotSensitivitaet[];
  zufallsGrundlinien: ZufallsGrundlinie[];
  /** deckId -> Oberfraktion, für die gesamtWinrateOberfraktion-Auswertung. */
  deckFraktion: Record<string, string>;
  /** Nutzung der Cheerleader-Reaktionen, über alle Partien summiert. */
  cheerleader?: CheerleaderKennzahl[];
}

/** Aggregierte Cheerleader-Nutzung über alle Partien (beide Seiten zusammen). */
export interface CheerleaderKennzahl {
  cardId: string;
  name: string;
  angeboten: number;
  verzichtet: number;
  geopfert: number;
  schadenVerursacht: number;
  schadenVerhindert: number;
  rettungen: number;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)} %`;
}

/** Wilson-Score-Konfidenzintervall (95 %) für eine Erfolgsquote aus n Versuchen. */
function wilsonKi(erfolge: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.959963985; // 95 %
  const p = erfolge / n;
  const denom = 1 + (z * z) / n;
  const mitte = p + (z * z) / (2 * n);
  const spanne = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (mitte - spanne) / denom), Math.min(1, (mitte + spanne) / denom)];
}

function ampel(ok: boolean): string {
  return ok ? '🟢' : '🔴';
}

/** Prüft, ob ein Punktschätzer + sein KI komplett innerhalb eines Korridors liegt (konservativ: nur außerhalb, wenn das GANZE KI außerhalb ist). */
function imKorridorMitKi(kiUnten: number, kiOben: number, min: number, max: number): boolean {
  return kiOben >= min && kiUnten <= max;
}

function ampelKi(wert: number, kiUnten: number, kiOben: number, min: number, max: number): string {
  if (wert >= min && wert <= max) return '🟢';
  return imKorridorMitKi(kiUnten, kiOben, min, max) ? '🟡' : '🔴';
}

/**
 * Sammelt harte Korridor-Verletzungen als Klartext-Zeilen (für `--streng`
 * einen Exit-Code ≠0 auslösen). Bewusst konservativ: eine Kennzahl gilt nur
 * als verletzt, wenn ihr GESAMTES 95 %-Konfidenzintervall außerhalb des
 * Korridors liegt (siehe imKorridorMitKi) – ein zu kleines n führt so nicht
 * zu falschem Alarm, sondern zu einem breiten (und damit unauffälligen) KI.
 */
export function sammleVerletzungen(ergebnis: BacktestErgebnis, korridore: Korridore): string[] {
  const verletzungen: string[] = [];
  const gesamtSpiele = ergebnis.matchups.reduce((s, m) => s + m.spiele, 0);
  const minJeMatchup = Math.min(...ergebnis.matchups.map((m) => m.spiele));
  if (minJeMatchup < korridore.mindestPartienJeMatchup) {
    verletzungen.push(
      `Zu wenige Partien je Matchup: ${minJeMatchup} < ${korridore.mindestPartienJeMatchup} (Kennzahlen unten sind vorläufig).`
    );
  }
  const gesamtRunden = ergebnis.matchups.reduce((s, m) => s + m.rundenSumme, 0);
  const dauer = gesamtRunden / gesamtSpiele;
  if (dauer < korridore.durchschnittlicheSpieldauerRunden.min || dauer > korridore.durchschnittlicheSpieldauerRunden.max) {
    verletzungen.push(`Ø Spieldauer ${dauer.toFixed(2)} Runden außerhalb ${korridore.durchschnittlicheSpieldauerRunden.min}–${korridore.durchschnittlicheSpieldauerRunden.max}.`);
  }
  const gesamtStartspielerSiege = ergebnis.matchups.reduce((s, m) => s + m.siegeStartspieler, 0);
  const gesamtEntschieden = ergebnis.matchups.reduce((s, m) => s + m.siegeA + m.siegeB, 0);
  const startVorteil = gesamtStartspielerSiege / gesamtEntschieden;
  if (startVorteil > korridore.startspielerVorteil.max) {
    verletzungen.push(`Startspieler-Vorteil ${pct(startVorteil)} > ${pct(korridore.startspielerVorteil.max)}.`);
  }
  const gesamtRundenlimit = ergebnis.matchups.reduce((s, m) => s + m.amRundenlimit, 0);
  const anteilNotbremse = gesamtRundenlimit / gesamtSpiele;
  if (anteilNotbremse > korridore.anteilPartienErreichenNotbremse.max) {
    verletzungen.push(`Anteil Partien an der Notbremse ${pct(anteilNotbremse)} > ${pct(korridore.anteilPartienErreichenNotbremse.max)}.`);
  }
  const gesamtZermuerbung = ergebnis.matchups.reduce((s, m) => s + m.erreichtZermuerbung, 0);
  const anteilZermuerbung = gesamtZermuerbung / gesamtSpiele;
  if (anteilZermuerbung > korridore.anteilPartienErreichenZermuerbung.max) {
    verletzungen.push(`Anteil Partien erreichen Zermürbung ${pct(anteilZermuerbung)} > ${pct(korridore.anteilPartienErreichenZermuerbung.max)}.`);
  }
  for (const [deck, stat] of (function* (): Generator<[string, { sieg: number; gesamt: number }]> {
    const map = new Map<string, { sieg: number; gesamt: number }>();
    for (const m of ergebnis.matchups) {
      const a = map.get(m.deckA) ?? { sieg: 0, gesamt: 0 };
      a.sieg += m.siegeA;
      a.gesamt += m.siegeA + m.siegeB;
      map.set(m.deckA, a);
      const b = map.get(m.deckB) ?? { sieg: 0, gesamt: 0 };
      b.sieg += m.siegeB;
      b.gesamt += m.siegeA + m.siegeB;
      map.set(m.deckB, b);
    }
    yield* map;
  })()) {
    const [u, o] = wilsonKi(stat.sieg, stat.gesamt);
    if (!imKorridorMitKi(u, o, korridore.deckWinrateGegenTestfeld.min, korridore.deckWinrateGegenTestfeld.max)) {
      verletzungen.push(
        `Deck "${deck}" Winrate ${pct(stat.sieg / stat.gesamt)} [${pct(u)}, ${pct(o)}] außerhalb ${pct(korridore.deckWinrateGegenTestfeld.min)}–${pct(korridore.deckWinrateGegenTestfeld.max)}.`
      );
    }
  }
  return verletzungen;
}

export function erzeugeReport(ergebnis: BacktestErgebnis, korridore: Korridore): string {
  const lines: string[] = [];
  const push = (s: string = '') => lines.push(s);

  push(`# PC Fighters – Backtest-Report`);
  push();
  push(`Erzeugt: ${ergebnis.erzeugtAm} · Grund-Saat: ${ergebnis.saat} · Bot-Profil: \`${ergebnis.profil}\` · Partien je Sitzordnung/Matchup: ${ergebnis.spieleProSitzung}`);
  push();

  const gesamtSpiele = ergebnis.matchups.reduce((s, m) => s + m.spiele, 0);
  const gesamtRunden = ergebnis.matchups.reduce((s, m) => s + m.rundenSumme, 0);
  const gesamtRundenlimit = ergebnis.matchups.reduce((s, m) => s + m.amRundenlimit, 0);
  const gesamtZermuerbung = ergebnis.matchups.reduce((s, m) => s + m.erreichtZermuerbung, 0);
  const gesamtStartspielerSiege = ergebnis.matchups.reduce((s, m) => s + m.siegeStartspieler, 0);
  const gesamtEntschieden = ergebnis.matchups.reduce((s, m) => s + m.siegeA + m.siegeB, 0);

  const minJeMatchup = Math.min(...ergebnis.matchups.map((m) => m.spiele));
  const genugPartien = minJeMatchup >= korridore.mindestPartienJeMatchup;

  push(`## Zusammenfassung`);
  push();
  push(`- Partien insgesamt: **${gesamtSpiele}** über ${ergebnis.matchups.length} Matchups`);
  push(
    `- Mindestens ${korridore.mindestPartienJeMatchup} Partien je Matchup (Grundlage für belastbare Aussagen laut Regelwerk V2 §7): ${ampel(genugPartien)} (kleinster Wert: ${minJeMatchup})`
  );
  push(`- Durchschnittliche Spieldauer: **${(gesamtRunden / gesamtSpiele).toFixed(2)} Runden**`);
  push(`- Startspieler-Vorteil: **${pct(gesamtStartspielerSiege / gesamtEntschieden)}**`);
  push(`- Partien, die die Zermürbungs-Startrunde erreichen (reguläre lange Terminierung): **${pct(gesamtZermuerbung / gesamtSpiele)}**`);
  push(`- Partien am technischen Rundenlimit ("Notbremse" – sollte praktisch nie erreicht werden): **${pct(gesamtRundenlimit / gesamtSpiele)}**`);
  push();

  push(`## Zielkorridore (Regelwerk V2 §7)`);
  push();
  push('| Kennzahl | Gemessen | Korridor | Status |');
  push('|---|---|---|---|');

  {
    const dauer = gesamtRunden / gesamtSpiele;
    const ok = dauer >= korridore.durchschnittlicheSpieldauerRunden.min && dauer <= korridore.durchschnittlicheSpieldauerRunden.max;
    push(
      `| Ø Spieldauer (Runden) | ${dauer.toFixed(2)} | ${korridore.durchschnittlicheSpieldauerRunden.min}–${korridore.durchschnittlicheSpieldauerRunden.max} | ${ampel(ok)} |`
    );
  }
  {
    const startVorteil = gesamtStartspielerSiege / gesamtEntschieden;
    const ok = startVorteil <= korridore.startspielerVorteil.max;
    push(`| Startspieler-Vorteil | ${pct(startVorteil)} | ≤ ${pct(korridore.startspielerVorteil.max)} | ${ampel(ok)} |`);
  }
  {
    const anteilNotbremse = gesamtRundenlimit / gesamtSpiele;
    const ok = anteilNotbremse <= korridore.anteilPartienErreichenNotbremse.max;
    push(
      `| Anteil Partien an der Notbremse (roundLimit) | ${pct(anteilNotbremse)} | ≤ ${pct(korridore.anteilPartienErreichenNotbremse.max)} | ${ampel(ok)} |`
    );
    const anteilZermuerbung = gesamtZermuerbung / gesamtSpiele;
    const okZermuerbung = anteilZermuerbung <= korridore.anteilPartienErreichenZermuerbung.max;
    push(
      `| Anteil Partien erreichen Zermürbung | ${pct(anteilZermuerbung)} | ≤ ${pct(korridore.anteilPartienErreichenZermuerbung.max)} | ${ampel(okZermuerbung)} |`
    );
  }
  {
    const fraktionen = new Map<string, { sieg: number; gesamt: number }>();
    for (const m of ergebnis.matchups) {
      const fa = ergebnis.deckFraktion[m.deckA];
      const fb = ergebnis.deckFraktion[m.deckB];
      if (fa === fb) continue; // nur Oberfraktions-übergreifende Matchups zählen
      const eintragA = fraktionen.get(fa) ?? { sieg: 0, gesamt: 0 };
      eintragA.sieg += m.siegeA;
      eintragA.gesamt += m.siegeA + m.siegeB;
      fraktionen.set(fa, eintragA);
      const eintragB = fraktionen.get(fb) ?? { sieg: 0, gesamt: 0 };
      eintragB.sieg += m.siegeB;
      eintragB.gesamt += m.siegeA + m.siegeB;
      fraktionen.set(fb, eintragB);
    }
    if (fraktionen.size === 0) {
      push(`| Gesamt-Winrate je Oberfraktion | *keine oberfraktions-übergreifenden Matchups im Testfeld* | ${pct(korridore.gesamtWinrateOberfraktion.min)}–${pct(korridore.gesamtWinrateOberfraktion.max)} | ⚪ |`);
    } else {
      for (const [fraktion, { sieg, gesamt }] of fraktionen) {
        const wr = sieg / gesamt;
        const [u, o] = wilsonKi(sieg, gesamt);
        push(
          `| Gesamt-Winrate ${fraktion} (95 %-KI) | ${pct(wr)} [${pct(u)}, ${pct(o)}] | ${pct(korridore.gesamtWinrateOberfraktion.min)}–${pct(korridore.gesamtWinrateOberfraktion.max)} | ${ampelKi(wr, u, o, korridore.gesamtWinrateOberfraktion.min, korridore.gesamtWinrateOberfraktion.max)} |`
        );
      }
    }
  }
  push();

  push(`## Deck-Winraten gegen das gesamte Testfeld`);
  push();
  push('| Deck | Fraktion | Spiele | Siege | Winrate | 95 %-KI | Status |');
  push('|---|---|---|---|---|---|---|');
  const deckStats = new Map<string, { sieg: number; gesamt: number }>();
  for (const m of ergebnis.matchups) {
    const a = deckStats.get(m.deckA) ?? { sieg: 0, gesamt: 0 };
    a.sieg += m.siegeA;
    a.gesamt += m.siegeA + m.siegeB;
    deckStats.set(m.deckA, a);
    const b = deckStats.get(m.deckB) ?? { sieg: 0, gesamt: 0 };
    b.sieg += m.siegeB;
    b.gesamt += m.siegeA + m.siegeB;
    deckStats.set(m.deckB, b);
  }
  for (const [deck, { sieg, gesamt }] of [...deckStats].sort()) {
    const wr = sieg / gesamt;
    const [u, o] = wilsonKi(sieg, gesamt);
    push(
      `| ${deck} | ${ergebnis.deckFraktion[deck] ?? '?'} | ${gesamt} | ${sieg} | ${pct(wr)} | [${pct(u)}, ${pct(o)}] | ${ampelKi(wr, u, o, korridore.deckWinrateGegenTestfeld.min, korridore.deckWinrateGegenTestfeld.max)} |`
    );
  }
  push();

  push(`## Matchup-Matrix (Winrate von deckA, Sitzplatz-gespiegelt)`);
  push();
  push('| deckA | deckB | Spiele | Winrate A | Ø Runden | Notbremse |');
  push('|---|---|---|---|---|---|');
  for (const m of [...ergebnis.matchups].sort((x, y) => (x.deckA + x.deckB).localeCompare(y.deckA + y.deckB))) {
    const entschieden = m.siegeA + m.siegeB;
    const wr = entschieden > 0 ? m.siegeA / entschieden : 0.5;
    push(
      `| ${m.deckA} | ${m.deckB} | ${m.spiele} | ${pct(wr)} | ${(m.rundenSumme / m.spiele).toFixed(1)} | ${pct(m.amRundenlimit / m.spiele)} |`
    );
  }
  push();

  if (ergebnis.botSensitivitaet.length > 0) {
    push(`## Bot-Sensitivität (Winrate-Abweichung zwischen Profilen)`);
    push();
    push(
      '> Zeigt, wie stark die Winrate eines Matchups vom gewählten Bot-Profil abhängt. Ist die Abweichung groß, ' +
        'sagt die Winrate mehr über den Bot als über das Kartenbalancing aus – solche Matchups NICHT als ' +
        'Balancing-Befund interpretieren, sondern mehr Partien/Profile fahren.'
    );
    push();
    push('| Matchup | max. Abweichung | Bewertung |');
    push('|---|---|---|');
    for (const b of ergebnis.botSensitivitaet) {
      const warnung = b.maxAbweichungPp > 15;
      push(`| ${b.matchup} | ${b.maxAbweichungPp.toFixed(1)} pp | ${warnung ? '⚠️ bot-abhängig' : '✓ stabil'} |`);
    }
    push();
  }

  if (ergebnis.zufallsGrundlinien.length > 0) {
    push(`## Zufalls-Grundlinie (Deck vs. Zufalls-Bot)`);
    push();
    push('> Ein Deck, das gegen einen zufällig spielenden Gegner deutlich unter 80 % gewinnt, hat eher ein ' +
      'Pilotierungsproblem (Deck nicht spielbar genug) als ein reines Balancing-Problem.');
    push();
    push('| Deck | Winrate vs. Zufall | Partien | Status |');
    push('|---|---|---|---|');
    for (const z of ergebnis.zufallsGrundlinien) {
      const ok = z.winrateGegenZufall >= 0.8;
      push(`| ${z.deck} | ${pct(z.winrateGegenZufall)} | ${z.partien} | ${ampel(ok)} |`);
    }
    push();
  }

  if (ergebnis.cheerleader && ergebnis.cheerleader.length > 0) {
    push(`## Cheerleader-Reaktionen`);
    push();
    push('> Die Einlösequote ist die interessanteste Spalte: ein Cheerleader, der oft angeboten und ' +
      'fast nie eingelöst wird, ist zu schwach für den Preis eines Bankplatzes. Eine Quote nahe ' +
      '100 % heißt umgekehrt, dass die Entscheidung gar keine ist. Achtung: gemessen mit dem ' +
      'heuristischen Backtest-Bot – für die tatsächliche Attraktivität zählt menschliches Playtesting.');
    push();
    push('| Cheerleader | angeboten | geopfert | Einlösequote | verzichtet | Schaden verursacht | Schaden verhindert | Rettungen |');
    push('|---|---|---|---|---|---|---|---|');
    for (const c of [...ergebnis.cheerleader].sort((a, b) => b.angeboten - a.angeboten)) {
      const quote = c.angeboten > 0 ? c.geopfert / c.angeboten : 0;
      push(
        `| ${c.name} | ${c.angeboten} | ${c.geopfert} | ${pct(quote)} | ${c.verzichtet} | ` +
          `${c.schadenVerursacht} | ${c.schadenVerhindert} | ${c.rettungen} |`
      );
    }
    push();
  }

  push(`## Karten-Kennzahlen`);
  push();
  push(
    '| Karte | Fraktion | Deck-Präsenz | Keep | Ausspielrate | gespielt | Schaden (Kreatur/Basis) | Kills/Tode | Aura/Wachstum/Gift/Flink | Endhand nie legal/nicht gewählt | Hinweis |'
  );
    push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const k of [...ergebnis.karten].sort((a, b) => a.faction.localeCompare(b.faction) || a.name.localeCompare(b.name))) {
    const hinweise: string[] = [];
    if (k.deckPraesenzAnteil > korridore.einzelkartePraesenzInDecksDerOberfraktion.maxAnteil) hinweise.push('Präsenz hoch');
    if (k.ausspielrateAnteil < korridore.einzelkarteAusspielrate.minAnteil) hinweise.push('Ausspielrate niedrig');
    if (k.mulliganKeepRate != null && k.mulliganKeepRate > korridore.einzelkarteMulliganKeepRate.maxAnteil) hinweise.push('Keep-Rate hoch');
    push(
      `| ${k.name} | ${k.faction} | ${pct(k.deckPraesenzAnteil)} | ${k.mulliganKeepRate == null ? '–' : pct(k.mulliganKeepRate)} | ${pct(k.ausspielrateAnteil)} | ${k.gespielt} | ${k.schadenKreatur}/${k.schadenBasis} | ${k.kills}/${k.gestorben} | ${k.auraAusloesungen}/${k.wachstumAusloesungen}/${k.giftZerstoerungen}/${k.flinkAngriffe} | ${k.endhandNieLegal}/${k.endhandNichtGewaehlt} | ${hinweise.join(', ') || '–'} |`
    );
  }
  push();
  push(`> Keep-Raten beziehen sich auf das deterministische Bot-Mulligan; „nie legal“ und „nicht gewählt“ zählen physische Kartenkopien der Endhand.`);
  push();

  push(`## Priorität für den ersten Test (aus Regelwerk V2 §7)`);
  push();
  for (const p of korridore.prioritaetErsterTest) push(`- ${p}`);
  push();

  return lines.join('\n');
}
