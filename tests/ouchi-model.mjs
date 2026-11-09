import assert from 'node:assert/strict';
import {
  RIG,
  readyPose,
  strikePlan,
  tipPosition,
} from '../src/ouchi-barabara/rig.ts';
import { twoStoryHouse } from '../src/ouchi-barabara/house-plan.ts';

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

const reach = RIG.boom + RIG.arm;
console.log(
  `Ouchi model PASS: ${plans.length} house(s), exact strike reach (arm ${reach}), zones, forward-only drive`,
);
