import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import type { Game } from '../src/games.ts';

export const sitesOrigin = 'https://omochabox.ryonchibi.chatgpt.site';

export function selectGames(
  catalogue: readonly Game[],
  flags: unknown,
): Game[] {
  if (!flags || typeof flags !== 'object' || Array.isArray(flags))
    throw new Error(
      'production-games.json must be an object of game IDs and booleans',
    );
  const known = new Set(catalogue.map((game) => game.id));
  for (const [id, enabled] of Object.entries(flags)) {
    if (!known.has(id)) throw new Error(`Unknown production game: ${id}`);
    if (typeof enabled !== 'boolean')
      throw new Error(`Use true/false for ${id}`);
  }
  return catalogue.filter(
    (game) => (flags as Record<string, boolean>)[game.id] === true,
  );
}

export async function publication(root: string, production: boolean) {
  const source = join(root, 'src');
  const catalogue: Game[] = JSON.parse(
    await readFile(join(source, 'games.json'), 'utf8'),
  );
  const config = JSON.parse(
    await readFile(join(root, 'infra/config.json'), 'utf8'),
  );
  const games = production
    ? selectGames(
        catalogue,
        JSON.parse(
          await readFile(join(root, 'config/production-games.json'), 'utf8'),
        ),
      )
    : catalogue;
  const origin = production ? `https://${config.domainName}` : sitesOrigin;
  const plugin: Plugin = {
    name: 'published-games',
    configureServer(server) {
      const watched = [
        join(source, 'games.json'),
        join(root, 'config/production-games.json'),
        join(root, 'infra/config.json'),
      ];
      server.watcher.add(watched);
      server.watcher.on('change', (path) => {
        if (watched.includes(path)) void server.restart();
      });
    },
    enforce: 'pre',
    resolveId(id) {
      if (id === 'virtual:game-previews') return '\0' + id;
    },
    load(id) {
      if (id === join(source, 'games.json')) return JSON.stringify(games);
      if (id === '\0virtual:game-previews') {
        return (
          games
            .map(
              (game, i) =>
                `import preview${i} from ${JSON.stringify(join(source, 'previews', game.id + '.ts'))};`,
            )
            .join('\n') +
          `export default {${games.map((game, i) => `${JSON.stringify(game.id)}:preview${i}`).join(',')}};`
        );
      }
    },
    transformIndexHtml(html) {
      html = html.replaceAll(sitesOrigin, origin);
      // The fallback must never link to an unpublished game.
      if (production)
        html = html.replace(
          /<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/,
          '<noscript><p>遊ぶにはJavaScriptを有効にしてください。</p></noscript>',
        );
      return html;
    },
    generateBundle() {
      if (production)
        this.emitFile({
          type: 'asset',
          fileName: 'publication.json',
          source: JSON.stringify(
            { origin, games: games.map((game) => game.id) },
            null,
            2,
          ),
        });
    },
  };
  return { games, plugin };
}
