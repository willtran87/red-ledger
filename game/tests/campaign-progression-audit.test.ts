import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/data/campaign';
import type { MapId } from '../src/data/types';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

describe('campaign progression and unlock assumptions', () => {
  it('forms the authored normal and secret progression graph', () => {
    const expectedSecrets: Readonly<Record<string, readonly [MapId, MapId]>> = {
      E1M3: ['E1M9', 'E1M4'],
      E2M5: ['E2M9', 'E2M6'],
      E3M6: ['E3M9', 'E3M7'],
    };

    for (let episode = 1; episode <= 3; episode += 1) {
      for (let map = 1; map <= 7; map += 1) {
        expect(CAMPAIGN.maps[`E${episode}M${map}` as MapId].nextMap).toBe(`E${episode}M${map + 1}`);
      }
    }
    expect(CAMPAIGN.maps.E1M8.nextMap).toBe('E2M1');
    expect(CAMPAIGN.maps.E2M8.nextMap).toBe('E3M1');
    expect(CAMPAIGN.maps.E3M8.nextMap).toBeUndefined();

    for (const [origin, [secret, returnsTo]] of Object.entries(expectedSecrets)) {
      expect(CAMPAIGN.maps[origin as MapId].secretExitTo).toBe(secret);
      expect(CAMPAIGN.maps[secret].secretMap).toBe(true);
      expect(CAMPAIGN.maps[secret].nextMap).toBe(returnsTo);
    }
  });

  it('makes all 27 maps reachable from a new campaign through declared exits', () => {
    const pending: MapId[] = ['E1M1'];
    const reached = new Set<MapId>();
    while (pending.length > 0) {
      const id = pending.shift()!;
      if (reached.has(id)) continue;
      reached.add(id);
      const map = CAMPAIGN.maps[id];
      if (map.nextMap) pending.push(map.nextMap);
      if (map.secretExitTo) pending.push(map.secretExitTo);
    }
    expect(reached).toEqual(new Set(Object.keys(CAMPAIGN.maps) as MapId[]));
  });

  it('has completion triggers whose normal targets agree with nextMap', () => {
    for (const map of Object.values(CAMPAIGN.maps)) {
      const completions = map.triggers.filter((trigger) => trigger.action === 'complete-map');
      expect(completions.length).toBe(map.secretExitTo ? 2 : 1);
      const normal = completions.find((trigger) => trigger.id.endsWith('-map-exit'));
      expect(normal).toBeDefined();
      expect(normal?.targets).toEqual(map.nextMap ? [map.nextMap] : []);
      if (map.secretExitTo) expect(completions.some((trigger) => trigger.targets.includes(map.secretExitTo!))).toBe(true);
    }
  });

  it('persists completed-map, episode-completion, and level-select unlock state', () => {
    const engine = readFileSync(`${projectRoot}/game/src/game/GameEngine.ts`, 'utf8');
    const ui = readFileSync(`${projectRoot}/game/src/game/UIController.ts`, 'utf8');
    expect(engine).toMatch(/completedMaps|mapUnlocks/);
    expect(engine).toMatch(/completedEpisodes|episodeUnlocks/);
    expect(ui).toMatch(/level.select|map.select/i);
  });
});
