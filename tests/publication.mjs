import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { selectGames } from '../build/publication.ts';

const root = resolve(import.meta.dirname, '..');
const json = async (path) =>
  JSON.parse(await readFile(join(root, path), 'utf8'));
const catalogue = await json('src/games.json');
const flags = await json('config/production-games.json');
const selected = selectGames(catalogue, flags);
assert.deepEqual(
  selectGames(catalogue, {}),
  [],
  'Unapproved games default to excluded',
);
assert.throws(() => selectGames(catalogue, { typo: true }), /Unknown/);
assert.throws(
  () => selectGames(catalogue, { [catalogue[0].id]: 'true' }),
  /true\/false/,
);
for (const bad of [null, [], true])
  assert.throws(() => selectGames(catalogue, bad));
for (const [directory, games, origin] of [
  ['dist', catalogue, 'https://omochabox.ryonchibi.chatgpt.site'],
  ['dist-production', selected, 'https://omochabox.anipopina.com'],
]) {
  const manifest = await json(`${directory}/.vite/manifest.json`);
  const entries = Object.keys(manifest)
    .filter((key) => key.endsWith('.html'))
    .sort();
  assert.deepEqual(
    entries,
    ['index.html', ...games.map((g) => g.href + 'index.html')].sort(),
  );
  for (const game of games) {
    const html = await readFile(
      join(root, directory, game.href, 'index.html'),
      'utf8',
    );
    assert.ok(html.includes(`content="${origin}/${game.href}"`));
    assert.ok(html.includes(`content="${origin}/assets/branding/ogp.png"`));
  }
  assert.ok(
    (await readFile(join(root, directory, '404.html'), 'utf8')).includes(
      'href="/"',
    ),
  );
  const hub = await readFile(join(root, directory, 'index.html'), 'utf8');
  assert.ok(hub.includes('https://anipopina.com/'));
  if (directory === 'dist-production') {
    const scripts = (await readdir(join(root, directory, 'assets'))).filter(
      (file) => file.endsWith('.js'),
    );
    const code = (
      await Promise.all(
        scripts.map((file) =>
          readFile(join(root, directory, 'assets', file), 'utf8'),
        ),
      )
    ).join('\n');
    for (const game of catalogue.filter(
      (g) => !games.some((p) => p.id === g.id),
    )) {
      assert.ok(
        !code.includes(game.id),
        `${game.id}: excluded from bundled code`,
      );
      assert.ok(!hub.includes(game.href), `${game.id}: no fallback link`);
      assert.ok(
        !Object.keys(manifest).some(
          (key) =>
            key === game.id + '/app.ts' ||
            key.includes('/previews/' + game.id + '.'),
        ),
        `${game.id}: no game runtime or dedicated preview`,
      );
    }
    assert.deepEqual(
      (await json(`${directory}/publication.json`)).games,
      games.map((g) => g.id),
    );
  }
}
console.log(
  'Publication PASS: Sites includes all games; production includes only allowlisted pages, code, previews and correct sharing URLs',
);
