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
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__rectangularCuts=0;const fillRect=CanvasRenderingContext2D.prototype.fillRect;CanvasRenderingContext2D.prototype.fillRect=function(...args){if(this.globalCompositeOperation==='destination-out')window.__rectangularCuts++;return fillRect.apply(this,args);};`,
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
  const harvestTap = async () => {
    const p = await evaluate(
      "(()=>{const r=document.querySelector('#roots img').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,id:1}})()",
    );
    await touch('touchStart', [p]);
    await touch('touchEnd');
  };
  const dig = async () => {
    // Real pointer sweeps across the image's visible bounding region.
    const r = await evaluate(
      "(()=>{const r=document.querySelector('#roots img').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()",
    );
    for (let y = r.y + 8; y < r.y + r.h; y += 28) {
      if ((await state()) === 'ready') break;
      await touch('touchStart', [{ x: r.x + 8, y, id: 1 }]);
      for (let x = r.x + 24; x < r.x + r.w; x += 28)
        await touch('touchMove', [{ x, y, id: 1 }]);
      await touch('touchEnd');
    }
  };
  const geometry = () =>
    evaluate(
      `(()=>{const p=document.querySelector('#roots img').getBoundingClientRect();const blocks=['#basket','#back'].map(s=>document.querySelector(s).getBoundingClientRect());return p.x>=0&&p.y>=0&&p.right<=innerWidth&&p.bottom<=innerHeight&&blocks.every(b=>!(p.right>b.left&&p.left<b.right&&p.bottom>b.top&&p.top<b.bottom))})()`,
    );
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [820, 1180],
    [844, 390],
    [568, 320],
    [1280, 900],
    [1180, 757],
    [280, 1000],
    [1000, 280],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await call('Emulation.setTouchEmulationEnabled', { enabled: true });
    await visit();
    assert.ok(await geometry(), 'potato fits without UI overlap');
    assert.equal(
      await evaluate("document.querySelector('#patch').clientWidth"),
      width,
    );
    await shot('oimo-covered-' + width);
    await tap(0.5, 0.5);
    const n = await evaluate(
      "document.querySelector('#patch').dataset.cleared",
    );
    for (let i = 0; i < 8; i++) await tap(0.5, 0.5);
    assert.equal(
      await evaluate("document.querySelector('#patch').dataset.cleared"),
      n,
      'same location no longer expands',
    );
    assert.equal(await state(), 'digging');
    await shot('oimo-partial-' + width);
    await dig();
    assert.equal(await state(), 'ready');
    assert.equal(
      await evaluate("document.querySelector('#basket').children.length"),
      0,
      'no automatic harvest',
    );
    assert.ok(await geometry());
    assert.equal(
      await evaluate('window.__rectangularCuts'),
      0,
      'ready reveal never erases cell rectangles',
    );
    const rasterDifference = await evaluate(
      `(()=>{const canvas=document.querySelector('#soil'),ctx=canvas.getContext('2d'),data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let transparent=0;for(let y=0;y<160;y++)for(let x=0;x<160;x++){const px=Math.floor((x+.5)*canvas.width/160),py=Math.floor((y+.5)*canvas.height/160);if(data[(py*canvas.width+px)*4+3]<128)transparent++;}return Math.abs(transparent-Number(document.querySelector('#patch').dataset.cleared))/(160*160)})()`,
    );
    assert.ok(
      rasterDifference < 0.02,
      'rendered mask and cell coverage agree within raster sampling tolerance',
    );
    await shot('oimo-ready-' + width);
    await harvestTap();
    assert.equal(await state(), 'harvesting');
    assert.equal(
      await evaluate("document.querySelector('#cheer').textContent"),
      '',
      'no harvest text',
    );
    await waitFor("document.querySelector('#patch').dataset.round==='1'");
    assert.equal(
      await evaluate("document.querySelector('#basket').children.length"),
      1,
    );
    assert.equal(
      await evaluate("document.querySelectorAll('#roots img').length"),
      1,
    );
    assert.ok(await geometry());
    await dig();
    assert.equal(await state(), 'ready');
    await shot('oimo-long-ready-' + width);
    await harvestTap();
    await waitFor("document.querySelector('#patch').dataset.round==='2'");
    assert.equal(
      await evaluate("document.querySelectorAll('#roots img').length"),
      1,
    );
    assert.ok(
      await evaluate(
        "document.querySelector('#back').getBoundingClientRect().width>=56",
      ),
    );
    report(
      'Oimo ' +
        width +
        'x' +
        height +
        ': full field, no repeat assistance, separate harvest, single variants, UI exclusion PASS',
    );
  }
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1180,
    height: 757,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await visit();
  const diagonal = await evaluate(
    `(()=>{const img=document.querySelector('#roots img');return {x:parseFloat(img.style.left),y:parseFloat(img.style.top),w:parseFloat(img.style.width),h:parseFloat(img.style.height),a:parseFloat(img.style.transform.slice(7))*Math.PI/180}})()`,
  );
  for (const offset of [0, 0.1, -0.1, 0.2, -0.2]) {
    if ((await state()) === 'ready') break;
    const points = Array.from({ length: 25 }, (_, i) => {
      const dx = diagonal.w * (-0.42 + (0.84 * i) / 24),
        dy = diagonal.h * (0.3 - (0.6 * i) / 24 + offset);
      return {
        x:
          diagonal.x +
          diagonal.w / 2 +
          dx * Math.cos(diagonal.a) -
          dy * Math.sin(diagonal.a),
        y:
          diagonal.y +
          diagonal.h / 2 +
          dx * Math.sin(diagonal.a) +
          dy * Math.cos(diagonal.a),
        id: 1,
      };
    });
    await touch('touchStart', [points[0]]);
    for (const p of points.slice(1)) await touch('touchMove', [p]);
    await touch('touchEnd');
  }
  assert.equal(await state(), 'ready', 'diagonal strokes reveal potato');
  assert.equal(await evaluate('window.__rectangularCuts'), 0);
  await shot('oimo-diagonal-ready-1180');
  await visit();
  for (let i = 0; i < 12; i++) {
    await dig();
    assert.equal(await state(), 'ready');
    await harvestTap();
    await waitFor(
      "document.querySelector('#patch').dataset.round==='" + (i + 1) + "'",
    );
    assert.equal(
      await evaluate("document.querySelector('#basket').children.length"),
      i + 1,
    );
    if ([0, 4, 9, 11].includes(i)) await shot('oimo-basket-' + (i + 1));
  }
  await dig();
  await harvestTap();
  await waitFor("document.querySelector('#patch').dataset.round==='13'");
  assert.equal(
    await evaluate("document.querySelector('#basket').children.length"),
    12,
    'bounded abundant basket',
  );
  await evaluate("document.querySelector('#basket').click()");
  await visit();
  await touch('touchStart', [await point(0.2, 0.2)]);
  const n = await evaluate("document.querySelector('#patch').dataset.cleared");
  await delay(700);
  assert.equal(
    await evaluate("document.querySelector('#patch').dataset.cleared"),
    n,
    'holding does not dig repeatedly',
  );
  await touch('touchCancel');
  await evaluate(
    "document.querySelector('#patch').dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:600,clientY:600,bubbles:true}))",
  );
  assert.equal(
    await evaluate("document.querySelector('#patch').dataset.cleared"),
    n,
  );
  await dig();
  assert.equal(await state(), 'ready');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(100);
  assert.equal(await state(), 'ready');
  assert.ok(await geometry());
  await shot('oimo-rotated-ready-390');
  await harvestTap();
  await evaluate(
    "Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden",
  );
  assert.equal(await state(), 'digging');
  await evaluate("document.querySelector('#back').click()");
  await waitFor("document.querySelectorAll('.game-card').length===20");
  await evaluate(`document.querySelector('a[href="oimo-horihori/"]').click()`);
  await waitFor("document.querySelector('#patch')?.dataset.round==='0'");
  assert.equal(
    await evaluate("document.querySelector('#basket').children.length"),
    0,
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Oimo 13 harvests, basket 1/5/10/12 variation, long hold, cancel, rotation, hidden cleanup, entrance/reentry, no JS errors PASS',
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
