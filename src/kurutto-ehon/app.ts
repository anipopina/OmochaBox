import '../shared/home-button';
import meadow from './assets/meadow.webp';
import ocean from './assets/ocean.webp';
import forest from './assets/forest.webp';

const pictures = [meadow, ocean, forest];
const names = ['はなばたけの うさぎ', 'うみの くじら', 'よるの ふくろう'];
const book = document.querySelector<HTMLElement>('#book')!;
const sheet = document.querySelector<HTMLElement>('#sheet')!;
const paper = document.querySelector<HTMLElement>('#paper')!;
const front = document.querySelector<HTMLImageElement>('#front')!;
const underneath = document.querySelector<HTMLImageElement>('#underneath')!;
const next = document.querySelector<HTMLButtonElement>('#next')!;
const previous = document.querySelector<HTMLButtonElement>('#previous')!;
const retry = document.querySelector<HTMLButtonElement>('#retry')!;
const status = document.querySelector<HTMLElement>('#status')!;
const dots = document.querySelectorAll<HTMLElement>('.dot');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let page = 0;
let direction = 1;
let progress = 0;
let active: { id: number; x: number; moved: boolean; button: boolean } | null =
  null;
let timer = 0;
let busy = false;
let ready = false;

type Point = [number, number];
function clipped(points: Point[], line: number, keepNear: boolean): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const da = a[0] + a[1] - line;
    const db = b[0] + b[1] - line;
    const insideA = keepNear ? da <= 0 : da >= 0;
    const insideB = keepNear ? db <= 0 : db >= 0;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = da / (da - db);
      result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return result;
}
function paint(amount: number) {
  progress = amount;
  book.dataset.progress = amount.toFixed(3);
  const width = book.clientWidth;
  const height = book.clientHeight;
  const line = (width + height) * (1 - amount);
  const rectangle: Point[] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  const polygon = (points: Point[]) =>
    points.length > 2
      ? `polygon(${points.map(([x, y]) => `${direction === 1 ? x : width - x}px ${y}px`).join(',')})`
      : 'polygon(0 0,0 0,0 0)';
  sheet.style.clipPath = reduced.matches
    ? ''
    : polygon(clipped(rectangle, line, true));
  sheet.style.opacity = reduced.matches ? String(1 - amount) : '1';
  paper.style.clipPath = polygon(
    clipped(rectangle, line, false).map(([x, y]) => [line - y, line - x]),
  );
  paper.style.opacity = reduced.matches || amount === 0 ? '0' : '1';
}
function target() {
  return (page + direction + pictures.length) % pictures.length;
}
function prepare(value: number) {
  direction = value;
  underneath.src = pictures[target()]!;
}
function show() {
  front.src = pictures[page]!;
  front.alt = names[page]!;
  status.textContent = names[page]!;
  book.dataset.page = String(page);
  dots.forEach((dot, index) =>
    dot.classList.toggle('selected', index === page),
  );
  paint(0);
}
function finish(commit: boolean) {
  if (commit) page = target();
  busy = false;
  book.dataset.busy = 'false';
  sheet.style.transition = 'none';
  show();
}
function settle(commit: boolean) {
  busy = true;
  book.dataset.busy = 'true';
  const start = progress;
  const destination = commit ? 1 : 0;
  const begun = performance.now();
  const duration = reduced.matches ? 110 : 560;
  const frame = (now: number) => {
    const elapsed = Math.min(1, (now - begun) / duration);
    const eased = 1 - Math.pow(1 - elapsed, 3);
    paint(start + (destination - start) * eased);
    if (elapsed < 1) timer = requestAnimationFrame(frame);
    else finish(commit);
  };
  timer = requestAnimationFrame(frame);
}
function stop() {
  if (active && book.hasPointerCapture(active.id))
    book.releasePointerCapture(active.id);
  active = null;
  cancelAnimationFrame(timer);
  finish(false);
}
function turn(value: number) {
  if (!ready || busy || active) return;
  prepare(value);
  settle(true);
}
book.addEventListener('pointerdown', (event) => {
  if (!ready || busy || active || !event.isPrimary || event.button !== 0)
    return;
  const button = (event.target as HTMLElement).closest('button');
  if (button === retry) return;
  const bounds = book.getBoundingClientRect();
  prepare(
    button === previous ||
      (!button && event.clientX < bounds.x + bounds.width / 2)
      ? -1
      : 1,
  );
  active = {
    id: event.pointerId,
    x: event.clientX,
    moved: false,
    button: !!button,
  };
  sheet.style.transition = 'none';
  book.setPointerCapture(event.pointerId);
});
book.addEventListener('pointermove', (event) => {
  if (!active || active.id !== event.pointerId) return;
  const distance = direction * (active.x - event.clientX);
  if (Math.abs(distance) > 8) active.moved = true;
  paint(Math.max(0, Math.min(1, distance / (book.clientWidth * 0.8))));
});
book.addEventListener('pointerup', (event) => {
  if (!active || active.id !== event.pointerId) return;
  const commit = progress > 0.24 || !active.moved;
  if (!active.moved && !active.button) prepare(1);
  active = null;
  if (book.hasPointerCapture(event.pointerId))
    book.releasePointerCapture(event.pointerId);
  settle(commit);
});
book.addEventListener('pointercancel', stop);
book.addEventListener('lostpointercapture', () => {
  if (active) stop();
});
// A pointer release starts settling before its click, so busy prevents duplicates.
// Accept click-only paths too (keyboard, assistive activation, browser recovery).
next.addEventListener('click', () => turn(1));
previous.addEventListener('click', () => turn(-1));
book.addEventListener('click', (event) => {
  if (!(event.target as HTMLElement).closest('button')) turn(1);
});
book.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    turn(event.key === 'ArrowRight' ? 1 : -1);
  }
});
async function load() {
  ready = false;
  next.disabled = previous.disabled = true;
  retry.hidden = true;
  try {
    await Promise.all(
      pictures.map(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
      }),
    );
    ready = true;
    next.disabled = previous.disabled = false;
    book.dataset.ready = 'true';
    show();
  } catch {
    book.dataset.ready = 'false';
    retry.hidden = false;
  }
}
retry.addEventListener('click', () => void load());
window.addEventListener('resize', stop);
window.addEventListener('blur', stop);
window.addEventListener('pagehide', stop);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
reduced.addEventListener('change', stop);
show();
void load();
