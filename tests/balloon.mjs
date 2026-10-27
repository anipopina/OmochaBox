import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'balloon-browser-'));
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
        reject(new Error(`${method} timed out: ${params.expression ?? ''}`));
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
  const visit = async (path = '/pukapuka-fusen/') => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + path });
    await waitFor(
      `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete'`,
    );
    await waitFor(
      path === '/'
        ? "document.querySelectorAll('.game-card').length===9"
        : "!!document.querySelector('#pump')",
    );
    // Offscreen lazy hub images may never start loading until scrolled into view.
    // Force their request in this test, retaining full decode validation.
    await evaluate(
      `Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode()}))`,
    );
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
  const point = () =>
    evaluate(
      `(()=>{const r=document.querySelector('#pump').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
  const mouse = async (type, position) =>
    call('Input.dispatchMouseEvent', {
      type,
      ...position,
      button: 'left',
      clickCount: 1,
    });
  const count = () => evaluate(`document.querySelectorAll('.balloon').length`);
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
        `document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight`,
      ),
      'No overflow',
    );
    assert.ok(
      await evaluate(
        `[...document.querySelectorAll('#pump,#back')].every(e=>{const r=e.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
      ),
      'Controls visible and 56px',
    );
    await shot(`balloon-initial-${width}`);
    const p = await point();
    await mouse('mousePressed', p);
    await delay(70);
    await mouse('mouseReleased', p);
    assert.equal(await count(), 1, 'Short tap launches');
    assert.ok(
      await evaluate(
        `document.querySelector('.balloon').getBoundingClientRect().width>=40`,
      ),
    );
    await mouse('mousePressed', p);
    await delay(2600);
    const size = await evaluate(
      `document.querySelector('#held').getBoundingClientRect().width`,
    );
    assert.equal(
      await evaluate(`document.querySelector('#held').dataset.full`),
      'true',
    );
    await delay(180);
    assert.equal(
      await evaluate(
        `document.querySelector('#held').getBoundingClientRect().width`,
      ),
      size,
      'Held maximum stable',
    );
    assert.ok(
      await evaluate(
        `(()=>{const r=document.querySelector('#held').getBoundingClientRect(),h=document.querySelector('#back').getBoundingClientRect();return (r.top>=h.bottom||r.left>=h.right)&&r.left>=0&&r.right<=innerWidth})()`,
      ),
      'Maximum balloon clears back button',
    );
    await shot(`balloon-held-${width}`);
    await mouse('mouseReleased', { x: 8, y: height / 2 });
    assert.equal(await count(), 2, 'Release outside pump still launches');
    const before = await evaluate(
      `document.querySelector('.balloon:last-child').getBoundingClientRect().top`,
    );
    await delay(500);
    assert.ok(
      (await evaluate(
        `document.querySelector('.balloon:last-child').getBoundingClientRect().top`,
      )) < before,
      'Floats upward',
    );
    await shot(`balloon-flying-${width}`);
  }
  report(
    'Balloon: 320/390/820/844/568/1280 viewports, 56px targets, no overflow, short tap, 2.4s maximum stable, release outside, upward movement and screenshots PASS',
  );

  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await visit();
  const p = await point();
  await call('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 10,
  });
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...p, id: 1 }],
  });
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { ...p, id: 1 },
      { x: p.x + 30, y: p.y, id: 2 },
    ],
  });
  await delay(100);
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await count(), 1, 'Two fingers create one balloon');
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...p, id: 3 }],
  });
  await call('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  assert.equal(await count(), 1, 'Cancel does not launch');
  assert.equal(
    await evaluate(
      `document.querySelector('#pump').getAttribute('aria-pressed')`,
    ),
    'false',
  );
  await call('Emulation.setTouchEmulationEnabled', { enabled: false });
  await evaluate(`document.querySelector('#pump').focus()`);
  for (const code of ['Space', 'Enter']) {
    const key = code === 'Space' ? ' ' : 'Enter';
    const params = {
      key,
      code,
      windowsVirtualKeyCode: code === 'Space' ? 32 : 13,
    };
    const before = await count();
    await call('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      autoRepeat: true,
      ...params,
    });
    await delay(120);
    await call('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
    assert.equal(await count(), before + 1, 'One balloon per key gesture');
  }
  await mouse('mousePressed', p);
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  await mouse('mouseReleased', p);
  assert.equal(
    await evaluate(
      `document.querySelector('#pump').getAttribute('aria-pressed')`,
    ),
    'false',
  );
  const beforeResize = await count();
  await mouse('mousePressed', p);
  await call('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(100);
  await mouse('mouseReleased', { x: 8, y: 150 });
  assert.equal(await count(), beforeResize, 'Resize cancels without launch');
  report(
    'Balloon: trusted CDP touch, two fingers, pointer cancellation, keyboard repeat, blur and resize cancellation PASS',
  );

  await visit();
  const sources = await evaluate(
    `(()=>{const set=new Set();for(let i=0;i<200;i++){document.querySelector('#pump').click();set.add(document.querySelector('.balloon:last-child').src)}return [...set]})()`,
  );
  assert.equal(sources.length, 4, 'Four distinct assets repeat');
  assert.equal(await count(), 18, '200 launches bounded at 18 nodes');
  await delay(9800);
  assert.equal(await count(), 0, 'Expired balloons removed');
  const frames = await evaluate('window.rafCalls');
  await delay(250);
  assert.equal(await evaluate('window.rafCalls'), frames, 'Idle loop stops');
  await mouse('mousePressed', await point());
  await delay(2700);
  const heldFrames = await evaluate('window.rafCalls');
  await delay(200);
  assert.equal(
    await evaluate('window.rafCalls'),
    heldFrames,
    'Maximum held loop stops',
  );
  await mouse('mouseReleased', await point());
  await evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))`,
  );
  assert.equal(await count(), 0, 'Hidden clears flight nodes');
  assert.equal(
    await evaluate(
      `document.querySelector('#pump').getAttribute('aria-pressed')`,
    ),
    'false',
  );
  report(
    'Balloon: four variants, 200 launches / 18-node cap, 9.5s expiry, idle and held-max RAF stop, synthetic hidden cleanup PASS',
  );

  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await visit();
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.hand')).animationName`,
    ),
    'none',
  );
  await evaluate(`document.querySelector('#pump').click()`);
  await delay(80);
  const transform = await evaluate(
    `document.querySelector('.balloon').style.transform`,
  );
  await delay(300);
  assert.equal(
    await evaluate(`document.querySelector('.balloon').style.transform`),
    transform,
    'Reduced motion stays still',
  );
  await shot('balloon-reduced-motion');
  await evaluate(`window.dispatchEvent(new Event('pagehide'))`);
  assert.equal(await count(), 0, 'Pagehide clears flights');
  await call('Emulation.setEmulatedMedia', { features: [] });
  await visit('/');
  assert.equal(
    await evaluate(`document.querySelectorAll('.game-card').length`),
    9,
  );
  await evaluate(`document.querySelector('a[href="pukapuka-fusen/"]').click()`);
  await waitFor(
    `document.readyState === 'complete' && !!document.querySelector('#pump')`,
  );
  assert.equal(
    await evaluate('document.title'),
    'ぷかぷか、ふうせん｜おもちゃボックス',
  );
  await evaluate(
    `document.querySelector('#pump').click();document.querySelector('#back').click()`,
  );
  await waitFor(`document.querySelectorAll('.game-card').length===9`);
  assert.equal(
    await evaluate(`document.querySelectorAll('.game-card').length`),
    9,
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Balloon: reduced motion, pagehide, hub navigation/return, no JavaScript exceptions PASS',
  );
  await writeFile(
    join(output, 'balloon-results.txt'),
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
