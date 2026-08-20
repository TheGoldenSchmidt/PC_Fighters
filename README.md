# Political Correct Fighters 🃏

Ein digitales Karten-Duell für zwei Spieler: **Humans gegen Animals**.
Gespielt wird auf zwei Geräten (z. B. zwei Handys) im selben WLAN – eines erstellt die Partie, das andere tritt mit einem 4-stelligen Raum-Code bei.

Diese Anleitung ist bewusst einfach gehalten. Du musst **nicht programmieren können**, um das Spiel zu starten oder eigene Karten, Fraktionen und Schauplätze hinzuzufügen.

> **Woran gerade gearbeitet wird:** [docs/STATUS.md](docs/STATUS.md) – der aktuelle Stand (Now / Next / Later), letzte Messwerte und offene Entscheidungen.

---

## 1. Spiel starten (lokal im WLAN)

Du brauchst einmalig [Node.js](https://nodejs.org) (LTS-Version reicht). Danach:

**Schritt 1 – Terminal öffnen:**
Drücke die Windows-Taste, tippe `cmd` und drücke Enter. (Auf dem Mac: Programm „Terminal" öffnen.)

**Schritt 2 – In den Spielordner wechseln und einmalig installieren:**

```
cd C:\Users\PCUser\PC_Fighters
npm install
```

Das lädt alle benötigten Bausteine herunter (dauert beim ersten Mal ein paar Minuten).

**Schritt 3 – Den Spielserver starten:**

```
npm run server
```

Lass dieses Fenster offen! Es zeigt dir eine Zeile wie:

```
→ http://192.168.178.66:3000
```

Das ist die **Adresse deines Rechners im WLAN** – die brauchen wir gleich.

**Schritt 4 – Den Spiel-Client starten** (zweites Terminal-Fenster öffnen, wieder in den Ordner wechseln):

```
cd C:\Users\PCUser\PC_Fighters
npm run client
```

Auch hier erscheint eine „Network"-Adresse, z. B. `http://192.168.178.66:5173`.

**Schritt 5 – Auf den Handys spielen:**

1. **Spieler 1** öffnet auf seinem Handy im Browser die Client-Adresse (z. B. `http://192.168.178.66:5173`), wählt einen Champ, ein passendes Deck und einen Schauplatz und tippt auf **„Partie erstellen"**. Es erscheinen ein 4-stelliger Raum-Code und ein QR-Code.
2. **Spieler 2** scannt einfach den QR-Code mit der Handy-Kamera – Adresse und Raum-Code werden automatisch ausgefüllt. (Oder von Hand: dieselbe Adresse im Browser öffnen, Champ und Deck wählen, „Partie beitreten", Raum-Code eintippen.)

> **Tipp:** Falls du deine WLAN-Adresse selbst herausfinden willst: Im Terminal `ipconfig` eintippen (Mac/Linux: `ifconfig`) und nach „IPv4-Adresse" suchen – das ist die Nummer im Format `192.168.x.x`.

**Typische Stolperfallen:**

- **Beide Geräte müssen im selben WLAN sein.** Gäste-WLANs trennen Geräte oft voneinander ab – dann findet das Handy den Rechner nicht. Normales Heim-WLAN benutzen.
- **Windows-Firewall:** Beim ersten Start fragt Windows eventuell, ob Node.js ins Netzwerk darf → **„Zulassen"** anklicken (für „private Netzwerke" reicht).
- Wenn auf dem Handy nichts lädt: prüfen, ob wirklich die `192.168...`-Adresse benutzt wird (nicht „localhost" – das funktioniert nur auf dem Rechner selbst).
- Bricht die WLAN-Verbindung kurz ab, verbindet sich das Spiel **automatisch neu** – einfach kurz warten, die Partie geht weiter.

---

### Deckwahl und Mulligan

Vor einer Partie wählst du einen von sechs **Champs**. Jeder Champ gehört zu Humans oder Animals und legt genau zwei Klassen fest. Sein Deck enthält 40 Karten aus beiden Klassen (plus optional neutrale Karten), höchstens vier Exemplare je Karte. Zu jedem Champ gibt es ein Startdeck. Nach dem Beitritt tauschen beide Spieler im Mulligan optional beliebig viele Karten; Runde 1 beginnt erst nach beiden Bestätigungen.

### Optionale Benutzerkonten

Ohne Anmeldung funktioniert das Spiel unverändert als Gast; eigene Decks und die Bilanz bleiben dann lokal in diesem Browser. Mit einem freigeschalteten Benutzernamen speichert der Server eigene Decks, Siege, Niederlagen, Unentschieden und Siegesserien. Ein Passwort gibt es in dieser ersten Version bewusst noch nicht – der Benutzername identifiziert nur das Profil und schützt es nicht vor anderen Personen.

Welche Namen sich anmelden dürfen, legst du in `users.json` im Hauptordner fest:

```json
{
  "users": ["Ada", "Berta", "Chris"]
}
```

Nach einer Änderung den Server neu starten. Die eigentlichen Kontodaten schreibt der Server automatisch nach `users_persist.json`; diese Datei gehört nicht ins Git-Repository. Für einen Cloud-Server muss der Ordner dauerhaft gespeichert werden, sonst gehen die Laufzeitdaten bei einem vollständigen Neuaufsetzen des Dienstes verloren.

### Balancing-Backtest

Ein vollständiger sitzplatzgespiegelter Lauf mit 100 Partien je Matchup wird so gestartet:

```
npm run backtest -- --spiele 50
```

`--spiele 50` bedeutet 50 Partien **je Sitzordnung und Matchup**, also 100 je Matchup. Jeder Lauf erzeugt unter `backtest-results/<Zeitstempel>/` automatisch `report.md`, `summary.json` und `matches.jsonl`. Ein eigener Ausgabeordner ist mit `--out backtest-results/mein-lauf` möglich; sowohl `--spiele 50` als auch `--spiele=50` werden akzeptiert.

Das Ergebnis des jeweils letzten vollständigen Laufs steht in [docs/STATUS.md](docs/STATUS.md).

---

## 2. Eine neue Karte hinzufügen

Alle Karten liegen als einfache Textdateien hier:

```
packages/engine/src/data/cards/guardian.json
packages/engine/src/data/cards/kabloom.json
packages/engine/src/data/cards/mega_grow.json
packages/engine/src/data/cards/solar.json
packages/engine/src/data/cards/beastly.json
packages/engine/src/data/cards/brainy.json
packages/engine/src/data/cards/hearty.json
packages/engine/src/data/cards/sneaky.json
packages/engine/src/data/cards/neutral.json
packages/engine/src/data/cards/superpowers.json
```

**So geht's:** Datei mit einem Texteditor öffnen (z. B. Editor/Notepad), einen bestehenden Karten-Block **kopieren**, ein Komma dahinter setzen, die Werte ändern, speichern, Server neu starten (im Server-Fenster `Strg+C`, dann wieder `npm run server`) und die Seite im Browser neu laden.

Beispiel – eine neue Kreatur der Human-Klasse `hearty`:

```json
{
  "id": "veteranin",
  "name": "Veteranin",
  "faction": "hearty",
  "type": "creature",
  "cost": 3,
  "attack": 3,
  "health": 3,
  "keywords": [],
  "text": "Hat schon alles gesehen."
}
```

Wichtig:

- **`id`** muss einmalig sein (kleingeschrieben, keine Leerzeichen).
- **`faction`** ist die Klasse, nicht nur die Seite. Animals nutzen `guardian`, `kabloom`, `mega_grow`, `solar`; Humans nutzen `beastly`, `brainy`, `hearty`, `sneaky`.
- Die sichtbaren Klassennamen sind **Schutzinstinkt**, **Wildtrieb**, **Rudelstärke**, **Lebenskreis**, **Muskelkraft**, **Denkfabrik**, **Zusammenhalt** und **Untergrund**. Die technischen IDs bleiben absichtlich stabil.
- Ein Champ-Deck enthält genau **40 Karten**, höchstens **4×** dieselbe Karte und mindestens eine Karte aus jeder seiner beiden Klassen. `neutral` ist für jeden Champ erlaubt.
- Superkräfte stehen in `superpowers.json`, sind `"deckable": false` und werden ausschließlich vom Champ vergeben.
- **Aktionskarten** haben `"type": "action"` und statt Angriff/Leben ein `"effect"`. Umgebungen verwenden `"type": "environment"` und belegen eine Lane. Der generische Effekt `referenz` bewahrt den Originaltext des importierten Sets; für individuelle Regeln können weiterhin feste Effekt-Primitiven ergänzt werden.

| Effekt | Was er tut | Beispiel |
|---|---|---|
| `buffHealth` | Eine eigene Kreatur bekommt dauerhaft +X Leben | `{ "kind": "buffHealth", "amount": 3, "target": "friendlyCreature" }` |
| `buffAttackTemp` | +X Angriff bis zum Rundenende | `{ "kind": "buffAttackTemp", "amount": 2, "target": "friendlyCreature" }` |
| `summon` | Beschwört Token-Kreaturen in freie Lanes | `{ "kind": "summon", "count": 2, "token": { "name": "Rekrut-Token", "attack": 1, "health": 1, "keywords": [] } }` |
| `moveCreature` | Bewegt eine eigene Kreatur in eine freie Lane | `{ "kind": "moveCreature", "target": "friendlyCreature" }` |

**Alle verfügbaren Keywords** (in `"keywords": [...]` eintragen):

| Keyword | Bedeutung |
|---|---|
| `flink` | Kreatur ist beim Ausspielen nicht erschöpft und kämpft sofort mit. |
| `fliegend` | Darf nach der Kampfphase in eine freie eigene Lane wechseln. |
| `team_up` | Darf sich eine Lane mit genau einer weiteren eigenen Kreatur teilen. |
| `amphibious` | Darf in der Wasser-Lane gespielt werden. |
| `bullseye` | Basistreffer laden den Superblock nicht auf. |
| `armored` | Reduziert erlittenen Kampfschaden. |
| `deadly` | Zerstört eine getroffene Kreatur unabhängig von deren Restleben. |
| `double_strike` | Greift in derselben Kampfphase ein zweites Mal an. |
| `frenzy` | Greift nach dem Besiegen eines Gegners erneut an. |
| `hunt` | Folgt einer neu gespielten gegnerischen Kreatur in deren Lane. |
| `strikethrough` | Überschüssiger Schaden trifft die gegnerische Basis. |
| `untrickable` | Kann nicht von gegnerischen Aktionen als Ziel gewählt werden. |
| `gravestone` | Liegt bis zum Vor-Kampf-Fenster verdeckt. |
| `overshoot` | Fügt beim Aufdecken vor dem Kampf Basisschaden zu. |

Alles Parametrisierbare (Auren, Gift, Heilung, Skalierung nach Anzahl
Verbündeter, Kampfboni, …) ist kein Keyword mehr, sondern eine **Fähigkeit**
(`"abilities": [...]` auf der Karte, z. B. `{ "kind": "gift", "staerke": 2 }`
oder `{ "kind": "aura", "scope": "any", "buff": { "atk": 1, "hp": 1 },
"timing": "dauerhaft" }`). Die vollständige Liste mit Erklärungstext steht in
`packages/engine/src/abilities.ts` (`ABILITIES`-Registry), die Parameter je
Primitiv im `Ability`-Union-Typ in `packages/engine/src/types.ts`.

**Bild für eine Karte:** Lege einfach ein PNG mit dem Namen der Karten-id in den Ordner `packages/client/public/assets/cards/` – z. B. `veteranin.png`. Fertig, kein Code nötig. Ohne Bild zeigt die Karte ein Symbol.

### Identitätskatalog

`packages/engine/src/data/identity-catalog.json` ist der Autorenbrief für den gesamten Kartenkosmos. Jede Karte und jeder Champ steht dort genau einmal mit Seite, Klasse, Körperform, geplantem Grundgerüst sowie kurzen Briefs für Figur und Kartenbild. Beim Serverstart wird der Katalog gegen die echten Kartendaten geprüft; fehlende, doppelte oder zur Seite unpassende Einträge erscheinen als verständlicher Datenfehler.

Die Kartendateien bleiben die Quelle für sichtbaren Namen und Regeln. `referenceName` sowie `referenz.text` bewahren nur intern die importierte Regelherkunft und werden von Umbenennungen nicht verändert. Karten-IDs sollten nicht geändert werden, weil Decks, Bilder und Figuren sie als stabilen Schlüssel benutzen.

`npm run list-missing-art` zeigt alle Karten ohne Bild, gruppiert nach Fraktion, inkl. Name/Typ/Text – praktisch als Grundlage für Prompts (z. B. bei ChatGPT). Kommt das Bild von Hand (gemalt oder KI-generiert) statt aus `scripts/render-card-art.mjs`, die Karten-id zusätzlich in die `MANUAL_ART`-Liste am Kopf dieses Skripts eintragen, sonst überschreibt ein erneuter Render-Lauf das Bild wieder.

---

## 3. Regeln ändern

Die Datei `packages/engine/src/data/config.json` enthält alle Spielregeln als Zahlen:

| Wert | Bedeutung |
|---|---|
| `lanes` | Verbindliche Anzahl der Kampfbahnen. Dieser Wert muss dauerhaft `5` sein und kann beim Erstellen einer Partie nicht geändert werden. |
| `baseHealth` | Lebenspunkte jeder Basis (aktuell: 20) |
| `startingHand` | Reguläre Handkarten zu Spielbeginn (aktuell: 4; dazu kommt eine zufällige Champ-Superkraft) |
| `handLimit` | Maximale Handgröße (aktuell: 10) |
| `cardsDrawnPerTurn` | Karten, die jede Runde gezogen werden |
| `energy.start` / `energy.perRound` | Energie in Runde 1 bzw. Zuwachs pro Runde danach (aktuell: 1 / 1) |
| `energy.cap` | Maximale Energie (aktuell: 10) |
| `deckbuilding.size` | Karten pro Deck (aktuell: 40) |
| `deckbuilding.maxCopies` | Wie oft dieselbe deckbare Karte im Deck stecken darf (aktuell: 4) |
| `zermuerbung.abRunde` / `.schaden` / `.steigerung` | Ab dieser Runde verlieren beide Basen am Rundenende `schaden` Leben, danach je weitere Runde zusätzlich `steigerung` mehr – das ist der reguläre Weg, wie lange Partien enden (V2 will explizit „kein Rundenlimit", siehe `docs/regelwerk-v2.md` §1/§7) |
| `roundLimit` | Technische Notbremse weit über der Zermürbung (aktuell 30) – wird im Normalspiel nie erreicht; jeder Treffer ist ein Bug-Report |
| `schild.abschnitte` | Wie viele Abschnitte der Superblock-Leiste voll werden müssen (aktuell: 8) |
| `schild.ladung.min` / `.max` | Spanne, um die ein Treffer den Schild auflädt (Standard 1–3) |
| `schild.cheerleaders` | Die drei sichtbaren Träger der nach der Startkraft übrigen Champ-Superkräfte |

Zahl ändern, speichern, Server neu starten – fertig.

### Superblock und Champ-Superkräfte

Neben jeder Basis steht eine Leiste aus **8 Abschnitten**. Normale Basistreffer laden sie
zufällig um 1 bis 3 Abschnitte. Wird sie voll, wird der aktuelle Treffer vollständig
geblockt und die Leiste zurückgesetzt. Die drei nach der zufälligen Startkraft übrigen
Superkräfte liegen auf den drei Cheerleadern. Du wählst einen Cheerleader und damit gezielt
die gewünschte Kraft für deine Hand. Diese Superkraft kann unmittelbar kostenlos gespielt werden. Wer
stattdessen passt oder eine andere Karte spielt, behält sie auf der Hand und zahlt später
ihre regulären Kosten von 1 Energie.

Jeder Champ startet mit einer zufälligen seiner vier Superkräfte und kann höchstens drei
weitere über Superblocks erhalten. Der gewählte Cheerleader verlässt danach die Bank, die
beiden anderen Angebote bleiben erhalten. `bullseye`-Treffer laden die Leiste nicht auf;
Zermürbung am Rundenende bleibt ebenfalls unblockbar.

---

## 4. Eine neue Klasse oder einen Champ anlegen

Die Hierarchie lautet **Seite → Klasse → Tribe**. `animals` und `humans` sind Seiten,
darunter liegen die deckbaurelevanten Klassen. Tribes sind optionale Merkmale direkt auf
Karten und keine eigene Deckauswahl.

1. Neue Datei in `packages/engine/src/data/cards/` anlegen, z. B. `technik.json` – mit einer Kartenliste wie in Abschnitt 2 (bei allen Karten `"faction": "technik"`).
2. In `packages/engine/src/data/factions.json` die Klasse mit ihrer Seite als `parent` ergänzen:

```json
{
  "id": "technik",
  "name": "Technik",
  "parent": "humans",
  "description": "Kalte Logik und Stahl."
}
```

3. Einen Champ in `packages/engine/src/data/champions.json` ergänzen. Er braucht genau zwei
   Klassen sowie vier IDs aus `cards/superpowers.json`. Ein spielbares Preset liegt als
   gleichnamige Datei unter `data/decks/` und nennt den `championId`.

Das Spiel lädt **automatisch alle** Kartendateien aus dem Ordner und prüft beim Serverstart,
ob Klassen, Champ, Superkräfte und Deck zueinander passen.

**Neuer Schauplatz** geht genauso einfach: In `packages/engine/src/data/topics.json` einen Block kopieren und anpassen (Name, Emoji und vier Farben – `background` darf auch ein Farbverlauf sein). Der Ersteller einer Partie kann ihn dann auswählen.

---

## 5. Wenn etwas kaputt ist

Keine Sorge: Wenn eine JSON-Datei einen Fehler hat (z. B. ein vergessenes Komma), stürzt nichts ab. Stattdessen zeigt das Spiel **im Browser eine rote Fehlermeldung**, die genau sagt, **welche Datei, welche Karte und welches Feld** betroffen ist. Meldung lesen, Stelle korrigieren, Server neu starten.

Letzte Änderung rückgängig machen:

- Im Texteditor: einfach `Strg+Z` und erneut speichern.
- Oder mit Git alles auf den letzten gespeicherten Stand zurücksetzen:

```
git restore packages/engine/src/data/cards/hearty.json
```

(Dateiname anpassen – das holt die zuletzt committete Version zurück.)

---

## 6. Änderungen auf GitHub speichern

Das Projekt liegt online unter: **https://github.com/TheGoldenSchmidt/PC_Fighters**

Wenn du etwas geändert hast (neue Karte, andere Regeln …), sichere es mit diesen drei Befehlen im Terminal:

```
git add .
git commit -m "Neue Karte Veteranin hinzugefügt"
git push
```

Was sie bedeuten:

1. `git add .` – „Merke alle geänderten Dateien vor."
2. `git commit -m "..."` – „Speichere sie als Paket mit dieser Beschreibung." (Text in den Anführungszeichen frei wählen)
3. `git push` – „Lade das Paket zu GitHub hoch."

Danach ist der Stand online gesichert – auch wenn dem Rechner etwas passiert.

---

## 7. Von überall spielen (kostenlos online stellen)

Wenn du **keinen Rechner mehr laufen lassen** willst, kannst du das Spiel einmalig
kostenlos ins Internet stellen. Danach öffnen beide Spieler einfach eine feste
Internet-Adresse auf dem Handy – von überall, nicht nur im selben WLAN. Kein
Terminal, keine Installation, keine Adresse eintippen.

Wir nutzen dafür **Render** (kostenloser Tarif). Das Projekt ist dafür schon
vorbereitet: Ein einziger Server liefert die Spielseite aus **und** hält die
Verbindungen.

**So geht's (einmalig, ca. 5 Minuten):**

1. Gehe auf **[render.com](https://render.com)** und erstelle ein kostenloses
   Konto – am einfachsten mit „Sign up with GitHub" (dann ist dein Repo direkt
   verbunden).
2. Klicke oben auf **New** → **Blueprint**.
3. Wähle dein Repo **PC_Fighters** aus der Liste. Render erkennt die Datei
   `render.yaml` automatisch und schlägt einen Web-Dienst namens `pc-fighters`
   vor. Bestätige mit **Apply** / **Create**.
4. Render baut jetzt das Spiel (dauert 2–3 Minuten). Danach bekommst du oben eine
   Adresse wie **`https://pc-fighters.onrender.com`**.
5. Fertig. Diese Adresse teilst du – beide Spieler öffnen sie auf dem Handy,
   wählen Champ, Deck + Schauplatz, „Partie erstellen", Code oder QR-Code teilen,
   der andere tritt bei. Los geht's.

**Gut zu wissen:**

- Beim kostenlosen Tarif „schläft" der Server nach ~15 Minuten ohne Nutzung ein.
  Der erste Spieler, der die Seite dann öffnet, wartet einmalig **~30–60 Sekunden**,
  bis der Server wieder wach ist. Danach läuft alles normal.
- Jedes Mal, wenn du etwas änderst und mit `git push` hochlädst (siehe Abschnitt 6),
  baut Render die neue Version **automatisch** – du musst nichts weiter tun.
- Das lokale Spiel im WLAN (Abschnitte 1–5) funktioniert weiterhin genauso; die
  Cloud ist nur eine zusätzliche Möglichkeit.

---

## Für Neugierige: Wie das Projekt aufgebaut ist

```
packages/engine   → die Spielregeln (Karten, Keywords, Kampf) – nur Logik + Daten
packages/server   → verwaltet Räume und Spielstände, verteilt sie an beide Handys
packages/client   → das, was ihr im Browser seht
```

Die Engine kennt weder Netzwerk noch Oberfläche – deshalb können Karten, Regeln, Fraktionen und Schauplätze rein über die JSON-Dateien erweitert werden. Wer testen will, ob nach eigenen Änderungen noch alles stimmt: `npm test`.
