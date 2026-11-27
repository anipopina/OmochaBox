import { requireElement } from './dom';
import './tilt-control.css';

type SensorAccess = {
  requestPermission?: () => Promise<PermissionState>;
};

async function prepareTiltPermission(
  field: HTMLElement,
  button: HTMLButtonElement,
  status: HTMLElement,
) {
  if (!isSecureContext) return;
  const orientation = window.DeviceOrientationEvent as SensorAccess | undefined;
  const motion = window.DeviceMotionEvent as SensorAccess | undefined;
  const request = orientation?.requestPermission
    ? orientation.requestPermission.bind(orientation)
    : motion?.requestPermission?.bind(motion);
  if (!request) return;

  // Without user activation this can read an existing decision. A browser
  // that needs to show its permission prompt rejects with NotAllowedError.
  let previouslyDenied = false;
  if (!navigator.userActivation.isActive) {
    try {
      const permission = await request();
      if (permission === 'granted') return;
      previouslyDenied = permission === 'denied';
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'NotAllowedError')
        return;
    }
  }

  function clearStatus() {
    status.textContent = '';
    field.removeEventListener('pointerdown', clearStatus);
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    clearStatus();
    try {
      const permission = await request();
      if (permission === 'granted') {
        button.hidden = true;
      } else if (permission === 'denied') {
        // The API reports the decision without indicating whether it showed a prompt.
        if (previouslyDenied) {
          status.append(
            'ブラウザの設定で',
            document.createElement('br'),
            '傾きセンサーを許可できます',
          );
          field.addEventListener('pointerdown', clearStatus, { once: true });
        }
        previouslyDenied = true;
      }
    } catch {
      // Continue playing with ordinary downward gravity and allow another try.
    } finally {
      button.disabled = false;
    }
  });
  button.hidden = false;
}

export function initTiltControl(
  field: HTMLElement,
  setDirection: (x: number, y: number) => void,
) {
  const mount = requireElement('[data-tilt-control]', HTMLDivElement, field);
  const button = document.createElement('button');
  button.className = 'tilt-control-button';
  button.type = 'button';
  button.hidden = true;
  button.textContent = 'かたむき';
  button.setAttribute('aria-label', '端末の傾きを使う');
  const status = document.createElement('p');
  status.className = 'tilt-control-status';
  status.setAttribute('role', 'status');
  mount.replaceChildren(button, status);
  void prepareTiltPermission(field, button, status);

  let hasOrientation = false;
  const radians = Math.PI / 180;

  function projectToScreen(x: number, y: number) {
    const screenAngle = (screen.orientation?.angle ?? 0) * radians;
    const cos = Math.cos(screenAngle);
    const sin = Math.sin(screenAngle);
    setDirection(x * cos + y * sin, y * cos - x * sin);
  }

  function tilt({ beta, gamma }: DeviceOrientationEvent) {
    if (beta === null || gamma === null || !Number.isFinite(beta + gamma))
      return;
    hasOrientation = true;
    const pitch = beta * radians;
    projectToScreen(
      Math.sin(gamma * radians) * Math.cos(pitch),
      Math.sin(pitch),
    );
  }

  // An accelerometer can report gravity even without an orientation estimate.
  function acceleration(event: DeviceMotionEvent) {
    if (hasOrientation) return;
    const { x, y, z } = event.accelerationIncludingGravity ?? {};
    if (x == null || y == null || z == null) return;
    const gx = x - (event.acceleration?.x ?? 0);
    const gy = y - (event.acceleration?.y ?? 0);
    const gz = z - (event.acceleration?.z ?? 0);
    const magnitude = Math.hypot(gx, gy, gz);
    if (Number.isFinite(magnitude) && magnitude > 1)
      projectToScreen(-gx / magnitude, gy / magnitude);
  }

  return {
    start() {
      if (!isSecureContext) return;
      window.addEventListener('deviceorientation', tilt);
      window.addEventListener('devicemotion', acceleration);
    },
    stop() {
      window.removeEventListener('deviceorientation', tilt);
      window.removeEventListener('devicemotion', acceleration);
      hasOrientation = false;
      setDirection(0, 1);
    },
  };
}
