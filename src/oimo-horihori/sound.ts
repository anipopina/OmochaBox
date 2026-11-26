import { SamplePlayer } from '../shared/sample-player';
import digUrl from './assets/dig.mp3?no-inline';
import readyUrl from './assets/ready.mp3?no-inline';
import pickUrl from './assets/pick.mp3?no-inline';
import basketUrl from './assets/basket.mp3?no-inline';

type Cue = 'dig' | 'ready' | 'pick' | 'basket';

const urls: Record<Cue, string | null> = {
  dig: digUrl,
  ready: readyUrl,
  pick: pickUrl,
  basket: basketUrl,
};

export function setSoundPreview(preview: Record<Cue, string | null>) {
  if (import.meta.env.DEV) Object.assign(urls, preview);
}

export class GardenSound extends SamplePlayer<Cue> {
  private lastDig = -Infinity;
  private nextDrag = -Infinity;

  constructor() {
    super(urls, 0.55);
    this.preload();
  }

  dig(fromDrag: boolean): boolean {
    const now = performance.now();
    if (now < (fromDrag ? this.nextDrag : this.lastDig + 120)) return false;
    if (!this.play('dig', 0.88 + Math.random() * 0.24)) return false;
    this.lastDig = now;
    this.nextDrag = now + 180 + Math.random() * 150;
    return true;
  }

  override stop() {
    super.stop();
    this.lastDig = this.nextDrag = -Infinity;
  }
}
