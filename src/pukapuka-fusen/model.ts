export const GROW_MS = 2400;
export const FLIGHT_MS = 9500;
export const MAX_BALLOONS = 18;

export interface Flight {
  born: number;
  size: number;
  lane: number;
  // Anchors are viewport fractions so resizing never leaves stale pixel positions.
  origin?: { x: number; y: number; tilt: number };
  kick?: { at: number; x: number; y: number; vx: number; vy: number };
}

export function growth(elapsed: number): number {
  return Math.min(1, Math.max(0, elapsed / GROW_MS));
}

function dampedTravel(seconds: number) {
  return -Math.expm1(-3 * seconds) / 3;
}

const flightSeconds = FLIGHT_MS / 1000;
const liftDuration = flightSeconds - dampedTravel(flightSeconds);

export function flightPosition(
  flight: Flight,
  now: number,
  width: number,
  height: number,
  reduced: boolean,
) {
  const elapsed = Math.max(0, (now - flight.born) / 1000);
  const progress = elapsed / flightSeconds;
  let x = (flight.origin?.x ?? 0.5) * width;
  let y = (flight.origin?.y ?? 1) * height;
  if (reduced) {
    if (!flight.origin) {
      x += flight.lane * width * 0.3;
      y = height * 0.48;
    }
  } else {
    // Buoyancy builds from rest before settling into a steady rise.
    const lift = (elapsed - dampedTravel(elapsed)) / liftDuration;
    if (!flight.origin) x += flight.lane * width * 0.32 * Math.min(1, lift * 3);
    y -= lift * (height + flight.size * 1.6);
  }
  if (flight.kick && !reduced) {
    const k = flight.kick;
    const seconds = Math.max(0, (now - k.at) / 1000);
    const travel = dampedTravel(seconds);
    x = k.x * width + k.vx * travel;
    y = k.y * height - riseSpeed(flight, height) * seconds + k.vy * travel;
    x = Math.max(flight.size / 2, Math.min(width - flight.size / 2, x));
    y = Math.min(height, y);
  }
  const initialTilt = flight.origin?.tilt ?? 0;
  const sway = Math.sin(progress * 9 + flight.lane) * 7;
  return {
    x,
    y,
    tilt: reduced
      ? initialTilt
      : initialTilt + (sway - initialTilt) * Math.min(1, progress * 5) ** 2,
    // Each accepted touch buys another quiet flight; abandoned balloons still expire.
    done:
      now - (reduced ? flight.born : (flight.kick?.at ?? flight.born)) >=
      FLIGHT_MS,
  };
}

function riseSpeed(flight: Flight, height: number) {
  return (height + flight.size * 1.6) / flightSeconds;
}

export function tapImpulse(x: number, y: number, random = Math.random) {
  // Halfway from the center to an edge is enough for a full push.
  const dx = Math.max(-1, Math.min(1, x * 2));
  const dy = Math.max(-1, Math.min(1, y * 2));
  const mix = Math.max(0, 1 - Math.hypot(x, y) / 0.4) * 0.85;
  if (!mix) return { dx, dy };
  const angle = random() * Math.PI * 2;
  return {
    dx: dx * (1 - mix) + Math.cos(angle) * mix,
    dy: dy * (1 - mix) + Math.sin(angle) * mix,
  };
}

export function kickFlight(
  flight: Flight,
  now: number,
  directionX: number,
  directionY: number,
  reduced: boolean,
  width: number,
  height: number,
) {
  if (flight.kick && now - flight.kick.at < 120) return;
  const position = flightPosition(flight, now, width, height, reduced);
  flight.kick = {
    at: now,
    x: position.x / width,
    y: position.y / height,
    vx: reduced ? 0 : directionX * 150,
    // A strong downward kick can overcome the natural rise.
    vy: reduced ? 0 : directionY * (riseSpeed(flight, height) + 150),
  };
}
