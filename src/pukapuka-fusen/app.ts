import '../shared/home-button';
import '../shared/play-media';
import { requireElement } from '../shared/dom';
import cyan from './assets/cyan.svg';
import purple from './assets/purple.svg';
import triangle from './assets/triangle.svg';
import star from './assets/star.svg';
import square from './assets/square.svg';
import rectangle from './assets/rectangle.svg';
import {
  FLIGHT_MS,
  MAX_BALLOONS,
  growth,
  flightPosition,
  kickFlight,
  tapImpulse,
} from './model';
import type { Flight } from './model';
import { Sounds } from './sound';

const pump = requireElement('#pump', HTMLButtonElement);
const sky = requireElement('#sky', HTMLDivElement);
const held = requireElement('#held', HTMLImageElement);
const status = requireElement('#status', HTMLParagraphElement);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const sounds = new Sounds();
const artwork = [cyan, star, triangle, purple, square, rectangle];
type Balloon = Flight & { element: HTMLImageElement };
const flights: Balloon[] = [];
let next = 0;
let sequence = 0;
let started: number | null = null;
let pointer: number | null = null;
let key: string | null = null;
let frame = 0;
let currentSize = 72;

function dimensions() {
  return { width: sky.clientWidth, height: sky.clientHeight };
}

function drawHeld(now: number) {
  const { width, height } = dimensions();
  const maximum = Math.min(220, width * 0.57, height * 0.69);
  const minimum = Math.min(100, maximum * 0.64);
  const progress = started === null ? 0 : growth(now - started);
  currentSize = minimum + (maximum - minimum) * progress;
  held.style.width = `${currentSize}px`;
  held.dataset.full = String(progress === 1);
}

function drawFlight(
  balloon: Balloon,
  now: number,
  width: number,
  height: number,
) {
  const { element } = balloon;
  const reduced = motion.matches;
  const { x, y, tilt, done } = flightPosition(
    balloon,
    now,
    width,
    height,
    reduced,
  );
  if (done) return true;
  const anchor = reduced && !balloon.origin ? '-50%' : '-100%';
  element.style.transform = `translate(${x}px, ${y}px) translate(-50%, ${anchor}) rotate(${tilt}deg)`;
  element.dataset.tapped = String(
    !!balloon.kick && now - balloon.kick.at < 220,
  );
  // With reduced motion the balloon stays fixed and fades as it expires.
  element.style.opacity = reduced
    ? String(Math.min(1, (FLIGHT_MS - (now - balloon.born)) / 1000))
    : '';
  return false;
}

function tick(now: number) {
  frame = 0;
  const wasFull = held.dataset.full === 'true';
  drawHeld(now);
  if (!wasFull && held.dataset.full === 'true') {
    sounds.stopPump();
    sounds.play('full');
  }
  const { width, height } = dimensions();
  for (let i = flights.length - 1; i >= 0; i--) {
    const flight = flights[i];
    if (drawFlight(flight, now, width, height)) {
      flight.element.remove();
      flights.splice(i, 1);
    }
  }
  if (flights.length || (started !== null && growth(now - started) < 1))
    frame = requestAnimationFrame(tick);
}

function wake() {
  if (!frame) frame = requestAnimationFrame(tick);
}

function addFlight(balloon: Balloon) {
  flights.push(balloon);
  if (flights.length > MAX_BALLOONS) flights.shift()?.element.remove();
}

function releaseWelcome(
  element: HTMLImageElement,
  now: number,
  width: number,
  height: number,
): Balloon {
  const bounds = element.getBoundingClientRect();
  const skyBounds = sky.getBoundingClientRect();
  const style = getComputedStyle(element);
  const size = parseFloat(style.width);
  const rotation = new DOMMatrix(
    style.transform === 'none' ? undefined : style.transform,
  );
  // Keep the visible position and angle when leaving the idle animation.
  const balloon = {
    element,
    born: now,
    size,
    lane: element.classList.contains('welcome-one') ? -0.82 : 0.84,
    origin: {
      x: (bounds.left + bounds.width / 2 - skyBounds.left) / width,
      y:
        (bounds.top +
          (bounds.height + parseFloat(style.height)) / 2 -
          skyBounds.top) /
        height,
      tilt:
        (Math.atan2(rotation.b, rotation.a) * 180) / Math.PI +
        (parseFloat(style.rotate) || 0),
    },
  };
  element.style.width = `${size}px`;
  element.className = 'balloon';
  addFlight(balloon);
  return balloon;
}

function bindBalloon(element: HTMLImageElement) {
  function kick(point?: PointerEvent) {
    if (document.hidden) return;
    const now = performance.now();
    const { width, height } = dimensions();
    const reduced = motion.matches;
    let impulse;
    if (point && !reduced) {
      const bounds = element.getBoundingClientRect();
      impulse = tapImpulse(
        1 - (2 * (point.clientX - bounds.left)) / bounds.width,
        1 - (2 * (point.clientY - bounds.top)) / bounds.height,
      );
    }
    const welcome = element.classList.contains('welcome');
    const balloon = welcome
      ? releaseWelcome(element, now, width, height)
      : flights.find((flight) => flight.element === element);
    if (!balloon) return;
    const { dx, dy } = impulse ?? {
      dx: balloon.lane < 0 ? 0.65 : -0.65,
      dy: -1,
    };
    const previousKick = balloon.kick;
    kickFlight(balloon, now, dx, dy, reduced, width, height);
    if (balloon.kick === previousKick) return;
    sounds.unlock();
    sounds.play('tap');
    if (welcome) drawFlight(balloon, now, width, height);
    status.textContent = 'ふうせんを はじいたよ';
    wake();
  }

  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    kick(event);
  });
  element.addEventListener('keydown', (event) => {
    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) kick();
    }
  });
  element.addEventListener('click', (event) => {
    if (event.detail === 0) kick();
  });
}

function begin() {
  if (started !== null || document.hidden) return;
  started = performance.now();
  sounds.unlock();
  sounds.play('pump');
  if (!document.body.classList.contains('played')) {
    const { width, height } = dimensions();
    for (const element of sky.querySelectorAll<HTMLImageElement>('.welcome')) {
      const balloon = releaseWelcome(element, started, width, height);
      drawFlight(balloon, started, width, height);
    }
  }
  pump.setAttribute('aria-pressed', 'true');
  document.body.classList.add('holding', 'played');
  wake();
}

function finish(launch: boolean) {
  if (started === null) return;
  sounds.stopPump();
  const now = performance.now();
  drawHeld(now);
  started = null;
  pump.setAttribute('aria-pressed', 'false');
  document.body.classList.remove('holding');
  if (launch) {
    const element = document.createElement('img');
    element.src = artwork[next];
    element.alt = '';
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', 'ふうせんを はじく');
    element.tabIndex = 0;
    element.draggable = false;
    element.className = 'balloon';
    element.style.width = `${currentSize}px`;
    const lane = [-0.82, 0.84, -0.38, 0.42, 0][sequence++ % 5];
    const { width, height } = dimensions();
    const balloon = { element, born: now, size: currentSize, lane };
    drawFlight(balloon, now, width, height);
    sky.append(element);
    bindBalloon(element);
    addFlight(balloon);
    next = (next + 1) % artwork.length;
    held.src = artwork[next];
    status.textContent = 'ふうせんが とんだよ';
    sounds.play('release');
  }
  drawHeld(now);
  wake();
}

function cancel() {
  finish(false);
  const captured = pointer;
  pointer = null;
  key = null;
  if (captured !== null && pump.hasPointerCapture(captured))
    pump.releasePointerCapture(captured);
}

pump.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || pointer !== null || key !== null) return;
  event.preventDefault();
  pointer = event.pointerId;
  pump.setPointerCapture(pointer);
  begin();
});
pump.addEventListener('pointerup', (event) => {
  if (event.pointerId !== pointer) return;
  pointer = null;
  finish(true);
  if (pump.hasPointerCapture(event.pointerId))
    pump.releasePointerCapture(event.pointerId);
});
for (const type of ['pointercancel', 'lostpointercapture'])
  pump.addEventListener(type, (event) => {
    if ((event as PointerEvent).pointerId === pointer) cancel();
  });
pump.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' && event.code !== 'Enter') return;
  event.preventDefault();
  if (event.repeat || pointer !== null || key !== null) return;
  key = event.code;
  begin();
});
pump.addEventListener('keyup', (event) => {
  if (event.code !== key) return;
  event.preventDefault();
  key = null;
  finish(true);
});
// Screen readers can activate buttons without sending pointer or key events.
pump.addEventListener('click', (event) => {
  if (event.detail === 0 && started === null) {
    begin();
    finish(true);
  }
});
pump.addEventListener('contextmenu', (event) => event.preventDefault());
pump.addEventListener('blur', cancel);
window.addEventListener('blur', () => {
  cancel();
  sounds.stop();
});
function clear() {
  cancel();
  sounds.stop();
  cancelAnimationFrame(frame);
  frame = 0;
  flights.splice(0).forEach((flight) => flight.element.remove());
}
window.addEventListener('pagehide', (event) => {
  clear();
  if (!event.persisted) sounds.dispose();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clear();
});
new ResizeObserver(() => {
  cancel();
  drawHeld(performance.now());
  wake();
}).observe(sky);
motion.addEventListener('change', wake);
sky.querySelectorAll<HTMLImageElement>('.welcome').forEach(bindBalloon);
drawHeld(performance.now());
held.hidden = false;
