import '../shared/home-button';
import { requireElement } from '../shared/dom';
import cyan from './assets/cyan.svg';
import purple from './assets/purple.svg';
import triangle from './assets/triangle.svg';
import star from './assets/star.svg';
import square from './assets/square.svg';
import rectangle from './assets/rectangle.svg';
import { FLIGHT_MS, MAX_BALLOONS, growth, flightPosition } from './model';
import type { Flight } from './model';

const pump = requireElement('#pump', HTMLButtonElement);
const sky = requireElement('#sky', HTMLDivElement);
const held = requireElement('#held', HTMLImageElement);
const status = requireElement('#status', HTMLParagraphElement);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const artwork = [cyan, star, triangle, purple, square, rectangle];
const flights: (Flight & { element: HTMLImageElement })[] = [];
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

function tick(now: number) {
  frame = 0;
  drawHeld(now);
  const { width, height } = dimensions();
  for (let i = flights.length - 1; i >= 0; i--) {
    const flight = flights[i];
    const position = flightPosition(flight, now, width, height, motion.matches);
    if (position.done) {
      flight.element.remove();
      flights.splice(i, 1);
      continue;
    }
    flight.element.style.transform = `translate(${position.x}px, ${position.y}px) translate(-50%, -100%) rotate(${position.tilt}deg)`;
    // Reduced motion uses a short, gentle reveal at rest, then fades away.
    if (motion.matches) {
      flight.element.style.transform = `translate(${width / 2 + flight.lane * width * 0.3}px, ${height * 0.48}px) translate(-50%, -50%)`;
      flight.element.style.opacity = String(
        Math.min(1, (FLIGHT_MS - (now - flight.born)) / 1000),
      );
    }
  }
  if (flights.length || (started !== null && growth(now - started) < 1))
    frame = requestAnimationFrame(tick);
}

function wake() {
  if (!frame) frame = requestAnimationFrame(tick);
}

function begin() {
  if (started !== null || document.hidden) return;
  started = performance.now();
  pump.setAttribute('aria-pressed', 'true');
  document.body.classList.add('holding', 'played');
  wake();
}

function finish(launch: boolean) {
  if (started === null) return;
  const now = performance.now();
  drawHeld(now);
  started = null;
  pump.setAttribute('aria-pressed', 'false');
  document.body.classList.remove('holding');
  if (launch) {
    const element = document.createElement('img');
    element.src = artwork[next];
    element.alt = '';
    element.className = 'balloon';
    element.style.width = `${currentSize}px`;
    const lane = [-0.82, 0.84, -0.38, 0.42, 0][sequence++ % 5];
    const { width, height } = dimensions();
    element.style.transform = motion.matches
      ? `translate(${width / 2 + lane * width * 0.3}px, ${height * 0.48}px) translate(-50%, -50%)`
      : `translate(${width / 2}px, ${height}px) translate(-50%, -100%)`;
    sky.append(element);
    flights.push({ element, born: now, size: currentSize, lane });
    if (flights.length > MAX_BALLOONS) flights.shift()?.element.remove();
    next = (next + 1) % artwork.length;
    held.src = artwork[next];
    status.textContent = 'ふうせんが とんだよ';
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
window.addEventListener('blur', cancel);
function clear() {
  cancel();
  cancelAnimationFrame(frame);
  frame = 0;
  flights.splice(0).forEach((flight) => flight.element.remove());
}
window.addEventListener('pagehide', clear);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clear();
});
new ResizeObserver(() => {
  cancel();
  drawHeld(performance.now());
  wake();
}).observe(sky);
motion.addEventListener('change', wake);
held.src = artwork[0];
drawHeld(performance.now());
