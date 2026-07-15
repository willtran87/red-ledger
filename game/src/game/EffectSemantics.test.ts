import { describe, expect, it } from 'vitest';
import {
  actorDeathEffects,
  breakableDestructionEffects,
  fraudVisibilityEffect,
  projectileResolutionEffect,
  resurrectionEffect,
} from './EffectSemantics';

describe('authored effect semantics', () => {
  it('resolves projectile impacts by payload and collision target', () => {
    expect(projectileResolutionEffect('response-canister', 'impact', 'player').family).toBe('canister-explosion');
    expect(projectileResolutionEffect('ember-claim', 'fire', 'player')).toMatchObject({
      family: 'ember-impact',
      blend: 'additive',
      frames: Array.from({ length: 6 }, (_, index) =>
        `/public_runtime/effects/ember-impact/fx_ember-impact_F_${String(index + 1).padStart(2, '0')}.png`),
    });
    expect(projectileResolutionEffect('redaction-writ', 'redaction', 'player').family).toBe('redaction-wipe');
    expect(projectileResolutionEffect('liability-orb', 'impact', 'player').family).toBe('generic-debris-wax');
    expect(projectileResolutionEffect('coverage-bolt', 'toner', 'player').family).toBe('binding-impact');
    expect(projectileResolutionEffect('coverage-bolt', 'toner').family).toBe('ceiling-impact');
  });

  it('does not reuse the cyan binding impact for unrelated payloads', () => {
    const unrelated = [
      projectileResolutionEffect('response-canister', 'impact', 'player'),
      projectileResolutionEffect('ember-claim', 'fire', 'player'),
      projectileResolutionEffect('redaction-writ', 'redaction', 'player'),
      projectileResolutionEffect('reserve-glob', 'hazard', 'player'),
      projectileResolutionEffect('liability-orb', 'impact', 'player'),
    ];
    expect(unrelated.every((effect) => effect.family !== 'binding-impact')).toBe(true);
  });

  it('selects death and visibility effects from actor material semantics', () => {
    expect(actorDeathEffects('returned-mail', 'paper', false, 1.2, false).map((effect) => effect.family))
      .toEqual(['hit-paper', 'generic-debris-paper']);
    expect(actorDeathEffects('desk-warden', 'metal', false, 1.8, false).map((effect) => effect.family))
      .toEqual(['hit-ink-large', 'generic-debris-metal']);
    expect(actorDeathEffects('fraud-apparition', 'toner', false, 1.75, false).map((effect) => effect.family))
      .toEqual(['redaction-wipe', 'generic-debris-paper']);
    expect(fraudVisibilityEffect(true, 1.75).family).toBe('fraud-reveal');
    expect(fraudVisibilityEffect(false, 1.75).family).toBe('redaction-wipe');
    expect(resurrectionEffect(1.8).family).toBe('resurrection-redaction');
  });

  it('reserves heavy impacts for heavy props and matches their debris material', () => {
    expect(breakableDestructionEffects('salvage-baler', 'metal').map((effect) => effect.family))
      .toEqual(['ceiling-impact', 'generic-debris-metal']);
    expect(breakableDestructionEffects('paper-boulder', 'paper').map((effect) => effect.family))
      .toEqual(['ceiling-impact', 'generic-debris-paper']);
    expect(breakableDestructionEffects('archive-crate-pallet', 'paper').map((effect) => effect.family))
      .toEqual(['generic-debris-paper']);
  });
});
