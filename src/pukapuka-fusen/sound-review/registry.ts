import data from './review.json';
import {
  validateConfig,
  type ReviewConfig,
} from '../../shared/sound-review/catalogue';
export type SceneId = keyof typeof data.current;
export const config = data as ReviewConfig<SceneId>;
validateConfig(config);
