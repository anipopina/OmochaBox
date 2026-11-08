import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Friend, friends } from '../src/mogumogu-tomodachi/model.ts';
import { createStaticServer } from './static-server.mjs';
const assetValidation = JSON.parse(
  await readFile(
    new URL(
      '../source-assets/mogumogu-tomodachi/friends-v2/validation.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
for (const kind of ['bear', 'ghost']) {
  const bytes = await readFile(
    new URL(
      `../src/mogumogu-tomodachi/assets/${kind}-body.webp`,
      import.meta.url,
    ),
  );
  const expected =
    kind === 'bear'
      ? JSON.parse(
          await readFile(
            new URL(
              '../source-assets/mogumogu-tomodachi/bear-v3/validation.json',
              import.meta.url,
            ),
            'utf8',
          ),
        )
      : assetValidation[kind];
  assert.equal(bytes.length, expected.bytes);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    expected.sha256,
  );
}
const advance = (model, phase) => {
  for (let i = 0; i < 200 && model.phase !== phase; i++) model.step(80);
  assert.equal(model.phase, phase);
};
for (const random of [0, 0.49, 0.99]) {
  const model = new Friend(() => random);
  assert.equal(model.character, Math.floor(random * 3));
  for (let round = 0; round < 9; round++) {
    const previous = model.character;
    model.offer('strawberry');
    for (let i = 0; i < 10000; i++) model.offer(i % 2 ? 'carrot' : 'banana');
    assert.equal(model.food, 'strawberry');
    assert.equal(
      model.available.size,
      3,
      'Busy taps do not consume other food',
    );
    for (let i = 0; i < 160; i++) model.step(80);
    assert.deepEqual([...model.available], ['banana', 'carrot']);
    model.offer('carrot');
    advance(model, 'idle');
    assert.equal(model.phase, 'idle');
    model.offer('banana');
    advance(model, 'changing');
    assert.equal(model.available.size, 0);
    if (round % 2) model.reset();
    else advance(model, 'idle');
    assert.equal(model.character, (previous + 1) % 3);
    assert.equal(model.available.size, 3);
  }
}
for (const phase of [
  'offering',
  'chewing',
  'swallowing',
  'happy',
  'changing',
]) {
  const model = new Friend();
  if (phase === 'changing') {
    for (const food of ['banana', 'carrot']) {
      model.offer(food);
      advance(model, 'idle');
    }
  }
  model.offer('strawberry');
  advance(model, phase);
  model.offer('carrot');
  const before = [model.phase, model.elapsed, model.food, model.meals];
  for (let i = 0; i < 10000; i++) model.touch();
  assert.deepEqual(
    [model.phase, model.elapsed, model.food, model.meals],
    before,
  );
  model.reset();
  assert.equal(model.phase, 'idle');
  assert.equal(model.touchRemaining, 0);
  assert.equal(model.available.has('strawberry'), phase !== 'happy');
}
console.log(
  'Mogu model PASS: inventory, no reservation or automatic feeding, interruptions, 27 fixed-order handovers, random first friend',
);
const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'mogu-browser-'));
const output = join(root, 'test-results');
await mkdir(output, { recursive: true });
let imagePolicy = 'normal';
const releaseImages = [];
const server = createStaticServer(
  join(root, 'dist'),
  async (request, response, path) => {
    if (!/\/(?:body|bear-body|ghost-body)-[^/]+\.webp$/.test(path))
      return false;
    if (imagePolicy === 'hold-all')
      await new Promise((resolve) => releaseImages.push(resolve));
    if (
      imagePolicy === 'fail-all' ||
      (imagePolicy === 'fail-ghost' && path.includes('/ghost-body-'))
    ) {
      response.writeHead(503).end('Injected image failure');
      return true;
    }
    return false;
  },
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
    source: `window.lastPointerId=0;document.addEventListener('pointerdown',e=>window.lastPointerId=e.pointerId);window.rafCalls=0;const raf=requestAnimationFrame;window.requestAnimationFrame=(f)=>raf(t=>{window.rafCalls++;f(t)});`,
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
  const visit = async (path = '/mogumogu-tomodachi/') => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + path });
    await waitFor(
      `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete'`,
    );
    await waitFor(
      path === '/'
        ? "document.querySelectorAll('.game-card').length===19"
        : "document.querySelector('#friend')?.dataset.ready === 'true'",
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
  const phase = () =>
    evaluate("document.querySelector('#friend').dataset.phase");
  const choose = async (food) =>
    evaluate(
      `document.querySelector('#foods button[data-food="${food}"]').click()`,
    );
  const touchFood = async (food) => {
    const p = await evaluate(
      `(()=>{const r=document.querySelector('#foods button[data-food="${food}"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
    await call('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...p, id: 1 }],
    });
    await call('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  };
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true });
  await visit('/');
  await evaluate(
    `document.querySelector('a[href="mogumogu-tomodachi/"]').click()`,
  );
  await waitFor(`document.querySelector('#friend')?.dataset.ready==='true'`);
  await waitFor(
    `[...document.images].every(i=>i.id==='flying-food'||(i.complete&&i.naturalWidth>0))`,
  );
  await shot('mogu-idle-mobile');
  const checkTouchAnchor = async (label) => {
    await evaluate(`(() => {
      const image = document.querySelector('.body-art');
      const face = document.querySelector('.face');
      const sample = () => {
        const r = image.getBoundingClientRect();
        const m = face.getScreenCTM();
        const svgBottom = new DOMPoint(250, 250).matrixTransform(m);
        return {x:r.x+r.width/2, y:r.y+r.height/2, width:r.width, height:r.height,
          svgX:svgBottom.x, svgY:svgBottom.y};
      };
      window.anchorSamples = [sample()];
      window.anchorDone = false;
      document.querySelector('#friend').click();
      const start = performance.now();
      const capture = () => {
        window.anchorSamples.push(sample());
        if (performance.now()-start < 700) requestAnimationFrame(capture);
        else window.anchorDone = true;
      };
      requestAnimationFrame(capture);
    })()`);
    await delay(240);
    await shot(`mogu-anchor-${label}-squeezed`);
    await waitFor('window.anchorDone');
    const samples = await evaluate('window.anchorSamples');
    const first = samples[0];
    const metrics = {
      label,
      samples,
      maxXDrift: Math.max(...samples.map((s) => Math.abs(s.x - first.x))),
      maxYDrift: Math.max(...samples.map((s) => Math.abs(s.y - first.y))),
      maxFaceDrift: Math.max(
        ...samples.map((s) => Math.hypot(s.svgX - s.x, s.svgY - s.y)),
      ),
      minHeightRatio: Math.min(...samples.map((s) => s.height / first.height)),
    };
    await writeFile(
      join(output, `mogu-anchor-${label}.json`),
      JSON.stringify(metrics, null, 2),
    );
    console.log(
      'Touch anchor',
      label,
      JSON.stringify({ ...metrics, samples: undefined }),
    );
    assert.ok(metrics.minHeightRatio < 0.95, 'Body visibly shrinks');
    assert.ok(
      metrics.maxYDrift < 60,
      'Touch motion stays near its resting position',
    );
    assert.ok(
      metrics.maxFaceDrift < 0.1,
      'SVG viewBox stays aligned with body image',
    );
  };
  await checkTouchAnchor('mobile');

  assert.ok(
    await evaluate(
      `[...document.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
    ),
  );
  const touchFriend = async () => {
    const p = await evaluate(
      `(()=>{const r=document.querySelector('#friend').getBoundingClientRect();return {x:r.x+r.width*0.3,y:r.y+r.height*0.6}})()`,
    );
    await call('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...p, id: 1 }],
    });
    await call('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  };
  await touchFriend();
  assert.equal(await phase(), 'idle');
  assert.equal(
    await evaluate(`document.querySelector('#friend').dataset.touched`),
    'true',
  );
  await delay(180);
  assert.notEqual(
    await evaluate(`document.querySelector('.friend-art').style.scale`),
    '1 1',
  );
  await shot('mogu-touch-idle-mobile');
  const departure = await evaluate(`(() => {
    const button=document.querySelector('#foods [data-food="banana"]');
    const rect=button.querySelector('img').getBoundingClientRect();
    button.click();
    const flight=document.querySelector('#flying-food').getBoundingClientRect();
    return {visibility:getComputedStyle(button.querySelector('img')).visibility,
      visible:!document.querySelector('#flying-food').hidden,
      drift:Math.max(Math.abs(rect.x-flight.x),Math.abs(rect.y-flight.y),Math.abs(rect.width-flight.width))};
  })()`);
  assert.equal(departure.visibility, 'hidden');
  assert.equal(departure.visible, true);
  assert.ok(departure.drift < 1, JSON.stringify(departure));
  await shot('mogu-food-departure');
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('#foods [data-food="banana"] img')).visibility`,
    ),
    'visible',
  );
  await choose('banana');
  assert.equal(await phase(), 'offering');
  assert.equal(
    await evaluate(`document.querySelector('.friend-art').style.scale`),
    '1',
  );
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  for (const state of ['offering', 'chewing', 'swallowing', 'happy']) {
    await visit();
    await choose('strawberry');
    await waitFor(
      `document.querySelector('#friend').dataset.phase==='${state}'`,
    );
    await choose('carrot');
    await evaluate(
      `for(let i=0;i<100;i++)document.querySelector('#friend').click()`,
    );
    assert.equal(await phase(), state);
    assert.equal(
      await evaluate(`document.querySelectorAll('button.next').length`),
      0,
    );
    assert.equal(
      await evaluate(
        `getComputedStyle(document.querySelector('.eyes-happy')).opacity`,
      ),
      '1',
    );
    assert.equal(
      await evaluate(`document.querySelector('.friend-art').style.scale`),
      '1',
    );
    if (state === 'chewing') {
      assert.equal(
        await evaluate(
          `getComputedStyle(document.querySelector('.mouth-closed')).opacity`,
        ),
        '1',
      );
      await shot('mogu-touch-chewing-mobile');
    }
    await waitFor(`document.querySelector('#friend').dataset.phase==='idle'`);
    await delay(150);
    assert.equal(await phase(), 'idle');
    assert.equal(
      await evaluate(`document.querySelector('#friend').dataset.food`),
      'strawberry',
    );
    assert.equal(
      await evaluate(
        `getComputedStyle(document.querySelector('#foods [data-food="carrot"] img')).visibility`,
      ),
      'visible',
    );
    assert.equal(
      await evaluate(`document.querySelector('#friend').dataset.touched`),
      'false',
    );
  }
  for (const event of ['blur', 'pagehide', 'resize']) {
    await touchFriend();
    await evaluate(`window.dispatchEvent(new Event('${event}'))`);
    assert.equal(
      await evaluate(`document.querySelector('#friend').dataset.touched`),
      'false',
    );
  }
  await touchFriend();
  await evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;`,
  );
  assert.equal(
    await evaluate(`document.querySelector('#friend').dataset.touched`),
    'false',
  );
  await visit();
  const firstFriend = await evaluate(
    `document.querySelector('#friend').dataset.character`,
  );
  for (const food of ['strawberry', 'banana', 'carrot']) {
    await touchFood(food);
    await waitFor(
      `document.querySelector('#friend').dataset.phase==='offering'`,
    );
    // Model time advances on RAF and caps long deltas. A 510ms host sleep
    // can finish before the mouth transition when Chromium drops frames.
    await waitFor(
      `document.querySelector('#friend').dataset.phase==='offering' && document.querySelector('#flying-food').hidden`,
    );
    await shot(`mogu-${food}-mouth`);
    await waitFor(
      `document.querySelector('#friend').dataset.phase==='chewing'`,
    );
    assert.equal(
      await evaluate(
        `getComputedStyle(document.querySelector('.mouth-open')).opacity`,
      ),
      '0',
    );
    assert.equal(
      await evaluate(
        `getComputedStyle(document.querySelector('.mouth-closed')).opacity`,
      ),
      '1',
    );
    await shot(`mogu-${food}-chewing`);
    await waitFor(`document.querySelector('#friend').dataset.phase==='happy'`);
    await shot(`mogu-${food}-happy`);
    await waitFor(`document.querySelector('#friend').dataset.phase==='idle'`);
  }
  assert.notEqual(
    await evaluate(`document.querySelector('#friend').dataset.character`),
    firstFriend,
  );
  assert.equal(
    await evaluate(
      `document.querySelectorAll('#foods [data-eaten="false"]').length`,
    ),
    3,
  );
  await choose('strawberry');
  await evaluate(
    `for(let i=0;i<100;i++)document.querySelector('#foods button[data-food="banana"]').click();document.querySelector('#foods button[data-food="carrot"]').click()`,
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('button.next').length`),
    0,
  );
  assert.equal(
    await evaluate(`document.querySelector('#friend').dataset.food`),
    'strawberry',
  );
  assert.ok(
    await evaluate(`document.getAnimations().length<=3`),
    'Repeated input animations bounded',
  );
  assert.ok(
    await evaluate(
      `document.querySelector('#foods [data-food="carrot"]').getAnimations().length>0`,
    ),
    'Busy food visibly bounces',
  );
  await shot('mogu-busy-food-bounce');
  await waitFor(`document.querySelector('#friend').dataset.phase==='idle'`);
  assert.equal(
    await evaluate(`document.querySelectorAll('button.next').length`),
    0,
  );
  for (const state of ['offering', 'chewing', 'swallowing', 'happy']) {
    await visit();
    await choose('banana');
    await waitFor(
      `document.querySelector('#friend').dataset.phase==='${state}'`,
    );
    await evaluate(`window.dispatchEvent(new Event('blur'))`);
    assert.equal(await phase(), 'idle');
    assert.equal(
      await evaluate(
        `getComputedStyle(document.querySelector('#foods [data-food="banana"] img')).visibility`,
      ),
      state === 'happy' ? 'hidden' : 'visible',
    );
    assert.equal(
      await evaluate(`document.querySelector('#flying-food').hidden`),
      true,
    );
  }
  await visit();
  await choose('carrot');
  await evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;`,
  );
  assert.equal(await phase(), 'idle');
  await choose('banana');
  await evaluate(
    `window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'))`,
  );
  assert.equal(await phase(), 'idle');
  await choose('strawberry');
  for (const [width, height] of [
    [844, 390],
    [320, 568],
    [768, 1024],
    [1280, 800],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 900,
    });
    await delay(100);
    assert.equal(await phase(), 'idle');
    assert.ok(
      await evaluate(
        `[...document.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
      ),
    );
    await shot(`mogu-${width}x${height}`);
    await checkTouchAnchor(`${width}x${height}`);
  }
  await evaluate(
    `document.querySelector('#foods button[data-food="banana"]').focus()`,
  );
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    text: '\r',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  assert.equal(await phase(), 'offering');
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await waitFor(
    `matchMedia('(prefers-reduced-motion: reduce)').matches && document.querySelector('#friend').dataset.phase==='idle'`,
  );
  for (const [key, code, vk] of [
    ['Enter', 'Enter', 13],
    [' ', 'Space', 32],
  ]) {
    await evaluate(`document.querySelector('#friend').focus()`);
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: vk,
      text: key === 'Enter' ? '\r' : ' ',
    });
    await call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: vk,
    });
    assert.equal(
      await evaluate(`document.querySelector('#friend').dataset.touched`),
      'true',
    );
    assert.equal(
      await evaluate(`document.querySelector('.friend-art').style.scale`),
      '1',
    );
    await shot('mogu-touch-reduced-keyboard');
    await waitFor(
      `document.querySelector('#friend').dataset.touched==='false'`,
    );
  }
  await choose('carrot');
  await waitFor(`document.querySelector('#friend').dataset.phase==='happy'`);
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('#friend')).animationName`,
    ),
    'none',
  );
  await waitFor(`document.querySelector('#friend').dataset.phase==='idle'`);
  const frames = await evaluate('window.rafCalls');
  await delay(200);
  assert.equal(await evaluate('window.rafCalls'), frames, 'Idle RAF stops');
  await choose('banana');
  await evaluate(`document.querySelector('#back').click()`);
  await waitFor(`document.querySelectorAll('.game-card').length===19`);
  await evaluate(
    `document.querySelector('a[href="mogumogu-tomodachi/"]').click()`,
  );
  await waitFor(`document.querySelector('#friend')?.dataset.ready==='true'`);
  assert.equal(await phase(), 'idle');
  // Use browser-only deterministic seeds to exercise every real body asset.
  for (const [seed, kind] of [
    [0, 'monster'],
    [0.4, 'bear'],
    [0.8, 'ghost'],
  ]) {
    const script = await call('Page.addScriptToEvaluateOnNewDocument', {
      source: `Math.random = () => ${seed};`,
    });
    for (const [width, height] of [
      [390, 844],
      [320, 568],
      [844, 390],
      [768, 1024],
      [1280, 800],
      [1920, 1080],
    ]) {
      await call('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 900,
      });
      await visit();
      await waitFor(
        `document.querySelector('.body-art').complete && document.querySelector('.body-art').naturalWidth === 768`,
      );
      assert.equal(
        await evaluate(`document.querySelector('#friend').dataset.character`),
        kind,
      );
      assert.ok(
        await evaluate(
          `[...document.querySelectorAll('button')].every(b => {const r=b.getBoundingClientRect();return r.width>=56 && r.height>=56 && r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight})`,
        ),
      );
      if (width >= 1280)
        assert.ok(
          (await evaluate(
            `document.querySelector('#foods button').getBoundingClientRect().width`,
          )) > 180,
        );
      await shot(`mogu-${kind}-${width}x${height}`);
    }
    for (const food of ['strawberry', 'banana', 'carrot']) {
      await choose(food);
      await waitFor(
        `document.querySelector('#friend').dataset.phase==='offering' && document.querySelector('#flying-food').hidden`,
      );
      if (food === 'strawberry') await shot(`mogu-${kind}-mouth`);
      if (kind === 'bear') {
        await shot(`mogu-bear-${food}-mouth`);
        await waitFor(
          `document.querySelector('#friend').dataset.phase==='chewing'`,
        );
        await shot(`mogu-bear-${food}-chewing`);
      }
      await waitFor(
        `document.querySelector('#friend').dataset.phase==='happy'`,
      );
      if (kind === 'bear') await shot(`mogu-bear-${food}-happy`);
      assert.equal(
        await evaluate(
          `document.querySelector('#foods [data-food="${food}"]').dataset.eaten`,
        ),
        'true',
      );
      if (food === 'carrot') {
        if (kind === 'bear')
          await waitFor(
            `document.querySelector('#friend').dataset.phase==='changing'`,
          );
        if (kind === 'ghost')
          await evaluate(
            `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;`,
          );
        else
          await evaluate(
            `window.dispatchEvent(new Event('${kind === 'bear' ? 'resize' : 'blur'}'))`,
          );
      }
      await waitFor(`document.querySelector('#friend').dataset.phase==='idle'`);
    }
    assert.equal(
      await evaluate(`document.querySelector('#friend').dataset.character`),
      friends[(friends.indexOf(kind) + 1) % 3],
    );
    assert.equal(
      await evaluate(
        `document.querySelectorAll('#foods [data-eaten="false"]').length`,
      ),
      3,
    );
    await call('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: script.identifier,
    });
  }
  await call('Network.enable');
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  const syncScript = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `Math.random=()=>0; window.syncFailures=[];
      const check=()=>{
        const friend=document.querySelector('#friend'), image=document.querySelector('.body-art');
        if(friend && getComputedStyle(document.querySelector('.friend-art')).visibility!=='hidden') {
          const kind=friend.dataset.character;
          const expected={monster:'/body-',ghost:'/ghost-body-',bear:'/bear-body-'}[kind];
          const label={monster:'かいじゅう',ghost:'おばけ',bear:'くま'}[kind];
          if(!image.complete || image.naturalWidth!==768 || !image.src.includes(expected) || !friend.getAttribute('aria-label').startsWith(label)) window.syncFailures.push({kind,src:image.src});
        }
        requestAnimationFrame(check);
      }; requestAnimationFrame(check);`,
  });
  // Initial entry and re-entry with all body network responses held back.
  for (let round = 0; round < 2; round++) {
    await call('Network.clearBrowserCache');
    imagePolicy = 'hold-all';
    await call('Page.navigate', { url: origin + '/mogumogu-tomodachi/' });
    await waitFor(
      `document.querySelector('#friend')?.dataset.artState==='loading'`,
    );
    await delay(200);
    assert.equal(
      await evaluate(
        `getComputedStyle(document.querySelector('.friend-art')).visibility`,
      ),
      'hidden',
    );
    await choose('strawberry');
    assert.equal(await phase(), 'idle');
    await shot(`mogu-loading-entry-${round}`);
    imagePolicy = 'normal';
    releaseImages.splice(0).forEach((release) => release());
    await waitFor(
      `document.querySelector('#friend')?.dataset.artState==='ready'`,
    );
    assert.deepEqual(await evaluate('window.syncFailures'), []);
    await evaluate(`document.querySelector('#back').click()`);
    await waitFor(`document.querySelectorAll('.game-card').length===19`);
  }
  // A decoded network image is still not presentable until decode() resolves.
  const delayedDecode = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `const decode=HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode=function(){return decode.call(this).then(()=>this.src.includes('/bear-body-')?new Promise(resolve=>{window.releaseBodyDecode=resolve}):undefined)};`,
  });
  await visit();
  await waitFor(`typeof window.releaseBodyDecode==='function'`);
  for (const food of ['strawberry', 'banana', 'carrot']) {
    await choose(food);
    await waitFor(`document.querySelector('#friend').dataset.phase==='happy'`);
    await waitFor(`document.querySelector('#friend').dataset.phase==='idle'`);
  }
  assert.equal(
    await evaluate(`document.querySelector('#friend').dataset.artState`),
    'loading',
  );
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.friend-art')).visibility`,
    ),
    'hidden',
  );
  assert.notEqual(
    await evaluate(
      `document.querySelector('#friend').getAttribute('aria-label')`,
    ),
    'くまに ふれる',
  );
  await shot('mogu-delayed-handover');
  await evaluate('window.releaseBodyDecode()');
  await waitFor(
    `document.querySelector('#friend').dataset.artState==='ready' && document.querySelector('#friend').dataset.character==='bear'`,
  );
  assert.deepEqual(await evaluate('window.syncFailures'), []);
  await shot('mogu-decoded-handover');
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: delayedDecode.identifier,
  });
  // Failure of the initially selected body falls back to a decoded friend.
  const ghostSeed = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: 'Math.random=()=>.8;',
  });
  imagePolicy = 'fail-ghost';
  await call('Network.clearBrowserCache');
  await visit();
  assert.notEqual(
    await evaluate(`document.querySelector('#friend').dataset.character`),
    'ghost',
  );
  await choose('banana');
  assert.equal(await phase(), 'offering');
  assert.deepEqual(await evaluate('window.syncFailures'), []);
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: ghostSeed.identifier,
  });
  // All assets failing exposes an operable retry instead of a floating face.
  imagePolicy = 'fail-all';
  await call('Network.clearBrowserCache');
  await call('Page.navigate', { url: origin + '/mogumogu-tomodachi/' });
  await waitFor(
    `document.querySelector('#friend')?.dataset.artState==='error'`,
  );
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.friend-art')).visibility`,
    ),
    'hidden',
  );
  await shot('mogu-image-retry');
  imagePolicy = 'normal';
  await evaluate(`document.querySelector('#friend').click()`);
  await waitFor(`document.querySelector('#friend').dataset.artState==='ready'`);
  await choose('carrot');
  assert.equal(await phase(), 'offering');
  assert.deepEqual(await evaluate('window.syncFailures'), []);
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: syncScript.identifier,
  });
  report(
    'Mogu image sync PASS: delayed network first entry/re-entry, delayed decode handover, synchronized body/face/label, failed selected image fallback, all-image HTTP503 retry and resumed feeding; frame-by-frame DOM invariant',
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Mogu PASS: three decoded bodies at six sizes, three complete rounds in fixed order, inventory/refill; body touch, 100 repeats per meal phase, no queued bite, immediate food acceptance, touch interruptions, Enter/Space, reduced-motion touch; real browser touch simulation, all foods, clipped mouth, closed chewing, bounded repeats, all phase interruptions, resize, reduced motion, keyboard, home/reentry, final asset loading, idle RAF, no JS errors',
  );
  await writeFile(join(output, 'mogu-results.txt'), reports.join('\n') + '\n');
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
