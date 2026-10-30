export const NOTES = [261.63, 329.63, 392, 523.25] as const;
// Four fixed voices, no sample downloads and no unbounded polyphony.
export class GuitarSound {
  private context: AudioContext | null = null;
  private gains: GainNode[] = [];
  private pending = new Map<number, number>();
  private unlocking: Promise<void> | null = null;
  private idle = 0;
  private epoch = 0;
  private failed = false;

  play(note: number) {
    if (this.failed || document.hidden || !NOTES[note]) return;
    try {
      if (!this.context) {
        const context = new AudioContext();
        this.context = context;
        const master = context.createGain();
        master.gain.value = 0.12;
        master.connect(context.destination);
        const wave = context.createPeriodicWave(
          new Float32Array(5),
          new Float32Array([0, 1, 0.35, 0.12, 0.05]),
        );
        this.gains = NOTES.map((frequency) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.setPeriodicWave(wave);
          oscillator.frequency.value = frequency;
          gain.gain.value = 0;
          oscillator.connect(gain).connect(master);
          oscillator.start();
          return gain;
        });
      }
      const context = this.context;
      if (context.state === 'running') this.pluck(note);
      else {
        this.pending.set(note, performance.now());
        if (!this.unlocking) {
          const epoch = this.epoch;
          this.unlocking = context
            .resume()
            .then(() => {
              if (epoch !== this.epoch || document.hidden) {
                this.stop();
                return;
              }
              let played = false;
              for (const [index, at] of this.pending) {
                if (performance.now() - at < 150) {
                  this.pluck(index);
                  played = true;
                }
              }
              this.pending.clear();
              if (!played) this.stop();
            })
            .catch(() => {
              this.stop();
            })
            .finally(() => {
              this.unlocking = null;
            });
        }
      }
    } catch {
      this.failed = true;
      this.stop();
    }
  }
  private pluck(note: number) {
    const context = this.context!;
    if (context.state !== 'running') return;
    const gain = this.gains[note]!.gain,
      now = context.currentTime;
    // Retrigger the same voice without adding oscillators or sudden level jumps.
    gain.cancelAndHoldAtTime(now);
    gain.linearRampToValueAtTime(0, now + 0.006);
    gain.linearRampToValueAtTime(0.18, now + 0.014);
    gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
    gain.setValueAtTime(0, now + 0.9);
    clearTimeout(this.idle);
    this.idle = window.setTimeout(() => this.stop(), 1100);
  }
  release() {
    this.pending.clear();
  }
  stop() {
    this.epoch++;
    this.pending.clear();
    clearTimeout(this.idle);
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const gain of this.gains) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0, now);
    }
    void this.context.suspend().catch(() => {});
  }
}
