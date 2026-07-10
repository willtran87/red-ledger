# Runtime Asset Catalog

The deterministic runtime catalog is generated at:

`assets/data/runtime-assets.json`

The game should fetch it from `/data/runtime-assets.json`. Every asset reference uses a browser URL under
`/public_runtime/`, matching the Vite `publicDir: '../assets'` mount, and also retains its repository-relative
`sourcePath` for diagnostics.

## Regenerate and verify

```powershell
node implementation/generate-runtime-catalog.mjs
node implementation/generate-runtime-catalog.mjs --check
```

`--check` rebuilds the catalog in memory, validates all referenced files and structured category coverage, and
fails when the checked-in JSON is stale. The generator deliberately omits timestamps, making identical inputs
byte-identical.

## Schema

```ts
type AssetRef = {
  key: string;
  url: `/public_runtime/${string}`;
  sourcePath: `assets/public_runtime/${string}`;
  size?: [number, number];
  pivot?: [number, number];
  frame?: number;
  angle?: string | null;
};

type Actor = {
  id: string;
  canvas: [number, number] | null;
  pivot: [number, number] | null;
  palette: string | null;
  authoredAngles: string[];
  runtimeMirrors: Record<string, string>;
  frameCount: number;
  states: Record<string, { angles: Record<string, AssetRef[]> }>;
  representative: Partial<Record<'idle' | 'walk' | 'attack' | 'pain' | 'death' | 'corpse', AssetRef & {
    sourceState: string;
  }>>;
};

type RuntimeAssetCatalog = {
  schemaVersion: 1;
  generator: string;
  sourceRoot: 'assets/public_runtime';
  assetBaseUrl: '/public_runtime';
  counts: Record<string, unknown>;
  enemies: Record<string, Actor>;
  bosses: Record<string, Actor>;
  weapons: Record<string, {
    view: Record<string, AssetRef[]>;
    pickup: Record<string, AssetRef[]>;
  }>;
  pickups: Record<string, { base: AssetRef; shine: AssetRef[] }>;
  props: Record<string, { states: Record<string, AssetRef>; [key: string]: unknown }>;
  textures: Record<'decals' | 'doors' | 'flats' | 'walls', Record<string, Record<string, AssetRef>>>;
  mechanisms: {
    doors: Record<string, { size: [number, number] | null; states: Record<string, AssetRef> }>;
    switches: Record<string, { size: [number, number] | null; states: Record<string, AssetRef> }>;
  };
  effects: Record<string, { frameCount: number; frames: AssetRef[] }>;
  skies: Record<string, AssetRef>;
  ui: Record<string, Record<string, AssetRef>>;
  fonts: Record<string, { image: AssetRef | null; data: AssetRef | null }>;
  files: Array<AssetRef & { type: string; bytes: number }>;
};
```

Boss representative roles normalize specialized source states. For example, `salvo` can fill the canonical
`attack` role and `destroy` can fill `death`; the reference records the original state in `sourceState`.
