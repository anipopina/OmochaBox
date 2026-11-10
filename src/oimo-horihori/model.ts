export const columns = 160;
export const rows = 160;
export type Phase = 'digging' | 'ready' | 'harvesting';
export class Digging {
  cleared = new Set<number>();
  readonly exposure = new Float32Array(columns * rows);
  readyRim: Circle[] = [];
  private width = 740;
  private height = 439;
  phase: Phase = 'digging';
  round = 0;
  private targets = [
    new Map(Array.from({ length: columns * rows }, (_, i) => [i, 1])),
  ];
  setTargets(targets: Map<number, number>[], width = 740, height = 439) {
    this.width = width;
    this.height = height;
    this.targets = targets;
    this.checkExposure();
  }
  private checkExposure() {
    if (this.phase === 'harvesting' || !this.targets.length) return;
    const exposed =
      this.phase === 'ready' ||
      this.targets.every((target) => {
        let total = 0,
          visible = 0;
        for (const [index, weight] of target) {
          total += weight;
          visible += weight * this.exposure[index]!;
        }
        return total > 0 && visible / total >= 0.93;
      });
    if (!exposed) return;
    this.phase = 'ready';
    // Rebuild after rotation so the cells describe the current curved mask.
    this.cleared.clear();
    this.exposure.fill(0);
    this.clearCircles(this.holes, true);
    // Dilate the potato silhouette with overlapping, gently varying round cuts.
    // Drawing and cell clearing use these same curves, never cell rectangles.
    this.readyRim = rimCircles(this.targets, this.width, this.height);
    this.clearCircles(this.readyRim);
  }
  private clearCircles(circles: Circle[], soft = false) {
    let changed = false;
    for (const c of circles) {
      const left = Math.max(0, Math.floor((c.x - c.rx) * columns));
      const right = Math.min(columns - 1, Math.ceil((c.x + c.rx) * columns));
      const top = Math.max(0, Math.floor((c.y - c.ry) * rows));
      const bottom = Math.min(rows - 1, Math.ceil((c.y + c.ry) * rows));
      for (let row = top; row <= bottom; row++)
        for (let col = left; col <= right; col++) {
          const distance = Math.hypot(
            ((col + 0.5) / columns - c.x) / c.rx,
            ((row + 0.5) / rows - c.y) / c.ry,
          );
          const strength = soft
            ? brushExposure(distance)
            : Number(distance <= 1);
          const index = row * columns + col;
          // Maximum exposure keeps repeated input from thinning the same stamp.
          const next = Math.fround(Math.max(this.exposure[index]!, strength));
          if (next === this.exposure[index]) continue;
          this.exposure[index] = next;
          if (next >= 0.99) this.cleared.add(index);
          changed = true;
        }
    }
    return changed;
  }
  holes: Circle[] = [];
  dig(x: number, y: number, width = 740, height = 439) {
    if (this.phase !== 'digging') return false;
    const circle = brush(x, y, width, height);
    this.width = width;
    this.height = height;
    if (!this.clearCircles([circle], true)) return false;
    this.holes.push(circle);
    this.checkExposure();
    return true;
  }
  harvest() {
    if (this.phase !== 'ready') return false;
    this.phase = 'harvesting';
    return true;
  }
  next() {
    if (this.phase !== 'harvesting') return;
    this.round++;
    this.cleared.clear();
    this.exposure.fill(0);
    this.readyRim = [];
    this.holes = [];
    this.phase = 'digging';
  }
}

export type Circle = { x: number; y: number; rx: number; ry: number };
export type Rect = { left: number; top: number; width: number; height: number };
export function oldField(width: number, height: number) {
  return {
    width: Math.min(
      width * (height <= 480 ? 0.68 : 0.88),
      height <= 480 ? 620 : 740,
    ),
    height: Math.min(
      height * (height <= 480 ? 0.61 : 0.58),
      height <= 480 ? Infinity : 510,
    ),
  };
}
export function brush(
  x: number,
  y: number,
  width: number,
  height: number,
): Circle {
  const old = oldField(width, height);
  const radius = Math.sqrt(old.width * old.height * 0.0275);
  return { x, y, rx: radius / width, ry: radius / height };
}
export function brushExposure(distance: number) {
  const edge = Math.max(0, Math.min(1, (distance - 0.6) / 0.4));
  return 1 - edge * edge * (3 - 2 * edge);
}

function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function basketSize(width: number, height: number) {
  return Math.max(104, Math.min(190, width * 0.28, height * 0.27));
}
export function potatoLayout(
  width: number,
  height: number,
  round: number,
  seed = 1,
  blocked?: Rect[],
) {
  const old = oldField(width, height),
    aspect = round % 2 === 1 ? 2.05 : 800 / 513;
  const oldAngle = round % 2 === 1 ? (8 * Math.PI) / 180 : 0;
  const h = Math.min(
    (old.width * 0.72) / (aspect * Math.cos(oldAngle) + Math.sin(oldAngle)),
    (old.height * 0.64) / (aspect * Math.sin(oldAngle) + Math.cos(oldAngle)),
  );
  const w = h * aspect,
    size = basketSize(width, height);
  const obstacles = blocked ?? [
    { left: 8, top: 8, width: 72, height: 72 },
    {
      left: width - size - 12,
      top: height - size - 12,
      width: size,
      height: size,
    },
  ];
  const rng = random(seed + round * 7919);
  for (let attempt = 0; attempt < 1500; attempt++) {
    const angle = (rng() - 0.5) * 140;
    const a = (angle * Math.PI) / 180;
    const bw = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) * 1.04;
    const bh = (Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))) * 1.04;
    if (bw > width - 24 || bh > height - 24) continue;
    const cx = 12 + bw / 2 + rng() * (width - bw - 24),
      cy = 12 + bh / 2 + rng() * (height - bh - 24);
    const hit = obstacles.some(
      (r) =>
        cx + bw / 2 > r.left - 12 &&
        cx - bw / 2 < r.left + r.width + 12 &&
        cy + bh / 2 > r.top - 12 &&
        cy - bh / 2 < r.top + r.height + 12,
    );
    if (!hit)
      return [
        { width: w, height: h, left: cx - w / 2, top: cy - h / 2, angle },
      ];
  }
  // Tiny unsupported windows still retain a reachable potato above the basket.
  const scale = Math.min(1, (width - 32) / w, (height - size - 112) / h);
  const fit = Math.max(0.15, scale);
  return [
    {
      width: w * fit,
      height: h * fit,
      left: (width - w * fit) / 2,
      top: 90,
      angle: 0,
    },
  ];
}
export function basketPotato(index: number) {
  const rng = random(index * 439 + 127);
  const angle = (index * 137.508 * Math.PI) / 180,
    radius = Math.sqrt((index % 10) / 10) * 23;
  return {
    x: 50 + Math.cos(angle) * radius,
    y: 50 + Math.sin(angle) * radius,
    angle: rng() * 160 - 80,
    size: 42 + rng() * 15,
  };
}

export function rimCircles(
  targets: Map<number, number>[],
  width: number,
  height: number,
): Circle[] {
  const centers = new Map<number, Circle>();
  const radius = Math.max(12, Math.min(24, Math.min(width, height) * 0.028));
  for (const target of targets)
    for (const index of target.keys()) {
      const col = Math.floor((index % columns) / 2) * 2 + 1;
      const row = Math.floor(Math.floor(index / columns) / 2) * 2 + 1;
      const key = row * columns + col;
      if (centers.has(key)) continue;
      const r = radius * (1 + 0.12 * Math.sin(col * 0.19 + row * 0.13));
      centers.set(key, {
        x: col / columns,
        y: row / rows,
        rx: r / width,
        ry: r / height,
      });
    }
  return [...centers.values()];
}
