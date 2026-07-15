import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../data';
import { MAX_DEMO_TICKS } from './GameEngine';

describe('long-form replay contract', () => {
  it('covers every authored map par with headroom for exploration', () => {
    const longestParTicks = Math.max(...Object.values(CAMPAIGN.maps).map((map) => map.parSeconds * 35));
    expect(MAX_DEMO_TICKS).toBe(35 * 60 * 45);
    expect(MAX_DEMO_TICKS).toBeGreaterThan(longestParTicks);
  });
});
