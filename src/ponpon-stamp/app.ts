import { requireElement } from '../shared/dom';
import square from '../assets/characters/shapes/01-coral-square.svg';
import cyan from '../assets/characters/shapes/02-cyan-circle.svg';
import purple from '../assets/characters/shapes/03-purple-circle.svg';
import triangle from '../assets/characters/shapes/04-yellow-triangle.svg';
import star from '../assets/characters/shapes/05-coral-star.svg';
import mint from '../assets/characters/shapes/06-mint-rectangle.svg';

const artwork = [square, cyan, purple, triangle, star, mint];
const names = [
  'あかい しかく',
  'あおい まる',
  'むらさきの まる',
  'きいろい さんかく',
  'あかい ほし',
  'みどりの しかく',
];
const paper = requireElement('#paper', HTMLDivElement);
const layer = requireElement('#stamps', HTMLDivElement);
const palette = requireElement('#palette', HTMLDivElement);
const undo = requireElement('#undo', HTMLButtonElement);
const newPaper = requireElement('#new', HTMLButtonElement);
const dialog = requireElement('#confirm', HTMLDialogElement);
const status = requireElement('#status', HTMLParagraphElement);
const guide = requireElement('#guide', HTMLDivElement);
const full = requireElement('#full', HTMLParagraphElement);
const cursor = requireElement('#cursor', HTMLSpanElement);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
type Stamp = {
  x: number;
  y: number;
  size: number;
  angle: number;
  character: number;
  element: HTMLSpanElement;
};
const stamps: Stamp[] = [];
const pending = new Map<number, { x: number; y: number; character: number }>();
let selected = 0;
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
  undo.disabled = newPaper.disabled = stamps.length === 0;
  guide.hidden = stamps.length > 0;
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
  if (document.hidden || dialog.open) return;
  if (stamps.length >= 60) {
    status.textContent =
      'かみが いっぱい。もどすか、あたらしい かみで あそべるよ。';
    return;
  }
  const element = document.createElement('span');
  element.className = 'stamp';
  const img = document.createElement('img');
  img.src = artwork[character];
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
  update();
  status.textContent = `${names[character]}、ぽん！ ${stamps.length}こ`;
}
artwork.forEach((src, index) => {
  const button = document.createElement('button');
  button.className = 'choice';
  button.setAttribute('aria-label', names[index]);
  button.setAttribute('aria-pressed', String(index === 0));
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  const check = document.createElement('span');
  check.className = 'selected-mark';
  check.textContent = '✓';
  check.setAttribute('aria-hidden', 'true');
  button.append(img, check);
  button.addEventListener('click', () => {
    selected = index;
    [...palette.children].forEach((child, i) =>
      child.setAttribute('aria-pressed', String(i === index)),
    );
    status.textContent = `${names[index]}。かみに ぽん！`;
  });
  palette.append(button);
});
paper.addEventListener('pointerdown', (event) => {
  if (
    event.button !== 0 ||
    pending.size >= 10 ||
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
undo.addEventListener('click', () => {
  cancelInput();
  stamps.pop()?.element.remove();
  update();
  status.textContent = 'ひとつ もどしたよ';
});
newPaper.addEventListener('click', () => {
  cancelInput();
  dialog.showModal();
});
dialog.addEventListener('close', () => {
  if (dialog.returnValue === 'clear') {
    stamps.splice(0).forEach((stamp) => stamp.element.remove());
    keyboardX = keyboardY = 0.5;
    layout();
    update();
    status.textContent = 'あたらしい かみ。ここに ぽん！';
    paper.focus();
  }
  dialog.returnValue = '';
});
function suspend() {
  cancelInput();
  paper
    .getAnimations({ subtree: true })
    .forEach((animation) => animation.cancel());
  if (dialog.open) dialog.close('cancel');
}
window.addEventListener('blur', cancelInput);
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
  layout();
}).observe(paper);
update();
