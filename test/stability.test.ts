// Isolated physics stability tests (run via esbuild bundle + node).
import { World, Body } from '../src/game/physics';

const GROUND_Y = 660;

function makeWorld(): World {
  const w = new World();
  const groundHy = 60;
  const ground = new Body({ x: 640, y: GROUND_Y + groundHy }, { kind: 'box', hx: 1280, hy: groundHy }, true);
  ground.restitution = 0.1; ground.friction = 0.8;
  w.add(ground);
  return w;
}

function box(w: World, x: number, y: number, hx: number, hy: number, label: string): Body {
  const b = new Body({ x, y }, { kind: 'box', hx, hy });
  b.restitution = 0.12; b.friction = 0.7;
  b.meta = { label };
  w.add(b);
  return b;
}

function circle(w: World, x: number, y: number, r: number, label: string): Body {
  const b = new Body({ x, y }, { kind: 'circle', r });
  b.restitution = 0.2; b.friction = 0.5;
  b.meta = { label };
  w.add(b);
  return b;
}

function run(w: World, seconds: number): void {
  const dt = 1 / 60;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) w.step(dt);
}

function maxSpeed(w: World): number {
  let m = 0;
  for (const b of w.bodies) if (!b.isStatic) m = Math.max(m, Math.hypot(b.vel.x, b.vel.y));
  return m;
}

let failures = 0;
function check(name: string, cond: boolean, detail: string): void {
  const ok = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`[${ok}] ${name}: ${detail}`);
}

// ---- Test 1: plank spanning two pillars (the "table" that used to sink) ----
{
  const w = makeWorld();
  // pillars: bottom at 660, top at 550
  const pA = box(w, 760, 605, 13, 55, 'pillarA');
  const pB = box(w, 850, 605, 13, 55, 'pillarB');
  // plank: center y=539, spans x 740..870, rests on pillar tops (550)
  const plank = box(w, 805, 539, 65, 11, 'plank');
  run(w, 3);
  check('table: plank rests near y=539', Math.abs(plank.pos.y - 539) < 4, `plank.y=${plank.pos.y.toFixed(2)}`);
  check('table: pillarA not floating', pA.pos.y > 590, `pA.y=${pA.pos.y.toFixed(2)} (expect ~605)`);
  check('table: pillarB not floating', pB.pos.y > 590, `pB.y=${pB.pos.y.toFixed(2)} (expect ~605)`);
  check('table: settled (low speed)', maxSpeed(w) < 15, `maxSpeed=${maxSpeed(w).toFixed(2)}`);
}

// ---- Test 2: simple vertical stack of boxes ----
{
  const w = makeWorld();
  const b1 = box(w, 400, 630, 30, 30, 'b1'); // bottom at 660
  const b2 = box(w, 400, 570, 30, 30, 'b2'); // rests on b1 (top=600)
  const b3 = box(w, 400, 510, 30, 30, 'b3'); // rests on b2 (top=540)
  run(w, 3);
  check('stack: top box near y=510', Math.abs(b3.pos.y - 510) < 4, `b3.y=${b3.pos.y.toFixed(2)}`);
  check('stack: bottom box on ground', b1.pos.y > 615, `b1.y=${b1.pos.y.toFixed(2)} (expect ~630)`);
  check('stack: settled', maxSpeed(w) < 15, `maxSpeed=${maxSpeed(w).toFixed(2)}`);
}

// ---- Test 3: circle resting on a plank on two pillars ----
{
  const w = makeWorld();
  const pA = box(w, 760, 605, 13, 55, 'pillarA');
  const pB = box(w, 850, 605, 13, 55, 'pillarB');
  const plank = box(w, 805, 539, 65, 11, 'plank');
  const c = circle(w, 805, 527 - 14, 14, 'ball'); // center above plank top (528)
  run(w, 3);
  check('circle: ball rests on plank', Math.abs(c.pos.y - (528 - 14)) < 5, `ball.y=${c.pos.y.toFixed(2)} (expect ~514)`);
  check('circle: plank still supported', Math.abs(plank.pos.y - 539) < 4, `plank.y=${plank.pos.y.toFixed(2)}`);
  check('circle: settled', maxSpeed(w) < 15, `maxSpeed=${maxSpeed(w).toFixed(2)}`);
}

// ---- Test 4: tall narrow tower (stress) ----
{
  const w = makeWorld();
  let y = 630;
  for (let i = 0; i < 5; i++) { box(w, 300, y, 25, 30, `t${i}`); y -= 60; }
  run(w, 4);
  // tower may lean but must not collapse to the ground entirely
  const top = w.bodies[w.bodies.length - 1];
  check('tower: top box above y=300', top.pos.y < 400, `top.y=${top.pos.y.toFixed(2)}`);
}

console.log(failures === 0 ? '\nALL STABILITY TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
