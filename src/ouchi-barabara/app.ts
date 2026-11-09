import '../shared/home-button';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { requireElement } from '../shared/dom';
import { Excavator } from './excavator';
import { Effects } from './effects';
import { GROUP, House, HouseKit, type Piece } from './house';
import { twoStoryHouse, type AttackSpec } from './house-plan';
import { mixPose, readyPose, strikePlan, RIG, type Pose } from './rig';

const canvas = requireElement('#field', HTMLCanvasElement);
const fallback = requireElement('#fallback', HTMLElement);
const motion = matchMedia('(prefers-reduced-motion: reduce)');

/** Taps accepted while an attack plays; more are dropped, not stored. */
const MAX_QUEUE = 2;
const STEP = 1 / 60;
const MAX_SPEED = 13;
const BUCKET_PUSH = 6;
const KNOCK_RADIUS = 2.4;
const SHOVE_TIME = 0.3;
const DEBRIS_MASK = GROUP.piece | GROUP.roof | GROUP.chimney;
/** A loose piece that never settles is put to sleep after this long. */
const SETTLE_LIMIT = 9;

type PhaseKind = 'drive' | 'windup' | 'strike' | 'recoil' | 'return';
interface Phase {
  kind: PhaseKind;
  duration: number;
  to: Pose;
  ease: (t: number) => number;
  toX?: number;
  attack?: AttackSpec;
  /** Captured when the phase starts, so chained attacks blend smoothly. */
  from?: Pose;
  fromX?: number;
  elapsed: number;
}

const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch {
  canvas.hidden = true;
  fallback.hidden = false;
  throw new Error('WebGL is unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 120);

// Sky: a vertical gradient drawn as a flat screen-filling background.
const sky = (() => {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#3fb4ff');
  g.addColorStop(0.7, '#a9e6ff');
  g.addColorStop(1, '#e6f9ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
})();
scene.background = sky;

scene.add(new THREE.HemisphereLight(0xffffff, 0x7fbf5a, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.position.set(-4, 12, 9);
sun.target.position.set(2, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, {
  left: -9,
  right: 9,
  top: 9,
  bottom: -9,
  near: 1,
  far: 32,
});
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// Ground: grass with a dirt work site under the excavator and house.
const staticGeometries: THREE.BufferGeometry[] = [];
const staticMaterials: THREE.Material[] = [];
function staticMesh(geometry: THREE.BufferGeometry, color: number) {
  const material = new THREE.MeshLambertMaterial({ color });
  staticGeometries.push(geometry);
  staticMaterials.push(material);
  return new THREE.Mesh(geometry, material);
}
const grass = staticMesh(new THREE.PlaneGeometry(90, 90), 0x74d14c);
grass.rotation.x = -Math.PI / 2;
grass.receiveShadow = true;
const site = staticMesh(new THREE.CircleGeometry(1, 40), 0xe9bb7d);
site.rotation.x = -Math.PI / 2;
site.scale.set(7.5, 4.2, 1);
site.position.set(1.8, 0.01, 0);
site.receiveShadow = true;
scene.add(grass, site);
for (const [x, z, r, color] of [
  [-14, -34, 10, 0x5cc142],
  [4, -40, 13, 0x4fb53b],
  [24, -34, 10, 0x66c94a],
] as const) {
  const hill = staticMesh(new THREE.SphereGeometry(r, 20, 12), color);
  hill.position.set(x, -r * 0.55, z);
  scene.add(hill);
}

// Physics world: gravity a little strong so collapses feel snappy.
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -14, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
(world.solver as CANNON.GSSolver).iterations = 8;
const kit = new HouseKit();
const groundMaterial = new CANNON.Material('ground');
// cannon-es brakes every contact point with a fixed mu·g·m regardless of load,
// and a box resting on a face has four points. Coefficients are therefore
// about a quarter of real-world values, or loosened walls stop dead.
world.addContactMaterial(
  new CANNON.ContactMaterial(groundMaterial, kit.material, {
    friction: 0.2,
    restitution: 0.18,
  }),
);
world.addContactMaterial(
  new CANNON.ContactMaterial(kit.material, kit.material, {
    friction: 0.15,
    restitution: 0.08,
  }),
);
const groundBody = new CANNON.Body({
  type: CANNON.Body.STATIC,
  shape: new CANNON.Plane(),
  material: groundMaterial,
  collisionFilterGroup: GROUP.ground,
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// Kinematic bodies follow the excavator so debris is pushed, not passed through.
function kinematic(halfExtents: CANNON.Vec3) {
  const body = new CANNON.Body({
    type: CANNON.Body.KINEMATIC,
    shape: new CANNON.Box(halfExtents),
    material: kit.material,
    allowSleep: false,
    collisionFilterGroup: GROUP.machine,
    collisionFilterMask: DEBRIS_MASK,
  });
  world.addBody(body);
  return body;
}

const excavator = new Excavator();
scene.add(excavator.root);
const machineBody = kinematic(new CANNON.Vec3(1.55, 0.8, 1.05));
const bucketBody = kinematic(
  new CANNON.Vec3(
    excavator.bucketSize.x / 2,
    excavator.bucketSize.y / 2,
    excavator.bucketSize.z / 2,
  ),
);
const tip = new THREE.Object3D();
tip.position.set(RIG.tip, 0, 0);
excavator.bucket.add(tip);

const effects = new Effects();
scene.add(effects.group);

let house = new House(twoStoryHouse(), kit, world);
scene.add(house.group);
let attackIndex = 0;
let queued = 0;
let phases: Phase[] = [];
let pending: {
  at: number;
  piece: Piece;
  impact: THREE.Vector3;
  power: number;
  final: boolean;
}[] = [];
/**
 * Walls keep an outward push for a moment after breaking loose. This is a
 * deliberate cheat, not physics: floors resting on them and cannon-es contact
 * friction otherwise stop ground-floor walls before they topple.
 */
let shoves: {
  piece: Piece;
  x: number;
  z: number;
  speed: number;
  until: number;
}[] = [];
let simTime = 0;
let shake = 0;
let collapsed = false;
let active = true;
let running = false;
let lastFrame: number | null = null;
const basePosition = new THREE.Vector3();
const lookTarget = new THREE.Vector3(2, 1.7, 0);

/** Start over: a new house, the excavator back at its first position. */
function resetScene(rebuild: boolean) {
  if (rebuild) {
    house.dispose();
    house = new House(twoStoryHouse(), kit, world);
    scene.add(house.group);
  }
  effects.clear();
  attackIndex = 0;
  queued = 0;
  phases = [];
  pending = [];
  shoves = [];
  collapsed = false;
  shake = 0;
  excavator.root.position.x = house.plan.attacks[0].rootX;
  excavator.applyPose(readyPose());
  syncKinematics(0);
  canvas.dataset.hits = '0';
  report();
}

// Camera: a fixed three-quarter view chosen per aspect ratio, pulled back
// until the whole work site fits. Portrait looks more along the approach so
// the long excavator-to-house line is foreshortened.
const fitCorners = (() => {
  const corners: THREE.Vector3[] = [];
  for (const x of [-3.4, 7])
    for (const y of [0, 5.4])
      for (const z of [-2.2, 2.4]) corners.push(new THREE.Vector3(x, y, z));
  return corners;
})();
function frameCamera() {
  const aspect = camera.aspect;
  const blend = THREE.MathUtils.clamp((aspect - 0.6) / 0.8, 0, 1);
  const direction = new THREE.Vector3(
    THREE.MathUtils.lerp(-1, -0.3, blend),
    THREE.MathUtils.lerp(0.9, 0.6, blend),
    THREE.MathUtils.lerp(0.32, 1, blend),
  ).normalize();
  lookTarget.set(THREE.MathUtils.lerp(2.6, 1.9, blend), 1.9, 0);
  const projected = new THREE.Vector3();
  const fits = (distance: number) => {
    camera.position.copy(lookTarget).addScaledVector(direction, distance);
    camera.lookAt(lookTarget);
    camera.updateMatrixWorld();
    return fitCorners.every((corner) => {
      projected.copy(corner).project(camera);
      return Math.abs(projected.x) <= 0.94 && Math.abs(projected.y) <= 0.9;
    });
  };
  let near = 4;
  let far = 60;
  for (let i = 0; i < 24; i++) {
    const middle = (near + far) / 2;
    if (fits(middle)) far = middle;
    else near = middle;
  }
  fits(far);
  basePosition.copy(camera.position);
}

const previousBucket = new THREE.Vector3();
const bucketWorld = new THREE.Vector3();
const bucketQuaternion = new THREE.Quaternion();
let previousRoot = 0;
function syncKinematics(dt: number) {
  const x = excavator.root.position.x;
  machineBody.position.set(x, 0.8, 0);
  machineBody.velocity.set(dt > 0 ? (x - previousRoot) / dt : 0, 0, 0);
  previousRoot = x;
  // The bucket only touches debris while slamming down. Colliding during the
  // wind-up and return would scoop pieces up and carry them onto the machine.
  bucketBody.collisionFilterMask =
    phases[0]?.kind === 'strike' ? DEBRIS_MASK : 0;
  excavator.bucketCore.getWorldPosition(bucketWorld);
  excavator.bucketCore.getWorldQuaternion(bucketQuaternion);
  bucketBody.position.set(bucketWorld.x, bucketWorld.y, bucketWorld.z);
  bucketBody.quaternion.set(
    bucketQuaternion.x,
    bucketQuaternion.y,
    bucketQuaternion.z,
    bucketQuaternion.w,
  );
  if (dt > 0)
    bucketBody.velocity.set(
      (bucketWorld.x - previousBucket.x) / dt,
      (bucketWorld.y - previousBucket.y) / dt,
      (bucketWorld.z - previousBucket.z) / dt,
    );
  else bucketBody.velocity.setZero();
  // The bucket sweeps fast through the wind-up; cap the speed it hands to
  // debris so pieces are shoved and tumbled rather than batted off-screen.
  const speed = bucketBody.velocity.length();
  if (speed > BUCKET_PUSH)
    bucketBody.velocity.scale(BUCKET_PUSH / speed, bucketBody.velocity);
  previousBucket.copy(bucketWorld);
}

function planAttack(attack: AttackSpec) {
  const plan = strikePlan(attack.rootX, attack.target);
  const next: Phase[] = [];
  if (attack.rootX !== excavator.root.position.x)
    next.push({
      kind: 'drive',
      duration: 0.8,
      to: readyPose(),
      toX: attack.rootX,
      ease: easeInOut,
      elapsed: 0,
    });
  next.push(
    {
      kind: 'windup',
      duration: 0.36,
      to: plan.windup,
      ease: easeInOut,
      elapsed: 0,
    },
    {
      kind: 'strike',
      duration: 0.17,
      to: plan.strike,
      ease: easeIn,
      attack,
      elapsed: 0,
    },
    {
      kind: 'recoil',
      duration: 0.13,
      to: plan.recoil,
      ease: easeOut,
      elapsed: 0,
    },
    {
      kind: 'return',
      duration: 0.42,
      to: readyPose(),
      ease: easeInOut,
      elapsed: 0,
    },
  );
  return next;
}

function startAttack() {
  const attack = house.plan.attacks[attackIndex];
  attackIndex++;
  phases = planAttack(attack);
}

/** One tap or key press. Reacts at once when idle; otherwise queues a little. */
function request() {
  if (!active || document.hidden) return;
  const busy = phases.length > 0;
  const remaining = house.plan.attacks.length - attackIndex;
  if (remaining <= 0) return;
  if (!busy) startAttack();
  else queued = Math.min(queued + 1, MAX_QUEUE, remaining);
  wake();
  report();
}

function impact(attack: AttackSpec) {
  const target = new THREE.Vector3(
    attack.target.x,
    attack.target.y,
    attack.target.z,
  );
  const zone = attackIndex - 1;
  const reduced = motion.matches;
  const power = (attack.power ?? 1) * (reduced ? 0.5 : 1);
  const colors = new Set<number>();
  for (const piece of house.pieces) {
    if (piece.spec.zone !== zone) continue;
    colors.add(piece.spec.color);
    pending.push({
      at: simTime + (piece.spec.delay ?? 0),
      piece,
      impact: target,
      power,
      final: attack.final === true,
    });
  }
  // Debris from earlier hits often rests on the part being hit and would pin
  // it in place by friction; the slam knocks that debris loose as well.
  for (const piece of house.pieces) {
    if (piece.loosened === null) continue;
    const body = piece.body;
    const dx = body.position.x - target.x;
    const dz = body.position.z - target.z;
    const reach = Math.hypot(dx, body.position.y - target.y, dz);
    if (reach > KNOCK_RADIUS) continue;
    const flat = Math.hypot(dx, dz) || 1;
    const strength = (1 - reach / KNOCK_RADIUS) * 3 * power;
    body.wakeUp();
    body.velocity.x += Math.max(dx / flat, 0.25) * strength;
    body.velocity.y += strength * 0.6;
    body.velocity.z += (dz / flat) * strength;
  }
  const palette = [...colors];
  effects.burst(
    target,
    palette,
    reduced ? 8 : attack.final ? 30 : 18,
    reduced ? 0.6 : 1,
  );
  effects.puff(target, attack.final ? 2.6 : 2);
  if (!reduced) {
    effects.puff(new THREE.Vector3(target.x + 0.6, 0.4, target.z + 0.9), 2.4);
    effects.puff(new THREE.Vector3(target.x + 1.2, 0.4, target.z - 0.8), 2.2);
    shake = attack.final ? 0.32 : 0.2;
  }
  if (attack.final) collapsed = true;
  tip.getWorldPosition(bucketWorld);
  canvas.dataset.impactError = bucketWorld.distanceTo(target).toFixed(3);
  canvas.dataset.hits = String(Number(canvas.dataset.hits ?? 0) + 1);
}

const velocity = new CANNON.Vec3();
const spin = new CANNON.Vec3();
function loosen(entry: (typeof pending)[number]) {
  const { piece, impact: point, power, final } = entry;
  const c = piece.spec.center;
  // Ordinary hits throw pieces away from the bucket; the final collapse
  // bursts the remaining house outward from its own centre.
  const from = final ? { x: house.plan.core.x, z: house.plan.core.z } : point;
  let dx = c.x - from.x;
  let dz = c.z - from.z;
  const distance = Math.hypot(c.x - point.x, c.y - point.y, c.z - point.z);
  const flat = Math.hypot(dx, dz) || 1;
  dx /= flat;
  dz /= flat;
  const roof = piece.spec.kind === 'roof' || piece.spec.kind === 'ridge';
  // Never throw debris back at the excavator: keep its path clear. Roof
  // panels slope down toward the excavator, so drop them into the house.
  dx = Math.max(dx, roof ? 0.9 : 0.25);
  const near = 1 / (1 + distance * 0.6);
  const push = (final ? 2.7 : 1.6 + 3.2 * near) * power;
  // Walls hop slightly so ground friction does not hold their base.
  const lift = final
    ? 1.5 + Math.random() * 2
    : roof
      ? -2.5 + Math.random() * 1.5
      : piece.spec.kind === 'wall'
        ? 0.8 + Math.random()
        : -1 + Math.random() * 1.5;
  if (piece.spec.kind === 'slab') {
    // Floor quarters drop and fold into a V along the centre seam (inner
    // edge first), so the floor visibly breaks instead of landing flat.
    const side = Math.sign(c.z - house.plan.core.z) || 1;
    velocity.set(dx * push * 0.5, -2.5 * power, dz * push * 0.5);
    spin.set(
      -side * 3.4 * power,
      (Math.random() - 0.5) * 1.5 * power,
      (Math.random() - 0.5) * 2.5 * power,
    );
    house.loosen(piece, velocity, spin, simTime);
    return;
  }
  velocity.set(dx * push, lift * power, dz * push);
  if (piece.spec.kind === 'wall')
    shoves.push({
      piece,
      x: dx / Math.hypot(dx, dz),
      z: dz / Math.hypot(dx, dz),
      speed: push * 0.8,
      until: simTime + SHOVE_TIME,
    });
  // Tip the top of each piece outward so walls topple instead of sliding.
  const topple = (piece.spec.kind === 'wall' ? 3.4 : 1.2) * power;
  spin.set(
    dz * topple + (Math.random() - 0.5) * 3 * power,
    (Math.random() - 0.5) * 2 * power,
    -dx * topple + (Math.random() - 0.5) * 3 * power,
  );
  house.loosen(piece, velocity, spin, simTime);
}

function updatePhases(dt: number) {
  let remaining = dt;
  while (remaining > 0 && phases.length) {
    const phase = phases[0];
    if (!phase.from) {
      // Chain into the next queued attack instead of finishing the return.
      if (phase.kind === 'return' && queued > 0) {
        queued--;
        startAttack();
        continue;
      }
      phase.from = excavator.pose;
      phase.fromX = excavator.root.position.x;
    }
    const step = Math.min(remaining, phase.duration - phase.elapsed);
    phase.elapsed += step;
    remaining -= step;
    const t = phase.ease(Math.min(1, phase.elapsed / phase.duration));
    if (phase.toX !== undefined) {
      const before = excavator.root.position.x;
      const x = THREE.MathUtils.lerp(phase.fromX!, phase.toX, t);
      excavator.root.position.x = x;
      excavator.roll(x - before);
    }
    excavator.applyPose(mixPose(phase.from, phase.to, t));
    if (phase.elapsed >= phase.duration) {
      phases.shift();
      if (phase.attack) impact(phase.attack);
    }
  }
  if (!phases.length && queued > 0 && attackIndex < house.plan.attacks.length) {
    queued--;
    startAttack();
  }
}

function stepPhysics(dt: number) {
  let loosened = false;
  for (let i = pending.length - 1; i >= 0; i--) {
    if (pending[i].at <= simTime) {
      loosen(pending[i]);
      pending.splice(i, 1);
      loosened = true;
    }
  }
  // cannon-es solves sleeping bodies as immovable, so debris asleep beside
  // the house would stop newly loosened pieces dead. Wake all debris first;
  // whatever stays still falls asleep again shortly.
  if (loosened)
    for (const piece of house.pieces)
      if (piece.loosened !== null) piece.body.wakeUp();
  for (let i = shoves.length - 1; i >= 0; i--) {
    const shove = shoves[i];
    if (simTime > shove.until) {
      shoves.splice(i, 1);
      continue;
    }
    const v = shove.piece.body.velocity;
    const along = v.x * shove.x + v.z * shove.z;
    if (along < shove.speed) {
      v.x += (shove.speed - along) * shove.x;
      v.z += (shove.speed - along) * shove.z;
      shove.piece.body.wakeUp();
    }
  }
  world.step(STEP, dt, 3);
  for (const piece of house.pieces) {
    if (piece.loosened === null) continue;
    const body = piece.body;
    const speed = body.velocity.length();
    if (speed > MAX_SPEED)
      body.velocity.scale(MAX_SPEED / speed, body.velocity);
    if (
      simTime - piece.loosened > SETTLE_LIMIT &&
      body.sleepState !== CANNON.Body.SLEEPING &&
      speed < 1
    )
      body.sleep();
  }
  house.sync();
}

function awakePieces() {
  let count = 0;
  for (const piece of house.pieces)
    if (
      piece.loosened !== null &&
      piece.body.sleepState !== CANNON.Body.SLEEPING
    )
      count++;
  return count;
}

function state() {
  if (phases[0]?.kind === 'drive') return 'moving';
  if (collapsed && (pending.length || phases.length)) return 'collapsing';
  if (phases.length) return 'attacking';
  return attackIndex >= house.plan.attacks.length ? 'rubble' : 'ready';
}

function report() {
  canvas.dataset.state = state();
  canvas.dataset.attack = String(attackIndex);
  canvas.dataset.queued = String(queued);
  canvas.dataset.running = String(running);
  canvas.dataset.standing = String(
    house.pieces.filter((piece) => piece.loosened === null).length,
  );
}

function render() {
  camera.position.copy(basePosition);
  if (shake > 0) {
    const amount = shake * 0.35;
    camera.position.x += (Math.random() - 0.5) * amount;
    camera.position.y += (Math.random() - 0.5) * amount;
  }
  renderer.render(scene, camera);
}

function frame(now: number) {
  const dt =
    lastFrame === null ? STEP : Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  simTime += dt;
  updatePhases(dt);
  syncKinematics(dt);
  stepPhysics(dt);
  effects.update(dt);
  shake = Math.max(0, shake - dt);
  render();
  const awake = awakePieces();
  canvas.dataset.awake = String(awake);
  if (
    !phases.length &&
    !queued &&
    !pending.length &&
    !shoves.length &&
    !awake &&
    effects.idle &&
    shake <= 0
  )
    sleep();
  report();
}

function wake() {
  if (running || !active || document.hidden) return;
  running = true;
  lastFrame = null;
  renderer.setAnimationLoop(frame);
}

function sleep() {
  if (!running) return;
  running = false;
  renderer.setAnimationLoop(null);
  report();
}

/** Stop input and animation; finished debris stays where it is. */
function suspend() {
  queued = 0;
  sleep();
}

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  frameCamera();
  render();
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  request();
});
canvas.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  if (!event.repeat) request();
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  suspend();
});
canvas.addEventListener('webglcontextrestored', () => {
  render();
  wake();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspend();
  else wake();
});
window.addEventListener('blur', () => {
  queued = 0;
  report();
});
window.addEventListener('pagehide', () => {
  active = false;
  suspend();
});
window.addEventListener('pageshow', (event) => {
  active = true;
  // Returning from the back-forward cache starts with a fresh house.
  if (event.persisted) {
    resetScene(true);
    render();
  }
});
motion.addEventListener('change', () => {
  shake = 0;
});
new ResizeObserver(resize).observe(canvas);

resetScene(false);
resize();
canvas.dataset.ready = 'true';
