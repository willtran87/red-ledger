import { afterEach, describe, expect, it, vi } from 'vitest';
import { Texture } from 'three';
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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AssetCatalog loading resilience', () => {
  it('aborts a catalog request that exceeds its deadline', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      signal = init?.signal ?? undefined;
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));

    const pending = AssetCatalog.load(25);
    const rejected = expect(pending).rejects.toThrow('Asset catalog request timed out after 1 seconds.');
    await vi.advanceTimersByTimeAsync(25);

    await rejected;
    expect(signal?.aborted).toBe(true);
  });

  it('waits for textures already requested by the current map', async () => {
    vi.useFakeTimers();
    const assets = new AssetCatalog(catalog);
    vi.spyOn(assets.loader, 'load').mockImplementation((_url, onLoad) => {
      const texture = new Texture<HTMLImageElement>();
      setTimeout(() => onLoad?.(texture), 40);
      return texture;
    });

    assets.texture('delayed-texture');
    const readiness = assets.waitForTextures(200);
    expect(assets.status().pendingCount).toBe(1);
    await vi.advanceTimersByTimeAsync(39);
    expect(assets.status().pendingCount).toBe(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(readiness).resolves.toEqual({ mode: 'complete', failedUrls: [], pendingCount: 0 });
  });

  it('degrades stalled textures at the deadline instead of deadlocking entry', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ fillStyle: '', fillRect: vi.fn() }),
      }),
    });
    const assets = new AssetCatalog(catalog);
    vi.spyOn(assets.loader, 'load').mockImplementation(() => new Texture<HTMLImageElement>());

    const texture = assets.texture('stalled-texture');
    const readiness = assets.waitForTextures(25);
    await vi.advanceTimersByTimeAsync(25);

    await expect(readiness).resolves.toEqual({
      mode: 'placeholder-fallback',
      failedUrls: ['stalled-texture'],
      pendingCount: 0,
    });
    expect(texture.image).toBeDefined();
  });
});

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
