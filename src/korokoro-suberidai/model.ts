export const MAX_BALLS = 24;
export const LIFE_MS = 8500;
export const REDUCED_LIFE_MS = 3500;
type Point = readonly [number, number];
// All coordinates describe the ball centre. Shared endpoints make each
// downhill run connect to the curved, gravity-like turn at its open end.
const segments: readonly {
  ms: number;
  points: readonly [Point, Point, Point, Point];
}[] = [
  {
    ms: 350,
    points: [
      [70, 35],
      [70, 35],
      [61, 75],
      [70, 92],
    ],
  },
  {
    ms: 1450,
    points: [
      [70, 92],
      [140, 126],
      [300, 168],
      [408, 181],
    ],
  },
  {
    ms: 480,
    points: [
      [408, 181],
      [452, 187],
      [453, 210],
      [408, 234],
    ],
  },
  {
    ms: 1450,
    points: [
      [408, 234],
      [330, 275],
      [172, 314],
      [72, 322],
    ],
  },
  {
    ms: 480,
    points: [
      [72, 322],
      [27, 326],
      [27, 351],
      [72, 374],
    ],
  },
  {
    ms: 1450,
    points: [
      [72, 374],
      [150, 414],
      [300, 452],
      [406, 457],
    ],
  },
  {
    ms: 500,
    points: [
      [406, 457],
      [453, 459],
      [447, 496],
      [399, 531],
    ],
  },
];
const travelMs = segments.reduce((sum, segment) => sum + segment.ms, 0);
export function positionAt(age: number, lane: number, reduced = false) {
  if (reduced) return { x: 115 + lane * 50, y: 537, phase: 'rest' };
  let time = Math.max(0, age);
  for (const segment of segments) {
    if (time <= segment.ms) {
      const t = time / segment.ms,
        u = 1 - t;
      const [a, b, c, d] = segment.points;
      return {
        x:
          u ** 3 * a[0] +
          3 * u * u * t * b[0] +
          3 * u * t * t * c[0] +
          t ** 3 * d[0],
        y:
          u ** 3 * a[1] +
          3 * u * u * t * b[1] +
          3 * u * t * t * c[1] +
          t ** 3 * d[1],
        phase: 'rolling',
      };
    }
    time -= segment.ms;
  }
  const t = Math.min(1, (age - travelMs) / 1200);
  // Three diminishing arcs in the bowl, travelling inward from the exit.
  const bounce = Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t) * 43;
  return {
    x: 399 + (115 + lane * 50 - 399) * (1 - (1 - t) ** 2),
    y: 531 + t * 6 - bounce,
    phase: t < 1 ? 'bounce' : 'rest',
  };
}
