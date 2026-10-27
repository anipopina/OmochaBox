import '../shared/home-button';
import { requireElement } from '../shared/dom';
import { advance, clampSpeed, swipeSpeed } from './model';
const wheel = requireElement('#wheel', HTMLButtonElement);
const rotor = requireElement('#rotor', HTMLImageElement);
const status = requireElement('#status', HTMLParagraphElement);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let angle = 0,
  speed = 0,
  frame = 0,
  previous = 0,
  direction = 1;
let pointer:
  | {
      id: number;
      startX: number;
      startY: number;
      x: number;
      y: number;
      moved: boolean;
    }
  | undefined;
function render() {
  rotor.style.transform = `rotate(${angle}deg)`;
  wheel.dataset.active = String(speed !== 0 || !!pointer);
}
function tick(now: number) {
  frame = 0;
  const next = advance(angle, speed, (now - previous) / 1000);
  angle = next.angle;
  speed = next.speed;
  previous = now;
  render();
  if (speed) frame = requestAnimationFrame(tick);
}
function turn(impulse: number) {
  if (document.hidden || !impulse) return;
  direction = Math.sign(impulse);
  if (motion.matches) {
    angle = (angle + direction * 12 + 360) % 360;
    render();
  } else {
    // A contrary swipe changes direction immediately, rather than fighting
    // accumulated momentum. Repeated same-direction input remains bounded.
    speed = clampSpeed((Math.sign(speed) === direction ? speed : 0) + impulse);
    if (!frame) {
      previous = performance.now();
      frame = requestAnimationFrame(tick);
    }
    render();
  }
  status.textContent =
    direction > 0 ? 'みぎへ、くるくる！' : 'ひだりへ、くるくる！';
}
function release() {
  const id = pointer?.id;
  pointer = undefined;
  if (id !== undefined && wheel.hasPointerCapture(id))
    wheel.releasePointerCapture(id);
  render();
}
function stop() {
  release();
  cancelAnimationFrame(frame);
  frame = 0;
  speed = 0;
  render();
}
wheel.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || pointer || document.hidden) return;
  event.preventDefault();
  pointer = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    moved: false,
  };
  wheel.setPointerCapture(event.pointerId);
  render();
});
wheel.addEventListener('pointermove', (event) => {
  if (pointer?.id !== event.pointerId) return;
  const p = pointer;
  if (
    !p.moved &&
    Math.hypot(event.clientX - p.startX, event.clientY - p.startY) < 10
  )
    return;
  p.moved = true;
  const r = wheel.getBoundingClientRect();
  const impulse = swipeSpeed(
    p.x - r.left - r.width / 2,
    p.y - r.top - r.height / 2,
    event.clientX - p.x,
    event.clientY - p.y,
    r.width / 2,
  );
  // In reduced motion one discrete response per gesture, on release.
  if (!motion.matches) turn(impulse);
  else if (impulse) direction = Math.sign(impulse);
  p.x = event.clientX;
  p.y = event.clientY;
});
wheel.addEventListener('pointerup', (event) => {
  if (pointer?.id !== event.pointerId) return;
  const p = pointer;
  const r = wheel.getBoundingClientRect();
  const inside =
    event.clientX >= r.left &&
    event.clientX <= r.right &&
    event.clientY >= r.top &&
    event.clientY <= r.bottom;
  release();
  if (
    inside &&
    ((!p.moved &&
      Math.hypot(event.clientX - p.startX, event.clientY - p.startY) < 10) ||
      (p.moved && motion.matches))
  )
    turn(direction * 130);
});
for (const name of ['pointercancel', 'lostpointercapture'] as const)
  wheel.addEventListener(name, (event) => {
    if (pointer?.id === event.pointerId) stop();
  });
wheel.addEventListener('click', (event) => {
  if (event.detail === 0) turn(direction * 130);
});
wheel.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(event.key)) return;
  event.preventDefault();
  if (event.repeat) return;
  turn(
    (event.key === 'ArrowLeft'
      ? -1
      : event.key === 'ArrowRight'
        ? 1
        : direction) * 130,
  );
});
wheel.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('blur', stop);
window.addEventListener('resize', stop);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
window.addEventListener('pagehide', () => {
  stop();
  angle = 0;
  direction = 1;
  status.textContent = '';
  render();
});
motion.addEventListener('change', stop);
render();
