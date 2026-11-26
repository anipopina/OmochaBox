import { previewUrls } from '../../shared/sound-review/preview';
import { setSoundPreview } from '../sound';
import { candidates } from './catalogue';
import { config } from './registry';

setSoundPreview(previewUrls(config, candidates, location.search));
