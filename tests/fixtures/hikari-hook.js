// Injected into the drawing game closure only for the test build.
const audioEvents = [];
const originalSound = sound;
sound = (...args) => {
  const before = lastSound;
  originalSound(...args);
  if (before !== lastSound) {
    audioEvents.push({
      time: lastSound,
      kind: args[1] || 'flower',
      peak: args[1] === 'sparkle' ? sparkleGain(args[2]) : 0.24,
    });
    if (audioEvents.length > 500) audioEvents.shift();
  }
};
const originalPlaySample = playSample;
playSample = (...args) => {
  const before = nextSampleAt;
  originalPlaySample(...args);
  if (before !== nextSampleAt) {
    audioEvents.push({
      time: args[0],
      kind: 'sample',
      peak: sparkleGain(args[1]),
    });
    if (audioEvents.length > 500) audioEvents.shift();
  }
};
window.__test = {
  snapshot: () => ({
    points: points.length,
    particles: particles.length,
    flowers: flowers.length,
    fingers: fingers.size,
    voices: voices.size,
    samples: [...voices]
      .filter((v) => v.kind === 'sample')
      .map((v) => ({
        peak: v.peak,
        fading: v.fading,
        bufferMatch: v.osc.buffer === sampleBuffer,
      })),
    sampleStatus,
    sampleDuration: sampleBuffer?.duration,
    raf,
    audio: audio?.state,
    width,
    height,
    released: flowers.map((f) => f.released),
    radii: flowers.map((f) => f.radius),
    charges: [...fingers.values()].map((p) => chargeAt(p, performance.now())),
    peaks: [...fingers.values()].map((p) => p.peakTime),
    notes: audioEvents.slice(),
    masterGain: master?.gain.value,
    compressorRatio: compressor?.ratio.value,
    newestParticle: Math.max(0, ...particles.map((p) => p.time)),
    pixels: canvas.width * canvas.height,
  }),
  clear: reset,
  hold: (id, ms) => {
    fingers.get(id).time = performance.now() - ms;
  },
  curve: (ms) => ({
    charge: chargeAt({ time: 0 }, ms),
    radius: flowerRadius(chargeAt({ time: 0 }, ms)),
    sparkle: sparkleGain(chargeAt({ time: 0 }, ms)),
    scale: sceneScale(),
  }),
  age: (ms) => {
    for (const list of [points, flowers, particles])
      for (const p of list) p.time -= ms;
    wake();
  },
};
window.__test.layerScene = () => {
  reset();
  const now = performance.now(),
    time = now - 500;
  push(points, LIMIT, {
    sx: 130,
    sy: 150,
    x: 260,
    y: 150,
    color: 0,
    time,
    grain: 0,
  });
  push(points, LIMIT, {
    sx: 200,
    sy: 90,
    x: 200,
    y: 220,
    color: 1,
    time,
    grain: 0,
  });
  push(flowers, FLOWERS, {
    x: 400,
    y: 200,
    color: 0,
    time,
    radius: 55,
    released: 0,
  });
  push(flowers, FLOWERS, {
    x: 400,
    y: 200,
    color: 2,
    time,
    radius: 55,
    released: 0,
  });
  push(flowers, FLOWERS, {
    x: 600,
    y: 200,
    color: 0,
    time,
    radius: 55,
    released: 0,
  });
  push(points, LIMIT, {
    sx: 540,
    sy: 160,
    x: 670,
    y: 160,
    color: 1,
    time: now,
    grain: 0,
  });
  draw(now);
  const scale = ctx.getTransform().a;
  return [
    [200, 150],
    [400, 160],
    [600, 160],
  ].map(([x, y]) => [
    ...ctx.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1)
      .data,
  ]);
};
