import { describe, expect, it, vi } from 'vitest';
import { CONTROLLER_HAPTIC_PATTERNS, ControllerHaptics } from './ControllerHaptics';

const gamepad = (actuator: object): Gamepad => ({
  connected: true,
  vibrationActuator: actuator,
} as unknown as Gamepad);

describe('ControllerHaptics', () => {
  it('stays silent until controller input is active and the preference is enabled', () => {
    const playEffect = vi.fn(() => Promise.resolve('complete'));
    const haptics = new ControllerHaptics({ gamepads: () => [gamepad({ playEffect })], now: () => 100 });
    expect(haptics.cue('weapon-light')).toBe(false);
    haptics.setActive(true);
    haptics.setEnabled(false);
    expect(haptics.cue('weapon-light')).toBe(false);
    expect(playEffect).not.toHaveBeenCalled();
  });

  it('uses dual-rumble patterns and lets urgent feedback interrupt weaker cues', () => {
    let now = 100;
    const playEffect = vi.fn(() => Promise.resolve('complete'));
    const haptics = new ControllerHaptics({ gamepads: () => [gamepad({ playEffect })], now: () => now });
    haptics.setActive(true);
    expect(haptics.cue('weapon-light')).toBe(true);
    expect(haptics.cue('pickup')).toBe(false);
    expect(haptics.cue('damage')).toBe(true);
    now += CONTROLLER_HAPTIC_PATTERNS.damage.duration + 1;
    expect(haptics.cue('pickup')).toBe(true);
    expect(playEffect).toHaveBeenNthCalledWith(1, 'dual-rumble', {
      duration: 38,
      startDelay: 0,
      strongMagnitude: .12,
      weakMagnitude: .38,
    });
    expect(playEffect).toHaveBeenCalledTimes(3);
  });

  it('falls back to a pulse actuator and safely ignores unsupported hardware', () => {
    const pulse = vi.fn(() => Promise.resolve(true));
    const pulsePad = { connected: true, hapticActuators: [{ pulse }] } as unknown as Gamepad;
    const fallback = new ControllerHaptics({ gamepads: () => [pulsePad], now: () => 0 });
    fallback.setActive(true);
    expect(fallback.cue('failure')).toBe(true);
    expect(pulse).toHaveBeenCalledWith(.3, 62);
    const haptics = new ControllerHaptics({ gamepads: () => [gamepad({})], now: () => 0 });
    haptics.setActive(true);
    expect(haptics.cue('failure')).toBe(false);
  });

  it('resets actuators when controller feedback is deactivated', () => {
    const reset = vi.fn(() => Promise.resolve('complete'));
    const haptics = new ControllerHaptics({ gamepads: () => [gamepad({ reset })] });
    haptics.setActive(true);
    haptics.setActive(false);
    expect(reset).toHaveBeenCalledOnce();
  });

  it('treats inaccessible gamepad APIs as unsupported hardware', () => {
    const haptics = new ControllerHaptics({ gamepads: () => { throw new Error('blocked'); } });
    haptics.setActive(true);
    expect(haptics.cue('damage')).toBe(false);
    expect(() => haptics.setActive(false)).not.toThrow();
  });
});
