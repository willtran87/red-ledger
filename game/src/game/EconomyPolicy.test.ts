import { describe, expect, it } from 'vitest';
import { WEAPONS } from './definitions';
import {
  AMMO_CAPS,
  COMBAT_AMMO_TYPES,
  PICKUP_AMMO_GRANTS,
  addAmmoWithinCap,
  pickupAmmoGrant,
  weaponAcquisitionAmmoGrant,
} from './EconomyPolicy';

describe('shared ammunition economy policy', () => {
  it('locks the four carry caps and eight authored pickup grants', () => {
    expect(COMBAT_AMMO_TYPES).toEqual(['staples', 'fasteners', 'canisters', 'toner-cells']);
    expect(AMMO_CAPS).toEqual({ staples: 200, fasteners: 50, canisters: 50, 'toner-cells': 300 });
    expect(PICKUP_AMMO_GRANTS).toEqual({
      'staples-small': { ammo: 'staples', amount: 16 },
      'staples-large': { ammo: 'staples', amount: 40 },
      'fasteners-small': { ammo: 'fasteners', amount: 8 },
      'fasteners-large': { ammo: 'fasteners', amount: 24 },
      canister: { ammo: 'canisters', amount: 1 },
      'canister-crate': { ammo: 'canisters', amount: 5 },
      'toner-cell': { ammo: 'toner-cells', amount: 30 },
      'toner-pack': { ammo: 'toner-cells', amount: 80 },
    });
  });

  it('scales pickup ammunition before applying the runtime cap', () => {
    expect(pickupAmmoGrant('staples-large', .65)).toEqual({ ammo: 'staples', amount: 26 });
    expect(pickupAmmoGrant('field-medical-case')).toBeUndefined();
    expect(addAmmoWithinCap(190, pickupAmmoGrant('staples-large')!)).toBe(200);
    expect(addAmmoWithinCap(49, pickupAmmoGrant('canister')!)).toBe(50);
  });

  it('derives weapon acquisition grants from ammo family and fire cost', () => {
    expect(weaponAcquisitionAmmoGrant(WEAPONS['claim-stamp'])).toBeUndefined();
    expect(weaponAcquisitionAmmoGrant(WEAPONS['staple-driver'])).toEqual({ ammo: 'staples', amount: 8 });
    expect(weaponAcquisitionAmmoGrant(WEAPONS['twin-bore-riveter'])).toEqual({ ammo: 'fasteners', amount: 8 });
    expect(weaponAcquisitionAmmoGrant(WEAPONS['catastrophe-launcher'])).toEqual({ ammo: 'canisters', amount: 8 });
    expect(weaponAcquisitionAmmoGrant(WEAPONS['plasma-copier'])).toEqual({ ammo: 'toner-cells', amount: 40 });
    expect(weaponAcquisitionAmmoGrant(WEAPONS['binding-engine'])).toEqual({ ammo: 'toner-cells', amount: 80 });
  });
});
