import { describe, expect, it } from 'vitest';
import {
  AUTOSAVE_SLOT_COUNT,
  DEMO_SCHEMA_VERSION,
  DemoPlayback,
  DemoRecorder,
  MANUAL_SLOT_COUNT,
  PersistenceSystem,
  checksum,
  validateDemo,
  type SaveMetadataInput,
} from './PersistenceSystem';

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

  it('reports checksum, version, and state failures without deleting or changing any slot', () => {
    const storage = new MemoryStorage();
    const system = makeSystem(storage, [10, 20, 30]);
    system.saveManual(1, state('GOOD'), metadata('E1M1'));
    system.saveManual(2, state('CHECKSUM'), metadata('E1M2'));
    system.saveManual(3, state('VERSION'), metadata('E1M3'));

    const checksumRaw = JSON.parse(storage.getItem('test:save:manual-2')!) as Record<string, unknown>;
    checksumRaw.state = state('TAMPERED');
    storage.setItem('test:save:manual-2', JSON.stringify(checksumRaw));

    const versionRaw = JSON.parse(storage.getItem('test:save:manual-3')!) as Record<string, unknown>;
    versionRaw.version = 999;
    const { checksum: _old, ...unsigned } = versionRaw;
    versionRaw.checksum = checksum(unsigned);
    storage.setItem('test:save:manual-3', JSON.stringify(versionRaw));

    const beforeChecksum = storage.getItem('test:save:manual-2');
    const beforeVersion = storage.getItem('test:save:manual-3');
    expect(system.loadManual(1)).toMatchObject({ status: 'valid', state: { map: 'GOOD' } });
    expect(system.loadManual(2)).toMatchObject({ status: 'invalid', reason: 'Checksum mismatch' });
    expect(system.loadManual(3)).toMatchObject({ status: 'invalid', reason: 'Unsupported save version' });
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
    expect(saved.status).toBe('valid');
    expect(system.loadManual(1)).toMatchObject({ status: 'valid', state: { map: 'SESSION' } });
    expect(storage.backing.getItem('test:save:manual-1')).toBeNull();
  });

  it('retains quota-failed writes without weakening serialization validation', () => {
    const storage = new FaultingStorage();
    const system = makeSystem(storage);
    system.saveManual(1, state('PERSISTED'), metadata('E1M1'));
    storage.quotaKey = 'save:manual-1';
    system.saveManual(1, state('FALLBACK'), metadata('E1M2'));

    expect(system.loadManual(1)).toMatchObject({ status: 'valid', state: { map: 'FALLBACK' } });
    expect(system.storageStatus()).toMatchObject({
      mode: 'memory-fallback', lastFailure: { operation: 'write', key: 'test:save:manual-1', name: 'QuotaExceededError' },
    });
    expect(() => system.saveManual(1, { ...state('BAD'), health: Number.NaN }, metadata('E1M3'))).toThrow(TypeError);
    expect(system.loadManual(1)).toMatchObject({ state: { map: 'FALLBACK' } });
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

  it('loads checksum-valid campaign data from before performance records existed', () => {
    const storage = new MemoryStorage();
    const progress = {
      unlockedEpisodes: ['first-notice'], completedEpisodes: [], completedMaps: ['E1M1'], updatedAt: 77,
    };
    const unsigned = { schema: 'red-ledger-campaign', version: 1, progress };
    storage.setItem('test:campaign', JSON.stringify({ ...unsigned, checksum: checksum(unsigned) }));
    expect(makeSystem(storage).campaignUnlocks()).toEqual({
      ...progress, discoveredSecretMaps: [], records: {},
    });
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

  it('rejects out-of-order recording and checksum-tampered playback documents', () => {
    const recorder = new DemoRecorder<TestState, Command>({ seed: 1, mapId: 'E1M1', initialState: state('E1M1'), createdAt: 1 });
    recorder.record(2, { action: 'fire', value: 1 });
    expect(() => recorder.record(1, { action: 'move', value: 1 })).toThrow(RangeError);
    const demo = recorder.finish(3) as unknown as Record<string, unknown>;
    demo.totalTicks = 4;
    expect(validateDemo(demo)).toEqual({ valid: false, reason: 'Checksum mismatch' });
  });
});
