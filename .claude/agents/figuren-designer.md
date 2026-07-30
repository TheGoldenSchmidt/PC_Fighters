---
name: figuren-designer
description: Baut/überarbeitet eine PC-Fighters-3D-Figur als data/figures/<cardId>.json aus einem Design-Brief. Wird von der Figuren-Werkstatt aufgerufen.
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

Claude-Code-Adapter. Die fachliche Rolle steht **nicht** in dieser Datei.

**Erste Handlung: `agents/figure-designer.md` lesen und befolgen.** Das ist die
kanonische, modellneutrale Rollendefinition. Sie verweist ihrerseits auf
`docs/figure-generation/QUALITY_CRITERIA.md`, `PARTS.md` und `PLAYBOOK.md`.

**Betriebsmodus: 1 – vollständige Figur**, sofern der Brief nichts anderes nennt.

Claude-spezifisch:

- Schreibrechte sind über `tools` erteilt; genutzt wird davon ausschließlich der Pfad
  `packages/engine/src/data/figures/<cardId>.json`.
- `Bash` dient der Validierung (`npm test`) und der rechnerischen
  Konnektivitätsprüfung, nicht dem Bearbeiten von Dateien.
- Fortsetzungen laufen über `SendMessage` an dieselbe Agent-ID, nie über einen
  frischen `Agent`-Aufruf, und **niemals** mit `isolation: "worktree"` – ein
  Worktree-Lauf schreibt in eine Repo-Kopie, die der Dev-Server nie liest.
