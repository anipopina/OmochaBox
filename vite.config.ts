import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin, UserConfig } from 'vite';

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

export default defineConfig(async ({ mode }): Promise<UserConfig> => ({
  root: sourceRoot,
  appType: 'mpa',
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  plugins: mode === 'test' ? [regressionHooks()] : [],
  build: {
    outDir: mode === 'test' ? '../test-results/build' : '../dist',
    emptyOutDir: true,
    manifest: true,
    // Existing games use modern Canvas/Web Audio; preserve ES2022 syntax support.
    target: 'es2022',
    rolldownOptions: { input: await htmlEntries(sourceRoot) },
  },
}));
