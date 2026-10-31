import assert from 'node:assert/strict';
import { Journey } from '../src/kotokoto-kisha/model.ts';
const model = new Journey();
model.start();
model.step(50);
for (let i = 0; i < 10000; i++) model.start();
assert.equal(model.remaining, 1750);
for (let i = 0; i < 200; i++) model.step(50);
assert.equal(model.remaining, 0);
assert.ok(Number.isFinite(model.offset) && model.offset < 600);

import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'train-browser-'));
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
  const visit = async (path = '/kotokoto-kisha/') => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + path });
    await waitFor(
      `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete'`,
    );
    await waitFor(
      path === '/'
        ? "document.querySelectorAll('.game-card').length===12"
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
  const moving = () =>
    evaluate(`document.querySelector('#scene').dataset.moving==='true'`);
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
    await evaluate(`Promise.all([...document.images].map(i=>i.decode()))`);
    assert.equal(await evaluate('window.contexts.length'), 0);
    assert.ok(
      await evaluate(
        `[...document.querySelectorAll('button,#back')].every(b=>{const r=b.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
      ),
      'Large visible targets',
    );
    assert.ok(
      await evaluate(
        'document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight',
      ),
    );
    await shot(`train-${width}x${height}`);
    const buttonBoxes = () =>
      evaluate(
        `[...document.querySelectorAll('.animal')].map(b=>{const r=b.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})`,
      );
    const originalBoxes = await buttonBoxes();
    const clip = await evaluate(
      `(()=>{const r=document.querySelector('#carriage').getBoundingClientRect();return {x:Math.ceil(r.x+r.width*.05),y:Math.ceil(r.y+r.height*.40),width:Math.floor(r.width*.50),height:Math.floor(r.height*.10),scale:1}})()`,
    );
    await evaluate(
      `document.querySelectorAll('.animal').forEach(b=>b.click());document.getAnimations().forEach(a=>{a.pause();a.currentTime=0})`,
    );
    const front = (
      await call('Page.captureScreenshot', { format: 'png', clip })
    ).data;
    for (const progress of [0, 0.25, 0.45, 0.6, 0.85]) {
      await evaluate(
        `document.getAnimations().forEach(a=>{a.currentTime=650*${progress}})`,
      );
      assert.deepEqual(
        await buttonBoxes(),
        originalBoxes,
        'Hit targets remain fixed during wave',
      );
      assert.ok(
        await evaluate(
          `(()=>{const c=document.querySelector('#carriage').getBoundingClientRect(), p=document.querySelector('#passengers');return [...document.querySelectorAll('.figure')].every(f=>{const img=f.querySelector('img'),css=getComputedStyle(f),m=new DOMMatrix(css.transform==='none'?undefined:css.transform),o=css.transformOrigin.split(' ').map(Number.parseFloat),w=Math.min(f.clientWidth,f.clientHeight*img.naturalWidth/img.naturalHeight);return [-1,1].every(sign=>{const point=new DOMPoint(f.clientWidth/2+sign*w/2-o[0],f.clientHeight-o[1]).matrixTransform(m);return c.y+p.offsetTop+f.offsetTop+o[1]+point.y>=c.y+c.height*.32})})})()`,
        ),
        'Sprite bottom edge stays behind wagon lip',
      );
      const after = (
        await call('Page.captureScreenshot', { format: 'png', clip })
      ).data;
      const difference = await evaluate(
        `(async()=>{const decode=async(s)=>{const img=await createImageBitmap(await (await fetch('data:image/png;base64,'+s)).blob());const c=new OffscreenCanvas(img.width,img.height),ctx=c.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,img.width,img.height).data;};const a=await decode('${front}'),b=await decode('${after}');let max=0,sum=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);sum+=d;}return {max,mean:sum/a.length}})()`,
      );
      assert.ok(
        difference.max <= 32 && difference.mean < 3,
        `Wagon front comparison (asset alpha and compositor tolerance): ${JSON.stringify(difference)}`,
      );
      if (progress === 0.25 || progress === 0.6)
        await shot(`train-wave-${width}-${progress}`);
    }
    await evaluate(`document.getAnimations().forEach(a=>a.finish())`);
    await delay(50);
    const point = await center('#engine');
    await touch('touchStart', [{ ...point, id: 1 }]);
    await touch('touchEnd');
    await delay(100);
    assert.equal(await moving(), true);
    const offset = await evaluate(
      `document.querySelector('#scene').style.getPropertyValue('--travel')`,
    );
    await delay(250);
    assert.notEqual(
      await evaluate(
        `document.querySelector('#scene').style.getPropertyValue('--travel')`,
      ),
      offset,
    );
    assert.equal(await evaluate('window.oscillators'), 2);
    await delay(1700);
    assert.equal(await moving(), false);
    assert.equal(await evaluate('window.contexts[0].state'), 'suspended');
  }
  report(
    'Train PASS: six sizes, 56px fixed targets, five wave phases / sprite edge occlusion / wagon foreground comparison, images decode, tap and bounded movement, two fixed voices, idle suspend',
  );
  await evaluate(
    `for(let i=0;i<10000;i++)document.querySelector('#engine').click()`,
  );
  await delay(2100);
  assert.equal(await moving(), false, 'Burst does not extend journey');
  assert.equal(await evaluate('window.oscillators'), 2);
  assert.ok(await evaluate('window.peak<=.007'));
  for (let i = 1; i <= 3; i++) {
    const p = await center(`.passenger:nth-child(${i}) .animal`);
    await touch('touchStart', [{ ...p, id: 1 }]);
    await touch('touchEnd');
    assert.equal(
      await evaluate(
        `document.querySelector('.passenger:nth-child(${i}) .animal').dataset.reacting`,
      ),
      'true',
    );
    assert.equal(await moving(), false, 'Greeting does not start engine');
    await delay(750);
  }
  await evaluate(
    `for(let i=0;i<10000;i++)document.querySelectorAll('.animal')[i%3].click()`,
  );
  assert.ok(await evaluate('document.getAnimations().length<=7'));
  await delay(750);
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  for (const stop of [
    "window.dispatchEvent(new Event('blur'))",
    "window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'))",
    "Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))",
  ]) {
    await evaluate(`document.querySelector('#engine').click()`);
    await delay(50);
    await evaluate(stop);
    await delay(50);
    assert.equal(await moving(), false);
    assert.equal(await evaluate('window.contexts[0].state'), 'suspended');
    await evaluate('delete document.hidden');
  }
  await evaluate(`document.querySelector('#engine').focus()`);
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
  assert.equal(await moving(), true);
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await delay(100);
  assert.equal(await moving(), false);
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await evaluate(`document.querySelector('#engine').click()`);
  assert.equal(await moving(), false);
  await delay(250);
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  await evaluate(`document.querySelector('#back').click()`);
  await waitFor(`document.querySelectorAll('.game-card').length===12`);
  await evaluate(`document.querySelector('a[href="kotokoto-kisha/"]').click()`);
  await waitFor(`document.querySelector('#scene')?.dataset.ready==='true'`);
  assert.equal(await evaluate('window.contexts.length'), 0);
  await call('Emulation.setEmulatedMedia', { features: [] });
  await evaluate(
    `window.AudioContext=class {constructor(){throw new Error('blocked')}};document.querySelector('#engine').click()`,
  );
  assert.equal(await moving(), true, 'Visual play survives audio failure');
  for (const cancel of [false, true]) {
    await visit();
    await evaluate(
      `const Base=AudioContext;window.AudioContext=class extends Base {get state(){return this.ready?super.state:'suspended'} resume(){return new Promise(resolve=>setTimeout(()=>{this.ready=true;super.resume().then(resolve)},350))}};document.querySelector('#engine').click()`,
    );
    if (cancel) await evaluate(`window.dispatchEvent(new Event('blur'))`);
    await delay(500);
    assert.equal(await evaluate('window.peak'), 0, 'Stale whistle discarded');
    assert.equal(await evaluate('window.contexts[0].state'), 'suspended');
  }
  await visit();
  const e = await center('#engine'),
    a = await center('.animal');
  await touch('touchStart', [
    { ...e, id: 1 },
    { ...a, id: 2 },
  ]);
  await touch('touchCancel');
  assert.equal(await moving(), true);
  assert.equal(
    await evaluate(`document.querySelector('.animal').dataset.reacting`),
    'true',
  );
  await delay(2100);
  assert.equal(await moving(), false);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'Train PASS: 10000-input travel/audio/effect caps, three greetings, keyboard, resize, blur/hidden/pagehide, reduced motion, hub/reentry, audio failure; no JS exceptions. Physical audio/device not verified.',
  );
  await writeFile(join(output, 'train-results.txt'), reports.join('\n') + '\n');
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
