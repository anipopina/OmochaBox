// Building definitions as plain data, so the plan can be checked without WebGL.
// The excavator approaches along +X; the house front faces -X.
import type { Point3 } from './rig';

export type PieceKind =
  'wall' | 'slab' | 'roof' | 'ridge' | 'gable' | 'chimney';
export type Face = '+x' | '-x' | '+z' | '-z';

export interface PieceSpec {
  kind: PieceKind;
  /** Index of the attack that breaks this piece loose. */
  zone: number;
  center: Point3;
  /** Box extents. A gable's box is its triangle's bounding box. */
  size: Point3;
  /** Rotation around Z (roof slopes rise along X). */
  tilt?: number;
  /** For gables: +1 when the triangle's tall side faces +X. */
  rise?: 1 | -1;
  color: number;
  decor?: { kind: 'window' | 'door'; face: Face };
  /** Seconds after the impact before this piece breaks loose. */
  delay?: number;
}

export interface AttackSpec {
  /** Excavator position along X for this attack; larger means drive forward. */
  rootX: number;
  /** Where the bucket teeth land. Always on the surface of a standing piece. */
  target: Point3;
  final?: boolean;
  /**
   * Strength of the push given to the loosened pieces (default 1). Parts that
   * stand on the ground under a floor need more to break free.
   */
  power?: number;
}

export interface HousePlan {
  id: string;
  pieces: PieceSpec[];
  attacks: AttackSpec[];
  /** Front face X; the excavator tracks must stay behind it. */
  frontX: number;
  /** Footprint centre; the final collapse throws pieces away from it. */
  core: { x: number; z: number };
}

const WALL = [0xff6f9c, 0xff8db1];
const END_WALL = [0xff7fa6, 0xff9bbb];
const SLAB = [0xfff1c9, 0xffe2a1];
const ROOF = [0x2f73e0, 0x4189f5];
const RIDGE = 0x1d4fb0;
const CHIMNEY = 0xd9472f;

export function twoStoryHouse(): HousePlan {
  const x0 = 2.4;
  const x1 = 6;
  const mid = (x0 + x1) / 2;
  const halfWidth = 1.6;
  const wall = 0.3;
  const storey = 1.2;
  const slab = 0.25;
  const pieces: PieceSpec[] = [];

  const floorBase = [0, storey + slab];
  floorBase.forEach((base, floor) => {
    const y = base + storey / 2;
    // Long side walls at ±Z, four blocks each, facing the camera on +Z.
    for (const side of [1, -1] as const) {
      for (let i = 0; i < 4; i++) {
        const front = i < 2;
        pieces.push({
          kind: 'wall',
          zone: front ? (floor === 1 ? 0 : 1) : 3,
          center: {
            x: x0 + 0.45 + i * 0.9,
            y,
            z: side * (halfWidth - wall / 2),
          },
          size: { x: 0.9, y: storey, z: wall },
          color: WALL[(i + floor) % 2],
          decor: { kind: 'window', face: side > 0 ? '+z' : '-z' },
          delay: front ? 0 : floor === 1 ? 0.04 * i : 0.12 + 0.05 * i,
        });
      }
    }
    // End walls between the side walls.
    const inner = halfWidth - wall;
    const span = (inner * 2) / 3;
    for (const end of [-1, 1] as const) {
      for (let j = 0; j < 3; j++) {
        const front = end < 0;
        pieces.push({
          kind: 'wall',
          zone: front ? (floor === 1 ? 0 : 1) : floor === 1 ? 2 : 3,
          center: {
            x: front ? x0 + wall / 2 : x1 - wall / 2,
            y,
            z: -inner + span / 2 + j * span,
          },
          size: { x: wall, y: storey, z: span },
          color: END_WALL[(j + floor) % 2],
          decor:
            j === 1
              ? {
                  kind: floor === 0 && front ? 'door' : 'window',
                  face: front ? '-x' : '+x',
                }
              : undefined,
          delay: front ? 0 : floor === 1 ? 0.15 + 0.06 * j : 0.16 + 0.05 * j,
        });
      }
    }
  });

  // Floor of the upper storey, split front/back and left/right. One large
  // slab is heavy and falls flat, absorbing the hit; quarters break apart
  // along the seam under the bucket.
  for (const front of [true, false]) {
    for (const side of [1, -1]) {
      pieces.push({
        kind: 'slab',
        zone: front ? 1 : 3,
        center: {
          x: front ? (x0 + mid) / 2 : (mid + x1) / 2,
          y: storey + slab / 2,
          z: (side * halfWidth) / 2,
        },
        size: { x: mid - x0, y: slab, z: halfWidth },
        color: SLAB[(side > 0 ? 0 : 1) ^ (front ? 0 : 1)],
        // After the walls below, so they escape before the floor lands on them.
        delay: front ? 0.1 : 0.34,
      });
    }
  }

  // Gable roof with the ridge along Z, so the front slope faces the excavator.
  const eaveTop = 2 * storey + slab + 0.3;
  const rise = 1;
  const run = mid - x0;
  const pitch = Math.atan2(rise, run);
  const thickness = 0.2;
  const slope = Math.hypot(run, rise);
  const overhang = 0.35;
  const start = -overhang;
  const end = slope - 0.06;
  const along = (start + end) / 2;
  const roofHalf = halfWidth + 0.25;
  for (const front of [true, false]) {
    const sign = front ? 1 : -1;
    // Centre of the front panel, then mirrored about the ridge for the back.
    const cx = x0 + Math.cos(pitch) * along + Math.sin(pitch) * (thickness / 2);
    const cy =
      eaveTop + Math.sin(pitch) * along - Math.cos(pitch) * (thickness / 2);
    for (const side of [1, -1]) {
      pieces.push({
        kind: 'roof',
        zone: front ? 0 : 2,
        center: {
          x: front ? cx : 2 * mid - cx,
          y: cy,
          z: (side * roofHalf) / 2,
        },
        size: { x: end - start, y: thickness, z: roofHalf },
        tilt: sign * pitch,
        color: ROOF[(side > 0 ? 0 : 1) ^ (front ? 0 : 1)],
        delay: front ? 0 : 0.04,
      });
    }
  }
  pieces.push({
    kind: 'ridge',
    zone: 0,
    center: { x: mid, y: eaveTop + rise + 0.04, z: 0 },
    size: { x: 0.3, y: 0.12, z: roofHalf * 2 },
    color: RIDGE,
  });

  // Gable triangles above the side walls, split at the ridge.
  const gableBase = 2 * storey + slab;
  for (const side of [1, -1]) {
    for (const front of [true, false]) {
      pieces.push({
        kind: 'gable',
        zone: front ? 0 : 2,
        center: {
          x: front ? (x0 + mid) / 2 : (mid + x1) / 2,
          y: gableBase + rise / 2,
          z: side * (halfWidth - wall / 2),
        },
        size: { x: run, y: rise, z: wall },
        rise: front ? 1 : -1,
        color: WALL[front ? 1 : 0],
      });
    }
  }

  // Chimney on the back slope. It ignores collisions with the roof so it can
  // sit on the slope without the two bodies starting interpenetrated.
  const chimneyX = mid + 1;
  const roofAt = eaveTop + rise - (chimneyX - 0.2 - mid) * (rise / run);
  pieces.push({
    kind: 'chimney',
    zone: 2,
    center: { x: chimneyX, y: roofAt + 0.2, z: -0.8 },
    size: { x: 0.4, y: 0.75, z: 0.4 },
    color: CHIMNEY,
    delay: 0.08,
  });

  const roofTop = (x: number) =>
    x <= mid
      ? eaveTop + (x - x0) * (rise / run)
      : eaveTop + rise - (x - mid) * (rise / run);

  return {
    id: 'two-story',
    pieces,
    frontX: x0,
    core: { x: mid, z: 0 },
    attacks: [
      { rootX: -1.4, target: { x: 3.1, y: roofTop(3.1), z: 0 } },
      { rootX: -1.4, target: { x: 3, y: storey + slab, z: 0 }, power: 1.7 },
      { rootX: 0.4, target: { x: 4.75, y: roofTop(4.75), z: 0 } },
      {
        rootX: 0.4,
        target: { x: 4.65, y: gableBase, z: halfWidth - wall / 2 },
        final: true,
        power: 1.4,
      },
    ],
  };
}
