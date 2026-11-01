// Two fixed, quiet sine voices. No audio samples or background music.
export class Knock {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private pending = false;
  private epoch = 0;
  private last = -Infinity;
  private timer = 0;
  play() {
    const at = performance.now();
    if (document.hidden || this.pending || at - this.last < 300) return;
    this.last = at;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.gain = this.context.createGain();
        this.gain.gain.value = 0;
        this.gain.connect(this.context.destination);
        for (const frequency of [180, 260]) {
          const voice = this.context.createOscillator();
          voice.frequency.value = frequency;
          voice.connect(this.gain);
          voice.start();
        }
      }
      const context = this.context,
        gain = this.gain!;
      const epoch = this.epoch;
      this.pending = true;
      void context
        .resume()
        .then(() => {
          if (
            epoch !== this.epoch ||
            document.hidden ||
            performance.now() - at > 150
          ) {
            this.stop();
            return;
          }
          const now = context.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.007, now + 0.012);
          gain.gain.linearRampToValueAtTime(0.005, now + 0.06);
          gain.gain.linearRampToValueAtTime(0, now + 0.18);
          clearTimeout(this.timer);
          this.timer = window.setTimeout(() => this.stop(), 220);
        })
        .catch(() => this.stop())
        .finally(() => {
          this.pending = false;
        });
    } catch {
      this.stop();
    }
  }
  stop() {
    this.epoch++;
    clearTimeout(this.timer);
    if (!this.context || !this.gain) return;
    this.gain.gain.cancelScheduledValues(this.context.currentTime);
    this.gain.gain.setValueAtTime(0, this.context.currentTime);
    void this.context.suspend().catch(() => {});
  }
}
