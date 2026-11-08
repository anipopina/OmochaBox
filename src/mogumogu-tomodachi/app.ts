import '../shared/home-button';
import { Friend, friends, type Food } from './model';
import body from './assets/body.webp';
import ghost from './assets/ghost-body.webp';
import bear from './assets/bear-body.webp';
import strawberry from './assets/strawberry.webp';
import banana from './assets/banana.webp';
import carrot from './assets/carrot.webp';

const assets = { strawberry, banana, carrot };
const bodies = { monster: body, ghost, bear };
const friendNames = { monster: 'かいじゅう', ghost: 'おばけ', bear: 'くま' };
const names = { strawberry: 'いちご', banana: 'バナナ', carrot: 'にんじん' };
const friend = new Friend();
const character = document.querySelector<HTMLButtonElement>('#friend')!;
const artwork = document.querySelector<HTMLSpanElement>('.friend-art')!;
const flying = document.querySelector<HTMLImageElement>('#flying-food')!;
const mouthFood = document.querySelector<SVGImageElement>('#mouth-food')!;
const status = document.querySelector<HTMLSpanElement>('#status')!;
const buttons = [
  ...document.querySelectorAll<HTMLButtonElement>('#foods [data-food]'),
];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let bodyArtwork = document.querySelector<HTMLImageElement>('.body-art')!;
const message = document.querySelector<HTMLSpanElement>('.friend-message')!;
const bodyLoads = new Map<number, Promise<HTMLImageElement>>();
let shownCharacter = -1;
let requestedCharacter = -1;
let artState: 'loading' | 'ready' | 'error' = 'loading';

function loadBody(index: number) {
  let pending = bodyLoads.get(index);
  if (!pending) {
    const image = new Image();
    image.className = 'body-art';
    image.alt = '';
    image.draggable = false;
    image.src = bodies[friends[index]!];
    pending = image.decode().then(() => image);
    bodyLoads.set(index, pending);
  }
  return pending;
}
function preloadBodies() {
  return Promise.allSettled(friends.map((_, index) => loadBody(index)));
}
void preloadBodies();

function showBody(index: number, image: HTMLImageElement) {
  // Insert the already decoded node; never change src on the visible image.
  bodyArtwork.replaceWith(image);
  bodyArtwork = image;
  shownCharacter = requestedCharacter = friend.character = index;
  artState = 'ready';
  character.dataset.artState = artState;
  character.dataset.character = friends[index];
  character.dataset.ready = 'true';
  character.setAttribute(
    'aria-label',
    `${friendNames[friends[index]!]}に ふれる`,
  );
  message.textContent = '';
  render();
}
function prepareCharacter() {
  if (requestedCharacter === friend.character) return;
  const target = friend.character;
  requestedCharacter = target;
  artState = 'loading';
  character.dataset.artState = artState;
  character.dataset.ready = 'false';
  character.setAttribute('aria-label', 'おともだちを よんでいるよ');
  message.textContent = 'おともだちを よんでいるよ';
  void loadBody(target).then(
    (image) => {
      if (requestedCharacter === target && friend.character === target)
        showBody(target, image);
    },
    async () => {
      const results = await preloadBodies();
      if (requestedCharacter !== target || friend.character !== target) return;
      // A failed asset must not prevent playing with the decoded friends.
      const available = results.flatMap((result, index) =>
        result.status === 'fulfilled' ? [{ index, image: result.value }] : [],
      );
      const fallback =
        available.find(({ index }) => index !== shownCharacter) ?? available[0];
      if (fallback) showBody(fallback.index, fallback.image);
      else {
        artState = 'error';
        character.dataset.artState = artState;
        character.setAttribute('aria-label', 'もういちど おともだちを よぶ');
        message.textContent = 'もういちど あう';
        status.textContent =
          'おともだちを よべなかったよ。もういちど あう を おしてね';
      }
    },
  );
}
let frame = 0;
let last = 0;
let previous = '';

function render() {
  prepareCharacter();
  character.dataset.phase = friend.phase;
  character.dataset.touched = String(friend.touchRemaining > 0);
  character.dataset.touchReaction = String(friend.touchReaction);
  const touchProgress = 1 - friend.touchRemaining / 520;
  const squeeze =
    friend.phase === 'idle' && !reduced.matches
      ? Math.sin(touchProgress * Math.PI) * 0.065
      : 0;
  artwork.style.scale = `${1 - squeeze * 0.45} ${1 - squeeze}`;
  artwork.style.translate =
    friend.touchReaction === 1 ? `0 ${-squeeze * 420}px` : '0 0';
  artwork.style.rotate =
    friend.touchReaction === 2
      ? `${Math.sin(touchProgress * Math.PI * 2) * squeeze * 90}deg`
      : '0deg';
  character.dataset.food = friend.food;
  character.dataset.reaction = String(friend.reaction);
  character.style.setProperty('--chew', String(Math.sin(friend.elapsed / 115)));
  for (const button of buttons) {
    const food = button.dataset.food as Food;
    const eaten = !friend.available.has(food);
    button.dataset.eaten = String(eaten);
    button.dataset.away = String(
      eaten || (friend.phase !== 'idle' && friend.food === food),
    );
    // Keep the focused native button in the tab order when its food disappears.
    button.setAttribute(
      'aria-disabled',
      String(
        artState !== 'ready' ||
          eaten ||
          friend.phase === 'changing' ||
          (friend.phase !== 'idle' && friend.food === food),
      ),
    );
    button.setAttribute(
      'aria-label',
      eaten ? `${names[food]}は たべたよ` : `${names[food]}を あげる`,
    );
  }
  const phaseKey = `${friend.phase}:${friend.food}:${friend.character}`;
  if (phaseKey !== previous) {
    previous = phaseKey;
    if (friend.phase === 'happy')
      status.textContent = `${names[friend.food]}、おいしい！`;
    if (friend.phase === 'changing')
      status.textContent = 'ごちそうさま！ つぎの おともだち';
    if (friend.phase === 'idle' && friend.available.size === 3)
      status.textContent = 'たべものを どうぞ';
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
    .querySelector('img')!
    .getBoundingClientRect();
  const target = artwork.getBoundingClientRect();
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
  const size = source.width + (target.width * 0.176 - source.width) * eased;
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
  if (friend.phase !== 'idle' || friend.touchRemaining > 0)
    frame = requestAnimationFrame(tick);
  else last = 0;
}
character.addEventListener('click', () => {
  if (artState !== 'ready') {
    if (artState === 'error') {
      bodyLoads.clear();
      requestedCharacter = -1;
      void preloadBodies();
      render();
    }
    return;
  }
  friend.touch();
  render();
  if (!frame) frame = requestAnimationFrame(tick);
});
for (const button of buttons) {
  const food = button.dataset.food as Food;
  button.querySelector('img')!.src = assets[food];
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-disabled') === 'true') return;
    if (friend.phase !== 'idle') {
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
      return;
    }
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
