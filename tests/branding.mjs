import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../dist/', import.meta.url);
const base = 'https://omochabox.ryonchibi.chatgpt.site';
for (const path of [
  'index.html',
  'hikari-no-oekaki/index.html',
  'fukifuki-mado/index.html',
  'pukapuka-fusen/index.html',
  'ponpon-stamp/index.html',
  'korokoro-suberidai/index.html',
  'kurukuru-kazaguruma/index.html',
  'kasanete-iroglass/index.html',
  'pochan-mizutamari/index.html',
]) {
  const html = await readFile(new URL(path, root), 'utf8');
  assert.equal(
    html.match(/property="og:url"\s+content="([^"]+)"/)?.[1],
    `${base}/${path.replace('index.html', '')}`,
    `${path}: sharing URL matches the page route`,
  );
  for (const icon of [
    'favicon.ico',
    'favicon-16x16.png',
    'favicon-32x32.png',
    'apple-touch-icon.png',
  ]) {
    assert.ok(html.includes(`href="/${icon}"`), `${path}: ${icon}`);
    await readFile(new URL(icon, root));
  }
  assert.equal((html.match(/property="og:image"/g) || []).length, 1);
  assert.ok(html.includes(`content="${base}/assets/branding/ogp.png"`));
  assert.ok(html.includes('property="og:image:width" content="1200"'));
  assert.ok(html.includes('property="og:image:height" content="630"'));
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
  if (path === 'index.html')
    assert.ok(
      html.includes('href="https://anipopina.com/"'),
      'Hub footer retained',
    );
  else
    assert.ok(
      !html.includes('href="https://anipopina.com/"'),
      'Game pages omit creator links',
    );
}
for (const [path, width, height, colorType] of [
  ['favicon-16x16.png', 16, 16, 6],
  ['favicon-32x32.png', 32, 32, 6],
  ['favicon-48x48.png', 48, 48, 6],
  ['apple-touch-icon.png', 180, 180, 2],
  ['assets/branding/ogp.png', 1200, 630, 2],
]) {
  const data = await readFile(new URL(path, root));
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(data.readUInt32BE(16), width);
  assert.equal(data.readUInt32BE(20), height);
  assert.equal(data[25], colorType, `${path}: expected RGB/RGBA type`);
}
const ico = await readFile(new URL('favicon.ico', root));
assert.equal(ico.readUInt16LE(0), 0);
assert.equal(ico.readUInt16LE(2), 1);
assert.equal(ico.readUInt16LE(4), 3);
assert.deepEqual(
  [0, 1, 2].map((i) => ico[6 + i * 16]),
  [16, 32, 48],
);
console.log(
  'Branding PASS: 9 HTML pages, local references, footer, OGP metadata, PNG dimensions/modes, ICO 16/32/48 frames',
);
