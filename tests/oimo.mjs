import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'oimo-browser-'));
const output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const server = createStaticServer(process.env.OIMO_BUILD || join(root, 'dist'));
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
  const state = () =>
    evaluate("document.querySelector('#patch').dataset.phase");
  const shot = async (name) =>
    writeFile(
      join(output, name + '.png'),
      Buffer.from(
        (await call('Page.captureScreenshot', { format: 'png' })).data,
        'base64',
      ),
    );
  const visit = async () => {
    await call('Page.navigate', { url: origin + '/oimo-horihori/' });
    await waitFor(
      "document.querySelector('#patch')?.dataset.phase==='digging' && document.querySelector('#patch')?.dataset.artworkReady==='true'",
    );
  };
  const touch = (type, points = []) =>
    call('Input.dispatchTouchEvent', { type, touchPoints: points });
  const point = async (x, y) =>
    evaluate(
      `(()=>{const r=document.querySelector('#patch').getBoundingClientRect();return {x:r.x+r.width*${x},y:r.y+r.height*${y},id:1}})()`,
    );
  const tap = async (x, y) => {
    await touch('touchStart', [await point(x, y)]);
    await touch('touchEnd');
  };
  const dig = async () => {
    for (const y of [0.17, 0.4, 0.63, 0.83]) {
      if ((await state()) === 'ready') break;
      await touch('touchStart', [await point(0.12, y)]);
      for (const x of [0.28, 0.44, 0.6, 0.76, 0.88])
        await touch('touchMove', [await point(x, y)]);
      await touch('touchEnd');
    }
  };
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [820, 1180],
    [844, 390],
    [568, 320],
    [1280, 900],
    [1180, 757],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await call('Emulation.setTouchEmulationEnabled', { enabled: true });
    await visit();
    await shot('oimo-covered-' + width);
    await tap(0.5, 0.5);
    assert.equal(
      await state(),
      'digging',
      'one touch cannot expose the whole potato',
    );
    for (let i = 1; i < 8 && (await state()) === 'digging'; i++) {
      const before = await evaluate(
        "Number(document.querySelector('#patch').dataset.cleared)",
      );
      await tap(0.5, 0.5);
      assert.ok(
        (await evaluate(
          "Number(document.querySelector('#patch').dataset.cleared)",
        )) > before,
        'repeated central taps keep removing soil',
      );
    }
    assert.equal(
      await evaluate("document.querySelector('#basket').children.length"),
      0,
    );
    await shot('oimo-partial-' + width);
    await dig();
    assert.equal(await state(), 'ready', 'broad strokes expose potato');
    assert.equal(
      await evaluate("document.querySelector('#basket').children.length"),
      0,
      'no automatic harvest',
    );
    assert.ok(
      (await evaluate(
        "Number(document.querySelector('#patch').dataset.cleared)",
      )) < 252,
      'harvest readiness does not require cleaning 90% of the whole field',
    );
    await shot('oimo-ready-' + width);
    await tap(0.5, 0.5);
    assert.equal(await state(), 'harvesting');
    for (let i = 0; i < 8; i++) await tap(0.5, 0.5);
    await waitFor("document.querySelector('#patch').dataset.round==='1'");
    assert.equal(
      await evaluate("document.querySelector('#basket').children.length"),
      1,
    );
    await dig();
    assert.equal(await state(), 'ready');
    await shot('oimo-long-ready-' + width);
    // Verify rotated image corners in the real DOM, including the ready pulse.
    assert.ok(
      await evaluate(
        `(()=>{const r=document.querySelector('#patch').getBoundingClientRect();const root=document.querySelector('#roots');const scale=1.035;return [...root.querySelectorAll('img')].every(img=>{const w=parseFloat(img.style.width),h=parseFloat(img.style.height),left=parseFloat(img.style.left),top=parseFloat(img.style.top),angle=parseFloat(img.style.transform.slice(7))*Math.PI/180;return [-w/2,w/2].every(dx=>[-h/2,h/2].every(dy=>{const x=left+w/2+dx*Math.cos(angle)-dy*Math.sin(angle),y=top+h/2+dx*Math.sin(angle)+dy*Math.cos(angle);return ((x-r.width/2)*scale/(r.width/2))**2+((y-r.height/2)*scale/(r.height/2))**2<1}))})})()`,
      ),
      'long image and tips fit the field at maximum pulse',
    );
    await tap(0.5, 0.5);
    await waitFor("document.querySelector('#patch').dataset.round==='2'");
    await shot('oimo-cluster-covered-' + width);
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('#roots')).overflow",
      ),
      'hidden',
    );
    await dig();
    await shot('oimo-cluster-' + width);
    await tap(0.5, 0.5);
    await waitFor("document.querySelector('#patch').dataset.round==='3'");
    assert.equal(
      await evaluate("document.querySelector('#basket').children.length"),
      3,
    );
    assert.equal(
      await evaluate('document.documentElement.scrollWidth<=innerWidth'),
      true,
    );
    assert.ok(
      await evaluate(
        "(()=>{const r=document.querySelector('#back').getBoundingClientRect();return r.width>=56&&r.height>=56})()",
      ),
    );
    report(
      'Oimo ' +
        width +
        'x' +
        height +
        ': exposure, explicit harvest, repeated play, cluster, layout PASS',
    );
  }
  await visit();
  let taps = 0;
  while ((await state()) === 'digging' && taps < 60) {
    await tap(0.5, 0.5);
    taps++;
  }
  assert.equal(
    await state(),
    'ready',
    'stationary tapping eventually exposes actual potato',
  );
  assert.ok(taps > 1 && taps < 60, 'assistance is gradual and bounded');
  assert.equal(
    await evaluate("document.querySelector('#basket').children.length"),
    0,
    'last digging tap does not harvest',
  );
  await shot('oimo-taps-ready-1180');
  await tap(0.5, 0.5);
  assert.equal(await state(), 'harvesting', 'next distinct tap harvests');
  report(
    `Oimo stationary tap regression: ${taps} taps expose; separate tap harvests PASS`,
  );
  await visit();
  await touch('touchStart', [await point(0.2, 0.2)]);
  await touch('touchCancel');
  const cleared = await evaluate(
    "document.querySelector('#patch').dataset.cleared",
  );
  await evaluate(
    "document.querySelector('#patch').dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:600,clientY:600,bubbles:true}))",
  );
  assert.equal(
    await evaluate("document.querySelector('#patch').dataset.cleared"),
    cleared,
  );
  await dig();
  assert.equal(await state(), 'ready');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(await state(), 'ready', 'rotation retains exposure');
  await shot('oimo-rotated-ready-390');
  await tap(0.5, 0.5);
  await evaluate(
    "Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden",
  );
  assert.equal(await state(), 'digging');
  await evaluate("document.querySelector('#back').click()");
  await waitFor("document.querySelectorAll('.game-card').length===19");
  await evaluate(`document.querySelector('a[href="oimo-horihori/"]').click()`);
  await waitFor("document.querySelector('#patch')?.dataset.round==='0'");
  assert.equal(
    await evaluate("document.querySelector('#basket').children.length"),
    0,
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Oimo cancel, rotation, visibility cleanup, entrance/reentry, zero JS exceptions PASS. Silent toy; physical devices and independent review pending.',
  );
  await writeFile(join(output, 'oimo-results.txt'), reports.join('\n') + '\n');
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
