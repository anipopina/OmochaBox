import '../shared/home-button';
import { requireElement } from '../shared/dom';
import guitar from './assets/guitar.webp';
import { GuitarSound } from './sound';

const board = requireElement('#instrument', HTMLDivElement);
const field = requireElement('#strings', HTMLDivElement);
const art = requireElement('#guitar-art', HTMLImageElement);
const buttons = [...field.querySelectorAll<HTMLButtonElement>('button')];
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const sound = new GuitarSound();
const last = new Array<number>(4).fill(-Infinity);
const animations = new Map<number, Animation[]>();
const pointers = new Map<number, { x: number; y: number; note: number }>();
let enabled = true;

function pluck(note: number) {
  if (!enabled || document.hidden || note < 0) return;
  const now = performance.now();
  if (now - last[note]! < 90) return;
  last[note] = now;
  const button = buttons[note]!;
  animations.get(note)?.forEach((animation) => animation.cancel());
  const string = button.querySelector('.string')!;
  const ring = button.querySelector('.ring')!;
  const wave = string.animate(
    motion.matches
      ? [{ opacity: 1 }, { opacity: 0.8 }, { opacity: 1 }]
      : [0, 12, -10, 8, -6, 4, -2, 0].map((x) => ({
          transform: `translateX(${x}px)`,
        })),
    { duration: motion.matches ? 200 : 600, easing: 'ease-out' },
  );
  const glow = ring.animate(
    motion.matches
      ? [{ opacity: 0.65 }, { opacity: 0 }]
      : [
          { transform: 'scale(.65)', opacity: 0.75 },
          { transform: 'scale(1.7)', opacity: 0 },
        ],
    { duration: motion.matches ? 200 : 600, easing: 'ease-out' },
  );
  animations.set(note, [wave, glow]);
  button.dataset.playing = 'true';
  glow.onfinish = () => {
    if (animations.get(note)?.[1] !== glow) return;
    animations.delete(note);
    delete button.dataset.playing;
  };
  sound.play(note);
}
function hit(x: number, y: number) {
  return buttons.findIndex((button) => {
    const r = button.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
}
field.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !enabled || pointers.size >= 10) return;
  const note = hit(event.clientX, event.clientY);
  if (note < 0) return;
  event.preventDefault();
  field.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, note });
  pluck(note);
});
field.addEventListener('pointermove', (event) => {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  // Sample the segment so one fast sweep cannot skip the middle strings.
  const steps = Math.min(
    80,
    Math.max(
      1,
      Math.ceil(
        Math.hypot(event.clientX - previous.x, event.clientY - previous.y) / 12,
      ),
    ),
  );
  for (let i = 1; i <= steps; i++) {
    const note = hit(
      previous.x + ((event.clientX - previous.x) * i) / steps,
      previous.y + ((event.clientY - previous.y) * i) / steps,
    );
    if (note >= 0 && note !== previous.note) pluck(note);
    previous.note = note;
  }
  previous.x = event.clientX;
  previous.y = event.clientY;
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  field.addEventListener(name, (event) => {
    const id = (event as PointerEvent).pointerId;
    pointers.delete(id);
    if (field.hasPointerCapture(id)) field.releasePointerCapture(id);
    if (!pointers.size) sound.release();
  });
}
buttons.forEach((button, index) => {
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!event.repeat) pluck(index);
  });
  button.addEventListener('click', (event) => {
    if (event.detail === 0) pluck(index);
  });
});
function stop() {
  const ids = [...pointers.keys()];
  pointers.clear();
  for (const id of ids)
    if (field.hasPointerCapture(id)) field.releasePointerCapture(id);
  animations.forEach((group) =>
    group.forEach((animation) => animation.cancel()),
  );
  animations.clear();
  buttons.forEach((button) => {
    delete button.dataset.playing;
  });
  last.fill(-Infinity);
  sound.stop();
}
window.addEventListener('blur', stop);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
window.addEventListener('pagehide', () => {
  enabled = false;
  stop();
});
window.addEventListener('pageshow', () => {
  enabled = true;
  stop();
});
motion.addEventListener('change', stop);
new ResizeObserver(stop).observe(board);
art.src = guitar;
board.dataset.ready = 'true';
