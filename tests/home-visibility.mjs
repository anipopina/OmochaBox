import { createStaticServer } from './static-server.mjs';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const binary = process.env.CHROME_PATH || '/usr/bin/chromium';
const profile = await mkdtemp(join(tmpdir(), 'omochabox-visibility-'));
const catalogue = JSON.parse(
  await readFile(join(root, 'src/games.json'), 'utf8'),
);
const flags = JSON.parse(
  await readFile(join(root, 'config/production-games.json'), 'utf8'),
);
const defaults = catalogue
  .filter((game) => flags[game.id] === true)
  .map((game) => game.href);
const prototype = catalogue.find((game) => flags[game.id] !== true);
const errors = [];
const server = createStaticServer(join(root, 'dist-production'));
const sites = createStaticServer(join(root, 'dist'));
await Promise.all(
  [server, sites].map(
    (server) =>
      new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)),
  ),
);
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(
  binary,
  [
    '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);
let ws;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = (
        await readFile(join(profile, 'DevToolsActivePort'), 'utf8')
      ).split('\n')[0];
      break;
    } catch {
      await delay(100);
    }
  }
  assert.ok(port, 'Chromium started');
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown')
      errors.push(m.params.exceptionDetails);
    if (m.id) {
      const p = pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(m.id);
      m.error ? p.reject(m.error) : p.resolve(m.result);
    }
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => {
        pending.delete(key);
        reject(
          new Error(
            'Browser command timed out: ' +
              method +
              ' ' +
              JSON.stringify(params),
          ),
        );
      }, 15000);
      pending.set(key, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: key, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await delay(50);
    }
    assert.fail(`Timed out waiting for ${expression}`);
  };
  await call('Runtime.enable');
  await call('Page.enable');
  const ready = () =>
    waitFor(
      `document.querySelectorAll('.game-card').length === ${catalogue.length}`,
    );
  const visible = () =>
    evaluate(
      `Array.from(document.querySelectorAll('.game-card')).filter(card => getComputedStyle(card).display !== 'none').map(card => card.getAttribute('href'))`,
    );
  const clickSwitch = async () => {
    const point = await evaluate(
      `(() => { const r = document.querySelector('#show-prototypes').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
    );
    for (const type of ['mousePressed', 'mouseReleased'])
      await call('Input.dispatchMouseEvent', {
        type,
        ...point,
        button: 'left',
        clickCount: 1,
      });
  };
  await call('Page.navigate', { url: origin });
  await ready();
  assert.deepEqual(
    await visible(),
    defaults,
    'Fresh AWS visit shows approved games only',
  );
  assert.equal(
    await evaluate(`document.querySelector('#show-prototypes').checked`),
    false,
  );
  for (const width of [320, 390, 820, 1180]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    assert.equal(
      await evaluate(`document.documentElement.scrollWidth <= innerWidth`),
      true,
      `${width}: no overflow`,
    );
    assert.equal(
      await evaluate(
        `(() => {const r = document.querySelector('#show-prototypes').getBoundingClientRect(); return r.width >= 56 && r.height >= 56;})()`,
      ),
      true,
      `${width}: switch target >=56px`,
    );
  }
  await clickSwitch();
  assert.deepEqual(
    await visible(),
    catalogue.map((game) => game.href),
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('.prototype-badge').length`),
    catalogue.length - defaults.length,
  );
  await evaluate(
    `document.querySelector('a[href="${prototype.href}"]').click()`,
  );
  await waitFor(`!!document.querySelector('#back')`);
  assert.equal(
    await evaluate('location.pathname'),
    '/' + prototype.href,
    'Prototype page opens',
  );
  await evaluate(`document.querySelector('#back').click()`);
  await ready();
  assert.equal(
    (await visible()).length,
    catalogue.length,
    'Return retains opt-in',
  );
  await call('Page.reload');
  await ready();
  assert.equal(
    (await visible()).length,
    catalogue.length,
    'Reload retains opt-in',
  );
  await evaluate(`document.querySelector('#show-prototypes').focus()`);
  for (const type of ['keyDown', 'keyUp'])
    await call('Input.dispatchKeyEvent', {
      type,
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
    });
  assert.deepEqual(await visible(), defaults, 'Space key switches off');
  await call('Page.reload');
  await ready();
  assert.deepEqual(await visible(), defaults, 'Off preference persists');
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await clickSwitch();
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('[data-prototype]')).animationName`,
    ),
    'none',
  );
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.toggle-track span')).transitionDuration`,
    ),
    '0s',
  );
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await mkdir(join(root, 'test-results'), { recursive: true });
  const shot = await call('Page.captureScreenshot', { format: 'png' });
  await writeFile(
    join(root, 'test-results/home-prototypes.png'),
    Buffer.from(shot.data, 'base64'),
  );
  const blocked = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `Object.defineProperty(window, 'localStorage', {get() {throw new Error('Storage blocked');}});`,
  });
  await call('Page.reload');
  await ready();
  assert.deepEqual(await visible(), defaults, 'Storage blocked: AWS defaults');
  await clickSwitch();
  assert.equal(
    (await visible()).length,
    catalogue.length,
    'Storage blocked: switch works',
  );
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: blocked.identifier,
  });
  await call('Page.navigate', {
    url: `http://127.0.0.1:${sites.address().port}`,
  });
  await ready();
  assert.equal(
    (await visible()).length,
    catalogue.length,
    'Fresh Sites visit shows all games',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Home visibility PASS: AWS defaults/all, prototype navigation/return, saved on/off, keyboard, 320–1180px, reduced motion, blocked storage, Sites defaults; no browser exceptions',
  );
} finally {
  ws?.close();
  chrome.kill();
  server.close();
  sites.close();
  await delay(400);
  await rm(profile, { recursive: true, force: true });
}
