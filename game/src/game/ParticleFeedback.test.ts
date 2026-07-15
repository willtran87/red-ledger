import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { impactParticleDirection, particleEmissionCount, pickupParticleFeedbackKind, promoteRecent } from './GameEngine';

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
