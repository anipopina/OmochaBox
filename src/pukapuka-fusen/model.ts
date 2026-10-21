export const GROW_MS = 2400;
export const FLIGHT_MS = 9500;
export const MAX_BALLOONS = 18;

export interface Flight {
  born: number;
  size: number;
  lane: number;
}

export function growth(elapsed: number): number {
  return Math.min(1, Math.max(0, elapsed / GROW_MS));
}

export function flightPosition(
  flight: Flight,
  now: number,
  width: number,
  height: number,
  reduced: boolean,
) {
  const progress = Math.min(1, Math.max(0, (now - flight.born) / FLIGHT_MS));
  return {
    x: width / 2 + flight.lane * width * 0.32 * Math.min(1, progress * 3),
    y: height - progress * (height + flight.size * 1.6),
    tilt: reduced ? 0 : Math.sin(progress * 9 + flight.lane) * 7,
    done: progress >= 1,
  };
}
