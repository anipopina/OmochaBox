// Coordinates and distances are CSS pixels; the renderer owns device scaling.
export const MAX_RIPPLES = 32;
export const RIPPLE_LIFE = 2200;
export interface Ripple {
  x: number;
  y: number;
  born: number;
}
export interface Leaf {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  tilt: number;
  spin: number;
  size: number;
  art: number;
}
export class Pond {
  width = 1;
  height = 1;
  ripples: Ripple[] = [];
  leaves: Leaf[] = [];
  reduced = false;
  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.ripples = [];
    const size = Math.min(112, Math.max(84, Math.min(width, height) * 0.25));
    this.leaves = [
      [0.22, 0.24, -0.45],
      [0.79, 0.35, 0.6],
      [0.39, 0.74, 0.25],
    ].map(([nx, ny, angle], art) => ({
      homeX: nx * this.width,
      homeY: ny * this.height,
      x: nx * this.width,
      y: ny * this.height,
      vx: 0,
      vy: 0,
      angle,
      tilt: 0,
      spin: 0,
      size: art === 1 ? size * 0.82 : size,
      art: art % 2,
    }));
  }
  splash(x: number, y: number, now: number) {
    if (!Number.isFinite(x + y + now)) return;
    x = Math.max(0, Math.min(this.width, x));
    y = Math.max(0, Math.min(this.height, y));
    this.ripples.push({ x, y, born: now });
    if (this.ripples.length > MAX_RIPPLES) this.ripples.shift();
    if (this.reduced) return;
    for (const leaf of this.leaves) {
      const dx = leaf.x - x;
      const dy = leaf.y - y;
      const distance = Math.hypot(dx, dy);
      const reach = 170;
      if (distance >= reach) continue;
      const strength = (1 - distance / reach) * 45;
      leaf.vx = Math.max(
        -60,
        Math.min(60, leaf.vx + (dx / (distance || 1)) * strength),
      );
      leaf.vy = Math.max(
        -60,
        Math.min(60, leaf.vy + (dy / (distance || 1)) * strength),
      );
      leaf.spin = Math.max(
        -0.8,
        Math.min(0.8, leaf.spin + (dx >= 0 ? 1 : -1) * 0.45),
      );
    }
  }
  step(now: number, seconds: number) {
    this.ripples = this.ripples.filter(
      (ripple) => now - ripple.born < (this.reduced ? 500 : RIPPLE_LIFE),
    );
    const dt = Math.max(0, Math.min(seconds, 0.035));
    let moving = false;
    for (const leaf of this.leaves) {
      if (this.reduced) continue;
      leaf.vx += (leaf.homeX - leaf.x) * 8 * dt;
      leaf.vy += (leaf.homeY - leaf.y) * 8 * dt;
      leaf.spin += -leaf.tilt * 8 * dt;
      const damping = Math.exp(-4.5 * dt);
      leaf.vx *= damping;
      leaf.vy *= damping;
      leaf.spin *= damping;
      leaf.x += leaf.vx * dt;
      leaf.y += leaf.vy * dt;
      leaf.tilt += leaf.spin * dt;
      const energy =
        Math.abs(leaf.x - leaf.homeX) +
        Math.abs(leaf.y - leaf.homeY) +
        Math.abs(leaf.vx) +
        Math.abs(leaf.vy) +
        Math.abs(leaf.tilt) * 20 +
        Math.abs(leaf.spin) * 20;
      if (energy < 0.1) {
        leaf.x = leaf.homeX;
        leaf.y = leaf.homeY;
        leaf.vx = leaf.vy = leaf.tilt = leaf.spin = 0;
      } else moving = true;
    }
    return this.ripples.length > 0 || moving;
  }
  clear() {
    this.ripples = [];
    for (const leaf of this.leaves) {
      leaf.x = leaf.homeX;
      leaf.y = leaf.homeY;
      leaf.vx = leaf.vy = leaf.tilt = leaf.spin = 0;
    }
  }
}
