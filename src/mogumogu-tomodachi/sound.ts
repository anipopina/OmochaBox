import chewUrl from './assets/chew.mp3?no-inline';
import gulpUrl from './assets/gulp.mp3?no-inline';

type Cue = 'chew' | 'gulp' | 'arrival';

const urls: Record<Cue, string | null> = {
  chew: chewUrl,
  gulp: gulpUrl,
  arrival: null,
};
const gain = 0.55;

export function setSoundPreview(preview: Record<Cue, string | null>) {
  if (import.meta.env.DEV) Object.assign(urls, preview);
}

export class MealSound {
  private context: AudioContext | null = null;
  private bus: GainNode | null = null;
  private playing: AudioBufferSourceNode | null = null;
  private buffers = new Map<Cue, AudioBuffer>();
  private pending = new Set<Cue>();
  private download = new AbortController();
  private active = false;

  unlock() {
    if (document.hidden || !Object.values(urls).some(Boolean)) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.bus = this.context.createGain();
        this.bus.gain.value = gain;
        this.bus.connect(this.context.destination);
      }
      const context = this.context;
      this.active = true;
      void context.resume().catch(() => {});
      for (const cue of Object.keys(urls) as Cue[]) {
        const url = urls[cue];
        if (url && !this.buffers.has(cue) && !this.pending.has(cue))
          void this.load(cue, url, context, this.download.signal);
      }
    } catch {
      this.active = false;
    }
  }

  private async load(
    cue: Cue,
    url: string,
    context: AudioContext,
    signal: AbortSignal,
  ) {
    this.pending.add(cue);
    try {
      const response = await fetch(url, { signal });
      if (!response.ok || signal.aborted) return;
      const buffer = await context.decodeAudioData(
        await response.arrayBuffer(),
      );
      if (!signal.aborted) this.buffers.set(cue, buffer);
    } catch {
      // 再生が間に合わなかった場面は後から鳴らさない。
    } finally {
      if (!signal.aborted) this.pending.delete(cue);
    }
  }

  play(cue: Cue) {
    const buffer = this.buffers.get(cue);
    if (
      !this.active ||
      document.hidden ||
      this.context?.state !== 'running' ||
      !this.bus ||
      !buffer
    )
      return;
    this.stopVoice();
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.bus);
    source.onended = () => {
      source.disconnect();
      this.playing = null;
    };
    source.start();
    this.playing = source;
  }

  private stopVoice() {
    const source = this.playing;
    if (!source) return;
    source.onended = null;
    source.stop();
    source.disconnect();
    this.playing = null;
  }

  stop() {
    this.active = false;
    this.stopVoice();
    if (this.context) void this.context.suspend().catch(() => {});
  }

  dispose() {
    this.stop();
    this.download.abort();
    this.download = new AbortController();
    this.pending.clear();
    this.buffers.clear();
    this.bus?.disconnect();
    if (this.context) void this.context.close().catch(() => {});
    this.bus = this.context = null;
  }
}
