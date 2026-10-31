import '../shared/home-button';
import { requireElement } from '../shared/dom';
import { Journey } from './model';
import { Whistle } from './sound';
import train from './assets/train.webp';
import bear from './assets/bear.webp';
import rabbit from './assets/rabbit.webp';
import cat from './assets/cat.webp';
const scene = requireElement('#scene', HTMLElement);
const engine = requireElement('#engine', HTMLButtonElement);
const carriage = requireElement('#carriage', HTMLDivElement);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const journey = new Journey();
const whistle = new Whistle();
const effects = new Map<Element, Animation>();
const last = new Map<Element, number>();
let frame = 0,
  previous = 0,
  enabled = true;
requireElement('#train-art', HTMLImageElement).src = train;
[...document.querySelectorAll<HTMLImageElement>('.figure img')].forEach(
  (image, i) => {
    image.src = [bear, rabbit, cat][i]!;
  },
);
function bounce(element: Element, passenger = false) {
  if (performance.now() - (last.get(element) ?? -Infinity) < 120) return;
  last.set(element, performance.now());
  effects.get(element)?.cancel();
  const marker = element.classList.contains('figure')
    ? element.parentElement!.querySelector('.animal')!
    : element;
  const animation = element.animate(
    motion.matches
      ? [{ opacity: 1 }, { opacity: 0.8 }, { opacity: 1 }]
      : passenger
        ? [
            { transform: 'rotate(0) translateY(0)' },
            { transform: 'rotate(-6deg)', offset: 0.25 },
            { transform: 'rotate(6deg)', offset: 0.6 },
            { transform: 'rotate(0) translateY(0)' },
          ]
        : [
            { transform: 'translateY(0)' },
            { transform: 'translateY(-9px)', offset: 0.3 },
            { transform: 'translateY(0)' },
          ],
    {
      duration: motion.matches ? 180 : passenger ? 650 : 400,
      easing: 'ease-out',
    },
  );
  effects.set(element, animation);
  marker.setAttribute('data-reacting', 'true');
  animation.onfinish = () => {
    if (effects.get(element) !== animation) return;
    effects.delete(element);
    marker.removeAttribute('data-reacting');
  };
}
function render() {
  scene.style.setProperty('--travel', `${-journey.offset}px`);
  scene.dataset.moving = String(journey.remaining > 0);
}
function tick(time: number) {
  frame = 0;
  journey.step(previous ? time - previous : 16);
  previous = time;
  render();
  if (journey.remaining) frame = requestAnimationFrame(tick);
  else previous = 0;
}
function activate(button: HTMLButtonElement, action: () => void) {
  const run = () => {
    if (enabled && !document.hidden) action();
  };
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    run();
  });
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!event.repeat) run();
  });
  button.addEventListener('click', (event) => {
    if (event.detail === 0) run();
  });
}
activate(engine, () => {
  bounce(carriage);
  whistle.play();
  if (!motion.matches) {
    journey.start();
    if (!frame) frame = requestAnimationFrame(tick);
    render();
  }
});
document.querySelectorAll<HTMLButtonElement>('.animal').forEach((button) =>
  activate(button, () => {
    const figure = button.parentElement!.querySelector('.figure')!;
    bounce(figure, true);
    const paw = figure.querySelector('.wave')!;
    bounce(paw, true);
  }),
);
function stop() {
  cancelAnimationFrame(frame);
  frame = 0;
  previous = 0;
  journey.stop();
  render();
  whistle.stop();
  effects.forEach((a) => a.cancel());
  document
    .querySelectorAll('[data-reacting]')
    .forEach((element) => element.removeAttribute('data-reacting'));
  effects.clear();
  last.clear();
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
new ResizeObserver(stop).observe(scene);
scene.dataset.ready = 'true';
