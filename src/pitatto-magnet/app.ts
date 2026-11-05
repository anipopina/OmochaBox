import '../shared/home-button';
import { requireElement } from '../shared/dom';
import fish from './assets/fish.webp';
import flower from './assets/flower.webp';
import star from './assets/star.webp';
import magnetUrl from './assets/magnet.webp';
import { MagnetModel } from './model';

const field = requireElement('#field', HTMLDivElement);
const magnet = requireElement('#magnet', HTMLButtonElement);
const retry = requireElement('#retry', HTMLButtonElement);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const model = new MagnetModel(field.clientWidth, field.clientHeight);
const art = requireElement('#magnet-art', HTMLImageElement);
art.src = magnetUrl;
const urls = [star, fish, flower];
const names = ['ほし', 'さかな', 'はな'];
const toys = model.toys.map((_, i) => {
  const button = document.createElement('button');
  button.className = 'toy';
  button.setAttribute('aria-label', `${names[i % 3]}を あつめる`);
  const img = document.createElement('img');
  img.src = urls[i % 3];
  img.alt = '';
  img.draggable = false;
  button.append(img);
  field.append(button);
  button.addEventListener('click', () => {
    if (!canPlay() || pointer !== null) return;
    model.move(model.toys[i]);
    wake();
  });
  return button;
});
let active = true;
let ready = false;
let frame = 0;
let previous = 0;
let pointer: number | null = null;
let start = { x: 0, y: 0 };
let offset = { x: 0, y: 0 };
let dragged = false;
let feedback: Animation | undefined;
function canPlay() {
  return active && ready && !document.hidden;
}
function render() {
  magnet.style.transform = `translate(${model.magnet.x}px, ${model.magnet.y}px)`;
  field.style.setProperty('--toy-size', `${model.toySize}px`);
  field.style.setProperty('--magnet-size', `${model.magnetSize}px`);
  toys.forEach((button, i) => {
    const toy = model.toys[i];
    button.style.transform = `translate(${toy.x}px, ${toy.y}px)`;
    button.dataset.attached = String(toy.attached);
    button.querySelector('img')!.style.rotate = motion.matches
      ? '0deg'
      : `${Math.max(-14, Math.min(14, toy.vx * 0.04))}deg`;
  });
  field.dataset.attached = String(model.toys.filter((t) => t.attached).length);
  field.dataset.attracting = String(model.enabled);
}
function tick(time: number) {
  frame = 0;
  const moving = model.step(
    previous ? (time - previous) / 1000 : 1 / 60,
    motion.matches,
  );
  previous = time;
  render();
  if (moving && canPlay()) frame = requestAnimationFrame(tick);
  else {
    previous = 0;
    field.dataset.moving = 'false';
  }
}
function wake() {
  if (!canPlay() || frame) return;
  field.dataset.moving = 'true';
  frame = requestAnimationFrame(tick);
}
function clearPointer() {
  const old = pointer;
  pointer = null;
  if (old !== null && magnet.hasPointerCapture(old))
    magnet.releasePointerCapture(old);
}
function stop() {
  clearPointer();
  feedback?.cancel();
  cancelAnimationFrame(frame);
  frame = 0;
  previous = 0;
  model.settle();
  render();
  field.dataset.moving = 'false';
}
magnet.addEventListener('pointerdown', (event) => {
  if (!canPlay() || pointer !== null || event.button !== 0) return;
  event.preventDefault();
  pointer = event.pointerId;
  start = { x: event.clientX, y: event.clientY };
  offset = { ...model.magnet };
  dragged = false;
  magnet.setPointerCapture(pointer);
});
magnet.addEventListener('pointermove', (event) => {
  if (event.pointerId !== pointer || !canPlay()) return;
  const dx = event.clientX - start.x,
    dy = event.clientY - start.y;
  if (Math.hypot(dx, dy) > 8) dragged = true;
  if (!dragged) return;
  model.move({ x: offset.x + dx, y: offset.y + dy }, true);
  render();
  wake();
});
magnet.addEventListener('pointerup', (event) => {
  if (event.pointerId !== pointer) return;
  const tapped = !dragged;
  clearPointer();
  if (tapped) activate();
});
for (const name of ['pointercancel', 'lostpointercapture'])
  magnet.addEventListener(name, (event) => {
    if ((event as PointerEvent).pointerId === pointer) {
      stop();
    }
  });
function activate() {
  if (!canPlay() || pointer !== null) return;
  feedback?.cancel();
  feedback = art.animate(
    motion.matches
      ? [{ opacity: 0.7 }, { opacity: 1 }]
      : [
          { scale: '1' },
          { scale: '0.87', offset: 0.25 },
          { scale: '1.12', offset: 0.6 },
          { scale: '1' },
        ],
    { duration: motion.matches ? 100 : 360 },
  );
  if (model.toys.some((t) => t.attached)) model.scatter();
  else {
    const nearest = model.toys.reduce((a, b) =>
      Math.hypot(a.x - model.magnet.x, a.y - model.magnet.y) <
      Math.hypot(b.x - model.magnet.x, b.y - model.magnet.y)
        ? a
        : b,
    );
    model.move(nearest);
  }
  wake();
}
magnet.addEventListener('click', (event) => {
  if (event.detail === 0) activate();
});
const arrows: Record<string, [number, number]> = {
  ArrowLeft: [-36, 0],
  ArrowRight: [36, 0],
  ArrowUp: [0, -36],
  ArrowDown: [0, 36],
};
magnet.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (!event.repeat) activate();
    return;
  }
  const delta = arrows[event.key];
  if (!delta) return;
  event.preventDefault();
  if (!canPlay() || pointer !== null) return;
  model.move({ x: model.goal.x + delta[0], y: model.goal.y + delta[1] });
  wake();
});
magnet.addEventListener('keyup', (event) => {
  if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
});
window.addEventListener('blur', stop);
window.addEventListener('pagehide', () => {
  active = false;
  stop();
});
window.addEventListener('pageshow', () => {
  active = true;
  stop();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
motion.addEventListener('change', stop);
new ResizeObserver(() => {
  stop();
  model.resize(field.clientWidth, field.clientHeight);
  model.settle();
  render();
}).observe(field);
async function loadImages() {
  ready = false;
  retry.disabled = true;
  try {
    await Promise.all(
      [...field.querySelectorAll('img')].map((img) => img.decode()),
    );
    ready = true;
    retry.hidden = true;
    field.dataset.ready = 'true';
  } catch {
    retry.hidden = false;
    field.dataset.ready = 'false';
  } finally {
    retry.disabled = false;
  }
}
retry.addEventListener('click', () => {
  for (const img of field.querySelectorAll('img')) {
    const src = img.src;
    img.removeAttribute('src');
    img.src = src;
  }
  void loadImages();
});
render();
void loadImages();
