import assert from 'node:assert/strict';
import {
  layout,
  nearest,
  progress,
  GAP,
  FALL,
} from '../src/koronto-domino/model.ts';
for (const [w, h] of [
  [320, 568],
  [390, 844],
  [844, 390],
  [1920, 1080],
]) {
  for (let variation = 0; variation < 3; variation++) {
    const points = layout(w, h, variation);
    for (const [i, p] of points.entries()) {
      assert.ok(
        p.x > 24 && p.x < w - 24 && p.y > 100 && p.y < h - 30,
        'route stays in field',
      );
      assert.equal(nearest(points, p.x, p.y), i);
      for (let start = 0; start < points.length; start++) {
        const order = (i - start + points.length) % points.length;
        assert.equal(progress(i, start, points.length, order * GAP), 0);
        assert.equal(progress(i, start, points.length, order * GAP + FALL), 1);
      }
    }
  }
}
console.log(
  'Domino: responsive route, nearest input and all chain start points PASS',
);
