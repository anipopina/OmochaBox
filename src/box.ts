import pinwheelRotor from './kurukuru-kazaguruma/assets/rotor.svg';
import stampSquare from './assets/characters/shapes/01-coral-square.svg';
import stampCyan from './assets/characters/shapes/02-cyan-circle.svg';
import stampStar from './assets/characters/shapes/05-coral-star.svg';
import { games } from './games';
import { requireElement } from './shared/dom';
import windowPreviewUrl from './assets/previews/fukifuki-mado.webp';
import slidePreviewUrl from './assets/previews/korokoro-suberidai.svg';
import balloonCyan from './pukapuka-fusen/assets/cyan.svg';
import balloonStar from './pukapuka-fusen/assets/star.svg';
import balloonTriangle from './pukapuka-fusen/assets/triangle.svg';

const gamesContainer = requireElement('#games', HTMLDivElement);
for (const game of games) {
  const card = document.createElement('a');
  card.className = 'game-card';
  card.href = game.href;
  const art = document.createElement('div');
  art.className = 'garden-preview';
  art.setAttribute('aria-hidden', 'true');
  art.innerHTML =
    '<span class="flower"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></span><span class="spark one">✦</span><span class="spark two">✧</span><span class="trail"></span>';
  if (game.id === 'fukifuki-mado') {
    art.className = 'window-preview';
    art.innerHTML = `<img src="${windowPreviewUrl}" alt="" loading="lazy"><span>ふきふき ✦</span>`;
  }
  if (game.id === 'pukapuka-fusen') {
    art.className = 'balloon-preview';
    art.innerHTML = `<img src="${balloonCyan}" alt="" loading="lazy"><img src="${balloonStar}" alt="" loading="lazy"><img src="${balloonTriangle}" alt="" loading="lazy">`;
  }
  if (game.id === 'ponpon-stamp') {
    art.className = 'stamp-preview';
    art.innerHTML = `<img src="${stampSquare}" alt="" loading="lazy"><img src="${stampCyan}" alt="" loading="lazy"><img src="${stampStar}" alt="" loading="lazy">`;
  }
  if (game.id === 'korokoro-suberidai') {
    art.className = 'slide-preview';
    art.innerHTML = `<img src="${slidePreviewUrl}" width="480" height="550" alt="" loading="lazy">`;
  }
  if (game.id === 'kurukuru-kazaguruma') {
    art.className = 'pinwheel-preview';
    art.innerHTML = `<span></span><img src="${pinwheelRotor}" width="640" height="640" alt="" loading="lazy">`;
  }
  if (game.id === 'kasanete-iroglass') {
    art.className = 'glass-preview';
    art.innerHTML = '<i></i><i></i><i></i>';
  }
  const copy = document.createElement('div');
  copy.className = 'card-copy';
  const title = document.createElement('h2');
  title.textContent = game.title;
  const desc = document.createElement('p');
  desc.textContent = game.description;
  const start = document.createElement('span');
  start.className = 'start';
  start.textContent = 'あそぶ →';
  copy.append(title, desc, start);
  card.append(art, copy);
  gamesContainer.append(card);
}
