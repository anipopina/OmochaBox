import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'glass-browser-'));
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
    source: `window.rafCalls=0;const raf=requestAnimationFrame;window.requestAnimationFrame=(f)=>raf(t=>{window.rafCalls++;f(t)});`,
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
  const visit = async (path = '/kasanete-iroglass/') => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + path });
    await waitFor(
      `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete'`,
    );
    await waitFor(
      path === '/'
        ? "document.querySelectorAll('.game-card').length===8"
        : "document.querySelector('#glass')?.dataset.ready === 'true'",
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
  const selected = () =>
    evaluate("document.querySelector('canvas').dataset.selected");
  const dragging = () =>
    evaluate("document.querySelector('canvas').dataset.dragging");
  const rect = () =>
    evaluate(
      "(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()",
    );
  const pick = async (i) =>
    evaluate(`document.querySelector('[data-shape="${i}"]').click()`);
  const reset = async () =>
    evaluate("document.querySelector('#reset').click()");
  const touch = (type, points = []) =>
    call('Input.dispatchTouchEvent', { type, touchPoints: points });
  for (const [w, h] of [
    [320, 568],
    [390, 844],
    [820, 1180],
    [844, 390],
    [568, 320],
    [1280, 900],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await visit();
    await delay(150);
    const r = await rect();
    assert.ok(r.w > 200 && r.h > 190);
    assert.ok(
      await evaluate(
        `document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight`,
      ),
      'No viewport overflow',
    );
    assert.ok(
      await evaluate(
        `[...document.querySelectorAll('button,#back')].every(e=>{const r=e.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
      ),
    );
    await shot(`glass-${w}x${h}`);
    const radius = Math.min(r.w * 0.31, r.h * 0.29, 190);
    const before = await data();
    await touch('touchStart', [
      {
        x: r.x + r.w * 0.5 - radius * 0.55,
        y: r.y + r.h * 0.5 - radius * 0.4,
        id: 1,
      },
    ]);
    assert.equal(await dragging(), 'true');
    await touch('touchMove', [
      {
        x: r.x + r.w * 0.5 - radius * 0.55 + 32,
        y: r.y + r.h * 0.5 - radius * 0.4 + 20,
        id: 1,
      },
    ]);
    await touch('touchEnd');
    assert.notEqual(await data(), before);
    assert.equal(await dragging(), 'false');
    await reset();
    assert.equal(await data(), before);
  }
  report(
    'Glass PASS: six viewports, 56px controls, no overflow, CDP synthetic touch movement (not physical-device touch), reset, screenshots',
  );
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await visit();
  await delay(150);
  // Inspect actual canvas colors, including all subtractive overlaps.
  const palette = await evaluate(
    `(()=>{const c=document.querySelector('canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;const n={green:0,red:0,blue:0,dark:0};for(let i=0;i<d.length;i+=4){let [r,g,b]=d.slice(i,i+3);if(g>100&&r<40&&b<40)n.green++;if(r>170&&g<80&&b<40)n.red++;if(b>100&&r<40&&g<80)n.blue++;if(r<40&&g<80&&b<40)n.dark++;}return n})()`,
  );
  for (const [name, n] of Object.entries(palette))
    assert.ok(n > 50, `${name} visible: ${n}`);
  const r = await rect();
  const radius = Math.min(r.w * 0.31, r.h * 0.29, 190);
  // Move each shape onto the same center; the palette must retrieve every one.
  for (const [i, x, y] of [
    [0, 0.5 - (radius * 0.55) / r.w, 0.5 - (radius * 0.4) / r.h],
    [1, 0.5 + (radius * 0.55) / r.w, 0.5 - (radius * 0.3) / r.h],
    [2, 0.5, 0.5 + (radius * 0.65) / r.h],
  ]) {
    await pick(i);
    await touch('touchStart', [{ x: r.x + r.w * x, y: r.y + r.h * y, id: 1 }]);
    assert.equal(await selected(), String(i));
    await touch('touchMove', [
      { x: r.x + r.w * 0.5, y: r.y + r.h * 0.5, id: 1 },
    ]);
    await touch('touchEnd');
  }
  for (const i of [0, 1, 2]) {
    await pick(i);
    await touch('touchStart', [
      { x: r.x + r.w * 0.5, y: r.y + r.h * 0.5, id: 1 },
    ]);
    assert.equal(await selected(), String(i));
    assert.equal(await dragging(), 'true');
    await touch('touchCancel');
    assert.equal(await dragging(), 'false');
  }
  await shot('glass-overlap-390x844');
  await reset();
  // Directly grabbing an exposed other plate changes selection naturally.
  await touch('touchStart', [
    { x: r.x + r.w * 0.82, y: r.y + r.h * 0.5, id: 1 },
  ]);
  assert.equal(await selected(), '1');
  await touch('touchCancel');
  const frozen = await data();
  await touch('touchStart', [{ x: r.x + 3, y: r.y + 3, id: 1 }]);
  await touch('touchMove', [{ x: r.x + 60, y: r.y + 60, id: 1 }]);
  await touch('touchEnd');
  assert.equal(await data(), frozen);
  await reset();
  await pick(0);
  await evaluate("document.querySelector('canvas').focus()");
  const original = await data();
  for (let i = 0; i < 120; i++)
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'ArrowRight',
      code: 'ArrowRight',
    });
  const edge = await data();
  assert.ok(edge !== original, 'Keyboard moves plate');
  for (let i = 0; i < 10; i++)
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'ArrowRight',
      code: 'ArrowRight',
    });
  assert.equal(await data(), edge, 'Movement clamped at edge');
  for (let i = 0; i < 100; i++) {
    await pick(i % 3);
    await reset();
  }
  assert.equal(await data(), original);
  await touch('touchStart', [
    {
      x: r.x + r.w * 0.5 - radius * 0.55,
      y: r.y + r.h * 0.5 - radius * 0.4,
      id: 1,
    },
  ]);
  await evaluate("window.dispatchEvent(new Event('blur'))");
  assert.equal(await dragging(), 'false');
  await touch('touchEnd');
  await touch('touchStart', [
    {
      x: r.x + r.w * 0.5 - radius * 0.55,
      y: r.y + r.h * 0.5 - radius * 0.4,
      id: 1,
    },
  ]);
  await call('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await delay(150);
  assert.equal(await dragging(), 'false');
  await touch('touchEnd');
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await visit();
  const frames = await evaluate('window.rafCalls');
  await delay(500);
  assert.equal(await evaluate('window.rafCalls'), frames);
  await evaluate("document.querySelector('#back').click()");
  await waitFor("document.querySelectorAll('.game-card').length===8");
  assert.ok(
    await evaluate(
      '!!document.querySelector(\'a[href="https://anipopina.com/"]\')',
    ),
  );
  await evaluate(
    'document.querySelector(\'a[href="kasanete-iroglass/"]\').click()',
  );
  await waitFor("document.querySelector('#glass')?.dataset.ready==='true'");
  assert.equal(await selected(), '0');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Glass PASS: green/red/blue/dark pixels, fully overlapping plate retrieval, direct selection, cancel/blur/resize, edge limits, 100 resets, keyboard, reduced motion/idle, hub/re-entry, no JS errors',
  );
  await writeFile(join(output, 'glass-results.txt'), reports.join('\n') + '\n');
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
