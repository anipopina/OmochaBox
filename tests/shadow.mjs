import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'shadow-browser-'));
const output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const server = createStaticServer(
  process.env.SHADOW_BUILD || join(root, 'dist'),
);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(
  process.env.CHROME_PATH || '/usr/bin/chromium',
  [
    '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    '--disable-webgl',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const reports = [],
  errors = [];
const report = (message) => {
  reports.push(message);
  console.log(message);
};
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
      } catch {
        /* navigation */
      }
      await delay(50);
    }
    assert.fail(`Timed out: ${expression}`);
  };
  const visit = async () => {
    const old = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + '/kage-asobi/' });
    await waitFor(
      `performance.timeOrigin !== ${old} && document.querySelector('#scene')?.dataset.ready === 'true'`,
    );
  };
  const shot = async (name) =>
    writeFile(
      join(output, name + '.png'),
      Buffer.from(
        (await call('Page.captureScreenshot', { format: 'png' })).data,
        'base64',
      ),
    );
  const status = () =>
    evaluate("({...document.querySelector('#scene').dataset})");
  const touch = async (type, points) =>
    call('Input.dispatchTouchEvent', { type, touchPoints: points });
  const tap = async (x, y) => {
    await touch('touchStart', [{ x, y }]);
    await touch('touchEnd', []);
  };
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
    [844, 390],
    [320, 568],
    [768, 1024],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await visit();
    await shot(`shadow-${width}-ready`);
    assert.ok(
      await evaluate(
        "[...document.querySelectorAll('button, a')].every(e=>{const r=e.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})",
      ),
    );
    await tap(60, height * 0.8);
    assert.ok(Number((await status()).angle) > 0, 'light left, shadow right');
    await touch('touchStart', [{ x: 60, y: height * 0.8, id: 1 }]);
    await touch('touchMove', [{ x: width - 60, y: height * 0.8, id: 1 }]);
    assert.ok(
      Number((await status()).angle) < 0,
      'drag light right, shadow left',
    );
    await shot(`shadow-${width}-right`);
    await touch('touchCancel', []);
    assert.equal((await status()).dragging, 'false');
    await tap(width / 2, height * 0.7);
    const near = Number((await status()).length);
    await tap(width / 2, height - 88);
    assert.ok(
      near > Number((await status()).length),
      'near light lengthens shadow',
    );
    await touch('touchStart', [{ x: 60, y: height * 0.75, id: 1 }]);
    await touch('touchStart', [
      { x: 60, y: height * 0.75, id: 1 },
      { x: width - 60, y: height * 0.75, id: 2 },
    ]);
    assert.ok(
      Number((await status()).angle) > 0,
      'second finger cannot steal light',
    );
    await touch('touchCancel', []);
    for (let i = 0; i < 10; i++)
      await tap(i % 2 ? 60 : width - 60, height * 0.8);
    await touch('touchStart', [{ x: 60, y: height * 0.75, id: 1 }]);
    await evaluate("window.dispatchEvent(new Event('blur'))");
    const stopped = await status();
    await touch('touchMove', [{ x: width - 60, y: height * 0.75, id: 1 }]);
    assert.deepEqual(await status(), stopped, 'blur releases drag');
    await touch('touchCancel', []);
    await evaluate("document.querySelector('#reset').click()");
    assert.equal((await status()).lightX, '0.18');
    report(
      `${width}x${height}: dimensions, opposite shadow, near/far, drag/cancel, multifinger, repeated input, blur, reset PASS`,
    );
  }
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await visit();
  await evaluate("document.querySelector('#light').focus()");
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight' });
  assert.ok(Number((await status()).lightX) > 0.18);
  await evaluate("document.querySelector('#light').click()");
  assert.equal((await status()).lightX, '0.85', 'assistive activation');
  assert.equal(
    await evaluate('document.getAnimations().length'),
    0,
    'reduced motion no decorative animations',
  );
  await shot('shadow-reduced');
  await touch('touchStart', [{ x: 60, y: 820, id: 1 }]);
  await evaluate(
    "Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))",
  );
  const hidden = await status();
  assert.equal(hidden.dragging, 'false');
  await evaluate(
    "delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))",
  );
  await touch('touchMove', [{ x: 600, y: 820, id: 1 }]);
  assert.deepEqual(await status(), hidden, 'visible does not resume old drag');
  await touch('touchCancel', []);
  await evaluate(
    "window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))",
  );
  await tap(700, 820);
  assert.ok(Number((await status()).angle) < 0, 'BFCache restored input works');
  report('Reduced motion, keyboard, assistive click, visibility, BFCache PASS');
  for (const saved of ['false', 'true']) {
    await evaluate(
      `localStorage.setItem('omochabox-show-prototypes','${saved}');document.querySelector('[data-home-button]').click()`,
    );
    await waitFor(
      "location.pathname==='/' && !!document.querySelector('a[href=\"kage-asobi/\"]')",
    );
    assert.equal(
      await evaluate(
        'document.querySelector(\'a[href="kage-asobi/"]\').hidden',
      ),
      saved === 'false',
    );
    if (saved === 'false')
      await evaluate("document.querySelector('#show-prototypes').click()");
    await evaluate('document.querySelector(\'a[href="kage-asobi/"]\').click()');
    await waitFor("document.querySelector('#scene')?.dataset.ready==='true'");
    assert.equal((await status()).lightX, '0.18');
  }
  report('Saved home visibility false/true, switch, return and reentry PASS');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  await writeFile(join(output, 'shadow-results.txt'), reports.join('\n'));
} finally {
  ws?.close();
  chrome.kill();
  server.close();
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
