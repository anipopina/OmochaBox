import { catalogueReady } from './catalogue.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import { Pond, MAX_RIPPLES, RIPPLE_LIFE } from '../src/mizutamari/model.ts';
import { createStaticServer } from './static-server.mjs';

const layouts = [
  [320, 568, 2],
  [390, 844, 3],
  [568, 320, 2],
  [844, 390, 3],
  [820, 1180, 5],
  [1280, 800, 6],
  [1920, 1080, 7],
];
const model = new Pond();
const leafOrder = ['green', 'teal', 'willow', 'green', 'ivy', 'teal', 'green'];
const sizeByShortSide = new Map();
for (const [width, height, count] of layouts) {
  model.resize(width, height);
  assert.deepEqual(
    model.leaves.map((leaf) => leaf.art),
    leafOrder.slice(0, count),
  );
  for (const leaf of model.leaves) {
    const margin = leaf.size * 0.72;
    assert.ok(leaf.x >= margin && leaf.x <= width - margin);
    assert.ok(leaf.y >= margin && leaf.y <= height - margin);
  }
  const shortSide = Math.min(width, height);
  assert.equal(
    model.leaves[0].size,
    sizeByShortSide.get(shortSide) ?? model.leaves[0].size,
    'Landscape and portrait use the same size at equal short sides',
  );
  sizeByShortSide.set(shortSide, model.leaves[0].size);
}
assert.ok(sizeByShortSide.get(320) < sizeByShortSide.get(390));
assert.ok(sizeByShortSide.get(390) < sizeByShortSide.get(800));
assert.ok(sizeByShortSide.get(800) <= sizeByShortSide.get(1080));
model.resize(390, 844);
for (let i = 0; i < 1000; i++) model.splash(90, 200, 100);
assert.equal(model.ripples.length, MAX_RIPPLES);
assert.ok(
  model.leaves.every((l) => Math.abs(l.vx) <= 60 && Math.abs(l.vy) <= 60),
);
for (let time = 100; time < 15100; time += 16) model.step(time, 0.016);
assert.equal(model.ripples.length, 0);
assert.equal(
  model.step(16000, 0.016),
  false,
  'Leaves converge and RAF can stop',
);
assert.ok(model.leaves.every((l) => l.vx === 0 && l.vy === 0));
model.reduced = true;
model.splash(90, 200, 20000);
assert.ok(model.leaves.every((l) => l.vx === 0 && l.spin === 0));
assert.equal(model.step(20501, 0.016), false);
assert.equal(RIPPLE_LIFE, 2200);
console.log(
  'Pond model PASS: viewport leaf counts, sizes, bounds, 1000 inputs, finite impulses, convergence, reduced motion',
);
const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'pond-browser-'));
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
let ws, reviewServer;
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
  const evaluate = async (expression, userGesture = false) => {
    const response = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture,
    });
    if (response.exceptionDetails)
      throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.lastPointerId=0;
      document.addEventListener('pointerdown',e=>window.lastPointerId=e.pointerId);
      window.rafCalls=0;
      const raf=requestAnimationFrame;
      window.requestAnimationFrame=(f)=>raf(t=>{window.rafCalls++;f(t)});
      window.refractionBlits=0;
      const canvas=CanvasRenderingContext2D.prototype;
      const clearRect=canvas.clearRect;
      const drawImage=canvas.drawImage;
      canvas.clearRect=function(...args){
        if(this.canvas.id==='refraction') window.refractionBlits=0;
        return clearRect.apply(this,args);
      };
      canvas.drawImage=function(...args){
        if(this.canvas.id==='refraction') window.refractionBlits++;
        return drawImage.apply(this,args);
      };
      window.pondAudio={contexts:0,fetches:0,decodes:0,starts:0,rates:[],voices:new Set(),maxVoices:0};
      const nativeFetch=fetch;
      const mode=new URLSearchParams(location.search).get('audio-test');
      window.fetch=async(...args)=>{
        if(/\\.mp3(?:$|\\?)/.test(String(args[0]))){
          pondAudio.fetches++;
          if(mode==='failed')return new Response('',{status:503});
          if(mode==='delayed')await new Promise(resolve=>pondAudio.release=resolve);
        }
        return nativeFetch(...args);
      };
      const decode=OfflineAudioContext.prototype.decodeAudioData;
      OfflineAudioContext.prototype.decodeAudioData=async function(...args){
        const sample=await decode.apply(this,args);
        pondAudio.decodes++;
        return sample;
      };
      const NativeAudioContext=AudioContext;
      window.AudioContext=class extends NativeAudioContext{
        constructor(...args){super(...args);pondAudio.contexts++;}
        createBufferSource(){
          const node=super.createBufferSource();
          const start=node.start.bind(node);
          const stop=node.stop.bind(node);
          node.start=(...args)=>{
            pondAudio.starts++;
            pondAudio.rates.push(node.playbackRate.value);
            pondAudio.voices.add(node);
            pondAudio.maxVoices=Math.max(pondAudio.maxVoices,pondAudio.voices.size);
            return start(...args);
          };
          node.stop=(...args)=>{pondAudio.voices.delete(node);return stop(...args);};
          node.addEventListener('ended',()=>pondAudio.voices.delete(node));
          return node;
        }
      };
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
  const visit = async (path = '/mizutamari/', base = origin) => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: base + path });
    await waitFor(
      `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete'`,
    );
    await waitFor(
      path === '/'
        ? catalogueReady
        : path.includes('?sound-review')
          ? "document.querySelector('.review')?.dataset.ready === 'true'"
          : "document.querySelector('#water')?.dataset.ready === 'true'",
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
  const data = () => evaluate("document.querySelector('canvas').toDataURL()");
  const refractionBlits = () => evaluate('window.refractionBlits');
  const touch = (type, touchPoints = []) =>
    call('Input.dispatchTouchEvent', { type, touchPoints });
  const tap = async (x, y) => {
    await touch('touchStart', [{ x, y, id: 1 }]);
    await touch('touchEnd');
    await delay(60);
  };
  for (const [width, height] of layouts.slice(0, 6)) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await visit();
    assert.ok(
      await evaluate(
        `document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight`,
      ),
    );
    assert.ok(
      await evaluate(
        `(()=>{const r=document.querySelector('#back').getBoundingClientRect();return r.width>=56&&r.height>=56&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`,
      ),
    );
    assert.equal(
      await evaluate(`(async () => {
        const image = document.querySelector('#gravel');
        await image.decode();
        return image.naturalWidth < image.naturalHeight ? 'portrait' : 'landscape';
      })()`),
      width / height <= 3 / 4 ? 'portrait' : 'landscape',
      'Background loads the crop matching the viewport',
    );
    const start = await data();
    await shot(`pond-initial-${width}`);
    await tap(width * 0.5, height * 0.55);
    assert.notEqual(await data(), start, 'Tap produces visible water rings');
    assert.equal(await refractionBlits(), 1, 'One refraction band per tap');
    assert.ok(
      await evaluate(`(() => {
        const lens = document.querySelector('#refraction');
        const ctx = lens.getContext('2d');
        const x = Math.floor(lens.width * 0.5);
        const y = Math.floor(lens.height * 0.55);
        const row = ctx.getImageData(x, y, lens.width - x, 1).data;
        return row[3] === 0 && row.at(-1) === 0 &&
          row.some((alpha, i) => i % 4 === 3 && alpha > 100) &&
          row.some((alpha, i) => i % 4 === 3 && alpha > 10 && alpha < 50);
      })()`),
      'Only the traveling annulus distorts the background',
    );
    await delay(450);
    await shot(`pond-ripples-${width}`);
  }
  report(
    'Pond PASS: six viewports, 56px back, responsive gravel decode, clipped refraction, CDP synthetic taps and screenshots',
  );
  await visit();
  await evaluate(`(() => {
    const water = document.querySelector('#water');
    for (let i = 0; i < 25; i++) {
      water.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    }
  })()`);
  assert.equal(
    await refractionBlits(),
    10,
    'Refraction work is capped on bursts',
  );
  await visit();
  const initial = await data();
  await touch('touchStart', [
    { x: 350, y: 350, id: 1 },
    { x: 550, y: 400, id: 2 },
  ]);
  await delay(120);
  await touch('touchMove', [
    { x: 430, y: 350, id: 1 },
    { x: 620, y: 400, id: 2 },
  ]);
  await delay(100);
  assert.notEqual(await data(), initial);
  await shot('pond-multi-drag');
  await touch('touchCancel');
  await delay(9000);
  const canceledScene = await data();
  await evaluate(
    `document.querySelector('canvas').dispatchEvent(new PointerEvent('pointermove',{pointerId:window.lastPointerId,clientX:800,clientY:500,bubbles:true}))`,
  );
  await delay(100);
  assert.ok(
    (await data()) === canceledScene,
    'Canceled finger cannot create new ripples',
  );
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  assert.equal(
    await data(),
    canceledScene,
    'Blur preserves transported leaves',
  );
  const idle = await evaluate('window.rafCalls');
  assert.equal(await refractionBlits(), 0, 'Refraction clears after settling');
  await delay(200);
  assert.equal(await evaluate('window.rafCalls'), idle, 'Idle RAF stopped');
  // A move after cancellation must not create new effects.
  await evaluate(
    `document.querySelector('canvas').dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:800,clientY:500,bubbles:true}))`,
  );
  await delay(100);
  assert.equal(await data(), canceledScene);
  await evaluate(`document.querySelector('canvas').focus()`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight' });
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter' });
  await delay(80);
  assert.notEqual(await data(), initial, 'Keyboard creates rings');
  await evaluate(`window.dispatchEvent(new Event('pagehide'))`);
  const stopped = await data();
  await delay(300);
  assert.equal(await data(), stopped, 'Pagehide stops effects and motion');
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await tap(600, 400);
  assert.equal(await refractionBlits(), 0, 'Reduced motion skips refraction');
  assert.ok(
    await evaluate(
      `(() => {
        const ctx = document.querySelector('canvas').getContext('2d');
        return [[552, 400], [648, 400], [600, 352], [600, 448]].every(([x, y]) =>
          ctx.getImageData(x - 1, y - 1, 3, 3).data.some((value, i) => i % 4 === 3 && value > 30)
        );
      })()`,
    ),
    'Ripple has the same radius horizontally and vertically',
  );
  await shot('pond-reduced');
  await delay(650);
  assert.equal(
    await data(),
    stopped,
    'Reduced rings expire without moving leaves',
  );
  await call('Emulation.setEmulatedMedia', { features: [] });
  await tap(600, 400);
  await evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));`,
  );
  const hidden = await data();
  const hiddenFrames = await evaluate('window.rafCalls');
  await delay(300);
  assert.equal(await data(), hidden, 'Hidden transition freezes the scene');
  assert.equal(await evaluate('window.rafCalls'), hiddenFrames);
  await tap(600, 400);
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await delay(100);
  const resized = await data();
  await delay(150);
  assert.equal(
    await data(),
    resized,
    'Resize clears active rings and captures',
  );
  assert.ok(
    await evaluate(`document.querySelector('canvas').width<=innerWidth*2`),
  );
  await tap(195, 400);
  await delay(9000);
  const settled = await evaluate('window.rafCalls');
  await delay(200);
  assert.equal(
    await evaluate('window.rafCalls'),
    settled,
    'Rings and leaves settle to idle',
  );
  await evaluate(`document.querySelector('#back').click()`);
  await waitFor(catalogueReady);
  assert.ok(
    await evaluate(
      `!!document.querySelector('a[href="https://anipopina.com/"]')`,
    ),
  );
  await evaluate(`document.querySelector('a[href="mizutamari/"]').click()`);
  await waitFor(`document.querySelector('#water')?.dataset.ready==='true'`);
  const fresh = await data();
  await delay(150);
  assert.equal(await data(), fresh, 'Re-entry is static');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Pond PASS: multi-touch/drag/cancel, stale move, blur/pagehide, keyboard, resize/DPR, reduced motion, settling/idle, hub and re-entry, no JS errors',
  );

  const manifest = JSON.parse(
    await readFile(join(root, 'dist/.vite/manifest.json'), 'utf8'),
  );
  assert.ok(
    !Object.keys(manifest).some((key) =>
      key.startsWith('mizutamari/sound-review/'),
    ),
    'Comparison modules and candidates stay out of the published build',
  );
  const publishedTap = manifest['mizutamari/assets/tap.mp3']?.file;
  assert.ok(publishedTap, 'The adopted sample is in the published build');
  assert.deepEqual(
    await readFile(join(root, 'dist', publishedTap)),
    await readFile(join(root, 'src/mizutamari/sound-review/assets/tap-f.mp3')),
    'The published sample matches candidate F',
  );
  reviewServer = await createServer({
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await reviewServer.listen();
  const dev = `http://127.0.0.1:${reviewServer.httpServer.address().port}`;
  await visit('/mizutamari/?sound-review', dev);
  const candidates = await evaluate(
    "Array.from(document.querySelectorAll('[data-candidate]'), node=>node.dataset.candidate)",
  );
  assert.ok(
    ['tap-a', 'tap-b', 'tap-c', 'tap-d', 'tap-e', 'tap-f'].every((id) =>
      candidates.includes(id),
    ),
  );
  assert.equal(await evaluate('pondAudio.contexts'), 0);
  for (const [index, id] of candidates.entries()) {
    const selector = JSON.stringify(`[data-play="${id}"][data-count="1"]`);
    await evaluate(`document.querySelector(${selector}).click()`, true);
    await waitFor(`pondAudio.starts===${index + 1}`);
  }
  await evaluate(
    `document.querySelector('input[value="tap-f"]').click();
    window.open = url => {window.testPreview = url};
    document.querySelector('#preview').click();`,
  );
  const preview = await evaluate('window.testPreview');
  assert.equal(preview, '/mizutamari/?sound-preview=tap-f');
  assert.ok(await evaluate('pondAudio.rates.every(rate=>rate===1)'));
  await shot('pond-sound-review');
  const mouseDown = () =>
    call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 140,
      y: 370,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
  const mouseUp = (x = 140, y = 370) =>
    call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
  const mouseTap = async () => {
    await mouseDown();
    await mouseUp();
  };
  await visit();
  await waitFor('pondAudio.decodes===1');
  assert.deepEqual(
    await evaluate('[pondAudio.contexts,pondAudio.starts]'),
    [0, 0],
  );
  await mouseTap();
  await waitFor('pondAudio.starts===1');
  assert.ok(
    await evaluate('pondAudio.rates[0]>=0.88 && pondAudio.rates[0]<=1.05'),
  );
  await visit(preview, dev);
  await waitFor('pondAudio.decodes===1');
  assert.deepEqual(
    await evaluate('[pondAudio.contexts,pondAudio.starts]'),
    [0, 0],
  );
  await evaluate('Math.random=()=>0');
  await mouseTap();
  await waitFor('pondAudio.starts===1');
  await delay(180);
  await evaluate('Math.random=()=>0.999');
  await mouseDown();
  await waitFor('pondAudio.starts===2');
  const [slow, fast] = await evaluate('pondAudio.rates');
  assert.ok(Math.abs(slow - 0.88) < 0.0001 && fast > 1.049 && fast <= 1.05);
  await delay(120);
  const starts = await evaluate('pondAudio.starts');
  await call('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 270,
    y: 370,
    buttons: 1,
  });
  assert.equal(
    await evaluate('pondAudio.starts'),
    starts,
    'An early drag ripple does not add sound',
  );
  await delay(1250);
  await call('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 140,
    y: 370,
    buttons: 1,
  });
  await waitFor(`pondAudio.starts===${starts + 1}`);
  await delay(150);
  await call('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 270,
    y: 370,
    buttons: 1,
  });
  await mouseUp(270);
  assert.equal(await evaluate('pondAudio.starts'), starts + 1);
  for (let i = 0; i < 12; i++) {
    await mouseTap();
  }
  assert.equal(await evaluate('pondAudio.fetches'), 1);
  assert.ok(await evaluate('pondAudio.maxVoices<=2'));
  await evaluate("window.dispatchEvent(new Event('blur'))");
  assert.equal(await evaluate('pondAudio.voices.size'), 0);
  const afterBlur = await evaluate('pondAudio.starts');
  await delay(230);
  assert.equal(await evaluate('pondAudio.starts'), afterBlur);
  await visit(preview + '&audio-test=delayed', dev);
  await waitFor('!!pondAudio.release');
  await mouseTap();
  await evaluate('pondAudio.release()');
  await waitFor('pondAudio.decodes===1');
  assert.equal(
    await evaluate('pondAudio.starts'),
    0,
    'No delayed cue for an earlier touch',
  );
  await mouseTap();
  await waitFor('pondAudio.starts===1');
  await visit(preview + '&audio-test=failed', dev);
  const still = await data();
  await mouseTap();
  await delay(60);
  assert.notEqual(
    await data(),
    still,
    'Failed audio fetch leaves the ripple playable',
  );
  assert.equal(await evaluate('pondAudio.starts'), 0);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Pond sound PASS: fixed comparison playback, varied game speed, review selection, spaced drag sounds, bounded voices, blur cleanup, delayed/failed audio, no published preview assets',
  );
  await writeFile(join(output, 'pond-results.txt'), reports.join('\n') + '\n');
} finally {
  ws?.close();
  chrome.kill();
  await reviewServer?.close();
  server.close();
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 150,
  });
}
