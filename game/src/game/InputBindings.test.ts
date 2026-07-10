import { describe, expect, it } from 'vitest';
import {
  INPUT_BINDING_STORAGE_KEY,
  InputBindings,
  bindingLabel,
  parseInputBindings,
  type BindingStorage,
} from './InputBindings';

class MemoryStorage implements BindingStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('InputBindings', () => {
  it('ships complete keyboard, mouse, and controller defaults', () => {
    const bindings = new InputBindings();
    expect(bindings.keyboardActions('KeyW')).toContain('move-forward');
    expect(bindings.mouseButtonActions(0)).toContain('fire');
    expect(bindings.gamepadButtonActions(7)).toContain('fire');
    expect(bindings.keyboardActions('Enter')).toContain('menu-confirm');
    expect(bindings.gamepadButtonActions(13)).toContain('menu-down');
    expect(bindings.get('weapon-8')).toEqual([{ device: 'keyboard', code: 'Digit8' }]);
  });

  it('captures a replacement, clears same-context conflicts, and preserves menu aliases', () => {
    const bindings = new InputBindings();
    bindings.beginCapture('fire');
    const result = bindings.capture({ device: 'keyboard', code: 'KeyW' });

    expect(result).toMatchObject({ captured: true, action: 'fire' });
    expect(result?.removedFrom).toContain('move-forward');
    expect(bindings.keyboardActions('KeyW')).toContain('fire');
    expect(bindings.keyboardActions('KeyW')).toContain('menu-up');
    expect(bindings.keyboardActions('KeyW')).not.toContain('move-forward');
    expect(bindings.capturing).toBeUndefined();
  });

  it('supports alternate bindings and action-level reset', () => {
    const bindings = new InputBindings();
    bindings.rebind('use', { device: 'keyboard', code: 'KeyR' });
    bindings.rebind('use', { device: 'gamepad-button', button: 2 }, { append: true });
    expect(bindings.get('use')).toHaveLength(2);

    bindings.reset('use');
    expect(bindings.keyboardActions('KeyE')).toContain('use');
    expect(bindings.keyboardActions('KeyR')).not.toContain('use');
  });

  it('serializes, validates, and restores persistent bindings', () => {
    const storage = new MemoryStorage();
    const first = new InputBindings(storage);
    first.rebind('quick-save', { device: 'keyboard', code: 'F2' });

    const serialized = storage.getItem(INPUT_BINDING_STORAGE_KEY);
    expect(serialized).not.toBeNull();
    expect(parseInputBindings(serialized!)).toBeDefined();
    expect(new InputBindings(storage).keyboardActions('F2')).toContain('quick-save');

    const before = first.serialize();
    expect(first.deserialize('{"schema":"wrong"}')).toBe(false);
    expect(first.serialize()).toBe(before);
  });

  it('normalizes analog axes with per-binding thresholds', () => {
    const bindings = new InputBindings();
    expect(bindings.axisValue('strafe-right', [.2])).toBe(0);
    expect(bindings.axisValue('strafe-right', [.725])).toBeCloseTo(.5);
    expect(bindings.axisValue('strafe-left', [-1])).toBe(1);
  });

  it('provides concise labels for remapping UI', () => {
    expect(bindingLabel({ device: 'keyboard', code: 'KeyR' })).toBe('R');
    expect(bindingLabel({ device: 'mouse-wheel', direction: -1 })).toBe('Wheel Up');
    expect(bindingLabel({ device: 'gamepad-axis', axis: 2, direction: 1 })).toBe('Axis 2 +');
  });
});
