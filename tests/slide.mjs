import assert from 'node:assert/strict';
import { positionAt } from '../src/korokoro-suberidai/model.ts';
for (let ms = 1; ms <= 8500; ms++) {
  const a = positionAt(ms - 1, 0),
    b = positionAt(ms, 0);
  assert.ok(
    Math.hypot(b.x - a.x, b.y - a.y) < 2,
    'Continuous route, no teleport at a join',
  );
  assert.ok(
    b.x >= 23 && b.x <= 457 && b.y >= 23 && b.y <= 560,
    'Ball stays inside the toy',
  );
}
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'slide-browser-'));
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
  const visit = async (path = '/korokoro-suberidai/') => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + path });
    await waitFor(
      `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete'`,
    );
    await waitFor(
      path === '/'
        ? "document.querySelectorAll('.game-card').length===7"
        : "document.querySelectorAll('.supply').length===3",
    );
  };
  const count = () => evaluate("document.querySelectorAll('.ball').length");
  const point = () =>
    evaluate(
      "(()=>{let r=document.querySelector('.supply').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
    );
  const shot = async (name) =>
    writeFile(
      join(output, name + '.png'),
      Buffer.from(
        (
          await call('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true,
          })
        ).data,
        'base64',
      ),
    );
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [820, 1180],
    [844, 390],
    [568, 320],
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
        'document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight',
      ),
      'No overflow',
    );
    assert.ok(
      await evaluate(
        "[...document.querySelectorAll('.supply,#back')].every(e=>{let r=e.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})",
      ),
      'Visible 56px controls',
    );
    assert.ok(
      await evaluate(
        "(()=>{let r=document.querySelector('#toy').getBoundingClientRect();return r.height>150&&r.bottom<=innerHeight})()",
      ),
      'Full toy visible',
    );
    const p = await point();
    await call('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...p, id: 1 }],
    });
    await call('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await waitFor("document.querySelectorAll('.ball').length===1");
    await delay(800);
    await shot(`slide-playing-${width}`);
  }
  report(
    'Slide PASS: six viewport sizes, full toy, 56px controls, real CDP touch and screenshots',
  );
  await visit();
  const cancelPoint = await point();
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...cancelPoint, id: 1 }],
  });
  await call('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  assert.equal(await count(), 0, 'Cancelled touch does not launch');
  await evaluate("document.querySelectorAll('.supply').forEach(b=>b.click())");
  assert.deepEqual(
    await evaluate(
      "[...document.querySelectorAll('.ball')].map(b=>b.dataset.color)",
    ),
    ['red', 'yellow', 'blue'],
  );
  const before = await evaluate(
    "document.querySelector('.ball').getAttribute('transform')",
  );
  await delay(250);
  assert.notEqual(
    await evaluate("document.querySelector('.ball').getAttribute('transform')"),
    before,
  );
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(await count(), 3, 'Resize preserves balls');
  await delay(5800);
  await shot('slide-bounce');
  await waitFor(
    "[...document.querySelectorAll('.ball')].some(b=>b.dataset.phase==='rest')",
  );
  await waitFor("document.querySelectorAll('.ball').length===0");
  const idle = await evaluate('window.rafCalls');
  await delay(250);
  assert.equal(await evaluate('window.rafCalls'), idle, 'Idle RAF stops');
  await evaluate(
    "for(let i=0;i<300;i++)document.querySelectorAll('.supply')[i%3].click()",
  );
  assert.equal(await count(), 24, '300 rapid activations bounded');
  await shot('slide-many');
  await evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide'))");
  assert.equal(await count(), 0, 'Pagehide clears');
  await evaluate("document.querySelector('.supply').focus()");
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    text: '\r',
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    text: '\r',
    autoRepeat: true,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    text: '\r',
  });
  assert.equal(await count(), 1, 'Keyboard activation without repeat');
  await evaluate(
    "Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))",
  );
  assert.equal(await count(), 0, 'Hidden clears');
  await visit();
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await delay(100);
  await evaluate("document.querySelector('.supply').click()");
  const still = await evaluate(
    "document.querySelector('.ball').getAttribute('transform')",
  );
  await delay(300);
  assert.equal(
    await evaluate("document.querySelector('.ball').getAttribute('transform')"),
    still,
    'Reduced motion stationary',
  );
  await shot('slide-reduced');
  await waitFor("document.querySelectorAll('.ball').length===0");
  await evaluate("document.querySelector('#back').click()");
  await waitFor("document.querySelectorAll('.game-card').length===7");
  await evaluate(
    'document.querySelector(\'a[href="korokoro-suberidai/"]\').click()',
  );
  await waitFor("document.querySelectorAll('.supply').length===3");
  assert.equal(await count(), 0, 'Re-entry empty');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Slide PASS: three colors, rolling/bounce/rest, resize, 300 taps/24 cap, idle, keyboard repeat, hidden/pagehide, reduced motion, hub/re-entry, no JS errors',
  );
  await writeFile(join(output, 'slide-results.txt'), reports.join('\n') + '\n');
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
