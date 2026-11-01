import '../shared/home-button';
import { requireElement } from '../shared/dom';
import { Peekaboo, DURATIONS } from './model';
import { Knock } from './sound';
import house from './assets/house.webp';
import bear from '../kotokoto-kisha/assets/bear.webp';
import rabbit from '../kotokoto-kisha/assets/rabbit.webp';
import cat from '../kotokoto-kisha/assets/cat.webp';
const frame = requireElement('#house', HTMLDivElement);
const door = requireElement('#door', HTMLButtonElement);
const friend = requireElement('#friend', HTMLDivElement);
const portrait = requireElement('#portrait', HTMLImageElement);
const model = new Peekaboo();
const sound = new Knock();
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let timer = 0,
  feedback: Animation | null = null,
  last = -Infinity,
  enabled = true,
  ready = false;
const pictures = [bear, rabbit, cat];
const names = ['くま', 'うさぎ', 'ねこ'];
const houseArt = requireElement('#house-art', HTMLImageElement);
portrait.src = bear;
function render() {
  frame.dataset.phase = model.phase;
  frame.dataset.animal = String(model.animal);
  door.setAttribute(
    'aria-label',
    model.phase === 'open'
      ? names[model.animal] + 'に ごあいさつ'
      : 'とびらを こんこん',
  );
  door.setAttribute(
    'aria-expanded',
    String(model.phase === 'open' || model.phase === 'opening'),
  );
}
function schedule() {
  clearTimeout(timer);
  if (model.phase === 'closed') return;
  const duration =
    model.phase === 'open'
      ? DURATIONS.open
      : motion.matches
        ? 120
        : DURATIONS[model.phase];
  timer = window.setTimeout(() => {
    model.advance();
    render();
    schedule();
  }, duration);
}
function react() {
  if (performance.now() - last < 120) return;
  last = performance.now();
  feedback?.cancel();
  const open = model.phase === 'open' || model.phase === 'opening';
  const target = open ? friend : door.querySelector('.panels')!;
  feedback = target.animate(
    motion.matches
      ? [{ opacity: 1 }, { opacity: 0.8 }, { opacity: 1 }]
      : open
        ? [
            { transform: 'rotate(0)' },
            { transform: 'rotate(-8deg) scale(1.04)' },
            { transform: 'rotate(8deg) scale(1.04)' },
            { transform: 'rotate(0)' },
          ]
        : [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-5px)' },
            { transform: 'translateX(5px)' },
            { transform: 'translateX(0)' },
          ],
    { duration: motion.matches ? 180 : open ? 550 : 280, easing: 'ease-out' },
  );
  sound.play();
}
function tap() {
  if (!ready || !enabled || document.hidden) return;
  const started = model.tap();
  if (started) {
    portrait.src = pictures[model.animal]!;
    render();
    schedule();
  }
  react();
}
door.addEventListener('pointerdown', (event) => {
  if (event.button === 0) {
    event.preventDefault();
    tap();
  }
});
door.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (!event.repeat) tap();
  }
});
door.addEventListener('click', (event) => {
  if (event.detail === 0) tap();
});
function stop() {
  clearTimeout(timer);
  feedback?.cancel();
  feedback = null;
  sound.stop();
  model.reset();
  last = -Infinity;
  render();
}
window.addEventListener('blur', stop);
window.addEventListener('pagehide', () => {
  enabled = false;
  stop();
});
window.addEventListener('pageshow', () => {
  enabled = true;
  stop();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
motion.addEventListener('change', stop);
new ResizeObserver(stop).observe(frame);
render();
// Decode guests before enabling a visit; failed art stays explicitly retryable.
async function load() {
  door.disabled = true;
  ready = false;
  houseArt.src = house;
  try {
    await houseArt.decode();
    await Promise.all(
      [...pictures].map((src) => {
        const image = new Image();
        image.src = src;
        return image.decode();
      }),
    );
    ready = true;
    frame.dataset.ready = 'true';
    requireElement('#retry', HTMLButtonElement).hidden = true;
  } catch {
    requireElement('#retry', HTMLButtonElement).hidden = false;
  }
  door.disabled = !ready;
}
requireElement('#retry', HTMLButtonElement).addEventListener('click', () => {
  void load();
});
void load();
