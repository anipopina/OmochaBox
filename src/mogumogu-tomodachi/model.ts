export type Food = 'strawberry' | 'banana' | 'carrot';
export const foods: Food[] = ['strawberry', 'banana', 'carrot'];
export const friends = ['monster', 'ghost', 'bear'] as const;
export type Phase =
  'idle' | 'offering' | 'chewing' | 'swallowing' | 'happy' | 'changing';
export const durations = {
  offering: 650,
  chewing: 1400,
  swallowing: 300,
  happy: 950,
  changing: 700,
};
const phases: Phase[] = ['offering', 'chewing', 'swallowing', 'happy', 'idle'];

/** One meal and at most one replaceable next bite. Time advances only while visible. */
export class Friend {
  private random: () => number;
  constructor(random: () => number = Math.random) {
    this.random = random;
    this.character = Math.floor(this.random() * friends.length);
  }
  character: number;
  available = new Set<Food>(foods);
  phase: Phase = 'idle';
  food: Food = 'strawberry';
  next: Food | null = null;
  elapsed = 0;
  reaction = 0;
  meals = 0;
  touchRemaining = 0;
  touchReaction = 0;
  touch() {
    this.touchReaction = (this.touchReaction + 1) % 3;
    this.touchRemaining = 520;
  }
  offer(food: Food) {
    if (!this.available.has(food) || this.phase === 'changing') return;
    if (this.phase !== 'idle' && this.food === food) return;
    if (this.phase !== 'idle') {
      this.next = food;
      return;
    }
    this.food = food;
    this.phase = 'offering';
    this.elapsed = 0;
  }
  private changeFriend() {
    this.character =
      (this.character + 1 + Math.floor(this.random() * (friends.length - 1))) %
      friends.length;
    this.available = new Set(foods);
    this.next = null;
    this.phase = 'idle';
    this.elapsed = 0;
  }
  step(delta: number) {
    this.touchRemaining = Math.max(
      0,
      this.touchRemaining - Math.max(0, Math.min(delta, 80)),
    );
    if (this.phase === 'idle') return;
    this.elapsed += Math.max(0, Math.min(delta, 80));
    if (this.elapsed < durations[this.phase]) return;
    this.elapsed = 0;
    if (this.phase === 'changing') {
      this.changeFriend();
      return;
    }
    this.phase = phases[phases.indexOf(this.phase) + 1]!;
    if (this.phase === 'happy') {
      // Commit a bite only after swallowing. A cancelled offering is still on the table.
      this.available.delete(this.food);
      this.reaction = this.meals++ % 2;
    }
    if (this.phase === 'idle' && this.available.size === 0) {
      this.phase = 'changing';
      this.next = null;
      return;
    }
    if (this.phase === 'idle' && this.next) {
      const food = this.next;
      this.next = null;
      this.offer(food);
    }
  }
  reset() {
    // Finish an interrupted handover, including the last happy reaction.
    if (this.available.size === 0) this.changeFriend();
    this.touchRemaining = 0;
    this.phase = 'idle';
    this.next = null;
    this.elapsed = 0;
  }
}
