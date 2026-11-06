import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Friend } from '../src/mogumogu-tomodachi/model.ts';
import { createStaticServer } from './static-server.mjs';
const model = new Friend();
model.offer('strawberry');
for (let i = 0; i < 10000; i++) model.offer(i % 2 ? 'carrot' : 'banana');
assert.equal(model.food, 'strawberry');
assert.equal(model.next, 'carrot');
for (let i = 0; i < 160; i++) model.step(80);
assert.equal(model.phase, 'idle');
assert.equal(model.meals, 2);
for (const phase of ['offering', 'chewing', 'swallowing', 'happy']) {
  model.offer('banana');
  while (model.phase !== phase) model.step(80);
  model.offer('carrot');
  model.reset();
  assert.equal(model.phase, 'idle');
  assert.equal(model.next, null);
}
// Touch feedback is one replaceable response and never owns the meal clock.
for (const state of ['idle', 'offering', 'chewing', 'swallowing', 'happy']) {
  model.reset();
  if (state !== 'idle') {
    model.offer('strawberry');
    while (model.phase !== state) model.step(20);
    model.offer('carrot');
  }
  const before = [
    model.phase,
    model.elapsed,
    model.food,
    model.next,
    model.meals,
  ];
  for (let i = 0; i < 10000; i++) model.touch();
  assert.deepEqual(
    [model.phase, model.elapsed, model.food, model.next, model.meals],
    before,
  );
  assert.equal(model.touchRemaining, 520);
  for (let i = 0; i < 7; i++) model.step(80);
  assert.equal(model.touchRemaining, 0);
  model.touch();
  model.reset();
  assert.equal(model.touchRemaining, 0);
}
model.touch();
model.offer('banana');
assert.equal(model.phase, 'offering');
console.log(
  'Mogu model PASS: 10000 inputs produce exactly two meals; all interrupted phases reset',
);
const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'mogu-browser-'));
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
  const visit = async (path = '/mogumogu-tomodachi/') => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + path });
    await waitFor(
      `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete'`,
    );
    await waitFor(
      path === '/'
        ? "document.querySelectorAll('.game-card').length===18"
        : "document.querySelector('#friend')?.dataset.ready === 'true'",
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
  const phase = () =>
    evaluate("document.querySelector('#friend').dataset.phase");
  const choose = async (food) =>
    evaluate(
      `document.querySelector('#foods button[data-food="${food}"]').click()`,
    );
  const touchFood = async (food) => {
    const p = await evaluate(
      `(()=>{const r=document.querySelector('#foods button[data-food="${food}"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
    await call('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...p, id: 1 }],
    });
    await call('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  };
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true });
  await visit('/');
  await evaluate(
    `document.querySelector('a[href="mogumogu-tomodachi/"]').click()`,
  );
  await waitFor(`document.querySelector('#friend')?.dataset.ready==='true'`);
  await waitFor(
    `[...document.images].every(i=>i.id==='flying-food'||(i.complete&&i.naturalWidth>0))`,
  );
  await shot('mogu-idle-mobile');
  const checkTouchAnchor = async (label) => {
    await evaluate(`(() => {
      const image = document.querySelector('.body-art');
      const face = document.querySelector('.face');
      const sample = () => {
        const r = image.getBoundingClientRect();
        const m = face.getScreenCTM();
        const svgBottom = new DOMPoint(250, 500).matrixTransform(m);
        return {x:r.x+r.width/2, y:r.bottom, width:r.width, height:r.height,
          svgX:svgBottom.x, svgY:svgBottom.y};
      };
      window.anchorSamples = [sample()];
      window.anchorDone = false;
      document.querySelector('#friend').click();
      const start = performance.now();
      const capture = () => {
        window.anchorSamples.push(sample());
        if (performance.now()-start < 700) requestAnimationFrame(capture);
        else window.anchorDone = true;
      };
      requestAnimationFrame(capture);
    })()`);
    await delay(240);
    await shot(`mogu-anchor-${label}-squeezed`);
    await waitFor('window.anchorDone');
    const samples = await evaluate('window.anchorSamples');
    const first = samples[0];
    const metrics = {
      label,
      samples,
      maxXDrift: Math.max(...samples.map((s) => Math.abs(s.x - first.x))),
      maxYDrift: Math.max(...samples.map((s) => Math.abs(s.y - first.y))),
      maxFaceDrift: Math.max(
        ...samples.map((s) => Math.hypot(s.svgX - s.x, s.svgY - s.y)),
      ),
      minHeightRatio: Math.min(...samples.map((s) => s.height / first.height)),
    };
    await writeFile(
      join(output, `mogu-anchor-${label}.json`),
      JSON.stringify(metrics, null, 2),
    );
    console.log(
      'Touch anchor',
      label,
      JSON.stringify({ ...metrics, samples: undefined }),
    );
    assert.ok(metrics.minHeightRatio < 0.95, 'Body visibly shrinks');
    assert.ok(
      metrics.maxXDrift < 0.1,
      'Image bottom center stays fixed horizontally',
    );
    assert.ok(
      metrics.maxYDrift < 0.1,
      'Image bottom center stays fixed vertically',
    );
    assert.ok(
      metrics.maxFaceDrift < 0.1,
      'SVG viewBox stays aligned with body image',
    );
  };
  await checkTouchAnchor('mobile');

  assert.ok(
    await evaluate(
      `[...document.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
    ),
  );
  const touchFriend = async () => {
    const p = await evaluate(
      `(()=>{const r=document.querySelector('#friend').getBoundingClientRect();return {x:r.x+r.width*0.3,y:r.y+r.height*0.6}})()`,
    );
    await call('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...p, id: 1 }],
    });
    await call('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  };
  await touchFriend();
  assert.equal(await phase(), 'idle');
  assert.equal(
    await evaluate(`document.querySelector('#friend').dataset.touched`),
    'true',
  );
  await delay(180);
  assert.notEqual(
    await evaluate(`document.querySelector('.friend-art').style.scale`),
    '1 1',
  );
  await shot('mogu-touch-idle-mobile');
  await choose('banana');
  assert.equal(await phase(), 'offering');
  assert.equal(
    await evaluate(`document.querySelector('.friend-art').style.scale`),
    '1',
  );
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  for (const state of ['offering', 'chewing', 'swallowing', 'happy']) {
    await choose('strawberry');
    await waitFor(
      `document.querySelector('#friend').dataset.phase==='${state}'`,
    );
    await choose('carrot');
    await evaluate(
      `for(let i=0;i<100;i++)document.querySelector('#friend').click()`,
    );
    assert.equal(await phase(), state);
    assert.equal(
      await evaluate(`document.querySelector('button.next').dataset.food`),
      'carrot',
    );
    assert.equal(
      await evaluate(
        `getComputedStyle(document.querySelector('.eyes-happy')).opacity`,
      ),
      '1',
    );
    assert.equal(
      await evaluate(`document.querySelector('.friend-art').style.scale`),
      '1',
    );
    if (state === 'chewing') {
      assert.equal(
        await evaluate(
          `getComputedStyle(document.querySelector('.mouth-closed')).opacity`,
        ),
        '1',
      );
      await shot('mogu-touch-chewing-mobile');
    }
    await waitFor(`document.querySelector('#friend').dataset.food==='carrot'`);
    await waitFor(`document.querySelector('#friend').dataset.phase==='idle'`);
    assert.equal(
      await evaluate(`document.querySelector('#friend').dataset.touched`),
      'false',
    );
  }
  for (const event of ['blur', 'pagehide', 'resize']) {
    await touchFriend();
    await evaluate(`window.dispatchEvent(new Event('${event}'))`);
    assert.equal(
      await evaluate(`document.querySelector('#friend').dataset.touched`),
      'false',
    );
  }
  await touchFriend();
  await evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;`,
  );
  assert.equal(
    await evaluate(`document.querySelector('#friend').dataset.touched`),
    'false',
  );
  for (const food of ['strawberry', 'banana', 'carrot']) {
    await touchFood(food);
    await waitFor(
      `document.querySelector('#friend').dataset.phase==='offering'`,
    );
    // Model time advances on RAF and caps long deltas. A 510ms host sleep
    // can finish before the mouth transition when Chromium drops frames.
    await waitFor(
      `document.querySelector('#friend').dataset.phase==='offering' && document.querySelector('#flying-food').hidden`,
    );
    await shot(`mogu-${food}-mouth`);
    await waitFor(
      `document.querySelector('#friend').dataset.phase==='chewing'`,
    );
    assert.equal(
      await evaluate(
        `getComputedStyle(document.querySelector('.mouth-open')).opacity`,
      ),
      '0',
    );
    assert.equal(
      await evaluate(
        `getComputedStyle(document.querySelector('.mouth-closed')).opacity`,
      ),
      '1',
    );
    await shot(`mogu-${food}-chewing`);
    await waitFor(`document.querySelector('#friend').dataset.phase==='happy'`);
    await shot(`mogu-${food}-happy`);
    await waitFor(`document.querySelector('#friend').dataset.phase==='idle'`);
  }
  await choose('strawberry');
  await evaluate(
    `for(let i=0;i<100;i++)document.querySelector('#foods button[data-food="banana"]').click();document.querySelector('#foods button[data-food="carrot"]').click()`,
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('button.next').length`),
    1,
  );
  assert.equal(
    await evaluate(`document.querySelector('button.next').dataset.food`),
    'carrot',
  );
  assert.ok(
    await evaluate(`document.getAnimations().length<=3`),
    'Repeated input animations bounded',
  );
  await shot('mogu-next-bite');
  await waitFor(`document.querySelector('#friend').dataset.food==='carrot'`);
  await waitFor(`document.querySelector('#friend').dataset.phase==='idle'`);
  assert.equal(
    await evaluate(`document.querySelectorAll('button.next').length`),
    0,
  );
  for (const state of ['offering', 'chewing', 'swallowing', 'happy']) {
    await choose('banana');
    await waitFor(
      `document.querySelector('#friend').dataset.phase==='${state}'`,
    );
    await evaluate(`window.dispatchEvent(new Event('blur'))`);
    assert.equal(await phase(), 'idle');
    assert.equal(
      await evaluate(`document.querySelector('#flying-food').hidden`),
      true,
    );
  }
  await choose('carrot');
  await evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;`,
  );
  assert.equal(await phase(), 'idle');
  await choose('banana');
  await evaluate(
    `window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'))`,
  );
  assert.equal(await phase(), 'idle');
  await choose('strawberry');
  for (const [width, height] of [
    [844, 390],
    [320, 568],
    [768, 1024],
    [1280, 800],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 900,
    });
    await delay(100);
    assert.equal(await phase(), 'idle');
    assert.ok(
      await evaluate(
        `[...document.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
      ),
    );
    await shot(`mogu-${width}x${height}`);
    await checkTouchAnchor(`${width}x${height}`);
  }
  await evaluate(
    `document.querySelector('#foods button[data-food="banana"]').focus()`,
  );
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    text: '\r',
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
  assert.equal(await phase(), 'offering');
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await waitFor(
    `matchMedia('(prefers-reduced-motion: reduce)').matches && document.querySelector('#friend').dataset.phase==='idle'`,
  );
  for (const [key, code, vk] of [
    ['Enter', 'Enter', 13],
    [' ', 'Space', 32],
  ]) {
    await evaluate(`document.querySelector('#friend').focus()`);
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: vk,
      text: key === 'Enter' ? '\r' : ' ',
    });
    await call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: vk,
    });
    assert.equal(
      await evaluate(`document.querySelector('#friend').dataset.touched`),
      'true',
    );
    assert.equal(
      await evaluate(`document.querySelector('.friend-art').style.scale`),
      '1',
    );
    await shot('mogu-touch-reduced-keyboard');
    await waitFor(
      `document.querySelector('#friend').dataset.touched==='false'`,
    );
  }
  await choose('carrot');
  await waitFor(`document.querySelector('#friend').dataset.phase==='happy'`);
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('#friend')).animationName`,
    ),
    'none',
  );
  await waitFor(`document.querySelector('#friend').dataset.phase==='idle'`);
  const frames = await evaluate('window.rafCalls');
  await delay(200);
  assert.equal(await evaluate('window.rafCalls'), frames, 'Idle RAF stops');
  await choose('banana');
  await evaluate(`document.querySelector('#back').click()`);
  await waitFor(`document.querySelectorAll('.game-card').length===18`);
  await evaluate(
    `document.querySelector('a[href="mogumogu-tomodachi/"]').click()`,
  );
  await waitFor(`document.querySelector('#friend')?.dataset.ready==='true'`);
  assert.equal(await phase(), 'idle');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Mogu PASS: body touch, 100 repeats per meal phase, preserved next bite, immediate food acceptance, touch interruptions, Enter/Space, reduced-motion touch; real browser touch simulation, all foods, clipped mouth, closed chewing, bounded repeats, all phase interruptions, resize, reduced motion, keyboard, home/reentry, final asset loading, idle RAF, no JS errors',
  );
  await writeFile(join(output, 'mogu-results.txt'), reports.join('\n') + '\n');
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
