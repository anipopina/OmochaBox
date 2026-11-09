import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'clay-browser-'));
const output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const server = createStaticServer(process.env.CLAY_BUILD || join(root, 'dist'));
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
    await call('Page.navigate', { url: origin + '/munyutto-nendo/' });
    await waitFor(
      `performance.timeOrigin !== ${previous} && document.readyState === 'complete' && document.querySelector('#clay')?.dataset.ready==='true'`,
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

  const canvasData = () =>
    evaluate("document.querySelector('#clay').toDataURL()");
  const settle = async () => {
    await delay(350);
    await waitFor("document.querySelector('#clay').dataset.state==='still'");
  };
  const touch = (type, touchPoints = []) =>
    call('Input.dispatchTouchEvent', { type, touchPoints });
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
    await settle();
    const box = await evaluate(
      `(()=>{const r=document.querySelector('#clay').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`,
    );
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.w <= width + 1 &&
        box.y + box.h <= height + 1,
    );
    assert.ok(
      await evaluate(
        `['#back','#reset'].every(s=>{const r=document.querySelector(s).getBoundingClientRect();return r.width>=56&&r.height>=56&&r.x>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
      ),
    );
    const initial = await canvasData();
    await shot(`clay-${width}x${height}-initial`);
    const p = { x: box.x + box.w / 2, y: box.y + box.h / 2, id: 1 };
    await touch('touchStart', [p]);
    await touch('touchEnd');
    await settle();
    const pressed = await canvasData();
    assert.notEqual(pressed, initial, 'Tap changes shape');
    await shot(`clay-${width}x${height}-pressed`);
    await delay(500);
    assert.equal(await canvasData(), pressed, 'Shape stays after release');
    await touch('touchStart', [{ ...p, x: p.x - box.w * 0.22 }]);
    for (let n = 1; n <= 12; n++) {
      await touch('touchMove', [
        {
          ...p,
          x: p.x - box.w * 0.22 + n * box.w * 0.04,
          y: p.y + Math.sin(n / 3) * box.h * 0.16,
        },
      ]);
      await delay(17);
    }
    await touch('touchEnd');
    await settle();
    assert.notEqual(await canvasData(), pressed);
    await shot(`clay-${width}x${height}-stroke`);
    const shaped = await canvasData();
    await evaluate("window.dispatchEvent(new Event('blur'))");
    assert.equal(await canvasData(), shaped);
    await click('#reset');
    await settle();
    assert.equal(await canvasData(), initial, 'Reset restores initial image');
    await touch('touchStart', [p]);
    await touch('touchCancel');
    await settle();
    await click('#reset');
    await settle();
    await evaluate("document.querySelector('#clay').focus()");
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: ' ',
      code: 'Space',
    });
    await call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: ' ',
      code: 'Space',
    });
    await settle();
    assert.notEqual(await canvasData(), initial);
    report(
      `Clay touch/reset/cancel/keyboard/geometry ${width}x${height}: PASS`,
    );
  }
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await visit();
  await click('#clay');
  await settle();
  const preserved = await canvasData();
  await evaluate("window.dispatchEvent(new Event('blur'))");
  assert.equal(await canvasData(), preserved);
  const domCount = await evaluate(
    "document.querySelectorAll('#scene *').length",
  );
  await evaluate(
    "for(let n=0;n<1000;n++) document.querySelector('#clay').click()",
  );
  await settle();
  assert.equal(
    await evaluate("document.querySelectorAll('#scene *').length"),
    domCount,
    'No accumulated DOM per press',
  );

  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await visit();
  await settle();
  const original = await canvasData();
  await click('#clay');
  await settle();
  const shapedPortrait = await canvasData();
  await call('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await settle();
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await settle();
  assert.equal(
    await canvasData(),
    shapedPortrait,
    'Rotation preserves the finished shape',
  );
  await evaluate("window.dispatchEvent(new Event('pagehide'))");
  const hiddenShape = await canvasData();
  await click('#clay');
  await settle();
  assert.equal(await canvasData(), hiddenShape, 'No edits after pagehide');
  await evaluate("window.dispatchEvent(new Event('pageshow'))");
  await settle();
  assert.equal(await canvasData(), original, 'Reentry resets shape');
  const p = await evaluate(
    `(()=>{let r=document.querySelector('#clay').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,id:1}})()`,
  );
  await touch('touchStart', [p]);
  await touch('touchStart', [p, { x: p.x + 60, y: p.y + 60, id: 2 }]);
  await touch('touchMove', [p, { x: p.x + 80, y: p.y - 70, id: 2 }]);
  await touch('touchEnd');
  await settle();
  const multiple = await canvasData();
  await click('#reset');
  await settle();
  await touch('touchStart', [p]);
  await touch('touchEnd');
  await settle();
  assert.equal(
    await canvasData(),
    multiple,
    'Second finger does not add a stroke',
  );
  await touch('touchStart', [p]);
  await touch('touchMove', [{ x: 36, y: 36, id: 1 }]);
  await touch('touchEnd');
  await settle();
  assert.ok(
    await evaluate("location.pathname.endsWith('/munyutto-nendo/')"),
    'Captured drag over home does not navigate',
  );
  await click('#back');
  await waitFor(
    'document.querySelector(\'.game-card[href="munyutto-nendo/"]\') !== null',
  );
  assert.ok(
    await evaluate(
      '!!document.querySelector(\'a[href="https://anipopina.com/"]\')',
    ),
  );
  await click('.game-card[href="munyutto-nendo/"]');
  await waitFor("document.querySelector('#clay')?.dataset.ready==='true'");
  await settle();
  assert.equal(
    await canvasData(),
    original,
    'Entrance round trip starts fresh',
  );
  await evaluate(
    "document.querySelector('#reset img').dispatchEvent(new Event('error'))",
  );
  await click('#clay');
  await settle();
  await click('#reset');
  await settle();
  assert.equal(
    await canvasData(),
    original,
    'Reset remains usable without image',
  );
  report(
    'Clay rotation retention, pagehide/reentry, multi-touch, protected home, entrance round trip, image failure, reduced motion and 1000 clicks: PASS',
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  await writeFile(join(output, 'clay-results.txt'), reports.join('\n'));
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
