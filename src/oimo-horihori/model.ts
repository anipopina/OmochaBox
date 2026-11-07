export const columns = 160;
export const rows = 160;
export type Phase = 'digging' | 'ready' | 'harvesting';
export class Digging {
  cleared = new Set<number>();
  readyRim = new Set<number>();
  phase: Phase = 'digging';
  round = 0;
  private targets = [
    new Map(Array.from({ length: columns * rows }, (_, i) => [i, 1])),
  ];
  setTargets(targets: Map<number, number>[]) {
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
          if (this.cleared.has(index)) visible += weight;
        }
        return total > 0 && visible / total >= 0.93;
      });
    if (!exposed) return;
    this.phase = 'ready';
    // Uncover the last small rim around each potato, including the ready pulse.
    // Unrelated outer soil stays in place.
    for (const target of this.targets)
      for (const index of target.keys()) {
        const col = index % columns,
          row = Math.floor(index / columns);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (
              col + dx >= 0 &&
              col + dx < columns &&
              row + dy >= 0 &&
              row + dy < rows
            ) {
              const cell = (row + dy) * columns + col + dx;
              if (!this.cleared.has(cell)) this.readyRim.add(cell);
              this.cleared.add(cell);
            }
          }
      }
  }
  holes: Circle[] = [];
  dig(x: number, y: number, width = 740, height = 439) {
    if (this.phase !== 'digging') return false;
    const circles = brush(x, y, width, height);
    const before = this.cleared.size;
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < columns; col++) {
        const cx = (col + 0.5) / columns,
          cy = (row + 0.5) / rows;
        if (
          circles.some(
            (c) => ((cx - c.x) / c.rx) ** 2 + ((cy - c.y) / c.ry) ** 2 <= 1,
          )
        )
          this.cleared.add(row * columns + col);
      }
    if (this.cleared.size === before) return false;
    this.holes.push(...circles);
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
    this.readyRim.clear();
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
): Circle[] {
  const old = oldField(width, height);
  const radius = Math.sqrt(old.width * old.height * 0.0275);
  // A fixed, asymmetric stamp: repeating a tap cannot grow the hole.
  const lobes = [
    [0, 0, 1],
    [0.82, 0.32, 0.43],
    [-0.74, 0.58, 0.48],
    [0.31, -0.83, 0.38],
    [-0.7, -0.65, 0.33],
    [0.15, 0.87, 0.29],
  ];
  return lobes.map(([dx, dy, r]) => ({
    x: x + (dx! * radius) / width,
    y: y + (dy! * radius) / height,
    rx: (r! * radius) / width,
    ry: (r! * radius) / height,
  }));
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
