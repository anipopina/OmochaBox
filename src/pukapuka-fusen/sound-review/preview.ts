import { setSoundPreview } from '../sound';
import { previewUrls } from '../../shared/sound-review/preview';
import { candidates } from './catalogue';
import { config } from './registry';

const selected = previewUrls(config, candidates, location.search);
function withVariants(choice: string | null, ids: string[]) {
  const group = ids.map((id) => candidates[id].url);
  return choice && group.includes(choice) ? group : choice;
}

setSoundPreview({
  ...selected,
  release: withVariants(selected.release, ['release-c', 'release-d']),
  tap: withVariants(selected.tap, ['tap-c', 'tap-d', 'tap-e']),
});
