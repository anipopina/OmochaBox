type Point = readonly [x: number, y: number];

export type CollisionPart =
  | {
      shape: 'ellipse';
      x: number;
      y: number;
      rx: number;
      ry: number;
      angle?: number;
    }
  | {
      shape: 'rectangle';
      x: number;
      y: number;
      width: number;
      height: number;
      angle?: number;
    }
  | { shape: 'polygon'; vertices: readonly [Point, Point, Point, ...Point[]] };

export interface CharacterCollision {
  name: string;
  viewBox: readonly [left: number, top: number, width: number, height: number];
  parts: readonly [CollisionPart] | readonly [CollisionPart, CollisionPart];
}

export const characterCollisions = {
  'shapes/01-coral-square': {
    name: 'コーラルのしかく',
    viewBox: [0, 0, 512, 461],
    parts: [
      {
        shape: 'rectangle',
        x: 249,
        y: 221,
        width: 300,
        height: 318,
        angle: 22,
      },
    ],
  },
  'shapes/02-cyan-circle': {
    name: 'あおいまる',
    viewBox: [0, 0, 512, 428],
    parts: [{ shape: 'ellipse', x: 252, y: 193, rx: 174, ry: 174 }],
  },
  'shapes/03-purple-circle': {
    name: 'むらさきのまる',
    viewBox: [0, 0, 509, 512],
    parts: [{ shape: 'ellipse', x: 255, y: 256, rx: 226, ry: 226 }],
  },
  'shapes/04-yellow-triangle': {
    name: 'きいろいさんかく',
    viewBox: [0, 0, 512, 450],
    parts: [
      {
        shape: 'polygon',
        vertices: [
          [256, 31],
          [485, 420],
          [27, 420],
        ],
      },
    ],
  },
  'shapes/05-coral-star': {
    name: 'コーラルのほし',
    viewBox: [0, 0, 512, 487],
    parts: [
      {
        shape: 'polygon',
        vertices: [
          [256, 37],
          [430, 199],
          [364, 406],
          [148, 406],
          [82, 199],
        ],
      },
    ],
  },
  'shapes/06-mint-rectangle': {
    name: 'ミントのながしかく',
    viewBox: [0, 0, 485, 512],
    parts: [
      {
        shape: 'rectangle',
        x: 184,
        y: 257,
        width: 316,
        height: 452,
        angle: -1.5,
      },
    ],
  },
  'aquarium/01-penguin-a': {
    name: 'ペンギン A',
    viewBox: [0, 0, 440, 420],
    parts: [
      { shape: 'ellipse', x: 220, y: 151, rx: 132, ry: 116 },
      { shape: 'ellipse', x: 220, y: 246, rx: 158, ry: 127 },
    ],
  },
  'aquarium/01-penguin-b': {
    name: 'ペンギン B',
    viewBox: [0, 0, 380, 500],
    parts: [
      { shape: 'ellipse', x: 193, y: 123, rx: 88, ry: 102, angle: -10 },
      { shape: 'ellipse', x: 197, y: 302, rx: 100, ry: 147, angle: 10 },
    ],
  },
  'aquarium/01-penguin-e': {
    name: 'ペンギン E',
    viewBox: [0, 0, 400, 400],
    parts: [
      { shape: 'ellipse', x: 198, y: 117, rx: 104, ry: 88 },
      { shape: 'ellipse', x: 197, y: 251, rx: 119, ry: 107 },
    ],
  },
  'aquarium/02-clownfish': {
    name: 'カクレクマノミ',
    viewBox: [0, 0, 512, 512],
    parts: [
      { shape: 'ellipse', x: 303, y: 261, rx: 167, ry: 105 },
      { shape: 'ellipse', x: 93, y: 270, rx: 57, ry: 52 },
    ],
  },
  'aquarium/03-ray': {
    name: 'エイ',
    viewBox: [0, 0, 512, 512],
    parts: [
      {
        shape: 'polygon',
        vertices: [
          [40, 180],
          [318, 224],
          [458, 357],
          [152, 382],
        ],
      },
    ],
  },
  'aquarium/04-jellyfish': {
    name: 'クラゲ',
    viewBox: [0, 0, 512, 512],
    parts: [
      { shape: 'ellipse', x: 266, y: 141, rx: 147, ry: 103 },
      { shape: 'ellipse', x: 270, y: 331, rx: 91, ry: 137 },
    ],
  },
  'aquarium/05-octopus': {
    name: 'タコ',
    viewBox: [0, 0, 512, 512],
    parts: [
      { shape: 'ellipse', x: 279, y: 155, rx: 80, ry: 77 },
      { shape: 'ellipse', x: 260, y: 284, rx: 148, ry: 87 },
    ],
  },
  'aquarium/06-crab': {
    name: 'カニ',
    viewBox: [0, 0, 512, 512],
    parts: [{ shape: 'ellipse', x: 255, y: 270, rx: 129, ry: 73 }],
  },
  'aquarium/07-dolphin': {
    name: 'イルカ',
    viewBox: [0, 0, 512, 512],
    parts: [
      { shape: 'ellipse', x: 225, y: 216, rx: 170, ry: 62, angle: 28 },
      { shape: 'ellipse', x: 404, y: 344, rx: 63, ry: 34, angle: -12 },
    ],
  },
  'aquarium/08-sea-star': {
    name: 'ヒトデ',
    viewBox: [0, 0, 512, 512],
    parts: [
      {
        shape: 'polygon',
        vertices: [
          [252, 83],
          [423, 191],
          [351, 409],
          [150, 409],
          [87, 193],
        ],
      },
    ],
  },
} satisfies Record<string, CharacterCollision>;

export type CharacterId = keyof typeof characterCollisions;
