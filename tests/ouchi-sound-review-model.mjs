import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  SCENES,
  CURRENT,
  letterAt,
} from '../src/ouchi-barabara/sound-review/registry.ts';
import {
  CATALOG,
  blankReview,
  initialReview,
  isCandidate,
  parseReview,
} from '../src/ouchi-barabara/sound-review/model.ts';

const identities = JSON.parse(
  await readFile(
    'source-assets/ouchi-barabara/audio/review/candidate-identities.json',
    'utf8',
  ),
);
const wood = JSON.parse(
  await readFile(
    'source-assets/ouchi-barabara/audio/review/wood/optimization.json',
    'utf8',
  ),
).cues;
const woodGeneration = JSON.parse(
  await readFile(
    'source-assets/ouchi-barabara/audio/review/wood/generation.json',
    'utf8',
  ),
).cues;
for (const [id, reference] of [
  ['collapse-k', 'collapse-c'],
  ['collapse-m', 'collapse-c'],
  ['crumble-h', 'crumble-d'],
]) {
  const generation = woodGeneration.find((entry) => entry.id === id);
  assert.ok(generation.initial_audio.endsWith(`/${reference}.mp3`));
  assert.equal(
    generation.initial_audio_sha256,
    identities.find((entry) => entry.id === reference).sha256,
  );
}
for (const id of ['crumble-f', 'crumble-g'])
  assert.equal(
    wood.find((entry) => entry.id === id).source_sha256,
    identities.find((entry) => entry.id === 'crumble-d').sha256,
    'Weight variations use intermediate D',
  );
for (const identity of identities) {
  const record = JSON.parse(await readFile(identity.provenance, 'utf8'));
  const provenance = (record.cues ?? [record]).find(
    (entry) => entry.output_sha256 === identity.sha256,
  );
  assert.equal(
    identity.sha256,
    provenance.output_sha256,
    `Original letter remapped: ${identity.id}`,
  );
}
const registered = SCENES.flatMap((scene) =>
  scene.candidates.map((candidate) => ({
    id: `${scene.id}-${candidate.letter}`,
    file: candidate.file,
  })),
);
assert.deepEqual(
  registered,
  identities.map(({ id, file }) => ({ id, file })),
);
for (const identity of identities) {
  const bytes = await readFile(
    `src/ouchi-barabara/sound-review/assets/${identity.file}`,
  );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    identity.sha256,
    `Identity changed: ${identity.id}`,
  );
}
for (const { id } of SCENES) {
  if (CURRENT[id] === null) {
    await assert.rejects(
      readFile(`src/ouchi-barabara/assets/${id}.mp3`),
      /ENOENT/,
    );
    continue;
  }
  const fixed = identities.find((candidate) => candidate.id === CURRENT[id]);
  const bytes = await readFile(`src/ouchi-barabara/assets/${id}.mp3`);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    fixed.sha256,
    `Adoption badge disagrees: ${id}`,
  );
}
assert.equal(initialReview().scenes.drive.choice, 'drive-c');
assert.equal(initialReview().scenes.collapse.choice, 'collapse-m');
assert.equal(initialReview().scenes.crumble.choice, 'none');
assert.equal(isCandidate('hit', 'hit-zzzz'), false);
assert.equal(isCandidate('collapse', 'collapse-d'), true);
assert.equal(isCandidate('collapse', 'collapse-j'), true);
assert.equal(isCandidate('crumble', 'crumble-e'), true);
assert.equal(isCandidate('collapse', 'collapse-k'), true);
assert.equal(isCandidate('collapse', 'collapse-zzzz'), false);
assert.equal(isCandidate('crumble', 'crumble-h'), true);
assert.equal(letterAt(25), 'z');
assert.equal(letterAt(26), 'aa');
assert.equal(letterAt(51), 'az');
assert.equal(letterAt(52), 'ba');
assert.throws(() => letterAt(-1));
const oldFirst = await readFile(
  'source-assets/ouchi-barabara/audio/review/selections/2026-11-11-v1.json',
  'utf8',
);
const first = parseReview(oldFirst);
assert.equal(first.scenes.drive.choice, 'drive-c');
assert.equal(first.scenes.hit.gameConfirmed, true);
const second = blankReview();
delete second.scenes.crumble;
second.catalog = 'ouchi-barabara-audio-2026-11-11-v2';
second.scenes.collapse = {
  choice: 'collapse-b',
  note: 'keep',
  singleConfirmed: true,
  gameConfirmed: true,
};
second.scenes.rubble.choice = 'rubble-c';
second.scenes.drive.choice = 'drive-a';
second.additions = [
  {
    id: 'request-1',
    scene: 'arm',
    timing: 'start',
    sound: 'whirr',
    note: 'quiet',
  },
];
const migrated = parseReview(JSON.stringify(second));
assert.equal(migrated.catalog, CATALOG);
assert.equal(migrated.scenes.collapse.choice, 'collapse-d');
assert.equal(migrated.scenes.rubble.choice, 'rubble-e');
assert.equal(migrated.scenes.drive.choice, 'drive-c');
assert.deepEqual(migrated.additions, second.additions);
assert.equal(migrated.scenes.collapse.gameConfirmed, true);
assert.equal(migrated.scenes.collapse.note, 'keep');
second.scenes.collapse.choice = 'collapse-d';
assert.throws(() => parseReview(JSON.stringify(second)));
const unknown = { ...second, catalog: 'unissued' };
assert.throws(() => parseReview(JSON.stringify(unknown)));
assert.equal(
  parseReview(JSON.stringify(migrated)).scenes.collapse.choice,
  'collapse-d',
  'Stable IDs are not remapped a second time',
);
const submitted = parseReview(
  await readFile(
    'source-assets/ouchi-barabara/audio/review/selections/2026-11-11-fixed-v1-selection-2.json',
    'utf8',
  ),
);
assert.equal(submitted.scenes.rubble.choice, 'rubble-e');
assert.equal(submitted.scenes.crumble.choice, 'pending');
assert.equal(submitted.scenes.crumble.gameConfirmed, false);
assert.equal(
  submitted.additions.length,
  1,
  'Four-scene reviews retain their addition request',
);
console.log(
  'Sound review model PASS: immutable sample identities, adoption, append sequence, issued-data migrations preserve notes/requests/confirmation',
);
