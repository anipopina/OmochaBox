import { SamplePlayer } from '../shared/sample-player';
import chewUrl from './assets/chew.mp3?no-inline';
import gulpUrl from './assets/gulp.mp3?no-inline';

type Cue = 'chew' | 'gulp' | 'arrival';

const urls: Record<Cue, string | null> = {
  chew: chewUrl,
  gulp: gulpUrl,
  arrival: null,
};

export function setSoundPreview(preview: Record<Cue, string | null>) {
  if (import.meta.env.DEV) Object.assign(urls, preview);
}

export class MealSound extends SamplePlayer<Cue> {
  constructor() {
    super(urls, 0.55);
  }
}
