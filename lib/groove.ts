export const PROJECT_VERSION = 1;
export const STEP_COUNT = 64;
export const TICKS_PER_STEP = 120;
export const MAX_MICROTIMING_TICKS = 24;
/** The exported/playback timeline starts at the earliest supported microtiming position. */
export const PRE_ROLL_TICKS = MAX_MICROTIMING_TICKS;
export const RENDER_TAIL_SECONDS = 0.9;

export const TRACKS = [
  { id: 'kick', name: 'Kick', short: 'KICK', color: '#f3a85b', midi: 36 },
  { id: 'snare', name: 'Snare', short: 'SNAR', color: '#ff6b5c', midi: 38 },
  { id: 'hat', name: 'Closed hat', short: 'HAT', color: '#62d5c8', midi: 42 },
  { id: 'clap', name: 'Clap', short: 'CLAP', color: '#a78bfa', midi: 39 },
  { id: 'perc', name: 'Perc', short: 'PERC', color: '#e9cc69', midi: 50 },
  { id: 'tom', name: 'Tom', short: 'TOM', color: '#6aa9ff', midi: 45 },
] as const;

export type TrackId = (typeof TRACKS)[number]['id'];
export type VariationId = 'A' | 'B' | 'C' | 'D';
export const VARIATIONS: VariationId[] = ['A', 'B', 'C', 'D'];

export type Step = {
  active: boolean;
  velocity: number;
  probability: number;
  offset: number;
};

export type Pattern = Record<TrackId, Step[]> & { fill: boolean };

export type Project = {
  version: number;
  name: string;
  bpm: number;
  swing: number;
  seed: number;
  kit: 'neon' | 'oxide' | 'paper';
  currentVariation: VariationId;
  chain: VariationId[];
  patterns: Record<VariationId, Pattern>;
};

export type ScheduledEvent = {
  id: string;
  trackId: TrackId;
  step: number;
  absoluteStep: number;
  tick: number;
  time: number;
  velocity: number;
  variation: VariationId;
  chainIndex: number;
  probability: number;
  offset: number;
};

export function getSecondsPerTick(project: Project): number {
  return (60 / project.bpm / 4) / TICKS_PER_STEP;
}

function makeStep(active = false, velocity = 0.82, probability = 1, offset = 0): Step {
  return { active, velocity, probability, offset };
}

function blankPattern(): Pattern {
  return {
    kick: Array.from({ length: STEP_COUNT }, () => makeStep()),
    snare: Array.from({ length: STEP_COUNT }, () => makeStep()),
    hat: Array.from({ length: STEP_COUNT }, () => makeStep()),
    clap: Array.from({ length: STEP_COUNT }, () => makeStep()),
    perc: Array.from({ length: STEP_COUNT }, () => makeStep()),
    tom: Array.from({ length: STEP_COUNT }, () => makeStep()),
    fill: false,
  };
}

function seedPattern(pattern: Pattern, density: number, offset = 0): Pattern {
  const next = structuredClone(pattern);
  for (let step = 0; step < STEP_COUNT; step += 1) {
    const downbeat = step % 16 === 0;
    const backbeat = step % 16 === 8;
    const offbeat = step % 4 === 2;
    next.kick[step] = makeStep(downbeat || (step % 16 === 6 && density > 0.4), downbeat ? 0.98 : 0.76, 1, step % 16 === 6 ? 4 : 0);
    next.snare[step] = makeStep(backbeat && density > 0.25, 0.88, 0.94, 0);
    next.hat[step] = makeStep(step % 2 === 0 || (offbeat && density > 0.45), step % 4 === 0 ? 0.72 : 0.54, density > 0.5 ? 0.9 : 0.78, step % 2 ? -2 : 0);
    next.clap[step] = makeStep(backbeat && density > 0.62, 0.64, 0.72, 2);
    next.perc[step] = makeStep((step + offset) % 12 === 3 || (density > 0.7 && step % 16 === 14), 0.48, 0.64, step % 3 === 0 ? -4 : 3);
    next.tom[step] = makeStep(density > 0.72 && (step % 16 === 11 || step % 16 === 15), 0.6, 0.58, -3);
  }
  return next;
}

export function createDefaultProject(): Project {
  const patterns = {
    A: seedPattern(blankPattern(), 0.35),
    B: seedPattern(blankPattern(), 0.58, 2),
    C: seedPattern(blankPattern(), 0.78, 5),
    D: seedPattern(blankPattern(), 0.9, 7),
  } satisfies Record<VariationId, Pattern>;
  patterns.C.fill = true;
  patterns.D.fill = true;
  return {
    version: PROJECT_VERSION,
    name: 'Night Transit',
    bpm: 112,
    swing: 57,
    seed: 83017,
    kit: 'neon',
    currentVariation: 'A',
    chain: ['A', 'B', 'A', 'C'],
    patterns,
  };
}

export function cloneProject(project: Project): Project {
  return structuredClone(project);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function random01(seed: number, chainIndex: number, trackIndex: number, step: number): number {
  let value = (seed ^ Math.imul(chainIndex + 1, 0x9e3779b9) ^ Math.imul(trackIndex + 7, 0x85ebca6b) ^ Math.imul(step + 11, 0xc2b2ae35)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

export function buildEventList(project: Project): ScheduledEvent[] {
  const events: ScheduledEvent[] = [];
  const secondsPerTick = getSecondsPerTick(project);
  project.chain.forEach((variation, chainIndex) => {
    const pattern = project.patterns[variation];
    const baseStep = chainIndex * STEP_COUNT;
    TRACKS.forEach((track, trackIndex) => {
      pattern[track.id].forEach((stepData, step) => {
        if (stepData.active && random01(project.seed, chainIndex, trackIndex, step) < stepData.probability) {
          const swingTicks = step % 2 === 1 ? Math.round(((project.swing - 50) / 1000) / secondsPerTick) : 0;
          const absoluteStep = baseStep + step;
          const tick = PRE_ROLL_TICKS + absoluteStep * TICKS_PER_STEP + swingTicks + stepData.offset;
          events.push({
            id: `${chainIndex}-${track.id}-${step}`,
            trackId: track.id,
            step,
            absoluteStep,
            // PRE_ROLL_TICKS is an explicit shifted origin. It preserves a -24 tick
            // step-0 edit as tick/time 0 instead of silently clamping the edit away.
            tick,
            time: tick * secondsPerTick,
            velocity: Math.min(1, Math.max(0.05, stepData.velocity)),
            variation,
            chainIndex,
            probability: stepData.probability,
            offset: stepData.offset,
          });
        }
      });
    });
    if (pattern.fill) {
      const fillSteps = [60, 61, 62, 63];
      fillSteps.forEach((step, index) => {
        const trackId: TrackId = index % 2 === 0 ? 'tom' : 'snare';
        const absoluteStep = baseStep + step;
        const tick = PRE_ROLL_TICKS + absoluteStep * TICKS_PER_STEP + (index % 2 ? 8 : -6);
        events.push({
          id: `${chainIndex}-fill-${step}`,
          trackId,
          step,
          absoluteStep,
          tick,
          time: tick * secondsPerTick,
          velocity: 0.42 + index * 0.08,
          variation,
          chainIndex,
          probability: 1,
          offset: index % 2 ? 8 : -6,
        });
      });
    }
  });
  return events.sort((a, b) => a.time - b.time || a.trackId.localeCompare(b.trackId));
}

export function getTimelineEndTick(project: Project): number {
  const secondsPerTick = getSecondsPerTick(project);
  return PRE_ROLL_TICKS + project.chain.length * STEP_COUNT * TICKS_PER_STEP + Math.ceil(RENDER_TAIL_SECONDS / secondsPerTick);
}

export function getTimelineDurationSeconds(project: Project): number {
  const secondsPerTick = getSecondsPerTick(project);
  return getTimelineEndTick(project) * secondsPerTick;
}

function validStep(value: unknown): value is Step {
  if (!value || typeof value !== 'object') return false;
  const step = value as Record<string, unknown>;
  return typeof step.active === 'boolean' && Number.isFinite(step.velocity) && Number.isFinite(step.probability) && Number.isFinite(step.offset);
}

export function normalizeProject(input: unknown): Project {
  if (!input || typeof input !== 'object') throw new Error('The file is not a Groove Loom project.');
  const candidate = input as Partial<Project>;
  if (candidate.version !== PROJECT_VERSION) throw new Error(`Unsupported project version. Expected ${PROJECT_VERSION}.`);
  if (!Array.isArray(candidate.chain) || candidate.chain.length < 1 || candidate.chain.length > 16 || candidate.chain.some((item) => !VARIATIONS.includes(item as VariationId))) {
    throw new Error('Chain must contain 1–16 valid variations.');
  }
  if (!candidate.patterns || typeof candidate.patterns !== 'object') throw new Error('Project patterns are missing.');
  const patterns = {} as Record<VariationId, Pattern>;
  for (const variation of VARIATIONS) {
    const source = (candidate.patterns as Record<string, unknown>)[variation];
    if (!source || typeof source !== 'object') throw new Error(`Variation ${variation} is missing.`);
    const record = source as Record<string, unknown>;
    const pattern = {} as Pattern;
    for (const track of TRACKS) {
      const steps = record[track.id];
      if (!Array.isArray(steps) || steps.length !== STEP_COUNT || steps.some((step) => !validStep(step))) throw new Error(`${variation}/${track.name} must contain 64 valid steps.`);
      pattern[track.id] = steps.map((step) => {
        const item = step as Step;
        return { active: item.active, velocity: clamp(item.velocity, 0.05, 1), probability: clamp(item.probability, 0, 1), offset: clamp(Math.round(item.offset), -24, 24) };
      });
    }
    pattern.fill = Boolean(record.fill);
    patterns[variation] = pattern;
  }
  return {
    version: PROJECT_VERSION,
    name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim().slice(0, 60) : 'Untitled groove',
    bpm: clamp(Number(candidate.bpm), 60, 180),
    swing: clamp(Number(candidate.swing), 50, 72),
    seed: Number.isFinite(candidate.seed) ? Math.trunc(Number(candidate.seed)) : 1,
    kit: candidate.kit === 'oxide' || candidate.kit === 'paper' ? candidate.kit : 'neon',
    currentVariation: VARIATIONS.includes(candidate.currentVariation as VariationId) ? (candidate.currentVariation as VariationId) : 'A',
    chain: [...candidate.chain] as VariationId[],
    patterns,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function projectChecksum(project: Project): string {
  const events = buildEventList(project);
  return hashString(`${JSON.stringify(project)}:${events.map((event) => `${event.id}:${event.tick}:${event.time}`).join('|')}`).toString(16).padStart(8, '0');
}
