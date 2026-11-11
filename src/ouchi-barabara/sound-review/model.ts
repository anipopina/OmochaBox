import {
  createReviewModel,
  type Review as SharedReview,
} from '../../shared/sound-review/model';
import { config, type SceneId, type CandidateId } from './registry';
export { SCENES, CURRENT, type SceneId, type CandidateId } from './registry';
export { MAX_REQUESTS } from '../../shared/sound-review/model';
export type Review = SharedReview<SceneId>;
export const CATALOG = config.catalog;
export const STORAGE_KEY = config.storageKey;
export const LEGACY_STORAGE_KEYS = [
  'ouchi-barabara:sound-review:v2',
  'ouchi-barabara:sound-review:v1',
];
/** Migrate only the two issued catalogues; their letters had different meanings.
 * Remove after their saved drafts/exports have been migrated (date undecided). */
function normalizePreviousReview(
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (
    !data ||
    data.format !== 'omochabox-sound-review' ||
    data.toy !== 'ouchi-barabara'
  )
    return data;
  const first =
    data.catalog === 'ouchi-barabara-audio-2026-11-11-v1' && data.version === 1;
  const second =
    data.catalog === 'ouchi-barabara-audio-2026-11-11-v2' && data.version === 2;
  if (!first && !second) return data;
  if (!data.scenes || typeof data.scenes !== 'object')
    throw new Error('以前の選定内容が不正です。');
  const remap: Record<string, CandidateId> = {
    'collapse-b': 'collapse-d',
    'collapse-c': 'collapse-e',
    'rubble-b': 'rubble-d',
    'rubble-c': 'rubble-e',
    'drive-a': 'drive-c',
    'drive-b': 'drive-a',
    'drive-c': 'drive-b',
  };
  const scenes = Object.fromEntries(
    Object.entries(data.scenes).map(([id, value]) => {
      if (!['hit', 'collapse', 'rubble', 'drive'].includes(id))
        throw new Error('以前の形式に存在しない場面です。');
      if (!value || typeof value !== 'object')
        throw new Error('以前の選定内容が不正です。');
      const decision = value as Record<string, unknown>;
      const choice = decision.choice;
      if (
        typeof choice !== 'string' ||
        !['pending', 'redo', 'none', `${id}-a`, `${id}-b`, `${id}-c`].includes(
          choice,
        )
      )
        throw new Error('以前の候補IDが不正です。');
      return [
        id,
        { ...decision, choice: second ? (remap[choice] ?? choice) : choice },
      ];
    }),
  );
  return {
    ...data,
    catalog: CATALOG,
    version: 2,
    scenes,
    additions: first ? [] : data.additions,
  };
}

export const { blankReview, initialReview, parseReview, isCandidate } =
  createReviewModel<SceneId>(config, {
    normalize: normalizePreviousReview,
    allowMissingScenes: ['crumble'],
  });
