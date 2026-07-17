import type { PickupId } from '../data/types';
import type { AmmoType, WeaponDefinition } from './definitions';

export type CombatAmmo = Exclude<AmmoType, 'none'>;

export const COMBAT_AMMO_TYPES: readonly CombatAmmo[] = [
  'staples', 'fasteners', 'canisters', 'toner-cells',
];

export const AMMO_CAPS: Readonly<Record<CombatAmmo, number>> = {
  staples: 200,
  fasteners: 50,
  canisters: 50,
  'toner-cells': 300,
};

export interface AmmoGrant {
  readonly ammo: CombatAmmo;
  readonly amount: number;
}

export const PICKUP_AMMO_GRANTS: Readonly<Partial<Record<PickupId, AmmoGrant>>> = {
  'staples-small': { ammo: 'staples', amount: 16 },
  'staples-large': { ammo: 'staples', amount: 40 },
  'fasteners-small': { ammo: 'fasteners', amount: 8 },
  'fasteners-large': { ammo: 'fasteners', amount: 24 },
  canister: { ammo: 'canisters', amount: 1 },
  'canister-crate': { ammo: 'canisters', amount: 5 },
  'toner-cell': { ammo: 'toner-cells', amount: 30 },
  'toner-pack': { ammo: 'toner-cells', amount: 80 },
};

export const ammoCap = (ammo: CombatAmmo): number => AMMO_CAPS[ammo];

export const pickupAmmoGrant = (pickup: PickupId, ammoSupplyMultiplier = 1): AmmoGrant | undefined => {
  const grant = PICKUP_AMMO_GRANTS[pickup];
  return grant ? { ammo: grant.ammo, amount: grant.amount * ammoSupplyMultiplier } : undefined;
};

export const weaponAcquisitionAmmoGrant = (
  weapon: Pick<WeaponDefinition, 'ammo' | 'ammoCost'>,
): AmmoGrant | undefined => weapon.ammo === 'none' ? undefined : {
  ammo: weapon.ammo,
  amount: Math.max(weapon.ammoCost * 2, weapon.ammo === 'toner-cells' ? 40 : 8),
};

export const addAmmoWithinCap = (current: number, grant: AmmoGrant): number =>
  Math.min(ammoCap(grant.ammo), current + grant.amount);
