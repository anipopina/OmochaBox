import Matter from 'matter-js';
import type { Body as RigidBody, IBodyDefinition, Vector } from 'matter-js';
import { characterCollisions } from '../assets/characters/collision-data';
import type {
  CharacterCollision,
  CharacterId,
  CollisionPart,
} from '../assets/characters/collision-data';

const { Bodies, Body, Vertices } = Matter;

export type CharacterBodyOptions = Pick<
  IBodyDefinition,
  | 'density'
  | 'friction'
  | 'frictionStatic'
  | 'frictionAir'
  | 'restitution'
  | 'isStatic'
  | 'isSensor'
  | 'collisionFilter'
>;

export interface CharacterBody {
  body: RigidBody;
  artwork: { x: number; y: number; width: number; height: number };
}

function convex(vertices: Vector[], options: CharacterBodyOptions) {
  const centre = Vertices.centre(vertices);
  return Bodies.fromVertices(centre.x, centre.y, [vertices], options);
}

function createPart(
  part: CollisionPart,
  [left, top]: CharacterCollision['viewBox'],
  scale: number,
  options: CharacterBodyOptions,
) {
  if (part.shape === 'polygon') {
    return convex(
      part.vertices.map(([x, y]) => ({
        x: (x - left) * scale,
        y: (y - top) * scale,
      })),
      options,
    );
  }
  const x = (part.x - left) * scale;
  const y = (part.y - top) * scale;
  if (part.shape === 'ellipse' && part.rx === part.ry) {
    return Bodies.circle(x, y, part.rx * scale, options);
  }

  // Bake each primitive's angle into its vertices so the artwork starts upright.
  const angle = ((part.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const offsets =
    part.shape === 'ellipse'
      ? Array.from({ length: 24 }, (_, i) => {
          const step = (i * 2 * Math.PI) / 24;
          return [Math.cos(step) * part.rx, Math.sin(step) * part.ry];
        })
      : [
          [-part.width / 2, -part.height / 2],
          [part.width / 2, -part.height / 2],
          [part.width / 2, part.height / 2],
          [-part.width / 2, part.height / 2],
        ];
  return convex(
    offsets.map(([dx, dy]) => ({
      x: x + (dx * cos - dy * sin) * scale,
      y: y + (dx * sin + dy * cos) * scale,
    })),
    options,
  );
}

export function createCharacterBody(
  id: CharacterId,
  position: Vector,
  width: number,
  options: CharacterBodyOptions = {},
): CharacterBody {
  if (!Number.isFinite(width) || width <= 0) {
    throw new RangeError('Character width must be positive and finite');
  }
  const { name, viewBox, parts }: CharacterCollision = characterCollisions[id];
  const scale = width / viewBox[2];
  const { isStatic, ...physics } = options;
  const bodies = parts.map((part) => createPart(part, viewBox, scale, physics));
  const body =
    bodies.length === 1
      ? bodies[0]
      : Body.create({ ...physics, parts: bodies });
  body.label = name;
  // Matter positions compound bodies at their center of mass, not the SVG center.
  const artwork = {
    x: -body.position.x,
    y: -body.position.y,
    width,
    height: viewBox[3] * scale,
  };
  Body.setPosition(body, position);
  if (isStatic) Body.setStatic(body, true);
  return { body, artwork };
}

export function drawCharacterArtwork(
  context: CanvasRenderingContext2D,
  character: CharacterBody,
  image: CanvasImageSource,
) {
  const { body, artwork } = character;
  context.save();
  context.translate(body.position.x, body.position.y);
  context.rotate(body.angle);
  context.drawImage(image, artwork.x, artwork.y, artwork.width, artwork.height);
  context.restore();
}
