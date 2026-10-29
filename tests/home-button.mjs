import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'home-button-browser-'));
const output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const server = createStaticServer(join(root, 'dist'));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(
  process.env.CHROME_PATH || '/usr/bin/chromium',
  [
    '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let ws;
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
  ws = new WebSocket(
    tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl,
  );
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown')
      errors.push(message.params.exceptionDetails);
    if (message.id) {
      const p = pending.get(message.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(message.id);
      if (message.error) p.reject(message.error);
      else p.resolve(message.result);
    }
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => {
        pending.delete(key);
        reject(new Error(`${method} timed out`));
      }, 15000);
      pending.set(key, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: key, method, params }));
    });
  const evaluate = async (expression) => {
    const response = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails)
      throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  await call('Runtime.enable');
  await call('Page.enable');
  const waitFor = async (expression) => {
    for (let i = 0; i < 100; i++) {
      try {
        if (await evaluate(expression)) return;
      } catch (error) {
        if (
          error.code !== -32000 ||
          !/context|navigat|closed/i.test(error.message)
        )
          throw error;
      }
      await delay(50);
    }
    assert.fail(`Timed out: ${expression}`);
  };
  const pages = [
    'hikari-no-oekaki',
    'fukifuki-mado',
    'pukapuka-fusen',
    'ponpon-stamp',
    'korokoro-suberidai',
    'kurukuru-kazaguruma',
    'kasanete-iroglass',
    'mizutamari',
    'mogumogu-tomodachi',
    'pukupuku-shabon',
  ];
  for (const [width, height] of [
    [320, 568],
    [844, 390],
    [1280, 800],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    for (const page of pages) {
      await call('Page.navigate', { url: `${origin}/${page}/` });
      await waitFor(
        `location.pathname==='/${page}/' && document.querySelector('#back.home-button svg')`,
      );
      await delay(100);
      const result = await evaluate(`(() => {
        const a=document.querySelector('#back'), svg=a.querySelector('svg');
        const r=a.getBoundingClientRect(), s=getComputedStyle(a);
        const glyph=svg.querySelector('path:not([fill="none"])');
        const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return {size:r.width>=56&&r.height>=56,inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,
          iconOnly:a.textContent.trim()==='',name:a.getAttribute('aria-label'),
          hidden:svg.getAttribute('aria-hidden'),fill:getComputedStyle(glyph).fill,color:s.color,
          reachable:hit===a||a.contains(hit),href:a.href,position:s.position};
      })()`);
      assert.ok(
        result.size && result.inside && result.reachable,
        `${page} ${width}: usable control`,
      );
      assert.ok(result.iconOnly, `${page}: icon only`);
      assert.equal(result.name, 'おもちゃボックスにもどる');
      assert.equal(result.hidden, 'true');
      assert.equal(
        result.fill,
        result.color,
        `${page}: no game CSS leaking into icon`,
      );
      assert.equal(result.href, origin + '/');
      assert.equal(
        result.position,
        page === 'fukifuki-mado' ? 'relative' : 'fixed',
      );
      await evaluate(`document.querySelector('#back').focus()`);
      assert.ok(
        await evaluate(
          `document.activeElement===document.querySelector('#back')`,
        ),
      );
      if (width === 320) {
        const shot = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(
          join(output, `home-button-${page}.png`),
          Buffer.from(shot.data, 'base64'),
        );
      }
      await call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
      });
      await call('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
      });
      await waitFor(
        `location.pathname==='/' && document.querySelector('.game-card')`,
      );
    }
  }
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const license = await fetch(origin + '/licenses/material-icons/LICENSE');
  assert.equal(license.status, 200);
  assert.match(await license.text(), /Apache License/);
  console.log(
    'Home button PASS: 10 games / 3 viewports, icon color and accessible name, 56px targets, focus, Enter navigation, bundled license, no JS errors',
  );
} finally {
  ws?.close();
  chrome.kill();
  server.close();
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 150,
  });
}
