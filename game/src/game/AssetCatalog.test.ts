import { describe, expect, it } from 'vitest';
import { AssetCatalog, type RuntimeCatalog } from './AssetCatalog';

const file = (url: string) => ({ url });
const catalog: RuntimeCatalog = {
  enemies: {
    clerk: {
      states: {
        idle: { angles: { F: [file('idle-1'), file('idle-2')] } },
        charge: { angles: { F: [file('charge-1'), file('charge-2'), file('charge-3')] } },
        death: { angles: { F: [file('death-1'), file('death-2')] } },
        corpse: { angles: { F: [file('corpse')] } },
      },
    },
  },
  bosses: {},
  weapons: {},
  pickups: {},
  props: {},
  skies: {},
};

describe('AssetCatalog semantic actor states', () => {
  it('resolves an authored semantic state before generic fallbacks', () => {
    const assets = new AssetCatalog(catalog);
    expect(assets.actorFrame('enemy', 'clerk', 'charge', 'F', 0)).toBe('charge-1');
    expect(assets.actorFrame('enemy', 'clerk', 'charge', 'F', 4)).toBe('charge-2');
    expect(assets.actorFrameCount('enemy', 'clerk', 'charge')).toBe(3);
  });

  it('keeps death animation and final corpse as separate timelines', () => {
    const assets = new AssetCatalog(catalog);
    expect(assets.actorFrameCount('enemy', 'clerk', 'death')).toBe(2);
    expect(assets.actorFrame('enemy', 'clerk', 'corpse')).toBe('corpse');
    expect(assets.actorFrame('enemy', 'clerk', 'unknown')).toBe('idle-1');
  });
});
