// 2D rigid-body physics: impulse solver, SAT collision, sleeping.
// Screen coordinates (y-down) used consistently for physics + rendering.

export interface Vec { x: number; y: number }

export type Shape =
  | { kind: 'circle'; r: number }
  | { kind: 'box'; hx: number; hy: number };

export const V = {
  add: (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y }),
  scale: (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s }),
  dot: (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y,
  cross: (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x,
  crossSV: (s: number, v: Vec): Vec => ({ x: -s * v.y, y: s * v.x }),
  len: (a: Vec): number => Math.hypot(a.x, a.y),
  len2: (a: Vec): number => a.x * a.x + a.y * a.y,
  norm: (a: Vec): Vec => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; },
  rot: (v: Vec, ang: number): Vec => {
    const c = Math.cos(ang), s = Math.sin(ang);
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
  },
};

export interface AABB { minX: number; minY: number; maxX: number; maxY: number }

let BODY_ID = 1;

export class Body {
  id = BODY_ID++;
  pos: Vec; vel: Vec = { x: 0, y: 0 };
  angle = 0; angVel = 0;
  shape: Shape;
  mass = 0; invMass = 0; inertia = 0; invInertia = 0;
  restitution = 0.15; friction = 0.6;
  isStatic = false;
  sleeping = false; sleepTime = 0;
  meta: Record<string, unknown> = {};

  constructor(pos: Vec, shape: Shape, isStatic = false) {
    this.pos = { ...pos };
    this.shape = shape;
    this.isStatic = isStatic;
    if (!isStatic) this.computeMass();
  }

  computeMass(): void {
    const m = typeof this.meta.mass === 'number' ? this.meta.mass : undefined;
    let mass: number, inertia: number;
    if (this.shape.kind === 'circle') {
      const r = this.shape.r;
      mass = m ?? Math.PI * r * r * 0.0015;
      inertia = 0.5 * mass * r * r;
    } else {
      const hx = this.shape.hx, hy = this.shape.hy;
      mass = m ?? (4 * hx * hy) * 0.0015;
      inertia = (mass / 12) * ((2 * hx) ** 2 + (2 * hy) ** 2);
    }
    if (this.isStatic) {
      this.mass = 0; this.invMass = 0; this.inertia = 0; this.invInertia = 0;
      return;
    }
    this.mass = mass; this.invMass = 1 / mass;
    this.inertia = inertia; this.invInertia = 1 / inertia;
  }

  aabb(): AABB {
    if (this.shape.kind === 'circle') {
      const r = this.shape.r;
      return { minX: this.pos.x - r, minY: this.pos.y - r, maxX: this.pos.x + r, maxY: this.pos.y + r };
    }
    const vs = boxVerts(this);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const v of vs) {
      minX = Math.min(minX, v.x); minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y);
    }
    return { minX, minY, maxX, maxY };
  }

  worldVerts(): Vec[] { return boxVerts(this); }
  wake(): void { this.sleeping = false; this.sleepTime = 0; }
}

export function boxVerts(b: Body): Vec[] {
  if (b.shape.kind !== 'box') return [];
  const { hx, hy } = b.shape;
  const local = [
    { x: -hx, y: -hy }, { x: hx, y: -hy }, { x: hx, y: hy }, { x: -hx, y: hy },
  ];
  const c = Math.cos(b.angle), s = Math.sin(b.angle);
  return local.map((p) => ({ x: b.pos.x + p.x * c - p.y * s, y: b.pos.y + p.x * s + p.y * c }));
}

export function boxNormals(b: Body): Vec[] {
  if (b.shape.kind !== 'box') return [];
  const local = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
  const c = Math.cos(b.angle), s = Math.sin(b.angle);
  return local.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
}

// ---------------------------------------------------------------------------
// Collision detection (SAT with reference-face clipping)
// ---------------------------------------------------------------------------

export interface Manifold {
  a: Body; b: Body;
  normal: Vec; // from a to b
  depth: number;
  points: { contact: Vec; ra: Vec; rb: Vec }[];
}

function aabbOverlap(a: AABB, b: AABB): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function circleRadius(b: Body): number {
  return b.shape.kind === 'circle' ? b.shape.r : 0;
}

function circleVsCircle(a: Body, b: Body): Manifold | null {
  const d = V.sub(b.pos, a.pos);
  const dist = Math.hypot(d.x, d.y);
  const ra = circleRadius(a), rb = circleRadius(b);
  if (dist >= ra + rb) return null;
  const n = dist > 1e-6 ? V.scale(d, 1 / dist) : { x: 0, y: -1 };
  const contact = V.add(a.pos, V.scale(n, ra));
  return {
    a, b, normal: n, depth: ra + rb - dist,
    points: [{ contact, ra: V.scale(n, ra), rb: V.scale(n, -rb) }],
  };
}

function circleVsBox(circle: Body, box: Body, swap: boolean): Manifold | null {
  const r = circleRadius(circle);
  const cos = Math.cos(-box.angle), sin = Math.sin(-box.angle);
  const rel = V.sub(circle.pos, box.pos);
  const lx = rel.x * cos - rel.y * sin;
  const ly = rel.x * sin + rel.y * cos;
  const hx = box.shape.kind === 'box' ? box.shape.hx : 0;
  const hy = box.shape.kind === 'box' ? box.shape.hy : 0;
  const cx = Math.max(-hx, Math.min(hx, lx));
  const cy = Math.max(-hy, Math.min(hy, ly));
  const dx = lx - cx, dy = ly - cy;
  const dist2 = dx * dx + dy * dy;
  if (dist2 > r * r) return null;
  let localNormal: Vec;
  if (dist2 > 1e-9) {
    const dist = Math.sqrt(dist2);
    localNormal = { x: dx / dist, y: dy / dist };
  } else {
    const px = hx - Math.abs(lx), py = hy - Math.abs(ly);
    localNormal = px < py ? { x: lx > 0 ? 1 : -1, y: 0 } : { x: 0, y: ly > 0 ? 1 : -1 };
  }
  const depth = r - Math.sqrt(dist2);
  const cosW = Math.cos(box.angle), sinW = Math.sin(box.angle);
  // localNormal points box-surface -> circle; manifold normal must point a -> b (circle -> box)
  let normal = { x: -(localNormal.x * cosW - localNormal.y * sinW), y: -(localNormal.x * sinW + localNormal.y * cosW) };
  const contactWorld = { x: box.pos.x + cx * cosW - cy * sinW, y: box.pos.y + cx * sinW + cy * cosW };
  let a: Body, b: Body;
  if (swap) { a = box; b = circle; normal = V.scale(normal, -1); } else { a = circle; b = box; }
  return { a, b, normal, depth, points: [{ contact: contactWorld, ra: V.sub(contactWorld, a.pos), rb: V.sub(contactWorld, b.pos) }] };
}
function projectRange(verts: Vec[], axis: Vec): [number, number] {
  let min = Infinity, max = -Infinity;
  for (const v of verts) {
    const p = V.dot(v, axis);
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return [min, max];
}

function overlapOnAxis(va: Vec[], vb: Vec[], axis: Vec): number {
  const [minA, maxA] = projectRange(va, axis);
  const [minB, maxB] = projectRange(vb, axis);
  return Math.min(maxA, maxB) - Math.max(minA, minB);
}

function clipSegmentToLine(v1: Vec, v2: Vec, normal: Vec, offset: number): Vec[] {
  const out: Vec[] = [];
  const d1 = V.dot(normal, v1) - offset;
  const d2 = V.dot(normal, v2) - offset;
  if (d1 <= 0) out.push(v1);
  if (d2 <= 0) out.push(v2);
  if (d1 * d2 < 0) {
    const t = d1 / (d1 - d2);
    out.push({ x: v1.x + t * (v2.x - v1.x), y: v1.y + t * (v2.y - v1.y) });
  }
  return out;
}
function boxVsBox(a: Body, b: Body): Manifold | null {
  const va = a.worldVerts(), na = boxNormals(a);
  const vb = b.worldVerts(), nb = boxNormals(b);

  const ovA: number[] = [];
  const ovB: number[] = [];
  let bestOverlap = Infinity;
  for (let i = 0; i < 4; i++) {
    const ov = overlapOnAxis(vb, va, na[i]);
    if (ov < 0) return null;
    ovA[i] = ov;
    if (ov < bestOverlap) bestOverlap = ov;
  }
  for (let i = 0; i < 4; i++) {
    const ov = overlapOnAxis(va, vb, nb[i]);
    if (ov < 0) return null;
    ovB[i] = ov;
    if (ov < bestOverlap) bestOverlap = ov;
  }

  // Among faces within a band of the SAT minimum, pick the one whose
  // outward normal points toward the other body. Prefer a's face so the
  // manifold normal stays a→b without a flip. Ties on a shared axis must
  // not pick the far face (that produced inverted normals + negative depth).
  const EPS = 1e-4;
  const ab = V.sub(b.pos, a.pos);
  let refBody: Body = a, refN: Vec = na[0], refIdx = 0;
  let found = false;
  for (let i = 0; i < 4; i++) {
    if (ovA[i] <= bestOverlap + EPS && V.dot(na[i], ab) > 0) {
      refBody = a; refN = na[i]; refIdx = i; found = true; break;
    }
  }
  if (!found) {
    const ba = V.sub(a.pos, b.pos);
    for (let i = 0; i < 4; i++) {
      if (ovB[i] <= bestOverlap + EPS && V.dot(nb[i], ba) > 0) {
        refBody = b; refN = nb[i]; refIdx = i; found = true; break;
      }
    }
  }
  if (!found) {
    for (let i = 0; i < 4; i++) {
      if (ovA[i] <= bestOverlap + EPS) { refBody = a; refN = na[i]; refIdx = i; found = true; break; }
    }
    if (!found) {
      for (let i = 0; i < 4; i++) {
        if (ovB[i] <= bestOverlap + EPS) { refBody = b; refN = nb[i]; refIdx = i; break; }
      }
    }
  }

  const otherBody = refBody === a ? b : a;
  const otherVerts = otherBody.worldVerts();
  const otherNormals = boxNormals(otherBody);
  let incIdx = 0, minDot = Infinity;
  for (let i = 0; i < 4; i++) {
    const d = V.dot(refN, otherNormals[i]);
    if (d < minDot) { minDot = d; incIdx = i; }
  }
  const v1 = otherVerts[incIdx], v2 = otherVerts[(incIdx + 1) % 4];

  const refVerts = refBody.worldVerts();
  const r1 = refVerts[refIdx], r2 = refVerts[(refIdx + 1) % 4];
  const tangent = V.norm(V.sub(r2, r1));

  let clipped = clipSegmentToLine(v1, v2, V.scale(tangent, -1), V.dot(V.scale(tangent, -1), r1));
  if (clipped.length < 2) return null;
  clipped = clipSegmentToLine(clipped[0], clipped[1], tangent, V.dot(tangent, r2));
  if (clipped.length < 2) return null;

  const refPlaneOffset = V.dot(refN, r1);
  const nAB = refBody === a ? refN : V.scale(refN, -1);
  const points: Manifold['points'] = [];
  for (const c of clipped) {
    const sep = V.dot(refN, c) - refPlaneOffset;
    if (sep > 0) continue;
    points.push({ contact: c, ra: V.sub(c, a.pos), rb: V.sub(c, b.pos) });
  }
  if (points.length === 0) return null;
  return { a, b, normal: nAB, depth: bestOverlap, points };
}

export function collide(a: Body, b: Body): Manifold | null {
  if (!aabbOverlap(a.aabb(), b.aabb())) return null;
  const aCircle = a.shape.kind === 'circle', bCircle = b.shape.kind === 'circle';
  if (aCircle && bCircle) return circleVsCircle(a, b);
  if (aCircle) return circleVsBox(a, b, false);
  if (bCircle) return circleVsBox(b, a, true);
  return boxVsBox(a, b);
}

// ---------------------------------------------------------------------------
// Impulse solver + world integration
// ---------------------------------------------------------------------------

const SLOP = 0.02;
const BAASING = 0.2;
const REST_THRESHOLD = 30; // px/s approach speed below which restitution is disabled (stable rest)
const SLEEP_SPEED = 4; // px/s below which a body may sleep
const SLEEP_TIME = 0.5; // seconds of low motion before sleeping

export interface WorldOptions {
  gravity?: number;
  iterations?: number;
}

// per-contact accumulated impulse state (lives as long as the manifold object)
interface ContactSolver {
  ra: Vec; rb: Vec;
  invMassSumN: number; // effective mass along the normal
  invMassSumT: number; // effective mass along the tangent
  Pn: number; // accumulated normal impulse magnitude (>= 0)
  Pt: number; // accumulated tangent (friction) impulse
  targetN: number; // desired post-impact relative normal velocity (bias)
}
interface SolverManifold {
  m: Manifold;
  n: Vec;
  t: Vec;
  mu: number;
  approach: number;
  cs: ContactSolver[];
}
export class World {
  bodies: Body[] = [];
  gravity: Vec;
  private iterations: number;
  onImpact?: (a: Body, b: Body, speed: number, point: Vec) => void;
  private warmStart = new Map<string, { pn: number[]; pt: number[] }>();

  constructor(opts: WorldOptions = {}) {
    this.gravity = { x: 0, y: opts.gravity ?? 1400 };
    this.iterations = opts.iterations ?? 14;
  }

  add(b: Body): void { this.bodies.push(b); }
  remove(b: Body): void {
    this.wakeAround(b.pos.x, b.pos.y, 96);
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  wakeAround(x: number, y: number, r: number): void {
    const r2 = r * r;
    for (const o of this.bodies) {
      if (o.isStatic) continue;
      const dx = o.pos.x - x, dy = o.pos.y - y;
      if (dx * dx + dy * dy <= r2) o.wake();
    }
  }

  step(dt: number): void {
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    for (let s = 0; s < sub; s++) this.substep(h);
  }
  private substep(h: number): void {
    this.unsleepUnsupported();

    const bodies = this.bodies;
    for (const b of bodies) {
      if (b.isStatic || b.sleeping) continue;
      b.vel.y += this.gravity.y * h;
      b.vel.x *= 1 - 0.02 * h;
      b.angVel *= 1 - 0.05 * h;
    }

    const manifolds: Manifold[] = [];
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        const aInactive = a.isStatic || a.sleeping;
        const bInactive = b.isStatic || b.sleeping;
        if (aInactive && bInactive) continue;
        if (!aabbOverlap(a.aabb(), b.aabb())) continue;
        const m = collide(a, b);
        if (!m) continue;
        manifolds.push(m);
        if (a.sleeping && !bInactive) a.wake();
        if (b.sleeping && !aInactive) b.wake();
      }
    }

    const prepared = manifolds.map((m) => this.prepareManifold(m, h));
    for (const sm of prepared) this.applyWarmStart(sm);

    for (let iter = 0; iter < this.iterations; iter++) {
      for (const sm of prepared) this.solveContactsOnce(sm);
    }

    for (const sm of prepared) this.correctPositions(sm);

    const nextWarm = new Map<string, { pn: number[]; pt: number[] }>();
    for (const sm of prepared) {
      nextWarm.set(this.pairKey(sm.m.a, sm.m.b), {
        pn: sm.cs.map((c) => c.Pn),
        pt: sm.cs.map((c) => c.Pt),
      });
      if (sm.approach > 60) this.onImpact?.(sm.m.a, sm.m.b, sm.approach, sm.m.points[0].contact);
    }
    this.warmStart = nextWarm;

    for (const b of bodies) {
      if (b.isStatic || b.sleeping) continue;
      b.pos.x += b.vel.x * h;
      b.pos.y += b.vel.y * h;
      b.angle += b.angVel * h;
    }

    for (const b of bodies) {
      if (b.isStatic) continue;
      const speed2 = V.len2(b.vel);
      if (speed2 < SLEEP_SPEED * SLEEP_SPEED && Math.abs(b.angVel) < 0.15) {
        b.sleepTime += h;
        if (b.sleepTime > SLEEP_TIME) { b.sleeping = true; b.vel = { x: 0, y: 0 }; b.angVel = 0; }
      } else {
        b.sleepTime = 0;
      }
    }
  }

  private pairKey(a: Body, b: Body): string {
    return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
  }

  private prepareManifold(m: Manifold, h: number): SolverManifold {
    const a = m.a, b = m.b;
    const n = m.normal;
    const t: Vec = { x: -n.y, y: n.x };
    const mu = Math.sqrt(a.friction * b.friction);
    const prev = this.warmStart.get(this.pairKey(a, b));
    const cs: ContactSolver[] = m.points.map((p, i) => {
      const rnA = V.cross(p.ra, n), rnB = V.cross(p.rb, n);
      const rtA = V.cross(p.ra, t), rtB = V.cross(p.rb, t);
      return {
        ra: p.ra, rb: p.rb,
        invMassSumN: Math.max(1e-8, a.invMass + b.invMass + a.invInertia * rnA * rnA + b.invInertia * rnB * rnB),
        invMassSumT: Math.max(1e-8, a.invMass + b.invMass + a.invInertia * rtA * rtA + b.invInertia * rtB * rtB),
        Pn: prev?.pn[i] ?? 0,
        Pt: prev?.pt[i] ?? 0,
        targetN: 0,
      };
    });
    const p0 = m.points[0];
    const rv0 = V.sub(
      V.add(b.vel, V.crossSV(b.angVel, p0.rb)),
      V.add(a.vel, V.crossSV(a.angVel, p0.ra))
    );
    const approach = -V.dot(rv0, n);
    const e = Math.min(a.restitution, b.restitution);
    const bias = (Math.max(m.depth - SLOP, 0) * BAASING) / Math.max(h, 1e-6);
    for (const c of cs) c.targetN = (approach > REST_THRESHOLD ? approach * e : 0) + bias;
    return { m, n, t, mu, approach, cs };
  }

  private applyWarmStart(sm: SolverManifold): void {
    const a = sm.m.a, b = sm.m.b;
    for (const c of sm.cs) {
      if (c.Pn === 0 && c.Pt === 0) continue;
      const impulse = V.add(V.scale(sm.n, c.Pn), V.scale(sm.t, c.Pt));
      a.vel = V.sub(a.vel, V.scale(impulse, a.invMass));
      b.vel = V.add(b.vel, V.scale(impulse, b.invMass));
      a.angVel -= a.invInertia * V.cross(c.ra, impulse);
      b.angVel += b.invInertia * V.cross(c.rb, impulse);
    }
  }

  private solveContactsOnce(sm: SolverManifold): void {
    const a = sm.m.a, b = sm.m.b;
    const n = sm.n, t = sm.t, mu = sm.mu;
    for (const c of sm.cs) {
      const rv = V.sub(
        V.add(b.vel, V.crossSV(b.angVel, c.rb)),
        V.add(a.vel, V.crossSV(a.angVel, c.ra))
      );
      const velN = V.dot(rv, n);
      const lambda = (c.targetN - velN) / c.invMassSumN;
      const newPn = Math.max(c.Pn + lambda, 0);
      const dPn = newPn - c.Pn;
      c.Pn = newPn;
      const impulseN = V.scale(n, dPn);
      a.vel = V.sub(a.vel, V.scale(impulseN, a.invMass));
      b.vel = V.add(b.vel, V.scale(impulseN, b.invMass));
      a.angVel -= a.invInertia * V.cross(c.ra, impulseN);
      b.angVel += b.invInertia * V.cross(c.rb, impulseN);

      const rv2 = V.sub(
        V.add(b.vel, V.crossSV(b.angVel, c.rb)),
        V.add(a.vel, V.crossSV(a.angVel, c.ra))
      );
      const velT = V.dot(rv2, t);
      const lambdaT = -velT / c.invMassSumT;
      const maxPt = mu * c.Pn;
      const newPt = Math.min(Math.max(c.Pt + lambdaT, -maxPt), maxPt);
      const dPt = newPt - c.Pt;
      c.Pt = newPt;
      const impulseT = V.scale(t, dPt);
      a.vel = V.sub(a.vel, V.scale(impulseT, a.invMass));
      b.vel = V.add(b.vel, V.scale(impulseT, b.invMass));
      a.angVel -= a.invInertia * V.cross(c.ra, impulseT);
      b.angVel += b.invInertia * V.cross(c.rb, impulseT);
    }
  }

  private correctPositions(sm: SolverManifold): void {
    const a = sm.m.a, b = sm.m.b, n = sm.n;
    const raw = (Math.max(sm.m.depth - SLOP, 0) / (a.invMass + b.invMass || 1)) * BAASING;
    const correction = Math.min(8, raw);
    if (correction <= 0) return;
    a.pos = V.sub(a.pos, V.scale(n, correction * a.invMass));
    b.pos = V.add(b.pos, V.scale(n, correction * b.invMass));
  }

  /** Sleeping bodies float if their support vanished — wake those with nothing under them. */
  private unsleepUnsupported(): void {
    for (const b of this.bodies) {
      if (b.isStatic || !b.sleeping) continue;
      if (!this.hasSupport(b)) b.wake();
    }
  }

  private hasSupport(b: Body): boolean {
    const bb = b.aabb();
    for (const o of this.bodies) {
      if (o === b) continue;
      const ob = o.aabb();
      if (bb.maxX <= ob.minX + 3 || bb.minX >= ob.maxX - 3) continue;
      const bottom = bb.maxY;
      const top = ob.minY;
      if (bottom >= top - 6 && bottom <= top + 12) return true;
    }
    return false;
  }
}
