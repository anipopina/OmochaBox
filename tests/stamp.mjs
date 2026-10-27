import { heldSize } from '../src/ponpon-stamp/sizing.ts';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'stamp-browser-'));
const output =
  process.env.STAMP_RESULTS_DIRECTORY || join(root, 'test-results');
await mkdir(output, { recursive: true });
const server = createStaticServer(
  process.env.STAMP_BUILD_DIRECTORY || join(root, 'dist'),
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
  const visit = async (path = '/ponpon-stamp/') => {
    await call('Page.navigate', { url: origin + path });
    await waitFor(
      `document.readyState==='complete' && document.querySelectorAll('.choice').length===6`,
    );
    await evaluate(`Promise.all([...document.images].map(i=>i.decode()))`);
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await delay(50);
    }
    assert.fail(`Timed out waiting for ${expression}`);
  };
  const shot = async (name, fullPage = true) =>
    writeFile(
      join(output, name + '.png'),
      Buffer.from(
        (
          await call('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: fullPage,
          })
        ).data,
        'base64',
      ),
    );
  const point = (selector, fx = 0.5, fy = 0.5) =>
    evaluate(
      `(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();let w=r.width,h=r.height;if('${selector}'==='#paper'){const a=document.querySelector('aside').getBoundingClientRect();if(a.width<r.width*0.6)w=a.left-r.left;else h=a.top-r.top;}return {x:r.x+w*${fx},y:r.y+h*${fy}}})()`,
    );
  const mouse = (type, p) =>
    call('Input.dispatchMouseEvent', {
      type,
      ...p,
      button: 'left',
      clickCount: 1,
    });
  const tap = async (p) => {
    await mouse('mousePressed', p);
    await mouse('mouseReleased', p);
  };
  const count = () => evaluate(`document.querySelectorAll('.stamp').length`);
  const click = (selector) =>
    evaluate(`document.querySelector('${selector}').click()`);
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
    await visit();
    assert.ok(
      await evaluate(
        `document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight`,
      ),
      'No overflow',
    );
    assert.ok(
      await evaluate(
        `[...document.querySelectorAll('.choice,.page-arrow,#new,#back')].every(e=>{const r=e.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
      ),
      '56px controls visible',
    );
    assert.ok(
      await evaluate(
        `(()=>{const r=document.querySelector('#paper').getBoundingClientRect();return r.x===0&&r.y===0&&r.width===innerWidth&&r.height===innerHeight})()`,
      ),
      'Paper remains usable',
    );
    if (process.env.STAMP_EXPECT_BOUNDARIES) {
      const groups = await evaluate('window.__stampFixtureGroups');
      assert.deepEqual(
        groups.map((group) => group.length),
        [2, 5, 7],
      );
      assert.deepEqual(
        await evaluate(
          `[...document.querySelectorAll('.choice')].map(button=>button.dataset.item)`,
        ),
        groups.flat().slice(0, 6),
        'First page crosses A -> B without a set break',
      );
    }
    await shot(`stamp-initial-${width}`);
    const gap = await evaluate(`(() => {
      const a=document.querySelector('aside'), r=a.getBoundingClientRect();
      const n=document.querySelector('#new').getBoundingClientRect();
      return {x:r.x+1,y:r.y+1,transparent:getComputedStyle(a).backgroundColor==='rgba(0, 0, 0, 0)',
        passes:document.elementFromPoint(r.x+1,r.y+1)===document.querySelector('#paper'),
        topRight:n.top<40&&n.right>innerWidth-40,
        removed:!document.querySelector('#guide,#undo,.touch,.guide-ring')};
    })()`);
    assert.ok(
      gap.transparent && gap.passes && gap.topRight && gap.removed,
      'Guide and undo removed, new paper at top right, palette gaps pass through',
    );
    await tap({ x: gap.x, y: gap.y });
    assert.equal(await count(), 1, 'Palette gap taps stamp on the paper');
    await click('#new');
    await delay(50);
    assert.equal(await count(), 0);

    for (let i = 0; i < 6; i++) {
      await click(`.choice:nth-child(${i + 1})`);
      await tap(
        await point(
          '#paper',
          0.22 + (i % 2) * 0.55,
          0.22 + Math.floor(i / 2) * 0.27,
        ),
      );
    }
    await delay(400);
    assert.equal(await count(), 6);
    assert.equal(
      await evaluate(
        `new Set([...document.querySelectorAll('.stamp img')].map(i=>i.src)).size`,
      ),
      6,
    );
    assert.ok(
      await evaluate(
        `document.querySelectorAll('.choice[aria-pressed="true"]').length===1`,
      ),
    );
    assert.ok(
      await evaluate(
        `Promise.all([...document.images].map(i=>i.decode())).then(()=>true)`,
      ),
    );
    await shot(`stamp-art-${width}`);
    for (const [pageNumber, length] of [
      [2, 6],
      [3, 2],
    ]) {
      await tap(await point('#next-page'));
      assert.equal(
        await evaluate(`document.querySelector('#palette').dataset.page`),
        String(pageNumber),
      );
      assert.equal(
        await evaluate(`document.querySelectorAll('.choice').length`),
        length,
      );
      if (process.env.STAMP_EXPECT_BOUNDARIES) {
        const groups = await evaluate('window.__stampFixtureGroups');
        assert.deepEqual(
          await evaluate(
            `[...document.querySelectorAll('.choice')].map(button=>button.dataset.item)`,
          ),
          groups.flat().slice((pageNumber - 1) * 6, pageNumber * 6),
          'Pages preserve flat order across B -> C and final remainder',
        );
      }

      assert.ok(
        await evaluate(
          `[...document.querySelectorAll('.choice,.page-arrow,#new')].every(e=>{const r=e.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
        ),
        'Paged controls fit',
      );
      assert.ok(
        await evaluate(
          `document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight`,
        ),
        'Pages have no overflow',
      );
      for (let i = 0; i < length; i++) {
        await click(`.choice:nth-child(${i + 1})`);
        await waitFor(
          `document.querySelector('#paper').getAttribute('aria-busy')==='false'`,
        );
        await tap(
          await point(
            '#paper',
            0.18 + (i % 3) * 0.3,
            0.3 + Math.floor(i / 3) * 0.4,
          ),
        );
      }
      await evaluate(`Promise.all([...document.images].map(i=>i.decode()))`);
      await delay(800);
      await shot(`stamp-page-${pageNumber}-${width}`);
    }
    assert.equal(await count(), 14, 'All 14 originals mix across pages');
    assert.equal(
      await evaluate(
        `new Set([...document.querySelectorAll('.stamp')].map(i=>i.dataset.item)).size`,
      ),
      14,
    );
    await click('#next-page');
    assert.equal(
      await evaluate(`document.querySelector('#palette').dataset.page`),
      '1',
      'Last -> first',
    );
    assert.equal(
      await evaluate(
        `document.querySelector('.choice[aria-pressed="true"]').dataset.item`,
      ),
      'shapes/coral-square',
    );
    await click('#previous-page');
    assert.equal(
      await evaluate(`document.querySelector('#palette').dataset.page`),
      '3',
      'First -> last',
    );
    assert.equal(
      await evaluate(
        `document.querySelector('.choice[aria-pressed="true"]').dataset.item`,
      ),
      'aquarium/dolphin',
      'Visible first item selected on page change',
    );
    await click('#previous-page');
    assert.equal(
      await evaluate(`document.querySelector('#palette').dataset.page`),
      '2',
    );
    for (let i = 0; i < 20; i++) await click('#next-page');
    assert.equal(await count(), 14, 'Rapid paging retains art');
    assert.equal(
      await evaluate(
        `document.querySelectorAll('.choice[aria-pressed="true"]').length`,
      ),
      1,
      'Selection always visible',
    );
  }
  report(
    'Stamp: 320/390/820/844/568/1280, visible 56px controls, usable paper, six original SVGs, tap placement and screenshots PASS',
  );
  // Resize the same artwork so random size differences cannot hide scaling errors.
  await call('Emulation.setDeviceMetricsOverride', {
    width: 400,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await visit();
  await tap(await point('#paper', 0.99, 0.25));
  const stampWidth = () =>
    evaluate(`document.querySelector('.stamp').clientWidth`);
  const phoneSize = await stampWidth();
  assert.ok(
    phoneSize >= 72 && phoneSize <= 128,
    'Phone retains original size range',
  );
  for (const [width, height, scale] of [
    [800, 1000, 1.4],
    [1000, 1200, 1.6],
    [1200, 1400, 1.6],
    [844, 390, 1],
    [400, 1000, 1],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await delay(150);
    assert.ok(
      Math.abs((await stampWidth()) - phoneSize * scale) <= 2,
      `Existing stamp scales to ${scale} at ${width}x${height}`,
    );
    assert.equal(await count(), 1, 'Resize retains artwork');
    assert.ok(
      await evaluate(`(() => {
      const s=document.querySelector('.stamp'), r=s.getBoundingClientRect();
      return Math.abs(parseFloat(s.style.left)-innerWidth*0.99)<0.1 && r.right>innerWidth;
    })()`),
      'Small stamp remains centered at the edge and is clipped',
    );
    if (width === 1000) await shot('stamp-size-1000');
  }
  report(
    'Stamp size: original phone range, gradual tablet/desktop enlargement, 1.6x cap, landscape phone and resize recovery PASS',
  );
  assert.equal(heldSize(999), null);
  assert.equal(heldSize(1000), 128);
  assert.equal(heldSize(5500), 576);
  assert.equal(heldSize(10000), 1024);
  assert.equal(heldSize(60000), 1024);
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await visit();
  const particleWidth = () =>
    evaluate(`(() => {
    const p=document.querySelector('.stamp-particle');
    for(const a of p.getAnimations()){a.pause();a.currentTime=0;}
    return p.getBoundingClientRect().width;
  })()`);
  await tap(await point('#paper'));
  const smallParticleWidth = await particleWidth();
  await tap({ x: 2, y: 500 });
  assert.ok(
    await evaluate(
      `(() => {const s=document.querySelector('.stamp:last-child'),r=s.getBoundingClientRect();return parseFloat(s.style.left)===2&&parseFloat(s.style.top)===500&&r.left<0})()`,
    ),
    'Small stamp clips at the exact tapped edge',
  );
  await click('#new');
  const holdPoint = await point('#paper', 0.4, 0.35);
  const releasePoint = await point('#paper', 0.65, 0.5);
  await mouse('mousePressed', holdPoint);
  assert.equal(
    await evaluate(`document.querySelectorAll('.charge').length`),
    1,
  );
  assert.equal(await count(), 0, 'Holding never places a stamp early');
  await delay(1050);
  const earlySize = await evaluate(
    `parseFloat(document.querySelector('.charge').style.width)`,
  );
  assert.ok(
    earlySize >= 128 && earlySize < 160,
    'At one second charging starts near random maximum',
  );
  await delay(4000);
  await mouse('mouseMoved', releasePoint);
  const midSize = await evaluate(
    `parseFloat(document.querySelector('.charge').style.width)`,
  );
  assert.ok(
    midSize > earlySize * 3 && midSize < 1024,
    'Power ring grows during hold',
  );
  await shot('stamp-charge-growing-390', false);
  await delay(5100);
  await waitFor(`document.querySelector('.charge')?.dataset.full==='true'`);
  assert.equal(
    await evaluate(`parseFloat(document.querySelector('.charge').style.width)`),
    1024,
  );
  const cappedFrames = await evaluate('window.rafCalls');
  await delay(250);
  assert.equal(
    await evaluate('window.rafCalls'),
    cappedFrames,
    'Charge RAF stops at maximum',
  );
  await shot('stamp-charge-full-390', false);
  await mouse('mouseReleased', releasePoint);
  assert.equal(
    await count(),
    1,
    'Moving a held finger still stamps on release',
  );
  const chargedStamp = await evaluate(
    `(() => {const s=document.querySelector('.stamp');return {size:parseFloat(s.style.width),x:parseFloat(s.style.left),y:parseFloat(s.style.top)}})()`,
  );
  assert.equal(chargedStamp.size, 1024, 'Full power keeps 8x size');
  assert.ok(
    Math.abs(chargedStamp.x - releasePoint.x) < 0.01 &&
      Math.abs(chargedStamp.y - releasePoint.y) < 0.01,
    'Charged stamp follows release position',
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('.charge').length`),
    0,
  );
  assert.ok(
    (await particleWidth()) > smallParticleWidth * 2,
    'Large stamps produce visibly larger particles',
  );
  assert.ok(
    await evaluate(`(() => {
    const effects=document.querySelector('#effects'), stamps=document.querySelector('#stamps');
    const p=effects.querySelectorAll('.stamp-particle')[9];
    for(const a of p.getAnimations()){a.pause();a.currentTime=0;}
    effects.style.pointerEvents=stamps.style.pointerEvents=p.style.pointerEvents='auto';
    const r=p.getBoundingClientRect();
    const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    effects.style.pointerEvents=stamps.style.pointerEvents=p.style.pointerEvents='';
    return top===p;
  })()`),
    'Particle paints above the large stamp beneath it',
  );
  await shot('stamp-particles-front-390', false);
  await delay(850);
  await shot('stamp-charged-390', false);
  await mouse('mousePressed', holdPoint);
  await click('#next-page');
  assert.equal(
    await evaluate(`document.querySelectorAll('.charge').length`),
    0,
    'Page change clears charge',
  );
  await mouse('mouseReleased', holdPoint);
  assert.equal(await count(), 1, 'Cancelled charge is never replayed');
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await mouse('mousePressed', holdPoint);
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.charge-sparks')).animationName`,
    ),
    'none',
  );
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  assert.equal(
    await evaluate(`document.querySelectorAll('.charge').length`),
    0,
    'Blur removes charge effects',
  );
  await mouse('mouseReleased', holdPoint);
  await call('Emulation.setEmulatedMedia', { features: [] });
  await visit();
  const touchA = await point('#paper', 0.3, 0.3),
    touchB = await point('#paper', 0.7, 0.45);
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { ...touchA, id: 1 },
      { ...touchB, id: 2 },
    ],
  });
  await delay(1200);
  assert.equal(
    await evaluate(`document.querySelectorAll('.charge').length`),
    2,
    'Two fingers charge independently',
  );
  await call('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: touchA.x + 30, y: touchA.y + 20, id: 1 },
      { x: touchB.x - 30, y: touchB.y + 20, id: 2 },
    ],
  });
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(
    await count(),
    2,
    'Moving real touch input places each charged stamp once',
  );
  assert.ok(
    await evaluate(
      `[...document.querySelectorAll('.stamp')].every(e=>parseFloat(e.style.width)>128)`,
    ),
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('.charge').length`),
    0,
  );
  report(
    'Charge PASS: 1s threshold, gradual power preview, 10s/8x cap and idle, moved release, clipped giant stamp, cancellation and reduced motion',
  );
  // Hold image decoding to exercise immediate input and switching before readiness.
  const gate = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.releaseImages=[];const decode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){return new Promise(resolve=>window.releaseImages.push(()=>resolve(decode.call(this))))}`,
  });
  await call('Page.navigate', { url: origin + '/ponpon-stamp/' });
  await waitFor(`document.querySelectorAll('.choice').length===6`);
  await click('#paper');
  await click('#next-page');
  await click('#next-page');
  await click('.choice:nth-child(2)');
  await tap(await point('#paper'));
  assert.equal(await count(), 0, 'Loading taps do not create invisible stamps');
  assert.equal(
    await evaluate(
      `document.querySelector('#paper').getAttribute('aria-busy')`,
    ),
    'true',
  );
  await evaluate(`window.releaseImages.forEach(release=>release())`);
  await waitFor(
    `document.querySelector('#paper').getAttribute('aria-busy')==='false'`,
  );
  assert.equal(await count(), 0, 'Loading taps are not replayed');
  await tap(await point('#paper'));
  assert.equal(await count(), 1);
  await click('#new');
  await delay(50);
  assert.equal(await count(), 0);
  assert.equal(
    await evaluate(
      `document.querySelector('.choice[aria-pressed="true"]').dataset.item`,
    ),
    'aquarium/sea-star',
    'New paper retains chosen item',
  );
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: gate.identifier,
  });
  report(
    'Stamp paging: 14 originals, all 8 aquarium selections, mixed art, visible selection, bidirectional looping, rapid paging, loading input and new paper PASS',
  );
  await call('Emulation.setDeviceMetricsOverride', {
    width: 400,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await visit();
  await evaluate(`document.querySelector('#next-page').focus()`);
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
  });
  assert.equal(
    await evaluate(`document.querySelector('#palette').dataset.page`),
    '2',
    'Keyboard pages forward',
  );
  assert.equal(
    await evaluate('document.activeElement.id'),
    'next-page',
    'Paging keeps button focus',
  );
  await evaluate(`document.querySelector('#previous-page').focus()`);
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
    text: ' ',
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
  });
  assert.equal(
    await evaluate(`document.querySelector('#palette').dataset.page`),
    '1',
    'Keyboard pages backward',
  );
  const p = await point('#paper', 0.3, 0.35),
    q = await point('#paper', 0.7, 0.6);
  await mouse('mousePressed', p);
  await click('#next-page');
  await mouse('mouseReleased', p);
  assert.equal(await count(), 0, 'Page change cancels pending placement');
  await click('#previous-page');
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { ...p, id: 1 },
      { ...q, id: 2 },
    ],
  });
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await count(), 2, 'Two CDP synthetic touches');
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...p, id: 3 }],
  });
  await call('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  assert.equal(await count(), 2, 'Touch cancellation');
  await mouse('mousePressed', p);
  await mouse('mouseMoved', q);
  await mouse('mouseReleased', q);
  assert.equal(await count(), 3, 'Move stamps once at release');
  await click('#new');
  await delay(50);
  await tap(p);
  await tap(q);
  await mouse('mousePressed', p);
  await mouse('mouseReleased', { x: -10, y: -10 });
  assert.equal(await count(), 2, 'Release outside cancels');
  await mouse('mousePressed', p);
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  await mouse('mouseReleased', p);
  assert.equal(await count(), 2, 'Blur cancels pending pointer');
  await mouse('mousePressed', p);
  await evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));`,
  );
  await mouse('mouseReleased', p);
  assert.equal(
    await count(),
    2,
    'Hidden retains art and cancels pending pointer',
  );
  await evaluate(`delete document.hidden`);
  assert.equal(
    await evaluate(
      `document.querySelector('#paper').getAnimations({subtree:true}).length`,
    ),
    0,
  );
  await tap(p);
  assert.equal(await count(), 3, 'Resumes');
  await mouse('mousePressed', await point('#paper'));
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(100);
  await mouse('mouseReleased', await point('#paper'));
  assert.equal(await count(), 3, 'Resize cancels pending input below cap');
  await click('#new');
  assert.equal(await count(), 0, 'New paper immediately clears artwork');
  assert.equal(
    await evaluate(`document.querySelector('dialog')`),
    null,
    'No confirmation dialog',
  );
  assert.equal(
    await evaluate(
      `document.querySelectorAll('.charge,.stamp-particle').length`,
    ),
    0,
    'New paper clears transient effects',
  );
  await evaluate(`document.querySelector('#paper').focus()`);
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'ArrowRight',
    code: 'ArrowRight',
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'ArrowRight',
    code: 'ArrowRight',
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: ' ',
    code: 'Space',
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: ' ',
    code: 'Space',
    autoRepeat: true,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: ' ',
    code: 'Space',
  });
  assert.equal(await count(), 1, 'Keyboard repeat creates only once');
  await click('#paper');
  assert.equal(await count(), 2, 'Assistive activation');
  report(
    'Stamp: CDP synthetic two-finger touch, cancel, moved/outside release, blur/hidden, resume, immediate new paper, keyboard and assistive click PASS',
  );
  await evaluate(
    `for(let i=0;i<58;i++)document.querySelector('#paper').click()`,
  );
  assert.equal(await count(), 60);
  assert.ok(
    await evaluate(`document.querySelector('#full').hidden`),
    'Reaching the limit alone does not show a notice',
  );
  await evaluate(
    `for(let i=0;i<200;i++)document.querySelector('#paper').click()`,
  );
  assert.equal(await count(), 60, 'Bounded at 60');
  const original = await evaluate(
    `document.querySelector('#stamps').innerHTML`,
  );
  await click('#paper');
  assert.equal(
    await evaluate(`document.querySelector('#stamps').innerHTML`),
    original,
    'At cap artwork unchanged',
  );
  assert.ok(await evaluate(`!document.querySelector('#full').hidden`));
  await tap(await point('#paper'));
  assert.equal(await count(), 60, 'At cap taps preserve all artwork');
  await delay(3700);
  assert.ok(
    await evaluate(`document.querySelector('#full').hidden`),
    'Notice disappears automatically',
  );
  assert.equal(
    await evaluate(
      `document.querySelector('#paper').getAnimations({subtree:true}).length`,
    ),
    0,
    'Idle animations end',
  );
  for (const [width, height] of [
    [320, 568],
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
    await delay(100);
    await tap(await point('#paper'));
    await delay(450);
    assert.ok(
      await evaluate(`(() => {
      const f=document.querySelector('#full'), a=document.querySelector('#full-arrow'), n=document.querySelector('#new');
      const r=f.getBoundingClientRect(), ar=a.getBoundingClientRect(), nr=n.getBoundingClientRect();
      return !f.hidden && [...f.querySelectorAll('span')].map(s=>s.textContent).join('')==='かみがいっぱい！あたらしいかみにしてね！' &&
        r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight &&
        Math.abs(ar.left+ar.width/2-(nr.left+nr.width/2))<12 &&
        a.getAnimations().length>0 && n.getAnimations().length>0 &&
        n.contains(document.elementFromPoint(nr.x+nr.width/2,nr.y+nr.height/2));
    })()`),
      'Notice fits screen, animated arrow points at usable new-paper button',
    );
    await shot(`stamp-full-notice-${width}`, false);
  }
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await tap(await point('#paper'));
  assert.ok(
    await evaluate(
      `!document.querySelector('#full').hidden && ['#full','#full-arrow','#new'].every(s=>document.querySelector(s).getAnimations().length===0)`,
    ),
    'Reduced motion shows the notice and arrow without animation',
  );
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  assert.ok(
    await evaluate(`document.querySelector('#full').hidden`),
    'Blur dismisses notice',
  );
  await call('Emulation.setEmulatedMedia', { features: [] });
  const rafBefore = await evaluate('window.rafCalls');
  await delay(300);
  assert.equal(await evaluate('window.rafCalls'), rafBefore, 'No idle RAF');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(150);
  assert.equal(await count(), 60, 'Resize keeps artwork');
  await shot('stamp-full-390');
  await mouse('mousePressed', await point('#paper'));
  await call('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(100);
  await mouse('mouseReleased', await point('#paper'));
  assert.equal(await count(), 60);
  await click('#new');
  await delay(50);
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await tap(await point('#paper'));
  assert.equal(await count(), 1);
  assert.equal(
    await evaluate(
      `document.querySelector('#stamps').getAnimations({subtree:true}).length`,
    ),
    0,
    'Reduced motion has no bounce',
  );
  await shot('stamp-reduced-844');
  await evaluate(`window.dispatchEvent(new Event('pagehide'))`);
  assert.equal(await count(), 0);
  await click('#previous-page');
  assert.equal(
    await evaluate(`document.querySelector('#palette').dataset.page`),
    '3',
  );
  await click('#back');
  await waitFor(`document.querySelectorAll('.game-card').length===9`);
  assert.equal(
    await evaluate(`document.querySelectorAll('.game-card').length`),
    9,
  );
  assert.ok(
    await evaluate(
      `!!document.querySelector('a[href="https://anipopina.com/"]')`,
    ),
  );
  await click('a[href="ponpon-stamp/"]');
  await waitFor(
    `document.readyState==='complete' && document.querySelectorAll('.choice').length===6`,
  );
  assert.equal(await count(), 0);
  assert.equal(
    await evaluate(`document.querySelector('#palette').dataset.page`),
    '1',
    'Fresh entry returns to first page',
  );
  assert.ok(
    await evaluate(
      `!document.querySelector('a[href="https://anipopina.com/"]')`,
    ),
  );
  // Native Web Audio instrumentation and a Vibration API spy: no hardware claim.
  const feedbackProbe = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.feedbackProbe={contexts:[],active:0,max:0,gains:[],pulses:[]};const NativeAudio=AudioContext;window.AudioContext=class extends NativeAudio{constructor(...args){super(...args);feedbackProbe.contexts.push(this);const osc=this.createOscillator.bind(this);this.createOscillator=()=>{const n=osc();const start=n.start.bind(n);n.start=(...a)=>{feedbackProbe.active++;feedbackProbe.max=Math.max(feedbackProbe.max,feedbackProbe.active);n.addEventListener('ended',()=>feedbackProbe.active--,{once:true});return start(...a)};return n};const gain=this.createGain.bind(this);this.createGain=()=>{const g=gain();const ramp=g.gain.linearRampToValueAtTime.bind(g.gain);g.gain.linearRampToValueAtTime=(v,t)=>{feedbackProbe.gains.push(v);return ramp(v,t)};return g}}};Object.defineProperty(navigator,'vibrate',{configurable:true,value:(value)=>{feedbackProbe.pulses.push({value,time:performance.now()});return true}});`,
  });
  await call('Emulation.setEmulatedMedia', { features: [] });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await visit();
  assert.equal(
    await evaluate('feedbackProbe.contexts.length'),
    0,
    'No audio context before interaction',
  );
  await click('#paper');
  assert.equal(
    await evaluate('feedbackProbe.contexts.length'),
    0,
    'Programmatic activation without user gesture is silent',
  );
  await tap(await point('#paper', 0.45, 0.4));
  await waitFor('feedbackProbe.max>0');
  assert.ok(
    await evaluate(`document.querySelectorAll('.stamp-particle').length>0`),
  );
  await shot('stamp-feedback-390');
  for (let i = 0; i < 12; i++) await tap(await point('#paper', 0.55, 0.6));
  assert.ok(
    await evaluate(`document.querySelectorAll('.stamp-particle').length<=72`),
  );
  assert.ok(
    await evaluate(
      'feedbackProbe.max<=3 && feedbackProbe.gains.every(g=>g<=0.075)',
    ),
    'Bounded native audio gain and voices',
  );
  assert.ok(
    await evaluate(
      `feedbackProbe.pulses.filter(p=>p.value>0).every((p,i,a)=>p.value===12&&(i===0||p.time-a[i-1].time>=159))`,
    ),
    'Short rate-limited vibration requests',
  );
  // Legacy preferences and storage events must no longer disable feedback.
  await evaluate(
    `localStorage.setItem('omochabox-play-settings-v1',JSON.stringify({sound:false,vibration:false}));window.dispatchEvent(new StorageEvent('storage',{key:'omochabox-play-settings-v1'}))`,
  );
  await visit();
  assert.equal(await evaluate('feedbackProbe.contexts.length'), 0);
  await tap(await point('#paper'));
  await waitFor('feedbackProbe.max>0');
  assert.ok(
    await evaluate('feedbackProbe.pulses.some(p=>p.value===12)'),
    'Saved OFF preferences are ignored',
  );
  await evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))`,
  );
  await delay(80);
  assert.equal(
    await evaluate(`document.querySelectorAll('.stamp-particle').length`),
    0,
  );
  assert.equal(await evaluate('feedbackProbe.contexts[0].state'), 'suspended');
  await evaluate('delete document.hidden');
  await tap(await point('#paper'));
  await waitFor('feedbackProbe.active>0');
  await delay(850);
  assert.equal(await evaluate('feedbackProbe.active'), 0);
  assert.equal(
    await evaluate(`document.querySelectorAll('.stamp-particle').length`),
    0,
  );
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await tap(await point('#paper'));
  assert.ok(
    await evaluate(`document.querySelectorAll('.stamp-particle').length<=4`),
  );
  await delay(220);
  assert.equal(
    await evaluate(`document.querySelectorAll('.stamp-particle').length`),
    0,
  );
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: feedbackProbe.identifier,
  });
  const noVibration = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `Object.defineProperty(navigator,'vibrate',{value:undefined,configurable:true})`,
  });
  await visit();
  assert.equal(
    await evaluate(
      `document.querySelectorAll('#sound,#vibration,.feedback-controls').length`,
    ),
    0,
    'No settings UI on game',
  );
  await tap(await point('#paper'));
  assert.equal(await count(), 1, 'Unsupported vibration still stamps');
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: noVibration.identifier,
  });
  report(
    'Feedback: native AudioContext starts only after user input, <=3 sine voices / 0.075 gain, legacy OFF preferences ignored, background suspend/resume; <=72 particles and expiry, reduced <=4; Vibration API spy 12ms / >=160ms and unsupported fallback PASS (no physical audio/haptic verification)',
  );
  await click('#back');
  await waitFor(`document.querySelectorAll('.game-card').length===9`);
  assert.equal(
    await evaluate(
      `document.querySelector('.play-settings,#sound-setting,#vibration-setting')`,
    ),
    null,
    'Hub has no settings panel or buttons',
  );
  await shot('stamp-hub-390', false);
  const drawingProbe = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.contextsCreated=0;const NativeAudio=AudioContext;window.AudioContext=class extends NativeAudio{constructor(...args){super(...args);window.contextsCreated++}}`,
  });
  await click('a[href="hikari-no-oekaki/"]');
  await waitFor(
    `document.readyState==='complete'&&!!document.querySelector('canvas')`,
  );
  assert.equal(
    await evaluate('contextsCreated'),
    0,
    'Drawing waits for user input',
  );
  await tap(await point('canvas'));
  assert.equal(
    await evaluate('contextsCreated'),
    1,
    'Drawing ignores saved OFF preferences',
  );
  await click('#back');
  await waitFor(`document.querySelectorAll('.game-card').length===9`);
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: drawingProbe.identifier,
  });
  const blockedStorage = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `Storage.prototype.getItem=Storage.prototype.setItem=()=>{throw new DOMException('blocked','SecurityError')}`,
  });
  await call('Page.reload');
  await waitFor(`document.querySelectorAll('.game-card').length===9`);
  await click('a[href="ponpon-stamp/"]');
  await waitFor(`document.querySelectorAll('.choice').length===6`);
  await evaluate(`Promise.all([...document.images].map(i=>i.decode()))`);
  await tap(await point('#paper'));
  assert.equal(await count(), 1, 'Blocked storage still plays');
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: blockedStorage.identifier,
  });
  report(
    'Feedback always enabled: no hub controls, legacy saved OFF ignored by stamp and drawing, blocked storage still plays PASS',
  );
  if (process.env.STAMP_EXPECT_BOUNDARIES)
    report(
      'General catalogue PASS: 2/5/7-item sets become 6/6/2-item pages; first and second pages cross set boundaries; all six viewports and full stamp regressions pass',
    );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Stamp: 200 placements / 60 cap, no automatic deletion, new paper recovery, idle animations/RAF stop, resize, reduced motion, pagehide/re-entry, hub/footer, no JS errors PASS',
  );
  await writeFile(join(output, 'stamp-results.txt'), reports.join('\n') + '\n');
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
