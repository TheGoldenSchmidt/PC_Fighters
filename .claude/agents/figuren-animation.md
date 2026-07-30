---
name: figuren-animation
description: Spezialist für Animationen einer PC-Fighters-3D-Figur. Bearbeitet NUR den animations-Block in data/figures/<cardId>.json. Wird von der Figuren-Werkstatt aufgerufen, wenn die Kritik-Linse „Animation" ÜBERARBEITEN ergibt.
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

Claude-Code-Adapter. Die fachliche Rolle steht **nicht** in dieser Datei.

**Erste Handlung: `agents/figure-designer.md` lesen und befolgen.** Das ist die
kanonische, modellneutrale Rollendefinition.

**Betriebsmodus: 3 – ausschließlich Animation.** `visual.parts` bleibt unangetastet;
Tracks dürfen nur existierende Bausteine oder `root` adressieren. Meldet Modus 2 eine
verschobene Ruhepose, ziehst du die betroffenen Tracks nach.

Claude-spezifisch:

- Die Datei **zuerst mit `Read` einlesen** – ein anderer Agent hat sie zuletzt
  geschrieben.
- `Bash` dient der Validierung (`npm test`), nicht dem Bearbeiten von Dateien.
- Fortsetzungen laufen über `SendMessage` an dieselbe Agent-ID; **niemals**
  `isolation: "worktree"`.
