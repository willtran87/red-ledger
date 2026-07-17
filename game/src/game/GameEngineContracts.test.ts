import { describe, expect, it, vi } from 'vitest';
import { AdditiveBlending, NormalBlending, Sprite, SpriteMaterial, Vector3 } from 'three';
import { CAMPAIGN } from '../data';
import { VERTICAL_AUTO_AIM_RADIANS } from './CombatMath';
import { ENEMIES, WEAPONS } from './definitions';
import {
  EnemyBehaviorSystem,
  type BehaviorActor,
  type BehaviorEvent,
  type BehaviorTarget,
} from './EnemyBehaviorSystem';
import {
  GameEngine,
  MAX_DEMO_TICKS,
  RECOVERY_CHECKPOINT_INTERVAL_SECONDS,
  createRecoveryCheckpointSchedule,
  hostileSignatureTint,
  isSaveData,
  reconcileRestoredTally,
  recoveryCheckpointAllowed,
  recoveryCheckpointDue,
  restoredRunVariant,
  resolveLegacyCompletedEncounters,
  resolveRestoredUnlockedEncounters,
  runVariantLabel,
  timedPickupAnnouncement,
  type SaveData,
} from './GameEngine';
import { mapRecordKey, type MapRecord, type RunVariant } from './PersistenceSystem';
import type { RuntimeActor } from './World';
import { PRE_PROFILE_E1M1_RUNTIME_FIXTURE } from './__fixtures__/runtimeCompatibilityFixtures';

const runtimeActor = (
  uid: string,
  position: Vector3,
  awake = true,
): RuntimeActor => ({
  uid,
  kind: 'enemy',
  id: 'desk-warden',
  sprite: new Sprite(new SpriteMaterial()),
  position,
  health: ENEMIES['desk-warden'].health,
  maxHealth: ENEMIES['desk-warden'].health,
  cooldown: 0,
  awake,
  authoredDormant: !awake,
  dead: false,
  scoreEligible: true,
  tallyEligible: true,
  attackFlash: 0,
  facing: 0,
  animationTime: 0,
  moving: false,
  visualKey: '',
  visualState: 'idle',
  phaseLocked: false,
  mandatory: true,
});

const behaviorActor = (actor: RuntimeActor): BehaviorActor => ({
  uid: actor.uid,
  kind: actor.kind,
  id: actor.id,
  position: actor.position,
  health: actor.health,
  maxHealth: actor.maxHealth,
  radius: ENEMIES[actor.id].radius,
  height: ENEMIES[actor.id].height,
  faction: ENEMIES[actor.id].faction,
  awake: actor.awake,
  dead: actor.dead,
  phaseLocked: actor.phaseLocked,
});

const runBehaviorFor = (
  system: EnemyBehaviorSystem,
  actors: readonly RuntimeActor[],
  target: BehaviorTarget,
  seconds: number,
): BehaviorEvent[] => {
  const events: BehaviorEvent[] = [];
  const tick = .05;
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += tick) {
    events.push(...system.step({
      dt: Math.min(tick, seconds - elapsed),
      actors: actors.map(behaviorActor),
      target,
      world: { hasLineOfSight: () => true },
    }).events);
  }
  return events;
};

const validSaveData = (): SaveData => {
  const map = CAMPAIGN.maps.E1M1;
  return {
    version: 1,
    mode: 'playing',
    mapId: map.id,
    difficulty: 'field-adjuster',
    player: {
      health: 100,
      armor: 0,
      armorClass: 'none',
      position: [map.playerStart.x * map.cellSize, 1.35, map.playerStart.z * map.cellSize],
      yaw: 0,
      pitch: 0,
      ammo: { staples: 50, fasteners: 0, canisters: 0, 'toner-cells': 0 },
      weapons: ['claim-stamp', 'staple-driver'],
      weapon: 'staple-driver',
      credentials: [],
      floorPlan: false,
      powerups: { binder: 0, hazard: 0, rapid: 0, forensic: 0, goggles: 0 },
    },
    actors: [],
    pickups: [],
    doors: [],
    secrets: [],
    visited: [],
    triggered: [],
    mechanisms: [],
    unlockedEncounters: ['entry'],
    hazardsEnabled: true,
    hazardSectors: [],
    tally: { kills: 0, totalKills: 0, items: 0, totalItems: 0, secrets: 0, totalSecrets: 0, elapsed: 0 },
    momentum: { chain: 0, best: 0, score: 0, timer: 0 },
    rng: 0x4d595df4,
    runtime: {
      weaponCooldown: 0,
      damageCooldown: 0,
      messageTimer: 0,
      message: '',
      walkMode: false,
      projectileSequence: 0,
      playerVelocity: [0, 0, 0],
      weaponState: 'ready',
      weaponTransition: 0,
    },
  };
};

describe('local save document validation', () => {
  it('accepts a current save generated while weapon and world movers are in flight', () => {
    const source = validSaveData();
    const map = CAMPAIGN.maps.E1M1;
    const doorKey = map.grid.flatMap((row, z) => [...row].map((cell, x) => ({ cell, key: `${x},${z}` })))
      .find(({ cell }) => 'DRYC'.includes(cell))!.key;
    const sectorKey = map.grid.flatMap((row, z) => [...row].map((cell, x) => ({ cell, key: `${x},${z}` })))
      .find(({ cell }) => !map.legend[cell]?.solid)!.key;
    const createSaveData = (GameEngine.prototype as unknown as {
      createSaveData(this: unknown): SaveData;
    }).createSaveData;
    const harness = {
      mode: 'playing',
      difficulty: source.difficulty,
      player: {
        ...source.player,
        position: new Vector3(...source.player.position),
        weapons: new Set(source.player.weapons),
        credentials: new Set(source.player.credentials),
      },
      world: {
        map,
        actors: [],
        pickups: [],
        doors: new Map([[doorKey, { key: doorKey, open: true, progress: .35 }]]),
        discoveredSecrets: new Set<string>(),
        visitedTiles: new Set<string>(),
        activatedMechanisms: new Set<string>(),
        hazardsEnabled: true,
        serializeHazardSectors: () => [],
        serializeSectorMovers: () => [{ key: sectorKey, height: .25, targetHeight: .75 }],
        serializeLandmarks: () => [],
        serializeBreakables: () => [],
        serializeBossMechanisms: () => ({ actions: [], bindingGates: 0 }),
        serializeAmmoDrops: () => [],
      },
      triggered: new Set<string>(),
      tally: source.tally,
      momentum: source.momentum,
      rngState: source.rng,
      enemyBehavior: { serialize: () => ({ version: 1, elapsed: 0, nextEntityId: 1, actors: [], projectiles: [], hazards: [] }) },
      playerProjectiles: [],
      bindingBeam: undefined,
      weaponCooldown: 0,
      damageCooldown: 0,
      messageTimer: 0,
      message: '',
      walkMode: false,
      projectileSequence: 0,
      playerVelocity: new Vector3(),
      weaponState: 'lowering',
      weaponTransition: .05,
      pendingWeapon: 'claim-stamp',
      runVariant: 'fresh-start',
    };
    const generated = createSaveData.call(harness);

    expect(generated.runtime).toEqual(expect.objectContaining({
      weaponState: 'lowering',
      pendingWeapon: 'claim-stamp',
    }));
    expect(generated.runVariant).toBe('fresh-start');
    expect(generated.doors).toEqual([{ key: doorKey, open: true, progress: .35 }]);
    expect(isSaveData(generated)).toBe(true);

    harness.weaponState = 'raising';
    harness.weaponTransition = .05;
    harness.pendingWeapon = 'claim-stamp';
    const queuedWhileRaising = createSaveData.call(harness);
    expect(queuedWhileRaising.runtime).toEqual(expect.objectContaining({
      weaponState: 'raising',
      pendingWeapon: 'claim-stamp',
    }));
    expect(isSaveData(queuedWhileRaising)).toBe(true);

    const steepPlasma = createSaveData.call({
      ...harness,
      player: {
        ...harness.player,
        weapons: new Set([...harness.player.weapons, 'plasma-copier']),
      },
      projectileSequence: 1,
      playerProjectiles: [{
        id: 'player-projectile-0',
        weapon: 'plasma-copier',
        position: new Vector3(37.5, 40, 37.5),
        velocity: new Vector3(0, 28, 0),
        damage: 30,
        radius: .18,
        remaining: .8,
      }],
    });
    expect(steepPlasma.playerProjectiles?.[0].position[1]).toBe(40);
    expect(isSaveData(steepPlasma)).toBe(true);
  });

  it('accepts the frozen published actor, behavior, and legacy pickup shapes', () => {
    const save = validSaveData();
    save.actors = [structuredClone(PRE_PROFILE_E1M1_RUNTIME_FIXTURE.actor) as unknown as SaveData['actors'][number]];
    save.pickups = [structuredClone(PRE_PROFILE_E1M1_RUNTIME_FIXTURE.pickup)];
    save.enemyBehavior = structuredClone(PRE_PROFILE_E1M1_RUNTIME_FIXTURE.behavior) as unknown as NonNullable<SaveData['enemyBehavior']>;
    save.tally = { ...PRE_PROFILE_E1M1_RUNTIME_FIXTURE.tally };
    expect(isSaveData(save)).toBe(true);
  });

  it('accepts known run tracks and classifies an absent legacy field conservatively', () => {
    const legacy = validSaveData();
    expect(isSaveData(legacy)).toBe(true);
    expect(restoredRunVariant(legacy)).toBe('legacy-unclassified');
    expect(runVariantLabel(restoredRunVariant(legacy))).toBe('Legacy Run');

    for (const runVariant of ['fresh-start', 'campaign-carry', 'legacy-unclassified'] as const) {
      const save = validSaveData();
      save.runVariant = runVariant;
      expect(isSaveData(save)).toBe(true);
      expect(restoredRunVariant(save)).toBe(runVariant);
    }

    const invalid = validSaveData();
    (invalid as unknown as Record<string, unknown>).runVariant = 'unknown-track';
    expect(isSaveData(invalid)).toBe(false);
  });

  it('accepts identity-light actor drops from the initial public save schema', () => {
    const save = validSaveData();
    save.pickups = [structuredClone(PRE_PROFILE_E1M1_RUNTIME_FIXTURE.actorDrop.pickup)];
    save.ammoDrops = [{
      ...structuredClone(PRE_PROFILE_E1M1_RUNTIME_FIXTURE.actorDrop.ammoDrop),
      position: [...PRE_PROFILE_E1M1_RUNTIME_FIXTURE.actorDrop.ammoDrop.position],
    }];
    expect(isSaveData(save)).toBe(true);

    const mismatchedState = structuredClone(save);
    mismatchedState.pickups[0].collected = false;
    expect(isSaveData(mismatchedState)).toBe(false);

    const mismatchedIdentity = structuredClone(save);
    Object.assign(mismatchedIdentity.pickups[0], {
      kind: 'pickup',
      id: 'toner-cell',
      position: PRE_PROFILE_E1M1_RUNTIME_FIXTURE.actorDrop.ammoDrop.position,
    });
    expect(isSaveData(mismatchedIdentity)).toBe(false);
  });

  it('accepts long-running monotonic counters without relaxing remaining-duration bounds', () => {
    const save = validSaveData();
    const elapsed = 60 * 60 * 24 * 30;
    save.tally.elapsed = elapsed;
    save.tally.kills = Number.MAX_SAFE_INTEGER;
    save.tally.totalKills = Number.MAX_SAFE_INTEGER;
    save.momentum = {
      chain: Number.MAX_SAFE_INTEGER - 1,
      best: Number.MAX_SAFE_INTEGER,
      score: Number.MAX_SAFE_INTEGER,
      timer: 0,
    };
    save.runtime!.projectileSequence = Number.MAX_SAFE_INTEGER;
    save.actors = [{
      uid: 'enemy-1', kind: 'enemy', id: 'returned-mail', health: 30, dead: false,
      phaseLocked: false, position: [37.5, 0, 37.5], animationTime: elapsed,
    }];
    save.enemyBehavior = {
      version: 1,
      elapsed,
      nextEntityId: Number.MAX_SAFE_INTEGER,
      actors: [{
        uid: 'enemy-1', hostileId: 'returned-mail', cooldown: -elapsed, attackCursor: Number.MAX_SAFE_INTEGER,
        phaseIndex: 0, phaseId: 'base', bobClock: elapsed, visible: true,
        revealRemaining: 0, strafeSign: 1, action: 'chase', stateTimer: 0,
        targetUid: 'player', redacted: false, lungeRemaining: 0,
      }],
      projectiles: [],
      hazards: [],
    };
    expect(isSaveData(save)).toBe(true);

    save.enemyBehavior!.actors[0].stateTimer = elapsed;
    expect(isSaveData(save)).toBe(false);
  });

  it('rejects invalid enum identities, ranges, and map references', () => {
    const invalidArmor = validSaveData();
    (invalidArmor.player as unknown as Record<string, unknown>).armorClass = 'reinforced';
    expect(isSaveData(invalidArmor)).toBe(false);

    const invalidCredential = validSaveData();
    (invalidCredential.player as unknown as Record<string, unknown>).credentials = ['green'];
    expect(isSaveData(invalidCredential)).toBe(false);

    const invalidTimer = validSaveData();
    invalidTimer.runtime!.damageCooldown = -1;
    expect(isSaveData(invalidTimer)).toBe(false);

    const invalidSecret = validSaveData();
    invalidSecret.secrets = ['unknown-secret'];
    expect(isSaveData(invalidSecret)).toBe(false);

    const invalidActorKind = validSaveData();
    invalidActorKind.actors.push({
      uid: 'aggregate-1', kind: 'enemy', id: 'aggregate', health: 3_000, dead: false,
      phaseLocked: false, position: [15, 0, 15],
    });
    expect(isSaveData(invalidActorKind)).toBe(false);

    const invalidPickupIdentity = validSaveData();
    invalidPickupIdentity.pickups.push({
      uid: 'pickup-1', kind: 'credential', id: 'goodwill-token', position: [15, 0, 15],
      collected: false, phaseLocked: false,
    });
    expect(isSaveData(invalidPickupIdentity)).toBe(false);
  });

  it('rejects incoherent weapon ownership and transition states', () => {
    const unownedActive = validSaveData();
    unownedActive.player.weapon = 'binding-engine';
    expect(isSaveData(unownedActive)).toBe(false);

    const pendingWhileReady = validSaveData();
    pendingWhileReady.runtime!.pendingWeapon = 'claim-stamp';
    expect(isSaveData(pendingWhileReady)).toBe(false);

    const loweringWithoutTarget = validSaveData();
    loweringWithoutTarget.runtime!.weaponState = 'lowering';
    loweringWithoutTarget.runtime!.weaponTransition = .05;
    expect(isSaveData(loweringWithoutTarget)).toBe(false);

    const unownedTarget = validSaveData();
    unownedTarget.runtime!.weaponState = 'lowering';
    unownedTarget.runtime!.weaponTransition = .05;
    unownedTarget.runtime!.pendingWeapon = 'binding-engine';
    expect(isSaveData(unownedTarget)).toBe(false);

    const excessiveTransition = validSaveData();
    excessiveTransition.runtime!.weaponState = 'lowering';
    excessiveTransition.runtime!.weaponTransition = 10;
    excessiveTransition.runtime!.pendingWeapon = 'claim-stamp';
    expect(isSaveData(excessiveTransition)).toBe(false);
  });

  it('rejects invalid documents before restore mutates the current session', () => {
    const invalid = validSaveData();
    invalid.runtime!.pendingWeapon = 'claim-stamp';
    const harness = { difficulty: 'orientation', loadMap: vi.fn() };
    const restoreSave = (GameEngine.prototype as unknown as {
      restoreSave(this: unknown, save: SaveData, resume?: boolean): boolean;
    }).restoreSave;

    expect(restoreSave.call(harness, invalid)).toBe(false);
    expect(harness.difficulty).toBe('orientation');
    expect(harness.loadMap).not.toHaveBeenCalled();
  });

  it('passes persisted and legacy run tracks into map restore before world mutation', () => {
    const restoreSave = (GameEngine.prototype as unknown as {
      restoreSave(this: unknown, save: SaveData, resume?: boolean): boolean;
    }).restoreSave;
    for (const [runVariant, expected] of [
      ['fresh-start', 'fresh-start'],
      ['campaign-carry', 'campaign-carry'],
      ['legacy-unclassified', 'legacy-unclassified'],
      [undefined, 'legacy-unclassified'],
    ] as const) {
      const save = validSaveData();
      save.runVariant = runVariant;
      const harness = {
        difficulty: 'orientation',
        loadMap: vi.fn(() => { throw new Error('stop after classification'); }),
      };
      expect(restoreSave.call(harness, save)).toBe(false);
      expect(harness.loadMap).toHaveBeenCalledWith('E1M1', true, false, expected);
    }
  });
});

describe('run variant classification', () => {
  it('classifies episode starts, level select, retries, and map continuation explicitly', () => {
    const startHarness = { difficulty: 'orientation', loadMap: vi.fn() };
    GameEngine.prototype.startEpisode.call(startHarness as never, 0, 'catastrophe-team');
    expect(startHarness.difficulty).toBe('catastrophe-team');
    expect(startHarness.loadMap).toHaveBeenCalledWith('E1M1', false, true, 'fresh-start');

    const selectHarness = {
      difficulty: 'orientation',
      persistence: {
        isEpisodeUnlocked: vi.fn(() => true),
        campaignUnlocks: vi.fn(() => ({ completedMaps: [], discoveredSecretMaps: [] })),
      },
      loadMap: vi.fn(),
    };
    GameEngine.prototype.startMapFromSelect.call(selectHarness as never, 'E1M1', 'desk-adjuster');
    expect(selectHarness.difficulty).toBe('desk-adjuster');
    expect(selectHarness.loadMap).toHaveBeenCalledWith('E1M1', false, true, 'fresh-start');

    const retryHarness = { mode: 'intermission', world: { map: { id: 'E1M4' } }, loadMap: vi.fn() };
    GameEngine.prototype.retryCurrentMap.call(retryHarness as never);
    expect(retryHarness.loadMap).toHaveBeenCalledWith('E1M4', false, true, 'fresh-start');

    const sameEpisode = { nextMap: 'E1M2', world: { map: { id: 'E1M1' } }, loadMap: vi.fn(), mode: 'intermission', emit: vi.fn() };
    GameEngine.prototype.continueFromIntermission.call(sameEpisode as never);
    expect(sameEpisode.loadMap).toHaveBeenCalledWith('E1M2', true, true, 'campaign-carry');

    const crossEpisode = { nextMap: 'E2M1', world: { map: { id: 'E1M8' } }, loadMap: vi.fn(), mode: 'intermission', emit: vi.fn() };
    GameEngine.prototype.continueFromIntermission.call(crossEpisode as never);
    expect(crossEpisode.loadMap).toHaveBeenCalledWith('E2M1', false, true, 'fresh-start');
  });

  it('uses fresh-start only for the death fallback when no saved checkpoint can restore its own track', () => {
    const harness = {
      playtestReadOnly: false,
      runVariant: 'campaign-carry' as RunVariant,
      world: { map: { id: 'E1M4', episode: 'first-notice' } },
      persistence: {
        listAutosaves: vi.fn(() => []),
        loadEpisodeRecovery: vi.fn(() => ({ status: 'empty' })),
      },
      loadMap: vi.fn(),
    };

    expect(GameEngine.prototype.restartFromCheckpoint.call(harness as never)).toBe(true);
    expect(harness.runVariant).toBe('fresh-start');
    expect(harness.loadMap).toHaveBeenCalledWith('E1M4', false);
  });

  it('compares a clear only with the record for its actual run track', () => {
    vi.stubGlobal('document', { exitPointerLock: vi.fn() });
    const freshRecord: MapRecord = {
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant: 'fresh-start', completions: 4,
      bestTime: 10, highScore: 10_000, bestChain: 10, bestKillsPercent: 100,
      bestItemsPercent: 100, bestSecretsPercent: 100, bestGrade: 'S', parBeaten: true, achievedAt: 1,
    };
    const carryBefore: MapRecord = {
      mapId: 'E1M1', difficulty: 'field-adjuster', runVariant: 'campaign-carry', completions: 1,
      bestTime: 100, highScore: 0, bestChain: 0, bestKillsPercent: 0,
      bestItemsPercent: 0, bestSecretsPercent: 0, bestGrade: 'D', parBeaten: false, achievedAt: 2,
    };
    const carryAfter = { ...carryBefore, completions: 2, bestTime: 80, achievedAt: 3 };
    const freshKey = mapRecordKey('E1M1', 'field-adjuster', 'fresh-start');
    const carryKey = mapRecordKey('E1M1', 'field-adjuster', 'campaign-carry');
    const persistence = {
      campaignUnlocks: vi.fn(() => ({ records: { [freshKey]: freshRecord, [carryKey]: carryBefore } })),
      completeMap: vi.fn(() => ({ records: { [freshKey]: freshRecord, [carryKey]: carryAfter } })),
      completeEpisode: vi.fn(),
    };
    const harness = {
      activeDemo: undefined,
      demoReadOnly: false,
      demoRecorder: undefined,
      playtestReadOnly: false,
      runVariant: 'campaign-carry' as RunVariant,
      world: { map: { id: 'E1M1', episode: 'first-notice', index: 1, parSeconds: 60, secretExitTo: undefined } },
      tally: { kills: 0, totalKills: 1, items: 0, totalItems: 1, secrets: 0, totalSecrets: 1, elapsed: 80 },
      momentum: { chain: 0, best: 0, score: 0, timer: 0 },
      difficulty: 'field-adjuster',
      persistence,
      audio: { worldCue: vi.fn(), uiCue: vi.fn(), startEndingMusic: vi.fn(), startIntermissionMusic: vi.fn() },
      onIntermission: vi.fn(),
      emit: vi.fn(),
      mode: 'playing',
      lastMapResult: undefined,
      nextMap: undefined,
    };

    const completeMap = (GameEngine.prototype as unknown as { completeMap(this: typeof harness): void }).completeMap;
    completeMap.call(harness);

    expect(persistence.completeMap).toHaveBeenCalledWith('E1M1', expect.objectContaining({
      runVariant: 'campaign-carry',
      elapsed: 80,
    }), undefined);
    expect(harness.lastMapResult).toMatchObject({
      performance: { runVariant: 'campaign-carry' },
      record: { runVariant: 'campaign-carry', bestTime: 80 },
      newBests: ['Best time'],
    });
    vi.unstubAllGlobals();
  });

  it('names a first clear as first on that track when another track already has history', () => {
    expect(`First clear: ${runVariantLabel('campaign-carry')} track`).toBe('First clear: Campaign Carry track');
  });
});

describe('long-form replay contract', () => {
  it('covers every authored map par with headroom for exploration', () => {
    const longestParTicks = Math.max(...Object.values(CAMPAIGN.maps).map((map) => map.parSeconds * 35));
    expect(MAX_DEMO_TICKS).toBe(35 * 60 * 45);
    expect(MAX_DEMO_TICKS).toBeGreaterThan(longestParTicks);
  });
});

describe('recovery checkpoint scheduling', () => {
  it('spaces periodic writes in simulation time and deduplicates explicit checkpoints', () => {
    const fresh = createRecoveryCheckpointSchedule(0);
    expect(recoveryCheckpointDue(fresh, 0, false)).toBe(true);
    expect(recoveryCheckpointDue(fresh, RECOVERY_CHECKPOINT_INTERVAL_SECONDS - .01, true)).toBe(false);
    expect(recoveryCheckpointDue(fresh, RECOVERY_CHECKPOINT_INTERVAL_SECONDS, true)).toBe(true);

    const committed = createRecoveryCheckpointSchedule(RECOVERY_CHECKPOINT_INTERVAL_SECONDS, true);
    expect(recoveryCheckpointDue(committed, RECOVERY_CHECKPOINT_INTERVAL_SECONDS, false)).toBe(false);
    expect(recoveryCheckpointDue(committed, RECOVERY_CHECKPOINT_INTERVAL_SECONDS + .01, false)).toBe(true);
    expect(recoveryCheckpointDue(committed, RECOVERY_CHECKPOINT_INTERVAL_SECONDS * 2 - .01, true)).toBe(false);
    expect(recoveryCheckpointDue(committed, RECOVERY_CHECKPOINT_INTERVAL_SECONDS * 2, true)).toBe(true);
  });

  it('treats restored progress as committed and rejects invalid elapsed values', () => {
    const restored = createRecoveryCheckpointSchedule(1_234, true);
    expect(recoveryCheckpointDue(restored, 1_234, false)).toBe(false);
    expect(recoveryCheckpointDue(restored, 1_234 + RECOVERY_CHECKPOINT_INTERVAL_SECONDS - .01, true)).toBe(false);
    expect(recoveryCheckpointDue(restored, 1_234 + RECOVERY_CHECKPOINT_INTERVAL_SECONDS, true)).toBe(true);
    expect(recoveryCheckpointDue(restored, Number.NaN, false)).toBe(false);
    expect(recoveryCheckpointDue(restored, Number.POSITIVE_INFINITY, false)).toBe(false);
    expect(recoveryCheckpointDue(restored, -1, false)).toBe(false);
  });

  it('allows silent recovery writes only in ordinary mutable play', () => {
    const ordinaryPlay = {
      mode: 'playing' as const,
      demoPlayback: false,
      demoRecording: false,
      demoReadOnly: false,
      playtestReadOnly: false,
    };
    expect(recoveryCheckpointAllowed(ordinaryPlay)).toBe(true);
    for (const mode of ['menu', 'paused', 'intermission', 'dead', 'complete'] as const) {
      expect(recoveryCheckpointAllowed({ ...ordinaryPlay, mode })).toBe(false);
    }
    for (const flag of ['demoPlayback', 'demoRecording', 'demoReadOnly', 'playtestReadOnly'] as const) {
      expect(recoveryCheckpointAllowed({ ...ordinaryPlay, [flag]: true })).toBe(false);
    }
  });

  it('commits entry, periodic, and meaningful explicit checkpoints exactly once', () => {
    const persistence = {
      autosave: vi.fn(),
      loadEpisodeRecovery: vi.fn(() => ({ status: 'valid' })),
      saveEpisodeRecovery: vi.fn(),
    };
    const harness = {
      world: { map: CAMPAIGN.maps.E1M1 },
      mode: 'playing',
      activeDemo: undefined,
      demoRecorder: undefined,
      demoReadOnly: false,
      playtestReadOnly: false,
      player: { health: 100 },
      tally: { elapsed: 0 },
      recoveryCheckpointState: createRecoveryCheckpointSchedule(0),
      persistence,
      createSaveData: vi.fn(),
      saveMetadata: vi.fn(() => ({ episodeId: 'episode-1', mapId: 'E1M1', difficulty: 'field-adjuster', playSeconds: 0 })),
    };
    harness.createSaveData.mockImplementation(() => {
      const state = validSaveData();
      state.tally.elapsed = harness.tally.elapsed;
      return state;
    });
    const checkpoint = (GameEngine.prototype as unknown as {
      checkpoint(this: typeof harness, periodic?: boolean): boolean;
    }).checkpoint;

    expect(checkpoint.call(harness)).toBe(true);
    expect(persistence.autosave).toHaveBeenCalledTimes(1);
    expect(checkpoint.call(harness)).toBe(false);

    harness.tally.elapsed = RECOVERY_CHECKPOINT_INTERVAL_SECONDS - .01;
    expect(checkpoint.call(harness, true)).toBe(false);
    harness.tally.elapsed = RECOVERY_CHECKPOINT_INTERVAL_SECONDS;
    expect(checkpoint.call(harness, true)).toBe(true);
    expect(persistence.autosave).toHaveBeenCalledTimes(2);
    expect(checkpoint.call(harness)).toBe(false);

    harness.tally.elapsed += .01;
    expect(checkpoint.call(harness)).toBe(true);
    expect(persistence.autosave).toHaveBeenCalledTimes(3);
    expect(persistence.saveEpisodeRecovery).toHaveBeenCalledTimes(3);
  });

  it('does not rotate recovery when the player is dead or the generated document is invalid', () => {
    const persistence = {
      autosave: vi.fn(),
      loadEpisodeRecovery: vi.fn(() => ({ status: 'valid' })),
      saveEpisodeRecovery: vi.fn(),
    };
    const harness = {
      world: { map: CAMPAIGN.maps.E1M1 },
      mode: 'playing',
      activeDemo: undefined,
      demoRecorder: undefined,
      demoReadOnly: false,
      playtestReadOnly: false,
      player: { health: 0 },
      tally: { elapsed: 12 },
      recoveryCheckpointState: createRecoveryCheckpointSchedule(0, true),
      persistence,
      createSaveData: vi.fn(() => validSaveData()),
      saveMetadata: vi.fn(),
    };
    const checkpoint = (GameEngine.prototype as unknown as {
      checkpoint(this: typeof harness, periodic?: boolean): boolean;
    }).checkpoint;

    expect(checkpoint.call(harness)).toBe(false);
    expect(harness.createSaveData).not.toHaveBeenCalled();
    harness.player.health = 100;
    harness.createSaveData.mockReturnValue({ ...validSaveData(), version: 2 as 1 });
    expect(checkpoint.call(harness)).toBe(false);
    expect(persistence.autosave).not.toHaveBeenCalled();
    harness.createSaveData.mockReturnValue(validSaveData());
    expect(checkpoint.call(harness)).toBe(true);
    expect(persistence.autosave).toHaveBeenCalledOnce();
  });

  it('defers explicit requests made inside a simulation tick and coalesces them', () => {
    const persistence = {
      autosave: vi.fn(),
      loadEpisodeRecovery: vi.fn(() => ({ status: 'valid' })),
      saveEpisodeRecovery: vi.fn(),
    };
    const harness = {
      applyingSimulationTick: true,
      simulationCheckpointPending: false,
      world: { map: CAMPAIGN.maps.E1M1 },
      mode: 'playing',
      activeDemo: undefined,
      demoRecorder: undefined,
      demoReadOnly: false,
      playtestReadOnly: false,
      player: { health: 100 },
      tally: { elapsed: 12 },
      recoveryCheckpointState: createRecoveryCheckpointSchedule(0, true),
      persistence,
      createSaveData: vi.fn(() => validSaveData()),
      saveMetadata: vi.fn(() => ({ episodeId: 'episode-1', mapId: 'E1M1', difficulty: 'field-adjuster', playSeconds: 12 })),
    };
    const checkpoint = (GameEngine.prototype as unknown as {
      checkpoint(this: typeof harness, periodic?: boolean): boolean;
    }).checkpoint;

    expect(checkpoint.call(harness)).toBe(false);
    expect(checkpoint.call(harness)).toBe(false);
    expect(checkpoint.call(harness, true)).toBe(false);
    expect(harness.simulationCheckpointPending).toBe(true);
    expect(harness.createSaveData).not.toHaveBeenCalled();

    harness.applyingSimulationTick = false;
    expect(checkpoint.call(harness)).toBe(true);
    expect(persistence.autosave).toHaveBeenCalledOnce();
    expect(harness.createSaveData).toHaveBeenCalledOnce();
  });

  it('serializes debug multi-kills only after the whole batch is complete', () => {
    const actors = [
      { dead: false, health: 10, phaseLocked: true, sprite: { visible: false } },
      { dead: false, health: 20, phaseLocked: true, sprite: { visible: false } },
    ];
    const persistence = {
      autosave: vi.fn(),
      loadEpisodeRecovery: vi.fn(() => ({ status: 'valid' })),
      saveEpisodeRecovery: vi.fn(),
    };
    const checkpoint = (GameEngine.prototype as unknown as {
      checkpoint(this: unknown, periodic?: boolean): boolean;
    }).checkpoint;
    let requestCheckpoint = (): void => undefined;
    const harness = {
      applyingSimulationTick: false,
      simulationCheckpointPending: false,
      world: { map: CAMPAIGN.maps.E1M1 },
      mode: 'playing',
      activeDemo: undefined,
      demoRecorder: undefined,
      demoReadOnly: false,
      playtestReadOnly: false,
      player: { health: 100 },
      tally: { elapsed: 12 },
      recoveryCheckpointState: createRecoveryCheckpointSchedule(0, true),
      persistence,
      createSaveData: vi.fn(() => {
        expect(actors.every(({ dead }) => dead)).toBe(true);
        return validSaveData();
      }),
      saveMetadata: vi.fn(() => ({ episodeId: 'episode-1', mapId: 'E1M1', difficulty: 'field-adjuster', playSeconds: 12 })),
      damageActor: vi.fn((actor: (typeof actors)[number]) => {
        actor.dead = true;
        requestCheckpoint();
      }),
      checkpoint,
    };
    requestCheckpoint = () => { checkpoint.call(harness); };
    const runAtomicDebugDefeat = (GameEngine.prototype as unknown as {
      runAtomicDebugDefeat(this: typeof harness, targets: readonly unknown[]): number;
    }).runAtomicDebugDefeat;

    expect(runAtomicDebugDefeat.call(harness, actors)).toBe(2);
    expect(harness.createSaveData).toHaveBeenCalledOnce();
    expect(persistence.autosave).toHaveBeenCalledOnce();
    expect(harness.simulationCheckpointPending).toBe(false);
  });
});

describe('queued weapon transitions', () => {
  it('lowers directly toward a queued target when the current weapon finishes raising', () => {
    const dispatched: Array<{ type: string; detail?: Record<string, unknown> }> = [];
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn((event: { type: string; detail?: Record<string, unknown> }) => {
        dispatched.push(event);
        return true;
      }),
    });
    vi.stubGlobal('CustomEvent', class {
      readonly type: string;
      readonly detail?: Record<string, unknown>;
      constructor(type: string, init?: { detail?: Record<string, unknown> }) {
        this.type = type;
        this.detail = init?.detail;
      }
    });
    try {
      const updateWeaponTransition = (GameEngine.prototype as unknown as {
        updateWeaponTransition(this: unknown, dt: number): void;
      }).updateWeaponTransition;
      const harness = {
        player: { weapon: 'staple-driver', weapons: new Set(['claim-stamp', 'staple-driver']) },
        weaponState: 'raising',
        weaponTransition: .01,
        pendingWeapon: 'claim-stamp',
      };

      updateWeaponTransition.call(harness, .02);
      expect(harness).toMatchObject({
        weaponState: 'lowering',
        weaponTransition: WEAPONS['staple-driver'].lowerTime,
        pendingWeapon: 'claim-stamp',
      });
      expect(dispatched[0]).toMatchObject({
        type: 'weapon-switch',
        detail: { from: 'staple-driver', to: 'claim-stamp', state: 'lowering' },
      });

      updateWeaponTransition.call(harness, WEAPONS['staple-driver'].lowerTime + .01);
      expect(harness).toMatchObject({
        player: { weapon: 'claim-stamp' },
        weaponState: 'raising',
        weaponTransition: WEAPONS['claim-stamp'].raiseTime,
      });
      expect(harness.pendingWeapon).toBeUndefined();

      updateWeaponTransition.call(harness, WEAPONS['claim-stamp'].raiseTime + .01);
      expect(harness).toMatchObject({ weaponState: 'ready', weaponTransition: 0 });
      expect(dispatched.at(-1)).toMatchObject({
        type: 'weapon-switch',
        detail: { to: 'claim-stamp', state: 'ready', duration: 0 },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('behavior event checkpoint ordering', () => {
  it('waits for later summon events before checkpointing a lethal encounter event', () => {
    const summonUid = 'summoned-desk-warden-behavior-9';
    const actors: Array<{ uid: string; dead: boolean }> = [
      { uid: 'regional-director-1', dead: false },
      { uid: 'encounter-target', dead: false },
    ];
    const summonOwners = [{ ownerUid: 'regional-director-1', actorUids: [summonUid], total: 1 }];
    const checkpoint = vi.fn(() => {
      const savedActorUids = new Set(actors.map((actor) => actor.uid));
      expect(summonOwners.every((owner) => owner.actorUids.every((uid) => savedActorUids.has(uid)))).toBe(true);
    });
    const harness = {
      applyingEnemyEventBatch: false,
      enemyEventBatchCheckpointPending: false,
      world: {
        map: { id: 'E1M8', encounters: [{ id: 'boss-1', completion: 'clear', opens: [] }] },
        actors,
      },
      player: { position: new Vector3() },
      triggered: new Set<string>(),
      isEncounterActive: vi.fn(() => false),
      unlockTargets: vi.fn(),
      emitParticles: vi.fn(),
      checkpoint,
      applyEnemyEvent: vi.fn(),
    };
    const resolveEncounterCompletion = (GameEngine.prototype as unknown as {
      resolveEncounterCompletion(this: unknown, id?: string, position?: Vector3): void;
    }).resolveEncounterCompletion;
    harness.applyEnemyEvent.mockImplementation((event: BehaviorEvent) => {
      if (event.type === 'damage') {
        actors[1].dead = true;
        resolveEncounterCompletion.call(harness, 'boss-1', new Vector3());
      } else if (event.type === 'summon') {
        event.actorUids.forEach((uid) => actors.push({ uid, dead: false }));
      }
    });
    const applyEnemyEventBatch = (GameEngine.prototype as unknown as {
      applyEnemyEventBatch(this: unknown, events: readonly BehaviorEvent[], dt: number, speedScale: number, damageScale: number): void;
    }).applyEnemyEventBatch;
    const events: BehaviorEvent[] = [{
      type: 'damage', sourceUid: 'regional-director-1', targetUid: 'encounter-target', amount: 100, damageKind: 'impact',
    }, {
      type: 'summon',
      actorUid: 'regional-director-1',
      enemyId: 'desk-warden',
      positions: [{ x: 3, y: 0, z: 3 }],
      actorUids: [summonUid],
    }];

    applyEnemyEventBatch.call(harness, events, 1 / 35, 1, 1);

    expect(harness.applyEnemyEvent.mock.calls.map(([event]) => event.type)).toEqual(['damage', 'summon']);
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(harness.enemyEventBatchCheckpointPending).toBe(false);
  });

  it('removes blocked summon identities before the next save can serialize them', () => {
    const enemyBehavior = new EnemyBehaviorSystem({ rng: () => 0 });
    enemyBehavior.restore({
      version: 1,
      elapsed: 0,
      nextEntityId: 10,
      actors: [],
      projectiles: [],
      hazards: [],
      summonOwners: [{
        ownerUid: 'regional-director-1',
        actorUids: ['blocked-add', 'accepted-add'],
        total: 2,
      }],
    });
    const actors: Array<{ uid: string }> = [{ uid: 'regional-director-1' }];
    const harness = {
      world: {
        actors,
        isSolid: (point: Vector3) => point.x === 1,
        summonEnemy: vi.fn((_id: string, _point: Vector3, uid: string) => {
          const summoned = { uid };
          actors.push(summoned);
          return summoned;
        }),
      },
      enemyBehavior,
      emitParticles: vi.fn(),
      playSemanticCue: vi.fn(),
    };
    const applyEnemyEvent = (GameEngine.prototype as unknown as {
      applyEnemyEvent(this: typeof harness, event: BehaviorEvent, dt: number, speedScale: number, damageScale: number): void;
    }).applyEnemyEvent;

    applyEnemyEvent.call(harness, {
      type: 'summon',
      actorUid: 'regional-director-1',
      enemyId: 'desk-warden',
      positions: [{ x: 1, y: 0, z: 1 }, { x: 2, y: 0, z: 2 }],
      actorUids: ['blocked-add', 'accepted-add'],
    }, 1 / 35, 1, 1);

    expect(harness.world.summonEnemy).toHaveBeenCalledOnce();
    expect(enemyBehavior.serialize().summonOwners).toEqual([{
      ownerUid: 'regional-director-1',
      actorUids: ['accepted-add'],
      total: 2,
    }]);
    const savedActorUids = new Set(actors.map(({ uid }) => uid));
    expect(enemyBehavior.serialize().summonOwners?.[0]?.actorUids.every((uid) => savedActorUids.has(uid))).toBe(true);
  });
});

describe('powerup combat contracts', () => {
  it('describes every timed pickup and its initial duration in one acquisition message', () => {
    expect(timedPickupAnnouncement('temporary-binder')).toBe('Temporary Binder: blocks all damage for 30 seconds');
    expect(timedPickupAnnouncement('hazard-endorsement')).toContain('30 seconds');
    expect(timedPickupAnnouncement('rapid-authority')).toContain('30 seconds');
    expect(timedPickupAnnouncement('forensic-lens')).toContain('30 seconds');
    expect(timedPickupAnnouncement('night-inspection-goggles')).toContain('30 seconds');
    expect(timedPickupAnnouncement('adhesive-bandage')).toBeUndefined();
  });

  it('clears map-scoped knowledge and timed effects without touching persistent inventory', () => {
    const harness = {
      player: {
        health: 73,
        armor: 41,
        floorPlan: true,
        powerups: { binder: 8, hazard: 9, rapid: 10, forensic: 11, goggles: 12 },
      },
    };
    const resetMapScopedPlayerState = (GameEngine.prototype as unknown as {
      resetMapScopedPlayerState(): void;
    }).resetMapScopedPlayerState;

    resetMapScopedPlayerState.call(harness);

    expect(harness.player.floorPlan).toBe(false);
    expect(harness.player.powerups).toEqual({ binder: 0, hazard: 0, rapid: 0, forensic: 0, goggles: 0 });
    expect(harness.player.health).toBe(73);
    expect(harness.player.armor).toBe(41);
  });

  it('applies a cyan live-hostile signature and restores the underlying material tint', () => {
    expect(hostileSignatureTint(true, false, false)).toBe(0x47bcd1);
    expect(hostileSignatureTint(true, true, false)).toBe(0x47bcd1);
    expect(hostileSignatureTint(false, false, false)).toBe(0xffffff);
    expect(hostileSignatureTint(false, true, false)).toBe(0xc93434);
    expect(hostileSignatureTint(true, true, true)).toBe(0xc93434);
  });

  it('does not reduce incoming damage while the Forensic Lens is active', () => {
    const damagePlayer = vi.fn();
    const harness = {
      world: { actors: [] },
      player: { powerups: { forensic: 30 } },
      damagePlayer,
    };
    const applyEnemyEvent = (GameEngine.prototype as unknown as {
      applyEnemyEvent(event: BehaviorEvent, dt: number, speedScale: number, damageScale: number): void;
    }).applyEnemyEvent;
    applyEnemyEvent.call(harness, {
      type: 'damage', sourceUid: 'desk-warden-1', targetUid: 'player', amount: 20, damageKind: 'ballistic',
    }, .05, 1, 1.5);
    expect(damagePlayer).toHaveBeenCalledWith(30, 'desk-warden-1', 'ballistic');
  });

  it('restores an actual hostile material and blend mode when the Forensic Lens expires', () => {
    const actor = Object.assign(runtimeActor('redacted-warden', new Vector3()), {
      redacted: true,
      phaseLocked: true,
    });
    const harness = { player: { powerups: { forensic: 30 } } };
    const updateActorVisual = (GameEngine.prototype as unknown as {
      updateActorVisual(actor: RuntimeActor, refreshVisibility?: boolean): void;
    }).updateActorVisual;

    updateActorVisual.call(harness, actor, false);
    expect(actor.sprite.material.color.getHex()).toBe(0x47bcd1);
    expect(actor.sprite.material.blending).toBe(AdditiveBlending);

    harness.player.powerups.forensic = 0;
    updateActorVisual.call(harness, actor, false);
    expect(actor.sprite.material.color.getHex()).toBe(0xc93434);
    expect(actor.sprite.material.blending).toBe(NormalBlending);
  });
});

describe('runtime combat integration', () => {
  it('selects an elevated hostile only when the six-degree vertical auto-aim tolerance is enabled', () => {
    const elevated = runtimeActor('elevated-warden', new Vector3(0, 2.2, -10));
    const harness = {
      world: {
        actors: [elevated],
        hasLineOfSight: vi.fn(() => true),
      },
      player: { position: new Vector3(0, 1.35, 0) },
    };
    const findTarget = (GameEngine.prototype as unknown as {
      findTarget(direction: Vector3, range: number, tolerance: number): RuntimeActor | undefined;
    }).findTarget;
    const forward = new Vector3(0, 0, -1);

    expect(findTarget.call(harness, forward, 20, 0)).toBeUndefined();
    expect(findTarget.call(harness, forward, 20, VERTICAL_AUTO_AIM_RADIANS)).toBe(elevated);
    expect(harness.world.hasLineOfSight).toHaveBeenCalledWith(harness.player.position, expect.any(Vector3));
  });

  it('routes intercepted hostile fire through GameEngine damage handling and provokes retaliation', () => {
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    const attacker = runtimeActor('warden-a', new Vector3(0, 0, 0));
    const intervening = runtimeActor('warden-b', new Vector3(0, 0, 5), false);
    const actors = [attacker, intervening];
    const player: BehaviorTarget = {
      uid: 'player',
      position: { x: 0, y: 1, z: 10 },
      velocity: { x: 0, y: 0, z: 0 },
      radius: .35,
      alive: true,
    };
    const intercepted = runBehaviorFor(system, actors, player, .8)
      .filter((event): event is Extract<BehaviorEvent, { type: 'damage' }> =>
        event.type === 'damage' && event.sourceUid === attacker.uid);
    expect(intercepted.length).toBeGreaterThan(0);
    expect(intercepted.every((event) => event.targetUid === intervening.uid)).toBe(true);

    const damageActor = (GameEngine.prototype as unknown as {
      damageActor(actor: RuntimeActor, damage: number, sourceUid?: string): void;
    }).damageActor;
    const applyEnemyEvent = (GameEngine.prototype as unknown as {
      applyEnemyEvent(event: BehaviorEvent, dt: number, speedScale: number, damageScale: number): void;
    }).applyEnemyEvent;
    const harness = {
      world: { actors },
      enemyBehavior: system,
      damageActor(actor: RuntimeActor, damage: number, sourceUid?: string): void {
        damageActor.call(this, actor, damage, sourceUid);
      },
    };
    intercepted.forEach((event) => applyEnemyEvent.call(harness, event, .05, 1, 1));

    expect(intervening.awake).toBe(true);
    expect(intervening.health).toBeLessThan(intervening.maxHealth);
    const retaliation = runBehaviorFor(system, actors, player, 1.4);
    expect(system.getActorState(intervening.uid)?.provokerUid).toBe(attacker.uid);
    expect(retaliation).toContainEqual(expect.objectContaining({
      type: 'damage',
      sourceUid: intervening.uid,
      targetUid: attacker.uid,
    }));
  });
});

describe('published runtime-state compatibility', () => {
  it('recomputes tallies after incompatible positional identities are discarded', () => {
    const published = PRE_PROFILE_E1M1_RUNTIME_FIXTURE;
    expect(reconcileRestoredTally(
      published.tally,
      [
        { dead: true, tallyEligible: true },
        { dead: true, tallyEligible: false },
        { dead: false, tallyEligible: true },
      ],
      [{ counted: true, collected: false }],
      0,
      2,
    )).toEqual({
      kills: 1,
      totalKills: 2,
      items: 0,
      totalItems: 1,
      secrets: 0,
      totalSecrets: 2,
      elapsed: 40,
    });
  });

  it('reconstructs legacy encounter unlocks from completion and mechanism evidence', () => {
    const map = CAMPAIGN.maps.E1M1;
    expect(resolveRestoredUnlockedEncounters(map, {
      triggered: ['encounter-complete:entry', 'e1m1-transformation-1'],
      mechanisms: ['e1m1-mechanism-1'],
    })).toEqual(['entry', 'transformation', 'climax']);
  });

  it('keeps the second final authority locked until all three saved binding gates opened', () => {
    const map = CAMPAIGN.maps.E3M8;
    expect(resolveRestoredUnlockedEncounters(map, {
      triggered: ['encounter-complete:boss-1'],
      bossMechanisms: { actions: [], bindingGates: 2 },
    })).not.toContain('boss-2');
    expect(resolveRestoredUnlockedEncounters(map, {
      triggered: ['encounter-complete:boss-1'],
      bossMechanisms: { actions: ['open-binding-gate'], bindingGates: 3 },
    })).toContain('boss-2');
  });

  it('uses explicit encounter state authoritatively in current saves', () => {
    expect(resolveRestoredUnlockedEncounters(CAMPAIGN.maps.E1M1, {
      unlockedEncounters: ['entry'],
      triggered: ['encounter-complete:entry', 'e1m1-transformation-1'],
      mechanisms: ['e1m1-mechanism-1'],
    })).toEqual(['entry']);
  });

  it('does not infer an independent mechanism family complete from one saved switch', () => {
    const map = CAMPAIGN.maps.E2M6;
    const independent = map.mechanisms.filter((mechanism) => mechanism.independent).map((mechanism) => mechanism.id);
    expect(independent.length).toBeGreaterThan(1);
    expect(resolveRestoredUnlockedEncounters(map, {
      triggered: [],
      mechanisms: [independent.at(-1)!],
    })).not.toContain('climax');
    expect(resolveRestoredUnlockedEncounters(map, {
      triggered: [],
      mechanisms: independent,
    })).toContain('climax');
  });

  it('preserves completed mandatory legacy phases without inventing completion for current saves', () => {
    const map = CAMPAIGN.maps.E1M1;
    const evidence = {
      triggered: ['encounter-complete:entry', 'e1m1-transformation-1'],
      mechanisms: ['e1m1-mechanism-1'],
    };
    expect(resolveLegacyCompletedEncounters(map, evidence)).toEqual(['entry', 'transformation']);
    expect(resolveLegacyCompletedEncounters(map, { ...evidence, unlockedEncounters: ['entry', 'transformation', 'climax'] })).toEqual([]);
  });
});
