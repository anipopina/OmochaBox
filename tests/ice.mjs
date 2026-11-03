import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'ice-browser-'));
const output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const server = createStaticServer(process.env.ICE_BUILD || join(root, 'dist'));
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
  const visit = async () => {
    const previous = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + '/tsumitsumi-ice/' });
    await waitFor(
      `performance.timeOrigin !== ${previous} && document.readyState === 'complete' && !!document.querySelector('#stack')`,
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
  const click = async (selector) => {
    await delay(90);
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).click()`,
    );
  };
  const flavors = ['strawberry', 'vanilla', 'chocolate'];
  const flavor = (index) => `button[data-flavor="${flavors[index]}"]`;
  const sequence = () =>
    evaluate(
      "[...document.querySelectorAll('#stack .scoop')].map(n=>n.dataset.flavor)",
    );
  const center = (selector) =>
    evaluate(
      `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
  const touch = (type, points = []) =>
    call('Input.dispatchTouchEvent', { type, touchPoints: points });
  const visibleTargets = `(()=>{const ns=[...document.querySelectorAll('button:not([hidden]),#back')];return ns.every(n=>{const r=n.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1})})()`;
  const noScroll = `(()=>{document.querySelector('#reset').scrollIntoView();window.scrollTo(999,999);return scrollX===0&&scrollY===0&&document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight})()`;
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [820, 1180],
    [844, 390],
    [568, 320],
    [1280, 900],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await call('Emulation.setTouchEmulationEnabled', { enabled: true });
    await visit();
    await evaluate('Promise.all([...document.images].map(i=>i.decode()))');
    assert.ok(
      await evaluate(visibleTargets),
      `56px fully visible targets at ${width}x${height}`,
    );
    assert.ok(await evaluate(noScroll), `No page scroll at ${width}x${height}`);
    assert.deepEqual(await sequence(), []);
    await shot(`ice-${width}x${height}-empty`);
    const p = await center(flavor(0));
    await touch('touchStart', [{ ...p, id: 1 }]);
    await touch('touchEnd');
    await waitFor("document.querySelectorAll('#stack .scoop').length===1");
    assert.deepEqual(await sequence(), ['strawberry']);
    for (const i of [1, 2, 0, 1]) await click(flavor(i));
    assert.deepEqual(await sequence(), [
      'strawberry',
      'vanilla',
      'chocolate',
      'strawberry',
      'vanilla',
    ]);
    await click(flavor(2));
    assert.deepEqual(await sequence(), [
      'strawberry',
      'vanilla',
      'chocolate',
      'strawberry',
      'chocolate',
    ]);
    await delay(800);
    assert.ok(
      await evaluate(
        `(()=>{const r=document.querySelector('#stack').getBoundingClientRect();return [...document.querySelectorAll('#stack img')].every(n=>{const b=n.getBoundingClientRect();return b.x>=0&&b.y>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1&&b.x>=r.x-1&&b.right<=r.right+1})})()`,
      ),
      'Full stack remains visible',
    );
    await shot(`ice-${width}x${height}-stacked`);
    const before = await sequence();
    await click('#stack');
    assert.deepEqual(await sequence(), before);
    assert.ok(
      await evaluate('document.getAnimations().length>0'),
      'Stack tap responds',
    );
    await evaluate(
      `for(let i=0;i<1000;i++)document.querySelectorAll('button[data-flavor]')[i%3].click()`,
    );
    assert.equal((await sequence()).length, 5);
    assert.ok(
      await evaluate('document.getAnimations().length<=8'),
      'Animation cap after rapid input',
    );
    await delay(1000);
    assert.equal(await evaluate('document.getAnimations().length'), 0);
    assert.ok(await evaluate(visibleTargets));
    assert.ok(await evaluate(noScroll));
    await click('#reset');
    assert.deepEqual(await sequence(), []);
    report(
      `Ice ${width}x${height}: assets, touch, ordered stacking, five-scoop cap/top replacement, repeat response, 1000 inputs, reset, 56px targets, no scroll/cutoff PASS`,
    );
  }
  await delay(90);
  await evaluate(
    `document.querySelector(${JSON.stringify(flavor(1))}).focus()`,
  );
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
  });
  assert.deepEqual(await sequence(), ['vanilla']);
  const p1 = await center(flavor(0)),
    p2 = await center(flavor(2));
  await touch('touchStart', [
    { ...p1, id: 1 },
    { ...p2, id: 2 },
  ]);
  await touch('touchCancel');
  assert.ok((await sequence()).length <= 3, 'Cancelled multi-touch is bounded');
  await click(flavor(2));
  let kept = await sequence();
  await evaluate(
    "Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))",
  );
  assert.deepEqual(await sequence(), kept);
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  await evaluate(
    "delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))",
  );
  await click('#stack');
  await evaluate("window.dispatchEvent(new Event('blur'))");
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  assert.deepEqual(await sequence(), kept);
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await click('#stack');
  await evaluate("window.dispatchEvent(new Event('pagehide'))");
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  assert.deepEqual(await sequence(), kept);
  await evaluate("window.dispatchEvent(new Event('pageshow'))");
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await delay(150);
  assert.deepEqual(await sequence(), kept);
  assert.ok(await evaluate(visibleTargets));
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await waitFor("matchMedia('(prefers-reduced-motion: reduce)').matches");
  await click(flavor(0));
  await delay(300);
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  kept = await sequence();
  await click('#stack');
  assert.deepEqual(await sequence(), kept);
  await delay(300);
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  await click('#back');
  await waitFor(
    "location.pathname==='/' && !!document.querySelector('a[href=\"tsumitsumi-ice/\"]')",
  );
  assert.ok(
    await evaluate('!!document.querySelector(\'a[href*="anipopina.com"]\')'),
  );
  await click('a[href="tsumitsumi-ice/"]');
  await waitFor(
    "location.pathname==='/tsumitsumi-ice/' && !!document.querySelector('#stack')",
  );
  assert.deepEqual(await sequence(), []);
  await click(flavor(1));
  assert.deepEqual(await sequence(), ['vanilla']);
  const decodeFailure = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `const nativeDecode=HTMLImageElement.prototype.decode;let decodeCalls=0;HTMLImageElement.prototype.decode=function(){return decodeCalls++===0?Promise.reject(new Error('injected decode failure')):nativeDecode.call(this)}`,
  });
  await visit();
  await waitFor("document.querySelector('#retry')?.hidden===false");
  await click(flavor(0));
  await click(flavor(2));
  assert.deepEqual(await sequence(), ['strawberry', 'chocolate']);
  await click('#retry');
  await waitFor("document.querySelector('#retry')?.hidden===true");
  await evaluate('Promise.all([...document.images].map(i=>i.decode()))');
  assert.deepEqual(await sequence(), ['strawberry', 'chocolate']);
  await click(flavor(1));
  assert.deepEqual(await sequence(), ['strawberry', 'chocolate', 'vanilla']);
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: decodeFailure.identifier,
  });
  report(
    'Ice image recovery PASS: injected first decode rejection shows retry, input remains available, retry restores decoded images and preserves existing scoop order. This is fault injection, not a real network outage.',
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Ice PASS: keyboard, multitouch/cancel, visibility/blur/pagehide retention and cleanup, resize, reduced motion, home/reentry, no JS errors. Chromium emulation only; physical Safari/device/child usability unverified.',
  );
  await writeFile(join(output, 'ice-results.txt'), reports.join('\n') + '\n');
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
