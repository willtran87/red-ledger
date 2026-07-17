import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, PerspectiveCamera, Scene, Texture, Vector3 } from 'three';
import { CAMPAIGN_MAPS } from '../data';
import { resolveMaterialAsset, resolveSkyAsset } from '../data/tiles';
import type { AssetCatalog } from './AssetCatalog';
import { EnemyBehaviorSystem, reconcileEnemyBehaviorSnapshot, type EnemyBehaviorSnapshot } from './EnemyBehaviorSystem';
import { PRE_PROFILE_E1M1_RUNTIME_FIXTURE } from './__fixtures__/runtimeCompatibilityFixtures';
import {
  findMatchingRuntimeActorIdentity,
  findMatchingRuntimePickupIdentity,
  findUniqueRuntimeActorIdentity,
  isDynamicSummonUid,
  resolveRestoredActorAwake,
  savedActorMatchesRuntime,
  savedPickupMatchesRuntime,
  World,
} from './World';

const assets = {
  texture(url: string): Texture {
    const texture = new Texture();
    texture.name = url;
    return texture;
  },
  prop(id: string, state = 'base'): string { return `prop:${id}:${state}`; },
  actorFrame(kind: string, id: string, state: string): string { return `actor:${kind}:${id}:${state}`; },
  pickup(id: string): string { return `pickup:${id}`; },
  weaponPickup(id: string): string { return `weapon:${id}`; },
} as unknown as AssetCatalog;

const worldFor = (id: keyof typeof CAMPAIGN_MAPS): World => {
  const world = new World(new Scene(), new PerspectiveCamera(), assets);
  world.load(CAMPAIGN_MAPS[id]);
  return world;
};

describe('authored world content', () => {
  it('resolves semantic material and map sky ids into distinct runtime assets', () => {
    expect(resolveMaterialAsset('floor.carpet-red-clean')).not.toBe(resolveMaterialAsset('floor.carpet-gray-clean'));
    expect(resolveMaterialAsset('wall.flood-wall-clean')).toContain('flood-wall');
    expect(resolveSkyAsset(CAMPAIGN_MAPS.E2M4.sky)).toContain('catastrophe-city');
  });

  it('uses map-authored landmarks and persists interactive breakables', () => {
    const world = worldFor('E1M5');
    expect(world.landmarks.size).toBe(CAMPAIGN_MAPS.E1M5.landmarks.length);
    expect(world.breakables.size).toBe(CAMPAIGN_MAPS.E1M5.breakables.length);
    const item = [...world.breakables.values()][0];
    const result = world.damageBreakable(item.key, item.definition.health);
    expect(result?.destroyed).toBe(true);
    const snapshot = world.serializeBreakables();
    const restored = worldFor('E1M5');
    restored.restoreBreakables(snapshot);
    expect(restored.breakables.get(item.key)?.destroyed).toBe(true);
  });

  it('applies authored mover profiles and serializes boss arena mechanisms', () => {
    const bridge = worldFor('E1M3');
    bridge.applyTransformation('raise-floor');
    expect([...bridge.sectors.values()].some((sector) => sector.targetHeight > sector.baseHeight)).toBe(true);

    const aggregate = worldFor('E2M8');
    aggregate.applyBossMechanism('disable-left-emitter', 'boss-aggregate');
    aggregate.applyBossMechanism('disable-right-emitter', 'boss-aggregate');
    aggregate.applyBossMechanism('sink-cover', 'boss-aggregate');
    expect([...aggregate.sectors.values()].some((sector) => sector.targetHeight < sector.baseHeight)).toBe(true);
    expect(aggregate.serializeBossMechanisms().actions).toEqual(expect.arrayContaining(['disable-left-emitter', 'disable-right-emitter', 'sink-cover']));
    expect([...aggregate.landmarks.values()].slice(0, 2).every((landmark) => landmark.sprite.material.opacity < 1)).toBe(true);

    const finale = worldFor('E3M8');
    finale.applyBossMechanism('arena-switch-ready');
    finale.applyBossMechanism('open-binding-gate');
    finale.applyBossMechanism('open-binding-gate');
    finale.applyBossMechanism('open-binding-gate');
    finale.applyBossMechanism('expose-core');
    expect(finale.serializeBossMechanisms()).toMatchObject({ bindingGates: 3 });
    expect(finale.bindingGateCount).toBe(3);
    expect(finale.canExposeCore).toBe(true);
  });

  it('spawns exact, persistent ammo drops for combat death events', () => {
    const world = worldFor('E1M1');
    const drop = world.spawnAmmoDrop(new Vector3(6, 0, 6), 'staples', 5, 'drop-test');
    expect(drop?.ammoDrop).toEqual({ ammoId: 'staples', amount: 5 });
    const snapshot = world.serializeAmmoDrops();
    const restored = worldFor('E1M1');
    restored.restoreAmmoDrops(snapshot);
    expect(restored.pickups.find((pickup) => pickup.uid === 'drop-test')?.ammoDrop?.amount).toBe(5);
  });

  it('restores collected actor drops from identity-light public save pickup rows', () => {
    const legacy = PRE_PROFILE_E1M1_RUNTIME_FIXTURE.actorDrop.ammoDrop;
    const restored = worldFor('E1M1');
    restored.restoreAmmoDrops([{
      ...legacy,
      position: [...legacy.position],
    }]);

    const drop = restored.pickups.find((pickup) => pickup.uid === legacy.uid);
    expect(drop).toMatchObject({
      uid: legacy.uid,
      kind: 'pickup',
      id: 'staples-small',
      collected: true,
      ammoDrop: { ammoId: 'staples', amount: 1 },
    });
    expect(drop?.sprite.visible).toBe(false);
  });

  it('advances generated summon and drop IDs beyond restored entities', () => {
    const world = worldFor('E1M1');
    const restoredSummon = world.summonEnemy('returned-mail', new Vector3(6, 0, 6), 'summoned-returned-mail-12');
    expect(restoredSummon).toMatchObject({ scoreEligible: false, tallyEligible: false });
    world.spawnAmmoDrop(new Vector3(6, 0, 6), 'staples', 5, 'ammo-drop-9');
    expect(world.summonEnemy('returned-mail', new Vector3(8, 0, 6)).uid).toBe('summoned-returned-mail-13');
    expect(world.spawnAmmoDrop(new Vector3(8, 0, 6), 'staples', 5)?.uid).toBe('ammo-drop-10');
  });

  it('blocks concealed secret alcoves until their clue trigger is revealed and restored', () => {
    const world = worldFor('E1M3');
    const secret = world.map.secrets[0];
    const [x, z] = secret.concealedCells[0].split(',').map(Number);
    const point = new Vector3((x + .5) * world.map.cellSize, 0, (z + .5) * world.map.cellSize);
    expect(world.isConcealedAt(point)).toBe(true);
    expect(world.isSolid(point, .05)).toBe(true);
    expect(world.revealSecret(secret.id)).toBe(true);
    expect(world.isConcealedAt(point)).toBe(false);
    const restored = worldFor('E1M3');
    restored.restoreSecrets([secret.id]);
    expect(restored.isConcealedAt(point)).toBe(false);
  });

  it('enforces ordered mechanisms while allowing independent multi-control systems', () => {
    const ordered = worldFor('E1M5');
    const [first, second] = ordered.map.mechanisms;
    expect(ordered.applyMechanism(second.id)).toBe(false);
    expect(ordered.applyMechanism(first.id)).toBe(true);
    expect(ordered.applyMechanism(second.id)).toBe(true);
    expect(ordered.mechanismOpens(second.id)).toContain('climax');

    const pumps = worldFor('E2M6');
    const reversed = [...pumps.map.mechanisms].reverse();
    expect(pumps.applyMechanism(reversed[0].id)).toBe(true);
    expect(pumps.mechanismOpens(reversed[0].id)).toEqual([]);
    reversed.slice(1).forEach((mechanism) => expect(pumps.applyMechanism(mechanism.id)).toBe(true));
    expect(pumps.mechanismOpens(reversed.at(-1)!.id)).toContain('climax');
  });

  it('keeps every E2M6 pump subset independent for damage, state, and activation order', () => {
    const authored = worldFor('E2M6');
    const mechanisms = [...authored.map.mechanisms];
    const signatures = new Set<string>();

    for (let mask = 0; mask < (1 << mechanisms.length); mask += 1) {
      const world = worldFor('E2M6');
      const disabled = new Set<string>();
      mechanisms.forEach((mechanism, index) => {
        if ((mask & (1 << index)) === 0) return;
        expect(world.applyMechanism(mechanism.id)).toBe(true);
        mechanism.hazardTags.forEach((key) => disabled.add(key));
      });

      const stateKeys = world.serializeHazardSectors().map((state) => state.key).sort();
      expect(stateKeys, `pump subset ${mask.toString(2).padStart(3, '0')}`).toEqual([...disabled].sort());
      signatures.add(stateKeys.join('|'));
      mechanisms.forEach((mechanism, index) => {
        mechanism.hazardTags.forEach((key) => {
          const [x, z] = key.split(',').map(Number);
          const point = new Vector3((x + .5) * world.map.cellSize, 0, (z + .5) * world.map.cellSize);
          const enabled = (mask & (1 << index)) === 0;
          expect(world.isHazardSectorEnabled(key), `${mask}:${mechanism.id}:${key}`).toBe(enabled);
          expect(world.hazardDamageAt(point), `${mask}:${mechanism.id}:${key}`)
            .toBe(enabled ? world.map.legend[world.map.grid[z][x]].damagePerSecond : 0);
        });
      });
    }
    expect(signatures.size).toBe(1 << mechanisms.length);

    const orders = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2],
      [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ];
    const finalSignatures = new Set<string>();
    orders.forEach((order) => {
      const world = worldFor('E2M6');
      const expected = new Set<string>();
      order.forEach((index) => {
        const mechanism = mechanisms[index];
        expect(world.applyMechanism(mechanism.id)).toBe(true);
        mechanism.hazardTags.forEach((key) => expected.add(key));
        expect(world.serializeHazardSectors().map((state) => state.key).sort()).toEqual([...expected].sort());
      });
      finalSignatures.add(world.serializeHazardSectors().map((state) => state.key).sort().join('|'));
    });
    expect(finalSignatures.size).toBe(1);
  });

  it('round-trips current and legacy E2M6 pump hazard states without globalizing them', () => {
    const source = worldFor('E2M6');
    const activated = [source.map.mechanisms[0], source.map.mechanisms[2]];
    activated.forEach((mechanism) => source.applyMechanism(mechanism.id));
    const expected = source.serializeHazardSectors();

    const restored = worldFor('E2M6');
    restored.restoreActivatedMechanisms(activated.map((mechanism) => mechanism.id));
    restored.restoreHazardState(source.hazardsEnabled, expected, activated.map((mechanism) => mechanism.id));
    expect(restored.serializeHazardSectors()).toEqual(expected);
    expect(restored.hazardsEnabled).toBe(true);

    const legacy = worldFor('E2M6');
    legacy.restoreActivatedMechanisms(activated.map((mechanism) => mechanism.id));
    legacy.restoreHazardState(true, undefined, activated.map((mechanism) => mechanism.id));
    expect(legacy.serializeHazardSectors()).toEqual(expected);
    expect(legacy.hazardsEnabled).toBe(true);

    const onePumpLegacy = worldFor('E2M6');
    const onePump = source.map.mechanisms[1];
    onePumpLegacy.restoreHazardState(false, undefined, [onePump.id]);
    expect(onePumpLegacy.hazardsEnabled).toBe(true);
    expect(onePumpLegacy.serializeHazardSectors().map((state) => state.key).sort())
      .toEqual([...onePump.hazardTags].sort());
  });

  it('unlocks climax actors while preserving their authored ambush dormancy', () => {
    const world = worldFor('E1M4');
    const entry = world.actors.filter((actor) => actor.encounter === 'entry');
    const climax = world.actors.filter((actor) => actor.encounter === 'climax');
    const dormant = climax.filter((actor) => actor.authoredDormant);
    const immediate = climax.filter((actor) => !actor.authoredDormant);
    expect(entry.every((actor) => actor.awake === !actor.authoredDormant)).toBe(true);
    expect(climax.length).toBeGreaterThan(0);
    expect(dormant.length).toBeGreaterThan(0);
    expect(immediate.length).toBeGreaterThan(0);
    expect(climax.every((actor) => actor.phaseLocked && !actor.sprite.visible && !actor.awake)).toBe(true);
    expect(world.unlockEncounter('climax')).toBe(climax.length);
    expect(climax.every((actor) => !actor.phaseLocked && actor.sprite.visible)).toBe(true);
    expect(dormant.every((actor) => !actor.awake)).toBe(true);
    expect(immediate.every((actor) => actor.awake)).toBe(true);
  });

  it('restores explicit awake state while keeping legacy unlocked saves compatible', () => {
    expect(resolveRestoredActorAwake(false, false)).toBe(false);
    expect(resolveRestoredActorAwake(true, true)).toBe(true);
    expect(resolveRestoredActorAwake(undefined, true)).toBe(false);
    expect(resolveRestoredActorAwake(undefined, false)).toBe(true);
  });

  it('discards incompatible public-save actor and behavior identities without halting', () => {
    const world = worldFor('E1M1');
    const published = PRE_PROFILE_E1M1_RUNTIME_FIXTURE;
    const current = world.actors.find((actor) => actor.uid === published.actor.uid)!;
    expect(current).toBeDefined();
    expect(savedActorMatchesRuntime(published.actor, current)).toBe(false);

    const reconciled = reconcileEnemyBehaviorSnapshot(
      structuredClone(published.behavior) as unknown as EnemyBehaviorSnapshot,
      [],
    );
    expect(reconciled.actors).toEqual([]);
    expect(reconciled.projectiles).toEqual([]);
    expect(reconciled.hazards).toEqual([]);
    expect(reconciled.pendingSounds).toEqual([]);
    expect(reconciled.pendingDamage).toEqual([]);
    const system = new EnemyBehaviorSystem({ rng: () => .5 });
    system.restore(reconciled);
    expect(() => system.step({
      dt: .01,
      actors: [{
        uid: current.uid,
        kind: current.kind,
        id: current.id,
        position: current.position,
        health: current.health,
        maxHealth: current.maxHealth,
        radius: .34,
        awake: current.awake,
        dead: current.dead,
        phaseLocked: current.phaseLocked,
      }],
      target: { uid: 'player', position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, radius: .32 },
    })).not.toThrow();
  });

  it('rewrites accepted saved behavior references to the restored runtime actor UID', () => {
    const published = PRE_PROFILE_E1M1_RUNTIME_FIXTURE;
    const reconciled = reconcileEnemyBehaviorSnapshot(
      structuredClone(published.behavior) as unknown as EnemyBehaviorSnapshot,
      [{ savedUid: published.actor.uid, runtimeUid: 'summoned-returned-mail-12', id: 'returned-mail' }],
    );
    expect(reconciled.actors[0]?.uid).toBe('summoned-returned-mail-12');
    expect(reconciled.projectiles[0]?.ownerUid).toBe('summoned-returned-mail-12');
    expect(reconciled.hazards[0]?.ownerUid).toBe('summoned-returned-mail-12');
    expect(reconciled.pendingSounds?.[0]?.sourceUid).toBe('summoned-returned-mail-12');
    expect(reconciled.pendingDamage?.[0]?.sourceUid).toBe('summoned-returned-mail-12');
  });

  it('rejects ambiguous legacy pickup UIDs and requires new saves to match stable identity', () => {
    const world = worldFor('E1M1');
    const published = PRE_PROFILE_E1M1_RUNTIME_FIXTURE;
    const shifted = world.pickups.find((pickup) => pickup.uid === published.pickup.uid)!;
    expect(shifted.id).not.toBe(published.pickupPlacement.id);
    expect(savedPickupMatchesRuntime(published.pickup, shifted)).toBe(false);
    expect(savedPickupMatchesRuntime(published.pickupPlacement, shifted)).toBe(false);

    const current = world.pickups.find((pickup) => pickup.kind === 'weapon' && pickup.id === 'twin-bore-riveter')!;
    expect(savedPickupMatchesRuntime({
      kind: current.kind,
      id: current.id,
      position: current.position.toArray(),
    }, current)).toBe(true);
  });

  it('restores only explicit dynamic summons when a saved actor UID is absent', () => {
    expect(isDynamicSummonUid('enemy-22')).toBe(false);
    expect(isDynamicSummonUid('boss-38')).toBe(false);
    expect(isDynamicSummonUid('summoned-returned-mail-12')).toBe(true);
  });

  it('does not treat a coincidental authored UID and hostile ID as a stable placement', () => {
    const world = worldFor('E1M1');
    const current = world.actors.find((actor) => actor.uid === 'enemy-6')!;
    expect(savedActorMatchesRuntime({ uid: current.uid, kind: current.kind, id: current.id }, current)).toBe(false);
    expect(savedActorMatchesRuntime({
      uid: current.uid,
      kind: current.kind,
      id: current.id,
      authoredKey: current.authoredKey,
    }, current)).toBe(true);
  });

  it('finds current authored actors and pickups by stable identity after positional UIDs shift', () => {
    const world = worldFor('E1M1');
    const actor = world.actors.find((candidate) => candidate.authoredKey)!;
    const pickup = world.pickups.find((candidate) => candidate.kind === 'pickup')!;

    expect(findMatchingRuntimeActorIdentity({
      uid: 'enemy-former-position',
      kind: actor.kind,
      id: actor.id,
      authoredKey: actor.authoredKey,
    }, world.actors)).toBe(actor);
    expect(findMatchingRuntimePickupIdentity({
      uid: 'pickup-former-position',
      kind: pickup.kind,
      id: pickup.id,
      position: pickup.position.toArray(),
    }, world.pickups)).toBe(pickup);
  });

  it('remaps a shifted authored boss by its unique identity', () => {
    const world = worldFor('E1M8');
    const boss = findUniqueRuntimeActorIdentity({ kind: 'boss', id: 'regional-director' }, world.actors);
    expect(boss?.id).toBe('regional-director');
    expect(findUniqueRuntimeActorIdentity({ kind: 'enemy', id: 'returned-mail' }, world.actors)).toBeUndefined();
  });

  it('holds route recovery and weapons until their encounter begins', () => {
    const world = worldFor('E3M8');
    const bossTwoRecovery = world.pickups.filter((pickup) => pickup.route === 'boss-2');
    expect(bossTwoRecovery.length).toBeGreaterThan(0);
    expect(bossTwoRecovery.every((pickup) => pickup.phaseLocked && !pickup.sprite.visible)).toBe(true);
    world.unlockEncounter('boss-2');
    expect(bossTwoRecovery.every((pickup) => !pickup.phaseLocked && pickup.sprite.visible)).toBe(true);
  });

  it('batches hazard surfaces and keeps their mover height and visibility synchronized', () => {
    const world = worldFor('E2M6');
    const hazardCells = world.map.grid.flatMap((row, z) => [...row].flatMap((tile, x) => ['h', 'w'].includes(tile) ? [{ x, z }] : []));
    expect(world.hazardMeshes).toHaveLength(1);
    const batch = world.hazardMeshes[0] as InstancedMesh;
    expect(batch).toBeInstanceOf(InstancedMesh);
    expect(batch.count).toBe(hazardCells.length);
    expect(batch.frustumCulled).toBe(false);

    world.applyTransformation('toggle-sectors');
    expect(batch.visible).toBe(false);
    world.applyTransformation('toggle-sectors');
    expect(batch.visible).toBe(true);

    const targetedWorld = worldFor('E2M6');
    const targetedBatch = targetedWorld.hazardMeshes[0] as InstancedMesh;
    const targetedPump = targetedWorld.map.mechanisms[0];
    targetedWorld.applyMechanism(targetedPump.id);
    expect(targetedBatch.visible).toBe(true);
    const targetedMatrix = new Matrix4();
    const untouchedMatrix = new Matrix4();
    const targetedIndex = hazardCells.findIndex((cell) => `${cell.x},${cell.z}` === targetedPump.hazardTags[0]);
    const untouchedKey = targetedWorld.map.mechanisms[1].hazardTags[0];
    const untouchedIndex = hazardCells.findIndex((cell) => `${cell.x},${cell.z}` === untouchedKey);
    targetedBatch.getMatrixAt(targetedIndex, targetedMatrix);
    targetedBatch.getMatrixAt(untouchedIndex, untouchedMatrix);
    expect(targetedMatrix.determinant()).toBe(0);
    expect(Math.abs(untouchedMatrix.determinant())).toBeGreaterThan(.5);

    const drainWorld = worldFor('E2M2');
    const drainBatch = drainWorld.hazardMeshes[0] as InstancedMesh;
    const drainCells = drainWorld.map.grid.flatMap((row, z) => [...row].flatMap((tile, x) => ['h', 'w'].includes(tile) ? [{ x, z }] : []));
    const mechanism = drainWorld.map.mechanisms.find((candidate) => candidate.sectorTags.some((key) => {
      const [x, z] = key.split(',').map(Number);
      return ['h', 'w'].includes(drainWorld.map.grid[z]?.[x] ?? '');
    }))!;
    const movingKey = mechanism.sectorTags.find((key) => {
      const [x, z] = key.split(',').map(Number);
      return ['h', 'w'].includes(drainWorld.map.grid[z]?.[x] ?? '');
    })!;
    const [movingX, movingZ] = movingKey.split(',').map(Number);
    const movingIndex = drainCells.findIndex((cell) => cell.x === movingX && cell.z === movingZ);
    const before = new Matrix4();
    const after = new Matrix4();
    drainBatch.getMatrixAt(movingIndex, before);
    drainWorld.applyTransformation(mechanism.action, mechanism.id);
    expect(drainWorld.hazardsEnabled).toBe(false);
    expect(drainBatch.visible).toBe(false);
    drainCells.forEach(({ x, z }) => {
      expect(drainWorld.hazardDamageAt(new Vector3(
        (x + .5) * drainWorld.map.cellSize,
        0,
        (z + .5) * drainWorld.map.cellSize,
      ))).toBe(0);
    });
    drainWorld.updateMovers(.25);
    drainBatch.getMatrixAt(movingIndex, after);
    expect(after.elements[13]).not.toBe(before.elements[13]);
  });

  it('revisions hostile navigation only when traversability changes', () => {
    const doors = worldFor('E1M1');
    const credentialDoor = [...doors.doors.values()].find((door) => door.credential);
    expect(credentialDoor).toBeDefined();
    const closedRevision = doors.navigationTopologyRevision;
    doors.openDoor(credentialDoor!);
    doors.updateMovers(.5);
    expect(doors.navigationTopologyRevision).toBe(closedRevision);
    doors.updateMovers(.1);
    expect(doors.navigationTopologyRevision).toBeGreaterThan(closedRevision);

    const standardDoors = worldFor('E1M1');
    const standardDoor = [...standardDoors.doors.values()].find((door) => !door.credential);
    expect(standardDoor).toBeDefined();
    const standardClosedRevision = standardDoors.navigationTopologyRevision;
    standardDoors.openDoor(standardDoor!);
    standardDoors.updateMovers(.5);
    expect(standardDoors.navigationTopologyRevision).toBe(standardClosedRevision);
    standardDoors.updateMovers(.1);
    expect(standardDoors.navigationTopologyRevision).toBeGreaterThan(standardClosedRevision);

    const restoredDoors = worldFor('E1M1');
    const restoredDoor = [...restoredDoors.doors.values()].find((door) => !door.credential)!;
    const beforeRestore = restoredDoors.navigationTopologyRevision;
    restoredDoors.restoreDoor(restoredDoor, true, 1);
    expect(restoredDoors.navigationTopologyRevision).toBeGreaterThan(beforeRestore);

    const secretWorld = worldFor('E1M3');
    const secretRevision = secretWorld.navigationTopologyRevision;
    expect(secretWorld.revealSecret(secretWorld.map.secrets[0].id)).toBe(true);
    expect(secretWorld.navigationTopologyRevision).toBeGreaterThan(secretRevision);

    const breakableWorld = worldFor('E1M5');
    const breakable = [...breakableWorld.breakables.values()].find((item) => item.definition.blocksMovement)!;
    const breakableRevision = breakableWorld.navigationTopologyRevision;
    expect(breakableWorld.damageBreakable(breakable.key, 1)?.destroyed).toBe(false);
    expect(breakableWorld.navigationTopologyRevision).toBe(breakableRevision);
    expect(breakableWorld.damageBreakable(breakable.key, breakable.definition.health)?.destroyed).toBe(true);
    expect(breakableWorld.navigationTopologyRevision).toBeGreaterThan(breakableRevision);

    const moverWorld = worldFor('E1M3');
    const moverRevision = moverWorld.navigationTopologyRevision;
    moverWorld.applyTransformation('raise-floor');
    moverWorld.updateMovers(.1);
    expect(moverWorld.navigationTopologyRevision).toBeGreaterThan(moverRevision);
  });

  it('reports door and sector completion once when movers settle', () => {
    const doorWorld = worldFor('E1M1');
    const door = [...doorWorld.doors.values()].find((candidate) => !candidate.credential)!;
    doorWorld.openDoor(door);
    const doorCompletions = [...doorWorld.updateMovers(1)];
    expect(doorCompletions).toContainEqual(expect.objectContaining({ kind: 'door', key: door.key }));
    expect(doorWorld.updateMovers(.1)).toHaveLength(0);

    const sectorWorld = worldFor('E1M3');
    const mechanism = sectorWorld.map.mechanisms.find((candidate) => candidate.sectorTags.length > 0)!;
    sectorWorld.applyTransformation(mechanism.action, mechanism.id);
    const sectorCompletions = [...sectorWorld.updateMovers(10)].filter((completion) => completion.kind === 'sector');
    expect(sectorCompletions.length).toBeGreaterThan(0);
    expect(sectorCompletions.every((completion) => completion.material.length > 0)).toBe(true);
    expect(sectorWorld.updateMovers(.1)).toHaveLength(0);
  });
});
