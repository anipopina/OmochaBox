import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  readFile,
  writeFile,
  readdir,
  mkdir,
  mkdtemp,
  rm,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const identities = JSON.parse(
  await readFile(
    join(
      root,
      'source-assets/ouchi-barabara/audio/review/candidate-identities.json',
    ),
    'utf8',
  ),
);
// The review is a development route, never a published page or asset bundle.
for (const file of await readdir(join(root, 'dist/assets'))) {
  assert.ok(
    !/^(hit|collapse|rubble|drive)-[bc]-/.test(file),
    `Candidate published: ${file}`,
  );
  if (file.endsWith('.js'))
    assert.ok(
      !(await readFile(join(root, 'dist/assets', file), 'utf8')).includes(
        'ouchi-barabara-audio-fixed-v1',
      ),
    );
}
const manifest = JSON.parse(
  await readFile(join(root, 'dist/.vite/manifest.json'), 'utf8'),
);
assert.ok(
  !Object.keys(manifest).some((key) => key.includes('/sound-review/')),
  'No review modules or samples published',
);
const server = await createServer({
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'ouchi-review-'));
const output = join(root, 'test-results');
await mkdir(output, { recursive: true });
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
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [];
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
  await new Promise((resolve) =>
    ws.addEventListener('open', resolve, { once: true }),
  );
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown')
      errors.push(message.params.exceptionDetails);
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    if (message.error) request.reject(message.error);
    else request.resolve(message.result);
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timeout`));
      }, 30000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const response = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (response.exceptionDetails)
      throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const waitFor = async (expression) => {
    for (let i = 0; i < 200; i++) {
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
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `
window.reviewAudio={starts:[],sources:new Set(),contexts:[],fetches:[],releases:[],delayed:false};
const nativeFetch=fetch;window.fetch=async(...args)=>{
 if(/\\.mp3(?:$|\\?)/.test(String(args[0]))){reviewAudio.fetches.push(String(args[0]));
 if(reviewAudio.fail)return new Response('',{status:503});
 if(reviewAudio.delayed)await new Promise(r=>reviewAudio.releases.push(r));}
 return nativeFetch(...args);
};
const Native=AudioContext;window.AudioContext=class extends Native {
 constructor(...args){super(...args);reviewAudio.contexts.push(this)}
 createBufferSource(){const node=super.createBufferSource(),start=node.start.bind(node),stop=node.stop.bind(node);
 node.start=(...args)=>{reviewAudio.starts.push(node.buffer.duration);reviewAudio.sources.add(node);node.addEventListener('ended',()=>reviewAudio.sources.delete(node));return start(...args)};
 node.stop=(...args)=>{reviewAudio.sources.delete(node);return stop(...args)};return node;}
};
window.downloads=[];
const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){
 if(this.download){window.downloads.push(fetch(this.href).then(r=>r.text()));return;}return click.call(this)};
`,
  });
  let visitIndex = 0;
  const visit = async (query = 'sound-review') => {
    const before = await evaluate('performance.timeOrigin');
    await call('Page.navigate', {
      url: `${origin}/ouchi-barabara/?${query}&review-visit=${++visitIndex}`,
    });
    await waitFor(
      `performance.timeOrigin!==${before} && document.querySelector('${query === 'sound-review' ? '.review' : '#field'}')?.dataset.ready==='true'`,
    );
  };
  const click = (selector) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const shot = async (name) =>
    writeFile(
      join(output, name + '.png'),
      Buffer.from(
        (
          await call('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: false,
          })
        ).data,
        'base64',
      ),
    );
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await visit();
  assert.equal(
    await evaluate("document.querySelectorAll('[data-candidate]').length"),
    identities.length,
  );
  assert.deepEqual(
    await evaluate(
      "Array.from(document.querySelectorAll('[data-candidate]'),e=>e.dataset.candidate)",
    ),
    identities.map((candidate) => candidate.id),
  );
  assert.ok(
    await evaluate(
      "document.querySelector('[data-candidate=drive-c]').textContent.includes('採用中')",
    ),
  );
  assert.ok(
    await evaluate(
      "!document.querySelector('[data-candidate=drive-a]').textContent.includes('採用中')",
    ),
  );
  assert.equal(
    await evaluate('reviewAudio.contexts.length'),
    0,
    'No automatic audio',
  );
  assert.ok(
    await evaluate(
      `Array.from(document.querySelectorAll('button,.choice,.game-link,textarea')).filter(e=>e.getClientRects().length).every(e=>{const r=e.getBoundingClientRect();return r.width>=56&&r.height>=56})`,
    ),
    'Large controls',
  );
  await shot('ouchi-sound-review-desktop');

  // Actual browser decode of every candidate, cancellation on every switch.
  for (const { id } of identities) {
    const before = await evaluate('reviewAudio.starts.length');
    await click(`[data-play="${id}"][data-count="1"]`);
    await waitFor(`reviewAudio.starts.length>${before}`);
    assert.ok(
      await evaluate('reviewAudio.sources.size<=1'),
      'Switch stops previous sample',
    );
  }
  assert.equal(await evaluate('reviewAudio.contexts.length'), 1);
  assert.equal(await evaluate('reviewAudio.fetches.length'), identities.length);
  await evaluate(
    "document.querySelector('[data-candidate=collapse-d]').scrollIntoView({block:'start'})",
  );
  await shot('ouchi-sound-review-fixed-added');
  await evaluate(
    "document.querySelector('[data-scene=drive]').scrollIntoView({block:'start'})",
  );
  await shot('ouchi-sound-review-fixed-adopted');
  await evaluate(
    "document.querySelector('[data-candidate=collapse-f]').scrollIntoView({block:'start'})",
  );
  await shot('ouchi-sound-review-collapse-fg');
  await evaluate(
    "document.querySelector('[data-scene=crumble]').scrollIntoView({block:'start'})",
  );
  await shot('ouchi-sound-review-crumble');
  await click('a[href="#candidate-collapse-k"]');
  await shot('ouchi-sound-review-fresh-collapse');
  await click('a[href="#candidate-crumble-f"]');
  await shot('ouchi-sound-review-fresh-crumble');
  await click('[data-play="hit-b"][data-count="3"]');
  await waitFor('reviewAudio.sources.size===3');
  assert.equal(
    await evaluate('reviewAudio.fetches.length'),
    identities.length,
    'Decoded samples reused',
  );
  await click('#stop');
  assert.equal(
    await evaluate('reviewAudio.sources.size'),
    0,
    'Stop cancels scheduled repeats',
  );
  const stopped = await evaluate('reviewAudio.starts.length');
  await delay(1100);
  assert.equal(await evaluate('reviewAudio.starts.length'), stopped);

  await click('input[value="hit-b"]');
  await click('[data-confirm="singleConfirmed"][data-id="hit"]');
  await click('[data-confirm="gameConfirmed"][data-id="hit"]');
  await evaluate(
    `const note=document.querySelector('#note-hit');note.value='音色は好き。もう少し短く。';note.dispatchEvent(new Event('input',{bubbles:true}))`,
  );
  await click('input[value="hit-c"]');
  assert.equal(
    await evaluate(
      'document.querySelector(\'[data-confirm="gameConfirmed"][data-id="hit"]\').checked',
    ),
    false,
    'Changing sound clears confirmation',
  );
  await click('input[name="collapse"][value="redo"]');
  await click('input[name="rubble"][value="none"]');
  await click('[data-confirm="gameConfirmed"][data-id="rubble"]');
  await click('input[value="drive-b"]');
  await click('#add-request');
  await evaluate(`for(const [key,value] of Object.entries({scene:'アームを振り上げる',timing:'動き始め',sound:'やわらかい機械音',note:'短め。声は不要。'})){
    const input=document.querySelector('[data-request-field="'+key+'"]');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}`);
  await click('#add-request');
  assert.equal(
    await evaluate("document.querySelectorAll('.request-card').length"),
    2,
  );
  await click('.request-card:last-child [data-remove-request]');
  await visit();
  assert.equal(
    await evaluate("document.querySelectorAll('.request-card').length"),
    1,
    'Additional requests restored',
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-request-field=scene]').value",
    ),
    'アームを振り上げる',
  );
  assert.ok(
    await evaluate('document.querySelector(\'input[value="hit-c"]\').checked'),
    'Draft restored',
  );
  assert.equal(
    await evaluate("document.querySelector('#note-hit').value"),
    '音色は好き。もう少し短く。',
  );
  await click('#export');
  const exported = await evaluate('downloads[0]');
  assert.equal(JSON.parse(exported).scenes.hit.choice, 'hit-c');
  assert.equal(JSON.parse(exported).scenes.rubble.gameConfirmed, true);
  await evaluate(
    `window.copiedSelection='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedSelection=text}}})`,
  );
  await click('#copy');
  await waitFor(
    "document.querySelector('#notice').textContent.includes('コピーしました')",
  );
  assert.equal(
    await evaluate('copiedSelection'),
    exported,
    'Copy matches the complete exported selection including requests',
  );
  await evaluate(
    `navigator.clipboard.writeText=async()=>{throw new Error('blocked')}`,
  );
  await click('#copy');
  await waitFor("!document.querySelector('#manual-copy').hidden");
  assert.equal(
    await evaluate("document.querySelector('#copy-text').value"),
    exported,
  );
  await click('#select-copy');
  await shot('ouchi-sound-review-manual-copy');
  assert.ok(
    await evaluate(
      "(e=>e.selectionStart===0&&e.selectionEnd===e.value.length)(document.querySelector('#copy-text'))",
    ),
  );
  assert.equal(JSON.parse(exported).version, 2);
  assert.equal(JSON.parse(exported).additions[0].timing, '動き始め');
  assert.equal(JSON.parse(exported).additions[0].sound, 'やわらかい機械音');
  assert.equal(JSON.parse(exported).additions[0].note, '短め。声は不要。');
  const importFile = async (text) =>
    evaluate(
      `(()=>{const file=new File([${JSON.stringify(text)}],'review.json',{type:'application/json'}),data=new DataTransfer();data.items.add(file);const input=document.querySelector('#file');input.files=data.files;input.dispatchEvent(new Event('change'))})()`,
    );
  await click('input[value="hit-a"]');
  await importFile(exported);
  await waitFor(
    "document.querySelector('#notice').textContent.includes('読み戻しました')",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-request-field=sound]').value",
    ),
    'やわらかい機械音',
    'Additional requests included in imported JSON',
  );
  assert.ok(
    await evaluate('document.querySelector(\'input[value="hit-c"]\').checked'),
  );
  const malformed = JSON.parse(exported);
  malformed.scenes.hit.choice = 'drive-c';
  await importFile(JSON.stringify(malformed));
  await waitFor(
    "document.querySelector('#notice').textContent.includes('読み戻せません')",
  );
  assert.ok(
    await evaluate('document.querySelector(\'input[value="hit-c"]\').checked'),
    'Invalid import keeps current draft',
  );
  const invalidRequest = JSON.parse(exported);
  invalidRequest.additions[0].timing = 42;
  await importFile(JSON.stringify(invalidRequest));
  await waitFor(
    "document.querySelector('#notice').textContent.includes('読み戻せません')",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-request-field=timing]').value",
    ),
    '動き始め',
    'Invalid request preserves existing text',
  );
  await evaluate(
    "document.querySelector('.requests').scrollIntoView({block:'start'})",
  );
  await shot('ouchi-sound-review-requests-desktop');
  await evaluate(
    'window.previewUrls=[];window.open=url=>{previewUrls.push(url);return null}',
  );
  await click('#preview');
  assert.equal(
    await evaluate('previewUrls[0]'),
    '/ouchi-barabara/?sound-preview=hit-c,redo,none,drive-b,none',
  );
  const previousDraft = JSON.parse(exported);
  previousDraft.catalog = 'ouchi-barabara-audio-2026-11-11-v2';
  delete previousDraft.scenes.crumble;
  previousDraft.scenes.collapse.choice = 'collapse-b';
  previousDraft.scenes.rubble.choice = 'rubble-c';
  previousDraft.scenes.drive.choice = 'drive-a';
  await evaluate(`localStorage.removeItem('ouchi-barabara:sound-review:fixed-v1');
    localStorage.setItem('ouchi-barabara:sound-review:v2',${JSON.stringify(JSON.stringify(previousDraft))})`);
  await visit();
  assert.ok(
    await evaluate("document.querySelector('input[value=collapse-d]').checked"),
    'Renumbered collapse B becomes fixed D',
  );
  assert.ok(
    await evaluate("document.querySelector('input[value=rubble-e]').checked"),
  );
  assert.ok(
    await evaluate("document.querySelector('input[value=drive-c]').checked"),
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-request-field=scene]').value",
    ),
    'アームを振り上げる',
    'Saved additional requests preserved',
  );
  assert.equal(
    await evaluate("document.querySelector('#note-hit').value"),
    '音色は好き。もう少し短く。',
  );
  await importFile(
    await readFile(
      join(
        root,
        'source-assets/ouchi-barabara/audio/review/selections/2026-11-11-v1.json',
      ),
      'utf8',
    ),
  );
  await waitFor(
    "document.querySelector('#notice').textContent.includes('読み戻しました')",
  );
  assert.ok(
    await evaluate("document.querySelector('input[value=drive-c]').checked"),
    'Original C keeps its identity on import',
  );
  await importFile(exported);
  await waitFor(
    "document.querySelector('#note-hit').value==='音色は好き。もう少し短く。'",
  );

  // A stale decode cannot interrupt a later sample or start after backgrounding.
  await visit();
  await evaluate('reviewAudio.delayed=true');
  await click('[data-play="hit-b"][data-count="1"]');
  await click('[data-play="hit-c"][data-count="1"]');
  await evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));reviewAudio.delayed=false;reviewAudio.releases.splice(0).forEach(r=>r())`,
  );
  await delay(300);
  assert.equal(await evaluate('reviewAudio.starts.length'), 0);
  await evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))`,
  );
  await delay(100);
  assert.equal(await evaluate('reviewAudio.starts.length'), 0);
  await click('[data-play="hit-c"][data-count="1"]');
  await waitFor('reviewAudio.starts.length===1');
  await evaluate("window.dispatchEvent(new Event('blur'))");
  assert.equal(await evaluate('reviewAudio.sources.size'), 0);
  await evaluate('reviewAudio.fail=true');
  await click('[data-play="drive-b"][data-count="1"]');
  await waitFor(
    "document.querySelector('#playback').textContent.includes('再生できません')",
  );
  await evaluate(`window.dispatchEvent(new Event('pagehide'))`);
  await waitFor('reviewAudio.contexts[0].state==="closed"');

  await visit();
  await evaluate(`Storage.prototype.setItem=()=>{throw new Error('storage blocked')};
    window.AudioContext=class {constructor(){throw new Error('audio blocked')}}`);
  await click('input[value="hit-b"]');
  assert.ok(
    await evaluate(
      "document.querySelector('#storage').textContent.includes('保存できません')",
    ),
  );
  await click('[data-play="hit-b"][data-count="1"]');
  await waitFor(
    "document.querySelector('#playback').textContent.includes('再生できません')",
  );
  await click('#export');
  assert.equal(
    JSON.parse(await evaluate('downloads[0]')).scenes.hit.choice,
    'hit-b',
    'Export still works with storage and audio blocked',
  );

  for (const [width, height] of [
    [390, 844],
    [320, 740],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await call('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await visit();
    assert.ok(
      await evaluate('document.documentElement.scrollWidth<=innerWidth'),
      'No horizontal overflow',
    );
    await shot(`ouchi-sound-review-${width}`);
    await evaluate(
      `const card=document.querySelector('.candidate');window.scrollTo(0,card.getBoundingClientRect().top+scrollY-140)`,
    );
    await delay(100);
    assert.ok(
      await evaluate(
        `(()=>{const r=document.querySelector('#stop').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()`,
      ),
      'Stop remains visible while comparing',
    );
    await shot(`ouchi-sound-review-${width}-candidates`);
    await evaluate(
      "document.querySelector('.requests').scrollIntoView({block:'start'})",
    );
    await shot(`ouchi-sound-review-${width}-requests`);
  }
  // Preview uses only catalogue IDs; "none" never fetches or plays that cue.
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await visit('sound-preview=hit-b,collapse-k,none,drive-b,crumble-f');
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: 800,
    y: 400,
    button: 'left',
    clickCount: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 800,
    y: 400,
    button: 'left',
    clickCount: 1,
  });
  await waitFor("document.querySelector('#field').dataset.hits==='1'");
  await waitFor('reviewAudio.starts.length>0');
  assert.ok(
    await evaluate(
      'reviewAudio.starts.some(duration=>Math.abs(duration-1.5)<0.01)',
    ),
    'Intermediate collapse plays with the first hit',
  );
  assert.ok(
    await evaluate(
      "reviewAudio.fetches.some(url=>url.includes('crumble-f.mp3'))",
    ),
  );
  assert.ok(
    await evaluate("reviewAudio.fetches.some(url=>url.includes('hit-b.mp3'))"),
  );
  assert.ok(
    await evaluate(
      "reviewAudio.fetches.some(url=>url.includes('collapse-k.mp3'))",
    ),
  );
  assert.ok(
    await evaluate("!reviewAudio.fetches.some(url=>url.includes('rubble'))"),
  );
  await shot('ouchi-sound-preview-hit');
  await visit('sound-preview=hit-a,redo,none,drive-c,crumble-d');
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: 800,
    y: 400,
    button: 'left',
    clickCount: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 800,
    y: 400,
    button: 'left',
    clickCount: 1,
  });
  await waitFor("document.querySelector('#field').dataset.hits==='1'");
  await waitFor('reviewAudio.starts.length>0');
  assert.ok(
    await evaluate(
      "reviewAudio.fetches.some(url=>url.includes('crumble-d.mp3'))",
    ),
  );
  assert.ok(
    await evaluate("!reviewAudio.fetches.some(url=>url.includes('collapse'))"),
    'Rejected collapse is not substituted with old A',
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  await writeFile(
    join(output, 'ouchi-sound-review-results.txt'),
    'PASS: all fixed candidates decoded, stable adoption badges, issued draft/JSON migrations, single/repeat/switch/stop, additional requests, JSON validation, delayed load, hidden/blur/pagehide, HTTP503, 3 viewports, preview, production exclusion. Human listening and physical devices not verified.\n',
  );
  console.log(
    'Ouchi sound review PASS: comparison, additional requests, persistence, JSON, transport lifecycle, preview and production exclusion',
  );
} finally {
  ws?.close();
  chrome.kill();
  await server.close();
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
