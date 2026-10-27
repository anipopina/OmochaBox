import '../shared/home-button';
import { stampFeedback, suspendFeedback, clearParticles } from './feedback';
import { requireElement } from '../shared/dom';
import { stampSets, type StampItem } from './sets';
import { createCharge, moveCharge, removeCharge, type Charge } from './charge';
import { paperScale, heldSize } from './sizing';

const paper = requireElement('#paper', HTMLDivElement);
const layer = requireElement('#stamps', HTMLDivElement);
const palette = requireElement('#palette', HTMLDivElement);
const newPaper = requireElement('#new', HTMLButtonElement);
const status = requireElement('#status', HTMLParagraphElement);
const full = requireElement('#full', HTMLParagraphElement);
const cursor = requireElement('#cursor', HTMLSpanElement);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
type Stamp = {
  x: number;
  y: number;
  size: number;
  charged: boolean;
  angle: number;
  character: StampItem;
  element: HTMLSpanElement;
};
const stamps: Stamp[] = [];
const pending = new Map<number, { character: StampItem; charge: Charge }>();
const items = stampSets.flatMap((set) => set.items);
const pageSize = 6;
const pageCount = Math.ceil(items.length / pageSize);
let page = 0;
let selected = items[0];
const ready = new Set<string>();
const previousPage = requireElement('#previous-page', HTMLButtonElement);
const nextPage = requireElement('#next-page', HTMLButtonElement);
const pageStatus = requireElement('#page-status', HTMLParagraphElement);
// Decode before enabling placement; taps while loading never become delayed stamps.
for (const set of stampSets)
  for (const item of set.items) {
    const image = new Image();
    image.src = item.src;
    void image
      .decode()
      .then(() => {
        ready.add(item.id);
        updateLoading();
      })
      .catch(() => {
        if (selected.id === item.id)
          status.textContent =
            'えを よみこめなかったよ。ほかの えを えらんでね。';
      });
  }
function updateLoading() {
  const loaded = ready.has(selected.id);
  paper.setAttribute('aria-busy', String(!loaded));
  paper.setAttribute('aria-disabled', String(!loaded));
}
let keyboardX = 0.5;
let keyboardY = 0.5;
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

function cancelInput() {
  const ids = [...pending.keys()];
  for (const entry of pending.values()) removeCharge(entry.charge);
  pending.clear();
  for (const id of ids)
    if (paper.hasPointerCapture(id)) paper.releasePointerCapture(id);
}
let fullTimer: ReturnType<typeof setTimeout> | undefined;
const fullArrow = requireElement('#full-arrow', SVGSVGElement);
function hideFullNotice() {
  clearTimeout(fullTimer);
  fullTimer = undefined;
  full.hidden = true;
  for (const element of [full, fullArrow, newPaper])
    element.getAnimations().forEach((animation) => animation.cancel());
}
function showFullNotice() {
  hideFullNotice();
  full.hidden = false;
  status.textContent = 'かみがいっぱい！あたらしいかみにしてね！';
  if (!reduced.matches) {
    full.animate(
      [
        { transform: 'translateY(12px) scale(.75)', opacity: 0 },
        { transform: 'translateY(-5px) scale(1.05)', opacity: 1, offset: 0.65 },
        { transform: 'translateY(0) scale(1)', opacity: 1 },
      ],
      { duration: 420, easing: 'ease-out' },
    );
    fullArrow.animate(
      [
        { transform: 'translateY(6px)' },
        { transform: 'translateY(-6px)' },
        { transform: 'translateY(6px)' },
      ],
      { duration: 550, iterations: 6, easing: 'ease-in-out' },
    );
    newPaper.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.1)' },
        { transform: 'scale(1)' },
      ],
      { duration: 650, iterations: 4, easing: 'ease-in-out' },
    );
  }
  fullTimer = setTimeout(hideFullNotice, 3500);
}
function update() {
  newPaper.disabled = stamps.length === 0;
  if (stamps.length < 60) hideFullNotice();
  paper.dataset.count = String(stamps.length);
}
function layout() {
  const w = paper.clientWidth,
    h = paper.clientHeight;
  const scale = paperScale(w, h);
  for (const stamp of stamps) {
    const size = stamp.charged
      ? stamp.size * scale
      : Math.min(stamp.size * scale, w * 0.43, h * 0.48);
    stamp.element.style.width = `${size}px`;
    stamp.element.style.height = `${size}px`;
    stamp.element.style.left = `${stamp.x * w}px`;
    stamp.element.style.top = `${stamp.y * h}px`;
  }
  cursor.style.left = `${keyboardX * 100}%`;
  cursor.style.top = `${keyboardY * 100}%`;
}
function place(
  x: number,
  y: number,
  character = selected,
  chargeSize: number | null = null,
) {
  if (document.hidden || !ready.has(character.id)) return;
  if (stamps.length >= 60) {
    showFullNotice();
    return;
  }
  const element = document.createElement('span');
  element.className = 'stamp';
  const img = document.createElement('img');
  img.src = character.src;
  element.dataset.item = character.id;
  img.alt = '';
  img.draggable = false;
  const stamp: Stamp = {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    size: chargeSize ?? 72 + Math.random() * 56,
    charged: chargeSize !== null,
    angle: Math.random() * 20 - 10,
    character,
    element,
  };
  element.style.transform = `translate(-50%, -50%) rotate(${stamp.angle}deg)`;
  element.append(img);
  layer.append(element);
  stamps.push(stamp);
  layout();
  if (!reduced.matches)
    img.animate(
      [
        { transform: 'scale(.55)' },
        { transform: 'scale(1.18)', offset: 0.55 },
        { transform: 'scale(1)' },
      ],
      { duration: 320, easing: 'ease-out' },
    );
  stampFeedback(element);
  update();
  status.textContent = `${character.name}、ぽん！ ${stamps.length}こ`;
}
function makeChoice(src: string, name: string, className: string) {
  const button = document.createElement('button');
  button.className = className;
  button.setAttribute('aria-label', name);
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  const check = document.createElement('span');
  check.className = 'selected-mark';
  check.textContent = '✓';
  check.setAttribute('aria-hidden', 'true');
  button.append(img, check);
  return button;
}
function renderItems() {
  palette.replaceChildren();
  palette.dataset.page = String(page + 1);
  palette.setAttribute(
    'aria-label',
    `スタンプ ${page + 1} / ${pageCount} ページ`,
  );
  pageStatus.textContent = `${page + 1} / ${pageCount} ページ`;
  for (const item of items.slice(page * pageSize, (page + 1) * pageSize)) {
    const button = makeChoice(item.src, item.name, 'choice');
    button.dataset.item = item.id;
    button.setAttribute('aria-pressed', String(item.id === selected.id));
    button.addEventListener('click', () => {
      cancelInput();
      selected = item;
      for (const child of palette.children)
        child.setAttribute(
          'aria-pressed',
          String((child as HTMLElement).dataset.item === item.id),
        );
      updateLoading();
      status.textContent = `${item.name}。かみに ぽん！`;
    });
    palette.append(button);
  }
  updateLoading();
}
function changePage(direction: number) {
  cancelInput();
  page = (page + direction + pageCount) % pageCount;
  selected = items[page * pageSize];
  renderItems();
  status.textContent = `${page + 1} / ${pageCount} ページ。${selected.name}で ぽん！`;
}
previousPage.addEventListener('click', () => changePage(-1));
nextPage.addEventListener('click', () => changePage(1));
previousPage.disabled = nextPage.disabled = pageCount <= 1;
renderItems();
paper.addEventListener('pointerdown', (event) => {
  if (
    event.button !== 0 ||
    pending.size >= 10 ||
    !ready.has(selected.id) ||
    document.hidden
  )
    return;
  event.preventDefault();
  if (stamps.length >= 60) {
    showFullNotice();
    return;
  }
  paper.classList.remove('keyboard');
  const r = paper.getBoundingClientRect();
  pending.set(event.pointerId, {
    charge: createCharge(
      event.clientX - r.left,
      event.clientY - r.top,
      selected.src,
    ),
    character: selected,
  });
  paper.setPointerCapture(event.pointerId);
});
paper.addEventListener('pointermove', (event) => {
  const entry = pending.get(event.pointerId);
  if (!entry) return;
  const r = paper.getBoundingClientRect();
  moveCharge(entry.charge, event.clientX - r.left, event.clientY - r.top);
});
paper.addEventListener('pointerup', (event) => {
  const entry = pending.get(event.pointerId);
  pending.delete(event.pointerId);
  if (entry) removeCharge(entry.charge);
  if (paper.hasPointerCapture(event.pointerId))
    paper.releasePointerCapture(event.pointerId);
  if (!entry) return;
  const r = paper.getBoundingClientRect();
  if (
    event.clientX < r.left ||
    event.clientX > r.right ||
    event.clientY < r.top ||
    event.clientY > r.bottom
  )
    return;
  place(
    (event.clientX - r.left) / r.width,
    (event.clientY - r.top) / r.height,
    entry.character,
    heldSize(performance.now() - entry.charge.started),
  );
});
for (const event of ['pointercancel', 'lostpointercapture'])
  paper.addEventListener(event, (e) => {
    const id = (e as PointerEvent).pointerId;
    const entry = pending.get(id);
    if (entry) removeCharge(entry.charge);
    pending.delete(id);
  });
paper.addEventListener('contextmenu', (e) => e.preventDefault());
paper.addEventListener('keydown', (event) => {
  if (
    !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(
      event.key,
    )
  )
    return;
  event.preventDefault();
  paper.classList.add('keyboard');
  if (event.key.startsWith('Arrow')) {
    keyboardX = clamp(
      keyboardX +
        (event.key === 'ArrowRight'
          ? 0.08
          : event.key === 'ArrowLeft'
            ? -0.08
            : 0),
      0.08,
      0.92,
    );
    keyboardY = clamp(
      keyboardY +
        (event.key === 'ArrowDown'
          ? 0.08
          : event.key === 'ArrowUp'
            ? -0.08
            : 0),
      0.08,
      0.92,
    );
    layout();
  } else if (!event.repeat) place(keyboardX, keyboardY);
});
// Assistive technology activates a button without pointer/key events.
paper.addEventListener('click', (event) => {
  if (event.detail === 0) place(keyboardX, keyboardY);
});
paper.addEventListener('blur', cancelInput);
newPaper.addEventListener('click', () => {
  suspend();
  stamps.splice(0).forEach((stamp) => stamp.element.remove());
  keyboardX = keyboardY = 0.5;
  layout();
  update();
  status.textContent = 'あたらしい かみになったよ';
  paper.focus();
});
function suspend() {
  hideFullNotice();
  cancelInput();
  suspendFeedback();
  paper
    .getAnimations({ subtree: true })
    .forEach((animation) => animation.cancel());
}
window.addEventListener('blur', () => {
  hideFullNotice();
  cancelInput();
  suspendFeedback();
});
window.addEventListener('pagehide', () => {
  suspend();
  stamps.splice(0).forEach((stamp) => stamp.element.remove());
  update();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspend();
});
reduced.addEventListener('change', () => {
  if (reduced.matches) {
    for (const element of [full, fullArrow, newPaper])
      element.getAnimations().forEach((animation) => animation.cancel());
    paper
      .getAnimations({ subtree: true })
      .forEach((animation) => animation.cancel());
  }
});
new ResizeObserver(() => {
  hideFullNotice();
  cancelInput();
  clearParticles();
  layout();
}).observe(paper);
update();
