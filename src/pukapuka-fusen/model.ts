export const GROW_MS = 2400;
export const FLIGHT_MS = 9500;
export const MAX_BALLOONS = 18;

export interface Flight {
  born: number;
  size: number;
  lane: number;
  kick?: { at: number; x: number; y: number; vx: number; vy: number };
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
  const offset = kickOffset(flight, now);
  const baseX =
    width / 2 + flight.lane * width * 0.32 * Math.min(1, progress * 3);
  return {
    x:
      flight.kick && !reduced
        ? Math.max(
            flight.size / 2,
            Math.min(width - flight.size / 2, baseX + offset.x),
          )
        : width / 2 + flight.lane * width * 0.32 * Math.min(1, progress * 3),
    y:
      height -
      progress * (height + flight.size * 1.6) +
      (reduced ? 0 : offset.y),
    tilt: reduced ? 0 : Math.sin(progress * 9 + flight.lane) * 7,
    done: progress >= 1,
  };
}

function kickOffset(flight: Flight, now: number) {
  if (!flight.kick) return { x: 0, y: 0 };
  const k = flight.kick;
  const travel = (1 - Math.exp(-3 * Math.max(0, (now - k.at) / 1000))) / 3;
  return {
    x: Math.max(-120, Math.min(120, k.x + k.vx * travel)),
    y: Math.max(-80, Math.min(80, k.y + k.vy * travel)),
  };
}
export function kickFlight(
  flight: Flight,
  now: number,
  direction: number,
  reduced: boolean,
) {
  if (flight.kick && now - flight.kick.at < 120) return;
  const offset = kickOffset(flight, now);
  flight.kick = {
    at: now,
    x: offset.x,
    y: offset.y,
    vx: reduced ? 0 : direction < 0 ? -150 : 150,
    vy: reduced ? 0 : -105,
  };
}
