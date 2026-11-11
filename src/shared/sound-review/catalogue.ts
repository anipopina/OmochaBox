export interface ReviewScene<S extends string = string> {
  id: S;
  title: string;
  symbol: string;
  timing: string;
  duration: string;
  interval: number;
  candidates: {
    letter: string;
    name: string;
    file: string;
    seconds: number;
    round: number;
  }[];
}
export interface Playback {
  gain: number;
  attack: number;
  release: number;
}
export interface ReviewConfig<S extends string = string> {
  toy: string;
  catalog: string;
  storageKey: string;
  title: string;
  subtitle: string;
  symbol: string;
  intro: string[];
  links: { candidate: string; label: string }[];
  playback: Playback;
  scenes: ReviewScene<S>[];
  current: Record<S, string | null>;
  initialChoices?: Partial<Record<S, 'none' | 'pending'>>;
}
export interface Candidate {
  id: string;
  url: string;
  name: string;
  letter: string;
  duration: string;
  interval: number;
  current: boolean;
  round: number;
}

/** A…Z, AA…; existing letters are never reused. */
export function letterAt(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new Error('Invalid candidate index');
  let result = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26))
    result = String.fromCharCode(97 + ((value - 1) % 26)) + result;
  return result;
}

export function validateConfig(config: ReviewConfig) {
  const idPattern = /^[a-z][a-z0-9-]*$/;
  const ids = new Set<string>();
  if (!idPattern.test(config.toy) || !config.catalog || !config.storageKey)
    throw new Error('Invalid sound review identity');
  if (!config.scenes.length) throw new Error('No sound review scenes');
  const { gain, attack, release } = config.playback;
  if (
    ![gain, attack, release].every(Number.isFinite) ||
    gain <= 0 ||
    gain > 1 ||
    attack < 0 ||
    release < 0
  )
    throw new Error('Invalid review playback settings');
  const files = new Set<string>();
  for (const scene of config.scenes) {
    if (!idPattern.test(scene.id) || ids.has(scene.id))
      throw new Error(`Invalid or duplicate scene: ${scene.id}`);
    ids.add(scene.id);
    if (!Number.isFinite(scene.interval) || scene.interval <= 0)
      throw new Error(`Invalid repeat interval: ${scene.id}`);
    for (const [index, candidate] of scene.candidates.entries()) {
      if (candidate.letter !== letterAt(index))
        throw new Error(`Candidate order changed: ${scene.id}`);
      if (
        !/^[a-z0-9][a-z0-9-]*\.mp3$/.test(candidate.file) ||
        files.has(candidate.file)
      )
        throw new Error(
          `Invalid or duplicate candidate file: ${candidate.file}`,
        );
      files.add(candidate.file);
      if (
        !candidate.name ||
        !Number.isFinite(candidate.seconds) ||
        candidate.seconds <= 0 ||
        !Number.isSafeInteger(candidate.round) ||
        candidate.round < 1 ||
        scene.interval < candidate.seconds
      )
        throw new Error(
          `Invalid candidate timing: ${scene.id}-${candidate.letter}`,
        );
    }
    const current = config.current[scene.id];
    if (
      current !== null &&
      !scene.candidates.some((c) => `${scene.id}-${c.letter}` === current)
    )
      throw new Error(`Adopted candidate missing: ${scene.id}`);
    const initial = config.initialChoices?.[scene.id];
    if (initial !== undefined && !['none', 'pending'].includes(initial))
      throw new Error(`Invalid initial choice: ${scene.id}`);
  }
  if (
    Object.keys(config.current).some((id) => !ids.has(id)) ||
    Object.keys(config.initialChoices ?? {}).some((id) => !ids.has(id))
  )
    throw new Error('Unknown scene in review defaults');
  for (const link of config.links)
    if (
      !config.scenes.some((s) =>
        s.candidates.some((c) => `${s.id}-${c.letter}` === link.candidate),
      )
    )
      throw new Error(`Unknown candidate link: ${link.candidate}`);
}

/** Pass a toy-local Vite glob so unused candidates stay behind the DEV import. */
export function createCandidates(
  config: ReviewConfig,
  files: Record<string, string>,
): Record<string, Candidate> {
  validateConfig(config);
  return Object.fromEntries(
    config.scenes.flatMap((scene) =>
      scene.candidates.map((candidate) => {
        const id = `${scene.id}-${candidate.letter}`;
        const url = files[`./assets/${candidate.file}`];
        if (!url) throw new Error(`Missing comparison sample: ${id}`);
        return [
          id,
          {
            id,
            url,
            name: candidate.name,
            letter: candidate.letter.toUpperCase(),
            duration: `${candidate.seconds}秒`,
            interval: scene.interval,
            current: id === config.current[scene.id],
            round: candidate.round,
          },
        ];
      }),
    ),
  );
}
