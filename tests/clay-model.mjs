import assert from 'node:assert/strict';
import { Clay, SIZE } from '../src/munyutto-nendo/model.ts';
const clay = new Clay();
const index = (u, v) =>
  Math.round(((v + 1) * (SIZE - 1)) / 2) * SIZE +
  Math.round(((u + 1) * (SIZE - 1)) / 2);
const center = index(0, 0);
const initial = clay.height[center];
assert.ok(clay.press(0, 0));
assert.ok(
  clay.height[center] < initial - 0.14,
  'A single tap leaves a deep bowl',
);
assert.ok(
  clay.height.some((h, i) => h > clay.base[i] + 0.02),
  'Material rises around the bowl',
);
const saved = clay.height.slice();
for (let n = 0; n < 100; n++) clay.press(0, 0);
assert.ok(
  clay.height[center] >= initial - 0.156,
  'Repeated taps cannot drill through the material',
);
assert.ok(clay.height[center] <= saved[center]);
clay.reset();
clay.stroke(-0.4, 0, 0.4, 0);
for (let x = -0.4; x <= 0.4; x += 0.05)
  assert.ok(
    clay.height[index(x, 0)] < clay.base[index(x, 0)] - 0.05,
    'Fast strokes form a connected trough',
  );
// One continuous segment and differently sampled events must give the same surface.
for (const [ax, ay, bx, by] of [
  [-0.5, 0, 0.5, 0],
  [-0.45, -0.4, 0.55, 0.45],
]) {
  const whole = new Clay();
  whole.stroke(ax, ay, bx, by);
  for (const steps of [3, 17, 61]) {
    const sampled = new Clay();
    for (let n = 0; n < steps; n++)
      sampled.stroke(
        ax + ((bx - ax) * n) / steps,
        ay + ((by - ay) * n) / steps,
        ax + ((bx - ax) * (n + 1)) / steps,
        ay + ((by - ay) * (n + 1)) / steps,
      );
    const difference = Math.max(
      ...sampled.height.map((h, i) => Math.abs(h - whole.height[i])),
    );
    assert.ok(
      difference < 0.000001,
      'Stroke event frequency cannot create comb-shaped ridges',
    );
  }
}
const horizontal = new Clay();
horizontal.stroke(-0.6, 0, 0.6, 0);
const ridge = Array.from({ length: 40 }, (_, n) => {
  const i = index(-0.35 + (n * 0.7) / 39, 0.24);
  return horizontal.height[i] - horizontal.base[i];
});
assert.ok(
  Math.max(...ridge) - Math.min(...ridge) < 0.000001,
  'Straight groove has a continuous uniform raised edge',
);
const first = new Clay(),
  second = new Clay();
first.stroke(-0.5, 0, 0.5, 0);
first.stroke(0, -0.5, 0, 0.5);
second.stroke(0, -0.5, 0, 0.5);
second.stroke(-0.5, 0, 0.5, 0);
assert.deepEqual(
  first.height,
  second.height,
  'Crossing paths form the same surface in either order',
);
const count = clay.height.length;
for (let n = 0; n < 4000; n++)
  clay.press(Math.sin(n * 2.39) * 0.73, Math.cos(n * 1.7) * 0.73);
assert.equal(clay.height.length, count, 'Repeated play uses fixed storage');
for (let i = 0; i < count; i++)
  assert.ok(
    Number.isFinite(clay.height[i]) &&
      clay.height[i] >= 0 &&
      clay.height[i] <= 0.34001,
  );
const before = clay.height.slice();
for (const p of [
  [4, 4],
  [NaN, 0],
  [Infinity, 0],
])
  clay.press(...p);
assert.deepEqual(clay.height, before, 'Invalid/outside input is harmless');
clay.reset();
assert.deepEqual(clay.height, clay.base, 'Reset completely restores the mound');
console.log(
  'Clay model: bowl, raised rim, saturation, connected strokes, bounded stress, invalid inputs and reset passed.',
);
