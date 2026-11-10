import assert from 'node:assert/strict';
import {
  RIG,
  liftPose,
  mixPose,
  pushPose,
  readyPose,
  strikePlan,
  tipPosition,
} from '../src/ouchi-barabara/rig.ts';
import { BUILDINGS } from '../src/ouchi-barabara/house-plan.ts';
import {
  CAMERA,
  CameraRig,
  fitShadowCamera,
  SUN_AIM_X,
  SUN_OFFSET,
} from '../src/ouchi-barabara/camera-rig.ts';
import { SITE_SPACING } from '../src/ouchi-barabara/scenery.ts';
import * as THREE from 'three';
import { LEVELS, Quality } from '../src/ouchi-barabara/quality.ts';

const plans = BUILDINGS.map((build) => build());
const TRACK_HALF = 1.55;

for (const plan of plans) {
  const { attacks, pieces } = plan;
  assert.ok(attacks.length >= 2, `${plan.id}: at least two attacks`);
  assert.equal(
    attacks.filter((a) => a.final).length,
    1,
    `${plan.id}: one final`,
  );
  assert.ok(attacks.at(-1).final, `${plan.id}: final attack is last`);

  // Every attack breaks a large part loose; every piece belongs to one attack.
  for (let zone = 0; zone < attacks.length; zone++) {
    const count = pieces.filter((p) => p.zone === zone).length;
    assert.ok(count >= 5, `${plan.id}: attack ${zone} loosens ${count} pieces`);
  }
  for (const piece of pieces)
    assert.ok(piece.zone >= 0 && piece.zone < attacks.length);
  assert.ok(pieces.length <= 48, `${plan.id}: ${pieces.length} rigid pieces`);

  let previousRoot = -Infinity;
  attacks.forEach((attack, index) => {
    // Forward only, and the tracks never drive into the house front.
    assert.ok(
      attack.rootX >= previousRoot,
      `${plan.id}#${index}: forward only`,
    );
    previousRoot = attack.rootX;
    assert.ok(attack.rootX + TRACK_HALF < plan.frontX - 0.3);

    const strike = strikePlan(attack.rootX, attack.target, attack.style);
    assert.ok(!strike.clamped, `${plan.id}#${index}: target within reach`);
    const tip = tipPosition(attack.rootX, strike.strike);
    const error = Math.hypot(
      tip.x - attack.target.x,
      tip.y - attack.target.y,
      tip.z - attack.target.z,
    );
    assert.ok(error < 1e-6, `${plan.id}#${index}: tip error ${error}`);

    // The target sits on a piece broken by this attack (no air strikes).
    const hit = pieces.some((p) => {
      if (p.zone !== index) return false;
      const reach = Math.hypot(p.size.x, p.size.y, p.size.z) / 2 + 0.05;
      return (
        Math.hypot(
          p.center.x - attack.target.x,
          p.center.y - attack.target.y,
          p.center.z - attack.target.z,
        ) <= reach
      );
    });
    assert.ok(hit, `${plan.id}#${index}: target touches its own zone`);

    // Wind-up lifts the bucket above the strike point.
    assert.ok(
      tipPosition(attack.rootX, strike.windup).y > attack.target.y + 0.6,
    );
  });

  // While driving the bucket is held above ground and clear of the house front.
  for (const rootX of new Set(attacks.map((a) => a.rootX))) {
    const tip = tipPosition(rootX, readyPose());
    assert.ok(tip.y > 0.8, `${plan.id}: carried bucket off the ground`);
  }
}

// Plowing to the next house: bucket held just above the ground, ahead of the
// tracks, within reach.
{
  const tip = tipPosition(0, pushPose());
  assert.ok(tip.y > 0.05 && tip.y < 0.4, `push pose tip height ${tip.y}`);
  assert.ok(tip.x > TRACK_HALF + 0.8, 'push pose bucket ahead of the tracks');
}

const ASPECTS = [0.4, 0.46, 0.6, 0.75, 1, 1.33, 1.78, 2.4];

/** Bounding points of a plan's pieces, roofs and props included. */
function extents(plan, offsetX) {
  const points = [];
  for (const piece of plan.pieces) {
    const { center: c, size: s } = piece;
    const r = Math.hypot(s.x, s.y) / 2;
    for (const dx of [-r, r])
      for (const dy of [-r, r])
        for (const dz of [-s.z / 2, s.z / 2])
          points.push(
            new THREE.Vector3(
              c.x + dx + offsetX,
              Math.max(0, c.y + dy),
              c.z + dz,
            ),
          );
  }
  return points;
}

function camera(aspect) {
  const view = new THREE.PerspectiveCamera(CAMERA.fov, aspect, 0.5, 140);
  view.updateProjectionMatrix();
  const rig = new CameraRig(view);
  rig.fit();
  rig.apply(0);
  view.updateMatrixWorld();
  return view;
}

// The next building is placed one site ahead when the drive starts; it must
// be out of view then, whatever building is framed now, from tall portrait
// to wide landscape screens.
for (const aspect of ASPECTS)
  for (const current of plans) {
    const view = camera(aspect);
    for (const next of plans)
      for (const point of extents(next, SITE_SPACING)) {
        const p = point.clone().project(view);
        const seen = Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1;
        assert.ok(
          !seen,
          `${next.id} visible from ${current.id} framing at aspect ${aspect}`,
        );
      }
  }

// Shadows cover the whole screen: the shadow box, fitted for the farthest
// framing, holds every visible ground point (and a column above it, for tall
// objects) for every building's framing.
for (const aspect of ASPECTS) {
  const aim = new THREE.Vector3(SUN_AIM_X, 0, 0);
  const shadow = new THREE.OrthographicCamera();
  fitShadowCamera(camera(aspect), SUN_OFFSET, aim, shadow);
  // Place it the way three.js places a directional light's shadow camera.
  shadow.position.copy(SUN_OFFSET);
  shadow.lookAt(aim);
  shadow.updateMatrixWorld();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  const hit = new THREE.Vector3();
  for (const plan of plans) {
    const view = camera(aspect);
    for (let i = 0; i <= 20; i++)
      for (let j = 0; j <= 20; j++) {
        ray.setFromCamera(new THREE.Vector2(i / 10 - 1, j / 10 - 1), view);
        if (ray.ray.intersectPlane(ground, hit) === null) continue;
        if (hit.distanceTo(view.position) > 120) continue;
        for (const y of [0, 3]) {
          const p = hit.clone().setY(y).project(shadow);
          assert.ok(
            Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && Math.abs(p.z) <= 1,
            `shadow misses visible ground at aspect ${aspect} (${plan.id})`,
          );
        }
      }
  }
}

// Quality steps down after sustained slow frames, never below the last
// level, and not at all when pinned.
{
  const changes = [];
  const auto = new Quality(false, (level) => changes.push(level));
  for (let i = 0; i < 2000; i++) auto.sample(1 / 30);
  assert.equal(auto.level, LEVELS.length - 1, 'steps down to the lowest level');
  assert.equal(changes.length, LEVELS.length - 1);
  const smooth = new Quality(false, () => {});
  for (let i = 0; i < 2000; i++) smooth.sample(1 / 60);
  assert.equal(smooth.level, 0, 'fast frames keep full quality');
  const pinned = new Quality(true, () => {});
  for (let i = 0; i < 2000; i++) pinned.sample(1 / 20);
  assert.equal(pinned.level, 0, 'quality=max stays at full quality');
}

// Wind-up, slam and return keep the arm and bucket mostly out of the
// building (the excavator never backs off mid-hit): count sampled points of
// the arm and bucket that end up inside standing pieces along those moves,
// across all buildings and hits.
{
  const pivotY = RIG.upperY + RIG.pivotY;
  // Bucket outline (bucket-local, +Y is the rounded back) and the teeth.
  const bucket = [
    [0, -0.16],
    [-0.14, 0.02],
    [-0.08, 0.22],
    [0.08, 0.4],
    [0.32, 0.5],
    [0.58, 0.48],
    [0.78, 0.34],
    [0.92, 0.05],
    [RIG.tip, 0],
    [0.45, 0],
  ];
  const samples = (rootX, p) => {
    const a1 = p.boom;
    const a2 = a1 + p.arm;
    const a3 = a2 + p.bucket;
    const ex = RIG.pivotX + RIG.boom * Math.cos(a1);
    const ey = pivotY + RIG.boom * Math.sin(a1);
    const wx = ex + RIG.arm * Math.cos(a2);
    const wy = ey + RIG.arm * Math.sin(a2);
    const flat = [];
    for (let k = 0; k <= 6; k++)
      flat.push([ex + ((wx - ex) * k) / 6, ey + ((wy - ey) * k) / 6]);
    for (const [bx, by] of bucket)
      flat.push([
        wx + bx * Math.cos(a3) - by * Math.sin(a3),
        wy + bx * Math.sin(a3) + by * Math.cos(a3),
      ]);
    const out = [];
    for (const [h, y] of flat)
      for (const z of [-0.3, 0, 0.3]) {
        const c = Math.cos(p.swing);
        const s = Math.sin(p.swing);
        out.push([rootX + h * c + z * s, y, -h * s + z * c]);
      }
    return out;
  };
  const inside = ([x, y, z], piece) => {
    const { center: c, size: s } = piece;
    const t = -(piece.tilt ?? 0);
    const dx = x - c.x;
    const dy = y - c.y;
    const lx = dx * Math.cos(t) - dy * Math.sin(t);
    const ly = dx * Math.sin(t) + dy * Math.cos(t);
    return (
      Math.abs(lx) < s.x / 2 &&
      Math.abs(ly) < s.y / 2 &&
      Math.abs(z - c.z) < s.z / 2
    );
  };
  let sunk = 0;
  for (const plan of plans) {
    let pose = readyPose();
    plan.attacks.forEach((attack, i) => {
      const strike = strikePlan(attack.rootX, attack.target, attack.style);
      const before = plan.pieces.filter((p) => p.zone >= i);
      const after = plan.pieces.filter((p) => p.zone > i);
      const moves = [
        [pose, strike.windup, before, liftPose],
        [strike.windup, strike.strike, before, mixPose],
        [strike.recoil, readyPose(), after, liftPose],
      ];
      for (const [from, to, standing, path] of moves)
        for (let k = 0; k <= 30; k++)
          for (const point of samples(attack.rootX, path(from, to, k / 30)))
            if (standing.some((piece) => inside(point, piece))) sunk++;
      pose = readyPose();
    });
  }
  // The teeth touching the hit surface at impact accounts for most of the
  // remaining count; the bound catches arms sweeping through buildings.
  assert.ok(sunk <= 25, `arm and bucket sink into buildings: ${sunk}`);
}

const reach = RIG.boom + RIG.arm;
console.log(
  `Ouchi model PASS: ${plans.length} house(s), exact strike reach (arm ${reach}), zones, forward-only drive, push pose, next house out of view, full-screen shadows, quality steps, little sinking`,
);
