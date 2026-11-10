import { readFile } from 'node:fs/promises';
export const games = JSON.parse(
  await readFile(new URL('../src/games.json', import.meta.url), 'utf8'),
);
export const gameCount = games.length;
// Compare the complete ordered list, so duplicate, missing and wrong links fail.
export const catalogueReady = `JSON.stringify([...document.querySelectorAll('.game-card')].map(a => a.getAttribute('href'))) === ${JSON.stringify(JSON.stringify(games.map((game) => game.href)))}`;
