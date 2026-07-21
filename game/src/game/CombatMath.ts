export interface CombatVector3 {
  x: number;
  y: number;
  z: number;
}

export interface ShotSpread {
  yaw: number;
  pitch: number;
}

export interface VerticalAimCylinder {
  base: CombatVector3;
  radius: number;
  height: number;
}

const EPSILON = 1e-8;
export const VERTICAL_AUTO_AIM_RADIANS = Math.PI / 30;
export const AIM_VIEWPORT_Y_RATIO = .42;
export const PORTRAIT_TOUCH_AIM_VIEWPORT_Y_RATIO = .4;

export function aimProjectionOffsetY(viewportHeight: number, portraitTouch: boolean): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0;
  const ratio = portraitTouch ? PORTRAIT_TOUCH_AIM_VIEWPORT_Y_RATIO : AIM_VIEWPORT_Y_RATIO;
  return viewportHeight * (.5 - ratio);
}

export function sampleShotSpread(spread: number, random: () => number): ShotSpread {
  return {
    yaw: (random() - .5) * spread,
    pitch: (random() - .5) * spread,
  };
}

export function directionFromView(yaw: number, pitch: number, yawOffset = 0, pitchOffset = 0): CombatVector3 {
  const resolvedPitch = Math.max(-Math.PI / 2 + .001, Math.min(Math.PI / 2 - .001, pitch + pitchOffset));
  const cosPitch = Math.cos(resolvedPitch);
  return {
    x: -Math.sin(yaw + yawOffset) * cosPitch,
    y: -Math.sin(resolvedPitch),
    z: -Math.cos(yaw + yawOffset) * cosPitch,
  };
}

export function verticalAutoAimCylinder(
  base: CombatVector3,
  radius: number,
  height: number,
  horizontalDistance: number,
  tolerance: number,
): VerticalAimCylinder {
  const distance = Number.isFinite(horizontalDistance) ? Math.max(0, horizontalDistance) : 0;
  const angle = Number.isFinite(tolerance)
    ? Math.max(0, Math.min(Math.PI / 2 - .001, tolerance))
    : 0;
  const verticalPadding = Math.tan(angle) * distance;
  return {
    base: { x: base.x, y: base.y - verticalPadding, z: base.z },
    radius,
    height: height + verticalPadding * 2,
  };
}

export function verticalAutoAimDirection(
  origin: CombatVector3,
  direction: CombatVector3,
  target: CombatVector3,
): CombatVector3 {
  const horizontalDirection = Math.hypot(direction.x, direction.z);
  const horizontalDistance = Math.hypot(target.x - origin.x, target.z - origin.z);
  if (horizontalDirection <= EPSILON || horizontalDistance <= EPSILON) return { ...direction };
  const x = direction.x / horizontalDirection * horizontalDistance;
  const y = target.y - origin.y;
  const z = direction.z / horizontalDirection * horizontalDistance;
  const magnitude = Math.hypot(x, y, z);
  return magnitude <= EPSILON ? { ...direction } : { x: x / magnitude, y: y / magnitude, z: z / magnitude };
}

export function rayVerticalCylinderDistance(
  origin: CombatVector3,
  direction: CombatVector3,
  base: CombatVector3,
  radius: number,
  height: number,
  maxDistance: number,
): number | undefined {
  const offsetX = origin.x - base.x;
  const offsetZ = origin.z - base.z;
  const horizontalA = direction.x * direction.x + direction.z * direction.z;
  let horizontalEnter = Number.NEGATIVE_INFINITY;
  let horizontalExit = Number.POSITIVE_INFINITY;

  if (horizontalA <= EPSILON) {
    if (offsetX * offsetX + offsetZ * offsetZ > radius * radius) return undefined;
  } else {
    const horizontalB = 2 * (offsetX * direction.x + offsetZ * direction.z);
    const horizontalC = offsetX * offsetX + offsetZ * offsetZ - radius * radius;
    const discriminant = horizontalB * horizontalB - 4 * horizontalA * horizontalC;
    if (discriminant < 0) return undefined;
    const root = Math.sqrt(discriminant);
    horizontalEnter = (-horizontalB - root) / (2 * horizontalA);
    horizontalExit = (-horizontalB + root) / (2 * horizontalA);
  }

  const bottom = base.y;
  const top = base.y + height;
  let verticalEnter = Number.NEGATIVE_INFINITY;
  let verticalExit = Number.POSITIVE_INFINITY;
  if (Math.abs(direction.y) <= EPSILON) {
    if (origin.y < bottom || origin.y > top) return undefined;
  } else {
    const first = (bottom - origin.y) / direction.y;
    const second = (top - origin.y) / direction.y;
    verticalEnter = Math.min(first, second);
    verticalExit = Math.max(first, second);
  }

  const enter = Math.max(0, horizontalEnter, verticalEnter);
  const exit = Math.min(maxDistance, horizontalExit, verticalExit);
  return enter <= exit ? enter : undefined;
}
