import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'domino-browser-'));
const output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const server = createStaticServer(
  process.env.DOMINO_BUILD || join(root, 'dist'),
);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(
  process.env.CHROME_PATH || '/usr/bin/chromium',
  [
    '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    '--disable-webgl',
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
    source: `
    window.__dominoResources={frames:new Set(),contexts:[]};
    const raf=requestAnimationFrame, cancel=cancelAnimationFrame;
    window.requestAnimationFrame=(callback)=>{const id=raf((time)=>{window.__dominoResources.frames.delete(id);callback(time)});window.__dominoResources.frames.add(id);return id;};
    window.cancelAnimationFrame=(id)=>{window.__dominoResources.frames.delete(id);cancel(id);};
    const Base=AudioContext;window.AudioContext=class extends Base {constructor(){super();window.__dominoResources.contexts.push(this);}};
  `,
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
    const previous = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + '/koronto-domino/' });
    await waitFor(
      `performance.timeOrigin !== ${previous} && document.readyState === 'complete' && document.querySelector('#domino')?.dataset.ready==='true'`,
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
  const status = () =>
    evaluate("({...document.querySelector('#domino').dataset})");
  const tap = async (x, y) => {
    await call('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    await call('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  };
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
    [844, 390],
    [320, 568],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await visit();
    await delay(150);
    await shot(`domino-${width}-ready`);
    await tap(width / 2, height / 2);
    await delay(450);
    const middle = await status();
    assert.equal(middle.state, 'falling');
    assert.ok(
      Number(middle.fallen) > 0 && Number(middle.fallen) < Number(middle.count),
    );
    await shot(`domino-${width}-falling`);
    for (let i = 0; i < 15; i++) await tap(width * 0.5, height * 0.6);
    await waitFor("document.querySelector('#domino').dataset.state==='done'");
    const done = await status();
    assert.equal(done.fallen, done.count);
    assert.equal(
      await evaluate('window.__dominoResources.frames.size'),
      0,
      'idle has no scheduled frames',
    );
    await shot(`domino-${width}-done`);
    await tap(12, height - 12);
    assert.equal((await status()).state, 'falling', 'blank space restarts');
    await evaluate("window.dispatchEvent(new Event('blur'))");
    const paused = await status();
    assert.equal(paused.state, 'paused');
    await delay(400);
    assert.deepEqual(await status(), paused);
    await evaluate("document.querySelector('#reset').click()");
    assert.equal((await status()).state, 'ready');
    report(
      `${width}x${height}: sequential fall, repeated input, replay and blur stop PASS`,
    );
  }
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await visit();
  await evaluate("document.querySelector('#domino').focus()");
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight' });
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: ' ',
    code: 'Space',
  });
  await waitFor("document.querySelector('#domino').dataset.state==='done'");
  await shot('domino-reduced');
  await tap(120, 250);
  await delay(300);
  await evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide'))");
  assert.equal((await status()).state, 'paused');
  await evaluate(
    "window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))",
  );
  assert.equal((await status()).state, 'ready');
  await evaluate("document.querySelector('[data-home-button]').click()");
  await waitFor(
    "location.pathname==='/' && !!document.querySelector('a[href=\"koronto-domino/\"]')",
  );
  await evaluate(
    'document.querySelector(\'a[href="koronto-domino/"]\').click()',
  );
  await waitFor("document.querySelector('#domino')?.dataset.ready==='true'");
  assert.equal((await status()).state, 'ready');
  report(
    'Reduced motion, keyboard, pagehide/pageshow, entrance round trip: PASS',
  );
  await tap(120, 250);
  await delay(150);
  await evaluate(
    "Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))",
  );
  await delay(150);
  assert.equal((await status()).state, 'paused');
  assert.equal(await evaluate('window.__dominoResources.frames.size'), 0);
  assert.ok(
    await evaluate(
      "window.__dominoResources.contexts.every(c=>c.state!=='running')",
    ),
  );
  await evaluate(
    "delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))",
  );
  await delay(200);
  assert.equal((await status()).state, 'paused', 'visible does not resume');
  report('Hidden/visible events: audio and RAF cleanup PASS');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  await writeFile(join(output, 'domino-results.txt'), reports.join('\n'));
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
