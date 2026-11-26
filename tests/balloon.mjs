import { catalogueReady, gameCount } from './catalogue.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import { createStaticServer } from './static-server.mjs';
import {
  FLIGHT_MS,
  GROW_MS,
  flightPosition,
  kickFlight,
  tapImpulse,
} from '../src/pukapuka-fusen/model.ts';

const expiryFlight = { born: 100, size: 100, lane: 0 };
for (const reduced of [false, true]) {
  assert.equal(
    flightPosition(expiryFlight, 100 + FLIGHT_MS - 1, 320, 568, reduced).done,
    false,
  );
  assert.equal(
    flightPosition(expiryFlight, 100 + FLIGHT_MS, 320, 568, reduced).done,
    true,
  );
}

for (const flight of [
  { born: 0, size: 100, lane: -0.82 },
  { born: 0, size: 90, lane: 0.84, origin: { x: 0.8, y: 0.4, tilt: 5 } },
]) {
  const position = (time) => flightPosition(flight, time, 390, 600, false);
  const start = position(0);
  const first = position(0.01);
  const rise = (time) => start.y - position(time).y;
  assert.ok(
    Math.hypot(first.x - start.x, first.y - start.y) / 0.00001 < 0.01,
    'Natural flight starts with zero velocity',
  );
  assert.ok(
    rise(200) - rise(100) > rise(100) && rise(100) > 0,
    'Natural flight gains upward speed after release',
  );
  assert.equal(
    start.tilt,
    flight.origin?.tilt ?? 0,
    'Takes off without a tilt jump',
  );
}

for (const width of [320, 820, 1280]) {
  for (const height of [320, 844, 1180]) {
    for (const dx of [-1, 1])
      for (const dy of [-1, 1]) {
        const f = { born: 0, size: 220, lane: 0 };
        const before = flightPosition(f, 3000, width, height, false);
        kickFlight(f, 3000, dx, dy, false, width, height);
        const atKick = flightPosition(f, 3000, width, height, false);
        assert.ok(
          Math.hypot(atKick.x - before.x, atKick.y - before.y) < 1e-9,
          'No jump on touch',
        );
        const after = flightPosition(f, 3100, width, height, false);
        assert.ok((after.x - before.x) * dx > 0, 'Horizontal edge direction');
        assert.ok((after.y - before.y) * dy > 0, 'Vertical edge direction');
        const kick = f.kick;
        kickFlight(f, 3050, -dx, -dy, false, width, height);
        assert.equal(f.kick, kick, 'Rapid duplicates ignored');
      }
  }
}
for (const dx of [-1, 1]) {
  for (const dy of [-1, 1]) {
    assert.deepEqual(
      tapImpulse(dx * 0.5, dy * 0.5),
      { dx, dy },
      'Full impulse is reached before the edge',
    );
    assert.deepEqual(tapImpulse(dx, dy), { dx, dy });
  }
}
const centerSpread = (x) =>
  tapImpulse(x, 0, () => 0).dx - tapImpulse(x, 0, () => 0.5).dx;
assert.ok(centerSpread(0) > centerSpread(0.2));
assert.ok(centerSpread(0.2) > 0);
assert.equal(centerSpread(0.4), 0, 'Outer taps have no random variation');
for (const offset of [0, 0.4, 0.5]) {
  const left = tapImpulse(offset - 0.001, 0, () => 0.25);
  const right = tapImpulse(offset + 0.001, 0, () => 0.25);
  assert.ok(
    Math.hypot(left.dx - right.dx, left.dy - right.dy) < 0.02,
    'Impulse varies smoothly across center and strength limits',
  );
}
const nudged = { born: 0, size: 100, lane: 0 };
for (let t = 3000; t <= 16000; t += 150) {
  kickFlight(nudged, t, 1, 1, false, 390, 600);
  const pos = flightPosition(nudged, t + 149, 390, 600, false);
  assert.equal(pos.done, false, 'Repeated touches keep the same balloon alive');
  assert.ok(
    pos.x <= 340 && pos.y <= 600,
    'Repeated pushes stay inside side and bottom bounds',
  );
}
assert.equal(nudged.size, 100);
assert.equal(nudged.born, 0);
assert.equal(
  flightPosition(nudged, nudged.kick.at + FLIGHT_MS, 390, 600, false).done,
  true,
);
const reducedFlight = { born: 0, size: 100, lane: 0 };
const resting = flightPosition(reducedFlight, 1000, 390, 600, true);
kickFlight(reducedFlight, 1000, 1, 1, true, 390, 600);
assert.deepEqual(flightPosition(reducedFlight, 1000, 390, 600, true), resting);
assert.equal(
  flightPosition(reducedFlight, FLIGHT_MS, 390, 600, true).done,
  true,
);
const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'balloon-browser-'));
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
  const visit = async (path = '/pukapuka-fusen/', scriptEnabled = true) => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + path });
    await waitFor(
      `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete'`,
    );
    await waitFor(
      path === '/'
        ? catalogueReady
        : scriptEnabled
          ? "!!document.querySelector('#held:not([hidden])')"
          : "!!document.querySelector('#pump')",
    );
    // Offscreen lazy hub images may never start loading until scrolled into view.
    // Force their request in this test, retaining full decode validation.
    await evaluate(
      `Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode()}))`,
    );
  };
  const shot = async (name) =>
    writeFile(
      join(output, name + '.png'),
      Buffer.from(
        (
          await call('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true,
          })
        ).data,
        'base64',
      ),
    );
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
  const count = (selector = '.balloon') =>
    evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  const pumpCount = () => count('.balloon[aria-label="ふうせんを はじく"]');
  const pumpPartTops = () =>
    evaluate(
      `[...document.querySelectorAll('#pump > img')].map(part=>part.getBoundingClientRect().top)`,
    );
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [820, 1180],
    [844, 390],
    [568, 320],
    [1280, 800],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    if (width === 390) {
      await call('Emulation.setScriptExecutionDisabled', { value: true });
      await visit(undefined, false);
      assert.equal(
        await evaluate(
          "getComputedStyle(document.querySelector('#held')).display",
        ),
        'none',
        'Pump balloon is hidden before initialization',
      );
      await shot('balloon-before-init');
      await call('Emulation.setScriptExecutionDisabled', { value: false });
    }
    await visit();
    assert.ok(
      await evaluate(
        `(()=>{const r=document.querySelector('#held').getBoundingClientRect();return r.width>0&&r.width<=100})()`,
      ),
      'Pump balloon starts at its small size',
    );
    assert.ok(
      await evaluate(
        `document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight`,
      ),
      'No overflow',
    );
    assert.ok(
      await evaluate(
        `[...document.querySelectorAll('#pump,#back,.welcome')].every(e=>{const r=e.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
      ),
      'Controls visible and 56px',
    );
    await shot(`balloon-initial-${width}`);
    const [baseAtRest, capAtRest] = await pumpPartTops();
    const p = await point();
    await mouse('mousePressed', p);
    await delay(70);
    await mouse('mouseReleased', p);
    assert.equal(await pumpCount(), 1, 'Short tap launches');
    const hit = await evaluate(
      "(()=>{const e=document.querySelector('.balloon:last-child'),r=e.getBoundingClientRect();return {x:r.x+r.width*.25,y:r.y+r.height*.35}})()",
    );
    const originalSize = await evaluate(
      "document.querySelector('.balloon:last-child').style.width",
    );
    const originalFilter = await evaluate(
      "getComputedStyle(document.querySelector('.balloon:last-child')).filter",
    );
    await mouse('mousePressed', hit);
    await mouse('mouseReleased', hit);
    await delay(30);
    assert.equal(
      await evaluate(
        "document.querySelector('.balloon:last-child').dataset.tapped",
      ),
      'true',
      'Flying balloon receives direct tap',
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.balloon:last-child')).filter",
      ),
      originalFilter,
      'Regular taps keep the normal shadow',
    );
    assert.equal(
      await evaluate(
        "document.querySelector('#pump').getAttribute('aria-pressed')",
      ),
      'false',
    );
    assert.equal(await pumpCount(), 1, 'Kick cannot inflate or spawn');
    assert.equal(
      await evaluate(
        "document.querySelector('.balloon:last-child').style.width",
      ),
      originalSize,
      'Kick does not enlarge',
    );
    await shot(`balloon-kicked-${width}`);
    assert.ok(
      await evaluate(
        `document.querySelector('.balloon:last-child').getBoundingClientRect().width>=40`,
      ),
    );
    await mouse('mousePressed', p);
    await delay(2600);
    const [basePressed, capPressed] = await pumpPartTops();
    assert.equal(basePressed, baseAtRest, 'Pump base remains in place');
    assert.ok(capPressed > capAtRest + 5, 'Pump cap sinks when pressed');
    const size = await evaluate(
      `document.querySelector('#held').getBoundingClientRect().width`,
    );
    assert.equal(
      await evaluate(`document.querySelector('#held').dataset.full`),
      'true',
    );
    await delay(180);
    assert.equal(
      await evaluate(
        `document.querySelector('#held').getBoundingClientRect().width`,
      ),
      size,
      'Held maximum stable',
    );
    assert.ok(
      await evaluate(
        `(()=>{const r=document.querySelector('#held').getBoundingClientRect(),h=document.querySelector('#back').getBoundingClientRect();return (r.top>=h.bottom||r.left>=h.right)&&r.left>=0&&r.right<=innerWidth})()`,
      ),
      'Maximum balloon clears back button',
    );
    await shot(`balloon-held-${width}`);
    await mouse('mouseReleased', { x: 8, y: height / 2 });
    assert.equal(await pumpCount(), 2, 'Release outside pump still launches');
    const before = await evaluate(
      `document.querySelector('.balloon:last-child').getBoundingClientRect().top`,
    );
    await delay(500);
    assert.deepEqual(await pumpPartTops(), [baseAtRest, capAtRest]);
    assert.ok(
      (await evaluate(
        `document.querySelector('.balloon:last-child').getBoundingClientRect().top`,
      )) < before,
      'Floats upward',
    );
    await shot(`balloon-flying-${width}`);
  }
  report(
    'Balloon: 320/390/820/844/568/1280 viewports, 56px targets, no overflow, short tap, 2.4s maximum stable, release outside, upward movement and screenshots PASS',
  );

  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await visit();
  const welcomePosition = (selector, fx = 0.5, fy = 0.5) =>
    evaluate(
      `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width*${fx},y:r.y+r.height*${fy}}})()`,
    );
  const firstWelcome = await welcomePosition('.welcome-one', 0.75, 0.75);
  await mouse('mousePressed', firstWelcome);
  await mouse('mouseReleased', firstWelcome);
  assert.equal(await count(), 1, 'First welcome balloon launches once');
  assert.ok(await evaluate("!!document.querySelector('.welcome-two')"));
  await waitFor('window.balloonTouch?.frames.length === 2');
  const [lowerFirst, lowerNext] = await evaluate('window.balloonTouch.frames');
  assert.ok(
    lowerNext.x < lowerFirst.x && lowerNext.y < lowerFirst.y,
    'First tap on the lower right pushes the welcome balloon up and left',
  );
  const secondWelcome = await welcomePosition('.welcome-two');
  await evaluate("document.querySelector('.welcome-two').focus()");
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    code: 'Enter',
    key: 'Enter',
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    code: 'Enter',
    key: 'Enter',
  });
  assert.equal(await count(), 2, 'Second welcome balloon launches with Enter');
  assert.ok(await evaluate("document.activeElement.matches('.balloon')"));
  await waitFor(
    `document.activeElement.matches('.balloon') && document.activeElement.getBoundingClientRect().top < ${secondWelcome.y - 70}`,
  );
  await shot('balloon-welcome-launched');
  report(
    'Balloon: no large initial paint, both welcome balloons launch independently by pointer or keyboard PASS',
  );
  await visit();
  const upperWelcome = await welcomePosition('.welcome-one', 0.25, 0.25);
  await mouse('mousePressed', upperWelcome);
  await mouse('mouseReleased', upperWelcome);
  await waitFor('window.balloonTouch?.frames.length === 2');
  const [upperFirst, upperNext] = await evaluate('window.balloonTouch.frames');
  assert.ok(
    upperNext.x > upperFirst.x && upperNext.y > upperFirst.y,
    'First tap on the upper left pushes the welcome balloon down and right',
  );
  report(
    'Balloon: first taps redirect welcome balloons according to hit position PASS',
  );
  await visit();
  const idle = await evaluate(
    `[...document.querySelectorAll('.welcome')].map(e=>e.getBoundingClientRect().top)`,
  );
  await mouse('mousePressed', await point());
  assert.equal(
    await count('.welcome'),
    0,
    'First press releases both welcome balloons',
  );
  assert.equal(
    await count(),
    2,
    'Both welcome balloons are airborne during inflation',
  );
  assert.equal(await pumpCount(), 0, 'Pump balloon is still held down');
  assert.ok(
    await evaluate(
      "[...document.querySelectorAll('.balloon')].every(e=>e.dataset.tapped==='false')",
    ),
  );
  await waitFor(
    `[...document.querySelectorAll('.balloon')].every((e,i)=>e.getBoundingClientRect().top < ${JSON.stringify(idle)}[i] - 15)`,
  );
  await shot('balloon-welcome-first-press');
  await mouse('mouseReleased', await point());
  assert.equal(await pumpCount(), 1);
  report(
    'Balloon: first press releases both welcome balloons from rest before the pumped balloon is launched PASS',
  );
  await visit();
  const p = await point();
  await call('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 10,
  });
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...p, id: 1 }],
  });
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { ...p, id: 1 },
      { x: p.x + 30, y: p.y, id: 2 },
    ],
  });
  await delay(100);
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await pumpCount(), 1, 'Two fingers create one balloon');
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...p, id: 3 }],
  });
  await call('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  assert.equal(await pumpCount(), 1, 'Cancel does not launch');
  assert.equal(
    await evaluate(
      `document.querySelector('#pump').getAttribute('aria-pressed')`,
    ),
    'false',
  );
  for (const [fx, fy, dx, dy, random] of [
    [0.25, 0.25, 1, 1],
    [0.25, 0.75, 1, -1],
    [0.75, 0.25, -1, 1],
    [0.75, 0.75, -1, -1],
    [0.5, 0.5, 1, -1, 0],
    [0.5, 0.5, -1, -1, 0.5],
  ]) {
    await visit();
    if (random !== undefined) await evaluate(`Math.random = () => ${random}`);
    await call('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...p, id: 1 }],
    });
    await call('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await delay(1500);
    const before = await evaluate(
      `(()=>{const r=document.querySelector('.balloon:last-child').getBoundingClientRect();return {x:r.x+r.width*${fx},y:r.y+r.height*${fy}}})()`,
    );
    await call('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: before.x, y: before.y, id: 2 }],
    });
    await call('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await waitFor('window.balloonTouch?.frames.length === 2');
    const observed = await evaluate(
      `(()=>{const {trusted,directionX,directionY,frames}=window.balloonTouch;return {trusted,directionX,directionY,frames}})()`,
    );
    assert.equal(
      observed.trusted,
      true,
      'Trusted pointer input reached the balloon',
    );
    const [first, second] = observed.frames;
    assert.ok(
      second.time > first.time,
      'Two successive rendered frames observed',
    );
    if (random === undefined) {
      assert.equal(observed.directionX, dx);
      assert.equal(observed.directionY, dy);
      assert.ok((second.x - first.x) * dx > 0, 'Edge tap redirects sideways');
    } else {
      assert.ok(
        (second.x - first.x) * dx > (second.time - first.time) * 0.04,
        'Center tap produces a noticeable kick in the sampled direction',
      );
    }
    assert.ok(
      (second.y - first.y) * dy > 0,
      'Edge taps redirect vertically and taps around center keep rising',
    );
  }
  report(
    'Balloon: trusted outer taps redirect in four directions and center taps rebound in varied directions PASS',
  );
  await call('Emulation.setTouchEmulationEnabled', { enabled: false });
  await evaluate(`document.querySelector('#pump').focus()`);
  for (const code of ['Space', 'Enter']) {
    const key = code === 'Space' ? ' ' : 'Enter';
    const params = {
      key,
      code,
      windowsVirtualKeyCode: code === 'Space' ? 32 : 13,
    };
    const before = await pumpCount();
    await call('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      autoRepeat: true,
      ...params,
    });
    await delay(120);
    await call('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
    assert.equal(await pumpCount(), before + 1, 'One balloon per key gesture');
  }
  await mouse('mousePressed', p);
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  await mouse('mouseReleased', p);
  assert.equal(
    await evaluate(
      `document.querySelector('#pump').getAttribute('aria-pressed')`,
    ),
    'false',
  );
  const beforeResize = await pumpCount();
  await mouse('mousePressed', p);
  await call('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(100);
  await mouse('mouseReleased', { x: 8, y: 150 });
  assert.equal(
    await pumpCount(),
    beforeResize,
    'Resize cancels without launch',
  );
  report(
    'Balloon: trusted CDP touch, two fingers, pointer cancellation, keyboard repeat, blur and resize cancellation PASS',
  );

  await visit();
  const cycle = [];
  for (let i = 0; i < 7; i++) {
    const source = await evaluate(
      `(async()=>{const image=document.querySelector('#held');await image.decode();return image.src})()`,
    );
    cycle.push(source);
    if (i < 6) await shot(`balloon-variant-${i + 1}`);
    await evaluate(`document.querySelector('#pump').click()`);
  }
  assert.equal(
    new Set(cycle.slice(0, 6)).size,
    6,
    'Six distinct decoded variants',
  );
  assert.equal(
    cycle[6],
    cycle[0],
    'Variant sequence repeats after six launches',
  );
  const sources = await evaluate(
    `(()=>{const set=new Set();for(let i=0;i<200;i++){document.querySelector('#pump').click();set.add(document.querySelector('.balloon:last-child').src)}return [...set]})()`,
  );
  assert.equal(sources.length, 6, 'Six distinct assets repeat');
  assert.equal(await count(), 18, '200 launches bounded at 18 nodes');
  await delay(FLIGHT_MS + 300);
  // Expiry cleanup runs in RAF. Wall-clock sleep alone does not guarantee that
  // Chromium delivered a frame, especially while capturing other pages.
  await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
  assert.equal(await count(), 0, 'Expired balloons removed on the next frame');
  await waitFor('window.pendingRafs.size === 0');
  const frames = await evaluate('window.rafCalls');
  await delay(250);
  assert.equal(await evaluate('window.rafCalls'), frames, 'Idle loop stops');
  await evaluate('window.balloonFullFrame = null');
  await mouse('mousePressed', await point());
  await waitFor('window.balloonFullFrame !== null');
  const firstFullFrame = await evaluate('window.balloonFullFrame');
  assert.equal(
    firstFullFrame.pending,
    0,
    'The first full-size frame queues no successor',
  );
  assert.equal(
    await evaluate('window.rafCalls'),
    firstFullFrame.calls,
    'No extra frame after becoming full',
  );
  assert.equal(
    await evaluate(
      "document.querySelector('#pump').getAttribute('aria-pressed')",
    ),
    'true',
    'Still held when the loop stops',
  );
  const heldFrames = await evaluate('window.rafCalls');
  await delay(200);
  assert.equal(
    await evaluate('window.rafCalls'),
    heldFrames,
    'Maximum held loop stops',
  );
  assert.equal(
    await evaluate('window.pendingRafs.size'),
    0,
    'No pending frame after maximum growth',
  );
  await mouse('mouseReleased', await point());
  await evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))`,
  );
  assert.equal(await count(), 0, 'Hidden clears flight nodes');
  assert.equal(
    await evaluate(
      `document.querySelector('#pump').getAttribute('aria-pressed')`,
    ),
    'false',
  );
  report(
    'Balloon: six variants, 200 launches / 18-node cap, 9.5s expiry, idle and held-max RAF stop, synthetic hidden cleanup PASS',
  );

  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await visit();
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.hand')).animationName`,
    ),
    'none',
  );
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.pump-cap')).transitionDuration`,
    ),
    '0s',
    'Pump cap changes immediately with reduced motion',
  );
  const reducedWelcome = await welcomePosition('.welcome-one');
  await mouse('mousePressed', reducedWelcome);
  await mouse('mouseReleased', reducedWelcome);
  const reducedAccent = await evaluate(
    "document.querySelector('.balloon').dataset.tapped",
  );
  assert.equal(reducedAccent, 'true', 'Welcome balloon shows tap feedback');
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.balloon')).filter.match(/drop-shadow/g).length",
    ),
    2,
    'Reduced-motion taps still show a glow',
  );
  await delay(120);
  const reducedAfter = await welcomePosition('.balloon');
  assert.ok(
    Math.hypot(
      reducedAfter.x - reducedWelcome.x,
      reducedAfter.y - reducedWelcome.y,
    ) < 1,
    'Welcome balloon holds its position with reduced motion',
  );
  const remainingWelcome = await welcomePosition('.welcome-two');
  await evaluate(`document.querySelector('#pump').click()`);
  await delay(80);
  assert.equal(await count('.welcome'), 0);
  const releasedWelcome = await welcomePosition(
    '[aria-label="さんかくの ふうせんを はじく"]',
  );
  assert.ok(
    Math.hypot(
      releasedWelcome.x - remainingWelcome.x,
      releasedWelcome.y - remainingWelcome.y,
    ) < 1,
    'Automatic release does not move the welcome balloon with reduced motion',
  );
  const transform = await evaluate(
    `document.querySelector('.balloon:last-child').style.transform`,
  );
  await evaluate("document.querySelector('.balloon:last-child').click()");
  await delay(300);
  assert.equal(
    await evaluate(
      `document.querySelector('.balloon:last-child').style.transform`,
    ),
    transform,
    'Reduced motion stays still',
  );
  await shot('balloon-reduced-motion');
  await evaluate(`window.dispatchEvent(new Event('pagehide'))`);
  assert.equal(await count(), 0, 'Pagehide clears flights');
  await call('Emulation.setEmulatedMedia', { features: [] });
  await visit('/');
  assert.equal(
    await evaluate(`document.querySelectorAll('.game-card').length`),
    gameCount,
  );
  await evaluate(`document.querySelector('a[href="pukapuka-fusen/"]').click()`);
  await waitFor(
    `document.readyState === 'complete' && !!document.querySelector('#held:not([hidden])')`,
  );
  assert.equal(
    await evaluate('document.title'),
    'ぷかぷか、ふうせん｜おもちゃボックス',
  );
  await evaluate(
    `document.querySelector('#pump').click();document.querySelector('#back').click()`,
  );
  await waitFor(catalogueReady);
  assert.equal(
    await evaluate(`document.querySelectorAll('.game-card').length`),
    gameCount,
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Balloon: reduced motion, pagehide, hub navigation/return, no JavaScript exceptions PASS',
  );
  const manifest = JSON.parse(
    await readFile(join(root, 'dist/.vite/manifest.json'), 'utf8'),
  );
  assert.ok(
    !Object.keys(manifest).some((key) =>
      key.startsWith('pukapuka-fusen/sound-review/'),
    ),
  );
  const { cues: adopted } = JSON.parse(
    await readFile(
      join(root, 'source-assets/pukapuka-fusen/audio/adopted.json'),
      'utf8',
    ),
  );
  const releasedAudio = Object.entries(manifest).filter(
    ([key]) =>
      key.startsWith('pukapuka-fusen/assets/') &&
      key.split('?')[0].endsWith('.mp3'),
  );
  const approved = new Map(
    Object.values(adopted)
      .flat()
      .map((entry) => [entry.output.slice(4), entry.sha256]),
  );
  assert.deepEqual(
    new Set(releasedAudio.map(([key]) => key.split('?')[0])),
    new Set(approved.keys()),
  );
  for (const [key, entry] of releasedAudio) {
    const bytes = await readFile(join(root, 'dist', entry.file));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      approved.get(key.split('?')[0]),
    );
  }
  const review = await createServer({
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  try {
    await review.listen();
    const reviewUrl = `http://127.0.0.1:${review.httpServer.address().port}/pukapuka-fusen/`;
    await call('Page.addScriptToEvaluateOnNewDocument', {
      source: `
      window.balloonAudio={decoded:0,contexts:0,starts:0,active:new Set(),buffers:new WeakMap(),played:[],stops:[],ramps:[],gainSets:[]};
      const Decoder=OfflineAudioContext;
      window.OfflineAudioContext=class extends Decoder {
        async decodeAudioData(data){const buffer=await super.decodeAudioData(data);balloonAudio.buffers.set(buffer,++balloonAudio.decoded);return buffer;}
      };
      const Playback=AudioContext;
      window.AudioContext=class extends Playback {
        constructor(...args){super(...args);balloonAudio.contexts++;balloonAudio.context=this;}
        createGain(){
          const node=super.createGain(),ramp=node.gain.linearRampToValueAtTime.bind(node.gain);
          const set=node.gain.setValueAtTime.bind(node.gain);
          node.gain.linearRampToValueAtTime=(gain,when)=>{balloonAudio.ramps.push({gain,delay:when-this.currentTime});return ramp(gain,when);};
          node.gain.setValueAtTime=(gain,when)=>{balloonAudio.gainSets.push(gain);return set(gain,when);};
          return node;
        }
        createBufferSource(){
          const source=super.createBufferSource(),start=source.start.bind(source),stop=source.stop.bind(source),connect=source.connect.bind(source);
          let gain;
          source.connect=(target,...args)=>{if(target instanceof GainNode)gain=target.gain;return connect(target,...args);};
          source.start=(...args)=>{balloonAudio.starts++;balloonAudio.played.push({id:balloonAudio.buffers.get(source.buffer),duration:source.buffer.duration,gain:gain?.value});balloonAudio.active.add(source);source.addEventListener('ended',()=>balloonAudio.active.delete(source));return start(...args);};
          source.stop=(when=0)=>{balloonAudio.stops.push(when ? when-this.currentTime : 0);if(!when)balloonAudio.active.delete(source);return stop(when);};
          return source;
        }
      };
    `,
    });
    await call('Page.navigate', { url: `${reviewUrl}?sound-review` });
    await waitFor("document.querySelector('.review')?.dataset.ready==='true'");
    const ids = await evaluate(
      "[...document.querySelectorAll('[data-candidate]')].map(e=>e.dataset.candidate)",
    );
    const identities = JSON.parse(
      await readFile(
        join(
          root,
          'source-assets/pukapuka-fusen/audio/review/candidate-identities.json',
        ),
        'utf8',
      ),
    );
    assert.deepEqual(new Set(ids), new Set(identities.map(({ id }) => id)));
    for (const [index, id] of ids.entries()) {
      await call('Runtime.evaluate', {
        expression: `document.querySelector('[data-play="${id}"][data-count="1"]').click()`,
        userGesture: true,
      });
      await waitFor(`balloonAudio.starts === ${index + 1}`);
    }
    const choices = ['pump-d', 'release-c', 'tap-c', 'full-e'];
    const preview = await evaluate(`(() => {
      for (const id of ${JSON.stringify(choices)}) document.querySelector('input[value="'+id+'"]').click();
      let url;
      window.open=(path)=>{url=path;return null;};
      document.querySelector('[data-preview]').click();
      return url;
    })()`);
    assert.equal(
      preview,
      `/pukapuka-fusen/?sound-preview=${choices.join(',')}`,
    );
    await evaluate(
      `Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.selectionText=text}}});document.querySelector('#copy').click()`,
    );
    await waitFor('!!window.selectionText');
    const selection = JSON.parse(await evaluate('window.selectionText'));
    for (const id of choices)
      assert.equal(selection.scenes[id.split('-')[0]].choice, id);

    for (const url of [
      `${origin}/pukapuka-fusen/`,
      new URL(preview, reviewUrl).href,
    ]) {
      const previousDocument = await evaluate('performance.timeOrigin');
      await call('Page.navigate', { url });
      await waitFor(
        `performance.timeOrigin!==${previousDocument} && !!document.querySelector('#held:not([hidden])') && balloonAudio.decoded===7`,
      );
      await evaluate(
        'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
      );
      assert.equal(
        await evaluate('balloonAudio.contexts'),
        0,
        'Samples preload without opening audio playback',
      );
      await evaluate('Math.random=()=>0.1');
      await evaluate(
        `window.pumpTrace=[];for(const type of ['pointerup','pointercancel','lostpointercapture','blur','resize']) window.addEventListener(type,e=>pumpTrace.push([type,e.target.id,document.querySelector('#pump').getAttribute('aria-pressed')]),true)`,
      );
      const previewPump = await point();
      await mouse('mousePressed', previewPump);
      await waitFor('balloonAudio.starts===1');
      assert.ok(
        Math.abs((await evaluate('balloonAudio.played[0].gain')) - 0.275) <
          0.00001,
        'Pump starts at half gain',
      );
      assert.ok(
        Math.abs(
          (await evaluate('balloonAudio.played[0].duration')) - GROW_MS / 1000,
        ) < 0.01,
        'Air lasts until maximum size',
      );
      await delay(160);
      await mouse('mouseReleased', previewPump);
      assert.equal(
        await pumpCount(),
        1,
        `Pump released a balloon at ${url}: ${JSON.stringify(await evaluate('pumpTrace'))}`,
      );
      const releaseAudio = await evaluate(
        `({starts:balloonAudio.starts,state:balloonAudio.context.state,stops:balloonAudio.stops,played:balloonAudio.played})`,
      );
      assert.equal(
        releaseAudio.starts,
        2,
        `Pump and release at ${url}: ${JSON.stringify(releaseAudio)}`,
      );
      assert.ok(
        await evaluate(
          'balloonAudio.stops.some(delay=>delay>0.03&&delay<0.07)',
        ),
        'Early release schedules a short stop',
      );
      assert.ok(
        await evaluate(
          'balloonAudio.ramps.some(r=>r.gain===0&&r.delay>0.03&&r.delay<0.07)',
        ),
        'Early release fades the volume to zero',
      );
      assert.ok(
        await evaluate('balloonAudio.gainSets[0]===0.275'),
        'Early release keeps the quieter pump gain at the start of the fade',
      );
      assert.ok(
        await evaluate('balloonAudio.ramps.some(r=>r.gain===0.55)'),
        'Release keeps its original gain',
      );
      await waitFor('balloonAudio.active.size===0');
      await mouse('mousePressed', previewPump);
      await waitFor('balloonAudio.starts===3');
      await waitFor(
        "document.querySelector('#held').dataset.full==='true' && balloonAudio.starts===4",
      );
      await delay(170);
      assert.equal(
        await evaluate('balloonAudio.starts'),
        4,
        'Maximum cue plays once while held',
      );
      assert.ok(
        Math.abs((await evaluate('balloonAudio.played[3].duration')) - 0.153) <
          0.01,
        'Maximum size uses the short air cue',
      );
      await evaluate('Math.random=()=>0.9');
      await mouse('mouseReleased', previewPump);
      await waitFor('balloonAudio.starts===5');
      assert.ok(
        await evaluate('balloonAudio.played[1].id!==balloonAudio.played[4].id'),
        'Both release variants play across sampled random values',
      );
      for (const [index, sample] of [0.1, 0.45, 0.9].entries()) {
        await waitFor('balloonAudio.active.size===0');
        await call('Runtime.evaluate', {
          expression: `Math.random=()=>${sample};document.querySelector('.balloon:last-child').click()`,
          userGesture: true,
        });
        await waitFor(`balloonAudio.starts===${6 + index}`);
      }
      assert.equal(
        await evaluate(
          'new Set(balloonAudio.played.slice(-3).map(cue=>cue.id)).size',
        ),
        3,
        'Three variants play across sampled balloon taps',
      );
      await evaluate("window.dispatchEvent(new Event('blur'))");
      assert.equal(
        await evaluate('balloonAudio.active.size'),
        0,
        'Blur releases all audio sources',
      );
    }
    assert.equal(errors.length, 0, JSON.stringify(errors));
    report(
      'Balloon sound: selected file hashes in dist, review export, airflow, fade, maximum cue, 2 release and 3 tap variants in ordinary play and preview PASS',
    );
  } finally {
    await review.close();
  }
  await writeFile(
    join(output, 'balloon-results.txt'),
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
