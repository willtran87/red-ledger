import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  FogExp2,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
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
import { directionFromView, rayVerticalCylinderDistance, sampleShotSpread } from './CombatMath';
import { DIFFICULTY, ENEMIES, WEAPONS, type AmmoType, type GameDifficulty } from './definitions';
import {
  actorDeathEffects,
  breakableDestructionEffects,
  fraudVisibilityEffect,
  projectileResolutionEffect,
  resurrectionEffect,
  type AuthoredEffectCue,
} from './EffectSemantics';
import {
  EnemyBehaviorSystem,
  buildNavigationDistanceField,
  navigationDirectionFromField,
  type ActorBehaviorState,
  type BehaviorActor,
  type BehaviorEvent,
  type BehaviorTarget,
  type BehaviorVector,
  type DamageKind,
  type EnemyBehaviorSnapshot,
  type HazardState,
  type NavigationCell,
  type NavigationDistanceField,
  type NavigationGridAdapter,
  type ProjectileState,
} from './EnemyBehaviorSystem';
import { InputSystem } from './InputSystem';
import { ParticleSystem, type ParticleKind, type ParticlePriority } from './ParticleSystem';
import {
  DemoPlayback,
  DemoRecorder,
  DEMO_STORAGE_BUDGET_BYTES,
  PersistenceSystem,
  validateDemo,
  type DemoData,
  type CampaignUnlocks,
  type MapPerformance,
  type MapRecord,
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

export interface CombatMomentum {
  chain: number;
  best: number;
  score: number;
  timer: number;
}

export interface MapResult {
  readonly performance: MapPerformance;
  readonly record: MapRecord;
  readonly completionBonus: number;
  readonly newBests: readonly string[];
  readonly secretRoute: boolean;
}

export interface InteractionHint {
  label: string;
  icon: string;
  state: 'ready' | 'locked';
}

export interface GameSnapshot {
  mode: GameMode;
  map: CampaignMap;
  player: PlayerState;
  tally: MapTally;
  momentum: CombatMomentum;
  boss?: RuntimeActor;
  message: string;
  objective: string;
  interaction?: InteractionHint;
  replay?: { currentTick: number; totalTicks: number; paused: boolean; finished: boolean; speed: number };
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
    uid: string; kind?: 'enemy' | 'boss'; id?: RuntimeActor['id']; health: number; dead: boolean; scoreEligible?: boolean; phaseLocked: boolean;
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
  momentum?: CombatMomentum;
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

interface AnimatedEffect {
  readonly family: string;
  readonly sprite: Sprite;
  readonly frames: readonly string[];
  readonly frameDuration: number;
  elapsed: number;
  frame: number;
}

type SemanticCueKind =
  | 'deflection' | 'neutralize' | 'authority' | 'scan' | 'inspection-scan'
  | 'momentum' | 'rejection' | 'map-clear' | 'secret' | 'teleport';

interface SemanticCue {
  readonly kind: SemanticCueKind;
  readonly sprite: Sprite;
  readonly baseSize: number;
  readonly duration: number;
  elapsed: number;
}

interface BeamVisual {
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly line: Line<BufferGeometry, LineBasicMaterial>;
  readonly impact: Sprite;
  elapsed: number;
  length: number;
}

interface HostileBeamVisual {
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly line: Line<BufferGeometry, LineBasicMaterial>;
  readonly impact?: Sprite;
  readonly source: Vector3;
  readonly endpoint: Vector3;
  readonly duration: number;
  readonly hit: boolean;
  elapsed: number;
  length: number;
}

interface ActiveDemoPlayback {
  readonly demo: DemoData<SaveData, GameplayCommand>;
  readonly playback: DemoPlayback<GameplayCommand>;
  paused: boolean;
  finished: boolean;
  speed: number;
  tickCredit: number;
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
export const MAX_DEMO_TICKS = 35 * 60 * 45;
const ADDITIVE_PARTICLE_KINDS: ReadonlySet<ParticleKind> = new Set([
  'spark', 'ember', 'energy', 'approval', 'metal', 'deflection', 'neutralize',
  'authority', 'scan', 'momentum', 'rejection',
]);
const SEMANTIC_CUE_ASSETS: Readonly<Record<SemanticCueKind, string>> = {
  deflection: '/public_runtime/effects/particle-status-feedback/fx_particle-status-feedback_F_01.png',
  neutralize: '/public_runtime/effects/particle-status-feedback/fx_particle-status-feedback_F_02.png',
  authority: '/public_runtime/effects/particle-status-feedback/fx_particle-status-feedback_F_03.png',
  scan: '/public_runtime/effects/particle-status-feedback/fx_particle-status-feedback_F_04.png',
  'inspection-scan': '/public_runtime/effects/particle-status-feedback/fx_particle-status-feedback_F_05.png',
  momentum: '/public_runtime/effects/particle-status-feedback/fx_particle-status-feedback_F_06.png',
  rejection: '/public_runtime/effects/particle-status-feedback/fx_particle-status-feedback_F_07.png',
  'map-clear': '/public_runtime/effects/particle-status-feedback/fx_particle-status-feedback_F_08.png',
  secret: '/public_runtime/effects/particle-world-feedback/fx_particle-world-feedback_F_05.png',
  teleport: '/public_runtime/effects/particle-world-feedback/fx_particle-world-feedback_F_07.png',
};
const SEMANTIC_CUE_SIZES: Readonly<Record<SemanticCueKind, number>> = {
  deflection: .62,
  neutralize: .58,
  authority: .68,
  scan: .6,
  'inspection-scan': .6,
  momentum: .7,
  rejection: .58,
  'map-clear': .66,
  secret: .66,
  teleport: .78,
};
const PARTICLE_SEMANTIC_CUES: Readonly<Partial<Record<ParticleKind, SemanticCueKind>>> = {
  deflection: 'deflection',
  neutralize: 'neutralize',
  authority: 'authority',
  scan: 'scan',
  momentum: 'momentum',
  rejection: 'rejection',
  confetti: 'map-clear',
};
const MAX_ANIMATED_EFFECTS = 10;
const ANIMATED_EFFECT_COALESCE_DISTANCE_SQ = .75 * .75;

export const particleEmissionCount = (
  kind: ParticleKind,
  requested: number,
  accessibility: Pick<GameEngine['accessibility'], 'reducedEffects' | 'flashEffects'>,
): number => {
  const count = Math.max(0, Math.floor(requested));
  if (!accessibility.flashEffects && ADDITIVE_PARTICLE_KINDS.has(kind)) return 0;
  return accessibility.reducedEffects && count > 0 ? 1 : count;
};

export interface ParticlePickupDescriptor {
  kind: 'pickup' | 'weapon' | 'credential';
  id: string;
  ammoDrop?: { ammoId: AmmoType };
}

export const pickupParticleFeedbackKind = (pickup: ParticlePickupDescriptor): ParticleKind => {
  if (pickup.kind === 'credential') return 'approval';
  if (pickup.kind === 'weapon') return 'metal';
  if (pickup.ammoDrop?.ammoId === 'toner-cells' || pickup.id === 'toner-cell' || pickup.id === 'toner-pack') return 'toner';
  if (pickup.ammoDrop?.ammoId === 'canisters' || pickup.id.includes('canister')) return 'wax';
  if (pickup.ammoDrop?.ammoId === 'fasteners' || pickup.id.includes('fastener')) return 'metal';
  if (pickup.id === 'temporary-binder') return 'deflection';
  if (pickup.id === 'hazard-endorsement') return 'neutralize';
  if (pickup.id === 'rapid-authority') return 'authority';
  if (pickup.id === 'forensic-lens' || pickup.id === 'floor-plan') return 'scan';
  if (pickup.id === 'night-inspection-goggles') return 'scan';
  return 'paper';
};

export const impactParticleDirection = (travelDirection: Readonly<Vector3>): Vector3 =>
  new Vector3(-travelDirection.x, -travelDirection.y, -travelDirection.z).normalize();

export const promoteRecent = <T>(entries: T[], index: number): T | undefined => {
  if (index < 0 || index >= entries.length) return undefined;
  const [entry] = entries.splice(index, 1);
  entries.push(entry);
  return entry;
};
const browserStorage = (): Storage => {
  try {
    return window.localStorage;
  } catch (error) {
    const fail = (): never => { throw error; };
    return {
      get length(): number { return fail(); },
      clear: fail,
      getItem: fail,
      key: fail,
      removeItem: fail,
      setItem: fail,
    } as Storage;
  }
};
const DIFFICULTY_SCORE_MULTIPLIER: Record<GameDifficulty, number> = {
  orientation: .75,
  'desk-adjuster': .9,
  'field-adjuster': 1,
  'catastrophe-team': 1.2,
  'binding-authority': 1.5,
};

const tallyPercent = (value: number, total: number): number => total > 0 ? Math.round(value / total * 100) : 100;

const performanceGrade = (kills: number, items: number, secrets: number, elapsed: number, parSeconds: number): MapPerformance['grade'] => {
  const time = elapsed <= parSeconds ? 100 : Math.max(0, 100 - (elapsed / Math.max(1, parSeconds) - 1) * 60);
  const mastery = kills * .35 + items * .15 + secrets * .25 + time * .25;
  if (mastery >= 95 && elapsed <= parSeconds) return 'S';
  if (mastery >= 85) return 'A';
  if (mastery >= 70) return 'B';
  if (mastery >= 55) return 'C';
  return 'D';
};

const WINDUP_VISUALS: Readonly<Record<string, string>> = {
  'staple-burst': 'aim',
  'ember-claims': 'charge',
  'survey-lunge': 'lunge',
  'liability-orbs': 'charge',
  'denial-beam': 'lock-on',
  'reserve-spill': 'hazard-spit',
  'loss-prediction': 'predict',
  'reopen-file': 'resurrect',
  'response-canister': 'canister',
  'executive-volley': 'canister',
  'authority-summons': 'summon',
  'joined-loss-emitters': 'dual',
  'joined-loss-right': 'right-emit',
  'aggregate-pool': 'left-emit',
  'total-loss-ring': 'dual',
  'actuarial-prediction': 'predict',
  'probability-salvo': 'salvo',
  'certainty-lunge': 'run',
};

const ACTIVE_VISUALS: Readonly<Record<string, string>> = {
  'reserve-spill': 'hazard-spit',
  'loss-prediction': 'impact-call',
  'reopen-file': 'resurrect',
  'response-canister': 'canister',
  'executive-volley': 'canister',
  'authority-summons': 'summon',
  'joined-loss-emitters': 'dual',
  'joined-loss-right': 'right-emit',
  'aggregate-pool': 'left-emit',
  'total-loss-ring': 'dual',
  'actuarial-prediction': 'predict',
  'probability-salvo': 'salvo',
  'certainty-lunge': 'run',
};

export interface ManualSlotSummary {
  slot: number;
  slotId: string;
  kind: 'manual' | 'quicksave' | 'autosave' | 'recovery';
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
  if (value.momentum !== undefined && !isFiniteRecord(value.momentum, ['chain', 'best', 'score', 'timer'])) return false;
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
  readonly particles: ParticleSystem;
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
  readonly momentum: CombatMomentum = { chain: 0, best: 0, score: 0, timer: 0 };
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
  private readonly enemyProjectileTrailTimers = new Map<string, number>();
  private readonly hazardSprites = new Map<string, Sprite>();
  private readonly playerProjectiles: PlayerProjectile[] = [];
  private readonly playerProjectileSprites = new Map<string, Sprite>();
  private readonly playerProjectileTrailTimers = new Map<string, number>();
  private projectileSequence = 0;
  private bindingBeam?: { pulses: number; timer: number };
  private bindingBeamVisual?: BeamVisual;
  private readonly hostileBeamVisuals: HostileBeamVisual[] = [];
  private readonly hostileNavigationFields = new Map<string, NavigationDistanceField>();
  private hostileNavigationTopology = '';
  private demoRecorder?: DemoRecorder<SaveData, GameplayCommand>;
  private demoTick = 0;
  private activeDemo?: ActiveDemoPlayback;
  private demoReadOnly = false;
  private radialSelecting = false;
  private weaponState: 'ready' | 'lowering' | 'raising' = 'ready';
  private weaponTransition = 0;
  private pendingWeapon?: WeaponId;
  private renderScale = 1;
  private halted = false;
  private ambientParticleTimer = 0;
  private lastMapResult?: MapResult;
  private readonly animatedEffects: AnimatedEffect[] = [];
  private readonly semanticCues: SemanticCue[] = [];

  private constructor(private readonly canvas: HTMLCanvasElement, readonly assets: AssetCatalog) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.setRenderScale(1);
    this.renderer.outputColorSpace = 'srgb';
    this.camera.rotation.order = 'YXZ';
    this.input = new InputSystem(canvas);
    window.addEventListener('resize', () => this.applyViewportSize());
    this.world = new World(this.scene, this.camera, assets);
    this.particles = new ParticleSystem(this.scene);
    const storage = browserStorage();
    this.persistence = new PersistenceSystem<SaveData>(storage, {
      namespace: 'red-ledger-v2',
      gameVersion: '1',
      episodeIds: CAMPAIGN.episodes.map((episode) => episode.id),
      initialUnlockedEpisodes: [CAMPAIGN.episodes[0].id],
      validateState: isSaveData,
    });
    this.migrateLegacySave(storage);
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
    this.demoRecorder = undefined;
    this.demoTick = 0;
    if (!preserveInventory) this.resetInventory();
    this.clearAnimatedEffects();
    this.assets.disposeTextures();
    this.particles.clearTextureBindings();
    this.configureParticleTextures();
    this.world.load(map, DIFFICULTY[this.difficulty].placement);
    this.particles.clear();
    this.ambientParticleTimer = .7;
    this.enemyBehavior.clear();
    this.projectileSprites.clear();
    this.enemyProjectileTrailTimers.clear();
    this.hazardSprites.clear();
    this.playerProjectiles.length = 0;
    this.playerProjectileSprites.clear();
    this.playerProjectileTrailTimers.clear();
    this.projectileSequence = 0;
    this.bindingBeam = undefined;
    this.clearBindingBeamVisual();
    this.clearHostileBeamVisuals();
    this.hostileNavigationFields.clear();
    this.hostileNavigationTopology = '';
    this.audio.clearSpatialDiagnostics();
    this.activeDemo = undefined;
    this.lastMapResult = undefined;
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
    Object.assign(this.momentum, { chain: 0, best: 0, score: 0, timer: 0 });
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
    this.audio.suspend();
    document.exitPointerLock();
    this.emit();
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.audio.resume();
    this.emit();
  }

  shutdownForFatal(): void {
    if (this.halted) return;
    this.halted = true;
    cancelAnimationFrame(this.animationFrame);
    if (this.activeDemo) this.activeDemo.paused = true;
    if (this.mode === 'playing') this.mode = 'paused';
    this.audio.stopMusic();
    this.audio.suspend();
    document.exitPointerLock();
  }

  step(seconds: number): void {
    if (this.halted || this.mode !== 'playing') return;
    const ticks = Math.round(Math.min(.25, Math.max(0, seconds)) / STEP);
    for (let tick = 0; tick < ticks; tick += 1) {
      if (this.activeDemo) this.advanceDemoPlayback();
      else this.simulate(STEP);
    }
    this.render();
  }

  private loop(now: number): void {
    if (this.halted) return;
    const elapsed = Math.min(.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.mode === 'playing') {
      this.accumulator += elapsed;
      while (this.accumulator >= STEP) {
        if (this.activeDemo) this.advanceDemoPlayback();
        else this.simulate(STEP);
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
    this.momentum.timer = Math.max(0, this.momentum.timer - dt);
    if (this.momentum.timer === 0) this.momentum.chain = 0;
    this.weaponCooldown = Math.max(0, this.weaponCooldown - dt);
    this.updateWeaponTransition(dt);
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    this.particles.update(dt);
    this.updateAnimatedEffects(dt);
    this.updateSemanticCues(dt);
    this.updateAmbientParticles(dt);
    for (const key of Object.keys(this.player.powerups) as Array<keyof PlayerState['powerups']>) {
      this.player.powerups[key] = Math.max(0, this.player.powerups[key] - dt);
    }
    this.updateVisionEffects();
    if (this.messageTimer === 0) this.message = '';
    const command = playbackCommand ?? this.captureGameplayCommand();
    if (recordDemo && this.demoRecorder) {
      if (!this.demoRecorder.record(this.demoTick, command)) {
        const demo = this.finishDemoRecording();
        if (demo) window.dispatchEvent(new CustomEvent('demo-recording-complete', { detail: { demo, reason: 'size' } }));
      } else {
        this.demoTick += 1;
      }
      if (this.demoRecorder && this.demoTick >= MAX_DEMO_TICKS) {
        const demo = this.finishDemoRecording();
        if (demo) window.dispatchEvent(new CustomEvent('demo-recording-complete', { detail: { demo, reason: 'duration' } }));
      }
    }
    if (command.walkToggle) this.walkMode = !this.walkMode;
    this.movePlayer(dt, command);
    this.updatePickups();
    this.world.updateMovers(dt);
    this.world.markVisited(this.player.position);
    this.updateSecrets();
    this.updatePlayerProjectiles(dt);
    this.updateBindingBeam(dt);
    this.updateEnemies(dt);
    this.updateHostileBeamVisuals(dt);
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
    if (this.world.isHazardAt(this.player.position) && this.damageCooldown <= 0) {
      if (this.player.powerups.hazard > 0) this.playSemanticCue('neutralize', this.player.position.clone().add(new Vector3(0, -.55, 0)));
      else {
        this.damagePlayer(this.world.hazardDamageAt(this.player.position) * .4);
        this.emitParticles(this.world.episode === 2 ? 'water' : 'spittle', this.player.position.clone().add(new Vector3(0, -.75, 0)), 5);
      }
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

  private aimDirection(yawOffset = 0, pitchOffset = 0): Vector3 {
    const direction = directionFromView(this.player.yaw, this.player.pitch, yawOffset, pitchOffset);
    return new Vector3(direction.x, direction.y, direction.z);
  }

  private fireWeapon(): void {
    if (this.weaponCooldown > 0 || this.weaponState !== 'ready') return;
    const weapon = WEAPONS[this.player.weapon];
    if (weapon.ammo !== 'none' && this.player.ammo[weapon.ammo] < weapon.ammoCost) {
      this.weaponCooldown = .25;
      this.audio.tone(80, .06, 'square', .025);
      const fallback = this.bestUsableWeapon(weapon.id);
      this.showMessage(fallback
        ? `${this.pretty(weapon.ammo)} needed - switching to ${this.pretty(fallback)}`
        : `${this.pretty(weapon.ammo)} needed`, .9);
      window.dispatchEvent(new CustomEvent('weapon-dry', { detail: { weapon: weapon.id } }));
      if (fallback) this.requestWeapon(fallback);
      return;
    }
    if (weapon.ammo !== 'none') this.player.ammo[weapon.ammo] -= weapon.ammoCost;
    this.weaponCooldown = weapon.cooldown * (this.player.powerups.rapid > 0 ? .55 : 1);
    this.audio.weaponCue(weapon.id);
    this.enemyBehavior.emitSound(this.player.position, weapon.slot === 8 ? 8 : weapon.slot === 1 ? 12 : 24, 'player');
    const muzzle = this.player.position.clone().addScaledVector(this.aimDirection(), .72).add(new Vector3(0, -.22, 0));
    const muzzleKind: ParticleKind = weapon.id === 'catastrophe-launcher' ? 'ember'
      : weapon.id === 'plasma-copier' || weapon.id === 'binding-engine' ? 'energy'
        : weapon.id === 'claim-stamp' ? 'ink' : 'spark';
    this.emitParticles(muzzleKind, muzzle, weapon.slot >= 5 ? 7 : 4, this.aimDirection());
    window.dispatchEvent(new CustomEvent('weapon-fire', { detail: { weapon: weapon.id, duration: this.weaponCooldown, recoil: weapon.recoil } }));
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
    let hitCount = 0;
    let killedAny = false;
    let actorImpact: Vector3 | undefined;
    let wallImpact: Vector3 | undefined;
    for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
      const spread = sampleShotSpread(weapon.spread, () => this.random());
      const direction = this.aimDirection(spread.yaw, spread.pitch);
      const aimAssist = weapon.pellets === 1 ? .025 : 0;
      const target = this.findTarget(direction, weapon.range, aimAssist);
      if (!target) {
        const breakable = this.findBreakableTarget(direction, weapon.range, aimAssist);
        if (breakable) {
          const impactDirection = impactParticleDirection(direction);
          this.damageBreakable(breakable.key, this.rollWeaponDamage(weapon.id), impactDirection);
          this.emitParticles('debris', breakable.position.clone().add(new Vector3(0, .6, 0)), 2, impactDirection);
          wallImpact ??= breakable.position.clone().add(new Vector3(0, .6, 0));
        } else if (!wallImpact) {
          const impact = this.traceWorldImpact(direction, weapon.range);
          this.emitParticles('spark', impact, 3, impactParticleDirection(direction));
          wallImpact = impact;
        }
        continue;
      }
      this.damageActor(target, this.rollWeaponDamage(weapon.id), 'player');
      const impact = target.position.clone().add(new Vector3(0, ENEMIES[target.id].height * .55, 0));
      this.emitParticles('ink', impact, weapon.pellets > 1 ? 1 : 4, impactParticleDirection(direction));
      actorImpact ??= impact;
      hitCount += 1;
      killedAny ||= target.dead;
    }
    if (actorImpact) this.playWeaponImpact(weapon.id, actorImpact, true);
    else if (wallImpact) this.playWeaponImpact(weapon.id, wallImpact);
    window.dispatchEvent(new CustomEvent('weapon-impact', { detail: {
      weapon: weapon.id,
      kind: actorImpact ? 'actor' : 'wall',
      hitCount,
      killed: killedAny,
    } }));
  }

  private rollWeaponDamage(id: WeaponId): number {
    const weapon = WEAPONS[id];
    return weapon.damageMin + Math.floor(this.random() * (weapon.damageMax - weapon.damageMin + 1));
  }

  private traceWorldImpact(direction: Vector3, range: number): Vector3 {
    return this.traceWorldImpactFrom(this.player.position, direction, range).position;
  }

  private traceWorldImpactFrom(origin: Vector3, direction: Vector3, range: number): { position: Vector3; hit: boolean } {
    const point = origin.clone();
    for (let distance = .25; distance <= range; distance += .25) {
      point.copy(origin).addScaledVector(direction, distance);
      if (this.world.isSolid(point, .04)) return { position: point.clone().addScaledVector(direction, -.12), hit: true };
    }
    return { position: origin.clone().addScaledVector(direction, range), hit: false };
  }

  private playWeaponImpact(weapon: WeaponId, position: Vector3, actor = false): void {
    if (this.accessibility.reducedEffects) return;
    const family = actor || weapon === 'claim-stamp' ? 'hit-ink-small'
      : weapon === 'staple-driver' ? 'staple-impact'
        : weapon === 'twin-bore-riveter' || weapon === 'audit-repeater' ? 'fastener-impact'
          : 'hit-spark';
    this.playStandardEffect(family, 4, position, actor ? .7 : .55, .04);
  }

  private updateBindingBeam(dt: number): void {
    if (!this.bindingBeam) return;
    this.bindingBeam.timer -= dt;
    while (this.bindingBeam && this.bindingBeam.timer <= 0 && this.bindingBeam.pulses > 0) {
      const direction = this.aimDirection();
      const target = this.findTarget(direction, WEAPONS['binding-engine'].range, .055);
      let endpoint = this.traceWorldImpact(direction, WEAPONS['binding-engine'].range);
      if (target) {
        this.damageActor(target, this.rollWeaponDamage('binding-engine'), 'player');
        endpoint = target.position.clone().add(new Vector3(0, ENEMIES[target.id].height * .5, 0));
        this.emitParticles('energy', endpoint, 2, impactParticleDirection(direction));
        window.dispatchEvent(new CustomEvent('weapon-impact', { detail: { weapon: 'binding-engine', kind: 'actor', targetUid: target.uid, killed: target.dead } }));
      }
      else {
        const breakable = this.findBreakableTarget(direction, WEAPONS['binding-engine'].range, .055);
        if (breakable) {
          endpoint = breakable.position.clone().add(new Vector3(0, .6, 0));
          this.damageBreakable(breakable.key, this.rollWeaponDamage('binding-engine'), impactParticleDirection(direction));
        }
      }
      this.audio.tone(150 + this.bindingBeam.pulses * 7, .035, 'sawtooth', .022);
      this.bindingBeam.pulses -= 1;
      this.bindingBeam.timer += 1 / 22;
      if (this.bindingBeam.pulses <= 0) this.bindingBeam.timer += .12;
    }
    if (this.bindingBeam) {
      const direction = this.aimDirection();
      const target = this.findTarget(direction, WEAPONS['binding-engine'].range, .055);
      const endpoint = target
        ? target.position.clone().add(new Vector3(0, ENEMIES[target.id].height * .5, 0))
        : this.traceWorldImpact(direction, WEAPONS['binding-engine'].range);
      this.updateBindingBeamVisual(endpoint, dt);
      if (this.bindingBeam.pulses <= 0 && this.bindingBeam.timer <= 0) {
        this.bindingBeam = undefined;
        this.clearBindingBeamVisual();
      }
    }
  }

  private updateBindingBeamVisual(endpoint: Vector3, dt: number): void {
    const direction = this.aimDirection();
    const right = direction.clone().cross(new Vector3(0, 1, 0)).normalize();
    const source = this.player.position.clone().addScaledVector(direction, 1.45).addScaledVector(right, .14);
    source.y -= .18;
    if (!this.bindingBeamVisual) {
      const geometry = new BufferGeometry();
      const material = new MeshBasicMaterial({
        map: this.assets.texture('/public_runtime/effects/binding-beam/fx_binding-beam_start_F_01.png'),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        alphaTest: .025,
        side: DoubleSide,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = this.accessibility.highContrast ? 24 : 4;
      this.world.root.add(mesh);
      const line = new Line(new BufferGeometry(), new LineBasicMaterial({
        color: 0x47bcd1,
        transparent: true,
        opacity: this.accessibility.reducedEffects ? .82 : 1,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
      }));
      line.frustumCulled = false;
      line.renderOrder = this.accessibility.highContrast ? 25 : 5;
      this.world.root.add(line);
      const impact = this.createEffectSprite('/public_runtime/effects/binding-beam/fx_binding-beam_impact_F_01.png', this.accessibility.reducedEffects ? .55 : .9);
      impact.material.depthTest = false;
      impact.renderOrder = this.accessibility.highContrast ? 25 : 5;
      this.bindingBeamVisual = { mesh, line, impact, elapsed: 0, length: 0 };
    }
    const visual = this.bindingBeamVisual;
    visual.elapsed += dt;
    visual.length = source.distanceTo(endpoint);
    this.camera.updateMatrixWorld();
    const cameraUp = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();
    const halfWidth = this.accessibility.reducedEffects ? .018 : .032;
    const positions: number[] = [];
    const linePositions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const segments = 9;
    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const envelope = Math.sin(Math.PI * t);
      const center = source.clone().lerp(endpoint, t)
        .addScaledVector(right, Math.sin(t * Math.PI * 5 + visual.elapsed * 24) * .065 * envelope)
        .addScaledVector(cameraUp, Math.cos(t * Math.PI * 4 + visual.elapsed * 19) * .035 * envelope);
      positions.push(...center.clone().addScaledVector(cameraUp, halfWidth).toArray());
      positions.push(...center.clone().addScaledVector(cameraUp, -halfWidth).toArray());
      linePositions.push(...center.toArray());
      uvs.push(t, .56, t, .44);
      if (index < segments) {
        const offset = index * 2;
        indices.push(offset, offset + 1, offset + 2, offset + 2, offset + 1, offset + 3);
      }
    }
    visual.mesh.geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    visual.mesh.geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    visual.mesh.geometry.setIndex(indices);
    visual.mesh.geometry.computeBoundingSphere();
    visual.line.geometry.setAttribute('position', new Float32BufferAttribute(linePositions, 3));
    visual.line.geometry.computeBoundingSphere();
    const startPhase = visual.elapsed < .14;
    const frameCount = 4;
    const frame = Math.floor(visual.elapsed * (startPhase ? 28 : 18)) % frameCount + 1;
    const beamPath = `/public_runtime/effects/binding-beam/fx_binding-beam_${startPhase ? 'start' : 'loop'}_F_${String(frame).padStart(2, '0')}.png`;
    if (visual.mesh.userData.frame !== beamPath) {
      visual.mesh.userData.frame = beamPath;
      visual.mesh.material.map = this.assets.texture(beamPath);
      visual.mesh.material.needsUpdate = true;
    }
    visual.impact.position.copy(endpoint);
    const impactFrame = Math.floor(visual.elapsed * 22) % 8 + 1;
    visual.impact.material.map = this.assets.texture(`/public_runtime/effects/binding-beam/fx_binding-beam_impact_F_${String(impactFrame).padStart(2, '0')}.png`);
  }

  private clearBindingBeamVisual(): void {
    if (!this.bindingBeamVisual) return;
    this.world.root.remove(this.bindingBeamVisual.mesh, this.bindingBeamVisual.line, this.bindingBeamVisual.impact);
    this.bindingBeamVisual.mesh.geometry.dispose();
    this.bindingBeamVisual.mesh.material.dispose();
    this.bindingBeamVisual.line.geometry.dispose();
    this.bindingBeamVisual.line.material.dispose();
    this.bindingBeamVisual.impact.material.dispose();
    this.bindingBeamVisual = undefined;
  }

  private spawnHostileBeamVisual(actor: RuntimeActor, resolved: boolean, hit: boolean): void {
    const source = actor.position.clone().add(new Vector3(0, ENEMIES[actor.id].height * .62, 0));
    const playerTarget = this.player.position.clone().add(new Vector3(0, -.08, 0));
    const centerDirection = playerTarget.clone().sub(source).normalize();
    const lateral = centerDirection.clone().cross(new Vector3(0, 1, 0)).normalize();
    const missSide = [...actor.uid].reduce((hash, char) => hash + char.charCodeAt(0), 0) % 2 === 0 ? 1 : -1;
    const desiredEndpoint = hit
      ? playerTarget
      : resolved ? playerTarget.clone().addScaledVector(lateral, missSide * .9) : playerTarget;
    const desiredDelta = desiredEndpoint.clone().sub(source);
    const trace = this.traceWorldImpactFrom(source, desiredDelta.clone().normalize(), desiredDelta.length());
    const endpoint = hit ? playerTarget : trace.position;
    const geometry = new BufferGeometry();
    const material = new MeshBasicMaterial({
      map: this.assets.texture('/public_runtime/effects/denial-beam/fx_denial-beam_start_F_01.png'),
      transparent: true,
      depthTest: true,
      depthWrite: false,
      alphaTest: .02,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = this.accessibility.highContrast ? 26 : 6;
    this.world.root.add(mesh);
    const line = new Line(new BufferGeometry(), new LineBasicMaterial({
      color: 0xffd45c,
      transparent: true,
      opacity: this.accessibility.reducedEffects ? .9 : .72,
      depthTest: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }));
    line.frustumCulled = false;
    line.renderOrder = this.accessibility.highContrast ? 27 : 7;
    this.world.root.add(line);
    const impact = hit
      ? this.createEffectSprite('/public_runtime/effects/denial-beam/fx_denial-beam_impact_F_01.png', this.accessibility.reducedEffects ? .44 : .62, true)
      : undefined;
    if (impact) {
      impact.material.depthTest = true;
      impact.renderOrder = this.accessibility.highContrast ? 27 : 7;
    }
    this.hostileBeamVisuals.push({ mesh, line, impact, source, endpoint, hit, elapsed: 0, length: source.distanceTo(endpoint), duration: .24 });
    if (hit) this.playSemanticCue('rejection', endpoint);
  }

  private updateHostileBeamVisuals(dt: number): void {
    for (let index = this.hostileBeamVisuals.length - 1; index >= 0; index -= 1) {
      const visual = this.hostileBeamVisuals[index];
      visual.elapsed += dt;
      if (visual.elapsed >= visual.duration) {
        this.removeHostileBeamVisual(index);
        continue;
      }
      this.camera.updateMatrixWorld();
      const cameraUp = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();
      const direction = visual.endpoint.clone().sub(visual.source).normalize();
      const lateral = direction.clone().cross(cameraUp).normalize();
      const halfWidth = this.accessibility.reducedEffects ? .014 : .028;
      const positions: number[] = [];
      const linePositions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      const segments = 6;
      for (let segment = 0; segment <= segments; segment += 1) {
        const t = segment / segments;
        const envelope = Math.sin(Math.PI * t);
        const center = visual.source.clone().lerp(visual.endpoint, t)
          .addScaledVector(lateral, Math.sin(t * Math.PI * 7 + visual.elapsed * 38) * .035 * envelope);
        positions.push(...center.clone().addScaledVector(cameraUp, halfWidth).toArray());
        positions.push(...center.clone().addScaledVector(cameraUp, -halfWidth).toArray());
        linePositions.push(...center.toArray());
        uvs.push(t, 1, t, 0);
        if (segment < segments) {
          const offset = segment * 2;
          indices.push(offset, offset + 1, offset + 2, offset + 2, offset + 1, offset + 3);
        }
      }
      visual.mesh.geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
      visual.mesh.geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      visual.mesh.geometry.setIndex(indices);
      visual.line.geometry.setAttribute('position', new Float32BufferAttribute(linePositions, 3));
      const startPhase = visual.elapsed < .11;
      const frameCount = startPhase ? 4 : 2;
      const frame = Math.floor(visual.elapsed * (startPhase ? 36 : 24)) % frameCount + 1;
      const beamPath = `/public_runtime/effects/denial-beam/fx_denial-beam_${startPhase ? 'start' : 'loop'}_F_${String(frame).padStart(2, '0')}.png`;
      if (visual.mesh.userData.frame !== beamPath) {
        visual.mesh.userData.frame = beamPath;
        visual.mesh.material.map = this.assets.texture(beamPath);
        visual.mesh.material.needsUpdate = true;
      }
      const fade = Math.min(1, (visual.duration - visual.elapsed) / .07);
      visual.mesh.material.opacity = (this.accessibility.reducedEffects ? .55 : 1) * fade;
      visual.line.material.opacity = (this.accessibility.reducedEffects ? .9 : .72) * fade;
      if (visual.impact) {
        visual.impact.material.opacity = fade;
        visual.impact.position.copy(visual.endpoint);
        const impactFrame = Math.floor(visual.elapsed * 30) % 5 + 1;
        visual.impact.material.map = this.assets.texture(`/public_runtime/effects/denial-beam/fx_denial-beam_impact_F_${String(impactFrame).padStart(2, '0')}.png`);
      }
    }
  }

  private removeHostileBeamVisual(index: number): void {
    const [visual] = this.hostileBeamVisuals.splice(index, 1);
    if (!visual) return;
    this.world.root.remove(visual.mesh, visual.line);
    if (visual.impact) this.world.root.remove(visual.impact);
    visual.mesh.geometry.dispose();
    visual.mesh.material.dispose();
    visual.line.geometry.dispose();
    visual.line.material.dispose();
    visual.impact?.material.dispose();
  }

  private clearHostileBeamVisuals(): void {
    while (this.hostileBeamVisuals.length) this.removeHostileBeamVisual(this.hostileBeamVisuals.length - 1);
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
          if (breakable) this.damageBreakable(breakable.key, projectile.damage, impactParticleDirection(projectile.velocity));
        }
        if (projectile.weapon === 'catastrophe-launcher') {
          const launcher = WEAPONS['catastrophe-launcher'];
          this.applyPlayerSplash(projectile.position, launcher.splashDamage ?? 128, launcher.splashRadius ?? 3.8, target);
          this.playStandardEffect('canister-explosion', 8, projectile.position, 2.5, .055);
        } else {
          this.playStandardEffect('binding-impact', 8, projectile.position, 1.05, .045);
        }
        this.emitParticles(
          projectile.weapon === 'catastrophe-launcher' ? 'ember' : 'energy',
          projectile.position,
          projectile.weapon === 'catastrophe-launcher' ? 18 : 9,
          impactParticleDirection(projectile.velocity),
        );
        if (projectile.weapon === 'catastrophe-launcher') this.emitParticles('smoke', projectile.position, 7);
        window.dispatchEvent(new CustomEvent('weapon-impact', { detail: { weapon: projectile.weapon, kind: target ? 'actor' : 'wall', targetUid: target?.uid, killed: target?.dead ?? false } }));
        this.removePlayerProjectile(index);
        continue;
      }
      projectile.position.copy(to);
      if (!this.accessibility.reducedEffects) {
        const nextTrail = (this.playerProjectileTrailTimers.get(projectile.id) ?? 0) - dt;
        if (nextTrail <= 0) {
          this.emitParticles(projectile.weapon === 'catastrophe-launcher' ? 'ember' : 'energy', projectile.position, 1, undefined, 'ambient');
          this.playerProjectileTrailTimers.set(projectile.id, projectile.weapon === 'catastrophe-launcher' ? .085 : .055);
        } else this.playerProjectileTrailTimers.set(projectile.id, nextTrail);
      }
      if (projectile.remaining <= 0) {
        this.emitParticles('smoke', projectile.position, 2);
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
      if (distance < radius && this.world.hasLineOfSight(center, target)) {
        const outward = target.clone().sub(center);
        this.damageBreakable(
          breakable.key,
          maxDamage * (1 - distance / radius),
          outward.lengthSq() > 1e-6 ? outward.normalize() : undefined,
        );
      }
    }
    const playerDistance = center.distanceTo(this.player.position);
    if (playerDistance < radius && this.world.hasLineOfSight(center, this.player.position)) this.damagePlayer(maxDamage * (1 - playerDistance / radius));
  }

  private syncPlayerProjectileSprite(projectile: PlayerProjectile): void {
    let sprite = this.playerProjectileSprites.get(projectile.id);
    if (!sprite) {
      const family = projectile.weapon === 'catastrophe-launcher' ? 'canister-projectile' : 'plasma-bolt';
      sprite = this.createEffectSprite(this.standardEffectFrame(family, 1), projectile.weapon === 'catastrophe-launcher' ? .72 : .46);
      sprite.userData.effectFamily = family;
      this.playerProjectileSprites.set(projectile.id, sprite);
    }
    const family = String(sprite.userData.effectFamily);
    const frame = Math.floor(this.tally.elapsed * 14) % 4 + 1;
    if (sprite.userData.effectFrame !== frame) {
      sprite.userData.effectFrame = frame;
      sprite.material.map = this.assets.texture(this.standardEffectFrame(family, frame));
    }
    sprite.material.depthTest = !this.accessibility.highContrast;
    sprite.renderOrder = this.accessibility.highContrast ? 20 : 0;
    sprite.position.copy(projectile.position);
  }

  private removePlayerProjectile(index: number): void {
    const [projectile] = this.playerProjectiles.splice(index, 1);
    this.playerProjectileTrailTimers.delete(projectile.id);
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
      const definition = ENEMIES[actor.id];
      const center = actor.position.clone().add(new Vector3(0, definition.height * .5, 0));
      const centerDistance = center.distanceTo(this.player.position);
      const assistance = Math.tan(tolerance) * centerDistance;
      const base = actor.position.clone().add(new Vector3(0, -assistance, 0));
      const distance = rayVerticalCylinderDistance(
        this.player.position, direction, base,
        definition.radius + assistance, definition.height + assistance * 2, bestDistance,
      );
      if (distance === undefined || !this.world.hasLineOfSight(this.player.position, center)) continue;
      result = actor;
      bestDistance = distance;
    }
    return result;
  }

  private findBreakableTarget(direction: Vector3, range: number, tolerance: number) {
    let result: ReturnType<World['closestBreakable']>;
    let bestDistance = range;
    for (const breakable of this.world.breakables.values()) {
      if (breakable.destroyed) continue;
      const center = breakable.position.clone().add(new Vector3(0, .6, 0));
      const centerDistance = center.distanceTo(this.player.position);
      const assistance = Math.tan(tolerance) * centerDistance;
      const base = breakable.position.clone().add(new Vector3(0, -assistance, 0));
      const distance = rayVerticalCylinderDistance(
        this.player.position, direction, base, .35 + assistance, 1.2 + assistance * 2, bestDistance,
      );
      if (distance === undefined || !this.world.hasLineOfSight(this.player.position, center)) continue;
      result = breakable;
      bestDistance = distance;
    }
    return result;
  }

  private damageBreakable(key: string, damage: number, impactDirection?: Readonly<Vector3>): void {
    const item = this.world.breakables.get(key);
    if (!item) return;
    const result = this.world.damageBreakable(key, damage);
    const material = this.breakableParticleKind(item.definition.prop);
    const impactPoint = item.position.clone().add(new Vector3(0, .55, 0));
    if (!result?.destroyed) {
      this.emitParticles(material, impactPoint, 3, impactDirection);
      return;
    }
    this.audio.noise(.12, .055);
    this.emitParticles(material, impactPoint, 12, impactDirection);
    breakableDestructionEffects(item.definition.prop, material)
      .forEach((effect) => this.playEffectCue(effect, impactPoint));
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
    const awardsScore = sourceUid === 'player' && actor.scoreEligible;
    actor.scoreEligible = false;
    if (awardsScore) {
      this.momentum.chain = this.momentum.timer > 0 ? this.momentum.chain + 1 : 1;
      this.momentum.best = Math.max(this.momentum.best, this.momentum.chain);
      this.momentum.timer = 4;
      this.momentum.score += Math.round((100 + Math.min(400, actor.maxHealth * .35)) * this.momentum.chain);
      if (this.momentum.chain > 1) this.audio.tone(430 + Math.min(6, this.momentum.chain) * 55, .075, 'square', .026);
      window.dispatchEvent(new CustomEvent('combat-momentum', { detail: { ...this.momentum } }));
      if ([3, 5, 8].includes(this.momentum.chain)) {
        this.playSemanticCue('momentum', actor.position.clone().add(new Vector3(0, ENEMIES[actor.id].height * .7, 0)));
      }
    }
    this.setActorDeadVisual(actor, true);
    this.audio.enemyCue(actor.id, 'death', this.actorPan(actor), this.actorAudibility(actor));
    const deathPoint = actor.position.clone().add(new Vector3(0, ENEMIES[actor.id].height * .48, 0));
    const deathMaterial = this.actorDeathParticleKind(actor);
    this.emitParticles('ink', deathPoint, actor.kind === 'boss' ? 14 : 5);
    if (actor.kind === 'boss') this.playSemanticCue(deathMaterial === 'deflection' ? 'deflection' : 'authority', deathPoint);
    else this.emitParticles(deathMaterial, deathPoint, 10);
    if (actor.kind === 'boss') this.emitParticles('debris', deathPoint, 14);
    actorDeathEffects(
      actor.id,
      deathMaterial,
      Boolean((actor as RuntimeActor & { redacted?: boolean }).redacted),
      ENEMIES[actor.id].height,
      actor.kind === 'boss',
    ).forEach((effect) => this.playEffectCue(effect, deathPoint));
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
    if (!id || this.isEncounterActive(id)) return;
    const encounter = this.world.map.encounters.find((candidate) => candidate.id === id);
    if (!encounter || encounter.completion === 'switch') return;
    const targets = this.world.map.id === 'E3M8' && id === 'boss-1'
      ? (encounter.opens ?? []).filter((target) => target !== 'boss-2')
      : encounter.opens ?? [];
    this.unlockTargets(targets);
  }

  private setActorDeadVisual(actor: RuntimeActor, restart: boolean): void {
    if (restart) actor.animationTime = 0;
    actor.visualKey = '';
    actor.visualState = 'death';
    actor.sprite.scale.set(ENEMIES[actor.id].height, ENEMIES[actor.id].height, 1);
    this.updateActorVisual(actor);
  }

  private updateEnemies(dt: number): void {
    const difficulty = DIFFICULTY[this.difficulty];
    const topology = this.hostileNavigationTopologyKey();
    if (topology !== this.hostileNavigationTopology) {
      this.hostileNavigationFields.clear();
      this.hostileNavigationTopology = topology;
    }
    const navigationFields = this.hostileNavigationFields;
    for (const actor of this.world.actors) {
      if (actor.phaseLocked) continue;
      actor.animationTime += dt;
      actor.moving = false;
      if (actor.dead) continue;
      actor.attackFlash = Math.max(0, actor.attackFlash - dt);
      if (actor.awake && Math.floor((actor.animationTime - dt) / 7) !== Math.floor(actor.animationTime / 7)) {
        this.audio.enemyCue(actor.id, 'idle', this.actorPan(actor), this.actorAudibility(actor));
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
        navigationDirection: (actor, target) => this.hostileNavigationDirection(actor, target, navigationFields),
        canOccupy: (actor, position) => {
          const point = new Vector3(position.x, position.y, position.z);
          if (this.world.isSolid(point, actor.radius * .55)) return false;
          if (this.player.health > 0 && Math.abs(this.player.position.y - position.y) < Math.max(1.7, actor.height ?? 1)
            && this.horizontalDistance(this.player.position, point) < actor.radius + .32) return false;
          return !this.world.actors.some((other) => other.uid !== actor.uid && !other.dead && !other.phaseLocked
            && Math.abs(other.position.y - position.y) < Math.max(ENEMIES[other.id].height, actor.height ?? 1)
            && this.horizontalDistance(other.position, point) < ENEMIES[other.id].radius + actor.radius);
        },
        canPlaceHazard: (position, radius) => {
          const point = new Vector3(position.x, 0, position.z);
          point.y = this.world.floorHeightAt(point) + .04;
          return !this.world.isSolid(point, Math.min(.45, Math.max(.16, radius * .18)));
        },
        traceProjectile: (projectile, from, to) => this.traceEnemyProjectile(projectile, from, to),
      },
      difficulty: { reaction: difficulty.reaction, refire: difficulty.refire, projectileSpeed: difficulty.projectileSpeed, aggression: difficulty.aggression },
    });
    result.events.forEach((event) => this.applyEnemyEvent(event, dt, difficulty.enemySpeed, difficulty.enemyDamage));
    const livePressure = this.world.actors.filter((actor) => actor.awake && !actor.dead && !actor.phaseLocked
      && this.horizontalDistance(actor.position, this.player.position) < 28).length;
    const bossPressure = this.world.actors.some((actor) => actor.kind === 'boss' && actor.awake && !actor.dead && !actor.phaseLocked) ? .35 : 0;
    this.audio.setCombatIntensity(Math.min(1, livePressure / 9 + bossPressure));
    this.syncCombatEffects(result.projectiles, result.hazards, dt);
    this.world.actors.forEach((actor) => this.updateActorVisual(actor));
  }

  private hostileNavigationDirection(
    actor: BehaviorActor,
    target: BehaviorTarget,
    fields: Map<string, NavigationDistanceField>,
  ): BehaviorVector | undefined {
    const from = new Vector3(actor.position.x, actor.position.y, actor.position.z);
    const to = new Vector3(target.position.x, target.position.y, target.position.z);
    if (this.world.hasLineOfSight(from, to)) return undefined;

    const cellSize = this.world.map.cellSize;
    const goal = { x: Math.floor(target.position.x / cellSize), z: Math.floor(target.position.z / cellSize) };
    const radius = actor.radius * .55;
    const grid: NavigationGridAdapter = {
      width: this.world.map.grid[0]?.length ?? 0,
      height: this.world.map.grid.length,
      cellSize,
      canTraverse: (start, end) => this.canHostileTraverseCell(start, end, radius),
    };
    const fieldKey = `${goal.x},${goal.z}|${radius.toFixed(3)}`;
    let field = fields.get(fieldKey);
    if (!field) {
      field = buildNavigationDistanceField(goal, grid);
      if (fields.size >= 72) fields.delete(fields.keys().next().value!);
      fields.set(fieldKey, field);
    } else {
      fields.delete(fieldKey);
      fields.set(fieldKey, field);
    }
    return navigationDirectionFromField(actor.uid, actor.position, target.position, field, grid);
  }

  private hostileNavigationTopologyKey(): string {
    const credentialDoors = [...this.world.doors.values()]
      .filter((door) => door.credential)
      .map((door) => `${door.key}:${Number(door.progress >= .72)}`)
      .join(',');
    const sectors = this.world.serializeSectorMovers()
      .map((sector) => `${sector.key}:${Math.round(sector.height * 20)}`)
      .join(',');
    const secrets = [...this.world.discoveredSecrets].sort().join(',');
    const breakables = this.world.serializeBreakables()
      .filter((breakable) => breakable.destroyed)
      .map((breakable) => breakable.key)
      .sort()
      .join(',');
    return `${this.world.map.id}|${credentialDoors}|${sectors}|${secrets}|${breakables}`;
  }

  private canHostileTraverseCell(from: NavigationCell, to: NavigationCell, radius: number): boolean {
    const row = this.world.map.grid[to.z];
    if (!row || to.x < 0 || to.x >= row.length || row[to.x] === '#') return false;
    const cellSize = this.world.map.cellSize;
    const fromPoint = new Vector3((from.x + .5) * cellSize, 0, (from.z + .5) * cellSize);
    const toPoint = new Vector3((to.x + .5) * cellSize, 0, (to.z + .5) * cellSize);
    fromPoint.y = this.world.floorHeightAt(fromPoint);
    toPoint.y = this.world.floorHeightAt(toPoint);
    const door = this.world.doors.get(`${to.x},${to.z}`);
    if (door) {
      if (door.credential && door.progress < .72) return false;
      return toPoint.y - fromPoint.y <= 1.05;
    }
    return this.world.canTraverse(fromPoint, toPoint, radius);
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
          if (actor.id === 'fraud-apparition') {
            const point = actor.position.clone().add(new Vector3(0, ENEMIES[actor.id].height * .5, 0));
            this.playEffectCue(fraudVisibilityEffect(event.visible, ENEMIES[actor.id].height), point);
          }
        }
        break;
      case 'attack':
        if (actor) actor.attackFlash = .2;
        if (actor) {
          this.audio.enemyCue(actor.id, 'attack', this.actorPan(actor), this.actorAudibility(actor));
          if (event.attackId === 'denial-beam' || event.attackId === 'uninsurable-denial') {
            if (event.resolved || event.blocked) this.spawnHostileBeamVisual(actor, event.resolved, (event.hitCount ?? 0) > 0);
          }
        }
        break;
      case 'state':
        if (actor && event.state === 'windup') {
          actor.attackFlash = Math.max(actor.attackFlash, event.duration);
          this.audio.enemyCue(actor.id, 'windup', this.actorPan(actor), this.actorAudibility(actor));
        }
        break;
      case 'wake':
        if (actor) {
          actor.awake = true;
          this.audio.enemyCue(actor.id, 'alert', this.actorPan(actor), this.actorAudibility(actor));
        }
        break;
      case 'pain':
        if (actor) {
          actor.attackFlash = 0;
          actor.visualKey = '';
          this.audio.enemyCue(actor.id, 'pain', this.actorPan(actor), this.actorAudibility(actor));
          this.emitParticles('ink', actor.position.clone().add(new Vector3(0, ENEMIES[actor.id].height * .55, 0)), 3);
          window.dispatchEvent(new CustomEvent('enemy-pain', { detail: { actorUid: actor.uid, id: actor.id, sourceUid: event.sourceUid } }));
        }
        break;
      case 'damage': {
        const adjusted = event.amount * damageScale * (this.player.powerups.forensic > 0 ? .62 : 1);
        if (event.targetUid === 'player') this.damagePlayer(adjusted, event.sourceUid, event.damageKind);
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
        target.animationTime = 0;
        target.visualKey = '';
        target.visualState = 'resurrect';
        target.sprite.visible = true;
        target.sprite.material.opacity = 1;
        (target as RuntimeActor & { redacted?: boolean }).redacted = event.redacted;
        this.enemyBehavior.markResurrected(target.uid, event.redacted);
        target.sprite.material.color.set(event.redacted ? 0xc93434 : 0xffffff);
        target.sprite.scale.set(ENEMIES[target.id].height, ENEMIES[target.id].height, 1);
        this.tally.kills = Math.max(0, this.tally.kills - 1);
        this.showMessage('Closed exposure reopened', 1.2);
        this.emitParticles('smoke', target.position.clone().add(new Vector3(0, .4, 0)), 10);
        this.emitParticles('toner', target.position.clone().add(new Vector3(0, .6, 0)), 8);
        this.playEffectCue(
          resurrectionEffect(ENEMIES[target.id].height),
          target.position.clone().add(new Vector3(0, ENEMIES[target.id].height * .5, 0)),
        );
        break;
      }
      case 'summon':
        event.positions.forEach((position) => {
          const point = new Vector3(position.x, 0, position.z);
          if (this.world.isSolid(point, ENEMIES[event.enemyId].radius)) return;
          this.world.summonEnemy(event.enemyId, point);
          this.emitParticles('approval', point.clone().add(new Vector3(0, .3, 0)), 9);
          this.tally.totalKills += 1;
        });
        break;
      case 'boss-phase':
        if (actor) this.audio.enemyCue(actor.id, 'phase', this.actorPan(actor), Math.max(.35, this.actorAudibility(actor)));
        if (actor) this.playSemanticCue('authority', actor.position.clone().add(new Vector3(0, ENEMIES[actor.id].height * .5, 0)));
        this.showMessage(`${this.pretty(event.phaseId)} phase`, 1.5);
        break;
      case 'remove-projectile': {
        this.resolveEnemyProjectile(event);
        break;
      }
      case 'hazard-armed': {
        const sprite = this.hazardSprites.get(event.hazardId);
        if (sprite) {
          const family = String(sprite.userData.effectFamily ?? 'reserve-hazard');
          this.playStandardEffect(family, family === 'prediction-zone' ? 4 : 6, sprite.position, sprite.scale.x * 1.08, .06);
          this.playSemanticCue(family === 'prediction-zone' ? 'scan' : 'authority', sprite.position.clone().add(new Vector3(0, .15, 0)));
          const spatial = this.pointSpatialAudio(sprite.position);
          this.audio.hazardCue('armed', spatial.pan, spatial.gain);
        }
        break;
      }
      case 'spawn-hazard': {
        const owner = this.world.actors.find((candidate) => candidate.uid === event.hazard.ownerUid);
        const position = new Vector3(event.hazard.position.x, event.hazard.position.y, event.hazard.position.z);
        const spatial = owner
          ? { pan: this.actorPan(owner), gain: this.actorAudibility(owner) }
          : this.pointSpatialAudio(position);
        this.audio.hazardCue('placed', spatial.pan, spatial.gain);
        break;
      }
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

  private resolveEnemyProjectile(event: Extract<BehaviorEvent, { type: 'remove-projectile' }>): void {
    const point = new Vector3(event.position.x, event.position.y, event.position.z);
    if (event.reason === 'impact') {
      this.playEffectCue(projectileResolutionEffect(event.kind, event.damageKind, event.targetUid), point);
      const impactDirection = impactParticleDirection(new Vector3(event.velocity.x, event.velocity.y, event.velocity.z));
      if (event.kind.includes('canister')) {
        this.emitParticles('ember', point, 18, impactDirection);
        this.emitParticles('smoke', point, 7, impactDirection);
      } else if (event.damageKind === 'fire' || event.kind.includes('ember')) {
        this.emitParticles('ember', point, 9, impactDirection);
        this.emitParticles('smoke', point, 3, impactDirection);
      } else if (event.damageKind === 'redaction' || event.kind.includes('redaction') || event.kind.includes('subrogation')) {
        this.emitParticles('toner', point, 8, impactDirection);
        this.emitParticles('paper', point, 3, impactDirection);
      } else if (event.damageKind === 'hazard' || event.kind.includes('reserve-glob') || event.kind.includes('liability')) {
        this.emitParticles('wax', point, 9, impactDirection);
      } else if (!event.targetUid) {
        this.emitParticles('debris', point, 7, impactDirection);
      } else {
        this.emitParticles(event.damageKind === 'toner' ? 'toner' : 'energy', point, 6, impactDirection);
      }
    } else {
      const kind: ParticleKind = event.damageKind === 'fire' ? 'ember'
        : event.damageKind === 'redaction' ? 'toner'
          : event.damageKind === 'hazard' ? 'wax' : 'smoke';
      this.emitParticles(kind, point, 2);
    }
    this.removeEnemyProjectileVisual(event.projectileId);
  }

  private removeEnemyProjectileVisual(id: string): void {
    const sprite = this.projectileSprites.get(id);
    if (sprite) {
      this.world.root.remove(sprite);
      sprite.material.dispose();
      this.projectileSprites.delete(id);
    }
    this.enemyProjectileTrailTimers.delete(id);
  }

  private syncCombatEffects(projectiles: readonly ProjectileState[], hazards: readonly HazardState[], dt = 0): void {
    const projectileIds = new Set(projectiles.map((item) => item.id));
    for (const [id] of this.projectileSprites) {
      if (projectileIds.has(id)) continue;
      this.removeEnemyProjectileVisual(id);
    }
    for (const item of projectiles) {
      let sprite = this.projectileSprites.get(item.id);
      if (!sprite) {
        const family = this.projectileEffectFamily(item.kind);
        sprite = this.createEffectSprite(this.standardEffectFrame(family, 1), Math.max(.4, item.radius * 2.5));
        sprite.userData.effectFamily = family;
        this.projectileSprites.set(item.id, sprite);
        this.emitParticles(item.kind.includes('ember') ? 'ember' : 'energy', new Vector3(item.position.x, item.position.y, item.position.z), 4);
        this.enemyProjectileTrailTimers.set(item.id, .04);
      }
      const family = String(sprite.userData.effectFamily);
      const frame = Math.floor(this.tally.elapsed * 12) % 4 + 1;
      if (sprite.userData.effectFrame !== frame) {
        sprite.userData.effectFrame = frame;
        sprite.material.map = this.assets.texture(this.standardEffectFrame(family, frame));
      }
      sprite.material.depthTest = !this.accessibility.highContrast;
      sprite.renderOrder = this.accessibility.highContrast ? 20 : 0;
      sprite.position.set(item.position.x, item.position.y, item.position.z);
      if (dt > 0 && !this.accessibility.reducedEffects) {
        const nextTrail = (this.enemyProjectileTrailTimers.get(item.id) ?? 0) - dt;
        if (nextTrail <= 0) {
          this.emitParticles(item.kind.includes('ember') ? 'ember' : item.kind.includes('reserve') ? 'toner' : 'energy', sprite.position, 1, undefined, 'ambient');
          this.enemyProjectileTrailTimers.set(item.id, .075);
        } else this.enemyProjectileTrailTimers.set(item.id, nextTrail);
      }
    }
    const hazardIds = new Set(hazards.map((item) => item.id));
    for (const [id, sprite] of this.hazardSprites) {
      if (hazardIds.has(id)) continue;
      this.emitParticles('smoke', sprite.position.clone().add(new Vector3(0, .15, 0)), 5);
      this.world.root.remove(sprite);
      sprite.material.dispose();
      this.hazardSprites.delete(id);
    }
    for (const item of hazards) {
      let sprite = this.hazardSprites.get(item.id);
      if (!sprite) {
        const effect = item.kind.includes('prediction') || item.kind.includes('actuarial') ? 'prediction-zone' : 'reserve-hazard';
        sprite = this.createEffectSprite(this.standardEffectFrame(effect, 1), item.radius * 2, true);
        sprite.userData.effectFamily = effect;
        sprite.center.set(.5, .18);
        this.hazardSprites.set(item.id, sprite);
        this.emitParticles(effect === 'prediction-zone' ? 'energy' : 'ember', new Vector3(item.position.x, .15, item.position.z), 8);
      }
      const family = String(sprite.userData.effectFamily);
      const frameCount = family === 'prediction-zone' ? 4 : 6;
      const frame = Math.floor(this.tally.elapsed * 8) % frameCount + 1;
      if (sprite.userData.effectFrame !== frame) {
        sprite.userData.effectFrame = frame;
        sprite.material.map = this.assets.texture(this.standardEffectFrame(family, frame));
      }
      sprite.position.set(item.position.x, .08, item.position.z);
      sprite.material.opacity = item.armed ? .86 : .48;
      sprite.material.depthTest = !this.accessibility.highContrast;
      sprite.renderOrder = this.accessibility.highContrast ? 19 : 0;
    }
  }

  private createEffectSprite(url: string, size: number, preserveGameplayScale = false): Sprite {
    const material = new SpriteMaterial({ map: this.assets.texture(url), transparent: true, depthWrite: false, alphaTest: .04 });
    const sprite = new Sprite(material);
    const effectScale = this.accessibility.reducedEffects && !preserveGameplayScale ? .72 : 1;
    sprite.scale.set(size * effectScale, size * effectScale, 1);
    this.world.root.add(sprite);
    return sprite;
  }

  private projectileEffectFamily(kind: string): string {
    return kind.includes('ember') ? 'ember-claim-fire'
      : kind.includes('coverage') ? 'coverage-bolt'
        : kind.includes('liability') ? 'liability-orb'
          : kind.includes('paired') || kind.includes('reserve-spill') || kind.includes('redaction') ? 'denial-packet'
          : kind.includes('canister') ? 'canister-projectile'
            : 'plasma-bolt';
  }

  private standardEffectFrame(family: string, frame: number): string {
    return `/public_runtime/effects/${family}/fx_${family}_F_${String(frame).padStart(2, '0')}.png`;
  }

  private playStandardEffect(family: string, frameCount: number, position: Vector3, size: number, frameDuration: number): void {
    const frames = Array.from({ length: frameCount }, (_, index) => this.standardEffectFrame(family, index + 1));
    this.playAnimatedEffect(family, frames, position, size, frameDuration);
  }

  private playEffectCue(effect: AuthoredEffectCue, position: Vector3): void {
    this.playAnimatedEffect(effect.family, effect.frames, position, effect.size, effect.frameDuration, effect.blend);
  }

  private playAnimatedEffect(
    family: string,
    frames: readonly string[],
    position: Vector3,
    size: number,
    frameDuration: number,
    blend: AuthoredEffectCue['blend'] = 'normal',
  ): void {
    if (this.accessibility.reducedEffects || frames.length === 0) return;
    const additive = blend === 'additive' && this.accessibility.flashEffects;
    const existingIndex = this.animatedEffects.findIndex((effect) => effect.family === family
      && effect.sprite.position.distanceToSquared(position) <= ANIMATED_EFFECT_COALESCE_DISTANCE_SQ);
    const existing = promoteRecent(this.animatedEffects, existingIndex);
    if (existing) {
      existing.elapsed = 0;
      existing.frame = 0;
      existing.sprite.position.copy(position);
      const nextSize = Math.max(existing.sprite.scale.x, size);
      existing.sprite.scale.set(nextSize, nextSize, 1);
      existing.sprite.material.map = this.assets.texture(frames[0]);
      existing.sprite.material.blending = additive ? AdditiveBlending : NormalBlending;
      existing.sprite.material.needsUpdate = true;
      return;
    }
    while (this.animatedEffects.length >= MAX_ANIMATED_EFFECTS) this.removeAnimatedEffect(0);
    const sprite = this.createEffectSprite(frames[0], size);
    sprite.position.copy(position);
    sprite.material.blending = additive ? AdditiveBlending : NormalBlending;
    sprite.material.needsUpdate = true;
    sprite.renderOrder = this.accessibility.highContrast ? 21 : 1;
    this.animatedEffects.push({ family, sprite, frames, frameDuration, elapsed: 0, frame: 0 });
  }

  private updateAnimatedEffects(dt: number): void {
    for (let index = this.animatedEffects.length - 1; index >= 0; index -= 1) {
      const effect = this.animatedEffects[index];
      effect.elapsed += dt;
      const frame = Math.floor(effect.elapsed / effect.frameDuration);
      if (frame >= effect.frames.length) {
        this.removeAnimatedEffect(index);
        continue;
      }
      if (frame === effect.frame) continue;
      effect.frame = frame;
      effect.sprite.material.map = this.assets.texture(effect.frames[frame]);
    }
  }

  private removeAnimatedEffect(index: number): void {
    const [effect] = this.animatedEffects.splice(index, 1);
    if (!effect) return;
    this.world.root.remove(effect.sprite);
    effect.sprite.material.dispose();
  }

  private playSemanticCue(kind: SemanticCueKind, position: Vector3): void {
    const existingIndex = this.semanticCues.findIndex((cue) => cue.kind === kind && cue.sprite.position.distanceToSquared(position) < 1);
    const existing = promoteRecent(this.semanticCues, existingIndex);
    const additive = this.accessibility.flashEffects && !this.accessibility.reducedEffects;
    if (existing) {
      existing.elapsed = 0;
      existing.sprite.position.copy(position);
      existing.sprite.material.opacity = 1;
      existing.sprite.material.blending = additive ? AdditiveBlending : NormalBlending;
      existing.sprite.material.needsUpdate = true;
      return;
    }
    while (this.semanticCues.length >= 12) this.removeSemanticCue(0);
    const baseSize = SEMANTIC_CUE_SIZES[kind];
    const sprite = this.createEffectSprite(SEMANTIC_CUE_ASSETS[kind], baseSize, true);
    sprite.position.copy(position);
    sprite.material.opacity = 0;
    sprite.material.depthTest = false;
    sprite.material.blending = additive ? AdditiveBlending : NormalBlending;
    sprite.material.needsUpdate = true;
    sprite.renderOrder = this.accessibility.highContrast ? 26 : 8;
    this.semanticCues.push({
      kind,
      sprite,
      baseSize,
      duration: this.accessibility.reducedEffects ? .5 : .64,
      elapsed: 0,
    });
  }

  private updateSemanticCues(dt: number): void {
    for (let index = this.semanticCues.length - 1; index >= 0; index -= 1) {
      const cue = this.semanticCues[index];
      cue.elapsed += dt;
      if (cue.elapsed >= cue.duration) {
        this.removeSemanticCue(index);
        continue;
      }
      const progress = cue.elapsed / cue.duration;
      const fadeIn = Math.min(1, cue.elapsed / .06);
      const fadeOut = Math.min(1, (cue.duration - cue.elapsed) / .16);
      cue.sprite.material.opacity = Math.min(fadeIn, fadeOut);
      const pulse = this.accessibility.reducedMotion ? 1 : .88 + Math.sin(progress * Math.PI) * .12;
      cue.sprite.scale.set(cue.baseSize * pulse, cue.baseSize * pulse, 1);
    }
  }

  private removeSemanticCue(index: number): void {
    const [cue] = this.semanticCues.splice(index, 1);
    if (!cue) return;
    this.world.root.remove(cue.sprite);
    cue.sprite.material.dispose();
  }

  private clearAnimatedEffects(): void {
    while (this.animatedEffects.length) this.removeAnimatedEffect(this.animatedEffects.length - 1);
    while (this.semanticCues.length) this.removeSemanticCue(this.semanticCues.length - 1);
  }

  private damagePlayer(amount: number, sourceUid?: string, damageKind?: DamageKind): void {
    if (this.player.powerups.binder > 0) {
      const point = this.player.position.clone().addScaledVector(this.aimDirection(), .65).add(new Vector3(0, -.05, 0));
      this.playSemanticCue('deflection', point);
      window.dispatchEvent(new CustomEvent('player-deflection', { detail: { amount } }));
      return;
    }
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
    window.dispatchEvent(new CustomEvent('player-hurt', { detail: { amount, direction, ...(damageKind ? { damageKind } : {}) } }));
  }

  private actorVisualState(actor: RuntimeActor, behaviorState?: ActorBehaviorState): string {
    if (behaviorState?.action === 'pain') return actor.id === 'subrogator' ? 'split-flinch' : 'pain';
    if (actor.id === 'fraud-apparition') {
      if (behaviorState?.visible === false) return 'fade';
      if ((behaviorState?.revealRemaining ?? 0) > 0) return 'reveal';
    }
    if (behaviorState?.action === 'acquire' && actor.id === 'returned-mail') return 'emerge';
    const attackId = behaviorState?.pendingAttackId ?? '';
    if (behaviorState?.action === 'windup') return WINDUP_VISUALS[attackId] ?? 'attack';
    if (behaviorState?.action === 'recovery' || actor.attackFlash > 0) return ACTIVE_VISUALS[attackId] ?? 'attack';
    if (actor.id === 'coverage-drone') return 'hover';
    if (actor.id === 'chief-actuary' && actor.moving) return 'run';
    if (actor.id === 'uninsurable') return actor.health < actor.maxHealth ? 'damage' : 'core';
    return actor.moving ? 'walk' : 'idle';
  }

  private updateActorVisual(actor: RuntimeActor): void {
    const inVisualRange = this.horizontalDistance(actor.position, this.player.position) <= 56
      && this.world.hasLineOfSight(this.player.position, actor.position);
    actor.sprite.visible = !actor.phaseLocked && inVisualRange;
    if (actor.phaseLocked || !inVisualRange) return;
    const behaviorState = this.enemyBehavior.getActorState(actor.uid);
    actor.sprite.material.opacity = this.player.powerups.forensic > 0 ? 1 : behaviorState?.visible === false ? .18 : 1;
    actor.sprite.material.depthWrite = actor.sprite.material.opacity >= 1;
    let state = this.actorVisualState(actor, behaviorState);
    let frameRate = state === 'attack' ? 10 : 7;
    if (actor.dead) {
      const deathFrames = this.assets.actorFrameCount(actor.kind, actor.id, 'death');
      const deathFrame = Math.floor(actor.animationTime * 10);
      state = deathFrame < deathFrames ? 'death' : 'corpse';
      frameRate = 10;
    }
    actor.visualState = state;
    const dx = this.player.position.x - actor.position.x;
    const dz = this.player.position.z - actor.position.z;
    let relative = Math.atan2(dx, dz) - actor.facing;
    while (relative < -Math.PI) relative += Math.PI * 2;
    while (relative >= Math.PI) relative -= Math.PI * 2;
    const codes = ['F', 'FR', 'R', 'BR', 'B', 'BL', 'L', 'FL'];
    const sector = Math.round(relative / (Math.PI / 4));
    const angle = codes[(sector + 8) % 8];
    const frame = Math.floor(actor.animationTime * frameRate);
    const url = this.assets.actorFrame(actor.kind, actor.id, state, angle, frame);
    if (actor.visualKey === url) return;
    actor.visualKey = url;
    actor.sprite.material.map = this.assets.texture(url);
  }

  private updatePickups(): void {
    for (const pickup of this.world.pickups) {
      if (pickup.collected || this.horizontalDistance(pickup.position, this.player.position) > 1.05) continue;
      if (!this.canCollectPickup(pickup)) continue;
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
      const pickupId = String(pickup.id);
      const feedbackKind = pickupParticleFeedbackKind(pickup);
      const feedbackPoint = this.player.position.clone().addScaledVector(this.aimDirection(), .9).add(new Vector3(0, .15, 0));
      if (feedbackKind === 'deflection' || feedbackKind === 'neutralize' || feedbackKind === 'authority') {
        this.playSemanticCue(feedbackKind, feedbackPoint);
      } else if (feedbackKind === 'scan') {
        this.playSemanticCue(pickupId === 'night-inspection-goggles' ? 'inspection-scan' : 'scan', feedbackPoint);
      } else {
        this.emitParticles(feedbackKind, feedbackPoint, pickup.kind === 'pickup' ? 3 : 4);
      }
      this.audio.tone(660, .1, 'square', .035);
    }
  }

  private canCollectPickup(pickup: World['pickups'][number]): boolean {
    const ammoCap = (ammo: Exclude<AmmoType, 'none'>) => ammo === 'staples' ? 200 : ammo === 'toner-cells' ? 300 : 50;
    if (pickup.ammoDrop) return pickup.ammoDrop.ammoId !== 'none'
      && this.player.ammo[pickup.ammoDrop.ammoId] < ammoCap(pickup.ammoDrop.ammoId);
    if (pickup.kind === 'credential') return !this.player.credentials.has(pickup.id as Credential);
    if (pickup.kind === 'weapon') {
      const weapon = WEAPONS[pickup.id as WeaponId];
      return !this.player.weapons.has(weapon.id) || (weapon.ammo !== 'none' && this.player.ammo[weapon.ammo] < ammoCap(weapon.ammo));
    }
    const id = pickup.id as PickupId;
    if (id.includes('staples')) return this.player.ammo.staples < 200;
    if (id.includes('fasteners')) return this.player.ammo.fasteners < 50;
    if (id === 'canister' || id === 'canister-crate') return this.player.ammo.canisters < 50;
    if (id.includes('toner')) return this.player.ammo['toner-cells'] < 300;
    if (id === 'loss-control-vest') return this.player.armor < 100 || this.player.armorClass === 'none';
    if (id === 'catastrophe-suit') return this.player.armor < 200 || this.player.armorClass !== 'heavy';
    if (id === 'emergency-reserve') return this.player.health < 200 || this.player.armor < 200;
    if (id === 'goodwill-token') return this.player.health < 200;
    if (id === 'adhesive-bandage' || id === 'field-medical-case') return this.player.health < 100;
    return true;
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
    const interaction = this.findInteraction();
    const door = interaction.door;
    if (door) {
      if (door.credential && !this.player.credentials.has(door.credential)) {
        this.rejectUse(`${this.pretty(door.credential)} credential required`, 'credential', door.credential, new Vector3(door.x, 0, door.z).multiplyScalar(this.world.map.cellSize));
        return;
      }
      this.world.openDoor(door);
      const doorPoint = new Vector3((door.x + .5) * this.world.map.cellSize, this.world.floorHeightAt(this.player.position) + 1.2, (door.z + .5) * this.world.map.cellSize);
      this.emitParticles(door.credential ? 'metal' : 'fiber', doorPoint, door.credential ? 5 : 3);
      this.audio.tone(160, .22, 'sawtooth', .035);
      this.showMessage('Access granted', .8);
      return;
    }
    const trigger = interaction.trigger;
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
          const secret = this.world.map.secrets.find((candidate) => candidate.id === secretId);
          if (secret) this.playSemanticCue('secret', this.player.position.clone().addScaledVector(this.aimDirection(), 1.05).add(new Vector3(0, .2, 0)));
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
          this.emitParticles('energy', this.player.position.clone().addScaledVector(this.aimDirection(), 1.4), 14);
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
          const mechanismKind: ParticleKind = trigger.action === 'drain-liquid' || trigger.action === 'flood-liquid' ? 'water'
            : trigger.action === 'raise-floor' || trigger.action === 'lower-floor' || trigger.action === 'move-walls' ? 'concrete' : 'spark';
          this.emitParticles(mechanismKind, this.player.position.clone().addScaledVector(this.aimDirection(), 1.4), 10);
        }
        else this.world.applyTransformation(trigger.action);
      }
      this.audio.tone(210, .24, 'sawtooth', .04);
      this.showMessage(trigger.message ?? this.pretty(trigger.action), 1.4);
      if (trigger.action !== 'open-exit') return;
    }
    const exit = new Vector3(this.world.map.exit.x * this.world.map.cellSize, 0, this.world.map.exit.z * this.world.map.cellSize);
    if (interaction.exit || this.horizontalDistance(this.player.position, exit) <= 2.2) {
      if (this.world.actors.some((actor) => actor.kind === 'boss' && !actor.dead)) {
        this.rejectUse('Binding authority remains active', 'encounter', undefined, exit);
        return;
      }
      this.completeMap(this.world.map.nextMap);
      return;
    }
    this.rejectUse('No usable control in reach', 'nothing');
  }

  private findInteraction(): {
    door?: ReturnType<World['closestDoor']>;
    trigger?: CampaignMap['triggers'][number];
    exit?: true;
  } {
    const door = this.world.closestDoor(this.player.position);
    if (door) return { door };
    const trigger = this.world.map.triggers.find((candidate) => {
      if (!candidate.repeatable && this.triggered.has(candidate.id)) return false;
      const point = new Vector3(candidate.x * this.world.map.cellSize, 0, candidate.z * this.world.map.cellSize);
      return this.horizontalDistance(this.player.position, point) <= 2.2;
    });
    if (trigger) return { trigger };
    const exit = new Vector3(this.world.map.exit.x * this.world.map.cellSize, 0, this.world.map.exit.z * this.world.map.cellSize);
    return this.horizontalDistance(this.player.position, exit) <= 2.2 ? { exit: true } : {};
  }

  private interactionHint(): InteractionHint | undefined {
    if (!this.world.map) return undefined;
    const interaction = this.findInteraction();
    if (interaction.door) {
      const missing = interaction.door.credential && !this.player.credentials.has(interaction.door.credential);
      return missing
        ? { label: `${this.pretty(interaction.door.credential!)} credential`, icon: `credential-${interaction.door.credential}`, state: 'locked' }
        : { label: 'Access', icon: 'minimal-terminal', state: 'ready' };
    }
    if (interaction.trigger) {
      const trigger = interaction.trigger;
      if (trigger.requiresCredential && !this.player.credentials.has(trigger.requiresCredential)) {
        return { label: `${this.pretty(trigger.requiresCredential)} credential`, icon: `credential-${trigger.requiresCredential}`, state: 'locked' };
      }
      if (trigger.requiresEncounter && this.isEncounterActive(trigger.requiresEncounter)) {
        return { label: 'Threat lock', icon: 'minimal-alert', state: 'locked' };
      }
      const label = trigger.action === 'complete-map' || trigger.action === 'open-exit' ? 'Exit'
        : trigger.action === 'reveal-secret' ? 'Inspect' : trigger.action === 'teleport' ? 'Transfer' : 'Activate';
      return { label, icon: 'minimal-terminal', state: 'ready' };
    }
    if (interaction.exit) {
      const locked = this.world.actors.some((actor) => actor.kind === 'boss' && !actor.dead);
      return locked
        ? { label: 'Threat lock', icon: 'minimal-alert', state: 'locked' }
        : { label: 'Exit', icon: 'minimal-terminal', state: 'ready' };
    }
    return undefined;
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
      const cuePoint = point.clone().add(new Vector3(0, .7, 0));
      if (reason === 'credential') this.playSemanticCue('rejection', cuePoint);
      else this.emitParticles('spark', cuePoint, 2);
    }
    window.dispatchEvent(new CustomEvent('use-failed', { detail: { reason, direction, icon: credential ?? (reason === 'encounter' ? 'authority' : 'use'), ...(credential ? { credential } : {}) } }));
  }

  private isEncounterActive(id: string): boolean {
    return this.world.actors.some((actor) => !actor.dead && actor.encounter === id && (actor.mandatory || actor.kind === 'boss'));
  }

  private teleportTell(position: Vector3): void {
    this.audio.tone(240, .18, 'square', .045);
    const frames = ['start', 'expand-01', 'expand-02', 'expand-03', 'peak', 'collapse-01', 'collapse-02', 'end']
      .map((frame) => `/public_runtime/effects/teleport-approval-ring/fx_teleport-approval-ring_${frame}.png`);
    const point = position.clone().addScaledVector(this.aimDirection(), 1.45).setY(this.world.floorHeightAt(position) + .85);
    this.playSemanticCue('teleport', point);
    if (this.accessibility.reducedEffects || !this.accessibility.flashEffects) return;
    this.playAnimatedEffect('teleport-approval-ring', frames, point, 1.8, .075);
  }

  private completeMap(nextMap?: MapId): void {
    if (this.activeDemo || this.demoReadOnly) {
      if (this.activeDemo) {
        this.activeDemo.finished = true;
        this.activeDemo.paused = true;
      }
      this.mode = 'playing';
      this.showMessage('Replay complete', 2);
      this.emit();
      return;
    }
    if (this.demoRecorder) {
      const demo = this.finishDemoRecording();
      if (demo) window.dispatchEvent(new CustomEvent('demo-recording-complete', { detail: { demo, reason: 'completion' } }));
    }
    const killsPercent = tallyPercent(this.tally.kills, this.tally.totalKills);
    const itemsPercent = tallyPercent(this.tally.items, this.tally.totalItems);
    const secretsPercent = tallyPercent(this.tally.secrets, this.tally.totalSecrets);
    const secretRoute = Boolean(nextMap && nextMap === this.world.map.secretExitTo);
    const completionBonus = (killsPercent === 100 ? 1000 : 0)
      + (itemsPercent === 100 ? 500 : 0)
      + (secretsPercent === 100 ? 1500 : 0)
      + (this.tally.elapsed <= this.world.map.parSeconds ? 1000 : 0)
      + (secretRoute ? 1000 : 0);
    this.momentum.score = Math.round((this.momentum.score + completionBonus) * DIFFICULTY_SCORE_MULTIPLIER[this.difficulty]);
    const performance: MapPerformance = {
      mapId: this.world.map.id,
      difficulty: this.difficulty,
      elapsed: this.tally.elapsed,
      parSeconds: this.world.map.parSeconds,
      score: this.momentum.score,
      bestChain: this.momentum.best,
      killsPercent,
      itemsPercent,
      secretsPercent,
      grade: performanceGrade(killsPercent, itemsPercent, secretsPercent, this.tally.elapsed, this.world.map.parSeconds),
    };
    const before = this.persistence.campaignUnlocks().records[`${performance.mapId}:${performance.difficulty}`];
    const progress = this.persistence.completeMap(this.world.map.id, performance, secretRoute ? nextMap : undefined);
    const record = progress.records[`${performance.mapId}:${performance.difficulty}`];
    const newBests = before ? [
      ...(performance.elapsed < before.bestTime ? ['Best time'] : []),
      ...(performance.score > before.highScore ? ['High score'] : []),
      ...(performance.bestChain > before.bestChain ? ['Best chain'] : []),
      ...(performance.killsPercent > before.bestKillsPercent ? ['Threat mastery'] : []),
      ...(performance.itemsPercent > before.bestItemsPercent ? ['Item mastery'] : []),
      ...(performance.secretsPercent > before.bestSecretsPercent ? ['Secret mastery'] : []),
      ...(performance.grade !== before.bestGrade && record.bestGrade === performance.grade ? ['Grade'] : []),
    ] : ['First clear'];
    this.lastMapResult = { performance, record, completionBonus, newBests, secretRoute };
    if (this.world.map.index === 8) {
      const episode = CAMPAIGN.episodes.find((candidate) => candidate.id === this.world.map.episode);
      const nextEpisode = episode && CAMPAIGN.episodes[episode.number];
      this.persistence.completeEpisode(this.world.map.episode, nextEpisode?.id);
    }
    this.nextMap = nextMap;
    this.mode = 'intermission';
    this.audio.stopMusic();
    this.audio.suspend();
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

  retryCurrentMap(): void {
    if (this.mode !== 'intermission') return;
    this.loadMap(this.world.map.id, false);
  }

  private die(): void {
    if (this.activeDemo || this.demoReadOnly) {
      if (this.activeDemo) {
        this.activeDemo.finished = true;
        this.activeDemo.paused = true;
      }
      this.mode = 'playing';
      this.showMessage('Replay ended', 2);
      this.emit();
      return;
    }
    if (this.mode === 'dead') return;
    if (this.demoRecorder) {
      const demo = this.finishDemoRecording();
      if (demo) window.dispatchEvent(new CustomEvent('demo-recording-complete', { detail: { demo, reason: 'death' } }));
    }
    this.mode = 'dead';
    this.audio.stopMusic();
    this.audio.suspend();
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

  private bestUsableWeapon(exclude?: WeaponId): WeaponId | undefined {
    const priority: readonly WeaponId[] = [
      'binding-engine', 'plasma-copier', 'catastrophe-launcher', 'audit-repeater',
      'twin-bore-riveter', 'staple-driver', 'umbra-saw', 'claim-stamp',
    ];
    return priority.find((id) => {
      if (id === exclude || !this.player.weapons.has(id)) return false;
      const candidate = WEAPONS[id];
      return candidate.ammo === 'none' || this.player.ammo[candidate.ammo] >= candidate.ammoCost;
    });
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
        uid: actor.uid, kind: actor.kind, id: actor.id, health: actor.health, dead: actor.dead, scoreEligible: actor.scoreEligible, phaseLocked: actor.phaseLocked,
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
      momentum: { ...this.momentum },
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
    if (this.activeDemo || this.demoReadOnly) return;
    const state = this.createSaveData();
    const metadata = this.saveMetadata();
    this.persistence.autosave(state, metadata);
    const recovery = this.persistence.loadEpisodeRecovery(this.world.map.episode);
    if (this.world.map.index === 1 || recovery.status !== 'valid') this.persistence.saveEpisodeRecovery(this.world.map.episode, state, metadata);
  }

  save(): void {
    if (!this.world.map || this.activeDemo || this.demoReadOnly) return;
    this.persistence.quicksave(this.createSaveData(), this.saveMetadata(undefined, true));
  }

  saveManual(slot: number, name?: string): void {
    if (!this.world.map || this.activeDemo || this.demoReadOnly) return;
    this.persistence.saveManual(slot, this.createSaveData(), this.saveMetadata(name, true));
  }

  manualSlots(): readonly ManualSlotSummary[] {
    return this.persistence.listManualSlots().map((entry, index) => ({
      slot: index + 1,
      slotId: entry.slotId,
      kind: entry.kind,
      status: entry.status,
      name: entry.status === 'valid' ? entry.metadata.name : entry.defaultName,
      detail: entry.status === 'valid'
        ? `${entry.metadata.mapId} ${entry.metadata.mapTitle} | ${this.pretty(entry.metadata.difficulty)} | ${this.saveTime(entry.metadata.playSeconds)} | ${new Date(entry.metadata.savedAt).toLocaleString()}`
        : entry.status === 'invalid' ? `Unreadable: ${entry.reason}` : 'Empty',
      ...(entry.status === 'valid' ? { thumbnail: entry.metadata.thumbnail } : {}),
    }));
  }

  automaticSlots(): readonly ManualSlotSummary[] {
    return this.persistence.inspectAllSlots()
      .filter((entry) => entry.kind !== 'manual' && entry.status !== 'empty')
      .sort((left, right) => {
        const leftTime = left.status === 'valid' ? left.metadata.savedAt : 0;
        const rightTime = right.status === 'valid' ? right.metadata.savedAt : 0;
        return rightTime - leftTime;
      })
      .map((entry, index) => ({
        slot: index + 1,
        slotId: entry.slotId,
        kind: entry.kind,
        status: entry.status,
        name: entry.status === 'valid' ? entry.metadata.name : entry.defaultName,
        detail: entry.status === 'valid'
          ? `${entry.metadata.mapId} ${entry.metadata.mapTitle} | ${this.pretty(entry.metadata.difficulty)} | ${this.saveTime(entry.metadata.playSeconds)} | ${new Date(entry.metadata.savedAt).toLocaleString()}`
          : entry.status === 'invalid' ? `Unreadable: ${entry.reason}` : 'Empty',
        ...(entry.status === 'valid' ? { thumbnail: entry.metadata.thumbnail } : {}),
      }));
  }

  deleteManual(slot: number): void {
    this.persistence.clearManual(slot);
  }

  loadManual(slot: number): boolean {
    const result = this.persistence.loadManual(slot);
    if (result.status !== 'valid') return false;
    return this.restoreSave(result.state, false);
  }

  loadQuicksave(): boolean {
    const result = this.persistence.loadQuicksave();
    if (result.status === 'valid') return this.restoreSave(result.state);
    this.showMessage('No quicksave is available', 1.8);
    this.emit();
    return false;
  }

  loadAutomatic(slotId: string): boolean {
    const result = this.persistence.inspectAllSlots().find((entry) => entry.slotId === slotId && entry.kind !== 'manual');
    return result?.status === 'valid' ? this.restoreSave(result.state, false) : false;
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
      Object.assign(this.momentum, save.momentum ?? { chain: 0, best: 0, score: 0, timer: 0 });
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
        actor.scoreEligible = saved.scoreEligible ?? !saved.dead;
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
        if (actor.dead) this.setActorDeadVisual(actor, false);
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
      // Transient feedback is intentionally reconstructed from subsequent fixed
      // simulation events, rather than becoming part of saves or demos.
      this.particles.clear();
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
  continueSummary(): string | undefined {
    const result = this.persistence.newestValidContinue();
    if (!result) return undefined;
    return `${result.metadata.mapId} ${result.metadata.mapTitle} | ${this.pretty(result.metadata.difficulty)} | ${new Date(result.metadata.savedAt).toLocaleString()}`;
  }
  get pendingMap(): MapId | undefined { return this.nextMap; }
  get mapResult(): MapResult | undefined { return this.lastMapResult; }

  startDemoRecording(): boolean {
    if (this.mode !== 'playing' || !this.world.map || this.demoRecorder) return false;
    this.particles.clear();
    const initialState = this.createSaveData();
    this.demoRecorder = new DemoRecorder<SaveData, GameplayCommand>({
      tickRate: 35,
      seed: initialState.rng,
      mapId: initialState.mapId,
      initialState,
      maxSerializedBytes: DEMO_STORAGE_BUDGET_BYTES,
    });
    this.demoTick = 0;
    this.emit();
    return true;
  }

  finishDemoRecording(): DemoData<SaveData, GameplayCommand> | undefined {
    if (!this.demoRecorder) return undefined;
    const demo = this.demoRecorder.finish(this.demoTick);
    this.demoRecorder = undefined;
    this.demoTick = 0;
    this.emit();
    return demo;
  }

  isDemoRecording(): boolean { return Boolean(this.demoRecorder); }
  isDemoPlayback(): boolean { return Boolean(this.activeDemo); }

  pauseDemoPlayback(): void {
    if (!this.activeDemo || this.activeDemo.paused || this.activeDemo.finished) return;
    this.activeDemo.paused = true;
    this.audio.suspend();
    this.emit();
  }

  demoSummary(value: unknown): { mapId: MapId; createdAt: number; totalTicks: number; duration: number } | undefined {
    const validation = validateDemo<SaveData, GameplayCommand>(value, {
      validateInitialState: isSaveData,
      validateCommand: isGameplayCommand,
    });
    if (!validation.valid) return undefined;
    const demo = validation.demo;
    if (demo.tickRate !== 35 || demo.totalTicks > MAX_DEMO_TICKS || demo.frames.length > demo.totalTicks
      || demo.mapId !== demo.initialState.mapId || demo.seed !== demo.initialState.rng || !(demo.mapId in CAMPAIGN.maps)) return undefined;
    return { mapId: demo.mapId as MapId, createdAt: demo.createdAt, totalTicks: demo.totalTicks, duration: demo.totalTicks / demo.tickRate };
  }

  startDemoPlayback(value: unknown): boolean {
    const validation = validateDemo<SaveData, GameplayCommand>(value, {
      validateInitialState: isSaveData,
      validateCommand: isGameplayCommand,
    });
    if (!validation.valid) return false;
    const demo = structuredClone(validation.demo);
    if (!this.demoSummary(demo)) return false;
    this.demoRecorder = undefined;
    this.demoTick = 0;
    this.activeDemo = undefined;
    if (!this.restoreSave(structuredClone(demo.initialState), true)) return false;
    this.activeDemo = {
      demo,
      playback: new DemoPlayback<GameplayCommand>(demo),
      paused: true,
      finished: demo.totalTicks === 0,
      speed: 1,
      tickCredit: 0,
    };
    this.audio.suspend();
    document.exitPointerLock();
    this.emit();
    this.render();
    return true;
  }

  toggleDemoPlayback(): boolean {
    if (!this.activeDemo || this.activeDemo.finished) return false;
    this.activeDemo.paused = !this.activeDemo.paused;
    if (this.activeDemo.paused) this.audio.suspend();
    else {
      this.audio.unlock();
      this.audio.resume();
    }
    this.emit();
    return this.activeDemo.paused;
  }

  cycleDemoSpeed(): number {
    if (!this.activeDemo) return 1;
    this.activeDemo.speed = this.activeDemo.speed === .5 ? 1 : this.activeDemo.speed === 1 ? 2 : .5;
    this.emit();
    return this.activeDemo.speed;
  }

  restartDemoPlayback(): boolean {
    const demo = this.activeDemo?.demo;
    return demo ? this.startDemoPlayback(demo) : false;
  }

  stopDemoPlayback(): void {
    if (!this.activeDemo) return;
    this.activeDemo = undefined;
    this.mode = 'menu';
    this.audio.stopMusic();
    this.audio.suspend();
    this.emit();
  }

  private advanceDemoPlayback(): void {
    const active = this.activeDemo;
    if (!active || active.paused || active.finished) return;
    active.tickCredit += active.speed;
    while (active.tickCredit >= 1 && !active.playback.finished && !active.finished) {
      active.tickCredit -= 1;
      const commands = active.playback.next();
      this.simulate(STEP, commands.at(-1) ?? NEUTRAL_COMMAND, false);
      if (this.mode !== 'playing') {
        active.finished = true;
        this.mode = 'playing';
      }
    }
    if (active.playback.finished) active.finished = true;
    if (active.finished) {
      active.paused = true;
      this.audio.suspend();
      document.exitPointerLock();
      this.emit();
    }
  }

  playDemo(value: unknown): boolean {
    const validation = validateDemo<SaveData, GameplayCommand>(value, {
      validateInitialState: isSaveData,
      validateCommand: isGameplayCommand,
    });
    if (!validation.valid) return false;
    const demo = structuredClone(validation.demo);
    if (demo.tickRate !== 35 || demo.mapId !== demo.initialState.mapId || demo.seed !== demo.initialState.rng) return false;
    this.demoRecorder = undefined;
    this.demoTick = 0;
    this.activeDemo = undefined;
    if (!this.restoreSave(structuredClone(demo.initialState), true)) return false;
    const playback = new DemoPlayback<GameplayCommand>(demo);
    this.demoReadOnly = true;
    try {
      while (!playback.finished && this.mode === 'playing') {
        const commands = playback.next();
        this.simulate(STEP, commands.at(-1) ?? NEUTRAL_COMMAND, false);
      }
    } finally {
      this.demoReadOnly = false;
    }
    this.mode = 'paused';
    this.audio.suspend();
    document.exitPointerLock();
    this.emit();
    this.render();
    return playback.finished;
  }

  isEpisodeUnlocked(episodeIndex: number): boolean {
    const episode = CAMPAIGN.episodes[episodeIndex];
    return Boolean(episode && this.persistence.isEpisodeUnlocked(episode.id));
  }

  campaignProgress(): CampaignUnlocks {
    const progress = this.persistence.campaignUnlocks();
    return { ...progress, completedMaps: progress.completedMaps, completedEpisodes: progress.completedEpisodes };
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
    const available = map.secretMap
      ? progress.discoveredSecretMaps.includes(map.id) || progress.completedMaps.includes(map.id)
      : mapIndex === 0 || progress.completedMaps.includes(map.id) || progress.completedMaps.includes(episode.maps[mapIndex - 1]);
    if (!available) throw new Error(`Locked map ${mapId}`);
    this.difficulty = difficulty;
    this.resetInventory();
    this.loadMap(mapId, true);
  }

  private migrateLegacySave(storage: Storage): void {
    if (this.persistence.newestValidContinue()) return;
    let raw: string | null;
    try { raw = storage.getItem(LEGACY_SAVE_KEY); } catch { return; }
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
    this.world.actors.forEach((actor) => {
      if (actor.dead) return;
      actor.phaseLocked = false;
      actor.sprite.visible = true;
      this.damageActor(actor, actor.health + 1);
    });
  }

  debugDefeatPlayer(): void {
    if (this.mode !== 'playing') return;
    this.player.health = 0;
    this.die();
  }

  debugSetAmmo(type: Exclude<AmmoType, 'none'>, amount: number): void {
    this.player.ammo[type] = Math.max(0, Math.floor(amount));
    this.emit();
  }

  debugDefeatEncounter(id: string): number {
    let defeated = 0;
    this.world.actors.filter((actor) => actor.encounter === id && !actor.dead).forEach((actor) => {
      actor.phaseLocked = false;
      actor.sprite.visible = true;
      this.damageActor(actor, actor.health + 1);
      defeated += Number(actor.dead);
    });
    return defeated;
  }

  debugDefeatMandatory(id: string): number {
    let defeated = 0;
    this.world.actors
      .filter((actor) => actor.encounter === id && actor.mandatory && !actor.dead)
      .forEach((actor) => {
        actor.phaseLocked = false;
        actor.sprite.visible = true;
        this.damageActor(actor, actor.health + 1);
        defeated += Number(actor.dead);
      });
    return defeated;
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
    const candidates: Vector3[] = [];
    for (const radius of [1, 1.4, 1.8, 2.2]) {
      for (let index = 0; index < 16; index += 1) {
        const angle = index / 16 * Math.PI * 2;
        candidates.push(new Vector3(door.mesh.position.x + Math.cos(angle) * radius, 0, door.mesh.position.z + Math.sin(angle) * radius));
      }
    }
    const point = candidates.find((candidate) => {
      if (this.world.isSolid(candidate)) return false;
      const targetDistance = Math.hypot(candidate.x - door.mesh.position.x, candidate.z - door.mesh.position.z);
      return [...this.world.doors.values()].filter((other) => !other.open && other.key !== door.key)
        .every((other) => Math.hypot(candidate.x - other.mesh.position.x, candidate.z - other.mesh.position.z) > targetDistance);
    });
    if (!point) return false;
    this.debugTeleport(point.x, point.z);
    return true;
  }

  debugTeleportToExit(): void {
    this.debugTeleport(this.world.map.exit.x * this.world.map.cellSize, this.world.map.exit.z * this.world.map.cellSize);
  }

  debugUse(): void { this.use(); }

  debugParticleBurst(kind: ParticleKind): void {
    const point = this.player.position.clone().addScaledVector(this.aimDirection(), 2.2).add(new Vector3(0, -.15, 0));
    const semantic = PARTICLE_SEMANTIC_CUES[kind];
    if (semantic) this.playSemanticCue(semantic, point);
    else this.emitParticles(kind, point, 18, this.aimDirection());
  }

  debugParticleGallery(kinds: readonly ParticleKind[]): void {
    const forward = this.aimDirection().setY(0).normalize();
    const right = new Vector3(-forward.z, 0, forward.x);
    kinds.slice(0, 8).forEach((kind, index, list) => {
      const point = this.player.position.clone()
        .addScaledVector(forward, 2.55)
        .addScaledVector(right, (index - (list.length - 1) * .5) * .48)
        .add(new Vector3(0, .22 + (index % 2) * .4, 0));
      const semantic = PARTICLE_SEMANTIC_CUES[kind];
      if (semantic) this.playSemanticCue(semantic, point);
      else this.emitParticles(kind, point, 16);
    });
  }
  debugFire(): void { this.weaponCooldown = 0; this.fireWeapon(); }

  debugTeleportToTrigger(action: string, target?: string): boolean {
    const trigger = this.world.map.triggers.find((candidate) => candidate.action === action
      && (!target || candidate.targets.includes(target))
      && (candidate.repeatable || !this.triggered.has(candidate.id)));
    if (!trigger) return false;
    this.debugTeleport(trigger.x * this.world.map.cellSize, trigger.z * this.world.map.cellSize);
    return true;
  }

  debugDefeatActor(id: string): boolean {
    const actor = this.world.actors.find((candidate) => candidate.id === id && !candidate.dead);
    if (!actor) return false;
    actor.phaseLocked = false;
    actor.sprite.visible = true;
    this.damageActor(actor, actor.health + 1);
    return actor.dead;
  }

  debugActivateActor(id: string): boolean {
    const actor = this.world.actors.find((candidate) => candidate.id === id && !candidate.dead);
    if (!actor) return false;
    actor.phaseLocked = false;
    actor.awake = true;
    actor.sprite.visible = true;
    return true;
  }

  debugTeleportNearActor(id: string, distance = 7, includeDead = false): boolean {
    const actor = this.world.actors.find((candidate) => candidate.id === id && (includeDead || !candidate.dead) && !candidate.phaseLocked);
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
    this.player.yaw = Math.atan2(actor.position.x - point.x, actor.position.z - point.z) + Math.PI + .04;
    const horizontal = Math.hypot(actor.position.x - point.x, actor.position.z - point.z);
    const targetY = actor.position.y + ENEMIES[actor.id].height * .5;
    this.player.pitch = Math.atan2(point.y - targetY, horizontal);
    if (!actor.dead) actor.awake = true;
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
      && this.world.hasLineOfSight(this.player.position, actor.position)).map((actor) => ({ id: actor.id, kind: actor.kind, x: +actor.position.x.toFixed(2), z: +actor.position.z.toFixed(2), health: Math.ceil(actor.health), visual: actor.visualState, distance: +this.horizontalDistance(actor.position, this.player.position).toFixed(2) }));
    const visibleCorpses = this.world.actors.filter((actor) => actor.dead && !actor.phaseLocked
      && this.horizontalDistance(actor.position, this.player.position) < 22
      && this.world.hasLineOfSight(this.player.position, actor.position)).slice(0, 16)
      .map((actor) => ({ id: actor.id, kind: actor.kind, visual: actor.visualState, frame: Math.floor(actor.animationTime * 10) }));
    const nearbyPickups = this.world.pickups.filter((pickup) => !pickup.collected && this.horizontalDistance(pickup.position, this.player.position) < 14).map((pickup) => ({ id: pickup.id, kind: pickup.kind, x: +pickup.position.x.toFixed(2), z: +pickup.position.z.toFixed(2) }));
    return JSON.stringify({
      coordinateSystem: 'world units; x increases east/right on automap, z increases south/down; yaw 0 faces north (-z)',
      mode: this.mode,
      map: this.world.map ? { id: this.world.map.id, title: this.world.map.title, exit: this.world.map.exit } : null,
      player: { x: +this.player.position.x.toFixed(2), z: +this.player.position.z.toFixed(2), yaw: +this.player.yaw.toFixed(3), pitch: +this.player.pitch.toFixed(3), health: Math.ceil(this.player.health), armor: Math.ceil(this.player.armor), armorClass: this.player.armorClass, weapon: this.player.weapon, ammo: this.player.ammo, credentials: [...this.player.credentials], floorPlan: this.player.floorPlan, powerups: this.player.powerups },
      visibleActors,
      visibleCorpses,
      nearbyPickups,
      closedDoors: [...this.world.doors.values()].filter((door) => !door.open).map((door) => ({ x: door.x, z: door.z, credential: door.credential ?? null })),
      world: {
        hazardsEnabled: this.world.hazardsEnabled,
        triggered: [...this.triggered],
        sectorMovers: this.world.serializeSectorMovers().map((sector) => ({ key: sector.key, height: +sector.height.toFixed(3), targetHeight: sector.targetHeight })),
        landmarks: this.world.serializeLandmarks().map((landmark) => ({ key: landmark.key, active: landmark.active, x: +landmark.position[0].toFixed(2), z: +landmark.position[2].toFixed(2) })),
        breakables: this.world.serializeBreakables(),
        bindingGates: this.world.bindingGateCount,
        encounters: (this.world.map?.encounters ?? []).map((encounter) => {
          const actors = this.world.actors.filter((actor) => actor.encounter === encounter.id);
          return {
            id: encounter.id,
            live: actors.filter((actor) => !actor.dead).length,
            mandatoryLive: actors.filter((actor) => actor.mandatory && !actor.dead).length,
            locked: actors.filter((actor) => actor.phaseLocked && !actor.dead).length,
          };
        }),
      },
      combatEffects: {
        projectiles: this.enemyBehavior.serialize().projectiles.map((item) => ({ id: item.id, kind: item.kind, x: +item.position.x.toFixed(2), z: +item.position.z.toFixed(2) })),
        hazards: this.enemyBehavior.serialize().hazards.map((item) => ({ id: item.id, kind: item.kind, armed: item.armed, x: +item.position.x.toFixed(2), z: +item.position.z.toFixed(2), remaining: +item.remaining.toFixed(2) })),
        playerProjectiles: this.playerProjectiles.map((item) => ({ id: item.id, weapon: item.weapon, x: +item.position.x.toFixed(2), z: +item.position.z.toFixed(2), remaining: +item.remaining.toFixed(2) })),
        bindingPulses: this.bindingBeam?.pulses ?? 0,
        bindingBeam: this.bindingBeamVisual ? { active: true, length: +this.bindingBeamVisual.length.toFixed(2) } : { active: false, length: 0 },
        hostileBeams: this.hostileBeamVisuals.map((beam) => ({ hit: beam.hit, length: +beam.length.toFixed(2), remaining: +(beam.duration - beam.elapsed).toFixed(3) })),
        animated: this.animatedEffects.map((effect) => ({ family: effect.family, frame: effect.frame + 1 })),
        semanticCues: this.semanticCues.map((cue) => ({
          kind: cue.kind,
          blend: cue.sprite.material.blending === AdditiveBlending ? 'additive' : 'normal',
          opacity: +cue.sprite.material.opacity.toFixed(3),
          remaining: +(cue.duration - cue.elapsed).toFixed(3),
        })),
        particles: { active: this.particles.activeCount, capacity: this.particles.capacity, byKind: this.particles.counts() },
      },
      audio: this.audio.diagnostics(),
      bosses: this.world.actors.filter((actor) => actor.kind === 'boss').map((actor) => ({ id: actor.id, health: actor.health, dead: actor.dead, phaseLocked: actor.phaseLocked })),
      tally: this.tally,
      momentum: this.momentum,
      objective: this.currentObjective(),
      interaction: this.interactionHint() ?? null,
      message: this.message,
      demo: {
        recording: Boolean(this.demoRecorder),
        tick: this.demoTick,
        playback: this.activeDemo ? {
          currentTick: this.activeDemo.playback.currentTick,
          totalTicks: this.activeDemo.demo.totalTicks,
          paused: this.activeDemo.paused,
          finished: this.activeDemo.finished,
          speed: this.activeDemo.speed,
        } : null,
      },
      runtime: {
        halted: this.halted,
        textureCount: this.assets.textures.size,
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        navigationFields: this.hostileNavigationFields.size,
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
  private currentObjective(): string {
    if (!this.world.map) return '';
    const boss = this.world.actors.find((actor) => actor.kind === 'boss' && !actor.dead && !actor.phaseLocked);
    if (boss) return 'Close binding authority';
    const activeAnchors = this.world.actors.filter((actor) => actor.mandatory && !actor.dead && !actor.phaseLocked);
    if (activeAnchors.length) {
      const encounter = activeAnchors[0].encounter;
      const remaining = activeAnchors.filter((actor) => actor.encounter === encounter).length;
      const phase = encounter === 'entry' ? 'initial' : encounter === 'transformation' ? 'control' : encounter === 'climax' ? 'final' : 'required';
      return `Close ${phase} exposures | ${remaining} left`;
    }
    const missingCredential = [...this.world.doors.values()].find((door) => door.credential && !this.player.credentials.has(door.credential))?.credential;
    if (missingCredential) return `Recover ${this.pretty(missingCredential)} credential`;
    const nextMechanism = [...this.world.map.mechanisms]
      .sort((left, right) => left.activationOrder - right.activationOrder)
      .find((mechanism) => !this.world.activatedMechanisms.has(mechanism.id)
        && mechanism.requires.every((requirement) => this.world.activatedMechanisms.has(requirement)));
    if (nextMechanism) return `Activate ${nextMechanism.label}`;
    const climax = this.world.actors.filter((actor) => actor.encounter === 'climax' && actor.mandatory && !actor.dead && !actor.phaseLocked).length;
    if (climax > 0) return `Close final exposures | ${climax} left`;
    return 'Proceed to the exit';
  }
  private emit(): void {
    if (!this.world.map) return;
    const interaction = this.interactionHint();
    this.onChange?.({
      mode: this.mode,
      map: this.world.map,
      player: this.player,
      tally: this.tally,
      momentum: this.momentum,
      boss: this.world.actors.find((actor) => actor.kind === 'boss' && !actor.dead && !actor.phaseLocked),
      message: this.message,
      objective: this.currentObjective(),
      ...(interaction ? { interaction } : {}),
      ...(this.activeDemo ? { replay: {
        currentTick: this.activeDemo.playback.currentTick,
        totalTicks: this.activeDemo.demo.totalTicks,
        paused: this.activeDemo.paused,
        finished: this.activeDemo.finished,
        speed: this.activeDemo.speed,
      } } : {}),
    });
  }
  private showMessage(message: string, duration = 1.2): void { this.message = message; this.messageTimer = duration; }
  private pretty(value: string): string { return value.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' '); }
  private saveTime(seconds: number): string { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
  private emitParticles(
    kind: ParticleKind,
    position: Vector3,
    count: number,
    direction?: Vector3,
    priority?: ParticlePriority,
  ): void {
    const emissionCount = particleEmissionCount(kind, count, this.accessibility);
    if (emissionCount > 0) this.particles.emit(kind, position, emissionCount, direction, { priority });
  }
  private actorDeathParticleKind(actor: RuntimeActor): ParticleKind {
    if (actor.kind === 'boss') return actor.id === 'uninsurable' ? 'deflection' : 'authority';
    if (actor.id === 'returned-mail' || actor.id === 'bad-faith-counsel') return 'paper';
    if (actor.id === 'desk-warden' || actor.id === 'coverage-drone' || actor.id === 'subrogator') return 'metal';
    if (actor.id === 'ember-clerk') return 'ember';
    if (actor.id === 'exposure-hound' || actor.id === 'liability-mass') return 'wax';
    if (actor.id === 'reserve-eater') return 'spittle';
    if (actor.id === 'cat-model') return 'glass';
    return 'toner';
  }
  private breakableParticleKind(prop: string): ParticleKind {
    if (prop.includes('paper') || prop.includes('archive')) return 'paper';
    if (prop.includes('lamp') || prop.includes('rack') || prop.includes('locker') || prop.includes('cabinet') || prop.includes('cart') || prop.includes('baler')) return 'metal';
    if (prop.includes('glass') || prop.includes('microwave')) return 'glass';
    return this.world.episode === 1 ? 'fiber' : 'concrete';
  }
  private configureParticleTextures(): void {
    const frames = (family: 'weapon-feedback' | 'world-feedback' | 'death-feedback' | 'environment-material-feedback' | 'status-feedback', indices: readonly number[]) =>
      indices.map((index) => this.assets.texture(`/public_runtime/effects/particle-${family}/fx_particle-${family}_F_${String(index).padStart(2, '0')}.png`));
    this.particles.setTextures('ink', frames('weapon-feedback', [1, 6]));
    this.particles.setTextures('paper', [...frames('weapon-feedback', [4]), ...frames('death-feedback', [1])]);
    this.particles.setTextures('spark', [...frames('weapon-feedback', [2, 3, 5]), ...frames('world-feedback', [2]), ...frames('death-feedback', [7])]);
    this.particles.setTextures('ember', [...frames('weapon-feedback', [7]), ...frames('death-feedback', [5])]);
    this.particles.setTextures('energy', [...frames('world-feedback', [8]), ...frames('death-feedback', [8])]);
    this.particles.setTextures('smoke', [...frames('world-feedback', [1, 3]), ...frames('death-feedback', [4, 5])]);
    this.particles.setTextures('debris', [...frames('weapon-feedback', [7, 8]), ...frames('death-feedback', [1, 2, 3, 6, 7])]);
    this.particles.setTextures('approval', frames('world-feedback', [5, 6, 7]));
    this.particles.setTextures('fiber', frames('environment-material-feedback', [1]));
    this.particles.setTextures('concrete', frames('environment-material-feedback', [2]));
    this.particles.setTextures('glass', frames('environment-material-feedback', [3]));
    this.particles.setTextures('water', [...frames('environment-material-feedback', [4]), ...frames('world-feedback', [4])]);
    this.particles.setTextures('metal', [...frames('environment-material-feedback', [5]), ...frames('death-feedback', [7])]);
    this.particles.setTextures('toner', frames('environment-material-feedback', [6]));
    this.particles.setTextures('wax', frames('environment-material-feedback', [7]));
    this.particles.setTextures('spittle', frames('environment-material-feedback', [8]));
    this.particles.setTextures('deflection', frames('status-feedback', [1]));
    this.particles.setTextures('neutralize', frames('status-feedback', [2]));
    this.particles.setTextures('authority', frames('status-feedback', [3]));
    this.particles.setTextures('scan', frames('status-feedback', [4, 5]));
    this.particles.setTextures('momentum', frames('status-feedback', [6]));
    this.particles.setTextures('rejection', frames('status-feedback', [7]));
    this.particles.setTextures('confetti', frames('status-feedback', [8]));
  }
  private updateAmbientParticles(dt: number): void {
    if (this.accessibility.reducedEffects || this.mode !== 'playing') return;
    this.ambientParticleTimer -= dt;
    if (this.ambientParticleTimer > 0) return;
    this.ambientParticleTimer = 1.15 + (this.world.episode % 3) * .18;
    const phase = this.tally.elapsed * 1.618;
    const point = this.player.position.clone().add(new Vector3(Math.cos(phase) * 3.4, .45 + Math.sin(phase * .7) * .25, Math.sin(phase) * 3.4));
    if (this.world.isSolid(point, .05)) point.copy(this.player.position).add(new Vector3(Math.cos(phase), .5, Math.sin(phase)));
    const hasLiquidTransformation = this.world.map.triggers.some((trigger) => trigger.action === 'drain-liquid' || trigger.action === 'flood-liquid');
    const kind: ParticleKind = hasLiquidTransformation ? 'water'
      : this.world.episode === 1 ? 'fiber' : this.world.episode === 2 ? 'smoke' : 'scan';
    this.particles.emit(kind, point, 2, undefined, { priority: 'ambient' });
  }
  private random(): number { this.rngState = (Math.imul(1664525, this.rngState) + 1013904223) >>> 0; return this.rngState / 0x100000000; }
  private horizontalDistance(a: Vector3, b: Vector3): number { return Math.hypot(a.x - b.x, a.z - b.z); }
  private actorPan(actor: RuntimeActor): number {
    const angle = Math.atan2(actor.position.x - this.player.position.x, actor.position.z - this.player.position.z);
    return Math.max(-1, Math.min(1, Math.sin(angle - this.player.yaw)));
  }

  private actorAudibility(actor: RuntimeActor): number {
    return this.pointSpatialAudio(actor.position).gain;
  }

  private pointSpatialAudio(position: Vector3): { pan: number; gain: number } {
    const distance = this.horizontalDistance(position, this.player.position);
    const angle = Math.atan2(position.x - this.player.position.x, position.z - this.player.position.z);
    const pan = Math.max(-1, Math.min(1, Math.sin(angle - this.player.yaw)));
    const distanceGain = Math.max(.06, Math.min(1, 1 - Math.max(0, distance - 4) / 44));
    const occlusion = this.world.hasLineOfSight(this.player.position, position) ? 1 : .58;
    return { pan, gain: distanceGain * occlusion };
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
