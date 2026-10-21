import { requireContext2d, requireElement } from '../shared/dom';

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
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, '#d6f6ff');
  g.addColorStop(0.5, '#97d7ed');
  g.addColorStop(1, '#bceafa');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff55';
  for (let y = 25; y < height; y += 65)
    for (let x = 20; x < width; x += 65) {
      ctx.beginPath();
      ctx.ellipse(x + (y % 2) * 14, y, 8, 14, 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  key = { x: 0.5, y: 0.5 };
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
requireElement('#cloud', HTMLButtonElement).addEventListener('click', cloud);
window.addEventListener('pagehide', clearInput);
window.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearInput();
});
new ResizeObserver(resize).observe(canvas);
resize();
