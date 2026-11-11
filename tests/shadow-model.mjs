import assert from 'node:assert/strict';
import { layout, lightAt } from '../src/kage-asobi/model.ts';
for (const [width, height] of [
  [320, 568],
  [390, 844],
  [844, 390],
  [1440, 900],
  [768, 1024],
]) {
  const left = layout(width, height, { x: 0, y: 0.5 });
  const right = layout(width, height, { x: 1, y: 0.5 });
  assert.ok(left.angle > 0 && right.angle < 0);
  assert.ok(Math.abs(left.angle + right.angle) < 1e-9);
  assert.ok(
    layout(width, height, { x: 0.5, y: 0 }).length >
      layout(width, height, { x: 0.5, y: 1 }).length,
  );
  assert.deepEqual(lightAt(width, height, -100, -100), { x: 0, y: 0 });
  assert.deepEqual(lightAt(width, height, width + 100, height + 100), {
    x: 1,
    y: 1,
  });
  for (let x = 0; x <= 1; x += 0.1)
    for (let y = 0; y <= 1; y += 0.1) {
      const p = layout(width, height, { x, y });
      const angle = (p.angle * Math.PI) / 180;
      const tip = {
        x: p.foot.x + Math.sin(angle) * p.length,
        y: p.foot.y - Math.cos(angle) * p.length,
      };
      assert.ok(tip.x >= 0 && tip.x <= width && tip.y >= 90);
      assert.ok(
        p.x >= 40 && p.x <= width - 40 && p.y >= 40 && p.y <= height - 40,
      );
    }
}
console.log('Shadow model PASS: direction, distance, bounds, clamping');
