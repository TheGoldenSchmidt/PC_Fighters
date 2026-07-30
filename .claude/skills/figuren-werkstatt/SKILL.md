---
name: figuren-werkstatt
description: Baut oder überarbeitet eine 3D-Figur für eine PC-Fighters-Karte per Designer-/Kritiker-Agenten-Schleife. Aufruf durch den Nutzer, z. B. "/figuren-werkstatt wolf buschigerer Schwanz". Nutze dies, wenn eine Karte ein besseres/neues 3D-Modell bekommen soll.
---

# Figuren-Werkstatt (Claude-Code-Einstiegspunkt)

Aufruf: `/figuren-werkstatt <cardId> [freier Prompt]`

**Der fachliche Ablauf steht nicht hier.** Lies und befolge:

- **`docs/figure-generation/PLAYBOOK.md`** – der vollständige Ablauf von Schritt 0 bis 8
- `docs/figure-generation/QUALITY_CRITERIA.md` – der Bewertungsmaßstab
- `docs/figure-generation/PARTS.md` – kopierfertige Rig-Fragmente

Diese Datei enthält nur, was an Claude Code gebunden ist.

## Rollen in diesem Produkt

| Playbook-Rolle | Agent |
|---|---|
| Designer, Modus 1 (vollständige Figur) | `figuren-designer` |
| Designer, Modus 2 (Gesicht/Kopf) | `figuren-gesicht` |
| Designer, Modus 3 (Animation) | `figuren-animation` |
| Kritiker | `figuren-kritiker` |

Die Adapter unter `.claude/agents/` verweisen auf die kanonischen Rollen in `agents/`.

## Claude-spezifische Ausführung

- **Erstaufruf** einer Rolle per `Agent`, **jede Fortsetzung** per `SendMessage` an
  dieselbe Agent-ID. Ein frischer `Agent`-Aufruf verliert den Kontext.
- **Niemals `isolation: "worktree"`.** Ein Worktree-Agent bearbeitet eine isolierte
  Repo-Kopie, die der laufende Dev-Server nie liest; die Änderung kommt in der
  Vorschau nicht an.
- Bei mehreren roten Linsen die Handler **nacheinander** starten (Playbook Schritt 6),
  danach **ein** Server-Neustart.
- Der Montage-Screenshot wird dem Kritiker als PNG-Pfad übergeben; er lädt ihn per
  `Read`.
- Ist `mcp__Claude_Browser` vorhanden, kann der Snapshot-Ablauf auch darüber laufen –
  `scripts/snap.mjs` bleibt der robuste Standardweg.

## Abnahme und Abschluss

Playbook Schritt 7 und 8. Für den Standalone-Viewer gilt in diesem Produkt: nach
`node tools/figuren-viewer/build-viewer.mjs` das Artifact aktualisieren, damit der
Nutzer interaktiv prüfen kann.

Erkenntnisse aus dem Lauf gehen als datierter Bericht nach
`docs/figure-generation/experiments/` (Vorlage: `_TEMPLATE.md`) – **nicht** mehr in
eine `LESSONS.md`. Beförderung nach Playbook, Quality Criteria oder Parts erst, wenn
eine Erkenntnis belegt und wiederverwendbar ist, und immer erst nach Freigabe durch
den Nutzer. Der Nutzer entscheidet über den Commit.
