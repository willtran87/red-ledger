import {
  AdditiveBlending,
  DataTexture,
  Group,
  NearestFilter,
  NormalBlending,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
} from 'three';

export type ParticleKind = 'ink' | 'paper' | 'spark' | 'ember' | 'energy' | 'smoke' | 'debris' | 'approval';

interface ParticlePreset {
  color: number;
  life: readonly [number, number];
  speed: readonly [number, number];
  size: readonly [number, number];
  gravity: number;
  drag: number;
  additive?: boolean;
}

interface ParticleSlot {
  readonly sprite: Sprite;
  readonly velocity: Vector3;
  kind: ParticleKind;
  life: number;
  maxLife: number;
  startSize: number;
  endSize: number;
  gravity: number;
  drag: number;
  spin: number;
  active: boolean;
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
};

const makeMask = (): DataTexture => {
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const dx = x - 3.5;
      const dy = y - 3.5;
      if (dx * dx + dy * dy > 10.5 || (x + y === 3 && x > 1)) continue;
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
};

/** Fixed-capacity, fixed-step sprite particles. Oldest particles are recycled at capacity. */
export class ParticleSystem {
  readonly root = new Group();
  readonly capacity: number;
  private readonly texture = makeMask();
  private readonly kindTextures = new Map<ParticleKind, readonly Texture[]>();
  private readonly slots: ParticleSlot[];
  private readonly initialState: number;
  private cursor = 0;
  private state: number;

  constructor(scene: Scene, capacity = 192, seed = 0x72534c44) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.initialState = seed >>> 0;
    this.state = this.initialState;
    this.root.name = 'particle-effects';
    scene.add(this.root);
    this.slots = Array.from({ length: this.capacity }, () => {
      const material = new SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, alphaTest: .04 });
      const sprite = new Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 3;
      this.root.add(sprite);
      return {
        sprite,
        velocity: new Vector3(),
        kind: 'ink' as const,
        life: 0,
        maxLife: 0,
        startSize: 0,
        endSize: 0,
        gravity: 0,
        drag: 0,
        spin: 0,
        active: false,
      };
    });
  }

  emit(kind: ParticleKind, position: Readonly<Vector3>, count = 6, direction?: Readonly<Vector3>): void {
    const preset = PRESETS[kind];
    const amount = Math.max(0, Math.floor(count));
    for (let index = 0; index < amount; index += 1) {
      const slot = this.acquire();
      const material = slot.sprite.material;
      const textures = this.kindTextures.get(kind);
      material.map = textures?.[Math.floor(this.random() * textures.length)] ?? this.texture;
      const life = this.range(preset.life);
      const speed = this.range(preset.speed);
      const spread = new Vector3(this.signed(), .25 + this.random() * .9, this.signed()).normalize();
      if (direction) spread.addScaledVector(direction, 1.2).normalize();
      slot.kind = kind;
      slot.life = life;
      slot.maxLife = life;
      slot.startSize = this.range(preset.size);
      slot.endSize = kind === 'smoke' ? slot.startSize * 2.2 : slot.startSize * .35;
      slot.gravity = preset.gravity;
      slot.drag = preset.drag;
      slot.spin = this.signed() * 7;
      slot.active = true;
      slot.velocity.copy(spread).multiplyScalar(speed);
      slot.sprite.position.copy(position).add(new Vector3(this.signed() * .06, this.random() * .08, this.signed() * .06));
      slot.sprite.scale.setScalar(slot.startSize);
      slot.sprite.visible = true;
      material.color.setHex(textures?.length ? 0xffffff : preset.color);
      material.opacity = 1;
      material.rotation = this.random() * Math.PI * 2;
      material.blending = preset.additive ? AdditiveBlending : NormalBlending;
      material.needsUpdate = true;
    }
  }

  update(dt: number): void {
    if (!(dt > 0)) return;
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
      slot.sprite.position.addScaledVector(slot.velocity, dt);
      const progress = 1 - slot.life / slot.maxLife;
      const size = slot.startSize + (slot.endSize - slot.startSize) * progress;
      slot.sprite.scale.setScalar(Math.max(.001, size));
      slot.sprite.material.rotation += slot.spin * dt;
      slot.sprite.material.opacity = Math.min(1, slot.life / Math.min(.16, slot.maxLife));
    }
  }

  setTexture(kind: ParticleKind, texture?: Texture): void {
    if (texture) this.kindTextures.set(kind, [texture]);
    else this.kindTextures.delete(kind);
  }

  setTextures(kind: ParticleKind, textures: readonly Texture[]): void {
    if (textures.length) this.kindTextures.set(kind, textures);
    else this.kindTextures.delete(kind);
  }

  clear(): void {
    this.slots.forEach((slot) => this.deactivate(slot));
    this.cursor = 0;
    this.state = this.initialState;
  }

  get activeCount(): number { return this.slots.reduce((count, slot) => count + Number(slot.active), 0); }

  counts(): Record<ParticleKind, number> {
    const result: Record<ParticleKind, number> = { ink: 0, paper: 0, spark: 0, ember: 0, energy: 0, smoke: 0, debris: 0, approval: 0 };
    this.slots.forEach((slot) => { if (slot.active) result[slot.kind] += 1; });
    return result;
  }

  dispose(): void {
    this.slots.forEach((slot) => slot.sprite.material.dispose());
    this.texture.dispose();
    this.root.removeFromParent();
  }

  private acquire(): ParticleSlot {
    const inactive = this.slots.find((slot) => !slot.active);
    if (inactive) return inactive;
    const slot = this.slots[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    return slot;
  }

  private deactivate(slot: ParticleSlot): void {
    slot.active = false;
    slot.life = 0;
    slot.sprite.visible = false;
  }

  private random(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  private signed(): number { return this.random() * 2 - 1; }
  private range(range: readonly [number, number]): number { return range[0] + this.random() * (range[1] - range[0]); }
}
