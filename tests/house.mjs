import assert from 'node:assert/strict';
import { Peekaboo } from '../src/dare-no-ouchi/model.ts';
const model = new Peekaboo();
for (let j = 0; j < 9; j++) {
  assert.equal(model.tap(), true);
  assert.equal(model.animal, j % 3);
  for (let i = 0; i < 10000; i++) assert.equal(model.tap(), false);
  for (let i = 0; i < 4; i++) model.advance();
  assert.equal(model.phase, 'closed');
}
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'house-browser-'));
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
  const visit = async (path = '/dare-no-ouchi/') => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + path });
    await waitFor(
      `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete'`,
    );
    await waitFor(
      path === '/'
        ? "document.querySelectorAll('.game-card').length===14"
        : "document.querySelector('#house')?.dataset.ready === 'true'",
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

  const phase = () =>
    evaluate("document.querySelector('#house').dataset.phase");
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
      deviceScaleFactor: 1,
      mobile: true,
    });
    await call('Emulation.setTouchEmulationEnabled', { enabled: true });
    await visit();
    assert.equal(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
      true,
    );
    assert.equal(
      await evaluate(
        "(()=>{const r=document.querySelector('#door').getBoundingClientRect();return r.width>=56&&r.height>=56&&r.bottom<=innerHeight})()",
      ),
      true,
    );
    const scrollProbe = await evaluate(`(() => {
      const house=document.querySelector('#house'), before=house.getBoundingClientRect();
      const nodes=[document.documentElement,document.body,...document.querySelectorAll('#scene,#door,.room')];
      const metrics=nodes.map(n=>({id:n.id||n.className||n.tagName,width:n.clientWidth,scrollWidth:n.scrollWidth,height:n.clientHeight,scrollHeight:n.scrollHeight}));
      for(const n of nodes) n.scrollTo(1000,1000);
      document.querySelector('.ground').scrollIntoView({block:'center',inline:'center'});
      document.querySelector('#door').scrollIntoView({block:'center',inline:'center'});
      document.querySelector('#door').focus();
      const after=house.getBoundingClientRect();
      return {metrics, offsets:nodes.map(n=>[n.scrollLeft,n.scrollTop]),shift:[after.x-before.x,after.y-before.y]};
    })()`);
    assert.deepEqual(
      scrollProbe.offsets,
      [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      JSON.stringify(scrollProbe),
    );
    assert.deepEqual(scrollProbe.shift, [0, 0]);
    await evaluate("document.querySelector('#door').blur()");
    await shot(`house-${width}x${height}-closed`);
    const p = await center('#door');
    await touch('touchStart', [{ ...p, id: 1 }]);
    await touch('touchEnd');
    assert.equal(await phase(), 'knocking');
    await waitFor("document.querySelector('#house').dataset.phase==='open'");
    await evaluate(
      "for(let i=0;i<10000;i++) document.querySelector('#door').click()",
    );
    assert.equal(await phase(), 'open');
    assert.equal(
      await evaluate("document.querySelector('#house').dataset.animal"),
      '0',
    );
    await shot(`house-${width}x${height}-open`);
    await waitFor("document.querySelector('#house').dataset.phase==='closed'");
    assert.ok(await evaluate('window.oscillators<=2 && window.peak<=.007'));
    report(
      `House ${width}x${height}: touch, 10000 taps, automatic close, target/overflow/audio caps PASS`,
    );
  }
  for (let i = 1; i <= 3; i++) {
    await evaluate("document.querySelector('#door').click()");
    await waitFor("document.querySelector('#house').dataset.phase==='open'");
    assert.equal(
      await evaluate("document.querySelector('#house').dataset.animal"),
      String(i % 3),
    );
    await shot(`house-guest-${i % 3}`);
    await evaluate("window.dispatchEvent(new Event('blur'))");
    assert.equal(await phase(), 'closed');
  }
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await delay(150);
  await evaluate("document.querySelector('#door').focus()");
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
  await waitFor("document.querySelector('#house').dataset.phase==='open'");
  await evaluate(
    "document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pagehide'))",
  );
  assert.equal(await phase(), 'closed');
  await visit('/');
  await evaluate(
    'document.querySelector(\'a[href="dare-no-ouchi/"]\').click()',
  );
  await waitFor("document.querySelector('#house')?.dataset.ready==='true'");
  assert.equal(await phase(), 'closed');
  await evaluate("document.querySelector('#door').click()");
  await waitFor("document.querySelector('#house').dataset.phase==='open'");
  await evaluate(
    "Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))",
  );
  assert.equal(await phase(), 'closed');
  await delay(250);
  assert.equal(
    await evaluate("window.contexts.every(c=>c.state==='suspended')"),
    true,
  );
  await evaluate(
    "delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));document.querySelector('#door').click()",
  );
  await waitFor("document.querySelector('#house').dataset.phase==='open'");
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await waitFor("document.querySelector('#house').dataset.phase==='closed'");
  const fail = await call('Page.addScriptToEvaluateOnNewDocument', {
    source:
      "window.AudioContext=class {constructor(){throw Error('audio unavailable')}};const d=HTMLImageElement.prototype.decode;let n=0;HTMLImageElement.prototype.decode=function(){return n++===0?Promise.reject(Error('decode failed')):d.call(this)}",
  });
  await call('Page.navigate', { url: origin + '/dare-no-ouchi/' });
  await waitFor("document.querySelector('#retry')?.hidden===false");
  assert.equal(
    await evaluate("document.querySelector('#door').disabled"),
    true,
  );
  await evaluate("document.querySelector('#retry').click()");
  await waitFor("document.querySelector('#house')?.dataset.ready==='true'");
  await evaluate("document.querySelector('#door').click()");
  await waitFor("document.querySelector('#house').dataset.phase==='open'");
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: fail.identifier,
  });
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report(
    'House PASS: 3 guests, keyboard, reduced motion, blur/hidden/pagehide/resize, hub/reentry, decode retry, unavailable audio; no JS errors. Physical audio/device unverified.',
  );
  await writeFile(join(output, 'house-results.txt'), reports.join('\n') + '\n');
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
