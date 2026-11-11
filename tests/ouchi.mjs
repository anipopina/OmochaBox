import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticServer } from './static-server.mjs';

// Browser checks for おうちバラバラ. Headless Chromium renders WebGL through
// SwiftShader, so this verifies behaviour and framing, not device frame rate.
const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'ouchi-browser-'));
const output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const server = createStaticServer(
  process.env.OUCHI_BUILD || join(root, 'dist'),
);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(
  process.env.CHROME_PATH || '/usr/bin/chromium',
  [
    '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const reports = [];
const errors = [];
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
      }, 30000);
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
    source: `
window.soundTest={contexts:[],starts:[],active:new Set(),maximum:0,fetches:[],decodes:0,loads:[],resumes:[]};
const originalFetch=window.fetch;
window.fetch=async (...args)=>{
  if(/\\.mp3(?:$|\\?)/.test(String(args[0]))){
    soundTest.fetches.push(String(args[0]));
    if(soundTest.failLoads)return new Response('',{status:503});
    if(soundTest.holdLoads)await new Promise(r=>soundTest.loads.push(r));
  }
  return originalFetch(...args);
};
const NativeAudio=window.AudioContext;
window.AudioContext=class extends NativeAudio {
  constructor(...args){super(...args);soundTest.contexts.push(this)}
  get state(){return soundTest.holdResume?'suspended':super.state}
  resume(){const result=super.resume();return soundTest.holdResume?new Promise(r=>soundTest.resumes.push(()=>result.then(r))):result}
  async decodeAudioData(...args){const buffer=await super.decodeAudioData(...args);soundTest.decodes++;return buffer}
  createBufferSource(){
    const source=super.createBufferSource(),start=source.start.bind(source),stop=source.stop.bind(source);
    source.start=(...args)=>{
      soundTest.starts.push({duration:source.buffer.duration,time:performance.now()});
      soundTest.active.add(source);soundTest.maximum=Math.max(soundTest.maximum,soundTest.active.size);
      source.addEventListener('ended',()=>soundTest.active.delete(source),{once:true});
      return start(...args);
    };
    source.stop=(...args)=>{soundTest.active.delete(source);return stop(...args)};
    return source;
  }
};`,
  });
  const waitFor = async (expression, timeout = 20000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
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
  const field = (key) =>
    evaluate(`document.querySelector('#field').dataset.${key}`);
  const visit = async () => {
    const previous = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + '/ouchi-barabara/' });
    await waitFor(
      `performance.timeOrigin !== ${previous} && document.readyState === 'complete' && document.querySelector('#field')?.dataset.ready==='true'`,
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
  const tap = async (x, y) => {
    await call('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    });
    await call('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  };
  const idle = () =>
    waitFor(
      "(d=>d.running==='false' && (d.state==='ready'||d.state==='rubble'))(document.querySelector('#field').dataset)",
      60000,
    );

  for (const [width, height] of [
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
    await visit();
    assert.equal(
      await evaluate('soundTest.contexts.length'),
      0,
      'No audio before input',
    );
    // Count how often the next-house button (and its entrance animation)
    // appears.
    await evaluate(`window.nextShows = 0; new MutationObserver(() => {
      if (!document.querySelector('#next').hidden) window.nextShows++;
    }).observe(document.querySelector('#next'), { attributes: true })`);
    assert.ok(await evaluate("document.querySelector('#fallback').hidden"));
    assert.equal(await field('state'), 'ready');
    // The back button stays reachable above the full-screen field.
    assert.ok(
      await evaluate(`(()=>{const a=document.querySelector('#back');const r=a.getBoundingClientRect();
        const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>=56&&(hit===a||a.contains(hit))})()`),
    );
    await shot(`ouchi-${width}x${height}-start`);
    await tap(width * 0.6, height * 0.5);
    assert.ok(
      ['attacking', 'moving'].includes(await field('state')),
      'Tap starts an attack at once',
    );
    await waitFor("document.querySelector('#field').dataset.hits==='1'");
    await waitFor('soundTest.decodes===4');
    assert.ok(
      await evaluate('soundTest.starts.some(s=>Math.abs(s.duration-0.7)<0.01)'),
      `A real decoded impact sample plays at the first hit: ${JSON.stringify(await evaluate('({starts:soundTest.starts,states:soundTest.contexts.map(c=>c.state)})'))}`,
    );
    await delay(250);
    await shot(`ouchi-${width}x${height}-hit`);
    const error = Number(await field('impactError'));
    assert.ok(error < 0.02, `Bucket teeth land on the target (${error})`);
    // Rapid taps queue at most two more attacks and never overlap them.
    for (let i = 0; i < 10; i++) await tap(width * 0.6, height * 0.5);
    assert.ok(Number(await field('queued')) <= 2, 'Queue capped');
    await idle();
    const afterBurst = Number(await field('hits'));
    assert.ok(afterBurst >= 2 && afterBurst <= 4, `hits ${afterBurst}`);
    while ((await field('attack')) !== '4') {
      await tap(width * 0.6, height * 0.5);
      if ((await field('attack')) !== '4') await idle();
    }
    await waitFor("document.querySelector('#field').dataset.hits==='4'");
    await delay(450);
    await shot(`ouchi-${width}x${height}-collapse`);
    await idle();
    assert.equal(await field('hits'), '4', 'House collapses in four hits');
    assert.equal(await field('standing'), '0', 'No piece is left standing');
    assert.ok(
      await evaluate('soundTest.starts.some(s=>Math.abs(s.duration-2.0)<0.01)'),
      'The final impact uses the longer collapse sample',
    );
    assert.equal(
      await evaluate(
        'soundTest.starts.filter(s=>Math.abs(s.duration-0.7)<0.01).length',
      ),
      4,
      'Every demolition hit, including the final hit, keeps its impact sound',
    );
    assert.ok(
      await evaluate(`(()=>{const sounds=soundTest.starts;const collapse=sounds.findIndex(s=>Math.abs(s.duration-2.0)<0.01);
      return collapse>0&&Math.abs(sounds[collapse].time-sounds[collapse-1].time)<10})()`),
      'Final impact and collapse play together',
    );
    await delay(300);
    await shot(`ouchi-${width}x${height}-rubble`);
    assert.equal(
      await evaluate("document.querySelector('#next').hidden"),
      false,
      'Next-house button appears once the house is rubble',
    );
    assert.ok(
      await evaluate(`(()=>{const r=document.querySelector('#next').getBoundingClientRect();
        return r.width>=56&&r.right<=innerWidth&&r.bottom<=innerHeight})()`),
    );
    // Rubble play: a tap knocks debris instead of doing nothing.
    await tap(width * 0.6, height * 0.5);
    await waitFor("document.querySelector('#field').dataset.pokes==='1'");
    assert.ok(
      await evaluate(
        'soundTest.starts.some(s=>Math.abs(s.duration-0.902)<0.01)',
      ),
      'Rubble play uses the lighter sample',
    );
    await idle();
    assert.equal(
      await field('hits'),
      '4',
      'Rubble play is not a demolition hit',
    );
    assert.equal(
      await evaluate('window.nextShows'),
      1,
      'Next-house button enters once, and stays during rubble play',
    );
    if (width === 1280) {
      // Rubble play follows the rough direction of the tap: the lower part
      // of the screen is the near (+Z) side, the upper part the far side.
      const aimAt = async (y) => {
        let sum = 0;
        for (let i = 0; i < 3; i++) {
          await tap(width * 0.6, y);
          await delay(100);
          sum += Number(await field('pokeZ'));
          await idle();
        }
        return sum / 3;
      };
      const near = await aimAt(height * 0.85);
      const far = await aimAt(height * 0.25);
      assert.ok(
        near > far,
        `Tap direction steers rubble play (${near} vs ${far})`,
      );
      // Long press keeps swinging one at a time until the finger lifts.
      await call('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: width * 0.6, y: height * 0.5, id: 1 }],
      });
      await delay(2600);
      assert.equal(await field('holding'), 'true');
      await call('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await idle();
      const pokes = Number(await field('pokes'));
      assert.ok(pokes >= 3, `Held press repeats rubble swings (${pokes})`);
      // Drive on to the next house and demolish it too.
      await evaluate("document.querySelector('#next').click()");
      assert.equal(await field('state'), 'transition');
      assert.equal(
        await evaluate("document.querySelector('#next').hidden"),
        true,
      );
      await tap(width * 0.6, height * 0.5);
      await delay(1600);
      await shot(`ouchi-${width}x${height}-travel`);
      await idle();
      assert.equal(await field('houses'), '1', 'Arrived at the next house');
      assert.ok(
        await evaluate('soundTest.starts.some(s=>Math.abs(s.duration-6)<0.01)'),
        'Driving starts the motor sample',
      );
      assert.equal(
        await field('camera'),
        '0.00',
        'Scene recentred after arrival',
      );
      assert.equal(
        await field('hits'),
        '0',
        'Taps during the drive are ignored',
      );
      assert.equal(
        await field('standing'),
        await field('pieces'),
        'New building stands whole',
      );
      await shot(`ouchi-${width}x${height}-next-house`);
      await tap(width * 0.6, height * 0.5);
      await waitFor("document.querySelector('#field').dataset.hits==='1'");
      assert.ok(
        Number(await field('impactError')) < 0.02,
        'Aim holds after recentring',
      );
      await idle();
    }
    assert.equal(
      await evaluate('soundTest.contexts.length'),
      1,
      'One context per visit',
    );
    assert.equal(
      await evaluate('soundTest.fetches.length'),
      4,
      'Each sample fetched once',
    );
    assert.ok(
      await evaluate('soundTest.maximum<=3'),
      'At most three concurrent voices',
    );
    assert.equal(
      await evaluate('soundTest.active.size'),
      0,
      'Idle leaves no playing nodes',
    );
    assert.equal(
      await evaluate('soundTest.contexts[0].state'),
      'suspended',
      'Idle suspends audio',
    );
    report(
      `${width}x${height}: tap, queue cap, 4-hit collapse, rubble play, idle loop stop PASS`,
    );
  }

  // Developer frame-rate readout appears only with ?fps.
  assert.equal(await evaluate("document.querySelector('#fps')"), null);
  {
    const previous = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + '/ouchi-barabara/?fps' });
    await waitFor(
      `performance.timeOrigin !== ${previous} && document.querySelector('#field')?.dataset.ready==='true'`,
    );
    await tap(400, 400);
    await waitFor(
      "/fps/.test(document.querySelector('#fps')?.textContent ?? '')",
    );
    await idle();
  }

  // Keyboard: Enter attacks, held repeat does not.
  await visit();
  await evaluate("document.querySelector('#field').focus()");
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
  });
  await waitFor("document.querySelector('#field').dataset.hits==='1'");
  await idle();

  // Hidden page: stops the loop and drops queued taps; nothing restarts by itself.
  await tap(400, 400);
  await tap(400, 400);
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'))`);
  assert.equal(await field('running'), 'false');
  assert.equal(await field('queued'), '0');
  assert.equal(
    await evaluate('soundTest.active.size'),
    0,
    'Hidden page stops all sound',
  );
  const hitsWhileHidden = await field('hits');
  await tap(400, 400);
  await delay(300);
  assert.equal(await field('hits'), hitsWhileHidden, 'No input while hidden');
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
    document.dispatchEvent(new Event('visibilitychange'))`);
  await idle();
  assert.ok(Number(await field('hits')) <= 3, 'Dropped taps are not replayed');

  // Back-forward cache return starts with a fresh house.
  await evaluate(`window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))`);
  assert.equal(await field('hits'), '0');
  assert.equal(await field('state'), 'ready');
  assert.equal(
    await evaluate('soundTest.contexts[0].state'),
    'closed',
    'Pagehide closes audio',
  );
  report('Keyboard, hidden-page stop, bfcache reset PASS');

  // Loading or resuming may finish after the action or after a page is hidden.
  await visit();
  await evaluate('soundTest.holdLoads=true');
  await tap(400, 400);
  await waitFor("document.querySelector('#field').dataset.hits==='1'");
  assert.equal(await evaluate('soundTest.starts.length'), 0);
  await evaluate(
    'soundTest.holdLoads=false;soundTest.loads.splice(0).forEach(r=>r())',
  );
  await waitFor('soundTest.decodes===4');
  await delay(200);
  assert.equal(
    await evaluate('soundTest.starts.length'),
    0,
    'Late load never replays an impact',
  );
  await idle();
  await tap(400, 400);
  await waitFor("document.querySelector('#field').dataset.hits==='2'");
  assert.ok(
    await evaluate('soundTest.starts.length>0'),
    'Later gesture can use loaded audio',
  );

  await visit();
  await evaluate('soundTest.holdResume=true');
  await tap(400, 400);
  await waitFor("document.querySelector('#field').dataset.hits==='1'");
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'));
    soundTest.holdResume=false;soundTest.resumes.splice(0).forEach(r=>r())`);
  await delay(250);
  assert.equal(
    await evaluate('soundTest.starts.length'),
    0,
    'Late resume stays silent while hidden',
  );
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
    document.dispatchEvent(new Event('visibilitychange'))`);
  await delay(250);
  assert.equal(
    await evaluate('soundTest.starts.length'),
    0,
    'Visibility restoration does not resume sound',
  );

  await visit();
  await evaluate('soundTest.failLoads=true');
  await tap(400, 400);
  await waitFor("document.querySelector('#field').dataset.hits==='1'");
  await evaluate(`for(let i=0;i<100;i++)document.querySelector('#field').dispatchEvent(
    new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  assert.equal(
    await evaluate('soundTest.fetches.length'),
    4,
    'Failures do not trigger a fetch storm',
  );
  assert.equal(await evaluate('soundTest.starts.length'), 0);

  await visit();
  await evaluate(
    "window.AudioContext=class {constructor(){throw new Error('unavailable')}}",
  );
  await tap(400, 400);
  await waitFor("document.querySelector('#field').dataset.hits==='1'");
  report(
    'Decoded audio, cue timing, voice/cache limits, delayed load/resume, HTTP503 and unavailable audio PASS',
  );

  await visit();
  await tap(400, 400);
  await waitFor('soundTest.starts.length===1');
  await evaluate("window.dispatchEvent(new Event('blur'))");
  assert.equal(
    await evaluate('soundTest.active.size'),
    0,
    'Blur stops a playing impact',
  );
  await delay(350);
  assert.equal(
    await evaluate('soundTest.starts.length'),
    1,
    'Blur never schedules a replacement',
  );
  await waitFor("document.querySelector('#field').dataset.state==='ready'");
  await call('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 400, y: 400, id: 1 }],
  });
  await waitFor("document.querySelector('#field').dataset.hits==='2'");
  await call('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  assert.equal(
    await evaluate('soundTest.active.size'),
    0,
    'Pointer cancellation stops sound',
  );
  report('Audio stops on blur and trusted touch cancellation PASS');

  // Reduced motion still breaks the house visibly.
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await visit();
  await tap(400, 400);
  await waitFor("document.querySelector('#field').dataset.hits==='1'");
  await delay(400);
  await shot('ouchi-reduced-hit');
  await idle();
  for (let i = 0; i < 6 && (await field('state')) !== 'rubble'; i++) {
    await tap(400, 400);
    await idle();
  }
  await evaluate("document.querySelector('#next').click()");
  await idle();
  assert.equal(await field('houses'), '1', 'Reduced motion still drives on');
  report('Reduced motion attack and drive to the next house PASS');

  assert.equal(errors.length, 0, JSON.stringify(errors));
  await writeFile(join(output, 'ouchi-results.txt'), reports.join('\n'));
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
