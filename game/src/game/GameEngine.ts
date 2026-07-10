import {
  FogExp2,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { CAMPAIGN, type CampaignMap, type Credential, type MapId, type PickupId, type WeaponId } from '../data';
import { AssetCatalog } from './AssetCatalog';
import { AudioSystem } from './AudioSystem';
import { DIFFICULTY, ENEMIES, WEAPONS, type AmmoType, type GameDifficulty } from './definitions';
import {
  EnemyBehaviorSystem,
  type BehaviorEvent,
  type BehaviorVector,
  type EnemyBehaviorSnapshot,
  type HazardState,
  type ProjectileState,
} from './EnemyBehaviorSystem';
import { InputSystem } from './InputSystem';
import {
  DemoPlayback,
  DemoRecorder,
  PersistenceSystem,
  validateDemo,
  type DemoData,
  type SaveMetadataInput,
  type SaveThumbnail,
} from './PersistenceSystem';
import {
  World,
  type AmmoDropState,
  type BossMechanismState,
  type BreakableState,
  type LandmarkState,
  type RuntimeActor,
  type SectorMoverState,
} from './World';

export type GameMode = 'menu' | 'playing' | 'paused' | 'intermission' | 'dead' | 'complete';

export interface PlayerState {
  health: number;
  armor: number;
  armorClass: 'none' | 'light' | 'heavy';
  position: Vector3;
  yaw: number;
  pitch: number;
  ammo: Record<Exclude<AmmoType, 'none'>, number>;
  weapons: Set<WeaponId>;
  weapon: WeaponId;
  credentials: Set<Credential>;
  floorPlan: boolean;
  powerups: { binder: number; hazard: number; rapid: number; forensic: number; goggles: number };
}

export interface MapTally {
  kills: number;
  totalKills: number;
  items: number;
  totalItems: number;
  secrets: number;
  totalSecrets: number;
  elapsed: number;
}

export interface GameSnapshot {
  mode: GameMode;
  map: CampaignMap;
  player: PlayerState;
  tally: MapTally;
  boss?: RuntimeActor;
  message: string;
}

interface SaveData {
  version: 1;
  mode?: 'playing' | 'paused';
  mapId: MapId;
  difficulty: GameDifficulty;
  player: {
    health: number; armor: number; armorClass?: PlayerState['armorClass']; position: [number, number, number]; yaw: number; pitch?: number;
    ammo: PlayerState['ammo']; weapons: WeaponId[]; weapon: WeaponId; credentials: Credential[]; floorPlan: boolean; powerups: PlayerState['powerups'];
  };
  actors: Array<{
    uid: string; kind?: 'enemy' | 'boss'; id?: RuntimeActor['id']; health: number; dead: boolean; phaseLocked: boolean;
    position: [number, number, number]; awake?: boolean; facing?: number; animationTime?: number; attackFlash?: number; redacted?: boolean;
  }>;
  pickups: Array<{ uid: string; collected: boolean }>;
  doors: Array<string | { key: string; open: boolean; progress: number }>;
  secrets: string[];
  visited: string[];
  triggered: string[];
  mechanisms?: string[];
  hazardsEnabled: boolean;
  tally: MapTally;
  rng: number;
  enemyBehavior?: EnemyBehaviorSnapshot;
  playerProjectiles?: Array<{
    id: string; weapon: 'catastrophe-launcher' | 'plasma-copier'; position: [number, number, number]; velocity: [number, number, number];
    damage: number; radius: number; remaining: number;
  }>;
  bindingBeam?: { pulses: number; timer: number };
  sectors?: SectorMoverState[];
  landmarks?: LandmarkState[];
  breakables?: BreakableState[];
  bossMechanisms?: BossMechanismState;
  ammoDrops?: AmmoDropState[];
  runtime?: {
    weaponCooldown: number; damageCooldown: number; messageTimer: number; message: string; walkMode: boolean;
    projectileSequence: number; playerVelocity: [number, number, number];
    weaponState?: 'ready' | 'lowering' | 'raising'; weaponTransition?: number; pendingWeapon?: WeaponId;
  };
}

interface PlayerProjectile {
  id: string;
  weapon: 'catastrophe-launcher' | 'plasma-copier';
  position: Vector3;
  velocity: Vector3;
  damage: number;
  radius: number;
  remaining: number;
}

export interface GameplayCommand {
  forward: number;
  strafe: number;
  turn: number;
  look: number;
  lookVertical: number;
  fire: boolean;
  use: boolean;
  walkToggle: boolean;
  weaponSlot: number;
  weaponCycle: number;
}

const NEUTRAL_COMMAND: GameplayCommand = {
  forward: 0,
  strafe: 0,
  turn: 0,
  look: 0,
  lookVertical: 0,
  fire: false,
  use: false,
  walkToggle: false,
  weaponSlot: 0,
  weaponCycle: 0,
};

const isGameplayCommand = (value: unknown): value is GameplayCommand => {
  if (!value || typeof value !== 'object') return false;
  const command = value as Partial<GameplayCommand>;
  return ['forward', 'strafe', 'turn', 'look', 'weaponSlot', 'weaponCycle'].every((key) => Number.isFinite(command[key as keyof GameplayCommand]))
    && (command.lookVertical === undefined || Number.isFinite(command.lookVertical))
    && typeof command.fire === 'boolean'
    && typeof command.use === 'boolean'
    && typeof command.walkToggle === 'boolean';
};

const LEGACY_SAVE_KEY = 'red-ledger-save-v1';
const STEP = 1 / 35;

export interface ManualSlotSummary {
  slot: number;
  status: 'empty' | 'valid' | 'invalid';
  name: string;
  detail: string;
  thumbnail?: SaveThumbnail;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isVector3 = (value: unknown): value is [number, number, number] => Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');
const isFiniteRecord = (value: unknown, keys: readonly string[]): boolean => isRecord(value) && keys.every((key) => isFiniteNumber(value[key]));

const isEnemyBehaviorSnapshot = (value: unknown): value is EnemyBehaviorSnapshot => {
  if (!isRecord(value) || value.version !== 1 || !isFiniteNumber(value.elapsed) || !Number.isSafeInteger(value.nextEntityId)) return false;
  if (!Array.isArray(value.actors) || !Array.isArray(value.projectiles) || !Array.isArray(value.hazards)) return false;
  const vectors = (entry: unknown): boolean => isRecord(entry) && isVector3([entry.x, entry.y, entry.z]);
  const actors = value.actors.every((entry) => isRecord(entry) && typeof entry.uid === 'string' && typeof entry.hostileId === 'string'
    && entry.hostileId in ENEMIES && isFiniteRecord(entry, ['cooldown', 'attackCursor', 'phaseIndex', 'bobClock', 'revealRemaining', 'stateTimer'])
    && typeof entry.phaseId === 'string' && typeof entry.visible === 'boolean' && typeof entry.targetUid === 'string'
    && typeof entry.redacted === 'boolean' && [-1, 1].includes(Number(entry.strafeSign))
    && (entry.lungeRemaining === undefined || isFiniteNumber(entry.lungeRemaining))
    && (entry.lungeVelocity === undefined || vectors(entry.lungeVelocity)));
  const projectiles = value.projectiles.every((entry) => isRecord(entry) && typeof entry.id === 'string' && typeof entry.ownerUid === 'string'
    && typeof entry.ownerId === 'string' && entry.ownerId in ENEMIES && typeof entry.kind === 'string'
    && vectors(entry.position) && vectors(entry.velocity) && isFiniteRecord(entry, ['radius', 'damage', 'remaining', 'homing'])
    && typeof entry.targetUid === 'string');
  const hazards = value.hazards.every((entry) => isRecord(entry) && typeof entry.id === 'string' && typeof entry.ownerUid === 'string'
    && typeof entry.ownerId === 'string' && entry.ownerId in ENEMIES && typeof entry.kind === 'string' && vectors(entry.position)
    && isFiniteRecord(entry, ['radius', 'damage', 'remaining', 'armRemaining', 'pulseRemaining', 'pulseInterval']) && typeof entry.armed === 'boolean');
  const sounds = value.pendingSounds === undefined || (Array.isArray(value.pendingSounds) && value.pendingSounds.every((entry) => isRecord(entry)
    && vectors(entry.position) && isFiniteNumber(entry.radius) && typeof entry.sourceUid === 'string'));
  const damage = value.pendingDamage === undefined || (Array.isArray(value.pendingDamage) && value.pendingDamage.every((entry) => isRecord(entry)
    && typeof entry.targetUid === 'string' && typeof entry.sourceUid === 'string' && isFiniteNumber(entry.amount)));
  return actors && projectiles && hazards && sounds && damage && (value.rngState === undefined || isFiniteNumber(value.rngState));
};

const isSaveData = (value: unknown): value is SaveData => {
  if (!isRecord(value) || value.version !== 1 || typeof value.mapId !== 'string' || !CAMPAIGN.maps[value.mapId as MapId]
    || typeof value.difficulty !== 'string' || !(value.difficulty in DIFFICULTY) || !isRecord(value.player)) return false;
  const player = value.player;
  if (!isFiniteRecord(player, ['health', 'armor', 'yaw']) || !isVector3(player.position) || !isRecord(player.ammo)
    || !isFiniteRecord(player.ammo, ['staples', 'fasteners', 'canisters', 'toner-cells']) || !isStringArray(player.weapons)
    || !player.weapons.every((weapon) => weapon in WEAPONS) || typeof player.weapon !== 'string' || !(player.weapon in WEAPONS)
    || !isStringArray(player.credentials) || typeof player.floorPlan !== 'boolean' || !isFiniteRecord(player.powerups, ['binder', 'hazard', 'rapid', 'forensic', 'goggles'])
    || (player.pitch !== undefined && !isFiniteNumber(player.pitch))) return false;
  if (!Array.isArray(value.actors) || !value.actors.every((entry) => isRecord(entry) && typeof entry.uid === 'string'
    && isFiniteRecord(entry, ['health']) && typeof entry.dead === 'boolean' && typeof entry.phaseLocked === 'boolean' && isVector3(entry.position)
    && (entry.id === undefined || (typeof entry.id === 'string' && entry.id in ENEMIES)))) return false;
  if (!Array.isArray(value.pickups) || !value.pickups.every((entry) => isRecord(entry) && typeof entry.uid === 'string' && typeof entry.collected === 'boolean')) return false;
  if (!Array.isArray(value.doors) || !value.doors.every((entry) => typeof entry === 'string' || (isRecord(entry) && typeof entry.key === 'string'
    && typeof entry.open === 'boolean' && isFiniteNumber(entry.progress)))) return false;
  if (!isStringArray(value.secrets) || !isStringArray(value.visited) || !isStringArray(value.triggered)
    || (value.mechanisms !== undefined && !isStringArray(value.mechanisms)) || typeof value.hazardsEnabled !== 'boolean'
    || !isFiniteRecord(value.tally, ['kills', 'totalKills', 'items', 'totalItems', 'secrets', 'totalSecrets', 'elapsed']) || !isFiniteNumber(value.rng)) return false;
  if (value.enemyBehavior !== undefined && !isEnemyBehaviorSnapshot(value.enemyBehavior)) return false;
  if (value.playerProjectiles !== undefined && (!Array.isArray(value.playerProjectiles) || !value.playerProjectiles.every((entry) => isRecord(entry)
    && typeof entry.id === 'string' && ['catastrophe-launcher', 'plasma-copier'].includes(String(entry.weapon)) && isVector3(entry.position)
    && isVector3(entry.velocity) && isFiniteRecord(entry, ['damage', 'radius', 'remaining'])))) return false;
  if (value.ammoDrops !== undefined && (!Array.isArray(value.ammoDrops) || !value.ammoDrops.every((entry) => isRecord(entry) && typeof entry.uid === 'string'
    && isVector3(entry.position) && typeof entry.ammoId === 'string' && isFiniteNumber(entry.amount) && typeof entry.collected === 'boolean'))) return false;
  if (value.bindingBeam !== undefined && (!isRecord(value.bindingBeam) || !isFiniteRecord(value.bindingBeam, ['pulses', 'timer']))) return false;
  if (value.sectors !== undefined && (!Array.isArray(value.sectors) || !value.sectors.every((entry) => isRecord(entry) && typeof entry.key === 'string'
    && isFiniteRecord(entry, ['height', 'targetHeight'])))) return false;
  if (value.landmarks !== undefined && (!Array.isArray(value.landmarks) || !value.landmarks.every((entry) => isRecord(entry) && typeof entry.key === 'string'
    && isVector3(entry.position) && isVector3(entry.targetPosition) && typeof entry.active === 'boolean'))) return false;
  if (value.breakables !== undefined && (!Array.isArray(value.breakables) || !value.breakables.every((entry) => isRecord(entry) && typeof entry.key === 'string'
    && isFiniteNumber(entry.health) && typeof entry.destroyed === 'boolean'))) return false;
  const bossActions = ['open-add-shutters', 'disable-left-emitter', 'disable-right-emitter', 'sink-cover', 'arena-switch-ready', 'open-binding-gate', 'expose-core'];
  if (value.bossMechanisms !== undefined && (!isRecord(value.bossMechanisms) || !Array.isArray(value.bossMechanisms.actions)
    || !value.bossMechanisms.actions.every((action) => bossActions.includes(String(action))) || !Number.isSafeInteger(value.bossMechanisms.bindingGates))) return false;
  if (value.runtime !== undefined && (!isRecord(value.runtime) || !isFiniteRecord(value.runtime, ['weaponCooldown', 'damageCooldown', 'messageTimer', 'projectileSequence'])
    || (value.runtime.weaponTransition !== undefined && !isFiniteNumber(value.runtime.weaponTransition))
    || typeof value.runtime.message !== 'string' || typeof value.runtime.walkMode !== 'boolean' || !isVector3(value.runtime.playerVelocity))) return false;
  return true;
};

export class GameEngine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(72, 16 / 10, .05, 110);
  readonly input: InputSystem;
  readonly audio = new AudioSystem();
  readonly world: World;
  readonly persistence: PersistenceSystem<SaveData>;
  readonly enemyBehavior = new EnemyBehaviorSystem({
    rng: {
      next: () => this.random(),
      getState: () => this.rngState,
      setState: (state) => { this.rngState = state >>> 0; },
    },
  });
  readonly player: PlayerState = {
    health: 100,
    armor: 0,
    armorClass: 'none',
    position: new Vector3(),
    yaw: 0,
    pitch: 0,
    ammo: { staples: 50, fasteners: 0, canisters: 0, 'toner-cells': 0 },
    weapons: new Set<WeaponId>(['claim-stamp', 'staple-driver']),
    weapon: 'staple-driver',
    credentials: new Set<Credential>(),
    floorPlan: false,
    powerups: { binder: 0, hazard: 0, rapid: 0, forensic: 0, goggles: 0 },
  };
  mode: GameMode = 'menu';
  difficulty: GameDifficulty = 'field-adjuster';
  tally: MapTally = { kills: 0, totalKills: 0, items: 0, totalItems: 0, secrets: 0, totalSecrets: 0, elapsed: 0 };
  message = '';
  sensitivity = 1.2;
  classicInput = false;
  accessibility = { highContrast: false, reducedEffects: false, reducedMotion: false, flashEffects: true, screenShake: true };
  onChange?: (snapshot: GameSnapshot) => void;
  onIntermission?: (nextMap?: MapId) => void;
  private accumulator = 0;
  private lastTime = performance.now();
  private weaponCooldown = 0;
  private damageCooldown = 0;
  private messageTimer = 0;
  private rngState = 0x4d595df4;
  private nextMap?: MapId;
  private readonly triggered = new Set<string>();
  private animationFrame = 0;
  private walkMode = false;
  private readonly playerVelocity = new Vector3();
  private readonly projectileSprites = new Map<string, Sprite>();
  private readonly hazardSprites = new Map<string, Sprite>();
  private readonly playerProjectiles: PlayerProjectile[] = [];
  private readonly playerProjectileSprites = new Map<string, Sprite>();
  private projectileSequence = 0;
  private bindingBeam?: { pulses: number; timer: number };
  private demoRecorder?: DemoRecorder<SaveData, GameplayCommand>;
  private demoTick = 0;
  private radialSelecting = false;
  private weaponState: 'ready' | 'lowering' | 'raising' = 'ready';
  private weaponTransition = 0;
  private pendingWeapon?: WeaponId;
  private renderScale = 1;

  private constructor(private readonly canvas: HTMLCanvasElement, readonly assets: AssetCatalog) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.setRenderScale(1);
    this.renderer.outputColorSpace = 'srgb';
    this.camera.rotation.order = 'YXZ';
    this.input = new InputSystem(canvas);
    window.addEventListener('resize', () => this.applyViewportSize());
    this.world = new World(this.scene, this.camera, assets);
    this.persistence = new PersistenceSystem<SaveData>(localStorage, {
      namespace: 'red-ledger-v2',
      gameVersion: '1',
      episodeIds: CAMPAIGN.episodes.map((episode) => episode.id),
      initialUnlockedEpisodes: [CAMPAIGN.episodes[0].id],
      validateState: isSaveData,
    });
    this.migrateLegacySave();
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && this.mode === 'playing') this.pause();
    });
    window.addEventListener('accessibility-settings-change', (event) => {
      const detail = (event as CustomEvent<Partial<typeof this.accessibility>>).detail;
      Object.assign(this.accessibility, detail);
    });
    this.loop = this.loop.bind(this);
    this.animationFrame = requestAnimationFrame(this.loop);
  }

  static async create(canvas: HTMLCanvasElement): Promise<GameEngine> {
    return new GameEngine(canvas, await AssetCatalog.load());
  }

  setRenderScale(scale: number): void {
    this.renderScale = Math.max(1, Math.min(3, Math.round(scale)));
    this.applyViewportSize();
  }

  private applyViewportSize(): void {
    const portrait = matchMedia('(pointer: coarse)').matches && innerHeight > innerWidth;
    const aspect = portrait ? innerWidth / innerHeight : 16 / 10;
    const baseWidth = portrait ? 200 : 320;
    const baseHeight = portrait ? Math.round(baseWidth / aspect) : 200;
    this.renderer.setSize(baseWidth * this.renderScale, baseHeight * this.renderScale, false);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  startEpisode(episodeIndex: number, difficulty: GameDifficulty): void {
    this.difficulty = difficulty;
    this.resetInventory();
    const episode = CAMPAIGN.episodes[episodeIndex];
    if (!episode) throw new Error(`Unknown episode ${episodeIndex}`);
    this.loadMap(episode.maps[0]);
  }

  loadMap(id: MapId, preserveInventory = true, createCheckpoint = true): void {
    const map = CAMPAIGN.maps[id];
    if (!map) throw new Error(`Unknown map ${id}`);
    if (!preserveInventory) this.resetInventory();
    this.assets.disposeTextures();
    this.world.load(map, DIFFICULTY[this.difficulty].placement);
    this.enemyBehavior.clear();
    this.projectileSprites.clear();
    this.hazardSprites.clear();
    this.playerProjectiles.length = 0;
    this.playerProjectileSprites.clear();
    this.projectileSequence = 0;
    this.bindingBeam = undefined;
    this.player.position.set(map.playerStart.x * map.cellSize, 0, map.playerStart.z * map.cellSize);
    this.player.position.y = this.world.floorHeightAt(this.player.position) + 1.35;
    this.player.yaw = ({ north: Math.PI, east: -Math.PI / 2, south: 0, west: Math.PI / 2 })[map.playerStart.facing];
    this.player.pitch = 0;
    this.player.credentials.clear();
    this.tally = {
      kills: 0,
      totalKills: this.world.actors.length,
      items: 0,
      totalItems: this.world.pickups.filter((pickup) => pickup.counted).length,
      secrets: 0,
      totalSecrets: map.secrets.length,
      elapsed: 0,
    };
    this.mode = 'playing';
    this.nextMap = undefined;
    this.triggered.clear();
    this.scene.fog = new FogExp2(Number(map.id[1]) === 1 ? 0x34383d : Number(map.id[1]) === 2 ? 0x18342f : 0x33070b, .012);
    this.audio.startMusic(Number(map.id[1]), map.index);
    this.showMessage(`${map.id}: ${map.title}`, 2.8);
    this.updateCamera();
    this.emit();
    if (createCheckpoint) this.checkpoint();
  }

  pause(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    document.exitPointerLock();
    this.emit();
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.emit();
  }

  step(seconds: number): void {
    if (this.mode !== 'playing') return;
    const ticks = Math.round(Math.min(.25, Math.max(0, seconds)) / STEP);
    for (let tick = 0; tick < ticks; tick += 1) this.simulate(STEP);
    this.render();
  }

  private loop(now: number): void {
    const elapsed = Math.min(.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.mode === 'playing') {
      this.accumulator += elapsed;
      while (this.accumulator >= STEP) {
        this.simulate(STEP);
        this.accumulator -= STEP;
      }
    }
    this.render();
    this.animationFrame = requestAnimationFrame(this.loop);
  }

  private simulate(dt: number, playbackCommand?: GameplayCommand, recordDemo = true): void {
    if (!playbackCommand) this.input.pollGamepad();
    if (!playbackCommand) {
      this.handleGlobalKeys();
      if (this.mode !== 'playing') return;
    }
    this.tally.elapsed += dt;
    this.weaponCooldown = Math.max(0, this.weaponCooldown - dt);
    this.updateWeaponTransition(dt);
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    for (const key of Object.keys(this.player.powerups) as Array<keyof PlayerState['powerups']>) {
      this.player.powerups[key] = Math.max(0, this.player.powerups[key] - dt);
    }
    this.updateVisionEffects();
    if (this.messageTimer === 0) this.message = '';
    const command = playbackCommand ?? this.captureGameplayCommand();
    if (recordDemo && this.demoRecorder) this.demoRecorder.record(this.demoTick++, command);
    if (command.walkToggle) this.walkMode = !this.walkMode;
    this.movePlayer(dt, command);
    this.updatePickups();
    this.world.updateMovers(dt);
    this.world.markVisited(this.player.position);
    this.updateSecrets();
    this.updatePlayerProjectiles(dt);
    this.updateBindingBeam(dt);
    this.updateEnemies(dt);
    this.weaponSelection(command);
    if (command.fire) this.fireWeapon();
    if (command.use) this.use();
    this.updateCamera();
    if (this.player.health <= 0) this.die();
    this.emit();
  }

  private captureGameplayCommand(): GameplayCommand {
    let weaponSlot = 0;
    for (let slot = 1; slot <= 8; slot += 1) {
      if (!this.input.keys.has(`Digit${slot}`)) continue;
      this.input.keys.delete(`Digit${slot}`);
      weaponSlot = slot;
      break;
    }
    let weaponCycle = this.input.consumeWeaponCycle();
    if (this.input.keys.has('KeyQ')) {
      this.input.keys.delete('KeyQ');
      weaponCycle = -1;
    }
    return {
      forward: (this.input.keys.has('KeyW') || this.input.keys.has('ArrowUp') ? 1 : 0)
        - (this.input.keys.has('KeyS') || this.input.keys.has('ArrowDown') ? 1 : 0) - this.input.touchMove.y - this.input.gamepadMove.y,
      strafe: (this.input.keys.has('KeyD') ? 1 : 0) - (this.input.keys.has('KeyA') ? 1 : 0) + this.input.touchMove.x + this.input.gamepadMove.x,
      turn: this.radialSelecting ? 0 : (this.input.keys.has('ArrowRight') ? 1 : 0) - (this.input.keys.has('ArrowLeft') ? 1 : 0) + this.input.gamepadLook.x + this.input.touchLook.x,
      look: this.classicInput ? 0 : this.input.consumeLook(),
      lookVertical: this.classicInput ? 0 : this.input.consumeVerticalLook()
        + ((this.input.keys.has('PageDown') ? 1 : 0) - (this.input.keys.has('PageUp') ? 1 : 0)) * 18
        + (this.input.gamepadLook.y + this.input.touchLook.y) * 8,
      fire: this.radialSelecting ? false : this.input.fire,
      use: this.input.consumeUse(),
      walkToggle: this.input.consumeWalkToggle(),
      weaponSlot,
      weaponCycle,
    };
  }

  private handleGlobalKeys(): void {
    if (this.input.keys.has('Escape')) {
      this.input.keys.delete('Escape');
      this.pause();
    }
    if (this.input.keys.has('F5') || this.input.keys.has('F6')) {
      this.input.keys.delete('F5');
      this.input.keys.delete('F6');
      this.save();
      this.showMessage('Quicksaved');
    }
    if (this.input.keys.has('F9')) {
      this.input.keys.delete('F9');
      this.loadQuicksave();
    }
    if (this.input.keys.has('KeyF')) {
      this.input.keys.delete('KeyF');
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen();
      else void document.exitFullscreen();
    }
  }

  private movePlayer(dt: number, command: GameplayCommand): void {
    this.player.yaw -= command.look * .002 * this.sensitivity;
    this.player.yaw -= command.turn * 2.25 * dt * this.sensitivity;
    this.player.pitch = Math.max(-.62, Math.min(.62, this.player.pitch - (command.lookVertical ?? 0) * .002 * this.sensitivity));
    const forward = new Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    const right = new Vector3(-forward.z, 0, forward.x);
    const movement = forward.multiplyScalar(command.forward).add(right.multiplyScalar(command.strafe));
    if (movement.lengthSq() > 1) movement.normalize();
    const targetVelocity = movement.multiplyScalar(this.walkMode ? 3.9 : 7.8);
    const hasInput = targetVelocity.lengthSq() > .001;
    const response = 1 - Math.exp(-dt * (hasInput ? 18 : 11));
    this.playerVelocity.lerp(targetVelocity, response);
    if (!hasInput && this.playerVelocity.lengthSq() < .0025) this.playerVelocity.set(0, 0, 0);
    const nextX = this.player.position.clone().add(new Vector3(this.playerVelocity.x * dt, 0, 0));
    if (this.canPlayerOccupy(nextX)) this.player.position.x = nextX.x;
    else this.playerVelocity.x = 0;
    const nextZ = this.player.position.clone().add(new Vector3(0, 0, this.playerVelocity.z * dt));
    if (this.canPlayerOccupy(nextZ)) this.player.position.z = nextZ.z;
    else this.playerVelocity.z = 0;
    this.player.position.y = this.world.floorHeightAt(this.player.position) + 1.35;
    if (this.world.isHazardAt(this.player.position) && this.player.powerups.hazard <= 0 && this.damageCooldown <= 0) {
      this.damagePlayer(this.world.hazardDamageAt(this.player.position) * .4);
      this.damageCooldown = .4;
    }
  }

  private updateCamera(): void {
    this.camera.position.copy(this.player.position);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);
  }

  private updateVisionEffects(): void {
    if (this.scene.fog instanceof FogExp2) this.scene.fog.density = this.player.powerups.goggles > 0 ? .0025 : .012;
  }

  private canPlayerOccupy(position: Vector3): boolean {
    if (!this.world.canTraverse(this.player.position, position)) return false;
    return !this.world.actors.some((actor) => !actor.dead && !actor.phaseLocked
      && Math.abs(actor.position.y - this.world.floorHeightAt(position)) < ENEMIES[actor.id].height
      && this.horizontalDistance(actor.position, position) < ENEMIES[actor.id].radius + .32);
  }

  private aimDirection(yawOffset = 0): Vector3 {
    const cosPitch = Math.cos(this.player.pitch);
    return new Vector3(
      -Math.sin(this.player.yaw + yawOffset) * cosPitch,
      -Math.sin(this.player.pitch),
      -Math.cos(this.player.yaw + yawOffset) * cosPitch,
    ).normalize();
  }

  private fireWeapon(): void {
    if (this.weaponCooldown > 0 || this.weaponState !== 'ready') return;
    const weapon = WEAPONS[this.player.weapon];
    if (weapon.ammo !== 'none' && this.player.ammo[weapon.ammo] < weapon.ammoCost) {
      this.weaponCooldown = .25;
      this.audio.tone(80, .06, 'square', .025);
      this.showMessage('Insufficient supply', .7);
      return;
    }
    if (weapon.ammo !== 'none') this.player.ammo[weapon.ammo] -= weapon.ammoCost;
    this.weaponCooldown = weapon.cooldown * (this.player.powerups.rapid > 0 ? .55 : 1);
    this.audio.noise(.055, weapon.slot >= 5 ? .09 : .045);
    this.audio.tone(110 + weapon.slot * 28, .08, weapon.slot % 2 ? 'square' : 'sawtooth', .035);
    this.enemyBehavior.emitSound(this.player.position, weapon.slot === 8 ? 8 : weapon.slot === 1 ? 12 : 24, 'player');
    window.dispatchEvent(new CustomEvent('weapon-fire', { detail: { weapon: weapon.id, duration: Math.min(.18, weapon.cooldown * .55), recoil: weapon.recoil } }));
    window.dispatchEvent(new CustomEvent('view-recoil', { detail: { amount: weapon.recoil, weapon: weapon.id } }));
    if (weapon.id === 'catastrophe-launcher' || weapon.id === 'plasma-copier') {
      let direction = this.aimDirection();
      const autoTarget = this.findTarget(direction, weapon.range, Math.PI / 30);
      if (autoTarget) direction = autoTarget.position.clone().add(new Vector3(0, ENEMIES[autoTarget.id].height * .5, 0)).sub(this.player.position).normalize();
      const position = this.player.position.clone().addScaledVector(direction, .7).setY(this.player.position.y - .2);
      const projectile: PlayerProjectile = {
        id: `player-projectile-${this.projectileSequence++}`,
        weapon: weapon.id,
        position,
        velocity: direction.multiplyScalar(weapon.id === 'catastrophe-launcher' ? 14 : 28),
        damage: this.rollWeaponDamage(weapon.id),
        radius: weapon.id === 'catastrophe-launcher' ? .32 : .18,
        remaining: weapon.id === 'catastrophe-launcher' ? 4 : 2.2,
      };
      this.playerProjectiles.push(projectile);
      this.syncPlayerProjectileSprite(projectile);
      return;
    }
    if (weapon.id === 'binding-engine') {
      this.bindingBeam = { pulses: 20, timer: 0 };
      return;
    }
    for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
      const spread = (this.random() - .5) * weapon.spread;
      const direction = this.aimDirection(spread);
      const target = this.findTarget(direction, weapon.range, Math.max(.025, weapon.spread + .03));
      if (!target) {
        const breakable = this.findBreakableTarget(direction, weapon.range, Math.max(.025, weapon.spread + .03));
        if (breakable) this.damageBreakable(breakable.key, this.rollWeaponDamage(weapon.id));
        window.dispatchEvent(new CustomEvent('weapon-impact', { detail: { weapon: weapon.id, kind: 'wall' } }));
        continue;
      }
      this.damageActor(target, this.rollWeaponDamage(weapon.id), 'player');
      window.dispatchEvent(new CustomEvent('weapon-impact', { detail: { weapon: weapon.id, kind: 'actor', targetUid: target.uid } }));
    }
  }

  private rollWeaponDamage(id: WeaponId): number {
    const weapon = WEAPONS[id];
    return weapon.damageMin + Math.floor(this.random() * (weapon.damageMax - weapon.damageMin + 1));
  }

  private updateBindingBeam(dt: number): void {
    if (!this.bindingBeam) return;
    this.bindingBeam.timer -= dt;
    while (this.bindingBeam && this.bindingBeam.timer <= 0 && this.bindingBeam.pulses > 0) {
      const direction = this.aimDirection();
      const target = this.findTarget(direction, WEAPONS['binding-engine'].range, .055);
      if (target) this.damageActor(target, this.rollWeaponDamage('binding-engine'), 'player');
      else {
        const breakable = this.findBreakableTarget(direction, WEAPONS['binding-engine'].range, .055);
        if (breakable) this.damageBreakable(breakable.key, this.rollWeaponDamage('binding-engine'));
      }
      this.audio.tone(150 + this.bindingBeam.pulses * 7, .035, 'sawtooth', .022);
      this.bindingBeam.pulses -= 1;
      this.bindingBeam.timer += 1 / 22;
      if (this.bindingBeam.pulses <= 0) this.bindingBeam = undefined;
    }
  }

  private updatePlayerProjectiles(dt: number): void {
    for (let index = this.playerProjectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.playerProjectiles[index];
      const from = projectile.position.clone();
      const to = from.clone().addScaledVector(projectile.velocity, dt);
      const delta = to.clone().sub(from);
      let bestT = Number.POSITIVE_INFINITY;
      let target: RuntimeActor | undefined;
      for (const actor of this.world.actors) {
        if (actor.dead || actor.phaseLocked) continue;
        const actorCenter = actor.position.clone().add(new Vector3(0, ENEMIES[actor.id].height * .5, 0));
        const t = Math.max(0, Math.min(1, actorCenter.clone().sub(from).dot(delta) / Math.max(.0001, delta.lengthSq())));
        const closest = from.clone().addScaledVector(delta, t);
        const verticalHit = closest.y + projectile.radius >= actor.position.y && closest.y - projectile.radius <= actor.position.y + ENEMIES[actor.id].height;
        const horizontalHit = Math.hypot(closest.x - actor.position.x, closest.z - actor.position.z) <= projectile.radius + ENEMIES[actor.id].radius;
        if (verticalHit && horizontalHit && t < bestT) {
          bestT = t;
          target = actor;
        }
      }
      const steps = Math.max(1, Math.ceil(delta.length() / .25));
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        if (t >= bestT) break;
        if (this.world.isSolid(from.clone().addScaledVector(delta, t), projectile.radius)) {
          bestT = t;
          target = undefined;
          break;
        }
      }
      projectile.remaining -= dt;
      if (Number.isFinite(bestT)) {
        projectile.position.copy(from).addScaledVector(delta, bestT);
        if (target) this.damageActor(target, projectile.damage, 'player');
        else {
          const breakable = this.world.closestBreakable(projectile.position, projectile.radius + .9);
          if (breakable) this.damageBreakable(breakable.key, projectile.damage);
        }
        if (projectile.weapon === 'catastrophe-launcher') {
          const launcher = WEAPONS['catastrophe-launcher'];
          this.applyPlayerSplash(projectile.position, launcher.splashDamage ?? 128, launcher.splashRadius ?? 3.8, target);
        }
        window.dispatchEvent(new CustomEvent('weapon-impact', { detail: { weapon: projectile.weapon, kind: target ? 'actor' : 'wall', targetUid: target?.uid } }));
        this.removePlayerProjectile(index);
        continue;
      }
      projectile.position.copy(to);
      if (projectile.remaining <= 0) {
        this.removePlayerProjectile(index);
        continue;
      }
      this.syncPlayerProjectileSprite(projectile);
    }
  }

  private applyPlayerSplash(center: Vector3, maxDamage: number, radius: number, directTarget?: RuntimeActor): void {
    for (const actor of this.world.actors) {
      if (actor.dead || actor.phaseLocked) continue;
      const actorCenter = actor.position.clone().add(new Vector3(0, ENEMIES[actor.id].height * .5, 0));
      const distance = center.distanceTo(actorCenter);
      if (distance < radius && this.world.hasLineOfSight(center, actorCenter)) this.damageActor(actor, maxDamage * (1 - distance / radius), 'player');
    }
    for (const breakable of this.world.breakables.values()) {
      if (breakable.destroyed) continue;
      const target = breakable.position.clone().add(new Vector3(0, .6, 0));
      const distance = center.distanceTo(target);
      if (distance < radius && this.world.hasLineOfSight(center, target)) this.damageBreakable(breakable.key, maxDamage * (1 - distance / radius));
    }
    const playerDistance = center.distanceTo(this.player.position);
    if (playerDistance < radius && this.world.hasLineOfSight(center, this.player.position)) this.damagePlayer(maxDamage * (1 - playerDistance / radius));
  }

  private syncPlayerProjectileSprite(projectile: PlayerProjectile): void {
    let sprite = this.playerProjectileSprites.get(projectile.id);
    if (!sprite) {
      const family = projectile.weapon === 'catastrophe-launcher' ? 'canister-projectile' : 'plasma-bolt';
      sprite = this.createEffectSprite(`/public_runtime/effects/${family}/fx_${family}_F_01.png`, projectile.weapon === 'catastrophe-launcher' ? .72 : .46);
      this.playerProjectileSprites.set(projectile.id, sprite);
    }
    sprite.material.depthTest = !this.accessibility.highContrast;
    sprite.renderOrder = this.accessibility.highContrast ? 20 : 0;
    sprite.position.copy(projectile.position);
  }

  private removePlayerProjectile(index: number): void {
    const [projectile] = this.playerProjectiles.splice(index, 1);
    const sprite = this.playerProjectileSprites.get(projectile.id);
    if (sprite) {
      this.world.root.remove(sprite);
      sprite.material.dispose();
      this.playerProjectileSprites.delete(projectile.id);
    }
  }

  private findTarget(direction: Vector3, range: number, tolerance: number): RuntimeActor | undefined {
    let result: RuntimeActor | undefined;
    let bestDistance = range;
    for (const actor of this.world.actors) {
      if (actor.dead || actor.phaseLocked) continue;
      const delta = actor.position.clone().add(new Vector3(0, ENEMIES[actor.id].height * .5, 0)).sub(this.player.position);
      const distance = delta.length();
      if (distance >= bestDistance || !this.world.hasLineOfSight(this.player.position, actor.position.clone().add(new Vector3(0, ENEMIES[actor.id].height * .5, 0)))) continue;
      const angularMiss = Math.acos(Math.max(-1, Math.min(1, direction.dot(delta.normalize()))));
      const sizeAllowance = Math.asin(Math.min(1, ENEMIES[actor.id].radius / Math.max(ENEMIES[actor.id].radius, distance)));
      if (angularMiss <= tolerance + sizeAllowance) {
        result = actor;
        bestDistance = distance;
      }
    }
    return result;
  }

  private findBreakableTarget(direction: Vector3, range: number, tolerance: number) {
    let result: ReturnType<World['closestBreakable']>;
    let bestDistance = range;
    for (const breakable of this.world.breakables.values()) {
      if (breakable.destroyed) continue;
      const delta = breakable.position.clone().add(new Vector3(0, .6, 0)).sub(this.player.position);
      const distance = delta.length();
      if (distance >= bestDistance || !this.world.hasLineOfSight(this.player.position, breakable.position)) continue;
      const angularMiss = Math.acos(Math.max(-1, Math.min(1, direction.dot(delta.normalize()))));
      const sizeAllowance = Math.asin(Math.min(1, .35 / Math.max(.35, distance)));
      if (angularMiss <= tolerance + sizeAllowance) {
        result = breakable;
        bestDistance = distance;
      }
    }
    return result;
  }

  private damageBreakable(key: string, damage: number): void {
    const item = this.world.breakables.get(key);
    if (!item) return;
    const result = this.world.damageBreakable(key, damage);
    if (!result?.destroyed) return;
    this.audio.noise(.12, .055);
    window.dispatchEvent(new CustomEvent('world-breakable-destroyed', { detail: { key } }));
    const reward = result.reward;
    if (!reward) return;
    const ammoId: Exclude<AmmoType, 'none'> | undefined = reward.includes('staples') ? 'staples'
      : reward.includes('fasteners') ? 'fasteners'
        : reward.includes('canister') ? 'canisters'
          : reward.includes('toner') ? 'toner-cells' : undefined;
    if (ammoId) this.world.spawnAmmoDrop(item.position, ammoId, ammoId === 'toner-cells' ? 30 : ammoId === 'canisters' ? 2 : 12, `drop-${key}`);
  }

  private damageActor(actor: RuntimeActor, damage: number, sourceUid = 'player'): void {
    if (actor.dead || actor.phaseLocked) return;
    actor.awake = true;
    this.enemyBehavior.registerDamage(actor.uid, sourceUid, damage);
    actor.health -= damage;
    actor.attackFlash = .12;
    if (actor.health > 0) return;
    actor.dead = true;
    actor.health = 0;
    this.tally.kills += 1;
    this.setActorDeadVisual(actor);
    this.audio.noise(.16, .06);
    this.audio.enemyCue(actor.id, 'death', this.actorPan(actor));
    const drop = ENEMIES[actor.id].drop;
    if (drop && this.random() <= drop.chance) {
      this.world.spawnAmmoDrop(actor.position, drop.id, drop.amount, `actor-drop-${actor.uid}`);
      window.dispatchEvent(new CustomEvent('actor-drop', { detail: { actorUid: actor.uid, position: actor.position.toArray(), ...drop } }));
    }
    this.showMessage(actor.kind === 'boss' ? 'Authority neutralized' : 'Exposure closed', 1.1);
    if (actor.kind === 'boss') {
      const mechanism = actor.id === 'regional-director' ? 'episode-exit' : actor.id === 'aggregate' ? 'disable-right-emitter' : actor.id === 'chief-actuary' ? 'begin-binding-gates' : 'core-destroyed';
      if (actor.id === 'chief-actuary') {
        this.world.applyBossMechanism('arena-switch-ready', actor.uid);
        this.showMessage('Three binding gates are now active', 2.2);
      }
      if (actor.id === 'aggregate') {
        this.world.applyBossMechanism('disable-right-emitter', actor.uid);
        this.world.applyBossMechanism('sink-cover', actor.uid);
      }
      window.dispatchEvent(new CustomEvent('boss-mechanism', { detail: { bossId: actor.id, mechanism } }));
    }
    this.resolveEncounterCompletion(actor.encounter);
  }

  private resolveEncounterCompletion(id?: string): void {
    if (!id || this.world.actors.some((actor) => actor.encounter === id && !actor.dead)) return;
    const encounter = this.world.map.encounters.find((candidate) => candidate.id === id);
    if (!encounter || encounter.completion === 'switch') return;
    const targets = this.world.map.id === 'E3M8' && id === 'boss-1'
      ? (encounter.opens ?? []).filter((target) => target !== 'boss-2')
      : encounter.opens ?? [];
    this.unlockTargets(targets);
  }

  private setActorDeadVisual(actor: RuntimeActor): void {
    const material = actor.sprite.material;
    material.map = this.assets.texture(this.assets.actorFrame(actor.kind, actor.id, 'death'));
    material.needsUpdate = true;
    actor.sprite.scale.y *= .72;
  }

  private updateEnemies(dt: number): void {
    const difficulty = DIFFICULTY[this.difficulty];
    for (const actor of this.world.actors) {
      if (actor.dead || actor.phaseLocked) continue;
      actor.attackFlash = Math.max(0, actor.attackFlash - dt);
      actor.animationTime += dt;
      actor.moving = false;
      if (actor.awake && Math.floor((actor.animationTime - dt) / 7) !== Math.floor(actor.animationTime / 7)) {
        this.audio.enemyCue(actor.id, 'idle', this.actorPan(actor));
      }
      const distance = this.horizontalDistance(actor.position, this.player.position);
      if (!actor.awake && distance < 25 && this.world.hasLineOfSight(actor.position, this.player.position)) {
        actor.awake = true;
        this.audio.enemyCue(actor.id, 'alert', this.actorPan(actor));
      }
    }

    const result = this.enemyBehavior.step({
      dt,
      actors: this.world.actors.map((actor) => ({
        uid: actor.uid,
        kind: actor.kind,
        id: actor.id,
        position: actor.position,
        health: actor.health,
        maxHealth: actor.maxHealth,
        radius: ENEMIES[actor.id].radius,
        awake: actor.awake,
        dead: actor.dead,
        phaseLocked: actor.phaseLocked,
        faction: ENEMIES[actor.id].faction,
        height: ENEMIES[actor.id].height,
        redacted: Boolean((actor as RuntimeActor & { redacted?: boolean }).redacted),
      })),
      target: {
        uid: 'player',
        position: this.player.position,
        velocity: this.playerVelocity,
        radius: .32,
        alive: this.player.health > 0,
      },
      world: {
        hasLineOfSight: (from, to) => this.world.hasLineOfSight(new Vector3(from.x, from.y, from.z), new Vector3(to.x, to.y, to.z)),
        canOccupy: (actor, position) => {
          const point = new Vector3(position.x, position.y, position.z);
          if (this.world.isSolid(point, actor.radius * .55)) return false;
          if (this.player.health > 0 && Math.abs(this.player.position.y - position.y) < Math.max(1.7, actor.height ?? 1)
            && this.horizontalDistance(this.player.position, point) < actor.radius + .32) return false;
          return !this.world.actors.some((other) => other.uid !== actor.uid && !other.dead && !other.phaseLocked
            && Math.abs(other.position.y - position.y) < Math.max(ENEMIES[other.id].height, actor.height ?? 1)
            && this.horizontalDistance(other.position, point) < ENEMIES[other.id].radius + actor.radius);
        },
        traceProjectile: (projectile, from, to) => this.traceEnemyProjectile(projectile, from, to),
      },
      difficulty: { reaction: difficulty.reaction, refire: difficulty.refire, projectileSpeed: difficulty.projectileSpeed, aggression: difficulty.aggression },
    });
    result.events.forEach((event) => this.applyEnemyEvent(event, dt, difficulty.enemySpeed, difficulty.enemyDamage));
    this.syncCombatEffects(result.projectiles, result.hazards);
    this.world.actors.forEach((actor) => this.updateActorVisual(actor));
  }

  private applyEnemyEvent(event: BehaviorEvent, dt: number, speedScale: number, damageScale: number): void {
    const actor = 'actorUid' in event ? this.world.actors.find((candidate) => candidate.uid === event.actorUid) : undefined;
    switch (event.type) {
      case 'move': {
        if (!actor || actor.dead) return;
        const next = actor.position.clone().add(new Vector3(event.velocity.x, 0, event.velocity.z).multiplyScalar(dt * speedScale));
        const blockedByPlayer = this.player.health > 0
          && Math.abs(this.player.position.y - next.y) < Math.max(1.7, ENEMIES[actor.id].height)
          && this.horizontalDistance(this.player.position, next) < ENEMIES[actor.id].radius + .32;
        const blockedByActor = this.world.actors.some((other) => other.uid !== actor.uid && !other.dead && !other.phaseLocked
          && Math.abs(other.position.y - next.y) < Math.max(ENEMIES[other.id].height, ENEMIES[actor.id].height)
          && this.horizontalDistance(other.position, next) < ENEMIES[other.id].radius + ENEMIES[actor.id].radius);
        if (!blockedByPlayer && !blockedByActor && this.world.canTraverse(actor.position, next, ENEMIES[actor.id].radius * .55)) {
          next.y = this.world.floorHeightAt(next);
          actor.position.copy(next);
          actor.sprite.position.x = next.x;
          actor.sprite.position.z = next.z;
          actor.facing = Math.atan2(event.velocity.x, event.velocity.z);
          actor.moving = true;
        } else {
          const door = this.world.closestDoor(actor.position, 2.5);
          if (door && !door.credential) this.world.openDoor(door);
        }
        break;
      }
      case 'elevation':
        if (actor) {
          actor.position.y = this.world.floorHeightAt(actor.position) + event.offset;
          actor.sprite.position.y = actor.position.y;
        }
        break;
      case 'visibility':
        if (actor) {
          actor.sprite.visible = !actor.phaseLocked;
          actor.sprite.material.opacity = event.opacity;
          actor.sprite.material.depthWrite = event.visible;
        }
        break;
      case 'attack':
        if (actor) actor.attackFlash = .2;
        if (actor) this.audio.enemyCue(actor.id, 'attack', this.actorPan(actor));
        break;
      case 'state':
        if (actor && event.state === 'windup') actor.attackFlash = Math.max(actor.attackFlash, event.duration);
        break;
      case 'wake':
        if (actor) {
          actor.awake = true;
          this.audio.enemyCue(actor.id, 'alert');
        }
        break;
      case 'pain':
        if (actor) {
          actor.attackFlash = 0;
          actor.visualKey = '';
          this.audio.enemyCue(actor.id, 'pain', this.actorPan(actor));
          window.dispatchEvent(new CustomEvent('enemy-pain', { detail: { actorUid: actor.uid, id: actor.id, sourceUid: event.sourceUid } }));
        }
        break;
      case 'damage': {
        const adjusted = event.amount * damageScale * (this.player.powerups.forensic > 0 ? .62 : 1);
        if (event.targetUid === 'player') this.damagePlayer(adjusted, event.sourceUid);
        else {
          const target = this.world.actors.find((candidate) => candidate.uid === event.targetUid);
          if (target) this.damageActor(target, event.amount, event.sourceUid);
        }
        break;
      }
      case 'resurrect': {
        const target = this.world.actors.find((candidate) => candidate.uid === event.targetUid);
        if (!target) break;
        target.dead = false;
        target.health = event.health;
        target.awake = true;
        target.visualKey = '';
        target.sprite.visible = true;
        target.sprite.material.opacity = 1;
        (target as RuntimeActor & { redacted?: boolean }).redacted = event.redacted;
        this.enemyBehavior.markResurrected(target.uid, event.redacted);
        target.sprite.material.color.set(event.redacted ? 0xc93434 : 0xffffff);
        target.sprite.scale.set(ENEMIES[target.id].height, ENEMIES[target.id].height, 1);
        this.tally.kills = Math.max(0, this.tally.kills - 1);
        this.showMessage('Closed exposure reopened', 1.2);
        break;
      }
      case 'summon':
        event.positions.forEach((position) => {
          const point = new Vector3(position.x, 0, position.z);
          if (this.world.isSolid(point, ENEMIES[event.enemyId].radius)) return;
          this.world.summonEnemy(event.enemyId, point);
          this.tally.totalKills += 1;
        });
        break;
      case 'boss-phase':
        if (actor) this.audio.enemyCue(actor.id, 'phase', this.actorPan(actor));
        this.showMessage(`${this.pretty(event.phaseId)} phase`, 1.5);
        break;
      case 'boss-mechanism':
        if (event.mechanism === 'open-add-shutters') this.world.applyBossMechanism('open-add-shutters', event.actorUid);
        else if (event.mechanism === 'disable-left-emitter') this.world.applyBossMechanism('disable-left-emitter', event.actorUid);
        else if (event.mechanism === 'disable-right-emitter') this.world.applyBossMechanism('disable-right-emitter', event.actorUid);
        else if (event.mechanism === 'sink-cover') this.world.applyBossMechanism('sink-cover', event.actorUid);
        else if (event.mechanism === 'arena-switch-window') this.world.applyBossMechanism('arena-switch-ready', event.actorUid);
        else if (event.mechanism === 'spawn-wave' && actor) {
          const roster = event.index === 1 ? ['returned-mail', 'desk-warden'] as const : ['coverage-drone', 'subrogator'] as const;
          roster.forEach((enemyId, index) => {
            const angle = actor.facing + (index === 0 ? -1.2 : 1.2);
            const point = actor.position.clone().add(new Vector3(Math.sin(angle) * 4, 0, Math.cos(angle) * 4));
            point.y = this.world.floorHeightAt(point);
            if (!this.world.isSolid(point, ENEMIES[enemyId].radius)) {
              const summoned = this.world.summonEnemy(enemyId, point);
              summoned.awake = true;
              this.tally.totalKills += 1;
            }
          });
        }
        window.dispatchEvent(new CustomEvent('boss-mechanism', { detail: event }));
        break;
      default:
        break;
    }
  }

  private traceEnemyProjectile(projectile: Readonly<ProjectileState>, from: BehaviorVector, to: BehaviorVector): { position: BehaviorVector; targetUid?: string } | undefined {
    const start = new Vector3(from.x, from.y, from.z);
    const end = new Vector3(to.x, to.y, to.z);
    const delta = end.clone().sub(start);
    let bestT = Number.POSITIVE_INFINITY;
    let targetUid: string | undefined;
    for (const actor of this.world.actors) {
      if (actor.uid === projectile.ownerUid || actor.dead || actor.phaseLocked) continue;
      const actorCenter = actor.position.clone().add(new Vector3(0, ENEMIES[actor.id].height * .5, 0));
      const horizontal = actorCenter.clone().sub(start);
      const denominator = Math.max(.0001, delta.lengthSq());
      const t = Math.max(0, Math.min(1, horizontal.dot(delta) / denominator));
      const closest = start.clone().addScaledVector(delta, t);
      const verticalHit = closest.y + projectile.radius >= actor.position.y && closest.y - projectile.radius <= actor.position.y + ENEMIES[actor.id].height;
      const horizontalHit = Math.hypot(closest.x - actor.position.x, closest.z - actor.position.z) <= projectile.radius + ENEMIES[actor.id].radius;
      if (verticalHit && horizontalHit && t < bestT) {
        bestT = t;
        targetUid = actor.uid;
      }
    }
    const steps = Math.max(1, Math.ceil(delta.length() / .3));
    for (let index = 1; index <= steps; index += 1) {
      const t = index / steps;
      if (t >= bestT) break;
      const point = start.clone().addScaledVector(delta, t);
      if (this.world.isSolid(point, projectile.radius)) {
        bestT = t;
        targetUid = undefined;
        break;
      }
    }
    if (!Number.isFinite(bestT)) return undefined;
    const hit = start.addScaledVector(delta, bestT);
    return { position: { x: hit.x, y: hit.y, z: hit.z }, ...(targetUid ? { targetUid } : {}) };
  }

  private syncCombatEffects(projectiles: readonly ProjectileState[], hazards: readonly HazardState[]): void {
    const projectileIds = new Set(projectiles.map((item) => item.id));
    for (const [id, sprite] of this.projectileSprites) {
      if (projectileIds.has(id)) continue;
      this.world.root.remove(sprite);
      sprite.material.dispose();
      this.projectileSprites.delete(id);
    }
    for (const item of projectiles) {
      let sprite = this.projectileSprites.get(item.id);
      if (!sprite) {
        sprite = this.createEffectSprite(this.projectileEffect(item.kind), Math.max(.4, item.radius * 2.5));
        this.projectileSprites.set(item.id, sprite);
      }
      sprite.material.depthTest = !this.accessibility.highContrast;
      sprite.renderOrder = this.accessibility.highContrast ? 20 : 0;
      sprite.position.set(item.position.x, item.position.y, item.position.z);
    }
    const hazardIds = new Set(hazards.map((item) => item.id));
    for (const [id, sprite] of this.hazardSprites) {
      if (hazardIds.has(id)) continue;
      this.world.root.remove(sprite);
      sprite.material.dispose();
      this.hazardSprites.delete(id);
    }
    for (const item of hazards) {
      let sprite = this.hazardSprites.get(item.id);
      if (!sprite) {
        const effect = item.kind.includes('prediction') || item.kind.includes('actuarial') ? 'prediction-zone' : 'reserve-hazard';
        sprite = this.createEffectSprite(`/public_runtime/effects/${effect}/fx_${effect}_F_01.png`, item.radius * 2);
        sprite.center.set(.5, .18);
        this.hazardSprites.set(item.id, sprite);
      }
      sprite.position.set(item.position.x, .08, item.position.z);
      sprite.material.opacity = item.armed ? .86 : .48;
      sprite.material.depthTest = !this.accessibility.highContrast;
      sprite.renderOrder = this.accessibility.highContrast ? 19 : 0;
    }
  }

  private createEffectSprite(url: string, size: number): Sprite {
    const material = new SpriteMaterial({ map: this.assets.texture(url), transparent: true, depthWrite: false, alphaTest: .04 });
    const sprite = new Sprite(material);
    const effectScale = this.accessibility.reducedEffects ? .72 : 1;
    sprite.scale.set(size * effectScale, size * effectScale, 1);
    this.world.root.add(sprite);
    return sprite;
  }

  private projectileEffect(kind: string): string {
    const family = kind.includes('ember') ? 'ember-claim-fire'
      : kind.includes('coverage') ? 'coverage-bolt'
        : kind.includes('liability') ? 'liability-orb'
          : kind.includes('canister') ? 'canister-projectile'
            : 'plasma-bolt';
    return `/public_runtime/effects/${family}/fx_${family}_F_01.png`;
  }

  private damagePlayer(amount: number, sourceUid?: string): void {
    if (this.player.powerups.binder > 0) return;
    const absorption = this.player.armorClass === 'heavy' ? .5 : this.player.armorClass === 'light' ? .33 : 0;
    const absorbed = Math.min(this.player.armor, amount * absorption);
    this.player.armor -= absorbed;
    if (this.player.armor <= 0) this.player.armorClass = 'none';
    this.player.health -= amount - absorbed;
    this.audio.noise(.08, .05);
    const source = sourceUid ? this.world.actors.find((actor) => actor.uid === sourceUid) : undefined;
    let direction: 'left' | 'right' | 'center' = 'center';
    if (source) {
      const angle = Math.atan2(source.position.x - this.player.position.x, source.position.z - this.player.position.z) - this.player.yaw;
      const side = Math.sin(angle);
      direction = side > .25 ? 'right' : side < -.25 ? 'left' : 'center';
    }
    window.dispatchEvent(new CustomEvent('player-hurt', { detail: { amount, direction } }));
  }

  private updateActorVisual(actor: RuntimeActor): void {
    const inVisualRange = this.horizontalDistance(actor.position, this.player.position) <= 34
      && this.world.hasLineOfSight(this.player.position, actor.position);
    actor.sprite.visible = !actor.phaseLocked && inVisualRange;
    if (actor.dead || actor.phaseLocked || !inVisualRange) return;
    const behaviorState = this.enemyBehavior.getActorState(actor.uid);
    actor.sprite.material.opacity = this.player.powerups.forensic > 0 ? 1 : behaviorState?.visible === false ? .18 : 1;
    actor.sprite.material.depthWrite = actor.sprite.material.opacity >= 1;
    const state = behaviorState?.action === 'pain' ? 'pain' : actor.attackFlash > 0 || behaviorState?.action === 'windup' ? 'attack' : actor.moving ? 'walk' : 'idle';
    const dx = this.player.position.x - actor.position.x;
    const dz = this.player.position.z - actor.position.z;
    let relative = Math.atan2(dx, dz) - actor.facing;
    while (relative < -Math.PI) relative += Math.PI * 2;
    while (relative >= Math.PI) relative -= Math.PI * 2;
    const codes = ['F', 'FR', 'R', 'BR', 'B', 'BL', 'L', 'FL'];
    const sector = Math.round(relative / (Math.PI / 4));
    const angle = codes[(sector + 8) % 8];
    const frame = Math.floor(actor.animationTime * (state === 'attack' ? 10 : 7));
    const url = this.assets.actorFrame(actor.kind, actor.id, state, angle, frame);
    if (actor.visualKey === url) return;
    actor.visualKey = url;
    actor.sprite.material.map = this.assets.texture(url);
    actor.sprite.material.needsUpdate = true;
  }

  private updatePickups(): void {
    for (const pickup of this.world.pickups) {
      if (pickup.collected || this.horizontalDistance(pickup.position, this.player.position) > 1.05) continue;
      pickup.collected = true;
      pickup.sprite.visible = false;
      if (pickup.counted) this.tally.items += 1;
      if (pickup.ammoDrop) {
        const { ammoId, amount } = pickup.ammoDrop;
        if (ammoId === 'none') continue;
        const cap = ammoId === 'staples' ? 200 : ammoId === 'toner-cells' ? 300 : 50;
        this.player.ammo[ammoId] = Math.min(cap, this.player.ammo[ammoId] + amount);
        this.showMessage(`${this.pretty(ammoId)} recovered`);
      } else if (pickup.kind === 'weapon') {
        const acquired = pickup.id as WeaponId;
        this.player.weapons.add(acquired);
        this.requestWeapon(acquired);
        const weapon = WEAPONS[pickup.id as WeaponId];
        if (weapon.ammo !== 'none') this.player.ammo[weapon.ammo] = Math.min(weapon.ammo === 'toner-cells' ? 300 : weapon.ammo === 'staples' ? 200 : 50, this.player.ammo[weapon.ammo] + Math.max(weapon.ammoCost * 2, weapon.ammo === 'toner-cells' ? 40 : 8));
        this.showMessage(`${this.pretty(pickup.id)} acquired`);
        window.dispatchEvent(new CustomEvent('player-portrait', { detail: { state: 'weapon-acquired' } }));
      } else if (pickup.kind === 'credential') {
        this.player.credentials.add(pickup.id as Credential);
        this.showMessage(`${this.pretty(pickup.id)} credential acquired`);
      } else this.applyPickup(pickup.id as PickupId);
      this.audio.tone(660, .1, 'square', .035);
    }
  }

  private applyPickup(id: PickupId): void {
    const supply = DIFFICULTY[this.difficulty].supply;
    if (id.includes('staples')) this.player.ammo.staples = Math.min(200, this.player.ammo.staples + (id.endsWith('large') ? 40 : 16) * supply);
    else if (id.includes('fasteners')) this.player.ammo.fasteners = Math.min(50, this.player.ammo.fasteners + (id.endsWith('large') ? 24 : 8) * supply);
    else if (id === 'canister' || id === 'canister-crate') this.player.ammo.canisters = Math.min(50, this.player.ammo.canisters + (id === 'canister-crate' ? 5 : 1) * supply);
    else if (id.includes('toner')) this.player.ammo['toner-cells'] = Math.min(300, this.player.ammo['toner-cells'] + (id === 'toner-pack' ? 80 : 30) * supply);
    else if (id === 'loss-control-vest') { this.player.armor = Math.max(this.player.armor, 100); this.player.armorClass = 'light'; }
    else if (id === 'catastrophe-suit') { this.player.armor = Math.max(this.player.armor, 200); this.player.armorClass = 'heavy'; }
    else if (id === 'emergency-reserve') { this.player.health = 200; this.player.armor = Math.max(this.player.armor, 200); this.player.armorClass = 'heavy'; }
    else if (id === 'floor-plan') this.player.floorPlan = true;
    else if (id === 'temporary-binder') this.player.powerups.binder = 30;
    else if (id === 'hazard-endorsement') this.player.powerups.hazard = 30;
    else if (id === 'rapid-authority') this.player.powerups.rapid = 30;
    else if (id === 'forensic-lens') this.player.powerups.forensic = 30;
    else if (id === 'night-inspection-goggles') this.player.powerups.goggles = 30;
    else this.player.health = Math.min(id === 'goodwill-token' ? 200 : 100, this.player.health + (id === 'field-medical-case' ? 25 : id === 'goodwill-token' ? 1 : 10));
    if (id === 'temporary-binder') window.dispatchEvent(new CustomEvent('player-portrait', { detail: { state: 'invulnerable' } }));
    else if (id === 'emergency-reserve') window.dispatchEvent(new CustomEvent('player-portrait', { detail: { state: 'overcharge' } }));
    this.showMessage(this.pretty(id));
  }

  private updateSecrets(): void {
    // Secrets are revealed explicitly from their clue-side triggers. Entering the
    // reward alcove alone must never award discovery credit.
  }

  private use(): void {
    this.enemyBehavior.emitSound(this.player.position, 10, 'player');
    const door = this.world.closestDoor(this.player.position);
    if (door) {
      if (door.credential && !this.player.credentials.has(door.credential)) {
        this.rejectUse(`${this.pretty(door.credential)} credential required`, 'credential', door.credential, new Vector3(door.x, 0, door.z).multiplyScalar(this.world.map.cellSize));
        return;
      }
      this.world.openDoor(door);
      this.audio.tone(160, .22, 'sawtooth', .035);
      this.showMessage('Access granted', .8);
      return;
    }
    const trigger = this.world.map.triggers.find((candidate) => {
      if (!candidate.repeatable && this.triggered.has(candidate.id)) return false;
      const point = new Vector3(candidate.x * this.world.map.cellSize, 0, candidate.z * this.world.map.cellSize);
      return this.horizontalDistance(this.player.position, point) <= 2.2;
    });
    if (trigger) {
      if (trigger.requiresCredential && !this.player.credentials.has(trigger.requiresCredential)) {
        this.rejectUse(`${this.pretty(trigger.requiresCredential)} credential required`, 'credential', trigger.requiresCredential);
        return;
      }
      if (trigger.requiresEncounter && this.isEncounterActive(trigger.requiresEncounter)) {
        this.rejectUse(trigger.requiresEncounter.startsWith('boss-')
          ? 'Binding authority remains active'
          : `${this.pretty(trigger.requiresEncounter)} remains active`, 'encounter');
        return;
      }
      this.triggered.add(trigger.id);
      if (trigger.action === 'complete-map') {
        const exitControl = this.world.map.triggers.find((candidate) => candidate.action === 'open-exit');
        if (exitControl?.requiresEncounter && this.isEncounterActive(exitControl.requiresEncounter)) {
          this.triggered.delete(trigger.id);
          this.showMessage(exitControl.requiresEncounter.startsWith('boss-')
            ? 'Binding authority remains active'
            : `${this.pretty(exitControl.requiresEncounter)} remains active`);
        } else this.completeMap(trigger.targets[0] as MapId | undefined ?? this.world.map.nextMap);
        return;
      }
      if (trigger.action === 'teleport') {
        const destination = this.world.map.triggers.find((candidate) => trigger.targets.includes(candidate.id));
        if (destination) {
          this.debugTeleport(destination.x * this.world.map.cellSize, destination.z * this.world.map.cellSize);
          this.teleportTell(this.player.position);
        } else {
          this.debugTeleport(this.world.map.exit.x * this.world.map.cellSize, this.world.map.exit.z * this.world.map.cellSize);
          this.teleportTell(this.player.position);
        }
      } else if (trigger.action === 'spawn-wave') {
        this.world.actors.forEach((actor) => { actor.awake = true; });
      } else if (trigger.action === 'reveal-secret') {
        const secretId = trigger.targets.find((target) => this.world.map.secrets.some((secret) => secret.id === target));
        if (secretId && this.world.revealSecret(secretId)) {
          this.tally.secrets += 1;
          this.showMessage('Optional exposure discovered', 1.5);
          this.audio.tone(880, .16, 'triangle', .04);
        }
      } else {
        const mechanismId = trigger.targets.find((target) => this.world.map.mechanisms.some((mechanism) => mechanism.id === target));
        if (this.world.map.id === 'E3M8' && mechanismId) {
          const chief = this.world.actors.find((actor) => actor.id === 'chief-actuary');
          if (chief && !chief.dead) {
            this.triggered.delete(trigger.id);
            this.rejectUse('The gate controls remain sealed by the Chief Actuary', 'encounter');
            return;
          }
          this.world.applyBossMechanism('open-binding-gate', mechanismId);
          this.showMessage(`Binding gate ${this.world.bindingGateCount} of 3 released`, 1.5);
          if (this.world.canExposeCore) {
            this.world.applyBossMechanism('expose-core');
            const core = this.world.actors.find((actor) => actor.id === 'uninsurable');
            if (core) {
              core.phaseLocked = false;
              core.awake = true;
              core.sprite.visible = true;
            }
          }
        } else if (mechanismId) {
          if (!this.world.applyMechanism(mechanismId)) {
            this.triggered.delete(trigger.id);
            this.rejectUse('A prior control must be activated first', 'encounter');
            return;
          }
          this.unlockTargets(this.world.mechanismOpens(mechanismId));
        }
        else this.world.applyTransformation(trigger.action);
      }
      this.audio.tone(210, .24, 'sawtooth', .04);
      this.showMessage(trigger.message ?? this.pretty(trigger.action), 1.4);
      if (trigger.action !== 'open-exit') return;
    }
    const exit = new Vector3(this.world.map.exit.x * this.world.map.cellSize, 0, this.world.map.exit.z * this.world.map.cellSize);
    if (this.horizontalDistance(this.player.position, exit) <= 2.2) {
      if (this.world.actors.some((actor) => actor.kind === 'boss' && !actor.dead)) {
        this.rejectUse('Binding authority remains active', 'encounter', undefined, exit);
        return;
      }
      this.completeMap(this.world.map.nextMap);
      return;
    }
    this.rejectUse('No usable control in reach', 'nothing');
  }

  private unlockTargets(targets: readonly string[]): void {
    targets.forEach((target) => {
      if (this.world.map.encounters.some((encounter) => encounter.id === target)) this.world.unlockEncounter(target);
    });
  }

  private rejectUse(message: string, reason: 'credential' | 'encounter' | 'nothing', credential?: Credential, point?: Vector3): void {
    this.audio.tone(reason === 'nothing' ? 78 : 90, reason === 'nothing' ? .055 : .08, 'square', reason === 'nothing' ? .018 : .03);
    this.showMessage(message, reason === 'nothing' ? .65 : 1.2);
    let direction: 'left' | 'right' | 'center' = 'center';
    if (point) {
      const relative = Math.atan2(point.x - this.player.position.x, point.z - this.player.position.z) - this.player.yaw;
      direction = Math.sin(relative) > .25 ? 'right' : Math.sin(relative) < -.25 ? 'left' : 'center';
    }
    window.dispatchEvent(new CustomEvent('use-failed', { detail: { reason, direction, icon: credential ?? (reason === 'encounter' ? 'authority' : 'use'), ...(credential ? { credential } : {}) } }));
  }

  private isEncounterActive(id: string): boolean {
    return this.world.actors.some((actor) => !actor.dead && (actor.encounter === id || (id.startsWith('boss-') && actor.kind === 'boss' && actor.encounter === id)));
  }

  private teleportTell(position: Vector3): void {
    this.audio.tone(240, .18, 'square', .045);
    if (this.accessibility.reducedEffects) return;
    const sprite = this.createEffectSprite('/public_runtime/effects/teleport-approval-ring/fx_teleport-approval-ring_peak.png', 2.2);
    sprite.position.copy(position).setY(this.world.floorHeightAt(position) + .08);
    window.setTimeout(() => { this.world.root.remove(sprite); sprite.material.dispose(); }, 320);
  }

  private completeMap(nextMap?: MapId): void {
    this.persistence.completeMap(this.world.map.id);
    if (this.world.map.index === 8) {
      const episode = CAMPAIGN.episodes.find((candidate) => candidate.id === this.world.map.episode);
      const nextEpisode = episode && CAMPAIGN.episodes[episode.number];
      this.persistence.completeEpisode(this.world.map.episode, nextEpisode?.id);
    }
    this.nextMap = nextMap;
    this.mode = 'intermission';
    this.audio.stopMusic();
    document.exitPointerLock();
    this.onIntermission?.(nextMap);
    this.emit();
  }

  continueFromIntermission(): void {
    if (!this.nextMap) {
      this.mode = 'complete';
      this.emit();
      return;
    }
    const currentEpisode = Number(this.world.map.id[1]);
    const nextEpisode = Number(this.nextMap[1]);
    if (currentEpisode !== nextEpisode) this.resetInventory();
    this.loadMap(this.nextMap);
  }

  private die(): void {
    if (this.mode === 'dead') return;
    this.mode = 'dead';
    this.audio.stopMusic();
    document.exitPointerLock();
    this.showMessage('Claim denied', 2);
    this.emit();
  }

  restartFromCheckpoint(): boolean {
    const checkpoint = this.persistence.listAutosaves()
      .filter((entry) => entry.status === 'valid' && entry.state.mapId === this.world.map.id)
      .sort((left, right) => {
        const leftSequence = left.status === 'valid' ? left.metadata.sequence : -1;
        const rightSequence = right.status === 'valid' ? right.metadata.sequence : -1;
        return rightSequence - leftSequence;
      })[0];
    if (checkpoint?.status === 'valid') return this.restoreSave(checkpoint.state);
    const recovery = this.persistence.loadEpisodeRecovery(this.world.map.episode);
    if (recovery.status === 'valid') return this.restoreSave(recovery.state);
    this.loadMap(this.world.map.id, false);
    return true;
  }

  private weaponSelection(command: GameplayCommand): void {
    if (command.weaponSlot > 0) {
      const weapon = Object.values(WEAPONS).find((candidate) => candidate.slot === command.weaponSlot);
      if (weapon) this.requestWeapon(weapon.id);
    }
    if (command.weaponCycle) {
      const owned = [...this.player.weapons].sort((a, b) => WEAPONS[a].slot - WEAPONS[b].slot);
      const index = owned.indexOf(this.player.weapon);
      this.requestWeapon(owned[(index + command.weaponCycle + owned.length) % owned.length]);
    }
  }

  private requestWeapon(id: WeaponId): boolean {
    if (!this.player.weapons.has(id) || id === this.player.weapon || this.pendingWeapon === id) return false;
    this.pendingWeapon = id;
    if (this.weaponState === 'ready') {
      this.weaponState = 'lowering';
      this.weaponTransition = WEAPONS[this.player.weapon].lowerTime;
      window.dispatchEvent(new CustomEvent('weapon-switch', { detail: { from: this.player.weapon, to: id, state: 'lowering', duration: this.weaponTransition } }));
    }
    return true;
  }

  private updateWeaponTransition(dt: number): void {
    if (this.weaponState === 'ready') return;
    this.weaponTransition -= dt;
    if (this.weaponTransition > 0) return;
    if (this.weaponState === 'lowering' && this.pendingWeapon) {
      const from = this.player.weapon;
      this.player.weapon = this.pendingWeapon;
      this.pendingWeapon = undefined;
      this.weaponState = 'raising';
      this.weaponTransition = WEAPONS[this.player.weapon].raiseTime;
      window.dispatchEvent(new CustomEvent('weapon-switch', { detail: { from, to: this.player.weapon, state: 'raising', duration: this.weaponTransition } }));
      return;
    }
    this.weaponState = 'ready';
    this.weaponTransition = 0;
    window.dispatchEvent(new CustomEvent('weapon-switch', { detail: { to: this.player.weapon, state: 'ready', duration: 0 } }));
  }

  private createSaveData(): SaveData {
    return {
      version: 1,
      mode: this.mode === 'paused' ? 'paused' : 'playing',
      mapId: this.world.map.id,
      difficulty: this.difficulty,
      player: {
        health: this.player.health, armor: this.player.armor, armorClass: this.player.armorClass, position: this.player.position.toArray(), yaw: this.player.yaw, pitch: this.player.pitch,
        ammo: { ...this.player.ammo }, weapons: [...this.player.weapons], weapon: this.player.weapon,
        credentials: [...this.player.credentials], floorPlan: this.player.floorPlan, powerups: { ...this.player.powerups },
      },
      actors: this.world.actors.map((actor) => ({
        uid: actor.uid, kind: actor.kind, id: actor.id, health: actor.health, dead: actor.dead, phaseLocked: actor.phaseLocked,
        position: actor.position.toArray(), awake: actor.awake, facing: actor.facing, animationTime: actor.animationTime, attackFlash: actor.attackFlash,
        ...((actor as RuntimeActor & { redacted?: boolean }).redacted ? { redacted: true } : {}),
      })),
      pickups: this.world.pickups.map((pickup) => ({ uid: pickup.uid, collected: pickup.collected })),
      doors: [...this.world.doors.values()].map((door) => ({ key: door.key, open: door.open, progress: door.progress })),
      secrets: [...this.world.discoveredSecrets],
      visited: [...this.world.visitedTiles],
      triggered: [...this.triggered],
      mechanisms: [...this.world.activatedMechanisms],
      hazardsEnabled: this.world.hazardsEnabled,
      tally: { ...this.tally },
      rng: this.rngState,
      enemyBehavior: this.enemyBehavior.serialize(),
      playerProjectiles: this.playerProjectiles.map((projectile) => ({
        id: projectile.id,
        weapon: projectile.weapon,
        position: projectile.position.toArray(),
        velocity: projectile.velocity.toArray(),
        damage: projectile.damage,
        radius: projectile.radius,
        remaining: projectile.remaining,
      })),
      ...(this.bindingBeam ? { bindingBeam: { ...this.bindingBeam } } : {}),
      sectors: this.world.serializeSectorMovers(),
      landmarks: this.world.serializeLandmarks(),
      breakables: this.world.serializeBreakables(),
      bossMechanisms: this.world.serializeBossMechanisms(),
      ammoDrops: this.world.serializeAmmoDrops(),
      runtime: {
        weaponCooldown: this.weaponCooldown,
        damageCooldown: this.damageCooldown,
        messageTimer: this.messageTimer,
        message: this.message,
        walkMode: this.walkMode,
        projectileSequence: this.projectileSequence,
        playerVelocity: this.playerVelocity.toArray(),
        weaponState: this.weaponState,
        weaponTransition: this.weaponTransition,
        ...(this.pendingWeapon ? { pendingWeapon: this.pendingWeapon } : {}),
      },
    };
  }

  private saveMetadata(name?: string, capture = false): SaveMetadataInput {
    return {
      name,
      episodeId: this.world.map.episode,
      mapId: this.world.map.id,
      mapTitle: this.world.map.title,
      difficulty: this.difficulty,
      playSeconds: this.tally.elapsed,
      ...(capture ? { thumbnail: this.captureThumbnail() } : {}),
    };
  }

  private captureThumbnail(): SaveThumbnail {
    try {
      this.render();
      const thumbnail = document.createElement('canvas');
      thumbnail.width = 160;
      thumbnail.height = 100;
      const context = thumbnail.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.imageSmoothingEnabled = false;
      context.drawImage(this.canvas, 0, 0, thumbnail.width, thumbnail.height);
      return { kind: 'image', dataUrl: thumbnail.toDataURL('image/webp', .72), width: 160, height: 100 };
    } catch {
      return { kind: 'placeholder', label: this.world.map.id, palette: ['#d71920', '#f2f0e6'] };
    }
  }

  private checkpoint(): void {
    const state = this.createSaveData();
    const metadata = this.saveMetadata();
    this.persistence.autosave(state, metadata);
    const recovery = this.persistence.loadEpisodeRecovery(this.world.map.episode);
    if (this.world.map.index === 1 || recovery.status !== 'valid') this.persistence.saveEpisodeRecovery(this.world.map.episode, state, metadata);
  }

  save(): void {
    if (!this.world.map) return;
    this.persistence.quicksave(this.createSaveData(), this.saveMetadata(undefined, true));
  }

  saveManual(slot: number, name?: string): void {
    if (!this.world.map) return;
    this.persistence.saveManual(slot, this.createSaveData(), this.saveMetadata(name, true));
  }

  manualSlots(): readonly ManualSlotSummary[] {
    return this.persistence.listManualSlots().map((entry, index) => ({
      slot: index + 1,
      status: entry.status,
      name: entry.status === 'valid' ? entry.metadata.name : entry.defaultName,
      detail: entry.status === 'valid'
        ? `${entry.metadata.mapId} ${entry.metadata.mapTitle} | ${new Date(entry.metadata.savedAt).toLocaleString()}`
        : entry.status === 'invalid' ? `Unreadable: ${entry.reason}` : 'Empty',
      ...(entry.status === 'valid' ? { thumbnail: entry.metadata.thumbnail } : {}),
    }));
  }

  loadManual(slot: number): boolean {
    const result = this.persistence.loadManual(slot);
    if (result.status !== 'valid') return false;
    return this.restoreSave(result.state, false);
  }

  loadQuicksave(): boolean {
    const result = this.persistence.loadQuicksave();
    if (result.status === 'valid') return this.restoreSave(result.state);
    const fallback = this.persistence.newestValidContinue();
    return fallback ? this.restoreSave(fallback.state) : false;
  }

  load(): boolean {
    const result = this.persistence.newestValidContinue();
    return result ? this.restoreSave(result.state) : false;
  }

  private restoreSave(save: SaveData, resume = true): boolean {
    if (!isSaveData(save)) return false;
    try {
      this.difficulty = save.difficulty;
      this.loadMap(save.mapId, true, false);
      Object.assign(this.player, {
        health: save.player.health,
        armor: save.player.armor,
        armorClass: save.player.armorClass ?? (save.player.armor >= 150 ? 'heavy' : save.player.armor > 0 ? 'light' : 'none'),
        yaw: save.player.yaw,
        pitch: save.player.pitch ?? 0,
        ammo: {
          staples: save.player.ammo.staples,
          fasteners: save.player.ammo.fasteners,
          canisters: save.player.ammo.canisters,
          'toner-cells': save.player.ammo['toner-cells'] ?? (save.player.ammo as unknown as { toner?: number }).toner ?? 0,
        },
        weapon: save.player.weapon,
        floorPlan: save.player.floorPlan,
        powerups: save.player.powerups ?? { binder: 0, hazard: 0, rapid: 0, forensic: 0, goggles: 0 },
      });
      this.player.position.fromArray(save.player.position);
      this.player.weapons = new Set(save.player.weapons);
      this.player.credentials = new Set(save.player.credentials);
      this.tally = save.tally;
      this.rngState = save.rng;
      this.world.restoreAmmoDrops(save.ammoDrops ?? []);
      for (const saved of save.actors) {
        let actor = this.world.actors.find((candidate) => candidate.uid === saved.uid);
        if (!actor && saved.kind === 'enemy' && saved.id && saved.id in ENEMIES) {
          actor = this.world.summonEnemy(saved.id as Exclude<RuntimeActor['id'], 'regional-director' | 'aggregate' | 'chief-actuary' | 'uninsurable'>, new Vector3().fromArray(saved.position), saved.uid);
        }
        if (!actor) continue;
        actor.health = saved.health;
        actor.dead = saved.dead;
        actor.phaseLocked = saved.phaseLocked ?? false;
        actor.awake = saved.awake ?? actor.awake;
        actor.facing = saved.facing ?? actor.facing;
        actor.animationTime = saved.animationTime ?? actor.animationTime;
        actor.attackFlash = saved.attackFlash ?? 0;
        (actor as RuntimeActor & { redacted?: boolean }).redacted = saved.redacted ?? false;
        if (saved.redacted) actor.sprite.material.color.set(0xc93434);
        actor.sprite.visible = !actor.phaseLocked;
        actor.position.fromArray(saved.position);
        actor.sprite.position.copy(actor.position);
        if (actor.dead) this.setActorDeadVisual(actor);
      }
      for (const saved of save.pickups) {
        const pickup = this.world.pickups.find((candidate) => candidate.uid === saved.uid);
        if (pickup) { pickup.collected = saved.collected; pickup.sprite.visible = !saved.collected; }
      }
      this.world.restoreBossMechanisms(save.bossMechanisms);
      save.doors.forEach((saved) => {
        const state = typeof saved === 'string' ? { key: saved, open: true, progress: 1 } : saved;
        const door = this.world.doors.get(state.key);
        if (door) this.world.restoreDoor(door, state.open, state.progress);
      });
      this.world.restoreSectorMovers(save.sectors ?? []);
      this.world.restoreLandmarks(save.landmarks ?? []);
      this.world.restoreBreakables(save.breakables ?? []);
      this.world.restoreSecrets(save.secrets);
      save.visited?.forEach((key) => this.world.visitedTiles.add(key));
      save.triggered?.forEach((key) => this.triggered.add(key));
      this.world.restoreActivatedMechanisms(save.mechanisms ?? []);
      if (save.hazardsEnabled === false && this.world.hazardsEnabled) this.world.applyTransformation('drain-liquid');
      if (save.enemyBehavior) this.enemyBehavior.restore(save.enemyBehavior);
      for (const actor of this.world.actors) {
        const state = this.enemyBehavior.getActorState(actor.uid);
        actor.sprite.material.opacity = state?.visible === false ? .18 : 1;
        actor.sprite.material.depthWrite = state?.visible !== false;
      }
      const combatState = this.enemyBehavior.serialize();
      this.syncCombatEffects(combatState.projectiles, combatState.hazards);
      this.playerProjectiles.length = 0;
      for (const saved of save.playerProjectiles ?? []) {
        const projectile: PlayerProjectile = {
          ...saved,
          position: new Vector3().fromArray(saved.position),
          velocity: new Vector3().fromArray(saved.velocity),
        };
        this.playerProjectiles.push(projectile);
        this.syncPlayerProjectileSprite(projectile);
        const sequence = Number.parseInt(projectile.id.split('-').at(-1) ?? '0', 10);
        if (Number.isFinite(sequence)) this.projectileSequence = Math.max(this.projectileSequence, sequence + 1);
      }
      this.bindingBeam = save.bindingBeam ? { ...save.bindingBeam } : undefined;
      if (save.runtime) {
        this.weaponCooldown = save.runtime.weaponCooldown;
        this.damageCooldown = save.runtime.damageCooldown;
        this.messageTimer = save.runtime.messageTimer;
        this.message = save.runtime.message;
        this.walkMode = save.runtime.walkMode;
        this.projectileSequence = save.runtime.projectileSequence;
        this.playerVelocity.fromArray(save.runtime.playerVelocity);
        this.weaponState = save.runtime.weaponState ?? 'ready';
        this.weaponTransition = save.runtime.weaponTransition ?? 0;
        this.pendingWeapon = save.runtime.pendingWeapon;
      } else {
        this.weaponCooldown = 0;
        this.damageCooldown = 0;
        this.messageTimer = 0;
        this.message = '';
        this.walkMode = false;
        this.playerVelocity.set(0, 0, 0);
        this.weaponState = 'ready';
        this.weaponTransition = 0;
        this.pendingWeapon = undefined;
      }
      this.mode = resume ? 'playing' : 'paused';
      this.updateVisionEffects();
      this.updateCamera();
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  hasSave(): boolean { return Boolean(this.persistence.newestValidContinue()); }
  get pendingMap(): MapId | undefined { return this.nextMap; }

  startDemoRecording(): boolean {
    if (this.mode !== 'playing' || !this.world.map || this.demoRecorder) return false;
    const initialState = this.createSaveData();
    this.demoRecorder = new DemoRecorder<SaveData, GameplayCommand>({
      tickRate: 35,
      seed: initialState.rng,
      mapId: initialState.mapId,
      initialState,
    });
    this.demoTick = 0;
    return true;
  }

  finishDemoRecording(): DemoData<SaveData, GameplayCommand> | undefined {
    if (!this.demoRecorder) return undefined;
    const demo = this.demoRecorder.finish(this.demoTick);
    this.demoRecorder = undefined;
    this.demoTick = 0;
    return demo;
  }

  playDemo(value: unknown): boolean {
    const validation = validateDemo<SaveData, GameplayCommand>(value, {
      validateInitialState: isSaveData,
      validateCommand: isGameplayCommand,
    });
    if (!validation.valid) return false;
    const demo = validation.demo;
    if (demo.tickRate !== 35 || demo.mapId !== demo.initialState.mapId || demo.seed !== demo.initialState.rng) return false;
    this.demoRecorder = undefined;
    this.demoTick = 0;
    if (!this.restoreSave(demo.initialState, true)) return false;
    const playback = new DemoPlayback<GameplayCommand>(demo);
    while (!playback.finished && this.mode === 'playing') {
      const commands = playback.next();
      this.simulate(STEP, commands.at(-1) ?? NEUTRAL_COMMAND, false);
    }
    this.mode = 'paused';
    document.exitPointerLock();
    this.emit();
    this.render();
    return playback.finished;
  }

  isEpisodeUnlocked(episodeIndex: number): boolean {
    const episode = CAMPAIGN.episodes[episodeIndex];
    return Boolean(episode && this.persistence.isEpisodeUnlocked(episode.id));
  }

  campaignProgress(): { completedMaps: readonly string[]; completedEpisodes: readonly string[]; unlockedEpisodes: readonly string[] } {
    const progress = this.persistence.campaignUnlocks();
    return {
      completedMaps: progress.completedMaps,
      completedEpisodes: progress.completedEpisodes,
      unlockedEpisodes: progress.unlockedEpisodes,
    };
  }

  setRadialSelecting(active: boolean): void { this.radialSelecting = active; }

  selectWeapon(id: WeaponId): boolean {
    return this.requestWeapon(id);
  }

  startMapFromSelect(mapId: MapId, difficulty: GameDifficulty = 'field-adjuster'): void {
    const map = CAMPAIGN.maps[mapId];
    if (!map || !this.persistence.isEpisodeUnlocked(map.episode)) throw new Error(`Locked map ${mapId}`);
    const progress = this.persistence.campaignUnlocks();
    const episode = CAMPAIGN.episodes.find((candidate) => candidate.id === map.episode)!;
    const mapIndex = episode.maps.indexOf(map.id);
    const available = mapIndex === 0 || progress.completedMaps.includes(map.id) || progress.completedMaps.includes(episode.maps[mapIndex - 1]);
    if (!available) throw new Error(`Locked map ${mapId}`);
    this.difficulty = difficulty;
    this.resetInventory();
    this.loadMap(mapId, true);
  }

  private migrateLegacySave(): void {
    if (this.persistence.newestValidContinue()) return;
    const raw = localStorage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return;
    try {
      const state: unknown = JSON.parse(raw);
      if (!isSaveData(state)) return;
      const map = CAMPAIGN.maps[state.mapId];
      this.persistence.quicksave(state, {
        episodeId: map.episode,
        mapId: map.id,
        mapTitle: map.title,
        difficulty: state.difficulty,
        playSeconds: state.tally?.elapsed ?? 0,
        name: 'Migrated Quicksave',
      });
    } catch {
      // Legacy data remains untouched when it cannot be migrated.
    }
  }

  debugTeleport(x: number, z: number): void {
    this.player.position.set(x, 0, z);
    this.player.position.y = this.world.floorHeightAt(this.player.position) + 1.35;
    this.updateCamera();
  }

  debugDefeatAll(): void {
    this.world.actors.forEach((actor) => { if (!actor.dead) this.damageActor(actor, actor.health + 1); });
  }

  debugTeleportToPickup(kind: 'pickup' | 'weapon' | 'credential', id?: string): boolean {
    const pickup = this.world.pickups.find((candidate) => !candidate.collected && candidate.kind === kind && (!id || candidate.id === id));
    if (!pickup) return false;
    this.debugTeleport(pickup.position.x, pickup.position.z);
    return true;
  }

  debugTeleportToDoor(credential?: Credential): boolean {
    const door = [...this.world.doors.values()].find((candidate) => !candidate.open && candidate.credential === credential);
    if (!door) return false;
    this.debugTeleport(door.mesh.position.x, door.mesh.position.z + 1.7);
    return true;
  }

  debugTeleportToExit(): void {
    this.debugTeleport(this.world.map.exit.x * this.world.map.cellSize, this.world.map.exit.z * this.world.map.cellSize);
  }

  debugUse(): void { this.use(); }
  debugFire(): void { this.weaponCooldown = 0; this.fireWeapon(); }

  debugTeleportToTrigger(action: string): boolean {
    const trigger = this.world.map.triggers.find((candidate) => candidate.action === action
      && (candidate.repeatable || !this.triggered.has(candidate.id)));
    if (!trigger) return false;
    this.debugTeleport(trigger.x * this.world.map.cellSize, trigger.z * this.world.map.cellSize);
    return true;
  }

  debugDefeatActor(id: string): boolean {
    const actor = this.world.actors.find((candidate) => candidate.id === id && !candidate.dead);
    if (!actor) return false;
    this.damageActor(actor, actor.health + 1);
    return actor.dead;
  }

  debugTeleportNearActor(id: string, distance = 7): boolean {
    const actor = this.world.actors.find((candidate) => candidate.id === id && !candidate.dead && !candidate.phaseLocked);
    if (!actor) return false;
    const directions = [
      [0, 1], [1, 0], [0, -1], [-1, 0],
      [.707, .707], [.707, -.707], [-.707, -.707], [-.707, .707],
    ] as const;
    const candidates: Vector3[] = [];
    for (let radius = Math.max(1.5, distance); radius >= 1.5; radius -= .5) {
      directions.forEach(([dx, dz]) => {
        const x = actor.position.x + dx * radius;
        const z = actor.position.z + dz * radius;
        const candidate = new Vector3(x, 0, z);
        candidate.y = this.world.floorHeightAt(candidate) + 1.35;
        candidates.push(candidate);
      });
    }
    const point = candidates.find((candidate) => !this.world.isSolid(candidate) && this.world.hasLineOfSight(candidate, actor.position));
    if (!point) return false;
    this.player.position.copy(point);
    this.player.yaw = Math.atan2(actor.position.x - point.x, actor.position.z - point.z) + Math.PI + .18;
    actor.awake = true;
    this.updateCamera();
    return true;
  }

  debugTeleportNearLandmark(index = 0, distance = 6): boolean {
    const landmark = [...this.world.landmarks.values()][index];
    if (!landmark) return false;
    const point = landmark.sprite.position.clone().add(new Vector3(distance, 0, 0));
    if (this.world.isSolid(point)) point.copy(landmark.sprite.position).add(new Vector3(0, 0, distance));
    if (this.world.isSolid(point)) return false;
    this.debugTeleport(point.x, point.z);
    this.player.yaw = Math.atan2(landmark.sprite.position.x - point.x, landmark.sprite.position.z - point.z) + Math.PI + .12;
    this.updateCamera();
    return true;
  }

  renderText(): string {
    const visibleActors = this.world.actors.filter((actor) => !actor.dead && !actor.phaseLocked
      && this.horizontalDistance(actor.position, this.player.position) < 22
      && this.world.hasLineOfSight(this.player.position, actor.position)).map((actor) => ({ id: actor.id, kind: actor.kind, x: +actor.position.x.toFixed(2), z: +actor.position.z.toFixed(2), health: Math.ceil(actor.health), distance: +this.horizontalDistance(actor.position, this.player.position).toFixed(2) }));
    const nearbyPickups = this.world.pickups.filter((pickup) => !pickup.collected && this.horizontalDistance(pickup.position, this.player.position) < 14).map((pickup) => ({ id: pickup.id, kind: pickup.kind, x: +pickup.position.x.toFixed(2), z: +pickup.position.z.toFixed(2) }));
    return JSON.stringify({
      coordinateSystem: 'world units; x increases east/right on automap, z increases south/down; yaw 0 faces north (-z)',
      mode: this.mode,
      map: this.world.map ? { id: this.world.map.id, title: this.world.map.title, exit: this.world.map.exit } : null,
      player: { x: +this.player.position.x.toFixed(2), z: +this.player.position.z.toFixed(2), yaw: +this.player.yaw.toFixed(3), pitch: +this.player.pitch.toFixed(3), health: Math.ceil(this.player.health), armor: Math.ceil(this.player.armor), armorClass: this.player.armorClass, weapon: this.player.weapon, ammo: this.player.ammo, credentials: [...this.player.credentials], powerups: this.player.powerups },
      visibleActors,
      nearbyPickups,
      closedDoors: [...this.world.doors.values()].filter((door) => !door.open).map((door) => ({ x: door.x, z: door.z, credential: door.credential ?? null })),
      world: {
        hazardsEnabled: this.world.hazardsEnabled,
        triggered: [...this.triggered],
        sectorMovers: this.world.serializeSectorMovers().map((sector) => ({ key: sector.key, height: +sector.height.toFixed(3), targetHeight: sector.targetHeight })),
        landmarks: this.world.serializeLandmarks().map((landmark) => ({ key: landmark.key, active: landmark.active, x: +landmark.position[0].toFixed(2), z: +landmark.position[2].toFixed(2) })),
        breakables: this.world.serializeBreakables(),
        bindingGates: this.world.bindingGateCount,
      },
      combatEffects: {
        projectiles: this.enemyBehavior.serialize().projectiles.map((item) => ({ id: item.id, kind: item.kind, x: +item.position.x.toFixed(2), z: +item.position.z.toFixed(2) })),
        hazards: this.enemyBehavior.serialize().hazards.map((item) => ({ id: item.id, kind: item.kind, armed: item.armed, x: +item.position.x.toFixed(2), z: +item.position.z.toFixed(2), remaining: +item.remaining.toFixed(2) })),
        playerProjectiles: this.playerProjectiles.map((item) => ({ id: item.id, weapon: item.weapon, x: +item.position.x.toFixed(2), z: +item.position.z.toFixed(2), remaining: +item.remaining.toFixed(2) })),
        bindingPulses: this.bindingBeam?.pulses ?? 0,
      },
      bosses: this.world.actors.filter((actor) => actor.kind === 'boss').map((actor) => ({ id: actor.id, health: actor.health, dead: actor.dead, phaseLocked: actor.phaseLocked })),
      tally: this.tally,
      message: this.message,
      demo: { recording: Boolean(this.demoRecorder), tick: this.demoTick },
      runtime: {
        textureCount: this.assets.textures.size,
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
      },
    });
  }

  private render(): void {
    for (const pickup of this.world.pickups) {
      pickup.sprite.visible = !pickup.collected
        && !this.world.isConcealedAt(pickup.position)
        && this.horizontalDistance(pickup.position, this.player.position) <= 28
        && this.world.hasLineOfSight(this.player.position, pickup.position);
    }
    this.renderer.render(this.scene, this.camera);
  }
  private emit(): void { if (this.world.map) this.onChange?.({ mode: this.mode, map: this.world.map, player: this.player, tally: this.tally, boss: this.world.actors.find((actor) => actor.kind === 'boss' && !actor.dead && !actor.phaseLocked), message: this.message }); }
  private showMessage(message: string, duration = 1.2): void { this.message = message; this.messageTimer = duration; }
  private pretty(value: string): string { return value.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' '); }
  private random(): number { this.rngState = (Math.imul(1664525, this.rngState) + 1013904223) >>> 0; return this.rngState / 0x100000000; }
  private horizontalDistance(a: Vector3, b: Vector3): number { return Math.hypot(a.x - b.x, a.z - b.z); }
  private actorPan(actor: RuntimeActor): number {
    const angle = Math.atan2(actor.position.x - this.player.position.x, actor.position.z - this.player.position.z);
    return Math.max(-1, Math.min(1, Math.sin(angle - this.player.yaw)));
  }

  private resetInventory(): void {
    this.player.health = 100;
    this.player.armor = 0;
    this.player.armorClass = 'none';
    this.player.ammo = { staples: 50, fasteners: 0, canisters: 0, 'toner-cells': 0 };
    this.player.weapons = new Set<WeaponId>(['claim-stamp', 'staple-driver']);
    this.player.weapon = 'staple-driver';
    this.weaponState = 'ready';
    this.weaponTransition = 0;
    this.pendingWeapon = undefined;
    this.player.credentials.clear();
    this.player.floorPlan = false;
    this.player.powerups = { binder: 0, hazard: 0, rapid: 0, forensic: 0, goggles: 0 };
  }
}
