import '../shared/home-button';
import { requireElement } from '../shared/dom';
import { Clay, SIZE } from './model';
import ballUrl from './assets/clay-ball.webp';

const canvas = requireElement('#clay', HTMLCanvasElement);
const reset = requireElement('#reset', HTMLButtonElement);
const ball = document.createElement('img');
ball.src = ballUrl;
ball.alt = '';
ball.draggable = false;
ball.addEventListener('error', () => {
  ball.hidden = true;
});
reset.prepend(ball);
const ctx = canvas.getContext('2d')!;
const clay = new Clay();
const displayed = new Float32Array(clay.height);
const raster = document.createElement('canvas');
raster.width = raster.height = SIZE;
const paint = raster.getContext('2d')!;
const pixels = paint.createImageData(SIZE, SIZE);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let pointer: number | null = null;
let last: [number, number] | null = null;
let pending: [number, number] | null = null;
let frame = 0;
let cursor: [number, number] = [0, 0];
let active = true;
let keyboard = false;
function render() {
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const h = displayed[i];
      const offset = i * 4;
      if (h < 0.001) {
        pixels.data[offset + 3] = 0;
        continue;
      }
      const dx =
        ((displayed[y * SIZE + Math.min(SIZE - 1, x + 1)] -
          displayed[y * SIZE + Math.max(0, x - 1)]) *
          SIZE) /
        4;
      const dy =
        ((displayed[Math.min(SIZE - 1, y + 1) * SIZE + x] -
          displayed[Math.max(0, y - 1) * SIZE + x]) *
          SIZE) /
        4;
      const light = (-dx * -0.48 - dy * -0.6 + 0.64) / Math.hypot(dx, dy, 1);
      const grain =
        Math.sin(x * 17.13 + y * 39.7) * Math.cos(x * 4.11 - y * 13.4) * 1.3;
      const ambient = 0.66 + Math.max(-0.25, light) * 0.43;
      const cavity = Math.max(0, clay.base[i] - h) * 0.65;
      pixels.data[offset] = 255 * (ambient - cavity) + grain;
      pixels.data[offset + 1] = 122 * (ambient - cavity) + grain;
      pixels.data[offset + 2] = 25 * (ambient - cavity) + grain;
      pixels.data[offset + 3] = Math.min(255, h * 18000);
    }
  paint.putImageData(pixels, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(raster, 0, 0, canvas.width, canvas.height);
  if (keyboard) {
    ctx.strokeStyle = '#663219';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      ((cursor[0] + 1) / 2) * canvas.width,
      ((cursor[1] + 1) / 2) * canvas.height,
      15,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
}
function tick() {
  frame = 0;
  if (pending) {
    if (last) clay.stroke(...last, ...pending);
    else clay.press(...pending);
    last = pending;
    pending = null;
  }
  let moving = false;
  for (let i = 0; i < displayed.length; i++) {
    const d = clay.height[i] - displayed[i];
    if (!motion.matches && Math.abs(d) > 0.0004) {
      displayed[i] += d * 0.38;
      moving = true;
    } else displayed[i] = clay.height[i];
  }
  render();
  canvas.dataset.state = moving ? 'shaping' : 'still';
  if (moving) frame = requestAnimationFrame(tick);
}
function schedule() {
  if (!frame) frame = requestAnimationFrame(tick);
}
function position(event: PointerEvent): [number, number] {
  const box = canvas.getBoundingClientRect();
  return [
    ((event.clientX - box.left) / box.width) * 2 - 1,
    ((event.clientY - box.top) / box.height) * 2 - 1,
  ];
}
function clearInput() {
  const previous = pointer;
  pointer = null;
  last = null;
  pending = null;
  if (previous !== null && canvas.hasPointerCapture(previous))
    canvas.releasePointerCapture(previous);
}
function settle() {
  clearInput();
  cancelAnimationFrame(frame);
  frame = 0;
  displayed.set(clay.height);
  render();
  canvas.dataset.state = 'still';
}
canvas.addEventListener('pointerdown', (event) => {
  if (!active || document.hidden || event.button !== 0 || pointer !== null)
    return;
  const point = position(event);
  if (!clay.contains(...point)) return;
  event.preventDefault();
  keyboard = false;
  pointer = event.pointerId;
  canvas.setPointerCapture(pointer);
  clay.press(...point);
  last = point;
  schedule();
});
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== pointer) return;
  pending = position(event);
  schedule();
});
canvas.addEventListener('pointerup', (event) => {
  if (event.pointerId !== pointer) return;
  if (last) clay.stroke(...last, ...position(event));
  clearInput();
  schedule();
});
canvas.addEventListener('pointercancel', (event) => {
  if (event.pointerId === pointer) settle();
});
canvas.addEventListener('lostpointercapture', (event) => {
  if (event.pointerId === pointer) settle();
});
canvas.addEventListener('keydown', (event) => {
  if (!active || document.hidden || pointer !== null) return;
  const directions: Record<string, [number, number]> = {
    ArrowLeft: [-0.08, 0],
    ArrowRight: [0.08, 0],
    ArrowUp: [0, -0.08],
    ArrowDown: [0, 0.08],
  };
  const direction = directions[event.key];
  if (direction) {
    event.preventDefault();
    keyboard = true;
    const next: [number, number] = [
      cursor[0] + direction[0],
      cursor[1] + direction[1],
    ];
    if (clay.contains(...next)) cursor = next;
    schedule();
  } else if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    if (event.repeat) return;
    keyboard = true;
    clay.press(...cursor);
    schedule();
  }
});
canvas.addEventListener('click', (event) => {
  if (event.detail === 0 && active && !document.hidden) {
    clay.press(...cursor);
    schedule();
  }
});
canvas.addEventListener('blur', () => {
  keyboard = false;
  settle();
});
reset.addEventListener('click', () => {
  settle();
  clay.reset();
  schedule();
});
window.addEventListener('blur', settle);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) settle();
});
window.addEventListener('pagehide', () => {
  active = false;
  settle();
});
window.addEventListener('pageshow', () => {
  active = true;
  clay.reset();
  settle();
});
motion.addEventListener('change', settle);
new ResizeObserver(() => {
  const box = canvas.getBoundingClientRect();
  canvas.width = canvas.height = Math.min(
    900,
    Math.max(192, Math.round(box.width * Math.min(devicePixelRatio, 2))),
  );
  settle();
}).observe(canvas);
canvas.dataset.ready = 'true';
settle();
