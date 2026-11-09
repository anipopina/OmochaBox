import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { HousePlan, PieceSpec } from './house-plan';

// Turns a HousePlan into meshes and rigid bodies. Standing pieces are static
// bodies with zero mass (so debris piles against them without pushing them);
// breaking a piece loose gives it mass and an initial velocity.

export const GROUP = {
  ground: 1,
  piece: 2,
  chimney: 4,
  machine: 8,
  roof: 16,
} as const;

const DENSITY = 6;
const SIDE_GAP = 0.015;

export interface Piece {
  spec: PieceSpec;
  mesh: THREE.Mesh;
  body: CANNON.Body;
  mass: number;
  /** Simulation time when it broke loose, or null while standing. */
  loosened: number | null;
}

function canvasTexture(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Geometry, materials and decal textures shared by every house. */
export class HouseKit {
  private readonly boxes = new Map<string, THREE.BufferGeometry>();
  private readonly colors = new Map<number, THREE.MeshLambertMaterial>();
  readonly window: THREE.MeshLambertMaterial;
  readonly door: THREE.MeshLambertMaterial;
  readonly windowGeometry = new THREE.PlaneGeometry(0.5, 0.56);
  readonly doorGeometry = new THREE.PlaneGeometry(0.52, 0.86);
  readonly material = new CANNON.Material('debris');

  constructor() {
    this.window = new THREE.MeshLambertMaterial({
      map: canvasTexture(64, 72, (ctx) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 64, 72);
        ctx.fillStyle = '#7fdcff';
        ctx.fillRect(8, 8, 48, 56);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(29, 8, 6, 56);
        ctx.fillRect(8, 33, 48, 6);
      }),
    });
    this.door = new THREE.MeshLambertMaterial({
      map: canvasTexture(64, 104, (ctx) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 64, 104);
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(7, 7, 50, 97);
        ctx.fillStyle = '#7fdcff';
        ctx.beginPath();
        ctx.arc(32, 30, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7a3e12';
        ctx.beginPath();
        ctx.arc(47, 64, 5, 0, Math.PI * 2);
        ctx.fill();
      }),
    });
  }

  box(x: number, y: number, z: number) {
    const key = `${x.toFixed(3)}:${y.toFixed(3)}:${z.toFixed(3)}`;
    let geometry = this.boxes.get(key);
    if (!geometry) {
      geometry = new THREE.BoxGeometry(x, y, z);
      this.boxes.set(key, geometry);
    }
    return geometry;
  }

  color(color: number) {
    let material = this.colors.get(color);
    if (!material) {
      material = new THREE.MeshLambertMaterial({ color });
      this.colors.set(color, material);
    }
    return material;
  }

  dispose() {
    for (const geometry of this.boxes.values()) geometry.dispose();
    for (const material of this.colors.values()) material.dispose();
    this.window.map?.dispose();
    this.door.map?.dispose();
    this.window.dispose();
    this.door.dispose();
    this.windowGeometry.dispose();
    this.doorGeometry.dispose();
  }
}

function gableGeometry(spec: PieceSpec) {
  const { x: run, y: rise, z: depth } = spec.size;
  const s = spec.rise ?? 1;
  const shape = new THREE.Shape([
    new THREE.Vector2((-s * run) / 2, -rise / 2),
    new THREE.Vector2((s * run) / 2, -rise / 2),
    new THREE.Vector2((s * run) / 2, rise / 2),
  ]);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function decorate(kit: HouseKit, mesh: THREE.Mesh, spec: PieceSpec) {
  const decor = spec.decor;
  if (!decor) return;
  const door = decor.kind === 'door';
  const plane = new THREE.Mesh(
    door ? kit.doorGeometry : kit.windowGeometry,
    door ? kit.door : kit.window,
  );
  const lift = door ? -spec.size.y / 2 + 0.45 : 0.06;
  const out = 0.006;
  switch (decor.face) {
    case '+z':
      plane.position.set(0, lift, spec.size.z / 2 + out);
      break;
    case '-z':
      plane.position.set(0, lift, -spec.size.z / 2 - out);
      plane.rotation.y = Math.PI;
      break;
    case '+x':
      plane.position.set(spec.size.x / 2 + out, lift, 0);
      plane.rotation.y = Math.PI / 2;
      break;
    case '-x':
      plane.position.set(-spec.size.x / 2 - out, lift, 0);
      plane.rotation.y = -Math.PI / 2;
      break;
  }
  mesh.add(plane);
}

export class House {
  readonly group = new THREE.Group();
  readonly pieces: Piece[] = [];
  private readonly ownGeometries: THREE.BufferGeometry[] = [];

  constructor(
    readonly plan: HousePlan,
    kit: HouseKit,
    private readonly world: CANNON.World,
  ) {
    for (const spec of plan.pieces) {
      const { x, y, z } = spec.size;
      let geometry: THREE.BufferGeometry;
      const body = new CANNON.Body({
        mass: 0,
        type: CANNON.Body.STATIC,
        material: kit.material,
        allowSleep: true,
        sleepSpeedLimit: 0.35,
        sleepTimeLimit: 0.5,
        linearDamping: 0.08,
        angularDamping: 0.25,
      });
      if (spec.kind === 'gable') {
        geometry = gableGeometry(spec);
        this.ownGeometries.push(geometry);
        // Largest box inscribed against the tall side, so the body never
        // pokes through the roof resting just above the triangle.
        const s = spec.rise ?? 1;
        body.addShape(
          new CANNON.Box(new CANNON.Vec3(x / 4, y / 4, z / 2)),
          new CANNON.Vec3((s * x) / 4, -y / 4, 0),
        );
      } else {
        geometry = kit.box(x, y, z);
        // Narrower than the mesh horizontally: cannon-es applies a fixed
        // friction (mu·g·m) at every touching contact regardless of load, so
        // flush side-by-side blocks would brake each other to a halt. Stacked
        // pieces keep their full height and still rest on each other.
        body.addShape(
          new CANNON.Box(
            new CANNON.Vec3(x / 2 - SIDE_GAP, y / 2, z / 2 - SIDE_GAP),
          ),
        );
      }
      body.position.set(spec.center.x, spec.center.y, spec.center.z);
      if (spec.tilt) body.quaternion.setFromEuler(0, 0, spec.tilt);
      const group =
        spec.kind === 'roof'
          ? GROUP.roof
          : spec.kind === 'chimney'
            ? GROUP.chimney
            : GROUP.piece;
      body.collisionFilterGroup = group;
      body.collisionFilterMask =
        spec.kind === 'roof'
          ? ~GROUP.chimney
          : spec.kind === 'chimney'
            ? ~GROUP.roof
            : -1;
      world.addBody(body);

      const mesh = new THREE.Mesh(geometry, kit.color(spec.color));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      decorate(kit, mesh, spec);
      mesh.position.set(spec.center.x, spec.center.y, spec.center.z);
      if (spec.tilt) mesh.rotation.z = spec.tilt;
      this.group.add(mesh);
      this.pieces.push({
        spec,
        mesh,
        body,
        // Floors are kept light so they drop between the walls instead of
        // pinning them upright with friction.
        mass: x * y * z * DENSITY * (spec.kind === 'slab' ? 0.45 : 1),
        loosened: null,
      });
    }
  }

  /** Break a piece loose with an initial velocity and spin. */
  loosen(piece: Piece, velocity: CANNON.Vec3, spin: CANNON.Vec3, now: number) {
    if (piece.loosened !== null) return;
    const body = piece.body;
    body.type = CANNON.Body.DYNAMIC;
    body.mass = piece.mass;
    body.updateMassProperties();
    body.velocity.copy(velocity);
    body.angularVelocity.copy(spin);
    body.wakeUp();
    piece.loosened = now;
  }

  /** Copy body transforms to meshes for every loose, moving piece. */
  sync() {
    for (const piece of this.pieces) {
      if (piece.loosened === null) continue;
      const { position, quaternion } = piece.body;
      piece.mesh.position.set(position.x, position.y, position.z);
      piece.mesh.quaternion.set(
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w,
      );
    }
  }

  dispose() {
    for (const piece of this.pieces) this.world.removeBody(piece.body);
    this.group.removeFromParent();
    for (const geometry of this.ownGeometries) geometry.dispose();
  }
}
