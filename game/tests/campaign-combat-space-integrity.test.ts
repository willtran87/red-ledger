import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/data/campaign';
import { statefulReachableCells } from '../src/data/validation';
import type { CampaignMap, Credential, Difficulty } from '../src/data/types';
import { actorIsEnabled, cellKey } from './audit-helpers';

const phases = ['entry', 'transformation', 'climax'] as const;
const placements: readonly Difficulty[] = ['easy', 'normal', 'hard'];
const credentialDoor: Readonly<Record<string, Credential>> = { R: 'red', Y: 'yellow', C: 'cyan' };

const reachableWithCredentials = (map: CampaignMap, credentials: ReadonlySet<Credential>): Set<string> => {
  const start = [Math.floor(map.playerStart.x), Math.floor(map.playerStart.z)] as const;
  const pending: Array<readonly [number, number]> = [start];
  const reachable = new Set<string>([`${start[0]},${start[1]}`]);
  while (pending.length > 0) {
    const [x, z] = pending.shift()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nextX = x + dx;
      const nextZ = z + dz;
      const key = `${nextX},${nextZ}`;
      const symbol = map.grid[nextZ]?.[nextX];
      const tile = symbol === undefined ? undefined : map.legend[symbol];
      if (reachable.has(key) || !tile || tile.solid || tile.secret) continue;
      const required = credentialDoor[symbol!];
      if (required && !credentials.has(required)) continue;
      reachable.add(key);
      pending.push([nextX, nextZ]);
    }
  }
  return reachable;
};

describe('campaign combat-space integrity', () => {
  it('keeps every actor placement off standard and credential door cells', () => {
    const failures: string[] = [];
    for (const map of Object.values(CAMPAIGN.maps)) {
      for (const actor of map.actors) {
        const x = Math.floor(actor.x);
        const z = Math.floor(actor.z);
        const symbol = map.grid[z]?.[x];
        if (symbol && 'DRYC'.includes(symbol)) failures.push(`${map.id}:${actor.type}@${x},${z} occupies ${symbol}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('keeps intended base-route coverage broad across every map', () => {
    const failures: string[] = [];

    for (const map of Object.values(CAMPAIGN.maps)) {
      const intendedBaseCells = new Set<string>();
      map.grid.forEach((row, z) => [...row].forEach((symbol, x) => {
        const tile = map.legend[symbol];
        if (!tile || tile.solid) return;
        if (!tile.secret) intendedBaseCells.add(`${x},${z}`);
      }));

      const baseReachable = statefulReachableCells(map);
      const reachedBaseCells = [...intendedBaseCells].filter((key) => baseReachable.has(key)).length;
      const baseCoverage = reachedBaseCells / intendedBaseCells.size;
      if (baseCoverage < .85) failures.push(`${map.id}: base-route coverage ${(baseCoverage * 100).toFixed(1)}%`);
      if (map.id === 'E1M2' && baseCoverage !== 1) failures.push(`${map.id}: repaired cubicle route coverage ${(baseCoverage * 100).toFixed(1)}%`);
    }

    expect(failures).toEqual([]);
  });

  it('caps initial hostile occupancy at two actors per grid cell', () => {
    const failures: string[] = [];
    for (const map of Object.values(CAMPAIGN.maps)) {
      const occupancy = new Map<string, number>();
      map.actors
        .filter((actor) => actor.type === 'enemy' || actor.type === 'boss')
        .forEach((actor) => occupancy.set(cellKey(actor), (occupancy.get(cellKey(actor)) ?? 0) + 1));
      for (const [key, count] of occupancy) {
        if (count > 2) failures.push(`${map.id}:${key} has ${count} hostiles`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('preserves mandatory and optional pressure in every phase at every placement tier', () => {
    const failures: string[] = [];
    const phasePatterns = new Set<string>();
    for (const map of Object.values(CAMPAIGN.maps)) {
      const mapPattern: number[] = [];
      for (const phase of phases) {
        const counts = placements.map((placement) => map.actors.filter((actor) =>
          actor.type === 'enemy' && actor.encounter === phase && actorIsEnabled(actor, placement)).length);
        const mandatory = placements.map((placement) => map.actors.filter((actor) =>
          actor.type === 'enemy' && actor.encounter === phase && actor.mandatory && actorIsEnabled(actor, placement)).length);

        if (!(counts[0] < counts[1] && counts[1] < counts[2])) {
          failures.push(`${map.id}:${phase} counts are not monotonic (${counts.join('/')})`);
        }
        if (new Set(mandatory).size !== 1) failures.push(`${map.id}:${phase} changes mandatory anchors by placement (${mandatory.join('/')})`);
        mapPattern.push(mandatory[1]);
        placements.forEach((placement, index) => {
          if (mandatory[index] < 2 || mandatory[index] > 5) failures.push(`${map.id}:${phase}:${placement} has ${mandatory[index]} mandatory anchors`);
          if (counts[index] <= mandatory[index]) failures.push(`${map.id}:${phase}:${placement} lacks optional pressure`);
        });
      }
      phasePatterns.add(mapPattern.join('/'));
    }
    expect(failures).toEqual([]);
    expect(phasePatterns.size).toBeGreaterThanOrEqual(5);
  });

  it('stages later credentials in newly unlocked territory when the door graph supports it', () => {
    const failures: string[] = [];
    for (const map of Object.values(CAMPAIGN.maps)) {
      const credentials = map.actors.filter((actor) => actor.type === 'credential');
      const acquired = new Set<Credential>();
      let previousReach = new Set<string>();
      credentials.forEach((actor, index) => {
        const currentReach = reachableWithCredentials(map, acquired);
        const actorKey = cellKey(actor);
        if (!currentReach.has(actorKey)) failures.push(`${map.id}:${actor.credential} is unreachable at stage ${index + 1}`);
        if (index > 0) {
          const newlyUnlocked = [...currentReach].filter((key) => {
            if (previousReach.has(key)) return false;
            const [x, z] = key.split(',').map(Number);
            if ('DRYC'.includes(map.grid[z]?.[x] ?? '')) return false;
            return Math.abs(x + .5 - map.playerStart.x) + Math.abs(z + .5 - map.playerStart.z) > 2;
          });
          if (newlyUnlocked.length > 0 && !newlyUnlocked.includes(actorKey)) {
            failures.push(`${map.id}:${actor.credential} ignored ${newlyUnlocked.length} newly unlocked cells`);
          }
        }
        previousReach = currentReach;
        acquired.add(actor.credential);
      });
    }
    expect(failures).toEqual([]);
  });
});
