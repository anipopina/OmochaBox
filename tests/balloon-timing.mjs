import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';
const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'balloon-browser-'));
const server = createStaticServer(
  process.env.BALLOON_BUILD || join(root, 'dist'),
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
const errors = [];
const report = (message) => {
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
    source: `
    window.deferFrames=false;window.deferredFrames=[];
    const probeNative=requestAnimationFrame.bind(window);
    window.requestAnimationFrame=(callback)=>probeNative(time=>{if(window.deferFrames)window.deferredFrames.push(callback);else callback(time)});
    window.flushFrames=()=>{window.deferFrames=false;for(const callback of window.deferredFrames.splice(0))probeNative(callback)};
  `,
  });
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: await readFile(
      join(root, 'tests/fixtures/balloon-observer.js'),
      'utf8',
    ),
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
  const visit = async () => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + '/pukapuka-fusen/' });
    await waitFor(
      `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete'`,
    );
    await waitFor("!!document.querySelector('#pump')");
    // Offscreen lazy hub images may never start loading until scrolled into view.
    // Force their request in this test, retaining full decode validation.
    await evaluate(
      `Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode()}))`,
    );
  };
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

  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await call('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 10,
  });
  await visit();
  const p = await point();
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...p, id: 1 }],
  });
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await delay(1500);
  const before = await evaluate(
    `(()=>{const e=document.querySelector('.balloon'),r=e.getBoundingClientRect(),m=new DOMMatrix(getComputedStyle(e).transform);return {x:r.x+r.width*.25,y:r.y+r.height*.25,tx:m.m41,ty:m.m42}})()`,
  );
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: before.x, y: before.y, id: 2 }],
  });
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitFor('window.balloonTouch.frames.length===2');
  const frames = await evaluate('window.balloonTouch.frames');
  assert.ok(
    frames[1].x > frames[0].x && frames[1].y > frames[0].y,
    'Actual post-input frames move down and right',
  );
  await delay(1200);
  const late = await evaluate(
    `(()=>{const e=document.querySelector('.balloon'),m=new DOMMatrix(getComputedStyle(e).transform);return {tx:m.m41,ty:m.m42,tapped:e.dataset.tapped}})()`,
  );
  assert.ok(
    late.ty < before.ty,
    'Delayed host read reproduces old opposite-direction comparison',
  );
  report(
    JSON.stringify({
      case: 'direction',
      frames,
      lateDeltaY: late.ty - before.ty,
      lateTapped: late.tapped,
      oldAssertionWouldPass: false,
      newAssertionPasses: true,
    }),
  );
  await visit();
  await waitFor('window.pendingRafs.size===0');
  await evaluate('window.deferFrames=true');
  await mouse('mousePressed', await point());
  await delay(2700);
  const old = await evaluate(
    `({frames:window.rafCalls,full:document.querySelector('#held').dataset.full,pending:window.pendingRafs.size})`,
  );
  assert.equal(old.full, 'false');
  await evaluate('window.flushFrames()');
  await waitFor(
    "document.querySelector('#held').dataset.full==='true' && window.pendingRafs.size===0",
  );
  assert.equal(
    await evaluate('window.balloonFullFrame.pending'),
    0,
    'First full frame has no pending successor',
  );
  const stopped = await evaluate('window.rafCalls');
  await delay(200);
  const final = await evaluate('window.rafCalls');
  assert.ok(
    final > old.frames,
    'Late delivered frame reproduces old counter mismatch',
  );
  assert.equal(
    final,
    stopped,
    'Actual stop condition gives an unchanged exact counter',
  );
  report(
    JSON.stringify({
      case: 'held',
      oldSnapshot: old,
      stopped,
      final,
      oldAssertionWouldPass: false,
      newAssertionPasses: true,
    }),
  );
  await mouse('mouseReleased', await point());
  assert.equal(errors.length, 0, JSON.stringify(errors));
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
