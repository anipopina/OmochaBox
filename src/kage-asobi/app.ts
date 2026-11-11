import '../shared/home-button';
import rabbitUrl from './assets/rabbit.webp';
import { layout, lightAt, type Light } from './model';

const scene = document.querySelector<HTMLElement>('#scene')!;
const rabbit = document.querySelector<HTMLImageElement>('#rabbit')!;
const shadow = document.querySelector<HTMLImageElement>('#shadow')!;
const lightButton = document.querySelector<HTMLButtonElement>('#light')!;
const reset = document.querySelector<HTMLButtonElement>('#reset')!;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let light: Light = { x: 0.18, y: 0.6 };
let pointer: number | null = null;
let sparkle: Animation | undefined;
let active = true;
const events = new AbortController();
const options = { signal: events.signal };
rabbit.src = shadow.src = rabbitUrl;

function draw() {
  const { width, height } = scene.getBoundingClientRect();
  const p = layout(width, height, light);
  scene.style.setProperty('--light-x', `${p.x}px`);
  scene.style.setProperty('--light-y', `${p.y}px`);
  for (const image of [rabbit, shadow]) {
    image.style.left = `${p.foot.x}px`;
    image.style.top = `${p.foot.y}px`;
    image.style.height = `${p.size}px`;
  }
  shadow.style.transform = `translate(-50%, -100%) rotate(${p.angle}deg) scale(1.15, ${p.length / p.size})`;
  scene.dataset.lightX = String(light.x);
  scene.dataset.lightY = String(light.y);
  scene.dataset.angle = String(p.angle);
  scene.dataset.length = String(p.length);
  lightButton.setAttribute(
    'aria-label',
    'ひかり。矢印キーで動かす。押すと位置が変わる',
  );
}

function feedback() {
  sparkle?.cancel();
  if (!reduced.matches)
    sparkle = lightButton.animate(
      [
        { filter: 'brightness(1)' },
        { filter: 'brightness(1.15)', scale: '1.12' },
        { filter: 'brightness(1)', scale: '1' },
      ],
      { duration: 230 },
    );
}

function move(event: PointerEvent) {
  const rect = scene.getBoundingClientRect();
  light = lightAt(
    rect.width,
    rect.height,
    event.clientX - rect.left,
    event.clientY - rect.top,
  );
  draw();
}

function release() {
  const held = pointer;
  pointer = null;
  scene.dataset.dragging = 'false';
  if (held !== null && scene.hasPointerCapture(held))
    scene.releasePointerCapture(held);
}

scene.addEventListener(
  'pointerdown',
  (event) => {
    if (!active || document.hidden || pointer !== null || event.button !== 0)
      return;
    if ((event.target as Element).closest('a, #reset')) return;
    event.preventDefault();
    pointer = event.pointerId;
    scene.setPointerCapture(pointer);
    scene.dataset.dragging = 'true';
    move(event);
    feedback();
  },
  options,
);
scene.addEventListener(
  'pointermove',
  (event) => {
    if (event.pointerId === pointer) move(event);
  },
  options,
);
for (const name of [
  'pointerup',
  'pointercancel',
  'lostpointercapture',
] as const)
  scene.addEventListener(
    name,
    (event) => {
      if (event.pointerId === pointer) release();
    },
    options,
  );

lightButton.addEventListener(
  'keydown',
  (event) => {
    const steps: Record<string, Light> = {
      ArrowLeft: { x: -0.12, y: 0 },
      ArrowRight: { x: 0.12, y: 0 },
      ArrowUp: { x: 0, y: -0.15 },
      ArrowDown: { x: 0, y: 0.15 },
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    light = {
      x: Math.min(1, Math.max(0, light.x + step.x)),
      y: Math.min(1, Math.max(0, light.y + step.y)),
    };
    draw();
  },
  options,
);
lightButton.addEventListener(
  'click',
  (event) => {
    if (event.detail !== 0 || !active) return;
    light = { x: light.x < 0.5 ? 0.85 : 0.15, y: 1 - light.y };
    draw();
    feedback();
  },
  options,
);
reset.addEventListener(
  'click',
  () => {
    release();
    light = { x: 0.18, y: 0.6 };
    draw();
    feedback();
  },
  options,
);

function stop() {
  release();
  sparkle?.cancel();
}
window.addEventListener('blur', stop, options);
document.addEventListener(
  'visibilitychange',
  () => {
    if (document.hidden) stop();
  },
  options,
);
window.addEventListener(
  'resize',
  () => {
    stop();
    draw();
  },
  options,
);
reduced.addEventListener('change', stop, options);
window.addEventListener(
  'pagehide',
  (event) => {
    stop();
    active = false;
    if (!event.persisted) events.abort();
  },
  options,
);
window.addEventListener(
  'pageshow',
  () => {
    active = true;
    draw();
  },
  options,
);
Promise.all([rabbit.decode(), shadow.decode()])
  .then(() => {
    scene.dataset.ready = 'true';
  })
  .catch(() => {
    scene.dataset.ready = 'error';
  });
draw();
