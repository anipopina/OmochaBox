import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const hashes = JSON.parse(
  await readFile(new URL('source-assets/characters/sha256.json', root), 'utf8'),
);
for (const [series, count] of [
  ['shapes', 6],
  ['aquarium', 8],
]) {
  const directory = new URL(`src/assets/characters/${series}/`, root);
  const names = (await readdir(directory)).sort();
  const expected = Object.keys(hashes)
    .filter((name) => name.startsWith(`${series}/`))
    .map((name) => name.split('/')[1])
    .sort();
  assert.equal(names.length, count);
  assert.deepEqual(names, expected);
  for (const name of names) {
    const data = await readFile(new URL(name, directory));
    assert.equal(
      createHash('sha256').update(data).digest('hex'),
      hashes[`${series}/${name}`],
      `${series}/${name}: original SVG bytes`,
    );
  }
}
assert.equal(
  (await readdir(new URL('src/assets/characters/', root))).filter((name) =>
    name.endsWith('.svg'),
  ).length,
  0,
);
console.log(
  'Characters PASS: 6 shapes + 8 manually revised aquarium SVGs, exact SHA-256, series directories',
);
