import { requireElement } from '../shared/dom';
import { heldSize, paperScale } from './sizing';

const layer = requireElement('#charges', HTMLDivElement);
export type Charge = {
  started: number;
  x: number;
  y: number;
  element: HTMLDivElement;
};
const active = new Set<Charge>();
let frame = 0;

function render(charge: Charge, now: number) {
  const elapsed = now - charge.started;
  const base = heldSize(elapsed) ?? 64 + 64 * Math.max(0, elapsed / 1000);
  const size = base * paperScale(layer.clientWidth, layer.clientHeight);
  charge.element.style.width = `${size}px`;
  charge.element.style.height = `${size}px`;
  charge.element.style.left = `${charge.x}px`;
  charge.element.style.top = `${charge.y}px`;
  charge.element.dataset.full = String(elapsed >= 10000);
}
function tick(now: number) {
  frame = 0;
  let growing = false;
  for (const charge of active) {
    render(charge, now);
    growing ||= now - charge.started < 10000;
  }
  if (growing) frame = requestAnimationFrame(tick);
}
export function createCharge(x: number, y: number, src: string): Charge {
  const element = document.createElement('div');
  element.className = 'charge';
  const image = document.createElement('img');
  image.src = src;
  image.alt = '';
  image.draggable = false;
  const sparks = document.createElement('span');
  sparks.className = 'charge-sparks';
  element.append(image, sparks);
  const charge = { started: performance.now(), x, y, element };
  active.add(charge);
  layer.append(element);
  render(charge, charge.started);
  if (!frame) frame = requestAnimationFrame(tick);
  return charge;
}
export function moveCharge(charge: Charge, x: number, y: number) {
  charge.x = x;
  charge.y = y;
  render(charge, performance.now());
}
export function removeCharge(charge: Charge) {
  active.delete(charge);
  charge.element.remove();
  if (!active.size) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}
