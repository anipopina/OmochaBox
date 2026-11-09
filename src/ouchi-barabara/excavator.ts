import * as THREE from 'three';
import { RIG, readyPose, type Pose } from './rig';

// Low-poly excavator assembled from primitives so the joints match rig.ts
// exactly. Every part lives in a hierarchy: root → tracks / upper → boom → arm
// → bucket. Hydraulic cylinders stretch between anchors each frame.

const YELLOW = 0xffc414;
const YELLOW_DARK = 0xe59a00;
const DARK = 0x2c303a;
const STEEL = 0x8b95a8;
const CHROME = 0xeef2f8;
const GLASS = 0x8fe3ff;

const TRACK_LENGTH = 3.1;
const TRACK_HEIGHT = 0.62;
const TRACK_OFFSET = 0.78;
const HUB_RADIUS = 0.18;

function lambert(color: number, emissive = 0) {
  return new THREE.MeshLambertMaterial({ color, emissive });
}

function trackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#30343d';
  ctx.fillRect(0, 0, 64, 16);
  ctx.fillStyle = '#69717f';
  for (let x = 4; x < 64; x += 16) ctx.fillRect(x, 0, 7, 16);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(7, 1);
  return texture;
}

/** A box spanning two points in a part's XY plane. */
function bar(
  material: THREE.Material,
  from: [number, number],
  to: [number, number],
  height: number,
  width: number,
  z = 0,
) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, height, width),
    material,
  );
  mesh.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, z);
  mesh.rotation.z = Math.atan2(to[1] - from[1], to[0] - from[0]);
  return mesh;
}

function bucketGeometry() {
  const outer: [number, number][] = [
    [0, 0.16],
    [-0.14, -0.02],
    [-0.02, -0.32],
    [0.32, -0.5],
    [0.72, -0.4],
    [0.92, -0.05],
  ];
  const inner: [number, number][] = [
    [0.8, -0.04],
    [0.64, -0.28],
    [0.32, -0.36],
    [0.08, -0.22],
    [0.04, 0.1],
  ];
  const shell = new THREE.Shape(
    [...outer, ...inner].map(([x, y]) => new THREE.Vector2(x, y)),
  );
  const side = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  const width = 0.84;
  const shellGeometry = new THREE.ExtrudeGeometry(shell, {
    depth: width,
    bevelEnabled: false,
  });
  shellGeometry.translate(0, 0, -width / 2);
  const sideGeometry = new THREE.ExtrudeGeometry(side, {
    depth: 0.06,
    bevelEnabled: false,
  });
  return { shellGeometry, sideGeometry, width };
}

class Piston {
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly barrel: THREE.Mesh;
  private readonly rod: THREE.Mesh;
  constructor(
    private readonly frame: THREE.Object3D,
    private readonly from: THREE.Object3D,
    private readonly to: THREE.Object3D,
    barrelGeometry: THREE.BufferGeometry,
    rodGeometry: THREE.BufferGeometry,
    barrelMaterial: THREE.Material,
    rodMaterial: THREE.Material,
  ) {
    this.barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    this.rod = new THREE.Mesh(rodGeometry, rodMaterial);
    this.barrel.castShadow = this.rod.castShadow = true;
    frame.add(this.barrel, this.rod);
  }
  update() {
    this.frame.worldToLocal(this.from.getWorldPosition(this.a));
    this.frame.worldToLocal(this.to.getWorldPosition(this.b));
    this.direction.subVectors(this.b, this.a);
    const length = this.direction.length();
    this.direction.divideScalar(length || 1);
    // Barrel grows from A, rod from B; each covers a bit over half the span.
    this.barrel.position.copy(this.a);
    this.rod.position.copy(this.b);
    this.barrel.quaternion.setFromUnitVectors(
      THREE.Object3D.DEFAULT_UP,
      this.direction,
    );
    this.rod.quaternion.copy(this.barrel.quaternion);
    this.barrel.scale.set(1, length * 0.58, 1);
    this.rod.scale.set(1, length * 0.58, 1);
  }
}

export class Excavator {
  readonly root = new THREE.Group();
  readonly upper = new THREE.Group();
  readonly boom = new THREE.Group();
  readonly arm = new THREE.Group();
  readonly bucket = new THREE.Group();
  /** Centre of the bucket cup, followed by the bucket's collision body. */
  readonly bucketCore = new THREE.Object3D();
  /** Bucket collision box size (local axes). */
  readonly bucketSize = new THREE.Vector3(0.9, 0.55, 0.84);
  pose: Pose = readyPose();
  private readonly pistons: Piston[] = [];
  private readonly treads: THREE.CanvasTexture;
  private readonly hubs: THREE.Object3D[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly geometries = new Set<THREE.BufferGeometry>();

  constructor() {
    const yellow = lambert(YELLOW);
    const yellowDark = lambert(YELLOW_DARK);
    const dark = lambert(DARK);
    const steel = lambert(STEEL);
    const chrome = lambert(CHROME, 0x222222);
    const glass = lambert(GLASS, 0x1b4f63);
    this.treads = trackTexture();
    const tread = new THREE.MeshLambertMaterial({ map: this.treads });
    this.materials.push(yellow, yellowDark, dark, steel, chrome, glass, tread);

    // Undercarriage: two rounded tracks, a frame and a turntable.
    const straight = TRACK_LENGTH - TRACK_HEIGHT;
    for (const side of [1, -1]) {
      const track = new THREE.Group();
      track.position.set(0, TRACK_HEIGHT / 2, side * TRACK_OFFSET);
      const belt = new THREE.Mesh(
        new THREE.BoxGeometry(straight, TRACK_HEIGHT, 0.5),
        tread,
      );
      track.add(belt);
      const endGeometry = new THREE.CylinderGeometry(
        TRACK_HEIGHT / 2,
        TRACK_HEIGHT / 2,
        0.5,
        16,
      ).rotateX(Math.PI / 2);
      for (const end of [-1, 1]) {
        const cap = new THREE.Mesh(endGeometry, dark);
        cap.position.x = (end * straight) / 2;
        track.add(cap);
      }
      const hubGeometry = new THREE.CylinderGeometry(
        HUB_RADIUS,
        HUB_RADIUS,
        0.06,
        14,
      ).rotateX(Math.PI / 2);
      const spokeGeometry = new THREE.BoxGeometry(HUB_RADIUS * 1.9, 0.07, 0.08);
      for (const x of [-straight / 2, 0, straight / 2]) {
        const hub = new THREE.Group();
        hub.position.set(x, 0, side * 0.27);
        hub.add(new THREE.Mesh(hubGeometry, yellow));
        const spoke = new THREE.Mesh(spokeGeometry, dark);
        spoke.position.z = side * 0.03;
        const cross = spoke.clone();
        cross.rotation.z = Math.PI / 2;
        hub.add(spoke, cross);
        track.add(hub);
        this.hubs.push(hub);
      }
      track.traverse((child) => {
        if (child instanceof THREE.Mesh) child.castShadow = true;
      });
      this.root.add(track);
    }
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(straight * 0.8, 0.3, TRACK_OFFSET * 2 - 0.4),
      dark,
    );
    frame.position.y = TRACK_HEIGHT * 0.6;
    const turntable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.75, RIG.upperY - TRACK_HEIGHT, 20),
      steel,
    );
    turntable.position.y = (RIG.upperY + TRACK_HEIGHT) / 2;
    this.root.add(frame, turntable);

    // Upper body with cab on the far side so the boom stays in clear view.
    this.upper.position.y = RIG.upperY;
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 1.9), yellow);
    body.position.set(-0.05, 0.375, 0);
    const weight = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.9, 1.94),
      yellowDark,
    );
    weight.position.set(-1.25, 0.45, 0);
    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.22, 1.5),
      yellowDark,
    );
    hood.position.set(-0.5, 0.86, 0.12);
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8),
      dark,
    );
    exhaust.position.set(-0.7, 1.15, 0.55);
    const cab = new THREE.Group();
    cab.position.set(0.42, 0.75, -0.58);
    const cabBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.15, 0.72),
      yellow,
    );
    cabBody.position.y = 0.575;
    const cabRoof = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.1, 0.8),
      yellowDark,
    );
    cabRoof.position.y = 1.18;
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.8, 0.58), glass);
    front.position.set(0.46, 0.68, 0);
    const sideWindow = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.68, 0.04),
      glass,
    );
    sideWindow.position.set(0.02, 0.7, 0.37);
    const farWindow = sideWindow.clone();
    farWindow.position.z = -0.37;
    cab.add(cabBody, cabRoof, front, sideWindow, farWindow);
    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.55, 0.62),
      yellowDark,
    );
    bracket.position.set(RIG.pivotX - 0.05, 0.42, 0);
    this.upper.add(body, weight, hood, exhaust, cab, bracket);

    // Boom: slightly bent "banana" shape; the joints stay on the straight line.
    this.boom.position.set(RIG.pivotX, RIG.pivotY, 0);
    const knee: [number, number] = [RIG.boom * 0.48, 0.36];
    this.boom.add(
      bar(yellow, [-0.1, 0], knee, 0.42, 0.4),
      bar(yellow, knee, [RIG.boom + 0.08, 0], 0.36, 0.38),
    );
    const pinGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.5, 12).rotateX(
      Math.PI / 2,
    );
    const pin = new THREE.Mesh(pinGeometry, steel);
    this.boom.add(pin);

    // Arm with a short stub behind its pin for the arm cylinder.
    this.arm.position.set(RIG.boom, 0, 0);
    this.arm.add(
      bar(yellow, [-0.42, 0.14], [RIG.arm + 0.06, 0], 0.32, 0.32),
      new THREE.Mesh(pinGeometry, steel),
    );

    // Bucket: open steel cup with teeth along the cutting edge.
    this.bucket.position.set(RIG.arm, 0, 0);
    const { shellGeometry, sideGeometry, width } = bucketGeometry();
    const shell = new THREE.Mesh(shellGeometry, yellowDark);
    const sideA = new THREE.Mesh(sideGeometry, yellowDark);
    sideA.position.z = width / 2;
    const sideB = new THREE.Mesh(sideGeometry, yellowDark);
    sideB.position.z = -width / 2 - 0.06;
    const toothGeometry = new THREE.BoxGeometry(0.2, 0.08, 0.12);
    this.bucket.add(shell, sideA, sideB, new THREE.Mesh(pinGeometry, steel));
    for (let i = 0; i < 4; i++) {
      const tooth = new THREE.Mesh(toothGeometry, steel);
      tooth.position.set(RIG.tip - 0.1, -0.05, -0.3 + i * 0.2);
      tooth.rotation.z = -0.15;
      this.bucket.add(tooth);
    }
    this.bucketCore.position.set(0.42, -0.14, 0);
    this.bucket.add(this.bucketCore);

    this.arm.add(this.bucket);
    this.boom.add(this.arm);
    this.upper.add(this.boom);
    this.root.add(this.upper);

    // Hydraulic cylinders: two on the boom, one on the arm, one on the bucket.
    const barrelGeometry = new THREE.CylinderGeometry(
      0.1,
      0.1,
      1,
      10,
    ).translate(0, 0.5, 0);
    const rodGeometry = new THREE.CylinderGeometry(
      0.055,
      0.055,
      1,
      8,
    ).translate(0, -0.5, 0);
    const anchor = (parent: THREE.Object3D, x: number, y: number, z = 0) => {
      const point = new THREE.Object3D();
      point.position.set(x, y, z);
      parent.add(point);
      return point;
    };
    const pistonPairs: [THREE.Object3D, THREE.Object3D][] = [
      [
        anchor(this.upper, 0.98, 0.18, 0.26),
        anchor(this.boom, 1.25, -0.2, 0.26),
      ],
      [
        anchor(this.upper, 0.98, 0.18, -0.26),
        anchor(this.boom, 1.25, -0.2, -0.26),
      ],
      [anchor(this.boom, 1.15, 0.42), anchor(this.arm, -0.4, 0.26)],
      [anchor(this.arm, 0.3, 0.24), anchor(this.bucket, -0.1, 0.18)],
    ];
    for (const [from, to] of pistonPairs)
      this.pistons.push(
        new Piston(
          this.upper,
          from,
          to,
          barrelGeometry,
          rodGeometry,
          steel,
          chrome,
        ),
      );

    this.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        this.geometries.add(child.geometry);
      }
    });
    this.applyPose(this.pose);
  }

  applyPose(pose: Pose) {
    this.pose = pose;
    this.upper.rotation.y = pose.swing;
    this.boom.rotation.z = pose.boom;
    this.arm.rotation.z = pose.arm;
    this.bucket.rotation.z = pose.bucket;
    this.root.updateMatrixWorld(true);
    for (const piston of this.pistons) piston.update();
    this.upper.updateMatrixWorld(true);
  }

  /** Roll the treads and hubs by a travelled distance. */
  roll(distance: number) {
    this.treads.offset.x -= (distance / TRACK_LENGTH) * this.treads.repeat.x;
    for (const hub of this.hubs) hub.rotation.z -= distance / HUB_RADIUS;
  }

  dispose() {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.treads.dispose();
  }
}
