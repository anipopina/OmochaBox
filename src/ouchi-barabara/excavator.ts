import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RIG, readyPose, type Pose } from './rig';

// Low-poly excavator built from extruded profiles and primitives so the joints
// match rig.ts exactly: root → tracks / upper → boom → arm → bucket. Each rigid
// part merges its static pieces per material to keep draw calls low; only the
// rolling wheels and the hydraulic cylinders stay separate because they move.
// Collision uses two boxes in app.ts, independent of this visual detail.

const YELLOW = 0xffc414;
const YELLOW_DARK = 0xe59a00;
const RUBBER = 0x2c303a;
const DARK_STEEL = 0x5b6170;
const STEEL = 0x9aa3b5;
const CHROME = 0xeef2f8;
const GLASS = 0x8fe3ff;

const TRACK_HALF = 1.55;
const TRACK_RADIUS = 0.31;
const TRACK_BAND = 0.09;
const TRACK_WIDTH = 0.5;
const TRACK_OFFSET = 0.78;
const WHEEL_RADIUS = TRACK_RADIUS - TRACK_BAND - 0.02;
const ROLLER_RADIUS = 0.085;

type P = [number, number];

/** Arm angle (relative to the boom) in the carry pose: most folded. */
const ARM_FOLDED = readyPose().arm;
/** Arm angle in the farthest-reaching wind-up: most extended. */
const ARM_EXTENDED = (-10.314 * Math.PI) / 180;
const ARM_MOUNT_FOLDED: P = [-0.58, -0.0922];
const ARM_MOUNT_EXTENDED: P = [-0.45418, 0.405299];

function lambert(color: number, emissive = 0) {
  return new THREE.MeshLambertMaterial({ color, emissive });
}

function treadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2c303a';
  ctx.fillRect(0, 0, 64, 16);
  ctx.fillStyle = '#5d6472';
  for (let x = 4; x < 64; x += 16) ctx.fillRect(x, 0, 7, 16);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  // Extrude side walls use world-space UVs, so this is stripes per unit.
  texture.repeat.set(1.3, 1.3);
  return texture;
}

function polygon(points: P[]) {
  return new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
}

/** Rounded slot (stadium) outline, used for the track belt. */
function slot<T extends THREE.Path>(
  halfLength: number,
  radius: number,
  path: T,
): T {
  const straight = halfLength - radius;
  path.moveTo(-straight, -radius);
  path.lineTo(straight, -radius);
  path.absarc(straight, 0, radius, -Math.PI / 2, Math.PI / 2, false);
  path.lineTo(-straight, radius);
  path.absarc(-straight, 0, radius, Math.PI / 2, (Math.PI * 3) / 2, false);
  return path;
}

/** Extrude a profile drawn in XY to a given total width centred on Z. */
function extrude(shape: THREE.Shape, width: number, bevel = 0) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, width - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 10,
  });
  geometry.translate(0, 0, -(width - 2 * bevel) / 2);
  return geometry;
}

function cylinderZ(radius: number, length: number, segments = 14) {
  return new THREE.CylinderGeometry(radius, radius, length, segments).rotateX(
    Math.PI / 2,
  );
}

/** Collects static geometry for one rigid part and merges it per material. */
class Part {
  private readonly chunks = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private readonly matrix = new THREE.Matrix4();
  private readonly euler = new THREE.Euler();
  private readonly quaternion = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3(1, 1, 1);

  add(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    rotationZ = 0,
  ) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    flat.clearGroups();
    this.euler.set(0, 0, rotationZ);
    this.matrix.compose(
      this.position.set(x, y, z),
      this.quaternion.setFromEuler(this.euler),
      this.scale,
    );
    flat.applyMatrix4(this.matrix);
    const list = this.chunks.get(material) ?? [];
    list.push(flat);
    this.chunks.set(material, list);
  }

  /** Merge into meshes on `target`; returns the merged geometries. */
  build(target: THREE.Object3D) {
    const built: THREE.BufferGeometry[] = [];
    for (const [material, list] of this.chunks) {
      const merged = mergeGeometries(list, false);
      for (const piece of list) piece.dispose();
      if (!merged) throw new Error('Excavator part geometry mismatch');
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      target.add(mesh);
      built.push(merged);
    }
    this.chunks.clear();
    return built;
  }
}

function bucketShapes() {
  const outer: P[] = [
    [0, 0.16],
    [-0.14, -0.02],
    [-0.08, -0.22],
    [0.08, -0.4],
    [0.32, -0.5],
    [0.58, -0.48],
    [0.78, -0.34],
    [0.92, -0.05],
  ];
  const inner: P[] = [
    [0.8, -0.04],
    [0.68, -0.26],
    [0.52, -0.36],
    [0.3, -0.37],
    [0.1, -0.26],
    [0.04, -0.08],
    [0.04, 0.1],
  ];
  // Drawn with the cup below the teeth line, then mirrored so the opening
  // faces the machine: a backhoe scoops toward itself.
  const mirror = (points: P[]) => points.map(([x, y]) => [x, -y] as P);
  return {
    shell: polygon(mirror([...outer, ...inner])),
    cheek: polygon(mirror(outer)),
  };
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
  /** Arm-side end of the arm cylinder; slides with the arm angle. */
  private readonly armCylinderEnd = new THREE.Object3D();
  private readonly tread: THREE.CanvasTexture;
  /** Wheels and rollers that turn with travel, with their radius. */
  private readonly spinners: { object: THREE.Object3D; radius: number }[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor() {
    const yellow = lambert(YELLOW);
    const yellowDark = lambert(YELLOW_DARK);
    const rubber = lambert(RUBBER);
    const darkSteel = lambert(DARK_STEEL);
    const steel = lambert(STEEL);
    const chrome = lambert(CHROME, 0x222222);
    const glass = lambert(GLASS, 0x1b4f63);
    this.tread = treadTexture();
    const belt = new THREE.MeshLambertMaterial({ map: this.tread });
    this.materials.push(
      yellow,
      yellowDark,
      rubber,
      darkSteel,
      steel,
      chrome,
      glass,
      belt,
    );

    this.buildUndercarriage({ yellow, rubber, darkSteel, steel, belt });
    this.buildUpper({ yellow, yellowDark, rubber, darkSteel, steel, glass });
    this.buildBoom({ yellow, yellowDark, steel });
    this.buildArm({ yellow, steel });
    this.buildBucket({ yellowDark, steel });

    this.arm.add(this.bucket);
    this.boom.add(this.arm);
    this.upper.add(this.boom);
    this.root.add(this.upper);

    // Hydraulic cylinders: one driving the arm, one driving the bucket.
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
    this.geometries.push(barrelGeometry, rodGeometry);
    const anchor = (parent: THREE.Object3D, x: number, y: number, z = 0) => {
      const point = new THREE.Object3D();
      point.position.set(x, y, z);
      parent.add(point);
      return point;
    };
    this.arm.add(this.armCylinderEnd);
    const pairs: [THREE.Object3D, THREE.Object3D][] = [
      [anchor(this.boom, 1.3, 0.9), this.armCylinderEnd],
      [anchor(this.arm, 0.3, 0.3), anchor(this.bucket, -0.1, 0.18)],
    ];
    for (const [from, to] of pairs)
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
    this.applyPose(this.pose);
  }

  private buildUndercarriage(m: {
    yellow: THREE.Material;
    rubber: THREE.Material;
    darkSteel: THREE.Material;
    steel: THREE.Material;
    belt: THREE.Material;
  }) {
    const part = new Part();
    // Belt: a stadium-shaped band with an open middle showing the wheels.
    const outline = slot(TRACK_HALF, TRACK_RADIUS, new THREE.Shape());
    outline.holes.push(
      slot(
        TRACK_HALF - TRACK_BAND,
        TRACK_RADIUS - TRACK_BAND,
        new THREE.Path(),
      ),
    );
    const straight = TRACK_HALF - TRACK_RADIUS;
    for (const side of [1, -1]) {
      const z = side * TRACK_OFFSET;
      part.add(extrude(outline, TRACK_WIDTH, 0.02), m.belt, 0, TRACK_RADIUS, z);
      part.add(
        new THREE.BoxGeometry(straight * 2 - 0.3, 0.16, TRACK_WIDTH * 0.7),
        m.darkSteel,
        0,
        TRACK_RADIUS + 0.12,
        z,
      );
      // Idler and sprocket at the ends, rollers along the bottom run.
      for (const x of [-straight, straight]) {
        const wheel = new THREE.Group();
        wheel.position.set(x, TRACK_RADIUS, z);
        wheel.add(
          new THREE.Mesh(
            cylinderZ(WHEEL_RADIUS, TRACK_WIDTH * 0.9, 16),
            m.steel,
          ),
        );
        const hub = new THREE.Mesh(
          cylinderZ(WHEEL_RADIUS * 0.62, 0.06, 14),
          m.yellow,
        );
        hub.position.z = side * TRACK_WIDTH * 0.47;
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(WHEEL_RADIUS * 1.15, 0.07, 0.08),
          m.rubber,
        );
        spoke.position.z = side * TRACK_WIDTH * 0.5;
        const cross = spoke.clone();
        cross.rotation.z = Math.PI / 2;
        wheel.add(hub, spoke, cross);
        this.root.add(wheel);
        this.spinners.push({ object: wheel, radius: WHEEL_RADIUS });
      }
      for (let i = 0; i < 5; i++) {
        const roller = new THREE.Mesh(
          cylinderZ(ROLLER_RADIUS, TRACK_WIDTH * 0.8, 10),
          m.steel,
        );
        roller.position.set(-0.9 + i * 0.45, TRACK_BAND + ROLLER_RADIUS, z);
        this.root.add(roller);
        this.spinners.push({ object: roller, radius: ROLLER_RADIUS });
      }
    }
    part.add(
      new THREE.BoxGeometry(1.9, 0.26, TRACK_OFFSET * 2 - 0.4),
      m.darkSteel,
      0,
      0.45,
      0,
    );
    part.add(
      new THREE.CylinderGeometry(0.72, 0.76, RIG.upperY - 0.58, 22),
      m.steel,
      0,
      (RIG.upperY + 0.58) / 2,
      0,
    );
    this.geometries.push(...part.build(this.root));
    this.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        this.geometries.push(child.geometry);
      }
    });
  }

  private buildUpper(m: {
    yellow: THREE.Material;
    yellowDark: THREE.Material;
    rubber: THREE.Material;
    darkSteel: THREE.Material;
    steel: THREE.Material;
    glass: THREE.Material;
  }) {
    this.upper.position.y = RIG.upperY;
    const part = new Part();
    // Deck with a chamfered nose.
    part.add(
      extrude(
        polygon([
          [-1, 0.02],
          [0.9, 0.02],
          [0.98, 0.12],
          [0.98, 0.6],
          [0.9, 0.68],
          [-1, 0.68],
        ]),
        1.9,
        0.04,
      ),
      m.yellow,
    );
    // Rounded counterweight at the rear.
    const weight = new THREE.Shape();
    weight.moveTo(-0.95, 0.05);
    weight.lineTo(-1.25, 0.05);
    weight.quadraticCurveTo(-1.5, 0.1, -1.5, 0.4);
    weight.lineTo(-1.5, 0.7);
    weight.quadraticCurveTo(-1.48, 0.96, -1.2, 0.98);
    weight.lineTo(-0.95, 0.98);
    weight.closePath();
    part.add(extrude(weight, 1.94, 0.05), m.yellowDark);
    for (let i = 0; i < 3; i++)
      part.add(
        new THREE.BoxGeometry(0.36, 0.05, 0.03),
        m.darkSteel,
        -1.2,
        0.42 + i * 0.13,
        1.0,
      );
    // Engine hood with exhaust.
    part.add(
      extrude(
        polygon([
          [-0.95, 0.66],
          [-0.1, 0.66],
          [-0.1, 0.8],
          [-0.22, 0.9],
          [-0.95, 0.9],
        ]),
        1.6,
        0.03,
      ),
      m.yellow,
      0,
      0,
      0.08,
    );
    part.add(
      new THREE.CylinderGeometry(0.05, 0.05, 0.42, 10),
      m.rubber,
      -0.55,
      1.08,
      0.6,
    );
    // Tool box on the right, ahead of the hood, with a hand rail.
    part.add(
      extrude(
        polygon([
          [0.05, 0.66],
          [0.95, 0.66],
          [0.95, 0.94],
          [0.82, 1.1],
          [0.05, 1.1],
        ]),
        0.58,
        0.03,
      ),
      m.yellow,
      0,
      0,
      0.66,
    );
    part.add(
      new THREE.CylinderGeometry(0.025, 0.025, 0.8, 6).rotateZ(Math.PI / 2),
      m.darkSteel,
      0.45,
      1.3,
      0.9,
    );
    for (const x of [0.1, 0.8])
      part.add(
        new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6),
        m.darkSteel,
        x,
        1.2,
        0.9,
      );
    // Boom foot brackets either side of the pivot.
    const foot = polygon([
      [0.4, 0.2],
      [0.98, 0.2],
      [0.9, 0.78],
      [0.52, 0.78],
    ]);
    for (const side of [1, -1])
      part.add(extrude(foot, 0.07), m.yellowDark, 0, 0, side * 0.235);

    // Cab on the far side: slanted front, glass band, pillars and visor.
    const cabX = 0;
    const cabY = 0.66;
    const cabZ = -0.6;
    part.add(
      extrude(
        polygon([
          [-0.05, 0],
          [0.92, 0],
          [0.92, 0.62],
          [0.82, 1],
          [0.62, 1.18],
          [-0.05, 1.18],
        ]),
        0.7,
        0.03,
      ),
      m.yellow,
      cabX,
      cabY,
      cabZ,
    );
    // Slightly wider and further forward than the shell so the glass shows on
    // the sides and the front without cutting openings.
    part.add(
      extrude(
        polygon([
          [0.02, 0.3],
          [0.97, 0.3],
          [0.97, 0.63],
          [0.865, 1.02],
          [0.64, 1.14],
          [0.02, 1.14],
        ]),
        0.73,
      ),
      m.glass,
      cabX,
      cabY,
      cabZ,
    );
    part.add(
      new THREE.BoxGeometry(0.08, 0.86, 0.75),
      m.yellow,
      cabX + 0.42,
      cabY + 0.72,
      cabZ,
    );
    for (const side of [1, -1])
      part.add(
        new THREE.BoxGeometry(0.06, 0.36, 0.06),
        m.yellow,
        cabX + 0.96,
        cabY + 0.46,
        cabZ + side * 0.34,
      );
    part.add(
      new THREE.BoxGeometry(1.06, 0.07, 0.8),
      m.yellowDark,
      cabX + 0.42,
      cabY + 1.23,
      cabZ,
    );
    this.collect(part.build(this.upper));
  }

  private buildBoom(m: {
    yellow: THREE.Material;
    yellowDark: THREE.Material;
    steel: THREE.Material;
  }) {
    this.boom.position.set(RIG.pivotX, RIG.pivotY, 0);
    const part = new Part();
    // Curved "banana" boom; the joints stay on the straight pivot→elbow line.
    part.add(
      extrude(
        polygon([
          [-0.22, 0.2],
          [0.5, 0.56],
          [1.3, 0.8],
          [2.2, 0.52],
          [3.12, 0.17],
          [3.12, -0.17],
          [2.4, 0.1],
          [1.4, 0.34],
          [0.6, 0.08],
          [0.05, -0.22],
          [-0.22, -0.1],
        ]),
        0.4,
        0.035,
      ),
      m.yellow,
    );
    part.add(new THREE.BoxGeometry(0.2, 0.12, 0.3), m.yellowDark, 1.3, 0.86, 0);
    part.add(cylinderZ(0.12, 0.52), m.steel);
    part.add(cylinderZ(0.11, 0.48), m.steel, RIG.boom, 0, 0);
    this.collect(part.build(this.boom));
  }

  private buildArm(m: { yellow: THREE.Material; steel: THREE.Material }) {
    this.arm.position.set(RIG.boom, 0, 0);
    const part = new Part();
    // Tapered dipper arm with a short stub behind the pin for its cylinder.
    part.add(
      extrude(
        polygon([
          [-0.55, 0.05],
          [-0.45, 0.32],
          [-0.15, 0.37],
          [0.6, 0.24],
          [2.18, 0.11],
          [2.22, -0.08],
          [2, -0.14],
          [0.3, -0.24],
          [-0.3, -0.22],
        ]),
        0.32,
        0.03,
      ),
      m.yellow,
    );
    part.add(cylinderZ(0.09, 0.44), m.steel, RIG.arm, 0, 0);
    this.collect(part.build(this.arm));
  }

  private buildBucket(m: {
    yellowDark: THREE.Material;
    steel: THREE.Material;
  }) {
    this.bucket.position.set(RIG.arm, 0, 0);
    const part = new Part();
    const { shell, cheek } = bucketShapes();
    const width = 0.84;
    part.add(extrude(shell, width), m.yellowDark);
    for (const side of [1, -1])
      part.add(extrude(cheek, 0.06), m.yellowDark, 0, 0, side * (width / 2));
    for (let i = 0; i < 5; i++)
      part.add(
        new THREE.BoxGeometry(0.2, 0.08, 0.1),
        m.steel,
        RIG.tip - 0.1,
        0.05,
        -0.34 + i * 0.17,
        0.15,
      );
    this.collect(part.build(this.bucket));
    this.bucketCore.position.set(0.42, 0.14, 0);
    this.bucket.add(this.bucketCore);
  }

  private collect(geometries: THREE.BufferGeometry[]) {
    this.geometries.push(...geometries);
  }

  applyPose(pose: Pose) {
    this.pose = pose;
    this.upper.rotation.y = pose.swing;
    this.boom.rotation.z = pose.boom;
    this.arm.rotation.z = pose.arm;
    this.bucket.rotation.z = pose.bucket;
    // A fixed mount would sink into the boom or arm at one end of the arm's
    // swing; sliding it with the arm angle keeps the cylinder's overlap
    // looking the same. Positions were set by eye in a Blender layout.
    const t = THREE.MathUtils.clamp(
      (pose.arm - ARM_FOLDED) / (ARM_EXTENDED - ARM_FOLDED),
      0,
      1,
    );
    this.armCylinderEnd.position.set(
      THREE.MathUtils.lerp(ARM_MOUNT_FOLDED[0], ARM_MOUNT_EXTENDED[0], t),
      THREE.MathUtils.lerp(ARM_MOUNT_FOLDED[1], ARM_MOUNT_EXTENDED[1], t),
      0,
    );
    this.root.updateMatrixWorld(true);
    for (const piston of this.pistons) piston.update();
    this.upper.updateMatrixWorld(true);
  }

  /** Roll the belt, wheels and rollers by a travelled distance. */
  roll(distance: number) {
    this.tread.offset.x -= distance * this.tread.repeat.x;
    for (const { object, radius } of this.spinners)
      object.rotation.z -= distance / radius;
  }

  dispose() {
    for (const geometry of new Set(this.geometries)) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.tread.dispose();
  }
}
