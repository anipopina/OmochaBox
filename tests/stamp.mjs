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
  const setFeedback = (sound, vibration) =>
    evaluate(
      `localStorage.setItem('omochabox-play-settings-v1',JSON.stringify({sound:${sound},vibration:${vibration}}));window.dispatchEvent(new StorageEvent('storage',{key:'omochabox-play-settings-v1'}))`,
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
    await visit();
    assert.ok(
      await evaluate(
        `document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight`,
      ),
      'No overflow',
    );
    assert.ok(
      await evaluate(
        `[...document.querySelectorAll('.choice,.page-arrow,#undo,#new,#back')].every(e=>{const r=e.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
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
          `[...document.querySelectorAll('.choice,.page-arrow,#undo,#new')].every(e=>{const r=e.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
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
    for (let i = 0; i < 9; i++) await click('#undo');
    assert.equal(await count(), 5, 'Undo crosses page and set boundaries');
    assert.equal(
      await evaluate(
        `document.querySelector('.stamp:last-child').dataset.item`,
      ),
      'shapes/coral-star',
    );
    for (let i = 0; i < 20; i++) await click('#next-page');
    assert.equal(await count(), 5, 'Rapid paging retains art');
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
  await click('#clear');
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
    'Stamp paging: 14 originals, all 8 aquarium selections, mixed art, common undo, visible selection, bidirectional looping, rapid paging, loading input and new paper PASS',
  );
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
  assert.equal(await count(), 2, 'Drag does not paint');
  await mouse('mousePressed', p);
  await mouse('mouseReleased', { x: 1, y: 1 });
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
  await click('#undo');
  assert.equal(await count(), 2);
  await mouse('mousePressed', await point('#paper'));
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(100);
  await mouse('mouseReleased', await point('#paper'));
  assert.equal(await count(), 2, 'Resize cancels pending input below cap');
  await click('#new');
  assert.ok(await evaluate(`document.querySelector('#confirm').open`));
  assert.equal(await count(), 2, 'New paper requires confirmation');
  await shot('stamp-confirm');
  await click('button[value="cancel"]');
  await delay(50);
  assert.equal(await count(), 2);
  await click('#new');
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await delay(50);
  assert.ok(await evaluate(`!document.querySelector('#confirm').open`));
  assert.equal(await count(), 2, 'Escape preserves paper');
  await click('#new');
  await click('#clear');
  await delay(50);
  assert.equal(await count(), 0);
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
    'Stamp: CDP synthetic two-finger touch, cancel, drag/outside release, blur/hidden, resume, undo, clear confirmation/cancel, keyboard and assistive click PASS',
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
  await click('#undo');
  assert.equal(await count(), 59);
  await tap(await point('#paper'));
  assert.equal(await count(), 60);
  await delay(850);
  assert.equal(
    await evaluate(
      `document.querySelector('#paper').getAnimations({subtree:true}).length`,
    ),
    0,
    'Idle animations end',
  );
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
  assert.ok(
    await evaluate(
      `(()=>{const p=document.querySelector('#paper').getBoundingClientRect();return [...document.querySelectorAll('.stamp')].every(e=>{const r=e.getBoundingClientRect();return r.left>=p.left&&r.top>=p.top&&r.right<=p.right&&r.bottom<=p.bottom})})()`,
    ),
    'Rotated bounds remain on paper',
  );
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
  await click('#clear');
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
  await waitFor(`document.querySelectorAll('.game-card').length===8`);
  assert.equal(
    await evaluate(`document.querySelectorAll('.game-card').length`),
    8,
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
  await setFeedback(false, false);
  await delay(100);
  assert.equal(
    await evaluate('feedbackProbe.contexts[0].state'),
    'suspended',
    'Mute suspends native audio output',
  );
  const pulseCount = await evaluate(
    'feedbackProbe.pulses.filter(p=>p.value>0).length',
  );
  await tap(await point('#paper'));
  assert.equal(await evaluate('feedbackProbe.contexts[0].state'), 'suspended');
  assert.equal(
    await evaluate('feedbackProbe.pulses.filter(p=>p.value>0).length'),
    pulseCount,
  );
  await visit();
  assert.deepEqual(
    await evaluate(
      `JSON.parse(localStorage.getItem('omochabox-play-settings-v1'))`,
    ),
    { sound: false, vibration: false },
  );
  await tap(await point('#paper'));
  assert.equal(
    await evaluate('feedbackProbe.contexts.length'),
    0,
    'Direct/reloaded entry inherits mute',
  );
  await setFeedback(true, true);
  await tap(await point('#paper'));
  await waitFor('feedbackProbe.max>0');
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
    'Feedback: native AudioContext starts only after user input, <=3 sine voices / 0.075 gain, mute and stored preferences, background suspend/resume; <=72 particles and expiry, reduced <=4; Vibration API spy 12ms / >=160ms and unsupported fallback PASS (no physical audio/haptic verification)',
  );
  // Actual hub buttons, persisted values, invalid data, and storage failures.
  await click('#back');
  await waitFor(`document.querySelectorAll('.game-card').length===8`);
  assert.ok(
    await evaluate(
      `[...document.querySelectorAll('.setting-buttons button')].every(b=>{const r=b.getBoundingClientRect();return r.width>=56&&r.height>=56})`,
    ),
  );
  await click('#sound-setting');
  await click('#vibration-setting');
  await shot('stamp-settings-hub-390', false);
  await click('a[href="ponpon-stamp/"]');
  await waitFor(`document.querySelectorAll('.choice').length===6`);
  assert.deepEqual(
    await evaluate(
      `JSON.parse(localStorage.getItem('omochabox-play-settings-v1'))`,
    ),
    { sound: false, vibration: false },
  );
  await click('#back');
  await waitFor(`document.querySelectorAll('.game-card').length===8`);
  assert.equal(
    await evaluate(
      `document.querySelector('#sound-setting').getAttribute('aria-pressed')`,
    ),
    'false',
  );
  const drawingProbe = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.contextsCreated=0;const NativeAudio=AudioContext;window.AudioContext=class extends NativeAudio{constructor(...args){super(...args);window.contextsCreated++}}`,
  });
  await click('a[href="hikari-no-oekaki/"]');
  await waitFor(
    `document.readyState==='complete'&&!!document.querySelector('canvas')`,
  );
  await tap(await point('canvas'));
  assert.equal(
    await evaluate('contextsCreated'),
    0,
    'Drawing direct entry inherits shared mute',
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('button').length`),
    0,
    'Drawing has no individual settings buttons',
  );
  await click('#back');
  await waitFor(`document.querySelectorAll('.game-card').length===8`);
  await click('#sound-setting');
  await click('a[href="hikari-no-oekaki/"]');
  await waitFor(
    `document.readyState==='complete'&&!!document.querySelector('canvas')`,
  );
  await tap(await point('canvas'));
  assert.equal(
    await evaluate('contextsCreated'),
    1,
    'Drawing enabled sound starts on next gesture',
  );
  await click('#back');
  await waitFor(`document.querySelectorAll('.game-card').length===8`);
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: drawingProbe.identifier,
  });
  await evaluate(
    `localStorage.setItem('omochabox-play-settings-v1','invalid json')`,
  );
  await call('Page.reload');
  await waitFor(`document.querySelectorAll('.game-card').length===8`);
  assert.equal(
    await evaluate(
      `document.querySelector('#sound-setting').getAttribute('aria-pressed')`,
    ),
    'true',
  );
  const blockedStorage = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `Storage.prototype.getItem=Storage.prototype.setItem=()=>{throw new DOMException('blocked','SecurityError')}`,
  });
  await call('Page.reload');
  await waitFor(`document.querySelectorAll('.game-card').length===8`);
  await click('#sound-setting');
  assert.equal(
    await evaluate(
      `document.querySelector('#sound-setting').getAttribute('aria-pressed')`,
    ),
    'false',
  );
  assert.ok(
    await evaluate(
      `document.querySelector('#settings-note').textContent.includes('ほぞんできない')`,
    ),
  );
  await click('a[href="ponpon-stamp/"]');
  await waitFor(`document.querySelectorAll('.choice').length===6`);
  await evaluate(`Promise.all([...document.images].map(i=>i.decode()))`);
  await tap(await point('#paper'));
  assert.equal(await count(), 1, 'Blocked storage still plays');
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: blockedStorage.identifier,
  });
  report(
    'Common settings: hub-only 56px buttons, browser persistence, hub/game round trip, direct/reloaded entry, storage event update, invalid JSON and blocked storage fallback PASS',
  );
  if (process.env.STAMP_EXPECT_BOUNDARIES)
    report(
      'General catalogue PASS: 2/5/7-item sets become 6/6/2-item pages; first and second pages cross set boundaries; all six viewports and full stamp regressions pass',
    );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Stamp: 200 placements / 60 cap, no automatic deletion, undo recovery, idle animations/RAF stop, resize, reduced motion, pagehide/re-entry, hub/footer, no JS errors PASS',
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
