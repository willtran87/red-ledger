import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/data/campaign';
import { ENEMIES, WEAPONS, type AmmoType } from '../src/game/definitions';
import type { PickupId, WeaponId } from '../src/data/types';
import { actorIsEnabled, cellKey, credentialAwareReachableCells } from './audit-helpers';

const starterWeapons = new Set<WeaponId>(['claim-stamp', 'staple-driver']);

const ammoForPickup = (pickup: PickupId): AmmoType | undefined => {
  if (pickup.startsWith('staples-')) return 'staples';
  if (pickup.startsWith('fasteners-')) return 'fasteners';
  if (pickup === 'canister' || pickup === 'canister-crate') return 'canisters';
  if (pickup === 'toner-cell' || pickup === 'toner-pack') return 'toner-cells';
  return undefined;
};

const ammoAmount = (pickup: PickupId): number => {
  if (pickup === 'staples-small') return 16;
  if (pickup === 'staples-large') return 40;
  if (pickup === 'fasteners-small') return 8;
  if (pickup === 'fasteners-large') return 24;
  if (pickup === 'canister') return 1;
  if (pickup === 'canister-crate') return 5;
  if (pickup === 'toner-cell') return 30;
  if (pickup === 'toner-pack') return 80;
  return 0;
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

  it('budgets expected ranged damage for every mandatory encounter route', () => {
    const failures: string[] = [];
    for (const map of Object.values(CAMPAIGN.maps)) {
      const reachable = credentialAwareReachableCells(map);
      for (const route of ['entry', 'transformation', 'climax']) {
        const mandatoryHealth = map.actors
          .filter((actor) => actor.type === 'enemy' && actorIsEnabled(actor, 'normal') && actor.mandatory && actor.route === route)
          .reduce((health, actor) => health + ENEMIES[actor.enemy].health, 0);
        const staples = (route === 'entry' ? 50 : 0) + map.actors
          .filter((actor) => actor.type === 'pickup' && !actor.secret && actor.route === route && reachable.has(cellKey(actor)))
          .reduce((amount, actor) => amount + (ammoForPickup(actor.pickup) === 'staples' ? ammoAmount(actor.pickup) : 0), 0);
        const expectedDamage = staples * WEAPONS['staple-driver'].damage;
        if (expectedDamage < mandatoryHealth * 1.2) {
          failures.push(`${map.id}:${route} has ${expectedDamage} expected damage for ${mandatoryHealth} mandatory health`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
