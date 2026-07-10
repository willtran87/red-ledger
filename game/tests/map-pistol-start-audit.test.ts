import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/data/campaign';
import { WEAPONS, type AmmoType } from '../src/game/definitions';
import type { PickupId, WeaponId } from '../src/data/types';
import { actorIsEnabled, cellKey, credentialAwareReachableCells } from './audit-helpers';

const starterWeapons = new Set<WeaponId>(['claim-stamp', 'staple-driver']);

const ammoForPickup = (pickup: PickupId): AmmoType | undefined => {
  if (pickup.startsWith('staples-')) return 'staples';
  if (pickup.startsWith('fasteners-')) return 'fasteners';
  if (pickup === 'canister' || pickup === 'canister-crate') return 'canisters';
  if (pickup === 'toner-cell' || pickup === 'toner-pack') return 'toner';
  return undefined;
};

describe('Field Adjuster pistol-start static reachability', () => {
  it('makes every exit and mandatory credential reachable under credential rules', () => {
    const failures: string[] = [];
    for (const map of Object.values(CAMPAIGN.maps)) {
      const reachable = credentialAwareReachableCells(map);
      if (!reachable.has(cellKey(map.exit))) failures.push(`${map.id}: exit is not credential-reachable`);
      for (const actor of map.actors.filter((candidate) => candidate.type === 'credential')) {
        if (!reachable.has(cellKey(actor))) failures.push(`${map.id}: ${actor.credential} credential is unreachable`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('provides a compatible reachable ranged-ammunition path on every map', () => {
    const failures: string[] = [];

    for (const map of Object.values(CAMPAIGN.maps)) {
      const reachable = credentialAwareReachableCells(map);
      const reachableWeapons = new Set(starterWeapons);
      map.actors
        .filter((actor) => actor.type === 'weapon' && actorIsEnabled(actor, 'normal') && reachable.has(cellKey(actor)))
        .forEach((actor) => reachableWeapons.add(actor.weapon));

      const usableAmmo = new Set<AmmoType>();
      map.actors
        .filter((actor) => actor.type === 'pickup' && actorIsEnabled(actor, 'normal') && reachable.has(cellKey(actor)))
        .forEach((actor) => {
          const ammo = ammoForPickup(actor.pickup);
          if (ammo && [...reachableWeapons].some((weapon) => WEAPONS[weapon].ammo === ammo)) usableAmmo.add(ammo);
        });

      if (usableAmmo.size === 0) failures.push(`${map.id}: no reachable ammo matches a starter or reachable weapon`);
    }

    expect(failures).toEqual([]);
  });

  it('serializes mandatory-combat membership and route-specific ammunition budgets', () => {
    // Static reachability is necessary, but the design gate requires enough ammunition
    // through mandatory combat. No current placement identifies whether a kill is
    // mandatory or which route owns its supply budget, so that claim cannot be proven.
    for (const map of Object.values(CAMPAIGN.maps)) {
      const fieldEnemies = map.actors.filter((actor) => actor.type === 'enemy' && actorIsEnabled(actor, 'normal'));
      expect(fieldEnemies.length).toBeGreaterThan(0);
      expect(fieldEnemies.every((actor) => 'mandatory' in actor && 'route' in actor)).toBe(true);
    }
  });
});
