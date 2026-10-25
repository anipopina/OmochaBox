import assert from 'node:assert/strict';
import {
  MAX_SPEED,
  advance,
  clampSpeed,
  swipeSpeed,
} from '../src/kurukuru-kazaguruma/model.ts';
assert.equal(clampSpeed(1e6), MAX_SPEED);
assert.equal(clampSpeed(-1e6), -MAX_SPEED);
assert.ok(swipeSpeed(0, -100, 50, 0, 150) > 0);
assert.ok(swipeSpeed(0, -100, -50, 0, 150) < 0);
assert.ok(swipeSpeed(0, 0, 50, 0, 150) > 0);
let model = { angle: 0, speed: MAX_SPEED };
for (let i = 0; i < 600; i++) {
  const old = model.speed;
  model = advance(model.angle, model.speed, 1 / 60);
  assert.ok(model.speed <= old);
  assert.ok(model.angle >= 0 && model.angle < 360);
}
assert.equal(model.speed, 0);
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'pinwheel-browser-'));
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
    source: `window.rafCalls=0;const raf=requestAnimationFrame;window.requestAnimationFrame=(f)=>raf(t=>{window.rafCalls++;f(t)});`,
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
  const visit = async (path = '/kurukuru-kazaguruma/') => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + path });
    await waitFor(
      `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete'`,
    );
    await waitFor(
      path === '/'
        ? "document.querySelectorAll('.game-card').length===7"
        : "document.querySelector('#wheel')?.dataset.active !== undefined",
    );
  };
  const point = () =>
    evaluate(
      "(()=>{let r=document.querySelector('#wheel').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
    );
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

  const rotation = () =>
    evaluate(
      "parseFloat(document.querySelector('#rotor').style.transform.slice(7))",
    );
  const moving = () =>
    evaluate("document.querySelector('#wheel').dataset.active === 'true'");
  async function touch(type, points = []) {
    await call('Input.dispatchTouchEvent', { type, touchPoints: points });
  }
  async function tap() {
    const p = await point();
    await touch('touchStart', [{ ...p, id: 1 }]);
    await touch('touchEnd');
  }
  async function swipe(sign = 1) {
    const r = await evaluate(
      "(()=>{const r=document.querySelector('#wheel').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height*.25,w:r.width};})()",
    );
    await touch('touchStart', [{ x: r.x - sign * r.w * 0.17, y: r.y, id: 1 }]);
    for (let i = 1; i <= 6; i++) {
      await touch('touchMove', [
        {
          x: r.x - sign * r.w * 0.17 + (sign * r.w * 0.34 * i) / 6,
          y: r.y,
          id: 1,
        },
      ]);
      await delay(20);
    }
    await touch('touchEnd');
  }
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [820, 1180],
    [844, 390],
    [568, 320],
    [1280, 800],
    [1188, 761],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await visit();
    assert.ok(
      await evaluate(
        'document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight',
      ),
    );
    assert.ok(
      await evaluate(
        "['#wheel','#back'].every(s=>{const r=document.querySelector(s).getBoundingClientRect();return r.width>=56&&r.height>=56&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})",
      ),
      'Visible controls',
    );
    assert.ok(
      await evaluate(
        "document.querySelector('#rotor').complete && document.querySelector('#rotor').naturalWidth>0",
      ),
    );
    assert.ok(
      await evaluate(`(() => {
      const r=document.querySelector('#wheel').getBoundingClientRect();
      const header=document.querySelector('header').getBoundingClientRect();
      const hint=document.querySelector('#hint').getBoundingClientRect();
      return r.top>=header.bottom+4 && r.bottom<=hint.top-4 && r.left>=4 && r.right<=innerWidth-4;
    })()`),
      'Entire rotation circle clears header, back button, hint and viewport edges',
    );
    assert.ok(
      await evaluate(`(() => {
      const canvas=document.createElement('canvas'); canvas.width=canvas.height=640;
      const ctx=canvas.getContext('2d'); ctx.drawImage(document.querySelector('#rotor'),0,0,640,640);
      const pixels=ctx.getImageData(0,0,640,640).data;
      for(let y=0;y<640;y++) for(let x=0;x<640;x++)
        if(pixels[(y*640+x)*4+3]>0 && Math.hypot(x-319.5,y-319.5)>310) return false;
      return true;
    })()`),
      'All opaque rotor pixels fit rotation circle with shadow margin',
    );
    await shot(`pinwheel-idle-${width}`);
    for (const angle of [45, 135]) {
      await evaluate(
        `(() => { const s=document.querySelector('#qa-angle') || document.head.appendChild(document.createElement('style')); s.id='qa-angle'; s.textContent='#rotor {transform: rotate(${angle}deg) !important}'; })()`,
      );
      await delay(80);
      assert.ok(
        Math.abs(
          (await evaluate(
            "new DOMMatrix(getComputedStyle(document.querySelector('#rotor')).transform).a",
          )) - Math.cos((angle * Math.PI) / 180),
        ) < 0.001,
        'Cardinal angle actually rendered',
      );
      assert.ok(
        await evaluate(
          'document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight',
        ),
        'Rotated transparent image corners do not create overflow',
      );
      await shot(`pinwheel-cardinal-${width}-${angle}`);
    }
    await evaluate("document.querySelector('#qa-angle').remove()");
    await tap();
    await delay(180);
    assert.ok((await rotation()) > 0, 'Tap discovers spin');
    await shot(`pinwheel-playing-${width}`);
  }
  report(
    'Pinwheel PASS: seven viewport sizes, portrait/landscape, safe full rotation circle/cardinal-angle screenshots, full 56px controls, asset load, real touch tap, screenshots',
  );
  await visit();
  await swipe(1);
  const a = await rotation();
  await delay(120);
  const b = await rotation();
  assert.ok((b - a + 360) % 360 < 40 && b !== a, 'Clockwise');
  await swipe(-1);
  const c = await rotation();
  await delay(120);
  const d = await rotation();
  assert.ok((c - d + 360) % 360 < 40 && d !== c, 'Reverses immediately');
  await evaluate(
    "for(let i=0;i<300;i++)document.querySelector('#wheel').click()",
  );
  const before = await rotation();
  await delay(200);
  const after = await rotation();
  assert.ok((before - after + 360) % 360 < 55, 'Rapid input speed bounded');
  await waitFor("document.querySelector('#wheel').dataset.active==='false'");
  const idle = await evaluate('window.rafCalls');
  await delay(250);
  assert.equal(await evaluate('window.rafCalls'), idle, 'Idle RAF stops');
  await visit();
  const p = await point();
  await touch('touchStart', [{ ...p, id: 1 }]);
  await touch('touchCancel');
  assert.equal(await moving(), false);
  assert.equal(await rotation(), 0);
  await swipe();
  await touch('touchStart', [{ ...p, id: 1 }]);
  await touch('touchMove', [{ x: p.x + 40, y: p.y, id: 1 }]);
  await touch('touchCancel');
  assert.equal(await moving(), false, 'Cancel stops ongoing drag');
  await visit();
  await touch('touchStart', [{ ...p, id: 1 }]);
  await touch('touchStart', [
    { ...p, id: 1 },
    { x: p.x + 30, y: p.y + 30, id: 2 },
  ]);
  await touch('touchEnd', [{ ...p, id: 1 }]);
  await touch('touchEnd');
  assert.ok(await moving(), 'Second pointer ignored without cancelling first');
  await evaluate("window.dispatchEvent(new Event('blur'))");
  assert.equal(await moving(), false);
  await visit();
  await evaluate("document.querySelector('#wheel').focus()");
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'ArrowLeft',
    code: 'ArrowLeft',
    windowsVirtualKeyCode: 37,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'ArrowLeft',
    code: 'ArrowLeft',
    windowsVirtualKeyCode: 37,
  });
  await delay(100);
  assert.ok((await rotation()) > 300, 'Keyboard left');
  await evaluate("window.dispatchEvent(new Event('blur'))");
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    autoRepeat: true,
  });
  assert.equal(await moving(), false, 'Key repeat ignored');
  await tap();
  const orientation = await rotation();
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(100);
  assert.equal(await moving(), false, 'Rotation stops input/momentum');
  assert.ok(
    Math.abs((await rotation()) - orientation) < 12,
    'Rotation preserves orientation',
  );
  await tap();
  await evaluate(
    "Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))",
  );
  assert.equal(await moving(), false);
  const hidden = await rotation();
  await evaluate("document.querySelector('#wheel').click()");
  assert.equal(await rotation(), hidden);
  await evaluate(
    "Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))",
  );
  assert.equal(await moving(), false, 'No automatic resume');
  await tap();
  assert.ok(await moving(), 'Input works after visibility return');
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await delay(100);
  assert.equal(await moving(), false);
  await visit();
  const reducedCalls = await evaluate('window.rafCalls');
  const reducedAngle = await rotation();
  await tap();
  assert.equal(((await rotation()) - reducedAngle + 360) % 360, 12);
  await delay(200);
  assert.equal(
    await evaluate('window.rafCalls'),
    reducedCalls,
    'Reduced motion no RAF',
  );
  await swipe(-1);
  assert.equal(
    ((await rotation()) - reducedAngle + 360) % 360,
    0,
    'Reduced swipe steps once',
  );
  await shot('pinwheel-reduced');
  await evaluate("document.querySelector('#back').click()");
  await waitFor("document.querySelectorAll('.game-card').length===7");
  await evaluate(
    'document.querySelector(\'a[href="kurukuru-kazaguruma/"]\').scrollIntoView()',
  );
  await waitFor(
    "document.querySelector('.pinwheel-preview img')?.complete && document.querySelector('.pinwheel-preview img')?.naturalWidth>0",
  );
  await shot('pinwheel-hub');
  await evaluate(
    'document.querySelector(\'a[href="kurukuru-kazaguruma/"]\').click()',
  );
  await waitFor(
    "document.querySelector('#wheel')?.dataset.active !== undefined",
  );
  assert.equal(await rotation(), 0);
  assert.equal(await moving(), false);
  await tap();
  await evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide'))");
  assert.equal(await rotation(), 0);
  assert.equal(await moving(), false);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Pinwheel PASS: directions, deceleration, 300 inputs/speed cap, idle RAF, multiple fingers, cancel, keyboard, repeat, blur, resize, hidden/resume, reduced motion, hub/re-entry/pagehide, no JS errors',
  );
  await writeFile(
    join(output, 'pinwheel-results.txt'),
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
