import assert from 'node:assert/strict';
import {
  Digging,
  columns,
  rows,
  potatoLayout,
  brush,
  brushExposure,
  basketPotato,
  basketSize,
} from '../src/oimo-horihori/model.ts';
const g = new Digging();
assert.equal(g.harvest(), false);
g.dig(0.5, 0.5);
const count = g.cleared.size;
const exposure = Array.from(g.exposure);
for (let i = 0; i < 30; i++) assert.equal(g.dig(0.5, 0.5), false);
assert.equal(g.cleared.size, count, 'repeated stamp never expands');
assert.deepEqual(
  Array.from(g.exposure),
  exposure,
  'repetition preserves partial opacity',
);
assert.equal(g.phase, 'digging');
assert.equal(g.holes.length, 1, 'one smooth shape per stamp');
const circle = brush(0.5, 0.5, 740, 439);
assert.equal(circle.x, 0.5);
assert.equal(circle.y, 0.5);
assert.ok(
  Math.abs(circle.rx * 740 - circle.ry * 439) < 1e-9,
  'circular in CSS pixels',
);
assert.equal(brushExposure(0), 1);
assert.equal(brushExposure(0.6), 1);
assert.ok(Math.abs(brushExposure(0.8) - 0.5) < 1e-9);
assert.equal(brushExposure(1), 0);
assert.equal(brushExposure(1.1), 0);
assert.ok(
  g.exposure.some((value) => value > 0 && value < 1),
  'soft edge contains partial exposure',
);
for (let y = 0; y < rows; y++)
  for (let x = 0; x < columns; x++) {
    const index = y * columns + x;
    const expected = brushExposure(
      Math.hypot(
        ((x + 0.5) / columns - circle.x) / circle.rx,
        ((y + 0.5) / rows - circle.y) / circle.ry,
      ),
    );
    assert.ok(
      Math.abs(g.exposure[index] - expected) < 1e-7,
      'mask follows smooth brush profile',
    );
    assert.equal(g.cleared.has(index), g.exposure[index] >= 0.99);
  }
for (let y = 0; y <= 1; y += 0.05)
  for (let x = 0; x <= 1; x += 0.05) g.dig(x, y);
assert.equal(g.phase, 'ready');
assert.equal(g.round, 0);
assert.equal(g.harvest(), true);
assert.equal(g.harvest(), false);
g.next();
assert.equal(g.phase, 'digging');
assert.equal(g.holes.length, 0);
assert.ok(
  g.exposure.every((value) => value === 0),
  'new round restores opaque soil',
);
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
  'Oimo model PASS: single smooth brush, partial opacity, shared exposure field, no tap assistance, explicit harvest, single potato, 1080 safe layouts, basket variety, target exposure and resize',
);

const partial = new Digging();
partial.exposure[12880] = 0.5;
partial.setTargets([new Map([[12880, 100]])]);
assert.equal(
  partial.phase,
  'digging',
  'half-visible potato cannot be harvested',
);
partial.exposure[12880] = 0.94;
partial.setTargets([new Map([[12880, 100]])]);
assert.equal(
  partial.phase,
  'ready',
  'opacity-weighted exposure allows harvest',
);

const rim = new Digging();
const diagonal = new Map(
  Array.from({ length: 100 }, (_, i) => [(i + 25) * columns + i + 25, 100]),
);
for (const index of [...diagonal.keys()].slice(0, 92)) {
  rim.cleared.add(index);
  rim.exposure[index] = 1;
}
rim.setTargets([diagonal], 1180, 757);
assert.equal(rim.phase, 'digging', '92% remains covered');
rim.cleared.add([...diagonal.keys()][92]);
rim.exposure[[...diagonal.keys()][92]] = 1;
const beforeRim = new Set(rim.cleared);
rim.setTargets([diagonal], 1180, 757);
assert.equal(rim.phase, 'ready');
assert.ok(rim.readyRim.length > 0);
for (const index of diagonal.keys()) assert.ok(rim.cleared.has(index));
for (const index of rim.cleared)
  if (!beforeRim.has(index)) {
    const x = ((index % columns) + 0.5) / columns,
      y = (Math.floor(index / columns) + 0.5) / rows;
    assert.ok(
      rim.readyRim.some(
        (c) => ((x - c.x) / c.rx) ** 2 + ((y - c.y) / c.ry) ** 2 <= 1,
      ),
      'rim cell must be inside a drawn curve',
    );
  }
rim.setTargets([new Map([[150, 100]])], 390, 844);
assert.ok(rim.cleared.has(150), 'rotated ready target revealed by new curves');
console.log(
  'Oimo rim regression PASS: threshold unchanged; entire target visible; every added cell lies inside the curved mask; resize preserves readiness',
);
