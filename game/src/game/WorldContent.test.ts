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
    aggregate.applyBossMechanism('sink-cover', 'boss-aggregate');
    expect([...aggregate.sectors.values()].some((sector) => sector.targetHeight < sector.baseHeight)).toBe(true);

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
});
