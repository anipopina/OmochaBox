import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import Matter from 'matter-js';
import { characterCollisions } from '../src/assets/characters/collision-data.ts';
import { createCharacterBody } from '../src/shared/character-physics.ts';

const { Body, Composite, Engine, Events, Vertices } = Matter;
const assetRoot = new URL('../src/assets/characters/', import.meta.url);
const series = (await readdir(assetRoot, { withFileTypes: true })).filter(
  (entry) => entry.isDirectory(),
);
const sprites = (
  await Promise.all(
    series.map(async ({ name }) =>
      (await readdir(new URL(name + '/', assetRoot)))
        .filter((file) => file.endsWith('.svg'))
        .map((file) => `${name}/${file.slice(0, -4)}`),
    ),
  )
).flat();
assert.deepEqual(Object.keys(characterCollisions).sort(), sprites.sort());

for (const id of sprites) {
  const svg = await readFile(new URL(id + '.svg', assetRoot), 'utf8');
  const values = /\bviewBox="([^"]+)"/
    .exec(svg)?.[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const definition = characterCollisions[id];
  assert.deepEqual(definition.viewBox, values, id);
  for (const part of definition.parts) {
    if (part.shape === 'polygon') {
      assert.equal(
        Vertices.isConvex(part.vertices.map(([x, y]) => ({ x, y }))),
        true,
        id,
      );
    }
  }
  const { body, artwork } = createCharacterBody(id, { x: 175, y: 210 }, 120, {
    restitution: 0.8,
  });
  assert.deepEqual(body.position, { x: 175, y: 210 }, id);
  assert.equal(body.angle, 0, id);
  assert.equal(body.restitution, 0.8, id);
  assert.equal(body.parts.length, definition.parts.length === 1 ? 1 : 3, id);
  const x = body.position.x + artwork.x;
  const y = body.position.y + artwork.y;
  assert.ok(
    body.bounds.min.x >= x && body.bounds.max.x <= x + artwork.width,
    `${id}: horizontal shape bounds`,
  );
  assert.ok(
    body.bounds.min.y >= y && body.bounds.max.y <= y + artwork.height,
    `${id}: vertical shape bounds`,
  );
}

const engine = Engine.create();
engine.gravity.scale = 0;
const circle = createCharacterBody(
  'shapes/02-cyan-circle',
  { x: 70, y: 120 },
  80,
);
const penguin = createCharacterBody(
  'aquarium/01-penguin-a',
  { x: 195, y: 120 },
  110,
);
Composite.add(engine.world, [circle.body, penguin.body]);
let collisions = 0;
Events.on(engine, 'collisionStart', ({ pairs }) => {
  collisions += pairs.length;
});
Body.setVelocity(circle.body, { x: 7, y: 0 });
for (let frame = 0; frame < 36; frame++) Engine.update(engine, 1000 / 60);
assert.ok(collisions > 0, 'A single shape collides with a compound body');
assert.ok(
  penguin.body.position.x > 205,
  'The collision moves the compound body',
);
console.log(
  `Character physics PASS: ${sprites.length} SVGs have aligned collision data and collide in Matter.js`,
);
