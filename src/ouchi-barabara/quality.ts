// Automatic quality steps for slower phones. Starts at full quality and only
// ever steps down within a visit, so the picture never flickers between
// levels. Frame time is judged only while the scene is animating; the render
// loop sleeps when nothing moves.

export interface QualityLevel {
  /** Upper bound for the device pixel ratio. */
  pixelRatio: number;
  /** Upper bound for the shadow map size. */
  shadowMap: number;
}

export const LEVELS: QualityLevel[] = [
  { pixelRatio: 2, shadowMap: 2048 },
  { pixelRatio: 1.5, shadowMap: 2048 },
  { pixelRatio: 1.25, shadowMap: 1024 },
  { pixelRatio: 1, shadowMap: 1024 },
];

/** Average frame time (seconds) treated as too slow: about 48 fps. */
const SLOW_FRAME = 1 / 48;
/** Seconds of sustained slowness before stepping down. */
const SLOW_FOR = 2;
/** Frames ignored after waking or changing level, while things settle. */
const WARMUP_FRAMES = 30;

export class Quality {
  level = 0;
  /** Smoothed frame time in seconds. */
  average = 1 / 60;
  private slow = 0;
  private warmup = WARMUP_FRAMES;

  /**
   * @param fixed Keep full quality (for checks and screenshots).
   * @param onChange Called after the level steps down.
   */
  constructor(
    private readonly fixed: boolean,
    private readonly onChange: (level: QualityLevel) => void,
  ) {}

  get current() {
    return LEVELS[this.level];
  }

  /** The render loop (re)started: skip the first frames before judging. */
  resume() {
    this.warmup = WARMUP_FRAMES;
  }

  /** Feed one frame's real duration (seconds, unclamped). */
  sample(frameTime: number) {
    if (this.warmup > 0) {
      this.warmup--;
      return;
    }
    this.average += (frameTime - this.average) * 0.05;
    if (this.fixed || this.level >= LEVELS.length - 1) return;
    this.slow =
      this.average > SLOW_FRAME
        ? this.slow + frameTime
        : Math.max(0, this.slow - frameTime);
    if (this.slow < SLOW_FOR) return;
    this.level++;
    this.slow = 0;
    this.average = 1 / 60;
    this.warmup = WARMUP_FRAMES;
    this.onChange(this.current);
  }
}
