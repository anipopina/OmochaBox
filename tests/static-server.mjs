import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/vnd.microsoft.icon',
};

export function createStaticServer(directory, intercept = async () => false) {
  const root = resolve(directory);
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      let path = resolve(root, '.' + pathname);
      if (path !== root && !path.startsWith(root + sep)) {
        response.writeHead(403).end();
        return;
      }
      if (await intercept(request, response, pathname)) return;
      if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
      const data = await readFile(path);
      response.setHeader(
        'Content-Type',
        mime[extname(path)] || 'application/octet-stream',
      );
      response.end(data);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
}
