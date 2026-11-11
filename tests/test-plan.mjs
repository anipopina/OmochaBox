import { games } from './catalogue.mjs';

// A shared legacy suite remains explicit until it can be split without losing coverage.
export const toyTests = {
  'hikari-no-oekaki': ['browser'],
  'fukifuki-mado': ['browser'],
  'pukapuka-fusen': ['balloon', 'balloon-timing'],
  'ponpon-stamp': ['stamp', 'stamp-pagination-boundaries'],
  'korokoro-suberidai': ['slide'],
  'kurukuru-kazaguruma': ['pinwheel'],
  'kasanete-iroglass': ['glass', 'toy-interactions'],
  mizutamari: ['pond', 'toy-interactions'],
  'mogumogu-tomodachi': ['mogumogu'],
  'pukupuku-shabon': ['bubbles'],
  'poron-guitar': ['guitar'],
  'kotokoto-kisha': ['train'],
  'dare-no-ouchi': ['house'],
  'pokopoko-popcorn': ['popcorn'],
  'tsumitsumi-ice': ['ice'],
  'biyoon-jelly': ['jelly'],
  'pitatto-magnet': ['magnet-model', 'magnet'],
  'kurutto-ehon': ['ehon'],
  'oimo-horihori': ['oimo-model', 'oimo'],
  'munyutto-nendo': ['clay-model', 'clay'],
  'ouchi-barabara': [
    'ouchi-model',
    'ouchi',
    'ouchi-sound-review-model',
    'ouchi-sound-review',
  ],
  'koronto-domino': ['domino-model', 'domino'],
};
export function validateCatalogue() {
  const ids = games.map((game) => game.id);
  if (
    new Set(ids).size !== ids.length ||
    games.some((game) => game.href !== `${game.id}/`)
  )
    throw new Error('Invalid catalogue IDs or destinations');
  if (
    ids.some((id) => !Array.isArray(toyTests[id]) || !toyTests[id].length) ||
    Object.keys(toyTests).some((id) => !ids.includes(id))
  )
    throw new Error('Update tests/test-plan.mjs for every registered toy');
}
const build = (name) => ({
  id: name,
  command: 'npm',
  args: ['run', name],
  needs: [],
});
const test = (name, needs = ['build'], args = []) => ({
  id: name,
  command: process.execPath,
  args: [
    ...(name.endsWith('-model') ||
    ['publication', 'infrastructure'].includes(name)
      ? ['--import', 'tsx']
      : []),
    `tests/${name}.mjs`,
    ...args,
  ],
  needs,
});
export function plan(mode, targets = []) {
  validateCatalogue();
  if (!['toy', 'smoke', 'full', 'list'].includes(mode))
    throw new Error('Use toy <slug...>, smoke [slug...], full, or list');
  if (
    (mode === 'toy' && !targets.length) ||
    (['full', 'list'].includes(mode) && targets.length)
  )
    throw new Error(
      'Invalid arguments: toy requires slugs; full/list accept none',
    );
  for (const slug of targets)
    if (!Object.hasOwn(toyTests, slug)) throw new Error(`Unknown toy: ${slug}`);
  if (mode === 'list') return [];
  const steps = [build('build')];
  if (mode === 'full') steps.push(build('build:production'));
  const suites =
    mode === 'full'
      ? [...new Set(Object.values(toyTests).flat())]
      : mode === 'toy'
        ? [...new Set(targets.flatMap((slug) => toyTests[slug]))]
        : [];
  if (suites.includes('browser')) steps.push(build('build:test'));
  // Output validation and navigation stay independent of detailed suite failures.
  steps.push(
    { ...test('build'), id: 'build-output' },
    test(
      'home-button',
      ['build'],
      mode === 'full' ? [] : ['--smoke', ...targets],
    ),
  );
  if (mode === 'full')
    steps.push(
      test('publication', ['build', 'build:production']),
      test('infrastructure', ['build:production']),
      test('branding'),
      test('home-visibility', ['build', 'build:production']),
      test('characters'),
      {
        id: 'runner',
        command: process.execPath,
        args: ['--test', 'tests/runner.test.mjs'],
        needs: [],
      },
    );
  for (const suite of suites)
    steps.push(
      test(
        suite,
        suite.endsWith('-model')
          ? []
          : suite === 'browser'
            ? ['build', 'build:test']
            : ['build'],
      ),
    );
  return steps;
}
