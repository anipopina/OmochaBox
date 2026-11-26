import tap from './assets/tap.mp3?no-inline';

let tapUrl: string | null = tap;

export function setSoundPreview(preview: { tap: string | null }) {
  if (import.meta.env.DEV) tapUrl = preview.tap;
}

const GAIN = 0.825;
const MIN_INTERVAL = 0.13;
const MAX_VOICES = 2;
const MIN_RATE = 0.88;
const MAX_RATE = 1.05;
const MIN_DRAG_INTERVAL = 0.8;
const DRAG_INTERVAL_VARIATION = 0.4;

export class PondSound {
  private context: AudioContext | null = null;
  private sample: AudioBuffer | null = null;
  private download = new AbortController();
  private voices = new Map<AudioBufferSourceNode, GainNode>();
  private lastPlayed = -Infinity;
  private nextDrag = -Infinity;

  constructor() {
    if (tapUrl) void this.preload(tapUrl);
  }

  private async preload(url: string) {
    const { signal } = this.download;
    try {
      const decoder = new OfflineAudioContext(1, 1, 32000);
      const response = await fetch(url, { signal });
      if (!response.ok) return;
      const sample = await decoder.decodeAudioData(
        await response.arrayBuffer(),
      );
      if (!signal.aborted) this.sample = sample;
    } catch {
      // A failed sample leaves the visual response available.
    }
  }

  get needsTouchActivation() {
    return this.sample !== null && this.context?.state !== 'running';
  }

  activate() {
    if (!this.needsTouchActivation || document.hidden) return;
    try {
      const context = (this.context ??= new AudioContext());
      // Resuming never queues a sound for an earlier gesture.
      if (context.state !== 'running') void context.resume().catch(() => {});
    } catch {
      // Web Audio availability is independent of play.
    }
  }

  play(fromDrag = false) {
    const sample = this.sample;
    if (!sample || document.hidden) return;
    if (!fromDrag) this.activate();
    const context = this.context;
    if (!context || context.state !== 'running') return;
    try {
      const now = context.currentTime;
      if (
        this.voices.size >= MAX_VOICES ||
        now - this.lastPlayed < MIN_INTERVAL ||
        (fromDrag && now < this.nextDrag)
      )
        return;
      const source = context.createBufferSource();
      const rate = MIN_RATE + Math.random() * (MAX_RATE - MIN_RATE);
      const duration = sample.duration / rate;
      source.playbackRate.value = rate;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(
        GAIN,
        now + Math.min(0.005, duration / 4),
      );
      gain.gain.setValueAtTime(
        GAIN,
        now + Math.max(duration / 2, duration - 0.03),
      );
      gain.gain.linearRampToValueAtTime(0, now + duration);
      source.buffer = sample;
      source.connect(gain).connect(context.destination);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        this.voices.delete(source);
      };
      source.start();
      this.voices.set(source, gain);
      this.lastPlayed = now;
      this.nextDrag =
        now + MIN_DRAG_INTERVAL + Math.random() * DRAG_INTERVAL_VARIATION;
    } catch {
      // Web Audio permission and availability are independent of play.
    }
  }

  stop() {
    for (const [source, gain] of this.voices) {
      source.onended = null;
      source.stop();
      source.disconnect();
      gain.disconnect();
    }
    this.voices.clear();
    this.lastPlayed = -Infinity;
    this.nextDrag = -Infinity;
    const context = this.context;
    if (context && context.state !== 'closed')
      void context.suspend().catch(() => {});
  }

  dispose() {
    this.stop();
    this.download.abort();
    this.sample = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed')
      void context.close().catch(() => {});
  }
}
