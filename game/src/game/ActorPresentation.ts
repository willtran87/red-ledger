export const DEFEATED_ACTOR_FLOOR_OFFSET = .015;

export interface DefeatedActorScale {
  readonly width: number;
  readonly height: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;

/**
 * Keeps the authored collapse readable, then presents the corpse as a low
 * floor silhouette instead of a full-height billboard.
 */
export const defeatedActorScale = (
  standingHeight: number,
  deathProgress: number,
  settled: boolean,
): DefeatedActorScale => {
  const base = Math.max(.2, Number.isFinite(standingHeight) ? standingHeight : 1);
  const amount = settled ? 1 : clamp01(deathProgress);
  const floorHeight = Math.min(.9, Math.max(.28, base * .36));
  return {
    width: lerp(base, base * 1.22, amount),
    height: lerp(base, floorHeight, amount),
  };
};
