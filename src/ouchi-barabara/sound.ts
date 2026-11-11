import hitUrl from './assets/hit.mp3';
import collapseUrl from './assets/collapse.mp3';
import rubbleUrl from './assets/rubble.mp3';
import driveUrl from './assets/drive.mp3';

export type Cue = 'hit' | 'collapse' | 'rubble' | 'drive' | 'crumble';
const URLS: Record<Cue, string | null> = {
  hit: hitUrl,
  collapse: collapseUrl,
  rubble: rubbleUrl,
  drive: driveUrl,
  // Repeated intermediate collapses were deliberately not adopted.
  crumble: null,
};

/** Development preview is configured before the game module is loaded. */
export function setSoundPreview(urls: Record<Cue, string | null>) {
  if (import.meta.env.DEV) Object.assign(URLS, urls);
}

// Development previews can layer an intermediate collapse over the next swing.
const MAX_VOICES = 3;
const MIN_INTERVAL = 0.12;
const MASTER_GAIN = 0.6;
const RETRY_DELAY_MS = 5000;

/** One page owns the context, decoded samples and all currently playing nodes. */
export class Sounds {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<Cue, AudioBuffer>();
  private loading = new Map<Cue, Promise<void>>();
  private retryAt = new Map<Cue, number>();
  private downloads = new AbortController();
  private voices = new Map<AudioBufferSourceNode, GainNode>();
  private enabled = false;
  private ready = false;
  private generation = 0;
  private lastPlay = new Map<Cue, number>();

  /** Call directly from a gesture; completion never replays an old request. */
  unlock() {
    this.enabled = true;
    const generation = ++this.generation;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = MASTER_GAIN;
        this.master.connect(this.context.destination);
      }
      const context = this.context;
      this.ready = context.state === 'running';
      // Always queue resume, even if suspend from the previous stop is pending.
      void context.resume().then(
        () => {
          if (generation !== this.generation || !this.enabled) return;
          this.ready = !document.hidden && context.state === 'running';
          if (document.hidden) this.stop();
        },
        () => {
          if (generation === this.generation) this.ready = false;
        },
      );
      for (const cue of Object.keys(URLS) as Cue[]) this.load(cue, context);
    } catch {
      this.ready = false;
    }
  }

  private load(cue: Cue, context: AudioContext) {
    const url = URLS[cue];
    if (
      !url ||
      this.buffers.has(cue) ||
      this.loading.has(cue) ||
      performance.now() < (this.retryAt.get(cue) ?? 0)
    )
      return;
    const loading = (async () => {
      try {
        const response = await fetch(url, {
          signal: this.downloads.signal,
        });
        if (!response.ok) throw new Error('Sound unavailable');
        const buffer = await context.decodeAudioData(
          await response.arrayBuffer(),
        );
        // A closed context belongs to a previous page lifecycle.
        if (this.context === context) {
          this.buffers.set(cue, buffer);
          this.retryAt.delete(cue);
        }
      } catch {
        // A later gesture may retry. Visual play never waits for sound.
        if (this.context === context)
          this.retryAt.set(cue, performance.now() + RETRY_DELAY_MS);
      }
    })();
    this.loading.set(cue, loading);
    void loading.then(() => {
      if (this.loading.get(cue) === loading) this.loading.delete(cue);
    });
  }

  play(cue: Cue) {
    const context = this.context;
    const buffer = this.buffers.get(cue);
    if (
      !context ||
      !this.master ||
      !buffer ||
      !this.enabled ||
      !this.ready ||
      document.hidden ||
      context.state !== 'running' ||
      context.currentTime - (this.lastPlay.get(cue) ?? -Infinity) <
        MIN_INTERVAL ||
      this.voices.size >= MAX_VOICES
    )
      return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    const duration = buffer.duration;
    const now = context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + Math.min(0.008, duration / 4));
    gain.gain.setValueAtTime(1, now + Math.max(duration / 2, duration - 0.06));
    gain.gain.linearRampToValueAtTime(0, now + duration);
    source.connect(gain).connect(this.master);
    this.voices.set(source, gain);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.voices.delete(source);
    };
    this.lastPlay.set(cue, now);
    source.start();
  }

  /** Stop driving exactly at arrival, including the shorter reduced-motion trip. */
  stopDrive() {
    const buffer = this.buffers.get('drive');
    const context = this.context;
    if (!context) return;
    for (const [source, gain] of this.voices)
      if (source.buffer === buffer) {
        const now = context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.04);
        source.stop(now + 0.04);
      }
  }

  stop() {
    this.enabled = false;
    this.ready = false;
    this.generation++;
    this.lastPlay.clear();
    for (const [source, gain] of this.voices) {
      source.onended = null;
      source.stop();
      source.disconnect();
      gain.disconnect();
    }
    this.voices.clear();
    if (this.context && this.context.state !== 'closed')
      void this.context.suspend().catch(() => {});
  }

  dispose() {
    this.stop();
    this.downloads.abort();
    this.downloads = new AbortController();
    const context = this.context;
    this.context = null;
    this.master?.disconnect();
    this.master = null;
    this.buffers.clear();
    this.loading.clear();
    this.retryAt.clear();
    if (context && context.state !== 'closed')
      void context.close().catch(() => {});
  }
}
