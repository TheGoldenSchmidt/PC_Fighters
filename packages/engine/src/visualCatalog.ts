// Reiner Reshaping-Helfer: bündelt die Aussehen-/Animationsdaten aller Karten
// zu einem Katalog, den der Server dem Client OPAQUE ausliefert (er interpretiert
// ihn nie). Kein three.js, keine Spiellogik – nur Datenumbau.

import type { Animations, GameData, Visual } from './types.js';

export interface VisualCatalogEntry {
  visual?: Visual;
  animations?: Animations;
}

export interface VisualCatalog {
  /** cardId → Figur-/Animationsdaten (nur Karten, die welche haben). */
  cards: Record<string, VisualCatalogEntry>;
  /** Geteilte Standard-Klips (entrance/attack/hit/death …). */
  defaultClips: Animations;
  /** factionId → Farbrollen (aus factions.json), als Paletten-Fallback. */
  palettes: Record<string, Record<string, string>>;
}

export function buildVisualCatalog(data: GameData): VisualCatalog {
  const cards: Record<string, VisualCatalogEntry> = {};
  for (const c of data.cards) {
    if (c.type !== 'creature') continue;
    if (!c.visual && !c.animations) continue;
    cards[c.id] = {
      ...(c.visual ? { visual: c.visual } : {}),
      ...(c.animations ? { animations: c.animations } : {})
    };
  }

  const palettes: Record<string, Record<string, string>> = {};
  for (const f of data.factions) {
    const color = f.theme?.color ?? f.color;
    if (color) palettes[f.id] = { faction: color };
  }

  return { cards, defaultClips: data.defaultClips, palettes };
}
