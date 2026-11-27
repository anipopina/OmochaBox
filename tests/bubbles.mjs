import { catalogueReady } from './catalogue.mjs';
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
    source: `window.shabonRandom=.99;Math.random=()=>window.shabonRandomSequence?.shift()??window.shabonRandom;
      const outcome=new URL(location.href).searchParams.get('tilt-permission');
      Object.defineProperty(DeviceMotionEvent,'requestPermission',{value:undefined,configurable:true});
      Object.defineProperty(DeviceOrientationEvent,'requestPermission',{configurable:true,value:outcome?async()=>{
        if(!navigator.userActivation.isActive){
          if(outcome==='already-granted')return 'granted';
          if(outcome==='already-denied')return 'denied';
          throw new DOMException('A tap is required','NotAllowedError');
        }
        window.tiltActivation=navigator.userActivation.isActive;
        window.tiltRequests=(window.tiltRequests??0)+1;
        if(outcome==='already-denied')return 'denied';
        return new Promise(resolve=>{window.finishTiltPermission=(decision=outcome)=>resolve(decision)});
      }:undefined});`,
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
        ? catalogueReady
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
    assert.equal(await count(), 2, 'Two bubbles are present on entry');
    const [small, large] = await evaluate(
      "[...document.querySelectorAll('.bubble')].map(b=>b.getBoundingClientRect().toJSON())",
    );
    assert.ok(large.width > small.width, 'The second bubble is larger');
    assert.ok(small.x < large.x && small.y > large.y, 'Diagonal layout');
    for (const bubble of [small, large]) {
      assert.ok(
        bubble.left >= 0 &&
          bubble.top >= 0 &&
          bubble.right <= width &&
          bubble.bottom <= height,
        'Initial bubbles fit inside the viewport',
      );
    }
    const separation = Math.hypot(
      large.x + large.width / 2 - (small.x + small.width / 2),
      large.y + large.height / 2 - (small.y + small.height / 2),
    );
    assert.ok(
      separation > (small.width + large.width) / 2,
      'Bubbles have a gap',
    );
    await delay(250);
    await shot(`bubbles-initial-${width}`);
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
    assert.equal(await count(), 3, 'Empty-space touch creates a bubble');
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
    assert.equal(await count(), 2);
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
    await tap(large.x + large.width / 2, large.y + large.height / 2);
    assert.ok(
      await evaluate(
        "document.querySelector('.bubble:nth-child(2)').classList.contains('popping')",
      ),
      'The large initial bubble can be popped',
    );
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
  await evaluate("document.querySelectorAll('.bubble').forEach(b=>b.click())");
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
  await waitFor(catalogueReady);
  await evaluate(
    'document.querySelector(\'a[href="pukupuku-shabon/"]\').scrollIntoView()',
  );
  await delay(100);
  await shot('bubbles-hub');
  await evaluate(
    'document.querySelector(\'a[href="pukupuku-shabon/"]\').click()',
  );
  await waitFor("document.querySelector('#field')?.dataset.ready==='true'");
  assert.equal(await count(), 2, 'Re-entry starts fresh');
  await evaluate(
    "window.AudioContext=class {constructor(){throw new Error('Unavailable')}}",
  );
  await evaluate("document.querySelector('#create').click()");
  await delay(100);
  assert.equal(await count(), 3, 'Audio unavailable does not block play');

  await call('Emulation.setEmulatedMedia', { features: [] });
  await visit();
  const active = '#characters .shabon-character:not(.leaving)';
  const sprites = () =>
    evaluate(
      `[...document.querySelectorAll('${active}')].map(e=>e.getBoundingClientRect().toJSON())`,
    );
  const makeBubble = (x, y) =>
    evaluate(
      `document.querySelector('#create').dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:${x},clientY:${y}}))`,
    );
  const popNewest = () =>
    evaluate("document.querySelector('.bubble:last-child').click()");
  const shapes = [
    'コーラルのしかく',
    'あおいまる',
    'むらさきのまる',
    'きいろいさんかく',
    'コーラルのほし',
    'ミントのながしかく',
  ];
  for (const [index, name] of shapes.entries()) {
    const x = index % 2 ? 232 : 88;
    const y = 130 + Math.floor(index / 2) * 150;
    await evaluate(`window.shabonRandomSequence=[0,${(index + 0.5) / shapes.length}];
      document.querySelector('#create').dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:${x},clientY:${y}}));`);
    const label = await evaluate(
      "document.querySelector('.bubble:last-child').getAttribute('aria-label')",
    );
    assert.equal(label, `${name}のシャボン玉をわる`);
    await waitFor(
      "document.querySelector('.bubble:last-child img')?.naturalWidth > 0",
    );
  }
  await delay(250);
  await shot('bubbles-all-characters');
  await visit();
  await evaluate('window.shabonRandom=.26');
  await tap(154, 185);
  await waitFor(
    "document.querySelector('.bubble:last-child img')?.naturalWidth > 0",
  );
  assert.equal(
    (await sprites()).length,
    0,
    'The character stays in the bubble until it pops',
  );
  const passengerSource = await evaluate(
    "document.querySelector('.bubble:last-child img').src",
  );
  await delay(250);
  await shot('bubbles-character-inside');
  const bubbleCenter = await evaluate(
    "(()=>{const r=document.querySelector('.bubble:last-child').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
  );
  await tap(bubbleCenter.x, bubbleCenter.y);
  const [released] = await sprites();
  assert.ok(released, 'The character is released immediately');
  assert.equal(
    await evaluate(`document.querySelector('${active} img').src`),
    passengerSource,
  );
  await delay(300);
  const [falling] = await sprites();
  assert.ok(
    falling.y > released.y + 20,
    'Downward gravity without sensor input',
  );
  await waitFor(
    `document.querySelector('${active}').getBoundingClientRect().bottom > 566`,
  );
  const [resting] = await sprites();

  const grabX = resting.x + resting.width / 2;
  const grabY = resting.y + resting.height / 2;
  await touch('touchStart', [{ x: grabX, y: grabY, id: 4 }]);
  await touch('touchMove', [{ x: 122, y: 256, id: 4 }]);
  await delay(320);
  const [held] = await sprites();
  assert.ok(held.y < resting.y - 150, 'Touch drag lifts the character');
  await touch('touchCancel');
  await delay(120);
  assert.ok(
    (await sprites())[0].y > held.y + 3,
    'Cancelled drag releases the character',
  );

  await evaluate(
    "window.dispatchEvent(new DeviceMotionEvent('devicemotion',{accelerationIncludingGravity:{x:9.8,y:0,z:0}}))",
  );
  await waitFor(
    `document.querySelector('${active}').getBoundingClientRect().left < 2`,
  );
  await evaluate(
    "window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{beta:0,gamma:90}))",
  );
  await waitFor(
    `document.querySelector('${active}').getBoundingClientRect().right > 317`,
  );
  await call('Emulation.setDeviceMetricsOverride', {
    width: 568,
    height: 320,
    deviceScaleFactor: 2,
    mobile: true,
    screenOrientation: { type: 'landscapePrimary', angle: 90 },
  });
  await evaluate(
    "window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{beta:-90,gamma:0}))",
  );
  await waitFor(
    `document.querySelector('${active}').getBoundingClientRect().left < 2`,
  );
  await call('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 568,
    deviceScaleFactor: 2,
    mobile: true,
    screenOrientation: { type: 'portraitPrimary', angle: 0 },
  });
  await visit();
  await evaluate('window.shabonRandom=.26');
  await makeBubble(150, 210);
  await popNewest();
  await makeBubble(168, 210);
  await popNewest();
  await delay(250);
  const [left, right] = await sprites();
  assert.ok(
    right.x - left.x > 36,
    'Overlapping spawn positions separate through collision',
  );

  const characterPoint = await evaluate(
    `(()=>{const r=document.querySelector('${active}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  );
  await makeBubble(characterPoint.x, characterPoint.y);
  assert.ok(
    await evaluate(
      `document.elementFromPoint(${characterPoint.x},${characterPoint.y}).closest('.bubble') === document.querySelector('.bubble:last-child')`,
    ),
    'Bubble input takes priority above characters',
  );
  await delay(500);
  assert.equal(
    (await sprites()).length,
    2,
    'A bubble does not release its character on contact',
  );
  await shot('bubbles-characters-released');

  await evaluate(`window.oldestCharacter=document.querySelector('${active}')`);
  for (let i = 0; i < 11; i++) {
    await makeBubble(105 + (i % 3) * 55, 125 + Math.floor(i / 3) * 65);
    await popNewest();
  }
  assert.equal(
    (await sprites()).length,
    12,
    'Active character count is capped',
  );
  assert.ok(
    await evaluate(
      "oldestCharacter.classList.contains('leaving') && getComputedStyle(oldestCharacter.firstElementChild).animationName === 'character-shrink'",
    ),
    'Oldest character shrinks first',
  );
  await waitFor('!oldestCharacter.isConnected');

  for (const outcome of ['granted', 'denied']) {
    await visit(`/pukupuku-shabon/?tilt-permission=${outcome}`);
    await waitFor("!document.querySelector('.tilt-control-button').hidden");
    assert.equal(await evaluate('window.tiltActivation'), undefined);
    const tiltButton = await evaluate(
      "document.querySelector('.tilt-control-button').getBoundingClientRect().toJSON()",
    );
    assert.ok(tiltButton.width >= 56 && tiltButton.height >= 56);
    assert.ok(tiltButton.top === 12 && tiltButton.right === 308);
    if (outcome === 'granted') await shot('bubbles-tilt-button');
    await tap(160, 480);
    assert.equal(await count(), 3, 'Play is available before permission');
    assert.equal(await evaluate('window.tiltActivation'), undefined);
    await tap(
      tiltButton.x + tiltButton.width / 2,
      tiltButton.y + tiltButton.height / 2,
    );
    assert.ok(
      await evaluate(
        "window.tiltActivation && document.querySelector('.tilt-control-button').disabled",
      ),
      'The tilt button requests permission with user activation',
    );
    await evaluate('window.finishTiltPermission()');
    await waitFor(
      outcome === 'granted'
        ? "document.querySelector('.tilt-control-button').hidden"
        : "Boolean(document.querySelector('.tilt-control-button:not([hidden]):not(:disabled)'))",
    );
    await evaluate('window.shabonRandom=.26');
    await makeBubble(160, 190);
    await popNewest();
    if (outcome === 'granted') {
      await evaluate(
        "window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{beta:0,gamma:90}))",
      );
    }
    const edge = outcome === 'granted' ? 'right > 318' : 'bottom > 566';
    await waitFor(
      `document.querySelector('${active}').getBoundingClientRect().${edge}`,
    );
    if (outcome === 'denied') {
      assert.equal(
        await evaluate(
          "document.querySelector('.tilt-control-status').textContent",
        ),
        '',
        'The first denial leaves gameplay clear',
      );
      await shot('bubbles-tilt-denied');
      await tap(
        tiltButton.x + tiltButton.width / 2,
        tiltButton.y + tiltButton.height / 2,
      );
      assert.equal(
        await evaluate('window.tiltRequests'),
        2,
        'Denial can be retried',
      );
      await evaluate("window.finishTiltPermission('granted')");
      await waitFor("document.querySelector('.tilt-control-button').hidden");
    }
  }
  for (const path of [
    '/pukupuku-shabon/',
    '/pukupuku-shabon/?tilt-permission=already-granted',
  ]) {
    await visit(path);
    assert.ok(
      await evaluate("document.querySelector('.tilt-control-button').hidden"),
      'No tilt button without a permission API or after a grant',
    );
  }
  await visit('/pukupuku-shabon/?tilt-permission=already-denied');
  await waitFor(
    "Boolean(document.querySelector('.tilt-control-button:not([hidden]):not(:disabled)'))",
  );
  const settingsHint = "document.querySelector('.tilt-control-status')";
  assert.equal(await evaluate(`${settingsHint}.textContent`), '');
  const retryButton = await evaluate(
    "document.querySelector('.tilt-control-button').getBoundingClientRect().toJSON()",
  );
  await tap(
    retryButton.x + retryButton.width / 2,
    retryButton.y + retryButton.height / 2,
  );
  await waitFor(
    `${settingsHint}.textContent === 'ブラウザの設定で傾きセンサーを許可できます'`,
  );
  await delay(250);
  await shot('bubbles-tilt-settings');
  const hint = await evaluate(
    `${settingsHint}.getBoundingClientRect().toJSON()`,
  );
  await tap(hint.x + hint.width / 2, hint.y + hint.height / 2);
  assert.equal(
    await count(),
    3,
    'Tapping through the hint still creates a bubble',
  );
  assert.equal(await evaluate(`${settingsHint}.textContent`), '');
  const debugCanvas = "document.querySelector('.shabon-shape-debug')";
  assert.equal(await evaluate(`Boolean(${debugCanvas})`), false);
  await visit('/pukupuku-shabon/?debug=shapes');
  const readDebugPixel = (x, y) =>
    `(() => {
      const canvas = ${debugCanvas};
      const pixel = canvas.getContext('2d').getImageData(
        Math.floor((${x}) * canvas.width / canvas.clientWidth),
        Math.floor((${y}) * canvas.height / canvas.clientHeight), 1, 1);
      return pixel.data[3];
    })()`;
  const debugPixel = (x, y) => evaluate(readDebugPixel(x, y));
  for (const [x, y] of [
    [8, 160],
    [312, 160],
    [160, 8],
    [160, 560],
  ]) {
    assert.ok((await debugPixel(x, y)) > 0, 'Debug view marks the inset wall');
  }
  assert.equal(await debugPixel(0, 160), 0);
  await evaluate('window.shabonRandom=.26');
  await tap(150, 170);
  assert.equal(
    await count(),
    3,
    'The debug overlay leaves touch input available',
  );
  assert.equal(
    await debugPixel(150, 170),
    0,
    'Bubbles have no collision shape',
  );
  await popNewest();
  const [debugReleased] = await sprites();
  assert.ok(
    (await debugPixel(
      debugReleased.x + debugReleased.width / 2,
      debugReleased.y + debugReleased.height / 2,
    )) > 0,
    'Debug view draws the collider when the character is released',
  );
  await waitFor(
    `document.querySelector('${active}').getBoundingClientRect().bottom > 566`,
  );
  const [debugFallen] = await sprites();
  assert.equal(
    await debugPixel(150, 170),
    0,
    'The outline follows the falling body',
  );
  assert.ok(
    (await debugPixel(
      debugFallen.x + debugFallen.width / 2,
      debugFallen.y + debugFallen.height / 2,
    )) > 0,
  );
  await waitFor(
    `${readDebugPixel(debugFallen.x + debugFallen.width / 2, 558)} > 0`,
  );
  assert.equal(await debugPixel(debugFallen.x + debugFallen.width / 2, 564), 0);
  await shot('bubbles-shape-debug');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 568,
    height: 320,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await waitFor(
    `${debugCanvas}.width === 1136 && ${debugCanvas}.height === 640`,
  );
  assert.ok((await debugPixel(8, 160)) > 0);
  report(
    'Bubbles PASS: shared character SVGs, release and fall, touch drag/cancel, collision and layer order, edge bounds, oldest-first shrink, tilt and permission fallback',
  );
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
