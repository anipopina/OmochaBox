export interface Point {
  x: number;
  y: number;
}
export const GAP = 165;
export const FALL = 290;
export function layout(
  width: number,
  height: number,
  variation: number,
): Point[] {
  const portrait = height > width;
  const count = portrait ? 18 : 24;
  const rx = Math.max(65, width * (portrait ? 0.31 : 0.37));
  const ry = Math.max(40, (height - 160) * 0.35);
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
    const ripple = variation % 2 ? 1 + 0.1 * Math.sin(angle * 3) : 1;
    return {
      x: width / 2 + Math.cos(angle) * rx * ripple,
      y: height / 2 + 55 + Math.sin(angle) * ry * ripple,
    };
  });
}
export function nearest(points: Point[], x: number, y: number): number {
  let best = 0;
  points.forEach((p, i) => {
    if (
      Math.hypot(p.x - x, p.y - y) <
      Math.hypot(points[best]!.x - x, points[best]!.y - y)
    )
      best = i;
  });
  return best;
}
export function progress(
  index: number,
  start: number,
  count: number,
  elapsed: number,
): number {
  return Math.min(
    1,
    Math.max(0, (elapsed - ((index - start + count) % count) * GAP) / FALL),
  );
}
