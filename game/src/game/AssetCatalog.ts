import {
  ClampToEdgeWrapping,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';

interface CatalogFile { url: string }
interface ActorState { angles?: Record<string, CatalogFile[]> }
interface ActorEntry { states: Record<string, ActorState> }

export function runtimeUrl(path: string): string {
  if (/^(?:data:|blob:|https?:)/.test(path)) return path;
  const clean = path.replace(/^\.\//, '').replace(/^\//, '');
  return `${import.meta.env.BASE_URL}${clean}`;
}

export interface RuntimeCatalog {
  enemies: Record<string, ActorEntry>;
  bosses: Record<string, ActorEntry>;
  weapons: Record<string, { view: Record<string, CatalogFile[]>; pickup: Record<string, CatalogFile[]> }>;
  pickups: Record<string, { base: CatalogFile; shine: CatalogFile[] }>;
  props: Record<string, { states: Record<string, CatalogFile> }>;
  skies: Record<string, CatalogFile>;
}

export class AssetCatalog {
  readonly loader = new TextureLoader();
  readonly textures = new Map<string, Texture>();

  constructor(readonly data: RuntimeCatalog) {}

  static async load(): Promise<AssetCatalog> {
    const response = await fetch(runtimeUrl('data/runtime-assets.json'));
    if (!response.ok) throw new Error(`Asset catalog failed: ${response.status}`);
    return new AssetCatalog(await response.json() as RuntimeCatalog);
  }

  texture(url: string, repeat = false): Texture {
    const key = `${url}|${repeat}`;
    const cached = this.textures.get(key);
    if (cached) return cached;
    const texture = this.loader.load(runtimeUrl(url));
    texture.colorSpace = SRGBColorSpace;
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = repeat ? RepeatWrapping : ClampToEdgeWrapping;
    texture.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
    this.textures.set(key, texture);
    return texture;
  }

  disposeTextures(): void {
    this.textures.forEach((texture) => texture.dispose());
    this.textures.clear();
  }

  actorFrame(kind: 'enemy' | 'boss', id: string, desired: string, angle = 'F', frameIndex = 0): string {
    const frames = this.actorFrames(kind, id, desired, angle);
    return frames[Math.abs(frameIndex) % frames.length].url;
  }

  actorFrameCount(kind: 'enemy' | 'boss', id: string, desired: string, angle = 'F'): number {
    return this.actorFrames(kind, id, desired, angle).length;
  }

  private actorFrames(kind: 'enemy' | 'boss', id: string, desired: string, angle: string): CatalogFile[] {
    const actor = (kind === 'enemy' ? this.data.enemies : this.data.bosses)[id];
    if (!actor) throw new Error(`Unknown actor art: ${kind}.${id}`);
    const genericFallbacks = desired === 'death'
      ? ['death', 'collapse', 'destroy', 'debris', 'corpse', 'sealed']
      : desired === 'pain'
        ? ['pain', 'split-flinch', 'idle', 'walk', 'sealed']
      : desired === 'attack'
        ? ['attack', 'aim', 'cast', 'fire', 'idle', 'sealed']
        : desired === 'corpse'
          ? ['corpse', 'debris', 'sealed']
          : ['idle', 'walk', 'sealed', 'ready', 'calculating'];
    const fallbacks = [...new Set([desired, ...genericFallbacks])];
    for (const state of fallbacks) {
      const angles = actor.states[state]?.angles;
      if (!angles) continue;
      const mirrorFallback: Record<string, string[]> = {
        F: ['F', 'FL', 'FR'], FL: ['FL', 'L', 'F'], L: ['L', 'FL', 'BL'], BL: ['BL', 'L', 'B'],
        B: ['B', 'BL', 'BR'], BR: ['BR', 'R', 'B'], R: ['R', 'FR', 'BR', 'L'], FR: ['FR', 'F', 'R', 'FL'],
      };
      const selected = mirrorFallback[angle]?.find((candidate) => angles[candidate]?.length);
      const frames = (selected ? angles[selected] : undefined) ?? angles.F ?? Object.values(angles)[0];
      if (frames?.length) return frames;
    }
    const firstState = Object.values(actor.states)[0];
    const firstFrames = firstState?.angles ? Object.values(firstState.angles)[0] : undefined;
    if (!firstFrames?.[0]) throw new Error(`Actor has no frames: ${kind}.${id}`);
    return firstFrames;
  }

  pickup(id: string): string {
    return this.data.pickups[id]?.base.url ?? this.data.pickups['goodwill-token'].base.url;
  }

  weaponPickup(id: string): string {
    return this.data.weapons[id]?.pickup.pickup?.[0]?.url ?? this.pickup('staples-small');
  }

  prop(id: string, state = 'base'): string {
    const prop = this.data.props[id];
    return prop?.states[state]?.url ?? Object.values(prop?.states ?? {})[0]?.url ?? this.pickup('goodwill-token');
  }
}
