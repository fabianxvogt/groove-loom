import { buildEventList, clamp, getTimelineEndTick, TRACKS, type Project } from './groove.ts';

const TICKS_PER_QUARTER = 480;

function writeVariableLength(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes: number[] = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}

export function createMidiFile(project: Project): Uint8Array {
  const events = buildEventList(project);
  const messages: { tick: number; data: number[] }[] = [];
  events.forEach((event) => {
    const note = TRACKS.find((track) => track.id === event.trackId)?.midi ?? 36;
    const velocity = Math.round(clamp(event.velocity, 0, 1) * 110);
    messages.push({ tick: event.tick, data: [0x99, note, velocity] });
    messages.push({ tick: event.tick + 72, data: [0x89, note, 0] });
  });
  messages.sort((a, b) => a.tick - b.tick || a.data[0] - b.data[0]);

  const microseconds = Math.round(60000000 / project.bpm);
  const track: number[] = [0, 0xff, 0x51, 3, (microseconds >> 16) & 0xff, (microseconds >> 8) & 0xff, microseconds & 0xff];
  let lastTick = 0;
  messages.forEach((message) => {
    track.push(...writeVariableLength(Math.max(0, message.tick - lastTick)), ...message.data);
    lastTick = message.tick;
  });

  // Keep MIDI's explicit end-of-track at the same shifted origin and duration
  // used by live playback and the WAV renderer.
  track.push(...writeVariableLength(Math.max(0, getTimelineEndTick(project) - lastTick)), 0xff, 0x2f, 0);
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (TICKS_PER_QUARTER >> 8) & 0xff, TICKS_PER_QUARTER & 0xff];
  const trackHeader = [0x4d, 0x54, 0x72, 0x6b, (track.length >> 24) & 0xff, (track.length >> 16) & 0xff, (track.length >> 8) & 0xff, track.length & 0xff];
  return new Uint8Array([...header, ...trackHeader, ...track]);
}
