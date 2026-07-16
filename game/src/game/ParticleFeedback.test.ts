import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  doorParticleFeedbackKind,
  impactParticleDirection,
  particleEmissionCount,
  pickupParticleFeedbackKind,
  promoteRecent,
  statusExpiryParticleFeedbackKind,
  surfaceParticleFeedbackKind,
} from './GameEngine';

describe('semantic particle feedback policy', () => {
  it('maps authored toner pickups and drops to toner feedback', () => {
    expect(pickupParticleFeedbackKind({ kind: 'pickup', id: 'toner-cell' })).toBe('toner');
    expect(pickupParticleFeedbackKind({ kind: 'pickup', id: 'toner-pack' })).toBe('toner');
    expect(pickupParticleFeedbackKind({
      kind: 'pickup',
      id: 'drop-copier-bank',
      ammoDrop: { ammoId: 'toner-cells' },
    })).toBe('toner');
  });

  it('keeps material and status pickup meanings distinct', () => {
    expect(pickupParticleFeedbackKind({ kind: 'pickup', id: 'canister-crate' })).toBe('wax');
    expect(pickupParticleFeedbackKind({ kind: 'pickup', id: 'fasteners-large' })).toBe('metal');
    expect(pickupParticleFeedbackKind({ kind: 'pickup', id: 'temporary-binder' })).toBe('deflection');
    expect(pickupParticleFeedbackKind({ kind: 'pickup', id: 'forensic-lens' })).toBe('scan');
  });

  it('maps movement and mover punctuation from authored surface materials', () => {
    expect(surfaceParticleFeedbackKind('floor.carpet-gray-clean')).toBe('fiber');
    expect(surfaceParticleFeedbackKind('floor.wet-asphalt-clean')).toBe('water');
    expect(surfaceParticleFeedbackKind('floor.toner-sludge-01')).toBe('toner');
    expect(surfaceParticleFeedbackKind('floor.red-wax-03')).toBe('wax');
    expect(surfaceParticleFeedbackKind('floor.train-steel-clean')).toBe('metal');
    expect(surfaceParticleFeedbackKind('floor.litigation-stone-clean')).toBe('concrete');
    expect(surfaceParticleFeedbackKind('floor.probability-grid-01')).toBe('scan');
    expect(doorParticleFeedbackKind('door.wax-gate')).toBe('wax');
    expect(doorParticleFeedbackKind('door.office-steel')).toBe('metal');
    expect(doorParticleFeedbackKind('door.wax-gate', 'red')).toBe('metal');
  });

  it('preserves distinct semantic seeds when timed statuses expire', () => {
    expect(statusExpiryParticleFeedbackKind('binder')).toBe('deflection');
    expect(statusExpiryParticleFeedbackKind('hazard')).toBe('neutralize');
    expect(statusExpiryParticleFeedbackKind('rapid')).toBe('authority');
    expect(statusExpiryParticleFeedbackKind('forensic')).toBe('scan');
    expect(statusExpiryParticleFeedbackKind('goggles')).toBe('scan');
  });

  it('suppresses additive emissions when flashes are disabled', () => {
    const accessibility = { reducedEffects: false, flashEffects: false };
    expect(particleEmissionCount('spark', 8, accessibility)).toBe(0);
    expect(particleEmissionCount('approval', 8, accessibility)).toBe(0);
    expect(particleEmissionCount('paper', 8, accessibility)).toBe(8);
    expect(particleEmissionCount('toner', 8, accessibility)).toBe(8);
  });

  it('retains exactly one primary pooled cue under reduced effects', () => {
    const accessibility = { reducedEffects: true, flashEffects: true };
    expect(particleEmissionCount('ink', 18, accessibility)).toBe(1);
    expect(particleEmissionCount('spark', 18, accessibility)).toBe(1);
    expect(particleEmissionCount('paper', 0, accessibility)).toBe(0);
  });

  it('throws impact debris back into the playable side of the contact plane', () => {
    const travel = new Vector3(.4, -.2, .8).normalize();
    const impact = impactParticleDirection(travel);
    expect(impact.dot(travel)).toBeCloseTo(-1, 6);
    expect(travel.toArray()).toEqual(new Vector3(.4, -.2, .8).normalize().toArray());
  });

  it('keeps refreshed animated and semantic cues newer than capacity eviction', () => {
    const animated = Array.from({ length: 10 }, (_, index) => `animated-${index}`);
    expect(promoteRecent(animated, 0)).toBe('animated-0');
    animated.shift();
    animated.push('animated-new');
    expect(animated).toContain('animated-0');
    expect(animated).not.toContain('animated-1');

    const semantic = Array.from({ length: 12 }, (_, index) => `semantic-${index}`);
    expect(promoteRecent(semantic, 0)).toBe('semantic-0');
    semantic.shift();
    semantic.push('semantic-new');
    expect(semantic).toContain('semantic-0');
    expect(semantic).not.toContain('semantic-1');
  });
});
