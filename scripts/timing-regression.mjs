import assert from 'node:assert/strict';
import { buildEventList, createDefaultProject, getTimelineDurationSeconds, getTimelineEndTick } from '../lib/groove.ts';
import { createMidiFile } from '../lib/midi.ts';

function readVariableLength(bytes, state) {
  let value = 0;
  let byte;
  do {
    byte = bytes[state.index++];
    value = (value << 7) | (byte & 0x7f);
  } while (byte & 0x80);
  return value;
}

function parseMidiNoteOns(bytes) {
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'MThd');
  assert.equal((bytes[8] << 8) | bytes[9], 0);
  assert.equal((bytes[10] << 8) | bytes[11], 1);
  assert.equal((bytes[12] << 8) | bytes[13], 480);
  assert.equal(String.fromCharCode(...bytes.slice(14, 18)), 'MTrk');
  const trackLength = bytes[18] * 0x1000000 + (bytes[19] << 16) + (bytes[20] << 8) + bytes[21];
  const state = { index: 22 };
  const end = state.index + trackLength;
  let absoluteTick = 0;
  let runningStatus = 0;
  const noteOns = [];
  let endOfTrackTick = null;
  while (state.index < end) {
    absoluteTick += readVariableLength(bytes, state);
    let status = bytes[state.index++];
    if (status < 0x80) {
      state.index -= 1;
      status = runningStatus;
    } else {
      runningStatus = status;
    }
    if (status === 0xff) {
      const type = bytes[state.index++];
      const length = readVariableLength(bytes, state);
      if (type === 0x2f) endOfTrackTick = absoluteTick;
      state.index += length;
      continue;
    }
    const dataLength = (status & 0xe0) === 0xc0 ? 1 : 2;
    const note = bytes[state.index++];
    const velocity = bytes[state.index++];
    if ((status & 0xf0) === 0x90 && velocity > 0) noteOns.push({ tick: absoluteTick, note });
    if (dataLength === 1) state.index -= 1;
  }
  return { noteOns, endOfTrackTick };
}

const project = createDefaultProject();
project.chain = ['A'];
for (const steps of Object.values(project.patterns.A)) {
  if (Array.isArray(steps)) steps.forEach((step) => { step.active = false; });
}
project.patterns.A.kick[0] = { active: true, velocity: 1, probability: 1, offset: -24 };
project.patterns.A.kick[1] = { active: true, velocity: 1, probability: 1, offset: 24 };

const events = buildEventList(project);
assert.deepEqual(events.map((event) => event.tick), [0, 168], 'negative step-0 offset must be preserved at shifted origin');
assert.equal(events[0].offset, -24);
assert.equal(events[0].time, 0, 'pre-roll must make the earliest event playable at time zero');
assert.ok(getTimelineDurationSeconds(project) > events.at(-1).time);

const parsed = parseMidiNoteOns(createMidiFile(project));
assert.deepEqual(parsed.noteOns.map((event) => event.tick), [0, 168], 'MIDI must preserve the shifted event ticks');
assert.equal(parsed.endOfTrackTick, getTimelineEndTick(project), 'MIDI duration must match the shared timeline end');

console.log('timing regression passed: negative step-0 offset, MIDI parse, and shared timeline end');
