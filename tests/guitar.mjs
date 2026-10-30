import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'glass-browser-'));
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
  const visit = async (path = '/poron-guitar/') => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + path });
    await waitFor(
      `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete'`,
    );
    await waitFor(
      path === '/'
        ? "document.querySelectorAll('.game-card').length===11"
        : "document.querySelector('#instrument')?.dataset.ready === 'true'",
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
  const centers = () =>
    evaluate(
      `[...document.querySelectorAll('.string-button')].map(b=>{const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})`,
    );
  const playing = () =>
    evaluate(`document.querySelectorAll('[data-playing="true"]').length`);
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
      deviceScaleFactor: 2,
      mobile: true,
    });
    await visit();
    await waitFor(
      `document.querySelector('#guitar-art').complete && document.querySelector('#guitar-art').naturalWidth>0`,
    );
    assert.equal(
      await evaluate('window.contexts.length'),
      0,
      'No audio before gesture',
    );
    assert.ok(
      await evaluate(
        `[...document.querySelectorAll('button,#back')].every(b=>{const r=b.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
      ),
      'Large in-bounds targets',
    );
    assert.ok(
      await evaluate(
        'document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight',
      ),
    );
    await shot(`guitar-${width}x${height}`);
    const c = await centers();
    await touch('touchStart', [{ ...c[0], id: 1 }]);
    await delay(40);
    assert.equal(await playing(), 1, 'Tap vibrates string');
    await touch('touchMove', [{ ...c[3], id: 1 }]);
    await delay(40);
    assert.equal(await playing(), 4, 'Fast sweep hits every crossed string');
    assert.equal(
      await evaluate('window.oscillators'),
      4,
      'Four fixed audio voices',
    );
    await shot(`guitar-strum-${width}`);
    await touch('touchEnd');
    await delay(1250);
    assert.equal(await playing(), 0, 'Animations finish');
    assert.equal(
      await evaluate('window.contexts[0].state'),
      'suspended',
      'Idle audio processing stops',
    );
  }
  report(
    'Guitar PASS: six viewports, 56px targets, art decode, real CDP touch tap/fast sweep, four voices, idle audio/animation stop, screenshots',
  );
  const c = await centers();
  await touch('touchStart', [
    { ...c[3], id: 1 },
    { ...c[0], id: 2 },
  ]);
  await touch('touchMove', [
    { ...c[0], id: 1 },
    { ...c[3], id: 2 },
  ]);
  await delay(30);
  assert.equal(await evaluate('window.oscillators'), 4);
  await touch('touchCancel');
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  await delay(50);
  assert.equal(await playing(), 0);
  assert.equal(await evaluate('window.contexts[0].state'), 'suspended');
  await evaluate(
    `for(let i=0;i<10000;i++)document.querySelectorAll('.string-button')[i%4].click()`,
  );
  assert.equal(
    await evaluate('window.oscillators'),
    4,
    '10000 inputs cannot create extra audio nodes',
  );
  assert.ok(await evaluate('window.peak<=.18'), 'Voice envelope bounded');
  assert.ok(
    await evaluate('document.getAnimations().length<=8'),
    'Four finite pairs of visual effects',
  );
  await evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))`,
  );
  await delay(50);
  assert.equal(await playing(), 0);
  assert.equal(await evaluate('window.contexts[0].state'), 'suspended');
  await evaluate(
    `delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))`,
  );
  await evaluate(`document.querySelector('.string-button').focus()`);
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
  });
  assert.equal(await playing(), 1, 'Keyboard plays');
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
  });
  await evaluate(
    `window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'))`,
  );
  await delay(50);
  assert.equal(await playing(), 0);
  const current = await centers();
  await touch('touchStart', [{ ...current[0], id: 1 }]);
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await delay(100);
  assert.equal(await playing(), 0, 'Resize cancels held input and effects');
  await touch('touchMove', [{ x: 200, y: 500, id: 1 }]);
  assert.equal(await playing(), 0, 'Old pointer cannot strum after resize');
  await touch('touchEnd');
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await evaluate(`document.querySelector('.string-button').click()`);
  await delay(250);
  assert.equal(await playing(), 0, 'Reduced feedback is short');
  await evaluate(`document.querySelector('#back').click()`);
  await waitFor(`document.querySelectorAll('.game-card').length===11`);
  await evaluate(`document.querySelector('a[href="poron-guitar/"]').click()`);
  await waitFor(
    `document.querySelector('#instrument')?.dataset.ready==='true'`,
  );
  assert.equal(
    await evaluate('window.contexts.length'),
    0,
    'Reentry has no stale audio',
  );
  await evaluate(
    `window.AudioContext=class {constructor(){throw new Error('blocked audio')}};document.querySelector('.string-button').click()`,
  );
  assert.equal(await playing(), 1, 'Visual play survives audio failure');
  await delay(300);
  for (const cancel of [false, true]) {
    await visit();
    await evaluate(`const Base=AudioContext;window.AudioContext=class extends Base {
      get state(){return this.ready?super.state:'suspended'}
      resume(){return new Promise(resolve=>setTimeout(()=>{this.ready=true;super.resume().then(resolve)},350))}
    };document.querySelector('.string-button').click()`);
    if (cancel) await evaluate(`window.dispatchEvent(new Event('blur'))`);
    await delay(500);
    assert.equal(
      await evaluate('window.peak'),
      0,
      'Slow unlock cannot replay stale input',
    );
    assert.equal(
      await evaluate('window.contexts[0].state'),
      'suspended',
      'Slow/canceled unlock returns to idle',
    );
  }
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Guitar PASS: multiple fingers, cancel, 10000-input audio/animation caps, blur/hidden/pagehide, keyboard, reduced motion, hub/reentry, audio failure fallback, zero JS exceptions; physical listening unverified',
  );
  await writeFile(
    join(output, 'guitar-results.txt'),
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
