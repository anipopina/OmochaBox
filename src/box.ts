import stampSquare from './assets/characters/shapes/01-coral-square.svg';
import stampCyan from './assets/characters/shapes/02-cyan-circle.svg';
import stampStar from './assets/characters/shapes/05-coral-star.svg';
import { games } from './games';
import { requireElement } from './shared/dom';
import windowPreviewUrl from './assets/previews/fukifuki-mado.webp';
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
