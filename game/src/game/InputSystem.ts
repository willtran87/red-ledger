import {
  INPUT_ACTIONS,
  InputBindings,
  MENU_ACTIONS,
  type BindingStorage,
  type CaptureResult,
  type InputAction,
  type InputBinding,
  type MenuNavigationAction,
  type RebindOptions,
} from './InputBindings';

export interface MenuNavigationEvent {
  action: MenuNavigationAction;
  source: 'keyboard' | 'gamepad';
  repeat: boolean;
}

export interface InputSystemOptions {
  bindings?: InputBindings;
  storage?: BindingStorage | null;
}

export interface InputPreferences {
  mouseSensitivity: number;
  controllerSensitivity: number;
  touchSensitivity: number;
  invertY: boolean;
  controllerDeadzone: number;
}

export const DEFAULT_INPUT_PREFERENCES: Readonly<InputPreferences> = Object.freeze({
  mouseSensitivity: 1.2,
  controllerSensitivity: 1.2,
  touchSensitivity: 1.2,
  invertY: false,
  controllerDeadzone: .18,
});

const boundedNumber = (value: unknown, fallback: number, minimum: number, maximum: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;

export function normalizeInputPreferences(value: unknown): InputPreferences {
  const record = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    mouseSensitivity: boundedNumber(
      record.mouseSensitivity ?? record.sensitivity,
      DEFAULT_INPUT_PREFERENCES.mouseSensitivity,
      .5,
      3,
    ),
    controllerSensitivity: boundedNumber(
      record.controllerSensitivity,
      DEFAULT_INPUT_PREFERENCES.controllerSensitivity,
      .5,
      3,
    ),
    touchSensitivity: boundedNumber(
      record.touchSensitivity,
      DEFAULT_INPUT_PREFERENCES.touchSensitivity,
      .5,
      3,
    ),
    invertY: typeof record.invertY === 'boolean' ? record.invertY : DEFAULT_INPUT_PREFERENCES.invertY,
    controllerDeadzone: boundedNumber(
      record.controllerDeadzone,
      DEFAULT_INPUT_PREFERENCES.controllerDeadzone,
      .05,
      .45,
    ),
  };
}

export function applyControllerDeadzone(value: number, deadzone: number): number {
  if (!Number.isFinite(value)) return 0;
  const threshold = boundedNumber(deadzone, DEFAULT_INPUT_PREFERENCES.controllerDeadzone, .05, .45);
  const bounded = Math.max(-1, Math.min(1, value));
  const magnitude = Math.abs(bounded);
  if (magnitude <= threshold) return 0;
  return Math.sign(bounded) * (magnitude - threshold) / (1 - threshold);
}

export interface LookInputSample {
  keyboardTurn: number;
  keyboardLook: number;
  mouseX: number;
  mouseY: number;
  controllerX: number;
  controllerY: number;
  touchX: number;
  touchY: number;
}

export function composeLookInput(sample: LookInputSample, preferences: InputPreferences): {
  deltaX: number;
  deltaY: number;
  turn: number;
} {
  const verticalDirection = preferences.invertY ? -1 : 1;
  return {
    deltaX: sample.mouseX * preferences.mouseSensitivity,
    deltaY: (sample.mouseY * preferences.mouseSensitivity
      + (sample.controllerY * preferences.controllerSensitivity + sample.touchY * preferences.touchSensitivity) * 8
    ) * verticalDirection + sample.keyboardLook * 18 * DEFAULT_INPUT_PREFERENCES.mouseSensitivity,
    turn: sample.keyboardTurn * DEFAULT_INPUT_PREFERENCES.mouseSensitivity
      + sample.controllerX * preferences.controllerSensitivity
      + sample.touchX * preferences.touchSensitivity,
  };
}

export function applyClassicLookRestrictions(
  look: Readonly<{ deltaX: number; deltaY: number }>,
  classicInput: boolean,
): { deltaX: number; deltaY: number } {
  return {
    deltaX: look.deltaX,
    deltaY: classicInput ? 0 : look.deltaY,
  };
}

export function touchStickVector(
  clientX: number,
  clientY: number,
  left: number,
  top: number,
  width: number,
  height: number,
): { x: number; y: number } {
  if (![clientX, clientY, left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return { x: 0, y: 0 };
  return {
    x: Math.max(-1, Math.min(1, (clientX - left - width / 2) / (width / 2))),
    y: Math.max(-1, Math.min(1, (clientY - top - height / 2) / (height / 2))),
  };
}

export function menuAxisEngaged(value: number, wasEngaged: boolean): boolean {
  if (!Number.isFinite(value)) return false;
  return wasEngaged ? value > .22 : value >= .4;
}

export interface InputActionEvent {
  action: InputAction;
  source: 'keyboard' | 'mouse' | 'gamepad' | 'touch';
  repeat: boolean;
}

const CANONICAL_KEY: Readonly<Partial<Record<InputAction, string>>> = {
  'move-forward': 'KeyW', 'move-backward': 'KeyS', 'strafe-left': 'KeyA', 'strafe-right': 'KeyD',
  'turn-left': 'ArrowLeft', 'turn-right': 'ArrowRight', 'look-up': 'PageUp', 'look-down': 'PageDown', 'weapon-previous': 'KeyQ',
  'weapon-1': 'Digit1', 'weapon-2': 'Digit2', 'weapon-3': 'Digit3', 'weapon-4': 'Digit4',
  'weapon-5': 'Digit5', 'weapon-6': 'Digit6', 'weapon-7': 'Digit7', 'weapon-8': 'Digit8',
  'quick-save': 'F6', 'quick-load': 'F9', fullscreen: 'KeyF', pause: 'Escape',
};
const ANALOG_ACTIONS = new Set<InputAction>([
  'move-forward', 'move-backward', 'strafe-left', 'strafe-right',
  'turn-left', 'turn-right', 'look-up', 'look-down',
]);
const PULSE_ACTIONS = new Set<InputAction>([
  'weapon-1', 'weapon-2', 'weapon-3', 'weapon-4', 'weapon-5', 'weapon-6', 'weapon-7', 'weapon-8',
  'quick-save', 'quick-load', 'fullscreen', 'pause',
]);
const MINIMUM_PULSE_MS = 40;

export class InputSystem {
  readonly keys = new Set<string>();
  readonly bindings: InputBindings;
  use = false;
  lookDelta = 0;
  lookDeltaY = 0;
  touchMove = { x: 0, y: 0 };
  touchLook = { x: 0, y: 0 };
  gamepadMove = { x: 0, y: 0 };
  gamepadLook = { x: 0, y: 0 };
  private pointerFire = false;
  private touchFire = false;
  private gamepadFire = false;
  private gamepadButtons: boolean[] = [];
  private readonly gamepadAxisActions = new Map<InputAction, boolean>();
  private keyboardFire = false;
  private weaponCycle = 0;
  private walkToggle = false;
  private readonly menuNavigation: MenuNavigationEvent[] = [];
  private readonly physicalKeys = new Map<string, InputAction[]>();
  private menuNavigationEnabled = true;
  private menuGamepadButtons: boolean[] = [];
  private menuAxisActions: boolean[] = [];
  private captureGamepadAxes: boolean[] = [];
  private menuPollFrame = 0;
  private touchLookPointer?: number;
  private controllerDeadzone = DEFAULT_INPUT_PREFERENCES.controllerDeadzone;
  private readonly keyPressedAt = new Map<string, number>();
  private readonly keyReleaseTimers = new Map<string, number>();
  private readonly firePressedAt = new Map<InputActionEvent['source'], number>();
  private readonly fireReleaseTimers = new Map<InputActionEvent['source'], number>();

  get fire(): boolean { return this.pointerFire || this.touchFire || this.gamepadFire || this.keyboardFire; }

  constructor(private readonly canvas: HTMLCanvasElement, options: InputSystemOptions = {}) {
    this.bindings = options.bindings ?? new InputBindings(options.storage === undefined ? this.browserStorage() : options.storage);
    window.addEventListener('keydown', (event) => {
      if (document.querySelector('dialog[open]')) return;
      if (this.bindings.capturing) {
        event.preventDefault();
        if (event.code === 'Escape') {
          this.cancelBindingCapture();
          window.dispatchEvent(new Event('input-binding-cancelled'));
          return;
        }
        this.finishCapture({ device: 'keyboard', code: event.code });
        return;
      }
      if (this.isTextEntryTarget(event.target)) return;
      const actions = this.bindings.keyboardActions(event.code);
      const ownsDirectionalNavigation = actions.some((action) => {
        const menuAction = MENU_ACTIONS[action];
        return menuAction === 'up' || menuAction === 'down' || menuAction === 'left' || menuAction === 'right';
      });
      if (actions.includes('automap') || actions.includes('automap-overlay') || ownsDirectionalNavigation) event.preventDefault();
      this.physicalKeys.set(event.code, actions);
      if (!event.repeat) {
        this.keyPressedAt.set(event.code, performance.now());
        const pendingRelease = this.keyReleaseTimers.get(event.code);
        if (pendingRelease !== undefined) window.clearTimeout(pendingRelease);
        this.keyReleaseTimers.delete(event.code);
      }
      this.pressActions(actions, event.repeat, 'keyboard');
      // Bound actions add their canonical runtime key in pressActions. F5 is
      // retained as the unbound legacy quick-save alias.
      if (!actions.length && event.code === 'F5') this.keys.add(event.code);
    });
    window.addEventListener('keyup', (event) => {
      if (this.isTextEntryTarget(event.target) && !this.physicalKeys.has(event.code)) return;
      const actions = this.physicalKeys.get(event.code) ?? this.bindings.keyboardActions(event.code);
      this.physicalKeys.delete(event.code);
      const elapsed = performance.now() - (this.keyPressedAt.get(event.code) ?? -Infinity);
      const preservePulse = actions.some((action) => PULSE_ACTIONS.has(action)) && elapsed < MINIMUM_PULSE_MS;
      this.releaseActions(actions, 'keyboard', preservePulse);
      if (preservePulse) {
        const timer = window.setTimeout(() => {
          this.keys.delete(event.code);
          actions.forEach((action) => {
            const canonical = CANONICAL_KEY[action];
            if (canonical) this.keys.delete(canonical);
          });
          this.keyReleaseTimers.delete(event.code);
        }, MINIMUM_PULSE_MS - elapsed);
        this.keyReleaseTimers.set(event.code, timer);
      } else this.keys.delete(event.code);
      this.keyPressedAt.delete(event.code);
    });
    window.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.lookDelta += event.movementX;
      this.lookDeltaY += event.movementY;
    });
    this.canvas.addEventListener('mousedown', (event) => {
      if (this.bindings.capturing) {
        event.preventDefault();
        this.finishCapture({ device: 'mouse-button', button: event.button });
        return;
      }
      if (document.pointerLockElement !== this.canvas && event.button === 0) {
        const request = this.canvas.requestPointerLock() as Promise<void> | undefined;
        void request?.catch(() => undefined);
        return;
      }
      this.pressActions(this.bindings.mouseButtonActions(event.button), false, 'mouse');
    });
    window.addEventListener('mouseup', (event) => this.releaseActions(this.bindings.mouseButtonActions(event.button), 'mouse'));
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      if (event.deltaY === 0) return;
      const binding = { device: 'mouse-wheel', direction: event.deltaY > 0 ? 1 : -1 } as const;
      if (this.bindings.capturing) this.finishCapture(binding);
      else {
        const actions = this.bindings.mouseWheelActions(binding.direction);
        this.pressActions(actions, false, 'mouse');
        this.releaseActions(actions, 'mouse');
      }
    }, { passive: false });
    this.bindTouch();
    window.addEventListener('blur', () => this.suspendInput('blur'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.suspendInput('hidden');
    });
    this.startMenuGamepadPolling();
  }

  getBinding(action: InputAction): readonly InputBinding[] { return this.bindings.get(action); }
  rebind(action: InputAction, binding: InputBinding, options?: RebindOptions): void { this.bindings.rebind(action, binding, options); }
  beginBindingCapture(action: InputAction): void { this.bindings.beginCapture(action); }
  cancelBindingCapture(): void { this.bindings.cancelCapture(); }
  resetBindings(action?: InputAction): void { this.bindings.reset(action); }
  serializeBindings(): string { return this.bindings.serialize(); }
  loadBindings(serialized: string): boolean { return this.bindings.deserialize(serialized); }
  setControllerDeadzone(value: number): void {
    this.controllerDeadzone = normalizeInputPreferences({ controllerDeadzone: value }).controllerDeadzone;
  }

  setMenuNavigationEnabled(enabled: boolean): void {
    this.menuNavigationEnabled = enabled;
    if (!enabled) {
      this.menuNavigation.length = 0;
      this.menuGamepadButtons = [];
      this.menuAxisActions = [];
      this.captureGamepadAxes = [];
      if (this.menuPollFrame) cancelAnimationFrame(this.menuPollFrame);
      this.menuPollFrame = 0;
    } else this.startMenuGamepadPolling();
  }

  destroy(): void {
    if (this.menuPollFrame) cancelAnimationFrame(this.menuPollFrame);
    this.menuPollFrame = 0;
  }

  consumeMenuNavigation(): MenuNavigationEvent | undefined { return this.menuNavigation.shift(); }

  drainMenuNavigation(): MenuNavigationEvent[] {
    return this.menuNavigation.splice(0, this.menuNavigation.length);
  }

  consumeUse(): boolean {
    const value = this.use;
    this.use = false;
    return value;
  }

  consumeLook(): number {
    const value = this.lookDelta;
    this.lookDelta = 0;
    return value;
  }

  consumeVerticalLook(): number {
    const value = this.lookDeltaY;
    this.lookDeltaY = 0;
    return value;
  }

  consumeWeaponCycle(): number {
    const value = this.weaponCycle;
    this.weaponCycle = 0;
    return value;
  }

  consumeWalkToggle(): boolean {
    const value = this.walkToggle;
    this.walkToggle = false;
    return value;
  }

  clearTransientInputs(): void {
    const active = new Set<InputAction>();
    this.physicalKeys.forEach((actions) => actions.forEach((action) => active.add(action)));
    active.forEach((action) => this.releaseActions([action], 'keyboard'));
    this.keys.clear();
    this.physicalKeys.clear();
    this.pointerFire = false;
    this.touchFire = false;
    this.gamepadFire = false;
    this.keyboardFire = false;
    this.use = false;
    this.lookDelta = 0;
    this.lookDeltaY = 0;
    this.touchMove = { x: 0, y: 0 };
    this.touchLook = { x: 0, y: 0 };
    this.gamepadMove = { x: 0, y: 0 };
    this.gamepadLook = { x: 0, y: 0 };
    this.weaponCycle = 0;
    this.walkToggle = false;
    this.gamepadButtons = [];
    this.gamepadAxisActions.clear();
    this.keyReleaseTimers.forEach((timer) => window.clearTimeout(timer));
    this.keyReleaseTimers.clear();
    this.keyPressedAt.clear();
    this.fireReleaseTimers.forEach((timer) => window.clearTimeout(timer));
    this.fireReleaseTimers.clear();
    this.firePressedAt.clear();
    document.querySelectorAll<HTMLElement>('.touch-stick span').forEach((knob) => { knob.style.transform = ''; });
  }

  clearGameplayActions(): void {
    this.keys.clear();
    this.pointerFire = false;
    this.touchFire = false;
    this.gamepadFire = false;
    this.keyboardFire = false;
    this.use = false;
    this.lookDelta = 0;
    this.lookDeltaY = 0;
    this.touchMove = { x: 0, y: 0 };
    this.touchLook = { x: 0, y: 0 };
    this.gamepadMove = { x: 0, y: 0 };
    this.gamepadLook = { x: 0, y: 0 };
    this.weaponCycle = 0;
    this.walkToggle = false;
    this.fireReleaseTimers.forEach((timer) => window.clearTimeout(timer));
    this.fireReleaseTimers.clear();
    this.firePressedAt.clear();
    document.querySelectorAll<HTMLElement>('.touch-stick span').forEach((knob) => { knob.style.transform = ''; });
  }

  pollGamepad(): void {
    const gamepad = navigator.getGamepads?.().find((candidate) => candidate?.connected) ?? null;
    if (!gamepad) {
      this.gamepadMove = { x: 0, y: 0 };
      this.gamepadLook = { x: 0, y: 0 };
      this.gamepadFire = false;
      this.gamepadAxisActions.clear();
      this.menuGamepadButtons = [];
      this.menuAxisActions = [];
      this.captureGamepadAxes = [];
      return;
    }
    this.gamepadMove = {
      x: this.controllerAxisValue('strafe-right', gamepad.axes) - this.controllerAxisValue('strafe-left', gamepad.axes),
      y: this.controllerAxisValue('move-backward', gamepad.axes) - this.controllerAxisValue('move-forward', gamepad.axes),
    };
    this.gamepadLook = {
      x: this.controllerAxisValue('turn-right', gamepad.axes) - this.controllerAxisValue('turn-left', gamepad.axes),
      y: this.controllerAxisValue('look-down', gamepad.axes) - this.controllerAxisValue('look-up', gamepad.axes),
    };
    this.gamepadFire = this.bindings.isGamepadButtonDown('fire', gamepad.buttons)
      || this.controllerAxisValue('fire', gamepad.axes) > 0;
    const pressed = gamepad.buttons.map((button) => button.pressed);
    const edge = (index: number) => pressed[index] && !this.gamepadButtons[index];
    const released = (index: number) => !pressed[index] && this.gamepadButtons[index];
    for (let index = 0; index < pressed.length; index += 1) {
      if (edge(index)) this.pressActions(this.bindings.gamepadButtonActions(index), false, 'gamepad', false);
      if (released(index)) this.releaseActions(this.bindings.gamepadButtonActions(index), 'gamepad');
    }
    for (const action of INPUT_ACTIONS) {
      if (ANALOG_ACTIONS.has(action) || action === 'fire' || MENU_ACTIONS[action]) continue;
      const down = this.controllerAxisValue(action, gamepad.axes) > 0;
      const wasDown = this.gamepadAxisActions.get(action) ?? false;
      if (down && !wasDown) this.pressActions([action], false, 'gamepad', false);
      if (!down && wasDown) this.releaseActions([action], 'gamepad');
      this.gamepadAxisActions.set(action, down);
    }
    this.gamepadButtons = pressed;
  }

  private pressActions(
    actions: readonly InputAction[],
    repeat: boolean,
    source: 'keyboard' | 'mouse' | 'gamepad' | 'touch',
    includeMenu = true,
  ): void {
    const pauseOwnsSharedBack = actions.includes('pause') && actions.includes('menu-back');
    for (const action of actions) {
      const canonical = CANONICAL_KEY[action];
      if (canonical) this.keys.add(canonical);
      if (action === 'fire') {
        const pendingRelease = this.fireReleaseTimers.get(source);
        if (pendingRelease !== undefined) window.clearTimeout(pendingRelease);
        this.fireReleaseTimers.delete(source);
        if (!repeat) this.firePressedAt.set(source, performance.now());
        if (source === 'keyboard') this.keyboardFire = true;
        else if (source === 'mouse') this.pointerFire = true;
        else if (source === 'gamepad') this.gamepadFire = true;
        else this.touchFire = true;
      }
      if (action === 'use' && !repeat) this.use = true;
      if (action === 'walk-toggle' && !repeat) this.walkToggle = true;
      if (action === 'weapon-previous' && !repeat) this.weaponCycle = -1;
      if (action === 'weapon-next' && !repeat) this.weaponCycle = 1;
      if (action === 'automap' && !repeat && source === 'gamepad') window.dispatchEvent(new CustomEvent('gamepad-automap'));
      if (action === 'automap-overlay' && !repeat) this.keys.add('KeyO');
      const menuAction = MENU_ACTIONS[action];
      if (menuAction && includeMenu && this.menuNavigationEnabled && !(pauseOwnsSharedBack && action === 'menu-back')) {
        this.emitMenuNavigation(menuAction, source === 'gamepad' ? 'gamepad' : 'keyboard', repeat);
      }
      if (!repeat) {
        const detail = { action, source, repeat } satisfies InputActionEvent;
        window.dispatchEvent(new CustomEvent<InputActionEvent>('input-action', { detail }));
      }
    }
  }

  private controllerAxisValue(action: InputAction, axes: readonly number[]): number {
    let value = 0;
    for (const binding of this.bindings.get(action)) {
      if (binding.device !== 'gamepad-axis') continue;
      value = Math.max(value, applyControllerDeadzone((axes[binding.axis] ?? 0) * binding.direction, this.controllerDeadzone));
    }
    return value;
  }

  private releaseActions(
    actions: readonly InputAction[],
    source: 'keyboard' | 'mouse' | 'gamepad' | 'touch',
    preserveCanonicalPulse = false,
  ): void {
    for (const action of actions) {
      const canonical = CANONICAL_KEY[action];
      if (canonical && !(preserveCanonicalPulse && PULSE_ACTIONS.has(action))) this.keys.delete(canonical);
      if (action === 'fire') {
        const clear = () => {
          if (source === 'keyboard') this.keyboardFire = false;
          else if (source === 'mouse') this.pointerFire = false;
          else if (source === 'gamepad') this.gamepadFire = false;
          else this.touchFire = false;
          this.firePressedAt.delete(source);
          this.fireReleaseTimers.delete(source);
        };
        const elapsed = performance.now() - (this.firePressedAt.get(source) ?? -Infinity);
        if (elapsed < MINIMUM_PULSE_MS) {
          const pending = this.fireReleaseTimers.get(source);
          if (pending !== undefined) window.clearTimeout(pending);
          this.fireReleaseTimers.set(source, window.setTimeout(clear, MINIMUM_PULSE_MS - elapsed));
        } else clear();
      }
      if (action === 'automap-overlay') this.keys.delete('KeyO');
      const detail = { action, source, repeat: false } satisfies InputActionEvent;
      window.dispatchEvent(new CustomEvent<InputActionEvent>('input-action-release', { detail }));
    }
  }

  private pollMenuAxes(axes: readonly number[]): void {
    const menuActions: InputAction[] = ['menu-up', 'menu-down', 'menu-left', 'menu-right'];
    menuActions.forEach((action, index) => {
      const pressed = menuAxisEngaged(this.controllerAxisValue(action, axes), this.menuAxisActions[index] ?? false);
      if (pressed && !this.menuAxisActions[index] && this.menuNavigationEnabled) {
        this.emitMenuNavigation(MENU_ACTIONS[action]!, 'gamepad', false);
      }
      this.menuAxisActions[index] = pressed;
    });
  }

  private startMenuGamepadPolling(): void {
    if (!this.menuNavigationEnabled || this.menuPollFrame) return;
    const poll = () => {
      this.menuPollFrame = 0;
      if (!this.menuNavigationEnabled) return;
      this.pollMenuGamepad();
      this.menuPollFrame = requestAnimationFrame(poll);
    };
    this.menuPollFrame = requestAnimationFrame(poll);
  }

  private pollMenuGamepad(): void {
    const gamepad = navigator.getGamepads?.().find((candidate) => candidate?.connected) ?? null;
    if (!gamepad) {
      this.menuGamepadButtons = [];
      this.menuAxisActions = [];
      this.captureGamepadAxes = [];
      return;
    }
    const pressed = gamepad.buttons.map((button) => button.pressed);
    if (this.bindings.capturing) {
      const button = pressed.findIndex((value, index) => value && !this.menuGamepadButtons[index]);
      if (button >= 0) this.finishCapture({ device: 'gamepad-button', button });
      else {
        const axis = gamepad.axes.findIndex((value) => Math.abs(value) >= .65);
        if (axis >= 0 && !this.captureGamepadAxes[axis]) {
          this.finishCapture({ device: 'gamepad-axis', axis, direction: gamepad.axes[axis] < 0 ? -1 : 1, threshold: .45 });
        }
      }
    } else {
      pressed.forEach((value, index) => {
        if (!value || this.menuGamepadButtons[index]) return;
        for (const action of this.bindings.gamepadButtonActions(index)) {
          const menuAction = MENU_ACTIONS[action];
          if (menuAction) this.emitMenuNavigation(menuAction, 'gamepad', false);
        }
      });
      this.pollMenuAxes(gamepad.axes);
    }
    this.menuGamepadButtons = pressed;
    this.captureGamepadAxes = gamepad.axes.map((value) => Math.abs(value) >= .65);
  }

  private emitMenuNavigation(action: MenuNavigationAction, source: 'keyboard' | 'gamepad', repeat: boolean): void {
    const detail = { action, source, repeat } satisfies MenuNavigationEvent;
    this.menuNavigation.push(detail);
    window.dispatchEvent(new CustomEvent<MenuNavigationEvent>('input-menu-navigation', { detail }));
  }

  private finishCapture(binding: InputBinding): void {
    const detail = this.bindings.capture(binding);
    if (detail) window.dispatchEvent(new CustomEvent<CaptureResult>('input-binding-captured', { detail }));
  }

  private browserStorage(): BindingStorage | null {
    try { return window.localStorage; } catch { return null; }
  }

  private isTextEntryTarget(target: EventTarget | null): boolean {
    if (target instanceof HTMLTextAreaElement) return true;
    if (target instanceof HTMLInputElement) return ['text', 'search', 'email', 'url', 'tel', 'password'].includes(target.type);
    return target instanceof HTMLElement && target.isContentEditable;
  }

  private suspendInput(reason: 'blur' | 'hidden'): void {
    this.clearTransientInputs();
    window.dispatchEvent(new CustomEvent('input-lifecycle-pause', { detail: { reason } }));
  }

  private bindTouch(): void {
    const bindButton = (selector: string, action: InputAction, held = false) => {
      const button = document.querySelector<HTMLButtonElement>(selector);
      if (!button) return;
      const release = (event: PointerEvent) => {
        event.preventDefault();
        this.releaseActions([action], 'touch');
        if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      };
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.pressActions([action], false, 'touch');
        if (!held) this.releaseActions([action], 'touch');
      });
      if (held) {
        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
        button.addEventListener('lostpointercapture', () => this.releaseActions([action], 'touch'));
      }
    };
    bindButton('#touch-fire', 'fire', true);
    bindButton('#touch-use', 'use');
    bindButton('#touch-weapon', 'weapon-next');
    bindButton('#touch-map', 'automap');
    bindButton('#touch-pause', 'pause');
    const stick = document.querySelector<HTMLElement>('#touch-stick');
    const knob = stick?.querySelector<HTMLElement>('span');
    if (stick && knob) {
      const move = (event: PointerEvent) => {
        const bounds = stick.getBoundingClientRect();
        this.touchMove = touchStickVector(event.clientX, event.clientY, bounds.left, bounds.top, bounds.width, bounds.height);
        const travel = Math.max(8, (bounds.width - knob.getBoundingClientRect().width) / 2 - 2);
        knob.style.transform = `translate(${this.touchMove.x * travel}px, ${this.touchMove.y * travel}px)`;
      };
      const releaseMove = (event: PointerEvent) => {
        if (stick.hasPointerCapture(event.pointerId)) stick.releasePointerCapture(event.pointerId);
        this.touchMove = { x: 0, y: 0 };
        knob.style.transform = '';
      };
      stick.addEventListener('pointerdown', (event) => { event.preventDefault(); stick.setPointerCapture(event.pointerId); move(event); });
      stick.addEventListener('pointermove', (event) => { if (stick.hasPointerCapture(event.pointerId)) move(event); });
      stick.addEventListener('pointerup', releaseMove);
      stick.addEventListener('pointercancel', releaseMove);
      stick.addEventListener('lostpointercapture', () => { this.touchMove = { x: 0, y: 0 }; knob.style.transform = ''; });
    }
    const look = document.querySelector<HTMLElement>('#touch-look');
    const lookKnob = look?.querySelector<HTMLElement>('span');
    if (!look || !lookKnob) return;
    const updateLook = (event: PointerEvent) => {
      const bounds = look.getBoundingClientRect();
      this.touchLook = touchStickVector(event.clientX, event.clientY, bounds.left, bounds.top, bounds.width, bounds.height);
      const travel = Math.max(8, (bounds.width - lookKnob.getBoundingClientRect().width) / 2 - 2);
      lookKnob.style.transform = `translate(${this.touchLook.x * travel}px, ${this.touchLook.y * travel}px)`;
    };
    const releaseLook = (event: PointerEvent) => {
      if (look.hasPointerCapture(event.pointerId)) look.releasePointerCapture(event.pointerId);
      this.touchLookPointer = undefined;
      this.touchLook = { x: 0, y: 0 };
      lookKnob.style.transform = '';
    };
    look.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.touchLookPointer = event.pointerId;
      look.setPointerCapture(event.pointerId);
      updateLook(event);
    });
    look.addEventListener('pointermove', (event) => {
      if (this.touchLookPointer !== event.pointerId || !look.hasPointerCapture(event.pointerId)) return;
      updateLook(event);
    });
    look.addEventListener('pointerup', releaseLook);
    look.addEventListener('pointercancel', releaseLook);
    look.addEventListener('lostpointercapture', () => { this.touchLookPointer = undefined; this.touchLook = { x: 0, y: 0 }; lookKnob.style.transform = ''; });
  }
}
