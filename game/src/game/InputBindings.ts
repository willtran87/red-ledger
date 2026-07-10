export const INPUT_BINDING_SCHEMA = 'red-ledger-input-bindings';
export const INPUT_BINDING_VERSION = 1;
export const INPUT_BINDING_STORAGE_KEY = 'red-ledger-input-bindings-v1';

export const INPUT_ACTIONS = [
  'move-forward', 'move-backward', 'strafe-left', 'strafe-right',
  'turn-left', 'turn-right', 'look-up', 'look-down',
  'fire', 'use', 'walk-toggle', 'weapon-previous', 'weapon-next', 'weapon-radial',
  'weapon-1', 'weapon-2', 'weapon-3', 'weapon-4',
  'weapon-5', 'weapon-6', 'weapon-7', 'weapon-8',
  'automap', 'automap-overlay', 'quick-save', 'quick-load', 'fullscreen', 'pause',
  'menu-up', 'menu-down', 'menu-left', 'menu-right', 'menu-confirm', 'menu-back',
] as const;

export type InputAction = typeof INPUT_ACTIONS[number];
export type MenuNavigationAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';
export type InputDevice = InputBinding['device'];

export type InputBinding =
  | { device: 'keyboard'; code: string }
  | { device: 'mouse-button'; button: number }
  | { device: 'mouse-wheel'; direction: -1 | 1 }
  | { device: 'gamepad-button'; button: number }
  | { device: 'gamepad-axis'; axis: number; direction: -1 | 1; threshold?: number };

export interface InputBindingDocument {
  schema: typeof INPUT_BINDING_SCHEMA;
  version: typeof INPUT_BINDING_VERSION;
  bindings: Partial<Record<InputAction, InputBinding[]>>;
}

export interface BindingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface RebindOptions {
  append?: boolean;
  clearConflicts?: boolean;
}

export interface RebindResult {
  action: InputAction;
  binding: InputBinding;
  removedFrom: InputAction[];
}

export interface CaptureResult extends RebindResult {
  captured: true;
}

export const MENU_ACTIONS: Readonly<Partial<Record<InputAction, MenuNavigationAction>>> = {
  'menu-up': 'up',
  'menu-down': 'down',
  'menu-left': 'left',
  'menu-right': 'right',
  'menu-confirm': 'confirm',
  'menu-back': 'back',
};

const DEFAULTS: Record<InputAction, readonly InputBinding[]> = {
  'move-forward': [keyboard('KeyW'), keyboard('ArrowUp'), gamepadAxis(1, -1)],
  'move-backward': [keyboard('KeyS'), keyboard('ArrowDown'), gamepadAxis(1, 1)],
  'strafe-left': [keyboard('KeyA'), gamepadAxis(0, -1)],
  'strafe-right': [keyboard('KeyD'), gamepadAxis(0, 1)],
  'turn-left': [keyboard('ArrowLeft'), gamepadAxis(2, -1)],
  'turn-right': [keyboard('ArrowRight'), gamepadAxis(2, 1)],
  'look-up': [gamepadAxis(3, -1)],
  'look-down': [gamepadAxis(3, 1)],
  fire: [{ device: 'mouse-button', button: 0 }, { device: 'gamepad-button', button: 7 }],
  use: [keyboard('KeyE'), keyboard('Space'), { device: 'gamepad-button', button: 0 }],
  'walk-toggle': [keyboard('ShiftLeft'), keyboard('ShiftRight')],
  'weapon-previous': [keyboard('KeyQ'), { device: 'mouse-wheel', direction: -1 }, { device: 'gamepad-button', button: 4 }],
  'weapon-next': [{ device: 'mouse-wheel', direction: 1 }, { device: 'gamepad-button', button: 5 }],
  'weapon-radial': [{ device: 'gamepad-button', button: 6 }],
  'weapon-1': [keyboard('Digit1')],
  'weapon-2': [keyboard('Digit2')],
  'weapon-3': [keyboard('Digit3')],
  'weapon-4': [keyboard('Digit4')],
  'weapon-5': [keyboard('Digit5')],
  'weapon-6': [keyboard('Digit6')],
  'weapon-7': [keyboard('Digit7')],
  'weapon-8': [keyboard('Digit8')],
  automap: [keyboard('Tab'), { device: 'gamepad-button', button: 8 }],
  'automap-overlay': [keyboard('KeyO')],
  'quick-save': [keyboard('F6')],
  'quick-load': [keyboard('F9')],
  fullscreen: [keyboard('KeyF')],
  pause: [keyboard('Escape'), { device: 'gamepad-button', button: 9 }],
  'menu-up': [keyboard('ArrowUp'), keyboard('KeyW'), gamepadAxis(1, -1), { device: 'gamepad-button', button: 12 }],
  'menu-down': [keyboard('ArrowDown'), keyboard('KeyS'), gamepadAxis(1, 1), { device: 'gamepad-button', button: 13 }],
  'menu-left': [keyboard('ArrowLeft'), keyboard('KeyA'), gamepadAxis(0, -1), { device: 'gamepad-button', button: 14 }],
  'menu-right': [keyboard('ArrowRight'), keyboard('KeyD'), gamepadAxis(0, 1), { device: 'gamepad-button', button: 15 }],
  'menu-confirm': [keyboard('Enter'), keyboard('Space'), { device: 'gamepad-button', button: 0 }],
  'menu-back': [keyboard('Escape'), { device: 'gamepad-button', button: 1 }],
};

const ACTION_SET = new Set<string>(INPUT_ACTIONS);

function keyboard(code: string): InputBinding { return { device: 'keyboard', code }; }
function gamepadAxis(axis: number, direction: -1 | 1): InputBinding {
  return { device: 'gamepad-axis', axis, direction, threshold: .45 };
}

function cloneBinding(binding: InputBinding): InputBinding { return { ...binding }; }
function bindingKey(binding: InputBinding): string {
  switch (binding.device) {
    case 'keyboard': return `keyboard:${binding.code}`;
    case 'mouse-button': return `mouse-button:${binding.button}`;
    case 'mouse-wheel': return `mouse-wheel:${binding.direction}`;
    case 'gamepad-button': return `gamepad-button:${binding.button}`;
    case 'gamepad-axis': return `gamepad-axis:${binding.axis}:${binding.direction}`;
  }
}

function isAction(value: unknown): value is InputAction {
  return typeof value === 'string' && ACTION_SET.has(value);
}

export function isInputBinding(value: unknown): value is InputBinding {
  if (!value || typeof value !== 'object') return false;
  const binding = value as Partial<InputBinding> & Record<string, unknown>;
  if (binding.device === 'keyboard') return typeof binding.code === 'string' && binding.code.length > 0 && binding.code.length <= 64;
  if (binding.device === 'mouse-button') return Number.isInteger(binding.button) && Number(binding.button) >= 0 && Number(binding.button) <= 15;
  if (binding.device === 'mouse-wheel') return binding.direction === -1 || binding.direction === 1;
  if (binding.device === 'gamepad-button') return Number.isInteger(binding.button) && Number(binding.button) >= 0 && Number(binding.button) <= 63;
  if (binding.device === 'gamepad-axis') {
    return Number.isInteger(binding.axis) && Number(binding.axis) >= 0 && Number(binding.axis) <= 31
      && (binding.direction === -1 || binding.direction === 1)
      && (binding.threshold === undefined || typeof binding.threshold === 'number' && binding.threshold >= .1 && binding.threshold <= 1);
  }
  return false;
}

export function parseInputBindings(serialized: string): InputBindingDocument | undefined {
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object') return undefined;
    const document = parsed as Partial<InputBindingDocument>;
    if (document.schema !== INPUT_BINDING_SCHEMA || document.version !== INPUT_BINDING_VERSION
      || !document.bindings || typeof document.bindings !== 'object') return undefined;
    const bindings: Partial<Record<InputAction, InputBinding[]>> = {};
    for (const [action, values] of Object.entries(document.bindings)) {
      if (!isAction(action) || !Array.isArray(values) || !values.every(isInputBinding)) return undefined;
      bindings[action] = deduplicate(values.map(cloneBinding));
    }
    return { schema: INPUT_BINDING_SCHEMA, version: INPUT_BINDING_VERSION, bindings };
  } catch {
    return undefined;
  }
}

export function bindingLabel(binding: InputBinding): string {
  switch (binding.device) {
    case 'keyboard': return binding.code.replace(/^Key/, '').replace(/^Digit/, '');
    case 'mouse-button': return binding.button === 0 ? 'Mouse 1' : binding.button === 1 ? 'Mouse 3' : binding.button === 2 ? 'Mouse 2' : `Mouse ${binding.button + 1}`;
    case 'mouse-wheel': return binding.direction < 0 ? 'Wheel Up' : 'Wheel Down';
    case 'gamepad-button': return `Gamepad ${binding.button}`;
    case 'gamepad-axis': return `Axis ${binding.axis} ${binding.direction < 0 ? '-' : '+'}`;
  }
}

function deduplicate(bindings: readonly InputBinding[]): InputBinding[] {
  const seen = new Set<string>();
  return bindings.filter((binding) => {
    const key = bindingKey(binding);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameContext(left: InputAction, right: InputAction): boolean {
  return left.startsWith('menu-') === right.startsWith('menu-');
}

export class InputBindings {
  private readonly values = new Map<InputAction, InputBinding[]>();
  private captureAction?: InputAction;

  constructor(
    private readonly storage: BindingStorage | null = null,
    private readonly storageKey = INPUT_BINDING_STORAGE_KEY,
  ) {
    this.applyDefaults();
    this.restore();
  }

  get capturing(): InputAction | undefined { return this.captureAction; }

  get(action: InputAction): readonly InputBinding[] {
    return (this.values.get(action) ?? []).map(cloneBinding);
  }

  all(): Record<InputAction, InputBinding[]> {
    return Object.fromEntries(INPUT_ACTIONS.map((action) => [action, this.get(action)])) as Record<InputAction, InputBinding[]>;
  }

  actionsFor(binding: InputBinding): InputAction[] {
    const key = bindingKey(binding);
    return INPUT_ACTIONS.filter((action) => (this.values.get(action) ?? []).some((candidate) => bindingKey(candidate) === key));
  }

  keyboardActions(code: string): InputAction[] { return this.actionsFor({ device: 'keyboard', code }); }
  mouseButtonActions(button: number): InputAction[] { return this.actionsFor({ device: 'mouse-button', button }); }
  mouseWheelActions(direction: -1 | 1): InputAction[] { return this.actionsFor({ device: 'mouse-wheel', direction }); }
  gamepadButtonActions(button: number): InputAction[] { return this.actionsFor({ device: 'gamepad-button', button }); }

  axisValue(action: InputAction, axes: readonly number[]): number {
    let value = 0;
    for (const binding of this.values.get(action) ?? []) {
      if (binding.device !== 'gamepad-axis') continue;
      const raw = (axes[binding.axis] ?? 0) * binding.direction;
      const deadzone = binding.threshold ?? .16;
      if (raw <= deadzone) continue;
      value = Math.max(value, Math.min(1, (raw - deadzone) / (1 - deadzone)));
    }
    return value;
  }

  isGamepadButtonDown(action: InputAction, buttons: readonly GamepadButton[]): boolean {
    return (this.values.get(action) ?? []).some((binding) => binding.device === 'gamepad-button' && Boolean(buttons[binding.button]?.pressed));
  }

  rebind(action: InputAction, binding: InputBinding, options: RebindOptions = {}): RebindResult {
    if (!isInputBinding(binding)) throw new TypeError('Invalid input binding');
    const removedFrom: InputAction[] = [];
    if (options.clearConflicts ?? true) {
      const key = bindingKey(binding);
      for (const other of INPUT_ACTIONS) {
        if (other === action || !sameContext(action, other)) continue;
        const previous = this.values.get(other) ?? [];
        const next = previous.filter((candidate) => bindingKey(candidate) !== key);
        if (next.length !== previous.length) {
          this.values.set(other, next);
          removedFrom.push(other);
        }
      }
    }
    const previous = options.append ? this.values.get(action) ?? [] : [];
    this.values.set(action, deduplicate([...previous, cloneBinding(binding)]));
    this.persist();
    return { action, binding: cloneBinding(binding), removedFrom };
  }

  set(action: InputAction, bindings: readonly InputBinding[]): void {
    if (!bindings.every(isInputBinding)) throw new TypeError('Invalid input binding list');
    this.values.set(action, deduplicate(bindings.map(cloneBinding)));
    this.persist();
  }

  beginCapture(action: InputAction): void { this.captureAction = action; }
  cancelCapture(): void { this.captureAction = undefined; }

  capture(binding: InputBinding, options?: RebindOptions): CaptureResult | undefined {
    if (!this.captureAction) return undefined;
    const action = this.captureAction;
    this.captureAction = undefined;
    return { captured: true, ...this.rebind(action, binding, options) };
  }

  reset(action?: InputAction): void {
    if (action) this.values.set(action, DEFAULTS[action].map(cloneBinding));
    else this.applyDefaults();
    this.persist();
  }

  serialize(): string {
    const bindings: Partial<Record<InputAction, InputBinding[]>> = {};
    for (const action of INPUT_ACTIONS) bindings[action] = [...(this.values.get(action) ?? [])].map(cloneBinding);
    return JSON.stringify({ schema: INPUT_BINDING_SCHEMA, version: INPUT_BINDING_VERSION, bindings });
  }

  deserialize(serialized: string): boolean {
    const document = parseInputBindings(serialized);
    if (!document) return false;
    this.applyDefaults();
    for (const [action, bindings] of Object.entries(document.bindings)) {
      this.values.set(action as InputAction, bindings.map(cloneBinding));
    }
    this.persist();
    return true;
  }

  private applyDefaults(): void {
    this.values.clear();
    for (const action of INPUT_ACTIONS) this.values.set(action, DEFAULTS[action].map(cloneBinding));
  }

  private restore(): void {
    if (!this.storage) return;
    try {
      const serialized = this.storage.getItem(this.storageKey);
      if (serialized) this.deserialize(serialized);
    } catch {
      // Storage can be denied in privacy modes; defaults remain usable.
    }
  }

  private persist(): void {
    if (!this.storage) return;
    try { this.storage.setItem(this.storageKey, this.serialize()); } catch { /* Keep bindings in memory. */ }
  }
}
