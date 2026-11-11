import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  initReview,
  addCandidate,
  checkCatalogue,
} from '../scripts/sound-review.mjs';
import { createReviewModel } from '../src/shared/sound-review/model.ts';
import {
  createCandidates,
  letterAt,
  validateConfig,
} from '../src/shared/sound-review/catalogue.ts';
import { previewUrls } from '../src/shared/sound-review/preview.ts';

test('two toys keep independent drafts, preview defaults and immutable choices across appended samples', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sound-review-'));
  try {
    for (const slug of ['first-toy', 'second-toy']) {
      await mkdir(join(root, 'src', slug), { recursive: true });
      await initReview(root, slug, {
        title: slug,
        scene: 'tap',
        'scene-title': '触る',
      });
    }
    const bytes = await readFile(
      'src/ouchi-barabara/sound-review/assets/hit-original.mp3',
    );
    const input = join(root, 'sample.mp3');
    await writeFile(input, bytes);
    const record = 'source-assets/first-toy/audio/processing.json';
    const metadata = {
      cues: [
        {
          output_sha256: createHash('sha256').update(bytes).digest('hex'),
          duration_seconds: 0.7,
          decoded_peak_dbfs: -15,
        },
      ],
    };
    await writeFile(join(root, record), JSON.stringify(metadata));
    assert.equal(
      await addCandidate(root, 'first-toy', 'tap', {
        file: input,
        name: '丸い打撃',
        record,
      }),
      'tap-a',
    );
    let { config } = await checkCatalogue(root, 'first-toy');
    config.current.tap = 'tap-a';
    await writeFile(
      join(root, 'src/first-toy/sound-review/review.json'),
      JSON.stringify(config),
    );
    const model = createReviewModel(config);
    const draft = model.initialReview();
    draft.scenes.tap.note = 'もう少し軽く';
    draft.scenes.tap.singleConfirmed = true;
    draft.additions = [
      {
        id: 'request-1',
        scene: '離した時',
        timing: '直後',
        sound: '短く',
        note: '',
      },
    ];
    const exported = JSON.stringify(draft);
    const before = await readFile(
      join(root, 'src/first-toy/sound-review/assets/tap-a.mp3'),
    );
    assert.equal(
      await addCandidate(root, 'first-toy', 'tap', {
        file: input,
        name: '軽い打撃',
        record,
      }),
      'tap-b',
    );
    ({ config } = await checkCatalogue(root, 'first-toy'));
    assert.deepEqual(createReviewModel(config).parseReview(exported), draft);
    assert.deepEqual(
      await readFile(join(root, 'src/first-toy/sound-review/assets/tap-a.mp3')),
      before,
    );
    assert.equal(config.current.tap, 'tap-a', 'Adding candidates never adopts');
    const other = await checkCatalogue(root, 'second-toy');
    assert.equal(other.candidates, 0);
    assert.notEqual(other.config.storageKey, config.storageKey);
    assert.throws(() => createReviewModel(other.config).parseReview(exported));
    const candidates = createCandidates(config, {
      './assets/tap-a.mp3': '/a.mp3',
      './assets/tap-b.mp3': '/b.mp3',
    });
    assert.deepEqual(previewUrls(config, candidates, '?sound-preview=tap-b'), {
      tap: '/b.mp3',
    });
    for (const choice of ['none', 'redo'])
      assert.deepEqual(
        previewUrls(config, candidates, `?sound-preview=${choice}`),
        { tap: null },
      );
    for (const choice of [
      'pending',
      'https://example.org/evil.mp3',
      'second-toy-a',
    ])
      assert.deepEqual(
        previewUrls(config, candidates, `?sound-preview=${choice}`),
        { tap: '/a.mp3' },
      );
    assert.throws(() => createCandidates(config, {}), /Missing comparison/);
    for (const mutation of [
      (d) => (d.scenes.tap.choice = 'tap-z'),
      (d) => (d.scenes.tap.choice = 'https://example.org/'),
      (d) => (d.scenes.tap.note = 42),
      (d) => (d.scenes.tap.choice = 'none'),
      (d) => d.additions.push(d.additions[0]),
      (d) => delete d.scenes.tap,
    ]) {
      const invalid = structuredClone(draft);
      mutation(invalid);
      assert.throws(() => model.parseReview(JSON.stringify(invalid)));
    }
    const paths = join(root, 'src/first-toy/sound-review/review.json');
    const saved = await readFile(paths);
    await assert.rejects(
      addCandidate(root, 'first-toy', 'absent', {
        file: input,
        name: 'x',
        record,
      }),
      /Unknown scene/,
    );
    await assert.rejects(
      initReview(root, 'first-toy', {
        title: 'x',
        scene: 'tap',
        'scene-title': 'x',
      }),
      /already exists/,
    );
    await writeFile(join(root, record), JSON.stringify({ cues: [] }));
    await assert.rejects(
      addCandidate(root, 'first-toy', 'tap', {
        file: input,
        name: 'x',
        record,
      }),
      /Provenance|record/,
    );
    assert.deepEqual(
      await readFile(paths),
      saved,
      'Rejected addition preserves catalogue',
    );
    await writeFile(join(root, record), JSON.stringify(metadata));
    await writeFile(
      join(root, 'src/first-toy/sound-review/assets/tap-a.mp3'),
      'changed',
    );
    await assert.rejects(
      checkCatalogue(root, 'first-toy'),
      /Candidate changed/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('catalogue rejects remapped letters, paths, invalid timing and adoption', async () => {
  const config = JSON.parse(
    await readFile('src/ouchi-barabara/sound-review/review.json', 'utf8'),
  );
  validateConfig(config);
  for (const mutate of [
    (c) => c.scenes[0].candidates.reverse(),
    (c) => (c.scenes[0].candidates[0].file = '../bad.mp3'),
    (c) => (c.scenes[0].interval = 0),
    (c) => (c.current.hit = 'collapse-a'),
    (c) => c.scenes.push(c.scenes[0]),
    (c) => (c.playback.gain = 2),
  ]) {
    const invalid = structuredClone(config);
    mutate(invalid);
    assert.throws(() => validateConfig(invalid));
  }
  assert.equal(letterAt(25), 'z');
  assert.equal(letterAt(26), 'aa');
  assert.equal(letterAt(52), 'ba');
  assert.throws(() => letterAt(-1));
  const { candidates } = await checkCatalogue(resolve('.'), 'ouchi-barabara');
  assert.ok(candidates >= 32);
});
