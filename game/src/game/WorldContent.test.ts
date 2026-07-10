import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, Texture, Vector3 } from 'three';
import { CAMPAIGN_MAPS } from '../data';
import { resolveMaterialAsset, resolveSkyAsset } from '../data/tiles';
import type { AssetCatalog } from './AssetCatalog';
import { World } from './World';

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

  it('advances generated summon and drop IDs beyond restored entities', () => {
    const world = worldFor('E1M1');
    world.summonEnemy('returned-mail', new Vector3(6, 0, 6), 'summoned-returned-mail-12');
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

  it('holds climax actors outside runtime until the signature mechanism opens them', () => {
    const world = worldFor('E1M4');
    const climax = world.actors.filter((actor) => actor.encounter === 'climax');
    expect(climax.length).toBeGreaterThan(0);
    expect(climax.every((actor) => actor.phaseLocked && !actor.sprite.visible)).toBe(true);
    expect(world.unlockEncounter('climax')).toBe(climax.length);
    expect(climax.every((actor) => !actor.phaseLocked && actor.sprite.visible && actor.awake)).toBe(true);
  });
});
