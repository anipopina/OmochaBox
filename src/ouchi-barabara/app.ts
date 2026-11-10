import '../shared/home-button';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { requireElement } from '../shared/dom';
import {
  CameraRig,
  fitShadowCamera,
  SUN_AIM_X,
  SUN_OFFSET,
} from './camera-rig';
import { Excavator } from './excavator';
import { Effects } from './effects';
import { GROUP, House, HouseKit, type Piece } from './house';
import { PALETTES, twoStoryHouse, type AttackSpec } from './house-plan';
import {
  mixPose,
  pushPose,
  readyPose,
  strikePlan,
  RIG,
  type Point3,
  type Pose,
} from './rig';
import { Scenery, SITE_SPACING } from './scenery';

const canvas = requireElement('#field', HTMLCanvasElement);
const fallback = requireElement('#fallback', HTMLElement);
const nextButton = requireElement('#next', HTMLButtonElement);
const motion = matchMedia('(prefers-reduced-motion: reduce)');

/** Taps accepted while an attack plays; more are dropped, not stored. */
const MAX_QUEUE = 2;
/** Holding a finger this long (seconds) keeps attacks coming one by one. */
const HOLD_DELAY = 0.35;
const STEP = 1 / 60;
const MAX_SPEED = 13;
const BUCKET_PUSH = 6;
const KNOCK_RADIUS = 2.4;
const SHOVE_TIME = 0.3;
const DEBRIS_MASK = GROUP.piece | GROUP.roof | GROUP.chimney;
/** A loose piece that never settles is put to sleep after this long. */
const SETTLE_LIMIT = 9;
/** Seconds for the drive to the next house (reduced motion: shorter). */
const TRAVEL_TIME = 6;
const TRAVEL_TIME_REDUCED = 4;
/** Camera follow smoothing (seconds) and look-ahead per unit of speed. */
const FOLLOW_SMOOTH = 0.5;
const FOLLOW_SMOOTH_REDUCED = 0.12;
const LOOK_AHEAD = 0.25;
/** Seconds for leftover rubble of the previous house to shrink away. */
const RETIRE_TIME = 0.6;
/** Bearing windows (radians) tried in turn when aiming rubble play. */
const AIM_SPREADS = [0.45, 0.9];

type PhaseKind =
  | 'drive'
  | 'windup'
  | 'strike'
  | 'recoil'
  | 'return'
  | 'lower'
  | 'travel'
  | 'raise';

/** One bucket swing in world coordinates. */
interface Swing {
  rootX: number;
  target: Point3;
  /** Zone of the current house broken by this swing (demolition only). */
  zone?: number;
  final?: boolean;
  power?: number;
  /** Rubble play: the loose piece being knocked, or null for bare ground. */
  poke?: Piece | null;
}

interface Phase {
  kind: PhaseKind;
  duration: number;
  to: Pose;
  ease: (t: number) => number;
  toX?: number;
  swing?: Swing;
  /** Captured when the phase starts, so chained moves blend smoothly. */
  from?: Pose;
  fromX?: number;
  elapsed: number;
}

const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
/**
 * Drive profile: speed up over the first fifth, cruise, and slow down over
 * the last quarter. Unlike an S-curve, the long road is covered at a steady
 * speed instead of a brief rush in the middle.
 */
const cruise = (t: number) => {
  const up = 0.2;
  const down = 0.25;
  const top = 1 / (1 - (up + down) / 2);
  if (t < up) return (top * t * t) / (2 * up);
  if (t < 1 - down) return top * (up / 2 + t - up);
  return 1 - (top * (1 - t) * (1 - t)) / (2 * down);
};

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
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 140);
const view = new CameraRig(camera);

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
// The sun and its shadow box travel with the camera framing.
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const scenery = new Scenery();
scene.add(scenery.group);

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

let paletteIndex = 0;
let house = new House(twoStoryHouse(PALETTES[paletteIndex]), kit, world);
scene.add(house.group);
/** Rubble of the house being left behind while driving to the next one. */
let previous: House | null = null;
/** Leftover rubble shrinking away after arrival. */
let retiring: { house: House; age: number } | null = null;
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
const pokeCounts = new WeakMap<Piece, number>();
/** The next-house button was pressed while a swing was still playing. */
let nextRequested = false;
/**
 * The next-house button has appeared for this house. It appears once, after
 * the final collapse has played out, and then stays until the drive starts,
 * so its entrance animation never replays during rubble play.
 */
let nextShown = false;
/** Simulation time of the final hit on the current house. */
let collapseTime = 0;
let simTime = 0;
let shake = 0;
let dustTimer = 0;
let collapsed = false;
let active = true;
let running = false;
let lastFrame: number | null = null;
/** Ground point of the latest tap, used to aim rubble play roughly. */
let aim: { x: number; z: number } | null = null;
/** The finger currently pressing the field, and whether it counts as held. */
let press: { id: number; since: number } | null = null;
let holding = false;

function demolished() {
  return attackIndex >= house.plan.attacks.length;
}

function transitioning() {
  return phases.some(
    (phase) =>
      phase.kind === 'lower' ||
      phase.kind === 'travel' ||
      phase.kind === 'raise',
  );
}

function physicalHouses() {
  return previous ? [previous, house] : [house];
}

function allPieces() {
  return physicalHouses().flatMap((h) => h.pieces);
}

/** Start over: a new house, the excavator back at its first position. */
function resetScene(rebuild: boolean) {
  if (rebuild) {
    previous?.dispose();
    retiring?.house.dispose();
    house.dispose();
    paletteIndex = 0;
    house = new House(twoStoryHouse(PALETTES[paletteIndex]), kit, world);
    scene.add(house.group);
  }
  previous = null;
  retiring = null;
  effects.clear();
  attackIndex = 0;
  queued = 0;
  phases = [];
  pending = [];
  shoves = [];
  nextRequested = false;
  collapsed = false;
  nextShown = false;
  shake = 0;
  press = null;
  holding = false;
  view.reset();
  excavator.root.position.x = house.plan.attacks[0].rootX;
  excavator.applyPose(readyPose());
  syncKinematics(0);
  canvas.dataset.hits = '0';
  canvas.dataset.pokes = '0';
  canvas.dataset.houses = '0';
  report();
}

const previousBucket = new THREE.Vector3();
const bucketWorld = new THREE.Vector3();
const bucketQuaternion = new THREE.Quaternion();
let previousRoot = 0;
let machineSpeed = 0;
function syncKinematics(dt: number) {
  const x = excavator.root.position.x;
  machineSpeed = dt > 0 ? (x - previousRoot) / dt : 0;
  machineBody.position.set(x, 0.8, 0);
  machineBody.velocity.set(machineSpeed, 0, 0);
  previousRoot = x;
  // The bucket touches debris only while slamming down or plowing ahead.
  // Colliding during the wind-up and return would scoop pieces up and carry
  // them onto the machine.
  const kind = phases[0]?.kind;
  // Once past the old site, let go of any rubble caught on the machine
  // rather than dragging it down the road.
  const pastSite =
    kind === 'travel' && previous !== null && x > previous.originX + 7;
  machineBody.collisionFilterMask = pastSite ? 0 : DEBRIS_MASK;
  bucketBody.collisionFilterMask =
    !pastSite && (kind === 'strike' || kind === 'travel') ? DEBRIS_MASK : 0;
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

function planSwing(swing: Swing) {
  const plan = strikePlan(swing.rootX, swing.target);
  const next: Phase[] = [];
  if (Math.abs(swing.rootX - excavator.root.position.x) > 1e-6)
    next.push({
      kind: 'drive',
      duration: 0.8,
      to: readyPose(),
      toX: swing.rootX,
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
      swing,
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
  const spec: AttackSpec = house.plan.attacks[attackIndex];
  const origin = house.originX;
  phases = planSwing({
    rootX: spec.rootX + origin,
    target: { ...spec.target, x: spec.target.x + origin },
    zone: attackIndex,
    final: spec.final,
    power: spec.power,
  });
  attackIndex++;
}

/**
 * Rubble play: knock one of the larger loose pieces within reach. Pieces in
 * the rough direction of the tap are preferred, and among those the one
 * poked least so far, so tapping the same spot still varies the target. With
 * nothing in reach, scrape the ground in the tapped direction.
 */
function startPoke() {
  const rootX = excavator.root.position.x;
  const bearing = (x: number, z: number) => Math.atan2(z, x - rootX);
  const inReach = house.pieces.filter((piece) => {
    if (piece.loosened === null) return false;
    const p = piece.body.position;
    const reach = Math.hypot(p.x - rootX, p.z);
    return p.x > rootX + 1.8 && reach > 2.6 && reach < 4.7 && p.y < 1.6;
  });
  const want = aim ? bearing(aim.x, aim.z) : null;
  let pool = inReach;
  if (want !== null)
    for (const spread of AIM_SPREADS) {
      const near = inReach.filter((piece) => {
        const p = piece.body.position;
        return Math.abs(bearing(p.x, p.z) - want) <= spread;
      });
      if (near.length) {
        pool = near;
        break;
      }
    }
  const candidates = pool
    .sort((a, b) => b.mass - a.mass)
    .slice(0, 3)
    .sort(
      (a, b) =>
        (pokeCounts.get(a) ?? 0) - (pokeCounts.get(b) ?? 0) ||
        Math.random() - 0.5,
    );
  const piece = candidates[0] ?? null;
  let target: Point3;
  if (piece) {
    pokeCounts.set(piece, (pokeCounts.get(piece) ?? 0) + 1);
    const p = piece.body.position;
    target = { x: p.x, y: p.y + 0.15, z: p.z };
  } else {
    const angle = THREE.MathUtils.clamp(want ?? 0, -0.7, 0.7);
    target = {
      x: rootX + 3.6 * Math.cos(angle),
      y: 0.05,
      z: 3.6 * Math.sin(angle),
    };
  }
  canvas.dataset.pokeZ = target.z.toFixed(2);
  phases = planSwing({ rootX, target, poke: piece });
}

/** Begin whatever comes next: the next demolition hit, or a rubble poke. */
function startNext() {
  if (demolished()) startPoke();
  else startAttack();
}

/** One tap or key press. Reacts at once when idle; otherwise queues a little. */
function request() {
  if (!active || document.hidden || transitioning() || nextRequested) return;
  if (!phases.length) startNext();
  else {
    const remaining = demolished()
      ? MAX_QUEUE
      : house.plan.attacks.length - attackIndex;
    queued = Math.min(queued + 1, MAX_QUEUE, remaining);
  }
  wake();
  report();
}

/** Whether a queued tap or a held finger should start another swing. */
function wantsMore() {
  return (queued > 0 || holding) && !nextRequested && !transitioning();
}

function takeQueued() {
  if (queued > 0) queued--;
}

function knockNearby(target: THREE.Vector3, power: number) {
  // Debris often rests on the part being hit and would pin it in place by
  // friction; the slam knocks that debris loose as well.
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
}

function impact(swing: Swing) {
  const target = new THREE.Vector3(
    swing.target.x,
    swing.target.y,
    swing.target.z,
  );
  const reduced = motion.matches;
  tip.getWorldPosition(bucketWorld);
  canvas.dataset.impactError = bucketWorld.distanceTo(target).toFixed(3);
  if (swing.poke !== undefined) {
    pokeImpact(swing, target, reduced);
    return;
  }
  const power = (swing.power ?? 1) * (reduced ? 0.5 : 1);
  const colors = new Set<number>();
  for (const piece of house.pieces) {
    if (piece.spec.zone !== swing.zone) continue;
    colors.add(piece.spec.color);
    pending.push({
      at: simTime + (piece.spec.delay ?? 0),
      piece,
      impact: target,
      power,
      final: swing.final === true,
    });
  }
  knockNearby(target, power);
  const palette = [...colors];
  effects.burst(
    target,
    palette,
    reduced ? 8 : swing.final ? 30 : 18,
    reduced ? 0.6 : 1,
  );
  effects.puff(target, swing.final ? 2.6 : 2);
  if (!reduced) {
    effects.puff(new THREE.Vector3(target.x + 0.6, 0.4, target.z + 0.9), 2.4);
    effects.puff(new THREE.Vector3(target.x + 1.2, 0.4, target.z - 0.8), 2.2);
    shake = swing.final ? 0.32 : 0.2;
  }
  if (swing.final) {
    collapsed = true;
    collapseTime = simTime;
  }
  canvas.dataset.hits = String(Number(canvas.dataset.hits ?? 0) + 1);
}

/** Rubble play hit: send the chosen piece flying and jostle its neighbours. */
function pokeImpact(swing: Swing, target: THREE.Vector3, reduced: boolean) {
  const power = reduced ? 0.6 : 1;
  const piece = swing.poke;
  if (piece) {
    const body = piece.body;
    const dx = body.position.x - swing.rootX;
    const flat = Math.hypot(dx, body.position.z) || 1;
    body.wakeUp();
    body.velocity.set(
      (Math.max(dx / flat, 0.3) * 3.5 + (Math.random() - 0.5)) * power,
      (2.6 + Math.random() * 1.2) * power,
      ((body.position.z / flat) * 3.5 + (Math.random() - 0.5) * 2) * power,
    );
    body.angularVelocity.set(
      (Math.random() - 0.5) * 6 * power,
      (Math.random() - 0.5) * 4 * power,
      (Math.random() - 0.5) * 6 * power,
    );
  }
  for (const other of house.pieces)
    if (other.loosened !== null) other.body.wakeUp();
  knockNearby(target, 0.7 * power);
  effects.burst(
    target,
    piece ? [piece.spec.color] : [0xe9bb7d, 0xd39a5c],
    reduced ? 5 : 10,
    reduced ? 0.5 : 0.8,
  );
  effects.puff(target, 1.6);
  if (!reduced) shake = 0.08;
  canvas.dataset.pokes = String(Number(canvas.dataset.pokes ?? 0) + 1);
}

const velocity = new CANNON.Vec3();
const spin = new CANNON.Vec3();
function loosen(entry: (typeof pending)[number]) {
  const { piece, impact: point, power, final } = entry;
  const c = piece.body.position;
  const core = { x: house.plan.core.x + house.originX, z: house.plan.core.z };
  // Ordinary hits throw pieces away from the bucket; the final collapse
  // bursts the remaining house outward from its own centre.
  const from = final ? core : point;
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
    const side = Math.sign(c.z - core.z) || 1;
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

/**
 * Drive on to the next house: lower the bucket like a blade, plow through the
 * rubble (pushing it aside), and stop in front of a new house built one site
 * further down the road.
 */
function beginTransition() {
  nextRequested = false;
  queued = 0;
  let index = paletteIndex;
  while (index === paletteIndex)
    index = Math.floor(Math.random() * PALETTES.length);
  paletteIndex = index;
  previous = house;
  house = new House(
    twoStoryHouse(PALETTES[paletteIndex]),
    kit,
    world,
    previous.originX + SITE_SPACING,
  );
  scene.add(house.group);
  attackIndex = 0;
  collapsed = false;
  nextShown = false;
  pending = [];
  shoves = [];
  canvas.dataset.hits = '0';
  const travel = motion.matches ? TRAVEL_TIME_REDUCED : TRAVEL_TIME;
  phases = [
    {
      kind: 'lower',
      duration: 0.45,
      to: pushPose(),
      ease: easeInOut,
      elapsed: 0,
    },
    {
      kind: 'travel',
      duration: travel,
      to: pushPose(),
      toX: house.originX + house.plan.attacks[0].rootX,
      ease: cruise,
      elapsed: 0,
    },
    {
      kind: 'raise',
      duration: 0.5,
      to: readyPose(),
      ease: easeInOut,
      elapsed: 0,
    },
  ];
  hideNext();
  wake();
  report();
}

function requestNext() {
  if (!active || document.hidden || !nextShown || transitioning()) return;
  hideNext();
  if (phases.length) nextRequested = true;
  else beginTransition();
  wake();
  report();
}

/**
 * Arrived: the old rubble is out of play and shrinks away, and everything
 * that moves shifts back one site so coordinates never grow. The scenery
 * repeats every site, so the shift is invisible.
 */
function arrive() {
  if (previous) {
    previous.removeBodies();
    retiring?.house.dispose();
    retiring = { house: previous, age: 0 };
    previous = null;
  }
  const dx = -house.originX;
  house.shift(dx);
  retiring?.house.shift(dx);
  excavator.root.position.x = house.plan.attacks[0].rootX;
  previousRoot += dx;
  previousBucket.x += dx;
  view.offset(dx);
  effects.clear();
  canvas.dataset.houses = String(Number(canvas.dataset.houses ?? 0) + 1);
}

function updatePhases(dt: number) {
  let remaining = dt;
  while (remaining > 0 && phases.length) {
    const phase = phases[0];
    if (!phase.from) {
      // Chain into the next swing instead of finishing the return.
      if (phase.kind === 'return' && wantsMore()) {
        takeQueued();
        startNext();
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
      if (phase.swing) impact(phase.swing);
      if (phase.kind === 'travel') arrive();
    }
  }
  if (!phases.length) {
    if (nextRequested) beginTransition();
    else if (wantsMore()) {
      takeQueued();
      startNext();
    }
  }
}

/** While plowing, nudge rubble ahead of the bucket off to the sides. */
function plowAside() {
  if (!previous || phases[0]?.kind !== 'travel') return;
  const rootX = excavator.root.position.x;
  for (const piece of previous.pieces) {
    if (piece.loosened === null) continue;
    const body = piece.body;
    const ahead = body.position.x - rootX;
    if (ahead < 1.2 || ahead > 4.4 || Math.abs(body.position.z) > 2.2) continue;
    const side = Math.sign(body.position.z) || (Math.random() < 0.5 ? -1 : 1);
    body.wakeUp();
    body.velocity.z = side * Math.max(Math.abs(body.velocity.z), 3.4);
    body.velocity.x = Math.max(body.velocity.x, machineSpeed * 0.7);
    if (body.position.y < 0.6) body.velocity.y = Math.max(body.velocity.y, 1);
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
  plowAside();
  world.step(STEP, dt, 3);
  for (const piece of allPieces()) {
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
  for (const h of physicalHouses()) h.sync();
}

function updateCamera(dt: number) {
  const travel = phases[0]?.kind === 'travel' ? phases[0] : null;
  const reduced = motion.matches;
  if (travel && previous) {
    // Follow the drive from the old site to the new one, looking a little
    // ahead in the direction of travel.
    const span = travel.toX! - travel.fromX!;
    const progress = THREE.MathUtils.clamp(
      (excavator.root.position.x - travel.fromX!) / span,
      0,
      1,
    );
    const ahead = reduced ? 0 : Math.max(0, machineSpeed) * LOOK_AHEAD;
    view.target = Math.min(
      house.originX,
      previous.originX + (house.originX - previous.originX) * progress + ahead,
    );
  } else {
    // Before the drive starts the old site stays framed.
    view.target = previous ? previous.originX : house.originX;
  }
  view.follow(dt, reduced ? FOLLOW_SMOOTH_REDUCED : FOLLOW_SMOOTH);
  placeSun();
}

function placeSun() {
  sun.position.copy(SUN_OFFSET);
  sun.position.x += view.shift;
  sun.target.position.set(SUN_AIM_X + view.shift, 0, 0);
}

/**
 * Fit the sun's shadow box to everything the camera can see. Tall portrait
 * views see far down the road, so a large box gets a larger shadow map to
 * keep shadows from turning blurry. The box moves with the sun, which follows
 * the camera, so this only needs redoing on resize.
 */
function fitShadow() {
  view.apply(0);
  placeSun();
  const size = fitShadowCamera(
    camera,
    sun.position,
    sun.target.position,
    sun.shadow.camera,
  );
  const map = size > 26 ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== map) {
    sun.shadow.mapSize.set(map, map);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
}

function updateRetiring(dt: number) {
  if (!retiring) return;
  retiring.age += dt;
  const scale = Math.max(0, 1 - retiring.age / RETIRE_TIME);
  retiring.house.scaleAll(scale);
  if (scale <= 0) {
    retiring.house.dispose();
    retiring = null;
  }
}

/** Puffs of dust at the bucket while plowing. */
function plowDust(dt: number) {
  if (phases[0]?.kind !== 'travel' || motion.matches) return;
  dustTimer -= dt;
  if (dustTimer > 0) return;
  dustTimer = 0.2;
  excavator.bucketCore.getWorldPosition(bucketWorld);
  effects.puff(
    new THREE.Vector3(bucketWorld.x + 0.3, 0.3, (Math.random() - 0.5) * 1.2),
    1.4,
  );
}

function awakePieces() {
  let count = 0;
  for (const piece of allPieces())
    if (
      piece.loosened !== null &&
      piece.body.sleepState !== CANNON.Body.SLEEPING
    )
      count++;
  return count;
}

/** Seconds after the final hit before the next-house button appears. */
const NEXT_DELAY = 0.7;

function state() {
  if (transitioning() || nextRequested) return 'transition';
  if (phases[0]?.kind === 'drive') return 'moving';
  if (collapsed) return nextShown ? 'rubble' : 'collapsing';
  if (phases.length) return 'attacking';
  return 'ready';
}

function showNext() {
  if (nextButton.hidden) nextButton.hidden = false;
}

function hideNext() {
  if (!nextButton.hidden) nextButton.hidden = true;
}

function report() {
  if (
    collapsed &&
    !nextShown &&
    !pending.length &&
    simTime - collapseTime >= NEXT_DELAY
  )
    nextShown = true;
  const current = state();
  if (current === 'rubble' && active) showNext();
  else hideNext();
  canvas.dataset.state = current;
  canvas.dataset.attack = String(attackIndex);
  canvas.dataset.queued = String(queued);
  canvas.dataset.running = String(running);
  canvas.dataset.holding = String(holding);
  canvas.dataset.camera = view.shift.toFixed(2);
  canvas.dataset.standing = String(
    house.pieces.filter((piece) => piece.loosened === null).length,
  );
}

function render() {
  view.apply(shake > 0 ? shake * 0.35 : 0);
  renderer.render(scene, camera);
}

function frame(now: number) {
  const dt =
    lastFrame === null ? STEP : Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  simTime += dt;
  if (press && !holding && now - press.since >= HOLD_DELAY * 1000)
    holding = true;
  updatePhases(dt);
  syncKinematics(dt);
  stepPhysics(dt);
  updateCamera(dt);
  updateRetiring(dt);
  plowDust(dt);
  effects.update(dt);
  shake = Math.max(0, shake - dt);
  render();
  const awake = awakePieces();
  canvas.dataset.awake = String(awake);
  if (
    !phases.length &&
    !queued &&
    !press &&
    !pending.length &&
    !shoves.length &&
    !retiring &&
    !(collapsed && !nextShown) &&
    !awake &&
    view.settled &&
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

function release() {
  if (press && canvas.hasPointerCapture(press.id))
    canvas.releasePointerCapture(press.id);
  press = null;
  holding = false;
}

/** Stop input and animation; finished debris stays where it is. */
function suspend() {
  queued = 0;
  release();
  sleep();
}

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  view.fit();
  fitShadow();
  render();
}

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4);
const aimHit = new THREE.Vector3();
/** Where on the ground (rubble height) a screen point looks. */
function aimAt(clientX: number, clientY: number) {
  const box = canvas.getBoundingClientRect();
  pointerNdc.set(
    ((clientX - box.left) / box.width) * 2 - 1,
    -((clientY - box.top) / box.height) * 2 + 1,
  );
  camera.updateMatrixWorld();
  raycaster.setFromCamera(pointerNdc, camera);
  aim = raycaster.ray.intersectPlane(aimPlane, aimHit)
    ? { x: aimHit.x, z: aimHit.z }
    : null;
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || press) return;
  event.preventDefault();
  aimAt(event.clientX, event.clientY);
  press = { id: event.pointerId, since: performance.now() };
  canvas.setPointerCapture(event.pointerId);
  request();
});
canvas.addEventListener('pointermove', (event) => {
  // A held finger can steer continued rubble play.
  if (press?.id === event.pointerId) aimAt(event.clientX, event.clientY);
});
const endPress = (event: PointerEvent) => {
  if (press?.id === event.pointerId) release();
};
canvas.addEventListener('pointerup', endPress);
canvas.addEventListener('pointercancel', endPress);
canvas.addEventListener('lostpointercapture', endPress);
canvas.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  aim = null;
  if (!event.repeat) request();
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
nextButton.addEventListener('click', requestNext);
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
  release();
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
updateCamera(0);
canvas.dataset.ready = 'true';
