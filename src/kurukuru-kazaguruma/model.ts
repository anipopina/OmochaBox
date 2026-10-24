export const MAX_SPEED = 180;
export const STOP_SPEED = 3;
export const DRAG = 1.25;
export const clampSpeed = (speed: number) =>
  Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed));
export function advance(angle: number, speed: number, seconds: number) {
  const dt = Math.max(0, Math.min(seconds, 0.05));
  const nextSpeed = speed * Math.exp(-DRAG * dt);
  return {
    angle: (((angle + (speed - nextSpeed) / DRAG) % 360) + 360) % 360,
    speed: Math.abs(nextSpeed) < STOP_SPEED ? 0 : nextSpeed,
  };
}
// Tangential movement drives rotation; near the axle, a horizontal swipe is
// still discoverable. Distances are normalized so phones and tablets agree.
export function swipeSpeed(
  x: number,
  y: number,
  dx: number,
  dy: number,
  radius: number,
) {
  const cross = x * dy - y * dx;
  const tangent =
    Math.hypot(x, y) < radius * 0.18
      ? dx
      : cross / Math.max(radius * 0.18, Math.hypot(x, y));
  return clampSpeed((tangent / Math.max(1, radius)) * 1100);
}
