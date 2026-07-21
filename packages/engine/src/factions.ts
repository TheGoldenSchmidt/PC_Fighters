// Fraktionsbaum-Auflösung. Sub-Fraktionen sind reine Daten; die Engine löst
// Ober-/Sub-Zugehörigkeit generisch über den parent-Lookup auf. So funktionieren
// scope-basierte Effekte (same_sub | same_top | any) ohne kartenspezifische Logik.

import type { Faction, FactionTree, Scope } from './types.js';

/** Baut den parent-Lookup aus der Fraktionsliste. */
export function buildFactionTree(factions: Faction[]): FactionTree {
  const tree: FactionTree = {};
  for (const f of factions) tree[f.id] = f.parent ?? null;
  return tree;
}

/** Löst eine Fraktion über die parent-Kette bis zur Oberfraktion auf. */
export function topOf(tree: FactionTree, id: string): string {
  let cur = id;
  const seen = new Set<string>();
  while (tree[cur] != null && !seen.has(cur)) {
    seen.add(cur);
    cur = tree[cur] as string;
  }
  return cur;
}

/** Prüft, ob zwei Fraktionen im gegebenen scope als "gleich" gelten. */
export function matchesScope(tree: FactionTree, scope: Scope, a: string, b: string): boolean {
  switch (scope) {
    case 'any':
      return true;
    case 'same_sub':
      return a === b;
    case 'same_top':
      return topOf(tree, a) === topOf(tree, b);
  }
}
