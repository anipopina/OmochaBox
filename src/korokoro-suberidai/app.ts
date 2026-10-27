import '../shared/home-button';
import { requireElement } from '../shared/dom';
import { LIFE_MS, MAX_BALLS, REDUCED_LIFE_MS, positionAt } from './model';
const layer = requireElement('#balls', SVGGElement);
const status = requireElement('#status', HTMLParagraphElement);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const colors = ['red', 'yellow', 'blue'];
const names = ['あかい', 'きいろい', 'あおい'];
type Ball = {
  element: SVGGElement;
  born: number;
  lane: number;
  reduced: boolean;
};
const balls: Ball[] = [];
let frame = 0,
  sequence = 0;
function render(ball: Ball, now: number) {
  const age = now - ball.born;
  const point = positionAt(age, ball.lane, ball.reduced);
  ball.element.setAttribute('transform', `translate(${point.x} ${point.y})`);
  ball.element.dataset.phase = point.phase;
  const lifetime = ball.reduced ? REDUCED_LIFE_MS : LIFE_MS;
  ball.element.style.opacity = String(
    Math.max(0, Math.min(1, (lifetime - age) / 400)),
  );
}
function tick(now: number) {
  frame = 0;
  for (let i = balls.length - 1; i >= 0; i--) {
    const ball = balls[i];
    if (now - ball.born >= (ball.reduced ? REDUCED_LIFE_MS : LIFE_MS)) {
      ball.element.remove();
      balls.splice(i, 1);
    } else render(ball, now);
  }
  if (balls.length) frame = requestAnimationFrame(tick);
}
function launch(color: number) {
  if (document.hidden) return;
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  element.classList.add('ball');
  element.dataset.color = colors[color];
  // The original concept is reference-only. These are small, resolution-independent shapes.
  element.innerHTML = `<ellipse cy="18" rx="17" ry="4" fill="#183a4b" opacity=".12"/><circle r="23" fill="url(#ball-${colors[color]})"/><ellipse cx="-8" cy="-10" rx="4" ry="7" transform="rotate(32 -8 -10)" fill="#fff" opacity=".45"/>`;
  const ball = {
    element,
    born: performance.now(),
    lane: sequence++ % 6,
    reduced: motion.matches,
  };
  if (balls.length >= MAX_BALLS) balls.shift()?.element.remove();
  balls.push(ball);
  render(ball, ball.born);
  layer.append(element);
  status.textContent = `${names[color]} たま、ころころ！`;
  if (!frame) frame = requestAnimationFrame(tick);
}
document
  .querySelectorAll<HTMLButtonElement>('.supply')
  .forEach((button, color) => {
    button.addEventListener('click', () => launch(color));
    button.addEventListener('keydown', (event) => {
      if (event.repeat && (event.key === ' ' || event.key === 'Enter'))
        event.preventDefault();
    });
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });
function clear() {
  cancelAnimationFrame(frame);
  frame = 0;
  balls.splice(0).forEach((ball) => ball.element.remove());
  status.textContent = '';
}
window.addEventListener('pagehide', clear);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clear();
});
motion.addEventListener('change', clear);
