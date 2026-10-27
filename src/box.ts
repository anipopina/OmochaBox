import { games } from './games';
import previews from 'virtual:game-previews';
import { requireElement } from './shared/dom';

const gamesContainer = requireElement('#games', HTMLDivElement);
for (const game of games) {
  const card = document.createElement('a');
  card.className = 'game-card';
  card.href = game.href;
  const art = document.createElement('div');
  const preview = previews[game.id]();
  art.className = preview.className;
  art.setAttribute('aria-hidden', 'true');
  art.innerHTML = preview.html;
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
