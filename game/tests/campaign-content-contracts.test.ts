import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/data/campaign';
import type { MapId, PickupId, WeaponId } from '../src/data/types';
import { WEAPONS, type AmmoType } from '../src/game/definitions';

const authoredSecretCounts: Readonly<Record<MapId, number>> = {
  E1M1: 2, E1M2: 3, E1M3: 3, E1M4: 3, E1M5: 4, E1M6: 4, E1M7: 4, E1M8: 3, E1M9: 4,
  E2M1: 3, E2M2: 4, E2M3: 4, E2M4: 4, E2M5: 4, E2M6: 5, E2M7: 5, E2M8: 3, E2M9: 4,
  E3M1: 3, E3M2: 4, E3M3: 4, E3M4: 5, E3M5: 5, E3M6: 5, E3M7: 6, E3M8: 4, E3M9: 5,
};

const ammoForPickup = (pickup: PickupId): Exclude<AmmoType, 'none'> | undefined => {
  if (pickup.startsWith('staples-')) return 'staples';
  if (pickup.startsWith('fasteners-')) return 'fasteners';
  if (pickup === 'canister' || pickup === 'canister-crate') return 'canisters';
  if (pickup === 'toner-cell' || pickup === 'toner-pack') return 'toner-cells';
  return undefined;
};

describe('campaign authored-content contracts', () => {
  it('materializes every authored secret clue as a reachable runtime secret', () => {
    const failures = Object.values(CAMPAIGN.maps)
      .filter((map) => map.secrets.length !== authoredSecretCounts[map.id])
      .map((map) => `${map.id}: ${map.secrets.length}/${authoredSecretCounts[map.id]} secrets`);
    expect(failures).toEqual([]);
  });

  it('provides a matching obtainable weapon for every ammo family placed in each episode', () => {
    const failures: string[] = [];
    const starterWeapons: readonly WeaponId[] = ['claim-stamp', 'staple-driver'];

    for (const episode of CAMPAIGN.episodes) {
      const maps = episode.maps.map((id) => CAMPAIGN.maps[id]);
      const weapons = new Set<WeaponId>(starterWeapons);
      maps.forEach((map) => map.actors
        .filter((actor) => actor.type === 'weapon')
        .forEach((actor) => weapons.add(actor.weapon)));
      const usableAmmo = new Set([...weapons].map((weapon) => WEAPONS[weapon].ammo));
      const placedAmmo = new Set<Exclude<AmmoType, 'none'>>();
      maps.forEach((map) => {
        map.actors.filter((actor) => actor.type === 'pickup').forEach((actor) => {
          const ammo = ammoForPickup(actor.pickup);
          if (ammo) placedAmmo.add(ammo);
        });
        map.breakables.forEach((breakable) => {
          if (!breakable.reward) return;
          const ammo = ammoForPickup(breakable.reward);
          if (ammo) placedAmmo.add(ammo);
        });
      });
      for (const ammo of placedAmmo) {
        if (!usableAmmo.has(ammo)) failures.push(`${episode.id}: ${ammo} has no obtainable weapon`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('keeps episode-defining weapons and standard-route ammunition usable without secrets', () => {
    expect(CAMPAIGN.maps.E2M1.actors.find((actor) => actor.type === 'weapon' && !actor.secret)?.weapon).toBe('catastrophe-launcher');
    expect(CAMPAIGN.maps.E3M1.actors.find((actor) => actor.type === 'weapon' && !actor.secret)?.weapon).toBe('plasma-copier');

    const failures: string[] = [];
    for (const episode of CAMPAIGN.episodes) {
      const maps = episode.maps.map((id) => CAMPAIGN.maps[id]);
      const standardWeapons = new Set<WeaponId>(['claim-stamp', 'staple-driver']);
      const standardAmmo = new Set<Exclude<AmmoType, 'none'>>();
      maps.forEach((map) => {
        map.actors.forEach((actor) => {
          if (actor.type === 'weapon' && !actor.secret) standardWeapons.add(actor.weapon);
          if (actor.type === 'pickup' && !actor.secret) {
            const ammo = ammoForPickup(actor.pickup);
            if (ammo) standardAmmo.add(ammo);
          }
        });
        map.breakables.forEach((breakable) => {
          const ammo = breakable.reward && ammoForPickup(breakable.reward);
          if (ammo) standardAmmo.add(ammo);
        });
      });
      const usableAmmo = new Set([...standardWeapons].map((weapon) => WEAPONS[weapon].ammo));
      standardAmmo.forEach((ammo) => {
        if (!usableAmmo.has(ammo)) failures.push(`${episode.id}: standard ${ammo} requires a secret weapon`);
      });
    }
    expect(failures).toEqual([]);
  });

  it('places every implemented temporary powerup in the playable campaign', () => {
    const implementedPowerups: readonly PickupId[] = [
      'temporary-binder', 'night-inspection-goggles', 'hazard-endorsement',
      'rapid-authority', 'floor-plan', 'forensic-lens',
    ];
    const placed = new Set(Object.values(CAMPAIGN.maps).flatMap((map) => map.actors
      .filter((actor) => actor.type === 'pickup')
      .map((actor) => actor.pickup)));

    expect(implementedPowerups.filter((pickup) => !placed.has(pickup))).toEqual([]);
  });
});
