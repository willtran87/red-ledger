import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INPUT_PREFERENCES,
  applyClassicLookRestrictions,
  applyControllerDeadzone,
  advanceMenuCommand,
  advanceMenuRepeat,
  composeLookInput,
  menuDirectionCaptureSeed,
  menuAxisEngaged,
  normalizeInputPreferences,
  touchStickVector,
} from './InputSystem';

describe('controller menu repeat', () => {
  it('fires once on press, waits through the delay, repeats at cadence, and resets on release', () => {
    let state = { down: false, nextAt: 0 };
    let result = advanceMenuRepeat(true, 100, state);
    expect(result).toMatchObject({ fire: true, repeat: false });
    state = result.state;

    result = advanceMenuRepeat(true, 439, state);
    expect(result).toMatchObject({ fire: false, repeat: false });
    result = advanceMenuRepeat(true, 440, state);
    expect(result).toMatchObject({ fire: true, repeat: true });
    state = result.state;

    result = advanceMenuRepeat(true, 529, state);
    expect(result.fire).toBe(false);
    result = advanceMenuRepeat(true, 530, state);
    expect(result).toMatchObject({ fire: true, repeat: true });

    result = advanceMenuRepeat(false, 540, result.state);
    expect(result).toEqual({ state: { down: false, nextAt: 0 }, fire: false, repeat: false });
    expect(advanceMenuRepeat(true, 541, result.state)).toMatchObject({ fire: true, repeat: false });
  });

  it('fires command axes once per hysteretic engage and never repeats while held', () => {
    let state = { down: false, axisEngaged: false };
    let result = advanceMenuCommand(.4, false, state);
    expect(result.fire).toBe(true);
    state = result.state;

    result = advanceMenuCommand(1, false, state);
    expect(result.fire).toBe(false);
    state = result.state;
    result = advanceMenuCommand(.23, false, state);
    expect(result).toMatchObject({ fire: false, state: { down: true, axisEngaged: true } });
    state = result.state;

    result = advanceMenuCommand(.22, false, state);
    expect(result).toEqual({ fire: false, state: { down: false, axisEngaged: false } });
    expect(advanceMenuCommand(.4, false, result.state).fire).toBe(true);
  });

  it('combines command buttons and axes into one edge and consumes a captured hold', () => {
    let result = advanceMenuCommand(1, true, { down: false, axisEngaged: false });
    expect(result).toEqual({ fire: true, state: { down: true, axisEngaged: true } });

    result = advanceMenuCommand(1, false, result.state);
    expect(result.fire).toBe(false);
    result = advanceMenuCommand(0, false, result.state);
    expect(result).toEqual({ fire: false, state: { down: false, axisEngaged: false } });

    const captured = { down: true, axisEngaged: true };
    expect(advanceMenuCommand(1, false, captured).fire).toBe(false);
    expect(advanceMenuCommand(0, false, captured)).toEqual({
      fire: false,
      state: { down: false, axisEngaged: false },
    });
  });

  it('consumes held directional controller input after a binding capture', () => {
    const axis = menuDirectionCaptureSeed('menu-left', {
      device: 'gamepad-axis', axis: 0, direction: -1, threshold: .45,
    });
    expect(axis).toEqual({
      index: 2,
      axisEngaged: true,
      state: { down: true, nextAt: Number.POSITIVE_INFINITY },
    });
    expect(advanceMenuRepeat(true, 100, axis!.state).fire).toBe(false);
    expect(advanceMenuRepeat(false, 101, axis!.state).state.down).toBe(false);

    const button = menuDirectionCaptureSeed('menu-down', { device: 'gamepad-button', button: 13 });
    expect(button).toMatchObject({ index: 1, axisEngaged: false, state: { down: true } });
    expect(menuDirectionCaptureSeed('fire', { device: 'gamepad-button', button: 7 })).toBeUndefined();
  });
});

describe('touch look sampling', () => {
  it('produces the same held vector for a 40px drag delivered in one or eight events', () => {
    const sample = (x: number) => touchStickVector(x, 50, 0, 0, 100, 100);
    const sparse = [90].map(sample).at(-1)!;
    const dense = [55, 60, 65, 70, 75, 80, 85, 90].map(sample).at(-1)!;
    expect(dense).toEqual(sparse);
    expect(sparse).toEqual({ x: .8, y: 0 });

    const heldTurn = (touchX: number) => Array.from({ length: 10 }).reduce<number>((total) => total + composeLookInput({
      keyboardTurn: 0, keyboardLook: 0, mouseX: 0, mouseY: 0,
      controllerX: 0, controllerY: 0, touchX, touchY: 0,
    }, { ...DEFAULT_INPUT_PREFERENCES, touchSensitivity: 1.7 }).turn * .016, 0);
    expect(heldTurn(dense.x)).toBeCloseTo(heldTurn(sparse.x), 8);
  });

  it('clamps invalid or out-of-bounds stick geometry safely', () => {
    expect(touchStickVector(200, -50, 0, 0, 100, 100)).toEqual({ x: 1, y: -1 });
    expect(touchStickVector(40, 40, 0, 0, 0, 100)).toEqual({ x: 0, y: 0 });
  });
});

describe('input preferences', () => {
  it('migrates the legacy mouse setting while giving every device an independent default', () => {
    expect(normalizeInputPreferences({ sensitivity: 2.1 })).toEqual({
      ...DEFAULT_INPUT_PREFERENCES,
      mouseSensitivity: 2.1,
    });
  });

  it('clamps finite values and rejects corrupt persisted values', () => {
    expect(normalizeInputPreferences({
      mouseSensitivity: 99,
      controllerSensitivity: -2,
      touchSensitivity: Number.NaN,
      invertY: 'true',
      controllerDeadzone: .9,
    })).toEqual({
      mouseSensitivity: 3,
      controllerSensitivity: .5,
      touchSensitivity: DEFAULT_INPUT_PREFERENCES.touchSensitivity,
      invertY: false,
      controllerDeadzone: .45,
    });
  });

  it('removes controller drift and rescales useful stick travel to the full range', () => {
    expect(applyControllerDeadzone(.17, .18)).toBe(0);
    expect(applyControllerDeadzone(-.18, .18)).toBe(0);
    expect(applyControllerDeadzone(.59, .18)).toBeCloseTo(.5);
    expect(applyControllerDeadzone(-1, .18)).toBe(-1);
    expect(applyControllerDeadzone(Number.NaN, .18)).toBe(0);
  });

  it('scales mouse, controller, and touch independently while inverting only analog Y', () => {
    const result = composeLookInput({
      keyboardTurn: 1,
      keyboardLook: 1,
      mouseX: 10,
      mouseY: 10,
      controllerX: .5,
      controllerY: .5,
      touchX: .5,
      touchY: .5,
    }, {
      mouseSensitivity: 2,
      controllerSensitivity: .5,
      touchSensitivity: 1,
      invertY: true,
      controllerDeadzone: .18,
    });

    expect(result.deltaX).toBe(20);
    expect(result.turn).toBeCloseTo(1.95);
    expect(result.deltaY).toBeCloseTo(-4.4);
  });

  it('keeps horizontal mouse turning while the 1993 preset removes vertical free-look', () => {
    expect(applyClassicLookRestrictions({ deltaX: 18, deltaY: -7 }, false)).toEqual({
      deltaX: 18,
      deltaY: -7,
    });
    expect(applyClassicLookRestrictions({ deltaX: 18, deltaY: -7 }, true)).toEqual({
      deltaX: 18,
      deltaY: 0,
    });
  });

  it('applies configured controller deadzone to menu axes with stable hysteresis', () => {
    const lowDeadzone = applyControllerDeadzone(.5, .05);
    const highDeadzone = applyControllerDeadzone(.5, .3);
    expect(menuAxisEngaged(lowDeadzone, false)).toBe(true);
    expect(menuAxisEngaged(highDeadzone, false)).toBe(false);
    expect(menuAxisEngaged(.25, true)).toBe(true);
    expect(menuAxisEngaged(.2, true)).toBe(false);
    expect(menuAxisEngaged(.39, false)).toBe(false);
    expect(menuAxisEngaged(.4, false)).toBe(true);
  });
});
