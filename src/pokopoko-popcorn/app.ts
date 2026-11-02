import '../shared/home-button';
import { requireElement } from '../shared/dom';
import { Batch } from './model';
import { Pop } from './sound';
import kernel from './assets/kernel.webp';
import popcorn from './assets/popcorn.webp';
const scene = requireElement('#scene', HTMLElement),
  tray = requireElement('#tray', HTMLDivElement);
const refill = requireElement('#refill', HTMLButtonElement),
  retry = requireElement('#retry', HTMLButtonElement);
const model = new Batch(),
  sound = new Pop(),
  motion = matchMedia('(prefers-reduced-motion: reduce)');
const animations = new Map<Element, Animation>();
const last = Array<number>(6).fill(-Infinity);
let ready = false,
  active = true,
  lastRefill = -Infinity;
const buttons = Array.from({ length: 6 }, (_, i) => {
  const b = document.createElement('button');
  b.className = 'corn';
  b.disabled = true;
  b.dataset.index = String(i);
  const art = document.createElement('img');
  art.src = kernel;
  art.alt = '';
  art.draggable = false;
  const puff = document.createElement('span');
  puff.className = 'puff';
  puff.setAttribute('aria-hidden', 'true');
  b.append(puff, art);
  tray.append(b);
  bind(b, () => tap(i));
  return b;
});
requireElement('#refill-art', HTMLImageElement).src = kernel;
function bind(button: HTMLButtonElement, action: () => void) {
  button.addEventListener('pointerdown', (e) => {
    if (e.button === 0) {
      e.preventDefault();
      action();
    }
  });
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) action();
    }
  });
  button.addEventListener('click', (e) => {
    if (e.detail === 0) action();
  });
}
function animate(el: Element, frames: Keyframe[], duration: number) {
  animations.get(el)?.cancel();
  const a = el.animate(frames, { duration, easing: 'ease-out' });
  animations.set(el, a);
  a.onfinish = () => {
    if (animations.get(el) === a) {
      animations.delete(el);
      a.cancel();
    }
  };
}
function render() {
  buttons.forEach((b, i) => {
    const popped = model.popped[i]!;
    b.dataset.popped = String(popped);
    b.setAttribute(
      'aria-label',
      popped ? 'ポップコーンを はずませる' : 'つぶを ポン',
    );
    b.querySelector('img')!.src = popped ? popcorn : kernel;
    b.style.setProperty('--tilt', `${[-12, 8, -5, 10, -9, 5][i]}deg`);
  });
}
function tap(i: number) {
  if (
    !ready ||
    !active ||
    document.hidden ||
    performance.now() - last[i]! < 100
  )
    return;
  last[i] = performance.now();
  const fresh = model.tap(i);
  if (fresh === null) return;
  render();
  const b = buttons[i]!,
    art = b.querySelector('img')!,
    puff = b.querySelector('.puff')!;
  const hop = Math.min(30, b.clientHeight * 0.22),
    turn = i % 2 === 0 ? -12 : 12;
  animate(
    art,
    motion.matches
      ? [{ opacity: 0.65 }, { opacity: 1 }]
      : [
          { transform: fresh ? 'scale(.55)' : 'scale(1,.8)', offset: 0 },
          {
            transform: `translateY(-${hop}px) rotate(${turn}deg) scale(1.1)`,
            offset: 0.32,
          },
          { transform: 'translateY(0) scale(1.08,.88)', offset: 0.72 },
          { transform: 'translateY(-5px) scale(.98,1.03)', offset: 0.86 },
          { transform: 'none', offset: 1 },
        ],
    motion.matches ? 160 : 700,
  );
  if (!motion.matches)
    animate(
      puff,
      [
        { opacity: 0.8, transform: 'scale(.4)' },
        { opacity: 0, transform: 'scale(1.18)' },
      ],
      420,
    );
  sound.play();
}
function stop() {
  for (const a of animations.values()) a.cancel();
  animations.clear();
  sound.stop();
  last.fill(-Infinity);
}
function reset() {
  if (
    !ready ||
    !active ||
    document.hidden ||
    performance.now() - lastRefill < 350
  )
    return;
  lastRefill = performance.now();
  stop();
  model.reset();
  render();
  if (!motion.matches)
    buttons.forEach((b) =>
      animate(
        b.querySelector('img')!,
        [{ transform: 'scale(.65)' }, { transform: 'none' }],
        240,
      ),
    );
}
bind(refill, reset);
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
new ResizeObserver(stop).observe(tray);
async function load() {
  ready = false;
  retry.disabled = true;
  try {
    await Promise.all(
      [kernel, popcorn].map((src) => {
        const im = new Image();
        im.src = src;
        return im.decode();
      }),
    );
    ready = true;
    scene.dataset.ready = 'true';
    retry.hidden = true;
  } catch {
    retry.hidden = false;
  }
  retry.disabled = false;
  refill.disabled = !ready;
  buttons.forEach((b) => (b.disabled = !ready));
}
retry.addEventListener('click', () => {
  void load();
});
render();
void load();
