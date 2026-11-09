export const SIZE = 192;
export const RADIUS = 0.16;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export class Clay {
  readonly base = new Float32Array(SIZE * SIZE);
  readonly height = new Float32Array(SIZE * SIZE);
  constructor() {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const u = (x / (SIZE - 1)) * 2 - 1;
        const v = (y / (SIZE - 1)) * 2 - 1;
        const angle = Math.atan2(v, u);
        const radius =
          0.82 + 0.028 * Math.sin(angle * 3) + 0.018 * Math.cos(angle * 5);
        const edge = clamp((radius - Math.hypot(u, v)) / 0.115, 0, 1);
        this.base[y * SIZE + x] =
          edge *
          edge *
          (3 - 2 * edge) *
          (0.22 + 0.025 * (1 - Math.hypot(u, v)));
      }
    }
    this.reset();
  }
  reset() {
    this.height.set(this.base);
  }
  contains(u: number, v: number) {
    const x = Math.round(((u + 1) * (SIZE - 1)) / 2);
    const y = Math.round(((v + 1) * (SIZE - 1)) / 2);
    return (
      x >= 0 &&
      y >= 0 &&
      x < SIZE &&
      y < SIZE &&
      this.base[y * SIZE + x] > 0.035
    );
  }
  press(u: number, v: number) {
    if (!Number.isFinite(u) || !Number.isFinite(v) || !this.contains(u, v))
      return false;
    const cx = ((u + 1) * (SIZE - 1)) / 2;
    const cy = ((v + 1) * (SIZE - 1)) / 2;
    const r = (RADIUS * (SIZE - 1)) / 2;
    const bounds = [
      Math.max(1, Math.floor(cx - r * 1.85)),
      Math.min(SIZE - 2, Math.ceil(cx + r * 1.85)),
      Math.max(1, Math.floor(cy - r * 1.85)),
      Math.min(SIZE - 2, Math.ceil(cy + r * 1.85)),
    ];
    let removed = 0,
      capacity = 0;
    for (let y = bounds[2]; y <= bounds[3]; y++)
      for (let x = bounds[0]; x <= bounds[1]; x++) {
        const i = y * SIZE + x;
        if (this.base[i] < 0.025) continue;
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d < 1) {
          const bowl = (1 - d * d) ** 2;
          const target = Math.max(0.035, this.base[i] - 0.155 * bowl);
          const change = Math.max(0, this.height[i] - target) * bowl;
          this.height[i] -= change;
          removed += change;
        } else if (d < 1.85) {
          capacity +=
            Math.sin(((d - 1) / 0.85) * Math.PI) ** 2 *
            Math.max(0, 0.34 - this.height[i]);
        }
      }
    if (capacity > 0)
      for (let y = bounds[2]; y <= bounds[3]; y++)
        for (let x = bounds[0]; x <= bounds[1]; x++) {
          const i = y * SIZE + x;
          if (this.base[i] < 0.025) continue;
          const d = Math.hypot(x - cx, y - cy) / r;
          if (d >= 1 && d < 1.85)
            this.height[i] +=
              Math.min(1, removed / capacity) *
              Math.sin(((d - 1) / 0.85) * Math.PI) ** 2 *
              Math.max(0, 0.34 - this.height[i]);
        }
    return removed > 0;
  }
  stroke(ax: number, ay: number, bx: number, by: number) {
    const distance = Math.hypot(bx - ax, by - ay);
    if (!Number.isFinite(distance)) return;
    const steps = Math.min(
      80,
      Math.max(1, Math.ceil(distance / (RADIUS * 0.26))),
    );
    for (let n = 1; n <= steps; n++)
      this.press(ax + ((bx - ax) * n) / steps, ay + ((by - ay) * n) / steps);
  }
}
