import { describe, expect, it } from 'vitest';
import {
  predictiveAngle,
  predictiveScalar,
  presentationAlpha,
  shortestAngleDelta,
  shouldSnapPresentation,
} from './PresentationInterpolation';

describe('fixed-tick presentation helpers', () => {
  it('normalizes and clamps the unsimulated remainder', () => {
    expect(presentationAlpha(1 / 70, 1 / 35)).toBeCloseTo(.5);
    expect(presentationAlpha(-1, 1 / 35)).toBe(0);
    expect(presentationAlpha(1, 1 / 35)).toBe(1);
    expect(presentationAlpha(1, 0)).toBe(0);
  });

  it('predicts from the current pose without adding a full-tick delay', () => {
    expect(predictiveScalar(2, 4, 0)).toBe(4);
    expect(predictiveScalar(2, 4, .5)).toBe(5);
    expect(predictiveScalar(2, 4, 1)).toBe(6);
  });

  it('takes the shortest angle path across the wrap boundary', () => {
    const previous = Math.PI - .1;
    const current = -Math.PI + .1;
    expect(shortestAngleDelta(previous, current)).toBeCloseTo(.2);
    expect(predictiveAngle(previous, current, .5)).toBeCloseTo(current + .1);
  });

  it('distinguishes ordinary tick motion from teleports', () => {
    expect(shouldSnapPresentation({ x: 0, y: 1, z: 0 }, { x: .2, y: 1, z: .1 }, 1)).toBe(false);
    expect(shouldSnapPresentation({ x: 0, y: 1, z: 0 }, { x: 8, y: 1, z: 0 }, 1)).toBe(true);
  });
});
