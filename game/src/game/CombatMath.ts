export interface CombatVector3 {
  x: number;
  y: number;
  z: number;
}

export interface ShotSpread {
  yaw: number;
  pitch: number;
}

const EPSILON = 1e-8;

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
