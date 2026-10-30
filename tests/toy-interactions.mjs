import assert from 'node:assert/strict';
import { Pond } from '../src/mizutamari/model.ts';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const pond = new Pond();
pond.resize(390, 844);
let now = 0;
const settle = () => {
  for (let i = 0; i < 1000; i++) {
    now += 16;
    pond.step(now, 0.016);
  }
};
const leaf = pond.leaves[0],
  start = leaf.x;
pond.splash(leaf.x - 40, leaf.y, now);
settle();
assert.ok(leaf.x > start + 5, 'Nearby ripple transports leaf');
const right = leaf.x;
pond.splash(leaf.x + 40, leaf.y, now);
settle();
assert.ok(leaf.x < right - 5, 'Opposite side reverses transport');
for (let i = 0; i < 1000; i++) pond.splash(0, 0, now);
assert.equal(pond.ripples.length, 32);
assert.ok(pond.leaves.every((l) => Math.hypot(l.vx, l.vy) <= 60.00001));
settle();
assert.equal(pond.step(now + 1000, 0.016), false);
assert.ok(
  pond.leaves.every((l) => l.x >= l.size * 0.72 && l.x <= 390 - l.size * 0.72),
);
const positions = pond.leaves.map((l) => [l.x, l.y]);
pond.clear();
assert.deepEqual(
  pond.leaves.map((l) => [l.x, l.y]),
  positions,
);
pond.reduced = true;
pond.splash(leaf.x - 40, leaf.y, now);
settle();
assert.deepEqual(
  pond.leaves.map((l) => [l.x, l.y]),
  positions,
);
pond.resize(390, 844);
assert.equal(pond.leaves[0].x, start);
console.log(
  'Carry model PASS: progressive/reversible movement, bounded speed/ripples/edges, idle, clear, reduced motion, resize',
);
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
        ? "document.querySelectorAll('.game-card').length===10"
        : "document.querySelector('canvas')?.dataset.ready === 'true'",
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
    evaluate(
      `document.querySelector('canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'${i + 1}'}))`,
    );
  const touch = (type, points = []) =>
    call('Input.dispatchTouchEvent', { type, touchPoints: points });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await visit('/');
  await evaluate(
    `document.querySelector('a[href="kasanete-iroglass/"]').click()`,
  );
  await waitFor("document.querySelector('#glass')?.dataset.ready==='true'");
  assert.equal(await evaluate('location.search'), '');
  const r = await rect();
  const radius = 190;
  for (const [i, x, y] of [
    [0, 640 - radius * 0.55, 450 - radius * 0.4],
    [1, 640 + radius * 0.55, 450 - radius * 0.3],
    [2, 640, 450 + radius * 0.65],
  ]) {
    await pick(i);
    await touch('touchStart', [{ x, y, id: 1 }]);
    await touch('touchMove', [{ x: r.w / 2, y: r.h / 2, id: 1 }]);
    await touch('touchEnd');
  }
  const center = () =>
    evaluate(
      `(()=>{const c=document.querySelector('canvas');return [...c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data]})()`,
    );
  const mixed = await center();
  for (const i of [2, 1, 0, 2, 1, 0]) {
    await touch('touchStart', [{ x: 640, y: 450, id: 1 }]);
    assert.equal(await dragging(), 'false');
    await touch('touchEnd');
    assert.equal(
      await selected(),
      String(i),
      'Stationary taps cycle all three plates',
    );
    assert.deepEqual(
      await center(),
      mixed,
      'Selection preserves mixed color and position',
    );
  }
  await shot('interaction-glass-selected');
  await touch('touchStart', [{ x: 640, y: 450, id: 1 }]);
  await touch('touchMove', [{ x: 940, y: 450, id: 1 }]);
  assert.equal(
    await selected(),
    '0',
    'Next drag extracts the selected lower plate',
  );
  assert.equal(await dragging(), 'true');
  await touch('touchEnd');
  assert.equal(await selected(), '0', 'Drag end does not cycle');
  assert.notDeepEqual(
    await center(),
    mixed,
    'Plate really moved out of overlap',
  );
  await shot('interaction-glass-extracted');
  await touch('touchStart', [{ x: 640, y: 450, id: 1 }]);
  await touch('touchCancel');
  assert.equal(await selected(), '0', 'Canceled tap cannot cycle');
  await touch('touchStart', [{ x: 640, y: 450, id: 1 }]);
  await touch('touchMove', [{ x: 665, y: 450, id: 1 }]);
  assert.equal(
    await selected(),
    '2',
    'Unarmed direct drag chooses front plate',
  );
  await evaluate("window.dispatchEvent(new Event('blur'))");
  assert.equal(await dragging(), 'false');
  await touch('touchEnd');
  const frames = await evaluate('window.rafCalls');
  await delay(300);
  assert.equal(
    await evaluate('window.rafCalls'),
    frames,
    'No continuous animation',
  );
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [820, 1180],
    [844, 390],
    [568, 320],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await visit('/kasanete-iroglass/');
    await touch('touchStart', [{ x: width / 2, y: height / 2, id: 1 }]);
    await touch('touchEnd');
    assert.ok(['0', '1', '2'].includes(await selected()));
    await shot(`interaction-glass-${width}`);
  }
  await visit('/');
  await evaluate(`document.querySelector('a[href="mizutamari/"]').click()`);
  await waitFor("document.querySelector('canvas')?.dataset.ready==='true'");
  assert.equal(await evaluate('location.search'), '');
  const before = await data();
  await touch('touchStart', [{ x: 568 * 0.22 - 40, y: 320 * 0.24, id: 1 }]);
  await touch('touchEnd');
  await delay(6500);
  const carried = await data();
  assert.notEqual(carried, before, 'Leaf keeps its transported position');
  const settled = await evaluate('window.rafCalls');
  await delay(400);
  assert.equal(
    await evaluate('window.rafCalls'),
    settled,
    'Pond settles to idle',
  );
  await evaluate("window.dispatchEvent(new Event('blur'))");
  assert.equal(await data(), carried, 'Blur keeps settled leaf positions');
  await shot('interaction-pond-carried');
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await visit('/mizutamari/');
  const reduced = await data();
  await touch('touchStart', [{ x: 85, y: 77, id: 1 }]);
  await touch('touchEnd');
  await delay(700);
  assert.equal(await data(), reduced, 'Reduced motion disables leaf transport');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Interactions PASS: three-plate tap cycle, unchanged overlap color, lower plate extraction, direct drag, cancel/blur, six viewports, idle; pond persistent transport, blur retention, reduced motion, idle; no JS errors',
  );
  await writeFile(
    join(output, 'toy-interactions-results.txt'),
    reports.join('\n') + '\n',
  );
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
