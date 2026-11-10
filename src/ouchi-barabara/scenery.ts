import * as THREE from 'three';

// Static surroundings along the road. Trees and hills repeat every BLOCK and
// work sites every SITE_SPACING (a whole number of blocks), so when the scene
// recentres after driving to the next house (all moving things shift back by
// one spacing) the scenery looks unchanged and never needs to move. Nothing
// here takes part in physics.

/** Length of one repeating stretch of roadside scenery. */
const BLOCK = 16;
/**
 * Distance between consecutive demolition sites. Long enough that the next
 * house, built when the drive starts, is beyond the view even on tall
 * portrait screens, which look far down the road.
 */
export const SITE_SPACING = BLOCK * 3;

const BLOCKS = { from: -5, to: 9 };

const GRASS = 0x74d14c;
const ROAD = 0xdcae72;
const SITE = 0xe9bb7d;
const HILLS = [0x5cc142, 0x4fb53b];
const TRUNK = 0x8a5a3c;
const LEAVES = [0x2fa84f, 0x46c060, 0x7bd84a];
const BUSH = [0x3cb853, 0x5fcf5a];

/** Trees and bushes for one block, kept clear of the work site and road. */
const TREES: [x: number, z: number, scale: number][] = [
  [-4.5, -8, 1.2],
  [8.5, -7, 1],
  [11, -9.5, 1.4],
  [13.5, -7.5, 1.1],
  [9.5, 5.6, 0.9],
  [12.5, 6.4, 1.1],
];
const BUSHES: [x: number, z: number, scale: number][] = [
  [-2, -5.2, 1],
  [8, 4.4, 0.8],
  [10.6, -4.8, 1.1],
  [14.2, 4.6, 0.9],
];

export class Scenery {
  readonly group = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  constructor() {
    const flat = (
      geometry: THREE.BufferGeometry,
      color: number,
      x: number,
      y: number,
      sx = 1,
      sz = 1,
    ) => {
      const mesh = new THREE.Mesh(geometry, this.material(color));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, 0);
      mesh.scale.set(sx, sz, 1);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const span = (BLOCKS.to - BLOCKS.from + 2) * BLOCK;
    const middle = ((BLOCKS.from + BLOCKS.to) / 2) * BLOCK;
    flat(this.geometry(new THREE.PlaneGeometry(span, 90)), GRASS, middle, 0);
    flat(
      this.geometry(new THREE.PlaneGeometry(span, 3.6)),
      ROAD,
      middle,
      0.005,
    );
    const disc = this.geometry(new THREE.CircleGeometry(1, 40));
    const hill = this.geometry(new THREE.SphereGeometry(1, 20, 12));
    for (let k = BLOCKS.from; k <= BLOCKS.to; k++) {
      const base = k * BLOCK;
      if (base % SITE_SPACING === 0)
        flat(disc, SITE, base + 1.8, 0.01, 7.5, 4.2);
      [
        [-6, -34, 10],
        [3, -40, 13],
      ].forEach(([x, z, r], i) => {
        const mesh = new THREE.Mesh(hill, this.material(HILLS[i]));
        mesh.scale.setScalar(r);
        mesh.position.set(base + x, -r * 0.55, z);
        this.group.add(mesh);
      });
    }
    this.plant();
  }

  private plant() {
    const periods = BLOCKS.to - BLOCKS.from + 1;
    const trunk = this.geometry(
      new THREE.CylinderGeometry(0.16, 0.22, 1, 8).translate(0, 0.5, 0),
    );
    const crown = this.geometry(
      new THREE.ConeGeometry(1, 2, 9).translate(0, 1, 0),
    );
    const bush = this.geometry(new THREE.IcosahedronGeometry(1, 1));
    const trunks = this.instanced(trunk, TRUNK, TREES.length * periods);
    const crowns = this.instanced(crown, 0xffffff, TREES.length * periods);
    const bushes = this.instanced(bush, 0xffffff, BUSHES.length * periods);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let t = 0;
    let b = 0;
    for (let k = BLOCKS.from; k <= BLOCKS.to; k++) {
      const base = k * BLOCK;
      TREES.forEach(([x, z, s], i) => {
        dummy.position.set(base + x, 0, z);
        dummy.scale.set(s, s * 1.1, s);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        trunks.setMatrixAt(t, dummy.matrix);
        dummy.position.y = s * 0.9;
        dummy.scale.set(s * 0.95, s, s * 0.95);
        dummy.updateMatrix();
        crowns.setMatrixAt(t, dummy.matrix);
        crowns.setColorAt(t, color.set(LEAVES[i % LEAVES.length]));
        t++;
      });
      BUSHES.forEach(([x, z, s], i) => {
        dummy.position.set(base + x, s * 0.45, z);
        dummy.scale.set(s, s * 0.75, s);
        dummy.updateMatrix();
        bushes.setMatrixAt(b, dummy.matrix);
        bushes.setColorAt(b, color.set(BUSH[i % BUSH.length]));
        b++;
      });
    }
  }

  private instanced(
    geometry: THREE.BufferGeometry,
    color: number,
    count: number,
  ) {
    const mesh = new THREE.InstancedMesh(geometry, this.material(color), count);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T) {
    this.geometries.push(geometry);
    return geometry;
  }

  private material(color: number) {
    const material = new THREE.MeshLambertMaterial({ color });
    this.materials.push(material);
    return material;
  }

  dispose() {
    this.group.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
