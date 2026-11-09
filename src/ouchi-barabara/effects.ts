import * as THREE from 'three';

// Effect-only particles: toy-brick chips that bounce once and shrink away, and
// soft dust puffs. Fixed pools keep the cost bounded however often hits land.

const CHIP_COUNT = 72;
const CHIP_LIFE = 1.5;
const DUST_COUNT = 14;
const DUST_LIFE = 1.1;
const GRAVITY = -15;

interface Chip {
  age: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  spin: THREE.Vector3;
}

interface Puff {
  sprite: THREE.Sprite;
  age: number;
  size: number;
  drift: THREE.Vector3;
}

function dustTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,240,214,0.95)');
  gradient.addColorStop(0.55, 'rgba(240,214,170,0.6)');
  gradient.addColorStop(1, 'rgba(240,214,170,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Effects {
  readonly group = new THREE.Group();
  private readonly chips: Chip[] = [];
  private readonly chipMesh: THREE.InstancedMesh;
  private readonly puffs: Puff[] = [];
  private readonly dust = dustTexture();
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private nextChip = 0;
  private nextPuff = 0;

  constructor() {
    this.chipMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.24, 0.14, 0.18),
      new THREE.MeshLambertMaterial(),
      CHIP_COUNT,
    );
    this.chipMesh.frustumCulled = false;
    for (let i = 0; i < CHIP_COUNT; i++) {
      this.chips.push({
        age: CHIP_LIFE,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        spin: new THREE.Vector3(),
      });
      this.chipMesh.setColorAt(i, this.color.set(0xffffff));
    }
    this.group.add(this.chipMesh);
    for (let i = 0; i < DUST_COUNT; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.dust,
          transparent: true,
          depthWrite: false,
        }),
      );
      sprite.visible = false;
      this.group.add(sprite);
      this.puffs.push({
        sprite,
        age: DUST_LIFE,
        size: 1,
        drift: new THREE.Vector3(),
      });
    }
    this.hideChips();
  }

  /** Throw chips from a point, mostly up and away from the excavator. */
  burst(origin: THREE.Vector3, colors: number[], count: number, power: number) {
    for (let n = 0; n < count; n++) {
      const index = this.nextChip;
      this.nextChip = (this.nextChip + 1) % CHIP_COUNT;
      const chip = this.chips[index];
      chip.age = 0;
      chip.position.copy(origin);
      const angle = Math.random() * Math.PI * 2;
      const out = (1.5 + Math.random() * 3) * power;
      chip.velocity.set(
        Math.abs(Math.cos(angle)) * out * 0.8 + Math.cos(angle) * out * 0.4,
        (2.5 + Math.random() * 4) * power,
        Math.sin(angle) * out,
      );
      chip.rotation.set(
        Math.random() * 6,
        Math.random() * 6,
        Math.random() * 6,
      );
      chip.spin.set(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
      );
      this.chipMesh.setColorAt(
        index,
        this.color.set(colors[n % colors.length]),
      );
    }
    this.chipMesh.instanceColor!.needsUpdate = true;
  }

  puff(origin: THREE.Vector3, size: number) {
    const puff = this.puffs[this.nextPuff];
    this.nextPuff = (this.nextPuff + 1) % DUST_COUNT;
    puff.age = 0;
    puff.size = size;
    puff.sprite.position.copy(origin);
    puff.drift.set(
      (Math.random() - 0.5) * 0.8,
      0.5 + Math.random() * 0.5,
      (Math.random() - 0.5) * 0.8,
    );
    puff.sprite.visible = true;
  }

  get idle() {
    return (
      this.chips.every((chip) => chip.age >= CHIP_LIFE) &&
      this.puffs.every((puff) => puff.age >= DUST_LIFE)
    );
  }

  update(dt: number) {
    for (let i = 0; i < CHIP_COUNT; i++) {
      const chip = this.chips[i];
      if (chip.age >= CHIP_LIFE) continue;
      chip.age += dt;
      chip.velocity.y += GRAVITY * dt;
      chip.position.addScaledVector(chip.velocity, dt);
      if (chip.position.y < 0.07) {
        chip.position.y = 0.07;
        // Bounce once with a strong scuff, then settle and roll to a stop.
        chip.velocity.y =
          Math.abs(chip.velocity.y) > 2 ? -chip.velocity.y * 0.35 : 0;
        chip.velocity.x *= 0.6;
        chip.velocity.z *= 0.6;
        chip.spin.multiplyScalar(0.6);
      }
      chip.rotation.x += chip.spin.x * dt;
      chip.rotation.y += chip.spin.y * dt;
      chip.rotation.z += chip.spin.z * dt;
      const fade = Math.min(1, (CHIP_LIFE - chip.age) / 0.35);
      this.dummy.position.copy(chip.position);
      this.dummy.rotation.copy(chip.rotation);
      this.dummy.scale.setScalar(Math.max(0, fade));
      this.dummy.updateMatrix();
      this.chipMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.chipMesh.instanceMatrix.needsUpdate = true;
    for (const puff of this.puffs) {
      if (puff.age >= DUST_LIFE) continue;
      puff.age += dt;
      const t = Math.min(1, puff.age / DUST_LIFE);
      puff.sprite.position.addScaledVector(puff.drift, dt);
      puff.sprite.scale.setScalar(puff.size * (0.5 + t * 0.9));
      puff.sprite.material.opacity = 0.85 * (1 - t) * (1 - t);
      if (t >= 1) puff.sprite.visible = false;
    }
  }

  clear() {
    for (const chip of this.chips) chip.age = CHIP_LIFE;
    for (const puff of this.puffs) {
      puff.age = DUST_LIFE;
      puff.sprite.visible = false;
    }
    this.hideChips();
  }

  private hideChips() {
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < CHIP_COUNT; i++)
      this.chipMesh.setMatrixAt(i, this.dummy.matrix);
    this.chipMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.chipMesh.geometry.dispose();
    (this.chipMesh.material as THREE.Material).dispose();
    this.chipMesh.dispose();
    for (const puff of this.puffs) puff.sprite.material.dispose();
    this.dust.dispose();
  }
}
