import '../shared/home-button';
import { requireElement } from '../shared/dom';
import jellyUrl from './assets/jelly.webp';

const scene = requireElement('#scene', HTMLElement);
const jelly = requireElement('#jelly', HTMLButtonElement);
const art = requireElement('#art', HTMLImageElement);
const retry = requireElement('#retry', HTMLButtonElement);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
art.src = jellyUrl;
let active = true;
let pointer: number | null = null;
let startX = 0;
let startY = 0;
let size = 1;
let shape = { x: 1, y: 1, skew: 0 };
let animation: Animation | undefined;
let key: string | null = null;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
function transform(x = shape.x, y = shape.y, skew = shape.skew) {
  return `skewX(${skew}deg) scale(${x}, ${y})`;
}
function cancelAnimation() {
  animation?.cancel();
  animation = undefined;
}
function deform(dx: number, dy: number) {
  cancelAnimation();
  shape = {
    x: clamp(1 + dy * 0.25 + Math.abs(dx) * 0.15, 0.78, 1.23),
    y: clamp(1 - dy * 0.65, 0.6, 1.6),
    skew: clamp(-dx * 25, -25, 25),
  };
  const width = jelly.getBoundingClientRect().width;
  const room = Math.max(0, (scene.clientWidth - width * shape.x) / 2 - 16);
  const maxSkew = Math.min(
    25,
    (Math.atan(room / (width * shape.y)) * 180) / Math.PI,
  );
  shape.skew = clamp(shape.skew, -maxSkew, maxSkew);
  art.style.transform = transform();
  scene.dataset.state = 'stretching';
}
function release() {
  cancelAnimation();
  const initial = transform();
  const overshoot = transform(
    1 - (shape.x - 1) * 0.3,
    1 - (shape.y - 1) * 0.3,
    -shape.skew * 0.3,
  );
  const rebound = transform(
    1 + (shape.x - 1) * 0.12,
    1 + (shape.y - 1) * 0.12,
    shape.skew * 0.12,
  );
  shape = { x: 1, y: 1, skew: 0 };
  art.style.transform = 'none';
  scene.dataset.state = 'settling';
  animation = art.animate(
    motion.matches
      ? [{ transform: initial }, { transform: 'none' }]
      : [
          { transform: initial },
          { transform: overshoot, offset: 0.35 },
          { transform: rebound, offset: 0.65 },
          { transform: 'none' },
        ],
    { duration: motion.matches ? 100 : 620, easing: 'ease-in-out' },
  );
  const current = animation;
  current.onfinish = () => {
    if (animation !== current) return;
    cancelAnimation();
    scene.dataset.state = 'idle';
  };
}
function clearPointer() {
  const previous = pointer;
  pointer = null;
  if (previous !== null && jelly.hasPointerCapture(previous))
    jelly.releasePointerCapture(previous);
}
function stop() {
  clearPointer();
  key = null;
  cancelAnimation();
  shape = { x: 1, y: 1, skew: 0 };
  art.style.transform = 'none';
  scene.dataset.state = 'idle';
}
function canPlay() {
  return active && !document.hidden;
}
jelly.addEventListener('pointerdown', (event) => {
  if (!canPlay() || event.button !== 0 || pointer !== null || key !== null)
    return;
  event.preventDefault();
  pointer = event.pointerId;
  startX = event.clientX;
  startY = event.clientY;
  size = jelly.getBoundingClientRect().width;
  jelly.setPointerCapture(event.pointerId);
  deform(0, 0.18);
});
jelly.addEventListener('pointermove', (event) => {
  if (event.pointerId !== pointer || !canPlay()) return;
  event.preventDefault();
  deform(
    (event.clientX - startX) / size,
    (event.clientY - startY) / size + 0.18,
  );
});
jelly.addEventListener('pointerup', (event) => {
  if (event.pointerId !== pointer) return;
  clearPointer();
  release();
});
jelly.addEventListener('pointercancel', (event) => {
  if (event.pointerId === pointer) stop();
});
jelly.addEventListener('lostpointercapture', (event) => {
  if (event.pointerId === pointer) stop();
});
const arrows: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 0.6],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};
jelly.addEventListener('keydown', (event) => {
  if (!(event.key in arrows) && event.key !== ' ' && event.key !== 'Enter')
    return;
  event.preventDefault();
  if (!canPlay() || event.repeat || pointer !== null || key !== null) return;
  key = event.key;
  deform(...(arrows[event.key] ?? [0, 0.5]));
});
jelly.addEventListener('keyup', (event) => {
  if (event.key !== key) return;
  event.preventDefault();
  key = null;
  release();
});
jelly.addEventListener('click', (event) => {
  if (event.detail !== 0 || !canPlay() || pointer !== null || key !== null)
    return;
  deform(0, 0.5);
  release();
});
jelly.addEventListener('blur', stop);
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
new ResizeObserver(stop).observe(requireElement('#stage', HTMLDivElement));
async function checkImage() {
  retry.disabled = true;
  try {
    await art.decode();
    retry.hidden = true;
  } catch {
    retry.hidden = false;
  } finally {
    retry.disabled = false;
  }
}
retry.addEventListener('click', () => {
  art.removeAttribute('src');
  art.src = jellyUrl;
  void checkImage();
});
stop();
scene.dataset.ready = 'true';
void checkImage();
