import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'bubbles-browser-'));
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
    source: `window.lastPointerId=0;document.addEventListener('pointerdown',e=>window.lastPointerId=e.pointerId);window.rafCalls=0;const raf=requestAnimationFrame;window.requestAnimationFrame=(f)=>raf(t=>{window.rafCalls++;f(t)});`,
  });

  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.soundStats={active:0,max:0,gains:[],starts:[],contexts:[]};const AC=AudioContext;window.AudioContext=class extends AC {constructor(...a){super(...a);soundStats.contexts.push(this)}createOscillator(){const o=super.createOscillator(),start=o.start.bind(o);o.start=(t)=>{soundStats.starts.push(performance.now());soundStats.active++;soundStats.max=Math.max(soundStats.max,soundStats.active);start(t)};o.addEventListener('ended',()=>soundStats.active--);return o}createGain(){const g=super.createGain(),ramp=g.gain.linearRampToValueAtTime.bind(g.gain);g.gain.linearRampToValueAtTime=(v,t)=>{soundStats.gains.push(v);return ramp(v,t)};return g}};`,
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
  const visit = async (path = '/pukupuku-shabon/') => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + path });
    await waitFor(
      `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete'`,
    );
    await waitFor(
      path === '/'
        ? "document.querySelectorAll('.game-card').length===11"
        : "document.querySelector('#field')?.dataset.ready === 'true'",
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
  const touch = (type, touchPoints = []) =>
    call('Input.dispatchTouchEvent', { type, touchPoints });
  const tap = async (x, y) => {
    await touch('touchStart', [{ x, y, id: 1 }]);
    await touch('touchEnd');
    await delay(60);
  };
  const count = () => evaluate("document.querySelectorAll('.bubble').length");
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [568, 320],
    [844, 390],
    [820, 1180],
    [1280, 800],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await visit();
    assert.equal(await count(), 1);
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.film'),'::after').content",
      ),
      'none',
      'Inner highlight line removed',
    );
    assert.ok(
      await evaluate(
        'document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight',
      ),
    );
    assert.ok(
      await evaluate(
        "(()=>{const r=document.querySelector('#back').getBoundingClientRect();return r.width>=56&&r.height>=56})()",
      ),
    );
    await tap(width * 0.3, height * 0.8);
    assert.equal(await count(), 2, 'Empty-space touch creates a bubble');
    const center = await evaluate(
      "(()=>{const r=document.querySelector('.bubble:last-child').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
    );
    await tap(center.x, center.y);
    assert.equal(
      await evaluate("document.querySelectorAll('.popping').length"),
      1,
    );
    assert.equal(
      await evaluate("document.querySelectorAll('.pop-glint').length"),
      6,
    );
    await delay(100);
    assert.ok(
      await evaluate(
        "[...document.querySelectorAll('.pop-glint')].some(e=>Number(getComputedStyle(e).opacity)>.1)",
      ),
      'Glints visible briefly after the squeeze',
    );
    await shot(`bubbles-pop-${width}`);
    await delay(450);
    assert.equal(await count(), 1);
    assert.equal(
      await evaluate("document.querySelectorAll('.pop-glint').length"),
      0,
      'No leftover glints',
    );
    assert.ok(
      await evaluate(
        "getComputedStyle(document.querySelector('.clouds')).pointerEvents==='none'",
      ),
      'Clouds cannot intercept taps',
    );
    await tap(width * 0.75, height * 0.8);
    await shot(`bubbles-${width}`);
  }
  assert.ok(
    await evaluate('soundStats.starts.length > 0'),
    'Trusted touch starts audio',
  );
  assert.ok(
    await evaluate('soundStats.max===1 && soundStats.gains.every(g=>g<=.035)'),
    'One voice and quiet gain',
  );
  report(
    'Bubbles PASS: six viewports, touch create/pop, 96px+ targets, no overflow, screenshots',
  );
  await visit();
  await evaluate(
    "for(let i=0;i<1000;i++)document.querySelector('#create').dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:100+i%800,clientY:180+i%450}))",
  );
  assert.equal(await count(), 18, '1000 inputs bounded to 18 bubbles');
  await delay(200);
  assert.ok(
    await evaluate('soundStats.max<=1 && soundStats.starts.length<=1'),
    'Burst cannot stack sound',
  );
  await evaluate(
    "for(const b of document.querySelectorAll('.bubble'))b.click()",
  );
  assert.equal(
    await evaluate("document.querySelectorAll('.pop-glint').length"),
    108,
    '18 simultaneous pops bounded to 108 glints',
  );
  await evaluate(
    "for(const b of document.querySelectorAll('.bubble'))b.click()",
  );
  assert.equal(
    await evaluate("document.querySelectorAll('.pop-glint').length"),
    108,
    'Repeated taps cannot duplicate glints',
  );
  await evaluate("window.dispatchEvent(new Event('blur'))");
  assert.equal(
    await evaluate("document.querySelectorAll('.pop-glint').length"),
    108,
    'Blur preserves glints',
  );
  assert.equal(await count(), 18, 'Blur preserves popping bubbles');
  assert.ok(
    await evaluate(
      "getComputedStyle(document.querySelector('.film')).animationPlayState==='paused'",
    ),
  );
  await delay(50);
  assert.ok(
    await evaluate(
      "soundStats.active===0 && soundStats.contexts.every(c=>c.state!=='running')",
    ),
    'Blur stops audio',
  );
  const idle = await evaluate('window.rafCalls');
  await delay(100);
  assert.equal(await evaluate('window.rafCalls'), idle);
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await delay(450);
  assert.equal(await count(), 0, 'Pops finish after resume');
  await touch('touchStart', [
    { x: 200, y: 200, id: 1 },
    { x: 500, y: 300, id: 2 },
  ]);
  await touch('touchEnd');
  assert.equal(await count(), 2, 'Two fingers create independently');
  const positions = () =>
    evaluate(
      "[...document.querySelectorAll('.bubble')].map(b=>b.style.transform)",
    );
  await evaluate("window.dispatchEvent(new Event('blur'))");
  const frozen = await positions();
  const starts = await evaluate('soundStats.starts.length');
  await delay(550);
  assert.deepEqual(await positions(), frozen, 'Blur preserves exact positions');
  assert.equal(await count(), 2);
  await evaluate(
    "Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'))",
  );
  const hiddenRaf = await evaluate('window.rafCalls');
  await delay(100);
  assert.equal(
    await evaluate('window.rafCalls'),
    hiddenRaf,
    'Focus cannot restart a hidden page',
  );
  assert.deepEqual(await positions(), frozen);
  await evaluate(
    "delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))",
  );
  await delay(100);
  const resumed = await positions();
  assert.notDeepEqual(resumed, frozen, 'Existing bubbles drift again');
  assert.equal(await count(), 2);
  assert.equal(
    await evaluate('soundStats.starts.length'),
    starts,
    'Resume itself stays silent',
  );
  await shot('bubbles-focus-resumed');
  const originalTarget = (await call('Target.getTargetInfo')).targetInfo
    .targetId;
  const otherTarget = (
    await call('Target.createTarget', { url: 'about:blank' })
  ).targetId;
  try {
    await call('Target.activateTarget', { targetId: otherTarget });
    await waitFor(
      "document.hidden && document.querySelector('#field').classList.contains('paused')",
    );
    const tabPositions = await positions();
    const tabRaf = await evaluate('window.rafCalls');
    await delay(300);
    assert.equal(await count(), 2, 'Real tab switch preserves bubbles');
    assert.deepEqual(await positions(), tabPositions);
    assert.equal(await evaluate('window.rafCalls'), tabRaf);
    await call('Target.activateTarget', { targetId: originalTarget });
    await waitFor(
      "!document.hidden && !document.querySelector('#field').classList.contains('paused')",
    );
    await delay(100);
    assert.equal(await count(), 2);
    assert.notDeepEqual(
      await positions(),
      tabPositions,
      'Real tab return resumes drifting',
    );
  } finally {
    await call('Target.closeTarget', { targetId: otherTarget });
  }

  await touch('touchStart', [{ x: 700, y: 500, id: 3 }]);
  await touch('touchCancel');
  await evaluate("window.dispatchEvent(new Event('pagehide'))");
  assert.equal(
    await count(),
    3,
    'Pagehide preserves bubbles for history restoration',
  );
  const away = await positions();
  await delay(100);
  assert.deepEqual(await positions(), away);
  await evaluate("window.dispatchEvent(new Event('pageshow'))");
  await delay(100);
  assert.notDeepEqual(await positions(), away);
  await visit();
  await evaluate("document.querySelector('.bubble').click()");
  await delay(450);
  await evaluate("document.querySelector('#create').focus()");
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    text: '\r',
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    text: '\r',
  });
  assert.equal(await count(), 1, 'Keyboard create');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 568,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await delay(100);
  assert.ok(
    await evaluate(
      "[...document.querySelectorAll('.bubble')].every(b=>{const r=b.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})",
    ),
  );
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await delay(100);
  await evaluate("document.querySelector('.bubble').click()");
  assert.equal(
    await evaluate("document.querySelectorAll('.pop-glint').length"),
    3,
    'Reduced motion uses three stationary glints',
  );
  await delay(450);
  assert.equal(
    await evaluate("document.querySelectorAll('.pop-glint').length"),
    0,
  );
  const reducedIdle = await evaluate('window.rafCalls');
  await delay(120);
  assert.equal(await evaluate('window.rafCalls'), reducedIdle);
  await evaluate(
    "Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));",
  );
  assert.equal(await count(), 0);
  await tap(160, 300);
  assert.equal(await count(), 1, 'Resumes after hidden');
  await evaluate("document.querySelector('#back').click()");
  await waitFor("document.querySelectorAll('.game-card').length===11");
  await evaluate(
    'document.querySelector(\'a[href="pukupuku-shabon/"]\').scrollIntoView()',
  );
  await delay(100);
  await shot('bubbles-hub');
  await evaluate(
    'document.querySelector(\'a[href="pukupuku-shabon/"]\').click()',
  );
  await waitFor("document.querySelector('#field')?.dataset.ready==='true'");
  assert.equal(await count(), 1, 'Re-entry starts fresh');
  await evaluate(
    "window.AudioContext=class {constructor(){throw new Error('Unavailable')}}",
  );
  await evaluate("document.querySelector('#create').click()");
  await delay(100);
  assert.equal(await count(), 2, 'Audio unavailable does not block play');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Bubbles PASS: 1000-input cap, multi-touch, keyboard, resize, reduced motion idle, real tab switch and blur/pagehide/hidden pause and resume, hub/re-entry, single quiet voice/cooldown/audio failure fallback, bounded glints/cleanup/reduced motion, non-interactive clouds, zero JS exceptions',
  );
  await writeFile(
    join(output, 'bubbles-results.txt'),
    reports.join('\n') + '\n',
  );
} finally {
  ws?.close();
  chrome.kill();
  server.close();
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 150,
  });
}
