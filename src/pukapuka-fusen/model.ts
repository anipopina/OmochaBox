export const GROW_MS = 2400;
export const FLIGHT_MS = 9500;
export const MAX_BALLOONS = 18;

export interface Flight {
  born: number;
  size: number;
  lane: number;
  // Anchors are viewport fractions so resizing never leaves stale pixel positions.
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
  const progress = Math.max(0, (now - flight.born) / FLIGHT_MS);
  let x = width / 2 + flight.lane * width * 0.32 * Math.min(1, progress * 3);
  let y = height - progress * (height + flight.size * 1.6);
  if (flight.kick && !reduced) {
    const k = flight.kick;
    const seconds = Math.max(0, (now - k.at) / 1000);
    const travel = (1 - Math.exp(-3 * seconds)) / 3;
    x = k.x * width + k.vx * travel;
    y = k.y * height - riseSpeed(flight, height) * seconds + k.vy * travel;
    x = Math.max(flight.size / 2, Math.min(width - flight.size / 2, x));
    y = Math.min(height, y);
  }
  return {
    x,
    y,
    tilt: reduced ? 0 : Math.sin(progress * 9 + flight.lane) * 7,
    // Each accepted touch buys another quiet flight; abandoned balloons still expire.
    done:
      now - (reduced ? flight.born : (flight.kick?.at ?? flight.born)) >=
      FLIGHT_MS,
  };
}

function riseSpeed(flight: Flight, height: number) {
  return (height + flight.size * 1.6) / (FLIGHT_MS / 1000);
}

export function kickFlight(
  flight: Flight,
  now: number,
  directionX: number,
  directionY: number,
  reduced: boolean,
  width: number,
  height: number,
  random = Math.random(),
) {
  if (flight.kick && now - flight.kick.at < 120) return;
  const position = flightPosition(flight, now, width, height, reduced);
  const strength = 0.9 + Math.max(0, Math.min(1, random)) * 0.2;
  flight.kick = {
    at: now,
    x: position.x / width,
    y: position.y / height,
    vx: reduced ? 0 : Math.sign(directionX) * 150 * strength,
    // Compensate for buoyancy so an upper tap actually nudges down at every size.
    vy: reduced
      ? 0
      : Math.sign(directionY) * (riseSpeed(flight, height) + 150) * strength,
  };
}
