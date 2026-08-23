import { World, Body } from './physics';
import { CAMPAIGN_THEMES } from './sites';
import type { ThemeId } from './sites';
import {
  GROUND_Y, WORLD_W, ENEMY_RADIUS, G, S, E,
} from './world';
import type { BlockDef, BlockKind, BirdKind, EnemyDef, EnemyKind, LevelDef } from './world';

export const DEFAULT_SEED = 20200909;

const GY = GROUND_Y;
const ENEMY_VALUE: Record<EnemyKind, number> = { minion: 1, officer: 1.65, general: 2.5, boss: 4.1 };
const BIRD_VALUE: Record<BirdKind, number> = { courier: 1.15, swarm: 1.45, wrecker: 2.05 };
const BLOCK_MASS: Record<BlockKind, number> = { wood: 1.05, stone: 2.35, glass: 0.48, tnt: 0.85 };
const ENEMY_MASS: Record<EnemyKind, number> = { minion: 0.9, officer: 1.15, general: 1.4, boss: 2.2 };

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: Rng, xs: T[]): T { return xs[Math.floor(rng() * xs.length)]!; }
function irange(rng: Rng, lo: number, hi: number): number { return lo + Math.floor(rng() * (hi - lo + 1)); }

interface Piece { blocks: BlockDef[]; enemies: EnemyDef[]; width: number }

function roofTop(postsH: number, roofH: number): number { return GY - postsH - roofH; }

function hut(cx: number, kind: EnemyKind, tall = 96, mat: BlockKind = 'wood'): Piece {
  const w = 196;
  return {
    width: 220,
    blocks: [G(cx - 78, 22, tall, mat), G(cx + 78, 22, tall, mat), S(cx, w, 20, GY - tall, 'wood')],
    enemies: [E(cx, GY, kind)],
  };
}

function loft(cx: number, inside: EnemyKind, above: EnemyKind): Piece {
  const tall = 100;
  return {
    width: 220,
    blocks: [G(cx - 80, 22, tall), G(cx + 80, 22, tall), S(cx, 200, 20, GY - tall)],
    enemies: [E(cx, GY, inside), E(cx, roofTop(tall, 20), above)],
  };
}

function glassCase(cx: number, kind: EnemyKind): Piece {
  const h = 78;
  return {
    width: 170,
    blocks: [G(cx - 58, 16, h, 'glass'), G(cx + 58, 16, h, 'glass'), S(cx, 132, 16, GY - h, 'glass')],
    enemies: [E(cx, GY, kind)],
  };
}

function stack(cx: number, kind: EnemyKind, n: number): Piece {
  const s = 48;
  const blocks: BlockDef[] = [];
  for (let i = 0; i < n; i++) blocks.push(S(cx, s, s, GY - i * s));
  return { width: 120, blocks, enemies: [E(cx, GY - n * s, kind)] };
}

function podium(cx: number, kind: EnemyKind, shield: boolean): Piece {
  const h = 40;
  const blocks: BlockDef[] = [G(cx, 72, h, 'stone')];
  if (shield) blocks.push(S(cx - 10, 18, 56, GY - h));
  return { width: 130, blocks, enemies: [E(cx + (shield ? 16 : 0), GY - h, kind)] };
}

function span(cx: number, left: EnemyKind, right: EnemyKind | null): Piece {
  const h = 88;
  const blocks: BlockDef[] = [G(cx - 100, 22, h), G(cx + 100, 22, h), S(cx, 240, 18, GY - h)];
  const enemies = [E(cx - 40, GY, left)];
  if (right) enemies.push(E(cx + 40, GY, right));
  return { width: 260, blocks, enemies };
}

function bunker(cx: number, kind: EnemyKind): Piece {
  const h = 92;
  return {
    width: 190,
    blocks: [G(cx - 70, 28, h, 'stone'), G(cx + 70, 28, h, 'stone'), S(cx, 176, 18, GY - h, 'wood')],
    enemies: [E(cx, GY, kind)],
  };
}

function watch(cx: number, kind: EnemyKind): Piece {
  const h = 140;
  return {
    width: 90,
    blocks: [G(cx, 36, h, 'stone')],
    enemies: [E(cx, GY - h, kind)],
  };
}

function keep(cx: number): Piece {
  const h = 104;
  return {
    width: 250,
    blocks: [
      G(cx - 92, 30, h, 'stone'),
      G(cx + 92, 30, h, 'stone'),
      S(cx, 230, 20, GY - h, 'wood'),
    ],
    enemies: [E(cx, GY, 'boss')],
  };
}

function nest(cx: number, kind: EnemyKind): Piece {
  const h = 84;
  return {
    width: 210,
    blocks: [
      G(cx - 70, 20, h), G(cx + 70, 20, h), S(cx, 180, 18, GY - h),
      G(cx + 118, 28, 28, 'tnt'),
    ],
    enemies: [E(cx, GY, kind)],
  };
}

type Build = (cx: number, rng: Rng, d: number, enemy: () => EnemyKind) => Piece;

const TEMPLATES: { minD: number; maxD: number; w: number; build: Build }[] = [
  { minD: 0, maxD: 7, w: 220, build: (cx, _r, d, e) => hut(cx, e(), d < 2 ? 88 : 100, d >= 5 ? 'stone' : 'wood') },
  { minD: 0, maxD: 6, w: 220, build: (cx, _r, _d, e) => loft(cx, e(), e()) },
  { minD: 0, maxD: 5, w: 170, build: (cx, _r, _d, e) => glassCase(cx, e()) },
  { minD: 1, maxD: 7, w: 120, build: (cx, r, d, e) => stack(cx, e(), d >= 4 ? 3 : 2 + (r() > 0.6 ? 1 : 0)) },
  { minD: 1, maxD: 7, w: 130, build: (cx, r, d, e) => podium(cx, e(), d >= 2 && r() > 0.35) },
  { minD: 2, maxD: 7, w: 260, build: (cx, r, d, e) => span(cx, e(), d >= 3 && r() > 0.4 ? e() : null) },
  { minD: 3, maxD: 7, w: 190, build: (cx, _r, _d, e) => bunker(cx, e()) },
  { minD: 2, maxD: 6, w: 110, build: (cx, _r, _d, e) => watch(cx, e()) },
  { minD: 2, maxD: 6, w: 210, build: (cx, _r, _d, e) => nest(cx, e()) },
];
function pickEnemy(rng: Rng, d: number): EnemyKind {
  const roll = rng();
  if (d >= 4 && roll < 0.22) return 'general';
  if (d >= 2 && roll < 0.38) return 'general';
  if (d === 0 && roll < 0.42) return 'officer';
  if (d >= 1 && roll < 0.55) return 'officer';
  if (d >= 3 && roll < 0.72) return 'officer';
  return 'minion';
}

function blockBox(b: BlockDef): { l: number; r: number; t: number; b: number } {
  return { l: b.x - b.w / 2, r: b.x + b.w / 2, t: b.y - b.h / 2, b: b.y + b.h / 2 };
}

function overlaps(a: BlockDef, b: BlockDef): boolean {
  const A = blockBox(a), B = blockBox(b);
  return A.l < B.r - 2 && A.r > B.l + 2 && A.t < B.b - 2 && A.b > B.t + 2;
}
function enemyCovered(e: EnemyDef, blocks: BlockDef[]): boolean {
  const r = ENEMY_RADIUS[e.kind];
  const top = e.y - r;
  const feet = e.y + r;
  for (const b of blocks) {
    const box = blockBox(b);
    const over = e.x > box.l + 6 && e.x < box.r - 6;
    const roof = over && box.b <= top + 8 && box.b >= top - 150 && b.w >= 40;
    const wall = Math.abs(b.x - e.x) < b.w / 2 + r + 28 && box.t < e.y + r && box.b > e.y - r && b.h >= 40;
    const on = over && Math.abs(feet - box.t) < 10;
    if (roof || wall || on) return true;
  }
  return false;
}

function addRoof(e: EnemyDef, blocks: BlockDef[]): void {
  const r = ENEMY_RADIUS[e.kind];
  blocks.push(S(e.x, 96, 16, e.y - r - 8, 'wood'));
}

export interface LevelStats {
  birds: number;
  enemies: number;
  birdPower: number;
  enemyPower: number;
  covered: number;
  ratio: number;
  tnt: number;
  stoneFrac: number;
}

export function analyzeLevel(level: LevelDef): LevelStats {
  const birdPower = level.birds.reduce((s, k) => s + BIRD_VALUE[k], 0);
  const enemyPower = level.enemies.reduce((s, e) => s + ENEMY_VALUE[e.kind], 0);
  const covered = level.enemies.filter((e) => enemyCovered(e, level.blocks)).length;
  const tnt = level.blocks.filter((b) => b.kind === 'tnt').length;
  const stone = level.blocks.filter((b) => b.kind === 'stone').length;
  return {
    birds: level.birds.length,
    enemies: level.enemies.length,
    birdPower, enemyPower,
    covered,
    ratio: enemyPower <= 0 ? 0 : birdPower / enemyPower,
    tnt,
    stoneFrac: level.blocks.length ? stone / level.blocks.length : 0,
  };
}

function chooseBirds(rng: Rng, d: number, enemyPower: number): BirdKind[] {
  const target = Math.max(3.15, Math.min(7.2, enemyPower * (0.88 - d * 0.026) + 0.2));
  const birds: BirdKind[] = [];
  if (d === 0) {
    return enemyPower <= 3.4 ? ['courier', 'courier', 'courier'] : ['courier', 'courier', 'swarm'];
  }
  const bag: BirdKind[] = d < 2 ? ['courier', 'courier', 'swarm']
    : d < 4 ? ['courier', 'swarm', 'wrecker']
    : d < 6 ? ['swarm', 'courier', 'wrecker', 'swarm']
    : ['courier', 'swarm', 'wrecker', 'swarm', 'courier'];
  for (const k of bag) {
    birds.push(k);
    const p = birds.reduce((s, x) => s + BIRD_VALUE[x], 0);
    if (p >= target && birds.length >= 3) break;
  }
  while (birds.reduce((s, x) => s + BIRD_VALUE[x], 0) < target - 0.4 && birds.length < 5) {
    birds.push(d >= 3 && rng() > 0.45 ? 'wrecker' : rng() > 0.4 ? 'swarm' : 'courier');
  }
  while (birds.reduce((s, x) => s + BIRD_VALUE[x], 0) > target + 0.75 && birds.length > 3) birds.pop();
  return birds;
}

function spawnWorld(level: LevelDef): World {
  const w = new World({ gravity: 1500 });
  const groundHy = 60;
  const ground = new Body({ x: WORLD_W / 2, y: GY + groundHy }, { kind: 'box', hx: WORLD_W, hy: groundHy }, true);
  ground.restitution = 0.1; ground.friction = 0.8;
  w.add(ground);
  for (const bd of level.blocks) {
    const b = new Body({ x: bd.x, y: bd.y }, { kind: 'box', hx: bd.w / 2, hy: bd.h / 2 });
    const kind = bd.kind ?? 'wood';
    b.meta = { type: 'block', kind, mass: BLOCK_MASS[kind] };
    b.restitution = kind === 'glass' ? 0.05 : kind === 'stone' ? 0.08 : 0.12;
    b.friction = kind === 'glass' ? 0.35 : 0.72;
    b.computeMass();
    w.add(b);
  }
  for (const ed of level.enemies) {
    const e = new Body({ x: ed.x, y: ed.y }, { kind: 'circle', r: ENEMY_RADIUS[ed.kind] });
    e.meta = { type: 'enemy', kind: ed.kind, mass: ENEMY_MASS[ed.kind] };
    e.restitution = 0.18; e.friction = 0.82;
    e.computeMass();
    w.add(e);
  }
  return w;
}

function settles(level: LevelDef): boolean {
  const w = spawnWorld(level);
  const y0 = w.bodies.filter((b) => b.meta.type === 'enemy').map((b) => b.pos.y);
  for (let i = 0; i < 300; i++) w.step(1 / 60);
  let maxV = 0;
  for (const b of w.bodies) {
    if (b.isStatic) continue;
    maxV = Math.max(maxV, Math.hypot(b.vel.x, b.vel.y));
  }
  const enemies = w.bodies.filter((b) => b.meta.type === 'enemy');
  if (enemies.length !== y0.length) return false;
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i]!.pos.y - y0[i]! > 36) return false;
    if (enemies[i]!.pos.y > GY + 4) return false;
  }
  return maxV < 40;
}

function assemble(rng: Rng, d: number, theme: ThemeId): LevelDef {
  const usedBoss = { v: false };
  const enemy = (): EnemyKind => pickEnemy(rng, d);
  const raw = TEMPLATES.filter((t) => d >= t.minD && d <= t.maxD);
  const pool = theme === 'aeroflot' ? raw.filter((t) => t.w <= 170) : raw;
  const count = d < 2 ? 2 : d < 5 ? 3 : d >= 6 ? 4 : 3;
  let x = 560;
  const blocks: BlockDef[] = [];
  const enemies: EnemyDef[] = [];
  const used = new Set<number>();
  if (theme === 'aeroflot') {
    const k = keep(900);
    blocks.push(...k.blocks);
    enemies.push(...k.enemies);
    usedBoss.v = true;
  }
  for (let n = 0; n < count; n++) {
    const opts = pool.filter((_, i) => !used.has(i) || pool.length < 3);
    const tmpl = pick(rng, opts.length ? opts : pool);
    used.add(pool.indexOf(tmpl));
    if (x + tmpl.w > (theme === 'aeroflot' ? 760 : 1230)) break;
    const cx = x + tmpl.w / 2;
    const piece = tmpl.build(cx, rng, d, enemy);
    const clash = piece.blocks.some((b) => blocks.some((o) => overlaps(b, o)));
    if (clash) { x += 24; n--; continue; }
    blocks.push(...piece.blocks);
    enemies.push(...piece.enemies);
    x += tmpl.w + irange(rng, 14, 32);
  }
  if (enemies.length < 3) {
    let cx = theme === 'aeroflot' ? 580 : Math.min(x + 90, 1180);
    const cap = theme === 'aeroflot' ? 760 : 1200;
    while (enemies.length < 3 && cx < cap) {
      const extra = theme === 'aeroflot' ? podium(cx, 'officer', true) : hut(cx, 'minion');
      if (!extra.blocks.some((b) => blocks.some((o) => overlaps(b, o)))) {
        blocks.push(...extra.blocks);
        enemies.push(...extra.enemies);
      }
      cx += theme === 'aeroflot' ? 140 : 130;
    }
  }
  for (const e of enemies) {
    if (!enemyCovered(e, blocks)) addRoof(e, blocks);
  }
  // one tnt max; strip extras
  let tntSeen = 0;
  for (const b of blocks) {
    if (b.kind !== 'tnt') continue;
    tntSeen++;
    if (tntSeen > 1 || d < 2) b.kind = 'wood';
  }
  const birds = chooseBirds(rng, d, enemies.reduce((s, e) => s + ENEMY_VALUE[e.kind], 0));
  return { name: theme, subtitle: '', theme, birds, blocks, enemies };
}

export function generateLevel(seed: number, difficulty: number, theme: ThemeId): LevelDef {
  for (let attempt = 0; attempt < 14; attempt++) {
    const rng = mulberry32((seed + difficulty * 7919 + attempt * 104729) >>> 0);
    const level = assemble(rng, difficulty, theme);
    const st = analyzeLevel(level);
    if (st.enemies < 3 || st.birds < 3) continue;
    if (st.covered < st.enemies) continue;
    if (st.ratio < 0.66 || st.ratio > 1.22) continue;
    if (st.tnt > 1) continue;
    if (st.stoneFrac > 0.58) continue;
    if (theme === 'aeroflot' && !level.enemies.some((e) => e.kind === 'boss')) continue;
    if (!settles(level)) continue;
    return level;
  }
  const rng = mulberry32((seed + 13) >>> 0);
  return assemble(rng, Math.max(0, difficulty - 1), theme);
}

export function generateCampaign(seed: number): LevelDef[] {
  return CAMPAIGN_THEMES.map((theme, i) => generateLevel(seed, i, theme));
}

let campaign: LevelDef[] = [];
let campaignSeed = DEFAULT_SEED;

export function newCampaign(seed?: number): number {
  campaignSeed = seed ?? (Date.now() & 0x7fffffff);
  campaign = generateCampaign(campaignSeed);
  return campaignSeed;
}

export function getLevels(): LevelDef[] {
  if (campaign.length === 0) campaign = generateCampaign(DEFAULT_SEED);
  return campaign;
}

export function getCampaignSeed(): number { return campaignSeed; }
