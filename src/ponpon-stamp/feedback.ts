import { requireElement } from '../shared/dom';

// Feedback is bounded and independent from the permanent artwork/history.
const effects = requireElement('#effects', HTMLDivElement);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const particles = new Map<HTMLSpanElement, Animation>();
const voices = new Map<OscillatorNode, GainNode>();
const supportsVibration = typeof navigator.vibrate === 'function';
let context: AudioContext | undefined;
let lastPulse = -Infinity;
let lastSound = -Infinity;
let generation = 0;
function stopSound() {
  generation++;
  for (const [voice, gain] of voices) {
    try {
      voice.stop();
    } catch {
      /* Already ended. */
    }
    voice.disconnect();
    gain.disconnect();
  }
  voices.clear();
  if (context && context.state !== 'closed')
    void context.suspend().catch(() => {});
}
function stopVibration() {
  if (supportsVibration) {
    try {
      navigator.vibrate(0);
    } catch {
      /* Optional API. */
    }
  }
}

function playSound() {
  // No audio objects at boot. Browser activation and policy are never bypassed.
  if (document.hidden || !navigator.userActivation?.isActive) return;
  const now = performance.now();
  if (now - lastSound < 65) return;
  lastSound = now;
  const token = generation;
  try {
    context ??= new AudioContext();
    const audio = context;
    const play = () => {
      if (
        token !== generation ||
        document.hidden ||
        audio.state !== 'running' ||
        performance.now() - now > 180 ||
        voices.size >= 3
      )
        return;
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      const t = audio.currentTime;
      // Sine pop: 8ms attack, rounded pitch drop, near-silent 180ms tail.
      tone.type = 'sine';
      tone.frequency.setValueAtTime(640, t);
      tone.frequency.exponentialRampToValueAtTime(260, t + 0.12);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.075, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      tone.connect(gain).connect(audio.destination);
      voices.set(tone, gain);
      tone.onended = () => {
        voices.delete(tone);
        tone.disconnect();
        gain.disconnect();
      };
      tone.start(t);
      tone.stop(t + 0.19);
    };
    if (audio.state === 'running') play();
    else
      void audio
        .resume()
        .then(play)
        .catch(() => {});
  } catch {
    /* Sound unavailable: keep stamping. */
  }
}
function pulse() {
  if (
    !supportsVibration ||
    document.hidden ||
    !navigator.userActivation?.isActive
  )
    return;
  const now = performance.now();
  if (now - lastPulse < 160) return;
  lastPulse = now;
  try {
    navigator.vibrate(12);
  } catch {
    /* Unsupported/blocked hardware is harmless. */
  }
}
function removeParticle(particle: HTMLSpanElement) {
  const animation = particles.get(particle);
  particles.delete(particle);
  animation?.cancel();
  particle.remove();
}
export function clearParticles() {
  for (const particle of particles.keys()) removeParticle(particle);
}
export function suspendFeedback() {
  clearParticles();
  stopSound();
  stopVibration();
}
export function stampFeedback(element: HTMLSpanElement) {
  const count = reduced.matches ? 4 : 18;
  const colors = ['#ff3864', '#008be8', '#ffbf00', '#00b87a', '#a34dff'];
  const radius = element.offsetWidth * 0.44;
  for (let i = 0; i < count; i++) {
    while (particles.size >= 72) removeParticle(particles.keys().next().value!);
    const particle = document.createElement('span');
    particle.className = `stamp-particle particle-${i % 3}`;
    particle.style.background = colors[i % colors.length];
    particle.style.left = `${element.offsetLeft}px`;
    particle.style.top = `${element.offsetTop}px`;
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.2;
    const reach = radius + (reduced.matches ? 8 : 55 + Math.random() * 70);
    const position = (distance: number, scale: number) =>
      `translate(-50%, -50%) translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) rotate(${i * 47}deg) scale(${scale})`;
    effects.append(particle);
    const animation = particle.animate(
      [
        {
          transform: position(radius, reduced.matches ? 0.6 : 0.7),
          opacity: 1,
        },
        { transform: position(reach * 0.8, 1), opacity: 1, offset: 0.55 },
        { transform: position(reach, 0.45), opacity: 0 },
      ],
      {
        duration: reduced.matches ? 180 : 560 + Math.random() * 160,
        easing: 'cubic-bezier(.1,.6,.25,1)',
      },
    );
    particles.set(particle, animation);
    animation.onfinish = () => removeParticle(particle);
  }
  playSound();
  pulse();
}
reduced.addEventListener('change', clearParticles);
