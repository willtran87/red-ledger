import { describe, expect, it } from 'vitest';
import type { PickupId } from '../data/types';
import { COUNTED_PICKUP_IDS } from './World';

const ROUTINE_RESOURCES: readonly PickupId[] = [
  'staples-small', 'staples-large', 'fasteners-small', 'fasteners-large',
  'canister', 'canister-crate', 'toner-cell', 'toner-pack',
  'adhesive-bandage', 'field-medical-case', 'goodwill-token',
  'loss-control-vest', 'catastrophe-suit', 'emergency-reserve',
];

const EXPLORATION_REWARDS: readonly PickupId[] = [
  'temporary-binder', 'night-inspection-goggles', 'hazard-endorsement',
  'rapid-authority', 'floor-plan', 'forensic-lens',
];

describe('item mastery taxonomy', () => {
  it('does not require wasting capped ammunition, recovery, or equipment', () => {
    ROUTINE_RESOURCES.forEach((pickup) => expect(COUNTED_PICKUP_IDS.has(pickup), pickup).toBe(false));
  });

  it('counts bonuses, equipment, and temporary powerups as exploration rewards', () => {
    EXPLORATION_REWARDS.forEach((pickup) => expect(COUNTED_PICKUP_IDS.has(pickup), pickup).toBe(true));
  });
});
