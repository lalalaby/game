// Game orchestration: state machine, slingshot, damage, scoring, win/lose.
import { Body, V, World } from './physics';
import type { Vec } from './physics';
import { Renderer } from './renderer';
import type { RenderState, PlaneState } from './renderer';
import { Particles } from './particles';
import { AudioEngine } from '../audio/engine';
import {
  getLevels, GROUND_Y, SLING_X, SLING_Y, MAX_POWER,
  ENEMY_RADIUS, BIRD_RADIUS, WORLD_W, WORLD_H, FLAG_POLE, SITES,
} from './levels';
import { newCampaign, getCampaignSeed } from './generate';
import type { LevelDef, BirdKind, EnemyKind, BlockKind } from './levels';
import { STRINGS, readLocale, applyLocale } from '../i18n';
import type { Locale } from '../i18n';

export type Phase = 'menu' | 'ready' | 'aiming' | 'flying' | 'settling' | 'loading' | 'raising' | 'levelComplete' | 'gameOver' | 'victory';

const ENEMY_HP: Record<EnemyKind, number> = { minion: 40, officer: 70, general: 110, boss: 220 };
const BLOCK_HP: Record<BlockKind, number> = { wood: 60, stone: 160, glass: 25, tnt: 22 };
const BLOCK_MASS: Record<BlockKind, number> = { wood: 1.05, stone: 2.35, glass: 0.48, tnt: 0.85 };
const ENEMY_MASS: Record<EnemyKind, number> = { minion: 0.9, officer: 1.15, general: 1.4, boss: 2.2 };
const BIRD_MASS: Record<BirdKind, number> = { courier: 1.05, swarm: 0.78, wrecker: 1.6 };
const ENEMY_SCORE: Record<EnemyKind, number> = { minion: 500, officer: 800, general: 1200, boss: 3000 };

export class Game {
  world = new World({ gravity: 1500 });
  particles = new Particles();
  audio = new AudioEngine();

  private renderer: Renderer;
  private canvas: HTMLCanvasElement;
  phase: Phase = 'menu';
  levelIndex = 0;
  score = 0;
  stars = 0;
  locale: Locale = 'be';
  private levelStartScore = 0;

  private level: LevelDef | null = null;
  private birdsLeft: BirdKind[] = [];
  private currentBird: Body | null = null;

  private settleTimer = 0;
  private birdIdleTime = 0;
  private time = 0;
  private shake = 0;
  private abilityUsed = false;
  private liveShot: Body | null = null;
  private nextLoadIn = 0;
  private flightTime = 0;
  private flyerStuck = 0;
  private flyerLast = { x: 0, y: 0 };
  private cleared = false;
  private flock: Body[] = [];
  private raf = 0;
  private lastT = 0;
  private flagRaise = 0;
  private plane: (PlaneState & { vx: number; vy: number }) | null = null;
  private planeBoom = false;
  private hopT = 1;
  private hopDur = 0.42;
  private hopFrom = { x: SLING_X, y: SLING_Y };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.world.onImpact = (a, b, speed, point) => this.onImpact(a, b, speed, point);
    this.setLocale(readLocale());
    this.bindInput();
    window.addEventListener('resize', () => this.renderer.resize());
  }

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------

  start(): void {
    this.lastT = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.033, (t - this.lastT) / 1000);
      this.lastT = t;
      this.time += dt;
      this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void { cancelAnimationFrame(this.raf); }

  setLocale(locale: Locale): void {
    this.locale = locale;
    applyLocale(locale);
  }

  private get copy() { return STRINGS[this.locale]; }

  snapshot(): {
    phase: Phase; score: number; levelIndex: number; bodies: number;
    enemies: { kind: unknown; hp: unknown; x: number; y: number }[];
    bird: { x: number; y: number; vx: number; vy: number; kind: unknown; dive?: unknown } | null;
    particles: number; audioReady: boolean; musicOn: boolean;
    flagRaise: number;
    hopT: number;
    plane: { x: number; y: number; ang: number; mode: string } | null;
    birds: string[];
    locale: Locale;
    seed: number;
  } {
    return {
      phase: this.phase,
      score: this.score,
      levelIndex: this.levelIndex,
      bodies: this.world.bodies.length,
      enemies: this.world.bodies.filter((b) => b.meta.type === 'enemy').map((b) => ({
        kind: b.meta.kind, hp: b.meta.hp, x: b.pos.x, y: b.pos.y,
      })),
      bird: this.currentBird ? {
        x: this.currentBird.pos.x, y: this.currentBird.pos.y,
        vx: this.currentBird.vel.x, vy: this.currentBird.vel.y, kind: this.currentBird.meta.kind,
        dive: this.currentBird.meta.dive,
      } : null,
      particles: this.particles.count,
      audioReady: this.audio.ready,
      musicOn: this.audio.musicOn,
      flagRaise: this.flagRaise,
      hopT: this.hopT,
      plane: this.plane ? { x: this.plane.x, y: this.plane.y, ang: this.plane.ang, mode: this.plane.mode } : null,
      birds: this.birdsLeft.slice(),
      locale: this.locale,
      seed: getCampaignSeed(),
    };
  }

  /** Test hook: pull the sling bird and fire. */
  fireFromPull(dx: number, dy: number): void {
    if (this.phase === 'loading') this.finishHop();
    if (!this.currentBird || (this.phase !== 'ready' && this.phase !== 'aiming')) return;
    this.currentBird.pos = { x: SLING_X + dx, y: SLING_Y + dy };
    this.phase = 'aiming';
    this.launch();
  }

  triggerAbility(): void { this.useAbility(); }

  toMenu(): void {
    this.phase = 'menu';
    this.world.bodies.length = 0;
    this.particles.clear();
    this.audio.stopMusic();
    this.flagRaise = 0;
    this.plane = null;
  }

  startGame(): void {
    this.score = 0;
    this.levelIndex = 0;
    newCampaign();
    this.loadLevel(0);
  }

  loadLevel(i: number): void {
    this.currentBird = null;
    this.liveShot = null;
    this.nextLoadIn = 0;
    this.flightTime = 0;
    this.flyerStuck = 0;
    this.cleared = false;
    this.levelIndex = i;
    this.level = getLevels()[i];
    this.levelStartScore = this.score;
    this.currentBird = null;
    this.world.bodies.length = 0;
    this.particles.clear();
    // ground: top edge must sit exactly at GROUND_Y so level geometry (which
    // places blocks/enemies resting on GROUND_Y) does not spawn embedded.
    const groundHy = 60;
    const ground = new Body({ x: WORLD_W / 2, y: GROUND_Y + groundHy }, { kind: 'box', hx: WORLD_W, hy: groundHy }, true);
    ground.restitution = 0.1; ground.friction = 0.8;
    this.world.add(ground);
    // blocks
    for (const bd of this.level.blocks) {
      const b = new Body({ x: bd.x, y: bd.y }, { kind: 'box', hx: bd.w / 2, hy: bd.h / 2 });
      const kind = bd.kind ?? 'wood';
      const hp = BLOCK_HP[kind];
      b.meta = { type: 'block', kind, hp, maxHp: hp, seed: (bd.x * 92821 + bd.y * 68917) | 0, mass: BLOCK_MASS[kind] };
      b.restitution = kind === 'glass' ? 0.05 : kind === 'stone' ? 0.08 : 0.12;
      b.friction = kind === 'glass' ? 0.35 : 0.72;
      b.computeMass();
      this.world.add(b);
    }
    for (const ed of this.level.enemies) {
      const r = ENEMY_RADIUS[ed.kind];
      const e = new Body({ x: ed.x, y: ed.y }, { kind: 'circle', r });
      const hp = ENEMY_HP[ed.kind];
      e.meta = { type: 'enemy', kind: ed.kind, hp, maxHp: hp, hurtAt: -10, mass: ENEMY_MASS[ed.kind] };
      e.restitution = 0.18; e.friction = 0.82;
      e.computeMass();
      this.world.add(e);
    }
    this.flock = [];
    this.birdsLeft = [...this.level.birds];
    this.phase = 'ready';
    this.audio.play('click');
    if (this.audio.musicOn) this.audio.startMusic('theme', getCampaignSeed() + this.levelIndex * 104729);
    this.flagRaise = 0;
    this.spawnPlane();
    this.loadNextBird();
  }

  nextLevel(): void {
    if (this.levelIndex + 1 < getLevels().length) this.loadLevel(this.levelIndex + 1);
    else {
      this.phase = 'victory';
      this.audio.play('victory');
      this.audio.stopMusic();
      this.audio.startMusic('victory');
    }
  }

  restartLevel(): void {
    if (!this.level) return;
    if (this.phase === 'menu' || this.phase === 'raising' || this.phase === 'levelComplete' || this.phase === 'victory') return;
    this.score = this.levelStartScore;
    this.loadLevel(this.levelIndex);
  }

  private loadNextBird(): void {
    if (this.birdsLeft.length === 0 || this.cleared) return;
    for (const o of this.world.bodies) {
      if (o.meta.type === 'bird') o.meta.sling = false;
    }
    const kind = this.birdsLeft.shift()!;
    const r = BIRD_RADIUS[kind];
    this.hopFrom = { x: SLING_X - 74, y: GROUND_Y - r + 2 };
    const b = new Body({ x: this.hopFrom.x, y: this.hopFrom.y }, { kind: 'circle', r });
    b.meta = { type: 'bird', kind, mass: BIRD_MASS[kind], sling: true };
    b.restitution = kind === 'wrecker' ? 0.18 : 0.35; b.friction = 0.4;
    b.isStatic = true;
    b.computeMass();
    this.currentBird = b;
    this.world.add(b);
    this.hopDur = kind === 'wrecker' ? 0.52 : kind === 'swarm' ? 0.36 : 0.42;
    this.hopT = 0;
    this.phase = 'loading';
    this.birdIdleTime = 0;
  }

  private finishHop(): void {
    this.hopT = 1;
    if (this.currentBird) this.currentBird.pos = { x: SLING_X, y: SLING_Y };
    if (this.phase === 'loading') {
      this.phase = 'ready';
      this.audio.play('click');
    }
  }

  private updateHop(dt: number): void {
    if (this.phase !== 'loading' || !this.currentBird) return;
    this.hopT = Math.min(1, this.hopT + dt / this.hopDur);
    const u = this.hopT;
    const ease = 1 - (1 - u) * (1 - u);
    const x = this.hopFrom.x + (SLING_X - this.hopFrom.x) * ease;
    const y = this.hopFrom.y + (SLING_Y - this.hopFrom.y) * u - Math.sin(u * Math.PI) * 78;
    this.currentBird.pos = { x, y };
    if (u >= 1) this.finishHop();
  }

  // -------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------

  private bindInput(): void {
    const toWorld = (clientX: number, clientY: number): Vec => {
      const rect = this.canvas.getBoundingClientRect();
      const scale = WORLD_W / rect.width;
      return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
    };
    const pointerPos = (e: PointerEvent): Vec => toWorld(e.clientX, e.clientY);

    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.audio.ensure();
      const p = pointerPos(e);
      if (this.hitMute(p)) {
        this.audio.musicOn = !this.audio.musicOn;
        this.audio.sfxOn = this.audio.musicOn;
        if (this.audio.musicOn) this.audio.startMusic(this.phase === 'victory' ? 'victory' : this.phase === 'gameOver' ? 'defeat' : 'theme', getCampaignSeed() + this.levelIndex * 104729);
        else this.audio.stopMusic();
        this.audio.play('click');
        return;
      }
      const lang = this.hitLang(p);
      if (lang) {
        if (lang !== this.locale) this.setLocale(lang);
        this.audio.play('click');
        return;
      }
      if (this.phase === 'menu') { this.startGame(); return; }
      if (this.hitRestart(p)) {
        this.restartLevel();
        return;
      }
      if (this.phase === 'levelComplete') { this.nextLevel(); return; }
      if (this.phase === 'gameOver') { this.loadLevel(this.levelIndex); return; }
      if (this.phase === 'victory') { this.toMenu(); return; }
      if (this.liveShot && !this.abilityUsed && !this.cleared) {
        this.useAbility();
        return;
      }
      if (this.phase === 'ready' && this.currentBird) {
        const r = this.currentBird.shape.kind === 'circle' ? this.currentBird.shape.r : 20;
        const d = Math.hypot(p.x - this.currentBird.pos.x, p.y - this.currentBird.pos.y);
        if (d < r + 16) {
          this.phase = 'aiming';
          this.audio.play('stretch', 0.4);
          try { this.canvas.setPointerCapture(e.pointerId); } catch { /* synthetic / unsupported */ }
        }
      }
    });
    window.addEventListener('pointerdown', (e) => {
      if (e.target === this.canvas) return;
      if (this.liveShot && !this.abilityUsed && !this.cleared) this.useAbility();
    });
    const onMove = (e: PointerEvent) => {
      if (this.phase !== 'aiming') return;
      this.placeBirdFromPointer(pointerPos(e));
    };
    const release = () => {
      if (this.phase !== 'aiming') return;
      this.launch();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('keydown', (e) => {
      this.audio.ensure();
      if (e.key === 'm' || e.key === 'M') {
        this.audio.musicOn = !this.audio.musicOn;
        this.audio.sfxOn = this.audio.musicOn;
        if (this.audio.musicOn) this.audio.startMusic('theme', getCampaignSeed() + this.levelIndex * 104729);
        else this.audio.stopMusic();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        this.restartLevel();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (this.liveShot && !this.abilityUsed && !this.cleared) {
          this.useAbility();
          return;
        }
        if (this.phase === 'menu') this.startGame();
        else if (this.phase === 'levelComplete') this.nextLevel();
        else if (this.phase === 'gameOver') this.loadLevel(this.levelIndex);
        else if (this.phase === 'victory') this.toMenu();
      }
    });
  }

  private hitMute(p: Vec): boolean {
    return p.x >= 200 && p.x <= 290 && p.y >= 6 && p.y <= 50;
  }

  private hitLang(p: Vec): Locale | null {
    if (p.y < 8 || p.y > 46) return null;
    if (p.x >= 318 && p.x <= 372) return 'be';
    if (p.x >= 376 && p.x <= 430) return 'en';
    return null;
  }


  private hitRestart(p: Vec): boolean {
    return this.canRestart() && p.x >= 1124 && p.x <= 1268 && p.y >= 8 && p.y <= 46;
  }

  private canRestart(): boolean {
    return this.phase === 'ready' || this.phase === 'aiming' || this.phase === 'flying'
      || this.phase === 'settling' || this.phase === 'loading';
  }
  private placeBirdFromPointer(p: Vec): void {
    if (!this.currentBird) return;
    const dx = p.x - SLING_X, dy = p.y - SLING_Y;
    const len = Math.hypot(dx, dy);
    const maxStretch = 90;
    const clamped = Math.min(len, maxStretch);
    const dir = len > 1 ? { x: dx / len, y: dy / len } : { x: -1, y: 0 };
    this.currentBird.pos = { x: SLING_X + dir.x * clamped, y: SLING_Y + dir.y * clamped };
  }

  private useAbility(): void {
    const b = this.liveShot ?? this.currentBird;
    if (!b || this.abilityUsed) return;
    const kind = (b.meta.kind as string | undefined) ?? 'courier';
    this.abilityUsed = true;
    if (kind === 'swarm') {
      const speed = Math.hypot(b.vel.x, b.vel.y) || 1;
      const ang = Math.atan2(b.vel.y, b.vel.x);
      const spread = 0.4;
      b.shape = { kind: 'circle', r: 13 };
      b.meta.shard = true;
      b.meta.mass = 0.66;
      b.computeMass();
      b.vel = { x: Math.cos(ang) * speed * 1.04, y: Math.sin(ang) * speed * 1.04 };
      this.spawnShard(b, ang - spread, speed * 1.02);
      this.spawnShard(b, ang + spread, speed * 1.02);
      this.audio.play('launch', 0.85);
      this.particles.ring(b.pos.x, b.pos.y, '#3ec7d6');
    } else if (kind === 'wrecker') {
      b.meta.dive = true;
      b.restitution = 0.04;
      b.vel.x *= 0.55;
      b.vel.y = Math.max(b.vel.y, 0) + 1150;
      this.audio.play('birdHit', 0.9);
      this.particles.ring(b.pos.x, b.pos.y, '#7ec8ff');
    } else {
      const speed = Math.hypot(b.vel.x, b.vel.y) || 1;
      const dir = V.scale({ x: b.vel.x, y: b.vel.y }, 1 / speed);
      b.vel = V.add(b.vel, V.scale(dir, 280));
      this.audio.play('click');
    }
  }

  private launch(): void {
    if (!this.currentBird) { this.phase = 'ready'; return; }
    const b = this.currentBird;
    const pull = V.sub({ x: SLING_X, y: SLING_Y }, b.pos);
    const dist = Math.hypot(pull.x, pull.y);
    if (dist < 24) {
      this.phase = 'ready';
      b.pos = { x: SLING_X, y: SLING_Y };
      return;
    }
    const power = Math.min(MAX_POWER, dist * (MAX_POWER / 90));
    const dir = V.norm(pull);
    b.isStatic = false;
    b.meta.sling = false;
    b.computeMass();
    b.wake();
    b.vel = V.scale(dir, power);
    b.angVel = (dir.x > 0 ? -1 : 1) * power * 0.012;
    this.liveShot = b;
    this.phase = 'flying';
    this.abilityUsed = false;
    this.birdIdleTime = 0;
    this.flightTime = 0;
    this.flyerStuck = 0;
    this.flyerLast = { x: b.pos.x, y: b.pos.y };
    this.nextLoadIn = this.birdsLeft.length > 0 ? 0.3 : 0;
    this.audio.play('launch', power / MAX_POWER);
    this.particles.burst(SLING_X, SLING_Y, { kind: 'dust', count: 8, color: '#cbb', speed: 60, life: 0.4 });
  }

  // -------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------

  private onImpact(a: Body, b: Body, speed: number, point: Vec): void {
    const intensity = Math.min(1.5, speed / 700);
    this.applyDamage(a, b, speed, point);
    this.applyDamage(b, a, speed, point);
    const kinds = [a.meta.kind, b.meta.kind];
    const types = [a.meta.type, b.meta.type];
    if (types.includes('bird')) {
      this.audio.play('thud', intensity);
      this.particles.burst(point.x, point.y, { kind: 'dust', count: 6, color: '#bbb', speed: 80, life: 0.4 });
    }
    const glass = [a, b].find((x) => x.meta.kind === 'glass' && x.meta.type === 'block');
    if (glass && speed > 120 && !glass.meta.dead) this.destroyBody(glass, point);
    const tnt = [a, b].find((x) => x.meta.kind === 'tnt' && x.meta.type === 'block');
    if (tnt && speed > 160 && !tnt.meta.dead) this.destroyBody(tnt, point);
    if (types.includes('enemy')) this.audio.play('birdHit', intensity);
    else if (kinds.includes('wood') && speed > 250) this.audio.play('thud', intensity * 0.8);
    if (speed > 400) this.shake = Math.min(10, this.shake + speed / 200);
  }

  private applyDamage(target: Body, attacker: Body, speed: number, point: Vec): void {
    const tType = target.meta.type;
    if (tType !== 'enemy' && tType !== 'block') return;
    const aMass = attacker.isStatic ? 1 : Math.max(0.5, attacker.mass);
    let dmg = speed * aMass * 0.09;
    if (attacker.meta.type === 'bird') dmg *= 1.6;
    if (attacker.meta.dive) dmg *= 2.15;
    if (attacker.meta.shard) dmg *= 0.88;
    if (dmg < 3) return;
    const hp = target.meta.hp as number | undefined;
    if (typeof hp !== 'number') return;
    const newHp = hp - dmg;
    target.meta.hp = newHp;
    if (tType === 'enemy') {
      target.meta.hurtAt = this.time;
      const side = Math.sign(target.pos.x - attacker.pos.x) || 1;
      target.angVel += side * Math.min(22, 6 + speed * 0.018);
      target.wake();
      this.particles.burst(point.x, point.y, { kind: 'spark', count: 5, color: '#ffd24a', speed: 150, life: 0.3 });
    }
    if (newHp <= 0) this.destroyBody(target, point);
  }

  private destroyBody(b: Body, point: Vec): void {
    if (b.meta.dead) return;
    b.meta.dead = true;
    const type = b.meta.type;
    if (type === 'enemy') {
      const kind = (b.meta.kind as EnemyKind) ?? 'minion';
      this.score += ENEMY_SCORE[kind];
      this.audio.play(kind === 'boss' ? 'explosion' : 'shatter', 1);
      this.shake = Math.min(12, this.shake + 6);
      const colors = kind === 'boss' ? ['#d52b1e', '#2f9e44', '#d4a017'] : ['#6a4424', '#c4a05a', '#3a3228'];
      this.particles.burst(point.x, point.y, { kind: 'debris', count: 16, color: colors, speed: 260, life: 0.9 });
      this.particles.ring(point.x, point.y, '#fff');
      this.audio.play('score');
    } else if (type === 'block') {
      const kind = (b.meta.kind as BlockKind) ?? 'wood';
      this.audio.play(kind === 'glass' ? 'shatter' : kind === 'tnt' ? 'explosion' : 'crumble', 0.8);
      const colors = kind === 'glass' ? ['#bfe3f2', '#9fd4ea']
        : kind === 'stone' ? ['#9aa0a8', '#7d828a']
        : kind === 'tnt' ? ['#d43b2a', '#f0c040']
        : ['#b07a45', '#8a5a30'];
      this.particles.burst(point.x, point.y, { kind: 'debris', count: kind === 'tnt' ? 18 : 12, color: colors, speed: 200, life: 0.8 });
    }
    const boom = type === 'block' && b.meta.kind === 'tnt';
    const at = { x: b.pos.x, y: b.pos.y };
    this.world.remove(b);
    if (boom) this.explode(at, 980);
  }

  private explode(at: Vec, power: number): void {
    this.audio.play('explosion', 1);
    this.particles.burst(at.x, at.y, { kind: 'spark', count: 30, color: '#ffb347', speed: 460, life: 0.75, size: 5 });
    this.particles.burst(at.x, at.y, { kind: 'dust', count: 20, color: '#666', speed: 220, life: 0.65 });
    this.shake = Math.min(16, this.shake + 10);
    this.world.wakeAround(at.x, at.y, 200);
    for (const other of [...this.world.bodies]) {
      if (other.isStatic || other.meta.dead) continue;
      const d = Math.hypot(other.pos.x - at.x, other.pos.y - at.y);
      if (d > 190 || d < 0.1) continue;
      const nx = (other.pos.x - at.x) / d, ny = (other.pos.y - at.y) / d;
      const falloff = 1 - d / 190;
      other.wake();
      other.vel.x += nx * power * falloff;
      other.vel.y += ny * power * falloff - 120;
      other.angVel += (nx > 0 ? -1 : 1) * 18 * falloff;
      const hp = typeof other.meta.hp === 'number' ? other.meta.hp : 0;
      if (hp > 0) {
        other.meta.hp = hp - 70 * falloff;
        if ((other.meta.hp as number) <= 0) this.destroyBody(other, other.pos);
      }
    }
  }

  private spawnShard(from: Body, ang: number, speed: number): void {
    const shard = new Body(
      { x: from.pos.x + Math.cos(ang) * 10, y: from.pos.y + Math.sin(ang) * 10 },
      { kind: 'circle', r: 13 },
    );
    shard.meta = { type: 'bird', kind: 'swarm', shard: true, mass: 0.66, sling: false };
    shard.restitution = 0.32;
    shard.friction = 0.4;
    shard.computeMass();
    shard.vel = { x: Math.cos(ang) * speed, y: Math.sin(ang) * speed };
    shard.angVel = (Math.random() - 0.5) * 10;
    this.world.add(shard);
    this.flock.push(shard);
  }

  private update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 30);
    this.updatePlane(dt);
    if (this.phase === 'menu') return;

    if (this.phase === 'raising') {
      this.particles.update(dt);
      this.flagRaise = Math.min(1, this.flagRaise + dt / 1.35);
      if (this.flagRaise >= 1) {
        this.phase = this.levelIndex + 1 >= getLevels().length ? 'victory' : 'levelComplete';
      }
      if (this.level) this.world.step(dt);
      return;
    }

    if (!this.level) return;

    this.updateHop(dt);
    this.world.step(dt);
    this.particles.update(dt);

    for (const b of [...this.world.bodies]) {
      if (b.isStatic && b.meta.type !== 'block') continue;
      if (b.pos.x < -200 || b.pos.x > WORLD_W + 300 || b.pos.y > WORLD_H + 300) {
        if (b.meta.type === 'bird' && (b === this.liveShot || b === this.currentBird)) this.dismissFlyer(b);
        else this.world.remove(b);
      }
    }

    const aliveEnemies = this.world.bodies.filter((b) => b.meta.type === 'enemy');
    if (aliveEnemies.length === 0 && (this.phase === 'ready' || this.phase === 'aiming' || this.phase === 'flying' || this.phase === 'settling' || this.phase === 'loading')) {
      this.winLevel();
      return;
    }
    if (this.nextLoadIn > 0 && !this.cleared) {
      this.nextLoadIn -= dt;
      if (this.nextLoadIn <= 0 && this.birdsLeft.length > 0 && !this.currentBird?.meta.sling) {
        this.currentBird = null;
        this.loadNextBird();
      }
    }

    const flyers = [this.liveShot, ...this.flock].filter((s): s is Body => !!s && !s.meta.dead);
    if (flyers.length > 0) {
      this.flightTime += dt;
      for (const b of flyers) {
        if (b.isStatic) { b.isStatic = false; b.wake(); }
        const speed = Math.hypot(b.vel.x, b.vel.y);
        const moved = Math.hypot(b.pos.x - this.flyerLast.x, b.pos.y - this.flyerLast.y);
        if (speed > 80 && moved > 3) {
          this.particles.burst(b.pos.x, b.pos.y, {
            kind: 'dust', count: 1, color: '#f5f7fa', speed: 18, life: 0.28, size: 3, gravity: 40,
          });
        }
      }
      const lead = this.liveShot ?? flyers[0]!;
      const speed = Math.hypot(lead.vel.x, lead.vel.y);
      const moved = Math.hypot(lead.pos.x - this.flyerLast.x, lead.pos.y - this.flyerLast.y);
      const rolling = speed > 22 || Math.abs(lead.angVel) > 0.7;
      if (moved < 2 && !rolling) this.flyerStuck += dt; else this.flyerStuck = 0;
      if (speed < 18 && Math.abs(lead.angVel) < 0.5) this.birdIdleTime += dt; else this.birdIdleTime = 0;
      this.flyerLast = { x: lead.pos.x, y: lead.pos.y };
      const off = lead.pos.x > WORLD_W + 150 || lead.pos.x < -180 || lead.pos.y > WORLD_H + 100;
      const waited = this.abilityUsed || this.flightTime > 1.6;
      if (off || this.flightTime > 12 || (waited && !rolling && (this.birdIdleTime > 1.1 || this.flyerStuck > 0.9))) {
        this.dismissFlyer(lead);
      }
    }

    if (this.phase === 'settling' && !this.cleared) {
      let moving = false;
      for (const b of this.world.bodies) {
        if (!b.isStatic && !b.sleeping && (Math.hypot(b.vel.x, b.vel.y) > 25 || Math.abs(b.angVel) > 0.4)) { moving = true; break; }
      }
      if (!moving) this.settleTimer += dt; else this.settleTimer = 0;
      if (this.settleTimer > 1.2) this.endTurn();
    }
  }

  private dismissFlyer(b: Body): void {
    if (b.meta.dead) return;
    this.particles.burst(b.pos.x, b.pos.y, { kind: 'dust', count: 6, color: '#fff', speed: 50, life: 0.4 });
    this.world.remove(b);
    if (this.liveShot === b) this.liveShot = null;
    if (this.currentBird === b) this.currentBird = null;
    this.flock = this.flock.filter((s) => s !== b);
    if (this.cleared) return;
    const moreFlyers = [this.liveShot, ...this.flock].some((s) => s && !s.meta.dead);
    if (moreFlyers) return;
    if (this.currentBird?.meta.sling) return;
    if (this.birdsLeft.length > 0) {
      this.loadNextBird();
    } else {
      this.phase = 'settling';
      this.settleTimer = 0;
    }
  }


  private endTurn(): void {
    if (this.birdsLeft.length > 0 && !this.currentBird) {
      this.loadNextBird();
    } else {
      // no birds left, enemies remain — check if still alive after settle
      const enemies = this.world.bodies.filter((b) => b.meta.type === 'enemy');
      if (enemies.length > 0) this.loseLevel();
      else this.winLevel();
    }
  }

  winLevel(): void {

    if (this.cleared || !this.level) return;
    if (this.phase === 'raising' || this.phase === 'levelComplete' || this.phase === 'victory') return;
    this.cleared = true;
    this.phase = 'raising';
    this.flagRaise = 0;
    if (this.plane && this.plane.mode === 'fly') {
      this.plane.mode = 'crash';
      this.plane.vy = 110;
      this.plane.vx = Math.min(this.plane.vx, -48);
    }
    const unused = this.birdsLeft.length + (this.currentBird?.meta.sling ? 1 : 0);
    this.score += unused * 10000;
    this.stars = unused >= 2 ? 3 : unused === 1 ? 2 : 1;
    this.audio.play('victory');
    this.audio.stopMusic();
    this.audio.startMusic('victory');
    const pole = this.level ? FLAG_POLE[this.level.theme] : { x: WORLD_W / 2, top: 180 };
    for (let i = 0; i < 5; i++) {
      setTimeout(() => this.particles.burst(
        pole.x + (Math.random() - 0.5) * 80, pole.top + 20 + Math.random() * 80,
        { kind: 'confetti', count: 14, color: ['#fff', '#ce2939', '#ffd24a'], speed: 220, life: 1.6, gravity: 300 },
      ), i * 180);
    }
  }

  private spawnPlane(): void {
    this.planeBoom = false;
    if (this.level && SITES[this.level.theme].plane) {
      this.plane = { x: 980, y: 150, ang: 0, mode: 'fly', vx: -70, vy: 0 };
    } else {
      this.plane = null;
    }
  }

  private updatePlane(dt: number): void {
    const p = this.plane;
    if (!p) return;
    if (p.mode === 'fly') {
      p.x += p.vx * dt;
      p.y = 150 + Math.sin(this.time * 0.8) * 8;
      if (p.x < -220) p.x = WORLD_W + 200;
      p.ang = 0;
      return;
    }
    if (p.mode === 'crash') {
      p.vy += 920 * dt;
      p.vx *= Math.pow(0.62, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ang = Math.min(1.2, p.ang + 1.85 * dt);
      this.particles.burst(p.x + 36, p.y - 6, {
        kind: 'smoke', count: 1, color: '#4a4a4a', speed: 28, life: 0.7, size: 9, gravity: -50,
      });
      if (p.y >= GROUND_Y - 28) {
        p.y = GROUND_Y - 28;
        p.mode = 'dead';
        p.ang = 0.92;
        p.vx = 0;
        p.vy = 0;
        if (!this.planeBoom) {
          this.planeBoom = true;
          this.audio.play('explosion', 1);
          this.shake = Math.min(16, this.shake + 12);
          this.particles.burst(p.x, p.y, { kind: 'spark', count: 28, color: '#ffb347', speed: 420, life: 0.8, size: 5 });
          this.particles.burst(p.x, p.y, { kind: 'dust', count: 22, color: '#666', speed: 200, life: 0.8 });
          this.particles.ring(p.x, p.y, '#ff8a3a', 28);
        }
      }
    }
  }

  private loseLevel(): void {
    this.phase = 'gameOver';
    this.audio.play('defeat');
    this.audio.stopMusic();
    this.audio.startMusic('defeat');
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  private render(): void {

    const state: RenderState = {
      theme: this.level?.theme ?? 'belta',
      time: this.time,
      bodies: this.world.bodies,
      slingBird: null,
      trajectory: [],
      particles: this.particles,
      shake: this.shake,
      flagRaise: this.flagRaise,
      plane: this.plane,
      queue: this.phase === 'menu' ? [] : this.birdsLeft.slice(),
      queueShift: this.phase === 'loading' ? this.hopT : 1,
      queueGapR: this.currentBird && this.currentBird.shape.kind === 'circle' ? this.currentBird.shape.r : 20,
    };

    if (this.phase === 'aiming' && this.currentBird) {
      const b = this.currentBird;
      const pull = V.sub({ x: SLING_X, y: SLING_Y }, b.pos);
      const dist = Math.hypot(pull.x, pull.y);
      const power = Math.min(MAX_POWER, dist * (MAX_POWER / 90));
      state.slingBird = { kind: (b.meta.kind as string) ?? 'courier', x: b.pos.x, y: b.pos.y, stretch: power / MAX_POWER, docked: true };
      if (dist > 8) {
        const vel = V.scale(V.norm(pull), power);
        const pts: Vec[] = [];
        let px = b.pos.x, py = b.pos.y, vx = vel.x, vy = vel.y;
        const g = this.world.gravity.y;
        for (let i = 0; i < 40; i++) {
          const h = 1 / 60;
          vy += g * h;
          px += vx * h; py += vy * h;
          pts.push({ x: px, y: py });
          if (py > GROUND_Y) break;
        }
        state.trajectory = pts;
      }
    } else if (this.phase === 'ready' && this.currentBird) {
      this.currentBird.pos = { x: SLING_X, y: SLING_Y };
      state.slingBird = { kind: (this.currentBird.meta.kind as string) ?? 'courier', x: SLING_X, y: SLING_Y, stretch: 0, docked: true };
    } else if (this.phase === 'loading' && this.currentBird) {
      const b = this.currentBird;
      const land = Math.max(0, (this.hopT - 0.86) / 0.14);
      state.slingBird = {
        kind: (b.meta.kind as string) ?? 'courier',
        x: b.pos.x,
        y: b.pos.y,
        stretch: land * 0.18,
        angle: -0.38 * Math.sin(this.hopT * Math.PI),
        docked: this.hopT > 0.9,
      };
    }

    this.renderer.draw(state);
    this.drawHUD();
  }

  private drawHUD(): void {
    const ctx = this.renderer.ctx2d;
    ctx.setTransform(this.canvas.width / WORLD_W, 0, 0, this.canvas.width / WORLD_W, 0, 0);
    // top bar
    ctx.fillStyle = 'rgba(10,14,20,0.55)';
    ctx.fillRect(0, 0, WORLD_W, 54);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(this.copy.score(this.score), 20, 35);
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = this.audio.musicOn ? '#ffd24a' : '#7a8490';
    ctx.fillText(this.audio.musicOn ? this.copy.musicOn : this.copy.musicOff, 210, 34);
    this.drawLangSwitch(ctx);
    if (this.level) {
      ctx.textAlign = 'center';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillStyle = '#cfd6e0';
      ctx.fillText(`${this.levelIndex + 1}/${getLevels().length}  ·  ${this.copy.levels[this.level.theme]}`, WORLD_W / 2, 34);
    }
    if (this.canRestart() && this.phase !== 'gameOver') {
      this.rr(ctx, 1124, 10, 144, 34, 8);
      ctx.fillStyle = 'rgba(206,41,57,0.92)';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.copy.restart, 1196, 33);
    }
    if (this.liveShot && !this.abilityUsed && !this.cleared) {
      const kind = (this.liveShot.meta.kind as string) ?? 'courier';
      const hint = kind === 'swarm' ? this.copy.hintSplit
        : kind === 'wrecker' ? this.copy.hintDive
        : this.copy.hintBurst;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(hint, WORLD_W / 2, 80);
    }
    if (this.phase === 'raising') {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText(this.copy.raising, WORLD_W / 2, 88);
    }

    // overlays
    const overlay = (title: string, sub: string, btn: string) => {
      ctx.fillStyle = 'rgba(8,12,18,0.72)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 54px system-ui, sans-serif';
      ctx.fillText(title, WORLD_W / 2, WORLD_H / 2 - 60);
      ctx.font = '24px system-ui, sans-serif';
      ctx.fillStyle = '#cfd6e0';
      ctx.fillText(sub, WORLD_W / 2, WORLD_H / 2 - 10);
      const bw = 240, bh = 58;
      ctx.fillStyle = '#ce2939';
      this.rr(ctx, WORLD_W / 2 - bw / 2, WORLD_H / 2 + 40, bw, bh, 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.fillText(btn, WORLD_W / 2, WORLD_H / 2 + 78);
    };

    if (this.phase === 'menu') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.copy.title, WORLD_W / 2, 220);
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.fillStyle = '#ce2939';
      ctx.fillText(this.copy.vs, WORLD_W / 2, 278);
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillStyle = '#cfd6e0';
      const colX = 470;
      const blurbs = [...this.wrapText(ctx, this.copy.blurb1, 700), ...this.wrapText(ctx, this.copy.blurb2, 700)];
      for (let i = 0; i < blurbs.length; i++) ctx.fillText(blurbs[i], colX, 322 + i * 28);
      const bw = 260, bh = 60;
      const playY = 412 + Math.max(0, blurbs.length - 2) * 26;
      ctx.fillStyle = '#ce2939';
      this.rr(ctx, WORLD_W / 2 - bw / 2, playY, bw, bh, 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.fillText(this.copy.play, WORLD_W / 2, playY + 40);
    } else if (this.phase === 'levelComplete') {
      const stars = `${'★'.repeat(this.stars)}${'☆'.repeat(3 - this.stars)}`;
      overlay(this.copy.cleared, this.copy.clearedScore(this.score, stars), this.levelIndex + 1 < getLevels().length ? this.copy.next : this.copy.finish);
    } else if (this.phase === 'gameOver') {
      overlay(this.copy.gameOver, this.copy.gameOverSub, this.copy.retry);
    } else if (this.phase === 'victory') {
      overlay(this.copy.victory, this.copy.victoryScore(this.score), this.copy.menu);
    }
    if (this.level && this.phase !== 'menu' && this.phase !== 'gameOver') {
      const text = this.copy.history[this.level.theme];
      ctx.font = '13px system-ui, sans-serif';
      const lines = this.wrapText(ctx, text, WORLD_W - 40);
      const lineH = 16;
      const boxH = 14 + lines.length * lineH;
      const top = WORLD_H - boxH - 6;
      ctx.fillStyle = 'rgba(10,14,20,0.72)';
      ctx.fillRect(0, top, WORLD_W, boxH + 6);
      ctx.fillStyle = 'rgba(236,240,244,0.92)';
      ctx.textAlign = 'left';
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 20, top + 18 + i * lineH);
    }
  }

  private drawLangSwitch(ctx: CanvasRenderingContext2D): void {
    const pills: { id: Locale; label: string; x: number }[] = [
      { id: 'be', label: 'БЕ', x: 318 },
      { id: 'en', label: 'EN', x: 376 },
    ];
    for (const p of pills) {
      this.rr(ctx, p.x, 10, 54, 34, 8);
      ctx.fillStyle = this.locale === p.id ? 'rgba(206,41,57,0.92)' : 'rgba(20,26,34,0.85)';
      ctx.fill();
      ctx.fillStyle = this.locale === p.id ? '#fff' : '#cfd6e0';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.label, p.x + 27, 33);
    }
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && ctx.measureText(next).width > maxW) { lines.push(cur); cur = w; }
      else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  private rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
