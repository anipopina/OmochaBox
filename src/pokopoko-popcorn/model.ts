export class Batch {
  readonly popped = Array<boolean>(6).fill(false);
  tap(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.popped.length)
      return null;
    const fresh = !this.popped[index];
    this.popped[index] = true;
    return fresh;
  }
  reset() {
    this.popped.fill(false);
  }
}
