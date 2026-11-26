import '../shared/home-button';
import '../shared/play-media';
import { requireContext2d, requireElement } from '../shared/dom';
import { Pond } from './model';
import type { Leaf } from './model';
import { PondSound } from './sound';
import { drawWaterSurface } from './water-surface';
import greenLeaf from './assets/leaf-green.webp';
import tealLeaf from './assets/leaf-teal.webp';
import willowLeaf from './assets/leaf-willow.webp';
import ivyLeaf from './assets/leaf-ivy.webp';

const canvas = requireElement('#water', HTMLCanvasElement);
const refractionCanvas = requireElement('#refraction', HTMLCanvasElement);
const gravel = requireElement('#gravel', HTMLImageElement);
const ctx = requireContext2d(canvas);
const refraction = requireContext2d(refractionCanvas);
const pond = new Pond();
const sounds = new PondSound();
const motion = matchMedia('(prefers-reduced-motion: reduce)');
pond.reduced = motion.matches;
const leafUrls: Record<Leaf['art'], string> = {
  green: greenLeaf,
  teal: tealLeaf,
  willow: willowLeaf,
  ivy: ivyLeaf,
};
const images = new Map<string, HTMLImageElement>();
let ready = false;
let frame = 0;
let previous = 0;
const keyboard = { x: 0.5, y: 0.55, visible: false };
const pointers = new Map<
  number,
  { x: number; y: number; time: number; soundUntil: number }
>();

function draw(now: number) {
  ctx.clearRect(0, 0, pond.width, pond.height);
  drawWaterSurface(ctx, refraction, gravel, pond, now);
  for (const leaf of pond.leaves) {
    const img = images.get(leaf.art);
    if (!img) continue;
    ctx.save();
    ctx.translate(leaf.x, leaf.y);
    ctx.rotate(leaf.angle + leaf.tilt);
    const h = (leaf.size * img.naturalHeight) / img.naturalWidth;
    ctx.shadowColor = '#09374180';
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 4;
    ctx.drawImage(img, -leaf.size / 2, -h / 2, leaf.size, h);
    ctx.restore();
  }
  if (keyboard.visible) {
    ctx.beginPath();
    ctx.arc(
      keyboard.x * pond.width,
      keyboard.y * pond.height,
      14,
      0,
      Math.PI * 2,
    );
    ctx.strokeStyle = '#226c83';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
function tick(now: number) {
  frame = 0;
  const active = pond.step(now, previous ? (now - previous) / 1000 : 0);
  previous = now;
  draw(now);
  if (active) frame = requestAnimationFrame(tick);
  else previous = 0;
}
function wake() {
  if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
}
function cancelInputs() {
  const ids = [...pointers.keys()];
  pointers.clear();
  for (const id of ids) {
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
}
function stop() {
  cancelInputs();
  sounds.stop();
  cancelAnimationFrame(frame);
  frame = previous = 0;
  pond.clear();
  keyboard.visible = false;
  draw(performance.now());
}
function resize() {
  stop();
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(
    devicePixelRatio || 1,
    2,
    Math.sqrt(3_000_000 / Math.max(1, rect.width * rect.height)),
  );
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(
    canvas.width / rect.width,
    0,
    0,
    canvas.height / rect.height,
    0,
    0,
  );
  // The refraction can be softer than the foreground and needs only CSS-pixel detail.
  const lensScale = Math.min(
    1,
    Math.sqrt(1_200_000 / (rect.width * rect.height)),
  );
  refractionCanvas.width = Math.max(1, Math.round(rect.width * lensScale));
  refractionCanvas.height = Math.max(1, Math.round(rect.height * lensScale));
  refraction.setTransform(
    refractionCanvas.width / rect.width,
    0,
    0,
    refractionCanvas.height / rect.height,
    0,
    0,
  );
  pond.resize(rect.width, rect.height);
  draw(performance.now());
}
function point(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function splash(x: number, y: number, now: number) {
  if (!ready || document.hidden) return;
  pond.splash(x, y, now);
  wake();
}
canvas.addEventListener('pointerdown', (event) => {
  if (!ready || event.button !== 0 || pointers.size >= 10) return;
  event.preventDefault();
  keyboard.visible = false;
  const p = point(event);
  const now = performance.now();
  // Touch releases can activate Web Audio when the initial contact cannot.
  const deferSound =
    event.pointerType !== 'mouse' && sounds.needsTouchActivation;
  pointers.set(event.pointerId, {
    ...p,
    time: now,
    soundUntil: deferSound ? now + 240 : 0,
  });
  canvas.setPointerCapture(event.pointerId);
  splash(p.x, p.y, now);
  if (!deferSound) sounds.play();
});
canvas.addEventListener('pointermove', (event) => {
  const previousPoint = pointers.get(event.pointerId);
  if (!previousPoint) return;
  const p = point(event);
  const now = performance.now();
  if (p.x < 0 || p.y < 0 || p.x > pond.width || p.y > pond.height) return;
  if (
    now - previousPoint.time < 90 ||
    Math.hypot(p.x - previousPoint.x, p.y - previousPoint.y) < 36
  )
    return;
  pointers.set(event.pointerId, { ...p, time: now, soundUntil: 0 });
  splash(p.x, p.y, now);
});
for (const type of [
  'pointerup',
  'pointercancel',
  'lostpointercapture',
] as const) {
  canvas.addEventListener(type, (event) => {
    const pointer = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    if (type === 'pointercancel' && pointer) sounds.stop();
    if (
      type === 'pointerup' &&
      pointer &&
      performance.now() <= pointer.soundUntil
    ) {
      const p = point(event);
      if (Math.hypot(p.x - pointer.x, p.y - pointer.y) <= 16) sounds.play();
    }
  });
}
canvas.addEventListener('keydown', (event) => {
  if (
    !ready ||
    !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(
      event.key,
    )
  )
    return;
  event.preventDefault();
  keyboard.visible = true;
  if (event.key === ' ' || event.key === 'Enter') {
    if (!event.repeat) {
      splash(
        keyboard.x * pond.width,
        keyboard.y * pond.height,
        performance.now(),
      );
      sounds.play();
    }
  } else {
    keyboard.x = Math.max(
      0.05,
      Math.min(
        0.95,
        keyboard.x +
          (event.key === 'ArrowRight'
            ? 0.06
            : event.key === 'ArrowLeft'
              ? -0.06
              : 0),
      ),
    );
    keyboard.y = Math.max(
      0.05,
      Math.min(
        0.95,
        keyboard.y +
          (event.key === 'ArrowDown'
            ? 0.06
            : event.key === 'ArrowUp'
              ? -0.06
              : 0),
      ),
    );
  }
  draw(performance.now());
});
canvas.addEventListener('blur', () => {
  cancelInputs();
  sounds.stop();
  keyboard.visible = false;
  draw(performance.now());
});
window.addEventListener('blur', stop);
window.addEventListener('pagehide', (event) => {
  stop();
  if (!event.persisted) sounds.dispose();
});
window.addEventListener('pageshow', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
motion.addEventListener('change', () => {
  pond.reduced = motion.matches;
  stop();
});
new ResizeObserver(resize).observe(canvas);
resize();
void Promise.allSettled(
  Object.entries(leafUrls).map(async ([art, url]) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    images.set(art, image);
  }),
).then(() => {
  ready = true;
  canvas.dataset.ready = 'true';
  draw(performance.now());
});
