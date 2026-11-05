import assert from 'node:assert/strict';
import { MagnetModel } from '../src/pitatto-magnet/model.ts';
for (const [width, height] of [
  [296, 472],
  [366, 748],
  [820, 1084],
  [820, 294],
  [544, 224],
  [1256, 804],
]) {
  const m = new MagnetModel(width, height);
  const settle = () => {
    let moving;
    for (let i = 0; i < 600; i++) moving = m.step(1 / 60);
    assert.equal(moving, false);
  };
  assert.equal(m.enabled, false);
  assert.equal(m.toys.filter((t) => t.attached).length, 0);
  m.move(m.toys[0]);
  settle();
  assert.ok(m.toys[0].attached, 'tap target attracts');
  for (const t of m.toys) {
    m.move(t);
    settle();
  }
  assert.equal(m.toys.filter((t) => t.attached).length, 6);
  m.move({ x: -1000, y: 10000 }, true);
  settle();
  for (const t of m.toys)
    assert.ok(
      t.x >= 28 && t.y >= 28 && t.x <= width - 28 && t.y <= height - 28,
    );
  m.scatter();
  settle();
  assert.equal(m.toys.filter((t) => t.attached).length, 0);
  assert.equal(m.enabled, false);
  m.move(m.toys[2]);
  settle();
  assert.ok(m.toys[2].attached);
  m.resize(296, 224);
  m.settle();
  for (const t of m.toys)
    assert.ok(t.x >= 28 && t.y >= 28 && t.x <= 268 && t.y <= 196);
}
const m = new MagnetModel(1200, 800);
m.move(m.magnet);
m.step(1 / 60);
assert.equal(m.toys[0].attached, false, 'far toy stays detached');
console.log(
  'Magnet model: six layouts, tap acquisition, six captures, extreme bounds, release/reacquire, resize, finite settling, distance PASS',
);
