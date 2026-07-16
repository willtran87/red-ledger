import type { MapId } from '../data';
import type { PickupAudioCue } from './AudioSystem';
import type { AmmoType } from './definitions';

export type AmbientAudioGroup =
  | 'ambient/hvac'
  | 'ambient/fluorescent'
  | 'ambient/distant-phone'
  | 'ambient/rain'
  | 'ambient/pumps'
  | 'ambient/shelving'
  | 'ambient/elevator-cable';

export type FootstepAudioGroup =
  | 'footstep/fiber'
  | 'footstep/concrete'
  | 'footstep/glass'
  | 'footstep/water'
  | 'footstep/metal'
  | 'footstep/toner'
  | 'footstep/wax'
  | 'footstep/fluid';

export interface AudioPickupDescriptor {
  readonly kind: 'pickup' | 'weapon' | 'credential';
  readonly id: string;
  readonly ammoDrop?: { readonly ammoId: AmmoType };
}

const AMMO_PICKUPS = new Set([
  'staples-small', 'staples-large', 'fasteners-small', 'fasteners-large',
  'canister', 'canister-crate', 'toner-cell', 'toner-pack',
]);
const ARMOR_PICKUPS = new Set(['loss-control-vest', 'catastrophe-suit', 'emergency-reserve']);
const POWERUP_PICKUPS = new Set([
  'temporary-binder', 'night-inspection-goggles', 'hazard-endorsement',
  'rapid-authority', 'floor-plan', 'forensic-lens',
]);

export const pickupAudioFeedbackCue = (pickup: AudioPickupDescriptor): PickupAudioCue => {
  if (pickup.kind === 'credential') return 'credential';
  if (pickup.kind === 'weapon') return 'weapon';
  if (pickup.ammoDrop || AMMO_PICKUPS.has(pickup.id)) return 'ammo';
  if (ARMOR_PICKUPS.has(pickup.id)) return 'armor';
  if (POWERUP_PICKUPS.has(pickup.id)) return 'powerup';
  return 'health';
};

export const surfaceAudioFeedbackGroup = (material: string): FootstepAudioGroup => {
  const id = material.toLowerCase();
  if (id.includes('toner')) return 'footstep/toner';
  if (id.includes('wax')) return 'footstep/wax';
  if (id.includes('wet') || id.includes('water') || id.includes('flood')) return 'footstep/water';
  if (id.includes('fluid') || id.includes('sludge') || id.includes('ink')) return 'footstep/fluid';
  if (id.includes('glass') || id.includes('probability') || id.includes('white-void')) return 'footstep/glass';
  if (id.includes('carpet') || id.includes('rubber') || id.includes('paper')) return 'footstep/fiber';
  if (id.includes('steel') || id.includes('metal') || id.includes('brass')
    || id.includes('plate') || id.includes('hazard-stripe') || id.includes('data-center')) return 'footstep/metal';
  return 'footstep/concrete';
};

const MAP_AMBIENCE: Readonly<Record<MapId, readonly AmbientAudioGroup[]>> = {
  E1M1: ['ambient/hvac', 'ambient/fluorescent', 'ambient/distant-phone'],
  E1M2: ['ambient/distant-phone', 'ambient/fluorescent'],
  E1M3: ['ambient/pumps', 'ambient/hvac'],
  E1M4: ['ambient/pumps', 'ambient/rain'],
  E1M5: ['ambient/shelving', 'ambient/elevator-cable'],
  E1M6: ['ambient/elevator-cable', 'ambient/hvac'],
  E1M7: ['ambient/fluorescent', 'ambient/hvac'],
  E1M8: ['ambient/fluorescent', 'ambient/distant-phone'],
  E1M9: ['ambient/distant-phone', 'ambient/rain'],
  E2M1: ['ambient/rain', 'ambient/hvac'],
  E2M2: ['ambient/pumps', 'ambient/rain'],
  E2M3: ['ambient/hvac', 'ambient/fluorescent'],
  E2M4: ['ambient/elevator-cable', 'ambient/rain'],
  E2M5: ['ambient/elevator-cable', 'ambient/hvac'],
  E2M6: ['ambient/pumps', 'ambient/rain'],
  E2M7: ['ambient/fluorescent', 'ambient/hvac'],
  E2M8: ['ambient/elevator-cable', 'ambient/fluorescent'],
  E2M9: ['ambient/rain', 'ambient/hvac'],
  E3M1: ['ambient/elevator-cable', 'ambient/hvac'],
  E3M2: ['ambient/fluorescent', 'ambient/elevator-cable'],
  E3M3: ['ambient/shelving', 'ambient/elevator-cable'],
  E3M4: ['ambient/fluorescent', 'ambient/hvac'],
  E3M5: ['ambient/elevator-cable', 'ambient/pumps'],
  E3M6: ['ambient/shelving', 'ambient/hvac'],
  E3M7: ['ambient/hvac', 'ambient/distant-phone'],
  E3M8: ['ambient/fluorescent', 'ambient/elevator-cable'],
  E3M9: ['ambient/distant-phone', 'ambient/fluorescent'],
};

export const ambientAudioGroups = (mapId: MapId): readonly AmbientAudioGroup[] => MAP_AMBIENCE[mapId];
