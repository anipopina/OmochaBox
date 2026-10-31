export class Journey {
  remaining = 0;
  offset = 0;
  start() {
    if (!this.remaining) this.remaining = 1800;
  }
  step(dt: number) {
    const elapsed = Math.min(Math.max(dt, 0), 50, this.remaining);
    const speed = Math.min(
      1,
      this.remaining / 450,
      (1800 - this.remaining + 50) / 300,
    );
    this.offset = (this.offset + elapsed * 0.12 * speed) % 600;
    this.remaining = Math.max(0, this.remaining - elapsed);
  }
  stop() {
    this.remaining = 0;
  }
}
