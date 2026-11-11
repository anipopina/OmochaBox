import data from './review.json';
import {
  validateConfig,
  type ReviewConfig,
} from '../../shared/sound-review/catalogue';
export { letterAt } from '../../shared/sound-review/catalogue';
export type SceneId = keyof typeof data.current;
export type CandidateId = `${SceneId}-${string}`;
export const config = data as ReviewConfig<SceneId>;
validateConfig(config);
export const SCENES = config.scenes;
export const CURRENT = config.current as Record<SceneId, CandidateId | null>;
