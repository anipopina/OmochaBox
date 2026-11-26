/** Owns one page's decoded samples and single active voice. */
export class SamplePlayer<Cue extends string> {
  constructor(
    private readonly urls: Readonly<Record<Cue, string | null>>,
    private readonly gain: number,
  ) {}

  private context: AudioContext | null = null;
  private bus: GainNode | null = null;
  private playing: AudioBufferSourceNode | null = null;
  private buffers = new Map<Cue, AudioBuffer>();
  private pending = new Set<Cue>();
  private download = new AbortController();
  private active = false;

  unlock() {
    if (document.hidden || !Object.values(this.urls).some(Boolean)) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.bus = this.context.createGain();
        this.bus.gain.value = this.gain;
        this.bus.connect(this.context.destination);
      }
      const context = this.context;
      this.active = true;
      void context.resume().catch(() => {});
      this.loadSamples(context);
    } catch {
      this.active = false;
    }
  }

  preload() {
    if (!Object.values(this.urls).some(Boolean)) return;
    try {
      this.loadSamples(new OfflineAudioContext(1, 1, 32000));
    } catch {
      // If offline decoding is unavailable, unlock() can use the live context.
    }
  }

  private loadSamples(context: BaseAudioContext) {
    for (const cue of Object.keys(this.urls) as Cue[]) {
      const url = this.urls[cue];
      if (url && !this.buffers.has(cue) && !this.pending.has(cue))
        void this.load(cue, url, context, this.download.signal);
    }
  }

  private async load(
    cue: Cue,
    url: string,
    context: BaseAudioContext,
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

  play(cue: Cue, rate = 1): boolean {
    const buffer = this.buffers.get(cue);
    if (
      !this.active ||
      document.hidden ||
      this.context?.state !== 'running' ||
      !this.bus ||
      !buffer
    )
      return false;
    this.stopVoice();
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(this.bus);
    source.onended = () => {
      source.disconnect();
      this.playing = null;
    };
    source.start();
    this.playing = source;
    return true;
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
