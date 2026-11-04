import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'jelly-browser-'));
const output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const server = createStaticServer(
  process.env.JELLY_BUILD || join(root, 'dist'),
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
    await call('Page.navigate', { url: origin + '/biyoon-jelly/' });
    await waitFor(
      `performance.timeOrigin !== ${previous} && document.readyState === 'complete' && document.querySelector('#scene')?.dataset.ready==='true'`,
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
  const state = () =>
    evaluate("document.querySelector('#scene').dataset.state");
  const transform = () =>
    evaluate("getComputedStyle(document.querySelector('#art')).transform");
  const settled = async () => {
    await delay(720);
    assert.equal(await state(), 'idle');
    assert.equal(await transform(), 'none');
    assert.equal(await evaluate('document.getAnimations().length'), 0);
  };
  const center = () =>
    evaluate(
      `(()=>{const r=document.querySelector('#jelly').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
  const touch = (type, points = []) =>
    call('Input.dispatchTouchEvent', { type, touchPoints: points });
  const visible = `(()=>{const r=document.querySelector('#art').getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1})()`;
  const targets = `(()=>{return [...document.querySelectorAll('button:not([hidden]),#back')].every(n=>{const r=n.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1})})()`;
  const key = (type, name, code = name) =>
    call('Input.dispatchKeyEvent', { type, key: name, code });
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
    await evaluate("document.querySelector('#art').decode()");
    await delay(100);
    assert.ok(
      await evaluate(targets),
      `56px visible targets ${width}x${height}`,
    );
    assert.ok(await evaluate(visible));
    assert.ok(
      await evaluate(
        'document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight',
      ),
    );
    await shot(`jelly-${width}x${height}-idle`);
    const p = await center();
    await touch('touchStart', [{ ...p, id: 1 }]);
    const pressed = await transform();
    assert.equal(await state(), 'stretching');
    await touch('touchMove', [{ x: p.x, y: Math.max(0, p.y - 180), id: 1 }]);
    assert.notEqual(
      await transform(),
      pressed,
      'Dragging visibly changes shape',
    );
    assert.ok(await evaluate(visible), 'Upward stretch remains on screen');
    await shot(`jelly-${width}x${height}-stretch`);
    for (const [x, y] of [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ]) {
      await touch('touchMove', [{ x, y, id: 1 }]);
      assert.ok(await evaluate(visible), `Extreme stretch ${x},${y} bounded`);
    }
    await touch('touchEnd');
    assert.equal(await state(), 'settling');
    await settled();
    await touch('touchStart', [
      { ...p, id: 1 },
      { x: p.x + 10, y: p.y + 10, id: 2 },
    ]);
    await touch('touchCancel');
    assert.equal(await state(), 'idle');
    assert.equal(await transform(), 'none');
    await touch('touchStart', [{ ...p, id: 1 }]);
    await touch('touchEnd');
    await settled();
    report(
      `Jelly ${width}x${height}: image decode, 56px controls, real CDP touch drag/release, extreme bounds, multitouch/cancel, repeat response, no overflow PASS`,
    );
  }
  await evaluate("document.querySelector('#jelly').focus()");
  await key('keyDown', 'ArrowUp');
  assert.equal(await state(), 'stretching');
  assert.notEqual(await transform(), 'none');
  await key('keyUp', 'ArrowUp');
  await settled();
  for (const [name, code] of [
    [' ', 'Space'],
    ['Enter', 'Enter'],
  ]) {
    await key('keyDown', name, code);
    assert.equal(await state(), 'stretching');
    await key('keyUp', name, code);
    await settled();
  }
  await evaluate(
    "for(let i=0;i<1000;i++)document.querySelector('#jelly').click()",
  );
  assert.ok(
    await evaluate('document.getAnimations().length<=1'),
    'Rapid presses keep one animation',
  );
  await settled();
  for (const event of ['blur', 'pagehide', 'visibilitychange']) {
    await evaluate("document.querySelector('#jelly').focus()");
    await key('keyDown', 'ArrowUp');
    assert.equal(await state(), 'stretching');
    if (event === 'visibilitychange')
      await evaluate(
        "Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))",
      );
    else await evaluate(`window.dispatchEvent(new Event('${event}'))`);
    assert.equal(await state(), 'idle');
    assert.equal(await transform(), 'none');
    assert.equal(await evaluate('document.getAnimations().length'), 0);
    await key('keyUp', 'ArrowUp');
    if (event === 'visibilitychange')
      await evaluate(
        "delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))",
      );
    else
      await evaluate(
        `window.dispatchEvent(new Event('${event === 'pagehide' ? 'pageshow' : 'focus'}'))`,
      );
    await click('#jelly');
    await settled();
  }
  await evaluate("document.querySelector('#jelly').focus()");
  await key('keyDown', 'ArrowUp');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await delay(150);
  assert.equal(await state(), 'idle');
  assert.equal(await transform(), 'none');
  await key('keyUp', 'ArrowUp');
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await waitFor("matchMedia('(prefers-reduced-motion: reduce)').matches");
  await click('#jelly');
  await delay(200);
  assert.equal(await state(), 'idle');
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  await click('#back');
  await waitFor(
    "location.pathname==='/' && !!document.querySelector('a[href=\"biyoon-jelly/\"]')",
  );
  assert.ok(
    await evaluate('!!document.querySelector(\'a[href*="anipopina.com"]\')'),
  );
  await click('a[href="biyoon-jelly/"]');
  await waitFor(
    "location.pathname==='/biyoon-jelly/' && document.querySelector('#scene')?.dataset.ready==='true'",
  );
  assert.equal(await state(), 'idle');
  await click('#jelly');
  await settled();
  const decodeFailure = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `const nativeDecode=HTMLImageElement.prototype.decode;let decodeCalls=0;HTMLImageElement.prototype.decode=function(){return decodeCalls++===0?Promise.reject(new Error('injected decode failure')):nativeDecode.call(this)}`,
  });
  await visit();
  await waitFor("document.querySelector('#retry')?.hidden===false");
  assert.ok(await evaluate(targets));
  await click('#retry');
  await waitFor("document.querySelector('#retry')?.hidden===true");
  await evaluate("document.querySelector('#art').decode()");
  await click('#jelly');
  await settled();
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: decodeFailure.identifier,
  });
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Jelly PASS: held arrow/Space/Enter, 1000 clicks bounded, hidden/blur/pagehide cleanup and recovery, resize, reduced-motion, home/reentry, injected decode rejection/retry, no JS exceptions. Chromium emulation only; physical Safari/device/child usability unverified.',
  );
  await writeFile(join(output, 'jelly-results.txt'), reports.join('\n') + '\n');
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
