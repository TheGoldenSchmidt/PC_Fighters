---
name: figuren-werkstatt
description: Baut oder überarbeitet eine 3D-Figur für eine PC-Fighters-Karte per Designer-/Kritiker-Agenten-Schleife. Aufruf durch den Nutzer, z. B. "/figuren-werkstatt wolf buschigerer Schwanz". Nutze dies, wenn eine Karte ein besseres/neues 3D-Modell bekommen soll.
---

# Figuren-Werkstatt (Codex-Einstiegspunkt)

Aufruf: `/figuren-werkstatt <cardId> [freier Prompt]`

**Der fachliche Ablauf steht nicht hier.** Lies und befolge:

- **`docs/figure-generation/PLAYBOOK.md`** – der vollständige Ablauf von Schritt 0 bis 8
- `docs/figure-generation/QUALITY_CRITERIA.md` – der Bewertungsmaßstab
- `docs/figure-generation/PARTS.md` – kopierfertige Rig-Fragmente

Diese Datei enthält nur, was an Codex gebunden ist.

## Rollen in diesem Produkt

| Playbook-Rolle | Agent |
|---|---|
| Designer, Modus 1 (vollständige Figur) | `figuren-designer` |
| Designer, Modus 2 (Gesicht/Kopf) | `figuren-gesicht` |
| Designer, Modus 3 (Animation) | `figuren-animation` |
| Kritiker | `figuren-kritiker` |

Die Adapter unter `.codex/agents/` verweisen auf die kanonischen Rollen in `agents/`.

## Codex-spezifische Ausführung

- Agenten mit **kompaktem, vollständigem Brief** und ohne geerbte Gesprächshistorie
  starten (`fork_turns=none`). Alte Arena- und Figurenhistorie ist für eine einzelne
  Revision irrelevant und nur Token-Kosten.
- **Überarbeitungen im bestehenden Agenten fortsetzen**; ein frisch gestarteter Lauf
  verliert den Kontext.
- **Nicht in einer isolierten Repo-Kopie arbeiten** – der laufende Dev-Server liest
  nur den Hauptarbeitsbaum, die Änderung käme in der Vorschau nicht an.
- Bei mehreren roten Linsen die Handler **nacheinander** starten (Playbook Schritt 6),
  danach **ein** Server-Neustart.
- Der Montage-Screenshot wird dem Kritiker als PNG-Pfad übergeben.

## Abnahme und Abschluss

Playbook Schritt 7 und 8. Für die interaktive Abnahme gilt in diesem Produkt der
**Live-Viewer**: Server und Client laufen lassen und den direkten Link
`http://localhost:<clientPort>/?viewer=figures&figure=<cardId>` nennen. Nach einem
Daten-Neustart kann der Katalog im Viewer über „Neu laden" aktualisiert werden.

Erkenntnisse aus dem Lauf gehen als datierter Bericht nach
`docs/figure-generation/experiments/` (Vorlage: `_TEMPLATE.md`) – **nicht** mehr in
eine `LESSONS.md`. Beförderung nach Playbook, Quality Criteria oder Parts erst, wenn
eine Erkenntnis belegt und wiederverwendbar ist, und immer erst nach Freigabe durch
den Nutzer. Der Nutzer entscheidet über den Commit.
