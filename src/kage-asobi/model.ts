export interface Light {
  x: number;
  y: number;
}
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

export function layout(width: number, height: number, light: Light) {
  const foot = { x: width / 2, y: height * 0.61 };
  const size = Math.min(width * 0.39, height * 0.25, 210);
  const minY = height * 0.7;
  const maxY = Math.max(minY, height - 88);
  const x = clamp(light.x, 0, 1) * Math.max(0, width - 112) + 56;
  const y = minY + clamp(light.y, 0, 1) * (maxY - minY);
  const angle = Math.atan2(foot.x - x, y - foot.y);
  const dx = Math.sin(angle),
    dy = -Math.cos(angle);
  // Keep the entire shadow below the home controls and inside the playfield.
  const horizontal =
    Math.abs(dx) > 0.01
      ? (width / 2 - size * 0.35 - 12) / Math.abs(dx)
      : Infinity;
  const vertical = (foot.y - 92) / -dy;
  const longest = Math.min(size * 2.4, horizontal, vertical);
  const length = longest * (1 - clamp(light.y, 0, 1) * 0.45);
  return {
    foot,
    size,
    x,
    y,
    angle: (angle * 180) / Math.PI,
    length,
    minY,
    maxY,
  };
}

export function lightAt(
  width: number,
  height: number,
  x: number,
  y: number,
): Light {
  const bounds = layout(width, height, { x: 0.5, y: 0.5 });
  return {
    x: clamp((x - 56) / Math.max(1, width - 112), 0, 1),
    y: clamp((y - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY), 0, 1),
  };
}
