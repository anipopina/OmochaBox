import assert from 'node:assert/strict';
import {
  RIG,
  pushPose,
  readyPose,
  strikePlan,
  tipPosition,
} from '../src/ouchi-barabara/rig.ts';
import { twoStoryHouse } from '../src/ouchi-barabara/house-plan.ts';
import {
  CameraRig,
  fitShadowCamera,
  SUN_AIM_X,
  SUN_OFFSET,
} from '../src/ouchi-barabara/camera-rig.ts';
import { SITE_SPACING } from '../src/ouchi-barabara/scenery.ts';
import * as THREE from 'three';

const plans = [twoStoryHouse()];
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

    const strike = strikePlan(attack.rootX, attack.target);
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

// The next house is built one site ahead when the drive starts; it must be
// out of view then, from tall portrait to wide landscape screens.
for (const aspect of [0.4, 0.46, 0.6, 0.75, 1, 1.33, 1.78, 2.4]) {
  const camera = new THREE.PerspectiveCamera(38, aspect, 0.5, 140);
  camera.updateProjectionMatrix();
  const rig = new CameraRig(camera);
  rig.fit();
  rig.apply(0);
  camera.updateMatrixWorld();
  for (const dx of [2.05, 4.2, 6.35])
    for (const y of [0, 2.2, 4.6])
      for (const z of [-1.9, 0, 1.9]) {
        const p = new THREE.Vector3(SITE_SPACING + dx, y, z).project(camera);
        const seen = Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1;
        assert.ok(!seen, `next house visible at aspect ${aspect}`);
      }
}

// Shadows cover the whole screen: every visible ground point (and a column
// above it, for tall objects) lies inside the sun's shadow box.
for (const aspect of [0.4, 0.46, 0.6, 0.75, 1, 1.33, 1.78, 2.4]) {
  const camera = new THREE.PerspectiveCamera(38, aspect, 0.5, 140);
  camera.updateProjectionMatrix();
  const rig = new CameraRig(camera);
  rig.fit();
  rig.apply(0);
  const aim = new THREE.Vector3(SUN_AIM_X, 0, 0);
  const shadow = new THREE.OrthographicCamera();
  fitShadowCamera(camera, SUN_OFFSET, aim, shadow);
  // Place it the way three.js places a directional light's shadow camera.
  shadow.position.copy(SUN_OFFSET);
  shadow.lookAt(aim);
  shadow.updateMatrixWorld();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  const hit = new THREE.Vector3();
  for (let i = 0; i <= 20; i++)
    for (let j = 0; j <= 20; j++) {
      ray.setFromCamera(new THREE.Vector2(i / 10 - 1, j / 10 - 1), camera);
      if (ray.ray.intersectPlane(ground, hit) === null) continue;
      if (hit.distanceTo(camera.position) > 120) continue;
      for (const y of [0, 3]) {
        const p = hit.clone().setY(y).project(shadow);
        assert.ok(
          Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && Math.abs(p.z) <= 1,
          `shadow misses visible ground at aspect ${aspect}`,
        );
      }
    }
}

const reach = RIG.boom + RIG.arm;
console.log(
  `Ouchi model PASS: ${plans.length} house(s), exact strike reach (arm ${reach}), zones, forward-only drive, push pose, next house out of view, full-screen shadows`,
);
