import '../shared/home-button';
import { Friend, type Food } from './model';
import body from './assets/body.webp';
import strawberry from './assets/strawberry.webp';
import banana from './assets/banana.webp';
import carrot from './assets/carrot.webp';

const assets = { strawberry, banana, carrot };
const names = { strawberry: 'いちご', banana: 'バナナ', carrot: 'にんじん' };
const friend = new Friend();
const character = document.querySelector<HTMLDivElement>('#friend')!;
const flying = document.querySelector<HTMLImageElement>('#flying-food')!;
const mouthFood = document.querySelector<SVGImageElement>('#mouth-food')!;
const status = document.querySelector<HTMLSpanElement>('#status')!;
const buttons = [
  ...document.querySelectorAll<HTMLButtonElement>('[data-food]'),
];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
document.querySelector<HTMLImageElement>('.body-art')!.src = body;
let frame = 0;
let last = 0;
let previous = '';

function render() {
  character.dataset.phase = friend.phase;
  character.dataset.food = friend.food;
  character.dataset.reaction = String(friend.reaction);
  character.style.setProperty('--chew', String(Math.sin(friend.elapsed / 115)));
  for (const button of buttons)
    button.classList.toggle('next', button.dataset.food === friend.next);
  const phaseKey = `${friend.phase}:${friend.food}`;
  if (phaseKey !== previous) {
    previous = phaseKey;
    if (friend.phase === 'happy')
      status.textContent = `${names[friend.food]}、おいしい！`;
    if (friend.phase === 'offering') {
      flying.src = assets[friend.food];
      mouthFood.setAttribute('href', assets[friend.food]);
    }
  }
  flying.hidden = friend.phase !== 'offering';
  mouthFood.style.opacity = '0';
  if (friend.phase !== 'offering') return;
  const p = Math.min(1, friend.elapsed / 650);
  const source = buttons
    .find((button) => button.dataset.food === friend.food)!
    .getBoundingClientRect();
  const target = character.getBoundingClientRect();
  const start = {
    x: source.x + source.width / 2,
    y: source.y + source.height / 2,
  };
  const end = {
    x: target.x + target.width * 0.5,
    y: target.y + target.height * 0.58,
  };
  // Food crosses the lip at 72%; thereafter it is rendered INSIDE the mouth clip.
  const travel = Math.min(1, p / 0.72);
  const eased = 1 - Math.pow(1 - travel, 2);
  const size = target.width * 0.176;
  flying.style.width = `${size}px`;
  flying.style.left = `${start.x + (end.x - start.x) * eased}px`;
  flying.style.top = `${start.y + (end.y - start.y) * eased - (reduced.matches ? 0 : Math.sin(travel * Math.PI) * 65)}px`;
  flying.style.transform = `translate(-50%, -50%) rotate(${reduced.matches ? 0 : -14 * Math.sin(travel * Math.PI)}deg)`;
  flying.hidden = p >= 0.72;
  if (p >= 0.72) {
    const swallow = (p - 0.72) / 0.28;
    mouthFood.style.opacity = String(1 - swallow);
    mouthFood.setAttribute('y', String(246 + swallow * 35));
    mouthFood.setAttribute(
      'transform',
      `translate(${250 * swallow * 0.4} ${290 * swallow * 0.4}) scale(${1 - swallow * 0.4})`,
    );
  }
}
function tick(time: number) {
  frame = 0;
  friend.step(last ? time - last : 0);
  last = time;
  render();
  if (friend.phase !== 'idle') frame = requestAnimationFrame(tick);
  else last = 0;
}
for (const button of buttons) {
  const food = button.dataset.food as Food;
  button.querySelector('img')!.src = assets[food];
  button.addEventListener('click', () => {
    button.getAnimations().forEach((animation) => animation.cancel());
    button.animate(
      reduced.matches
        ? [{ opacity: 0.65 }, { opacity: 1 }]
        : [
            { transform: 'scale(1)' },
            { transform: 'translateY(-12px) scale(1.14)' },
            { transform: 'scale(1)' },
          ],
      { duration: 300 },
    );
    friend.offer(food);
    render();
    if (!frame) frame = requestAnimationFrame(tick);
  });
}
function reset() {
  cancelAnimationFrame(frame);
  frame = last = 0;
  friend.reset();
  buttons.forEach((button) =>
    button.getAnimations().forEach((animation) => animation.cancel()),
  );
  status.textContent = '';
  render();
}
window.addEventListener('blur', reset);
window.addEventListener('pagehide', reset);
window.addEventListener('pageshow', reset);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) reset();
});
window.addEventListener('resize', reset);
reduced.addEventListener('change', reset);
render();
character.dataset.ready = 'true';
