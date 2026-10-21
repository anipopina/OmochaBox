import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const directory = resolve(import.meta.dirname, '../dist');
const manifest = JSON.parse(
  await readFile(join(directory, '.vite/manifest.json'), 'utf8'),
);
const origin = 'https://omochabox.test';

// Every emitted entry, shared chunk and imported asset must exist after bundling.
for (const entry of Object.values(manifest)) {
  for (const file of [
    entry.file,
    ...(entry.css || []),
    ...(entry.assets || []),
  ]) {
    assert.ok(
      (await stat(join(directory, file))).isFile(),
      `Missing bundled file: ${file}`,
    );
  }
  for (const dependency of entry.imports || []) {
    assert.ok(
      manifest[dependency],
      `Missing manifest dependency: ${dependency}`,
    );
  }
}

for (const page of Object.keys(manifest).filter((key) =>
  key.endsWith('.html'),
)) {
  const html = await readFile(join(directory, page), 'utf8');
  assert.ok(!/src="[^"]+\.ts"/.test(html), `${page}: uncompiled TypeScript`);
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = new URL(reference, `${origin}/${page}`);
    if (url.origin !== origin) continue;
    let file = join(directory, decodeURIComponent(url.pathname));
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    assert.ok((await stat(file)).isFile(), `${page}: missing ${reference}`);
  }
}

for (const file of await readdir(join(directory, 'assets'))) {
  if (!file.endsWith('.js')) continue;
  const code = await readFile(join(directory, 'assets', file), 'utf8');
  assert.ok(
    !code.includes('__test'),
    `${file}: regression hooks in production`,
  );
  assert.ok(
    !code.includes('audioEvents'),
    `${file}: test instrumentation in production`,
  );
}

// Media is renamed, not re-encoded; keep the approved optimized assets unchanged.
for (const [source, entry] of Object.entries(manifest)) {
  if (!/\.(webp|mp3|svg)$/.test(source)) continue;
  assert.deepEqual(
    await readFile(join(directory, entry.file)),
    await readFile(join('src', source)),
  );
}

console.log(
  'Build PASS: all page/asset references, shared chunks, original media bytes, no production test hooks',
);
