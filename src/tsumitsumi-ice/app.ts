import '../shared/home-button';
import { requireElement } from '../shared/dom';
import cone from './assets/cone.webp';
import strawberry from './assets/strawberry.webp';
import vanilla from './assets/vanilla.webp';
import chocolate from './assets/chocolate.webp';

const flavors = { strawberry, vanilla, chocolate };
type Flavor = keyof typeof flavors;
const names = { strawberry: 'いちご', vanilla: 'バニラ', chocolate: 'チョコ' };
const scoops: Flavor[] = [];
const stack = requireElement('#stack', HTMLButtonElement);
const art = requireElement('#art', HTMLSpanElement);
const holder = requireElement('#scoops', HTMLSpanElement);
const status = requireElement('#status', HTMLSpanElement);
const retry = requireElement('#retry', HTMLButtonElement);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const animations = new Map<Element, Animation>();
let active = true;
let last = -Infinity;
requireElement('#cone', HTMLImageElement).src = cone;
requireElement('#reset img', HTMLImageElement).src = cone;

function animate(target: Element, frames: Keyframe[]) {
  animations.get(target)?.cancel();
  const animation = target.animate(
    motion.matches ? [{ opacity: 0.75 }, { opacity: 1 }] : frames,
    { duration: motion.matches ? 140 : 420, easing: 'ease-out' },
  );
  animations.set(target, animation);
  animation.onfinish = () => {
    if (animations.get(target) === animation) {
      animations.delete(target);
      animation.cancel();
    }
  };
}
function stop() {
  animations.forEach((animation) => animation.cancel());
  animations.clear();
  last = -Infinity;
}
function bind(button: HTMLButtonElement, action: () => void) {
  const run = () => {
    if (!active || document.hidden || performance.now() - last < 80) return;
    last = performance.now();
    action();
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
function render() {
  holder.replaceChildren();
  scoops.forEach((flavor, index) => {
    const image = document.createElement('img');
    image.className = 'scoop';
    image.src = flavors[flavor];
    image.alt = '';
    image.draggable = false;
    image.style.bottom = `${20 + index * 12.5}%`;
    image.dataset.flavor = flavor;
    holder.append(image);
  });
  stack.dataset.count = String(scoops.length);
  status.textContent = scoops.length
    ? `${scoops.length}この アイス`
    : 'からの コーン';
}
document
  .querySelectorAll<HTMLButtonElement>('[data-flavor]')
  .forEach((button) => {
    const flavor = button.dataset.flavor as Flavor;
    button.querySelector('img')!.src = flavors[flavor];
    bind(button, () => {
      stop();
      last = performance.now();
      if (scoops.length < 5) scoops.push(flavor);
      else scoops[4] = flavor;
      render();
      status.textContent = `${names[flavor]}を のせたよ。${scoops.length}この アイス`;
      animate(holder.lastElementChild!, [
        { transform: 'translateY(-28px) scale(.65)' },
        { transform: 'translateY(4px) scale(1.1,.9)', offset: 0.65 },
        { transform: 'none' },
      ]);
      animate(button.querySelector('img')!, [
        { transform: 'scale(.82)' },
        { transform: 'scale(1.12)', offset: 0.5 },
        { transform: 'none' },
      ]);
    });
  });
bind(stack, () =>
  animate(art, [
    { transform: 'scale(1,.94)' },
    { transform: 'translateY(-14px) rotate(-4deg)', offset: 0.35 },
    { transform: 'rotate(3deg)', offset: 0.7 },
    { transform: 'none' },
  ]),
);
bind(requireElement('#reset', HTMLButtonElement), () => {
  stop();
  last = performance.now();
  scoops.length = 0;
  render();
  animate(art, [{ transform: 'scale(.85)' }, { transform: 'none' }]);
});
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
new ResizeObserver(stop).observe(requireElement('#stage', HTMLDivElement));
async function checkImages() {
  retry.disabled = true;
  try {
    await Promise.all(
      [cone, ...Object.values(flavors)].map((url) => {
        const image = new Image();
        image.src = url;
        return image.decode();
      }),
    );
    retry.hidden = true;
  } catch {
    retry.hidden = false;
  } finally {
    retry.disabled = false;
  }
}
retry.addEventListener('click', () => {
  document.querySelectorAll<HTMLImageElement>('#scene img').forEach((image) => {
    const src = image.src;
    image.removeAttribute('src');
    image.src = src;
  });
  void checkImages();
});
render();
requireElement('#scene', HTMLElement).dataset.ready = 'true';
void checkImages();
