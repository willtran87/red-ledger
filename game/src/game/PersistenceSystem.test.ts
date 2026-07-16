import { describe, expect, it } from 'vitest';
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
  validateDemo,
  type SaveMetadataInput,
} from './PersistenceSystem';
import {
  CURRENT_CAMPAIGN_V2_FIXTURE,
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

const makeSystem = (storage: Storage, times: number[] = [1000]) => {
  let index = 0;
  return new PersistenceSystem<TestState>(storage, {
    namespace: 'test',
    gameVersion: 'test-build',
    episodeIds: ['first-notice', 'exclusions-apply', 'adverse-development'],
    initialUnlockedEpisodes: ['first-notice'],
    validateState: isTestState,
    now: () => times[Math.min(index++, times.length - 1)],
  });
};

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
      mapId: 'E1M1', difficulty: 'field-adjuster', elapsed: 180, parSeconds: 200, score: 4200, bestChain: 4,
      killsPercent: 90, itemsPercent: 70, secretsPercent: 0, grade: 'B',
    });
    system.completeMap('E1M1', {
      mapId: 'E1M1', difficulty: 'field-adjuster', elapsed: 220, parSeconds: 200, score: 5200, bestChain: 3,
      killsPercent: 100, itemsPercent: 60, secretsPercent: 100, grade: 'A',
    });
    system.completeMap('E1M1', {
      mapId: 'E1M1', difficulty: 'orientation', elapsed: 140, parSeconds: 200, score: 2800, bestChain: 2,
      killsPercent: 80, itemsPercent: 50, secretsPercent: 0, grade: 'C',
    });

    expect(system.campaignUnlocks().records['E1M1:field-adjuster']).toMatchObject({
      completions: 2, bestTime: 180, highScore: 5200, bestChain: 4, bestKillsPercent: 100,
      bestItemsPercent: 70, bestSecretsPercent: 100, bestGrade: 'A', parBeaten: true, achievedAt: 200,
    });
    expect(system.campaignUnlocks().records['E1M1:orientation']).toMatchObject({ completions: 1, bestTime: 140, bestGrade: 'C' });
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

  it('loads the frozen current campaign schema and writes version 2 after legacy progress changes', () => {
    const currentStorage = new MemoryStorage();
    currentStorage.setItem('test:campaign', JSON.stringify(CURRENT_CAMPAIGN_V2_FIXTURE));
    expect(PERSISTENCE_COMPATIBILITY_POLICY.campaign).toMatchObject({
      currentVersion: 2,
      oldestSupportedVersion: 1,
    });
    expect(makeSystem(currentStorage).campaignUnlocks()).toMatchObject({
      completedEpisodes: ['first-notice'],
      discoveredSecretMaps: ['E1M9'],
      records: { 'E1M1:field-adjuster': { bestGrade: 'A', highScore: 5_000 } },
    });

    const legacyStorage = new MemoryStorage();
    legacyStorage.setItem('test:campaign', JSON.stringify(LEGACY_CAMPAIGN_V1_FIXTURE));
    makeSystem(legacyStorage).completeMap('E1M2');
    expect(JSON.parse(legacyStorage.getItem('test:campaign')!).version).toBe(CAMPAIGN_SCHEMA_VERSION);
  });

  it('accepts unknown current campaign fields and preserves future or corrupt documents untouched', () => {
    const compatibleStorage = new MemoryStorage();
    const { checksum: _fixtureChecksum, ...fixtureUnsigned } = CURRENT_CAMPAIGN_V2_FIXTURE;
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

  it('does not let damaged campaign progress affect save slots', () => {
    const storage = new MemoryStorage();
    const system = makeSystem(storage);
    system.saveManual(1, state('SAFE'), metadata('E1M1'));
    storage.setItem('test:campaign', '{bad');
    expect(system.campaignUnlocks().unlockedEpisodes).toEqual(['first-notice']);
    expect(system.loadManual(1)).toMatchObject({ status: 'valid', state: { map: 'SAFE' } });
  });
});

describe('deterministic demos', () => {
  interface Command { readonly action: 'move' | 'fire'; readonly value: number }
  const isCommand = (value: unknown): value is Command => value !== null
    && typeof value === 'object'
    && ['move', 'fire'].includes(String((value as Partial<Command>).action))
    && typeof (value as Partial<Command>).value === 'number';

  it('records ordered commands by fixed simulation tick with a stable checksum', () => {
    const options = { seed: 1234, mapId: 'E1M1', initialState: state('E1M1'), createdAt: 77, tickRate: 35 };
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

  it('rejects a checksum-valid replay from the previous deterministic simulation version', () => {
    const recorder = new DemoRecorder<TestState, Command>({ seed: 7, mapId: 'E1M1', initialState: state('E1M1'), createdAt: 9 });
    recorder.record(0, { action: 'fire', value: 1 });
    const current = recorder.finish(1);
    const { checksum: _currentChecksum, ...currentUnsigned } = current;
    const legacyUnsigned = { ...currentUnsigned, version: DEMO_SCHEMA_VERSION - 1 };
    const legacy = { ...legacyUnsigned, checksum: checksum(legacyUnsigned) };

    expect(validateDemo(legacy)).toEqual({ valid: false, reason: 'Unsupported demo version' });
  });

  it('plays commands at exact ticks and supports deterministic reset and seek', () => {
    const recorder = new DemoRecorder<TestState, Command>({ seed: 1, mapId: 'E1M1', initialState: state('E1M1'), createdAt: 1 });
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
    const recorder = new DemoRecorder<TestState, Command>({ seed: 12, mapId: 'E1M1', initialState: state('E1M1'), createdAt: 4 });
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
    expect(demo.version).toBe(3);
    expect(validateDemo(demo)).toMatchObject({ valid: true });
  });

  it('preserves a second command added after a repeated single-command tick', () => {
    const recorder = new DemoRecorder<TestState, Command>({ seed: 13, mapId: 'E1M1', initialState: state('E1M1'), createdAt: 5 });
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
    const recorder = new DemoRecorder<TestState, Command>({ seed: 1, mapId: 'E1M1', initialState: state('E1M1'), createdAt: 1 });
    recorder.record(2, { action: 'fire', value: 1 });
    expect(() => recorder.record(1, { action: 'move', value: 1 })).toThrow(RangeError);
    const demo = recorder.finish(3) as unknown as Record<string, unknown>;
    demo.totalTicks = 4;
    expect(validateDemo(demo)).toEqual({ valid: false, reason: 'Checksum mismatch' });
  });
});
