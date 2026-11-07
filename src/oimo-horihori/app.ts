import '../shared/home-button';
import potatoUrl from './assets/sweet-potato.webp';
import leavesUrl from './assets/leaves.webp';
import { Digging, columns, rows, potatoLayout, basketPotato } from './model';
import { requireElement } from '../shared/dom';

const patch = requireElement('#patch', HTMLDivElement);
const canvas = requireElement('#soil', HTMLCanvasElement);
const roots = requireElement('#roots', HTMLDivElement);
const scene = requireElement('#scene', HTMLElement);
const basket = requireElement('#basket', HTMLDivElement);
const cheer = requireElement('#cheer', HTMLDivElement);
const ctx = canvas.getContext('2d')!;
const game = new Digging();
let pointer: number | null = null;
let previous = { x: 0, y: 0 };
let timer = 0;
const artwork = new Image();
artwork.src = potatoUrl;
let artworkReady = false;
const seed = Math.floor(Math.random() * 1000000);
for (let i = 0; i < 5; i++) {
  const leaf = new Image();
  leaf.src = leavesUrl;
  leaf.alt = '';
  leaf.draggable = false;
  document.querySelector('.leaves')!.append(leaf);
}

function paint() {
  const w = canvas.width,
    h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#b77a43';
  ctx.fillRect(0, 0, w, h);
  // Stable irregular grains, so rotating the screen does not shuffle the soil.
  for (let i = 0; i < 220; i++) {
    const x = (((Math.sin(i * 127.1 + 3) * 43758.5453) % 1) + 1) % 1;
    const y = (((Math.sin(i * 311.7 + 9) * 19234.345) % 1) + 1) % 1;
    ctx.fillStyle = ['#cf955b', '#9c6235', '#d5a46a'][i % 3]!;
    ctx.beginPath();
    ctx.ellipse(
      x * w,
      y * h,
      ((2 + (i % 4)) * w) / 360,
      ((1 + (i % 3)) * h) / 360,
      i,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'destination-out';
  for (const hole of [...game.holes, ...game.readyRim]) {
    ctx.beginPath();
    ctx.ellipse(
      hole.x * w,
      hole.y * h,
      hole.rx * w,
      hole.ry * h,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
function update() {
  patch.dataset.phase = game.phase;
  patch.dataset.cleared = String(game.cleared.size);
  patch.dataset.round = String(game.round);
  patch.setAttribute(
    'aria-label',
    game.phase === 'ready' ? 'おいもを とる' : 'つちを ほる',
  );
  paint();
}
function image() {
  const img = new Image();
  img.src = potatoUrl;
  img.alt = '';
  img.draggable = false;
  img.className = 'potato';
  return img;
}
function plant() {
  roots.className = game.round % 2 ? 'long' : '';
  roots.replaceChildren(image());
  cheer.textContent = '';
  layout();
  update();
}
function scatter(x: number, y: number) {
  if (scene.querySelectorAll('.clod').length > 40) return;
  for (let i = 0; i < 6; i++) {
    const clod = document.createElement('i');
    clod.className = 'clod';
    clod.style.left = `${x}px`;
    clod.style.top = `${y}px`;
    clod.style.setProperty('--dx', `${(Math.random() - 0.5) * 180}px`);
    clod.style.setProperty('--dy', `${-30 + Math.random() * 110}px`);
    clod.addEventListener('animationend', () => clod.remove(), { once: true });
    scene.append(clod);
  }
}
function dig(x: number, y: number) {
  const r = patch.getBoundingClientRect();
  if (
    game.dig((x - r.left) / r.width, (y - r.top) / r.height, r.width, r.height)
  ) {
    scatter(x, y);
    update();
  }
}
function finish() {
  clearTimeout(timer);
  timer = 0;
  if (game.phase !== 'harvesting') return;
  const saved = image();
  const p = basketPotato(game.round);
  Object.assign(saved.style, {
    left: `${p.x}%`,
    top: `${p.y}%`,
    width: `${p.size}%`,
    height: `${p.size}%`,
    transform: `translate(-50%,-50%) rotate(${p.angle}deg)`,
  });
  if (basket.children.length === 12) basket.firstElementChild?.remove();
  basket.append(saved);
  basket.dataset.count = String(game.round + 1);
  basket.animate([{ scale: '1.1' }, { scale: '1' }], { duration: 300 });
  game.next();
  plant();
}
function harvest() {
  if (!game.harvest()) return;
  stopInput();
  const img = roots.querySelector('img')!,
    r = img.getBoundingClientRect(),
    b = basket.getBoundingClientRect();
  scatter(r.x + r.width / 2, r.y + r.height / 2);
  img.animate(
    [
      { translate: '0 0', scale: '1' },
      { translate: '0 -24px', scale: '1.16', offset: 0.35 },
      {
        translate: `${b.x + b.width / 2 - r.x - r.width / 2}px ${b.y + b.height / 2 - r.y - r.height / 2}px`,
        scale: '.2',
        opacity: 0,
      },
    ],
    { duration: 850, fill: 'forwards', easing: 'ease-in-out' },
  );
  update();
  timer = window.setTimeout(finish, 900);
}
function stopInput() {
  if (pointer !== null && patch.hasPointerCapture(pointer))
    patch.releasePointerCapture(pointer);
  pointer = null;
}
patch.addEventListener('pointerdown', (e) => {
  if (pointer !== null || e.button !== 0 || document.hidden || !artworkReady)
    return;
  if (game.phase === 'ready') {
    const r = roots.querySelector('img')!.getBoundingClientRect();
    if (
      e.clientX < r.left - 20 ||
      e.clientX > r.right + 20 ||
      e.clientY < r.top - 20 ||
      e.clientY > r.bottom + 20
    )
      return;
    harvest();
    return;
  }
  if (game.phase !== 'digging') return;
  pointer = e.pointerId;
  patch.setPointerCapture(pointer);
  previous = { x: e.clientX, y: e.clientY };
  dig(e.clientX, e.clientY);
});
patch.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointer || game.phase !== 'digging') return;
  const distance = Math.hypot(e.clientX - previous.x, e.clientY - previous.y);
  if (distance < 12) return;
  const steps = Math.min(40, Math.ceil(distance / 16));
  for (let i = 1; i <= steps; i++)
    dig(
      previous.x + ((e.clientX - previous.x) * i) / steps,
      previous.y + ((e.clientY - previous.y) * i) / steps,
    );
  previous = { x: e.clientX, y: e.clientY };
});
patch.addEventListener('pointerup', (e) => {
  if (e.pointerId !== pointer) return;
  stopInput();
});
for (const event of ['pointercancel', 'lostpointercapture'])
  patch.addEventListener(event, stopInput);
patch.addEventListener('keydown', (e) => {
  if (!artworkReady || (e.key !== ' ' && e.key !== 'Enter')) return;
  e.preventDefault();
  if (e.repeat) return;
  if (game.phase === 'ready') harvest();
  else if (game.phase === 'digging') {
    const remaining = Array.from({ length: columns * rows }, (_, i) => i).find(
      (i) => !game.cleared.has(i),
    );
    if (remaining !== undefined) {
      game.dig(
        ((remaining % columns) + 0.5) / columns,
        (Math.floor(remaining / columns) + 0.5) / rows,
        patch.clientWidth,
        patch.clientHeight,
      );
      update();
    }
  }
});
patch.addEventListener('click', (e) => {
  if (e.detail === 0 && game.phase === 'ready') harvest();
});
function cleanup() {
  stopInput();
  finish();
  scene.querySelectorAll('.clod').forEach((el) => el.remove());
}
window.addEventListener('blur', cleanup);
window.addEventListener('pagehide', cleanup);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cleanup();
});
window.addEventListener('resize', () => {
  stopInput();
  resize();
});
function layout() {
  const { width, height } = patch.getBoundingClientRect();
  const blocked = [document.querySelector('#back')!, basket].map((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const positions = potatoLayout(width, height, game.round, seed, blocked);
  roots.querySelectorAll<HTMLImageElement>('.potato').forEach((img, index) => {
    const p = positions[index]!;
    Object.assign(img.style, {
      width: `${p.width}px`,
      height: `${p.height}px`,
      left: `${p.left}px`,
      top: `${p.top}px`,
      transform: `rotate(${p.angle}deg)`,
    });
  });
  if (!artworkReady) return;
  const sample = document.createElement('canvas');
  sample.width = columns * 2;
  sample.height = rows * 2;
  const context = sample.getContext('2d', { willReadFrequently: true })!;
  const targets = positions.map((p) => {
    context.resetTransform();
    context.clearRect(0, 0, sample.width, sample.height);
    context.scale(sample.width / width, sample.height / height);
    context.translate(p.left + p.width / 2, p.top + p.height / 2);
    context.rotate((p.angle * Math.PI) / 180);
    context.drawImage(artwork, -p.width / 2, -p.height / 2, p.width, p.height);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const weights = new Map<number, number>();
    for (let y = 0; y < sample.height; y++)
      for (let x = 0; x < sample.width; x++) {
        const alpha = pixels[(y * sample.width + x) * 4 + 3]!;
        if (alpha < 32) continue;
        const index = Math.floor(y / 2) * columns + Math.floor(x / 2);
        weights.set(index, (weights.get(index) ?? 0) + alpha);
      }
    return weights;
  });
  game.setTargets(targets, width, height);
  update();
}
function resize() {
  layout();
  const r = patch.getBoundingClientRect(),
    dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  paint();
}
basket.addEventListener('click', () =>
  basket.animate(
    [{ rotate: '-5deg' }, { rotate: '5deg' }, { rotate: '0deg' }],
    { duration: 350 },
  ),
);
basket.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    basket.click();
  }
});
plant();
resize();

void artwork
  .decode()
  .then(() => {
    artworkReady = true;
    patch.dataset.artworkReady = 'true';
    layout();
  })
  .catch(() => {
    cheer.textContent = '↻';
    patch.setAttribute('aria-label', 'えを もういちど よみこむ');
    patch.addEventListener('click', () => location.reload(), { once: true });
  });
