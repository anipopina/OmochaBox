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
    this.distance.fill(Infinity);
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
  // Distance to the whole swept path, not a list of overlapping round stamps.
  // Keeping the minimum makes the surface independent of event frequency.
  private readonly distance = new Float32Array(SIZE * SIZE).fill(Infinity);
  aspect = 1;
  press(u: number, v: number) {
    if (!Number.isFinite(u) || !Number.isFinite(v) || !this.contains(u, v))
      return false;
    return this.stroke(u, v, u, v);
  }
  stroke(ax: number, ay: number, bx: number, by: number) {
    if (![ax, ay, bx, by].every(Number.isFinite)) return false;
    const aspect = clamp(this.aspect, 0.5, 3);
    // Clip work bounds, never the actual segment: entering/leaving the mound
    // must not invent a line along its edge.
    const reach = RADIUS * 3.5;
    const pixel = (v: number) => ((v + 1) * (SIZE - 1)) / 2;
    const left = Math.max(1, Math.floor(pixel(Math.min(ax, bx) - reach)));
    const right = Math.min(
      SIZE - 2,
      Math.ceil(pixel(Math.max(ax, bx) + reach)),
    );
    const top = Math.max(
      1,
      Math.floor(pixel(Math.min(ay, by) - reach / aspect)),
    );
    const bottom = Math.min(
      SIZE - 2,
      Math.ceil(pixel(Math.max(ay, by) + reach / aspect)),
    );
    const dx = bx - ax,
      dy = (by - ay) * aspect;
    const length2 = dx * dx + dy * dy;
    let changed = false;
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        const i = y * SIZE + x;
        if (this.base[i] < 0.025) continue;
        const px = (x / (SIZE - 1)) * 2 - 1 - ax;
        const py = ((y / (SIZE - 1)) * 2 - 1 - ay) * aspect;
        const t = length2 ? clamp((px * dx + py * dy) / length2, 0, 1) : 0;
        const d2 = ((px - t * dx) ** 2 + (py - t * dy) ** 2) / RADIUS ** 2;
        if (d2 >= 12.25 || d2 >= this.distance[i]) continue;
        this.distance[i] = d2;
        // A single smooth bowl-to-rim profile for the union of the entire path.
        // Overlaps no longer accumulate a new ridge at every input sample.
        const relief = -0.155 * (1 - d2) * Math.exp(-0.75 * d2);
        this.height[i] = clamp(
          this.base[i] + relief * Math.min(1, this.base[i] / 0.16),
          0.035,
          0.34,
        );
        changed = true;
      }
    return changed;
  }
}
