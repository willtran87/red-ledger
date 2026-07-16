import { describe, expect, it } from 'vitest';
import {
  directionFromView,
  rayVerticalCylinderDistance,
  sampleShotSpread,
  verticalAutoAimDirection,
  verticalAutoAimCylinder,
  VERTICAL_AUTO_AIM_RADIANS,
} from './CombatMath';

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

  it('expands the target only vertically across the authored six-degree cone', () => {
    expect(VERTICAL_AUTO_AIM_RADIANS * 180 / Math.PI).toBeCloseTo(6, 8);
    const volume = verticalAutoAimCylinder(
      { x: 0, y: 2.2, z: -10 },
      .4,
      1.5,
      10,
      VERTICAL_AUTO_AIM_RADIANS,
    );

    expect(volume.radius).toBe(.4);
    expect(volume.base.x).toBe(0);
    expect(volume.base.z).toBe(-10);
    expect(volume.base.y).toBeCloseTo(2.2 - Math.tan(VERTICAL_AUTO_AIM_RADIANS) * 10, 8);
    expect(volume.height).toBeCloseTo(1.5 + Math.tan(VERTICAL_AUTO_AIM_RADIANS) * 20, 8);
  });

  it('assists an elevated target without accepting a lateral miss', () => {
    const origin = { x: 0, y: 1.35, z: 0 };
    const direction = directionFromView(0, 0);
    const elevated = { x: 0, y: 2.2, z: -10 };
    const assisted = verticalAutoAimCylinder(elevated, .4, 1.5, 10, VERTICAL_AUTO_AIM_RADIANS);
    const beside = verticalAutoAimCylinder({ ...elevated, x: 1.5 }, .4, 1.5, 10, VERTICAL_AUTO_AIM_RADIANS);

    expect(rayVerticalCylinderDistance(origin, direction, elevated, .4, 1.5, 20)).toBeUndefined();
    expect(rayVerticalCylinderDistance(origin, direction, assisted.base, assisted.radius, assisted.height, 20)).toBeDefined();
    expect(rayVerticalCylinderDistance(origin, direction, beside.base, beside.radius, beside.height, 20)).toBeUndefined();
  });

  it('corrects projectile pitch while preserving the authored horizontal heading', () => {
    const direction = directionFromView(.2, 0);
    const assisted = verticalAutoAimDirection(
      { x: 0, y: 1.35, z: 0 },
      direction,
      { x: 1.5, y: 3, z: -10 },
    );

    expect(assisted.y).toBeGreaterThan(0);
    expect(assisted.x / assisted.z).toBeCloseTo(direction.x / direction.z, 8);
    expect(assisted.x / assisted.z).not.toBeCloseTo(1.5 / -10, 2);
    expect(Math.hypot(assisted.x, assisted.y, assisted.z)).toBeCloseTo(1, 8);
  });
});
