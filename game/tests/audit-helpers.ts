import type { ActorPlacement, CampaignMap, Credential, GridPoint } from '../src/data/types';

export const cellKey = (point: GridPoint): string =>
  `${Math.floor(point.x)},${Math.floor(point.z)}`;

const credentialDoor: Readonly<Record<string, Credential>> = {
  R: 'red',
  Y: 'yellow',
  C: 'cyan',
};

const adjacent = (x: number, z: number): readonly [number, number][] => [
  [x + 1, z],
  [x - 1, z],
  [x, z + 1],
  [x, z - 1],
];

const flood = (map: CampaignMap, credentials: ReadonlySet<Credential>): Set<string> => {
  const start = [Math.floor(map.playerStart.x), Math.floor(map.playerStart.z)] as const;
  const pending: Array<readonly [number, number]> = [start];
  const visited = new Set<string>([`${start[0]},${start[1]}`]);

  while (pending.length > 0) {
    const [x, z] = pending.shift()!;
    for (const [nextX, nextZ] of adjacent(x, z)) {
      const key = `${nextX},${nextZ}`;
      if (visited.has(key)) continue;
      const symbol = map.grid[nextZ]?.[nextX];
      const tile = symbol === undefined ? undefined : map.legend[symbol];
      if (!tile || tile.solid) continue;
      const requiredCredential = credentialDoor[symbol];
      if (requiredCredential && !credentials.has(requiredCredential)) continue;
      visited.add(key);
      pending.push([nextX, nextZ]);
    }
  }
  return visited;
};

/** Resolve the cells reachable after collecting every credential reachable so far. */
export const credentialAwareReachableCells = (map: CampaignMap): Set<string> => {
  const credentials = new Set<Credential>();
  let reachable = flood(map, credentials);
  let changed = true;

  while (changed) {
    changed = false;
    for (const actor of map.actors) {
      if (actor.type !== 'credential' || credentials.has(actor.credential)) continue;
      if (!reachable.has(cellKey(actor))) continue;
      credentials.add(actor.credential);
      changed = true;
    }
    if (changed) reachable = flood(map, credentials);
  }
  return reachable;
};

export const actorIsEnabled = (
  actor: ActorPlacement,
  placement: 'easy' | 'normal' | 'hard',
): boolean => !('difficulties' in actor)
  || actor.difficulties === undefined
  || actor.difficulties.includes(placement);

