import assert from 'node:assert/strict';
import {
  Digging,
  columns,
  rows,
  potatoLayout,
} from '../src/oimo-horihori/model.ts';
const g = new Digging();
assert.equal(g.harvest(), false);
for (let i = 0; i < 100; i++) g.dig(0.5, 0.5);
assert.equal(g.phase, 'digging');
assert.equal(g.harvest(), false, 'same spot never harvests');
for (let y = 0; y <= 1; y += 0.12)
  for (let x = 0; x <= 1; x += 0.12) g.dig(x, y);
assert.equal(g.phase, 'ready');
assert.ok(g.cleared.size >= columns * rows * 0.93);
assert.equal(g.round, 0, 'exposure alone does not harvest');
assert.equal(g.harvest(), true);
assert.equal(g.harvest(), false, 'no duplicate harvest');
assert.equal(g.dig(0.2, 0.3), false);
g.next();
assert.equal(g.round, 1);
assert.equal(g.phase, 'digging');
assert.equal(g.cleared.size, 0);
console.log(
  'Oimo model: exposure threshold, repeated input, explicit harvest, reset PASS',
);

const assisted = new Digging();
assisted.dig(0.5, 0.5);
for (let i = 0; i < 8; i++) {
  const before = assisted.cleared.size;
  assisted.dig(0.5, 0.5, true);
  assert.equal(
    assisted.cleared.size - before,
    8,
    'each stationary tap removes only eight nearby cells',
  );
  assert.equal(assisted.phase, 'digging');
}
for (let i = 0; i < 100; i++) assisted.dig(0.5, 0.5, true);
assert.equal(assisted.phase, 'ready');
assert.equal(assisted.round, 0, 'tap assist only exposes; it never harvests');
for (const [width, height] of [
  [282, 329],
  [343, 490],
  [722, 510],
  [574, 238],
  [386, 195],
  [740, 439],
  [740, 510],
]) {
  for (let round = 0; round < 3; round++) {
    for (const p of potatoLayout(width, height, round)) {
      const a = (p.angle * Math.PI) / 180;
      for (const dx of [-p.width / 2, p.width / 2])
        for (const dy of [-p.height / 2, p.height / 2]) {
          const x = p.left + p.width / 2 + dx * Math.cos(a) - dy * Math.sin(a);
          const y = p.top + p.height / 2 + dx * Math.sin(a) + dy * Math.cos(a);
          assert.ok(
            (((x - width / 2) * 1.035) / (width / 2)) ** 2 +
              (((y - height / 2) * 1.035) / (height / 2)) ** 2 <
              1,
            'entire image rectangle fits clipping ellipse even at ready pulse peak',
          );
        }
    }
  }
}
console.log(
  'Oimo regression: eight-tap assistance, no automatic harvest, all rotated image corners inside field at pulse peak PASS',
);

const pairs = new Digging();
pairs.setTargets([new Map([[0, 100]]), new Map([[279, 100]])]);
pairs.dig(0, 0);
assert.equal(
  pairs.phase,
  'digging',
  'one visible potato must not expose the other',
);
pairs.dig(1, 1);
assert.equal(pairs.phase, 'ready');
assert.ok(
  pairs.cleared.size < columns * rows * 0.6,
  'outer soil need not be cleared',
);
console.log(
  'Oimo exposure: both potatoes required; outer soil is irrelevant PASS',
);

pairs.setTargets([new Map([[130, 100]])]);
assert.equal(pairs.phase, 'ready');
assert.ok(
  pairs.cleared.has(130),
  'ready potato stays fully uncovered after layout changes',
);
