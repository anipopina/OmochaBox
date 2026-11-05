export type Point = { x: number; y: number };
export type Toy = Point & {
  vx: number;
  vy: number;
  attached: boolean;
  target: Point;
};
const clamp = (v: number, low: number, high: number) =>
  Math.max(low, Math.min(high, v));
export class MagnetModel {
  width = 300;
  height = 500;
  toySize = 60;
  magnetSize = 100;
  radius = 86;
  range = 150;
  enabled = false;
  magnet: Point = { x: 150, y: 360 };
  goal: Point = { ...this.magnet };
  toys: Toy[] = [];
  constructor(width: number, height: number) {
    this.resize(width, height);
    this.scatter();
  }
  bound(p: Point, margin: number): Point {
    return {
      x: clamp(p.x, margin, this.width - margin),
      y: clamp(p.y, margin, this.height - margin),
    };
  }
  resize(width: number, height: number) {
    const previous = { width: this.width, height: this.height };
    this.width = width;
    this.height = height;
    this.toySize = clamp(Math.min(width, height) * 0.15, 56, 82);
    this.magnetSize = this.toySize * 1.65;
    this.radius = this.toySize * 1.4;
    this.range = this.radius * 1.85;
    this.magnet = this.bound(
      {
        x: (this.magnet.x / previous.width) * width,
        y: (this.magnet.y / previous.height) * height,
      },
      this.radius + this.toySize / 2,
    );
    this.goal = { ...this.magnet };
    for (const toy of this.toys) {
      Object.assign(
        toy,
        this.bound(
          {
            x: (toy.x / previous.width) * width,
            y: (toy.y / previous.height) * height,
          },
          this.toySize / 2,
        ),
      );
      toy.vx = toy.vy = 0;
      toy.target = { x: toy.x, y: toy.y };
    }
  }
  move(p: Point, direct = false) {
    this.goal = this.bound(p, this.radius + this.toySize / 2);
    if (direct) this.magnet = { ...this.goal };
    this.enabled = true;
  }
  slot(index: number): Point {
    const offsets = [
      [-0.34, -0.7],
      [0.34, -0.63],
      [0.74, -0.03],
      [0.36, 0.6],
      [-0.36, 0.51],
      [-0.74, -0.03],
    ];
    const [x, y] = offsets[index];
    return {
      x: this.magnet.x + x * this.magnetSize,
      y: this.magnet.y + y * this.magnetSize,
    };
  }

  scatter() {
    this.enabled = false;
    this.goal = { ...this.magnet };
    const destinations = Array.from({ length: 6 }, (_, i) =>
      this.bound(
        {
          x: this.width * [0.16, 0.5, 0.84][i % 3],
          y: this.height * (i < 3 ? 0.19 : 0.58),
        },
        this.toySize / 2,
      ),
    );
    if (!this.toys.length)
      this.toys = destinations.map((p) => ({
        ...p,
        target: { ...p },
        vx: 0,
        vy: 0,
        attached: false,
      }));
    else
      this.toys.forEach((toy, i) => {
        toy.attached = false;
        toy.target = destinations[i];
        toy.vx = toy.vy = 0;
      });
  }
  step(dt: number, reduced = false): boolean {
    dt = Math.min(dt, 1 / 30);
    let moving = false;
    for (const axis of ['x', 'y'] as const) {
      const delta = this.goal[axis] - this.magnet[axis];
      if (Math.abs(delta) > 0.2) {
        this.magnet[axis] += delta * (1 - Math.exp(-12 * dt));
        moving = true;
      } else this.magnet[axis] = this.goal[axis];
    }
    this.toys.forEach((toy, i) => {
      if (
        this.enabled &&
        Math.hypot(toy.x - this.magnet.x, toy.y - this.magnet.y) <= this.range
      )
        toy.attached = true;
      const target = toy.attached ? this.slot(i) : toy.target;
      for (const [axis, velocity] of [
        ['x', 'vx'],
        ['y', 'vy'],
      ] as const) {
        const delta = target[axis] - toy[axis];
        if (Math.abs(delta) < 0.2 && Math.abs(toy[velocity]) < 0.6) {
          toy[axis] = target[axis];
          toy[velocity] = 0;
          continue;
        }
        moving = true;
        if (reduced) {
          toy[axis] += delta * (1 - Math.exp(-24 * dt));
          toy[velocity] = 0;
        } else {
          toy[velocity] += (delta * 110 - toy[velocity] * 17) * dt;
          toy[axis] += toy[velocity] * dt;
        }
      }
      Object.assign(toy, this.bound(toy, this.toySize / 2));
    });
    return moving;
  }
  settle() {
    this.magnet = { ...this.goal };
    this.toys.forEach((toy, i) => {
      Object.assign(toy, toy.attached ? this.slot(i) : toy.target);
      toy.vx = toy.vy = 0;
    });
  }
}
