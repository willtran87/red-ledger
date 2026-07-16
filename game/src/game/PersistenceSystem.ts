export const SAVE_SCHEMA_VERSION = 1;
export const CAMPAIGN_SCHEMA_VERSION = 2;
export const OLDEST_SUPPORTED_SAVE_SCHEMA_VERSION = 1;
export const OLDEST_SUPPORTED_CAMPAIGN_SCHEMA_VERSION = 1;
export const DEMO_SCHEMA_VERSION = 3;
/** Leaves room for the replay-library wrapper inside its 3.5 MB UTF-16 budget. */
export const DEMO_STORAGE_BUDGET_BYTES = 3_000_000;
export const MANUAL_SLOT_COUNT = 8;
export const AUTOSAVE_SLOT_COUNT = 3;
const CAMPAIGN_MUTATION_STABILITY_MS = 5_000;
const MAX_CONFLICT_COPIES_PER_SLOT = 2;
const MAX_CONFLICT_COPIES_TOTAL = 8;

export type SaveKind = 'manual' | 'quicksave' | 'autosave' | 'recovery' | 'conflict';
export type SlotStatus = 'empty' | 'valid' | 'invalid';
export type PerformanceGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface MapPerformance {
  readonly mapId: string;
  readonly difficulty: string;
  readonly elapsed: number;
  readonly parSeconds: number;
  readonly score: number;
  readonly bestChain: number;
  readonly killsPercent: number;
  readonly itemsPercent: number;
  readonly secretsPercent: number;
  readonly grade: PerformanceGrade;
}

export interface MapRecord {
  readonly mapId: string;
  readonly difficulty: string;
  readonly completions: number;
  readonly bestTime: number;
  readonly highScore: number;
  readonly bestChain: number;
  readonly bestKillsPercent: number;
  readonly bestItemsPercent: number;
  readonly bestSecretsPercent: number;
  readonly bestGrade: PerformanceGrade;
  readonly parBeaten: boolean;
  readonly achievedAt: number;
}

export interface SaveThumbnailPlaceholder {
  readonly kind: 'placeholder';
  readonly label: string;
  readonly palette: readonly [string, string];
}

export interface SaveThumbnailImage {
  readonly kind: 'image';
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

export type SaveThumbnail = SaveThumbnailPlaceholder | SaveThumbnailImage;

export interface SaveMetadata {
  readonly slotId: string;
  readonly kind: SaveKind;
  readonly name: string;
  readonly savedAt: number;
  readonly sequence: number;
  readonly episodeId: string;
  readonly mapId: string;
  readonly mapTitle: string;
  readonly difficulty: string;
  readonly playSeconds: number;
  readonly thumbnail: SaveThumbnail;
}

export interface SaveMetadataInput {
  readonly name?: string;
  readonly episodeId: string;
  readonly mapId: string;
  readonly mapTitle?: string;
  readonly difficulty: string;
  readonly playSeconds: number;
  readonly thumbnail?: SaveThumbnail;
}

interface SaveEnvelope<TState> {
  readonly schema: 'red-ledger-save';
  readonly version: number;
  readonly gameVersion: string;
  readonly metadata: SaveMetadata;
  readonly state: TState;
  readonly checksum: string;
}

export interface EmptySlotResult {
  readonly status: 'empty';
  readonly slotId: string;
  readonly kind: SaveKind;
  readonly defaultName: string;
}

export interface ValidSlotResult<TState> {
  readonly status: 'valid';
  readonly slotId: string;
  readonly kind: SaveKind;
  readonly defaultName: string;
  readonly metadata: SaveMetadata;
  readonly state: TState;
  /** Persistent survives a new browser session; memory-only survives only in this tab. */
  readonly persistence: 'persistent' | 'memory-only';
}

export interface InvalidSlotResult {
  readonly status: 'invalid';
  readonly slotId: string;
  readonly kind: SaveKind;
  readonly defaultName: string;
  readonly reason: string;
}

export type SaveSlotResult<TState> = EmptySlotResult | ValidSlotResult<TState> | InvalidSlotResult;

export interface CampaignUnlocks {
  readonly unlockedEpisodes: readonly string[];
  readonly completedEpisodes: readonly string[];
  readonly completedMaps: readonly string[];
  readonly discoveredSecretMaps: readonly string[];
  readonly records: Readonly<Record<string, MapRecord>>;
  readonly updatedAt: number;
}

interface CampaignEnvelope {
  readonly schema: 'red-ledger-campaign';
  readonly version: number;
  readonly progress: CampaignUnlocks;
  /** Unknown to schema-2 readers; used only to make recent cross-tab mutations idempotent. */
  readonly appliedMutations?: readonly string[];
  readonly checksum: string;
}

interface CampaignCommitEnvelope {
  readonly schema: 'red-ledger-campaign-commits';
  readonly version: 1;
  readonly mutationIds: readonly string[];
  readonly checksum: string;
}

export interface PersistenceOptions<TState> {
  readonly namespace?: string;
  readonly gameVersion?: string;
  readonly episodeIds?: readonly string[];
  readonly initialUnlockedEpisodes?: readonly string[];
  readonly validateState?: (state: unknown) => state is TState;
  readonly now?: () => number;
  /** Stable for one tab. Primarily exposed for deterministic tests and embedded hosts. */
  readonly writerId?: string;
}

export type PersistenceStorageOperation = 'read' | 'write' | 'remove';

export interface PersistenceStorageFailure {
  readonly operation: PersistenceStorageOperation;
  readonly key: string;
  readonly name: string;
  readonly reason: string;
}

export interface PersistenceStorageStatus {
  readonly mode: 'persistent' | 'memory-fallback';
  readonly failureCount: number;
  readonly volatileKeyCount: number;
  readonly lastFailure?: PersistenceStorageFailure;
}

export const PERSISTENCE_DEGRADED_EVENT = 'red-ledger-persistence-degraded';
export const PERSISTENCE_CONFLICT_EVENT = 'red-ledger-persistence-conflict';

export interface PersistenceConflict {
  readonly kind: 'campaign-merge' | 'campaign-recovery' | 'save-recovery' | 'delete-conflict';
  readonly key: string;
  readonly message: string;
}

type CampaignMutation =
  | { readonly type: 'unlock-episode'; readonly episodeId: string }
  | {
    readonly type: 'complete-map';
    readonly mapId: string;
    readonly performance?: MapPerformance;
    readonly discoveredSecretMap?: string;
  }
  | { readonly type: 'complete-episode'; readonly episodeId: string; readonly unlockNextEpisodeId?: string };

interface CampaignMutationEnvelope {
  readonly schema: 'red-ledger-campaign-mutation';
  readonly version: 1;
  readonly id: string;
  readonly writerId: string;
  readonly createdAt: number;
  readonly mutation: CampaignMutation;
  readonly checksum: string;
}

interface ReconciledCampaign {
  readonly progress: CampaignUnlocks;
  readonly appliedMutations: readonly string[];
  readonly activeJournals: readonly CampaignMutationEnvelope[];
  readonly targetKey: string;
  readonly targetRaw: string | null;
  readonly targetWritable: boolean;
  readonly checkpointRequired: boolean;
  readonly cleanupKeys: readonly string[];
  readonly revealKeys: readonly string[];
}

interface CampaignRecordSnapshot {
  readonly key: string;
  readonly raw: string | null;
  readonly progress: CampaignUnlocks;
  readonly appliedMutations: readonly string[];
  readonly validEnvelope: boolean;
  readonly writable: boolean;
}

interface SaveShadowEnvelope<TState> {
  readonly schema: 'red-ledger-save-shadow';
  readonly version: 1;
  readonly id: string;
  readonly writerId: string;
  readonly createdAt: number;
  readonly source: SlotDescriptor;
  readonly save: SaveEnvelope<TState>;
  readonly checksum: string;
}

/**
 * Compatibility policy for durable player data.
 *
 * Save state is application-owned and therefore requires both schema 1 and the exact gameVersion.
 * Campaign schema 1 is the original public format; schema 2 adds mastery records and secret-map
 * discovery. Its migration only supplies empty defaults. Ordinary reads never rewrite storage;
 * validated mutation journals may be checkpointed after a stability window. Unknown fields in
 * supported envelopes are preserved. Corrupt, older, and future envelopes remain untouched so
 * another build or a recovery tool can inspect them.
 */
export const PERSISTENCE_COMPATIBILITY_POLICY = Object.freeze({
  saves: Object.freeze({
    currentVersion: SAVE_SCHEMA_VERSION,
    oldestSupportedVersion: OLDEST_SUPPORTED_SAVE_SCHEMA_VERSION,
    requiresExactGameVersion: true,
  }),
  campaign: Object.freeze({
    currentVersion: CAMPAIGN_SCHEMA_VERSION,
    oldestSupportedVersion: OLDEST_SUPPORTED_CAMPAIGN_SCHEMA_VERSION,
    legacyDefaults: Object.freeze({ discoveredSecretMaps: true, records: true }),
  }),
});

interface SlotDescriptor {
  readonly id: string;
  readonly kind: SaveKind;
  readonly defaultName: string;
}

export interface DemoFrame<TCommand> {
  readonly tick: number;
  readonly commands: readonly TCommand[];
  /** Consecutive ticks that repeat this command list. Omitted for single-tick frames. */
  readonly duration?: number;
}

export interface DemoData<TInitialState, TCommand> {
  readonly schema: 'red-ledger-demo';
  readonly version: number;
  readonly tickRate: number;
  readonly seed: number;
  readonly mapId: string;
  readonly createdAt: number;
  readonly initialState: TInitialState;
  readonly frames: readonly DemoFrame<TCommand>[];
  readonly totalTicks: number;
  readonly checksum: string;
}

export type DemoValidation<TInitialState, TCommand> =
  | { readonly valid: true; readonly demo: DemoData<TInitialState, TCommand> }
  | { readonly valid: false; readonly reason: string };

export interface DemoRecorderOptions<TInitialState> {
  readonly tickRate?: number;
  readonly seed: number;
  readonly mapId: string;
  readonly initialState: TInitialState;
  readonly createdAt?: number;
  /** Maximum JSON storage footprint, measured as UTF-16 bytes like localStorage. */
  readonly maxSerializedBytes?: number;
}

export interface DemoValidationOptions<TInitialState, TCommand> {
  readonly validateInitialState?: (value: unknown) => value is TInitialState;
  readonly validateCommand?: (value: unknown) => value is TCommand;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Stable JSON is shared by save and demo checksums so object insertion order is irrelevant. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Persistence data may only contain finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) {
    const entries = Object.keys(value).sort().map((key) => {
      const entry = value[key];
      if (entry === undefined) throw new TypeError('Persistence data may not contain undefined values');
      return `${JSON.stringify(key)}:${stableStringify(entry)}`;
    });
    return `{${entries.join(',')}}`;
  }
  throw new TypeError(`Unsupported persistence value: ${typeof value}`);
}

/** FNV-1a is intentionally small and deterministic; this detects corruption, it is not authentication. */
export function checksum(value: unknown): string {
  const input = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const withChecksum = <T extends Record<string, unknown>>(value: T): T & { readonly checksum: string } => ({
  ...value,
  checksum: checksum(value),
});

const verifyChecksum = (value: Record<string, unknown>): boolean => {
  const { checksum: stored, ...unsigned } = value;
  return typeof stored === 'string' && checksum(unsigned) === stored;
};

const normalizeStringList = (values: readonly string[]): string[] =>
  [...new Set(values.filter((value) => value.length > 0))].sort();

const GRADES: readonly PerformanceGrade[] = ['S', 'A', 'B', 'C', 'D'];
const isPerformanceGrade = (value: unknown): value is PerformanceGrade => GRADES.includes(value as PerformanceGrade);
const isMapRecord = (value: unknown): value is MapRecord => isRecord(value)
  && typeof value.mapId === 'string'
  && typeof value.difficulty === 'string'
  && Number.isSafeInteger(value.completions) && Number(value.completions) > 0
  && ['bestTime', 'highScore', 'bestChain', 'bestKillsPercent', 'bestItemsPercent', 'bestSecretsPercent', 'achievedAt']
    .every((key) => Number.isFinite(value[key]))
  && isPerformanceGrade(value.bestGrade)
  && typeof value.parBeaten === 'boolean';

const migrateCampaignEnvelope = (value: unknown): CampaignUnlocks | undefined => {
  if (!isRecord(value)
    || value.schema !== 'red-ledger-campaign'
    || !Number.isSafeInteger(value.version)
    || Number(value.version) < OLDEST_SUPPORTED_CAMPAIGN_SCHEMA_VERSION
    || Number(value.version) > CAMPAIGN_SCHEMA_VERSION
    || !verifyChecksum(value)
    || !isRecord(value.progress)) return undefined;

  const version = Number(value.version);
  const progress = value.progress;
  const hasLegacyOrValidSecretMaps = version === 1
    ? progress.discoveredSecretMaps === undefined || Array.isArray(progress.discoveredSecretMaps)
    : Array.isArray(progress.discoveredSecretMaps);
  const hasLegacyOrValidRecords = version === 1
    ? progress.records === undefined || isRecord(progress.records)
    : isRecord(progress.records);
  if (!Array.isArray(progress.unlockedEpisodes)
    || !Array.isArray(progress.completedEpisodes)
    || !Array.isArray(progress.completedMaps)
    || !hasLegacyOrValidSecretMaps
    || !hasLegacyOrValidRecords
    || (isRecord(progress.records) && !Object.values(progress.records).every(isMapRecord))
    || !Number.isFinite(progress.updatedAt)
    || [...progress.unlockedEpisodes, ...progress.completedEpisodes, ...progress.completedMaps,
      ...(progress.discoveredSecretMaps as unknown[] | undefined ?? [])]
      .some((entry) => typeof entry !== 'string')) return undefined;

  return {
    unlockedEpisodes: normalizeStringList(progress.unlockedEpisodes as string[]),
    completedEpisodes: normalizeStringList(progress.completedEpisodes as string[]),
    completedMaps: normalizeStringList(progress.completedMaps as string[]),
    discoveredSecretMaps: normalizeStringList(progress.discoveredSecretMaps as string[] | undefined ?? []),
    records: { ...(progress.records as Record<string, MapRecord> | undefined ?? {}) },
    updatedAt: progress.updatedAt as number,
  };
};

export const mapRecordKey = (mapId: string, difficulty: string): string => `${mapId}:${difficulty}`;

const mergeMapRecord = (previous: MapRecord | undefined, performance: MapPerformance, achievedAt: number): MapRecord => ({
  mapId: performance.mapId,
  difficulty: performance.difficulty,
  completions: (previous?.completions ?? 0) + 1,
  bestTime: previous ? Math.min(previous.bestTime, performance.elapsed) : performance.elapsed,
  highScore: Math.max(previous?.highScore ?? 0, performance.score),
  bestChain: Math.max(previous?.bestChain ?? 0, performance.bestChain),
  bestKillsPercent: Math.max(previous?.bestKillsPercent ?? 0, performance.killsPercent),
  bestItemsPercent: Math.max(previous?.bestItemsPercent ?? 0, performance.itemsPercent),
  bestSecretsPercent: Math.max(previous?.bestSecretsPercent ?? 0, performance.secretsPercent),
  bestGrade: !previous || GRADES.indexOf(performance.grade) < GRADES.indexOf(previous.bestGrade) ? performance.grade : previous.bestGrade,
  parBeaten: Boolean(previous?.parBeaten || performance.elapsed <= performance.parSeconds),
  achievedAt,
});

const isMapPerformance = (value: unknown): value is MapPerformance => isRecord(value)
  && typeof value.mapId === 'string'
  && typeof value.difficulty === 'string'
  && ['elapsed', 'parSeconds', 'score', 'bestChain', 'killsPercent', 'itemsPercent', 'secretsPercent']
    .every((key) => Number.isFinite(value[key]))
  && isPerformanceGrade(value.grade);

const isCampaignMutation = (value: unknown): value is CampaignMutation => {
  if (!isRecord(value)) return false;
  if (value.type === 'unlock-episode') return typeof value.episodeId === 'string' && value.episodeId.length > 0;
  if (value.type === 'complete-episode') {
    return typeof value.episodeId === 'string'
      && value.episodeId.length > 0
      && (value.unlockNextEpisodeId === undefined || typeof value.unlockNextEpisodeId === 'string');
  }
  return value.type === 'complete-map'
    && typeof value.mapId === 'string'
    && value.mapId.length > 0
    && (value.performance === undefined || isMapPerformance(value.performance))
    && (value.discoveredSecretMap === undefined || typeof value.discoveredSecretMap === 'string');
};

const migrateCampaignMutation = (value: unknown): CampaignMutationEnvelope | undefined => {
  if (!isRecord(value)
    || value.schema !== 'red-ledger-campaign-mutation'
    || value.version !== 1
    || typeof value.id !== 'string'
    || typeof value.writerId !== 'string'
    || !Number.isFinite(value.createdAt)
    || !isCampaignMutation(value.mutation)
    || !verifyChecksum(value)) return undefined;
  return value as unknown as CampaignMutationEnvelope;
};

const migrateCampaignCommits = (value: unknown): CampaignCommitEnvelope | undefined => {
  if (!isRecord(value)
    || value.schema !== 'red-ledger-campaign-commits'
    || value.version !== 1
    || !Array.isArray(value.mutationIds)
    || !value.mutationIds.every((id) => typeof id === 'string' && id.length > 0)
    || !verifyChecksum(value)) return undefined;
  return value as unknown as CampaignCommitEnvelope;
};

const applyCampaignMutation = (current: CampaignUnlocks, envelope: CampaignMutationEnvelope): CampaignUnlocks => {
  const updatedAt = Math.max(current.updatedAt, envelope.createdAt);
  const mutation = envelope.mutation;
  if (mutation.type === 'unlock-episode') return {
    ...current,
    unlockedEpisodes: normalizeStringList([...current.unlockedEpisodes, mutation.episodeId]),
    updatedAt,
  };
  if (mutation.type === 'complete-episode') return {
    ...current,
    unlockedEpisodes: normalizeStringList([
      ...current.unlockedEpisodes,
      mutation.episodeId,
      ...(mutation.unlockNextEpisodeId ? [mutation.unlockNextEpisodeId] : []),
    ]),
    completedEpisodes: normalizeStringList([...current.completedEpisodes, mutation.episodeId]),
    updatedAt,
  };

  const records = { ...current.records };
  if (mutation.performance) {
    const key = mapRecordKey(mutation.performance.mapId, mutation.performance.difficulty);
    records[key] = mergeMapRecord(
      records[key],
      mutation.performance,
      Math.max(records[key]?.achievedAt ?? 0, envelope.createdAt),
    );
  }
  return {
    ...current,
    completedMaps: normalizeStringList([...current.completedMaps, mutation.mapId]),
    discoveredSecretMaps: normalizeStringList([
      ...current.discoveredSecretMaps,
      ...(mutation.discoveredSecretMap ? [mutation.discoveredSecretMap] : []),
    ]),
    records,
    updatedAt,
  };
};

const mergeCampaignRecords = (left: MapRecord, right: MapRecord): MapRecord => ({
  ...left,
  completions: Math.max(left.completions, right.completions),
  bestTime: Math.min(left.bestTime, right.bestTime),
  highScore: Math.max(left.highScore, right.highScore),
  bestChain: Math.max(left.bestChain, right.bestChain),
  bestKillsPercent: Math.max(left.bestKillsPercent, right.bestKillsPercent),
  bestItemsPercent: Math.max(left.bestItemsPercent, right.bestItemsPercent),
  bestSecretsPercent: Math.max(left.bestSecretsPercent, right.bestSecretsPercent),
  bestGrade: GRADES.indexOf(left.bestGrade) <= GRADES.indexOf(right.bestGrade) ? left.bestGrade : right.bestGrade,
  parBeaten: left.parBeaten || right.parBeaten,
  achievedAt: Math.max(left.achievedAt, right.achievedAt),
});

const mergeCampaignProgress = (left: CampaignUnlocks, right: CampaignUnlocks): CampaignUnlocks => {
  const records = { ...left.records };
  Object.entries(right.records).forEach(([key, record]) => {
    records[key] = records[key] ? mergeCampaignRecords(records[key], record) : record;
  });
  return {
    unlockedEpisodes: normalizeStringList([...left.unlockedEpisodes, ...right.unlockedEpisodes]),
    completedEpisodes: normalizeStringList([...left.completedEpisodes, ...right.completedEpisodes]),
    completedMaps: normalizeStringList([...left.completedMaps, ...right.completedMaps]),
    discoveredSecretMaps: normalizeStringList([...left.discoveredSecretMaps, ...right.discoveredSecretMaps]),
    records,
    updatedAt: Math.max(left.updatedAt, right.updatedAt),
  };
};

const isSaveThumbnail = (value: unknown): value is SaveThumbnail => {
  if (!isRecord(value)) return false;
  if (value.kind === 'image') {
    return typeof value.dataUrl === 'string'
      && /^data:image\/(?:png|webp|jpeg);base64,/.test(value.dataUrl)
      && Number.isSafeInteger(value.width)
      && Number.isSafeInteger(value.height)
      && Number(value.width) > 0
      && Number(value.height) > 0;
  }
  return value.kind === 'placeholder'
    && typeof value.label === 'string'
    && Array.isArray(value.palette)
    && value.palette.length === 2
    && value.palette.every((color) => typeof color === 'string');
};

const isSaveMetadata = (value: unknown): value is SaveMetadata => {
  if (!isRecord(value) || !isSaveThumbnail(value.thumbnail)) return false;
  return typeof value.slotId === 'string'
    && ['manual', 'quicksave', 'autosave', 'recovery'].includes(String(value.kind))
    && typeof value.name === 'string'
    && Number.isFinite(value.savedAt)
    && Number.isSafeInteger(value.sequence)
    && typeof value.episodeId === 'string'
    && typeof value.mapId === 'string'
    && typeof value.mapTitle === 'string'
    && typeof value.difficulty === 'string'
    && Number.isFinite(value.playSeconds);
};

const manualDescriptor = (slot: number): SlotDescriptor => {
  if (!Number.isInteger(slot) || slot < 1 || slot > MANUAL_SLOT_COUNT) {
    throw new RangeError(`Manual slot must be between 1 and ${MANUAL_SLOT_COUNT}`);
  }
  return { id: `manual-${slot}`, kind: 'manual', defaultName: `Manual ${slot}` };
};

const quickDescriptor: SlotDescriptor = { id: 'quicksave', kind: 'quicksave', defaultName: 'Quicksave' };
const autoDescriptor = (slot: number): SlotDescriptor => ({ id: `autosave-${slot}`, kind: 'autosave', defaultName: `Autosave ${slot}` });
const recoveryDescriptor = (episodeId: string): SlotDescriptor => ({
  id: `recovery-${encodeURIComponent(episodeId)}`,
  kind: 'recovery',
  defaultName: 'Episode Recovery',
});

const createWriterId = (): string => typeof globalThis.crypto?.randomUUID === 'function'
  ? globalThis.crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const normalizeWriterId = (value: string): string => {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  if (!normalized) throw new TypeError('Persistence writer id may not be empty');
  return normalized;
};

export class PersistenceSystem<TState> {
  private readonly namespace: string;
  private readonly gameVersion: string;
  private readonly writerId: string;
  private readonly episodeIds: readonly string[];
  private readonly initialUnlockedEpisodes: readonly string[];
  private readonly validateState?: (state: unknown) => state is TState;
  private readonly now: () => number;
  private readonly memoryFallback = new Map<string, string>();
  private readonly volatileKeys = new Set<string>();
  private readonly volatileDurableBaselines = new Map<string, string | null>();
  private readonly pendingRemovals = new Set<string>();
  private readonly observedSlots = new Map<string, string | null>();
  private readonly observedSlotDescriptors = new Map<string, SlotDescriptor>();
  private readonly reportedConflicts = new Set<string>();
  private readonly conflictHistory: PersistenceConflict[] = [];
  private readonly unresolvedExternalSlots = new Set<string>();
  private readonly unpersistedExternalSlots = new Set<string>();
  private readonly scheduledCampaignCleanup = new Set<string>();
  private readonly protectedCampaignRecords = new Set<string>();
  private readonly shadowedCampaignRecords = new Set<string>();
  private campaignCommitLedgerProtected = false;
  private mutationSequence = 0;
  private storageReadUnavailable = false;
  private storageFailureCount = 0;
  private lastStorageFailure?: PersistenceStorageFailure;

  constructor(private readonly storage: Storage, options: PersistenceOptions<TState> = {}) {
    this.namespace = options.namespace ?? 'red-ledger';
    this.gameVersion = options.gameVersion ?? '1';
    this.writerId = normalizeWriterId(options.writerId ?? createWriterId());
    this.episodeIds = normalizeStringList(options.episodeIds ?? []);
    this.initialUnlockedEpisodes = normalizeStringList(options.initialUnlockedEpisodes ?? this.episodeIds.slice(0, 1));
    this.validateState = options.validateState;
    this.now = options.now ?? Date.now;
    if (typeof window !== 'undefined') window.addEventListener('storage', this.handleStorageEvent);
  }

  storageStatus(): PersistenceStorageStatus {
    return {
      mode: this.storageReadUnavailable || this.volatileKeys.size > 0 ? 'memory-fallback' : 'persistent',
      failureCount: this.storageFailureCount,
      volatileKeyCount: this.volatileKeys.size,
      ...(this.lastStorageFailure ? { lastFailure: { ...this.lastStorageFailure } } : {}),
    };
  }

  conflicts(): readonly PersistenceConflict[] {
    return this.conflictHistory.map((conflict) => ({ ...conflict }));
  }

  saveManual(slot: number, state: TState, metadata: SaveMetadataInput): ValidSlotResult<TState> {
    return this.writeSlot(manualDescriptor(slot), state, metadata);
  }

  loadManual(slot: number): SaveSlotResult<TState> {
    return this.readSlot(manualDescriptor(slot));
  }

  listManualSlots(): readonly SaveSlotResult<TState>[] {
    return Array.from({ length: MANUAL_SLOT_COUNT }, (_, index) => this.loadManual(index + 1));
  }

  quicksave(state: TState, metadata: SaveMetadataInput): ValidSlotResult<TState> {
    return this.writeSlot(quickDescriptor, state, metadata);
  }

  loadQuicksave(): SaveSlotResult<TState> {
    return this.readSlot(quickDescriptor);
  }

  autosave(state: TState, metadata: SaveMetadataInput): ValidSlotResult<TState> {
    const cursorKey = this.key('autosave-cursor');
    const current = Number.parseInt(this.getItem(cursorKey) ?? '0', 10);
    const next = Number.isSafeInteger(current) && current >= 0 ? current % AUTOSAVE_SLOT_COUNT + 1 : 1;
    const result = this.writeSlot(autoDescriptor(next), state, metadata);
    this.setItem(cursorKey, String(next));
    return result;
  }

  listAutosaves(): readonly SaveSlotResult<TState>[] {
    return Array.from({ length: AUTOSAVE_SLOT_COUNT }, (_, index) => this.readSlot(autoDescriptor(index + 1)));
  }

  saveEpisodeRecovery(episodeId: string, state: TState, metadata: Omit<SaveMetadataInput, 'episodeId'>): ValidSlotResult<TState> {
    if (episodeId.length === 0) throw new TypeError('Episode id may not be empty');
    this.rememberRecoveryEpisode(episodeId);
    return this.writeSlot(recoveryDescriptor(episodeId), state, { ...metadata, episodeId });
  }

  loadEpisodeRecovery(episodeId: string): SaveSlotResult<TState> {
    return this.readSlot(recoveryDescriptor(episodeId));
  }

  listEpisodeRecoveries(): readonly SaveSlotResult<TState>[] {
    return this.recoveryEpisodes().map((episodeId) => this.loadEpisodeRecovery(episodeId));
  }

  newestValidContinue(): ValidSlotResult<TState> | undefined {
    const candidates = [
      ...this.listManualSlots(),
      this.loadQuicksave(),
      ...this.listAutosaves(),
      ...this.listEpisodeRecoveries(),
      ...this.listSaveConflictRecoveries(),
    ].filter((slot): slot is ValidSlotResult<TState> => slot.status === 'valid');
    return candidates.sort((left, right) =>
      right.metadata.savedAt - left.metadata.savedAt
      || right.metadata.sequence - left.metadata.sequence
      || left.slotId.localeCompare(right.slotId))[0];
  }

  inspectAllSlots(): readonly SaveSlotResult<TState>[] {
    return [
      ...this.listManualSlots(),
      this.loadQuicksave(),
      ...this.listAutosaves(),
      ...this.listEpisodeRecoveries(),
      ...this.listSaveConflictRecoveries(),
    ];
  }

  clearManual(slot: number): void {
    this.clearSlot(manualDescriptor(slot));
  }

  clearQuicksave(): void {
    this.clearSlot(quickDescriptor);
  }

  campaignUnlocks(): CampaignUnlocks {
    const reconciled = this.reconciledCampaign();
    if (reconciled.targetWritable && (reconciled.activeJournals.length > 0 || reconciled.checkpointRequired)) {
      const targetRaw = this.encodeCampaign(
        reconciled.progress,
        reconciled.appliedMutations,
        reconciled.targetRaw,
      );
      if (this.persistVolatileCampaignMutations() && this.setItem(reconciled.targetKey, targetRaw) === 'persistent') {
        this.finishCampaignCheckpoint(reconciled);
      }
    }
    return reconciled.progress;
  }

  unlockEpisode(episodeId: string): CampaignUnlocks {
    if (!episodeId) throw new TypeError('Episode id may not be empty');
    return this.recordCampaignMutation({ type: 'unlock-episode', episodeId }, this.now());
  }

  completeMap(mapId: string, performance?: MapPerformance, discoveredSecretMap?: string): CampaignUnlocks {
    const achievedAt = this.now();
    return this.recordCampaignMutation({
      type: 'complete-map',
      mapId,
      ...(performance ? { performance } : {}),
      ...(discoveredSecretMap ? { discoveredSecretMap } : {}),
    }, achievedAt);
  }

  completeEpisode(episodeId: string, unlockNextEpisodeId?: string): CampaignUnlocks {
    if (!episodeId) throw new TypeError('Episode id may not be empty');
    return this.recordCampaignMutation({
      type: 'complete-episode',
      episodeId,
      ...(unlockNextEpisodeId ? { unlockNextEpisodeId } : {}),
    }, this.now());
  }

  isEpisodeUnlocked(episodeId: string): boolean {
    return this.campaignUnlocks().unlockedEpisodes.includes(episodeId);
  }

  private recordCampaignMutation(mutation: CampaignMutation, createdAt: number): CampaignUnlocks {
    const id = `${this.writerId}-${createdAt.toString(36)}-${(++this.mutationSequence).toString(36)}`;
    const unsigned = {
      schema: 'red-ledger-campaign-mutation' as const,
      version: 1 as const,
      id,
      writerId: this.writerId,
      createdAt,
      mutation,
    };
    const envelope: CampaignMutationEnvelope = withChecksum(unsigned);
    const journalKey = this.campaignMutationKey(id);
    this.setItem(journalKey, JSON.stringify(envelope));
    const journalsDurable = this.persistVolatileCampaignMutations();
    const reconciled = this.reconciledCampaign();
    const targetRaw = this.encodeCampaign(
      reconciled.progress,
      reconciled.appliedMutations,
      reconciled.targetRaw,
    );
    const campaignPersistence = journalsDurable && reconciled.targetWritable
      ? this.setItem(reconciled.targetKey, targetRaw)
      : this.keepMemoryOnly(reconciled.targetKey, targetRaw);
    if (campaignPersistence === 'persistent') this.finishCampaignCheckpoint(reconciled);
    return reconciled.progress;
  }

  private reconciledCampaign(): ReconciledCampaign {
    const campaignKey = this.key('campaign');
    const recoveryKeys = [this.key('campaign-recovery'), this.key(`campaign-recovery-v${CAMPAIGN_SCHEMA_VERSION}`)];
    const canonical = this.campaignRecord(campaignKey);
    const recoveries = recoveryKeys.map((key) => this.campaignRecord(key));
    const validRecoveries = recoveries.filter((record) => record.validEnvelope);
    const canonicalProtected = canonical.raw !== null && !canonical.writable;
    let target = canonical;
    let progress = canonical.progress;
    const applied = new Set(canonical.appliedMutations);
    let checkpointRequired = false;
    let cleanupKeys: string[] = [];
    let revealKeys: string[] = [];

    if (canonicalProtected) {
      this.reportConflict({
        kind: 'campaign-recovery',
        key: campaignKey,
        message: 'Campaign progress is being saved to a recovery record because the primary record belongs to another build or is unreadable.',
      });
      progress = canonical.progress;
      canonical.appliedMutations.forEach((id) => applied.add(id));
      validRecoveries.forEach((record) => {
        progress = mergeCampaignProgress(progress, record.progress);
        record.appliedMutations.forEach((id) => applied.add(id));
      });
      target = validRecoveries.find((record) => record.writable)
        ?? recoveries.find((record) => record.raw === null && record.writable)
        ?? recoveries.find((record) => record.writable)
        ?? recoveries[recoveries.length - 1];
      checkpointRequired = (canonical.validEnvelope && !canonical.writable)
        || (validRecoveries.length > 0 && (!target.validEnvelope || validRecoveries.length > 1));
      cleanupKeys = validRecoveries
        .filter((record) => record.key !== target.key && record.writable)
        .map((record) => record.key);
      revealKeys = [canonical, ...validRecoveries]
        .filter((record) => record.key !== target.key
          && record.validEnvelope
          && !record.writable
          && this.volatileKeys.has(record.key))
        .map((record) => record.key);
    } else {
      validRecoveries.forEach((record) => {
        progress = mergeCampaignProgress(progress, record.progress);
        record.appliedMutations.forEach((id) => applied.add(id));
      });
      checkpointRequired = validRecoveries.length > 0;
      cleanupKeys = validRecoveries.filter((record) => record.writable).map((record) => record.key);
      revealKeys = validRecoveries
        .filter((record) => !record.writable && this.volatileKeys.has(record.key))
        .map((record) => record.key);
    }

    if (target.key === campaignKey && canonical.validEnvelope && canonical.writable) {
      this.readCampaignCommitIds().forEach((id) => applied.add(id));
    }

    const journals = this.keysWithPrefix(this.key('campaign-mutation:')).flatMap((key) => {
      const raw = this.getItem(key);
      if (!raw) return [];
      try {
        const envelope = migrateCampaignMutation(JSON.parse(raw));
        return envelope ? [{ key, envelope }] : [];
      } catch {
        return [];
      }
    }).sort((left, right) => left.envelope.createdAt - right.envelope.createdAt
      || left.envelope.id.localeCompare(right.envelope.id));

    journals.forEach(({ key, envelope }) => {
      if (applied.has(envelope.id)) return;
      progress = applyCampaignMutation(progress, envelope);
      applied.add(envelope.id);
      if (envelope.writerId !== this.writerId) this.reportConflict({
        kind: 'campaign-merge',
        key,
        message: 'Campaign progress from another tab was merged without replacing this tab\'s progress.',
      });
    });
    const activeJournalIds = new Set(journals.map(({ envelope }) => envelope.id));
    return {
      progress,
      appliedMutations: [...applied].filter((id) => activeJournalIds.has(id)).sort(),
      activeJournals: journals.map(({ envelope }) => envelope),
      targetKey: target.key,
      targetRaw: target.raw,
      targetWritable: target.writable,
      checkpointRequired,
      cleanupKeys,
      revealKeys,
    };
  }

  private campaignRecord(key: string): CampaignRecordSnapshot {
    const wasVolatile = this.volatileKeys.has(key);
    const raw = this.getItem(key);
    if (raw === null) {
      if (!wasVolatile) this.protectedCampaignRecords.delete(key);
      return {
        key,
        raw,
        progress: this.emptyCampaign(),
        appliedMutations: [],
        validEnvelope: false,
        writable: !this.protectedCampaignRecords.has(key),
      };
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      const progress = migrateCampaignEnvelope(parsed);
      if (progress) {
        if (!wasVolatile) this.protectedCampaignRecords.delete(key);
        const appliedMutations = isRecord(parsed) && Array.isArray(parsed.appliedMutations)
          ? parsed.appliedMutations.filter((id): id is string => typeof id === 'string' && id.length > 0)
          : [];
        return {
          key,
          raw,
          progress,
          appliedMutations: normalizeStringList(appliedMutations),
          validEnvelope: true,
          writable: !this.protectedCampaignRecords.has(key),
        };
      }
    } catch {
      // Protected records remain available for another build or a recovery tool.
    }
    if (!wasVolatile) this.protectedCampaignRecords.add(key);
    return {
      key,
      raw,
      progress: this.emptyCampaign(),
      appliedMutations: [],
      validEnvelope: false,
      writable: !this.protectedCampaignRecords.has(key),
    };
  }

  private finishCampaignCheckpoint(reconciled: ReconciledCampaign): void {
    if (reconciled.targetKey === this.key('campaign')) this.writeCampaignCommitIds(reconciled.appliedMutations);
    reconciled.activeJournals.forEach((journal) => this.scheduleCampaignMutationCleanup(journal.id));
    reconciled.cleanupKeys.forEach((key) => { if (key !== reconciled.targetKey) this.removeItem(key); });
    reconciled.revealKeys.forEach((key) => {
      this.memoryFallback.delete(key);
      this.volatileKeys.delete(key);
      this.volatileDurableBaselines.delete(key);
      this.shadowedCampaignRecords.delete(key);
    });
  }

  private emptyCampaign(): CampaignUnlocks {
    return {
      unlockedEpisodes: this.initialUnlockedEpisodes,
      completedEpisodes: [],
      completedMaps: [],
      discoveredSecretMaps: [],
      records: {},
      updatedAt: 0,
    };
  }

  private writeSlot(descriptor: SlotDescriptor, state: TState, input: SaveMetadataInput): ValidSlotResult<TState> {
    // Validate serializability before touching storage, preserving the previous save on failure.
    stableStringify(state);
    const sequence = this.nextSequence();
    const metadata: SaveMetadata = {
      slotId: descriptor.id,
      kind: descriptor.kind,
      name: input.name?.trim() || descriptor.defaultName,
      savedAt: this.now(),
      sequence,
      episodeId: input.episodeId,
      mapId: input.mapId,
      mapTitle: input.mapTitle ?? input.mapId,
      difficulty: input.difficulty,
      playSeconds: Math.max(0, input.playSeconds),
      thumbnail: input.thumbnail ?? {
        kind: 'placeholder',
        label: input.mapId,
        palette: ['#d71920', '#f2f0e6'],
      },
    };
    const unsigned = {
      schema: 'red-ledger-save' as const,
      version: SAVE_SCHEMA_VERSION,
      gameVersion: this.gameVersion,
      metadata,
      state,
    };
    const envelope: SaveEnvelope<TState> = withChecksum(unsigned);
    const slotKey = this.slotKey(descriptor);
    this.observedSlotDescriptors.set(slotKey, descriptor);
    const currentRaw = this.getItem(slotKey);
    const hadObservation = this.observedSlots.has(slotKey);
    const observedRaw = this.observedSlots.get(slotKey) ?? null;
    let externalVersionProtected = this.persistVolatileSaveShadows(descriptor);
    if (hadObservation && currentRaw !== observedRaw && currentRaw !== null) {
      const shadowPersistence = this.preserveSaveShadow(descriptor, currentRaw, metadata.savedAt);
      if (shadowPersistence === 'memory-only') this.unpersistedExternalSlots.add(slotKey);
      else this.unpersistedExternalSlots.delete(slotKey);
      externalVersionProtected = shadowPersistence === 'persistent' && externalVersionProtected;
    }

    const serialized = JSON.stringify(envelope);
    const persistence = externalVersionProtected
      ? this.setItem(slotKey, serialized)
      : this.keepMemoryOnly(slotKey, serialized);
    this.observedSlots.set(slotKey, serialized);
    return {
      status: 'valid',
      slotId: descriptor.id,
      kind: descriptor.kind,
      defaultName: descriptor.defaultName,
      metadata,
      state,
      persistence,
    };
  }

  private readSlot(descriptor: SlotDescriptor): SaveSlotResult<TState> {
    const key = this.slotKey(descriptor);
    this.observedSlotDescriptors.set(key, descriptor);
    const raw = this.getItem(key);
    this.observedSlots.set(key, raw);
    if (raw === null) return { status: 'empty', slotId: descriptor.id, kind: descriptor.kind, defaultName: descriptor.defaultName };
    const decoded = this.decodeSave(raw, descriptor);
    if ('reason' in decoded) return this.invalid(descriptor, decoded.reason);
    return {
      status: 'valid',
      slotId: descriptor.id,
      kind: descriptor.kind,
      defaultName: descriptor.defaultName,
      metadata: decoded.metadata,
      state: decoded.state,
      persistence: this.volatileKeys.has(key) ? 'memory-only' : 'persistent',
    };
  }

  private decodeSave(raw: string, descriptor: SlotDescriptor):
    | { readonly envelope: SaveEnvelope<TState>; readonly metadata: SaveMetadata; readonly state: TState }
    | { readonly reason: string } {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) return { reason: 'Save is not an object' };
      if (parsed.schema !== 'red-ledger-save') return { reason: 'Unknown save schema' };
      if (!Number.isSafeInteger(parsed.version)) return { reason: 'Unsupported save version' };
      if (Number(parsed.version) > SAVE_SCHEMA_VERSION) return { reason: 'Save version is newer than this build' };
      if (Number(parsed.version) < OLDEST_SUPPORTED_SAVE_SCHEMA_VERSION) return { reason: 'Save version is no longer supported' };
      if (parsed.gameVersion !== this.gameVersion) return { reason: 'Save belongs to a different game version' };
      if (!verifyChecksum(parsed)) return { reason: 'Checksum mismatch' };
      if (!isSaveMetadata(parsed.metadata)) return { reason: 'Invalid save metadata' };
      if (parsed.metadata.slotId !== descriptor.id || parsed.metadata.kind !== descriptor.kind) {
        return { reason: 'Save is stored in the wrong slot' };
      }
      if (this.validateState && !this.validateState(parsed.state)) return { reason: 'Invalid game state' };
      return {
        envelope: parsed as unknown as SaveEnvelope<TState>,
        metadata: parsed.metadata,
        state: parsed.state as TState,
      };
    } catch (error) {
      return { reason: error instanceof Error ? error.message : 'Unreadable save' };
    }
  }

  private preserveSaveShadow(
    descriptor: SlotDescriptor,
    saveRaw: string,
    preservedAt: number,
  ): 'persistent' | 'memory-only' {
    const decoded = this.decodeSave(saveRaw, descriptor);
    if ('reason' in decoded) {
      this.unresolvedExternalSlots.add(this.slotKey(descriptor));
      this.reportConflict({
        kind: 'save-recovery',
        key: this.slotKey(descriptor),
        message: 'Another tab changed this slot to an unreadable or newer format. It was left untouched; this tab kept its save in memory.',
      });
      return 'memory-only';
    }
    const id = `${descriptor.id}-${decoded.envelope.checksum}`;
    const unsigned = {
      schema: 'red-ledger-save-shadow' as const,
      version: 1 as const,
      id,
      writerId: this.writerId,
      createdAt: preservedAt,
      source: descriptor,
      save: decoded.envelope,
    };
    const shadow: SaveShadowEnvelope<TState> = withChecksum(unsigned);
    const shadowKey = this.saveShadowKey(descriptor, decoded.envelope.checksum);
    const persistence = this.setItem(shadowKey, JSON.stringify(shadow));
    if (persistence === 'persistent') this.compactSaveShadows();
    this.reportConflict({
      kind: 'save-recovery',
      key: shadowKey,
      message: 'Another tab changed a save slot. Both versions were kept, and the earlier copy is available under Automatic saves.',
    });
    return persistence;
  }

  private persistVolatileSaveShadows(descriptor: SlotDescriptor): boolean {
    this.retryPendingRemovals(this.saveShadowPrefix(descriptor));
    const slotKey = this.slotKey(descriptor);
    let persistent = !this.unresolvedExternalSlots.has(slotKey);
    this.keysWithPrefix(this.saveShadowPrefix(descriptor)).forEach((key) => {
      if (!this.volatileKeys.has(key)) return;
      const raw = this.memoryFallback.get(key);
      if (!raw || this.setItem(key, raw) !== 'persistent') persistent = false;
    });
    if (persistent) {
      this.unpersistedExternalSlots.delete(slotKey);
      this.compactSaveShadows();
    } else if (!this.unresolvedExternalSlots.has(slotKey)) {
      this.unpersistedExternalSlots.add(slotKey);
    }
    return persistent;
  }

  private decodeSaveShadow(raw: string): {
    readonly envelope: SaveShadowEnvelope<TState>;
    readonly source: SlotDescriptor;
    readonly decoded: { readonly envelope: SaveEnvelope<TState>; readonly metadata: SaveMetadata; readonly state: TState };
  } | undefined {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)
        || parsed.schema !== 'red-ledger-save-shadow'
        || parsed.version !== 1
        || typeof parsed.id !== 'string'
        || typeof parsed.writerId !== 'string'
        || !Number.isFinite(parsed.createdAt)
        || !isRecord(parsed.source)
        || typeof parsed.source.id !== 'string'
        || !['manual', 'quicksave', 'autosave', 'recovery'].includes(String(parsed.source.kind))
        || typeof parsed.source.defaultName !== 'string'
        || !isRecord(parsed.save)
        || !verifyChecksum(parsed)) return undefined;
      const source = parsed.source as unknown as SlotDescriptor;
      const decoded = this.decodeSave(JSON.stringify(parsed.save), source);
      return 'reason' in decoded ? undefined : {
        envelope: parsed as unknown as SaveShadowEnvelope<TState>,
        source,
        decoded,
      };
    } catch {
      return undefined;
    }
  }

  private listSaveConflictRecoveries(): readonly ValidSlotResult<TState>[] {
    const seenChecksums = new Set<string>();
    const recoveries = this.keysWithPrefix(this.key('save-shadow:')).flatMap((key) => {
      const raw = this.getItem(key);
      if (!raw) return [];
      const shadow = this.decodeSaveShadow(raw);
      if (!shadow || seenChecksums.has(shadow.decoded.envelope.checksum)) return [];
      const { envelope, source, decoded } = shadow;
      try {
        const canonicalRaw = this.getItem(this.slotKey(source));
        if (canonicalRaw) {
          const canonical = this.decodeSave(canonicalRaw, source);
          if (!('reason' in canonical) && canonical.envelope.checksum === decoded.envelope.checksum) return [];
        }
        seenChecksums.add(decoded.envelope.checksum);
        const recoveredId = `recovered-${envelope.id}`;
        this.reportConflict({
          kind: 'save-recovery',
          key,
          message: 'A previous tab copy is available under Automatic saves.',
        });
        return [{
          status: 'valid' as const,
          slotId: recoveredId,
          kind: 'conflict' as const,
          defaultName: 'Previous Tab Copy',
          metadata: {
            ...decoded.metadata,
            slotId: recoveredId,
            kind: 'conflict' as const,
            name: `Previous tab copy: ${decoded.metadata.name}`,
          },
          state: decoded.state,
          persistence: this.volatileKeys.has(key) ? 'memory-only' as const : 'persistent' as const,
        }];
      } catch {
        return [];
      }
    });
    return recoveries
      .sort((left, right) => right.metadata.savedAt - left.metadata.savedAt || left.slotId.localeCompare(right.slotId))
      .slice(0, MAX_CONFLICT_COPIES_TOTAL);
  }

  private clearSlot(descriptor: SlotDescriptor): void {
    const key = this.slotKey(descriptor);
    this.observedSlotDescriptors.set(key, descriptor);
    const currentRaw = this.getItem(key);
    if (this.observedSlots.has(key) && currentRaw !== (this.observedSlots.get(key) ?? null)) {
      this.reportConflict({
        kind: 'delete-conflict',
        key,
        message: 'Another tab changed this save after it was displayed. The newer copy was not deleted; review the slot and try again.',
      });
      this.observedSlots.set(key, currentRaw);
      return;
    }
    if (this.unresolvedExternalSlots.has(key) || this.unpersistedExternalSlots.has(key)) {
      this.memoryFallback.delete(key);
      this.volatileKeys.delete(key);
      this.unresolvedExternalSlots.delete(key);
      this.unpersistedExternalSlots.delete(key);
      const protectedRaw = this.getItem(key);
      this.observedSlots.set(key, protectedRaw);
      this.reportConflict({
        kind: 'delete-conflict',
        key,
        message: 'The tab-only save was removed. The unreadable or newer browser copy remains untouched.',
      });
      return;
    }
    this.removeItem(key, false);
    this.observedSlots.set(key, null);
  }

  private invalid(descriptor: SlotDescriptor, reason: string): InvalidSlotResult {
    return { status: 'invalid', slotId: descriptor.id, kind: descriptor.kind, defaultName: descriptor.defaultName, reason };
  }

  private nextSequence(): number {
    const key = this.key('sequence');
    const stored = Number.parseInt(this.getItem(key) ?? '0', 10);
    const next = Number.isSafeInteger(stored) && stored >= 0 ? stored + 1 : 1;
    this.setItem(key, String(next));
    return next;
  }

  private rememberRecoveryEpisode(episodeId: string): void {
    const key = this.key('recovery-index');
    this.setItem(key, JSON.stringify(normalizeStringList([...this.recoveryEpisodes(), episodeId])));
  }

  private recoveryEpisodes(): readonly string[] {
    const raw = this.getItem(this.key('recovery-index'));
    if (!raw) return this.episodeIds;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return normalizeStringList([...this.episodeIds, ...parsed]);
      }
    } catch {
      // Configured episodes still remain discoverable when the optional index is damaged.
    }
    return this.episodeIds;
  }

  private encodeCampaign(
    progress: CampaignUnlocks,
    appliedMutations: readonly string[],
    baseRaw: string | null,
  ): string {
    const outerExtensions: Record<string, unknown> = {};
    const progressExtensions: Record<string, unknown> = {};
    if (baseRaw) {
      try {
        const parsed: unknown = JSON.parse(baseRaw);
        if (isRecord(parsed) && migrateCampaignEnvelope(parsed)) {
          Object.entries(parsed).forEach(([key, value]) => {
            if (!['schema', 'version', 'progress', 'appliedMutations', 'checksum'].includes(key)) outerExtensions[key] = value;
          });
          if (isRecord(parsed.progress)) {
            Object.entries(parsed.progress).forEach(([key, value]) => {
              if (!['unlockedEpisodes', 'completedEpisodes', 'completedMaps', 'discoveredSecretMaps', 'records', 'updatedAt'].includes(key)) {
                progressExtensions[key] = value;
              }
            });
          }
        }
      } catch {
        // Unsupported/corrupt canonicals are never overwritten; extensions are irrelevant to the session overlay.
      }
    }
    const unsigned = {
      ...outerExtensions,
      schema: 'red-ledger-campaign' as const,
      version: CAMPAIGN_SCHEMA_VERSION,
      progress: { ...progressExtensions, ...progress },
      appliedMutations: normalizeStringList(appliedMutations),
    };
    return JSON.stringify(withChecksum(unsigned) as CampaignEnvelope);
  }

  private readCampaignCommitIds(): readonly string[] {
    const key = this.key('campaign-commits');
    const wasVolatile = this.volatileKeys.has(key);
    const raw = this.getItem(key);
    if (raw === null) return [];
    try {
      const envelope = migrateCampaignCommits(JSON.parse(raw));
      if (envelope) return normalizeStringList(envelope.mutationIds);
    } catch {
      // A damaged or future ledger is preserved and ignored by this build.
    }
    if (!wasVolatile) this.campaignCommitLedgerProtected = true;
    return [];
  }

  private writeCampaignCommitIds(mutationIds: readonly string[]): 'persistent' | 'memory-only' {
    const key = this.key('campaign-commits');
    const unsigned = {
      schema: 'red-ledger-campaign-commits' as const,
      version: 1 as const,
      mutationIds: normalizeStringList(mutationIds),
    };
    const raw = JSON.stringify(withChecksum(unsigned) as CampaignCommitEnvelope);
    return this.campaignCommitLedgerProtected ? this.keepMemoryOnly(key, raw) : this.setItem(key, raw);
  }

  private getItem(key: string): string | null {
    if (this.volatileKeys.has(key)) return this.memoryFallback.get(key) ?? null;
    try {
      const value = this.storage.getItem(key);
      this.storageReadUnavailable = false;
      if (value === null) this.memoryFallback.delete(key);
      else this.memoryFallback.set(key, value);
      return value;
    } catch (error) {
      this.storageReadUnavailable = true;
      this.reportStorageFailure('read', key, error);
      return this.memoryFallback.get(key) ?? null;
    }
  }

  private setItem(key: string, value: string): 'persistent' | 'memory-only' {
    const wasVolatile = this.volatileKeys.has(key);
    if (!wasVolatile) this.rememberDurableBaseline(key);
    this.memoryFallback.set(key, value);
    this.pendingRemovals.delete(key);
    if (wasVolatile && !this.preflightVolatileCanonical(key)) return 'memory-only';
    try {
      this.storage.setItem(key, value);
      this.volatileKeys.delete(key);
      this.volatileDurableBaselines.delete(key);
      return 'persistent';
    } catch (error) {
      this.volatileKeys.add(key);
      this.reportStorageFailure('write', key, error);
      return 'memory-only';
    }
  }

  private removeItem(key: string, retainOnFailure = true): void {
    let retained = this.memoryFallback.get(key);
    if (retained === undefined) {
      try { retained = this.storage.getItem(key) ?? undefined; } catch { /* The removal attempt reports the failure below. */ }
    }
    try {
      this.storage.removeItem(key);
      this.memoryFallback.delete(key);
      this.volatileKeys.delete(key);
      this.volatileDurableBaselines.delete(key);
      this.pendingRemovals.delete(key);
    } catch (error) {
      if (retainOnFailure && retained !== undefined) this.memoryFallback.set(key, retained);
      else this.memoryFallback.delete(key);
      this.volatileKeys.add(key);
      this.pendingRemovals.add(key);
      this.reportStorageFailure('remove', key, error);
    }
  }

  private keepMemoryOnly(key: string, value: string): 'memory-only' {
    if (!this.volatileKeys.has(key)) this.rememberDurableBaseline(key);
    this.memoryFallback.set(key, value);
    this.volatileKeys.add(key);
    return 'memory-only';
  }

  private rememberDurableBaseline(key: string): void {
    if (!this.isCanonicalDataKey(key) || this.volatileDurableBaselines.has(key)) return;
    try {
      this.volatileDurableBaselines.set(key, this.storage.getItem(key));
    } catch {
      // A retry with an unknown baseline treats any durable value as external.
    }
  }

  private preflightVolatileCanonical(key: string): boolean {
    if (!this.isCanonicalDataKey(key)) return true;
    if (this.isCampaignRecordKey(key) && this.protectedCampaignRecords.has(key)) return false;
    let durableRaw: string | null;
    try {
      durableRaw = this.storage.getItem(key);
    } catch (error) {
      this.reportStorageFailure('read', key, error);
      return false;
    }
    const baselineKnown = this.volatileDurableBaselines.has(key);
    const baselineRaw = this.volatileDurableBaselines.get(key) ?? null;
    if ((baselineKnown && durableRaw === baselineRaw) || (!baselineKnown && durableRaw === null)) return true;
    if (durableRaw === null) {
      this.volatileDurableBaselines.set(key, null);
      return true;
    }
    if (this.isCampaignRecordKey(key)) {
      this.protectedCampaignRecords.add(key);
      this.shadowedCampaignRecords.add(key);
      this.reportConflict({
        kind: 'campaign-recovery',
        key,
        message: 'Campaign progress from this tab is being relocated so a newer browser record remains untouched.',
      });
      return false;
    }
    const descriptor = this.observedSlotDescriptors.get(key);
    if (!descriptor) return false;
    const preservation = this.preserveSaveShadow(descriptor, durableRaw, this.now());
    if (preservation !== 'persistent') {
      this.unpersistedExternalSlots.add(key);
      return false;
    }
    this.unresolvedExternalSlots.delete(key);
    this.unpersistedExternalSlots.delete(key);
    this.volatileDurableBaselines.set(key, durableRaw);
    return true;
  }

  private keysWithPrefix(prefix: string): readonly string[] {
    const keys = new Set([...this.memoryFallback.keys()].filter((key) => key.startsWith(prefix)));
    try {
      for (let index = 0; index < this.storage.length; index += 1) {
        const key = this.storage.key(index);
        if (key?.startsWith(prefix)) keys.add(key);
      }
    } catch (error) {
      this.storageReadUnavailable = true;
      this.reportStorageFailure('read', prefix, error);
    }
    return [...keys].sort();
  }

  private compactSaveShadows(): void {
    const entries = this.keysWithPrefix(this.key('save-shadow:')).flatMap((key) => {
      const raw = this.getItem(key);
      if (!raw) return [];
      const shadow = this.decodeSaveShadow(raw);
      return shadow ? [{ key, sourceId: shadow.source.id, createdAt: shadow.envelope.createdAt }] : [];
    }).sort((left, right) => right.createdAt - left.createdAt || left.key.localeCompare(right.key));

    const keptPerSlot = new Map<string, number>();
    const keep = new Set<string>();
    entries.forEach((entry) => {
      const slotCount = keptPerSlot.get(entry.sourceId) ?? 0;
      if (slotCount >= MAX_CONFLICT_COPIES_PER_SLOT || keep.size >= MAX_CONFLICT_COPIES_TOTAL) return;
      keptPerSlot.set(entry.sourceId, slotCount + 1);
      keep.add(entry.key);
    });
    entries.forEach(({ key }) => { if (!keep.has(key)) this.removeItem(key); });
  }

  private scheduleCampaignMutationCleanup(id: string): void {
    if (this.scheduledCampaignCleanup.has(id)) return;
    this.scheduledCampaignCleanup.add(id);
    const timer = globalThis.setTimeout(() => {
      this.scheduledCampaignCleanup.delete(id);
      this.compactCampaignMutation(id);
    }, CAMPAIGN_MUTATION_STABILITY_MS);
    (timer as unknown as { unref?: () => void }).unref?.();
  }

  private compactCampaignMutation(id: string): void {
    const journalKey = this.campaignMutationKey(id);
    const journalRaw = this.getItem(journalKey);
    if (!journalRaw || this.volatileKeys.has(journalKey)) return;
    try {
      const reconciled = this.reconciledCampaign();
      if (!reconciled.targetWritable
        || this.volatileKeys.has(reconciled.targetKey)
        || !reconciled.appliedMutations.includes(id)) return;
      this.removeItem(journalKey);
      if (this.volatileKeys.has(journalKey)) return;
      const compacted = this.reconciledCampaign();
      if (!compacted.targetWritable || this.volatileKeys.has(compacted.targetKey)) return;
      if (this.setItem(compacted.targetKey, this.encodeCampaign(
        compacted.progress,
        compacted.appliedMutations,
        compacted.targetRaw,
      )) === 'persistent') this.finishCampaignCheckpoint(compacted);
    } catch {
      // A failed maintenance pass leaves the validated journal available for a later reconciliation.
    }
  }

  private persistVolatileCampaignMutations(): boolean {
    this.retryPendingRemovals(this.key('campaign-mutation:'));
    let durable = true;
    this.keysWithPrefix(this.key('campaign-mutation:')).forEach((key) => {
      if (!this.volatileKeys.has(key)) return;
      const raw = this.memoryFallback.get(key);
      if (!raw || this.setItem(key, raw) !== 'persistent') durable = false;
    });
    return durable;
  }

  private retryPendingRemovals(prefix: string): void {
    [...this.pendingRemovals].forEach((key) => {
      if (!key.startsWith(prefix)) return;
      try {
        this.storage.removeItem(key);
        this.pendingRemovals.delete(key);
        this.memoryFallback.delete(key);
        this.volatileKeys.delete(key);
        this.volatileDurableBaselines.delete(key);
      } catch {
        // The original removal failure already exposed the degraded-storage warning.
      }
    });
  }

  private readonly handleStorageEvent = (event: StorageEvent): void => {
    if (!event.key || (event.storageArea && event.storageArea !== this.storage)) return;
    if (this.isCampaignRecordKey(event.key) && this.volatileKeys.has(event.key)) {
      const overlayRaw = this.memoryFallback.get(event.key);
      if (event.newValue !== null && event.newValue !== overlayRaw) {
        this.protectedCampaignRecords.add(event.key);
        this.shadowedCampaignRecords.add(event.key);
        this.reportConflict({
          kind: 'campaign-recovery',
          key: event.key,
          message: 'Campaign progress from this tab is being relocated so a newer browser record remains untouched.',
        });
      }
      return;
    }
    const descriptor = this.observedSlotDescriptors.get(event.key);
    const observedRaw = this.observedSlots.get(event.key);
    if (!descriptor || observedRaw === undefined || observedRaw === null || event.newValue === observedRaw) return;
    if (this.volatileKeys.has(event.key)) {
      if (event.newValue === null) return;
      const persistence = this.preserveSaveShadow(descriptor, event.newValue, this.now());
      if (persistence === 'memory-only' && !this.unresolvedExternalSlots.has(event.key)) {
        this.unpersistedExternalSlots.add(event.key);
      }
      return;
    }
    if (event.oldValue !== observedRaw) return;
    const decoded = this.decodeSave(observedRaw, descriptor);
    if ('reason' in decoded) return;
    this.preserveSaveShadow(descriptor, observedRaw, this.now());
  };

  private reportConflict(conflict: PersistenceConflict): void {
    const signature = `${conflict.kind}:${conflict.key}`;
    if (this.reportedConflicts.has(signature)) return;
    this.reportedConflicts.add(signature);
    this.conflictHistory.push({ ...conflict });
    if (this.conflictHistory.length > 12) this.conflictHistory.splice(0, this.conflictHistory.length - 12);
    if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
    try {
      window.dispatchEvent(new CustomEvent<PersistenceConflict>(PERSISTENCE_CONFLICT_EVENT, { detail: { ...conflict } }));
    } catch {
      // Conflict preservation does not depend on notification delivery.
    }
  }

  private reportStorageFailure(operation: PersistenceStorageOperation, key: string, error: unknown): void {
    const name = error instanceof Error && error.name ? error.name : 'StorageError';
    const reason = error instanceof Error ? error.message : String(error || 'Storage operation failed');
    const failure: PersistenceStorageFailure = { operation, key, name, reason };
    this.storageFailureCount += 1;
    this.lastStorageFailure = failure;
    if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
    try {
      window.dispatchEvent(new CustomEvent<PersistenceStorageFailure>(PERSISTENCE_DEGRADED_EVENT, { detail: { ...failure } }));
    } catch {
      // Persistence remains usable through the memory fallback when event delivery is unavailable.
    }
  }

  private slotKey(descriptor: SlotDescriptor): string {
    return this.key(`save:${descriptor.id}`);
  }

  private campaignMutationKey(id: string): string {
    return this.key(`campaign-mutation:${encodeURIComponent(id)}`);
  }

  private isCampaignRecordKey(key: string): boolean {
    return key === this.key('campaign')
      || key === this.key('campaign-recovery')
      || key === this.key(`campaign-recovery-v${CAMPAIGN_SCHEMA_VERSION}`);
  }

  private isCanonicalDataKey(key: string): boolean {
    return this.isCampaignRecordKey(key) || key.startsWith(this.key('save:'));
  }

  private saveShadowPrefix(descriptor: SlotDescriptor): string {
    return this.key(`save-shadow:${encodeURIComponent(descriptor.id)}:`);
  }

  private saveShadowKey(descriptor: SlotDescriptor, saveChecksum: string): string {
    return `${this.saveShadowPrefix(descriptor)}${encodeURIComponent(saveChecksum)}`;
  }

  private key(suffix: string): string {
    return `${this.namespace}:${suffix}`;
  }
}

export class DemoRecorder<TInitialState, TCommand> {
  private readonly frames: Array<{
    tick: number;
    commands: TCommand[];
    duration?: number;
    signature: string;
    serializedCharacters: number;
  }> = [];
  private readonly createdAt: number;
  private readonly baseSerializedCharacters: number;
  private readonly maxSerializedBytes?: number;
  private frameCharacters = 0;
  private lastTick = -1;
  private pendingTick = -1;
  private pendingCommands: TCommand[] = [];
  private pendingCommandSignatures: string[] = [];

  constructor(private readonly options: DemoRecorderOptions<TInitialState>) {
    const tickRate = options.tickRate ?? 35;
    if (!Number.isSafeInteger(tickRate) || tickRate <= 0) throw new RangeError('Demo tick rate must be a positive integer');
    if (!Number.isSafeInteger(options.seed) || options.seed < 0) throw new RangeError('Demo seed must be a non-negative integer');
    stableStringify(options.initialState);
    if (options.maxSerializedBytes !== undefined
      && (!Number.isSafeInteger(options.maxSerializedBytes) || options.maxSerializedBytes <= 0)) {
      throw new RangeError('Demo storage budget must be a positive integer');
    }
    this.createdAt = options.createdAt ?? Date.now();
    this.maxSerializedBytes = options.maxSerializedBytes;
    this.baseSerializedCharacters = JSON.stringify(withChecksum({
      schema: 'red-ledger-demo' as const,
      version: DEMO_SCHEMA_VERSION,
      tickRate,
      seed: options.seed,
      mapId: options.mapId,
      createdAt: this.createdAt,
      initialState: options.initialState,
      frames: [] as readonly DemoFrame<TCommand>[],
      totalTicks: 0,
    })).length;
  }

  /** Returns false without mutating the stream when the next command would exceed its storage budget. */
  record(tick: number, command: TCommand): boolean {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('Demo tick must be a non-negative integer');
    if (tick < this.lastTick) throw new RangeError('Demo commands must be recorded in tick order');
    const commandSignature = stableStringify(command);
    if (this.pendingTick !== -1 && tick !== this.pendingTick) this.flushPendingTick();
    if (this.pendingTick === -1) this.pendingTick = tick;
    const prospectiveSignatures = [...this.pendingCommandSignatures, commandSignature];
    const prospectiveSignature = `[${prospectiveSignatures.join(',')}]`;
    if (this.maxSerializedBytes !== undefined
      && this.estimateSerializedBytes(tick + 1, this.pendingTick, prospectiveSignature) > this.maxSerializedBytes) {
      if (this.pendingCommands.length === 0) this.pendingTick = -1;
      return false;
    }
    this.pendingCommands.push(command);
    this.pendingCommandSignatures.push(commandSignature);
    this.lastTick = tick;
    return true;
  }

  /** Exact JSON footprint for accepted data, without serializing the accumulated frame list. */
  estimatedSerializedBytes(totalTicks = Math.max(0, this.lastTick + 1)): number {
    const signature = this.pendingSignature();
    return this.estimateSerializedBytes(totalTicks, this.pendingTick, signature);
  }

  finish(totalTicks = this.lastTick + 1): DemoData<TInitialState, TCommand> {
    if (!Number.isSafeInteger(totalTicks) || totalTicks < 0 || totalTicks < this.lastTick + 1) {
      throw new RangeError('Demo total ticks cannot precede recorded commands');
    }
    this.flushPendingTick();
    const unsigned = {
      schema: 'red-ledger-demo' as const,
      version: DEMO_SCHEMA_VERSION,
      tickRate: this.options.tickRate ?? 35,
      seed: this.options.seed,
      mapId: this.options.mapId,
      createdAt: this.createdAt,
      initialState: this.options.initialState,
      frames: this.frames.map((frame) => ({
        tick: frame.tick,
        commands: [...frame.commands],
        ...(frame.duration && frame.duration > 1 ? { duration: frame.duration } : {}),
      })),
      totalTicks,
    };
    return withChecksum(unsigned);
  }

  private flushPendingTick(): void {
    if (this.pendingTick < 0 || this.pendingCommands.length === 0) return;
    const signature = this.pendingSignature();
    const previous = this.frames[this.frames.length - 1];
    const previousEnd = previous ? previous.tick + (previous.duration ?? 1) : -1;
    if (previous && this.pendingTick === previousEnd && previous.signature === signature) {
      this.frameCharacters -= previous.serializedCharacters;
      previous.duration = (previous.duration ?? 1) + 1;
      previous.serializedCharacters = this.serializedFrameCharacters(previous.tick, previous.signature, previous.duration);
      this.frameCharacters += previous.serializedCharacters;
    } else {
      const serializedCharacters = this.serializedFrameCharacters(this.pendingTick, signature);
      this.frames.push({
        tick: this.pendingTick,
        commands: [...this.pendingCommands],
        signature,
        serializedCharacters,
      });
      this.frameCharacters += serializedCharacters;
    }
    this.pendingTick = -1;
    this.pendingCommands = [];
    this.pendingCommandSignatures = [];
  }

  private pendingSignature(): string {
    return `[${this.pendingCommandSignatures.join(',')}]`;
  }

  private serializedFrameCharacters(tick: number, signature: string, duration = 1): number {
    return `{"tick":${tick},"commands":${signature}${duration > 1 ? `,"duration":${duration}` : ''}}`.length;
  }

  private estimateSerializedBytes(totalTicks: number, pendingTick = -1, pendingSignature = '[]'): number {
    let frameCount = this.frames.length;
    let characters = this.frameCharacters;
    if (pendingTick >= 0 && pendingSignature !== '[]') {
      const previous = this.frames[this.frames.length - 1];
      const previousEnd = previous ? previous.tick + (previous.duration ?? 1) : -1;
      if (previous && pendingTick === previousEnd && previous.signature === pendingSignature) {
        characters += this.serializedFrameCharacters(previous.tick, previous.signature, (previous.duration ?? 1) + 1)
          - previous.serializedCharacters;
      } else {
        characters += this.serializedFrameCharacters(pendingTick, pendingSignature);
        frameCount += 1;
      }
    }
    const separators = Math.max(0, frameCount - 1);
    const totalTickDigitDelta = String(totalTicks).length - 1;
    return (this.baseSerializedCharacters + characters + separators + totalTickDigitDelta) * 2;
  }
}

export function validateDemo<TInitialState, TCommand>(
  value: unknown,
  validators: DemoValidationOptions<TInitialState, TCommand> = {},
): DemoValidation<TInitialState, TCommand> {
  try {
    if (!isRecord(value)) return { valid: false, reason: 'Demo is not an object' };
    if (value.schema !== 'red-ledger-demo') return { valid: false, reason: 'Unknown demo schema' };
    if (value.version !== DEMO_SCHEMA_VERSION) return { valid: false, reason: 'Unsupported demo version' };
    if (!verifyChecksum(value)) return { valid: false, reason: 'Checksum mismatch' };
    if (!Number.isSafeInteger(value.tickRate) || (value.tickRate as number) <= 0) return { valid: false, reason: 'Invalid tick rate' };
    if (!Number.isSafeInteger(value.seed) || (value.seed as number) < 0) return { valid: false, reason: 'Invalid seed' };
    if (typeof value.mapId !== 'string' || !Number.isFinite(value.createdAt)) return { valid: false, reason: 'Invalid demo metadata' };
    if (!Number.isSafeInteger(value.totalTicks) || (value.totalTicks as number) < 0) return { valid: false, reason: 'Invalid duration' };
    if (validators.validateInitialState && !validators.validateInitialState(value.initialState)) {
      return { valid: false, reason: 'Invalid initial state' };
    }
    if (!Array.isArray(value.frames)) return { valid: false, reason: 'Invalid frame list' };
    let previousEnd = 0;
    for (const frame of value.frames) {
      if (!isRecord(frame)
        || !Number.isSafeInteger(frame.tick)
        || (frame.tick as number) < previousEnd
        || (frame.tick as number) >= (value.totalTicks as number)
        || !Array.isArray(frame.commands)
        || frame.commands.length === 0) return { valid: false, reason: 'Invalid or unordered demo frame' };
      const duration = frame.duration === undefined ? 1 : frame.duration;
      if (!Number.isSafeInteger(duration) || (duration as number) <= 0
        || (frame.tick as number) + (duration as number) > (value.totalTicks as number)) {
        return { valid: false, reason: 'Invalid demo frame duration' };
      }
      if (validators.validateCommand && !frame.commands.every(validators.validateCommand)) {
        return { valid: false, reason: 'Invalid demo command' };
      }
      previousEnd = (frame.tick as number) + (duration as number);
    }
    return { valid: true, demo: value as unknown as DemoData<TInitialState, TCommand> };
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : 'Unreadable demo' };
  }
}

export class DemoPlayback<TCommand> {
  private frameIndex = 0;
  private tick = 0;

  constructor(private readonly demo: DemoData<unknown, TCommand>) {}

  get currentTick(): number { return this.tick; }
  get finished(): boolean { return this.tick >= this.demo.totalTicks; }

  /** Returns commands for the current tick and advances exactly one fixed simulation tick. */
  next(): readonly TCommand[] {
    if (this.finished) return [];
    const frame = this.demo.frames[this.frameIndex];
    const frameEnd = frame ? frame.tick + (frame.duration ?? 1) : -1;
    const commands = frame && this.tick >= frame.tick && this.tick < frameEnd ? frame.commands : [];
    this.tick += 1;
    if (frame && this.tick >= frameEnd) this.frameIndex += 1;
    return commands;
  }

  reset(): void {
    this.tick = 0;
    this.frameIndex = 0;
  }

  seek(tick: number): void {
    if (!Number.isSafeInteger(tick) || tick < 0 || tick > this.demo.totalTicks) throw new RangeError('Invalid demo seek tick');
    this.tick = tick;
    this.frameIndex = this.demo.frames.findIndex((frame) => frame.tick + (frame.duration ?? 1) > tick);
    if (this.frameIndex < 0) this.frameIndex = this.demo.frames.length;
  }
}
