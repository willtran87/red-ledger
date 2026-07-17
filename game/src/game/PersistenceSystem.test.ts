import { describe, expect, it, vi } from 'vitest';
import {
  AUTOSAVE_SLOT_COUNT,
  CAMPAIGN_SCHEMA_VERSION,
  DEMO_SCHEMA_VERSION,
  DEMO_STORAGE_BUDGET_BYTES,
  DemoPlayback,
  DemoRecorder,
  MANUAL_SLOT_COUNT,
  PERSISTENCE_COMPATIBILITY_POLICY,
  PersistenceSystem,
  SAVE_SCHEMA_VERSION,
  checksum,
  mapRecordKey,
  validateDemo,
  type SaveMetadataInput,
} from './PersistenceSystem';
import {
  CURRENT_CAMPAIGN_V2_FIXTURE,
  CURRENT_CAMPAIGN_V3_FIXTURE,
  CURRENT_CAMPAIGN_V4_FIXTURE,
  CURRENT_SAVE_V1_FIXTURE,
  LEGACY_CAMPAIGN_V1_FIXTURE,
} from './__fixtures__/persistenceFixtures';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

class FaultingStorage implements Storage {
  readonly backing = new MemoryStorage();
  denyReads = false;
  denyWrites = false;
  denyRemoves = false;
  quotaKey?: string;
  quotaExactKey?: string;

  get length(): number { return this.backing.length; }
  clear(): void { this.backing.clear(); }
  getItem(key: string): string | null {
    if (this.denyReads) throw new DOMException('Storage access denied', 'SecurityError');
    return this.backing.getItem(key);
  }
  key(index: number): string | null { return this.backing.key(index); }
  removeItem(key: string): void {
    if (this.denyRemoves) throw new DOMException('Storage access denied', 'SecurityError');
    this.backing.removeItem(key);
  }
  setItem(key: string, value: string): void {
    if (this.denyWrites) throw new DOMException('Storage access denied', 'SecurityError');
    if (this.quotaExactKey === key) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    if (this.quotaKey && key.includes(this.quotaKey)) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    this.backing.setItem(key, value);
  }
}

interface TestState {
  readonly map: string;
  readonly health: number;
  readonly inventory: readonly string[];
}

const isTestState = (value: unknown): value is TestState => {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<TestState>;
  return typeof candidate.map === 'string'
    && typeof candidate.health === 'number'
    && Array.isArray(candidate.inventory)
    && candidate.inventory.every((item) => typeof item === 'string');
};

const state = (map: string, health = 100): TestState => ({ map, health, inventory: ['claim-stamp'] });
const metadata = (mapId: string, episodeId = 'first-notice'): SaveMetadataInput => ({
  episodeId,
  mapId,
  mapTitle: `Map ${mapId}`,
  difficulty: 'field-adjuster',
  playSeconds: 42,
});

const makeSystem = (storage: Storage, times: number[] = [1000], writerId = 'test-writer') => {
  let index = 0;
  return new PersistenceSystem<TestState>(storage, {
    namespace: 'test',
    gameVersion: 'test-build',
    episodeIds: ['first-notice', 'exclusions-apply', 'adverse-development'],
    initialUnlockedEpisodes: ['first-notice'],
    validateState: isTestState,
    now: () => times[Math.min(index++, times.length - 1)],
    writerId,
  });
};

const storageKeys = (storage: Storage, prefix = ''): string[] => Array.from({ length: storage.length }, (_, index) => storage.key(index))
  .filter((key): key is string => Boolean(key?.startsWith(prefix)))
  .sort();

describe('PersistenceSystem save slots', () => {
  it('exposes exactly eight named manual slots with placeholder thumbnails', () => {
    const system = makeSystem(new MemoryStorage());
    expect(MANUAL_SLOT_COUNT).toBe(8);
    expect(system.listManualSlots()).toHaveLength(8);
    expect(system.listManualSlots().map((slot) => slot.defaultName)).toEqual([
      'Manual 1', 'Manual 2', 'Manual 3', 'Manual 4', 'Manual 5', 'Manual 6', 'Manual 7', 'Manual 8',
    ]);

    const saved = system.saveManual(3, state('E1M3'), { ...metadata('E1M3'), name: 'Before the vault' });
    expect(saved.metadata.name).toBe('Before the vault');
    expect(saved.metadata.thumbnail).toEqual({
      kind: 'placeholder',
      label: 'E1M3',
      palette: ['#d71920', '#f2f0e6'],
    });
    expect(system.loadManual(3)).toMatchObject({ status: 'valid', state: state('E1M3') });
    expect(() => system.saveManual(9, state('E1M1'), metadata('E1M1'))).toThrow(RangeError);
  });

  it('loads the frozen current-version fixture and writes the declared schema', () => {
    const storage = new MemoryStorage();
    storage.setItem('test:save:manual-1', JSON.stringify(CURRENT_SAVE_V1_FIXTURE));
    const system = makeSystem(storage);

    expect(PERSISTENCE_COMPATIBILITY_POLICY.saves).toEqual({
      currentVersion: 1,
      oldestSupportedVersion: 1,
      requiresExactGameVersion: true,
    });
    expect(system.loadManual(1)).toMatchObject({
      status: 'valid',
      persistence: 'persistent',
      metadata: { mapId: 'E1M3', sequence: 7 },
      state: { map: 'E1M3', health: 73 },
    });
    system.saveManual(2, state('E1M4'), metadata('E1M4'));
    expect(JSON.parse(storage.getItem('test:save:manual-2')!).version).toBe(SAVE_SCHEMA_VERSION);
  });

  it('accepts checksum-covered unknown fields in a supported save without losing them while loaded', () => {
    const storage = new MemoryStorage();
    const { checksum: _fixtureChecksum, ...fixtureUnsigned } = CURRENT_SAVE_V1_FIXTURE;
    const unsigned = {
      ...fixtureUnsigned,
      extension: { source: 'later-compatible-build' },
      metadata: { ...fixtureUnsigned.metadata, presentationHint: 'compact' },
      state: { ...fixtureUnsigned.state, optionalFutureState: 9 },
    };
    storage.setItem('test:save:manual-1', JSON.stringify({ ...unsigned, checksum: checksum(unsigned) }));

    const loaded = makeSystem(storage).loadManual(1);
    expect(loaded.status).toBe('valid');
    if (loaded.status !== 'valid') throw new Error('Fixture should be valid');
    expect((loaded.metadata as unknown as Record<string, unknown>).presentationHint).toBe('compact');
    expect((loaded.state as unknown as Record<string, unknown>).optionalFutureState).toBe(9);
  });

  it('round-trips validated captured-image thumbnails', () => {
    const system = makeSystem(new MemoryStorage());
    const thumbnail = {
      kind: 'image' as const,
      dataUrl: 'data:image/webp;base64,UklGRg==',
      width: 160,
      height: 100,
    };
    system.saveManual(1, state('E1M1'), { ...metadata('E1M1'), thumbnail });
    expect(system.loadManual(1)).toMatchObject({ status: 'valid', metadata: { thumbnail } });
  });

  it('keeps a dedicated quicksave independent of all manual slots', () => {
    const storage = new MemoryStorage();
    const system = makeSystem(storage, [100, 200]);
    system.saveManual(1, state('E1M1'), metadata('E1M1'));
    system.quicksave(state('E1M2', 77), metadata('E1M2'));

    expect(system.loadManual(1)).toMatchObject({ status: 'valid', state: { map: 'E1M1' } });
    expect(system.loadQuicksave()).toMatchObject({
      status: 'valid',
      kind: 'quicksave',
      state: { map: 'E1M2', health: 77 },
    });
  });

  it('rotates autosaves through dedicated slots without touching manual or quick saves', () => {
    const storage = new MemoryStorage();
    const system = makeSystem(storage, [10, 20, 30, 40, 50, 60]);
    system.saveManual(1, state('MANUAL'), metadata('E1M1'));
    system.quicksave(state('QUICK'), metadata('E1M1'));
    for (let index = 1; index <= AUTOSAVE_SLOT_COUNT + 2; index += 1) {
      system.autosave(state(`AUTO-${index}`), metadata(`E1M${index}`));
    }

    expect(system.listAutosaves().map((slot) => slot.status === 'valid' ? slot.state.map : '')).toEqual([
      'AUTO-4', 'AUTO-5', 'AUTO-3',
    ]);
    expect(system.loadManual(1)).toMatchObject({ state: { map: 'MANUAL' } });
    expect(system.loadQuicksave()).toMatchObject({ state: { map: 'QUICK' } });
  });

  it('stores one recoverable checkpoint per episode', () => {
    const system = makeSystem(new MemoryStorage(), [10, 20, 30]);
    system.saveEpisodeRecovery('first-notice', state('E1M4'), metadata('E1M4'));
    system.saveEpisodeRecovery('exclusions-apply', state('E2M2'), {
      mapId: 'E2M2', mapTitle: 'Map E2M2', difficulty: 'field-adjuster', playSeconds: 42,
    });

    expect(system.listEpisodeRecoveries()).toHaveLength(3);
    expect(system.loadEpisodeRecovery('first-notice')).toMatchObject({ status: 'valid', state: { map: 'E1M4' } });
    expect(system.loadEpisodeRecovery('exclusions-apply')).toMatchObject({ status: 'valid', state: { map: 'E2M2' } });
    expect(system.loadEpisodeRecovery('adverse-development')).toMatchObject({ status: 'empty' });
  });

  it('continues from the newest valid save and ignores corrupt newer slots', () => {
    const storage = new MemoryStorage();
    const system = makeSystem(storage, [100, 200, 300]);
    system.saveManual(1, state('OLD'), metadata('E1M1'));
    system.quicksave(state('NEWEST-VALID'), metadata('E1M2'));
    system.autosave(state('WILL-CORRUPT'), metadata('E1M3'));
    storage.setItem('test:save:autosave-1', '{broken');

    expect(system.newestValidContinue()).toMatchObject({
      slotId: 'quicksave',
      state: { map: 'NEWEST-VALID' },
    });
  });

  it('falls back from a corrupt autosave to the newest valid episode recovery', () => {
    const storage = new MemoryStorage();
    const system = makeSystem(storage, [100, 200, 300]);
    system.saveManual(1, state('OLD-MANUAL'), metadata('E1M1'));
    system.saveEpisodeRecovery('first-notice', state('RECOVERY'), metadata('E1M2'));
    system.autosave(state('BROKEN-AUTO'), metadata('E1M3'));
    storage.setItem('test:save:autosave-1', '{broken');

    expect(system.newestValidContinue()).toMatchObject({
      kind: 'recovery',
      state: { map: 'RECOVERY' },
    });
  });

  it('reports checksum, version, and state failures without deleting or changing any slot', () => {
    const storage = new MemoryStorage();
    const system = makeSystem(storage, [10, 20, 30]);
    system.saveManual(1, state('GOOD'), metadata('E1M1'));
    system.saveManual(2, state('CHECKSUM'), metadata('E1M2'));
    system.saveManual(3, state('VERSION'), metadata('E1M3'));
    system.saveManual(4, state('STATE'), metadata('E1M4'));
    system.saveManual(5, state('OLD-VERSION'), metadata('E1M5'));
    system.saveManual(6, state('GAME-VERSION'), metadata('E1M6'));

    const checksumRaw = JSON.parse(storage.getItem('test:save:manual-2')!) as Record<string, unknown>;
    checksumRaw.state = state('TAMPERED');
    storage.setItem('test:save:manual-2', JSON.stringify(checksumRaw));

    const versionRaw = JSON.parse(storage.getItem('test:save:manual-3')!) as Record<string, unknown>;
    versionRaw.version = 999;
    const { checksum: _old, ...unsigned } = versionRaw;
    versionRaw.checksum = checksum(unsigned);
    storage.setItem('test:save:manual-3', JSON.stringify(versionRaw));

    const stateRaw = JSON.parse(storage.getItem('test:save:manual-4')!) as Record<string, unknown>;
    stateRaw.state = { map: 'INVALID', health: 'full', inventory: [] };
    const { checksum: _stateChecksum, ...stateUnsigned } = stateRaw;
    stateRaw.checksum = checksum(stateUnsigned);
    storage.setItem('test:save:manual-4', JSON.stringify(stateRaw));

    const oldVersionRaw = JSON.parse(storage.getItem('test:save:manual-5')!) as Record<string, unknown>;
    oldVersionRaw.version = 0;
    const { checksum: _oldVersionChecksum, ...oldVersionUnsigned } = oldVersionRaw;
    oldVersionRaw.checksum = checksum(oldVersionUnsigned);
    storage.setItem('test:save:manual-5', JSON.stringify(oldVersionRaw));

    const gameVersionRaw = JSON.parse(storage.getItem('test:save:manual-6')!) as Record<string, unknown>;
    gameVersionRaw.gameVersion = 'other-simulation';
    const { checksum: _gameVersionChecksum, ...gameVersionUnsigned } = gameVersionRaw;
    gameVersionRaw.checksum = checksum(gameVersionUnsigned);
    storage.setItem('test:save:manual-6', JSON.stringify(gameVersionRaw));

    const beforeChecksum = storage.getItem('test:save:manual-2');
    const beforeVersion = storage.getItem('test:save:manual-3');
    expect(system.loadManual(1)).toMatchObject({ status: 'valid', state: { map: 'GOOD' } });
    expect(system.loadManual(2)).toMatchObject({ status: 'invalid', reason: 'Checksum mismatch' });
    expect(system.loadManual(3)).toMatchObject({ status: 'invalid', reason: 'Save version is newer than this build' });
    expect(system.loadManual(4)).toMatchObject({ status: 'invalid', reason: 'Invalid game state' });
    expect(system.loadManual(5)).toMatchObject({ status: 'invalid', reason: 'Save version is no longer supported' });
    expect(system.loadManual(6)).toMatchObject({ status: 'invalid', reason: 'Save belongs to a different game version' });
    expect(storage.getItem('test:save:manual-2')).toBe(beforeChecksum);
    expect(storage.getItem('test:save:manual-3')).toBe(beforeVersion);
    expect(system.loadManual(1)).toMatchObject({ status: 'valid' });
  });

  it('validates state and preserves the prior save when new state cannot serialize', () => {
    const storage = new MemoryStorage();
    const system = makeSystem(storage);
    system.saveManual(1, state('SAFE'), metadata('E1M1'));
    const original = storage.getItem('test:save:manual-1');
    expect(() => system.saveManual(1, { ...state('BAD'), health: Number.NaN }, metadata('E1M1'))).toThrow(TypeError);
    expect(storage.getItem('test:save:manual-1')).toBe(original);
  });
});

describe('PersistenceSystem cross-tab slot safety', () => {
  it('leaves ordinary manual, quick, and rotating autosaves free of conflict copies', () => {
    const storage = new MemoryStorage();
    const system = makeSystem(storage, [10, 20, 30, 40, 50, 60, 70, 80]);
    system.loadManual(1);
    system.saveManual(1, state('FIRST'), metadata('E1M1'));
    system.saveManual(1, state('SECOND'), metadata('E1M2'));
    system.quicksave(state('QUICK'), metadata('E1M2'));
    for (let index = 1; index <= AUTOSAVE_SLOT_COUNT * 2; index += 1) {
      system.autosave(state(`AUTO-${index}`), metadata(`E1M${index}`));
    }

    expect(storageKeys(storage, 'test:save-shadow:')).toEqual([]);
    expect(system.inspectAllSlots().some((slot) => slot.kind === 'conflict')).toBe(false);
  });

  it('preserves an externally changed slot as a distinct bounded conflict copy', () => {
    const storage = new MemoryStorage();
    const staleTab = makeSystem(storage, [300, 310, 320, 330, 340, 350], 'stale-tab');
    staleTab.loadManual(1);

    for (let index = 1; index <= 5; index += 1) {
      makeSystem(storage, [index * 10], `external-${index}`).saveManual(1, state(`EXTERNAL-${index}`), metadata(`E1M${index}`));
      staleTab.saveManual(1, state(`LOCAL-${index}`), metadata(`E2M${index}`));
    }

    const shadows = storageKeys(storage, 'test:save-shadow:manual-1:');
    const conflicts = staleTab.inspectAllSlots().filter((slot) => slot.kind === 'conflict');
    expect(shadows).toHaveLength(2);
    expect(conflicts).toHaveLength(2);
    expect(conflicts.every((slot) => slot.status === 'valid' && slot.metadata.name.startsWith('Previous tab copy:'))).toBe(true);
    expect(staleTab.loadManual(1)).toMatchObject({ status: 'valid', state: { map: 'LOCAL-5' } });
    expect(staleTab.newestValidContinue()).toMatchObject({ kind: 'manual', state: { map: 'LOCAL-5' } });
  });

  it('caps retained conflict copies globally as well as per slot', () => {
    const storage = new MemoryStorage();
    for (let slot = 1; slot <= 5; slot += 1) {
      const staleTab = makeSystem(storage, [1_000 + slot * 10, 2_000 + slot * 10], `stale-${slot}`);
      staleTab.loadManual(slot);
      for (let version = 1; version <= 2; version += 1) {
        makeSystem(storage, [slot * 100 + version], `external-${slot}-${version}`)
          .saveManual(slot, state(`EXTERNAL-${slot}-${version}`), metadata(`E${slot}M${version}`));
        staleTab.saveManual(slot, state(`LOCAL-${slot}-${version}`), metadata(`E${slot}M${version + 2}`));
      }
    }
    const shadows = storageKeys(storage, 'test:save-shadow:');
    expect(shadows.length).toBeLessThanOrEqual(8);
    for (let slot = 1; slot <= 5; slot += 1) {
      expect(shadows.filter((key) => key.includes(`save-shadow:manual-${slot}:`)).length).toBeLessThanOrEqual(2);
    }
    expect(makeSystem(storage, [9_000], 'reader').inspectAllSlots().filter((slot) => slot.kind === 'conflict')).toHaveLength(shadows.length);
  });

  it('preserves a version displaced after two tabs both read the same canonical', () => {
    const storage = new MemoryStorage();
    makeSystem(storage, [10], 'base-tab').saveManual(1, state('BASE'), metadata('E1M1'));
    const firstTab = makeSystem(storage, [20], 'first-tab');
    firstTab.loadManual(1);
    firstTab.saveManual(1, state('FIRST'), metadata('E1M2'));
    const firstRaw = storage.getItem('test:save:manual-1')!;

    const isolatedSecondStorage = new MemoryStorage();
    isolatedSecondStorage.setItem('test:save:manual-1', firstRaw);
    makeSystem(isolatedSecondStorage, [30], 'second-tab').saveManual(1, state('SECOND'), metadata('E1M3'));
    const secondRaw = isolatedSecondStorage.getItem('test:save:manual-1')!;
    storage.setItem('test:save:manual-1', secondRaw);
    const storageHandler = (firstTab as unknown as { handleStorageEvent: (event: StorageEvent) => void }).handleStorageEvent;
    storageHandler({ key: 'test:save:manual-1', oldValue: firstRaw, newValue: secondRaw, storageArea: storage } as unknown as StorageEvent);

    expect(firstTab.loadManual(1)).toMatchObject({ state: { map: 'SECOND' } });
    expect(firstTab.inspectAllSlots().find((slot) => slot.kind === 'conflict')).toMatchObject({ state: { map: 'FIRST' } });
  });

  it('preserves an external write that lands beneath a volatile tab-only canonical', () => {
    const storage = new FaultingStorage();
    makeSystem(storage, [10], 'base-tab').saveManual(1, state('BASE'), metadata('E1M1'));
    const baseRaw = storage.backing.getItem('test:save:manual-1')!;
    const firstTab = makeSystem(storage, [20, 40], 'first-tab');
    firstTab.loadManual(1);
    storage.quotaKey = 'save:manual-1';
    expect(firstTab.saveManual(1, state('TAB-ONLY'), metadata('E1M2')).persistence).toBe('memory-only');

    const externalStorage = new MemoryStorage();
    externalStorage.setItem('test:save:manual-1', baseRaw);
    makeSystem(externalStorage, [30], 'external-tab').saveManual(1, state('EXTERNAL'), metadata('E1M3'));
    const externalRaw = externalStorage.getItem('test:save:manual-1')!;
    storage.quotaKey = undefined;
    storage.backing.setItem('test:save:manual-1', externalRaw);
    const storageHandler = (firstTab as unknown as { handleStorageEvent: (event: StorageEvent) => void }).handleStorageEvent;
    storageHandler({ key: 'test:save:manual-1', oldValue: baseRaw, newValue: externalRaw, storageArea: storage } as unknown as StorageEvent);

    expect(firstTab.saveManual(1, state('RECOVERED'), metadata('E1M4')).persistence).toBe('persistent');
    expect(makeSystem(storage.backing, [50], 'fresh-tab').loadManual(1)).toMatchObject({ state: { map: 'RECOVERED' } });
    expect(makeSystem(storage.backing, [50], 'fresh-tab').inspectAllSlots().find((slot) => slot.kind === 'conflict')).toMatchObject({
      state: { map: 'EXTERNAL' },
    });
  });

  it('does not let invalid or future shadow documents evict valid recovery copies', () => {
    const storage = new MemoryStorage();
    const staleTab = makeSystem(storage, [100, 200, 300, 400], 'stale-tab');
    staleTab.loadManual(1);
    makeSystem(storage, [50], 'external-1').saveManual(1, state('EXTERNAL-1'), metadata('E1M1'));
    staleTab.saveManual(1, state('LOCAL-1'), metadata('E1M2'));
    for (let index = 0; index < 3; index += 1) {
      storage.setItem(`test:save-shadow:manual-1:future-${index}`, JSON.stringify({
        schema: 'red-ledger-save-shadow', version: 2, createdAt: 99_000 + index,
        source: { id: 'manual-1', kind: 'manual', defaultName: 'Manual 1' },
      }));
    }
    makeSystem(storage, [250], 'external-2').saveManual(1, state('EXTERNAL-2'), metadata('E1M3'));
    staleTab.saveManual(1, state('LOCAL-2'), metadata('E1M4'));

    expect(storageKeys(storage, 'test:save-shadow:manual-1:future-')).toHaveLength(3);
    expect(staleTab.inspectAllSlots().filter((slot) => slot.kind === 'conflict')).toHaveLength(2);
  });

  it('keeps the new write memory-only when a conflict copy exceeds quota', () => {
    const storage = new FaultingStorage();
    const staleTab = makeSystem(storage, [100, 300, 500], 'stale-tab');
    staleTab.loadManual(1);
    makeSystem(storage, [200], 'external-tab').saveManual(1, state('EXTERNAL'), metadata('E1M2'));
    const externalRaw = storage.backing.getItem('test:save:manual-1');
    storage.quotaKey = 'save-shadow:';

    expect(staleTab.saveManual(1, state('LOCAL'), metadata('E1M3'))).toMatchObject({ persistence: 'memory-only' });
    expect(storage.backing.getItem('test:save:manual-1')).toBe(externalRaw);
    expect(staleTab.loadManual(1)).toMatchObject({ persistence: 'memory-only', state: { map: 'LOCAL' } });
    expect(staleTab.inspectAllSlots().find((slot) => slot.kind === 'conflict')).toMatchObject({
      persistence: 'memory-only',
      state: { map: 'EXTERNAL' },
    });

    storage.quotaKey = undefined;
    expect(staleTab.saveManual(1, state('LOCAL-PERSISTED'), metadata('E1M4'))).toMatchObject({ persistence: 'persistent' });
    expect(makeSystem(storage.backing, [600], 'fresh-tab').loadManual(1)).toMatchObject({ state: { map: 'LOCAL-PERSISTED' } });
    expect(makeSystem(storage.backing, [600], 'fresh-tab').inspectAllSlots().find((slot) => slot.kind === 'conflict')).toMatchObject({
      state: { map: 'EXTERNAL' },
    });
  });

  it('does not overwrite a corrupt or future external canonical that cannot be recovered safely', () => {
    const storage = new MemoryStorage();
    const staleTab = makeSystem(storage, [100, 300], 'stale-tab');
    staleTab.loadManual(1);
    const unsigned = {
      ...CURRENT_SAVE_V1_FIXTURE,
      version: SAVE_SCHEMA_VERSION + 1,
      metadata: { ...CURRENT_SAVE_V1_FIXTURE.metadata, slotId: 'manual-1' },
    };
    const { checksum: _fixtureChecksum, ...futureUnsigned } = unsigned;
    const futureRaw = JSON.stringify({ ...futureUnsigned, checksum: checksum(futureUnsigned) });
    storage.setItem('test:save:manual-1', futureRaw);

    expect(staleTab.saveManual(1, state('LOCAL'), metadata('E1M3'))).toMatchObject({ persistence: 'memory-only' });
    expect(storage.getItem('test:save:manual-1')).toBe(futureRaw);
    expect(staleTab.loadManual(1)).toMatchObject({ persistence: 'memory-only', state: { map: 'LOCAL' } });
    staleTab.clearManual(1);
    expect(storage.getItem('test:save:manual-1')).toBe(futureRaw);
    expect(staleTab.loadManual(1)).toMatchObject({ status: 'invalid', reason: 'Save version is newer than this build' });
  });

  it('preflights a volatile save retry before an external future record can be overwritten', () => {
    const storage = new FaultingStorage();
    makeSystem(storage, [10], 'base-tab').saveManual(1, state('BASE'), metadata('E1M1'));
    const system = makeSystem(storage, [20, 30, 40], 'quota-tab');
    system.loadManual(1);
    storage.quotaExactKey = 'test:save:manual-1';
    expect(system.saveManual(1, state('TAB-ONLY'), metadata('E1M2')).persistence).toBe('memory-only');

    const { checksum: _fixtureChecksum, ...futureUnsigned } = {
      ...CURRENT_SAVE_V1_FIXTURE,
      version: SAVE_SCHEMA_VERSION + 1,
      metadata: { ...CURRENT_SAVE_V1_FIXTURE.metadata, slotId: 'manual-1' },
    };
    const futureRaw = JSON.stringify({ ...futureUnsigned, checksum: checksum(futureUnsigned) });
    storage.backing.setItem('test:save:manual-1', futureRaw);
    storage.quotaExactKey = undefined;

    expect(system.saveManual(1, state('RETRY'), metadata('E1M3')).persistence).toBe('memory-only');
    expect(storage.backing.getItem('test:save:manual-1')).toBe(futureRaw);
    system.clearManual(1);
    expect(storage.backing.getItem('test:save:manual-1')).toBe(futureRaw);
    expect(system.loadManual(1)).toMatchObject({ status: 'invalid', reason: 'Save version is newer than this build' });
  });

  it('preserves an empty corrupt save that appears beneath a volatile overlay', () => {
    const storage = new FaultingStorage();
    makeSystem(storage, [10], 'base-tab').saveManual(1, state('BASE'), metadata('E1M1'));
    const system = makeSystem(storage, [20, 30], 'quota-tab');
    system.loadManual(1);
    storage.quotaExactKey = 'test:save:manual-1';
    expect(system.saveManual(1, state('TAB-ONLY'), metadata('E1M2')).persistence).toBe('memory-only');
    storage.backing.setItem('test:save:manual-1', '');
    storage.quotaExactKey = undefined;

    expect(system.saveManual(1, state('RETRY'), metadata('E1M3')).persistence).toBe('memory-only');
    expect(storage.backing.getItem('test:save:manual-1')).toBe('');
    system.clearManual(1);
    expect(storage.backing.getItem('test:save:manual-1')).toBe('');
    expect(system.loadManual(1)).toMatchObject({ status: 'invalid' });
  });

  it('clears a tab-only overlay without deleting a valid external save whose shadow exceeded quota', () => {
    const storage = new FaultingStorage();
    const staleTab = makeSystem(storage, [100, 300], 'stale-tab');
    staleTab.loadManual(1);
    makeSystem(storage, [200], 'external-tab').saveManual(1, state('EXTERNAL'), metadata('E1M2'));
    const externalRaw = storage.backing.getItem('test:save:manual-1');
    storage.quotaKey = 'save-shadow:';

    expect(staleTab.saveManual(1, state('LOCAL'), metadata('E1M3'))).toMatchObject({ persistence: 'memory-only' });
    staleTab.clearManual(1);
    expect(storage.backing.getItem('test:save:manual-1')).toBe(externalRaw);
    expect(staleTab.loadManual(1)).toMatchObject({ status: 'valid', state: { map: 'EXTERNAL' } });
  });

  it('refuses to delete a slot that changed after this tab displayed it', () => {
    const storage = new MemoryStorage();
    const staleTab = makeSystem(storage, [100], 'stale-tab');
    makeSystem(storage, [50], 'first-tab').saveManual(1, state('FIRST'), metadata('E1M1'));
    staleTab.loadManual(1);
    makeSystem(storage, [75], 'newer-tab').saveManual(1, state('NEWER'), metadata('E1M2'));

    staleTab.clearManual(1);
    expect(makeSystem(storage, [200], 'fresh-tab').loadManual(1)).toMatchObject({ state: { map: 'NEWER' } });
  });
});

describe('PersistenceSystem storage degradation', () => {
  it('falls back to session memory when reads and writes are denied', () => {
    const storage = new FaultingStorage();
    storage.denyReads = true;
    const system = makeSystem(storage);
    expect(() => system.loadManual(1)).not.toThrow();
    expect(system.loadManual(1)).toMatchObject({ status: 'empty' });
    expect(system.storageStatus()).toMatchObject({
      mode: 'memory-fallback', failureCount: 2, lastFailure: { operation: 'read', name: 'SecurityError' },
    });

    storage.denyWrites = true;
    const saved = system.saveManual(1, state('SESSION'), metadata('E1M1'));
    expect(saved).toMatchObject({ status: 'valid', persistence: 'memory-only' });
    expect(system.loadManual(1)).toMatchObject({ status: 'valid', state: { map: 'SESSION' } });
    expect(storage.backing.getItem('test:save:manual-1')).toBeNull();
    expect(system.storageStatus()).toMatchObject({ mode: 'memory-fallback', volatileKeyCount: 2 });
  });

  it('retains quota-failed writes without weakening serialization validation', () => {
    const storage = new FaultingStorage();
    const system = makeSystem(storage);
    system.saveManual(1, state('PERSISTED'), metadata('E1M1'));
    storage.quotaKey = 'save:manual-1';
    const fallback = system.saveManual(1, state('FALLBACK'), metadata('E1M2'));

    expect(fallback).toMatchObject({ status: 'valid', persistence: 'memory-only' });
    expect(system.loadManual(1)).toMatchObject({ status: 'valid', persistence: 'memory-only', state: { map: 'FALLBACK' } });
    expect(system.storageStatus()).toMatchObject({
      mode: 'memory-fallback', volatileKeyCount: 1,
      lastFailure: { operation: 'write', key: 'test:save:manual-1', name: 'QuotaExceededError' },
    });
    expect(() => system.saveManual(1, { ...state('BAD'), health: Number.NaN }, metadata('E1M3'))).toThrow(TypeError);
    expect(system.loadManual(1)).toMatchObject({ state: { map: 'FALLBACK' } });
  });

  it('reports recovery to persistent storage after a later successful overwrite', () => {
    const storage = new FaultingStorage();
    const system = makeSystem(storage);
    storage.quotaKey = 'save:manual-1';
    expect(system.saveManual(1, state('MEMORY'), metadata('E1M1')).persistence).toBe('memory-only');
    storage.quotaKey = undefined;

    expect(system.saveManual(1, state('PERSISTED'), metadata('E1M2'))).toMatchObject({
      persistence: 'persistent',
      state: { map: 'PERSISTED' },
    });
    expect(system.storageStatus()).toMatchObject({ mode: 'persistent', volatileKeyCount: 0, failureCount: 1 });
    expect(makeSystem(storage.backing).loadManual(1)).toMatchObject({
      status: 'valid',
      persistence: 'persistent',
      state: { map: 'PERSISTED' },
    });
  });

  it('keeps campaign progress available when persistent writes fail', () => {
    const storage = new FaultingStorage();
    storage.denyWrites = true;
    const system = makeSystem(storage, [100, 200, 300]);
    system.completeMap('E1M8');
    system.completeEpisode('first-notice', 'exclusions-apply');

    expect(system.campaignUnlocks()).toMatchObject({
      unlockedEpisodes: ['exclusions-apply', 'first-notice'],
      completedEpisodes: ['first-notice'],
      completedMaps: ['E1M8'],
    });
    expect(storage.backing.getItem('test:campaign')).toBeNull();
  });

  it('rotates autosave cursors entirely within the memory fallback', () => {
    const storage = new FaultingStorage();
    storage.denyWrites = true;
    const system = makeSystem(storage, [10, 20, 30, 40, 50]);
    for (let index = 1; index <= AUTOSAVE_SLOT_COUNT + 2; index += 1) {
      system.autosave(state(`AUTO-${index}`), metadata(`E1M${index}`));
    }
    expect(system.listAutosaves().map((slot) => slot.status === 'valid' ? slot.state.map : '')).toEqual([
      'AUTO-4', 'AUTO-5', 'AUTO-3',
    ]);
    expect(storage.backing.getItem('test:autosave-cursor')).toBeNull();
  });

  it('honors session deletes when persistent removal is denied', () => {
    const storage = new FaultingStorage();
    const system = makeSystem(storage);
    system.saveManual(1, state('DELETE-ME'), metadata('E1M1'));
    system.quicksave(state('QUICK'), metadata('E1M1'));
    storage.denyRemoves = true;

    expect(() => system.clearManual(1)).not.toThrow();
    expect(() => system.clearQuicksave()).not.toThrow();
    expect(system.loadManual(1)).toMatchObject({ status: 'empty' });
    expect(system.loadQuicksave()).toMatchObject({ status: 'empty' });
    expect(storage.backing.getItem('test:save:manual-1')).not.toBeNull();
    expect(system.storageStatus()).toMatchObject({
      mode: 'memory-fallback', lastFailure: { operation: 'remove', key: 'test:save:quicksave' },
    });
  });
});

describe('PersistenceSystem campaign unlocks', () => {
  it('tracks map completion, episode completion, and ordered campaign unlocks', () => {
    const system = makeSystem(new MemoryStorage(), [100, 200, 300]);
    expect(system.campaignUnlocks()).toEqual({
      unlockedEpisodes: ['first-notice'], completedEpisodes: [], completedMaps: [], discoveredSecretMaps: [], records: {}, updatedAt: 0,
    });
    system.completeMap('E1M8');
    system.completeEpisode('first-notice', 'exclusions-apply');
    expect(system.isEpisodeUnlocked('exclusions-apply')).toBe(true);
    expect(system.campaignUnlocks()).toEqual({
      unlockedEpisodes: ['exclusions-apply', 'first-notice'],
      completedEpisodes: ['first-notice'],
      completedMaps: ['E1M8'],
      discoveredSecretMaps: [],
      records: {},
      updatedAt: 200,
    });
  });

  it('merges stronger performance records and keeps difficulties independent', () => {
    const system = makeSystem(new MemoryStorage(), [100, 200, 300]);
    system.completeMap('E1M1', {
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant: 'fresh-start', elapsed: 180, parSeconds: 200, score: 4200, bestChain: 4,
      killsPercent: 90, itemsPercent: 70, secretsPercent: 0, grade: 'B',
    });
    system.completeMap('E1M1', {
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant: 'fresh-start', elapsed: 220, parSeconds: 200, score: 5200, bestChain: 3,
      killsPercent: 100, itemsPercent: 60, secretsPercent: 100, grade: 'A',
    });
    system.completeMap('E1M1', {
      mapId: 'E1M1', difficulty: 'orientation', runVariant: 'fresh-start', elapsed: 140, parSeconds: 200, score: 2800, bestChain: 2,
      killsPercent: 80, itemsPercent: 50, secretsPercent: 0, grade: 'C',
    });

    expect(system.campaignUnlocks().records['E1M1:field-adjuster:fresh-start']).toMatchObject({
      completions: 2, bestTime: 180, highScore: 5200, bestChain: 4, bestKillsPercent: 100,
      bestItemsPercent: 70, bestSecretsPercent: 100, bestGrade: 'A', parBeaten: true, achievedAt: 200,
    });
    expect(system.campaignUnlocks().records['E1M1:orientation:fresh-start']).toMatchObject({ completions: 1, bestTime: 140, bestGrade: 'C' });
  });

  it('keeps fresh-start and campaign-carry records independent while merging the same track', () => {
    const system = makeSystem(new MemoryStorage(), [100, 200, 300]);
    const performance = (runVariant: 'fresh-start' | 'campaign-carry', score: number, elapsed: number) => ({
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant, elapsed, parSeconds: 200, score, bestChain: 4,
      killsPercent: 90, itemsPercent: 70, secretsPercent: 0, grade: 'B' as const,
    });

    system.completeMap('E1M1', performance('fresh-start', 4_000, 180));
    system.completeMap('E1M1', performance('campaign-carry', 9_000, 140));
    system.completeMap('E1M1', performance('fresh-start', 5_000, 170));

    expect(mapRecordKey('E1M1', 'field-adjuster', 'fresh-start'))
      .toBe('E1M1:field-adjuster:fresh-start');
    expect(system.campaignUnlocks().records).toMatchObject({
      'E1M1:field-adjuster:fresh-start': {
        runVariant: 'fresh-start', completions: 2, bestTime: 170, highScore: 5_000,
      },
      'E1M1:field-adjuster:campaign-carry': {
        runVariant: 'campaign-carry', completions: 1, bestTime: 140, highScore: 9_000,
      },
    });
  });

  it('rejects completion records whose performance belongs to a different map', () => {
    const mismatchedPerformance = {
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant: 'fresh-start' as const,
      elapsed: 180, parSeconds: 200, score: 4_000, bestChain: 4,
      killsPercent: 90, itemsPercent: 70, secretsPercent: 0, grade: 'B' as const,
    };
    const direct = makeSystem(new MemoryStorage(), [100], 'direct-tab');
    expect(() => direct.completeMap('E1M2', mismatchedPerformance))
      .toThrow('Performance map E1M1 does not match completed map E1M2');
    expect(direct.campaignUnlocks()).toMatchObject({ completedMaps: [], records: {} });

    const storage = new MemoryStorage();
    const unsigned = {
      schema: 'red-ledger-campaign-mutation' as const,
      version: 2 as const,
      id: 'mismatched-map-journal',
      writerId: 'bad-tab',
      createdAt: 100,
      mutation: { type: 'complete-map' as const, mapId: 'E1M2', performance: mismatchedPerformance },
    };
    storage.setItem('test:campaign-mutation:mismatched-map-journal', JSON.stringify({
      ...unsigned,
      checksum: checksum(unsigned),
    }));
    expect(makeSystem(storage).campaignUnlocks()).toMatchObject({ completedMaps: [], records: {} });
  });

  it('reconciles separate run variants across tabs without letting either track absorb the other', () => {
    const freshBranch = new MemoryStorage();
    const carryBranch = new MemoryStorage();
    const performance = (runVariant: 'fresh-start' | 'campaign-carry', score: number) => ({
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant, elapsed: 180, parSeconds: 200, score, bestChain: 4,
      killsPercent: 90, itemsPercent: 70, secretsPercent: 0, grade: 'B' as const,
    });
    makeSystem(freshBranch, [100], 'fresh-tab').completeMap('E1M1', performance('fresh-start', 4_000));
    makeSystem(carryBranch, [110], 'carry-tab').completeMap('E1M1', performance('campaign-carry', 8_000));

    const mergedStorage = new MemoryStorage();
    mergedStorage.setItem('test:campaign', carryBranch.getItem('test:campaign')!);
    mergedStorage.setItem('test:campaign-recovery', freshBranch.getItem('test:campaign')!);
    const records = makeSystem(mergedStorage, [200], 'merge-tab').campaignUnlocks().records;

    expect(records['E1M1:field-adjuster:fresh-start']).toMatchObject({ completions: 1, highScore: 4_000 });
    expect(records['E1M1:field-adjuster:campaign-carry']).toMatchObject({ completions: 1, highScore: 8_000 });
  });

  it('requires every mastery condition in one run instead of combining complementary personal bests', () => {
    const storage = new MemoryStorage();
    const system = makeSystem(storage, [100, 200, 300]);
    system.completeMap('E1M1', {
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant: 'fresh-start', elapsed: 150, parSeconds: 200, score: 6_000, bestChain: 6,
      killsPercent: 100, itemsPercent: 60, secretsPercent: 100, grade: 'S',
    });
    system.completeMap('E1M1', {
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant: 'fresh-start', elapsed: 160, parSeconds: 200, score: 5_500, bestChain: 5,
      killsPercent: 80, itemsPercent: 100, secretsPercent: 100, grade: 'S',
    });

    const synthesized = system.campaignUnlocks().records['E1M1:field-adjuster:fresh-start'];
    expect(synthesized).toMatchObject({
      bestKillsPercent: 100,
      bestItemsPercent: 100,
      bestSecretsPercent: 100,
      bestGrade: 'S',
      parBeaten: true,
    });
    expect(synthesized).not.toHaveProperty('masteryProof');

    system.completeMap('E1M1', {
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant: 'fresh-start', elapsed: 140, parSeconds: 200, score: 7_000, bestChain: 8,
      killsPercent: 100, itemsPercent: 100, secretsPercent: 100, grade: 'S',
    });
    const mastered = makeSystem(storage, [400], 'fresh-tab').campaignUnlocks().records['E1M1:field-adjuster:fresh-start'];
    expect(mastered.masteryProof).toEqual({
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant: 'fresh-start', elapsed: 140, parSeconds: 200, score: 7_000, bestChain: 8,
      killsPercent: 100, itemsPercent: 100, secretsPercent: 100, grade: 'S', achievedAt: 300,
    });
  });

  it('does not synthesize a mastery proof while reconciling complementary cross-tab records', () => {
    const firstBranch = new MemoryStorage();
    const secondBranch = new MemoryStorage();
    makeSystem(firstBranch, [100], 'tab-a').completeMap('E1M1', {
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant: 'fresh-start', elapsed: 150, parSeconds: 200, score: 6_000, bestChain: 6,
      killsPercent: 100, itemsPercent: 60, secretsPercent: 100, grade: 'S',
    });
    makeSystem(secondBranch, [110], 'tab-b').completeMap('E1M1', {
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant: 'fresh-start', elapsed: 160, parSeconds: 200, score: 5_500, bestChain: 5,
      killsPercent: 80, itemsPercent: 100, secretsPercent: 100, grade: 'S',
    });

    const mergedStorage = new MemoryStorage();
    mergedStorage.setItem('test:campaign', secondBranch.getItem('test:campaign')!);
    mergedStorage.setItem('test:campaign-recovery', firstBranch.getItem('test:campaign')!);
    const merged = makeSystem(mergedStorage, [200], 'tab-c').campaignUnlocks().records['E1M1:field-adjuster:fresh-start'];

    expect(merged).toMatchObject({ bestKillsPercent: 100, bestItemsPercent: 100, bestSecretsPercent: 100 });
    expect(merged).not.toHaveProperty('masteryProof');

    const masteredBranch = new MemoryStorage();
    makeSystem(masteredBranch, [120], 'tab-mastered').completeMap('E1M1', {
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant: 'fresh-start', elapsed: 140, parSeconds: 200, score: 7_000, bestChain: 8,
      killsPercent: 100, itemsPercent: 100, secretsPercent: 100, grade: 'S',
    });
    mergedStorage.setItem('test:campaign-recovery', masteredBranch.getItem('test:campaign')!);
    expect(makeSystem(mergedStorage, [300], 'tab-d').campaignUnlocks().records['E1M1:field-adjuster:fresh-start'].masteryProof)
      .toMatchObject({ achievedAt: 120, elapsed: 140, grade: 'S' });
  });

  it('records secret-map discovery separately from ordinary map order', () => {
    const system = makeSystem(new MemoryStorage(), [100, 200]);
    system.completeMap('E1M8');
    expect(system.campaignUnlocks().discoveredSecretMaps).toEqual([]);
    system.completeMap('E1M3', undefined, 'E1M9');
    expect(system.campaignUnlocks().discoveredSecretMaps).toEqual(['E1M9']);
  });

  it('migrates the frozen original campaign schema with non-destructive defaults', () => {
    const storage = new MemoryStorage();
    const original = JSON.stringify(LEGACY_CAMPAIGN_V1_FIXTURE);
    storage.setItem('test:campaign', original);
    expect(makeSystem(storage).campaignUnlocks()).toEqual({
      ...LEGACY_CAMPAIGN_V1_FIXTURE.progress,
      discoveredSecretMaps: [],
      records: {},
    });
    expect(storage.getItem('test:campaign')).toBe(original);
  });

  it('loads schema 4 and classifies schema 1-3 records as legacy without inventing run conditions', () => {
    const currentStorage = new MemoryStorage();
    currentStorage.setItem('test:campaign', JSON.stringify(CURRENT_CAMPAIGN_V4_FIXTURE));
    expect(PERSISTENCE_COMPATIBILITY_POLICY.campaign).toMatchObject({
      currentVersion: 4,
      oldestSupportedVersion: 1,
      legacyDefaults: { runVariant: 'legacy-unclassified' },
    });
    expect(makeSystem(currentStorage).campaignUnlocks()).toMatchObject({
      completedEpisodes: ['first-notice'],
      discoveredSecretMaps: ['E1M9'],
      records: {
        'E1M1:field-adjuster:fresh-start': {
          runVariant: 'fresh-start',
          bestGrade: 'S',
          highScore: 5_000,
          masteryProof: { runVariant: 'fresh-start', achievedAt: 1_710_000_000_200 },
        },
      },
    });

    const schemaThreeStorage = new MemoryStorage();
    schemaThreeStorage.setItem('test:campaign', JSON.stringify(CURRENT_CAMPAIGN_V3_FIXTURE));
    expect(makeSystem(schemaThreeStorage).campaignUnlocks()).toMatchObject({
      records: {
        'E1M1:field-adjuster:legacy-unclassified': {
          runVariant: 'legacy-unclassified',
          masteryProof: { runVariant: 'legacy-unclassified', achievedAt: 1_710_000_000_200 },
        },
      },
    });

    const schemaTwoStorage = new MemoryStorage();
    schemaTwoStorage.setItem('test:campaign', JSON.stringify(CURRENT_CAMPAIGN_V2_FIXTURE));
    expect(makeSystem(schemaTwoStorage).campaignUnlocks().records['E1M1:field-adjuster:legacy-unclassified'])
      .toMatchObject({ runVariant: 'legacy-unclassified' });
    expect(makeSystem(schemaTwoStorage).campaignUnlocks().records['E1M1:field-adjuster:legacy-unclassified'])
      .not.toHaveProperty('masteryProof');

    const { checksum: _schemaTwoChecksum, ...schemaTwoUnsigned } = CURRENT_CAMPAIGN_V2_FIXTURE;
    const schemaTwoWithUntrustedProof = {
      ...schemaTwoUnsigned,
      progress: {
        ...schemaTwoUnsigned.progress,
        records: {
          ...schemaTwoUnsigned.progress.records,
          'E1M1:field-adjuster': {
            ...schemaTwoUnsigned.progress.records['E1M1:field-adjuster'],
            masteryProof: CURRENT_CAMPAIGN_V3_FIXTURE.progress.records['E1M1:field-adjuster'].masteryProof,
          },
        },
      },
    };
    schemaTwoStorage.setItem('test:campaign', JSON.stringify({
      ...schemaTwoWithUntrustedProof,
      checksum: checksum(schemaTwoWithUntrustedProof),
    }));
    expect(makeSystem(schemaTwoStorage).campaignUnlocks().records['E1M1:field-adjuster:legacy-unclassified'])
      .not.toHaveProperty('masteryProof');

    const legacyStorage = new MemoryStorage();
    legacyStorage.setItem('test:campaign', JSON.stringify(LEGACY_CAMPAIGN_V1_FIXTURE));
    makeSystem(legacyStorage).completeMap('E1M2');
    expect(JSON.parse(legacyStorage.getItem('test:campaign')!).version).toBe(CAMPAIGN_SCHEMA_VERSION);
  });

  it('adopts a schema-2 versioned recovery without inventing a mastery proof', () => {
    const storage = new MemoryStorage();
    storage.setItem('test:campaign', '{protected-future-campaign');
    storage.setItem('test:campaign-recovery', '{protected-future-recovery');
    storage.setItem('test:campaign-recovery-v2', JSON.stringify(CURRENT_CAMPAIGN_V2_FIXTURE));

    const restored = makeSystem(storage).campaignUnlocks();

    expect(restored.completedMaps).toEqual(CURRENT_CAMPAIGN_V2_FIXTURE.progress.completedMaps);
    expect(restored.records['E1M1:field-adjuster:legacy-unclassified']).not.toHaveProperty('masteryProof');
    expect(storage.getItem('test:campaign-recovery-v2')).toBeNull();
    expect(JSON.parse(storage.getItem('test:campaign-recovery-v4')!)).toMatchObject({ version: 4 });
  });

  it('accepts unknown current campaign fields and preserves future or corrupt documents untouched', () => {
    const compatibleStorage = new MemoryStorage();
    const { checksum: _fixtureChecksum, ...fixtureUnsigned } = CURRENT_CAMPAIGN_V4_FIXTURE;
    const compatibleUnsigned = {
      ...fixtureUnsigned,
      extension: { source: 'later-compatible-build' },
      progress: { ...fixtureUnsigned.progress, optionalPresentation: 'dense' },
    };
    compatibleStorage.setItem('test:campaign', JSON.stringify({
      ...compatibleUnsigned,
      checksum: checksum(compatibleUnsigned),
    }));
    expect(makeSystem(compatibleStorage).campaignUnlocks()).toMatchObject({
      completedEpisodes: ['first-notice'],
      discoveredSecretMaps: ['E1M9'],
    });

    for (const raw of [
      '{broken',
      (() => {
        const unsigned = { ...fixtureUnsigned, version: CAMPAIGN_SCHEMA_VERSION + 1 };
        return JSON.stringify({ ...unsigned, checksum: checksum(unsigned) });
      })(),
    ]) {
      const rejectedStorage = new MemoryStorage();
      rejectedStorage.setItem('test:campaign', raw);
      expect(makeSystem(rejectedStorage).campaignUnlocks()).toEqual({
        unlockedEpisodes: ['first-notice'],
        completedEpisodes: [],
        completedMaps: [],
        discoveredSecretMaps: [],
        records: {},
        updatedAt: 0,
      });
      expect(rejectedStorage.getItem('test:campaign')).toBe(raw);
    }
  });

  it('rejects schema-4 records whose key, record, or mastery proof disagree about the run variant', () => {
    const { checksum: _fixtureChecksum, ...fixtureUnsigned } = CURRENT_CAMPAIGN_V4_FIXTURE;
    const key = 'E1M1:field-adjuster:fresh-start';
    const record = fixtureUnsigned.progress.records[key];
    const invalidDocuments = [
      {
        ...fixtureUnsigned,
        progress: { ...fixtureUnsigned.progress, records: { 'E1M1:field-adjuster:campaign-carry': record } },
      },
      {
        ...fixtureUnsigned,
        progress: {
          ...fixtureUnsigned.progress,
          records: { [key]: { ...record, runVariant: 'campaign-carry' as const } },
        },
      },
      {
        ...fixtureUnsigned,
        progress: {
          ...fixtureUnsigned.progress,
          records: {
            [key]: {
              ...record,
              masteryProof: { ...record.masteryProof, runVariant: 'campaign-carry' as const },
            },
          },
        },
      },
    ];

    invalidDocuments.forEach((unsigned) => {
      const raw = JSON.stringify({ ...unsigned, checksum: checksum(unsigned) });
      const storage = new MemoryStorage();
      storage.setItem('test:campaign', raw);
      expect(makeSystem(storage).campaignUnlocks().records).toEqual({});
      expect(storage.getItem('test:campaign')).toBe(raw);
    });
  });

  it('checkpoints campaign mutations in a bounded recovery record when the canonical is protected', () => {
    vi.useFakeTimers();
    const { checksum: _checksum, ...currentUnsigned } = CURRENT_CAMPAIGN_V4_FIXTURE;
    const futureUnsigned = { ...currentUnsigned, version: CAMPAIGN_SCHEMA_VERSION + 1 };
    const futureRaw = JSON.stringify({ ...futureUnsigned, checksum: checksum(futureUnsigned) });
    const invalidChecksumRaw = JSON.stringify({ ...CURRENT_CAMPAIGN_V4_FIXTURE, checksum: '00000000' });

    try {
      for (const raw of ['{broken', invalidChecksumRaw, futureRaw]) {
        const storage = new MemoryStorage();
        storage.setItem('test:campaign', raw);
        const system = makeSystem(storage, [100, 200, 300, 400], 'current-tab');
        expect(system.completeMap('E1M2').completedMaps).toContain('E1M2');
        expect(system.completeMap('E1M3').completedMaps).toEqual(['E1M2', 'E1M3']);
        expect(system.completeEpisode('first-notice', 'exclusions-apply').completedEpisodes).toContain('first-notice');
        expect(system.storageStatus().mode).toBe('persistent');
        expect(storage.getItem('test:campaign')).toBe(raw);
        expect(storageKeys(storage, 'test:campaign-mutation:')).toHaveLength(3);
        expect(JSON.parse(storage.getItem('test:campaign-recovery')!).appliedMutations).toHaveLength(3);

        vi.advanceTimersByTime(5_000);

        expect(storage.getItem('test:campaign')).toBe(raw);
        expect(storageKeys(storage, 'test:campaign-mutation:')).toEqual([]);
        expect(JSON.parse(storage.getItem('test:campaign-recovery')!).appliedMutations).toEqual([]);
        expect(makeSystem(storage, [500], 'fresh-tab').campaignUnlocks()).toMatchObject({
          completedMaps: ['E1M2', 'E1M3'],
          completedEpisodes: ['first-notice'],
          unlockedEpisodes: ['exclusions-apply', 'first-notice'],
        });
        expect(system.conflicts()).toContainEqual(expect.objectContaining({ kind: 'campaign-recovery' }));
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('rotates to a bounded current-version checkpoint when both primary records are protected', () => {
    vi.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      const futureRaw = '{"schema":"red-ledger-campaign","version":999,"checksum":"future"}';
      const damagedRecoveryRaw = '{damaged-recovery';
      storage.setItem('test:campaign', futureRaw);
      storage.setItem('test:campaign-recovery', damagedRecoveryRaw);

      const system = makeSystem(storage, [100, 200, 300], 'current-tab');
      expect(system.completeMap('E1M2').completedMaps).toContain('E1M2');
      expect(system.completeMap('E1M3').completedMaps).toEqual(['E1M2', 'E1M3']);
      expect(system.storageStatus().mode).toBe('persistent');
      expect(storage.getItem('test:campaign')).toBe(futureRaw);
      expect(storage.getItem('test:campaign-recovery')).toBe(damagedRecoveryRaw);
      expect(storage.getItem('test:campaign-recovery-v4')).not.toBeNull();

      vi.advanceTimersByTime(5_000);

      expect(storageKeys(storage, 'test:campaign-mutation:')).toEqual([]);
      expect(JSON.parse(storage.getItem('test:campaign-recovery-v4')!).appliedMutations).toEqual([]);
      expect(makeSystem(storage, [400], 'fresh-tab').campaignUnlocks().completedMaps).toEqual(['E1M2', 'E1M3']);
      expect(storage.getItem('test:campaign')).toBe(futureRaw);
      expect(storage.getItem('test:campaign-recovery')).toBe(damagedRecoveryRaw);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['removed', 'repaired'] as const)('adopts compacted recovery progress when the canonical is %s', (transition) => {
    vi.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      const protectedRaw = '{future-campaign';
      storage.setItem('test:campaign', protectedRaw);
      makeSystem(storage, [100], 'recovery-tab').completeMap('E1M2');
      vi.advanceTimersByTime(5_000);
      expect(storageKeys(storage, 'test:campaign-mutation:')).toEqual([]);

      if (transition === 'removed') {
        storage.removeItem('test:campaign');
      } else {
        storage.setItem('test:campaign', JSON.stringify(CURRENT_CAMPAIGN_V3_FIXTURE));
      }

      const adopted = makeSystem(storage, [200], 'adopting-tab').campaignUnlocks();
      expect(adopted.completedMaps).toContain('E1M2');
      if (transition === 'repaired') {
        expect(adopted.completedMaps).toEqual(expect.arrayContaining([...CURRENT_CAMPAIGN_V3_FIXTURE.progress.completedMaps]));
      }
      expect(storage.getItem('test:campaign-recovery')).toBeNull();
      expect(JSON.parse(storage.getItem('test:campaign')!).progress.completedMaps).toContain('E1M2');
      expect(makeSystem(storage, [300], 'fresh-tab').campaignUnlocks().completedMaps).toContain('E1M2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let damaged campaign progress affect save slots', () => {
    const storage = new MemoryStorage();
    const system = makeSystem(storage);
    system.saveManual(1, state('SAFE'), metadata('E1M1'));
    storage.setItem('test:campaign', '{bad');
    expect(system.campaignUnlocks().unlockedEpisodes).toEqual(['first-notice']);
    expect(system.loadManual(1)).toMatchObject({ status: 'valid', state: { map: 'SAFE' } });
  });

  it('normalizes version-1 performance journals to legacy and writes new journals as version 2', () => {
    const storage = new MemoryStorage();
    const legacyUnsigned = {
      schema: 'red-ledger-campaign-mutation' as const,
      version: 1 as const,
      id: 'legacy-journal',
      writerId: 'old-tab',
      createdAt: 100,
      mutation: {
        type: 'complete-map' as const,
        mapId: 'E1M1',
        performance: {
          mapId: 'E1M1', difficulty: 'field-adjuster', elapsed: 180, parSeconds: 200, score: 4_000, bestChain: 4,
          killsPercent: 90, itemsPercent: 70, secretsPercent: 0, grade: 'B' as const,
        },
      },
    };
    storage.setItem('test:campaign-mutation:legacy-journal', JSON.stringify({
      ...legacyUnsigned,
      checksum: checksum(legacyUnsigned),
    }));

    const system = makeSystem(storage, [200], 'new-tab');
    expect(system.campaignUnlocks().records['E1M1:field-adjuster:legacy-unclassified'])
      .toMatchObject({ runVariant: 'legacy-unclassified', completions: 1, highScore: 4_000 });

    system.completeMap('E1M2', {
      mapId: 'E1M2', difficulty: 'field-adjuster', runVariant: 'fresh-start', elapsed: 200, parSeconds: 220,
      score: 5_000, bestChain: 5, killsPercent: 100, itemsPercent: 80, secretsPercent: 0, grade: 'A',
    });
    const currentJournal = storageKeys(storage, 'test:campaign-mutation:')
      .map((key) => JSON.parse(storage.getItem(key)!))
      .find((journal) => journal.id !== 'legacy-journal');
    expect(currentJournal).toMatchObject({ version: 2, mutation: { performance: { runVariant: 'fresh-start' } } });
  });

  it('ignores a checksum-valid version-2 journal that omits its required run variant', () => {
    const storage = new MemoryStorage();
    const unsigned = {
      schema: 'red-ledger-campaign-mutation' as const,
      version: 2 as const,
      id: 'invalid-current-journal',
      writerId: 'bad-tab',
      createdAt: 100,
      mutation: {
        type: 'complete-map' as const,
        mapId: 'E1M1',
        performance: {
          mapId: 'E1M1', difficulty: 'field-adjuster', elapsed: 180, parSeconds: 200, score: 4_000, bestChain: 4,
          killsPercent: 90, itemsPercent: 70, secretsPercent: 0, grade: 'B' as const,
        },
      },
    };
    storage.setItem('test:campaign-mutation:invalid-current-journal', JSON.stringify({
      ...unsigned,
      checksum: checksum(unsigned),
    }));

    expect(makeSystem(storage).campaignUnlocks()).toMatchObject({ completedMaps: [], records: {} });
  });

  it('reconciles checksum-valid mutation journals from simultaneous campaign branches exactly once', () => {
    const firstBranch = new MemoryStorage();
    const secondBranch = new MemoryStorage();
    const performance = (score: number): Parameters<PersistenceSystem<TestState>['completeMap']>[1] => ({
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant: 'fresh-start', elapsed: 180, parSeconds: 200, score, bestChain: 4,
      killsPercent: 90, itemsPercent: 70, secretsPercent: 0, grade: 'B',
    });
    makeSystem(firstBranch, [100], 'tab-a').completeMap('E1M1', performance(4_000));
    makeSystem(secondBranch, [110], 'tab-b').completeMap('E1M1', performance(5_000), 'E1M9');

    const mergedStorage = new MemoryStorage();
    storageKeys(secondBranch).forEach((key) => mergedStorage.setItem(key, secondBranch.getItem(key)!));
    storageKeys(firstBranch, 'test:campaign-mutation:').forEach((key) => mergedStorage.setItem(key, firstBranch.getItem(key)!));
    const system = makeSystem(mergedStorage, [200], 'tab-c');

    expect(system.campaignUnlocks()).toMatchObject({
      completedMaps: ['E1M1'],
      discoveredSecretMaps: ['E1M9'],
      records: { 'E1M1:field-adjuster:fresh-start': { completions: 2, highScore: 5_000 } },
    });
    expect(system.campaignUnlocks().records['E1M1:field-adjuster:fresh-start'].completions).toBe(2);
    system.unlockEpisode('exclusions-apply');
    const persisted = makeSystem(mergedStorage, [300], 'tab-d').campaignUnlocks();
    expect(persisted.records['E1M1:field-adjuster:fresh-start'].completions).toBe(2);
    expect(persisted.unlockedEpisodes).toContain('exclusions-apply');
  });

  it('uses the external commit ledger when an older writer drops applied mutation ids', () => {
    const storage = new MemoryStorage();
    const performance = {
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant: 'fresh-start' as const, elapsed: 180, parSeconds: 200, score: 4_000, bestChain: 4,
      killsPercent: 90, itemsPercent: 70, secretsPercent: 0, grade: 'B' as const,
    };
    makeSystem(storage, [100], 'new-tab').completeMap('E1M1', performance);
    const parsed = JSON.parse(storage.getItem('test:campaign')!);
    const { checksum: _oldChecksum, appliedMutations: _oldApplied, ...olderUnsigned } = parsed;
    storage.setItem('test:campaign', JSON.stringify({ ...olderUnsigned, checksum: checksum(olderUnsigned) }));

    const restored = makeSystem(storage, [200], 'later-tab').campaignUnlocks();
    expect(restored.records['E1M1:field-adjuster:fresh-start'].completions).toBe(1);
    expect(restored.completedMaps).toEqual(['E1M1']);
  });

  it('replays committed journals when the campaign canonical alone is missing', () => {
    vi.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      makeSystem(storage, [100], 'tab-a').completeMap('E1M1');
      storage.removeItem('test:campaign');
      const reader = makeSystem(storage, [200], 'tab-b');
      expect(reader.campaignUnlocks().completedMaps).toContain('E1M1');
      vi.advanceTimersByTime(5_000);
      expect(makeSystem(storage, [300], 'tab-c').campaignUnlocks().completedMaps).toContain('E1M1');
      expect(storageKeys(storage, 'test:campaign-mutation:')).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a quota-failed campaign mutation in session without replacing the durable canonical', () => {
    const storage = new FaultingStorage();
    const system = makeSystem(storage, [100, 200, 300], 'tab-a');
    system.completeMap('E1M1');
    const durableBefore = storage.backing.getItem('test:campaign');
    storage.quotaKey = 'campaign-mutation:';

    expect(system.completeMap('E1M2').completedMaps).toEqual(['E1M1', 'E1M2']);
    expect(storage.backing.getItem('test:campaign')).toBe(durableBefore);
    expect(system.storageStatus()).toMatchObject({ mode: 'memory-fallback' });

    storage.quotaKey = undefined;
    expect(system.completeMap('E1M3').completedMaps).toEqual(['E1M1', 'E1M2', 'E1M3']);
    expect(makeSystem(storage.backing, [400], 'tab-b').campaignUnlocks().completedMaps).toEqual(['E1M1', 'E1M2', 'E1M3']);
    expect(system.storageStatus()).toMatchObject({ mode: 'persistent', volatileKeyCount: 0 });
  });

  it.each([
    { target: 'test:campaign', expectedCheckpoint: 'test:campaign-recovery', externalRaw: '{"schema":"red-ledger-campaign","version":999,"primary":"retained"}' },
    { target: 'test:campaign', expectedCheckpoint: 'test:campaign-recovery', externalRaw: '' },
    { target: 'test:campaign-recovery', expectedCheckpoint: 'test:campaign-recovery-v4', externalRaw: '{"schema":"red-ledger-campaign","version":999,"recovery":"retained"}' },
  ])('relocates a volatile $target overlay before external bytes can be overwritten', ({ target, expectedCheckpoint, externalRaw }) => {
    vi.useFakeTimers();
    try {
      const storage = new FaultingStorage();
      const primaryFutureRaw = '{"schema":"red-ledger-campaign","version":999,"primary":"retained"}';
      if (target !== 'test:campaign') storage.backing.setItem('test:campaign', primaryFutureRaw);
      storage.quotaExactKey = target;
      const system = makeSystem(storage, [100, 200, 300], 'quota-tab');
      expect(system.completeMap('E1M1').completedMaps).toContain('E1M1');
      expect(system.storageStatus().mode).toBe('memory-fallback');

      storage.backing.setItem(target, externalRaw);
      storage.quotaExactKey = undefined;

      expect(system.completeMap('E1M2').completedMaps).toEqual(['E1M1', 'E1M2']);
      expect(storage.backing.getItem(target)).toBe(externalRaw);
      expect(system.campaignUnlocks().completedMaps).toEqual(['E1M1', 'E1M2']);
      expect(storage.backing.getItem(expectedCheckpoint)).not.toBeNull();
      expect(system.storageStatus()).toMatchObject({ mode: 'persistent', volatileKeyCount: 0 });

      vi.advanceTimersByTime(5_000);

      expect(storageKeys(storage.backing, 'test:campaign-mutation:')).toEqual([]);
      expect(JSON.parse(storage.backing.getItem(expectedCheckpoint)!).appliedMutations).toEqual([]);
      expect(storage.backing.getItem(target)).toBe(externalRaw);
      expect(makeSystem(storage.backing, [400], 'fresh-tab').campaignUnlocks().completedMaps).toEqual(['E1M1', 'E1M2']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('compacts applied campaign journals and their canonical id list after the stability window', () => {
    vi.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      const system = makeSystem(storage, [100, 200, 300, 400], 'tab-a');
      system.completeMap('E1M1');
      system.completeMap('E1M2');
      system.completeEpisode('first-notice', 'exclusions-apply');
      expect(storageKeys(storage, 'test:campaign-mutation:')).toHaveLength(3);

      vi.advanceTimersByTime(5_000);
      expect(storageKeys(storage, 'test:campaign-mutation:')).toEqual([]);
      expect(JSON.parse(storage.getItem('test:campaign')!).appliedMutations).toEqual([]);
      expect(system.campaignUnlocks()).toMatchObject({
        completedMaps: ['E1M1', 'E1M2'],
        completedEpisodes: ['first-notice'],
        unlockedEpisodes: ['exclusions-apply', 'first-notice'],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('adopts and compacts an abandoned foreign journal on the next durable campaign write', () => {
    vi.useFakeTimers();
    try {
      const abandonedStorage = new MemoryStorage();
      makeSystem(abandonedStorage, [100], 'closed-tab').completeMap('E1M1');
      const sharedStorage = new MemoryStorage();
      storageKeys(abandonedStorage).forEach((key) => sharedStorage.setItem(key, abandonedStorage.getItem(key)!));

      const activeTab = makeSystem(sharedStorage, [200], 'active-tab');
      activeTab.completeMap('E1M2');
      expect(storageKeys(sharedStorage, 'test:campaign-mutation:')).toHaveLength(2);
      expect(activeTab.campaignUnlocks().completedMaps).toEqual(['E1M1', 'E1M2']);

      vi.advanceTimersByTime(5_000);
      expect(storageKeys(sharedStorage, 'test:campaign-mutation:')).toEqual([]);
      expect(JSON.parse(sharedStorage.getItem('test:campaign')!).appliedMutations).toEqual([]);
      expect(makeSystem(sharedStorage, [300], 'later-tab').campaignUnlocks().completedMaps).toEqual(['E1M1', 'E1M2']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('adopts and compacts a crash-abandoned journal during a read-only session', () => {
    vi.useFakeTimers();
    try {
      const abandonedStorage = new MemoryStorage();
      makeSystem(abandonedStorage, [100], 'closed-tab').completeMap('E1M1');
      const journalKey = storageKeys(abandonedStorage, 'test:campaign-mutation:')[0];
      const sharedStorage = new MemoryStorage();
      sharedStorage.setItem('test:campaign', JSON.stringify(CURRENT_CAMPAIGN_V3_FIXTURE));
      sharedStorage.setItem(journalKey, abandonedStorage.getItem(journalKey)!);

      const reader = makeSystem(sharedStorage, [200], 'reader-tab');
      expect(reader.campaignUnlocks().completedMaps).toContain('E1M1');
      vi.advanceTimersByTime(5_000);
      expect(storageKeys(sharedStorage, 'test:campaign-mutation:')).toEqual([]);
      expect(makeSystem(sharedStorage, [300], 'later-tab').campaignUnlocks().completedMaps).toContain('E1M1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves compatible campaign extensions while compacting journals', () => {
    vi.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      const system = makeSystem(storage, [100], 'tab-a');
      system.completeMap('E1M1');
      const parsed = JSON.parse(storage.getItem('test:campaign')!);
      const { checksum: _storedChecksum, ...unsigned } = parsed;
      const extended = {
        ...unsigned,
        vendorExtension: { retained: true },
        progress: { ...unsigned.progress, futureMetric: 17 },
      };
      storage.setItem('test:campaign', JSON.stringify({ ...extended, checksum: checksum(extended) }));

      vi.advanceTimersByTime(5_000);
      const compacted = JSON.parse(storage.getItem('test:campaign')!);
      expect(compacted.vendorExtension).toEqual({ retained: true });
      expect(compacted.progress.futureMetric).toBe(17);
      expect(compacted.appliedMutations).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('recovers from a failed maintenance removal on the next campaign mutation', () => {
    vi.useFakeTimers();
    try {
      const storage = new FaultingStorage();
      const system = makeSystem(storage, [100, 200], 'tab-a');
      system.completeMap('E1M1');
      storage.denyRemoves = true;
      vi.advanceTimersByTime(5_000);
      expect(system.storageStatus().mode).toBe('memory-fallback');

      storage.denyRemoves = false;
      expect(system.completeMap('E1M2').completedMaps).toEqual(['E1M1', 'E1M2']);
      expect(system.storageStatus().mode).toBe('persistent');
      expect(makeSystem(storage.backing, [300], 'fresh-tab').campaignUnlocks().completedMaps).toEqual(['E1M1', 'E1M2']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('deterministic demos', () => {
  interface Command { readonly action: 'move' | 'fire'; readonly value: number }
  const isCommand = (value: unknown): value is Command => value !== null
    && typeof value === 'object'
    && ['move', 'fire'].includes(String((value as Partial<Command>).action))
    && typeof (value as Partial<Command>).value === 'number';

  it('records ordered commands by fixed simulation tick with a stable checksum', () => {
    const options = { seed: 1234, mapId: 'E1M1', initialState: state('E1M1'), createdAt: 77, tickRate: 35, playbackSettings: { verticalAutoAim: true } };
    const first = new DemoRecorder<TestState, Command>(options);
    first.record(0, { action: 'move', value: 1 });
    first.record(0, { action: 'fire', value: 1 });
    first.record(3, { action: 'move', value: 0 });
    const demo = first.finish(5);

    const second = new DemoRecorder<TestState, Command>(options);
    second.record(0, { value: 1, action: 'move' });
    second.record(0, { value: 1, action: 'fire' });
    second.record(3, { value: 0, action: 'move' });

    expect(demo).toEqual(second.finish(5));
    expect(demo.frames).toEqual([
      { tick: 0, commands: [{ action: 'move', value: 1 }, { action: 'fire', value: 1 }] },
      { tick: 3, commands: [{ action: 'move', value: 0 }] },
    ]);
    expect(validateDemo(demo, { validateInitialState: isTestState, validateCommand: isCommand })).toMatchObject({ valid: true });
    expect(demo.version).toBe(DEMO_SCHEMA_VERSION);
  });

  it('requires signed gameplay-affecting playback settings', () => {
    const recorder = new DemoRecorder<TestState, Command>({
      seed: 21,
      mapId: 'E1M1',
      initialState: state('E1M1'),
      createdAt: 78,
      playbackSettings: { verticalAutoAim: false },
    });
    recorder.record(0, { action: 'fire', value: 1 });
    const demo = recorder.finish(1);

    expect(demo.playbackSettings).toEqual({ verticalAutoAim: false });
    expect(recorder.estimatedSerializedBytes(1)).toBe(JSON.stringify(demo).length * 2);
    expect(validateDemo(demo, { validateInitialState: isTestState, validateCommand: isCommand })).toMatchObject({ valid: true });

    const { checksum: _checksum, playbackSettings: _settings, ...legacyUnsigned } = demo;
    const legacy = { ...legacyUnsigned, checksum: checksum(legacyUnsigned) };
    expect(validateDemo(legacy, { validateInitialState: isTestState, validateCommand: isCommand }))
      .toEqual({ valid: false, reason: 'Invalid playback settings' });

    const malformedUnsigned = { ...legacyUnsigned, playbackSettings: { verticalAutoAim: 'sometimes' } };
    const malformed = { ...malformedUnsigned, checksum: checksum(malformedUnsigned) };
    expect(validateDemo(malformed)).toEqual({ valid: false, reason: 'Invalid playback settings' });
  });

  it('rejects a checksum-valid replay from the previous deterministic simulation version', () => {
    const recorder = new DemoRecorder<TestState, Command>({ seed: 7, mapId: 'E1M1', initialState: state('E1M1'), createdAt: 9, playbackSettings: { verticalAutoAim: true } });
    recorder.record(0, { action: 'fire', value: 1 });
    const current = recorder.finish(1);
    const { checksum: _currentChecksum, ...currentUnsigned } = current;
    const legacyUnsigned = { ...currentUnsigned, version: DEMO_SCHEMA_VERSION - 1 };
    const legacy = { ...legacyUnsigned, checksum: checksum(legacyUnsigned) };

    expect(validateDemo(legacy)).toEqual({ valid: false, reason: 'Unsupported demo version' });
  });

  it('plays commands at exact ticks and supports deterministic reset and seek', () => {
    const recorder = new DemoRecorder<TestState, Command>({ seed: 1, mapId: 'E1M1', initialState: state('E1M1'), createdAt: 1, playbackSettings: { verticalAutoAim: true } });
    recorder.record(1, { action: 'move', value: 1 });
    recorder.record(3, { action: 'fire', value: 1 });
    const playback = new DemoPlayback(recorder.finish(4));

    expect(playback.next()).toEqual([]);
    expect(playback.next()).toEqual([{ action: 'move', value: 1 }]);
    playback.seek(3);
    expect(playback.next()).toEqual([{ action: 'fire', value: 1 }]);
    expect(playback.finished).toBe(true);
    playback.reset();
    expect([playback.next(), playback.next()]).toEqual([[], [{ action: 'move', value: 1 }]]);
  });

  it('run-length encodes full-map command streams and seeks inside repeated spans', () => {
    const recorder = new DemoRecorder<TestState, Command>({ seed: 12, mapId: 'E1M1', initialState: state('E1M1'), createdAt: 4, playbackSettings: { verticalAutoAim: true } });
    const twentyMinutes = 35 * 60 * 20;
    for (let tick = 0; tick < twentyMinutes; tick += 1) recorder.record(tick, { action: 'move', value: 1 });
    const demo = recorder.finish(twentyMinutes);

    expect(demo.frames).toEqual([{ tick: 0, commands: [{ action: 'move', value: 1 }], duration: twentyMinutes }]);
    expect(JSON.stringify(demo).length).toBeLessThan(1_000);
    expect(validateDemo(demo, { validateInitialState: isTestState, validateCommand: isCommand })).toMatchObject({ valid: true });

    const playback = new DemoPlayback(demo);
    playback.seek(twentyMinutes - 1);
    expect(playback.next()).toEqual([{ action: 'move', value: 1 }]);
    expect(playback.finished).toBe(true);
  });

  it('stops a 45-minute noisy command stream before its UTF-16 storage budget', () => {
    interface NoisyCommand {
      forward: number; strafe: number; turn: number; look: number; lookVertical: number;
      fire: boolean; use: boolean; walkToggle: boolean; weaponSlot: number; weaponCycle: number;
    }
    const recorder = new DemoRecorder<TestState, NoisyCommand>({
      seed: 19,
      mapId: 'E1M1',
      initialState: state('E1M1'),
      createdAt: 6,
      playbackSettings: { verticalAutoAim: true },
      maxSerializedBytes: DEMO_STORAGE_BUDGET_BYTES,
    });
    const maximumTicks = 35 * 60 * 45;
    let acceptedTicks = 0;
    for (let tick = 0; tick < maximumTicks; tick += 1) {
      const direction = tick % 2 ? -1 : 1;
      const accepted = recorder.record(tick, {
        forward: direction,
        strafe: -direction,
        turn: tick / maximumTicks,
        look: -tick / maximumTicks,
        lookVertical: direction * .5,
        fire: tick % 3 === 0,
        use: tick % 5 === 0,
        walkToggle: tick % 7 === 0,
        weaponSlot: tick % 8,
        weaponCycle: direction,
      });
      if (!accepted) break;
      acceptedTicks += 1;
    }
    const demo = recorder.finish(acceptedTicks);
    const actualBytes = JSON.stringify(demo).length * 2;

    expect(acceptedTicks).toBeGreaterThan(1_000);
    expect(acceptedTicks).toBeLessThan(maximumTicks);
    expect(actualBytes).toBeLessThanOrEqual(DEMO_STORAGE_BUDGET_BYTES);
    expect(recorder.estimatedSerializedBytes(demo.totalTicks)).toBe(actualBytes);
    expect(demo.version).toBe(DEMO_SCHEMA_VERSION);
    expect(validateDemo(demo)).toMatchObject({ valid: true });
  });

  it('preserves a second command added after a repeated single-command tick', () => {
    const recorder = new DemoRecorder<TestState, Command>({ seed: 13, mapId: 'E1M1', initialState: state('E1M1'), createdAt: 5, playbackSettings: { verticalAutoAim: true } });
    recorder.record(0, { action: 'move', value: 1 });
    recorder.record(1, { action: 'move', value: 1 });
    recorder.record(1, { action: 'fire', value: 1 });
    const demo = recorder.finish(2);

    expect(demo.frames).toEqual([
      { tick: 0, commands: [{ action: 'move', value: 1 }] },
      { tick: 1, commands: [{ action: 'move', value: 1 }, { action: 'fire', value: 1 }] },
    ]);
    const playback = new DemoPlayback(demo);
    expect(playback.next()).toEqual([{ action: 'move', value: 1 }]);
    expect(playback.next()).toEqual([{ action: 'move', value: 1 }, { action: 'fire', value: 1 }]);
  });

  it('rejects out-of-order recording and checksum-tampered playback documents', () => {
    const recorder = new DemoRecorder<TestState, Command>({ seed: 1, mapId: 'E1M1', initialState: state('E1M1'), createdAt: 1, playbackSettings: { verticalAutoAim: true } });
    recorder.record(2, { action: 'fire', value: 1 });
    expect(() => recorder.record(1, { action: 'move', value: 1 })).toThrow(RangeError);
    const demo = recorder.finish(3) as unknown as Record<string, unknown>;
    demo.totalTicks = 4;
    expect(validateDemo(demo)).toEqual({ valid: false, reason: 'Checksum mismatch' });
  });
});
