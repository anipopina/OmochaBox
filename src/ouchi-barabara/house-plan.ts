// Building definitions as plain data, so the plan can be checked without WebGL.
// The excavator approaches along +X; the house front faces -X.
import type { Point3, StrikeStyle } from './rig';

export type PieceKind =
  | 'wall'
  | 'slab'
  | 'roof'
  | 'ridge'
  | 'gable'
  | 'chimney'
  /** Plain block with no special handling, such as a rooftop tank. */
  | 'prop';
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
  /** How the bucket meets the target (default: slam down from above). */
  style?: StrikeStyle;
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

export interface HousePalette {
  wall: [number, number];
  endWall: [number, number];
  slab: [number, number];
  roof: [number, number];
  ridge: number;
  chimney: number;
}

/**
 * Vivid wall/roof pairs. Successive houses use different palettes so the next
 * house reads as a new one even before Phase 3 adds other building shapes.
 */
export const PALETTES: HousePalette[] = [
  {
    wall: [0xff6f9c, 0xff8db1],
    endWall: [0xff7fa6, 0xff9bbb],
    slab: [0xfff1c9, 0xffe2a1],
    roof: [0x2f73e0, 0x4189f5],
    ridge: 0x1d4fb0,
    chimney: 0xd9472f,
  },
  {
    wall: [0x5ed49a, 0x7fe0b0],
    endWall: [0x6fdaa5, 0x8fe6bb],
    slab: [0xfff1c9, 0xffe2a1],
    roof: [0xe8443a, 0xf4614f],
    ridge: 0xb52a22,
    chimney: 0x8a5a3c,
  },
  {
    wall: [0x5cc8ff, 0x80d6ff],
    endWall: [0x6dceff, 0x92dcff],
    slab: [0xfff1c9, 0xffe2a1],
    roof: [0xff8a1f, 0xffa042],
    ridge: 0xd96a00,
    chimney: 0xd9472f,
  },
  {
    wall: [0xffd23f, 0xffde6b],
    endWall: [0xffd64f, 0xffe27a],
    slab: [0xfff1c9, 0xffe2a1],
    roof: [0x8b5cf6, 0xa07bf8],
    ridge: 0x6a3fd4,
    chimney: 0xd9472f,
  },
];

interface GableRoofOptions {
  x0: number;
  x1: number;
  halfWidth: number;
  wall: number;
  /** Top of the walls the gables stand on. */
  wallTop: number;
  rise: number;
  palette: HousePalette;
  /** Attack zone for the front (toward the excavator) or back half. */
  zone: (front: boolean) => number;
  ridgeZone: number;
  chimney?: { zone: number; x: number; z: number };
}

/**
 * Gable roof with the ridge along Z, so the front slope faces the excavator:
 * two panels per slope, a ridge cap, gable triangles above the side walls and
 * an optional chimney. Returns the height of the roof surface at a given X.
 */
function gableRoof(pieces: PieceSpec[], o: GableRoofOptions) {
  const { x0, x1, halfWidth, wall, wallTop, rise, palette } = o;
  const mid = (x0 + x1) / 2;
  const run = mid - x0;
  const pitch = Math.atan2(rise, run);
  const thickness = 0.2;
  // Panels float a little above the gables so the bodies never start
  // interpenetrated.
  const eaveTop = wallTop + 0.07 + thickness / Math.cos(pitch);
  const slope = Math.hypot(run, rise);
  const overhang = 0.35;
  const start = -overhang;
  // Stop short of the ridge so front and back panels never overlap.
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
        zone: o.zone(front),
        center: {
          x: front ? cx : 2 * mid - cx,
          y: cy,
          z: (side * roofHalf) / 2,
        },
        size: { x: end - start, y: thickness, z: roofHalf },
        tilt: sign * pitch,
        color: palette.roof[(side > 0 ? 0 : 1) ^ (front ? 0 : 1)],
        delay: front ? 0 : 0.04,
      });
    }
  }
  pieces.push({
    kind: 'ridge',
    zone: o.ridgeZone,
    center: { x: mid, y: eaveTop + rise + 0.04, z: 0 },
    size: { x: 0.3, y: 0.12, z: roofHalf * 2 },
    color: palette.ridge,
  });
  // Gable triangles above the side walls, split at the ridge.
  for (const side of [1, -1]) {
    for (const front of [true, false]) {
      pieces.push({
        kind: 'gable',
        zone: o.zone(front),
        center: {
          x: front ? (x0 + mid) / 2 : (mid + x1) / 2,
          y: wallTop + rise / 2,
          z: side * (halfWidth - wall / 2),
        },
        size: { x: run, y: rise, z: wall },
        rise: front ? 1 : -1,
        color: palette.wall[front ? 1 : 0],
      });
    }
  }
  const roofTop = (x: number) =>
    x <= mid
      ? eaveTop + (x - x0) * (rise / run)
      : eaveTop + rise - (x - mid) * (rise / run);
  // Chimney on a slope. It ignores collisions with the roof so it can sit on
  // the slope without the two bodies starting interpenetrated.
  if (o.chimney) {
    const { x, z, zone } = o.chimney;
    pieces.push({
      kind: 'chimney',
      zone,
      center: { x, y: roofTop(x - 0.2) + 0.2, z },
      size: { x: 0.4, y: 0.75, z: 0.4 },
      color: palette.chimney,
      delay: 0.08,
    });
  }
  return roofTop;
}

export function twoStoryHouse(palette: HousePalette = PALETTES[0]): HousePlan {
  const { wall: WALL, endWall: END_WALL, slab: SLAB } = palette;
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

  const gableBase = 2 * storey + slab;
  const roofTop = gableRoof(pieces, {
    x0,
    x1,
    halfWidth,
    wall,
    wallTop: gableBase,
    rise: 1,
    palette,
    zone: (front) => (front ? 0 : 2),
    ridgeZone: 0,
    chimney: { zone: 2, x: mid + 1, z: -0.8 },
  });

  return {
    id: 'two-story',
    pieces,
    frontX: x0,
    core: { x: mid, z: 0 },
    // Parked as far back as each hit's reach allows, so the lifted arm stays
    // clear of the house while winding up.
    attacks: [
      { rootX: -1.8, target: { x: 3.1, y: roofTop(3.1), z: 0 } },
      { rootX: -1.8, target: { x: 3, y: storey + slab, z: 0 }, power: 1.7 },
      { rootX: 0, target: { x: 4.75, y: roofTop(4.75), z: 0 } },
      {
        rootX: 0,
        target: { x: 4.65, y: gableBase, z: halfWidth - wall / 2 },
        final: true,
        power: 1.4,
      },
    ],
  };
}

/**
 * One-storey cottage, down in two hits: the first takes the roof and the
 * front, the second the rest.
 */
export function smallHouse(palette: HousePalette = PALETTES[0]): HousePlan {
  const { wall: WALL, endWall: END_WALL } = palette;
  const x0 = 2.4;
  const x1 = 4.8;
  const mid = (x0 + x1) / 2;
  const halfWidth = 1.2;
  const wall = 0.3;
  const storey = 1.2;
  const block = (x1 - x0) / 3;
  const pieces: PieceSpec[] = [];
  for (const side of [1, -1] as const)
    for (let i = 0; i < 3; i++)
      pieces.push({
        kind: 'wall',
        zone: i === 0 ? 0 : 1,
        center: {
          x: x0 + block / 2 + i * block,
          y: storey / 2,
          z: side * (halfWidth - wall / 2),
        },
        size: { x: block, y: storey, z: wall },
        color: WALL[i % 2],
        decor: { kind: 'window', face: side > 0 ? '+z' : '-z' },
        delay: i === 0 ? 0 : 0.05 * i,
      });
  const inner = halfWidth - wall;
  const span = (inner * 2) / 3;
  for (const end of [-1, 1] as const)
    for (let j = 0; j < 3; j++) {
      const front = end < 0;
      pieces.push({
        kind: 'wall',
        zone: front ? 0 : 1,
        center: {
          x: front ? x0 + wall / 2 : x1 - wall / 2,
          y: storey / 2,
          z: -inner + span / 2 + j * span,
        },
        size: { x: wall, y: storey, z: span },
        color: END_WALL[j % 2],
        decor:
          j === 1
            ? { kind: front ? 'door' : 'window', face: front ? '-x' : '+x' }
            : undefined,
        delay: front ? 0 : 0.12 + 0.05 * j,
      });
    }
  const roofTop = gableRoof(pieces, {
    x0,
    x1,
    halfWidth,
    wall,
    wallTop: storey,
    rise: 0.8,
    palette,
    zone: () => 0,
    ridgeZone: 0,
    chimney: { zone: 0, x: mid + 0.65, z: -0.5 },
  });
  return {
    id: 'small',
    pieces,
    frontX: x0,
    core: { x: mid, z: 0 },
    attacks: [
      { rootX: -1.4, target: { x: x0 + 0.6, y: roofTop(x0 + 0.6), z: 0 } },
      {
        rootX: -1.4,
        target: { x: x0 + 1.2, y: storey, z: halfWidth - wall / 2 },
        final: true,
        power: 1.4,
      },
    ],
  };
}

/**
 * Four-storey block with a flat roof, taken down from the top one storey at
 * a time; the last hit brings down what is left of the ground floor.
 */
export function tallBuilding(palette: HousePalette = PALETTES[0]): HousePlan {
  const { wall: WALL, endWall: END_WALL, slab: SLAB, roof: ROOF } = palette;
  const x0 = 2.4;
  const x1 = 5.2;
  const mid = (x0 + x1) / 2;
  const halfWidth = 1.4;
  const wall = 0.3;
  const storey = 1.1;
  const slab = 0.2;
  const level = storey + slab;
  const floors = 4;
  const block = (x1 - x0) / 2;
  const pieces: PieceSpec[] = [];
  // Which hit breaks each part, top down. Ground floor walls go last except
  // the front end wall, which falls with the floor above.
  const wallZone = (floor: number, front: boolean, endWall: boolean) => {
    if (floor === 3) return 0;
    if (floor === 2) return 1;
    if (floor === 1) return front ? 2 : 3;
    return front && endWall ? 3 : 4;
  };
  for (let floor = 0; floor < floors; floor++) {
    const y = floor * level + storey / 2;
    for (const side of [1, -1] as const)
      for (let i = 0; i < 2; i++) {
        const zone = wallZone(floor, i === 0, false);
        pieces.push({
          kind: 'wall',
          zone,
          center: {
            x: x0 + block / 2 + i * block,
            y,
            z: side * (halfWidth - wall / 2),
          },
          size: { x: block, y: storey, z: wall },
          color: WALL[(i + floor) % 2],
          decor: { kind: 'window', face: side > 0 ? '+z' : '-z' },
          delay: zone === 4 ? 0.12 + 0.05 * i : 0.04 * i,
        });
      }
    const inner = halfWidth - wall;
    for (const end of [-1, 1] as const)
      for (let j = 0; j < 2; j++) {
        const front = end < 0;
        const zone = wallZone(floor, front, true);
        pieces.push({
          kind: 'wall',
          zone,
          center: {
            x: front ? x0 + wall / 2 : x1 - wall / 2,
            y,
            z: -inner / 2 + j * inner,
          },
          size: { x: wall, y: storey, z: inner },
          color: END_WALL[(j + floor) % 2],
          decor: {
            kind: floor === 0 && front && j === 0 ? 'door' : 'window',
            face: front ? '-x' : '+x',
          },
          delay: zone === 4 ? 0.2 + 0.05 * j : 0.05,
        });
      }
  }
  // Floors between storeys (L1–L3) and the roof, split left/right.
  const slabZone = [4, 2, 1, 0];
  for (let k = 1; k <= floors; k++)
    for (const side of [1, -1])
      pieces.push({
        kind: 'slab',
        zone: slabZone[k - 1],
        center: { x: mid, y: k * level - slab / 2, z: (side * halfWidth) / 2 },
        size: { x: x1 - x0, y: slab, z: halfWidth },
        color: k === floors ? ROOF[side > 0 ? 0 : 1] : SLAB[side > 0 ? 0 : 1],
        // Floors drop after the walls below them start to go.
        delay: k === floors ? 0 : 0.08,
      });
  const top = floors * level;
  pieces.push({
    kind: 'prop',
    zone: 0,
    center: { x: x0 + 1.8, y: top + 0.3, z: -0.45 },
    size: { x: 0.7, y: 0.6, z: 0.7 },
    color: palette.ridge,
    delay: 0.05,
  });
  const slabTop = (k: number) => k * level;
  const PARK = -1.8;
  const PARK_CLOSE = -1.4;
  return {
    id: 'tower',
    pieces,
    frontX: x0,
    core: { x: mid, z: 0 },
    // The first hit swings in sideways against the top storey's front wall
    // instead of slamming through the roof. The excavator parks well back for
    // the upper storeys and drives in once for the lower ones.
    attacks: [
      {
        rootX: PARK,
        target: { x: x0, y: 3 * level + storey * 0.55, z: 0 },
        style: 'side',
      },
      { rootX: PARK, target: { x: x0 + 0.3, y: slabTop(3), z: 0 } },
      { rootX: PARK, target: { x: x0 + 0.6, y: slabTop(2), z: 0 }, power: 1.2 },
      {
        rootX: PARK_CLOSE,
        target: {
          // Near end of the back block's top, within reach.
          x: x0 + block + 0.2,
          y: level + storey,
          z: halfWidth - wall / 2,
        },
        power: 1.5,
      },
      {
        rootX: PARK_CLOSE,
        target: { x: mid, y: slabTop(1), z: 0 },
        final: true,
        power: 1.4,
      },
    ],
  };
}

/** Building shapes the road cycles through (never the same twice running). */
export const BUILDINGS = [smallHouse, twoStoryHouse, tallBuilding];
