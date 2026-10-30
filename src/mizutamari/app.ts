import '../shared/home-button';
import { requireElement } from '../shared/dom';
import { Pond, RIPPLE_LIFE } from './model';
import greenLeaf from './assets/leaf-green.webp';
import tealLeaf from './assets/leaf-teal.webp';

const canvas = requireElement('#water', HTMLCanvasElement);
const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas 2D unavailable');
const ctx = context;
const pond = new Pond();
pond.carry = new URLSearchParams(location.search).get('trial') === 'carry';
const motion = matchMedia('(prefers-reduced-motion: reduce)');
pond.reduced = motion.matches;
const leafUrls = [greenLeaf, tealLeaf];
const images: HTMLImageElement[] = [];
let ready = false;
let frame = 0;
let previous = 0;
const keyboard = { x: 0.5, y: 0.55, visible: false };
const pointers = new Map<number, { x: number; y: number; time: number }>();

function draw(now: number) {
  ctx.clearRect(0, 0, pond.width, pond.height);
  for (const ripple of pond.ripples) {
    const age = Math.max(0, now - ripple.born);
    const progress = age / (pond.reduced ? 500 : RIPPLE_LIFE);
    const radius = pond.reduced
      ? 48
      : 16 +
        Math.sqrt(progress) *
          Math.min(200, Math.min(pond.width, pond.height) * 0.48);
    const opacity = Math.max(0, 1 - progress);
    for (let ring = 0; ring < 3; ring++) {
      const r = radius * (1 - ring * 0.22);
      ctx.beginPath();
      ctx.ellipse(ripple.x, ripple.y, r, r * 0.82, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(35,116,137,${opacity * 0.25})`;
      ctx.lineWidth = 6 - ring;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(ripple.x, ripple.y - 1.8, r, r * 0.82, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,246,${opacity * 0.95})`;
      ctx.lineWidth = 3 - ring * 0.5;
      ctx.stroke();
    }
  }
  for (const leaf of pond.leaves) {
    const img = images[leaf.art];
    if (!img) continue;
    ctx.save();
    ctx.translate(leaf.x, leaf.y);
    ctx.rotate(leaf.angle + leaf.tilt);
    const h = (leaf.size * img.naturalHeight) / img.naturalWidth;
    ctx.shadowColor = '#377f9255';
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
  cancelAnimationFrame(frame);
  frame = previous = 0;
  pond.clear();
  keyboard.visible = false;
  draw(performance.now());
}
function resize() {
  stop();
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(
    devicePixelRatio || 1,
    2,
    Math.sqrt(3_000_000 / Math.max(1, rect.width * rect.height)),
  );
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
  pointers.set(event.pointerId, { ...p, time: now });
  canvas.setPointerCapture(event.pointerId);
  splash(p.x, p.y, now);
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
  pointers.set(event.pointerId, { ...p, time: now });
  splash(p.x, p.y, now);
});
for (const type of [
  'pointerup',
  'pointercancel',
  'lostpointercapture',
] as const) {
  canvas.addEventListener(type, (event) => {
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
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
    if (!event.repeat)
      splash(
        keyboard.x * pond.width,
        keyboard.y * pond.height,
        performance.now(),
      );
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
  keyboard.visible = false;
  draw(performance.now());
});
window.addEventListener('blur', stop);
window.addEventListener('pagehide', stop);
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
void Promise.all(
  leafUrls.map(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  }),
)
  .then((loaded) => {
    images.push(...loaded);
    ready = loaded.length === leafUrls.length;
    canvas.dataset.ready = String(ready);
    draw(performance.now());
  })
  .catch(() => {
    // Ripples remain playable when a decorative image fails to decode.
    ready = true;
    canvas.dataset.ready = 'true';
    draw(performance.now());
  });
