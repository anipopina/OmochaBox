import type { Candidate, ReviewConfig } from './catalogue';

/** Only registered IDs are resolved; the URL never supplies an audio file path. */
export function previewUrls<S extends string>(
  config: ReviewConfig<S>,
  candidates: Record<string, Candidate>,
  query: string,
): Record<S, string | null> {
  const choices =
    new URLSearchParams(query).get('sound-preview')?.split(',') ?? [];
  return Object.fromEntries(
    config.scenes.map(({ id, candidates: samples }, i) => {
      const choice = choices[i];
      const candidate = samples.some((c) => `${id}-${c.letter}` === choice)
        ? choice
        : config.current[id];
      return [
        id,
        choice === 'none' || choice === 'redo' || candidate === null
          ? null
          : candidates[candidate].url,
      ];
    }),
  ) as Record<S, string | null>;
}
