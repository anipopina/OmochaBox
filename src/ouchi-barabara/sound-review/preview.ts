import { setSoundPreview } from '../sound';
import { previewUrls } from '../../shared/sound-review/preview';
import { config } from './registry';
import { candidates } from './catalogue';
setSoundPreview(previewUrls(config, candidates, location.search));
