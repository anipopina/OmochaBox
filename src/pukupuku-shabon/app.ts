import '../shared/home-button';

const field = document.querySelector<HTMLElement>('#field')!;
const layer = document.querySelector<HTMLElement>('#bubbles')!;
const create = document.querySelector<HTMLButtonElement>('#create')!;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const colors = [
  ['#368ec4', '#6bcff299'],
  ['#bc57a0', '#f6a3d299'],
  ['#548d68', '#9be4bf99'],
  ['#8064c5', '#bea7f599'],
];
interface Bubble {
  element: HTMLButtonElement;
  x: number;
  y: number;
  radius: number;
  phase: number;
  age: number;
  direction: number;
  pop: number | null;
}
const bubbles: Bubble[] = [];
let raf = 0;
let lastFrame = 0;
let serial = 0;
let audio: AudioContext | undefined;
let voice: OscillatorNode | undefined;
let lastSound = -Infinity;
let audioGeneration = 0;
let pausedAt: number | null = null;
let blurred = false;
let pageAway = false;

// One quiet voice, with a global cooldown even when several fingers tap.
async function sound(pop: boolean) {
  const now = performance.now();
  if (now - lastSound < 140 || document.hidden || pausedAt !== null) return;
  lastSound = now;
  const generation = audioGeneration;
  try {
    audio ??= new AudioContext();
    if (audio.state !== 'running') await audio.resume();
    if (pausedAt !== null || document.hidden) {
      await audio.suspend();
      return;
    }
    if (generation !== audioGeneration || voice) return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const t = audio.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(pop ? 420 : 280, t);
    oscillator.frequency.exponentialRampToValueAtTime(
      pop ? 170 : 390,
      t + 0.11,
    );
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.035, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    oscillator.connect(gain).connect(audio.destination);
    voice = oscillator;
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      if (voice === oscillator) voice = undefined;
    };
    oscillator.start(t);
    oscillator.stop(t + 0.14);
  } catch {
    /* Play remains available when audio is unavailable. */
  }
}
function remove(bubble: Bubble) {
  bubble.element.remove();
  bubbles.splice(bubbles.indexOf(bubble), 1);
}
function clamp(b: Bubble) {
  b.x = Math.max(b.radius, Math.min(field.clientWidth - b.radius, b.x));
  b.y = Math.max(b.radius, Math.min(field.clientHeight - b.radius, b.y));
}
function position(b: Bubble) {
  b.element.style.transform = `translate(${b.x - b.radius}px, ${b.y - b.radius}px)`;
}
function wake() {
  if (!raf && !document.hidden && pausedAt === null) {
    lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
  }
}
function frame(now: number) {
  raf = 0;
  const dt = Math.min((now - lastFrame) / 1000, 0.04);
  lastFrame = now;
  for (const b of [...bubbles]) {
    if (b.pop !== null) {
      if (now - b.pop > 390) remove(b);
      continue;
    }
    b.age += dt;
    if (!reduced.matches) {
      b.x += Math.sin(b.age * 0.7 + b.phase) * dt * 8;
      b.y += dt * 7 * b.direction;
      if (b.y <= b.radius) b.direction = 1;
      if (b.y >= field.clientHeight - b.radius) b.direction = -1;
      clamp(b);
      position(b);
    }
  }
  if (bubbles.some((b) => b.pop !== null || !reduced.matches))
    raf = requestAnimationFrame(frame);
}
function pop(b: Bubble) {
  if (b.pop !== null || pausedAt !== null) return;
  b.pop = performance.now();
  b.element.classList.add('popping');
  // Glints belong to the capped bubble, so eviction and completed pops
  // remove every effect without timers or a second animation loop.
  const count = reduced.matches ? 3 : 6;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + b.phase;
    const glint = document.createElement('span');
    glint.className = 'pop-glint';
    glint.setAttribute('aria-hidden', 'true');
    for (const [name, distance] of [
      ['start', b.radius * 0.7],
      ['end', b.radius + 22],
    ] as const) {
      glint.style.setProperty(`--${name}-x`, `${Math.cos(angle) * distance}px`);
      glint.style.setProperty(`--${name}-y`, `${Math.sin(angle) * distance}px`);
    }
    b.element.append(glint);
  }
  b.element.setAttribute('aria-label', 'シャボン玉がわれたよ');
  void sound(true);
  wake();
}
function spawn(x: number, y: number, audible = true) {
  if (document.hidden || pausedAt !== null) return;
  if (bubbles.length >= 18) remove(bubbles[0]);
  const radius = [48, 64, 80][serial % 3];
  const color = colors[serial++ % colors.length];
  const element = document.createElement('button');
  element.className = 'bubble';
  element.setAttribute('aria-label', 'シャボン玉をわる');
  element.style.width = element.style.height = `${radius * 2}px`;
  element.style.setProperty('--rim', color[0]);
  element.style.setProperty('--tint', color[1]);
  element.innerHTML = '<span class="film"></span>';
  const b: Bubble = {
    element,
    x,
    y,
    radius,
    phase: serial * 2.4,
    age: 0,
    direction: -1,
    pop: null,
  };
  clamp(b);
  position(b);
  bubbles.push(b);
  layer.append(element);
  element.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    pop(b);
  });
  element.addEventListener('click', (e) => {
    if (e.detail === 0) pop(b);
  });
  if (audible) void sound(false);
  wake();
}
create.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  const r = field.getBoundingClientRect();
  spawn(e.clientX - r.x, e.clientY - r.y);
});
create.addEventListener('click', (e) => {
  if (e.detail === 0) spawn(field.clientWidth * 0.5, field.clientHeight * 0.6);
});
function pause() {
  if (pausedAt === null) pausedAt = performance.now();
  field.classList.add('paused');
  cancelAnimationFrame(raf);
  raf = 0;
  audioGeneration++;
  voice?.stop();
  voice = undefined;
  if (audio && audio.state === 'running') void audio.suspend().catch(() => {});
}
function resume() {
  if (document.hidden || blurred || pageAway || pausedAt === null) return;
  const elapsed = performance.now() - pausedAt;
  // Keep the remaining pop lifetime aligned with the paused CSS animation.
  for (const b of bubbles) if (b.pop !== null) b.pop += elapsed;
  pausedAt = null;
  field.classList.remove('paused');
  wake();
  // Sound resumes only on the next explicit gesture, never on focus alone.
}
window.addEventListener('blur', () => {
  blurred = true;
  pause();
});
window.addEventListener('focus', () => {
  blurred = false;
  resume();
});
window.addEventListener('pagehide', () => {
  pageAway = true;
  pause();
});
window.addEventListener('pageshow', () => {
  pageAway = false;
  blurred = !document.hasFocus();
  resume();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  else resume();
});
window.addEventListener('resize', () => {
  for (const b of bubbles) {
    clamp(b);
    position(b);
  }
});
reduced.addEventListener('change', wake);
spawn(field.clientWidth * 0.55, field.clientHeight * 0.55, false);
field.dataset.ready = 'true';
