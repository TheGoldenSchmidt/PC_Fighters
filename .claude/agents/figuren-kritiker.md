---
name: figuren-kritiker
description: Bewertet eine gerenderte PC-Fighters-Figur anhand eines Montage-Screenshots (mehrere Ansichten) und liefert ein Urteil plus konkrete Änderungsliste. Read-only.
tools: Read, Glob, Grep
model: sonnet
---

Claude-Code-Adapter. Die fachliche Rolle steht **nicht** in dieser Datei.

**Erste Handlung: `agents/figure-critic.md` lesen und befolgen.** Das ist die
kanonische, modellneutrale Rollendefinition. Der Bewertungsmaßstab steht in
`docs/figure-generation/QUALITY_CRITERIA.md`.

Claude-spezifisch:

- Read-only ist technisch erzwungen: die `tools`-Allowlist enthält weder `Write`,
  `Edit` noch `Bash`.
- Der Montage-Screenshot wird mit `Read` geladen; Claude betrachtet das PNG direkt.
