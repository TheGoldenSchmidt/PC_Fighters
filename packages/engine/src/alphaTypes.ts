/** Explizite Datenverträge der Vier-Team-Alpha. */
export type TeamId = 'south_park' | 'rick_morty' | 'solar_opposites' | 'tier_rudel';
export type ScriptTarget = 'none' | 'friendly' | 'enemy' | 'enemyOrBase' | 'move' | 'hand' | 'grave' | 'sacrifice' | 'damaged';
export interface ScriptStep {
  op: 'buff' | 'heal' | 'shield' | 'protect' | 'stun' | 'hide' | 'damage' | 'destroy' | 'move' | 'moveAll' | 'bonus' | 'draw' | 'discard' | 'return' | 'revive' | 'discount' | 'energy' | 'ramp' | 'evolve' | 'summon' | 'conjure' | 'sacrifice' | 'spendEnergy' | 'random' | 'deadly';
  scope?: 'selected' | 'own' | 'enemy' | 'adjacent' | 'wolvesCats' | 'base' | 'groundEnemy';
  amount?: number; atk?: number; hp?: number; temporary?: boolean; cardId?: string;
  maxCost?: number; minAttack?: number; maxAttack?: number;
}
export interface ScriptEffect { kind: 'script'; target: ScriptTarget; steps: ScriptStep[] }
export interface HandInstance { id: number; cardId: string; discount: number }
export interface GraveEntry { id: number; cardId: string; name?: string }
export interface CardChoice { id: number; owner: 0 | 1; kind: 'discard'; title: string }
