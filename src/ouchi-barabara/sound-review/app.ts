import { mountSoundReview } from '../../shared/sound-review/app';
import { config } from './registry';
import { candidates } from './catalogue';
import * as model from './model';
const dispose = mountSoundReview({
  config,
  candidates,
  model,
  legacyStorageKeys: model.LEGACY_STORAGE_KEYS,
});
if (import.meta.hot) import.meta.hot.dispose(dispose);
