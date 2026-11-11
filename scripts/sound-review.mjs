import { createHash } from 'node:crypto';
import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
  stat,
  unlink,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, dirname, join, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { format } from 'prettier';
import {
  validateConfig,
  letterAt,
} from '../src/shared/sound-review/catalogue.ts';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, data) =>
  writeFile(path, await format(JSON.stringify(data), { parser: 'json' }));
function locations(root, slug) {
  if (!/^[a-z][a-z0-9-]*$/.test(slug ?? ''))
    throw new Error('Invalid toy slug');
  const review = join(root, 'src', slug, 'sound-review');
  const records = join(root, 'source-assets', slug, 'audio', 'review');
  return {
    review,
    records,
    config: join(review, 'review.json'),
    identities: join(records, 'candidate-identities.json'),
  };
}
function within(root, path) {
  const rel = relative(root, path);
  if (
    !rel ||
    rel.startsWith(`..${sep}`) ||
    rel === '..' ||
    resolve(path) === resolve(root)
  )
    throw new Error('Provenance must be inside the toy audio records');
  return rel.split(sep).join('/');
}

/** No browser, build, WAV cache or generation environment is required. */
export async function checkCatalogue(root, slug) {
  const paths = locations(root, slug),
    config = await json(paths.config);
  validateConfig(config);
  if (config.toy !== slug) throw new Error('Catalogue toy mismatch');
  const identities = await json(paths.identities);
  const registered = config.scenes.flatMap((scene) =>
    scene.candidates.map((c) => ({
      id: `${scene.id}-${c.letter}`,
      file: c.file,
    })),
  );
  if (
    JSON.stringify(registered) !==
    JSON.stringify(identities.map(({ id, file }) => ({ id, file })))
  )
    throw new Error('Candidate identities disagree with catalogue');
  let bytes = 0;
  for (const identity of identities) {
    const file = await readFile(join(paths.review, 'assets', identity.file));
    bytes += file.length;
    if (digest(file) !== identity.sha256)
      throw new Error(`Candidate changed: ${identity.id}`);
    if (typeof identity.provenance !== 'string' || !identity.provenance)
      throw new Error(`Missing processing record: ${identity.id}`);
    {
      const recordPath = resolve(root, identity.provenance);
      within(join(root, 'source-assets', slug, 'audio'), recordPath);
      const record = await json(recordPath);
      if (
        !(record.cues ?? [record]).some(
          (row) => row.output_sha256 === identity.sha256,
        )
      )
        throw new Error(`Provenance disagrees: ${identity.id}`);
    }
  }
  const known = new Set(registered.map((c) => c.file));
  const assets = await readdir(join(paths.review, 'assets'));
  if (assets.some((file) => !known.has(file)))
    throw new Error('Unregistered comparison asset');
  return { config, identities, candidates: registered.length, bytes };
}

/** The input is already processed/compressed: never re-encode an existing ID. */
export async function addCandidate(
  root,
  slug,
  sceneId,
  { file, name, record },
) {
  const paths = locations(root, slug);
  const { config, identities } = await checkCatalogue(root, slug);
  const scene = config.scenes.find((scene) => scene.id === sceneId);
  if (!scene) throw new Error(`Unknown scene: ${sceneId}`);
  if (!name?.trim() || !file || !record)
    throw new Error('Use --file, --name and --record');
  const recordPath = resolve(root, record);
  within(join(root, 'source-assets', slug, 'audio'), recordPath);
  const bytes = await readFile(resolve(root, file)),
    sha256 = digest(bytes);
  if (
    !/\.mp3$/i.test(file) ||
    !(
      bytes.subarray(0, 3).toString() === 'ID3' ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    )
  )
    throw new Error('Use a processed MP3');
  const provenance = await json(recordPath);
  const measured = (provenance.cues ?? [provenance]).find(
    (row) => row.output_sha256 === sha256,
  );
  if (
    !measured ||
    !Number.isFinite(measured.duration_seconds) ||
    measured.duration_seconds <= 0 ||
    !Number.isFinite(measured.decoded_peak_dbfs) ||
    measured.decoded_peak_dbfs >= 20 * Math.log10(0.4)
  )
    throw new Error(
      'Processing record needs matching output_sha256, duration_seconds and decoded_peak_dbfs below 0.4 full scale',
    );
  const letter = letterAt(scene.candidates.length),
    id = `${sceneId}-${letter}`;
  const filename = `${id}.mp3`,
    destination = join(paths.review, 'assets', filename);
  scene.candidates.push({
    letter,
    name: name.trim(),
    file: filename,
    seconds: measured.duration_seconds,
    round: Math.max(0, ...scene.candidates.map((c) => c.round)) + 1,
  });
  scene.interval = Math.max(scene.interval, measured.duration_seconds + 0.25);
  const oldConfig = await readFile(paths.config),
    oldIdentities = await readFile(paths.identities);
  const newIdentity = {
    id,
    file: filename,
    sha256,
    provenance: relative(root, recordPath).split(sep).join('/'),
  };
  const ordered = config.scenes.flatMap((s) =>
    s.candidates.map(
      (c) =>
        identities.find((row) => row.id === `${s.id}-${c.letter}`) ??
        newIdentity,
    ),
  );
  validateConfig(config);
  await copyFile(resolve(root, file), destination, constants.COPYFILE_EXCL);
  try {
    await writeJson(paths.identities, ordered);
    await writeJson(paths.config, config);
    await checkCatalogue(root, slug);
  } catch (error) {
    await writeFile(paths.config, oldConfig);
    await writeFile(paths.identities, oldIdentities);
    await unlink(destination);
    throw error;
  }
  return id;
}

export async function initReview(
  root,
  slug,
  { title, scene: sceneId, 'scene-title': sceneTitle },
) {
  const paths = locations(root, slug);
  if (!title || !/^[a-z][a-z0-9-]*$/.test(sceneId ?? '') || !sceneTitle)
    throw new Error('Use --title, --scene and --scene-title');
  if (!(await stat(join(root, 'src', slug))).isDirectory())
    throw new Error('Toy does not exist');
  try {
    await stat(paths.review);
    throw new Error('Sound review already exists');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await stat(paths.identities);
    throw new Error('Candidate records already exist');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const config = {
    toy: slug,
    catalog: `${slug}-audio-fixed-v1`,
    storageKey: `${slug}:sound-review:fixed-v1`,
    title: `${title}の音をえらぶ`,
    subtitle: `${title}・効果音の聴き比べ`,
    symbol: '🎵',
    intro: [],
    links: [],
    playback: { gain: 0.6, attack: 0.008, release: 0.06 },
    current: { [sceneId]: null },
    scenes: [
      {
        id: sceneId,
        title: sceneTitle,
        symbol: '🎵',
        timing: '鳴らすタイミングを記入',
        duration: '候補追加後に記入',
        interval: 1,
        candidates: [],
      },
    ],
  };
  validateConfig(config);
  await mkdir(join(paths.review, 'assets'), { recursive: true });
  await mkdir(paths.records, { recursive: true });
  await writeJson(paths.config, config);
  await writeJson(paths.identities, []);
  const modules = {
    'registry.ts': `import data from './review.json';\nimport { validateConfig, type ReviewConfig } from '../../shared/sound-review/catalogue';\nexport type SceneId = keyof typeof data.current;\nexport const config = data as ReviewConfig<SceneId>;\nvalidateConfig(config);\n`,
    'model.ts': `import { createReviewModel } from '../../shared/sound-review/model';\nimport { config } from './registry';\nexport const model = createReviewModel(config);\n`,
    'catalogue.ts': `import { createCandidates } from '../../shared/sound-review/catalogue';\nimport { config } from './registry';\nexport const candidates = createCandidates(config, import.meta.glob<string>('./assets/*.mp3', {eager:true,query:'?url',import:'default'}));\n`,
    'app.ts': `import { mountSoundReview } from '../../shared/sound-review/app';\nimport { config } from './registry';\nimport { candidates } from './catalogue';\nimport { model } from './model';\nconst dispose = mountSoundReview({config,candidates,model});\nif(import.meta.hot) import.meta.hot.dispose(dispose);\n`,
  };
  for (const [name, text] of Object.entries(modules))
    await writeFile(
      join(paths.review, name),
      await format(text, { parser: 'typescript' }),
      { flag: 'wx' },
    );
  return paths.config;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: Object.fromEntries(
        ['file', 'name', 'record', 'title', 'scene', 'scene-title'].map(
          (key) => [key, { type: 'string' }],
        ),
      ),
    });
    const [command, slug, sceneId, ...extra] = positionals;
    if (extra.length || (command !== 'add' && sceneId))
      throw new Error('Unexpected argument');
    const allowed = {
      add: ['file', 'name', 'record'],
      init: ['title', 'scene', 'scene-title'],
      check: [],
    }[command];
    if (!allowed || Object.keys(values).some((key) => !allowed.includes(key)))
      throw new Error('Use init <slug>, add <slug> <scene>, or check <slug>');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    if (command === 'init') {
      await initReview(root, slug, values);
      console.log(
        `Created ${slug}/sound-review. Complete the DEV entry and game preview adapter using docs/sound-review.md before reviewing.`,
      );
    } else if (command === 'add')
      console.log(
        `Added ${await addCandidate(root, slug, sceneId, values)}. Existing samples and adoption unchanged.`,
      );
    else {
      const result = await checkCatalogue(root, slug);
      console.log(
        `Sound review PASS: ${slug}, ${result.candidates} candidates, ${result.bytes} bytes (no build/browser)`,
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
