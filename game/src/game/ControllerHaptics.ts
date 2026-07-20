export type ControllerHapticCue = 'weapon-light' | 'weapon-heavy' | 'damage' | 'pickup' | 'failure' | 'momentum';

export interface ControllerHapticPattern {
  duration: number;
  strongMagnitude: number;
  weakMagnitude: number;
  priority: number;
}

export const CONTROLLER_HAPTIC_PATTERNS: Readonly<Record<ControllerHapticCue, ControllerHapticPattern>> = {
  'weapon-light': { duration: 38, strongMagnitude: .12, weakMagnitude: .38, priority: 1 },
  'weapon-heavy': { duration: 82, strongMagnitude: .58, weakMagnitude: .72, priority: 2 },
  damage: { duration: 115, strongMagnitude: .82, weakMagnitude: .55, priority: 4 },
  pickup: { duration: 45, strongMagnitude: .08, weakMagnitude: .32, priority: 1 },
  failure: { duration: 62, strongMagnitude: .3, weakMagnitude: .16, priority: 2 },
  momentum: { duration: 92, strongMagnitude: .34, weakMagnitude: .68, priority: 3 },
};

interface DualRumbleActuator {
  playEffect?: (type: 'dual-rumble', parameters: {
    duration: number;
    startDelay: number;
    strongMagnitude: number;
    weakMagnitude: number;
  }) => Promise<unknown>;
  reset?: () => Promise<unknown>;
}

interface PulseActuator {
  pulse?: (value: number, duration: number) => Promise<unknown>;
  reset?: () => Promise<unknown>;
}

interface HapticGamepad {
  connected: boolean;
  vibrationActuator?: DualRumbleActuator;
  hapticActuators?: readonly PulseActuator[];
}

export interface ControllerHapticsDependencies {
  gamepads?: () => readonly (Gamepad | null)[];
  now?: () => number;
}

const ignoreRejection = (result: Promise<unknown> | undefined): void => {
  result?.catch(() => undefined);
};

/** Optional controller feedback. Visual and audio cues remain authoritative. */
export class ControllerHaptics {
  private enabled = true;
  private active = false;
  private activeUntil = 0;
  private activePriority = 0;
  private readonly gamepads: () => readonly (Gamepad | null)[];
  private readonly now: () => number;

  constructor(dependencies: ControllerHapticsDependencies = {}) {
    this.gamepads = dependencies.gamepads ?? (() => {
      const getGamepads = Reflect.get(navigator, 'getGamepads') as (() => readonly (Gamepad | null)[]) | undefined;
      return typeof getGamepads === 'function' ? getGamepads.call(navigator) : [];
    });
    this.now = dependencies.now ?? (() => performance.now());
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.stop();
  }

  cue(cue: ControllerHapticCue): boolean {
    if (!this.enabled || !this.active) return false;
    const pattern = CONTROLLER_HAPTIC_PATTERNS[cue];
    const now = this.now();
    if (now < this.activeUntil && pattern.priority <= this.activePriority) return false;
    const gamepad = this.connectedGamepads()[0];
    if (!gamepad) return false;
    const hapticGamepad = gamepad as unknown as HapticGamepad;
    try {
      if (hapticGamepad.vibrationActuator?.playEffect) {
        ignoreRejection(hapticGamepad.vibrationActuator.playEffect('dual-rumble', {
          duration: pattern.duration,
          startDelay: 0,
          strongMagnitude: pattern.strongMagnitude,
          weakMagnitude: pattern.weakMagnitude,
        }));
      } else if (hapticGamepad.hapticActuators?.[0]?.pulse) {
        ignoreRejection(hapticGamepad.hapticActuators[0].pulse(
          Math.max(pattern.strongMagnitude, pattern.weakMagnitude),
          pattern.duration,
        ));
      } else return false;
    } catch {
      return false;
    }
    this.activeUntil = now + pattern.duration;
    this.activePriority = pattern.priority;
    return true;
  }

  stop(): void {
    this.activeUntil = 0;
    this.activePriority = 0;
    for (const gamepad of this.connectedGamepads()) {
      const hapticGamepad = gamepad as unknown as HapticGamepad;
      try {
        ignoreRejection(hapticGamepad.vibrationActuator?.reset?.());
        ignoreRejection(hapticGamepad.hapticActuators?.[0]?.reset?.());
      } catch {
        // Unsupported or disconnected actuators must never interrupt play.
      }
    }
  }

  private connectedGamepads(): Gamepad[] {
    try {
      return Array.from(this.gamepads()).filter((candidate): candidate is Gamepad => Boolean(candidate?.connected));
    } catch {
      return [];
    }
  }
}
