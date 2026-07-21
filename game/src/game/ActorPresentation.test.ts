import { describe, expect, it } from 'vitest';
import { DEFEATED_ACTOR_FLOOR_OFFSET, defeatedActorScale } from './ActorPresentation';

describe('defeated actor presentation', () => {
  it('begins at the standing silhouette and settles low and wide', () => {
    expect(defeatedActorScale(1.5, 0, false)).toEqual({ width: 1.5, height: 1.5 });
    expect(defeatedActorScale(1.5, 1, false).width).toBeCloseTo(1.83);
    expect(defeatedActorScale(1.5, 1, false).height).toBeCloseTo(.54);
    expect(defeatedActorScale(1.5, 0, true).height).toBeCloseTo(.54);
  });

  it('retains a visible minimum for small actors and a tiny floor clearance', () => {
    expect(defeatedActorScale(.4, 1, true).height).toBe(.28);
    expect(defeatedActorScale(3, 1, true).height).toBeCloseTo(.9);
    expect(DEFEATED_ACTOR_FLOOR_OFFSET).toBeGreaterThan(0);
    expect(DEFEATED_ACTOR_FLOOR_OFFSET).toBeLessThan(.03);
  });
});
