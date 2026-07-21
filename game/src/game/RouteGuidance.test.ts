import { describe, expect, it } from 'vitest';
import { ROUTE_HINT_DELAYS, buildRouteHint, relativeRouteDirection, routeHintTier } from './RouteGuidance';

describe('route guidance', () => {
  it('waits before offering progressive help', () => {
    expect(routeHintTier(ROUTE_HINT_DELAYS.clue - .01)).toBe(0);
    expect(routeHintTier(ROUTE_HINT_DELAYS.clue)).toBe(1);
    expect(routeHintTier(ROUTE_HINT_DELAYS.bearing)).toBe(2);
  });

  it('describes targets relative to the player view', () => {
    expect(relativeRouteDirection({ x: 0, z: 0, yaw: 0 }, { x: 0, z: -8 })).toEqual({ direction: 'ahead', distance: 8 });
    expect(relativeRouteDirection({ x: 0, z: 0, yaw: 0 }, { x: 8, z: 0 }).direction).toBe('right');
    expect(relativeRouteDirection({ x: 0, z: 0, yaw: 0 }, { x: -8, z: 0 }).direction).toBe('left');
    expect(relativeRouteDirection({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 8 }).direction).toBe('behind');
  });

  it('gives E1M1 a gentle authored clue before an exact bearing', () => {
    const descriptor = {
      kind: 'credential' as const,
      label: 'Red credential',
      mapId: 'E1M1' as const,
      credential: 'red' as const,
      target: { x: 12, z: -9 },
    };
    expect(buildRouteHint(descriptor, 1, { x: 0, z: 0, yaw: 0 }).text).toContain('visible through glass');
    expect(buildRouteHint(descriptor, 2, { x: 0, z: 0, yaw: 0 }).text).toMatch(/Red credential.*paces away.*matching access door/);
  });

  it('directs a collected credential toward its matching access route', () => {
    const hint = buildRouteHint({
      kind: 'access',
      label: 'Red credential',
      mapId: 'E1M1',
      credential: 'red',
      target: { x: 0, z: -6 },
    }, 2, { x: 0, z: 0, yaw: 0 });
    expect(hint.text).toBe('The matching access door is ahead, about 6 paces away. Approach it and press Use.');
  });
});
