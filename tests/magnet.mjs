import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'magnet-browser-'));
const output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const server = createStaticServer(
  process.env.MAGNET_BUILD || join(root, 'dist'),
);
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
    await call('Page.navigate', { url: origin + '/pitatto-magnet/' });
    await waitFor(
      `performance.timeOrigin !== ${previous} && document.readyState === 'complete' && document.querySelector('#field')?.dataset.ready==='true'`,
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
  const attached = () =>
    evaluate("Number(document.querySelector('#field').dataset.attached)");
  const settled = () =>
    waitFor("document.querySelector('#field').dataset.moving==='false'");
  const center = (selector) =>
    evaluate(
      `(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
  const touch = (type, points = []) =>
    call('Input.dispatchTouchEvent', { type, touchPoints: points });
  const tap = async (selector) => {
    const p = await center(selector);
    await touch('touchStart', [{ ...p, id: 1 }]);
    await touch('touchEnd');
    await delay(100);
  };
  const targets = `(()=>[...document.querySelectorAll('#field button,#back,button#retry:not([hidden])')].every(n=>{const r=n.getBoundingClientRect();return r.width>=55.99&&r.height>=55.99&&r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1}))()`;
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
    await delay(100);
    assert.ok(await evaluate(targets), `initial targets ${width}x${height}`);
    assert.equal(await attached(), 0);
    await shot(`magnet-${width}x${height}-initial`);
    await tap('.toy');
    await settled();
    assert.ok((await attached()) > 0, 'real touch gathers');
    for (let i = 1; i <= 6; i++) {
      await click(`.toy:nth-of-type(${i + 1})`);
      await settled();
    }
    assert.equal(await attached(), 6, 'all toys collect');
    assert.ok(
      await evaluate(targets),
      JSON.stringify(
        await evaluate(
          "[...document.querySelectorAll('#field button,#back')].map(n=>({id:n.id,rect:n.getBoundingClientRect().toJSON()}))",
        ),
      ),
    );
    await shot(`magnet-${width}x${height}-gathered`);
    const p = await center('#magnet');
    await touch('touchStart', [{ ...p, id: 1 }]);
    await touch('touchMove', [{ x: width - 1, y: height - 1, id: 1 }]);
    await touch('touchEnd');
    await settled();
    assert.equal(await attached(), 6, 'drag release keeps toys attached');
    assert.ok(await evaluate(targets), 'extreme drag bounded');
    await tap('#magnet');
    await settled();
    assert.equal(await attached(), 0, 'tap releases');
    await tap('#magnet');
    await settled();
    assert.ok((await attached()) > 0, 'empty magnet tap collects');
    const q = await center('#magnet');
    await touch('touchStart', [
      { ...q, id: 1 },
      { x: q.x + 5, y: q.y + 5, id: 2 },
    ]);
    await touch('touchCancel');
    await delay(50);
    assert.equal(
      await evaluate("document.querySelector('#field').dataset.moving"),
      'false',
    );
    assert.ok(
      await evaluate(
        'document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight',
      ),
    );
    report(
      `Magnet ${width}x${height}: real tap, six captures, drag/release, scatter/reacquire, multiple touches/cancel, 56px bounds, overflow PASS`,
    );
  }
  await evaluate("document.querySelector('#magnet').focus()");
  const before = await center('#magnet');
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'ArrowLeft',
    code: 'ArrowLeft',
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'ArrowLeft',
    code: 'ArrowLeft',
  });
  await settled();
  assert.ok((await center('#magnet')).x < before.x, 'keyboard movement');
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
  await settled();
  assert.equal(await attached(), 0, 'Enter releases');
  await click('.toy');
  await evaluate("window.dispatchEvent(new Event('blur'))");
  assert.equal(
    await evaluate("document.querySelector('#field').dataset.moving"),
    'false',
  );
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  await click('#magnet');
  await settled();
  await evaluate(
    "document.querySelector('.toy').click();Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))",
  );
  assert.equal(
    await evaluate("document.querySelector('#field').dataset.moving"),
    'false',
  );
  await evaluate(
    "delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))",
  );
  await click('.toy');
  await settled();
  assert.ok((await attached()) > 0);
  await evaluate("window.dispatchEvent(new Event('pagehide'))");
  await click('#magnet');
  assert.ok((await attached()) > 0, 'inactive click ignored');
  await evaluate("window.dispatchEvent(new Event('pageshow'))");
  await click('#magnet');
  await settled();
  assert.equal(await attached(), 0);
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await click('.toy');
  await settled();
  assert.ok((await attached()) > 0);
  await call('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 568,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(100);
  assert.ok(await evaluate(targets));
  await click('#back');
  await waitFor(
    "location.pathname==='/'&&!!document.querySelector('a[href=\"pitatto-magnet/\"]')",
  );
  assert.ok(
    await evaluate('!!document.querySelector(\'a[href*="anipopina.com"]\')'),
  );
  await click('a[href="pitatto-magnet/"]');
  await waitFor("document.querySelector('#field')?.dataset.ready==='true'");
  assert.equal(await attached(), 0);
  const failure = await call('Page.addScriptToEvaluateOnNewDocument', {
    source:
      "const original=HTMLImageElement.prototype.decode;let n=0;HTMLImageElement.prototype.decode=function(){return n++===0?Promise.reject(new Error('injected failure')):original.call(this)}",
  });
  await call('Page.navigate', { url: origin + '/pitatto-magnet/' });
  await waitFor("document.querySelector('#retry')?.hidden===false");
  await click('#retry');
  await waitFor("document.querySelector('#field')?.dataset.ready==='true'");
  await click('.toy');
  await settled();
  assert.ok((await attached()) > 0);
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: failure.identifier,
  });
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Magnet: keyboard, blur/hidden/pagehide cleanup, reduced motion, resize, home/reentry, image decode retry, zero JS exceptions PASS. Physical devices and independent review not run.',
  );
  await writeFile(
    join(output, 'magnet-results.txt'),
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
