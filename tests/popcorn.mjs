import assert from 'node:assert/strict';
import { Batch } from '../src/pokopoko-popcorn/model.ts';
const batch = new Batch();
assert.equal(batch.tap(-1), null);
assert.equal(batch.tap(6), null);
for (let j = 0; j < 10; j++) {
  for (let i = 0; i < 10000; i++) batch.tap(i % 6);
  assert.equal(batch.popped.filter(Boolean).length, 6);
  batch.reset();
  assert.equal(batch.popped.filter(Boolean).length, 0);
}
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'popcorn-browser-'));
const output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const server = createStaticServer(join(root, 'dist'));
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
    source: `window.rafCalls=0;const raf=requestAnimationFrame;window.requestAnimationFrame=(f)=>raf(t=>{window.rafCalls++;f(t)});
window.contexts=[];window.oscillators=0;window.peak=0;
const Native=window.AudioContext;window.AudioContext=class extends Native {
 constructor(...a){super(...a);window.contexts.push(this)}
 createOscillator(){window.oscillators++;return super.createOscillator()}
 createGain(){const n=super.createGain(),f=n.gain.linearRampToValueAtTime.bind(n.gain);n.gain.linearRampToValueAtTime=(v,t)=>{window.peak=Math.max(window.peak,v);return f(v,t)};return n}
};`,
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
  const visit = async (path = '/pokopoko-popcorn/') => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + path });
    await waitFor(
      `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete'`,
    );
    await waitFor(
      path === '/'
        ? "document.querySelectorAll('.game-card').length===19"
        : "document.querySelector('#scene')?.dataset.ready === 'true'",
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
  const touch = (type, points = []) =>
    call('Input.dispatchTouchEvent', { type, touchPoints: points });
  const center = (selector) =>
    evaluate(
      `(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return {x:r.x+r.width*.75,y:r.y+r.height*.6}})()`,
    );

  const count = () =>
    evaluate("document.querySelectorAll('.corn[data-popped=true]').length");
  const click = (selector) =>
    evaluate(`document.querySelector('${selector}').click()`);
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
    assert.equal(
      await evaluate(
        `(()=>{const bs=[...document.querySelectorAll('button:not([hidden]),#back')];return bs.every(b=>{const r=b.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1})})()`,
      ),
      true,
    );
    assert.equal(
      await evaluate(
        `(()=>{const n=document.querySelector('#scene');n.scrollTo(1000,1000);document.querySelector('#refill').scrollIntoView();return n.scrollTop===0&&n.scrollLeft===0&&document.documentElement.scrollWidth===innerWidth})()`,
      ),
      true,
    );
    await shot(`popcorn-${width}x${height}-kernels`);
    const p = await center('.corn');
    await touch('touchStart', [{ ...p, id: 1 }]);
    await touch('touchEnd');
    assert.equal(await count(), 1);
    await delay(220);
    await shot(`popcorn-${width}x${height}-pop`);
    await evaluate(
      "for(let i=0;i<10000;i++)document.querySelectorAll('.corn')[i%6].click()",
    );
    assert.equal(await count(), 6);
    assert.ok(
      await evaluate(
        'document.getAnimations().length<=12 && window.oscillators<=2 && window.peak<=.007',
      ),
    );
    await delay(800);
    assert.equal(await evaluate('document.getAnimations().length'), 0);
    await shot(`popcorn-${width}x${height}-popped`);
    await click('.corn');
    await delay(800);
    assert.equal(await count(), 6);
    await click('#refill');
    assert.equal(await count(), 0);
    await delay(300);
    report(
      `Popcorn ${width}x${height}: touch, persistent/repeated pop, 10000 taps, six-node cap, reset, 56px targets, no scroll, bounded audio/animations PASS`,
    );
  }
  await evaluate("document.querySelectorAll('.corn')[1].focus()");
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
  assert.equal(await count(), 1);
  const p1 = await center('.corn:nth-child(3)'),
    p2 = await center('.corn:nth-child(4)');
  await touch('touchStart', [
    { ...p1, id: 1 },
    { ...p2, id: 2 },
  ]);
  await touch('touchCancel');
  assert.equal(await count(), 3);
  await evaluate(
    "Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))",
  );
  await delay(300);
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  assert.equal(
    await evaluate("window.contexts.every(c=>c.state==='suspended')"),
    true,
  );
  assert.equal(await count(), 3);
  await evaluate(
    "delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))",
  );
  await click('.corn');
  assert.equal(await count(), 4);
  await evaluate(
    "window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'))",
  );
  assert.equal(await count(), 4);
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await delay(150);
  assert.equal(await count(), 4);
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await delay(150);
  await click('.corn');
  assert.ok(await evaluate('document.getAnimations().length<=1'));
  await delay(250);
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  await click('#back');
  await waitFor("document.querySelectorAll('.game-card').length===19");
  await evaluate(
    'document.querySelector(\'a[href="pokopoko-popcorn/"]\').click()',
  );
  await waitFor("document.querySelector('#scene')?.dataset.ready==='true'");
  assert.equal(await count(), 0);
  const fail = await call('Page.addScriptToEvaluateOnNewDocument', {
    source:
      "window.AudioContext=class {constructor(){throw Error('audio unavailable')}};const d=HTMLImageElement.prototype.decode;let n=0;HTMLImageElement.prototype.decode=function(){return n++===0?Promise.reject(Error('decode failed')):d.call(this)}",
  });
  await call('Page.navigate', { url: origin + '/pokopoko-popcorn/' });
  await waitFor("document.querySelector('#retry')?.hidden===false");
  assert.equal(
    await evaluate("document.querySelector('.corn').disabled"),
    true,
  );
  await click('#retry');
  await waitFor("document.querySelector('#scene')?.dataset.ready==='true'");
  await click('.corn');
  assert.equal(await count(), 1);
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: fail.identifier,
  });
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Popcorn PASS: keyboard, multitouch/cancel, blur/hidden/pagehide/resize retention, reduced motion, home/reentry, decode retry, unavailable sound, no JS errors. Physical audio/device unverified.',
  );
  await writeFile(
    join(output, 'popcorn-results.txt'),
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
