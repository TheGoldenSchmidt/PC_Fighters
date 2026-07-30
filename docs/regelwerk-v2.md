# PC Fighters – Balancing V2

**Ziel:** Ein taktisches 3-Lane-Kartenspiel mit kurzen Partien, klaren Fraktionsidentitäten und Decks, die Unterfraktionen innerhalb von **Menschen** beziehungsweise **Tieren** frei kombinieren können.

**Status:** Theoretisch vorbalancierte Alpha-Fassung. Die Werte sind als belastbarer Ausgangspunkt für Playtests gedacht, nicht als statistisch bewiesenes Endbalancing.

> Die zuletzt **gemessenen** Werte gegen die Zielkorridore aus §7 stehen in [STATUS.md](STATUS.md).

---

## 1. Globale Spielparameter

* **Lanes:** 3
* **Basis-Lebenspunkte:** 15
* **Starthand:** 4 Karten; einmaliger Mulligan empfohlen
* **Kartenzug:** 1 pro Runde
* **Rundenlimit:** keines
* **Energie:** Runde 1 = 1 Energie, danach +1 pro Runde
* **Deckgröße:** genau 20 Karten, später auf 40 erweiterbar mit eigener Deckkreation
* **Kopien:** maximal 3 je normaler Karte, maximal 2 je Signature-Karte ★
* **Fraktionsregel:** Ein Deck enthält ausschließlich Karten einer Oberfraktion: `humans` **oder** `animals`.
* **Unterfraktionen:** Innerhalb der gewählten Oberfraktion dürfen alle Unterfraktionen frei kombiniert werden.
* **Board-Annahme für diese Balance:** Pro Spieler maximal eine Kreatur je Lane.

### Zielwerte für Decks

* 4–6 Karten für 1 Energie
* 5–7 Karten für 2 Energie
* 4–6 Karten für 3 Energie
* 3–5 Karten für 4 Energie
* 2–4 Karten für 5+ Energie
* Mindestens 4 Karten, die aus einer schlechten Boardposition wieder ins Spiel helfen
* Maximal 4 Karten, die nur bei bereits überlegenem Board stark sind

---

## 2. Einheitliche Regeln und Keywords

### Timing

* **Beim Ausspielen:** Löst genau einmal aus, nachdem die Karte eine Lane betreten hat.
* **Rundenbeginn:** Zu Beginn der Runde des Besitzers; jede Fähigkeit maximal einmal pro Runde.
* **Rundenende:** Am Ende der Runde des Besitzers.
* **Aura:** Gilt nur, solange die Quelle auf dem Feld liegt.
* **Dauerhaft:** Bleibt auch bestehen, wenn die Quelle das Feld verlässt.
* **Heilung:** Kann eine Kreatur nicht über ihre maximalen HP hinaus heilen.

### Keywords

* **Flink:** Kann in der Runde angreifen, in der sie ausgespielt wurde.
* **Fliegend:** Darf sich nach dem Kampf in eine freie eigene Lane bewegen.
* **Rudel:** +1 ATK, solange mindestens ein weiteres verbündetes Tier auf dem Feld ist.
* **Gift X:** Wenn diese Kreatur einer gegnerischen Kreatur Kampfschaden zufügt, erhält diese X Giftmarker. Bei 3 Giftmarkern wird sie nach dem Kampf zerstört. Giftmarker bleiben bestehen.
* **Dornen X:** Nach einem Kampf erleidet die angreifende gegnerische Kreatur X Schaden.
* **Wucht:** Überschüssiger Kampfschaden an einer Kreatur trifft die gegnerische Basis.
* **Zäh:** Das erste Mal, wenn diese Kreatur sterben würde, bleibt sie stattdessen mit 1 HP und verliert Zäh.
* **Sturzflug X:** Beim Ausspielen fügt diese Kreatur der gegnerischen Kreatur in ihrer Lane X Schaden zu. Ist die Lane leer, entsteht kein Basisschaden.
* **Wachstum +A/+H:** Zu Beginn deiner Runde erhält die Kreatur dauerhaft den angegebenen Bonus, soweit kein Limit genannt ist.
* **Wissen:** Globaler Marker des Spielers; wird von Studentenkarten erzeugt und ausgegeben.

### Scope

* `same_sub`: nur dieselbe Unterfraktion
* `same_top`: jede Karte derselben Oberfraktion
* `any`: jede verbündete Kreatur

**Designregel:** Kernkarten einer Unterfraktion belohnen `same_sub`; Brückenkarten und Basiskarten verwenden `same_top`, damit gemischte Decks konkurrenzfähig bleiben.

---

# 3. Oberfraktion Menschen (`humans`)

**Identität:** Aufbauen, schützen, heilen, Karten erzeugen und durch koordinierte Einheiten gewinnen. Menschen sind im Einzelwert durchschnittlich, erhalten aber planbare Vorteile durch Nachbarn und Team-Synergien.

## Menschen – Basiskarten (`humans`)

|Karte|Typ|Kosten|ATK|HP|Fähigkeit|Sig|Neuer Kartentext|
|-|-:|-:|-:|-:|-|:-:|-|
|Rekrut (`rekrut`)|Kreatur|1|2|1|–|–|Ein einfacher, effizienter Soldat.|
|Schildwache (`schildwache`)|Kreatur|2|1|4|`schild_nachbarn(scope:same_top, hp:1)`|–|Benachbarte verbündete Menschen erhalten +0/+1, solange die Schildwache lebt.|
|Schildwall (`schildwall`)|Aktion|1|–|–|`buffHealth(target:friendlyCreature, amount:2, permanent:true)`|–|Eine verbündete Kreatur erhält dauerhaft +0/+2.|
|Feldscherin (`feldscherin`)|Kreatur|2|1|3|`heilung(reichweite:nachbar, amount:1, targets:1)`|–|Rundenende: Heile eine benachbarte verbündete Kreatur um 1.|
|Mobilmachung (`mobilmachung`)|Aktion|3|–|–|`summon(count:2, token:Rekrut-Token 1/1)`|–|Beschwöre bis zu zwei 1/1-Rekrut-Token in freie eigene Lanes.|
|Bannerträger (`bannertraeger`)|Kreatur|3|2|4|`banner_nachbarn(scope:same_top, atk:1)`|–|Benachbarte verbündete Menschen erhalten +1/+0, solange der Bannerträger lebt.|
|Ritter (`ritter`)|Kreatur|4|4|5|–|–|Stahl auf zwei Beinen.|
|Kommandantin (`kommandantin`)|Kreatur|5|3|6|`aura(scope:same_top, otherOnly:true, atk:1, hp:1)`|★|★ Andere verbündete Menschen erhalten +1/+1, solange die Kommandantin lebt.|

### Balancefunktion

Die Basiskarten sind das Bindeglied aller Menschen-Unterfraktionen. Schildwache, Feldscherin, Bannerträger und Kommandantin funktionieren bewusst mit **allen Menschen**, aber ihre Effekte sind positionsabhängig oder an eine verwundbare Auraquelle gebunden.

---

## Die Sozis (`sozis`)

**Identität:** Breites Board, Schutz schwächerer Einheiten, Angriffssenkung und gemeinschaftliche Boni. Gute Mischfraktion für Obdachlose und Studenten.

|Karte|Typ|Kosten|ATK|HP|Fähigkeit|Sig|Neuer Kartentext|
|-|-:|-:|-:|-:|-|:-:|-|
|Flugblatt-Verteiler (`flugblatt_verteiler`)|Kreatur|1|1|2|`kollektiv(scope:same_top, atk:1, condition:anotherHuman)`|–|Solange du einen weiteren Menschen kontrollierst, erhält diese Kreatur +1 ATK.|
|Streikposten (`streikposten`)|Kreatur|2|2|3|`schutz_nachbarn(scope:same_top, prevent:1, oncePerRound:true)`|–|Einmal pro Runde: Verhindere 1 Kampfschaden an einem benachbarten Menschen.|
|Solidaritätskasse (`solidaritaetskasse`)|Kreatur|3|2|4|`heilung(scope:same_top, damagedOnly:true, amount:1, maxTargets:2)`|–|Rundenende: Heile bis zu zwei beschädigte Menschen um 1.|
|Basisdemokratie (`basisdemokratie`)|Kreatur|3|1|5|`skalierung(scope:same_top, perOther:{atk:1}, cap:2)`|–|+1 ATK je weiterem verbündeten Menschen, maximal +2 ATK.|
|Gewerkschaftssekretärin (`gewerkschaftssekretaerin`)|Kreatur|4|3|5|`aura(scope:same_sub, otherOnly:true, atk:1, hp:1); debuffOnPlay(targetEnemyAtkMin:5, atk:-1, permanent:true)`|★|★ Andere Sozis erhalten +1/+1. Beim Ausspielen: Eine gegnerische Kreatur mit mindestens 5 ATK verliert dauerhaft 1 ATK.|
|Generalstreik (`generalstreik`)|Aktion|4|–|–|`debuff(scope:allEnemies, atk:-2, duration:round)`|–|Alle gegnerischen Kreaturen erhalten bis zum Rundenende −2 ATK.|
|Die Massen (`die_massen`)|Kreatur|6|5|7|`wucht; bonus(condition:twoOtherHumans, atk:1, hp:1)`|–|Wucht. Solange du mindestens zwei weitere Menschen kontrollierst, erhält diese Kreatur +1/+1.|

### Geänderte Risikostellen

* Keine unbegrenzte ATK-Skalierung mehr.
* Generalstreik ist jetzt eine Aktion und erzeugt keinen zusätzlichen 4/6-Körper.
* Die Signature-Aura ist weiterhin stark, verbessert aber nicht sich selbst und schwächt nur einen großen Gegner um 1 ATK.

---

## Die Arbeiter (`arbeiter`)

**Identität:** Langfristiges Wachstum, Werkzeuge und wertvolle Einheiten, die geschützt werden müssen. Gute Mischfraktion für Basismenschen und Studenten.

|Karte|Typ|Kosten|ATK|HP|Fähigkeit|Sig|Neuer Kartentext|
|-|-:|-:|-:|-:|-|:-:|-|
|Lehrling (`lehrling`)|Kreatur|1|1|2|`wachstum(atk:0, hp:1, maxTriggers:2)`|–|Rundenbeginn: +0/+1, maximal zweimal.|
|Fließbandarbeiter (`fliessbandarbeiter`)|Kreatur|2|2|3|`wachstum(atk:1, hp:0, maxTriggers:2)`|–|Rundenbeginn: +1/+0, maximal zweimal.|
|Werkzeugkiste (`werkzeugkiste`)|Kreatur|2|0|3|`werkzeug(scope:same_sub, atk:2, transferOnDeath:true)`|–|Beim Ausspielen: Ein anderer Arbeiter erhält +2 ATK, solange die Werkzeugkiste lebt. Stirbt die Werkzeugkiste, darfst du den Bonus auf einen anderen Arbeiter übertragen.|
|Schichtwechsel (`schichtwechsel`)|Kreatur|3|3|3|`ueberstunden(bonus:{atk:2,hp:1}, once:true)`|–|Hat diese Kreatur seit deinem letzten Rundenbeginn überlebt, erhält sie einmalig dauerhaft +2/+1.|
|Vorarbeiter (`vorarbeiter`)|Kreatur|4|3|5|`banner_nachbarn(scope:same_top, atk:1); wachstumTarget(scope:same_sub, atk:1, hp:1, otherOnly:true)`|★|★ Benachbarte Menschen erhalten +1 ATK. Rundenbeginn: Ein anderer Arbeiter erhält dauerhaft +1/+1.|
|Kranführer (`kranfuehrer`)|Kreatur|4|4|4|`wucht`|–|Wucht.|
|Betriebsrat (`betriebsrat`)|Kreatur|5|3|7|`verstaerker(target:wachstum, extraTrigger:1, firstOnlyPerRound:true, scope:same_sub)`|–|Der erste Wachstumseffekt eines Arbeiters in jeder Runde löst ein zusätzliches Mal aus.|
|Stahlgießer (`stahlgiesser`)|Kreatur|6|5|7|`wachstum(atk:1, hp:0)`|–|Rundenbeginn: dauerhaft +1/+0.|

### Geänderte Risikostellen

Der Betriebsrat verdoppelt nicht länger sämtliche Wachstumseffekte gleichzeitig. Dadurch bleiben Worker-Boards stark, explodieren aber nicht nach einer einzigen Runde außer Kontrolle.

---

## Die Obdachlosen (`obdachlose`)

**Identität:** Zähigkeit, Todesnutzen und kontrollierte Comebacks. Die Unterfraktion soll Rückstände aufholen, aber absichtliches Selbstschädigen nicht automatisch belohnen.

|Karte|Typ|Kosten|ATK|HP|Fähigkeit|Sig|Neuer Kartentext|
|-|-:|-:|-:|-:|-|:-:|-|
|Streuner (`streuner`)|Kreatur|1|1|2|`sammeln(trigger:firstFriendlyDeathPerRound, bonus:{atk:0,hp:1}, maxTriggers:2)`|–|Wenn zum ersten Mal in einer Runde eine andere verbündete Kreatur stirbt: dauerhaft +0/+1, maximal zweimal.|
|Pfandsammler (`pfandsammler`)|Kreatur|2|2|2|`sammeln(trigger:firstCreatureDeathPerRound, bonus:{atk:1,hp:0}, maxTriggers:2)`|–|Wenn zum ersten Mal in einer Runde eine Kreatur stirbt: dauerhaft +1/+0, maximal zweimal.|
|Der alte Hund (`der_alte_hund`)|Kreatur|2|1|4|`zaeh`|–|Zäh.|
|Improvisiertes Lager (`improvisiertes_lager`)|Kreatur|3|2|5|`comebackAura(thresholdBaseHp:7, scope:same_top, atk:1); comebackAura(scope:same_sub, hp:1)`|★|★ Solange deine Basis höchstens 7 HP hat, erhalten deine anderen Menschen +1 ATK; deine anderen Obdachlosen erhalten zusätzlich +0/+1.|
|Schrottsammlerin (`schrottsammlerin`)|Kreatur|3|3|3|`deathSummon(token:Fund 1/1, count:1)`|–|Beim Tod: Beschwöre einen 1/1-Fund in eine freie eigene Lane.|
|Suppenküche (`suppenkueche`)|Kreatur|4|1|7|`heilung(target:damagedHuman, amount:1, comebackAmount:2, thresholdBaseHp:7)`|–|Rundenende: Heile einen beschädigten Menschen um 1; bei höchstens 7 Basis-HP stattdessen um 2.|
|Überlebenskünstler (`ueberlebenskuenstler`)|Kreatur|4|3|5|`zaeh; onZaehTriggered(buff:{atk:2,hp:0})`|–|Zäh. Wenn Zäh ausgelöst wird, erhält diese Kreatur dauerhaft +2 ATK.|
|Die Meute der Vergessenen (`meute_der_vergessenen`)|Kreatur|6|4|8|`wucht; comebackSelf(perMissingBaseHp:4, bonus:{atk:1,hp:1}, cap:2)`|–|Wucht. Beim Ausspielen: +1/+1 je 4 fehlenden Basis-HP, maximal +2/+2.|

### Geänderte Risikostellen

* Todestrigger lösen nur einmal je Runde aus und haben Obergrenzen.
* Comeback-Auren stapeln keine +3 ATK auf das gesamte Board.
* Die Meute verstärkt nur sich selbst und kann maximal als 6/10 erscheinen.

---

## Die Studenten (`studenten`)

**Identität:** Kartenvorteil, Wissensmarker und flexible Combo-Züge. Niedrigere Rohwerte, dafür bessere Ressourcen.

|Karte|Typ|Kosten|ATK|HP|Fähigkeit|Sig|Neuer Kartentext|
|-|-:|-:|-:|-:|-|:-:|-|
|Erstsemester (`erstsemester`)|Kreatur|2|1|2|`lernen(n:1)`|–|Beim Ausspielen: Ziehe 1 Karte.|
|Nachhilfe (`nachhilfe`)|Kreatur|2|1|3|`wissen(x:1)`|–|Beim Ausspielen: Erhalte 1 Wissen.|
|Koffein-Junkie (`koffein_junkie`)|Kreatur|2|3|1|`ueberstunden(bonus:{atk:0,hp:2}, once:true)`|–|Hat diese Kreatur seit deinem letzten Rundenbeginn überlebt, erhält sie einmalig dauerhaft +0/+2.|
|Gruppenarbeit (`gruppenarbeit`)|Kreatur|3|2|4|`synergie(trigger:anotherHumanPlayedThisTurn, bonus:{atk:1,hp:1}, oncePerTurn:true)`|–|Wenn du in derselben Runde bereits einen anderen Menschen ausgespielt hast, kommt Gruppenarbeit mit +1/+1 ins Spiel.|
|Experimentelle Formel (`experimentelle_formel`)|Aktion|2|–|–|`spendKnowledge(max:3, damagePerMarker:1, splitTargets:true)`|–|Gib bis zu 3 Wissen aus. Verteile entsprechend viel Schaden auf gegnerische Kreaturen.|
|Bibliothekar (`bibliothekar`)|Kreatur|4|2|5|`choicePerRound(draw:1 OR knowledge:1); aura(scope:same_sub, otherOnly:true, atk:1)`|★|★ Rundenbeginn: Wähle – Ziehe 1 Karte oder erhalte 1 Wissen. Andere Studenten erhalten +1 ATK.|
|Doktorandin (`doktorandin`)|Kreatur|5|3|6|`spendKnowledge(max:3, buffPerMarker:{atk:1,hp:1})`|–|Beim Ausspielen: Gib bis zu 3 Wissen aus; diese Kreatur erhält je Marker dauerhaft +1/+1.|
|Die Fakultät (`die_fakultaet`)|Kreatur|6|4|7|`lernen(n:2); wissen(x:1)`|–|Beim Ausspielen: Ziehe 2 Karten und erhalte 1 Wissen.|

### Geänderte Risikostellen

* Der Erstsemester ist kein 1-Energie-Cantrip mit brauchbarem Körper mehr.
* Der Bibliothekar erzeugt nicht gleichzeitig jede Runde Karte, Wissen und Aura-Wert.
* Wissensausgaben sind auf 3 Marker begrenzt, wodurch One-Turn-Kills und riesige Doktorandinnen vermieden werden.

---

# 4. Oberfraktion Tiere (`animals`)

**Identität:** Tempo, Bewegung, offene Lanes, Gift und große Finisher. Tiere können schneller Druck aufbauen, sind aber meist schlechter im Heilen und Kartenziehen.

## Tiere – Basiskarten (`animals`)

|Karte|Typ|Kosten|ATK|HP|Fähigkeit|Sig|Neuer Kartentext|
|-|-:|-:|-:|-:|-|:-:|-|
|Ratte (`ratte`)|Kreatur|1|2|1|`flink`|–|Flink.|
|Hetzjagd (`hetzjagd`)|Aktion|1|–|–|`move(target:friendlyCreature, destination:freeLane); tempBuff(atk:1)`|–|Bewege eine verbündete Kreatur in eine freie eigene Lane. Sie erhält bis zum Rundenende +1 ATK.|
|Wolf (`wolf`)|Kreatur|2|2|3|`rudel`|–|Rudel.|
|Schlange (`schlange`)|Kreatur|2|1|2|`gift:2`|–|Gift 2.|
|Wilder Instinkt (`wilder_instinkt`)|Aktion|2|–|–|`tempBuff(target:friendlyCreature, atk:2)`|–|Eine verbündete Kreatur erhält bis zum Rundenende +2 ATK.|
|Steinadler (`adler`)|Kreatur|3|2|3|`fliegend`|–|Fliegend.|
|Pferd (`pferd`)|Kreatur|3|3|3|`flink`|–|Flink.|
|Bär (`baer`)|Kreatur|4|4|5|–|–|Brummig, aber effektiv.|
|Alphawolf (`alphawolf`)|Kreatur|5|4|5|`aura(scope:same_top, otherOnly:true, atk:1)`|★|★ Andere verbündete Tiere erhalten +1 ATK.|
|Eisbär (`eisbaer`)|Kreatur|6|5|8|–|–|Ein Koloss aus Eis und Muskeln.|

### Balancefunktion

Rudel, Hetzjagd, Wilder Instinkt und Alphawolf sind universelle Brückenkarten. Sie verbinden Katzen, Vögel, Reptilien und Dinos, ohne deren eigene Stammeskarten zu ersetzen.

---

## Katzen (`katzen`)

**Identität:** Schneller Druck und Boni gegen leere Gegenüberlanes. Katzen werden schwächer, sobald der Gegner jede Lane besetzt.

**Definition Pirsch:** Die gegnerische Seite derselben Lane ist leer.

|Karte|Typ|Kosten|ATK|HP|Fähigkeit|Sig|Neuer Kartentext|
|-|-:|-:|-:|-:|-|:-:|-|
|Streunerkatze (`streunerkatze`)|Kreatur|1|2|1|`flink`|–|Flink.|
|Getigerter (`getigerter`)|Kreatur|2|3|1|`flink`|–|Flink.|
|Hauskater (`hauskater`)|Kreatur|2|2|2|`pirsch(atk:1)`|–|Pirsch: +1 ATK.|
|Schwarze Katze (`schwarze_katze`)|Kreatur|3|3|2|`flink; deathCurse(attackerAtk:-1, permanent:true)`|–|Flink. Beim Tod verliert ihr letzter Angreifer dauerhaft 1 ATK.|
|Katzenmutter (`katzenmutter`)|Kreatur|3|2|3|`summonOnPlay(count:1, token:Kaetzchen 1/1 flink)`|–|Beim Ausspielen: Beschwöre ein 1/1-Kätzchen mit Flink in eine freie Lane.|
|Luchs (`luchs`)|Kreatur|4|3|3|`flink; zaeh; pirsch(baseDamageBonus:1)`|★|★ Flink und Zäh. Pirsch: Verursacht beim Angriff auf die Basis 1 zusätzlichen Schaden.|
|Wildkatze (`wildkatze`)|Kreatur|5|5|5|`zaeh`|–|Zäh.|
|Der Puma (`der_puma`)|Kreatur|6|6|5|`pirsch(atk:2, grants:wucht)`|–|Pirsch: +2 ATK und Wucht.|

### Geänderte Risikostellen

* Flink ist nicht mehr auf fast jeder großen Katze vorhanden.
* Katzenmutter erzeugt nur ein Kätzchen statt zwei sofort kampfbereiter Tokens.
* Luchs und Puma benötigen eine offene Gegenüberlane, statt pauschal enorme Zusatzwerte zu erhalten.

---

## Vögel (`voegel`)

**Identität:** Lane-Wechsel, kleine Flugeinheiten und gezielter Eintrittsschaden. Gute Ergänzung für Katzen und Rudel-Decks.

|Karte|Typ|Kosten|ATK|HP|Fähigkeit|Sig|Neuer Kartentext|
|-|-:|-:|-:|-:|-|:-:|-|
|Spatz (`spatz`)|Kreatur|1|1|1|`fliegend; flink`|–|Fliegend und Flink.|
|Krähe (`kraehe`)|Kreatur|2|2|2|`fliegend; bonus(condition:anotherBird, atk:1)`|–|Fliegend. Solange du einen weiteren Vogel kontrollierst, +1 ATK.|
|Möwe (`moewe`)|Kreatur|2|3|1|`fliegend`|–|Fliegend.|
|Taubenschwarm (`taubenschwarm`)|Kreatur|3|2|2|`fliegend; summonOnPlay(count:1, token:Taube 1/1 fliegend)`|–|Fliegend. Beim Ausspielen: Beschwöre eine 1/1-Taube mit Fliegend in eine freie Lane.|
|Eule (`eule`)|Kreatur|3|2|4|`fliegend; suppress(targetEnemy, removeOne:[fliegend,flink], duration:untilNextRound)`|–|Fliegend. Beim Ausspielen verliert eine gegnerische Kreatur Fliegend oder Flink bis zum Beginn deiner nächsten Runde.|
|Falke (`falke`)|Kreatur|4|3|3|`fliegend; flink; sturzflug:1`|★|★ Fliegend, Flink und Sturzflug 1.|
|Adler (`adler_voegel`)|Kreatur|5|4|5|`fliegend; sturzflug:2`|–|Fliegend und Sturzflug 2.|
|Der Schwarm (`der_schwarm`)|Kreatur|6|4|6|`fliegend; aura(scope:same_sub, otherOnly:true, atk:1, hp:1)`|–|Fliegend. Andere Vögel erhalten +1/+1.|

### Geänderte Risikostellen

Der Falke besitzt nicht mehr gleichzeitig Premiumwerte, Flink, Fliegend, 2 Direktschaden und unbegrenzte Stammes-Skalierung. Der Schwarm ist eine kontrollierbare Aura statt einer exponentiell wachsenden Einzelkarte.

---

## Reptilien (`reptilien`)

**Identität:** Giftmarker, Dornen und langsame Lane-Kontrolle. Reptilien gewinnen über mehrere Kämpfe statt durch sofortiges Vernichten jeder berührten Kreatur.

|Karte|Typ|Kosten|ATK|HP|Fähigkeit|Sig|Neuer Kartentext|
|-|-:|-:|-:|-:|-|:-:|-|
|Eidechse (`eidechse`)|Kreatur|1|1|2|`gift:1`|–|Gift 1.|
|Gecko (`gecko`)|Kreatur|2|1|4|`dornen:1`|–|Dornen 1.|
|Klapperschlange (`klapperschlange`)|Kreatur|3|2|3|`gift:2`|–|Gift 2.|
|Schildkröte (`schildkroete`)|Kreatur|3|0|7|`dornen:2`|–|Dornen 2.|
|König der Kobras (`koenig_der_kobras`)|Kreatur|4|3|5|`gift:1; poisonOnPlay(target:opposingCreature, markers:1); coldBlooded(endTurnHealIfDidNotAttack:1)`|★|★ Gift 1. Beim Ausspielen erhält die gegnerische Kreatur in dieser Lane 1 Giftmarker. Hat die Kobra diese Runde nicht angegriffen, heilt sie am Rundenende 1 HP.|
|Waran (`waran`)|Kreatur|4|4|4|`gift:1`|–|Gift 1.|
|Krokodil (`krokodil`)|Kreatur|5|5|5|`hunter(condition:opponentPoisoned, combatAtk:2)`|–|Im Kampf gegen eine vergiftete Kreatur erhält das Krokodil für diesen Kampf +2 ATK.|
|Uralte Schlange (`uralte_schlange`)|Kreatur|6|4|8|`gift:2; shedding(trigger:firstTimeHpAtMost3, heal:3, cleansePoison:true)`|–|Gift 2. Häutung: Das erste Mal bei 3 oder weniger HP heilt sie 3 und entfernt alle eigenen Giftmarker.|

### Geänderte Risikostellen

Gift ist nun ein gemeinsames 3-Marker-System. Dadurch sind kleine Giftschlangen gefährlich, aber keine universellen 2-Energie-Hardremovals.

---

## Dinos (`dinos`)

**Identität:** Hohe Werte, Wucht und wenige, klar lesbare Stammesboni. Dinos brauchen Anlauf und dürfen nicht gleichzeitig die besten Körper und die besten Auren besitzen.

|Karte|Typ|Kosten|ATK|HP|Fähigkeit|Sig|Neuer Kartentext|
|-|-:|-:|-:|-:|-|:-:|-|
|Compsognathus (`compsognathus`)|Kreatur|1|2|1|`bonus(condition:anotherDino, hp:1)`|–|Solange du einen weiteren Dino kontrollierst, erhält er +0/+1.|
|Velociraptor (`velociraptor`)|Kreatur|3|3|2|`flink; bonus(condition:anotherDino, atk:1)`|–|Flink. Solange du einen weiteren Dino kontrollierst, +1 ATK.|
|Triceratops (`triceratops`)|Kreatur|4|3|6|`dornen:2`|–|Dornen 2.|
|Stegosaurus (`stegosaurus`)|Kreatur|4|2|7|`dornen:2`|–|Dornen 2.|
|Pteranodon (`pteranodon`)|Kreatur|4|4|3|`fliegend`|–|Fliegend.|
|Spinosaurus (`spinosaurus`)|Kreatur|5|5|5|`wucht; aura(scope:same_sub, otherOnly:true, atk:1)`|–|Wucht. Andere Dinos erhalten +1 ATK.|
|Tyrannosaurus Rex (`tyrannosaurus_rex`)|Kreatur|6|6|6|`wucht; onPlayBuff(scope:same_sub, otherOnly:true, atk:1, hp:1, permanent:true)`|★|★ Wucht. Beim Ausspielen erhalten deine anderen Dinos dauerhaft +1/+1.|
|Brachiosaurus (`brachiosaurus`)|Kreatur|7|6|9|`wucht; urgewalt`|–|Wucht. Urgewalt: Kann nicht durch Karteneffekte zerstört werden, sondern nur durch Schaden im Kampf.|

### Geänderte Risikostellen

* Der Compsognathus wächst nicht mehr für jeden Dino gleichzeitig um +1/+1.
* Der Spinosaurus wurde von 6/5 auf 5/5 reduziert.
* Der T-Rex besitzt nur noch einen Dino-Buff statt einmaliger +1/+1-Verstärkung **und** dauerhafter +1-ATK-Aura gleichzeitig.

---

# 5. Empfohlene ausgewogene Testdecks

Die Decks verwenden jeweils genau 20 Karten. Normale Karten sind höchstens zweimal enthalten; Signature-Karten höchstens einmal.

## Deck H1 – Solidarität & Versorgung

**Spielplan:** Viele haltbare Menschen aufbauen, Schaden reduzieren, heilen und mit Die Massen abschließen.

|Anzahl|Karte|Kosten|
|-:|-|-:|
|2|Rekrut|1|
|2|Flugblatt-Verteiler|1|
|2|Der alte Hund|2|
|2|Streikposten|2|
|2|Feldscherin|2|
|2|Basisdemokratie|3|
|2|Schrottsammlerin|3|
|2|Generalstreik|4|
|2|Die Massen|6|
|1|Improvisiertes Lager ★|3|
|1|Gewerkschaftssekretärin ★|4|

**Kurve:** 4×1, 6×2, 5×3, 3×4, 2×6

---

## Deck H2 – Schicht & Studium

**Spielplan:** Frühe Wachstumskarten schützen, Karten ziehen und mit Werkzeugen beziehungsweise Wissen flexible Midgame-Züge erzeugen.

|Anzahl|Karte|Kosten|
|-:|-|-:|
|2|Lehrling|1|
|2|Fließbandarbeiter|2|
|2|Werkzeugkiste|2|
|2|Erstsemester|2|
|2|Gruppenarbeit|3|
|2|Schichtwechsel|3|
|2|Kranführer|4|
|2|Doktorandin|5|
|2|Stahlgießer|6|
|1|Vorarbeiter ★|4|
|1|Bibliothekar ★|4|

**Kurve:** 2×1, 6×2, 4×3, 4×4, 2×5, 2×6

---

## Deck H3 – Campusbewegung

**Spielplan:** Mit günstigen Menschen Karten und Wissen erzeugen, Gruppenarbeit aktivieren und gegnerische Angriffe durch Sozi-Effekte kontrollieren.

|Anzahl|Karte|Kosten|
|-:|-|-:|
|2|Flugblatt-Verteiler|1|
|2|Schildwall|1|
|2|Erstsemester|2|
|2|Nachhilfe|2|
|2|Streikposten|2|
|2|Gruppenarbeit|3|
|2|Experimentelle Formel|2|
|2|Basisdemokratie|3|
|2|Die Fakultät|6|
|1|Bibliothekar ★|4|
|1|Gewerkschaftssekretärin ★|4|

**Kurve:** 4×1, 8×2, 4×3, 2×4, 2×6

---

## Deck A1 – Rudeljäger

**Spielplan:** Früher Lane-Druck mit Flink, offene Lanes durch Bewegung ausnutzen und durch den Alphawolf abschließen.

|Anzahl|Karte|Kosten|
|-:|-|-:|
|2|Ratte|1|
|2|Streunerkatze|1|
|2|Getigerter|2|
|2|Hauskater|2|
|2|Wolf|2|
|2|Wilder Instinkt|2|
|2|Pferd|3|
|2|Schwarze Katze|3|
|2|Katzenmutter|3|
|1|Luchs ★|4|
|1|Alphawolf ★|5|

**Kurve:** 4×1, 8×2, 6×3, 1×4, 1×5

---

## Deck A2 – Luftangriff

**Spielplan:** Mit Fliegend zwischen Lanes wechseln, gegnerische Antworten umgehen und Katzen-Pirsch in freigewordenen Lanes aktivieren.

|Anzahl|Karte|Kosten|
|-:|-|-:|
|2|Spatz|1|
|2|Hetzjagd|1|
|2|Krähe|2|
|2|Möwe|2|
|2|Hauskater|2|
|2|Taubenschwarm|3|
|2|Eule|3|
|2|Steinadler|3|
|2|Adler|5|
|1|Falke ★|4|
|1|Luchs ★|4|

**Kurve:** 4×1, 6×2, 6×3, 2×4, 2×5

---

## Deck A3 – Gift & Urgewalt

**Spielplan:** Frühe Lanes durch Gift und Dornen stabilisieren, vergiftete Gegner mit dem Krokodil bestrafen und mit großen Dinos gewinnen.

|Anzahl|Karte|Kosten|
|-:|-|-:|
|2|Eidechse|1|
|2|Schlange|2|
|2|Gecko|2|
|2|Klapperschlange|3|
|2|Schildkröte|3|
|2|Triceratops|4|
|2|Waran|4|
|2|Krokodil|5|
|2|Brachiosaurus|7|
|1|König der Kobras ★|4|
|1|Tyrannosaurus Rex ★|6|

**Kurve:** 2×1, 4×2, 4×3, 5×4, 2×5, 1×6, 2×7

---

## Deck A4 – Urzeitliches Rudel

**Spielplan:** Günstige Tiere aktivieren Rudel, Dinos übernehmen ab Runde 3 das Board und Wucht beendet die Partie.

|Anzahl|Karte|Kosten|
|-:|-|-:|
|2|Compsognathus|1|
|2|Wolf|2|
|2|Wilder Instinkt|2|
|2|Velociraptor|3|
|2|Pferd|3|
|2|Triceratops|4|
|2|Pteranodon|4|
|2|Spinosaurus|5|
|2|Brachiosaurus|7|
|1|Tyrannosaurus Rex ★|6|
|1|Alphawolf ★|5|

**Kurve:** 2×1, 4×2, 4×3, 4×4, 3×5, 1×6, 2×7

---

# 6. Wichtigste Änderungen gegenüber V1

1. **Unterfraktionen dürfen vollständig gemischt werden.** Basiskarten und ausgewählte Brückenkarten wirken auf `same_top`.
2. **Unbegrenzte Skalierungen wurden gedeckelt.** Wiederholbare Boni haben Obergrenzen oder lösen nur einmal pro Runde aus.
3. **Gift wurde vereinheitlicht.** Keine Mischung mehr aus Soforttod und unterschiedlich interpretierten Giftstärken.
4. **Auren sind eindeutig temporär.** Verlässt die Quelle das Feld, endet der Bonus.
5. **Mehrfach überladene Signature-Karten wurden reduziert.** Eine Signature darf stark sein, aber nicht gleichzeitig Premiumkörper, Sofortwert, Aura und Skalierung liefern.
6. **Kartenziehen kostet echte Werte.** Studentenkarten mit Kartenvorteil liegen unter der normalen Statline.
7. **Comeback statt Selbstschaden.** Obdachlosen-Boni sind stark, aber begrenzt und erzeugen kein automatisches +3-ATK-Gesamtboard.
8. **Flink wurde sparsamer eingesetzt.** Besonders große Katzen und Dinos geben dem Gegner nun ein Reaktionsfenster.
9. **Mehr echte Aktionen.** Generalstreik und Experimentelle Formel sind Aktionen, wodurch Decks taktischer und weniger boardverstopft werden.
10. **Doppelte Kartennamen bereinigt.** Der neutrale Adler heißt nun Steinadler; der Vogel-Adler bleibt Adler.

---

# 7. Playtest-Protokoll für die nächste Balancingrunde

Für jede Partie sollten mindestens folgende Daten gespeichert werden:

* Sieger und Oberfraktion
* Verwendetes Deck
* Startspieler
* Endrunde
* Verbleibende Basis-HP beider Seiten
* Gezogene Karten insgesamt
* Ungenutzte Energie je Runde
* Schaden jeder Karte an Kreaturen und Basis
* Heilung und verhinderter Schaden
* Anzahl ausgelöster Auren, Wachstumseffekte, Giftzerstörungen und Flink-Angriffe
* Karten auf der Hand beim Spielende
* Karten, die nie sinnvoll spielbar waren

### Erste Zielkorridore nach mindestens 100 Bot- oder PvP-Partien je Matchup

* Gesamt-Winrate Menschen/Tiere: **47–53 %**
* Kein Starterdeck außerhalb von **45–55 %** gegen das gesamte Testfeld
* Startspieler-Vorteil: höchstens **54 %**
* Durchschnittliche Spieldauer: Runde **7–10**
* Partien am Rundenlimit: unter **10 %**
* Einzelne Karte in mehr als **70 %** der Decks ihrer Oberfraktion: prüfen
* Einzelne Karte mit Mulligan-Keep-Rate über **80 %** oder Ausspielrate unter **20 %**: prüfen

### Priorität für den ersten Test

1. Flink-Aggro gegen langsame Dinos/Reptilien
2. Studenten-Kartenvorteil gegen Sozi-Heilung
3. Arbeiter-Wachstum mit Vorarbeiter und Betriebsrat
4. Obdachlosen-Comeback bei 7 Basis-HP
5. Vögel/Katzen-Mobilität und offene Gegenüberlanes
6. Giftmarker-Tempo bei drei Markern
