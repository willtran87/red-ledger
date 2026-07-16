import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/data/campaign';
import { ENEMIES, WEAPONS, type AmmoType } from '../src/game/definitions';
import type { PickupId, WeaponId } from '../src/data/types';
import {
  COMBAT_AMMO_TYPES,
  addAmmoWithinCap,
  pickupAmmoGrant,
  weaponAcquisitionAmmoGrant,
  type CombatAmmo,
} from '../src/game/EconomyPolicy';
import { actorIsEnabled, cellKey, credentialAwareReachableCells } from './audit-helpers';

const starterWeapons = new Set<WeaponId>(['claim-stamp', 'staple-driver']);

const ammoForPickup = (pickup: PickupId): AmmoType | undefined => {
  if (pickup.startsWith('staples-')) return 'staples';
  if (pickup.startsWith('fasteners-')) return 'fasteners';
  if (pickup === 'canister' || pickup === 'canister-crate') return 'canisters';
  if (pickup === 'toner-cell' || pickup === 'toner-pack') return 'toner-cells';
  return undefined;
};

const expectedDamagePerAmmo = (weapon: WeaponId): number => {
  const definition = WEAPONS[weapon];
  if (definition.ammo === 'none') return 0;
  const direct = ((definition.damageMin + definition.damageMax) / 2) * definition.pellets;
  return (direct + (definition.splashDamage ?? 0) * .5) / definition.ammoCost;
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

  it('budgets compatible reachable ranged damage for every mandatory encounter route', () => {
    const failures: string[] = [];
    for (const map of Object.values(CAMPAIGN.maps)) {
      const reachable = credentialAwareReachableCells(map);
      const weapons = new Set(starterWeapons);
      const ammo: Record<CombatAmmo, number> = { staples: 50, fasteners: 0, canisters: 0, 'toner-cells': 0 };
      for (const route of ['entry', 'transformation', 'climax']) {
        map.actors
          .filter((actor) => actor.type === 'weapon' && actor.route === route && !actor.secret && actorIsEnabled(actor, 'normal') && reachable.has(cellKey(actor)))
          .forEach((actor) => {
            weapons.add(actor.weapon);
            const grant = weaponAcquisitionAmmoGrant(WEAPONS[actor.weapon]);
            if (grant) ammo[grant.ammo] = addAmmoWithinCap(ammo[grant.ammo], grant);
          });
        map.actors
          .filter((actor) => actor.type === 'pickup' && actor.route === route && !actor.secret && actorIsEnabled(actor, 'normal') && reachable.has(cellKey(actor)))
          .forEach((actor) => {
            const grant = pickupAmmoGrant(actor.pickup);
            if (grant) ammo[grant.ammo] = addAmmoWithinCap(ammo[grant.ammo], grant);
          });

        const mandatoryHealth = map.actors
          .filter((actor) => actor.type === 'enemy' && actorIsEnabled(actor, 'normal') && actor.mandatory && actor.route === route)
          .reduce((health, actor) => health + ENEMIES[actor.enemy].health, 0);

        let remaining = mandatoryHealth * 1.2;
        const choices = [...weapons]
          .map((weapon) => ({ weapon, definition: WEAPONS[weapon], efficiency: expectedDamagePerAmmo(weapon) }))
          .filter((choice) => choice.definition.ammo !== 'none' && choice.efficiency > 0)
          .sort((left, right) => right.efficiency - left.efficiency || left.weapon.localeCompare(right.weapon));
        for (const choice of choices) {
          if (remaining <= 0) break;
          const ammoType = choice.definition.ammo as CombatAmmo;
          const shots = Math.min(
            Math.floor(ammo[ammoType] / choice.definition.ammoCost),
            Math.ceil(remaining / (choice.efficiency * choice.definition.ammoCost)),
          );
          ammo[ammoType] -= shots * choice.definition.ammoCost;
          remaining -= shots * choice.efficiency * choice.definition.ammoCost;
        }
        if (remaining > 0) {
          const reserve = COMBAT_AMMO_TYPES.map((type) => `${type}:${ammo[type]}`).join(',');
          failures.push(`${map.id}:${route} lacks ${Math.ceil(remaining)} expected damage after reachable reserves (${reserve})`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
