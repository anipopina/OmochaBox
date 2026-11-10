import { gameCount } from './catalogue.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'ehon-browser-'));
const output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const server = createStaticServer(process.env.EHON_BUILD || join(root, 'dist'));
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
    await call('Page.navigate', { url: origin + '/kurutto-ehon/' });
    await waitFor(
      `performance.timeOrigin !== ${previous} && document.readyState === 'complete' && document.querySelector('#book')?.dataset.ready==='true'`,
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
  const page = () =>
    evaluate("Number(document.querySelector('#book').dataset.page)");
  const settled = () =>
    waitFor("document.querySelector('#book').dataset.busy==='false'");
  const center = (selector) =>
    evaluate(
      `(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
  const touch = (type, points = []) =>
    call('Input.dispatchTouchEvent', { type, touchPoints: points });
  const tap = async (selector) => {
    await evaluate(
      'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
    );
    const p = await center(selector);
    await touch('touchStart', [{ ...p, id: 1 }]);
    await touch('touchEnd');
    await settled();
  };
  const drag = async (fraction, cancel = false) => {
    const r = await evaluate(
      "document.querySelector('#book').getBoundingClientRect().toJSON()",
    );
    const start = { x: r.x + r.width * 0.85, y: r.y + r.height * 0.45, id: 1 };
    await touch('touchStart', [start]);
    await touch('touchMove', [{ ...start, x: start.x - r.width * fraction }]);
    assert.ok(
      await evaluate(
        "Number(document.querySelector('#book').dataset.progress)>0",
      ),
      'drag reveals page',
    );
    if (fraction === 0.5)
      await shot('ehon-fold-' + (await evaluate('innerWidth')));
    await touch(cancel ? 'touchCancel' : 'touchEnd');
    await settled();
  };
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
    assert.ok(
      await evaluate(
        `([...document.querySelectorAll('.turn,#back')].every(n=>{const r=n.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}))`,
      ),
      'targets in viewport',
    );
    assert.equal(await page(), 0);
    await tap('#next');
    assert.equal(await page(), 1);
    await tap('#previous');
    assert.equal(await page(), 0);
    await drag(0.1);
    assert.equal(await page(), 0, 'short drag returns');
    await drag(0.5, true);
    assert.equal(await page(), 0, 'cancel returns');
    await drag(0.5);
    assert.equal(await page(), 1, 'long drag turns');
    await tap('#next');
    assert.equal(await page(), 2);
    await tap('#next');
    assert.equal(await page(), 0, 'wraps');
    await shot(`ehon-${width}x${height}`);
    report(
      `Ehon ${width}x${height}: touch next/previous, short/long drag, cancellation, wrap, target bounds PASS`,
    );
  }
  await tap('#book');
  assert.equal(await page(), 1, 'center tap turns');
  await tap('#previous');
  assert.equal(await page(), 0);
  await call('Emulation.setTouchEmulationEnabled', { enabled: false });
  const m = await center('#book');
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: m.x,
    y: m.y,
    button: 'left',
    clickCount: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: m.x,
    y: m.y,
    button: 'left',
    clickCount: 1,
  });
  await settled();
  assert.equal(await page(), 1, 'real mouse center tap');
  await call('Emulation.setTouchEmulationEnabled', { enabled: true });
  await tap('#previous');
  assert.equal(await page(), 0);
  const r = await evaluate(
    "document.querySelector('#book').getBoundingClientRect().toJSON()",
  );
  const first = { x: r.x + r.width * 0.85, y: r.y + r.height * 0.4, id: 1 };
  const second = { x: r.x + r.width * 0.25, y: r.y + r.height * 0.5, id: 2 };
  await touch('touchStart', [first]);
  await touch('touchStart', [first, second]);
  await touch('touchMove', [{ ...first, x: first.x - r.width * 0.3 }, second]);
  await touch('touchCancel');
  await settled();
  assert.equal(await page(), 0, 'multitouch cancellation');
  await tap('#next');
  await settled();
  assert.equal(await page(), 1, 'touch after cancellation');
  await tap('#previous');
  assert.equal(await page(), 0);
  await evaluate("document.querySelector('#book').focus()");
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
  await settled();
  assert.equal(await page(), 1);
  await click('#next');
  await settled();
  assert.equal(await page(), 2);
  await evaluate(
    "document.querySelector('#next').click();window.dispatchEvent(new Event('blur'))",
  );
  await delay(600);
  assert.equal(await page(), 2, 'blur cancels pending turn');
  await evaluate(
    "document.querySelector('#next').click();window.dispatchEvent(new Event('resize'))",
  );
  await delay(600);
  assert.equal(await page(), 2, 'resize cancels');
  await evaluate(
    "document.querySelector('#next').click();window.dispatchEvent(new Event('pagehide'))",
  );
  await delay(600);
  assert.equal(await page(), 2, 'pagehide cancels');
  await evaluate(
    "document.querySelector('#next').click();Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden",
  );
  await delay(600);
  assert.equal(await page(), 2, 'hidden cancels');
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await click('#next');
  await settled();
  assert.equal(await page(), 0);
  await click('#back');
  await waitFor(
    `document.querySelectorAll('.game-card').length===${gameCount}`,
  );
  assert.ok(
    await evaluate(
      '!!document.querySelector(\'a[href="https://anipopina.com/"]\')',
    ),
    'author retained',
  );
  await evaluate('document.querySelector(\'a[href="kurutto-ehon/"]\').click()');
  await waitFor("document.querySelector('#book')?.dataset.ready==='true'");
  assert.equal(await page(), 0);
  const failure = await call('Page.addScriptToEvaluateOnNewDocument', {
    source:
      "const original=HTMLImageElement.prototype.decode;let n=0;HTMLImageElement.prototype.decode=function(){return n++===0?Promise.reject(new Error('test')):original.call(this)}",
  });
  await call('Page.navigate', { url: origin + '/kurutto-ehon/' });
  await waitFor("document.querySelector('#retry')?.hidden===false");
  await click('#retry');
  await waitFor("document.querySelector('#book')?.dataset.ready==='true'");
  await tap('#next');
  assert.equal(await page(), 1);
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: failure.identifier,
  });
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Ehon: keyboard, assistive click, blur/resize cleanup, reduced motion, home/reentry, image retry, zero JS errors PASS; physical devices/child/independent review not run.',
  );
  await writeFile(join(output, 'ehon-results.txt'), reports.join('\n') + '\n');
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
