import { describe, expect, it } from 'vitest';
import { directionFromView, rayVerticalCylinderDistance, sampleShotSpread } from './CombatMath';

describe('combat ray math', () => {
  it('samples deterministic horizontal and vertical spread', () => {
    const values = [.25, .75];
    const spread = sampleShotSpread(.12, () => values.shift() ?? 0);
    expect(spread).toEqual({ yaw: -.03, pitch: .03 });
  });

  it('does not collapse a distant pellet pattern into an all-pellet hit', () => {
    let state = 0x12345678;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    let hits = 0;
    for (let pellet = 0; pellet < 14; pellet += 1) {
      const spread = sampleShotSpread(.11, random);
      const direction = directionFromView(0, 0, spread.yaw, spread.pitch);
      if (rayVerticalCylinderDistance(
        { x: 0, y: 1.35, z: 0 }, direction,
        { x: 0, y: 0, z: -20 }, .72, 1.8, 24,
      ) !== undefined) hits += 1;
    }
    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThan(14);
  });

  it('rejects rays that pass above or beside the target volume', () => {
    const base = { x: 0, y: 0, z: -10 };
    expect(rayVerticalCylinderDistance(
      { x: 0, y: 1.35, z: 0 }, directionFromView(0, 0), base, .4, 1.5, 20,
    )).toBeDefined();
    expect(rayVerticalCylinderDistance(
      { x: 0, y: 1.35, z: 0 }, directionFromView(0, -.35), base, .4, 1.5, 20,
    )).toBeUndefined();
    expect(rayVerticalCylinderDistance(
      { x: 0, y: 1.35, z: 0 }, directionFromView(.2, 0), base, .4, 1.5, 20,
    )).toBeUndefined();
  });
});
