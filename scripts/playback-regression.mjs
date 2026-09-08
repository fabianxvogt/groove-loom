import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEventList, createDefaultProject } from '../lib/groove.ts';
import { PlaybackTransport, schedulePlayback } from '../lib/playback.ts';

function fakeAudio({ failAtSource = Infinity } = {}) {
  const nodes = [], sources = [];
  const param = () => ({ value: 0, values: [], setValueAtTime(value, time) { this.value = value; this.values.push([value, time]); }, exponentialRampToValueAtTime() {} });
  const node = (kind) => {
    const value = { kind, connections: [], disconnected: false, connect(to) { this.connections.push(to); }, disconnect() { this.disconnected = true; this.connections = []; }, gain: param(), frequency: param() };
    nodes.push(value); return value;
  };
  const source = (kind) => {
    if (sources.length === failAtSource) throw new Error('Synthetic allocation failure');
    const value = Object.assign(node(kind), { starts: [], stops: [], onended: null, start(at) { this.starts.push(at); }, stop(at = 0) { this.stops.push(at); } });
    sources.push(value); return value;
  };
  return { nodes, sources, currentTime: 10, sampleRate: 1000, destination: {},
    createGain: () => node('gain'), createOscillator: () => source('oscillator'), createBufferSource: () => source('noise'), createBiquadFilter: () => node('filter'),
    createBuffer: (_, length) => ({ getChannelData: () => new Float32Array(length) }),
  };
}
const project = createDefaultProject();
const events = buildEventList(project);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('one pass preserves every scheduled hit and stops all current/future voices', () => {
  const audio = fakeAudio();
  const pass = schedulePlayback(audio, events, project.seed, false);
  assert.equal(audio.sources.length, events.length);
  audio.sources.forEach((source, i) => assert.equal(source.starts[0], 10.08 + events[i].time));
  assert.ok(audio.sources.some(source => source.starts[0] > 20));
  const bus = audio.nodes[0];
  assert.equal(bus.gain.value, 1);
  pass.stop();
  assert.equal(bus.gain.value, 0);
  assert.ok(audio.sources.every(source => source.stops.at(-1) === 0));
  assert.ok(audio.nodes.every(node => node.disconnected));
  pass.stop(); pass.setMuted(false);
  assert.equal(bus.gain.value, 0);
  assert.ok(audio.sources.every(source => source.stops.length === 2));
});

test('mute/unmute changes a scheduled pass without dropping future hits', () => {
  const audio = fakeAudio();
  const pass = schedulePlayback(audio, events, project.seed, true);
  assert.equal(audio.sources.length, events.length);
  assert.equal(audio.nodes[0].gain.value, 0);
  audio.currentTime = 11; pass.setMuted(false);
  assert.deepEqual(audio.nodes[0].gain.values.at(-1), [1, 11]);
  audio.currentTime = 12; pass.setMuted(true);
  assert.deepEqual(audio.nodes[0].gain.values.at(-1), [0, 12]);
  assert.ok(audio.sources.every(source => source.stops.length === 1));
  pass.stop();
});

test('finished voices release nodes and are not stopped twice', () => {
  const audio = fakeAudio(); const pass = schedulePlayback(audio, events.slice(0, 2), project.seed, false);
  const source = audio.sources[0]; source.onended();
  assert.equal(source.disconnected, true); assert.equal(source.onended, null);
  pass.stop(); assert.equal(source.stops.length, 1);
  assert.ok(audio.nodes.every(node => node.disconnected));
});

test('partial scheduling failure disconnects every node already allocated', () => {
  const audio = fakeAudio({ failAtSource: 3 });
  assert.throws(() => schedulePlayback(audio, events, project.seed, false), /allocation failure/);
  assert.ok(audio.nodes.every(node => node.disconnected));
  assert.ok(audio.sources.every(source => source.stops.at(-1) === 0));
});

test('Stop while browser audio is resuming cannot start a late pass', async () => {
  const audio = fakeAudio(), resume = deferred(), transport = new PlaybackTransport();
  const start = transport.start(() => resume.promise, events, project.seed);
  assert.equal(transport.active, true);
  transport.stop(); resume.resolve(audio);
  assert.equal(await start, null); assert.equal(transport.active, false);
  assert.equal(audio.sources.length, 0);
});

test('a newer start supersedes an older resume and only the newest pass plays', async () => {
  const audio = fakeAudio(), oldResume = deferred(), transport = new PlaybackTransport();
  const oldStart = transport.start(() => oldResume.promise, events, project.seed);
  assert.deepEqual(await transport.start(async () => audio, events, project.seed), { audio, startAt: 10.08 });
  oldResume.resolve(audio); assert.equal(await oldStart, null);
  assert.equal(audio.sources.length, events.length); assert.equal(transport.active, true);
  transport.stop(); assert.ok(audio.nodes.every(node => node.disconnected));
});

test('late resume failure is ignored after cancellation; current failure allows retry', async () => {
  const transport = new PlaybackTransport(), resume = deferred();
  const start = transport.start(() => resume.promise, events, project.seed);
  transport.stop(); resume.reject(new Error('closed while pending'));
  assert.equal(await start, null);
  await assert.rejects(transport.start(async () => { throw new Error('permission denied'); }, events, project.seed), /permission denied/);
  assert.equal(transport.active, false);
  const audio = fakeAudio(); await transport.start(async () => audio, events, project.seed);
  assert.equal(transport.active, true); transport.stop();
});

test('mute changes made while resuming apply to the new pass and survive restart', async () => {
  const transport = new PlaybackTransport(), resume = deferred(), audio = fakeAudio();
  const start = transport.start(() => resume.promise, events, project.seed);
  transport.setMuted(true); resume.resolve(audio); await start;
  assert.equal(audio.nodes[0].gain.value, 0);
  transport.setMuted(false); assert.equal(audio.nodes[0].gain.value, 1);
  transport.setMuted(true); transport.stop();
  const next = fakeAudio(); await transport.start(async () => next, events, project.seed);
  assert.equal(next.nodes[0].gain.value, 0); transport.stop();
});
