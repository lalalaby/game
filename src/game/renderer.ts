// Canvas renderer: themed sites, regime flag, partisan birds, sling.
import { WORLD_W, WORLD_H, GROUND_Y, BIRD_RADIUS, FLAG_POLE, type ThemeId } from './levels';
import { SITES } from './sites';
import type { Body } from './physics';
import type { Particles } from './particles';

export interface SlingBird { kind: string; x: number; y: number; stretch: number; angle?: number; docked?: boolean }
export interface PlaneState { x: number; y: number; ang: number; mode: 'fly' | 'crash' | 'dead' }
export interface RenderState {
  theme: ThemeId;
  time: number;
  bodies: Body[];
  slingBird: SlingBird | null;
  trajectory: { x: number; y: number }[];
  particles: Particles;
  shake: number;
  flagRaise: number;
  plane: PlaneState | null;
  queue: string[];
  queueShift?: number;
  queueGapR?: number;
}

const SLING = { x: 190, y: 545, armW: 10, prongH: 78, bandR: 7 };

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private siteArt = new Map<ThemeId, HTMLImageElement>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.resize();
    this.loadSites();
  }

  get ctx2d(): CanvasRenderingContext2D { return this.ctx; }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = Math.min(window.innerWidth / WORLD_W, window.innerHeight / WORLD_H);
    this.canvas.width = Math.round(WORLD_W * scale * dpr);
    this.canvas.height = Math.round(WORLD_H * scale * dpr);
    this.canvas.style.width = `${Math.round(WORLD_W * scale)}px`;
    this.canvas.style.height = `${Math.round(WORLD_H * scale)}px`;
  }

  private loadSites(): void {
    (Object.keys(SITES) as ThemeId[]).forEach((id) => {
      const img = new Image();
      img.src = SITES[id].svg;
      this.siteArt.set(id, img);
    });
  }

  draw(s: RenderState): void {
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = canvas.width / WORLD_W;
    // screen shake
    const shx = (Math.random() - 0.5) * s.shake * 2;
    const shy = (Math.random() - 0.5) * s.shake * 2;
    ctx.setTransform(scale, 0, 0, scale, shx * scale, shy * scale);

    this.drawBackground(s);
    this.drawGround(s.theme);

    // blocks first (behind enemies), then enemies, then birds
    for (const b of s.bodies) if (b.meta.type === 'block') this.drawBlock(b);
    for (const b of s.bodies) if (b.meta.type === 'enemy') this.drawEnemy(b, s.time);
    this.drawBirdQueue(s.queue, s.time, s.queueShift ?? 1, s.queueGapR ?? 20);
    for (const b of s.bodies) {
      if (b.meta.type !== 'bird') continue;
      if (b.meta.sling && b.isStatic) continue;
      this.drawBirdBody(b, s.time);
    }

    if (s.slingBird) {
      this.drawTrajectory(s.trajectory);
      const docked = s.slingBird.docked !== false;
      this.drawSlingBand(docked ? s.slingBird : null, docked);
      this.drawBirdAt(s.slingBird.kind, s.slingBird.x, s.slingBird.y, s.slingBird.angle ?? 0, s.time, s.slingBird.stretch);
    } else {
      this.drawSlingBand(null, false);
    }

    s.particles.draw(ctx);
  }
  private drawBirdQueue(kinds: string[], t: number, shift = 1, gapR = 20): void {
    let x = SLING.x - 74 - (1 - shift) * (gapR * 2.15 + 8);
    for (let i = 0; i < kinds.length; i++) {
      const kind = kinds[i];
      const r = BIRD_RADIUS[(kind as keyof typeof BIRD_RADIUS)] ?? 20;
      const hop = Math.max(0, Math.sin(t * 2.8 + i * 1.6)) * 3.2;
      this.drawBirdAt(kind, x, GROUND_Y - r + 2 - hop, 0.06, t);
      x -= r * 2.15 + 8;
    }
  }

  // -------------------------------------------------------------------
  // Backgrounds
  // -------------------------------------------------------------------

  private drawBackground(s: RenderState): void {
    const site = SITES[s.theme];
    this.sky(site.skyTop, site.skyBot);
    const img = this.siteArt.get(s.theme);
    const ready = !!(img && img.complete && img.naturalWidth > 0);
    if (ready && img) this.ctx.drawImage(img, 0, 0, WORLD_W, GROUND_Y);
    else this.drawSiteFallback(s);
    if (ready) this.drawSiteOverlay(s);
    this.drawSiteFlag(s.theme, s.time, s.flagRaise);
    if (s.plane) this.drawPlane(s.plane, s.time);
  }

  private drawSiteFallback(s: RenderState): void {
    if (s.theme === 'belta') this.bgBelta(s.time, s.flagRaise);
    else if (s.theme === 'railway') this.bgRailway(s.time, s.flagRaise);
    else if (s.theme === 'azot') this.bgAzot(s.time);
    else if (s.theme === 'aeroflot') this.bgAeroflot(s.time);
  }

  private drawSiteOverlay(s: RenderState): void {
    const kind = SITES[s.theme].overlay;
    if (kind === 'wire') {
      if (s.flagRaise < 0.995) {
        this.ctx.save();
        this.ctx.globalAlpha = 1 - s.flagRaise;
        this.drawBarbedCompound(860, GROUND_Y - 250, 340, 250);
        this.ctx.restore();
      }
    } else if (kind === 'tanks') {
      const cars = [992, 1110, 1228];
      for (let i = 0; i < cars.length; i++) {
        this.drawFlatcar(cars[i], GROUND_Y - 20, 108);
        this.drawRailTank(cars[i] + 54, GROUND_Y - 20, s.time, s.flagRaise, i);
      }
    } else if (kind === 'smoke') {
      const ctx = this.ctx;
      for (let i = 0; i < 5; i++) {
        const p = ((s.time * 20 + i * 40) % 200) / 200;
        ctx.fillStyle = `rgba(210,215,215,${0.35 * (1 - p)})`;
        ctx.beginPath();
        ctx.arc(777 + Math.sin(s.time + i) * 10 * p, GROUND_Y - 300 - p * 160, 14 + p * 26, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 'search') {
      const ctx = this.ctx;
      const ang = s.time * 0.7;
      ctx.save();
      ctx.translate(998, 200);
      ctx.rotate(Math.sin(ang) * 0.55);
      const g = ctx.createLinearGradient(0, 0, 280, 80);
      g.addColorStop(0, 'rgba(255,240,180,0.28)');
      g.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(280, -40);
      ctx.lineTo(280, 90);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private sky(top: string, bottom: string): void {
    const g = this.ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, WORLD_W, GROUND_Y);
  }

  private clouds(t: number, y: number, speed: number, color: string, n: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const x = ((i * 340 + t * speed) % (WORLD_W + 300)) - 150;
      const yy = y + (i % 3) * 26;
      ctx.beginPath();
      ctx.ellipse(x, yy, 56, 16, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 40, yy - 10, 40, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 38, yy - 6, 34, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private bgBelta(t: number, flagRaise: number): void {
    const ctx = this.ctx;
    this.sky('#7d8ca3', '#c9bfa8');
    // sun
    ctx.fillStyle = 'rgba(255,240,200,0.9)';
    ctx.beginPath(); ctx.arc(1080, 120, 46, 0, Math.PI * 2); ctx.fill();
    this.clouds(t, 110, 8, 'rgba(255,255,255,0.5)', 4);
    // distant city
    ctx.fillStyle = '#8b93a3';
    for (let i = 0; i < 9; i++) {
      const x = i * 150 - 20;
      const h = 90 + ((i * 53) % 70);
      ctx.fillRect(x, GROUND_Y - h, 110, h);
    }
    // BelTA main building (right of center)
    const bx = 860, bw = 340, bh = 250;
    ctx.fillStyle = '#a9a49a';
    ctx.fillRect(bx, GROUND_Y - bh, bw, bh);
    // spire
    ctx.beginPath();
    ctx.moveTo(bx + bw / 2 - 26, GROUND_Y - bh);
    ctx.lineTo(bx + bw / 2, GROUND_Y - bh - 90);
    ctx.lineTo(bx + bw / 2 + 26, GROUND_Y - bh);
    ctx.closePath(); ctx.fill();
    // site flag drawn later via FLAG_POLE on the spire
    // window grid
    ctx.fillStyle = 'rgba(60,70,90,0.55)';
    for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
      ctx.fillRect(bx + 24 + c * 38, GROUND_Y - bh + 26 + r * 34, 20, 18);
    }
    // БЕЛТА sign
    ctx.fillStyle = '#3c4452';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('БЕЛТА', bx + bw / 2, GROUND_Y - bh + 18);
    ctx.textAlign = 'left';
    if (flagRaise < 0.995) {
      this.ctx.save();
      this.ctx.globalAlpha = 1 - flagRaise;
      this.drawBarbedCompound(bx, GROUND_Y - bh, bw, bh);
      this.ctx.restore();
    }
  }

  private drawBarbedStrand(x0: number, y0: number, x1: number, y1: number, spacing = 14): void {
    const ctx = this.ctx;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
    ctx.strokeStyle = '#4a515a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = '#6d747e';
    ctx.lineWidth = 1.15;
    for (let d = 7; d < len - 4; d += spacing) {
      const x = x0 + ux * d, y = y0 + uy * d;
      const a = 4.4;
      ctx.beginPath();
      ctx.moveTo(x + (px + ux) * a, y + (py + uy) * a);
      ctx.lineTo(x - (px + ux) * a, y - (py + uy) * a);
      ctx.moveTo(x + (px - ux) * a, y + (py - uy) * a);
      ctx.lineTo(x - (px - ux) * a, y - (py - uy) * a);
      ctx.stroke();
    }
  }

  private drawConcertina(x0: number, x1: number, y: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#5a616a';
    ctx.lineWidth = 1.2;
    const r = 9;
    for (let x = x0 + r; x < x1 - 3; x += r * 1.65) {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x + 3, y, r * 0.52, r * 0.38, 0.55, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawBarbedCompound(bx: number, by: number, bw: number, bh: number): void {
    const ctx = this.ctx;
    const L = bx - 10, R = bx + bw + 10, T = by - 3, B = by + bh;
    ctx.fillStyle = '#2c3138';
    ctx.fillRect(L - 3, T - 14, 6, B - T + 14);
    ctx.fillRect(R - 3, T - 14, 6, B - T + 14);
    for (let x = L + 40; x < R - 8; x += 40) ctx.fillRect(x - 2, T - 14, 4, 18);
    ctx.strokeStyle = '#2c3138';
    ctx.lineWidth = 2;
    for (let x = L; x <= R; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, T - 12);
      ctx.lineTo(x - 11, T - 28);
      ctx.moveTo(x, T - 12);
      ctx.lineTo(x + 11, T - 28);
      ctx.stroke();
    }
    this.drawBarbedStrand(L, T, R, T, 13);
    this.drawBarbedStrand(L - 11, T - 26, R + 11, T - 26, 12);
    this.drawBarbedStrand(L + 11, T - 26, R - 11, T - 26, 12);
    this.drawConcertina(L - 6, R + 6, T - 30);
    this.drawBarbedStrand(L, T, L, B, 16);
    this.drawBarbedStrand(L + 7, T + 10, L + 7, B, 16);
    this.drawBarbedStrand(R, T, R, B, 16);
    this.drawBarbedStrand(R - 7, T + 10, R - 7, B, 16);
    // corner coils so the wrap reads in 2D
    ctx.strokeStyle = '#5a616a';
    ctx.lineWidth = 1.2;
    for (const x of [L + 1, R - 1]) {
      for (let i = 0; i < 5; i++) {
        const y = T + 28 + i * 42;
        ctx.beginPath();
        ctx.ellipse(x, y, 7, 11, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private bgRailway(t: number, flagRaise: number): void {
    const ctx = this.ctx;
    this.sky('#3d4a63', '#c97b4a');
    // low sun
    ctx.fillStyle = 'rgba(255,180,90,0.85)';
    ctx.beginPath(); ctx.arc(240, GROUND_Y - 120, 52, 0, Math.PI * 2); ctx.fill();
    this.clouds(t, 90, 5, 'rgba(255,200,150,0.35)', 3);
    // catenary poles along the yard
    ctx.strokeStyle = '#2c3547'; ctx.lineWidth = 6;
    for (let i = 0; i < 7; i++) {
      const x = 120 + i * 190;
      ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.lineTo(x, GROUND_Y - 190); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 34, GROUND_Y - 178); ctx.lineTo(x + 34, GROUND_Y - 178); ctx.stroke();
    }
    // wire
    ctx.strokeStyle = 'rgba(44,53,71,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const x = i * (WORLD_W / 60);
      const y = GROUND_Y - 178 + Math.sin(x * 0.02) * 4;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // BCh siding: flatcars with Russian tanks (smoke after the yard is cleared)
    const cars = [992, 1110, 1228];
    for (let i = 0; i < cars.length; i++) {
      this.drawFlatcar(cars[i], GROUND_Y - 20, 108);
      this.drawRailTank(cars[i] + 54, GROUND_Y - 20, t, flagRaise, i);
    }
    // signal tower left
    ctx.fillStyle = '#2c3547';
    ctx.fillRect(90, GROUND_Y - 150, 10, 150);
    ctx.fillStyle = Math.floor(t * 1.5) % 2 === 0 ? '#ffcc33' : '#5a4a1a';
    ctx.beginPath(); ctx.arc(95, GROUND_Y - 158, 8, 0, Math.PI * 2); ctx.fill();
  }

  private drawFlatcar(x: number, deckY: number, w: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#1c2026';
    for (const wx of [x + 18, x + 38, x + w - 38, x + w - 18]) {
      ctx.beginPath(); ctx.arc(wx, deckY + 16, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(wx - 3, deckY + 4, 6, 12);
    }
    ctx.fillStyle = '#5a3d28';
    ctx.fillRect(x, deckY, w, 12);
    ctx.fillStyle = '#3a281c';
    ctx.fillRect(x - 3, deckY + 10, w + 6, 5);
    ctx.fillStyle = '#4a3222';
    ctx.fillRect(x, deckY - 12, 6, 12);
    ctx.fillRect(x + w - 6, deckY - 12, 6, 12);
    ctx.fillStyle = '#2a1c14';
    ctx.fillRect(x + w - 4, deckY + 2, 8, 4);
    ctx.fillRect(x - 4, deckY + 2, 8, 4);
  }

  private drawRailTank(cx: number, deckY: number, t: number, flagRaise: number, seed: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, deckY);
    // tracks
    ctx.fillStyle = '#2a2e28';
    ctx.fillRect(-30, -11, 60, 11);
    ctx.fillStyle = '#1a1c18';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.arc(-20 + i * 10, -2, 3.6, 0, Math.PI * 2); ctx.fill();
    }
    // hull
    ctx.fillStyle = '#4a5538';
    ctx.beginPath();
    ctx.moveTo(-28, -11);
    ctx.lineTo(-22, -24);
    ctx.lineTo(22, -24);
    ctx.lineTo(28, -11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3d4a2e';
    ctx.fillRect(-24, -16, 48, 4);
    // turret + barrel facing west
    ctx.fillStyle = '#556240';
    ctx.beginPath();
    ctx.ellipse(-2, -31, 15, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a422c';
    ctx.fillRect(-50, -33, 34, 4);
    ctx.fillRect(-50, -34, 5, 6);
    // red star
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(8, -16);
    ctx.lineTo(10.2, -11.4);
    ctx.lineTo(15, -11.4);
    ctx.lineTo(11.2, -8.6);
    ctx.lineTo(12.6, -4);
    ctx.lineTo(8, -6.8);
    ctx.lineTo(3.4, -4);
    ctx.lineTo(4.8, -8.6);
    ctx.lineTo(1, -11.4);
    ctx.lineTo(5.8, -11.4);
    ctx.closePath();
    ctx.fill();
    if (flagRaise > 0) {
      const hatchX = -4;
      const hatchY = -40;
      ctx.fillStyle = `rgba(255,120,40,${0.35 + flagRaise * 0.35})`;
      ctx.beginPath(); ctx.arc(hatchX, hatchY + 4, 4, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 5; i++) {
        const p = ((t * 18 + seed * 37 + i * 28) % 140) / 140;
        const a = (0.45 * flagRaise) * (1 - p);
        ctx.fillStyle = `rgba(${70 + i * 8},${70 + i * 6},${66},${a})`;
        ctx.beginPath();
        ctx.arc(hatchX + Math.sin(t * 1.4 + seed + i) * 10 * p, hatchY - p * 70, 7 + p * 16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private bgAzot(t: number): void {
    const ctx = this.ctx;
    this.sky('#5d6d72', '#b8a98c');
    this.clouds(t, 100, 4, 'rgba(230,230,220,0.4)', 3);
    // cooling tower (hyperboloid)
    const tx = 980, tw = 150, th = 260;
    ctx.fillStyle = '#7d8a8f';
    ctx.beginPath();
    ctx.moveTo(tx - tw / 2, GROUND_Y);
    ctx.bezierCurveTo(tx - tw * 0.32, GROUND_Y - th * 0.55, tx - tw * 0.3, GROUND_Y - th * 0.8, tx - tw * 0.42, GROUND_Y - th);
    ctx.lineTo(tx + tw * 0.42, GROUND_Y - th);
    ctx.bezierCurveTo(tx + tw * 0.3, GROUND_Y - th * 0.8, tx + tw * 0.32, GROUND_Y - th * 0.55, tx + tw / 2, GROUND_Y);
    ctx.closePath(); ctx.fill();
    // chimney with animated smoke
    ctx.fillStyle = '#6d7a80';
    ctx.fillRect(760, GROUND_Y - 300, 34, 300);
    for (let i = 0; i < 5; i++) {
      const p = ((t * 20 + i * 40) % 200) / 200;
      ctx.fillStyle = `rgba(210,215,215,${0.35 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(777 + Math.sin(t + i) * 10 * p, GROUND_Y - 300 - p * 160, 14 + p * 26, 0, Math.PI * 2);
      ctx.fill();
    }
    // pipes
    ctx.strokeStyle = '#5d6b71'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(600, GROUND_Y - 90); ctx.lineTo(980, GROUND_Y - 90); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(600, GROUND_Y - 50); ctx.lineTo(760, GROUND_Y - 50); ctx.stroke();
    // storage tanks
    ctx.fillStyle = '#8a979c';
    for (let i = 0; i < 3; i++) {
      const x = 420 + i * 90;
      ctx.beginPath(); ctx.ellipse(x, GROUND_Y - 40, 34, 46, 0, 0, Math.PI * 2); ctx.fill();
    }
    // hazard stripes on a wall
    const hx = 560;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#d9a521' : '#2b2f33';
      ctx.save();
      ctx.translate(hx + i * 16, GROUND_Y - 30);
      ctx.transform(1, 0, -0.6, 1, 0, 0);
      ctx.fillRect(0, 0, 16, 30);
      ctx.restore();
    }
  }

  private bgAeroflot(t: number): void {
    const ctx = this.ctx;
    this.sky('#4f8fd0', '#bcd9ee');
    this.clouds(t, 120, 10, 'rgba(255,255,255,0.8)', 5);
    // terminal building (glass)
    const bx = 700, bw = 460, bh = 190;
    ctx.fillStyle = '#9fb4c8';
    ctx.fillRect(bx, GROUND_Y - bh, bw, bh);
    ctx.fillStyle = 'rgba(210,235,250,0.7)';
    for (let c = 0; c < 12; c++) ctx.fillRect(bx + 14 + c * 37, GROUND_Y - bh + 18, 26, bh - 36);
    // control tower
    ctx.fillStyle = '#8ba0b5';
    ctx.fillRect(1180, GROUND_Y - 300, 26, 300);
    ctx.beginPath(); ctx.ellipse(1193, GROUND_Y - 306, 40, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1e3a2a';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('МІНСК-2', bx + bw / 2, GROUND_Y - bh - 8);
    ctx.textAlign = 'left';
    // aircraft is driven by Game.plane (faces west, crashes on clear)
  }

  private drawPlane(p: PlaneState, t: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.ang);
    if (p.mode === 'dead') ctx.scale(0.98, 0.78);
    ctx.globalAlpha = p.mode === 'dead' ? 0.85 : 1;
    ctx.fillStyle = p.mode === 'dead' ? '#b8c0c8' : '#f4f7fa';
    ctx.beginPath();
    ctx.ellipse(0, 0, 120, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    // tail to the east (rear)
    ctx.beginPath();
    ctx.moveTo(100, -6); ctx.lineTo(135, -58); ctx.lineTo(104, -58); ctx.lineTo(78, -8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = p.mode === 'dead' ? '#8a929a' : '#dfe7ee';
    ctx.beginPath();
    ctx.moveTo(-10, 4); ctx.lineTo(52, 44); ctx.lineTo(16, 44); ctx.lineTo(-44, 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0d4f9e';
    ctx.fillRect(-118, -4, 236, 7);
    ctx.fillStyle = '#d52b1e';
    ctx.fillRect(-118, 3, 236, 7);
    ctx.fillStyle = '#33475c';
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(70 - i * 16, -8, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#dfe7ee';
    ctx.beginPath(); ctx.ellipse(-112, 0, 14, 16, 0, 0, Math.PI * 2); ctx.fill();
    if (p.mode !== 'fly') {
      ctx.fillStyle = 'rgba(40,40,40,0.45)';
      ctx.beginPath(); ctx.arc(20, 4, 10 + (t % 1) * 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  private drawSiteFlag(theme: ThemeId, t: number, raise: number): void {
    const pole = FLAG_POLE[theme];
    const ctx = this.ctx;
    ctx.strokeStyle = '#2c3138';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pole.x, pole.base);
    ctx.lineTo(pole.x, pole.top - 4);
    ctx.stroke();
    ctx.fillStyle = '#1c2026';
    ctx.beginPath(); ctx.arc(pole.x, pole.top - 4, 3.4, 0, Math.PI * 2); ctx.fill();
    const w = 70, h = 42;
    const travel = 54;
    const wave = Math.sin(t * 3.2) * 3.6;
    if (raise < 0.995) {
      ctx.save();
      ctx.globalAlpha = 1 - raise * 0.9;
      this.paintRegimeCloth(pole.x + 3, pole.top + raise * travel, w, h, wave);
      ctx.restore();
    }
    if (raise > 0.02) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, raise * 1.25);
      this.paintWrwCloth(pole.x + 3, pole.top + (1 - raise) * travel, w, h, wave);
      ctx.restore();
    }
  }

  private clothPath(x: number, y: number, w: number, h: number, wave: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w * 0.45, y + wave, x + w, y + wave * 0.35);
    ctx.lineTo(x + w, y + h + wave * 0.35);
    ctx.quadraticCurveTo(x + w * 0.45, y + h + wave, x, y + h);
    ctx.closePath();
  }

  /** Official red-over-green flag with vertical ornamental hoist. */
  private paintRegimeCloth(x: number, y: number, w: number, h: number, wave: number): void {
    const ctx = this.ctx;
    ctx.save();
    this.clothPath(x, y, w, h, wave);
    ctx.clip();
    const hoist = w * 0.22;
    ctx.fillStyle = '#c8312a';
    ctx.fillRect(x, y - 4, w + 4, h * 0.67 + 8);
    ctx.fillStyle = '#007c30';
    ctx.fillRect(x, y + h * 0.67, w + 4, h * 0.4 + 6);
    ctx.fillStyle = '#f3eee4';
    ctx.fillRect(x, y - 4, hoist, h + 12);
    ctx.fillStyle = '#c8312a';
    const cell = h / 7;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 2; col++) {
        const cx = x + hoist * (0.32 + col * 0.38);
        const cy = y + (row + 0.5) * cell;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 3.2);
        ctx.lineTo(cx + 2.8, cy);
        ctx.lineTo(cx, cy + 3.2);
        ctx.lineTo(cx - 2.8, cy);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private paintWrwCloth(x: number, y: number, w: number, h: number, wave: number): void {
    const ctx = this.ctx;
    ctx.save();
    this.clothPath(x, y, w, h, wave);
    ctx.clip();
    ctx.fillStyle = '#f5f7fa';
    ctx.fillRect(x, y - 4, w + 4, h / 3 + 6);
    ctx.fillStyle = '#ce2939';
    ctx.fillRect(x, y + h / 3, w + 4, h / 3);
    ctx.fillStyle = '#f5f7fa';
    ctx.fillRect(x, y + (h * 2) / 3, w + 4, h / 3 + 8);
    ctx.restore();
  }

  private drawGround(theme: ThemeId): void {
    const { ctx } = this;
    const base = SITES[theme].ground, top = SITES[theme].groundTop;
    ctx.fillStyle = base;
    ctx.fillRect(0, GROUND_Y, WORLD_W, WORLD_H - GROUND_Y);
    ctx.fillStyle = top;
    ctx.fillRect(0, GROUND_Y, WORLD_W, 14);
    if (theme === 'railway') {
      // rail lines
      ctx.strokeStyle = '#33383f'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0, GROUND_Y + 26); ctx.lineTo(WORLD_W, GROUND_Y + 26); ctx.stroke();
      ctx.strokeStyle = '#6a7078'; ctx.lineWidth = 3;
      for (let x = 20; x < WORLD_W; x += 46) {
        ctx.beginPath(); ctx.moveTo(x, GROUND_Y + 18); ctx.lineTo(x + 18, GROUND_Y + 34); ctx.stroke();
      }
    } else if (theme === 'aeroflot') {
      // runway markings
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let x = 60; x < WORLD_W; x += 120) ctx.fillRect(x, GROUND_Y + 30, 54, 6);
    }
  }

  // -------------------------------------------------------------------
  // Blocks
  // -------------------------------------------------------------------

  private drawBlock(b: Body): void {
    if (b.shape.kind !== 'box') return;
    const { ctx } = this;
    const kind = (b.meta.kind as string | undefined) ?? 'wood';
    const hp = typeof b.meta.hp === 'number' ? b.meta.hp : 1;
    const maxHp = typeof b.meta.maxHp === 'number' ? b.meta.maxHp : 1;
    const seed = typeof b.meta.seed === 'number' ? b.meta.seed : 1;
    const { hx, hy } = b.shape;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.angle);

    if (kind === 'tnt') {
      ctx.fillStyle = '#c62828';
      ctx.fillRect(-hx, -hy, hx * 2, hy * 2);
      ctx.fillStyle = '#f0c040';
      ctx.fillRect(-hx, -hy * 0.28, hx * 2, hy * 0.56);
      ctx.strokeStyle = '#7a1414'; ctx.lineWidth = 3;
      ctx.strokeRect(-hx + 1.5, -hy + 1.5, hx * 2 - 3, hy * 2 - 3);
      ctx.fillStyle = '#2a1010';
      ctx.font = `bold ${Math.max(9, Math.min(hx, hy) * 0.9)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TNT', 0, 1);
    } else if (kind === 'glass') {
      ctx.fillStyle = 'rgba(170, 220, 240, 0.38)';
      ctx.fillRect(-hx, -hy, hx * 2, hy * 2);
      ctx.strokeStyle = 'rgba(180, 220, 235, 0.85)'; ctx.lineWidth = 2;
      ctx.strokeRect(-hx + 1, -hy + 1, hx * 2 - 2, hy * 2 - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.38)';
      ctx.beginPath();
      ctx.moveTo(-hx + 4, -hy + 3);
      ctx.lineTo(-hx + Math.min(18, hx), -hy + 3);
      ctx.lineTo(hx - 10, hy - 5);
      ctx.lineTo(hx - 18, hy - 5);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'stone') {
      ctx.fillStyle = '#8e949c';
      ctx.fillRect(-hx, -hy, hx * 2, hy * 2);
      ctx.strokeStyle = '#6a6f76'; ctx.lineWidth = 2;
      const rows = Math.max(1, Math.round(hy / 9));
      const rh = (hy * 2) / rows;
      for (let r = 0; r < rows; r++) {
        const y0 = -hy + r * rh;
        ctx.beginPath(); ctx.moveTo(-hx + 1, y0); ctx.lineTo(hx - 1, y0); ctx.stroke();
        const cols = Math.max(1, Math.round(hx / 12));
        const cw = (hx * 2) / cols;
        const off = (r % 2) * (cw * 0.5);
        for (let c = 1; c < cols; c++) {
          const x0 = -hx + c * cw + off;
          if (x0 >= hx - 2) continue;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + rh); ctx.stroke();
        }
      }
      ctx.strokeStyle = '#5c6168'; ctx.lineWidth = 3;
      ctx.strokeRect(-hx + 1.5, -hy + 1.5, hx * 2 - 3, hy * 2 - 3);
    } else {
      ctx.fillStyle = '#b07a45';
      ctx.fillRect(-hx, -hy, hx * 2, hy * 2);
      ctx.strokeStyle = 'rgba(90,55,25,0.45)'; ctx.lineWidth = 2;
      const tall = hy > hx * 1.15;
      if (tall) {
        for (let i = 1; i < 3; i++) {
          const x = -hx + (i * hx * 2) / 3;
          ctx.beginPath(); ctx.moveTo(x, -hy + 4); ctx.lineTo(x, hy - 4); ctx.stroke();
        }
      } else {
        for (let i = 1; i < 3; i++) {
          const y = -hy + (i * hy * 2) / 3;
          ctx.beginPath(); ctx.moveTo(-hx + 4, y); ctx.lineTo(hx - 4, y); ctx.stroke();
        }
      }
      ctx.strokeStyle = '#7c5230'; ctx.lineWidth = 3;
      ctx.strokeRect(-hx + 1.5, -hy + 1.5, hx * 2 - 3, hy * 2 - 3);
    }

    const frac = hp / Math.max(1, maxHp);
    if (frac < 0.72) this.drawCracks(hx, hy, seed, 1 - frac);
    ctx.restore();
  }

  private drawCracks(hx: number, hy: number, seed: number, severity: number): void {
    const { ctx } = this;
    const branches = severity > 0.6 ? 4 : 2;
    ctx.strokeStyle = 'rgba(22,18,14,0.7)';
    ctx.lineWidth = 1.35;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < branches; i++) {
      const a0 = this.hash01(seed + i * 17) * Math.PI * 2;
      let x = (this.hash01(seed + i * 31) - 0.5) * hx * 1.15;
      let y = (this.hash01(seed + i * 47) - 0.5) * hy * 1.15;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const segs = 4 + (severity > 0.6 ? 2 : 0);
      for (let s = 0; s < segs; s++) {
        const ang = a0 + (this.hash01(seed + i * 13 + s * 9) - 0.5) * 1.05;
        const len = 6 + this.hash01(seed + i * 3 + s) * Math.min(hx, hy) * 0.65;
        x = Math.max(-hx + 2, Math.min(hx - 2, x + Math.cos(ang) * len));
        y = Math.max(-hy + 2, Math.min(hy - 2, y + Math.sin(ang) * len));
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  private hash01(n: number): number {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // -------------------------------------------------------------------
  // Enemies: regime cockroaches (minion / officer / general / Luka)
  // -------------------------------------------------------------------

  private drawEnemy(b: Body, t: number): void {
    if (b.shape.kind !== 'circle') return;
    const r = b.shape.r;
    const kind = (b.meta.kind as string | undefined) ?? 'minion';
    const hp = typeof b.meta.hp === 'number' ? b.meta.hp : 1;
    const maxHp = typeof b.meta.maxHp === 'number' ? b.meta.maxHp : 1;
    const hurt = (t - ((b.meta.hurtAt as number | undefined) ?? -10)) < 0.25;
    const { ctx } = this;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.angle);
    if (kind === 'boss') this.drawLukaRoach(r, t, hurt, hp / maxHp);
    else if (kind === 'general') this.drawGeneralRoach(r, t, hurt);
    else if (kind === 'officer') this.drawOfficerRoach(r, t, hurt);
    else this.drawRiotRoach(r, t, hurt);
    ctx.restore();
  }

  private roachShell(hurt: boolean, base: string): string { return hurt ? '#e8c86a' : base; }

  private drawRoachLegs(r: number, t: number, y0: number, wide: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = Math.max(1.8, r * 0.09);
    ctx.lineCap = 'round';
    const twitch = Math.sin(t * 10) * r * 0.05;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y = y0 + i * r * 0.22;
        ctx.beginPath();
        ctx.moveTo(side * r * 0.55 * wide, y);
        ctx.quadraticCurveTo(
          side * r * 1.18 * wide, y + r * 0.04 + twitch,
          side * r * 1.02 * wide, y + r * 0.28,
        );
        ctx.stroke();
      }
    }
  }

  private drawRoachAntennae(r: number, t: number, y: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = Math.max(1.5, r * 0.075);
    ctx.lineCap = 'round';
    const wag = Math.sin(t * 6.5) * r * 0.14;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * r * 0.18, y);
      ctx.quadraticCurveTo(side * r * 0.5, y - r * 0.5 + wag * side, side * r * 0.62, y - r * 0.82);
      ctx.stroke();
    }
  }

  private drawRoachCore(
    r: number, t: number, hurt: boolean,
    shell: string, head: string, wide = 1, stripes = false, shades = false,
  ): void {
    const ctx = this.ctx;
    const body = this.roachShell(hurt, shell);
    const pate = this.roachShell(hurt, head);
    this.drawRoachLegs(r, t, r * 0.18, wide);
    // abdomen / elytra
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.4, r * 0.82 * wide, r * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,16,8,0.45)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(30,16,8,0.35)';
    ctx.beginPath(); ctx.moveTo(0, r * 0.02); ctx.lineTo(0, r * 0.92); ctx.stroke();
    ctx.fillStyle = 'rgba(255,230,180,0.18)';
    ctx.beginPath(); ctx.ellipse(-r * 0.26 * wide, r * 0.32, r * 0.2, r * 0.28, -0.2, 0, Math.PI * 2); ctx.fill();
    // big face shield
    ctx.fillStyle = pate;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.22, r * 0.74 * wide, r * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,16,8,0.4)';
    ctx.stroke();
    if (stripes) {
      ctx.fillStyle = 'rgba(40,24,10,0.55)';
      ctx.beginPath(); ctx.ellipse(-r * 0.18, -r * 0.28, r * 0.1, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r * 0.18, -r * 0.28, r * 0.1, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    }
    this.drawRoachAntennae(r, t, -r * 0.68);
    const blink = Math.sin(t * 1.7 + r) > 0.985;
    if (shades) {
      ctx.fillStyle = '#111418';
      ctx.beginPath();
      ctx.roundRect(-r * 0.48, -r * 0.4, r * 0.96, r * 0.22, r * 0.08);
      ctx.fill();
      ctx.fillStyle = 'rgba(80,160,200,0.25)';
      ctx.fillRect(-r * 0.42, -r * 0.36, r * 0.38, r * 0.1);
    } else if (blink) {
      ctx.strokeStyle = '#1a0c08'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-r * 0.34, -r * 0.28); ctx.lineTo(-r * 0.08, -r * 0.28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.08, -r * 0.28); ctx.lineTo(r * 0.34, -r * 0.28); ctx.stroke();
    } else {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(-r * 0.22, -r * 0.28, r * 0.16, r * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r * 0.22, -r * 0.28, r * 0.16, r * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a0c08';
      ctx.beginPath(); ctx.arc(-r * 0.18, -r * 0.26, r * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.26, -r * 0.26, r * 0.08, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#1a0c08';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r * 0.46, -r * 0.48); ctx.lineTo(-r * 0.08, -r * 0.38); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.46, -r * 0.48); ctx.lineTo(r * 0.08, -r * 0.38); ctx.stroke();
  }

  private drawRiotRoach(r: number, t: number, hurt: boolean): void {
    const ctx = this.ctx;
    this.drawRoachCore(r, t, hurt, '#3a3228', '#4a3a2c', 1, false, false);
    // OMON visor helmet
    ctx.fillStyle = '#14171c';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.52, r * 0.78, r * 0.42, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-r * 0.78, -r * 0.52, r * 1.56, r * 0.16);
    ctx.fillStyle = 'rgba(30,50,60,0.72)';
    ctx.fillRect(-r * 0.62, -r * 0.4, r * 1.24, r * 0.22);
    ctx.fillStyle = '#c8312a'; ctx.fillRect(-r * 0.34, -r * 0.72, r * 0.68, r * 0.08);
    ctx.fillStyle = '#2f9e44'; ctx.fillRect(-r * 0.34, -r * 0.64, r * 0.68, r * 0.07);
    this.drawRoachAntennae(r, t, -r * 0.78);
    // baton
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = Math.max(3, r * 0.14);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r * 0.7, r * 0.15); ctx.lineTo(r * 1.15, -r * 0.35); ctx.stroke();
    ctx.strokeStyle = '#c8312a';
    ctx.lineWidth = Math.max(4, r * 0.16);
    ctx.beginPath(); ctx.moveTo(r * 0.7, r * 0.15); ctx.lineTo(r * 0.82, r * 0.02); ctx.stroke();
  }

  private drawOfficerRoach(r: number, t: number, hurt: boolean): void {
    const ctx = this.ctx;
    this.drawRoachCore(r, t, hurt, '#4a5560', '#5a6570', 0.95, false, true);
    // red tie
    ctx.fillStyle = '#c8312a';
    ctx.beginPath();
    ctx.moveTo(0, r * 0.08);
    ctx.lineTo(-r * 0.1, r * 0.55);
    ctx.lineTo(0, r * 0.68);
    ctx.lineTo(r * 0.1, r * 0.55);
    ctx.closePath(); ctx.fill();
    // tall militsiya cap
    ctx.fillStyle = '#1e2a3c';
    ctx.beginPath();
    ctx.moveTo(-r * 0.78, -r * 0.48);
    ctx.lineTo(-r * 0.62, -r * 1.22);
    ctx.quadraticCurveTo(0, -r * 1.4, r * 0.62, -r * 1.22);
    ctx.lineTo(r * 0.78, -r * 0.48);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c8312a';
    ctx.fillRect(-r * 0.76, -r * 0.68, r * 1.52, r * 0.16);
    ctx.fillStyle = '#12161c';
    ctx.beginPath(); ctx.ellipse(r * 0.12, -r * 0.46, r * 0.64, r * 0.12, 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8c04a';
    ctx.beginPath(); ctx.arc(0, -r * 0.96, r * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c8312a';
    ctx.beginPath(); ctx.arc(0, -r * 0.96, r * 0.06, 0, Math.PI * 2); ctx.fill();
  }

  private drawGeneralRoach(r: number, t: number, hurt: boolean): void {
    const ctx = this.ctx;
    this.drawRoachCore(r, t, hurt, '#3d4a28', '#4a5530', 1.16, false, false);
    // gold braid
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(-r * 1.05, r * 0.02, r * 0.28, r * 0.2);
    ctx.fillRect(r * 0.77, r * 0.02, r * 0.28, r * 0.2);
    ctx.fillStyle = '#c8312a';
    ctx.fillRect(-r * 1.0, r * 0.08, r * 0.18, r * 0.06);
    ctx.fillRect(r * 0.82, r * 0.08, r * 0.18, r * 0.06);
    // chest star
    ctx.fillStyle = '#e8c04a';
    ctx.beginPath();
    const sy = r * 0.48;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 0.8;
      const x = Math.cos(a) * r * 0.26, y = sy + Math.sin(a) * r * 0.26;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    // marshal cap
    ctx.fillStyle = '#2c3820';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.72, r * 0.82, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(-r * 0.78, -r * 0.64, r * 1.56, r * 0.12);
    ctx.fillStyle = '#1a2014';
    ctx.beginPath(); ctx.ellipse(r * 0.14, -r * 0.5, r * 0.7, r * 0.13, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8c04a';
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.02);
    ctx.lineTo(r * 0.12, -r * 0.78);
    ctx.lineTo(0, -r * 0.84);
    ctx.lineTo(-r * 0.12, -r * 0.78);
    ctx.closePath(); ctx.fill();
  }

  private drawLukaRoach(r: number, t: number, hurt: boolean, hpFrac: number): void {
    const ctx = this.ctx;
    // amber German cockroach — the таракан himself
    this.drawRoachCore(r, t, hurt, '#c4a05a', '#d4b06a', 1.05, true, false);
    // regime red-over-green, not a tricolor
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, r * 0.4, r * 0.82 * 1.05, r * 0.58, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#c8312a'; ctx.fillRect(-r * 0.74, 0, r * 0.16, r * 1.2);
    ctx.fillStyle = '#2f9e44'; ctx.fillRect(-r * 0.58, 0, r * 0.16, r * 1.2);
    ctx.restore();
    ctx.fillStyle = '#c8312a';
    ctx.fillRect(r * 0.14, r * 0.2, r * 0.3, r * 0.1);
    ctx.fillStyle = '#2f9e44';
    ctx.fillRect(r * 0.14, r * 0.3, r * 0.3, r * 0.08);
    ctx.fillStyle = '#f3eee4';
    ctx.fillRect(r * 0.14, r * 0.2, r * 0.07, r * 0.18);
    // bald pate
    ctx.fillStyle = hurt ? '#f0d8b0' : '#e2c49a';
    ctx.beginPath(); ctx.ellipse(0, -r * 0.58, r * 0.36, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    // mustache — the Luka silhouette
    ctx.fillStyle = '#3a342c';
    ctx.beginPath();
    ctx.moveTo(-r * 0.62, -r * 0.02);
    ctx.quadraticCurveTo(-r * 0.32, r * 0.22, 0, r * 0.06);
    ctx.quadraticCurveTo(r * 0.32, r * 0.22, r * 0.62, -r * 0.02);
    ctx.quadraticCurveTo(r * 0.22, r * 0.02, 0, 0);
    ctx.quadraticCurveTo(-r * 0.22, r * 0.02, -r * 0.62, -r * 0.02);
    ctx.closePath(); ctx.fill();
    // tiny hockey stick
    ctx.strokeStyle = '#5a4030';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r * 0.72, r * 0.55); ctx.lineTo(r * 0.95, -r * 0.15); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(r * 0.95, -r * 0.15); ctx.lineTo(r * 1.18, -r * 0.08); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-r, -r * 1.42, r * 2, 6);
    ctx.fillStyle = hpFrac > 0.4 ? '#2f9e44' : '#c8312a';
    ctx.fillRect(-r, -r * 1.42, r * 2 * Math.max(0, hpFrac), 6);
  }

  // -------------------------------------------------------------------
  // Birds: courier is the reference silhouette; swarm/wrecker share it
  // with distinct plumage (no visor bar, no helmet dome).
  // -------------------------------------------------------------------

  private drawBirdAt(kind: string, x: number, y: number, angle: number, t: number, stretch = 0): void {
    const { ctx } = this;
    const r = BIRD_RADIUS[(kind as keyof typeof BIRD_RADIUS)] ?? 20;
    const swarm = kind === 'swarm';
    const wrecker = kind === 'wrecker';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(1 + stretch * 0.22, 1 - stretch * 0.16);
    const flap = Math.sin(t * 14) * (stretch > 0.04 ? 0.12 : 0.42);

    const body = wrecker ? '#7a5530' : swarm ? '#4a6280' : '#f3f5f8';
    const belly = wrecker ? '#e0c49a' : swarm ? '#d5dde6' : '#ffffff';
    const beak = wrecker ? '#e07018' : swarm ? '#f0b429' : '#ef8a28';
    const wing = wrecker ? '#4a3018' : swarm ? '#2c3d54' : '#d5dae2';

    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.12);
    ctx.lineTo(-r * 1.18, -r * 0.48);
    ctx.lineTo(-r * 0.82, 0);
    ctx.lineTo(-r * 1.14, r * 0.42);
    ctx.lineTo(-r * 0.46, r * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ce2939';
    ctx.beginPath();
    ctx.moveTo(-r * 0.92, -r * 0.08);
    ctx.lineTo(-r * 1.12, 0);
    ctx.lineTo(-r * 0.9, r * 0.1);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.rotate(-0.4 + flap * 0.4);
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.ellipse(-r * 0.08, r * 0.12, r * 0.58, r * 0.26, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,16,12,0.38)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#f5f7fa';
    ctx.fillRect(-r, -r * 0.2, r * 2, r * 0.1);
    ctx.fillStyle = '#ce2939';
    ctx.fillRect(-r, -r * 0.1, r * 2, r * 0.2);
    ctx.fillStyle = '#f5f7fa';
    ctx.fillRect(-r, r * 0.1, r * 2, r * 0.1);
    ctx.restore();

    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(r * 0.06, r * 0.4, r * 0.56, r * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(r * 0.28, -r * 0.22, wrecker ? r * 0.28 : swarm ? r * 0.26 : r * 0.3, wrecker ? r * 0.28 : swarm ? r * 0.28 : r * 0.32, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = swarm ? '#12343a' : '#161616';
    ctx.beginPath();
    ctx.arc(r * 0.34, -r * 0.2, wrecker ? r * 0.12 : swarm ? r * 0.09 : r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    if (swarm) {
      ctx.fillStyle = '#2ec4d4';
      ctx.beginPath();
      ctx.arc(r * 0.37, -r * 0.22, r * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = wrecker ? 3.6 : 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(wrecker ? -r * 0.08 : swarm ? r * 0.0 : r * 0.02, -r * 0.46);
    ctx.lineTo(r * 0.55, -r * 0.28);
    ctx.stroke();
    if (wrecker) {
      ctx.fillStyle = '#3a2414';
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.52);
      ctx.quadraticCurveTo(r * 0.2, -r * 0.62, r * 0.58, -r * 0.3);
      ctx.lineTo(r * 0.4, -r * 0.22);
      ctx.quadraticCurveTo(r * 0.1, -r * 0.42, -r * 0.12, -r * 0.36);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = beak;
    ctx.beginPath();
    if (wrecker) {
      ctx.moveTo(r * 0.48, -r * 0.14);
      ctx.lineTo(r * 1.22, r * 0.08);
      ctx.lineTo(r * 0.46, r * 0.22);
    } else if (swarm) {
      ctx.moveTo(r * 0.5, -r * 0.06);
      ctx.lineTo(r * 0.98, r * 0.04);
      ctx.lineTo(r * 0.5, r * 0.14);
    } else {
      ctx.moveTo(r * 0.52, -r * 0.1);
      ctx.lineTo(r * 1.08, r * 0.05);
      ctx.lineTo(r * 0.48, r * 0.18);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = wrecker ? '#c45a10' : '#d97818';
    ctx.beginPath();
    ctx.moveTo(r * 0.52, r * 0.02);
    ctx.lineTo(wrecker ? r * 1.02 : r * 0.92, r * 0.06);
    ctx.lineTo(r * 0.5, r * 0.16);
    ctx.closePath();
    ctx.fill();

    if (wrecker) {
      ctx.fillStyle = '#8a93a0';
      ctx.beginPath();
      ctx.roundRect(-r * 0.42, -r * 0.72, r * 0.92, r * 0.16, 3);
      ctx.fill();
      ctx.fillStyle = '#ce2939';
      ctx.fillRect(-r * 0.08, -r * 0.7, r * 0.28, 3);
    } else if (swarm) {
      ctx.strokeStyle = '#2c3d54';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.02, -r * 0.86);
      ctx.quadraticCurveTo(r * 0.08, -r * 1.12, r * 0.22, -r * 1.08);
      ctx.stroke();
      ctx.fillStyle = '#ce2939';
      ctx.beginPath();
      ctx.arc(r * 0.22, -r * 1.08, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#2c2c32';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.12, -r * 0.88);
      ctx.lineTo(-r * 0.02, -r * 1.18);
      ctx.stroke();
      ctx.fillStyle = '#ce2939';
      ctx.beginPath();
      ctx.arc(-r * 0.02, -r * 1.2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBirdBody(b: Body, t: number): void {
    if (b.shape.kind !== 'circle') return;
    const kind = (b.meta.kind as string | undefined) ?? 'courier';
    // trail when fast
    const speed = Math.hypot(b.vel.x, b.vel.y);
    if (speed > 200 && !b.sleeping && !b.isStatic) {
      this.ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.moveTo(b.pos.x - b.vel.x * 0.03, b.pos.y - b.vel.y * 0.03);
      this.ctx.lineTo(b.pos.x, b.pos.y);
      this.ctx.stroke();
    }
    this.drawBirdAt(kind, b.pos.x, b.pos.y, b.angle, t);
  }

  // -------------------------------------------------------------------
  // Sling + trajectory
  // -------------------------------------------------------------------

  private drawSlingBand(bird: SlingBird | null, active: boolean): void {
    const { ctx } = this;
    const { x, y } = SLING;
    const prongL = { x: x - 22, y: y - 64 };
    const prongR = { x: x + 22, y: y - 64 };
    const crotch = { x, y: y - 18 };
    const base = { x, y: GROUND_Y - 6 };

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(x + 6, GROUND_Y + 4, 56, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6a5538';
    ctx.beginPath(); ctx.ellipse(x, GROUND_Y + 2, 54, 18, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7d6644';
    ctx.beginPath(); ctx.ellipse(x - 10, GROUND_Y, 30, 11, 0, Math.PI, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#3e2814';
    ctx.lineWidth = 20; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(crotch.x, crotch.y); ctx.stroke();
    ctx.strokeStyle = '#6b4424';
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(base.x - 4, base.y); ctx.lineTo(crotch.x - 4, crotch.y); ctx.stroke();

    if (bird && active) {
      ctx.strokeStyle = '#3a1c12';
      ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(prongL.x, prongL.y); ctx.lineTo(bird.x - 4, bird.y + 4); ctx.stroke();
    }

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 15;
    ctx.beginPath(); ctx.moveTo(crotch.x, crotch.y); ctx.lineTo(prongL.x, prongL.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(crotch.x, crotch.y); ctx.lineTo(prongR.x, prongR.y); ctx.stroke();
    ctx.strokeStyle = '#8a5a34'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(crotch.x - 2, crotch.y); ctx.lineTo(prongL.x - 2, prongL.y); ctx.stroke();

    ctx.strokeStyle = '#3d2414'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(prongL.x - 6, prongL.y + 10); ctx.lineTo(prongL.x + 4, prongL.y + 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(prongR.x - 4, prongR.y + 10); ctx.lineTo(prongR.x + 6, prongR.y + 10); ctx.stroke();

    if (bird && active) {
      ctx.strokeStyle = '#a04430';
      ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(prongR.x, prongR.y); ctx.lineTo(bird.x + 4, bird.y - 2); ctx.stroke();
      ctx.fillStyle = '#5a2e1e';
      ctx.beginPath(); ctx.ellipse(bird.x, bird.y + 10, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = '#a04430';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(prongL.x, prongL.y);
      ctx.quadraticCurveTo(x, y - 36, prongR.x, prongR.y);
      ctx.stroke();
      ctx.fillStyle = '#5a2e1e';
      ctx.beginPath(); ctx.ellipse(x, y - 34, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  private drawTrajectory(pts: { x: number; y: number }[]): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const a = 1 - i / pts.length;
      ctx.globalAlpha = 0.6 * a;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
