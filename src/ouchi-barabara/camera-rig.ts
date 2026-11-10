import * as THREE from 'three';

// Fixed three-quarter framing of one work site, plus a horizontal follow used
// when the excavator drives on to the next house. The follow is a critically
// damped spring (the SmoothDamp used by common game engines): the camera
// starts after the machine does, eases in and settles after it stops, so the
// excavator visibly moves across the frame instead of being pinned in place.

/**
 * カメラの調整値。縦長用（portrait）と横長用（landscape）の値を、画面の縦横比が
 * `aspect.portrait` から `aspect.landscape` の間にあるとき、なめらかに混ぜます。
 * カメラは `site` の範囲全体が画面に収まるまで自動で引くため、`direction` で
 * 見る角度を決めると、距離はそこから決まります。
 */
export const CAMERA = {
  /** 縦方向の画角（度）。 */
  fov: 38,
  /** 縦横比（幅÷高さ）の切り替え範囲。この値以下は縦長用、以上は横長用の値を
   *  そのまま使います。 */
  aspect: { portrait: 0.6, landscape: 1.4 },
  /** 注視点からカメラへ向かう方向（長さは任意）。 */
  direction: {
    portrait: [-1, 0.9, 0.32],
    landscape: [-0.3, 0.6, 1],
  },
  /** カメラが見る点（X は道に沿った方向、Y は上、Z は手前）。 */
  look: { portrait: [2.0, 1.9, 0], landscape: [1.9, 1.9, 0] },
  /** 画面に必ず収める、ショベルカーと家の周りの箱。X と Z の範囲と、
   *  最も高い点（いちばん高い屋根と振り上げたバケット）。 */
  site: { x: [-3.4, 7], z: [-1.6, 2.4], top: 5.4 },
  /** 箱を画面の端にどこまで近づけてよいか（1 = 端ぴったり）。 */
  margin: { x: 1.1, y: 0.9 },
  /** 次の家へ移動するときの追従。遅れの時間（秒、大きいほど遅れる）、
   *  動きを減らす設定のときの遅れの時間、走る速さあたりの先を映す量。 */
  follow: { smooth: 0.5, smoothReduced: 0.12, lookAhead: 0.25 },
} as const;

export class CameraRig {
  /** Current horizontal offset of the framing along X. */
  shift = 0;
  /** Where the framing is heading along X. */
  target = 0;
  private velocity = 0;
  private distance = 0;
  private readonly direction = new THREE.Vector3();
  private readonly look = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /**
   * Choose the view for the current aspect ratio and pull back until the
   * whole site fits. Every building shares this framing. Portrait looks more
   * along the approach so the long excavator-to-house line is foreshortened.
   */
  fit() {
    const { aspect, direction, look } = CAMERA;
    const blend = THREE.MathUtils.clamp(
      (this.camera.aspect - aspect.portrait) /
        (aspect.landscape - aspect.portrait),
      0,
      1,
    );
    const mix = (a: readonly number[], b: readonly number[], i: number) =>
      THREE.MathUtils.lerp(a[i], b[i], blend);
    this.direction
      .set(
        mix(direction.portrait, direction.landscape, 0),
        mix(direction.portrait, direction.landscape, 1),
        mix(direction.portrait, direction.landscape, 2),
      )
      .normalize();
    this.look.set(
      mix(look.portrait, look.landscape, 0),
      mix(look.portrait, look.landscape, 1),
      mix(look.portrait, look.landscape, 2),
    );
    this.distance = this.fitDistance(CAMERA.site.top);
    this.place(this.distance);
  }

  private place(distance: number) {
    const camera = this.camera;
    camera.position.copy(this.look).addScaledVector(this.direction, distance);
    camera.lookAt(this.look);
    camera.updateMatrixWorld();
  }

  private fitDistance(top: number) {
    const corners: THREE.Vector3[] = [];
    for (const x of CAMERA.site.x)
      for (const y of [0, top])
        for (const z of CAMERA.site.z) corners.push(new THREE.Vector3(x, y, z));
    const projected = new THREE.Vector3();
    const fits = (distance: number) => {
      this.place(distance);
      return corners.every((corner) => {
        projected.copy(corner).project(this.camera);
        return (
          Math.abs(projected.x) <= CAMERA.margin.x &&
          Math.abs(projected.y) <= CAMERA.margin.y
        );
      });
    };
    let near = 4;
    let far = 80;
    for (let i = 0; i < 24; i++) {
      const middle = (near + far) / 2;
      if (fits(middle)) far = middle;
      else near = middle;
    }
    return far;
  }

  /** Advance the follow toward `target`; smaller smoothTime follows tighter. */
  follow(dt: number, smoothTime: number) {
    const omega = 2 / smoothTime;
    const x = omega * dt;
    const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = this.shift - this.target;
    const temp = (this.velocity + omega * change) * dt;
    this.velocity = (this.velocity - omega * temp) * decay;
    this.shift = this.target + (change + temp) * decay;
    if (this.settled) {
      this.shift = this.target;
      this.velocity = 0;
    }
  }

  get settled() {
    return (
      Math.abs(this.shift - this.target) < 0.002 &&
      Math.abs(this.velocity) < 0.01
    );
  }

  /** Move framing and target together (scene recentring). */
  offset(dx: number) {
    this.shift += dx;
    this.target += dx;
  }

  reset() {
    this.shift = this.target = this.velocity = 0;
  }

  /** Place the camera; `jitter` is a small random offset for impact shake. */
  apply(jitter: number) {
    const position = this.camera.position;
    position.copy(this.look).addScaledVector(this.direction, this.distance);
    position.x += this.shift;
    if (jitter > 0) {
      position.x += (Math.random() - 0.5) * jitter;
      position.y += (Math.random() - 0.5) * jitter;
    }
  }
}

/** Sun position relative to the framing, and the X it aims at. */
export const SUN_OFFSET = new THREE.Vector3(-4, 12, 9);
export const SUN_AIM_X = 2;

/** Visible ground farther than this from the camera counts as the horizon. */
const SHADOW_REACH = 120;
/** Tallest shadow receivers above the ground: raised boom, roofs, trees. */
const RECEIVER_HEIGHT = 6.5;
/** How far toward the sun (beyond the view) casters are still included. */
const CASTER_MARGIN = 30;

/**
 * Fit an orthographic shadow camera, placed at `light` and aimed at `aim` as
 * three.js does for a directional light, around everything `view` sees.
 *
 * A directional shadow only needs to cover the receivers' footprint across
 * the light; casters outside the view that throw shadows into it sit at the
 * same footprint, nearer the light, so the near plane is pulled toward the
 * sun instead of widening the box. Returns the larger side of the box.
 */
export function fitShadowCamera(
  view: THREE.PerspectiveCamera,
  light: THREE.Vector3,
  aim: THREE.Vector3,
  shadow: THREE.OrthographicCamera,
) {
  view.updateMatrixWorld();
  // A camera, not a plain Object3D: lookAt points a camera's -Z at the
  // target but a plain object's +Z, which would mirror the box.
  const basis = new THREE.OrthographicCamera();
  basis.position.copy(light);
  basis.lookAt(aim);
  basis.updateMatrixWorld();
  const toLight = basis.matrixWorldInverse;
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const p = new THREE.Vector3();
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const steps = 8;
  for (let i = 0; i <= steps; i++)
    for (let j = 0; j <= steps; j++) {
      ray.setFromCamera(
        ndc.set((i / steps) * 2 - 1, (j / steps) * 2 - 1),
        view,
      );
      const distance = ray.ray.distanceToPlane(ground);
      ray.ray.at(Math.min(distance ?? SHADOW_REACH, SHADOW_REACH), hit);
      hit.y = 0;
      for (const height of [0, RECEIVER_HEIGHT]) {
        p.copy(hit).setY(height).applyMatrix4(toLight);
        min.min(p);
        max.max(p);
      }
    }
  shadow.left = min.x - 1;
  shadow.right = max.x + 1;
  shadow.bottom = min.y - 1;
  shadow.top = max.y + 1;
  shadow.near = -max.z - CASTER_MARGIN;
  shadow.far = -min.z + 2;
  shadow.updateProjectionMatrix();
  return Math.max(max.x - min.x, max.y - min.y);
}
