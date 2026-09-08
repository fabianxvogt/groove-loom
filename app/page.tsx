'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  buildEventList,
  cloneProject,
  createDefaultProject,
  getTimelineDurationSeconds,
  normalizeProject,
  projectChecksum,
  STEP_COUNT,
  TRACKS,
  type Project,
  type ScheduledEvent,
  type TrackId,
  VARIATIONS,
  type VariationId,
} from '@/lib/groove';
import { createMidiFile } from '@/lib/midi';
import { noiseAt, PlaybackTransport } from '@/lib/playback';

type Selection = { variation: VariationId; trackId: TrackId; step: number };
type LogTone = 'info' | 'success' | 'error' | 'warning';
type LogItem = { id: number; tone: LogTone; message: string };

const DEFAULT_SELECTION: Selection = { variation: 'A', trackId: 'kick', step: 0 };

function one(value: number | readonly number[] | undefined, fallback: number): number {
  return typeof value === 'number' ? value : (value?.[0] ?? fallback);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeWav(project: Project): Blob {
  const events = buildEventList(project);
  const sampleRate = 44100;
  const duration = Math.max(1, getTimelineDurationSeconds(project));
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  events.forEach((event, eventIndex) => {
    const start = Math.floor(event.time * sampleRate);
    const length = Math.floor((event.trackId === 'hat' ? 0.07 : event.trackId === 'kick' ? 0.42 : 0.22) * sampleRate);
    const pitch = TRACKS.find((track) => track.id === event.trackId)?.midi ?? 36;
    for (let i = 0; i < length && start + i < samples.length; i += 1) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * (event.trackId === 'kick' ? 16 : 28));
      const tone = event.trackId === 'kick' ? Math.sin(2 * Math.PI * (100 - 58 * Math.min(1, t * 8)) * t) : Math.sin(2 * Math.PI * (70 + pitch * 3.2) * t) * 0.32;
      const grit = event.trackId === 'kick' || event.trackId === 'tom' ? 0 : noiseAt(i + eventIndex * 17, project.seed) * 0.58;
      samples[start + i] += (tone * 0.72 + grit) * envelope * event.velocity;
    }
  });
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const ascii = (offset: number, value: string) => value.split('').forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  ascii(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i += 1) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buffer], { type: 'audio/wav' });
}

function eventSummary(events: ScheduledEvent[]) {
  return `${events.length} scheduled hits · ${events.filter((event) => event.trackId === 'kick').length} kicks`;
}

export default function Home() {
  const [project, setProject] = useState<Project>(() => createDefaultProject());
  const projectRef = useRef(project);
  const [selection, setSelection] = useState<Selection>(DEFAULT_SELECTION);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [clockDriftMs, setClockDriftMs] = useState<number | null>(null);
  const [peakClockDriftMs, setPeakClockDriftMs] = useState<number | null>(null);
  const [mute, setMute] = useState(false);
  const [message, setMessage] = useState('Ready when you are.');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [importError, setImportError] = useState('');
  const audioRef = useRef<AudioContext | null>(null);
  const transportRef = useRef(new PlaybackTransport());
  const intervalRef = useRef<number | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const logId = useRef(0);

  useEffect(() => {
    const restore = () => {
      try {
        const stored = window.localStorage.getItem('groove-loom-project');
        if (!stored) return;
        const restored = normalizeProject(JSON.parse(stored));
        setProject(restored);
        setSelection((current) => ({ ...current, variation: restored.currentVariation }));
      } catch {
        // A malformed local cache should never prevent the starter groove from opening.
      }
    };
    const restoreTimer = window.setTimeout(restore, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  const events = useMemo(() => buildEventList(project), [project]);
  const currentPattern = project.patterns[project.currentVariation];
  const selectedStep = currentPattern[selection.trackId][selection.step];
  const selectedTrack = TRACKS.find((track) => track.id === selection.trackId) ?? TRACKS[0];
  const selectedEvent = events.find((event) => event.variation === selection.variation && event.trackId === selection.trackId && event.step === selection.step);
  const loopSeconds = getTimelineDurationSeconds(project);

  const addLog = useCallback((tone: LogTone, logMessage: string) => {
    logId.current += 1;
    setLogs((current) => [{ id: logId.current, tone, message: logMessage }, ...current].slice(0, 4));
  }, []);

  useEffect(() => { projectRef.current = project; }, [project]);

  const clearPlayback = useCallback(() => {
    transportRef.current.stop();
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);
  const closeAudio = useCallback(() => {
    const audio = audioRef.current; audioRef.current = null;
    if (audio && audio.state !== 'closed') void audio.close().catch(() => undefined);
  }, []);
  const stopTransport = useCallback(() => {
    clearPlayback(); setIsPlaying(false); setIsStarting(false); setPlayhead(0);
  }, [clearPlayback]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && transportRef.current.active) {
        stopTransport(); closeAudio();
        setIsSuspended(true); setMessage('Tab suspended — transport stopped safely. Resume to resync.');
        addLog('warning', 'Suspension recovered: playback stopped before the tab went idle.');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearPlayback(); closeAudio();
    };
  }, [addLog, clearPlayback, closeAudio, stopTransport]);

  useEffect(() => {
    const documentWithModelContext = document as Document & { modelContext?: { registerTool: (tool: { name: string; title?: string; description: string; inputSchema: object; annotations?: object; execute: (input: unknown) => unknown }, options?: { signal?: AbortSignal }) => void | Promise<void> } };
    const context = documentWithModelContext.modelContext;
    if (!context?.registerTool) return;
    const abort = new AbortController();
    const register = async () => {
      await context.registerTool({
        name: 'inspect_groove', title: 'Inspect groove', description: 'Read the current Groove Loom transport, chain, seed, and scheduled event count without changing the groove.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true },
        execute: () => { const current = projectRef.current; return { name: current.name, bpm: current.bpm, swing: current.swing, seed: current.seed, chain: current.chain, eventCount: buildEventList(current).length, checksum: projectChecksum(current) }; },
      }, { signal: abort.signal });
      await context.registerTool({
        name: 'set_groove_step', title: 'Set groove step', description: 'Set one visible drum step active or inactive, using the same action and state as the sequencer grid.',
        inputSchema: { type: 'object', properties: { trackId: { type: 'string', enum: TRACKS.map((track) => track.id) }, step: { type: 'integer', minimum: 0, maximum: 63 }, active: { type: 'boolean' } }, required: ['trackId', 'step', 'active'], additionalProperties: false },
        execute: (input) => {
          const value = input as { trackId?: string; step?: number; active?: boolean };
          if (!TRACKS.some((track) => track.id === value.trackId) || !Number.isInteger(value.step) || (value.step ?? -1) < 0 || (value.step ?? 64) > 63 || typeof value.active !== 'boolean') throw new Error('Use a valid trackId, step 0–63, and boolean active value.');
          const trackId = value.trackId as TrackId; const step = value.step as number;
          setProject((current) => { const next = cloneProject(current); next.patterns[next.currentVariation][trackId][step].active = value.active as boolean; return next; });
          setSelection({ variation: projectRef.current.currentVariation, trackId, step });
          return { ok: true, variation: projectRef.current.currentVariation, trackId, step, active: value.active };
        },
      }, { signal: abort.signal });
    };
    void register().catch(() => undefined);
    return () => abort.abort();
  }, []);

  const updateProject = useCallback((mutate: (next: Project) => void) => {
    setProject((current) => { const next = cloneProject(current); mutate(next); return next; });
  }, []);

  const updateStep = useCallback((mutate: (step: Project['patterns']['A']['kick'][number]) => void) => {
    updateProject((next) => mutate(next.patterns[selection.variation][selection.trackId][selection.step]));
  }, [selection, updateProject]);

  const toggleStep = useCallback((trackId: TrackId, step: number) => {
    setSelection({ variation: project.currentVariation, trackId, step });
    updateProject((next) => { next.patterns[next.currentVariation][trackId][step].active = !next.patterns[next.currentVariation][trackId][step].active; });
  }, [project.currentVariation, updateProject]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      toggleStep(selection.trackId, selection.step);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selection, toggleStep]);
  const cycleChainSlot = (index: number) => updateProject((next) => { const current = next.chain[index]; next.chain[index] = VARIATIONS[(VARIATIONS.indexOf(current) + 1) % VARIATIONS.length]; });
  const addChainSlot = () => updateProject((next) => { if (next.chain.length < 16) next.chain.push(next.currentVariation); });

  const getAudio = async () => {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error('This browser does not expose Web Audio.');
    const audio = audioRef.current ?? new AudioContextClass(); audioRef.current = audio; await audio.resume(); return audio;
  };

  const startTransport = async () => {
    if (transportRef.current.active) { stopTransport(); setMessage('Playback stopped.'); return; }
    setIsStarting(true); setMessage('Starting audio…');
    try {
      const scheduled = buildEventList(project);
      const started = await transportRef.current.start(getAudio, scheduled, project.seed);
      if (!started) return;
      const { audio, startAt } = started;
      setIsStarting(false);
      const startedAt = performance.now();
      const audioStartedAt = audio.currentTime;
      setClockDriftMs(0); setPeakClockDriftMs(0); setIsSuspended(false); setIsPlaying(true); setMessage(`${eventSummary(scheduled)} · live clock armed`); addLog('success', `Playing ${scheduled.length} seeded events from ${project.chain.length}-bar chain.`);
      intervalRef.current = window.setInterval(() => {
        const wallElapsed = (performance.now() - startedAt) / 1000;
        const audioElapsed = audio.currentTime - audioStartedAt;
        const measuredDrift = Math.round((audioElapsed - wallElapsed) * 1000 * 10) / 10;
        setClockDriftMs(measuredDrift);
        setPeakClockDriftMs((current) => Math.max(Math.abs(current ?? 0), Math.abs(measuredDrift)));
        const passElapsed = Math.max(0, audio.currentTime - startAt);
        setPlayhead(Math.floor((passElapsed / (60 / project.bpm / 4)) % (project.chain.length * STEP_COUNT)));
        if (passElapsed >= loopSeconds) { stopTransport(); setMessage('Loop complete.'); }
      }, 40);
    } catch (error) { stopTransport(); setMessage(error instanceof Error ? error.message : 'Audio could not start.'); addLog('error', 'Audio start failed; check browser permission and try again.'); }
  };
  const toggleMute = () => {
    const next = !mute; transportRef.current.setMuted(next); setMute(next);
  };
  const panic = () => { stopTransport(); closeAudio(); transportRef.current.setMuted(false); setMute(false); setIsSuspended(false); setMessage('All voices stopped.'); addLog('warning', 'Panic cleared the audio graph.'); };
  const saveSession = () => { try { window.localStorage.setItem('groove-loom-project', JSON.stringify(project)); setMessage('Saved locally on this device.'); addLog('success', `Saved ${project.name} with seed ${project.seed}.`); } catch { addLog('error', 'Local storage is unavailable; use Export JSON instead.'); } };
  const exportJSON = () => { downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'groove-loom'}.json`); setMessage('Portable project exported.'); };
  const exportMidi = () => {
    const midi = createMidiFile(project);
    const midiBuffer = new ArrayBuffer(midi.byteLength);
    new Uint8Array(midiBuffer).set(midi);
    downloadBlob(new Blob([midiBuffer], { type: 'audio/midi' }), `${project.name.replace(/\s+/g, '-').toLowerCase()}.mid`);
    setMessage(`MIDI exported from ${events.length} scheduled events.`);
    addLog('success', 'MIDI includes per-step microtiming at 120 ticks per step and an explicit 24-tick pre-roll.');
  };
  const exportWav = () => { downloadBlob(makeWav(project), `${project.name.replace(/\s+/g, '-').toLowerCase()}.wav`); setMessage(`WAV rendered from the same ${events.length}-event schedule used by playback.`); addLog('success', 'Offline render completed from the shared 24-tick pre-roll timeline.'); };
  const importJSON = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try { if (file.size > 500_000) throw new Error('That project is larger than the 500 KB safety limit.'); const parsed = normalizeProject(JSON.parse(await file.text())); stopTransport(); setProject(parsed); setSelection({ ...DEFAULT_SELECTION, variation: parsed.currentVariation }); setImportError(''); setMessage('Imported portable project.'); addLog('success', `Imported ${parsed.name}; deterministic seed restored.`); }
    catch (error) { const reason = error instanceof Error ? error.message : 'Unknown import error.'; setImportError(reason); addLog('error', `Import rejected: ${reason}`); }
  };
  const recoverTransport = () => { setIsSuspended(false); setMessage('Ready to resync after suspension.'); void startTransport(); };

  return (
    <main className="loom-app">
      <header className="loom-header"><div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><div><p className="eyebrow">instrument / 83</p><h1>Groove Loom</h1></div></div><div className="header-status"><span className={isPlaying ? 'status-dot is-live' : 'status-dot'} />{isPlaying ? 'transport live' : isSuspended ? 'suspended safely' : 'offline-ready'}<span className="header-divider" />seed <strong>{project.seed}</strong></div></header>
      <section className="workbench"><div className="main-column">
        <section className="transport-panel panel-surface"><div className="transport-main"><Button className="play-button" onClick={startTransport} aria-label={isStarting ? 'Cancel audio start' : isPlaying ? 'Stop playback' : 'Start playback'}>{isStarting ? '■ cancel' : isPlaying ? '■ stop' : '▶ play'}</Button><div><p className="eyebrow">{project.name}</p><p className="message-line">{message}</p></div></div><div className="transport-meters"><label>tempo <strong>{project.bpm}</strong><span>BPM</span><Slider value={[project.bpm]} min={60} max={180} step={1} onValueChange={(value) => updateProject((next) => { next.bpm = Math.round(one(value, next.bpm)); })} /></label><label>swing <strong>{project.swing}%</strong><Slider value={[project.swing]} min={50} max={72} step={1} onValueChange={(value) => updateProject((next) => { next.swing = Math.round(one(value, next.swing)); })} /></label><span className="clock-readout" title="Audio clock minus wall clock while transport runs">drift {clockDriftMs === null ? '—' : `${clockDriftMs > 0 ? '+' : ''}${clockDriftMs.toFixed(1)} ms`}<small>{peakClockDriftMs === null ? 'waiting' : `peak ${peakClockDriftMs.toFixed(1)} ms`}</small></span><Button variant="outline" size="sm" onClick={panic}>panic</Button><Button variant={mute ? 'default' : 'outline'} size="sm" onClick={toggleMute} aria-pressed={mute}>{mute ? 'muted' : 'mute'}</Button></div></section>
        <section className="control-strip"><div className="strip-block"><span className="eyebrow">kit</span><div className="kit-options">{(['neon', 'oxide', 'paper'] as const).map((kit) => <Button key={kit} variant={project.kit === kit ? 'default' : 'outline'} size="sm" onClick={() => updateProject((next) => { next.kit = kit; })}>{kit}</Button>)}</div></div><div className="strip-block"><span className="eyebrow">variation</span><Tabs value={project.currentVariation} onValueChange={(value) => { const variation = value as VariationId; updateProject((next) => { next.currentVariation = variation; }); setSelection((current) => ({ ...current, variation })); }}><TabsList variant="line" className="variation-tabs">{VARIATIONS.map((variation) => <TabsTrigger key={variation} value={variation}>{variation}</TabsTrigger>)}</TabsList></Tabs></div><div className="strip-block fill-block"><span className="eyebrow">fill pass</span><Button variant={currentPattern.fill ? 'default' : 'outline'} size="sm" onClick={() => updateProject((next) => { next.patterns[next.currentVariation].fill = !next.patterns[next.currentVariation].fill; })}>{currentPattern.fill ? 'armed · last beat' : 'off · add fill'}</Button></div></section>
        <section className="chain-panel panel-surface"><div className="section-heading"><div><p className="eyebrow">chain / variation memory</p><h2>Shape the loop</h2></div><Button variant="outline" size="sm" onClick={addChainSlot} disabled={project.chain.length >= 16}>+ variation</Button></div><div className="chain-row">{project.chain.map((variation, index) => <button className={`chain-slot ${variation === project.currentVariation ? 'is-current' : ''}`} key={`${index}-${variation}`} onClick={() => cycleChainSlot(index)} aria-label={`Chain slot ${index + 1}, variation ${variation}. Click to cycle.`}><span>{String(index + 1).padStart(2, '0')}</span><strong>{variation}</strong></button>)}</div><p className="helper-text">Click any slot to cycle A → B → C → D. The seed makes probability decisions repeatable.</p></section>
        <section className="grid-panel panel-surface"><div className="section-heading"><div><p className="eyebrow">{project.currentVariation} / 64 steps</p><h2>Timing grid</h2></div><div className="grid-legend"><span className="legend-swatch on" />hit <span className="legend-swatch ghost" />probability <span className="legend-swatch play" />playhead</div></div><div className="grid-scroll"><div className="step-grid"><div className="step-label-grid"><span /><div className="step-numbers">{Array.from({ length: STEP_COUNT }, (_, step) => <span key={step} className={step % 16 === 0 ? 'bar-number' : ''}>{step % 4 === 0 ? String(step + 1).padStart(2, '0') : ''}</span>)}</div></div>{TRACKS.map((track) => <div className="track-row" key={track.id}><button className="track-label" style={{ '--track-color': track.color } as React.CSSProperties} onClick={() => { const firstActive = currentPattern[track.id].findIndex((step) => step.active); setSelection({ variation: project.currentVariation, trackId: track.id, step: firstActive >= 0 ? firstActive : 0 }); }}><span className="track-pip" />{track.short}</button><div className="step-cells">{currentPattern[track.id].map((step, index) => <button key={index} className={`step-cell ${step.active ? 'is-on' : ''} ${step.probability < 1 ? 'is-probabilistic' : ''} ${playhead === index ? 'is-playhead' : ''} ${selection.trackId === track.id && selection.step === index ? 'is-selected' : ''} ${index % 16 === 0 ? 'is-bar-start' : ''} ${index % 4 === 0 ? 'is-beat' : ''}`} style={{ '--track-color': track.color, '--velocity': step.velocity } as React.CSSProperties} onClick={() => toggleStep(track.id, index)} aria-label={`${track.name}, step ${index + 1}, ${step.active ? 'active' : 'inactive'}`} title={`${track.name} ${index + 1} · ${step.active ? `${Math.round(step.velocity * 100)}% velocity` : 'empty'}`}>{step.active && <span />}</button>)}</div></div>)}</div></div><div className="grid-footer"><span>← scroll to edit all 64 steps</span><span><kbd>space</kbd> toggles selected step</span></div></section>
        <section className="bottom-grid"><div className="panel-surface seed-panel"><div className="section-heading"><div><p className="eyebrow">determinism</p><h2>Seed the pocket</h2></div><span className="checksum">{projectChecksum(project)}</span></div><div className="seed-line"><input aria-label="Probability seed" type="number" value={project.seed} onChange={(event) => updateProject((next) => { next.seed = Math.trunc(Number(event.target.value)); })} /><span>probability seed</span></div><p className="helper-text">The same project, seed, and chain always produce the same scheduled event list.</p></div><div className="panel-surface event-panel"><div className="section-heading"><div><p className="eyebrow">scheduler output</p><h2>Event inspector</h2></div><span className="event-count">{events.length} hits</span></div><div className="event-readout"><span className="readout-accent" style={{ background: selectedTrack.color }} /><div><strong>{selectedTrack.name} · step {selection.step + 1}</strong><p>{selectedStep.active ? `${Math.round(selectedStep.velocity * 100)}% velocity · ${Math.round(selectedStep.probability * 100)}% chance · ${selectedStep.offset > 0 ? '+' : ''}${selectedStep.offset} ticks` : 'Inactive step · click the grid to arm it'}</p></div></div><div className="event-mini-row"><span>chain {selection.variation}</span><span>{selectedStep.active ? 'eligible' : 'silent'}</span><span>tick {selectedEvent?.tick ?? '—'}</span></div></div></section>
      </div><aside className="inspector-column"><section className="panel-surface inspector-panel"><div className="section-heading"><div><p className="eyebrow">selected event</p><h2>Shape the hit</h2></div><span className="selection-index">{selection.variation} · {selection.step + 1}</span></div><div className="inspector-voice"><span className="track-pip" style={{ background: selectedTrack.color }} /><strong>{selectedTrack.name}</strong><span>voice {String(TRACKS.indexOf(selectedTrack) + 1).padStart(2, '0')}</span></div><div className="inspector-toggle"><span><strong>Active</strong><small>include in the sequence</small></span><Switch checked={selectedStep.active} onCheckedChange={(checked) => updateStep((step) => { step.active = checked; })} /></div><label className="range-control"><span><strong>velocity</strong><output>{Math.round(selectedStep.velocity * 100)}%</output></span><Slider value={[selectedStep.velocity * 100]} min={5} max={100} step={1} onValueChange={(value) => updateStep((step) => { step.velocity = one(value, step.velocity * 100) / 100; })} /></label><label className="range-control"><span><strong>probability</strong><output>{Math.round(selectedStep.probability * 100)}%</output></span><Slider value={[selectedStep.probability * 100]} min={0} max={100} step={1} onValueChange={(value) => updateStep((step) => { step.probability = one(value, step.probability * 100) / 100; })} /></label><label className="range-control"><span><strong>microtiming</strong><output>{selectedStep.offset > 0 ? '+' : ''}{selectedStep.offset} ticks</output></span><Slider value={[selectedStep.offset]} min={-24} max={24} step={1} onValueChange={(value) => updateStep((step) => { step.offset = Math.round(one(value, step.offset)); })} /></label><div className="inspector-note"><span className="note-glyph">↳</span><p><strong>Event clock</strong> uses a 24-tick pre-roll origin, preserving negative offsets in audio, MIDI, and WAV. All three use the same eligible event list and timeline duration.</p></div></section><section className="panel-surface file-panel"><div className="section-heading"><div><p className="eyebrow">portable session</p><h2>Keep the thread</h2></div><span className="local-badge">local</span></div><div className="file-actions"><Button size="sm" onClick={saveSession}>save session</Button><Button size="sm" variant="outline" onClick={exportJSON}>export JSON</Button><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importJSON} /><Button size="sm" variant="outline" onClick={() => importRef.current?.click()}>import JSON</Button></div>{importError && <p className="error-line" role="alert">{importError}</p>}<div className="export-actions"><Button variant="secondary" onClick={exportMidi}>↓ MIDI</Button><Button variant="secondary" onClick={exportWav}>↓ WAV</Button></div><p className="helper-text">Nothing leaves this device. JSON is versioned and rejects malformed or oversized files.</p></section><section className="panel-surface safety-panel"><div className="section-heading"><div><p className="eyebrow">engine safety</p><h2>Known boundaries</h2></div><span className="safety-icon">◎</span></div><ul><li>Six synthetic voices · no samples</li><li>Playback halts on tab suspension</li><li>Browser audio needs one explicit play</li></ul>{isSuspended && <Button className="recovery-button" onClick={recoverTransport}>resume after suspension</Button>}</section></aside></section>
      <footer className="loom-footer"><span>GROOVE LOOM / procedural percussion instrument</span><span>local compute · no account · {events.length} scheduled hits · {logs[0]?.message ?? 'seeded and ready'}</span></footer><div className="toast-stack" aria-live="polite">{logs.map((log) => <div className={`toast ${log.tone}`} key={log.id}>{log.message}</div>)}</div>
    </main>
  );
}
