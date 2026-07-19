# Political Correct Fighters 🃏

Ein digitales Karten-Duell für zwei Spieler: **Humans gegen Animals**.
Gespielt wird auf zwei Geräten (z. B. zwei Handys) im selben WLAN – eines erstellt die Partie, das andere tritt mit einem 4-stelligen Raum-Code bei.

Diese Anleitung ist bewusst einfach gehalten. Du musst **nicht programmieren können**, um das Spiel zu starten oder eigene Karten, Fraktionen und Schauplätze hinzuzufügen.

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

1. **Spieler 1** öffnet auf seinem Handy im Browser die Client-Adresse (z. B. `http://192.168.178.66:5173`), wählt eine Fraktion und einen Schauplatz und tippt auf **„Partie erstellen"**. Es erscheinen ein 4-stelliger Raum-Code und ein QR-Code.
2. **Spieler 2** scannt einfach den QR-Code mit der Handy-Kamera – Adresse und Raum-Code werden automatisch ausgefüllt. (Oder von Hand: dieselbe Adresse im Browser öffnen, Fraktion wählen, „Partie beitreten", Raum-Code eintippen.)

> **Tipp:** Falls du deine WLAN-Adresse selbst herausfinden willst: Im Terminal `ipconfig` eintippen (Mac/Linux: `ifconfig`) und nach „IPv4-Adresse" suchen – das ist die Nummer im Format `192.168.x.x`.

**Typische Stolperfallen:**

- **Beide Geräte müssen im selben WLAN sein.** Gäste-WLANs trennen Geräte oft voneinander ab – dann findet das Handy den Rechner nicht. Normales Heim-WLAN benutzen.
- **Windows-Firewall:** Beim ersten Start fragt Windows eventuell, ob Node.js ins Netzwerk darf → **„Zulassen"** anklicken (für „private Netzwerke" reicht).
- Wenn auf dem Handy nichts lädt: prüfen, ob wirklich die `192.168...`-Adresse benutzt wird (nicht „localhost" – das funktioniert nur auf dem Rechner selbst).
- Bricht die WLAN-Verbindung kurz ab, verbindet sich das Spiel **automatisch neu** – einfach kurz warten, die Partie geht weiter.

---

## 2. Eine neue Karte hinzufügen

Alle Karten liegen als einfache Textdateien hier:

```
packages/engine/src/data/cards/humans.json
packages/engine/src/data/cards/animals.json
```

**So geht's:** Datei mit einem Texteditor öffnen (z. B. Editor/Notepad), einen bestehenden Karten-Block **kopieren**, ein Komma dahinter setzen, die Werte ändern, speichern, Server neu starten (im Server-Fenster `Strg+C`, dann wieder `npm run server`) und die Seite im Browser neu laden.

Beispiel – eine neue Human-Kreatur:

```json
{
  "id": "veteranin",
  "name": "Veteranin",
  "faction": "humans",
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
- Jede Karte kommt automatisch **2×** ins Deck. Steht `"signature": true` dabei (die ★-Karte), nur **1×**.
- **Aktionskarten** haben `"type": "action"` und statt Angriff/Leben ein `"effect"`. Es gibt vier Effekt-Arten:

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
| `rudel` | +1 Angriff, solange eine andere verbündete Animal-Kreatur auf dem Feld ist. |
| `gift` | Fügt diese Kreatur einer anderen Kreatur Schaden zu, stirbt diese sofort. |
| `fliegend` | Darf nach der Kampfphase in eine freie eigene Lane wechseln. |
| `schild_nachbarn` | Verbündete in direkt benachbarten Lanes erhalten +0/+1. |
| `banner_nachbarn` | Verbündete in direkt benachbarten Lanes erhalten +1/+0. |
| `aura_alle` | Alle anderen Verbündeten erhalten +1/+1. |
| `alpha_aura` | Andere verbündete Animal-Kreaturen erhalten +1/+0. |
| `heilt_nachbarn` | Heilt am Rundenende Verbündete in Nachbar-Lanes um 1. |

**Bild für eine Karte:** Lege einfach ein PNG mit dem Namen der Karten-id in den Ordner `packages/client/public/assets/cards/` – z. B. `veteranin.png`. Fertig, kein Code nötig. Ohne Bild zeigt die Karte ein Symbol.

---

## 3. Regeln ändern

Die Datei `packages/engine/src/data/config.json` enthält alle Spielregeln als Zahlen:

| Wert | Bedeutung |
|---|---|
| `lanes` | Anzahl der Kampfbahnen (Standard 3 – bei 4 zeigt das Spiel wirklich 4 Lanes!) |
| `baseHealth` | Lebenspunkte jeder Basis |
| `deckSize` | Karten pro Deck (ist das Deck durch neue Karten größer, wird nach dem Mischen auf diese Zahl gekürzt) |
| `startingHand` | Handkarten zu Spielbeginn |
| `cardsDrawnPerTurn` | Karten, die jede Runde gezogen werden |
| `energyCap` | Maximale Energie (Energie = Rundenzahl, aber nie mehr als das) |
| `roundLimit` | Nach dieser Runde gewinnt, wer mehr Basis-Leben hat |
| `maxCopiesPerCard` | Wie oft jede Karte im Deck steckt (★-Karten immer nur 1×) |

Zahl ändern, speichern, Server neu starten – fertig.

---

## 4. Eine neue Fraktion anlegen

1. Neue Datei in `packages/engine/src/data/cards/` anlegen, z. B. `roboter.json` – mit einer Kartenliste wie in Abschnitt 2 (bei allen Karten `"faction": "roboter"`).
2. In `packages/engine/src/data/factions.json` einen Eintrag ergänzen:

```json
{
  "id": "roboter",
  "name": "Roboter",
  "color": "#8888ff",
  "description": "Kalte Logik und Stahl."
}
```

Das Spiel lädt **automatisch alle** Kartendateien aus dem Ordner – die neue Fraktion erscheint nach dem Server-Neustart im Startbildschirm.

**Neuer Schauplatz** geht genauso einfach: In `packages/engine/src/data/topics.json` einen Block kopieren und anpassen (Name, Emoji und vier Farben – `background` darf auch ein Farbverlauf sein). Der Ersteller einer Partie kann ihn dann auswählen.

---

## 5. Wenn etwas kaputt ist

Keine Sorge: Wenn eine JSON-Datei einen Fehler hat (z. B. ein vergessenes Komma), stürzt nichts ab. Stattdessen zeigt das Spiel **im Browser eine rote Fehlermeldung**, die genau sagt, **welche Datei, welche Karte und welches Feld** betroffen ist. Meldung lesen, Stelle korrigieren, Server neu starten.

Letzte Änderung rückgängig machen:

- Im Texteditor: einfach `Strg+Z` und erneut speichern.
- Oder mit Git alles auf den letzten gespeicherten Stand zurücksetzen:

```
git restore packages/engine/src/data/cards/humans.json
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
   wählen Fraktion + Schauplatz, „Partie erstellen", Code oder QR-Code teilen,
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
