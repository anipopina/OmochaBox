import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Pond, MAX_RIPPLES, RIPPLE_LIFE } from '../src/mizutamari/model.ts';
import { createStaticServer } from './static-server.mjs';

const model = new Pond();
model.resize(390, 844);
for (let i = 0; i < 1000; i++) model.splash(90, 200, 100);
assert.equal(model.ripples.length, MAX_RIPPLES);
assert.ok(
  model.leaves.every((l) => Math.abs(l.vx) <= 60 && Math.abs(l.vy) <= 60),
);
for (let time = 100; time < 15100; time += 16) model.step(time, 0.016);
assert.equal(model.ripples.length, 0);
assert.equal(
  model.step(16000, 0.016),
  false,
  'Leaves converge and RAF can stop',
);
assert.ok(model.leaves.every((l) => l.x === l.homeX && l.y === l.homeY));
model.reduced = true;
model.splash(90, 200, 20000);
assert.ok(model.leaves.every((l) => l.vx === 0 && l.spin === 0));
assert.equal(model.step(20501, 0.016), false);
assert.equal(RIPPLE_LIFE, 2200);
console.log(
  'Pond model PASS: 1000 inputs bounded, finite leaf impulses, convergence, reduced motion',
);
const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'pond-browser-'));
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
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.lastPointerId=0;document.addEventListener('pointerdown',e=>window.lastPointerId=e.pointerId);window.rafCalls=0;const raf=requestAnimationFrame;window.requestAnimationFrame=(f)=>raf(t=>{window.rafCalls++;f(t)});`,
  });

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
  const visit = async (path = '/mizutamari/') => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + path });
    await waitFor(
      `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete'`,
    );
    await waitFor(
      path === '/'
        ? "document.querySelectorAll('.game-card').length===8"
        : "document.querySelector('#water')?.dataset.ready === 'true'",
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
  const data = () => evaluate("document.querySelector('canvas').toDataURL()");
  const touch = (type, touchPoints = []) =>
    call('Input.dispatchTouchEvent', { type, touchPoints });
  const tap = async (x, y) => {
    await touch('touchStart', [{ x, y, id: 1 }]);
    await touch('touchEnd');
    await delay(60);
  };
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [568, 320],
    [844, 390],
    [820, 1180],
    [1280, 800],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await visit();
    assert.ok(
      await evaluate(
        `document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight`,
      ),
    );
    assert.ok(
      await evaluate(
        `(()=>{const r=document.querySelector('#back').getBoundingClientRect();return r.width>=56&&r.height>=56&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`,
      ),
    );
    const start = await data();
    await shot(`pond-initial-${width}`);
    await tap(width * 0.5, height * 0.55);
    assert.notEqual(await data(), start, 'Tap produces visible water rings');
    await delay(450);
    await shot(`pond-ripples-${width}`);
  }
  report(
    'Pond PASS: six viewports, 56px back, no overflow, image decode, CDP synthetic taps and screenshots',
  );
  await visit();
  const initial = await data();
  await touch('touchStart', [
    { x: 350, y: 350, id: 1 },
    { x: 550, y: 400, id: 2 },
  ]);
  await delay(120);
  await touch('touchMove', [
    { x: 430, y: 350, id: 1 },
    { x: 620, y: 400, id: 2 },
  ]);
  await delay(100);
  assert.notEqual(await data(), initial);
  await shot('pond-multi-drag');
  await touch('touchCancel');
  await delay(9000);
  const canceledScene = await data();
  await evaluate(
    `document.querySelector('canvas').dispatchEvent(new PointerEvent('pointermove',{pointerId:window.lastPointerId,clientX:800,clientY:500,bubbles:true}))`,
  );
  await delay(100);
  assert.ok(
    (await data()) === canceledScene,
    'Canceled finger cannot create new ripples',
  );
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  assert.equal(await data(), initial, 'Blur clears water and returns leaves');
  const idle = await evaluate('window.rafCalls');
  await delay(200);
  assert.equal(await evaluate('window.rafCalls'), idle, 'Idle RAF stopped');
  // A move after cancellation must not create new effects.
  await evaluate(
    `document.querySelector('canvas').dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:800,clientY:500,bubbles:true}))`,
  );
  await delay(100);
  assert.equal(await data(), initial);
  await evaluate(`document.querySelector('canvas').focus()`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight' });
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter' });
  await delay(80);
  assert.notEqual(await data(), initial, 'Keyboard creates rings');
  await evaluate(`window.dispatchEvent(new Event('pagehide'))`);
  assert.equal(await data(), initial, 'Pagehide clears scene');
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await tap(600, 400);
  await shot('pond-reduced');
  await delay(650);
  assert.equal(await data(), initial, 'Reduced rings expire');
  await call('Emulation.setEmulatedMedia', { features: [] });
  await tap(600, 400);
  await evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));`,
  );
  assert.ok(
    (await data()) === initial,
    'Synthetic hidden transition clears effects',
  );
  await tap(600, 400);
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await delay(100);
  const resized = await data();
  await delay(150);
  assert.equal(
    await data(),
    resized,
    'Resize clears active rings and captures',
  );
  assert.ok(
    await evaluate(`document.querySelector('canvas').width<=innerWidth*2`),
  );
  await tap(195, 400);
  await delay(9000);
  const settled = await evaluate('window.rafCalls');
  await delay(200);
  assert.equal(
    await evaluate('window.rafCalls'),
    settled,
    'Rings and leaves settle to idle',
  );
  await evaluate(`document.querySelector('#back').click()`);
  await waitFor(`document.querySelectorAll('.game-card').length===8`);
  assert.ok(
    await evaluate(
      `!!document.querySelector('a[href="https://anipopina.com/"]')`,
    ),
  );
  await evaluate(`document.querySelector('a[href="mizutamari/"]').click()`);
  await waitFor(`document.querySelector('#water')?.dataset.ready==='true'`);
  const fresh = await data();
  await delay(150);
  assert.equal(await data(), fresh, 'Re-entry is static');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Pond PASS: multi-touch/drag/cancel, stale move, blur/pagehide, keyboard, resize/DPR, reduced motion, settling/idle, hub and re-entry, no JS errors',
  );
  await writeFile(join(output, 'pond-results.txt'), reports.join('\n') + '\n');
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
