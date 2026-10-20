import { games } from './games';
import { requireElement } from './shared/dom';
import gardenUrl from './fukifuki-mado/assets/garden.webp';

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
    art.innerHTML = `<img src="${gardenUrl}" alt="" loading="lazy"><span>ふきふき ✦</span>`;
  }
  const copy = document.createElement('div');
  copy.className = 'card-copy';
  const sub = document.createElement('p');
  sub.className = 'card-sub';
  sub.textContent = game.subtitle;
  const title = document.createElement('h2');
  title.textContent = game.title;
  const desc = document.createElement('p');
  desc.textContent = game.description;
  const start = document.createElement('span');
  start.className = 'start';
  start.textContent = 'あそぶ →';
  copy.append(sub, title, desc, start);
  card.append(art, copy);
  gamesContainer.append(card);
}
