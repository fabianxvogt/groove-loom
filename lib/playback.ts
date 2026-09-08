import type { ScheduledEvent } from './groove.ts';

export function noiseAt(index: number, seed: number): number {
  const x = Math.sin((index + seed * 97.3) * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export type PlaybackPass = { startAt: number; stop(): void; setMuted(muted: boolean): void };

/** Own every voice in one pass, including sources scheduled in the future. */
export function schedulePlayback(audio: BaseAudioContext, events: ScheduledEvent[], seed: number, muted: boolean): PlaybackPass {
  const bus = audio.createGain();
  const nodes = new Set<AudioNode>([bus]);
  const sources = new Set<AudioScheduledSourceNode>();
  let stopped = false;
  const pass: PlaybackPass = {
    startAt: audio.currentTime + 0.08,
    setMuted(value) {
      if (!stopped) bus.gain.setValueAtTime(value ? 0 : 1, audio.currentTime);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      bus.gain.setValueAtTime(0, audio.currentTime);
      bus.disconnect();
      for (const source of sources) {
        source.onended = null;
        // A partially constructed voice may not have started yet.
        try { source.stop(); } catch { /* Disconnecting still silences it. */ }
      }
      for (const node of nodes) node.disconnect();
      sources.clear(); nodes.clear();
    },
  };
  try {
    pass.setMuted(muted);
    bus.connect(audio.destination);
    const startAt = pass.startAt;
    for (const event of events) {
      const at = startAt + event.time;
      const output = audio.createGain(); nodes.add(output);
      output.gain.setValueAtTime(Math.min(0.22, 0.06 + event.velocity * 0.16), at);
      output.gain.exponentialRampToValueAtTime(0.001, at + (event.trackId === 'hat' ? 0.06 : event.trackId === 'kick' ? 0.38 : 0.18));
      output.connect(bus);
      let source: AudioScheduledSourceNode;
      const voiceNodes: AudioNode[] = [output];
      if (event.trackId === 'kick' || event.trackId === 'tom') {
        const oscillator = audio.createOscillator(); nodes.add(oscillator); sources.add(oscillator);
        source = oscillator;
        oscillator.type = event.trackId === 'kick' ? 'sine' : 'triangle';
        oscillator.frequency.setValueAtTime(event.trackId === 'kick' ? 130 : 180 + event.velocity * 60, at);
        oscillator.frequency.exponentialRampToValueAtTime(event.trackId === 'kick' ? 44 : 92, at + 0.14);
        oscillator.connect(output);
      } else {
        const noise = audio.createBufferSource(); nodes.add(noise); sources.add(noise);
        source = noise;
        const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.2), audio.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = noiseAt(i + event.absoluteStep * 13, seed);
        noise.buffer = buffer;
        const filter = audio.createBiquadFilter(); nodes.add(filter); voiceNodes.push(filter);
        filter.type = event.trackId === 'hat' ? 'highpass' : 'bandpass';
        filter.frequency.value = event.trackId === 'hat' ? 6200 : 1600;
        noise.connect(filter); filter.connect(output);
      }
      voiceNodes.push(source);
      source.onended = () => {
        for (const node of voiceNodes) { node.disconnect(); nodes.delete(node); }
        sources.delete(source); source.onended = null;
      };
      source.start(at);
      source.stop(at + (event.trackId === 'kick' || event.trackId === 'tom' ? 0.42 : 0.2));
    }
    return pass;
  } catch (error) {
    pass.stop();
    throw error;
  }
}

/** Cancellation also invalidates a pending browser permission/resume promise. */
export class PlaybackTransport {
  private generation = 0;
  private pass: PlaybackPass | null = null;
  private pending = false;
  private muted = false;

  get active(): boolean { return this.pending || this.pass !== null; }

  setMuted(value: boolean): void { this.muted = value; this.pass?.setMuted(value); }

  stop(): void {
    this.generation += 1;
    this.pending = false;
    this.pass?.stop(); this.pass = null;
  }

  async start(getAudio: () => Promise<AudioContext>, events: ScheduledEvent[], seed: number): Promise<{ audio: AudioContext; startAt: number } | null> {
    this.stop();
    const generation = this.generation;
    this.pending = true;
    try {
      const audio = await getAudio();
      if (generation !== this.generation) return null;
      this.pass = schedulePlayback(audio, events, seed, this.muted);
      this.pending = false;
      return { audio, startAt: this.pass.startAt };
    } catch (error) {
      if (generation !== this.generation) return null;
      this.pending = false;
      throw error;
    }
  }
}
