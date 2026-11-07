export const columns = 20;
export const rows = 14;
export type Phase = 'digging' | 'ready' | 'harvesting';
export class Digging {
  cleared = new Set<number>();
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
            )
              this.cleared.add((row + dy) * columns + col + dx);
          }
      }
  }
  dig(x: number, y: number, assist = false) {
    if (this.phase !== 'digging') return false;
    const before = this.cleared.size;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        if (
          Math.hypot(
            (col + 0.5) / columns - x,
            ((row + 0.5) / rows - y) * 0.8,
          ) < 0.23
        )
          this.cleared.add(row * columns + col);
      }
    }
    if (assist && this.cleared.size === before) {
      // Only a completed stationary tap gets a small, nearest-soil helping hand.
      const nearby = Array.from({ length: columns * rows }, (_, index) => index)
        .filter((index) => !this.cleared.has(index))
        .sort((a, b) => {
          const distance = (index: number) =>
            Math.hypot(
              ((index % columns) + 0.5) / columns - x,
              ((Math.floor(index / columns) + 0.5) / rows - y) * 0.8,
            );
          return distance(a) - distance(b);
        });
      for (const index of nearby.slice(0, 8)) this.cleared.add(index);
    }
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
    this.phase = 'digging';
  }
}

export function potatoLayout(width: number, height: number, round: number) {
  const cluster = round % 3 === 2;
  const variants = cluster
    ? [
        { center: 0.34, angle: -15, aspect: 800 / 513 },
        { center: 0.66, angle: 20, aspect: 800 / 513 },
      ]
    : [
        {
          center: 0.5,
          angle: round % 3 === 1 ? -8 : 0,
          aspect: round % 3 === 1 ? 2.05 : 800 / 513,
        },
      ];
  return variants.map(({ center, angle, aspect }) => {
    const radians = (Math.abs(angle) * Math.PI) / 180;
    const maxWidth = width * (cluster ? 0.34 : 0.72);
    const maxHeight = height * (cluster ? 0.6 : 0.64);
    const h = Math.min(
      maxWidth / (aspect * Math.cos(radians) + Math.sin(radians)),
      maxHeight / (aspect * Math.sin(radians) + Math.cos(radians)),
    );
    const w = h * aspect;
    return {
      width: w,
      height: h,
      left: width * center - w / 2,
      top: height / 2 - h / 2,
      angle,
    };
  });
}
