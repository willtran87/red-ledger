export const SAVE_SCHEMA_VERSION = 1;
export const DEMO_SCHEMA_VERSION = 2;
export const MANUAL_SLOT_COUNT = 8;
export const AUTOSAVE_SLOT_COUNT = 3;

export type SaveKind = 'manual' | 'quicksave' | 'autosave' | 'recovery';
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
  readonly checksum: string;
}

export interface PersistenceOptions<TState> {
  readonly namespace?: string;
  readonly gameVersion?: string;
  readonly episodeIds?: readonly string[];
  readonly initialUnlockedEpisodes?: readonly string[];
  readonly validateState?: (state: unknown) => state is TState;
  readonly now?: () => number;
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
  readonly lastFailure?: PersistenceStorageFailure;
}

export const PERSISTENCE_DEGRADED_EVENT = 'red-ledger-persistence-degraded';

interface SlotDescriptor {
  readonly id: string;
  readonly kind: SaveKind;
  readonly defaultName: string;
}

export interface DemoFrame<TCommand> {
  readonly tick: number;
  readonly commands: readonly TCommand[];
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

export class PersistenceSystem<TState> {
  private readonly namespace: string;
  private readonly gameVersion: string;
  private readonly episodeIds: readonly string[];
  private readonly initialUnlockedEpisodes: readonly string[];
  private readonly validateState?: (state: unknown) => state is TState;
  private readonly now: () => number;
  private readonly memoryFallback = new Map<string, string>();
  private readonly volatileKeys = new Set<string>();
  private storageFailureCount = 0;
  private lastStorageFailure?: PersistenceStorageFailure;

  constructor(private readonly storage: Storage, options: PersistenceOptions<TState> = {}) {
    this.namespace = options.namespace ?? 'red-ledger';
    this.gameVersion = options.gameVersion ?? '1';
    this.episodeIds = normalizeStringList(options.episodeIds ?? []);
    this.initialUnlockedEpisodes = normalizeStringList(options.initialUnlockedEpisodes ?? this.episodeIds.slice(0, 1));
    this.validateState = options.validateState;
    this.now = options.now ?? Date.now;
  }

  storageStatus(): PersistenceStorageStatus {
    return {
      mode: this.storageFailureCount > 0 ? 'memory-fallback' : 'persistent',
      failureCount: this.storageFailureCount,
      ...(this.lastStorageFailure ? { lastFailure: { ...this.lastStorageFailure } } : {}),
    };
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
    ].filter((slot): slot is ValidSlotResult<TState> => slot.status === 'valid');
    return candidates.sort((left, right) =>
      right.metadata.savedAt - left.metadata.savedAt
      || right.metadata.sequence - left.metadata.sequence
      || left.slotId.localeCompare(right.slotId))[0];
  }

  inspectAllSlots(): readonly SaveSlotResult<TState>[] {
    return [...this.listManualSlots(), this.loadQuicksave(), ...this.listAutosaves(), ...this.listEpisodeRecoveries()];
  }

  clearManual(slot: number): void {
    this.removeItem(this.slotKey(manualDescriptor(slot)));
  }

  clearQuicksave(): void {
    this.removeItem(this.slotKey(quickDescriptor));
  }

  campaignUnlocks(): CampaignUnlocks {
    const raw = this.getItem(this.key('campaign'));
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isRecord(parsed)
          && parsed.schema === 'red-ledger-campaign'
          && parsed.version === SAVE_SCHEMA_VERSION
          && verifyChecksum(parsed)
          && isRecord(parsed.progress)
          && Array.isArray(parsed.progress.unlockedEpisodes)
          && Array.isArray(parsed.progress.completedEpisodes)
          && Array.isArray(parsed.progress.completedMaps)
          && (parsed.progress.discoveredSecretMaps === undefined || Array.isArray(parsed.progress.discoveredSecretMaps))
          && (parsed.progress.records === undefined || (isRecord(parsed.progress.records)
            && Object.values(parsed.progress.records).every(isMapRecord)))
          && Number.isFinite(parsed.progress.updatedAt)
          && [...parsed.progress.unlockedEpisodes, ...parsed.progress.completedEpisodes, ...parsed.progress.completedMaps,
            ...(parsed.progress.discoveredSecretMaps as unknown[] | undefined ?? [])]
            .every((entry) => typeof entry === 'string')) {
          return {
            unlockedEpisodes: normalizeStringList(parsed.progress.unlockedEpisodes as string[]),
            completedEpisodes: normalizeStringList(parsed.progress.completedEpisodes as string[]),
            completedMaps: normalizeStringList(parsed.progress.completedMaps as string[]),
            discoveredSecretMaps: normalizeStringList(parsed.progress.discoveredSecretMaps as string[] | undefined ?? []),
            records: { ...(parsed.progress.records as Record<string, MapRecord> | undefined ?? {}) },
            updatedAt: parsed.progress.updatedAt as number,
          };
        }
      } catch {
        // A damaged campaign record falls back to defaults and remains available for diagnostics.
      }
    }
    return {
      unlockedEpisodes: this.initialUnlockedEpisodes,
      completedEpisodes: [],
      completedMaps: [],
      discoveredSecretMaps: [],
      records: {},
      updatedAt: 0,
    };
  }

  unlockEpisode(episodeId: string): CampaignUnlocks {
    const current = this.campaignUnlocks();
    return this.writeCampaign({ ...current, unlockedEpisodes: normalizeStringList([...current.unlockedEpisodes, episodeId]) });
  }

  completeMap(mapId: string, performance?: MapPerformance, discoveredSecretMap?: string): CampaignUnlocks {
    const current = this.campaignUnlocks();
    const achievedAt = this.now();
    const records = { ...current.records };
    if (performance) {
      const key = mapRecordKey(performance.mapId, performance.difficulty);
      records[key] = mergeMapRecord(records[key], performance, achievedAt);
    }
    return this.writeCampaign({
      ...current,
      completedMaps: normalizeStringList([...current.completedMaps, mapId]),
      discoveredSecretMaps: normalizeStringList([
        ...current.discoveredSecretMaps,
        ...(discoveredSecretMap ? [discoveredSecretMap] : []),
      ]),
      records,
    }, achievedAt);
  }

  completeEpisode(episodeId: string, unlockNextEpisodeId?: string): CampaignUnlocks {
    const current = this.campaignUnlocks();
    const unlocked = unlockNextEpisodeId
      ? normalizeStringList([...current.unlockedEpisodes, episodeId, unlockNextEpisodeId])
      : normalizeStringList([...current.unlockedEpisodes, episodeId]);
    return this.writeCampaign({
      ...current,
      unlockedEpisodes: unlocked,
      completedEpisodes: normalizeStringList([...current.completedEpisodes, episodeId]),
    });
  }

  isEpisodeUnlocked(episodeId: string): boolean {
    return this.campaignUnlocks().unlockedEpisodes.includes(episodeId);
  }

  private writeCampaign(progress: Omit<CampaignUnlocks, 'updatedAt'> | CampaignUnlocks, updatedAt = this.now()): CampaignUnlocks {
    const next: CampaignUnlocks = { ...progress, updatedAt };
    const unsigned = { schema: 'red-ledger-campaign' as const, version: SAVE_SCHEMA_VERSION, progress: next };
    const envelope: CampaignEnvelope = withChecksum(unsigned);
    this.setItem(this.key('campaign'), JSON.stringify(envelope));
    return next;
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
    this.setItem(this.slotKey(descriptor), JSON.stringify(envelope));
    return { status: 'valid', slotId: descriptor.id, kind: descriptor.kind, defaultName: descriptor.defaultName, metadata, state };
  }

  private readSlot(descriptor: SlotDescriptor): SaveSlotResult<TState> {
    const raw = this.getItem(this.slotKey(descriptor));
    if (raw === null) return { status: 'empty', slotId: descriptor.id, kind: descriptor.kind, defaultName: descriptor.defaultName };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) return this.invalid(descriptor, 'Save is not an object');
      if (parsed.schema !== 'red-ledger-save') return this.invalid(descriptor, 'Unknown save schema');
      if (parsed.version !== SAVE_SCHEMA_VERSION) return this.invalid(descriptor, 'Unsupported save version');
      if (parsed.gameVersion !== this.gameVersion) return this.invalid(descriptor, 'Save belongs to a different game version');
      if (!verifyChecksum(parsed)) return this.invalid(descriptor, 'Checksum mismatch');
      if (!isSaveMetadata(parsed.metadata)) return this.invalid(descriptor, 'Invalid save metadata');
      if (parsed.metadata.slotId !== descriptor.id || parsed.metadata.kind !== descriptor.kind) {
        return this.invalid(descriptor, 'Save is stored in the wrong slot');
      }
      if (this.validateState && !this.validateState(parsed.state)) return this.invalid(descriptor, 'Invalid game state');
      return {
        status: 'valid',
        slotId: descriptor.id,
        kind: descriptor.kind,
        defaultName: descriptor.defaultName,
        metadata: parsed.metadata,
        state: parsed.state as TState,
      };
    } catch (error) {
      return this.invalid(descriptor, error instanceof Error ? error.message : 'Unreadable save');
    }
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

  private getItem(key: string): string | null {
    if (this.volatileKeys.has(key)) return this.memoryFallback.get(key) ?? null;
    try {
      const value = this.storage.getItem(key);
      if (value === null) this.memoryFallback.delete(key);
      else this.memoryFallback.set(key, value);
      return value;
    } catch (error) {
      this.reportStorageFailure('read', key, error);
      return this.memoryFallback.get(key) ?? null;
    }
  }

  private setItem(key: string, value: string): void {
    this.memoryFallback.set(key, value);
    try {
      this.storage.setItem(key, value);
      this.volatileKeys.delete(key);
    } catch (error) {
      this.volatileKeys.add(key);
      this.reportStorageFailure('write', key, error);
    }
  }

  private removeItem(key: string): void {
    this.memoryFallback.delete(key);
    try {
      this.storage.removeItem(key);
      this.volatileKeys.delete(key);
    } catch (error) {
      this.volatileKeys.add(key);
      this.reportStorageFailure('remove', key, error);
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

  private key(suffix: string): string {
    return `${this.namespace}:${suffix}`;
  }
}

export class DemoRecorder<TInitialState, TCommand> {
  private readonly frames: Array<{ tick: number; commands: TCommand[] }> = [];
  private lastTick = -1;

  constructor(private readonly options: DemoRecorderOptions<TInitialState>) {
    const tickRate = options.tickRate ?? 35;
    if (!Number.isSafeInteger(tickRate) || tickRate <= 0) throw new RangeError('Demo tick rate must be a positive integer');
    if (!Number.isSafeInteger(options.seed) || options.seed < 0) throw new RangeError('Demo seed must be a non-negative integer');
    stableStringify(options.initialState);
  }

  record(tick: number, command: TCommand): void {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('Demo tick must be a non-negative integer');
    if (tick < this.lastTick) throw new RangeError('Demo commands must be recorded in tick order');
    stableStringify(command);
    if (tick === this.lastTick) this.frames[this.frames.length - 1].commands.push(command);
    else this.frames.push({ tick, commands: [command] });
    this.lastTick = tick;
  }

  finish(totalTicks = this.lastTick + 1): DemoData<TInitialState, TCommand> {
    if (!Number.isSafeInteger(totalTicks) || totalTicks < 0 || totalTicks < this.lastTick + 1) {
      throw new RangeError('Demo total ticks cannot precede recorded commands');
    }
    const unsigned = {
      schema: 'red-ledger-demo' as const,
      version: DEMO_SCHEMA_VERSION,
      tickRate: this.options.tickRate ?? 35,
      seed: this.options.seed,
      mapId: this.options.mapId,
      createdAt: this.options.createdAt ?? Date.now(),
      initialState: this.options.initialState,
      frames: this.frames.map((frame) => ({ tick: frame.tick, commands: [...frame.commands] })),
      totalTicks,
    };
    return withChecksum(unsigned);
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
    let previousTick = -1;
    for (const frame of value.frames) {
      if (!isRecord(frame)
        || !Number.isSafeInteger(frame.tick)
        || (frame.tick as number) <= previousTick
        || (frame.tick as number) >= (value.totalTicks as number)
        || !Array.isArray(frame.commands)
        || frame.commands.length === 0) return { valid: false, reason: 'Invalid or unordered demo frame' };
      if (validators.validateCommand && !frame.commands.every(validators.validateCommand)) {
        return { valid: false, reason: 'Invalid demo command' };
      }
      previousTick = frame.tick as number;
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
    const commands = frame?.tick === this.tick ? frame.commands : [];
    if (frame?.tick === this.tick) this.frameIndex += 1;
    this.tick += 1;
    return commands;
  }

  reset(): void {
    this.tick = 0;
    this.frameIndex = 0;
  }

  seek(tick: number): void {
    if (!Number.isSafeInteger(tick) || tick < 0 || tick > this.demo.totalTicks) throw new RangeError('Invalid demo seek tick');
    this.tick = tick;
    this.frameIndex = this.demo.frames.findIndex((frame) => frame.tick >= tick);
    if (this.frameIndex < 0) this.frameIndex = this.demo.frames.length;
  }
}
