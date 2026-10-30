import '../shared/home-button';
import { requireElement } from '../shared/dom';

const canvas = requireElement('#glass', HTMLCanvasElement);
const ctx = canvas.getContext('2d')!;
const board = requireElement('#lightbox', HTMLDivElement);
const status = requireElement('#status', HTMLParagraphElement);
const colors = ['#00d8f5', '#ffe900', '#ff26bd'];
const names = ['まる', 'しかく', 'さんかく'];
const tapSelection =
  new URLSearchParams(location.search).get('trial') === 'select';
let pending: {
  id: number;
  x: number;
  y: number;
  shape: number;
  hits: number[];
} | null = null;
let armed: number | null = null;
let lastTap: { x: number; y: number; key: string } | null = null;
let positions = [
  { x: 0.5, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.5, y: 0.5 },
];
let order = [1, 2, 0];
let selected = 0;
let width = 1;
let height = 1;
let radius = 1;
let drag: { id: number; shape: number; dx: number; dy: number } | null = null;

function path(i: number, x: number, y: number, r = radius) {
  const p = new Path2D();
  if (i === 0) p.arc(x, y, r, 0, Math.PI * 2);
  if (i === 1) p.roundRect(x - r, y - r, r * 2, r * 2, r * 0.17);
  if (i === 2) {
    p.moveTo(x, y - r);
    p.lineTo(x + r, y + r);
    p.lineTo(x - r, y + r);
    p.closePath();
  }
  return p;
}
function bound(i: number) {
  const p = positions[i]!;
  const margin = radius + 10;
  p.x = Math.max(margin / width, Math.min(1 - margin / width, p.x));
  p.y = Math.max(margin / height, Math.min(1 - margin / height, p.y));
}
function draw() {
  ctx.clearRect(0, 0, width, height);
  // Multiply only the three colored plates; the lightbox remains bright.
  ctx.fillStyle = '#fffef7';
  ctx.fillRect(0, 0, width, height);
  if (drag) {
    const p = positions[drag.shape]!;
    ctx.shadowColor = '#18324c50';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.fill(path(drag.shape, p.x * width, p.y * height));
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    for (const i of order) {
      const p = positions[i]!;
      ctx.fill(path(i, p.x * width, p.y * height));
    }
  }
  ctx.globalCompositeOperation = 'multiply';
  for (const i of order) {
    const p = positions[i]!;
    const shape = path(i, p.x * width, p.y * height);
    ctx.fillStyle = colors[i]!;
    ctx.fill(shape);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const i of order) {
    const p = positions[i]!;
    const x = p.x * width,
      y = p.y * height;
    const shape = path(i, x, y);
    const edge = ctx.createLinearGradient(
      x - radius,
      y - radius,
      x + radius,
      y + radius,
    );
    edge.addColorStop(0, '#ffffffb3');
    edge.addColorStop(0.45, '#ffffff25');
    edge.addColorStop(1, '#142d563d');
    ctx.strokeStyle = edge;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.stroke(shape);
    if (i === selected) {
      ctx.strokeStyle = '#173968';
      ctx.lineWidth = drag ? 3 : 2;
      ctx.setLineDash(drag ? [] : [7, 7]);
      ctx.stroke(path(i, x, y, radius + (drag ? 6 : 4)));
      ctx.setLineDash([]);
    }
  }
  canvas.dataset.selected = String(selected);
  canvas.dataset.dragging = String(!!drag);
}
function select(i: number, front = true) {
  selected = i;
  if (front) order = order.filter((value) => value !== i).concat(i);
  status.textContent = `${names[i]}を えらんだよ`;
  draw();
}
function stop() {
  const old = drag ?? pending;
  drag = null;
  pending = null;
  armed = null;
  lastTap = null;
  if (old && canvas.hasPointerCapture(old.id))
    canvas.releasePointerCapture(old.id);
  draw();
}
function reset() {
  stop();
  order = [1, 2, 0];
  positions = [
    { x: 0.5 - (radius * 0.55) / width, y: 0.5 - (radius * 0.4) / height },
    { x: 0.5 + (radius * 0.55) / width, y: 0.5 - (radius * 0.3) / height },
    { x: 0.5, y: 0.5 + (radius * 0.65) / height },
  ];
  if (width > 1) positions.forEach((_, i) => bound(i));
  select(0);
}
function point(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
canvas.addEventListener('pointerdown', (event) => {
  if (drag || pending || (event.pointerType === 'mouse' && event.button !== 0))
    return;
  const q = point(event);
  const hits = [...order].reverse().filter((n) => {
    const p = positions[n]!;
    return ctx.isPointInPath(
      path(n, p.x * width, p.y * height),
      q.x * devicePixelRatio,
      q.y * devicePixelRatio,
    );
  });
  const i = hits[0];
  if (i === undefined) {
    if (tapSelection) {
      armed = null;
      lastTap = null;
    }
    return;
  }
  event.preventDefault();
  canvas.focus({ preventScroll: true });
  if (tapSelection) {
    pending = {
      id: event.pointerId,
      x: q.x,
      y: q.y,
      shape: armed !== null && hits.includes(armed) ? armed : i,
      hits,
    };
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  select(i);
  const p = positions[i]!;
  drag = {
    id: event.pointerId,
    shape: i,
    dx: q.x - p.x * width,
    dy: q.y - p.y * height,
  };
  canvas.setPointerCapture(event.pointerId);
  draw();
});
canvas.addEventListener('pointermove', (event) => {
  if (pending && event.pointerId === pending.id) {
    const q = point(event);
    if (Math.hypot(q.x - pending.x, q.y - pending.y) <= 10) return;
    const p = positions[pending.shape]!;
    drag = {
      id: pending.id,
      shape: pending.shape,
      dx: pending.x - p.x * width,
      dy: pending.y - p.y * height,
    };
    pending = null;
    armed = null;
    lastTap = null;
    select(drag.shape);
  }
  if (!drag || event.pointerId !== drag.id) return;
  const q = point(event);
  positions[drag.shape] = {
    x: (q.x - drag.dx) / width,
    y: (q.y - drag.dy) / height,
  };
  bound(drag.shape);
  draw();
});
canvas.addEventListener('pointerup', (event) => {
  if (!pending || event.pointerId !== pending.id) return;
  const p = pending,
    q = point(event);
  pending = null;
  if (Math.hypot(q.x - p.x, q.y - p.y) <= 10) {
    const key = p.hits.join(',');
    const repeated =
      lastTap?.key === key &&
      Math.hypot(p.x - lastTap.x, p.y - lastTap.y) <= 24;
    const index = repeated ? (p.hits.indexOf(selected) + 1) % p.hits.length : 0;
    armed = p.hits[index];
    select(armed, false);
    lastTap = { x: p.x, y: p.y, key };
  } else {
    armed = null;
    lastTap = null;
  }
  if (canvas.hasPointerCapture(event.pointerId))
    canvas.releasePointerCapture(event.pointerId);
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(name, (event) => {
    if ((event as PointerEvent).pointerId === (drag?.id ?? pending?.id)) stop();
  });
}
canvas.addEventListener('keydown', (event) => {
  if (['1', '2', '3'].includes(event.key)) {
    event.preventDefault();
    stop();
    select(Number(event.key) - 1);
    return;
  }
  const delta: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const d = delta[event.key];
  if (!d) return;
  event.preventDefault();
  stop();
  positions[selected]!.x += (d[0] * 12) / width;
  positions[selected]!.y += (d[1] * 12) / height;
  bound(selected);
  draw();
});
new ResizeObserver(() => {
  stop();
  const first = width === 1;
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  radius = Math.min(width * 0.31, height * 0.29, 190);
  canvas.width = Math.round(width * devicePixelRatio);
  canvas.height = Math.round(height * devicePixelRatio);
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  positions.forEach((_, i) => bound(i));
  if (first) reset();
  canvas.dataset.ready = 'true';
  draw();
}).observe(board);
window.addEventListener('blur', stop);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
window.addEventListener('pagehide', reset);
window.addEventListener('pageshow', reset);
