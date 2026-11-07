import assert from 'node:assert/strict';
import {
  Digging,
  columns,
  rows,
  potatoLayout,
  brush,
  oldField,
  basketPotato,
  basketSize,
} from '../src/oimo-horihori/model.ts';
const g = new Digging();
assert.equal(g.harvest(), false);
g.dig(0.5, 0.5);
const count = g.cleared.size;
for (let i = 0; i < 30; i++) g.dig(0.5, 0.5);
assert.equal(g.cleared.size, count, 'repeated stamp never expands');
assert.equal(g.phase, 'digging');
const circles = brush(0.5, 0.5, 740, 439);
for (let y = 0; y < rows; y++)
  for (let x = 0; x < columns; x++)
    assert.equal(
      g.cleared.has(y * columns + x),
      circles.some(
        (c) =>
          (((x + 0.5) / columns - c.x) / c.rx) ** 2 +
            (((y + 0.5) / rows - c.y) / c.ry) ** 2 <=
          1,
      ),
      'same geometry for visual and hit',
    );
const old = oldField(740, 439),
  oldArea = Math.PI * 0.23 * 0.2875 * old.width * old.height;
assert.ok(((count / (columns * rows)) * 740 * 439) / oldArea > 0.4);
assert.ok(
  ((count / (columns * rows)) * 740 * 439) / oldArea < 0.65,
  'roughly half prior stamp area',
);
for (let y = 0; y <= 1; y += 0.1) for (let x = 0; x <= 1; x += 0.1) g.dig(x, y);
assert.equal(g.phase, 'ready');
assert.equal(g.round, 0);
assert.equal(g.harvest(), true);
assert.equal(g.harvest(), false);
g.next();
assert.equal(g.phase, 'digging');
assert.equal(g.holes.length, 0);
for (const [w, h] of [
  [320, 568],
  [390, 844],
  [820, 1180],
  [844, 390],
  [568, 320],
  [1280, 900],
  [1180, 757],
  [280, 1000],
  [1000, 280],
])
  for (let seed = 1; seed <= 10; seed++)
    for (let round = 0; round < 12; round++) {
      const [p] = potatoLayout(w, h, round, seed);
      assert.equal(potatoLayout(w, h, round, seed).length, 1);
      const a = (p.angle * Math.PI) / 180,
        bw =
          (Math.abs(p.width * Math.cos(a)) + Math.abs(p.height * Math.sin(a))) *
          1.04,
        bh =
          (Math.abs(p.width * Math.sin(a)) + Math.abs(p.height * Math.cos(a))) *
          1.04;
      const cx = p.left + p.width / 2,
        cy = p.top + p.height / 2;
      assert.ok(
        cx - bw / 2 >= 0 &&
          cy - bh / 2 >= 0 &&
          cx + bw / 2 <= w &&
          cy + bh / 2 <= h,
        'rotated full image fits',
      );
      const s = basketSize(w, h);
      for (const r of [
        { left: 8, top: 8, width: 72, height: 72 },
        { left: w - s - 12, top: h - s - 12, width: s, height: s },
      ])
        assert.ok(
          !(
            cx + bw / 2 > r.left &&
            cx - bw / 2 < r.left + r.width &&
            cy + bh / 2 > r.top &&
            cy - bh / 2 < r.top + r.height
          ),
          'UI never hides potato',
        );
    }
assert.equal(
  new Set(Array.from({ length: 10 }, (_, i) => JSON.stringify(basketPotato(i))))
    .size,
  10,
);
const target = new Digging();
target.setTargets([new Map([[12880, 100]])]);
target.dig(0.5, 0.5);
assert.equal(target.phase, 'ready');
assert.ok(target.cleared.size < columns * rows * 0.5);
target.setTargets([new Map([[500, 100]])]);
assert.ok(target.cleared.has(500));
console.log(
  'Oimo model PASS: half-area irregular stamp, exact shared geometry, no tap assistance, explicit harvest, single potato, 1080 safe layouts, basket variety, target exposure and resize',
);
