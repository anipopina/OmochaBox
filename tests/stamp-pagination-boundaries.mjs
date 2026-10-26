// Build a test-only catalogue with boundaries inside pages, then exercise the
// real browser UI. Production source, dist and assets are never changed.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'test-results/stamp-boundaries-build');
let transformed = false;
await build({
  configFile: resolve(root, 'vite.config.ts'),
  logLevel: 'error',
  plugins: [
    {
      name: 'stamp-boundary-catalogue-fixture',
      enforce: 'pre',
      transform(code, id) {
        if (id !== resolve(root, 'src/ponpon-stamp/sets.ts')) return;
        const declaration = 'export const stampSets: readonly StampSet[] = [';
        assert.ok(
          code.includes(declaration),
          'Catalogue fixture insertion point exists',
        );
        transformed = true;
        return {
          code:
            code.replace(
              declaration,
              'const originalSets: readonly StampSet[] = [',
            ) +
            `
const allItems = originalSets.flatMap(set => set.items);
export const stampSets: readonly StampSet[] = [
  {id:'fixture-a',name:'Fixture A',icon:allItems[0].src,items:allItems.slice(0,2)},
  {id:'fixture-b',name:'Fixture B',icon:allItems[2].src,items:allItems.slice(2,7)},
  {id:'fixture-c',name:'Fixture C',icon:allItems[7].src,items:allItems.slice(7)},
];
window.__stampFixtureGroups = stampSets.map(set => set.items.map(item => item.id));
`,
          map: null,
        };
      },
    },
  ],
  build: { outDir: output, emptyOutDir: true },
});
assert.ok(transformed, 'The browser build uses the synthetic catalogue');
process.env.STAMP_BUILD_DIRECTORY = output;
process.env.STAMP_RESULTS_DIRECTORY = resolve(
  root,
  'test-results/stamp-boundaries',
);
process.env.STAMP_EXPECT_BOUNDARIES = '1';
await import('./stamp.mjs');
