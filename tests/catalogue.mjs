import { readFile } from 'node:fs/promises';
export const gameCount = JSON.parse(
  await readFile(new URL('../src/games.json', import.meta.url), 'utf8'),
).length;
