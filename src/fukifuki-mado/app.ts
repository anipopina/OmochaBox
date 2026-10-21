import { requireContext2d, requireElement } from '../shared/dom';
import scenes from './scenes.json';

const sceneImages = import.meta.glob<string>('./assets/**/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});
const picture = requireElement('#picture', HTMLImageElement);
let sceneIndex = Math.floor(Math.random() * scenes.length);
let sceneRequest = 0,
  sceneReady = false;
let fogImage: HTMLImageElement | undefined;
const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string) {
  let pending = imageCache.get(url);
  if (!pending) {
    const image = new Image();
    image.src = url;
    pending = image.decode().then(() => image);
    imageCache.set(url, pending);
    // Allow a later visit to retry a temporarily unavailable image.
    void pending.catch(() => imageCache.delete(url));
  }
  return pending;
}

interface Position {
  x: number;
  y: number;
}

const canvas = requireElement('#fog', HTMLCanvasElement),
  ctx = requireContext2d(canvas);
const shine = requireElement('#shine', HTMLSpanElement),
  fingers = new Map<number, Position>();
let width = 0,
  height = 0,
  key = { x: 0.5, y: 0.5 };
let timer: ReturnType<typeof setTimeout> | undefined;
function clearInput() {
  for (const id of fingers.keys())
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  fingers.clear();
  clearTimeout(timer);
  shine.classList.remove('pop');
}
function cloud() {
  clearInput();
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, width, height);
  if (fogImage) {
    // Match the sharp image's centered object-fit: cover crop.
    const scale = Math.max(
      width / fogImage.naturalWidth,
      height / fogImage.naturalHeight,
    );
    const w = fogImage.naturalWidth * scale,
      h = fogImage.naturalHeight * scale;
    ctx.drawImage(fogImage, (width - w) / 2, (height - h) / 2, w, h);
  } else {
    // Cover the previous scene while loading; retain playable fog if its asset fails.
    ctx.fillStyle = sceneReady ? '#f1f8f9e8' : '#f1f8f9';
    ctx.fillRect(0, 0, width, height);
  }
  key = { x: 0.5, y: 0.5 };
}
async function showScene() {
  const request = ++sceneRequest;
  const scene = scenes[sceneIndex];
  const sharpUrl = sceneImages[`./assets/${scene.id}.webp`];
  sceneReady = false;
  fogImage = undefined;
  canvas.setAttribute('aria-busy', 'true');
  cloud();
  try {
    const [, fog] = await Promise.all([
      loadImage(sharpUrl),
      loadImage(sceneImages[`./assets/fog/${scene.id}.webp`]),
    ]);
    if (request !== sceneRequest) return;
    picture.src = sharpUrl;
    fogImage = fog;
  } catch {
    if (request !== sceneRequest) return;
    picture.src = sharpUrl;
  }
  picture.alt = scene.alt;
  sceneReady = true;
  canvas.removeAttribute('aria-busy');
  cloud();
}
function resize() {
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width),
    h = Math.round(rect.height);
  if (w === width && h === height) return;
  const old = document.createElement('canvas');
  old.width = canvas.width;
  old.height = canvas.height;
  if (width) requireContext2d(old).drawImage(canvas, 0, 0);
  const had = width > 0;
  width = w;
  height = h;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  clearInput();
  if (had) ctx.drawImage(old, 0, 0, old.width, old.height, 0, 0, width, height);
  else cloud();
}
function wipe(a: Position, b = a) {
  if (!sceneReady) return;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(58, Math.min(width, height) * 0.19);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(b.x, b.y, ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.fill();
}
function point(e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function sparkle(p: Position) {
  shine.style.left = p.x + 'px';
  shine.style.top = p.y + 'px';
  shine.classList.remove('pop');
  void shine.offsetWidth;
  shine.classList.add('pop');
  clearTimeout(timer);
  timer = setTimeout(() => shine.classList.remove('pop'), 500);
}
canvas.addEventListener('pointerdown', (e) => {
  if (!sceneReady) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (fingers.size >= 10) return;
  e.preventDefault();
  const p = point(e);
  fingers.set(e.pointerId, p);
  canvas.setPointerCapture(e.pointerId);
  wipe(p);
  sparkle(p);
});
canvas.addEventListener('pointermove', (e) => {
  const a = fingers.get(e.pointerId);
  if (!a) return;
  const b = point(e);
  wipe(a, b);
  fingers.set(e.pointerId, b);
});
for (const event of [
  'pointerup',
  'pointercancel',
  'lostpointercapture',
] as const)
  canvas.addEventListener(event, (e) => {
    fingers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
  });
canvas.addEventListener('keydown', (e) => {
  if (!sceneReady) return;
  if (
    !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(
      e.key,
    )
  )
    return;
  e.preventDefault();
  const a = { x: key.x * width, y: key.y * height };
  if (e.key === 'ArrowLeft') key.x -= 0.08;
  if (e.key === 'ArrowRight') key.x += 0.08;
  if (e.key === 'ArrowUp') key.y -= 0.08;
  if (e.key === 'ArrowDown') key.y += 0.08;
  key.x = Math.max(0, Math.min(1, key.x));
  key.y = Math.max(0, Math.min(1, key.y));
  const b = { x: key.x * width, y: key.y * height };
  wipe(a, b);
  sparkle(b);
});
requireElement('#cloud', HTMLButtonElement).addEventListener('click', () => {
  sceneIndex = (sceneIndex + 1) % scenes.length;
  void showScene();
});
window.addEventListener('pagehide', clearInput);
window.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearInput();
});
new ResizeObserver(resize).observe(canvas);
resize();
void showScene();
