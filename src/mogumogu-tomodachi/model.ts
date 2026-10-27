export type Food = 'strawberry' | 'banana' | 'carrot';
export type Phase = 'idle' | 'offering' | 'chewing' | 'swallowing' | 'happy';
export const durations = {
  offering: 650,
  chewing: 1400,
  swallowing: 300,
  happy: 950,
};
const phases: Phase[] = ['offering', 'chewing', 'swallowing', 'happy', 'idle'];

/** One meal and at most one replaceable next bite. Time advances only while visible. */
export class Friend {
  phase: Phase = 'idle';
  food: Food = 'strawberry';
  next: Food | null = null;
  elapsed = 0;
  reaction = 0;
  meals = 0;
  offer(food: Food) {
    if (this.phase !== 'idle') {
      this.next = food;
      return;
    }
    this.food = food;
    this.phase = 'offering';
    this.elapsed = 0;
  }
  step(delta: number) {
    if (this.phase === 'idle') return;
    this.elapsed += Math.max(0, Math.min(delta, 80));
    if (this.elapsed < durations[this.phase]) return;
    this.elapsed = 0;
    this.phase = phases[phases.indexOf(this.phase) + 1]!;
    if (this.phase === 'happy') {
      this.reaction = this.meals++ % 2;
    }
    if (this.phase === 'idle' && this.next) {
      const food = this.next;
      this.next = null;
      this.offer(food);
    }
  }
  reset() {
    this.phase = 'idle';
    this.next = null;
    this.elapsed = 0;
  }
}
