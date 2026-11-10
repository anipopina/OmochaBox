import { runInNewContext } from 'node:vm';
import { games, catalogueReady } from './catalogue.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access } from 'node:fs/promises';
import { plan, toyTests } from './test-plan.mjs';
import { runSteps, execute } from './runner.mjs';

test('strict arguments and catalogue coverage', async () => {
  for (const args of [
    ['toy'],
    ['toy', ['missing']],
    ['smoke', ['--typo']],
    ['full', ['mizutamari']],
    ['list', ['x']],
    ['bad'],
  ])
    assert.throws(() => plan(...args));
  for (const suite of new Set(Object.values(toyTests).flat()))
    await access(new URL(`./${suite}.mjs`, import.meta.url));
});
test('daily scope excludes AWS and unrelated detail; legacy shared suites are explicit', () => {
  const daily = plan('toy', ['pitatto-magnet']).map((step) => step.id);
  assert.deepEqual(daily, [
    'build',
    'build-output',
    'home-button',
    'magnet-model',
    'magnet',
  ]);
  assert.ok(
    plan('toy', ['hikari-no-oekaki']).some((step) => step.id === 'build:test'),
  );
  assert.deepEqual(
    plan('smoke').map((step) => step.id),
    ['build', 'build-output', 'home-button'],
  );
  const full = plan('full');
  assert.equal(new Set(full.map((step) => step.id)).size, full.length);
  for (const suite of new Set(Object.values(toyTests).flat()))
    assert.ok(full.some((step) => step.id === suite));
});
test('failures and spawn errors are collected, dependencies skip, unrelated work continues', async () => {
  const make = (id, code, needs = []) => ({
    id,
    command: process.execPath,
    args: ['-e', `process.exit(${code})`],
    needs,
  });
  const results = await runSteps([
    make('broken', 2),
    make('dependent', 0, ['broken']),
    {
      id: 'missing',
      command: '/nonexistent/omochabox-test-command',
      args: [],
      needs: [],
    },
    make('later', 0),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    ['FAIL', 'SKIP', 'FAIL', 'PASS'],
  );
  assert.ok(results.every((r) => r.seconds >= 0));
  assert.equal((await execute(make('ok', 0))).code, 0);
});

test('catalogue predicate rejects missing, duplicate and misdirected cards', () => {
  const links = games.map((game) => game.href);
  const ready = (hrefs) =>
    runInNewContext(catalogueReady, {
      document: {
        querySelectorAll: () =>
          hrefs.map((href) => ({ getAttribute: () => href })),
      },
    });
  assert.equal(ready(links), true);
  assert.equal(ready(links.slice(1)), false);
  assert.equal(ready([...links, links[0]]), false);
  assert.equal(
    ready(links.map((href, i) => (i === 0 ? links[1] : href))),
    false,
  );
  assert.equal(
    ready(links.map((href, i) => (i === 0 ? 'wrong/' : href))),
    false,
  );
});
