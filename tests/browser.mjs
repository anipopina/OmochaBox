import { createStaticServer } from './static-server.mjs';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

// Uses a local Chromium binary and its DevTools protocol against Vite builds.
const root = resolve(import.meta.dirname, '..');
const binary = process.env.CHROME_PATH || '/usr/bin/chromium';
const profile = await mkdtemp(join(tmpdir(), 'hikari-browser-'));
const errors = [],
  reports = [];
const report = (message) => {
  reports.push(message);
  console.log(message);
};
let audioFailure = false,
  audioDelay = 0,
  audioRequests = 0;
let audioResponseGate = null;
let fogDelay = 0,
  fogFailure = false;
const buildDirectory = join(root, 'test-results/build');
const manifest = JSON.parse(
  await readFile(join(buildDirectory, '.vite/manifest.json'), 'utf8'),
);
const assetPath = (source) => '/' + manifest[source].file;
const samplePath = assetPath('hikari-no-oekaki/assets/ta_ta_hosikuzu01.mp3');
const fogPaths = new Set(
  Object.keys(manifest)
    .filter((path) => path.startsWith('fukifuki-mado/assets/fog/'))
    .map(assetPath),
);
const server = createStaticServer(
  buildDirectory,
  async (_request, response, pathname) => {
    if (fogPaths.has(pathname)) {
      if (fogDelay)
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            fogDelay +
              (pathname === assetPath('fukifuki-mado/assets/fog/garden.webp')
                ? 600
                : 0),
          ),
        );
      if (fogFailure) {
        response.writeHead(503).end();
        return true;
      }
      return false;
    }
    if (pathname !== samplePath) return false;
    audioRequests++;
    if (audioResponseGate) await audioResponseGate;
    if (audioDelay)
      await new Promise((resolve) => setTimeout(resolve, audioDelay));
    if (audioFailure) {
      response.writeHead(503).end();
      return true;
    }
    return false;
  },
);
const productionServer = createStaticServer(join(root, 'dist'));
await new Promise((resolve) =>
  productionServer.listen(0, '127.0.0.1', resolve),
);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const chrome = spawn(
  binary,
  [
    '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
let ws;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
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
  ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown')
      errors.push(m.params.exceptionDetails);
    if (m.id) {
      const p = pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(m.id);
      m.error ? p.reject(m.error) : p.resolve(m.result);
    }
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => {
        pending.delete(key);
        reject(
          new Error(
            'Browser command timed out: ' +
              method +
              ' ' +
              JSON.stringify(params),
          ),
        );
      }, 15000);
      pending.set(key, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: key, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await delay(50);
    }
    assert.fail(`Timed out waiting for ${expression}`);
  };
  await call('Runtime.enable');
  await call('Page.enable');
  await mkdir(join(root, 'test-results'), { recursive: true });
  const productionOrigin = `http://127.0.0.1:${productionServer.address().port}`;
  await call('Page.navigate', { url: productionOrigin + '/' });
  for (
    let i = 0;
    i < 100 &&
    !(await evaluate('document.querySelectorAll(".game-card").length === 9'));
    i++
  )
    await delay(50);
  assert.equal(
    await evaluate('document.querySelectorAll(".game-card").length'),
    9,
    'Production hub loads bundled modules',
  );
  assert.equal(await evaluate('typeof window.__test'), 'undefined');
  await evaluate('document.querySelector(".game-card").click()');
  await delay(300);
  assert.equal(
    await evaluate('typeof window.__test'),
    'undefined',
    'Production drawing game has no test hooks',
  );
  const drawingCenter = () =>
    evaluate(
      `(()=>{const c=document.querySelector('canvas');return [...c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data]})()`,
    );
  const beforeDrawing = await drawingCenter();
  const center = await evaluate('({x:innerWidth/2,y:innerHeight/2})');
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...center,
    button: 'left',
    clickCount: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...center,
    button: 'left',
    clickCount: 1,
  });
  await delay(450);
  assert.notDeepEqual(
    await drawingCenter(),
    beforeDrawing,
    'Production drawing responds to input',
  );
  assert.equal(
    await evaluate('document.querySelector("#reset")'),
    null,
    'Drawing page omits reset button',
  );
  await call('Page.reload');
  await delay(300);
  assert.deepEqual(
    await drawingCenter(),
    beforeDrawing,
    'Production reload restores garden',
  );
  await evaluate('document.querySelector("#back").click()');
  await waitFor(`!!document.querySelector('a[href="fukifuki-mado/"]')`);
  await evaluate(`document.querySelector('a[href="fukifuki-mado/"]').click()`);
  await delay(300);
  assert.equal(await evaluate('typeof window.__test'), 'undefined');
  assert.ok(
    await evaluate('document.querySelector(".window img").naturalWidth > 1000'),
    'Production hashed garden asset loads',
  );
  const fogCenter = await evaluate(
    `(()=>{const rect=document.querySelector('#fog').getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()`,
  );
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...fogCenter,
    button: 'left',
    clickCount: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...fogCenter,
    button: 'left',
    clickCount: 1,
  });
  assert.equal(
    await evaluate(
      `(()=>{const c=document.querySelector('#fog');return c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data[3]})()`,
    ),
    0,
    'Production fog responds to input',
  );
  report(
    'Production: hub, hashed assets, drawing/reload, fog wiping, navigation, no test hooks PASS',
  );
  await call('Page.navigate', {
    url: `http://127.0.0.1:${server.address().port}/hikari-no-oekaki/`,
  });
  for (let i = 0; i < 100 && !(await evaluate('!!window.__test')); i++)
    await delay(50);
  const origin = `http://127.0.0.1:${server.address().port}`;
  await mkdir(join(root, 'test-results'), { recursive: true });
  if (!process.env.WINDOW_ONLY) {
    const assetResponse = await fetch(origin + samplePath);
    assert.equal(assetResponse.headers.get('content-type'), 'audio/mpeg');
    assert.deepEqual(
      Buffer.from(await assetResponse.arrayBuffer()),
      await readFile(
        join(root, 'src/hikari-no-oekaki/assets/ta_ta_hosikuzu01.mp3'),
      ),
    );
    const leafPaths = [
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ].map((corner) =>
      assetPath(`hikari-no-oekaki/assets/leaves-${corner}.webp`),
    );
    assert.equal(
      await evaluate(
        `Promise.all(${JSON.stringify(leafPaths)}.map(src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i.naturalWidth===660);i.onerror=()=>resolve(false);i.src=src}))).then(r=>r.filter(Boolean).length)`,
      ),
      4,
      'All four optimized WebPs served and decoded',
    );
    const state = () => evaluate('__test.snapshot()');
    const pointer = (type, x, y, pointerId = 1) =>
      evaluate(
        `document.querySelector('canvas').dispatchEvent(new PointerEvent('${type}', {pointerId:${pointerId}, pointerType:'touch', clientX:${x}, clientY:${y}, buttons:1, bubbles:true,cancelable:true}))`,
      );
    await mkdir(join(root, 'test-results'), { recursive: true });
    for (const [name, width, height, mobile] of [
      ['iphone-portrait', 390, 844, true],
      ['iphone-landscape', 844, 390, true],
      ['ipad', 820, 1180, true],
      ['ipad-landscape', 1180, 820, true],
      ['desktop', 1280, 800, false],
    ]) {
      await call('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile,
      });
      await delay(100);
      assert.deepEqual(await evaluate('[innerWidth,innerHeight]'), [
        width,
        height,
      ]);
      assert.ok((await state()).pixels <= 4005000);
      const layout = await evaluate(
        `(()=>{const r=document.querySelector('#back').getBoundingClientRect();return {inside:r.right<=innerWidth&&r.bottom<=innerHeight,scroll:document.documentElement.scrollWidth>innerWidth}})()`,
      );
      assert.ok(layout.inside && !layout.scroll);
      const gardenShot = await call('Page.captureScreenshot', {
        format: 'png',
      });
      await writeFile(
        join(root, 'test-results', 'garden-' + name + '.png'),
        Buffer.from(gardenShot.data, 'base64'),
      );
      await call('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: 25,
        y: height - 35,
        button: 'left',
        clickCount: 1,
      });
      await call('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: 25,
        y: height - 35,
        button: 'left',
        clickCount: 1,
      });
      assert.equal(
        (await state()).flowers,
        1,
        'Tap on leaf reaches drawing canvas',
      );
      await evaluate('__test.clear()');
      await pointer('pointerdown', width * 0.25, height * 0.4);
      await pointer('pointerdown', width * 0.7, height * 0.5, 2);
      assert.equal((await state()).flowers, 0, 'No flower on pointerdown');
      for (let i = 0; i < 25; i++) {
        await pointer(
          'pointermove',
          width * (0.25 + i * 0.014),
          height * (0.4 + Math.sin(i / 8) * 0.1),
        );
        await pointer(
          'pointermove',
          width * (0.7 - i * 0.013),
          height * (0.6 + Math.sin(i / 9) * 0.12),
          2,
        );
      }
      assert.equal((await state()).fingers, 2);
      await pointer('pointerup', width * 0.59, height * 0.414);
      await pointer('pointerup', width * 0.39, height * 0.655, 2);
      assert.equal((await state()).flowers, 2, 'One flower per normal release');
      await pointer('pointerup', width * 0.59, height * 0.414);
      assert.equal((await state()).flowers, 2, 'Duplicate up cannot bloom');
      await pointer('pointerdown', width * 0.78, height * 0.78, 3);
      await pointer('pointerup', width * 0.78, height * 0.78, 3);
      assert.equal((await state()).flowers, 3, 'Short tap blooms');
      await delay(450);
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(
        join(root, 'test-results', name + '.png'),
        Buffer.from(shot.data, 'base64'),
      );
      // Isolate cancellation from flowers expiring during screenshot capture.
      await evaluate('__test.clear()');
      await pointer('pointerdown', 100, 100, 4);
      await pointer('pointercancel', 100, 100, 4);
      await pointer('pointerup', 100, 100, 4);
      assert.equal((await state()).flowers, 0, 'Cancel never blooms');
      assert.equal((await state()).fingers, 0);
      report(
        `${name}: viewport, multitouch, bloom once on up, short tap, cancel and screenshot PASS`,
      );
      await evaluate('__test.clear()');
      const portrait = height > width;
      const layoutPoints = portrait
        ? [
            [0.5, 0.23],
            [0.5, 0.74],
            [0.8, 0.485],
          ]
        : [
            [0.21, 0.48],
            [0.79, 0.48],
            [0.5, 0.48],
          ];
      for (let i = 0; i < 3; i++) {
        const [x, y] = layoutPoints[i];
        await pointer('pointerdown', width * x, height * y, 10 + i);
        if (i < 2) await evaluate(`__test.hold(${10 + i},6000)`);
        await evaluate(
          `if(${i}===2)__test.hold(${10 + i},0);document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerup',{pointerId:${10 + i},pointerType:'touch',clientX:${width * x},clientY:${height * y},bubbles:true}))`,
        );
      }
      await delay(450);
      const sizes = (await state()).radii;
      assert.ok(Math.abs(sizes[0] / sizes[2] - 2) < 0.003);
      assert.equal(sizes[0], sizes[1]);
      const maxShot = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(
        join(root, 'test-results', name + '-charge-comparison.png'),
        Buffer.from(maxShot.data, 'base64'),
      );
      await evaluate('__test.clear()');
    }
    const curve = await evaluate(
      '[0,3000,5999,6000,9000].map(ms=>__test.curve(ms))',
    );
    assert.equal(curve[0].charge, 0);
    assert.equal(curve[1].charge, 0.5);
    assert.ok(curve[2].charge < 1);
    assert.equal(curve[3].charge, 1);
    assert.equal(curve[4].radius, curve[3].radius);
    assert.ok(
      Math.abs(curve[0].radius - 50.7 * 1.5 * curve[0].scale) < 1e-9,
      'Initial v3 flower size unchanged',
    );
    assert.ok(Math.abs(curve[1].radius / curve[0].radius - 1.5) < 1e-9);
    assert.equal(curve[3].radius / curve[0].radius, 2);
    assert.ok(
      curve[0].sparkle < curve[1].sparkle &&
        curve[1].sparkle < curve[3].sparkle &&
        curve[3].sparkle === curve[4].sparkle,
    );
    await pointer('pointerdown', 350, 350, 31);
    const start = await state();
    await delay(3000);
    const middle = await state();
    assert.ok(
      middle.charges[0] > 0.49 &&
        middle.charges[0] < 0.57 &&
        middle.newestParticle > start.newestParticle &&
        middle.raf > 0,
    );
    await pointer('pointerdown', 700, 350, 32);
    await delay(3100);
    const full = await state();
    assert.equal(full.charges[0], 1);
    assert.ok(full.charges[1] > 0.5 && full.charges[1] < 0.6);
    assert.ok(full.peaks[0] > 0 && full.peaks[1] === 0);
    assert.ok(
      full.notes.some((n) => n.kind === 'sample'),
      'Stationary touch uses MP3 AudioBufferSource',
    );
    assert.equal(full.sampleStatus, 'ready');
    assert.ok(full.sampleDuration > 7.2 && full.sampleDuration < 7.4);
    assert.ok(
      full.samples.length <= 2 &&
        full.samples.every((s) => s.bufferMatch && s.peak <= 2.25),
    );
    assert.ok(
      full.newestParticle > middle.newestParticle && full.particles <= 220,
    );
    const holdShot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(
      join(root, 'test-results', 'stationary-6s-and-3s.png'),
      Buffer.from(holdShot.data, 'base64'),
    );
    await delay(900);
    assert.equal(
      (await state()).peaks[0],
      full.peaks[0],
      'Peak does not repeat',
    );
    await pointer('pointercancel', 350, 350, 31);
    await pointer('pointercancel', 700, 350, 32);
    assert.equal((await state()).flowers, 0);
    const cancelledNotes = (await state()).notes.length;
    await delay(500);
    assert.equal((await state()).notes.length, cancelledNotes);
    assert.equal((await state()).voices, 0);
    await evaluate('__test.clear()');
    report(
      'Unchanged initial size; 0/3/6/9s flower factors 1/1.5/2/2; independent 2 fingers; peak once; shared decoded MP3 used during hold PASS',
    );
    for (let id = 40; id < 50; id++) {
      await pointer('pointerdown', 150 + (id - 40) * 90, 400, id);
      await evaluate(`__test.hold(${id},6000)`);
    }
    await delay(900);
    const multi = await state();
    assert.equal(multi.peaks.filter(Boolean).length, 10);
    assert.ok(
      multi.voices <= 4 &&
        multi.particles <= 220 &&
        multi.samples.length <= 2 &&
        multi.samples.every((s) => s.peak <= 2.25),
    );
    assert.ok(multi.masterGain <= 0.221 && multi.compressorRatio === 8);
    await delay(500);
    assert.deepEqual(
      (await state()).peaks,
      multi.peaks,
      'No repeated 10-finger bursts',
    );
    await evaluate(
      `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))`,
    );
    const hidden = await state();
    assert.equal(hidden.fingers + hidden.voices + hidden.particles, 0);
    await delay(500);
    assert.equal((await state()).notes.length, hidden.notes.length);
    await evaluate(
      `delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))`,
    );
    await delay(400);
    assert.equal(
      (await state()).notes.length,
      hidden.notes.length,
      'No stale sound after visibility restore',
    );
    const notes = (await state()).notes;
    assert.ok(
      notes.every((n) => n.peak <= (n.kind === 'sample' ? 2.25 : 0.24)),
    );
    const flowerNotes = notes.filter((n) => n.kind === 'flower');
    assert.ok(
      flowerNotes
        .slice(1)
        .every((n, i) => n.time - flowerNotes[i].time >= 149.5),
    );
    report(
      '10 fingers: particles<=220 total voices<=4 MP3 voices<=2 gain<=2.25 each; cancel/hidden restore without stale playback PASS',
    );
    // Trusted mouse input exercises actual browser capture and audio activation.
    await call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 200,
      y: 200,
      button: 'left',
      clickCount: 1,
    });
    await delay(80);
    assert.equal((await state()).audio, 'running');
    await call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 600,
      y: 300,
      buttons: 1,
    });
    await call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 600,
      y: 300,
      button: 'left',
      clickCount: 1,
    });
    assert.equal((await state()).fingers, 0);
    await delay(20);
    assert.ok((await state()).voices > 0, 'Release plays a short sound');
    await evaluate(
      `(async()=>{const c=document.querySelector('canvas');for(let i=0;i<2000;i++){c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:42,pointerType:'touch',clientX:100,clientY:100}));c.dispatchEvent(new PointerEvent('pointermove',{pointerId:42,pointerType:'touch',clientX:1000,clientY:600}));c.dispatchEvent(new PointerEvent('pointerup',{pointerId:42}));}await Promise.resolve()})()`,
    );
    const stress = await state();
    assert.ok(
      stress.flowers <= 32 &&
        stress.points <= 480 &&
        stress.voices <= 4 &&
        stress.fingers === 0,
    );
    assert.ok(stress.particles <= 220);
    await pointer('pointerdown', 200, 200, 7);
    await evaluate(
      `(()=>{const c=document.querySelector('canvas');for(let i=0;i<5000;i++)c.dispatchEvent(new PointerEvent('pointermove',{pointerId:7,pointerType:'touch',clientX:100+(i%900),clientY:250+Math.sin(i/20)*90,buttons:1}))})()`,
    );
    assert.ok(
      (await state()).points <= 480 && (await state()).particles <= 220,
    );
    await pointer('pointerup', 600, 250, 7);
    report(
      'Trusted mouse, Web Audio activation, 2,000 taps and 5,000 long-drag moves bounded PASS',
    );
    await delay(6900);
    const idle = await state();
    assert.equal(
      idle.points + idle.flowers + idle.particles + idle.voices + idle.raf,
      0,
    );
    report('After release: all effects/voices expire and animation stops PASS');
    await pointer('pointerdown', 200, 200);
    await call('Emulation.setDeviceMetricsOverride', {
      width: 800,
      height: 600,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(100);
    assert.equal((await state()).fingers, 0);
    await pointer('pointerdown', 200, 200);
    await evaluate(`window.dispatchEvent(new PageTransitionEvent('pagehide'))`);
    assert.equal((await state()).flowers, 0);
    assert.equal((await state()).fingers, 0);
    await evaluate(`window.dispatchEvent(new PageTransitionEvent('pageshow'))`);
    await pointer('pointerup', 200, 200);
    assert.equal(
      (await state()).flowers,
      0,
      'Stale release after pagehide does not bloom',
    );
    await pointer('pointerdown', 250, 250);
    await pointer('pointermove', 400, 300);
    await pointer('pointerup', 400, 300);
    assert.equal((await state()).flowers, 1);
    await evaluate('__test.age(2900)');
    await delay(60);
    assert.equal((await state()).points, 0);
    assert.ok((await state()).particles > 0, 'Old line becomes particles');
    await evaluate('__test.age(1000)');
    await delay(60);
    assert.ok((await state()).released[0] > 0, 'Petals dissolve in sequence');
    const dissolveShot = await call('Page.captureScreenshot', {
      format: 'png',
    });
    await writeFile(
      join(root, 'test-results', 'dissolving.png'),
      Buffer.from(dissolveShot.data, 'base64'),
    );
    report(
      'Old segments become particles; petals release particles while remaining shape stays visible PASS',
    );
    report(
      'Resize clears captures; pagehide/pageshow recovery PASS (synthetic lifecycle events)',
    );
    assert.deepEqual(
      await evaluate('__test.layerScene()'),
      [
        [255, 226, 118, 255],
        [255, 183, 214, 255],
        [118, 221, 255, 255],
      ],
      'New line over old line; new flower over old flower; old flower over new line',
    );
    const layers = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(
      join(root, 'test-results', 'layer-order.png'),
      Buffer.from(layers.data, 'base64'),
    );
    report(
      'Exact overlap pixels: newer yellow line above cyan line; newer pink flower above cyan flower (equal timestamps); older cyan flower above newer yellow line PASS',
    );
    assert.equal(
      audioRequests,
      2,
      'One verification fetch plus one app fetch; buffer reused across gestures',
    );
    audioDelay = 400;
    await call('Page.reload');
    for (let i = 0; i < 100 && !(await evaluate('!!window.__test')); i++)
      await delay(50);
    await delay(100);
    await call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 300,
      y: 300,
      button: 'left',
      clickCount: 1,
    });
    await call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 300,
      y: 300,
      button: 'left',
      clickCount: 1,
    });
    await delay(800);
    const quick = await state();
    assert.equal(quick.sampleStatus, 'ready');
    assert.equal(quick.samples.length, 0);
    assert.ok(
      !quick.notes.some((n) => n.kind === 'sample'),
      'No deferred MP3 after quick release during load',
    );
    await call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 300,
      y: 300,
      button: 'left',
      clickCount: 1,
    });
    await delay(150);
    assert.ok((await state()).samples.length > 0);
    await call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 300,
      y: 300,
      button: 'left',
      clickCount: 1,
    });
    assert.ok((await state()).samples.every((s) => s.fading));
    await delay(1300);
    assert.equal(
      (await state()).samples.length,
      0,
      'Release tail <=1.21 seconds',
    );
    audioDelay = 0;
    audioFailure = true;
    await call('Page.reload');
    await waitFor(
      `document.readyState==='complete' && window.__test?.snapshot().sampleStatus==='idle'`,
    );
    await call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 300,
      y: 300,
      button: 'left',
      clickCount: 1,
    });
    await waitFor(
      `__test.snapshot().sampleStatus==='failed' && __test.snapshot().fingers===1`,
    );
    await call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 300,
      y: 300,
      button: 'left',
      clickCount: 1,
    });
    assert.equal((await state()).sampleStatus, 'failed');
    assert.equal((await state()).flowers, 1);
    assert.equal((await state()).samples.length, 0);
    report(
      'MP3 exact bytes and audio/mpeg; single fetch/shared decode; no delayed play after first-load release; release tail bounded; HTTP503 keeps drawing functional PASS',
    );
    const pressAudio = () =>
      call('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: 300,
        y: 300,
        button: 'left',
        clickCount: 1,
      });
    const releaseAudio = () =>
      call('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: 300,
        y: 300,
        button: 'left',
        clickCount: 1,
      });
    const failedRequests = audioRequests;
    await evaluate(`(()=>{
      const canvas=document.querySelector('canvas');
      for(let i=0;i<50;i++)for(const type of ['pointerdown','pointerup'])
        canvas.dispatchEvent(new PointerEvent(type,{pointerId:99,pointerType:'touch',clientX:300,clientY:300}));
    })()`);
    assert.equal(
      audioRequests,
      failedRequests,
      'Rapid taps respect retry cooldown',
    );
    await delay(1100);
    await pressAudio();
    await waitFor(`__test.snapshot().sampleStatus==='failed'`);
    assert.equal(
      audioRequests,
      failedRequests + 1,
      'One retry on next gesture',
    );
    await delay(1100);
    assert.equal(
      audioRequests,
      failedRequests + 1,
      'Holding never retries automatically',
    );
    await pointer('pointercancel', 300, 300, 1);
    await releaseAudio();
    audioFailure = false;
    await pressAudio();
    await waitFor(`__test.snapshot().samples.length>0`);
    assert.equal(
      audioRequests,
      failedRequests + 2,
      'Recovery fetches once without reload',
    );
    assert.equal((await state()).sampleStatus, 'ready');
    await releaseAudio();
    report(
      'MP3: transient/continuous HTTP503, rapid-tap cooldown, no automatic hold retry, same-page recovery PASS',
    );

    for (const lifecycle of ['release', 'hidden', 'pagehide']) {
      let completeResponse;
      audioResponseGate = new Promise((resolve) => {
        completeResponse = resolve;
      });
      await call('Page.reload');
      await waitFor(
        `document.readyState==='complete' && window.__test?.snapshot().sampleStatus==='idle'`,
      );
      await delay(100);
      const requestsBefore = audioRequests;
      await pressAudio();
      await waitFor(`__test.snapshot().sampleStatus==='loading'`);
      for (let i = 0; i < 10; i++) {
        await pointer('pointerdown', 400, 300, 99);
        await pointer('pointerup', 400, 300, 99);
      }
      assert.equal(
        audioRequests,
        requestsBefore + 1,
        'Only one request while loading',
      );
      if (lifecycle === 'hidden') {
        await evaluate(
          `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))`,
        );
      } else if (lifecycle === 'pagehide') {
        await evaluate(
          `window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))`,
        );
      }
      await releaseAudio();
      const notesBefore = (await state()).notes.length;
      completeResponse();
      audioResponseGate = null;
      await waitFor(`__test.snapshot().sampleStatus==='ready'`);
      assert.equal((await state()).fingers, 0);
      assert.equal((await state()).samples.length, 0);
      assert.equal(
        (await state()).notes.length,
        notesBefore,
        'Late load never starts sound',
      );
      if (lifecycle === 'hidden') {
        await evaluate(
          `delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))`,
        );
      } else if (lifecycle === 'pagehide') {
        await evaluate(
          `window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))`,
        );
      }
      await delay(100);
      assert.equal(
        (await state()).notes.length,
        notesBefore,
        'Restore alone stays silent',
      );
      await pressAudio();
      await waitFor(`__test.snapshot().samples.length>0`);
      assert.equal(
        audioRequests,
        requestsBefore + 1,
        'Next gesture reuses decoded buffer',
      );
      await releaseAudio();
    }
    report(
      'MP3: in-flight request shared; delayed completion after release/hidden/pagehide stays silent; next gesture recovers PASS',
    );
    // Exercise the real hub → game → hub navigation and lifecycle cleanup.
    for (const [w, h] of [
      [320, 568],
      [390, 844],
      [1180, 820],
    ]) {
      await call('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: h,
        deviceScaleFactor: 2,
        mobile: true,
      });
      await call('Page.navigate', { url: origin + '/' });
      await delay(300);
      assert.equal(
        await evaluate('document.querySelectorAll(".game-card").length'),
        9,
      );
      assert.equal(
        await evaluate('document.querySelector("h1").textContent'),
        'すきなあそびを えらんでね！',
      );
      assert.equal(
        await evaluate(
          'document.querySelectorAll(".card-sub,.eyebrow,.intro p").length',
        ),
        0,
      );
      assert.equal(
        await evaluate('document.querySelectorAll(".character").length'),
        6,
      );
      assert.ok(
        await evaluate(
          `Promise.all([...document.querySelectorAll('.character')].map(image=>image.decode())).then(()=>true)`,
        ),
        'All supplied character SVGs load',
      );
      assert.ok(
        await evaluate('document.documentElement.scrollWidth<=innerWidth'),
      );
      await writeFile(
        join(root, `test-results/home-${w}.png`),
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
      for (let n = 0; n < 3; n++) {
        await evaluate('document.querySelector(".game-card").click()');
        await delay(300);
        assert.ok(await evaluate('!!window.__test'));
        assert.ok(
          await evaluate(
            `[...document.querySelectorAll('button,#back')].every(el=>{const r=el.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})`,
          ),
        );
        await pointer('pointerdown', 160, 200);
        await pointer('pointermove', 200, 250);
        await pointer('pointerup', 200, 250);
        assert.equal((await state()).flowers, 1);
        assert.equal(await evaluate('document.querySelector("#reset")'), null);
        if (n === 0) {
          await pressAudio();
          await waitFor(`__test.snapshot().samples.length>0`);
          assert.equal(
            (await state()).sampleStatus,
            'ready',
            'Fresh entry can play MP3',
          );
          await releaseAudio();
        }
        await evaluate('window.dispatchEvent(new Event("blur"))');
        const clean = await state();
        assert.equal(
          clean.points +
            clean.flowers +
            clean.particles +
            clean.fingers +
            clean.voices +
            clean.raf,
          0,
        );
        await evaluate('document.querySelector("#back").click()');
        await delay(300);
        assert.equal(await evaluate('document.title'), 'おもちゃボックス');
        assert.equal(
          await evaluate(`document.querySelector('.play-settings')`),
          null,
        );
      }
    }
    report(
      'Hub: 320/390/1180px, simplified copy, nine cards, 56px controls, lifecycle cleanup, return/re-entry x9, no horizontal overflow PASS',
    );
  }
  // Real touch input exercises pointer capture and the fog alpha mask.
  const fogAlpha = () =>
    evaluate(
      `(()=>{const c=document.querySelector('#fog');return c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data[3]})()`,
    );
  const waitFogReady = () =>
    evaluate(
      `(async()=>{for(let i=0;i<300;i++){if(!document.querySelector('#fog').hasAttribute('aria-busy'))return;await new Promise(requestAnimationFrame)}throw new Error('Fog image did not become ready')})()`,
    );
  const fogRect = () =>
    evaluate(
      `(()=>{const r=document.querySelector('#fog').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()`,
    );
  const assertWindowClip = async () => {
    assert.ok(
      await evaluate(`(() => {
        const pane = document.querySelector('.window-pane');
        const frame = document.querySelector('.window');
        const r = pane.getBoundingClientRect();
        const corners = [[r.left+1,r.top+1],[r.right-1,r.top+1],
          [r.left+1,r.bottom-1],[r.right-1,r.bottom-1]];
        return corners.every(([x,y]) => document.elementFromPoint(x,y) === frame)
          && getComputedStyle(frame).backgroundColor === 'rgb(255, 146, 47)'
          && getComputedStyle(pane).backgroundColor === 'rgb(241, 248, 249)'
          && Math.abs(r.width-r.height) < 1;
      })()`),
      'All four inner corners exclude image/fog layers and retain the orange frame',
    );
  };
  for (const [w, h] of [
    [320, 568],
    [390, 844],
    [820, 1180],
    [1180, 820],
    [844, 390],
  ]) {
    // Isolate each device's native input stream (Chromium CDP retains gesture state across navigations).
    const previous = await call('Target.getTargetInfo');
    const fresh = await call('Target.createTarget', { url: 'about:blank' });
    const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    ws.close();
    ws = new WebSocket(
      pages.find((t) => t.id === fresh.targetId).webSocketDebuggerUrl,
    );
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Runtime.exceptionThrown')
        errors.push(m.params.exceptionDetails);
      if (m.id) {
        const p = pending.get(m.id);
        if (!p) return;
        clearTimeout(p.timer);
        pending.delete(m.id);
        m.error ? p.reject(m.error) : p.resolve(m.result);
      }
    });
    await call('Runtime.enable');
    await call('Page.enable');
    await call('Target.closeTarget', {
      targetId: previous.targetInfo.targetId,
    });
    await call('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await call('Page.navigate', { url: origin + '/' });
    await waitFor(`!!document.querySelector('a[href="fukifuki-mado/"]')`);
    await evaluate(
      `document.querySelector('a[href="fukifuki-mado/"]').click()`,
    );
    await waitFor(
      `document.readyState==='complete' && !!document.querySelector('#fog')`,
    );
    await waitFogReady();
    await assertWindowClip();
    assert.equal(
      await evaluate('document.title'),
      'ふきふき、まど｜おもちゃボックス',
    );
    assert.ok(
      await evaluate(
        `document.querySelector('.window img').complete&&document.querySelector('.window img').naturalWidth>1000`,
      ),
    );
    assert.ok(
      await evaluate(
        `document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('button,#back')].every(e=>{const r=e.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.right<=innerWidth&&r.bottom<=innerHeight})`,
      ),
    );
    assert.equal(await fogAlpha(), 255);
    await writeFile(
      join(root, `test-results/window-fog-${w}.png`),
      Buffer.from(
        (await call('Page.captureScreenshot', { format: 'png' })).data,
        'base64',
      ),
    );
    await call('Emulation.setTouchEmulationEnabled', { enabled: false });
    await call('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 10,
    });
    await call('Page.bringToFront');
    await delay(500);
    let r = await fogRect();
    await evaluate(
      `window.touchLog=[];for(const t of ['pointerdown','pointerup','pointercancel','pointermove','touchstart','touchend'])document.addEventListener(t,e=>touchLog.push([t,e.target.tagName,e.clientX,e.clientY]))`,
    );
    for (let n = 0; n < 5; n++) {
      await call('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: r.x, y: r.y, id: 1 }],
      });
      await delay(50);
      await call('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: r.x + 25, y: r.y + 20, id: 1 }],
      });
      await call('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      assert.equal(
        await fogAlpha(),
        0,
        'Touch reveals center ' +
          JSON.stringify({
            w,
            n,
            r,
            log: await evaluate(
              '({events:touchLog,focus:document.hasFocus(),vv:[visualViewport.scale,visualViewport.offsetTop],el:document.elementFromPoint(195,340)?.tagName})',
            ),
          }),
      );
      if (n === 4) {
        await delay(550);
        await writeFile(
          join(root, `test-results/window-wiped-${w}.png`),
          Buffer.from(
            (await call('Page.captureScreenshot', { format: 'png' })).data,
            'base64',
          ),
        );
      }
      await evaluate(`document.querySelector('#cloud').click()`);
      await waitFogReady();
      assert.equal(await fogAlpha(), 255);
    }
    // Two fingers, cancellation, resize and re-entry.
    const sceneBeforeResize = await evaluate(
      `document.querySelector('#picture').src`,
    );
    await call('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: r.x, y: r.y, id: 1 },
        { x: r.x - 40, y: r.y - 40, id: 2 },
      ],
    });
    await call('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    assert.equal(await fogAlpha(), 0);
    await call('Emulation.setDeviceMetricsOverride', {
      width: h,
      height: w,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await delay(150);
    assert.equal(await fogAlpha(), 0, 'Resize preserves wiped picture');
    assert.equal(
      await evaluate(`document.querySelector('#picture').src`),
      sceneBeforeResize,
      'Resize preserves scene',
    );
    await evaluate(`document.querySelector('#cloud').click()`);
    await waitFogReady();
    assert.equal(await fogAlpha(), 255);
    await evaluate(`document.querySelector('#fog').focus()`);
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
    });
    await call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
    });
    assert.equal(await fogAlpha(), 0);
    await evaluate(`document.querySelector('#back').click()`);
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        await evaluate(`!!document.querySelector('a[href="fukifuki-mado/"]')`)
      )
        break;
      await delay(50);
    }
    assert.ok(
      await evaluate(`!!document.querySelector('a[href="fukifuki-mado/"]')`),
      'Hub ready after returning from window',
    );
    await evaluate(
      `document.querySelector('a[href="fukifuki-mado/"]').click()`,
    );
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        await evaluate(
          `document.readyState==='complete' && !!document.querySelector('#fog')`,
        )
      )
        break;
      await delay(50);
    }
    await waitFogReady();
    assert.equal(await fogAlpha(), 255);
  }
  // Force both ends of the random range to verify entry selection without flaky statistics.
  const windowScenes = JSON.parse(
    await readFile(join(root, 'src/fukifuki-mado/scenes.json'), 'utf8'),
  );
  for (const [random, initial] of [
    [0, 0],
    [0.999999, windowScenes.length - 1],
  ]) {
    const script = await call('Page.addScriptToEvaluateOnNewDocument', {
      source: `Math.random = () => ${random}`,
    });
    await call('Page.reload');
    await delay(250);
    for (let step = 0; step <= windowScenes.length; step++) {
      await waitFogReady();
      const scene = windowScenes[(initial + step) % windowScenes.length];
      assert.equal(
        await evaluate(
          `document.querySelector('#picture').getAttribute('src')`,
        ),
        assetPath(`fukifuki-mado/assets/${scene.id}.webp`),
      );
      assert.equal(
        await evaluate(`document.querySelector('#picture').alt`),
        scene.alt,
      );
      await evaluate(`document.querySelector('#picture').decode()`);
      const matchesFog = await evaluate(`(async()=>{
        const fog = new Image();
        fog.src = ${JSON.stringify(assetPath(`fukifuki-mado/assets/fog/${scene.id}.webp`))};
        await fog.decode();
        const actual = document.querySelector('#fog');
        const expected = document.createElement('canvas');
        expected.width = actual.width; expected.height = actual.height;
        const expectedCtx = expected.getContext('2d');
        expectedCtx.drawImage(fog, 0, 0, expected.width, expected.height);
        const ctx = actual.getContext('2d');
        return [0.2,0.5,0.8].every(x => [0.2,0.5,0.8].every(y => {
          const a = ctx.getImageData(actual.width*x,actual.height*y,1,1).data;
          const b = expectedCtx.getImageData(expected.width*x,expected.height*y,1,1).data;
          return [...a].every((v,i) => Math.abs(v-b[i]) <= 3);
        }));
      })()`);
      assert.ok(matchesFog, `${scene.id}: correct pre-rendered fog is drawn`);
      assert.equal(
        await fogAlpha(),
        255,
        'Every next scene starts fully fogged',
      );
      await evaluate(`document.querySelector('#fog').focus()`);
      await call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: ' ',
        code: 'Space',
        windowsVirtualKeyCode: 32,
      });
      assert.equal(await fogAlpha(), 0, 'Every scene can be wiped');
      await evaluate(`document.querySelector('#cloud').click()`);
      await waitFogReady();
    }
    await call('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: script.identifier,
    });
  }
  report(
    'Window: random first/last selection, all six sharp/fog pairs decode, fog pixels match, wiping, alt text, full cycle and resize preserves scene PASS',
  );
  // Deliberately finish the first fog download last to exercise stale async results.
  await call('Network.enable');
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  const forcedGarden = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `Math.random = () => 0;
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = async function() {
        await decode.call(this);
        await new Promise(resolve => setTimeout(resolve, 350));
      };`,
  });
  fogDelay = 300;
  await call('Page.reload');
  await delay(150);
  assert.equal(
    await evaluate(`document.querySelector('#fog').getAttribute('aria-busy')`),
    'true',
  );
  await evaluate(`document.querySelector('#fog').focus()`);
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
  });
  assert.equal(
    await fogAlpha(),
    255,
    'Loading scene cannot be wiped to reveal the previous picture',
  );
  await assertWindowClip();
  await writeFile(
    join(root, 'test-results/window-corners-loading.png'),
    Buffer.from(
      (await call('Page.captureScreenshot', { format: 'png' })).data,
      'base64',
    ),
  );
  await evaluate(
    `for(let i=0;i<5;i++)document.querySelector('#cloud').click()`,
  );
  await waitFogReady();
  await assertWindowClip();
  const latestScene = assetPath('fukifuki-mado/assets/shapes-hello.webp');
  assert.equal(
    await evaluate(`document.querySelector('#picture').getAttribute('src')`),
    latestScene,
  );
  await delay(950);
  assert.equal(
    await evaluate(`document.querySelector('#picture').getAttribute('src')`),
    latestScene,
    'Late initial decode cannot overwrite the latest scene',
  );
  fogDelay = 0;
  fogFailure = true;
  await call('Page.reload');
  await delay(250);
  await waitFogReady();
  assert.ok(
    (await fogAlpha()) > 200,
    'Missing fog asset falls back to a milky veil',
  );
  await evaluate(`document.querySelector('#fog').focus()`);
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
  });
  assert.equal(await fogAlpha(), 0, 'Fallback remains playable');
  fogFailure = false;
  await evaluate(`document.querySelector('#cloud').click()`);
  await waitFogReady();
  assert.equal(await fogAlpha(), 255, 'Next scene recovers normal fog');
  await call('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: forcedGarden.identifier,
  });
  await call('Network.setCacheDisabled', { cacheDisabled: false });
  report(
    'Window: delayed fog, loading input guard, rapid next presses, out-of-order decode, HTTP503 fallback and recovery PASS',
  );
  const cancelPoint = await fogRect();
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: cancelPoint.x, y: cancelPoint.y, id: 1 }],
  });
  await call('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  await evaluate(
    `for(let i=0;i<100;i++)document.querySelector('#cloud').click()`,
  );
  assert.equal(await fogAlpha(), 255);
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('#shine')).animationName`,
    ),
    'none',
  );
  report(
    'Window: 320/390/820/1180/844 widths, image decode, real CDP touch wiping/re-fog x25, multi-touch/cancel, resize preserves mask, keyboard, return/re-entry x5, reset x100, reduced motion, 56px targets PASS',
  );
  assert.deepEqual(errors, []);
  report('No browser JavaScript exceptions PASS');
  await writeFile(
    join(root, 'test-results', 'results.txt'),
    reports.join('\n') + '\n',
  );
  console.log('Browser regression PASS');
} finally {
  ws?.close();
  chrome.kill();
  server.close();
  productionServer.close();
  await delay(400);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
