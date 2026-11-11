import type { Playback } from './catalogue';
/** One transport owns every node and scheduled repeat. No playback survives stop. */
export class ReviewPlayer {
  private context: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private sources = new Set<AudioBufferSourceNode>();
  private nodes = new Map<AudioBufferSourceNode, GainNode>();
  private downloads = new AbortController();
  private generation = 0;
  constructor(
    private update: (message: string, candidate: string | null) => void,
    private playback: Playback,
  ) {}

  async play(
    id: string,
    url: string,
    name: string,
    count: number,
    interval: number,
  ) {
    this.stop();
    const generation = this.generation;
    this.update(`${name}を準備しています…`, id);
    try {
      const context = (this.context ??= new AudioContext());
      // Resume while still handling the click; loading must not consume activation.
      const resumed = context.resume().then(
        () => true,
        () => false,
      );
      let buffer = this.buffers.get(id);
      if (!buffer) {
        const response = await fetch(url, { signal: this.downloads.signal });
        if (!response.ok) throw new Error('fetch');
        buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (this.context === context) this.buffers.set(id, buffer);
      }
      if (!(await resumed)) throw new Error('resume');
      if (generation !== this.generation || document.hidden) return;
      const now = context.currentTime;
      this.update(
        `${name}を${count === 1 ? '再生しています' : '3回再生しています'}。`,
        id,
      );
      for (let i = 0; i < count; i++) {
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        const start = now + i * interval;
        // Match the game's master gain and short playback envelope.
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(
          this.playback.gain,
          start + Math.min(this.playback.attack, buffer.duration / 4),
        );
        gain.gain.setValueAtTime(
          this.playback.gain,
          start +
            Math.max(
              buffer.duration / 2,
              buffer.duration - this.playback.release,
            ),
        );
        gain.gain.linearRampToValueAtTime(0, start + buffer.duration);
        source.connect(gain).connect(context.destination);
        this.sources.add(source);
        this.nodes.set(source, gain);
        source.onended = () => {
          source.disconnect();
          gain.disconnect();
          this.sources.delete(source);
          this.nodes.delete(source);
          if (!this.sources.size && generation === this.generation) {
            this.update('再生が終わりました。', null);
            void context.suspend().catch(() => {});
          }
        };
        source.start(start);
      }
    } catch {
      if (generation !== this.generation) return;
      this.stop();
      this.update(
        '音を再生できませんでした。もう一度押してお試しください。',
        null,
      );
    }
  }

  stop() {
    this.generation++;
    this.downloads.abort();
    this.downloads = new AbortController();
    for (const source of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
      this.nodes.get(source)?.disconnect();
    }
    this.sources.clear();
    this.nodes.clear();
    if (this.context) void this.context.suspend().catch(() => {});
    this.update('再生を止めました。', null);
  }

  dispose() {
    this.stop();
    const context = this.context;
    this.context = null;
    this.buffers.clear();
    if (context) void context.close().catch(() => {});
  }
}
