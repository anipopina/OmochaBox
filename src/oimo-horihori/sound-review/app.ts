import { mountSoundReview } from '../../shared/sound-review/app';
import { config } from './registry';
import { candidates } from './catalogue';
import { model } from './model';
const dispose = mountSoundReview({ config, candidates, model });
if (import.meta.hot) import.meta.hot.dispose(dispose);
