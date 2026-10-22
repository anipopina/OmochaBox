import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'stamp-browser-'));
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
  const visit = async (path = '/ponpon-stamp/') => {
    await call('Page.navigate', { url: origin + path });
    await waitFor(
      `document.readyState==='complete' && document.querySelectorAll('.choice').length===6`,
    );
    await evaluate(`Promise.all([...document.images].map(i=>i.decode()))`);
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await delay(50);
    }
    assert.fail(`Timed out waiting for ${expression}`);
  };
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
  const point = (selector, fx = 0.5, fy = 0.5) =>
    evaluate(
      `(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return {x:r.x+r.width*${fx},y:r.y+r.height*${fy}}})()`,
    );
  const mouse = (type, p) =>
    call('Input.dispatchMouseEvent', {
      type,
      ...p,
      button: 'left',
      clickCount: 1,
    });
  const tap = async (p) => {
    await mouse('mousePressed', p);
    await mouse('mouseReleased', p);
  };
  const count = () => evaluate(`document.querySelectorAll('.stamp').length`);
  const click = (selector) =>
    evaluate(`document.querySelector('${selector}').click()`);
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
        `document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight`,
      ),
      'No overflow',
    );
    assert.ok(
      await evaluate(
        `[...document.querySelectorAll('.choice,#undo,#new,#back')].every(e=>{const r=e.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
      ),
      '56px controls visible',
    );
    assert.ok(
      await evaluate(
        `(()=>{const r=document.querySelector('#paper').getBoundingClientRect();return r.width>=180&&r.height>=160})()`,
      ),
      'Paper remains usable',
    );
    await shot(`stamp-initial-${width}`);
    for (let i = 0; i < 6; i++) {
      await click(`.choice:nth-child(${i + 1})`);
      await tap(
        await point(
          '#paper',
          0.22 + (i % 2) * 0.55,
          0.22 + Math.floor(i / 2) * 0.27,
        ),
      );
    }
    await delay(400);
    assert.equal(await count(), 6);
    assert.equal(
      await evaluate(
        `new Set([...document.querySelectorAll('.stamp img')].map(i=>i.src)).size`,
      ),
      6,
    );
    assert.ok(
      await evaluate(
        `document.querySelectorAll('.choice[aria-pressed="true"]').length===1`,
      ),
    );
    assert.ok(
      await evaluate(
        `Promise.all([...document.images].map(i=>i.decode())).then(()=>true)`,
      ),
    );
    await shot(`stamp-art-${width}`);
  }
  report(
    'Stamp: 320/390/820/844/568/1280, visible 56px controls, usable paper, six original SVGs, tap placement and screenshots PASS',
  );
  await visit();
  const p = await point('#paper', 0.3, 0.35),
    q = await point('#paper', 0.7, 0.6);
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { ...p, id: 1 },
      { ...q, id: 2 },
    ],
  });
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await count(), 2, 'Two real CDP touches');
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...p, id: 3 }],
  });
  await call('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  assert.equal(await count(), 2, 'Touch cancellation');
  await mouse('mousePressed', p);
  await mouse('mouseMoved', q);
  await mouse('mouseReleased', q);
  assert.equal(await count(), 2, 'Drag does not paint');
  await mouse('mousePressed', p);
  await mouse('mouseReleased', { x: 1, y: 1 });
  assert.equal(await count(), 2, 'Release outside cancels');
  await mouse('mousePressed', p);
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  await mouse('mouseReleased', p);
  assert.equal(await count(), 2, 'Blur cancels pending pointer');
  await mouse('mousePressed', p);
  await evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));`,
  );
  await mouse('mouseReleased', p);
  assert.equal(
    await count(),
    2,
    'Hidden retains art and cancels pending pointer',
  );
  await evaluate(`delete document.hidden`);
  assert.equal(
    await evaluate(
      `document.querySelector('#paper').getAnimations({subtree:true}).length`,
    ),
    0,
  );
  await tap(p);
  assert.equal(await count(), 3, 'Resumes');
  await click('#undo');
  assert.equal(await count(), 2);
  await mouse('mousePressed', await point('#paper'));
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(100);
  await mouse('mouseReleased', await point('#paper'));
  assert.equal(await count(), 2, 'Resize cancels pending input below cap');
  await click('#new');
  assert.ok(await evaluate(`document.querySelector('#confirm').open`));
  assert.equal(await count(), 2, 'New paper requires confirmation');
  await shot('stamp-confirm');
  await click('button[value="cancel"]');
  await delay(50);
  assert.equal(await count(), 2);
  await click('#new');
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await delay(50);
  assert.ok(await evaluate(`!document.querySelector('#confirm').open`));
  assert.equal(await count(), 2, 'Escape preserves paper');
  await click('#new');
  await click('#clear');
  await delay(50);
  assert.equal(await count(), 0);
  await evaluate(`document.querySelector('#paper').focus()`);
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'ArrowRight',
    code: 'ArrowRight',
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'ArrowRight',
    code: 'ArrowRight',
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: ' ',
    code: 'Space',
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: ' ',
    code: 'Space',
    autoRepeat: true,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: ' ',
    code: 'Space',
  });
  assert.equal(await count(), 1, 'Keyboard repeat creates only once');
  await click('#paper');
  assert.equal(await count(), 2, 'Assistive activation');
  report(
    'Stamp: trusted two-finger touch, cancel, drag/outside release, blur/hidden, resume, undo, clear confirmation/cancel, keyboard and assistive click PASS',
  );
  await evaluate(
    `for(let i=0;i<200;i++)document.querySelector('#paper').click()`,
  );
  assert.equal(await count(), 60, 'Bounded at 60');
  const original = await evaluate(
    `document.querySelector('#stamps').innerHTML`,
  );
  await click('#paper');
  assert.equal(
    await evaluate(`document.querySelector('#stamps').innerHTML`),
    original,
    'At cap artwork unchanged',
  );
  assert.ok(await evaluate(`!document.querySelector('#full').hidden`));
  await click('#undo');
  assert.equal(await count(), 59);
  await tap(await point('#paper'));
  assert.equal(await count(), 60);
  await delay(400);
  assert.equal(
    await evaluate(
      `document.querySelector('#paper').getAnimations({subtree:true}).length`,
    ),
    0,
    'Idle animations end',
  );
  const rafBefore = await evaluate('window.rafCalls');
  await delay(300);
  assert.equal(await evaluate('window.rafCalls'), rafBefore, 'No idle RAF');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(150);
  assert.equal(await count(), 60, 'Resize keeps artwork');
  assert.ok(
    await evaluate(
      `(()=>{const p=document.querySelector('#paper').getBoundingClientRect();return [...document.querySelectorAll('.stamp')].every(e=>{const r=e.getBoundingClientRect();return r.left>=p.left&&r.top>=p.top&&r.right<=p.right&&r.bottom<=p.bottom})})()`,
    ),
    'Rotated bounds remain on paper',
  );
  await shot('stamp-full-390');
  await mouse('mousePressed', await point('#paper'));
  await call('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(100);
  await mouse('mouseReleased', await point('#paper'));
  assert.equal(await count(), 60);
  await click('#new');
  await click('#clear');
  await delay(50);
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await tap(await point('#paper'));
  assert.equal(await count(), 1);
  assert.equal(
    await evaluate(
      `document.querySelector('#paper').getAnimations({subtree:true}).length`,
    ),
    0,
    'Reduced motion has no bounce',
  );
  await shot('stamp-reduced-844');
  await evaluate(`window.dispatchEvent(new Event('pagehide'))`);
  assert.equal(await count(), 0);
  await click('#back');
  await waitFor(`document.querySelectorAll('.game-card').length===4`);
  assert.equal(
    await evaluate(`document.querySelectorAll('.game-card').length`),
    4,
  );
  assert.ok(
    await evaluate(
      `!!document.querySelector('a[href="https://anipopina.com/"]')`,
    ),
  );
  await click('a[href="ponpon-stamp/"]');
  await waitFor(
    `document.readyState==='complete' && document.querySelectorAll('.choice').length===6`,
  );
  assert.equal(await count(), 0);
  assert.ok(
    await evaluate(
      `!document.querySelector('a[href="https://anipopina.com/"]')`,
    ),
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Stamp: 200 placements / 60 cap, no automatic deletion, undo recovery, idle animations/RAF stop, resize, reduced motion, pagehide/re-entry, hub/footer, no JS errors PASS',
  );
  await writeFile(join(output, 'stamp-results.txt'), reports.join('\n') + '\n');
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
