export type Phase = 'closed' | 'knocking' | 'opening' | 'open' | 'closing';
export const DURATIONS = {
  knocking: 320,
  opening: 420,
  open: 3800,
  closing: 420,
};
export class Peekaboo {
  phase: Phase = 'closed';
  animal = -1;
  tap() {
    if (this.phase === 'closed') {
      this.animal = (this.animal + 1) % 3;
      this.phase = 'knocking';
      return true;
    }
    return false;
  }
  advance() {
    const next = {
      closed: 'closed',
      knocking: 'opening',
      opening: 'open',
      open: 'closing',
      closing: 'closed',
    } as const;
    this.phase = next[this.phase];
  }
  reset() {
    this.phase = 'closed';
  }
}
