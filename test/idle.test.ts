// Spawn the generated campaign and confirm layouts settle.
import { World, Body } from '../src/game/physics';
import {
  getLevels, GROUND_Y, WORLD_W, ENEMY_RADIUS, BIRD_RADIUS, SLING_X, SLING_Y,
  CAMPAIGN_THEMES, analyzeLevel, newCampaign, DEFAULT_SEED,
} from '../src/game/levels';
import type { BlockKind, EnemyKind } from '../src/game/levels';

const ENEMY_HP: Record<EnemyKind, number> = { minion: 40, officer: 70, general: 110, boss: 220 };
const BLOCK_HP: Record<BlockKind, number> = { wood: 60, stone: 160, glass: 25, tnt: 22 };

function spawnLevel(i: number): { w: World; enemies: Body[]; blocks: Body[]; spawnY: number[] } {
  const level = getLevels()[i];
  const w = new World({ gravity: 1500 });
  const groundHy = 60;
  const ground = new Body({ x: WORLD_W / 2, y: GROUND_Y + groundHy }, { kind: 'box', hx: WORLD_W, hy: groundHy }, true);
  ground.restitution = 0.1; ground.friction = 0.8;
  w.add(ground);
  const blocks: Body[] = [];
  for (const bd of level.blocks) {
    const b = new Body({ x: bd.x, y: bd.y }, { kind: 'box', hx: bd.w / 2, hy: bd.h / 2 });
    const kind = bd.kind ?? 'wood';
    b.meta = { type: 'block', kind, hp: BLOCK_HP[kind] };
    b.restitution = kind === 'glass' ? 0.05 : 0.12;
    b.friction = 0.7;
    w.add(b);
    blocks.push(b);
  }
  const enemies: Body[] = [];
  const spawnY: number[] = [];
  for (const ed of level.enemies) {
    const r = ENEMY_RADIUS[ed.kind];
    const e = new Body({ x: ed.x, y: ed.y }, { kind: 'circle', r });
    e.meta = { type: 'enemy', kind: ed.kind, hp: ENEMY_HP[ed.kind] };
    e.restitution = 0.2; e.friction = 0.5;
    w.add(e);
    enemies.push(e);
    spawnY.push(ed.y);
  }
  return { w, enemies, blocks, spawnY };
}

function run(w: World, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) w.step(dt);
}

function maxSpeed(w: World): number {
  let m = 0;
  for (const b of w.bodies) {
    if (b.isStatic) continue;
    m = Math.max(m, Math.hypot(b.vel.x, b.vel.y));
  }
  return m;
}

let failures = 0;
function check(name: string, cond: boolean, detail: string): void {
  if (cond) console.log(`  ok  ${name}  ${detail}`);
  else { console.log(`  FAIL ${name}  ${detail}`); failures++; }
}

newCampaign(DEFAULT_SEED);
const levels = getLevels();
check('campaign size', levels.length === CAMPAIGN_THEMES.length, `${levels.length} levels`);
check('themes',
  levels.map((l) => l.theme).join(',') === CAMPAIGN_THEMES.join(','),
  levels.map((l) => l.theme).join(','));

for (let i = 0; i < levels.length; i++) {
  const { w, enemies, blocks, spawnY } = spawnLevel(i);
  const startCount = w.bodies.length;
  run(w, 5);
  const sunk = enemies.filter((e) => e.pos.y > GROUND_Y + 4);
  const dropped = enemies.filter((e, k) => e.pos.y - spawnY[k] > 80);
  const through = [...blocks, ...enemies].filter((b) => b.pos.y > GROUND_Y + 40);
  check(`L${i + 1} persist`, w.bodies.length === startCount, `${w.bodies.length}/${startCount}`);
  check(`L${i + 1} enemies`, enemies.length === levels[i].enemies.length, `${enemies.length}`);
  check(`L${i + 1} no sink`, sunk.length === 0, sunk.map((e) => e.pos.y.toFixed(1)).join(','));
  check(`L${i + 1} no drop`, dropped.length === 0, dropped.map((e) => e.pos.y.toFixed(1)).join(','));
  check(`L${i + 1} above ground`, through.length === 0, through.map((b) => b.pos.y.toFixed(1)).join(','));
  check(`L${i + 1} settled`, maxSpeed(w) < 40, `vmax=${maxSpeed(w).toFixed(2)}`);
}

{
  const w = new World({ gravity: 1500 });
  const ground = new Body({ x: WORLD_W / 2, y: GROUND_Y + 60 }, { kind: 'box', hx: WORLD_W, hy: 60 }, true);
  w.add(ground);
  const box = new Body({ x: 400, y: GROUND_Y - 30 }, { kind: 'box', hx: 30, hy: 30 });
  box.meta = { type: 'block', kind: 'wood' };
  w.add(box);
  const pig = new Body({ x: 400, y: GROUND_Y - 60 - 17 }, { kind: 'circle', r: 17 });
  pig.meta = { type: 'enemy', kind: 'minion' };
  w.add(pig);
  run(w, 2);
  const y0 = pig.pos.y;
  w.remove(box);
  run(w, 2);
  check('support removed pig falls', pig.pos.y > y0 + 20, `y0=${y0.toFixed(1)} y=${pig.pos.y.toFixed(1)}`);
  check('fallen pig on ground', pig.pos.y + 17 > GROUND_Y - 10, `bottom=${(pig.pos.y + 17).toFixed(1)}`);
}

check('L1 bird count', levels[0].birds.length >= 3 && levels[0].birds.length <= 5, levels[0].birds.join(','));
for (let i = 0; i < levels.length; i++) {
  const st = analyzeLevel(levels[i]);
  check(`L${i + 1} covered`, st.covered === st.enemies, `${st.covered}/${st.enemies}`);
  check(`L${i + 1} ratio`, st.ratio >= 0.65 && st.ratio <= 1.22, st.ratio.toFixed(2));
  check(`L${i + 1} tnt cap`, st.tnt <= 1, `${st.tnt}`);
}

{
  const w = new World({ gravity: 1500 });
  const ground = new Body({ x: WORLD_W / 2, y: GROUND_Y + 60 }, { kind: 'box', hx: WORLD_W, hy: 60 }, true);
  ground.restitution = 0.1; ground.friction = 0.8;
  w.add(ground);
  const post = new Body({ x: 820, y: GROUND_Y - 48 }, { kind: 'box', hx: 11, hy: 48 });
  post.meta = { type: 'block', kind: 'wood' };
  w.add(post);
  let impacts = 0;
  w.onImpact = () => { impacts++; };
  const bird = new Body({ x: SLING_X, y: SLING_Y }, { kind: 'circle', r: BIRD_RADIUS.courier });
  bird.meta = { type: 'bird', kind: 'courier' };
  bird.restitution = 0.35; bird.friction = 0.4;
  bird.vel = { x: 1200, y: -180 };
  w.add(bird);
  run(w, 2.5);
  check('launch impacts', impacts > 0, `impacts=${impacts}`);
  check('bird left sling', bird.pos.x > SLING_X + 80, `x=${bird.pos.x.toFixed(1)}`);
}

console.log(failures === 0 ? '\nALL IDLE TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
