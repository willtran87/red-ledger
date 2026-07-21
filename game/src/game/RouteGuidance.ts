import type { Credential, MapId } from '../data';

export const ROUTE_HINT_DELAYS = Object.freeze({ clue: 24, bearing: 48 });

export type RouteHintTier = 1 | 2;
export type RouteGuidanceKind = 'combat' | 'credential' | 'access' | 'mechanism' | 'exit';

export interface RouteHint {
  readonly tier: RouteHintTier;
  readonly text: string;
}

export interface RouteGuidanceDescriptor {
  readonly kind: RouteGuidanceKind;
  readonly label: string;
  readonly mapId: MapId;
  readonly credential?: Credential;
  readonly target?: { readonly x: number; readonly z: number };
}

export interface RouteGuidanceView {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export const routeHintTier = (elapsedWithoutProgress: number): 0 | RouteHintTier => {
  if (elapsedWithoutProgress >= ROUTE_HINT_DELAYS.bearing) return 2;
  if (elapsedWithoutProgress >= ROUTE_HINT_DELAYS.clue) return 1;
  return 0;
};

const normalizedAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

export const relativeRouteDirection = (
  view: RouteGuidanceView,
  target: NonNullable<RouteGuidanceDescriptor['target']>,
): { readonly direction: string; readonly distance: number } => {
  const dx = target.x - view.x;
  const dz = target.z - view.z;
  const desiredYaw = Math.atan2(-dx, -dz);
  const delta = normalizedAngle(desiredYaw - view.yaw);
  const eighthTurn = Math.PI / 8;
  const direction = Math.abs(delta) <= eighthTurn ? 'ahead'
    : delta < -7 * eighthTurn || delta > 7 * eighthTurn ? 'behind'
      : delta < -5 * eighthTurn ? 'behind-right'
        : delta < -3 * eighthTurn ? 'right'
          : delta < -eighthTurn ? 'ahead-right'
            : delta > 5 * eighthTurn ? 'behind-left'
              : delta > 3 * eighthTurn ? 'left'
                : 'ahead-left';
  return { direction, distance: Math.max(1, Math.round(Math.hypot(dx, dz))) };
};

const firstClue = (descriptor: RouteGuidanceDescriptor): string => {
  switch (descriptor.kind) {
    case 'combat':
      return 'A required exposure remains. Follow hostile audio and check unopened rooms.';
    case 'credential':
      return descriptor.mapId === 'E1M1' && descriptor.credential === 'red'
        ? 'The red credential is visible through glass near the starting room.'
        : `Search the unlocked route for the ${descriptor.label}.`;
    case 'access':
      return `You have the ${descriptor.label}. Find its matching access door and press Use.`;
    case 'mechanism':
      return `The route opens from the ${descriptor.label} control. Look for a lit terminal and press Use.`;
    case 'exit':
      return 'The file is ready to close. Follow the EXIT marker on the automap.';
  }
};

export const buildRouteHint = (
  descriptor: RouteGuidanceDescriptor,
  tier: RouteHintTier,
  view: RouteGuidanceView,
): RouteHint => {
  if (tier === 1 || !descriptor.target) return { tier, text: firstClue(descriptor) };
  const bearing = relativeRouteDirection(view, descriptor.target);
  const location = `${bearing.direction}, about ${bearing.distance} paces away`;
  switch (descriptor.kind) {
    case 'combat':
      return { tier, text: `The nearest required exposure is ${location}.` };
    case 'credential':
      return { tier, text: `The ${descriptor.label} is ${location}. Recover it, then use it at the matching access door.` };
    case 'access':
      return { tier, text: `The matching access door is ${location}. Approach it and press Use.` };
    case 'mechanism':
      return { tier, text: `The ${descriptor.label} control is ${location}. Approach the terminal and press Use.` };
    case 'exit':
      return { tier, text: `The exit control is ${location}. Approach it and press Use to finish the level.` };
  }
};
