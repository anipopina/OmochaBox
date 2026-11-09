// Planar excavator kinematics, shared by rendering and the reach tests.
// The boom, arm and bucket move in one vertical plane that the upper body
// swings around the turntable axis. Distances are world units (≈ metres).

export interface Pose {
  /** Upper-body rotation around the vertical axis. */
  swing: number;
  /** Boom angle from horizontal, counter-clockwise in the arm plane. */
  boom: number;
  /** Arm angle relative to the boom. */
  arm: number;
  /** Bucket angle relative to the arm. */
  bucket: number;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export const RIG = {
  /** Turntable top above the ground, where the upper body is mounted. */
  upperY: 0.85,
  /** Boom pivot in the upper body's local frame (forward, up). */
  pivotX: 0.7,
  pivotY: 0.55,
  boom: 3,
  arm: 2.1,
  /** Bucket pivot to tooth tip. */
  tip: 1.02,
  /** Absolute bucket angle while slamming: teeth down, slightly forward. */
  strikeAngle: (-80 * Math.PI) / 180,
} as const;

const pivotHeight = RIG.upperY + RIG.pivotY;
const reachMax = RIG.boom + RIG.arm - 0.02;
const reachMin = Math.abs(RIG.boom - RIG.arm) + 0.02;

/** Solve boom/arm/bucket so the wrist sits at (h, y) in the arm plane. */
function solveWrist(h: number, y: number, bucketAbsolute: number) {
  const dx = h - RIG.pivotX;
  const dy = y - pivotHeight;
  const raw = Math.hypot(dx, dy);
  const d = Math.min(reachMax, Math.max(reachMin, raw));
  const toward = Math.atan2(dy, dx);
  // Elbow-up solution: the arm hangs from a raised boom like a real excavator.
  const shoulder = Math.acos(
    (RIG.boom ** 2 + d ** 2 - RIG.arm ** 2) / (2 * RIG.boom * d),
  );
  const boom = toward + shoulder;
  const ex = RIG.boom * Math.cos(boom);
  const ey = RIG.boom * Math.sin(boom);
  const wx = Math.cos(toward) * d;
  const wy = Math.sin(toward) * d;
  const armAbsolute = Math.atan2(wy - ey, wx - ex);
  return {
    boom,
    arm: armAbsolute - boom,
    bucket: bucketAbsolute - armAbsolute,
    clamped: raw > reachMax || raw < reachMin,
  };
}

function wristForTip(h: number, y: number, bucketAbsolute: number) {
  return {
    h: h - RIG.tip * Math.cos(bucketAbsolute),
    y: y - RIG.tip * Math.sin(bucketAbsolute),
  };
}

/** Swing angle and horizontal distance from the turntable axis to a point. */
function polar(rootX: number, target: Point3) {
  const dx = target.x - rootX;
  return { swing: Math.atan2(-target.z, dx), h: Math.hypot(dx, target.z) };
}

/** Folded carry pose: bucket held high enough to clear rubble while driving. */
export function readyPose(): Pose {
  const { boom, arm } = solveWrist(2.5, 1.95, 0);
  // Bucket curled toward the machine while carrying; angle set by eye in the
  // Blender layout of this rig (relative to the arm).
  return { swing: 0, boom, arm, bucket: READY_BUCKET };
}

const READY_BUCKET = (-53.4 * Math.PI) / 180;

export interface StrikePlan {
  windup: Pose;
  strike: Pose;
  recoil: Pose;
  /** True when the target lies outside the arm's reach (never in a plan). */
  clamped: boolean;
}

/** Poses that make the bucket teeth land exactly on `target`. */
export function strikePlan(rootX: number, target: Point3): StrikePlan {
  const { swing, h } = polar(rootX, target);
  const wrist = wristForTip(h, target.y, RIG.strikeAngle);
  const strike = solveWrist(wrist.h, wrist.y, RIG.strikeAngle);
  // Raise and pull back before the hit so the slam reads as a big swing.
  const windup = solveWrist(
    wrist.h - 0.9,
    wrist.y + 1.15,
    (15 * Math.PI) / 180,
  );
  const recoil = solveWrist(
    wrist.h - 0.15,
    wrist.y + 0.45,
    RIG.strikeAngle + 0.25,
  );
  return {
    windup: { swing, ...windup },
    strike: { swing, ...strike },
    recoil: { swing, ...recoil },
    clamped: strike.clamped,
  };
}

/** Forward kinematics of the tooth tip in world coordinates. */
export function tipPosition(rootX: number, pose: Pose): Point3 {
  const a1 = pose.boom;
  const a2 = a1 + pose.arm;
  const a3 = a2 + pose.bucket;
  const h =
    RIG.pivotX +
    RIG.boom * Math.cos(a1) +
    RIG.arm * Math.cos(a2) +
    RIG.tip * Math.cos(a3);
  const y =
    pivotHeight +
    RIG.boom * Math.sin(a1) +
    RIG.arm * Math.sin(a2) +
    RIG.tip * Math.sin(a3);
  return {
    x: rootX + h * Math.cos(pose.swing),
    y,
    z: -h * Math.sin(pose.swing),
  };
}

export function mixPose(a: Pose, b: Pose, t: number): Pose {
  return {
    swing: a.swing + (b.swing - a.swing) * t,
    boom: a.boom + (b.boom - a.boom) * t,
    arm: a.arm + (b.arm - a.arm) * t,
    bucket: a.bucket + (b.bucket - a.bucket) * t,
  };
}
