// Öffentlicher Einstiegspunkt der prozeduralen 3D-Figuren.
// Hält den Import-Pfad `./figures3d` stabil (Battlefield3D.tsx nutzt ihn).

import { createFigure as makeFigure, type Figure } from './core';
import { buildRig } from './registry';

export { SPAWN_MS, ATTACK_MS, HIT_MS, DEATH_MS } from './core';
export type { Figure };

/** Prozedurale 3D-Figur für eine Karten-id erzeugen. */
export function createFigure(cardId: string, facing: 1 | -1, seed: number): Figure {
  return makeFigure(buildRig, cardId, facing, seed);
}
