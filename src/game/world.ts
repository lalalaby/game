import type { ThemeId } from './sites';
export const WORLD_W = 1280;
export const WORLD_H = 720;
export const GROUND_Y = 660;
export const SLING_X = 190;
export const SLING_Y = 545;
export const MAX_POWER = 1500;

export type BlockKind = 'wood' | 'stone' | 'glass' | 'tnt';
export type EnemyKind = 'minion' | 'officer' | 'general' | 'boss';
export type BirdKind = 'courier' | 'swarm' | 'wrecker';

export interface BlockDef { x: number; y: number; w: number; h: number; kind?: BlockKind }
export interface EnemyDef { x: number; y: number; kind: EnemyKind }
export interface LevelDef {
  name: string;
  subtitle: string;
  theme: ThemeId;
  birds: BirdKind[];
  blocks: BlockDef[];
  enemies: EnemyDef[];
}

export const ENEMY_RADIUS: Record<EnemyKind, number> = { minion: 17, officer: 21, general: 25, boss: 36 };
export const BIRD_RADIUS: Record<BirdKind, number> = { courier: 20, swarm: 17, wrecker: 23 };

/** Block sitting on the ground. */
export const G = (x: number, w: number, h: number, kind: BlockKind = 'wood'): BlockDef =>
  ({ x, y: GROUND_Y - h / 2, w, h, kind });

/** Block whose bottom sits on a surface whose top is `surface`. */
export const S = (x: number, w: number, h: number, surface: number, kind: BlockKind = 'wood'): BlockDef =>
  ({ x, y: surface - h / 2, w, h, kind });

/** Enemy standing on a surface whose top is `surface`. */
export const E = (x: number, surface: number, kind: EnemyKind): EnemyDef =>
  ({ x, y: surface - ENEMY_RADIUS[kind], kind });
