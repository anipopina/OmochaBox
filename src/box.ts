import { games } from './games';
import previews from 'virtual:game-previews';
import {
  defaultGameIds,
  showPrototypesByDefault,
} from 'virtual:game-visibility';
import { requireElement } from './shared/dom';

const toggle = requireElement('#show-prototypes', HTMLInputElement);
const status = requireElement('#games-status', HTMLParagraphElement);
const defaultIds = new Set(defaultGameIds);
const preferenceKey = 'omochabox-show-prototypes';
toggle.checked = showPrototypesByDefault;
try {
  const saved = localStorage.getItem(preferenceKey);
  if (saved !== null) toggle.checked = saved === 'true';
} catch {
  // Storage can be unavailable; the switch still works for this page.
}
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
  if (!defaultIds.has(game.id)) {
    card.dataset.prototype = 'true';
    const badge = document.createElement('span');
    badge.className = 'prototype-badge';
    badge.textContent = '★ しさくひん';
    copy.append(badge);
  }
  copy.append(title, desc, start);
  card.append(art, copy);
  gamesContainer.append(card);
}

function updateVisibility() {
  let count = 0;
  for (const card of gamesContainer.querySelectorAll<HTMLAnchorElement>(
    '.game-card',
  )) {
    card.hidden = card.dataset.prototype === 'true' && !toggle.checked;
    if (!card.hidden) count++;
  }
  status.textContent = toggle.checked
    ? `しさくひんも いっしょ！ ${count}この あそび`
    : `${count}この あそび`;
}
updateVisibility();
toggle.addEventListener('change', () => {
  updateVisibility();
  try {
    localStorage.setItem(preferenceKey, String(toggle.checked));
  } catch {
    // Do not block switching when preferences cannot be saved.
  }
});
