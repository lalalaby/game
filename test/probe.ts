import { World, Body, collide } from '../src/game/physics';

const GROUND_Y = 660;
const w = new World();
const groundHy = 60;
const ground = new Body({ x: 640, y: GROUND_Y + groundHy }, { kind: 'box', hx: 1280, hy: groundHy }, true);
ground.restitution = 0.1; ground.friction = 0.8;
w.add(ground);

function box(x: number, y: number, hx: number, hy: number): Body {
  const b = new Body({ x, y }, { kind: 'box', hx, hy });
  b.restitution = 0.12; b.friction = 0.7;
  w.add(b);
  return b;
}
const b1 = box(400, 630, 30, 30);
const b2 = box(400, 570, 30, 30);

// monkey-patch substep via step: just log each frame
const dt = 1 / 60;
for (let i = 0; i < 30; i++) {
  w.step(dt);
  const m12 = collide(b1, b2);
  const mg1 = collide(ground, b1);
  console.log(
    `f${i}: b1.y=${b1.pos.y.toFixed(3)} vy=${b1.vel.y.toFixed(3)} | b2.y=${b2.pos.y.toFixed(3)} vy=${b2.vel.y.toFixed(3)}` +
    ` | m(b1,b2)=${m12 ? `d=${m12.depth.toFixed(4)} n=(${m12.normal.x},${m12.normal.y}) pts=${m12.points.length}` : 'NULL'}` +
    ` | m(g,b1)=${mg1 ? `d=${mg1.depth.toFixed(4)}` : 'NULL'}`
  );
}
