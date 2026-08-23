// Lightweight particle system: debris, dust puffs, confetti, smoke, sparks.

export type ParticleKind = 'debris' | 'dust' | 'confetti' | 'smoke' | 'spark' | 'ring';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string;
  kind: ParticleKind; rot: number; vrot: number; gravity: number;
}

export class Particles {
  private list: Particle[] = [];

  get count(): number { return this.list.length; }

  burst(x: number, y: number, opts: {
    kind?: ParticleKind; count?: number; color?: string | string[];
    speed?: number; life?: number; size?: number; spread?: number; up?: number; gravity?: number;
  }): void {
    const {
      kind = 'debris', count = 10, color = '#ccc', speed = 120,
      life = 0.7, size = 4, spread = Math.PI * 2, up = 0, gravity = 600,
    } = opts;
    const colors = Array.isArray(color) ? color : [color];
    for (let i = 0; i < count; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.list.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - up,
        life: life * (0.6 + Math.random() * 0.6),
        maxLife: life,
        size: size * (0.6 + Math.random() * 0.8),
        color: colors[i % colors.length],
        kind, rot: Math.random() * Math.PI * 2, vrot: (Math.random() - 0.5) * 10, gravity,
      });
    }
  }

  ring(x: number, y: number, color: string, size = 10): void {
    this.list.push({ x, y, vx: 0, vy: 0, life: 0.4, maxLife: 0.4, size, color, kind: 'ring', rot: 0, vrot: 0, gravity: 0 });
  }

  update(dt: number): void {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) { l.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      if (p.kind === 'smoke') { p.size += 20 * dt; p.vy -= 30 * dt; }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.4);
      switch (p.kind) {
        case 'debris':
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
          break;
        case 'confetti':
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
          break;
        case 'dust':
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + (1 - t)), 0, Math.PI * 2); ctx.fill();
          break;
        case 'smoke':
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
          break;
        case 'spark':
          ctx.strokeStyle = p.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); ctx.stroke();
          break;
        case 'ring': {
          const r = p.size + (1 - t) * 60;
          ctx.strokeStyle = p.color; ctx.lineWidth = 3 * t;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  clear(): void { this.list.length = 0; }
}
