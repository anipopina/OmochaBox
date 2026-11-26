import { createCandidates } from '../../shared/sound-review/catalogue';
import { config } from './registry';
export const candidates = createCandidates(
  config,
  import.meta.glob<string>('./assets/*.mp3', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
);
