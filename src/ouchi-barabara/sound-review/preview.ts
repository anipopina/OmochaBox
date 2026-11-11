import { setSoundPreview, type Cue } from '../sound';
import { candidates } from './catalogue';
import { SCENES, CURRENT, isCandidate, type CandidateId } from './model';

const choices =
  new URLSearchParams(location.search).get('sound-preview')?.split(',') ?? [];
setSoundPreview(
  Object.fromEntries(
    SCENES.map(({ id }, i) => {
      const choice = choices[i];
      const candidate: CandidateId | null = isCandidate(id, choice)
        ? choice
        : CURRENT[id];
      return [
        id,
        choice === 'none' || choice === 'redo' || candidate === null
          ? null
          : candidates[candidate].url,
      ];
    }),
  ) as Record<Cue, string | null>,
);
