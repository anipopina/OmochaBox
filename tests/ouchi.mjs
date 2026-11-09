import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

// Browser checks for おうちバラバラ. Headless Chromium renders WebGL through
// SwiftShader, so this verifies behaviour and framing, not device frame rate.
const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'ouchi-browser-'));
const output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const server = createStaticServer(
  process.env.OUCHI_BUILD || join(root, 'dist'),
);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(
  process.env.CHROME_PATH || '/usr/bin/chromium',
  [
    '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const reports = [];
const errors = [];
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
      }, 30000);
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
  const waitFor = async (expression, timeout = 20000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
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
  const field = (key) =>
    evaluate(`document.querySelector('#field').dataset.${key}`);
  const visit = async () => {
    const previous = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + '/ouchi-barabara/' });
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
  const tap = async (x, y) => {
    await call('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    });
    await call('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  };
  const idle = () =>
    waitFor(
      "(d=>d.running==='false' && (d.state==='ready'||d.state==='rubble'))(document.querySelector('#field').dataset)",
      60000,
    );

  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1280, 800],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await visit();
    assert.ok(await evaluate("document.querySelector('#fallback').hidden"));
    assert.equal(await field('state'), 'ready');
    // The back button stays reachable above the full-screen field.
    assert.ok(
      await evaluate(`(()=>{const a=document.querySelector('#back');const r=a.getBoundingClientRect();
        const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>=56&&(hit===a||a.contains(hit))})()`),
    );
    await shot(`ouchi-${width}x${height}-start`);
    await tap(width * 0.6, height * 0.5);
    assert.ok(
      ['attacking', 'moving'].includes(await field('state')),
      'Tap starts an attack at once',
    );
    await waitFor("document.querySelector('#field').dataset.hits==='1'");
    await delay(250);
    await shot(`ouchi-${width}x${height}-hit`);
    const error = Number(await field('impactError'));
    assert.ok(error < 0.02, `Bucket teeth land on the target (${error})`);
    // Rapid taps queue at most two more attacks and never overlap them.
    for (let i = 0; i < 10; i++) await tap(width * 0.6, height * 0.5);
    assert.ok(Number(await field('queued')) <= 2, 'Queue capped');
    await idle();
    const afterBurst = Number(await field('hits'));
    assert.ok(afterBurst >= 2 && afterBurst <= 4, `hits ${afterBurst}`);
    while ((await field('attack')) !== '4') {
      await tap(width * 0.6, height * 0.5);
      if ((await field('attack')) !== '4') await idle();
    }
    await waitFor("document.querySelector('#field').dataset.hits==='4'");
    await delay(450);
    await shot(`ouchi-${width}x${height}-collapse`);
    await idle();
    assert.equal(await field('hits'), '4', 'House collapses in four hits');
    assert.equal(await field('standing'), '0', 'No piece is left standing');
    await delay(300);
    await shot(`ouchi-${width}x${height}-rubble`);
    await tap(width * 0.6, height * 0.5);
    await delay(300);
    assert.equal(await field('hits'), '4', 'Rubble taps do nothing yet');
    report(
      `${width}x${height}: tap, queue cap, 4-hit collapse, idle loop stop PASS`,
    );
  }

  // Keyboard: Enter attacks, held repeat does not.
  await visit();
  await evaluate("document.querySelector('#field').focus()");
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
  });
  await waitFor("document.querySelector('#field').dataset.hits==='1'");
  await idle();

  // Hidden page: stops the loop and drops queued taps; nothing restarts by itself.
  await tap(400, 400);
  await tap(400, 400);
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'))`);
  assert.equal(await field('running'), 'false');
  assert.equal(await field('queued'), '0');
  const hitsWhileHidden = await field('hits');
  await tap(400, 400);
  await delay(300);
  assert.equal(await field('hits'), hitsWhileHidden, 'No input while hidden');
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
    document.dispatchEvent(new Event('visibilitychange'))`);
  await idle();
  assert.ok(Number(await field('hits')) <= 3, 'Dropped taps are not replayed');

  // Back-forward cache return starts with a fresh house.
  await evaluate(`window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))`);
  assert.equal(await field('hits'), '0');
  assert.equal(await field('state'), 'ready');
  report('Keyboard, hidden-page stop, bfcache reset PASS');

  // Reduced motion still breaks the house visibly.
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await visit();
  await tap(400, 400);
  await waitFor("document.querySelector('#field').dataset.hits==='1'");
  await delay(400);
  await shot('ouchi-reduced-hit');
  await idle();
  report('Reduced motion attack PASS');

  assert.equal(errors.length, 0, JSON.stringify(errors));
  await writeFile(join(output, 'ouchi-results.txt'), reports.join('\n'));
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
