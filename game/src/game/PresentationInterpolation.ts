export const presentationAlpha = (accumulator: number, step: number): number => {
  if (!Number.isFinite(accumulator) || !Number.isFinite(step) || step <= 0) return 0;
  return Math.max(0, Math.min(1, accumulator / step));
};

export const predictiveScalar = (previous: number, current: number, alpha: number): number =>
  current + (current - previous) * Math.max(0, Math.min(1, alpha));

export const shortestAngleDelta = (previous: number, current: number): number =>
  Math.atan2(Math.sin(current - previous), Math.cos(current - previous));

export const predictiveAngle = (previous: number, current: number, alpha: number): number =>
  current + shortestAngleDelta(previous, current) * Math.max(0, Math.min(1, alpha));

export const shouldSnapPresentation = (
  previous: Readonly<{ x: number; y: number; z: number }>,
  current: Readonly<{ x: number; y: number; z: number }>,
  maximumTickDistance: number,
): boolean => {
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  const dz = current.z - previous.z;
  return dx * dx + dy * dy + dz * dz > maximumTickDistance * maximumTickDistance;
};
