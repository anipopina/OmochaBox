export function paperScale(width: number, height: number): number {
  return (
    1 + 0.6 * Math.max(0, Math.min(1, (Math.min(width, height) - 400) / 600))
  );
}

/** Null means a quick tap, which keeps the usual random size. */
export function heldSize(milliseconds: number): number | null {
  if (milliseconds < 1000) return null;
  return 128 * (1 + 7 * Math.min(1, (milliseconds - 1000) / 9000));
}
