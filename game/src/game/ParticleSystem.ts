import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DataTexture,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NearestFilter,
  NormalBlending,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
} from 'three';

export type ParticleKind =
  | 'ink' | 'paper' | 'spark' | 'ember' | 'energy' | 'smoke' | 'debris' | 'approval'
  | 'fiber' | 'concrete' | 'glass' | 'water' | 'metal' | 'toner' | 'wax' | 'spittle'
  | 'deflection' | 'neutralize' | 'authority' | 'scan' | 'momentum' | 'rejection' | 'confetti';

export type ParticlePriority = 'ambient' | 'standard' | 'critical';

export interface ParticleEmitOptions {
  readonly priority?: ParticlePriority;
}

interface ParticlePreset {
  color: number;
  life: readonly [number, number];
  speed: readonly [number, number];
  size: readonly [number, number];
  gravity: number;
  drag: number;
  additive?: boolean;
  endScale?: number;
}

interface ParticleTextureBinding {
  readonly atlasIndex: number;
}

interface ParticleSlot {
  readonly position: Vector3;
  readonly velocity: Vector3;
  kind: ParticleKind;
  priority: ParticlePriority;
  serial: number;
  life: number;
  maxLife: number;
  startSize: number;
  endSize: number;
  size: number;
  gravity: number;
  drag: number;
  spin: number;
  rotation: number;
  opacity: number;
  color: number;
  atlasIndex: number;
  additive: boolean;
  active: boolean;
}

interface ParticleBatch {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly position: InstancedBufferAttribute;
  readonly size: InstancedBufferAttribute;
  readonly rotation: InstancedBufferAttribute;
  readonly opacity: InstancedBufferAttribute;
  readonly uvRect: InstancedBufferAttribute;
  readonly color: InstancedBufferAttribute;
}

interface AtlasEntry {
  readonly texture: Texture;
  readonly index: number;
  uploadedSource?: unknown;
  uploadedVersion?: number;
}

interface ParticleAtlas {
  readonly texture: CanvasTexture | DataTexture;
  readonly context?: CanvasRenderingContext2D;
  readonly data?: Uint8Array;
}

const PRESETS: Record<ParticleKind, ParticlePreset> = {
  ink: { color: 0xa70d18, life: [.22, .46], speed: [1.4, 4.6], size: [.13, .3], gravity: 7.5, drag: 1.2 },
  paper: { color: 0xe9e4d7, life: [.45, .9], speed: [.7, 2.8], size: [.16, .32], gravity: 2.5, drag: 1.8 },
  spark: { color: 0xffc928, life: [.12, .28], speed: [3.8, 8.2], size: [.09, .2], gravity: 11, drag: .6, additive: true },
  ember: { color: 0xe94818, life: [.28, .62], speed: [.8, 3.4], size: [.12, .28], gravity: -1.2, drag: 1.1, additive: true },
  energy: { color: 0x53d7df, life: [.2, .5], speed: [1.3, 5.2], size: [.14, .34], gravity: 0, drag: 2.1, additive: true },
  smoke: { color: 0x6a6965, life: [.5, 1.05], speed: [.35, 1.5], size: [.22, .48], gravity: -1, drag: 2.4 },
  debris: { color: 0x4b4a45, life: [.4, .85], speed: [1.5, 4.7], size: [.12, .28], gravity: 9, drag: .9 },
  approval: { color: 0xd51c2f, life: [.38, .78], speed: [.8, 2.7], size: [.14, .3], gravity: -.4, drag: 1.4, additive: true },
  fiber: { color: 0x696966, life: [.42, .9], speed: [.35, 1.5], size: [.18, .38], gravity: -0.2, drag: 2.6, endScale: 1.55 },
  concrete: { color: 0x7f807c, life: [.32, .72], speed: [1.1, 3.8], size: [.12, .27], gravity: 8.5, drag: 1.2 },
  glass: { color: 0xa9f3f2, life: [.3, .7], speed: [2.2, 5.6], size: [.12, .25], gravity: 7.2, drag: .8 },
  water: { color: 0x42cdd7, life: [.22, .55], speed: [1.7, 4.8], size: [.15, .34], gravity: 8, drag: 1.1 },
  metal: { color: 0xd9ad3d, life: [.28, .68], speed: [2, 5.8], size: [.1, .24], gravity: 9.5, drag: .65, additive: true },
  toner: { color: 0x151719, life: [.28, .62], speed: [1.1, 3.8], size: [.14, .32], gravity: 6.5, drag: 1.6 },
  wax: { color: 0xbd1524, life: [.34, .76], speed: [1.2, 4.2], size: [.14, .3], gravity: 7.8, drag: 1.15 },
  spittle: { color: 0x8aa652, life: [.25, .58], speed: [1.4, 4.1], size: [.14, .3], gravity: 7, drag: 1.3 },
  deflection: { color: 0xf2eee2, life: [.2, .5], speed: [2.4, 6.4], size: [.14, .3], gravity: 3.5, drag: 1, additive: true },
  neutralize: { color: 0x53d7df, life: [.3, .68], speed: [1.2, 4.3], size: [.16, .36], gravity: 5.8, drag: 1.4, additive: true },
  authority: { color: 0xffc928, life: [.16, .36], speed: [3.4, 7.4], size: [.1, .24], gravity: 8.5, drag: .65, additive: true },
  scan: { color: 0x53d7df, life: [.28, .66], speed: [.5, 2.2], size: [.15, .32], gravity: -.35, drag: 2.2, additive: true },
  momentum: { color: 0xd51c2f, life: [.38, .82], speed: [1.2, 3.8], size: [.16, .34], gravity: 1.4, drag: 1.15, additive: true },
  rejection: { color: 0xffd12e, life: [.14, .32], speed: [3.6, 7.7], size: [.1, .23], gravity: 9, drag: .6, additive: true },
  confetti: { color: 0xd51c2f, life: [.7, 1.35], speed: [.6, 2.6], size: [.16, .34], gravity: 1.8, drag: 1.6 },
};

const PRIORITY_RANK: Record<ParticlePriority, number> = { ambient: 0, standard: 1, critical: 2 };
const CRITICAL_KINDS = new Set<ParticleKind>([
  'approval', 'deflection', 'neutralize', 'authority', 'scan', 'momentum', 'rejection',
]);
const ATLAS_COLUMNS = 8;
const ATLAS_ROWS = 8;
const ATLAS_CELL_SIZE = 32;
const ATLAS_GUTTER = 1;
const ATLAS_STRIDE = ATLAS_CELL_SIZE + ATLAS_GUTTER * 2;
const ATLAS_WIDTH = ATLAS_COLUMNS * ATLAS_STRIDE;
const ATLAS_HEIGHT = ATLAS_ROWS * ATLAS_STRIDE;
const ATLAS_CAPACITY = ATLAS_COLUMNS * ATLAS_ROWS;

const writeFallbackMask = (writePixel: (x: number, y: number) => void): void => {
  for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
      const maskX = Math.floor(x / 4);
      const maskY = Math.floor(y / 4);
      const dx = maskX - 3.5;
      const dy = maskY - 3.5;
      if (maskX < 1 || maskX > 6 || maskY < 1 || maskY > 6) continue;
      if (dx * dx + dy * dy > 10.5 || (maskX + maskY === 3 && maskX > 1)) continue;
      writePixel(ATLAS_GUTTER + x, ATLAS_GUTTER + y);
    }
  }
};

const configureAtlasTexture = <T extends Texture>(texture: T): T => {
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
};

const createParticleAtlas = (): ParticleAtlas => {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_WIDTH;
    canvas.height = ATLAS_HEIGHT;
    const context = canvas.getContext('2d');
    if (context) {
      context.imageSmoothingEnabled = false;
      context.fillStyle = '#ffffff';
      writeFallbackMask((x, y) => context.fillRect(x, y, 1, 1));
      return { texture: configureAtlasTexture(new CanvasTexture(canvas)), context };
    }
  }

  const data = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  writeFallbackMask((x, y) => {
    const offset = (y * ATLAS_WIDTH + x) * 4;
    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = 255;
  });
  return { texture: configureAtlasTexture(new DataTexture(data, ATLAS_WIDTH, ATLAS_HEIGHT)), data };
};

const resetParticleAtlas = (atlas: ParticleAtlas): void => {
  if (atlas.context) {
    atlas.context.clearRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
    atlas.context.fillStyle = '#ffffff';
    writeFallbackMask((x, y) => atlas.context?.fillRect(x, y, 1, 1));
  } else if (atlas.data) {
    atlas.data.fill(0);
    writeFallbackMask((x, y) => {
      if (!atlas.data) return;
      const offset = (y * ATLAS_WIDTH + x) * 4;
      atlas.data[offset] = 255;
      atlas.data[offset + 1] = 255;
      atlas.data[offset + 2] = 255;
      atlas.data[offset + 3] = 255;
    });
  }
  atlas.texture.needsUpdate = true;
};

const dynamicAttribute = (length: number, itemSize: number): InstancedBufferAttribute => {
  const attribute = new InstancedBufferAttribute(new Float32Array(length * itemSize), itemSize);
  attribute.setUsage(DynamicDrawUsage);
  return attribute;
};

const VERTEX_SHADER = `
  #include <fog_pars_vertex>
  attribute vec3 instancePosition;
  attribute float instanceSize;
  attribute float instanceRotation;
  attribute float instanceOpacity;
  attribute vec4 instanceUvRect;
  attribute vec3 instanceColor;
  varying vec2 vParticleUv;
  varying float vParticleOpacity;
  varying vec3 vParticleColor;

  void main() {
    float turnCos = cos(instanceRotation);
    float turnSin = sin(instanceRotation);
    vec2 corner = vec2(
      position.x * turnCos - position.y * turnSin,
      position.x * turnSin + position.y * turnCos
    ) * instanceSize;
    vec4 mvPosition = modelViewMatrix * vec4(instancePosition, 1.0);
    mvPosition.xy += corner;
    gl_Position = projectionMatrix * mvPosition;
    vParticleUv = instanceUvRect.xy + uv * instanceUvRect.zw;
    vParticleOpacity = instanceOpacity;
    vParticleColor = instanceColor;
    #include <fog_vertex>
  }
`;

const FRAGMENT_SHADER = `
  #include <fog_pars_fragment>
  uniform sampler2D atlasTexture;
  varying vec2 vParticleUv;
  varying float vParticleOpacity;
  varying vec3 vParticleColor;

  void main() {
    vec4 texel = texture2D(atlasTexture, vParticleUv);
    float alpha = texel.a * vParticleOpacity;
    if (alpha < 0.04) discard;
    gl_FragColor = vec4(texel.rgb * vParticleColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const createBatch = (name: string, capacity: number, atlas: Texture, additive: boolean): ParticleBatch => {
  const base = new PlaneGeometry(1, 1);
  const geometry = new InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('uv', base.getAttribute('uv'));
  const position = dynamicAttribute(capacity, 3);
  const size = dynamicAttribute(capacity, 1);
  const rotation = dynamicAttribute(capacity, 1);
  const opacity = dynamicAttribute(capacity, 1);
  const uvRect = dynamicAttribute(capacity, 4);
  const color = dynamicAttribute(capacity, 3);
  geometry.setAttribute('instancePosition', position);
  geometry.setAttribute('instanceSize', size);
  geometry.setAttribute('instanceRotation', rotation);
  geometry.setAttribute('instanceOpacity', opacity);
  geometry.setAttribute('instanceUvRect', uvRect);
  geometry.setAttribute('instanceColor', color);
  geometry.instanceCount = 0;

  const material = new ShaderMaterial({
    uniforms: {
      atlasTexture: { value: atlas },
      fogColor: { value: new Color() },
      fogNear: { value: 1 },
      fogFar: { value: 2_000 },
      fogDensity: { value: .00025 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    fog: true,
    blending: additive ? AdditiveBlending : NormalBlending,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return { mesh, position, size, rotation, opacity, uvRect, color };
};

/** Fixed-capacity, fixed-step particles rendered through two atlas-backed instanced batches. */
export class ParticleSystem {
  readonly root = new Group();
  readonly capacity: number;
  readonly criticalReserve: number;
  readonly ambientLimit: number;
  private readonly atlas = createParticleAtlas();
  private readonly atlasEntries: AtlasEntry[] = [];
  private readonly atlasIndices = new Map<Texture, number>();
  private readonly kindTextures = new Map<ParticleKind, readonly ParticleTextureBinding[]>();
  private readonly slots: ParticleSlot[];
  private readonly normalBatch: ParticleBatch;
  private readonly additiveBatch: ParticleBatch;
  private readonly initialState: number;
  private serial = 0;
  private state: number;
  private liveSlots = 0;

  constructor(scene: Scene, capacity = 192, seed = 0x72534c44) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.criticalReserve = Math.floor(this.capacity * .125);
    this.ambientLimit = Math.max(1, Math.floor(this.capacity * .25));
    this.initialState = seed >>> 0;
    this.state = this.initialState;
    this.root.name = 'particle-effects';
    this.normalBatch = createBatch('particle-effects-normal', this.capacity, this.atlas.texture, false);
    this.additiveBatch = createBatch('particle-effects-additive', this.capacity, this.atlas.texture, true);
    this.root.add(this.normalBatch.mesh, this.additiveBatch.mesh);
    scene.add(this.root);
    this.slots = Array.from({ length: this.capacity }, () => ({
      position: new Vector3(),
      velocity: new Vector3(),
      kind: 'ink' as const,
      priority: 'standard' as const,
      serial: 0,
      life: 0,
      maxLife: 0,
      startSize: 0,
      endSize: 0,
      size: 0,
      gravity: 0,
      drag: 0,
      spin: 0,
      rotation: 0,
      opacity: 0,
      color: 0xffffff,
      atlasIndex: 0,
      additive: false,
      active: false,
    }));
  }

  emit(
    kind: ParticleKind,
    position: Readonly<Vector3>,
    count = 6,
    direction?: Readonly<Vector3>,
    options: ParticleEmitOptions = {},
  ): void {
    const preset = PRESETS[kind];
    const priority = options.priority ?? (CRITICAL_KINDS.has(kind) ? 'critical' : 'standard');
    const amount = Math.max(0, Math.floor(count));
    for (let index = 0; index < amount; index += 1) {
      const slot = this.acquire(priority);
      if (!slot) continue;
      const textures = this.kindTextures.get(kind);
      const binding = textures?.[Math.floor(this.random() * textures.length)];
      const life = this.range(preset.life);
      const speed = this.range(preset.speed);
      const wasActive = slot.active;
      slot.velocity.set(this.signed(), .25 + this.random() * .9, this.signed()).normalize();
      if (direction) slot.velocity.addScaledVector(direction, 1.2).normalize();
      slot.kind = kind;
      slot.priority = priority;
      slot.serial = ++this.serial;
      slot.life = life;
      slot.maxLife = life;
      slot.startSize = this.range(preset.size);
      slot.endSize = slot.startSize * (preset.endScale ?? (kind === 'smoke' ? 2.2 : .35));
      slot.size = slot.startSize;
      slot.gravity = preset.gravity;
      slot.drag = preset.drag;
      slot.spin = this.signed() * 7;
      slot.opacity = 1;
      slot.color = binding && binding.atlasIndex > 0 ? 0xffffff : preset.color;
      slot.atlasIndex = binding?.atlasIndex ?? 0;
      slot.additive = Boolean(preset.additive);
      slot.active = true;
      if (!wasActive) this.liveSlots += 1;
      slot.velocity.multiplyScalar(speed);
      slot.position.copy(position);
      slot.position.x += this.signed() * .06;
      slot.position.y += this.random() * .08;
      slot.position.z += this.signed() * .06;
      slot.rotation = this.random() * Math.PI * 2;
    }
    this.refreshAtlasEntries();
    this.syncRenderBatches();
  }

  update(dt: number): void {
    if (!(dt > 0) || this.liveSlots === 0) return;
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        this.deactivate(slot);
        continue;
      }
      const damping = Math.exp(-slot.drag * dt);
      slot.velocity.multiplyScalar(damping);
      slot.velocity.y -= slot.gravity * dt;
      slot.position.addScaledVector(slot.velocity, dt);
      const progress = 1 - slot.life / slot.maxLife;
      slot.size = Math.max(.001, slot.startSize + (slot.endSize - slot.startSize) * progress);
      slot.rotation += slot.spin * dt;
      slot.opacity = Math.min(1, slot.life / Math.min(.16, slot.maxLife));
    }
    this.refreshAtlasEntries();
    this.syncRenderBatches();
  }

  setTexture(kind: ParticleKind, texture?: Texture): void {
    if (texture) this.kindTextures.set(kind, [this.bindTexture(texture)]);
    else this.kindTextures.delete(kind);
    this.refreshAtlasEntries();
  }

  setTextures(kind: ParticleKind, textures: readonly Texture[]): void {
    if (textures.length) this.kindTextures.set(kind, textures.map((texture) => this.bindTexture(texture)));
    else this.kindTextures.delete(kind);
    this.refreshAtlasEntries();
  }

  clearTextureBindings(): void {
    this.kindTextures.clear();
    this.atlasIndices.clear();
    this.atlasEntries.length = 0;
    resetParticleAtlas(this.atlas);
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.atlasIndex = 0;
      slot.color = PRESETS[slot.kind].color;
    }
    this.syncRenderBatches();
  }

  clear(): void {
    this.slots.forEach((slot) => this.deactivate(slot));
    this.serial = 0;
    this.state = this.initialState;
    this.syncRenderBatches();
  }

  get activeCount(): number { return this.liveSlots; }

  counts(): Record<ParticleKind, number> {
    const result: Record<ParticleKind, number> = {
      ink: 0, paper: 0, spark: 0, ember: 0, energy: 0, smoke: 0, debris: 0, approval: 0,
      fiber: 0, concrete: 0, glass: 0, water: 0, metal: 0, toner: 0, wax: 0, spittle: 0,
      deflection: 0, neutralize: 0, authority: 0, scan: 0, momentum: 0, rejection: 0, confetti: 0,
    };
    this.slots.forEach((slot) => { if (slot.active) result[slot.kind] += 1; });
    return result;
  }

  dispose(): void {
    this.normalBatch.mesh.geometry.dispose();
    this.normalBatch.mesh.material.dispose();
    this.additiveBatch.mesh.geometry.dispose();
    this.additiveBatch.mesh.material.dispose();
    this.atlas.texture.dispose();
    this.root.removeFromParent();
  }

  private acquire(priority: ParticlePriority): ParticleSlot | undefined {
    const activeAmbient = this.slots.reduce((count, slot) => count + Number(slot.active && slot.priority === 'ambient'), 0);
    const activeNonCritical = this.slots.reduce((count, slot) => count + Number(slot.active && slot.priority !== 'critical'), 0);
    const nonCriticalLimit = this.capacity - this.criticalReserve;
    const mayUseInactive = priority === 'critical'
      || (activeNonCritical < nonCriticalLimit && (priority !== 'ambient' || activeAmbient < this.ambientLimit));
    if (mayUseInactive) {
      const inactive = this.slots.find((slot) => !slot.active);
      if (inactive) return inactive;
    }

    const incomingRank = PRIORITY_RANK[priority];
    let selected: ParticleSlot | undefined;
    for (const slot of this.slots) {
      if (!slot.active || PRIORITY_RANK[slot.priority] > incomingRank) continue;
      if (priority === 'ambient' && slot.priority !== 'ambient') continue;
      if (!selected
        || PRIORITY_RANK[slot.priority] < PRIORITY_RANK[selected.priority]
        || (slot.priority === selected.priority && slot.serial < selected.serial)) selected = slot;
    }
    return selected;
  }

  private deactivate(slot: ParticleSlot): void {
    if (!slot.active) return;
    slot.active = false;
    this.liveSlots -= 1;
    slot.life = 0;
    slot.opacity = 0;
  }

  private bindTexture(texture: Texture): ParticleTextureBinding {
    const existing = this.atlasIndices.get(texture);
    if (existing !== undefined) return { atlasIndex: existing };
    if (this.atlasEntries.length >= ATLAS_CAPACITY - 1) return { atlasIndex: 0 };
    const index = this.atlasEntries.length + 1;
    this.atlasIndices.set(texture, index);
    this.atlasEntries.push({ texture, index });
    return { atlasIndex: index };
  }

  private refreshAtlasEntries(): void {
    for (const entry of this.atlasEntries) {
      const source = entry.texture.image as unknown;
      if (!source || (entry.uploadedSource === source && entry.uploadedVersion === entry.texture.version)) continue;
      if (this.copyTextureToAtlas(source, entry.index)) {
        entry.uploadedSource = source;
        entry.uploadedVersion = entry.texture.version;
      }
    }
  }

  private copyTextureToAtlas(source: unknown, index: number): boolean {
    const column = index % ATLAS_COLUMNS;
    const row = Math.floor(index / ATLAS_COLUMNS);
    const targetX = column * ATLAS_STRIDE + ATLAS_GUTTER;
    const targetY = row * ATLAS_STRIDE + ATLAS_GUTTER;
    const image = source as {
      readonly complete?: boolean;
      readonly naturalWidth?: number;
      readonly naturalHeight?: number;
      readonly videoWidth?: number;
      readonly videoHeight?: number;
      readonly width?: number;
      readonly height?: number;
      readonly data?: ArrayLike<number>;
    };
    if (image.complete === false) return false;
    const width = image.naturalWidth ?? image.videoWidth ?? image.width ?? 0;
    const height = image.naturalHeight ?? image.videoHeight ?? image.height ?? 0;
    if (!(width > 0 && height > 0)) return false;

    if (this.atlas.context) {
      try {
        this.atlas.context.clearRect(
          column * ATLAS_STRIDE,
          row * ATLAS_STRIDE,
          ATLAS_STRIDE,
          ATLAS_STRIDE,
        );
        this.atlas.context.drawImage(
          source as CanvasImageSource,
          targetX,
          targetY,
          ATLAS_CELL_SIZE,
          ATLAS_CELL_SIZE,
        );
        this.atlas.texture.needsUpdate = true;
        return true;
      } catch {
        return false;
      }
    }

    if (!this.atlas.data || !image.data || image.data.length < width * height * 4) return false;
    for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
      const sourceY = Math.min(height - 1, Math.floor(y * height / ATLAS_CELL_SIZE));
      for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
        const sourceX = Math.min(width - 1, Math.floor(x * width / ATLAS_CELL_SIZE));
        const sourceOffset = (sourceY * width + sourceX) * 4;
        const targetOffset = ((targetY + y) * ATLAS_WIDTH + targetX + x) * 4;
        this.atlas.data[targetOffset] = image.data[sourceOffset] ?? 0;
        this.atlas.data[targetOffset + 1] = image.data[sourceOffset + 1] ?? 0;
        this.atlas.data[targetOffset + 2] = image.data[sourceOffset + 2] ?? 0;
        this.atlas.data[targetOffset + 3] = image.data[sourceOffset + 3] ?? 0;
      }
    }
    this.atlas.texture.needsUpdate = true;
    return true;
  }

  private syncRenderBatches(): void {
    let normalIndex = 0;
    let additiveIndex = 0;
    for (const slot of this.slots) {
      if (!slot.active) continue;
      const batch = slot.additive ? this.additiveBatch : this.normalBatch;
      const index = slot.additive ? additiveIndex++ : normalIndex++;
      this.writeBatchSlot(batch, index, slot);
    }
    this.finishBatch(this.normalBatch, normalIndex);
    this.finishBatch(this.additiveBatch, additiveIndex);
  }

  private writeBatchSlot(batch: ParticleBatch, index: number, slot: ParticleSlot): void {
    batch.position.setXYZ(index, slot.position.x, slot.position.y, slot.position.z);
    batch.size.setX(index, slot.size);
    batch.rotation.setX(index, slot.rotation);
    batch.opacity.setX(index, slot.opacity);
    const column = slot.atlasIndex % ATLAS_COLUMNS;
    const row = Math.floor(slot.atlasIndex / ATLAS_COLUMNS);
    batch.uvRect.setXYZW(
      index,
      (column * ATLAS_STRIDE + ATLAS_GUTTER) / ATLAS_WIDTH,
      1 - (row * ATLAS_STRIDE + ATLAS_GUTTER + ATLAS_CELL_SIZE) / ATLAS_HEIGHT,
      ATLAS_CELL_SIZE / ATLAS_WIDTH,
      ATLAS_CELL_SIZE / ATLAS_HEIGHT,
    );
    batch.color.setXYZ(
      index,
      ((slot.color >> 16) & 0xff) / 0xff,
      ((slot.color >> 8) & 0xff) / 0xff,
      (slot.color & 0xff) / 0xff,
    );
  }

  private finishBatch(batch: ParticleBatch, count: number): void {
    batch.mesh.geometry.instanceCount = count;
    batch.mesh.visible = count > 0;
    batch.position.needsUpdate = true;
    batch.size.needsUpdate = true;
    batch.rotation.needsUpdate = true;
    batch.opacity.needsUpdate = true;
    batch.uvRect.needsUpdate = true;
    batch.color.needsUpdate = true;
  }

  private random(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  private signed(): number { return this.random() * 2 - 1; }
  private range(range: readonly [number, number]): number { return range[0] + this.random() * (range[1] - range[0]); }
}
