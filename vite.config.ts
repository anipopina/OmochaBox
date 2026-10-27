import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import { publication } from './build/publication.ts';
import type { Plugin, UserConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('./', import.meta.url));
const sourceRoot = fileURLToPath(new URL('./src/', import.meta.url));

async function htmlEntries(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const pages = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== 'public')
        return htmlEntries(path);
      return entry.isFile() && entry.name.endsWith('.html') ? [path] : [];
    }),
  );
  return pages.flat().sort();
}

// The regression suite needs internal drawing state. Production and dev builds
// never load this fixture; inject before TypeScript compilation and minification.
function regressionHooks(): Plugin {
  return {
    name: 'drawing-regression-hooks',
    enforce: 'pre',
    async transform(code, id) {
      if (id !== join(sourceRoot, 'hikari-no-oekaki/app.ts')) return;
      const end = /\}\)\(\);\s*$/;
      if (!end.test(code))
        throw new Error('Drawing regression hook insertion point missing');
      const fixture = new URL(
        './tests/fixtures/hikari-hook.js',
        import.meta.url,
      );
      this.addWatchFile(fileURLToPath(fixture));
      const hook = await readFile(fixture, 'utf8');
      return { code: code.replace(end, `${hook}\n})();`), map: null };
    },
  };
}

export default defineConfig(async ({ mode }): Promise<UserConfig> => {
  const production = mode === 'aws';
  const release = await publication(projectRoot, production);
  const entries = await htmlEntries(sourceRoot);
  const published = new Set(
    [
      'index.html',
      '404.html',
      ...release.games.map((game) => game.href + 'index.html'),
    ].map((path) => join(sourceRoot, path)),
  );
  return {
    root: sourceRoot,
    appType: 'mpa',
    server: { host: '127.0.0.1', port: 4173, strictPort: true },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
    plugins: [release.plugin, ...(mode === 'test' ? [regressionHooks()] : [])],
    build: {
      outDir:
        mode === 'test'
          ? '../test-results/build'
          : production
            ? '../dist-production'
            : '../dist',
      emptyOutDir: true,
      manifest: true,
      // Existing games use modern Canvas/Web Audio; preserve ES2022 syntax support.
      target: 'es2022',
      rolldownOptions: {
        input: production
          ? entries.filter((path) => published.has(path))
          : entries,
      },
    },
  };
});
