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
const sum = (a) => a.reduce((s, h) => s + h, 0);
assert.ok(
  Math.abs(sum(clay.height) - sum(clay.base)) < 0.01,
  'Unsaturated press transfers material to the rim',
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
  'Clay model: bowl, raised rim, material transfer, saturation, connected strokes, bounded stress, invalid inputs and reset passed.',
);
