export const PLAYTEST_REPORT_SCHEMA = 1;
export const PLAYTEST_FRAGMENT = '#playtest';

const FRAME_BUCKET_MS = .5;
const FRAME_BUCKET_COUNT = 2_001;
const LONG_FRAME_MS = 50;
const MAX_ATTEMPTS = 128;

export type PlaytestAction = 'move' | 'look' | 'fire' | 'use';
export type PlaytestOutcome = 'active' | 'abandoned' | 'dead' | 'completed';

export interface PlaytestSnapshot {
  readonly mode: string;
  readonly mapId?: string;
  readonly difficulty: string;
  readonly player: { readonly x: number; readonly z: number; readonly yaw: number; readonly pitch: number };
}

export interface PlaytestRuntimeSample {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly devicePixelRatio: number;
  readonly renderScale: number;
  readonly usedHeapBytes?: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly textures: number;
  readonly audio: {
    readonly lifecycleSuspended: boolean;
    readonly contextState?: string;
    readonly libraryStatus: string;
    readonly spriteStatus: string;
    readonly source: string;
    readonly trackSource: string;
    readonly authoredPlays: number;
    readonly fallbackPlays: number;
    readonly rejectedVoices: number;
    readonly error?: string;
  };
}

export interface CandidateAssetFingerprint {
  readonly status: 'ready' | 'unavailable';
  readonly algorithm: 'SHA-256';
  readonly value: string | null;
  readonly components: readonly ['data/game-assets.json', 'audio/audio-library.json'];
  readonly bytes: number;
}

interface AttemptState {
  mapId: string;
  difficulty: string;
  ordinal: number;
  startedAt: number;
  lastPlayer: PlaytestSnapshot['player'];
  firstActionsMs: Record<PlaytestAction, number | null>;
}

export interface PlaytestAttemptReport {
  readonly mapId: string;
  readonly difficulty: string;
  readonly ordinal: number;
  readonly durationMs: number;
  readonly outcome: PlaytestOutcome;
  readonly firstActionsMs: Readonly<Record<PlaytestAction, number | null>>;
}

interface MapAggregate {
  attempts: number;
  deaths: number;
  completions: number;
}

export interface PlaytestReport {
  readonly schema: typeof PLAYTEST_REPORT_SCHEMA;
  readonly collection: 'local-opt-in';
  readonly transport: 'none';
  readonly persistent: false;
  readonly durationMs: number;
  readonly candidateAssets: CandidateAssetFingerprint;
  readonly device: {
    readonly viewport: {
      readonly width: number;
      readonly height: number;
      readonly minWidth: number;
      readonly minHeight: number;
      readonly maxWidth: number;
      readonly maxHeight: number;
    };
    readonly devicePixelRatio: number;
    readonly renderScale: number;
    readonly webglRenderer: string;
  };
  readonly frames: {
    readonly samples: number;
    readonly medianMs: number | null;
    readonly p95Ms: number | null;
    readonly worstMs: number | null;
    readonly longFrameThresholdMs: typeof LONG_FRAME_MS;
    readonly longFrames: number;
    readonly backgroundGaps: number;
  };
  readonly memory: { readonly peakHeapBytes: number | null };
  readonly renderer: { readonly maxDrawCalls: number; readonly maxTriangles: number; readonly maxTextures: number };
  readonly audio: {
    readonly contextStatesSeen: readonly string[];
    readonly libraryStatusesSeen: readonly string[];
    readonly spriteStatusesSeen: readonly string[];
    readonly sourcesSeen: readonly string[];
    readonly trackSourcesSeen: readonly string[];
    readonly authoredPlays: number;
    readonly fallbackPlays: number;
    readonly maxRejectedVoices: number;
    readonly errorObserved: boolean;
  };
  readonly maps: Readonly<Record<string, Readonly<MapAggregate>>>;
  readonly attempts: readonly PlaytestAttemptReport[];
  readonly discardedAttempts: number;
}

export interface ChecksummedPlaytestReport {
  readonly checksum: { readonly algorithm: 'SHA-256'; readonly value: string };
  readonly report: PlaytestReport;
}

const round = (value: number, places = 1): number => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

const safeNumber = (value: number): number => Number.isFinite(value) ? Math.max(0, value) : 0;

const sorted = (values: ReadonlySet<string>): string[] => [...values].sort((left, right) => left.localeCompare(right));

const knownCategory = (value: string | undefined, allowed: readonly string[]): string =>
  value && allowed.includes(value) ? value : 'unknown';

const AUDIO_CONTEXT_STATES = ['closed', 'interrupted', 'running', 'suspended'] as const;
const LOAD_STATES = ['idle', 'loading', 'ready', 'failed'] as const;
const AUDIO_SOURCES = ['authored', 'procedural', 'none'] as const;

class FrameTimeHistogram {
  private readonly buckets = new Uint32Array(FRAME_BUCKET_COUNT);
  private lastTimestamp?: number;
  samples = 0;
  worst?: number;
  longFrames = 0;
  backgroundGaps = 0;

  clear(): void {
    this.buckets.fill(0);
    this.lastTimestamp = undefined;
    this.samples = 0;
    this.worst = undefined;
    this.longFrames = 0;
    this.backgroundGaps = 0;
  }

  pause(): void { this.lastTimestamp = undefined; }

  record(timestamp: number, visible = true): void {
    if (!visible || !Number.isFinite(timestamp)) {
      this.pause();
      return;
    }
    const previous = this.lastTimestamp;
    this.lastTimestamp = timestamp;
    if (previous === undefined) return;
    const elapsed = timestamp - previous;
    if (!(elapsed > 0) || elapsed > 1_000) {
      if (elapsed > 1_000) this.backgroundGaps += 1;
      return;
    }
    const bucket = Math.min(FRAME_BUCKET_COUNT - 1, Math.round(elapsed / FRAME_BUCKET_MS));
    this.buckets[bucket] += 1;
    this.samples += 1;
    this.worst = Math.max(this.worst ?? 0, elapsed);
    if (elapsed >= LONG_FRAME_MS) this.longFrames += 1;
  }

  quantile(fraction: number): number | null {
    if (this.samples === 0) return null;
    const target = Math.max(1, Math.ceil(this.samples * fraction));
    let count = 0;
    for (let index = 0; index < this.buckets.length; index += 1) {
      count += this.buckets[index];
      if (count >= target) return round(index * FRAME_BUCKET_MS);
    }
    return round((FRAME_BUCKET_COUNT - 1) * FRAME_BUCKET_MS);
  }
}

const firstActions = (): Record<PlaytestAction, number | null> => ({
  move: null,
  look: null,
  fire: null,
  use: null,
});

const clonePlayer = (player: PlaytestSnapshot['player']): PlaytestSnapshot['player'] => ({ ...player });

const angleDelta = (left: number, right: number): number => Math.abs(Math.atan2(
  Math.sin(left - right),
  Math.cos(left - right),
));

export const isPlaytestFragment = (hash: string): boolean => hash === PLAYTEST_FRAGMENT;

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function candidateAssetFingerprint(
  urls: readonly [string, string],
  fetcher: typeof fetch = fetch,
): Promise<CandidateAssetFingerprint> {
  const components = ['data/game-assets.json', 'audio/audio-library.json'] as const;
  try {
    const responses = await Promise.all(urls.map((url) => fetcher(url, { cache: 'no-store' })));
    if (responses.some((response) => !response.ok)) throw new Error('asset manifest unavailable');
    const bodies = await Promise.all(responses.map((response) => response.arrayBuffer()));
    const labels = components.map((component) => new TextEncoder().encode(`${component}\0`));
    const byteLength = bodies.reduce((total, body, index) => total + labels[index].byteLength + body.byteLength, 0);
    const combined = new Uint8Array(byteLength);
    let offset = 0;
    bodies.forEach((body, index) => {
      combined.set(labels[index], offset);
      offset += labels[index].byteLength;
      combined.set(new Uint8Array(body), offset);
      offset += body.byteLength;
    });
    return { status: 'ready', algorithm: 'SHA-256', value: await sha256Hex(combined), components, bytes: byteLength };
  } catch {
    return { status: 'unavailable', algorithm: 'SHA-256', value: null, components, bytes: 0 };
  }
}

export class PlaytestRecorder {
  private readonly frames = new FrameTimeHistogram();
  private readonly completedAttempts: PlaytestAttemptReport[] = [];
  private readonly mapTotals = new Map<string, MapAggregate>();
  private readonly mapOrdinals = new Map<string, number>();
  private readonly contextStates = new Set<string>();
  private readonly libraryStatuses = new Set<string>();
  private readonly spriteStatuses = new Set<string>();
  private readonly sources = new Set<string>();
  private readonly trackSources = new Set<string>();
  private activeAttempt?: AttemptState;
  private lastSnapshot?: PlaytestSnapshot;
  private startedAt: number;
  private discardedAttempts = 0;
  private peakHeapBytes?: number;
  private maxDrawCalls = 0;
  private maxTriangles = 0;
  private maxTextures = 0;
  private initialAuthoredPlays?: number;
  private currentAuthoredPlays = 0;
  private initialFallbackPlays?: number;
  private currentFallbackPlays = 0;
  private maxRejectedVoices = 0;
  private audioErrorObserved = false;
  private attemptTrackingSuspended = false;
  private viewport = { width: 0, height: 0, minWidth: Infinity, minHeight: Infinity, maxWidth: 0, maxHeight: 0 };
  private devicePixelRatio = 1;
  private renderScale = 1;

  constructor(
    private readonly webglRenderer: string,
    private readonly assets: Promise<CandidateAssetFingerprint>,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.startedAt = this.now();
  }

  clear(): void {
    const snapshot = this.lastSnapshot;
    this.frames.clear();
    this.completedAttempts.length = 0;
    this.mapTotals.clear();
    this.mapOrdinals.clear();
    this.contextStates.clear();
    this.libraryStatuses.clear();
    this.spriteStatuses.clear();
    this.sources.clear();
    this.trackSources.clear();
    this.activeAttempt = undefined;
    this.startedAt = this.now();
    this.discardedAttempts = 0;
    this.peakHeapBytes = undefined;
    this.maxDrawCalls = 0;
    this.maxTriangles = 0;
    this.maxTextures = 0;
    this.initialAuthoredPlays = undefined;
    this.currentAuthoredPlays = 0;
    this.initialFallbackPlays = undefined;
    this.currentFallbackPlays = 0;
    this.maxRejectedVoices = 0;
    this.audioErrorObserved = false;
    this.viewport = { width: 0, height: 0, minWidth: Infinity, minHeight: Infinity, maxWidth: 0, maxHeight: 0 };
    this.devicePixelRatio = 1;
    this.renderScale = 1;
    this.lastSnapshot = undefined;
    if (snapshot) this.observeSnapshot(snapshot);
  }

  recordFrame(timestamp: number, visible = true): void { this.frames.record(timestamp, visible); }
  pauseFrames(): void { this.frames.pause(); }

  suspendAttemptTracking(): void {
    if (this.activeAttempt) this.finishAttempt('abandoned');
    this.attemptTrackingSuspended = true;
  }

  resumeAttemptTracking(): void { this.attemptTrackingSuspended = false; }

  observeInput(action: string): void {
    if (action === 'fire' || action === 'use') this.markAction(action);
  }

  observeSnapshot(snapshot: PlaytestSnapshot): void {
    if (this.attemptTrackingSuspended) {
      this.lastSnapshot = { ...snapshot, player: clonePlayer(snapshot.player) };
      return;
    }
    const previous = this.lastSnapshot;
    const mapChanged = Boolean(this.activeAttempt && snapshot.mapId && snapshot.mapId !== this.activeAttempt.mapId);
    if (mapChanged) this.finishAttempt('abandoned');

    if (snapshot.mode === 'playing' && snapshot.mapId && !this.activeAttempt) this.startAttempt(snapshot);

    if (snapshot.mode === 'playing' && this.activeAttempt) {
      const last = this.activeAttempt.lastPlayer;
      if (Math.hypot(snapshot.player.x - last.x, snapshot.player.z - last.z) >= .04) this.markAction('move');
      if (angleDelta(snapshot.player.yaw, last.yaw) >= .002 || Math.abs(snapshot.player.pitch - last.pitch) >= .002) {
        this.markAction('look');
      }
      this.activeAttempt.lastPlayer = clonePlayer(snapshot.player);
    }

    if (this.activeAttempt && snapshot.mode === 'dead' && previous?.mode !== 'dead') this.finishAttempt('dead');
    if (this.activeAttempt && (snapshot.mode === 'intermission' || snapshot.mode === 'complete')
      && previous?.mode !== snapshot.mode) this.finishAttempt('completed');
    if (this.activeAttempt && snapshot.mode === 'menu' && previous?.mode !== 'menu') this.finishAttempt('abandoned');
    this.lastSnapshot = { ...snapshot, player: clonePlayer(snapshot.player) };
  }

  sampleRuntime(sample: PlaytestRuntimeSample): void {
    const width = Math.max(0, Math.round(sample.viewportWidth));
    const height = Math.max(0, Math.round(sample.viewportHeight));
    this.viewport.width = width;
    this.viewport.height = height;
    this.viewport.minWidth = Math.min(this.viewport.minWidth, width);
    this.viewport.minHeight = Math.min(this.viewport.minHeight, height);
    this.viewport.maxWidth = Math.max(this.viewport.maxWidth, width);
    this.viewport.maxHeight = Math.max(this.viewport.maxHeight, height);
    this.devicePixelRatio = round(Math.max(.1, safeNumber(sample.devicePixelRatio)), 2);
    this.renderScale = Math.max(1, Math.round(safeNumber(sample.renderScale)));
    if (sample.usedHeapBytes !== undefined && Number.isFinite(sample.usedHeapBytes)) {
      this.peakHeapBytes = Math.max(this.peakHeapBytes ?? 0, sample.usedHeapBytes);
    }
    this.maxDrawCalls = Math.max(this.maxDrawCalls, Math.round(safeNumber(sample.drawCalls)));
    this.maxTriangles = Math.max(this.maxTriangles, Math.round(safeNumber(sample.triangles)));
    this.maxTextures = Math.max(this.maxTextures, Math.round(safeNumber(sample.textures)));

    const audio = sample.audio;
    this.contextStates.add(audio.lifecycleSuspended
      ? 'suspended'
      : knownCategory(audio.contextState, AUDIO_CONTEXT_STATES));
    this.libraryStatuses.add(knownCategory(audio.libraryStatus, LOAD_STATES));
    this.spriteStatuses.add(knownCategory(audio.spriteStatus, LOAD_STATES));
    this.sources.add(knownCategory(audio.source, AUDIO_SOURCES));
    this.trackSources.add(knownCategory(audio.trackSource, AUDIO_SOURCES));
    this.initialAuthoredPlays ??= safeNumber(audio.authoredPlays);
    this.currentAuthoredPlays = safeNumber(audio.authoredPlays);
    this.initialFallbackPlays ??= safeNumber(audio.fallbackPlays);
    this.currentFallbackPlays = safeNumber(audio.fallbackPlays);
    this.maxRejectedVoices = Math.max(this.maxRejectedVoices, Math.round(safeNumber(audio.rejectedVoices)));
    this.audioErrorObserved ||= Boolean(audio.error);
  }

  async report(): Promise<PlaytestReport> {
    const now = this.now();
    const attempts = [...this.completedAttempts];
    if (this.activeAttempt) attempts.push(this.attemptReport(this.activeAttempt, 'active', now));
    const maps = Object.fromEntries([...this.mapTotals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, aggregate]) => [id, { ...aggregate }]));
    const minWidth = Number.isFinite(this.viewport.minWidth) ? this.viewport.minWidth : this.viewport.width;
    const minHeight = Number.isFinite(this.viewport.minHeight) ? this.viewport.minHeight : this.viewport.height;
    return {
      schema: PLAYTEST_REPORT_SCHEMA,
      collection: 'local-opt-in',
      transport: 'none',
      persistent: false,
      durationMs: Math.max(0, Math.round(now - this.startedAt)),
      candidateAssets: await this.assets,
      device: {
        viewport: {
          width: this.viewport.width,
          height: this.viewport.height,
          minWidth,
          minHeight,
          maxWidth: this.viewport.maxWidth,
          maxHeight: this.viewport.maxHeight,
        },
        devicePixelRatio: this.devicePixelRatio,
        renderScale: this.renderScale,
        webglRenderer: this.webglRenderer,
      },
      frames: {
        samples: this.frames.samples,
        medianMs: this.frames.quantile(.5),
        p95Ms: this.frames.quantile(.95),
        worstMs: this.frames.worst === undefined ? null : round(this.frames.worst),
        longFrameThresholdMs: LONG_FRAME_MS,
        longFrames: this.frames.longFrames,
        backgroundGaps: this.frames.backgroundGaps,
      },
      memory: { peakHeapBytes: this.peakHeapBytes === undefined ? null : Math.round(this.peakHeapBytes) },
      renderer: {
        maxDrawCalls: this.maxDrawCalls,
        maxTriangles: this.maxTriangles,
        maxTextures: this.maxTextures,
      },
      audio: {
        contextStatesSeen: sorted(this.contextStates),
        libraryStatusesSeen: sorted(this.libraryStatuses),
        spriteStatusesSeen: sorted(this.spriteStatuses),
        sourcesSeen: sorted(this.sources),
        trackSourcesSeen: sorted(this.trackSources),
        authoredPlays: Math.max(0, Math.round(this.currentAuthoredPlays - (this.initialAuthoredPlays ?? 0))),
        fallbackPlays: Math.max(0, Math.round(this.currentFallbackPlays - (this.initialFallbackPlays ?? 0))),
        maxRejectedVoices: this.maxRejectedVoices,
        errorObserved: this.audioErrorObserved,
      },
      maps,
      attempts,
      discardedAttempts: this.discardedAttempts,
    };
  }

  async checksummedReport(): Promise<ChecksummedPlaytestReport> {
    const report = await this.report();
    return {
      checksum: { algorithm: 'SHA-256', value: await sha256Hex(JSON.stringify(report)) },
      report,
    };
  }

  private startAttempt(snapshot: PlaytestSnapshot): void {
    const mapId = snapshot.mapId!;
    const aggregate = this.mapTotals.get(mapId) ?? { attempts: 0, deaths: 0, completions: 0 };
    aggregate.attempts += 1;
    this.mapTotals.set(mapId, aggregate);
    const ordinal = (this.mapOrdinals.get(mapId) ?? 0) + 1;
    this.mapOrdinals.set(mapId, ordinal);
    this.activeAttempt = {
      mapId,
      difficulty: snapshot.difficulty,
      ordinal,
      startedAt: this.now(),
      lastPlayer: clonePlayer(snapshot.player),
      firstActionsMs: firstActions(),
    };
  }

  private markAction(action: PlaytestAction): void {
    const attempt = this.activeAttempt;
    if (!attempt || attempt.firstActionsMs[action] !== null) return;
    attempt.firstActionsMs[action] = Math.max(0, Math.round(this.now() - attempt.startedAt));
  }

  private finishAttempt(outcome: Exclude<PlaytestOutcome, 'active'>): void {
    const attempt = this.activeAttempt;
    if (!attempt) return;
    const aggregate = this.mapTotals.get(attempt.mapId)!;
    if (outcome === 'dead') aggregate.deaths += 1;
    if (outcome === 'completed') aggregate.completions += 1;
    this.completedAttempts.push(this.attemptReport(attempt, outcome, this.now()));
    if (this.completedAttempts.length > MAX_ATTEMPTS) {
      this.completedAttempts.shift();
      this.discardedAttempts += 1;
    }
    this.activeAttempt = undefined;
  }

  private attemptReport(attempt: AttemptState, outcome: PlaytestOutcome, now: number): PlaytestAttemptReport {
    return {
      mapId: attempt.mapId,
      difficulty: attempt.difficulty,
      ordinal: attempt.ordinal,
      durationMs: Math.max(0, Math.round(now - attempt.startedAt)),
      outcome,
      firstActionsMs: { ...attempt.firstActionsMs },
    };
  }
}
