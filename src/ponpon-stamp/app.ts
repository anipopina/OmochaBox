import '../shared/home-button';
import { stampFeedback, suspendFeedback, clearParticles } from './feedback';
import { requireElement } from '../shared/dom';
import { stampSets, type StampItem } from './sets';

const paper = requireElement('#paper', HTMLDivElement);
const layer = requireElement('#stamps', HTMLDivElement);
const palette = requireElement('#palette', HTMLDivElement);
const newPaper = requireElement('#new', HTMLButtonElement);
const dialog = requireElement('#confirm', HTMLDialogElement);
const status = requireElement('#status', HTMLParagraphElement);
const full = requireElement('#full', HTMLParagraphElement);
const cursor = requireElement('#cursor', HTMLSpanElement);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
type Stamp = {
  x: number;
  y: number;
  size: number;
  angle: number;
  character: StampItem;
  element: HTMLSpanElement;
};
const stamps: Stamp[] = [];
const pending = new Map<
  number,
  { x: number; y: number; character: StampItem }
>();
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
  pending.clear();
  for (const id of ids)
    if (paper.hasPointerCapture(id)) paper.releasePointerCapture(id);
}
function update() {
  newPaper.disabled = stamps.length === 0;
  full.hidden = stamps.length < 60;
  paper.dataset.count = String(stamps.length);
}
function layout() {
  const w = paper.clientWidth,
    h = paper.clientHeight;
  for (const stamp of stamps) {
    const size = Math.min(stamp.size, w * 0.43, h * 0.48);
    // Leave room for tilted corners; keep every character inside the paper.
    const margin = size * 0.62;
    stamp.element.style.width = `${size}px`;
    stamp.element.style.height = `${size}px`;
    stamp.element.style.left = `${clamp(stamp.x * w, margin, w - margin)}px`;
    stamp.element.style.top = `${clamp(stamp.y * h, margin, h - margin)}px`;
  }
  cursor.style.left = `${keyboardX * 100}%`;
  cursor.style.top = `${keyboardY * 100}%`;
}
function place(x: number, y: number, character = selected) {
  if (document.hidden || dialog.open || !ready.has(character.id)) return;
  if (stamps.length >= 60) {
    status.textContent = 'かみが いっぱい。あたらしい かみで あそべるよ。';
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
    size: 72 + Math.random() * 56,
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
    dialog.open ||
    document.hidden
  )
    return;
  event.preventDefault();
  paper.classList.remove('keyboard');
  pending.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
    character: selected,
  });
  paper.setPointerCapture(event.pointerId);
});
paper.addEventListener('pointermove', (event) => {
  const start = pending.get(event.pointerId);
  if (
    start &&
    Math.hypot(event.clientX - start.x, event.clientY - start.y) > 18
  )
    pending.delete(event.pointerId);
});
paper.addEventListener('pointerup', (event) => {
  const start = pending.get(event.pointerId);
  pending.delete(event.pointerId);
  if (paper.hasPointerCapture(event.pointerId))
    paper.releasePointerCapture(event.pointerId);
  if (!start) return;
  const r = paper.getBoundingClientRect();
  if (
    event.clientX < r.left ||
    event.clientX > r.right ||
    event.clientY < r.top ||
    event.clientY > r.bottom
  )
    return;
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 18) return;
  place(
    (start.x - r.left) / r.width,
    (start.y - r.top) / r.height,
    start.character,
  );
});
for (const event of ['pointercancel', 'lostpointercapture'])
  paper.addEventListener(event, (e) =>
    pending.delete((e as PointerEvent).pointerId),
  );
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
  cancelInput();
  suspendFeedback();
  dialog.showModal();
});
dialog.addEventListener('close', () => {
  if (dialog.returnValue === 'clear') {
    stamps.splice(0).forEach((stamp) => stamp.element.remove());
    keyboardX = keyboardY = 0.5;
    layout();
    update();
    status.textContent = 'あたらしい かみになったよ';
    paper.focus();
  }
  dialog.returnValue = '';
});
function suspend() {
  cancelInput();
  suspendFeedback();
  paper
    .getAnimations({ subtree: true })
    .forEach((animation) => animation.cancel());
  if (dialog.open) dialog.close('cancel');
}
window.addEventListener('blur', () => {
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
  if (reduced.matches)
    paper
      .getAnimations({ subtree: true })
      .forEach((animation) => animation.cancel());
});
new ResizeObserver(() => {
  cancelInput();
  clearParticles();
  layout();
}).observe(paper);
update();
