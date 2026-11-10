import '../shared/home-button';
import woodUrl from './assets/wood.webp';
import { layout, nearest, progress, GAP, FALL, type Point } from './model';

const canvas = document.querySelector<HTMLCanvasElement>('#domino')!;
const ctx = canvas.getContext('2d')!;
const reset = document.querySelector<HTMLButtonElement>('#reset')!;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const wood = new Image();
wood.src = woodUrl;
const colors = ['#ed5c38', '#f4b529', '#1597ac', '#36a364'];
let points: Point[] = [],
  width = 0,
  height = 0,
  size = 70;
let variation = 0,
  selected = 0,
  start = -1,
  elapsed = 0,
  last = 0,
  frame = 0;
let state: 'ready' | 'falling' | 'done' | 'paused' = 'ready';
let audio: AudioContext | undefined;
let sounded = -1;
const voices = new Set<OscillatorNode>();
function stopSound() {
  for (const voice of voices) {
    voice.stop();
    voice.disconnect();
  }
  voices.clear();
  if (audio?.state === 'running') void audio.suspend().catch(() => {});
}
function sound(index: number) {
  if (!audio || audio.state !== 'running') return;
  const tone = audio.createOscillator(),
    gain = audio.createGain();
  tone.type = 'sine';
  tone.frequency.setValueAtTime(410 + (index % 4) * 38, audio.currentTime);
  tone.frequency.exponentialRampToValueAtTime(180, audio.currentTime + 0.07);
  gain.gain.setValueAtTime(0.055, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.1);
  tone.connect(gain);
  gain.connect(audio.destination);
  voices.add(tone);
  tone.onended = () => {
    voices.delete(tone);
    tone.disconnect();
    gain.disconnect();
  };
  tone.start();
  tone.stop(audio.currentTime + 0.11);
}
function polygon(vertices: Point[], fill: string) {
  ctx.beginPath();
  vertices.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function draw() {
  ctx.clearRect(0, 0, width, height);
  // The dotted route makes the wraparound neighbour relationship visible.
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.strokeStyle = '#c4a16b';
  ctx.lineWidth = 3;
  ctx.setLineDash([2, 12]);
  ctx.stroke();
  ctx.setLineDash([]);
  points
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.y - b.p.y)
    .forEach(({ p, i }) => {
      const value = start < 0 ? 0 : progress(i, start, points.length, elapsed);
      const t = reduced.matches ? (value >= 0.55 ? 1 : 0) : value;
      const angle = (t * Math.PI) / 2,
        next = points[(i + 1) % points.length]!;
      const distance = Math.hypot(next.x - p.x, next.y - p.y);
      const reach = distance * 0.98;
      const dx = ((next.x - p.x) / distance) * reach * Math.sin(angle);
      const dy =
        ((next.y - p.y) / distance) * reach * Math.sin(angle) -
        size * Math.cos(angle);
      const w = size * 0.48,
        thickness = size * 0.15;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = '#714b2827';
      ctx.beginPath();
      ctx.ellipse(
        dx * 0.45 + 6,
        8 + dy * 0.12,
        w * 0.8 + Math.abs(dx) * 0.35,
        12 + Math.abs(dy) * 0.08,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      const b = { x: w / 2, y: 0 },
        c = { x: w / 2 + dx, y: dy },
        d = { x: -w / 2 + dx, y: dy };
      polygon(
        [
          b,
          { x: b.x + thickness, y: b.y - thickness * 0.45 },
          { x: c.x + thickness, y: c.y - thickness * 0.45 },
          c,
        ],
        '#9d561f',
      );
      polygon(
        [
          d,
          c,
          { x: c.x + thickness, y: c.y - thickness * 0.45 },
          { x: d.x + thickness, y: d.y - thickness * 0.45 },
        ],
        '#ffd987',
      );
      // Let the face pass continuously through edge-on; the solid sides remain visible.
      ctx.save();
      ctx.transform(1, 0, -dx / size, -dy / size, -w / 2, 0);
      ctx.beginPath();
      ctx.roundRect(0, -size, w, size, 6);
      ctx.clip();
      ctx.fillStyle = colors[(i + variation) % colors.length]!;
      ctx.fillRect(0, -size, w, size);
      if (wood.complete && wood.naturalWidth) {
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.65;
        ctx.drawImage(wood, 0, -size, w, size);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      const shine = ctx.createLinearGradient(0, 0, w, 0);
      shine.addColorStop(0, '#ffffff60');
      shine.addColorStop(0.16, '#ffffff00');
      shine.addColorStop(0.85, '#00000000');
      shine.addColorStop(1, '#71320e44');
      ctx.fillStyle = shine;
      ctx.fillRect(0, -size, w, size);
      ctx.fillStyle = '#fff4c8';
      ctx.strokeStyle = '#7d4c2222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const cx = w / 2,
        cy = -size * 0.56,
        r = w * 0.27;
      if (i % 3 === 0) ctx.arc(cx, cy, r, 0, Math.PI * 2);
      else {
        const n = i % 3 === 1 ? 10 : 12;
        for (let j = 0; j < n; j++) {
          const rad = j % 2 ? r * 0.52 : r;
          const a = -Math.PI / 2 + (j * Math.PI * 2) / n;
          const x = cx + Math.cos(a) * rad,
            y = cy + Math.sin(a) * rad;
          if (j) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (i === selected && document.activeElement === canvas) {
        ctx.strokeStyle = '#176a79';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(0, 7, w * 0.8, 16, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    });
  canvas.dataset.state = state;
  canvas.dataset.fallen = String(
    points.filter(
      (_, i) => start >= 0 && progress(i, start, points.length, elapsed) >= 1,
    ).length,
  );
  canvas.dataset.count = String(points.length);
}
function tick(now: number) {
  frame = 0;
  if (state !== 'falling') return;
  elapsed += Math.min(40, now - last);
  last = now;
  const current = Math.min(points.length - 1, Math.floor(elapsed / GAP));
  if (current > sounded) {
    sound(current);
    sounded = current;
  }
  if (elapsed >= (points.length - 1) * GAP + FALL) {
    state = 'done';
    stopSound();
  }
  draw();
  if (state === 'falling') frame = requestAnimationFrame(tick);
}
function stop() {
  cancelAnimationFrame(frame);
  frame = 0;
  stopSound();
  if (state === 'falling') state = 'paused';
  draw();
}
function fresh() {
  stop();
  variation++;
  start = -1;
  elapsed = 0;
  state = 'ready';
  points = layout(width, height, variation);
  draw();
}
function begin(index: number) {
  if (document.hidden || state === 'falling') return;
  if (state === 'done' || state === 'paused') fresh();
  selected = index;
  start = index;
  elapsed = 0;
  sounded = -1;
  state = 'falling';
  last = performance.now();
  try {
    audio ??= new AudioContext();
    void audio
      .resume()
      .then(() => {
        if (document.hidden || state !== 'falling') stopSound();
      })
      .catch(() => {});
  } catch {
    /* Silent play remains available. */
  }
  draw();
  frame = requestAnimationFrame(tick);
}
function resize() {
  stop();
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  const scale = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  size = Math.max(58, Math.min(115, width * 0.18, (height - 90) * 0.22));
  points = layout(width, height, variation);
  selected = Math.min(selected, points.length - 1);
  start = -1;
  elapsed = 0;
  state = 'ready';
  draw();
}
canvas.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  event.preventDefault();

  const box = canvas.getBoundingClientRect();
  begin(
    nearest(
      points,
      event.clientX - box.left,
      event.clientY - box.top + size * 0.4,
    ),
  );
});
canvas.addEventListener('click', (event) => {
  if (event.detail === 0) begin(selected);
});
canvas.addEventListener('keydown', (event) => {
  if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    selected =
      (selected +
        (event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : points.length - 1)) %
      points.length;
    draw();
  }
  if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
    event.preventDefault();
    begin(selected);
  }
});
canvas.addEventListener('focus', draw);
canvas.addEventListener('blur', draw);
reset.addEventListener('click', fresh);
window.addEventListener('resize', resize);
window.addEventListener('blur', stop);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
window.addEventListener('pagehide', () => {
  stop();
  if (audio) {
    void audio.close().catch(() => {});
    audio = undefined;
  }
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) resize();
});
reduced.addEventListener('change', draw);
wood.addEventListener('load', draw);
resize();
canvas.dataset.ready = 'true';
