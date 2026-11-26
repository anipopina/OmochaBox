import pump from './assets/pump.mp3?no-inline';
import releaseC from './assets/release-c.mp3?no-inline';
import releaseD from './assets/release-d.mp3?no-inline';
import tapC from './assets/tap-c.mp3?no-inline';
import tapD from './assets/tap-d.mp3?no-inline';
import tapE from './assets/tap-e.mp3?no-inline';
import full from './assets/full.mp3?no-inline';

type Cue = 'pump' | 'release' | 'tap' | 'full';
type SoundUrls = Record<Cue, string | string[] | null>;

let urls: SoundUrls = {
  pump,
  release: [releaseC, releaseD],
  tap: [tapC, tapD, tapE],
  full,
};

export function setSoundPreview(preview: SoundUrls) {
  if (import.meta.env.DEV) urls = preview;
}

const MAX_VOICES = 2;
const MIN_INTERVAL = 0.12;
const GAIN = 0.55;
const PUMP_FADE = 0.045;

export class Sounds {
  private context: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private downloads = new AbortController();
  private voices = new Map<AudioBufferSourceNode, GainNode>();
  private lastPlay = new Map<Cue, number>();
  private pump: { source: AudioBufferSourceNode; gain: AudioParam } | null =
    null;

  constructor() {
    const assets = new Set(
      Object.values(urls)
        .flat()
        .filter((url) => url !== null),
    );
    if (!assets.size) return;
    // Decode ahead of the first gesture without opening a playback context.
    try {
      const decoder = new OfflineAudioContext(1, 1, 32000);
      for (const url of assets) void this.load(url, decoder);
    } catch {
      // The game can be played without Web Audio.
    }
  }

  private async load(url: string, decoder: OfflineAudioContext) {
    const { signal } = this.downloads;
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) return;
      const buffer = await decoder.decodeAudioData(
        await response.arrayBuffer(),
      );
      if (!signal.aborted) this.buffers.set(url, buffer);
    } catch {
      // A failed or canceled cue remains silent.
    }
  }

  unlock() {
    if (document.hidden || !Object.values(urls).some(Boolean)) return;
    try {
      const context = (this.context ??= new AudioContext());
      if (context.state !== 'running') void context.resume().catch(() => {});
    } catch {
      // Audio permission and availability are independent of play.
    }
  }

  play(cue: Cue) {
    const context = this.context;
    if (
      context?.state !== 'running' ||
      document.hidden ||
      this.voices.size >= MAX_VOICES ||
      context.currentTime - (this.lastPlay.get(cue) ?? -Infinity) < MIN_INTERVAL
    )
      return;
    const selected = urls[cue];
    if (!selected) return;
    const buffer = Array.isArray(selected)
      ? this.randomBuffer(selected)
      : this.buffers.get(selected);
    if (!buffer) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const now = context.currentTime;
    if (cue === 'pump') {
      // The air sample has its own envelope. Keep this gain available for early release.
      gain.gain.value = GAIN;
      this.pump = { source, gain: gain.gain };
    } else {
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(
        GAIN,
        now + Math.min(0.005, buffer.duration / 4),
      );
      gain.gain.setValueAtTime(
        GAIN,
        now + Math.max(buffer.duration / 2, buffer.duration - 0.035),
      );
      gain.gain.linearRampToValueAtTime(0, now + buffer.duration);
    }
    source.buffer = buffer;
    source.connect(gain).connect(context.destination);
    this.voices.set(source, gain);
    this.lastPlay.set(cue, now);
    source.onended = () => {
      if (this.pump?.source === source) this.pump = null;
      source.disconnect();
      gain.disconnect();
      this.voices.delete(source);
    };
    source.start();
  }

  private randomBuffer(urls: string[]) {
    const ready = urls.flatMap((url) => {
      const buffer = this.buffers.get(url);
      return buffer ? [buffer] : [];
    });
    return ready[Math.floor(Math.random() * ready.length)];
  }

  stopPump() {
    const pump = this.pump;
    const context = this.context;
    if (!pump || !context) return;
    this.pump = null;
    const now = context.currentTime;
    pump.gain.setValueAtTime(GAIN, now);
    pump.gain.linearRampToValueAtTime(0, now + PUMP_FADE);
    pump.source.stop(now + PUMP_FADE);
  }

  stop() {
    this.pump = null;
    for (const [source, gain] of this.voices) {
      source.onended = null;
      source.stop();
      source.disconnect();
      gain.disconnect();
    }
    this.voices.clear();
    this.lastPlay.clear();
    if (this.context && this.context.state !== 'closed')
      void this.context.suspend().catch(() => {});
  }

  dispose() {
    this.stop();
    this.downloads.abort();
    this.buffers.clear();
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed')
      void context.close().catch(() => {});
  }
}
