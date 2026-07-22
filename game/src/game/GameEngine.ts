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
import { ambientAudioGroups, pickupAudioFeedbackCue, surfaceAudioFeedbackGroup } from './AudioSemantics';
import { DEFEATED_ACTOR_FLOOR_OFFSET, defeatedActorScale } from './ActorPresentation';
import {
  aimProjectionOffsetY,
  directionFromView,
  rayVerticalCylinderDistance,
  sampleShotSpread,
  verticalAutoAimDirection,
  verticalAutoAimCylinder,
  VERTICAL_AUTO_AIM_RADIANS,
} from './CombatMath';
import { DIFFICULTY, ENEMIES, WEAPONS, type AmmoType, type GameDifficulty } from './definitions';
import { COMBAT_AMMO_TYPES, addAmmoWithinCap, ammoCap, pickupAmmoGrant, weaponAcquisitionAmmoGrant } from './EconomyPolicy';
import {
  actorDeathEffects,
  breakableDestructionEffects,
  fraudVisibilityEffect,
  projectileResolutionEffect,
  resurrectionEffect,
  type AuthoredEffectCue,
} from './EffectSemantics';
import {
  ENEMY_BEHAVIOR_PROFILES,
  EnemyBehaviorSystem,
  buildNavigationDistanceField,
  navigationDirectionFromField,
  planLegacyRegionalDirectorSummonRestore,
  reconcileEnemyBehaviorSnapshot,
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
  type RestoredBehaviorActorIdentity,
} from './EnemyBehaviorSystem';
import {
  DEFAULT_INPUT_PREFERENCES,
  InputSystem,
  applyClassicLookRestrictions,
  composeLookInput,
  normalizeInputPreferences,
  type InputPreferences,
} from './InputSystem';
import { ParticleSystem, type ParticleKind, type ParticlePriority } from './ParticleSystem';
import {
  predictiveAngle,
  predictiveScalar,
  presentationAlpha,
  shortestAngleDelta,
  shouldSnapPresentation,
} from './PresentationInterpolation';
import {
  buildRouteHint,
  routeHintTier,
  type RouteGuidanceDescriptor,
  type RouteHint,
} from './RouteGuidance';
import {
  DemoPlayback,
  DemoRecorder,
  DEMO_STORAGE_BUDGET_BYTES,
  PersistenceSystem,
  isRunVariant,
  mapRecordKey,
  validateDemo,
  type DemoData,
  type CampaignUnlocks,
  type MapPerformance,
  type MapRecord,
  type PersistenceConflict,
  type RunVariant,
  type SaveKind,
  type SaveMetadataInput,
  type SaveThumbnail,
  type ValidSlotResult,
} from './PersistenceSystem';
import {
  findMatchingRuntimeActorIdentity,
  findMatchingRuntimePickupIdentity,
  findUniqueRuntimeActorIdentity,
  isDynamicSummonUid,
  resolveRestoredActorAwake,
  World,
  type AmmoDropState,
  type BossMechanismState,
  type BreakableState,
  type HazardSectorState,
  type LandmarkState,
  type MoverCompletion,
  type RuntimeActor,
  type RuntimePickup,
  type SectorMoverState,
} from './World';

export type GameMode = 'menu' | 'playing' | 'paused' | 'intermission' | 'dead' | 'complete';

export interface WeaponImpactEventDetail {
  readonly weapon: WeaponId;
  readonly kind: 'wall' | 'actor';
  readonly hitCount?: number;
  readonly damage?: number;
  readonly targetUid?: string;
  readonly killed?: boolean;
}

const SAVE_KIND_LABELS: Readonly<Record<SaveKind, string>> = Object.freeze({
  manual: 'Manual file',
  quicksave: 'Quicksave',
  autosave: 'Autosave',
  recovery: 'Episode recovery',
  conflict: 'Previous tab copy',
});

export interface ContinueDetails {
  readonly kind: string;
  readonly mapId: string;
  readonly mapTitle: string;
  readonly difficulty: string;
  readonly runVariant: string;
  readonly playTime: string;
  readonly savedAt: string;
  readonly savedAtIso: string;
  readonly summary: string;
}

export interface DeathReview {
  readonly cause: string;
  readonly progress: string;
  readonly objective: string;
  readonly recovery: string;
  readonly restartLabel: string;
  readonly advice: string;
}

export interface PauseDetails {
  readonly mapId: string;
  readonly mapTitle: string;
  readonly difficulty: string;
  readonly runVariant: string;
  readonly objective: string;
  readonly progress: string;
  readonly recovery: string;
  readonly recoveryState: 'persistent' | 'session-only' | 'unavailable';
  readonly summary: string;
}

export interface ExitReview {
  readonly mapId: string;
  readonly mapTitle: string;
  readonly returnPoint: string;
  readonly recoveryState: 'persistent' | 'session-only' | 'unavailable';
  readonly consequenceState: 'safe' | 'rewind' | 'discard';
  readonly consequence: string;
  readonly durability: string;
  readonly summary: string;
}

interface LastDamageContext {
  readonly source: string;
  readonly kind: DamageKind;
  readonly amount: number;
}

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

export interface RestoredEncounterEvidence {
  readonly unlockedEncounters?: readonly string[];
  readonly triggered: readonly string[];
  readonly mechanisms?: readonly string[];
  readonly bossMechanisms?: BossMechanismState;
}

export const resolveRestoredUnlockedEncounters = (
  map: CampaignMap,
  evidence: RestoredEncounterEvidence,
): readonly string[] => {
  const encounterIds = new Set(map.encounters.map((encounter) => encounter.id));
  const unlocked = new Set<string>(['entry']);
  const addTargets = (targets: readonly string[] | undefined): void => {
    targets?.forEach((target) => { if (encounterIds.has(target)) unlocked.add(target); });
  };

  if (evidence.unlockedEncounters !== undefined) {
    evidence.unlockedEncounters.forEach((id) => { if (encounterIds.has(id)) unlocked.add(id); });
    return [...unlocked];
  }
  const activatedMechanisms = new Set(
    (evidence.mechanisms ?? []).filter((id) => map.mechanisms.some((mechanism) => mechanism.id === id)),
  );
  evidence.triggered.forEach((token) => {
    if (token.startsWith('encounter-complete:')) {
      const id = token.slice('encounter-complete:'.length);
      if (encounterIds.has(id)) unlocked.add(id);
      const encounter = map.encounters.find((candidate) => candidate.id === id);
      const targets = map.id === 'E3M8' && id === 'boss-1'
        ? encounter?.opens?.filter((target) => target !== 'boss-2')
        : encounter?.opens;
      addTargets(targets);
    }
    const trigger = map.triggers.find((candidate) => candidate.id === token);
    if (!trigger) return;
    addTargets(trigger.targets);
    trigger.targets.forEach((target) => {
      if (map.mechanisms.some((mechanism) => mechanism.id === target)) activatedMechanisms.add(target);
    });
  });
  const independentFamily = map.mechanisms.filter((mechanism) => mechanism.independent);
  map.mechanisms.filter((mechanism) => activatedMechanisms.has(mechanism.id)).forEach((mechanism) => {
    if (mechanism.independent) {
      if (independentFamily.every((member) => activatedMechanisms.has(member.id))) {
        independentFamily.forEach((member) => addTargets(member.opens));
      }
      return;
    }
    if (mechanism.requires.every((required) => activatedMechanisms.has(required))) addTargets(mechanism.opens);
  });
  if (map.id === 'E3M8' && (evidence.bossMechanisms?.bindingGates ?? 0) >= 3) unlocked.add('boss-2');
  return [...unlocked];
};

export const resolveLegacyCompletedEncounters = (
  map: CampaignMap,
  evidence: RestoredEncounterEvidence,
): readonly string[] => {
  if (evidence.unlockedEncounters !== undefined) return [];
  const encounterIds = new Set(map.encounters.map((encounter) => encounter.id));
  const completed = new Set<string>();
  evidence.triggered.forEach((token) => {
    if (token.startsWith('encounter-complete:')) {
      const id = token.slice('encounter-complete:'.length);
      if (encounterIds.has(id)) completed.add(id);
    }
    const requirement = map.triggers.find((trigger) => trigger.id === token)?.requiresEncounter;
    if (requirement && encounterIds.has(requirement)) completed.add(requirement);
  });
  return [...completed];
};

export const reconcileRestoredTally = (
  saved: MapTally,
  actors: readonly Pick<RuntimeActor, 'dead' | 'tallyEligible'>[],
  pickups: readonly Pick<RuntimePickup, 'collected' | 'counted'>[],
  discoveredSecrets: number,
  totalSecrets: number,
): MapTally => ({
  kills: actors.filter((actor) => actor.tallyEligible && actor.dead).length,
  totalKills: actors.filter((actor) => actor.tallyEligible).length,
  items: pickups.filter((pickup) => pickup.counted && pickup.collected).length,
  totalItems: pickups.filter((pickup) => pickup.counted).length,
  secrets: Math.min(discoveredSecrets, totalSecrets),
  totalSecrets,
  elapsed: saved.elapsed,
});

export interface CombatMomentum {
  chain: number;
  best: number;
  score: number;
  timer: number;
}

export type CombatMomentumTier = 'chain' | 'escalation' | 'redline' | 'authority-rush';

export interface CombatMomentumPresentation {
  readonly tier: CombatMomentumTier;
  readonly label: string;
  readonly windowSeconds: number;
  readonly nextThreshold: number | null;
  readonly thresholdReached: boolean;
}

export const combatMomentumPresentation = (chain: number): CombatMomentumPresentation => {
  const count = Math.max(0, Math.floor(Number.isFinite(chain) ? chain : 0));
  if (count >= 8) return {
    tier: 'authority-rush', label: 'Authority Rush', windowSeconds: 6.25, nextThreshold: null, thresholdReached: count === 8,
  };
  if (count >= 5) return {
    tier: 'redline', label: 'Redline', windowSeconds: 5.5, nextThreshold: 8, thresholdReached: count === 5,
  };
  if (count >= 3) return {
    tier: 'escalation', label: 'Escalation', windowSeconds: 4.75, nextThreshold: 5, thresholdReached: count === 3,
  };
  return {
    tier: 'chain', label: 'Chain', windowSeconds: 4, nextThreshold: 3, thresholdReached: false,
  };
};

export interface CombatMomentumEventDetail extends CombatMomentum, CombatMomentumPresentation {}

export interface MapResult {
  readonly performance: MapPerformance;
  readonly record: MapRecord;
  readonly completionBonus: number;
  readonly scoreBreakdown: MapScoreBreakdown;
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
  routeHint?: RouteHint;
  interaction?: InteractionHint;
  death?: DeathReview;
  pause?: PauseDetails;
  replay?: { currentTick: number; totalTicks: number; paused: boolean; finished: boolean; speed: number };
}

export interface SaveData {
  version: 1;
  mode?: 'playing' | 'paused';
  runVariant?: RunVariant;
  mapId: MapId;
  difficulty: GameDifficulty;
  player: {
    health: number; armor: number; armorClass?: PlayerState['armorClass']; position: [number, number, number]; yaw: number; pitch?: number;
    ammo: PlayerState['ammo']; weapons: WeaponId[]; weapon: WeaponId; credentials: Credential[]; floorPlan: boolean; powerups: PlayerState['powerups'];
  };
  actors: Array<{
    uid: string; kind?: 'enemy' | 'boss'; id?: RuntimeActor['id']; authoredKey?: string; health: number; dead: boolean; scoreEligible?: boolean; tallyEligible?: boolean; phaseLocked: boolean;
    position: [number, number, number]; awake?: boolean; facing?: number; animationTime?: number; attackFlash?: number; redacted?: boolean;
  }>;
  pickups: Array<{
    uid: string; collected: boolean; phaseLocked?: boolean;
    kind?: RuntimePickup['kind']; id?: RuntimePickup['id']; position?: [number, number, number];
  }>;
  doors: Array<string | { key: string; open: boolean; progress: number }>;
  secrets: string[];
  visited: string[];
  triggered: string[];
  mechanisms?: string[];
  unlockedEncounters?: string[];
  hazardsEnabled: boolean;
  hazardSectors?: HazardSectorState[];
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

interface PresentationSnapshot {
  readonly playerPosition: Vector3;
  readonly playerYaw: number;
  readonly playerPitch: number;
  readonly actorPositions: ReadonlyMap<string, Vector3>;
  readonly enemyProjectilePositions: ReadonlyMap<string, Vector3>;
  readonly playerProjectilePositions: ReadonlyMap<string, Vector3>;
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
  readonly userVerticalAutoAim: boolean;
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
  const inRange = (candidate: unknown, minimum: number, maximum: number): boolean =>
    typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= minimum && candidate <= maximum;
  return inRange(command.forward, -3, 3)
    && inRange(command.strafe, -3, 3)
    && inRange(command.turn, -8, 8)
    && inRange(command.look, -100_000, 100_000)
    && (command.lookVertical === undefined || inRange(command.lookVertical, -100_000, 100_000))
    && Number.isSafeInteger(command.weaponSlot) && Number(command.weaponSlot) >= 0 && Number(command.weaponSlot) <= 8
    && Number.isSafeInteger(command.weaponCycle) && Number(command.weaponCycle) >= -1 && Number(command.weaponCycle) <= 1
    && typeof command.fire === 'boolean'
    && typeof command.use === 'boolean'
    && typeof command.walkToggle === 'boolean';
};

const LEGACY_SAVE_KEY = 'red-ledger-save-v1';
const STEP = 1 / 35;
export const MAX_DEMO_TICKS = 35 * 60 * 45;
export const RECOVERY_CHECKPOINT_INTERVAL_SECONDS = 60;

export interface RecoveryCheckpointSchedule {
  readonly lastElapsed: number;
  readonly nextElapsed: number;
}

export interface RecoveryCheckpointContext {
  readonly mode: GameMode;
  readonly demoPlayback: boolean;
  readonly demoRecording: boolean;
  readonly demoReadOnly: boolean;
  readonly playtestReadOnly: boolean;
}

const normalizedRecoveryElapsed = (elapsed: number): number => Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;

export const createRecoveryCheckpointSchedule = (
  elapsed: number,
  checkpointed = false,
): RecoveryCheckpointSchedule => {
  const normalized = normalizedRecoveryElapsed(elapsed);
  return {
    lastElapsed: checkpointed ? normalized : Number.NEGATIVE_INFINITY,
    nextElapsed: normalized + RECOVERY_CHECKPOINT_INTERVAL_SECONDS,
  };
};

export const recoveryCheckpointDue = (
  schedule: RecoveryCheckpointSchedule,
  elapsed: number,
  periodic: boolean,
): boolean => {
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed <= schedule.lastElapsed + 1e-6) return false;
  return !periodic || elapsed + 1e-6 >= schedule.nextElapsed;
};

export const recoveryCheckpointAllowed = (context: RecoveryCheckpointContext): boolean =>
  context.mode === 'playing'
  && !context.demoPlayback
  && !context.demoRecording
  && !context.demoReadOnly
  && !context.playtestReadOnly;

const TIMED_PICKUP_ANNOUNCEMENTS: Readonly<Partial<Record<PickupId, string>>> = {
  'temporary-binder': 'Temporary Binder: blocks all damage for 30 seconds',
  'hazard-endorsement': 'Hazard Endorsement: prevents floor hazard damage for 30 seconds',
  'rapid-authority': 'Rapid Authority: weapons fire faster for 30 seconds',
  'forensic-lens': 'Forensic Lens: reveals threats and slows their targeting for 30 seconds',
  'night-inspection-goggles': 'Night Inspection Goggles: improves distance visibility for 30 seconds',
};

export const timedPickupAnnouncement = (id: PickupId): string | undefined => TIMED_PICKUP_ANNOUNCEMENTS[id];

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

export type TimedPowerupKey = keyof PlayerState['powerups'];

const FORENSIC_SIGNATURE_TINT = 0x47bcd1;
const REDACTED_ACTOR_TINT = 0xc93434;

export const hostileSignatureTint = (forensicActive: boolean, redacted: boolean, dead: boolean): number => {
  if (forensicActive && !dead) return FORENSIC_SIGNATURE_TINT;
  return redacted ? REDACTED_ACTOR_TINT : 0xffffff;
};

export const statusExpiryParticleFeedbackKind = (powerup: TimedPowerupKey): ParticleKind => ({
  binder: 'deflection',
  hazard: 'neutralize',
  rapid: 'authority',
  forensic: 'scan',
  goggles: 'scan',
})[powerup] as ParticleKind;

export const surfaceParticleFeedbackKind = (material: string): ParticleKind => {
  const id = material.toLowerCase();
  if (id.includes('toner')) return 'toner';
  if (id.includes('wet') || id.includes('water') || id.includes('flood')) return 'water';
  if (id.includes('wax')) return 'wax';
  if (id.includes('probability') || id.includes('white-void')) return 'scan';
  if (id.includes('carpet') || id.includes('rubber') || id.includes('paper')) return 'fiber';
  if (id.includes('steel') || id.includes('metal') || id.includes('brass')
    || id.includes('plate') || id.includes('hazard-stripe') || id.includes('data-center')) return 'metal';
  return 'concrete';
};

export const doorParticleFeedbackKind = (material: string, credential?: Credential): ParticleKind =>
  credential ? 'metal' : surfaceParticleFeedbackKind(material);

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

export type ScoreBonusId = 'threats' | 'items' | 'secrets' | 'par' | 'secret-route';

export interface ScoreBonusBreakdown {
  readonly id: ScoreBonusId;
  readonly label: string;
  readonly requirement: string;
  readonly available: number;
  readonly awarded: number;
  readonly earned: boolean;
}

export interface MapScoreBreakdown {
  readonly combatScore: number;
  readonly bonuses: readonly ScoreBonusBreakdown[];
  readonly bonusSubtotal: number;
  readonly preMultiplierScore: number;
  readonly multiplier: number;
  readonly finalScore: number;
}

export interface MapScoreBreakdownInput {
  readonly combatScore: number;
  readonly killsPercent: number;
  readonly itemsPercent: number;
  readonly secretsPercent: number;
  readonly beatPar: boolean;
  readonly secretRoute: boolean;
  readonly difficulty: GameDifficulty;
}

/** One authoritative explanation of the score awarded at map completion. */
export const mapScoreBreakdown = (input: MapScoreBreakdownInput): MapScoreBreakdown => {
  const definitions: readonly Omit<ScoreBonusBreakdown, 'awarded' | 'earned'>[] = [
    { id: 'threats', label: 'Threat mastery', requirement: 'Close every threat', available: 1000 },
    { id: 'items', label: 'Item mastery', requirement: 'Recover every counted item', available: 500 },
    { id: 'secrets', label: 'Secret mastery', requirement: 'Find every secret', available: 1500 },
    { id: 'par', label: 'Par time', requirement: 'Finish at or under par', available: 1000 },
    { id: 'secret-route', label: 'Secret route', requirement: 'Use the concealed exit', available: 1000 },
  ];
  const earnedById: Readonly<Record<ScoreBonusId, boolean>> = {
    threats: input.killsPercent === 100,
    items: input.itemsPercent === 100,
    secrets: input.secretsPercent === 100,
    par: input.beatPar,
    'secret-route': input.secretRoute,
  };
  const bonuses = definitions.map((definition): ScoreBonusBreakdown => {
    const earned = earnedById[definition.id];
    return { ...definition, earned, awarded: earned ? definition.available : 0 };
  });
  const bonusSubtotal = bonuses.reduce((total, bonus) => total + bonus.awarded, 0);
  const preMultiplierScore = input.combatScore + bonusSubtotal;
  const multiplier = DIFFICULTY_SCORE_MULTIPLIER[input.difficulty];
  return {
    combatScore: input.combatScore,
    bonuses,
    bonusSubtotal,
    preMultiplierScore,
    multiplier,
    finalScore: Math.round(preMultiplierScore * multiplier),
  };
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

const transientPlaytestRecord = (performance: MapPerformance): MapRecord => ({
  mapId: performance.mapId,
  difficulty: performance.difficulty,
  runVariant: performance.runVariant,
  completions: 1,
  bestTime: performance.elapsed,
  highScore: performance.score,
  bestChain: performance.bestChain,
  bestKillsPercent: performance.killsPercent,
  bestItemsPercent: performance.itemsPercent,
  bestSecretsPercent: performance.secretsPercent,
  bestGrade: performance.grade,
  parBeaten: performance.elapsed <= performance.parSeconds,
  achievedAt: 0,
});

export const runVariantLabel = (runVariant: RunVariant): string => ({
  'fresh-start': 'Fresh Start',
  'campaign-carry': 'Campaign Carry',
  'legacy-unclassified': 'Legacy Run',
})[runVariant];

export const restoredRunVariant = (save: Pick<SaveData, 'runVariant'>): RunVariant =>
  save.runVariant ?? 'legacy-unclassified';

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
  kind: 'manual' | 'quicksave' | 'autosave' | 'recovery' | 'conflict';
  status: 'empty' | 'valid' | 'invalid';
  name: string;
  detail: string;
  thumbnail?: SaveThumbnail;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isVector3 = (value: unknown): value is [number, number, number] => Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');
const isNumberInRange = (value: unknown, minimum: number, maximum: number): value is number =>
  isFiniteNumber(value) && value >= minimum && value <= maximum;
const isNonNegativeNumber = (value: unknown): value is number => isFiniteNumber(value) && value >= 0;
const isSafeIntegerInRange = (value: unknown, minimum: number, maximum: number): value is number =>
  Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
const isNonNegativeSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const isIdentity = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128;
const hasUniqueStrings = (values: readonly string[]): boolean => new Set(values).size === values.length;
const isKnownStringArray = (value: unknown, allowed: ReadonlySet<string>, maximum: number): value is string[] =>
  isStringArray(value) && value.length <= maximum && hasUniqueStrings(value) && value.every((entry) => allowed.has(entry));

const SAVE_MODES: ReadonlySet<string> = new Set(['playing', 'paused']);
const ARMOR_CLASSES: ReadonlySet<string> = new Set(['none', 'light', 'heavy']);
const WEAPON_STATES: ReadonlySet<string> = new Set(['ready', 'lowering', 'raising']);
const ACTOR_KINDS: ReadonlySet<string> = new Set(['enemy', 'boss']);
const PICKUP_KINDS: ReadonlySet<string> = new Set(['pickup', 'weapon', 'credential']);
const ACTOR_ACTIONS: ReadonlySet<string> = new Set(['dormant', 'acquire', 'chase', 'windup', 'recovery', 'pain', 'dead']);
const DAMAGE_KINDS: ReadonlySet<string> = new Set(['ballistic', 'fire', 'impact', 'denial', 'toner', 'hazard', 'prediction', 'redaction']);
const CREDENTIAL_IDS: ReadonlySet<string> = new Set(['red', 'yellow', 'cyan']);
const COMBAT_AMMO_IDS: ReadonlySet<string> = new Set(COMBAT_AMMO_TYPES);
const PICKUP_IDS: ReadonlySet<string> = new Set<PickupId>([
  'staples-small', 'staples-large', 'fasteners-small', 'fasteners-large', 'canister', 'canister-crate',
  'toner-cell', 'toner-pack', 'adhesive-bandage', 'field-medical-case', 'goodwill-token', 'loss-control-vest',
  'catastrophe-suit', 'emergency-reserve', 'temporary-binder', 'night-inspection-goggles', 'hazard-endorsement',
  'rapid-authority', 'floor-plan', 'forensic-lens',
]);
const BOSS_ACTIONS: ReadonlySet<string> = new Set([
  'open-add-shutters', 'disable-left-emitter', 'disable-right-emitter', 'sink-cover',
  'arena-switch-ready', 'open-binding-gate', 'expose-core',
]);
const MAX_REMAINING_DURATION_SECONDS = 60 * 60 * 24 * 7;
const MAX_RUNTIME_ENTITIES = 4096;
const UINT32_MAX = 0xffff_ffff;

const isBehaviorVector = (value: unknown, maximumMagnitude: number): boolean => isRecord(value)
  && isNumberInRange(value.x, -maximumMagnitude, maximumMagnitude)
  && isNumberInRange(value.y, -maximumMagnitude, maximumMagnitude)
  && isNumberInRange(value.z, -maximumMagnitude, maximumMagnitude);

const isHazardTemplate = (value: unknown): boolean => isRecord(value)
  && isIdentity(value.kind)
  && isNumberInRange(value.radius, 0, 64)
  && isNumberInRange(value.damage, 0, 100_000)
  && typeof value.damageKind === 'string' && DAMAGE_KINDS.has(value.damageKind)
  && isNumberInRange(value.duration, 0, MAX_REMAINING_DURATION_SECONDS)
  && isNumberInRange(value.armTime, 0, MAX_REMAINING_DURATION_SECONDS)
  && isNumberInRange(value.pulseInterval, 0, MAX_REMAINING_DURATION_SECONDS);

const isEnemyBehaviorSnapshot = (
  value: unknown,
  savedActors: ReadonlyMap<string, RuntimeActor['id']>,
): value is EnemyBehaviorSnapshot => {
  if (!isRecord(value) || value.version !== 1
    || !isNonNegativeNumber(value.elapsed)
    || !Number.isSafeInteger(value.nextEntityId) || Number(value.nextEntityId) < 1
    || !Array.isArray(value.actors) || value.actors.length > MAX_RUNTIME_ENTITIES
    || !Array.isArray(value.projectiles) || value.projectiles.length > MAX_RUNTIME_ENTITIES
    || !Array.isArray(value.hazards) || value.hazards.length > MAX_RUNTIME_ENTITIES) return false;

  const actorStateUids = new Set<string>();
  for (const entry of value.actors) {
    if (!isRecord(entry) || !isIdentity(entry.uid) || actorStateUids.has(entry.uid)
      || typeof entry.hostileId !== 'string' || !(entry.hostileId in ENEMIES)
      || !isFiniteNumber(entry.cooldown)
      || !isNonNegativeSafeInteger(entry.attackCursor)
      || !isSafeIntegerInRange(entry.phaseIndex, 0, 64)
      || !isIdentity(entry.phaseId)
      || !isNonNegativeNumber(entry.bobClock)
      || !isNumberInRange(entry.revealRemaining, 0, MAX_REMAINING_DURATION_SECONDS)
      || !isNumberInRange(entry.stateTimer, 0, MAX_REMAINING_DURATION_SECONDS)
      || typeof entry.visible !== 'boolean' || ![-1, 1].includes(Number(entry.strafeSign))
      || !isIdentity(entry.targetUid) || typeof entry.redacted !== 'boolean'
      || (entry.action !== undefined && (typeof entry.action !== 'string' || !ACTOR_ACTIONS.has(entry.action)))
      || (entry.provokerUid !== undefined && !isIdentity(entry.provokerUid))
      || !isNumberInRange(entry.lungeRemaining ?? 0, 0, MAX_REMAINING_DURATION_SECONDS)
      || (entry.lungeVelocity !== undefined && !isBehaviorVector(entry.lungeVelocity, 256))) return false;
    const hostileId = entry.hostileId as RuntimeActor['id'];
    const profile = ENEMY_BEHAVIOR_PROFILES[hostileId];
    const phase = profile.phases?.[Number(entry.phaseIndex)];
    if ((profile.phases?.length ? phase?.id : 'base') !== entry.phaseId) return false;
    if (entry.pendingAttackId !== undefined
      && (!isIdentity(entry.pendingAttackId) || !profile.attacks.some((attack) => attack.id === entry.pendingAttackId))) return false;
    const savedId = savedActors.get(entry.uid);
    if (savedId !== undefined && savedId !== hostileId) return false;
    actorStateUids.add(entry.uid);
  }

  const validReference = (uid: unknown): uid is string => isIdentity(uid) && (uid === 'player' || savedActors.has(uid));
  const projectileIds = new Set<string>();
  for (const entry of value.projectiles) {
    if (!isRecord(entry) || !isIdentity(entry.id) || projectileIds.has(entry.id)
      || !validReference(entry.ownerUid) || entry.ownerUid === 'player'
      || typeof entry.ownerId !== 'string' || !(entry.ownerId in ENEMIES)
      || savedActors.get(entry.ownerUid) !== entry.ownerId
      || !isIdentity(entry.kind) || !isBehaviorVector(entry.position, 10_000) || !isBehaviorVector(entry.velocity, 512)
      || !isNumberInRange(entry.radius, 0, 64) || !isNumberInRange(entry.damage, 0, 100_000)
      || typeof entry.damageKind !== 'string' || !DAMAGE_KINDS.has(entry.damageKind)
      || !isNumberInRange(entry.remaining, 0, MAX_REMAINING_DURATION_SECONDS)
      || !isNumberInRange(entry.homing, 0, 100)
      || !validReference(entry.targetUid)
      || (entry.gravity !== undefined && !isNumberInRange(entry.gravity, -512, 512))
      || (entry.impactHazard !== undefined && !isHazardTemplate(entry.impactHazard))) return false;
    projectileIds.add(entry.id);
  }

  const hazardIds = new Set<string>();
  for (const entry of value.hazards) {
    if (!isRecord(entry) || !isIdentity(entry.id) || hazardIds.has(entry.id)
      || !validReference(entry.ownerUid) || entry.ownerUid === 'player'
      || typeof entry.ownerId !== 'string' || !(entry.ownerId in ENEMIES)
      || savedActors.get(entry.ownerUid) !== entry.ownerId
      || !isIdentity(entry.kind) || !isBehaviorVector(entry.position, 10_000)
      || !isNumberInRange(entry.radius, 0, 64) || !isNumberInRange(entry.damage, 0, 100_000)
      || typeof entry.damageKind !== 'string' || !DAMAGE_KINDS.has(entry.damageKind)
      || !isNumberInRange(entry.remaining, 0, MAX_REMAINING_DURATION_SECONDS)
      || !isNumberInRange(entry.armRemaining, 0, MAX_REMAINING_DURATION_SECONDS)
      || !isNumberInRange(entry.pulseRemaining, 0, MAX_REMAINING_DURATION_SECONDS)
      || !isNumberInRange(entry.pulseInterval, 0, MAX_REMAINING_DURATION_SECONDS)
      || typeof entry.armed !== 'boolean') return false;
    hazardIds.add(entry.id);
  }

  if (value.pendingSounds !== undefined && (!Array.isArray(value.pendingSounds)
    || value.pendingSounds.length > MAX_RUNTIME_ENTITIES
    || !value.pendingSounds.every((entry) => isRecord(entry) && isBehaviorVector(entry.position, 10_000)
      && isNumberInRange(entry.radius, 0, 10_000) && validReference(entry.sourceUid)))) return false;
  if (value.pendingDamage !== undefined && (!Array.isArray(value.pendingDamage)
    || value.pendingDamage.length > MAX_RUNTIME_ENTITIES
    || !value.pendingDamage.every((entry) => isRecord(entry) && validReference(entry.targetUid)
      && validReference(entry.sourceUid) && isNumberInRange(entry.amount, 0, 100_000)))) return false;
  if (value.summonOwners !== undefined) {
    if (!Array.isArray(value.summonOwners) || value.summonOwners.length > MAX_RUNTIME_ENTITIES) return false;
    const owners = new Set<string>();
    for (const entry of value.summonOwners) {
      if (!isRecord(entry) || !validReference(entry.ownerUid) || entry.ownerUid === 'player' || owners.has(entry.ownerUid)
        || !isStringArray(entry.actorUids) || entry.actorUids.length > MAX_RUNTIME_ENTITIES
        || !hasUniqueStrings(entry.actorUids) || !entry.actorUids.every((uid) => validReference(uid) && uid !== 'player')
        || !isSafeIntegerInRange(entry.total, entry.actorUids.length, MAX_RUNTIME_ENTITIES)) return false;
      owners.add(entry.ownerUid);
    }
  }
  return value.rngState === undefined || isSafeIntegerInRange(value.rngState, 0, UINT32_MAX);
};

const mapIdentitySets = (map: CampaignMap): {
  readonly grid: ReadonlySet<string>;
  readonly sectors: ReadonlySet<string>;
  readonly doors: ReadonlySet<string>;
  readonly hazards: ReadonlySet<string>;
  readonly secrets: ReadonlySet<string>;
  readonly triggers: ReadonlySet<string>;
  readonly mechanisms: ReadonlySet<string>;
  readonly encounters: ReadonlySet<string>;
  readonly landmarks: ReadonlySet<string>;
  readonly breakables: ReadonlyMap<string, number>;
} => {
  const grid = new Set<string>();
  const sectors = new Set<string>();
  const doors = new Set<string>();
  const hazards = new Set<string>();
  map.grid.forEach((row, z) => [...row].forEach((cell, x) => {
    const key = `${x},${z}`;
    grid.add(key);
    if (!map.legend[cell]?.solid) sectors.add(key);
    if ('DRYC'.includes(cell)) doors.add(key);
    if (cell === 'h' || cell === 'w') hazards.add(key);
  }));
  return {
    grid,
    sectors,
    doors,
    hazards,
    secrets: new Set(map.secrets.map((secret) => secret.id)),
    triggers: new Set([
      ...map.triggers.map((trigger) => trigger.id),
      ...map.encounters.map((encounter) => `encounter-complete:${encounter.id}`),
    ]),
    mechanisms: new Set(map.mechanisms.map((mechanism) => mechanism.id)),
    encounters: new Set(map.encounters.map((encounter) => encounter.id)),
    landmarks: new Set(map.landmarks.map((landmark) => landmark.id)),
    breakables: new Map(map.breakables.map((breakable) => [breakable.id, breakable.health])),
  };
};

const isMapPosition = (value: unknown, map: CampaignMap, margin = map.cellSize): value is [number, number, number] => {
  if (!isVector3(value)) return false;
  const width = (map.grid[0]?.length ?? 0) * map.cellSize;
  const depth = map.grid.length * map.cellSize;
  return value[0] >= -margin && value[0] <= width + margin
    && value[1] >= -32 && value[1] <= 32
    && value[2] >= -margin && value[2] <= depth + margin;
};

const MAX_PLAYER_PROJECTILE_ABSOLUTE_Y = 32 + Math.max(14 * 4, 28 * 2.2);
const isPlayerProjectilePosition = (value: unknown, map: CampaignMap): value is [number, number, number] => {
  if (!isVector3(value)) return false;
  const margin = map.cellSize * 2;
  const width = (map.grid[0]?.length ?? 0) * map.cellSize;
  const depth = map.grid.length * map.cellSize;
  return value[0] >= -margin && value[0] <= width + margin
    && Math.abs(value[1]) <= MAX_PLAYER_PROJECTILE_ABSOLUTE_Y
    && value[2] >= -margin && value[2] <= depth + margin;
};

const isPickupIdentity = (kind: unknown, id: unknown): boolean => {
  if (typeof kind !== 'string' || !PICKUP_KINDS.has(kind) || typeof id !== 'string') return false;
  if (kind === 'pickup') return PICKUP_IDS.has(id);
  if (kind === 'weapon') return id in WEAPONS;
  return CREDENTIAL_IDS.has(id);
};

export const isSaveData = (value: unknown): value is SaveData => {
  if (!isRecord(value) || value.version !== 1
    || (value.mode !== undefined && (typeof value.mode !== 'string' || !SAVE_MODES.has(value.mode)))
    || (value.runVariant !== undefined && !isRunVariant(value.runVariant))
    || typeof value.mapId !== 'string' || !CAMPAIGN.maps[value.mapId as MapId]
    || typeof value.difficulty !== 'string' || !(value.difficulty in DIFFICULTY)
    || !isRecord(value.player)) return false;
  const map = CAMPAIGN.maps[value.mapId as MapId];
  const identities = mapIdentitySets(map);
  const player = value.player;
  if (!isRecord(player.ammo) || !isRecord(player.powerups)) return false;
  const ammo = player.ammo;
  const powerups = player.powerups;
  if (!isNumberInRange(player.health, 0, 200) || !isNumberInRange(player.armor, 0, 200)
    || (player.armorClass !== undefined && (typeof player.armorClass !== 'string' || !ARMOR_CLASSES.has(player.armorClass)))
    || (player.armorClass === 'none' && player.armor !== 0)
    || (player.armorClass !== undefined && player.armorClass !== 'none' && player.armor === 0)
    || !isMapPosition(player.position, map, 0)
    || !isNumberInRange(player.yaw, -1_000_000_000, 1_000_000_000)
    || (player.pitch !== undefined && !isNumberInRange(player.pitch, -.62, .62))
    || !COMBAT_AMMO_TYPES.every((ammoId) => isNumberInRange(ammo[ammoId], 0, ammoCap(ammoId)))
    || !isStringArray(player.weapons) || player.weapons.length === 0 || player.weapons.length > Object.keys(WEAPONS).length
    || !hasUniqueStrings(player.weapons) || !player.weapons.every((weapon) => weapon in WEAPONS)
    || typeof player.weapon !== 'string' || !(player.weapon in WEAPONS) || !player.weapons.includes(player.weapon)
    || !isKnownStringArray(player.credentials, CREDENTIAL_IDS, CREDENTIAL_IDS.size)
    || typeof player.floorPlan !== 'boolean'
    || !['binder', 'hazard', 'rapid', 'forensic', 'goggles'].every((powerup) => isNumberInRange(powerups[powerup], 0, 30))) return false;

  if (!Array.isArray(value.actors) || value.actors.length > MAX_RUNTIME_ENTITIES) return false;
  const actorUids = new Set<string>();
  const savedActors = new Map<string, RuntimeActor['id']>();
  for (const entry of value.actors) {
    if (!isRecord(entry) || !isIdentity(entry.uid) || actorUids.has(entry.uid)
      || !isNumberInRange(entry.health, 0, 100_000) || typeof entry.dead !== 'boolean'
      || (entry.dead !== (entry.health === 0)) || typeof entry.phaseLocked !== 'boolean'
      || !isMapPosition(entry.position, map)
      || (entry.authoredKey !== undefined && !isIdentity(entry.authoredKey))
      || (entry.scoreEligible !== undefined && typeof entry.scoreEligible !== 'boolean')
      || (entry.tallyEligible !== undefined && typeof entry.tallyEligible !== 'boolean')
      || (entry.awake !== undefined && typeof entry.awake !== 'boolean')
      || (entry.facing !== undefined && !isNumberInRange(entry.facing, -Math.PI, Math.PI))
      || (entry.animationTime !== undefined && !isNonNegativeNumber(entry.animationTime))
      || (entry.attackFlash !== undefined && !isNumberInRange(entry.attackFlash, 0, 60))
      || (entry.redacted !== undefined && typeof entry.redacted !== 'boolean')) return false;
    const hasKind = entry.kind !== undefined;
    const hasId = entry.id !== undefined;
    if (hasKind !== hasId) return false;
    if (hasKind) {
      if (typeof entry.kind !== 'string' || !ACTOR_KINDS.has(entry.kind)
        || typeof entry.id !== 'string' || !(entry.id in ENEMIES)) return false;
      const id = entry.id as RuntimeActor['id'];
      const expectedKind = ENEMIES[id].faction === 'bureaucracy' ? 'enemy' : 'boss';
      if (entry.kind !== expectedKind || Number(entry.health) > ENEMIES[id].health) return false;
      savedActors.set(entry.uid, id);
    }
    actorUids.add(entry.uid);
  }

  if (!Array.isArray(value.pickups) || value.pickups.length > MAX_RUNTIME_ENTITIES) return false;
  const pickupUids = new Set<string>();
  const pickupByUid = new Map<string, Record<string, unknown>>();
  for (const entry of value.pickups) {
    if (!isRecord(entry) || !isIdentity(entry.uid) || pickupUids.has(entry.uid)
      || typeof entry.collected !== 'boolean'
      || (entry.phaseLocked !== undefined && typeof entry.phaseLocked !== 'boolean')) return false;
    const identityParts = [entry.kind, entry.id, entry.position].filter((part) => part !== undefined).length;
    if (identityParts !== 0 && (identityParts !== 3 || !isPickupIdentity(entry.kind, entry.id) || !isMapPosition(entry.position, map))) return false;
    pickupUids.add(entry.uid);
    pickupByUid.set(entry.uid, entry);
  }

  if (!Array.isArray(value.doors) || value.doors.length > identities.doors.size) return false;
  const doorKeys = new Set<string>();
  for (const entry of value.doors) {
    const key = typeof entry === 'string' ? entry : isRecord(entry) ? entry.key : undefined;
    if (typeof key !== 'string' || !identities.doors.has(key) || doorKeys.has(key)) return false;
    if (typeof entry !== 'string' && (!isRecord(entry) || typeof entry.open !== 'boolean'
      || !isNumberInRange(entry.progress, 0, 1))) return false;
    doorKeys.add(key);
  }

  if (!isRecord(value.tally)) return false;
  const tally = value.tally;
  if (!isKnownStringArray(value.secrets, identities.secrets, identities.secrets.size)
    || !isKnownStringArray(value.visited, identities.grid, identities.grid.size)
    || !isKnownStringArray(value.triggered, identities.triggers, identities.triggers.size)
    || (value.mechanisms !== undefined && !isKnownStringArray(value.mechanisms, identities.mechanisms, identities.mechanisms.size))
    || (value.unlockedEncounters !== undefined
      && (!isKnownStringArray(value.unlockedEncounters, identities.encounters, identities.encounters.size)
        || !value.unlockedEncounters.includes('entry')))
    || typeof value.hazardsEnabled !== 'boolean'
    || !['kills', 'totalKills', 'items', 'totalItems', 'secrets', 'totalSecrets'].every((key) => isNonNegativeSafeInteger(tally[key]))
    || !isNonNegativeNumber(tally.elapsed)
    || Number(tally.kills) > Number(tally.totalKills)
    || Number(tally.items) > Number(tally.totalItems)
    || Number(tally.secrets) > Number(tally.totalSecrets)
    || !isSafeIntegerInRange(value.rng, 0, UINT32_MAX)) return false;

  if (value.hazardSectors !== undefined) {
    if (!Array.isArray(value.hazardSectors) || value.hazardSectors.length > identities.hazards.size) return false;
    const keys = new Set<string>();
    if (!value.hazardSectors.every((entry) => isRecord(entry) && typeof entry.key === 'string'
      && identities.hazards.has(entry.key) && !keys.has(entry.key) && Boolean(keys.add(entry.key))
      && typeof entry.enabled === 'boolean')) return false;
  }
  if (value.momentum !== undefined && (!isRecord(value.momentum)
    || !isNonNegativeSafeInteger(value.momentum.chain)
    || !Number.isSafeInteger(value.momentum.best) || Number(value.momentum.best) < Number(value.momentum.chain)
    || !isNonNegativeSafeInteger(value.momentum.score)
    || !isNumberInRange(value.momentum.timer, 0, 60))) return false;
  if (value.enemyBehavior !== undefined && !isEnemyBehaviorSnapshot(value.enemyBehavior, savedActors)) return false;

  if (value.playerProjectiles !== undefined) {
    if (!Array.isArray(value.playerProjectiles) || value.playerProjectiles.length > MAX_RUNTIME_ENTITIES) return false;
    const ids = new Set<string>();
    for (const entry of value.playerProjectiles) {
      if (!isRecord(entry) || !isIdentity(entry.id) || ids.has(entry.id)
        || typeof entry.weapon !== 'string' || !['catastrophe-launcher', 'plasma-copier'].includes(entry.weapon)
        || !player.weapons.includes(entry.weapon) || !isPlayerProjectilePosition(entry.position, map)
        || !isVector3(entry.velocity) || !entry.velocity.every((component) => Math.abs(component) <= 512)
        || !isNumberInRange(entry.damage, 0, 100_000) || !isNumberInRange(entry.radius, 0, 64)
        || !isNumberInRange(entry.remaining, 0, MAX_REMAINING_DURATION_SECONDS)) return false;
      ids.add(entry.id);
    }
  }

  if (value.ammoDrops !== undefined) {
    if (!Array.isArray(value.ammoDrops) || value.ammoDrops.length > MAX_RUNTIME_ENTITIES) return false;
    const ids = new Set<string>();
    for (const entry of value.ammoDrops) {
      if (!isRecord(entry) || !isIdentity(entry.uid) || ids.has(entry.uid) || !isMapPosition(entry.position, map)
        || typeof entry.ammoId !== 'string' || !COMBAT_AMMO_IDS.has(entry.ammoId)
        || !isNumberInRange(entry.amount, 0, ammoCap(entry.ammoId as Exclude<AmmoType, 'none'>))
        || typeof entry.collected !== 'boolean') return false;
      const pickup = pickupByUid.get(entry.uid);
      const expectedPickup = entry.ammoId === 'staples' ? 'staples-small'
        : entry.ammoId === 'fasteners' ? 'fasteners-small'
          : entry.ammoId === 'canisters' ? 'canister' : 'toner-cell';
      if (!pickup || pickup.collected !== entry.collected) return false;
      const hasPickupIdentity = pickup.kind !== undefined;
      if (hasPickupIdentity && (pickup.kind !== 'pickup' || pickup.id !== expectedPickup
        || !isVector3(pickup.position)
        || pickup.position.some((component, index) => Math.abs(component - (entry.position as number[])[index]) > .01))) return false;
      ids.add(entry.uid);
    }
  }

  if (value.bindingBeam !== undefined && (!isRecord(value.bindingBeam)
    || !player.weapons.includes('binding-engine')
    || !isSafeIntegerInRange(value.bindingBeam.pulses, 0, 20)
    || !isNumberInRange(value.bindingBeam.timer, 0, 1))) return false;
  if (value.sectors !== undefined) {
    if (!Array.isArray(value.sectors) || value.sectors.length > identities.sectors.size) return false;
    const keys = new Set<string>();
    if (!value.sectors.every((entry) => isRecord(entry) && typeof entry.key === 'string'
      && identities.sectors.has(entry.key) && !keys.has(entry.key) && Boolean(keys.add(entry.key))
      && isNumberInRange(entry.height, -32, 32) && isNumberInRange(entry.targetHeight, -32, 32))) return false;
  }
  if (value.landmarks !== undefined) {
    if (!Array.isArray(value.landmarks) || value.landmarks.length > identities.landmarks.size) return false;
    const keys = new Set<string>();
    if (!value.landmarks.every((entry) => isRecord(entry) && typeof entry.key === 'string'
      && identities.landmarks.has(entry.key) && !keys.has(entry.key) && Boolean(keys.add(entry.key))
      && isMapPosition(entry.position, map, map.cellSize * 4) && isMapPosition(entry.targetPosition, map, map.cellSize * 4)
      && typeof entry.active === 'boolean')) return false;
  }
  if (value.breakables !== undefined) {
    if (!Array.isArray(value.breakables) || value.breakables.length > identities.breakables.size) return false;
    const keys = new Set<string>();
    for (const entry of value.breakables) {
      if (!isRecord(entry) || typeof entry.key !== 'string' || keys.has(entry.key) || !identities.breakables.has(entry.key)
        || !isNumberInRange(entry.health, 0, identities.breakables.get(entry.key)!) || typeof entry.destroyed !== 'boolean'
        || entry.destroyed !== (entry.health === 0)) return false;
      keys.add(entry.key);
    }
  }

  if (value.bossMechanisms !== undefined) {
    if (!isRecord(value.bossMechanisms) || !Array.isArray(value.bossMechanisms.actions)
      || value.bossMechanisms.actions.length > BOSS_ACTIONS.size
      || !value.bossMechanisms.actions.every((action) => typeof action === 'string' && BOSS_ACTIONS.has(action))
      || !hasUniqueStrings(value.bossMechanisms.actions as string[])
      || !isSafeIntegerInRange(value.bossMechanisms.bindingGates, 0, 3)) return false;
    const actions = new Set(value.bossMechanisms.actions as string[]);
    const gates = Number(value.bossMechanisms.bindingGates);
    if ((gates > 0) !== actions.has('open-binding-gate') || (gates > 0 && map.id !== 'E3M8')) return false;
  }

  if (value.runtime !== undefined) {
    if (!isRecord(value.runtime)
      || !isNumberInRange(value.runtime.weaponCooldown, 0, 60)
      || !isNumberInRange(value.runtime.damageCooldown, 0, 60)
      || !isNumberInRange(value.runtime.messageTimer, 0, 60)
      || typeof value.runtime.message !== 'string' || value.runtime.message.length > 512
      || typeof value.runtime.walkMode !== 'boolean'
      || !isNonNegativeSafeInteger(value.runtime.projectileSequence)
      || !isVector3(value.runtime.playerVelocity) || value.runtime.playerVelocity.some((component) => Math.abs(component) > 16)
      || (value.runtime.weaponState !== undefined
        && (typeof value.runtime.weaponState !== 'string' || !WEAPON_STATES.has(value.runtime.weaponState)))
      || !isNumberInRange(value.runtime.weaponTransition ?? 0, 0, 60)
      || (value.runtime.pendingWeapon !== undefined
        && (typeof value.runtime.pendingWeapon !== 'string' || !(value.runtime.pendingWeapon in WEAPONS)
          || !player.weapons.includes(value.runtime.pendingWeapon)))) return false;
    const state = value.runtime.weaponState ?? 'ready';
    const transition = Number(value.runtime.weaponTransition ?? 0);
    const pending = value.runtime.pendingWeapon;
    if (state === 'ready' && (pending !== undefined || transition !== 0)) return false;
    if (state === 'lowering' && (typeof pending !== 'string' || pending === player.weapon || transition > WEAPONS[player.weapon as WeaponId].lowerTime)) return false;
    if (state === 'raising' && (transition > WEAPONS[player.weapon as WeaponId].raiseTime
      || (pending !== undefined && pending === player.weapon))) return false;
    if (value.playerProjectiles) {
      const greatestSequence = value.playerProjectiles.reduce((greatest, projectile) => {
        const match = /^player-projectile-(\d+)$/.exec(projectile.id);
        return match ? Math.max(greatest, Number(match[1])) : greatest;
      }, -1);
      if (greatestSequence >= Number(value.runtime.projectileSequence)) return false;
    }
  }
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
  runVariant: RunVariant = 'fresh-start';
  tally: MapTally = { kills: 0, totalKills: 0, items: 0, totalItems: 0, secrets: 0, totalSecrets: 0, elapsed: 0 };
  readonly momentum: CombatMomentum = { chain: 0, best: 0, score: 0, timer: 0 };
  message = '';
  sensitivity = DEFAULT_INPUT_PREFERENCES.mouseSensitivity;
  controllerSensitivity = DEFAULT_INPUT_PREFERENCES.controllerSensitivity;
  touchSensitivity = DEFAULT_INPUT_PREFERENCES.touchSensitivity;
  invertLookY = DEFAULT_INPUT_PREFERENCES.invertY;
  controllerDeadzone = DEFAULT_INPUT_PREFERENCES.controllerDeadzone;
  classicInput = false;
  verticalAutoAim = true;
  accessibility = { highContrast: false, reducedEffects: false, reducedMotion: false, flashEffects: true, screenShake: true };
  onChange?: (snapshot: GameSnapshot) => void;
  onIntermission?: (nextMap?: MapId) => void;
  private accumulator = 0;
  private lastTime = performance.now();
  private weaponCooldown = 0;
  private damageCooldown = 0;
  private messageTimer = 0;
  private routeGuidanceElapsed = 0;
  private routeGuidanceSignature = '';
  private routeHint?: RouteHint;
  private lastDamageContext?: LastDamageContext;
  private lastDeathReview?: DeathReview;
  private rngState = 0x4d595df4;
  private nextMap?: MapId;
  private readonly triggered = new Set<string>();
  private applyingEnemyEventBatch = false;
  private enemyEventBatchCheckpointPending = false;
  private applyingSimulationTick = false;
  private simulationCheckpointPending = false;
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
  private playtestReadOnly = false;
  private recoveryCheckpointState = createRecoveryCheckpointSchedule(0);
  private radialSelecting = false;
  private weaponState: 'ready' | 'lowering' | 'raising' = 'ready';
  private weaponTransition = 0;
  private pendingWeapon?: WeaponId;
  private renderScale = 1;
  private renderCount = 0;
  private halted = false;
  private ambientParticleTimer = 0;
  private ambientAudioTimer = 0;
  private ambientAudioCursor = 0;
  private movementParticleDistance = 0;
  private visibilityRefreshTimer = 0;
  private readonly behaviorLineOfSightFrom = new Vector3();
  private readonly behaviorLineOfSightTo = new Vector3();
  private lastMapResult?: MapResult;
  private readonly animatedEffects: AnimatedEffect[] = [];
  private readonly semanticCues: SemanticCue[] = [];
  private previousPresentation?: PresentationSnapshot;
  private currentPresentation?: PresentationSnapshot;
  private presentationBlend = 0;
  private readonly presentedPlayerPosition = new Vector3();
  private presentedPlayerYaw = 0;
  private presentedPlayerPitch = 0;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly assets: AssetCatalog,
    playtestReadOnly = false,
  ) {
    this.playtestReadOnly = playtestReadOnly;
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
    window.addEventListener('pagehide', () => { this.checkpoint(); });
    window.addEventListener('accessibility-settings-change', (event) => {
      const detail = (event as CustomEvent<Partial<typeof this.accessibility>>).detail;
      Object.assign(this.accessibility, detail);
    });
    this.loop = this.loop.bind(this);
    this.animationFrame = requestAnimationFrame(this.loop);
  }

  static async create(
    canvas: HTMLCanvasElement,
    options: { readonly playtestReadOnly?: boolean } = {},
  ): Promise<GameEngine> {
    return new GameEngine(canvas, await AssetCatalog.load(), options.playtestReadOnly ?? false);
  }

  setRenderScale(scale: number): void {
    this.renderScale = Math.max(1, Math.min(3, Math.round(scale)));
    this.applyViewportSize();
  }

  setInputPreferences(value: unknown): InputPreferences {
    const preferences = normalizeInputPreferences(value);
    this.sensitivity = preferences.mouseSensitivity;
    this.controllerSensitivity = preferences.controllerSensitivity;
    this.touchSensitivity = preferences.touchSensitivity;
    this.invertLookY = preferences.invertY;
    this.controllerDeadzone = preferences.controllerDeadzone;
    this.input.setControllerDeadzone(preferences.controllerDeadzone);
    return preferences;
  }

  private applyViewportSize(): void {
    const portrait = matchMedia('(pointer: coarse)').matches && innerHeight > innerWidth;
    const aspect = portrait ? innerWidth / innerHeight : 16 / 10;
    const baseWidth = portrait ? 200 : 320;
    const baseHeight = portrait ? Math.round(baseWidth / aspect) : 200;
    this.renderer.setSize(baseWidth * this.renderScale, baseHeight * this.renderScale, false);
    this.camera.aspect = aspect;
    this.camera.setViewOffset(
      baseWidth,
      baseHeight,
      0,
      aimProjectionOffsetY(baseHeight, portrait),
      baseWidth,
      baseHeight,
    );
    if (this.world?.map && this.mode !== 'playing') this.render();
  }

  startEpisode(episodeIndex: number, difficulty: GameDifficulty): void {
    this.difficulty = difficulty;
    const episode = CAMPAIGN.episodes[episodeIndex];
    if (!episode) throw new Error(`Unknown episode ${episodeIndex}`);
    this.loadMap(episode.maps[0], false, true, 'fresh-start');
  }

  loadMap(
    id: MapId,
    preserveInventory = true,
    createCheckpoint = true,
    runVariant?: RunVariant,
  ): void {
    const map = CAMPAIGN.maps[id];
    if (!map) throw new Error(`Unknown map ${id}`);
    const inferredVariant: RunVariant = preserveInventory
      && this.world.map?.episode === map.episode
      ? 'campaign-carry'
      : 'fresh-start';
    this.runVariant = runVariant ?? inferredVariant;
    this.demoRecorder = undefined;
    this.demoTick = 0;
    if (!preserveInventory || this.runVariant === 'fresh-start') this.resetInventory();
    this.resetMapScopedPlayerState();
    this.clearAnimatedEffects();
    this.assets.disposeTextures();
    this.particles.clearTextureBindings();
    this.configureParticleTextures();
    this.world.load(map, DIFFICULTY[this.difficulty].placement);
    this.particles.clear();
    this.ambientParticleTimer = .7;
    this.ambientAudioTimer = 3.5;
    this.ambientAudioCursor = 0;
    this.movementParticleDistance = 0;
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
    if (this.activeDemo) this.verticalAutoAim = this.activeDemo.userVerticalAutoAim;
    this.activeDemo = undefined;
    this.lastMapResult = undefined;
    this.lastDamageContext = undefined;
    this.lastDeathReview = undefined;
    this.player.position.set(map.playerStart.x * map.cellSize, 0, map.playerStart.z * map.cellSize);
    this.player.position.y = this.world.floorHeightAt(this.player.position) + 1.35;
    this.player.yaw = ({ north: Math.PI, east: -Math.PI / 2, south: 0, west: Math.PI / 2 })[map.playerStart.facing];
    this.player.pitch = 0;
    this.player.credentials.clear();
    this.tally = {
      kills: 0,
      totalKills: this.world.actors.filter((actor) => actor.tallyEligible).length,
      items: 0,
      totalItems: this.world.pickups.filter((pickup) => pickup.counted).length,
      secrets: 0,
      totalSecrets: map.secrets.length,
      elapsed: 0,
    };
    this.recoveryCheckpointState = createRecoveryCheckpointSchedule(this.tally.elapsed);
    Object.assign(this.momentum, { chain: 0, best: 0, score: 0, timer: 0 });
    this.mode = 'playing';
    this.nextMap = undefined;
    this.triggered.clear();
    this.resetRouteGuidance();
    this.scene.fog = new FogExp2(Number(map.id[1]) === 1 ? 0x34383d : Number(map.id[1]) === 2 ? 0x18342f : 0x33070b, .012);
    this.audio.playMusic(map.music);
    const firstActor = this.world.actors[0];
    const firstBehavior = firstActor ? ENEMY_BEHAVIOR_PROFILES[firstActor.id] : undefined;
    void this.audio.prepareCueGroups([
      `weapon/${this.player.weapon}/fire`,
      ...(firstActor ? [`enemy/${firstActor.id}/alert`] : []),
      ...(firstBehavior?.attacks.map((attack) => `attack/${attack.id}/windup`) ?? []),
    ]);
    this.showMessage(`${map.id}: ${map.title}`, 2.8);
    this.updateCamera();
    this.accumulator = 0;
    this.resetPresentationHistory();
    this.visibilityRefreshTimer = 0;
    this.world.actors.forEach((actor) => this.updateActorVisual(actor, true));
    this.refreshPickupVisibility();
    this.emit();
    if (createCheckpoint) this.checkpoint();
  }

  pause(): void {
    if (this.mode !== 'playing') return;
    this.checkpoint();
    this.mode = 'paused';
    if (this.world.map) this.render();
    this.audio.suspend();
    document.exitPointerLock();
    this.emit();
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.input.clearGameplayActions();
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
      this.beginPresentationTick();
      if (this.activeDemo) this.advanceDemoPlayback();
      else this.simulate(STEP);
      this.finishPresentationTick();
    }
    this.render();
  }

  private loop(now: number): void {
    if (this.halted) return;
    const elapsed = Math.min(.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    let simulated = false;
    if (this.mode === 'playing') {
      this.accumulator += elapsed;
      while (this.accumulator >= STEP) {
        this.beginPresentationTick();
        if (this.activeDemo) this.advanceDemoPlayback();
        else this.simulate(STEP);
        this.finishPresentationTick();
        this.accumulator -= STEP;
        simulated = true;
      }
    }
    if (this.mode === 'playing' || simulated) this.render(presentationAlpha(this.accumulator, STEP));
    this.animationFrame = requestAnimationFrame(this.loop);
  }

  private simulate(dt: number, playbackCommand?: GameplayCommand, recordDemo = true): void {
    if (!playbackCommand) this.input.pollGamepad();
    if (!playbackCommand) {
      this.handleGlobalKeys();
      if (this.mode !== 'playing') return;
    }
    this.applyingSimulationTick = true;
    let completed = false;
    try {
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
      this.updateAmbientAudio(dt);
      this.updateAmbientParticles(dt);
      this.updatePowerupTimers(dt);
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
      this.punctuateMoverCompletions(this.world.updateMovers(dt));
      this.world.markVisited(this.player.position);
      this.updateSecrets();
      this.updatePlayerProjectiles(dt);
      this.updateBindingBeam(dt);
      this.visibilityRefreshTimer -= dt;
      const refreshVisibility = this.visibilityRefreshTimer <= 0;
      if (refreshVisibility) this.visibilityRefreshTimer = .1;
      this.updateEnemies(dt, refreshVisibility);
      if (refreshVisibility) this.refreshPickupVisibility();
      this.updateHostileBeamVisuals(dt);
      this.weaponSelection(command);
      if (command.fire) this.fireWeapon();
      if (command.use) this.use();
      this.updateRouteGuidance(dt);
      this.updateCamera();
      if (this.player.health <= 0) this.die();
      completed = true;
    } finally {
      this.applyingSimulationTick = false;
      const explicitCheckpoint = completed && this.simulationCheckpointPending;
      this.simulationCheckpointPending = false;
      if (completed) this.checkpoint(!explicitCheckpoint);
    }
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
    const mouseLook = this.input.consumeLook();
    const mouseLookVertical = this.input.consumeVerticalLook();
    const lookInput = composeLookInput({
      keyboardTurn: (this.input.keys.has('ArrowRight') ? 1 : 0) - (this.input.keys.has('ArrowLeft') ? 1 : 0),
      keyboardLook: (this.input.keys.has('PageDown') ? 1 : 0) - (this.input.keys.has('PageUp') ? 1 : 0),
      mouseX: mouseLook,
      mouseY: mouseLookVertical,
      controllerX: this.input.gamepadLook.x,
      controllerY: this.input.gamepadLook.y,
      touchX: this.input.touchLook.x,
      touchY: this.input.touchLook.y,
    }, {
      mouseSensitivity: this.sensitivity,
      controllerSensitivity: this.controllerSensitivity,
      touchSensitivity: this.touchSensitivity,
      invertY: this.invertLookY,
      controllerDeadzone: this.controllerDeadzone,
    });
    const constrainedLook = applyClassicLookRestrictions(lookInput, this.classicInput);
    return {
      forward: (this.input.keys.has('KeyW') || this.input.keys.has('ArrowUp') ? 1 : 0)
        - (this.input.keys.has('KeyS') || this.input.keys.has('ArrowDown') ? 1 : 0) - this.input.touchMove.y - this.input.gamepadMove.y,
      strafe: (this.input.keys.has('KeyD') ? 1 : 0) - (this.input.keys.has('KeyA') ? 1 : 0) + this.input.touchMove.x + this.input.gamepadMove.x,
      turn: this.radialSelecting ? 0 : lookInput.turn,
      look: constrainedLook.deltaX,
      lookVertical: constrainedLook.deltaY,
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
      const transition = !document.fullscreenElement
        ? document.documentElement.requestFullscreen?.()
        : document.exitFullscreen?.();
      if (!transition) this.showMessage('Fullscreen unavailable', 1.2);
      else void transition.catch(() => this.showMessage('Fullscreen unavailable', 1.2));
    }
  }

  private movePlayer(dt: number, command: GameplayCommand): void {
    const previousX = this.player.position.x;
    const previousZ = this.player.position.z;
    this.player.yaw -= command.look * .002;
    this.player.yaw -= command.turn * 2.25 * dt;
    this.player.pitch = Math.max(-.62, Math.min(.62, this.player.pitch - (command.lookVertical ?? 0) * .002));
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
    this.updateMovementParticles(Math.hypot(this.player.position.x - previousX, this.player.position.z - previousZ));
    if (this.world.isHazardAt(this.player.position) && this.damageCooldown <= 0) {
      if (this.player.powerups.hazard > 0) this.playSemanticCue('neutralize', this.player.position.clone().add(new Vector3(0, -.55, 0)));
      else {
        this.damagePlayer(this.world.hazardDamageAt(this.player.position) * .4, undefined, 'hazard');
        this.emitParticles(this.world.episode === 2 ? 'water' : 'spittle', this.player.position.clone().add(new Vector3(0, -.75, 0)), 5);
      }
      this.damageCooldown = .4;
    }
  }

  private updateMovementParticles(distance: number): void {
    if (distance <= .001) return;
    this.movementParticleDistance += distance;
    const spacing = this.walkMode ? 1.9 : 2.45;
    if (this.movementParticleDistance < spacing) return;
    this.movementParticleDistance %= spacing;
    const tile = this.world.map.legend[this.world.tileAt(this.player.position)];
    this.audio.playCue(surfaceAudioFeedbackGroup(tile?.floorMaterial ?? ''), {
      gain: this.walkMode ? .42 : .58,
      priority: 'routine',
    });
    if (this.accessibility.reducedEffects) return;
    const kind = surfaceParticleFeedbackKind(tile?.floorMaterial ?? '');
    const point = this.player.position.clone();
    point.y = this.world.floorHeightAt(point) + .08;
    this.emitParticles(kind, point, 1, undefined, 'ambient');
  }

  private updatePowerupTimers(dt: number): void {
    for (const key of Object.keys(this.player.powerups) as TimedPowerupKey[]) {
      const previous = this.player.powerups[key];
      const remaining = Math.max(0, previous - dt);
      this.player.powerups[key] = remaining;
      if (!(previous > 0 && remaining === 0)) continue;
      const kind = statusExpiryParticleFeedbackKind(key);
      const point = this.player.position.clone().add(new Vector3(0, -.55, 0));
      this.emitParticles(kind, point, 2);
      this.audio.uiCue('status-expire');
      window.dispatchEvent(new CustomEvent('powerup-expired', { detail: { powerup: key, kind } }));
    }
  }

  private punctuateMoverCompletions(completions: readonly MoverCompletion[]): void {
    if (completions.length === 0) return;
    let door: MoverCompletion | undefined;
    let sector: MoverCompletion | undefined;
    let doorDistance = Number.POSITIVE_INFINITY;
    let sectorDistance = Number.POSITIVE_INFINITY;
    for (const completion of completions) {
      const distance = (completion.x - this.player.position.x) ** 2 + (completion.z - this.player.position.z) ** 2;
      if (completion.kind === 'door' && distance < doorDistance) {
        door = completion;
        doorDistance = distance;
      } else if (completion.kind === 'sector' && distance < sectorDistance) {
        sector = completion;
        sectorDistance = distance;
      }
    }
    if (door) {
      const spatial = this.pointSpatialAudio(new Vector3(door.x, door.y, door.z));
      this.audio.worldCue('door-open', spatial.pan, spatial.gain * .62);
      this.emitParticles(
        doorParticleFeedbackKind(door.material, door.credential),
        new Vector3(door.x, door.y + .08, door.z),
        3,
      );
    }
    if (sector) {
      const spatial = this.pointSpatialAudio(new Vector3(sector.x, sector.y, sector.z));
      this.audio.worldCue('lift-end', spatial.pan, spatial.gain);
      this.emitParticles(
        surfaceParticleFeedbackKind(sector.material),
        new Vector3(sector.x, sector.y + .08, sector.z),
        3,
      );
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
      this.audio.weaponDryCue(weapon.id);
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
      const autoTarget = this.findTarget(direction, weapon.range, this.verticalAutoAimTolerance());
      if (autoTarget && this.verticalAutoAim) direction = this.verticalAssistedDirection(direction, autoTarget);
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
    let damageDealt = 0;
    let killedAny = false;
    let actorImpact: Vector3 | undefined;
    let wallImpact: Vector3 | undefined;
    for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
      const spread = sampleShotSpread(weapon.spread, () => this.random());
      const direction = this.aimDirection(spread.yaw, spread.pitch);
      const aimAssist = this.verticalAutoAimTolerance();
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
      const healthBefore = target.health;
      this.damageActor(target, this.rollWeaponDamage(weapon.id), 'player');
      damageDealt += Math.max(0, healthBefore - target.health);
      const impact = target.position.clone().add(new Vector3(0, ENEMIES[target.id].height * .55, 0));
      this.emitParticles('ink', impact, weapon.pellets > 1 ? 1 : 4, impactParticleDirection(direction));
      actorImpact ??= impact;
      hitCount += 1;
      killedAny ||= target.dead;
    }
    if (actorImpact) this.playWeaponImpact(weapon.id, actorImpact, true);
    else if (wallImpact) this.playWeaponImpact(weapon.id, wallImpact);
    window.dispatchEvent(new CustomEvent<WeaponImpactEventDetail>('weapon-impact', { detail: {
      weapon: weapon.id,
      kind: actorImpact ? 'actor' : 'wall',
      hitCount,
      damage: damageDealt,
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
    const spatial = this.pointSpatialAudio(position);
    this.audio.weaponImpactCue(weapon, spatial.pan, spatial.gain * (actor ? 1 : .78));
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
      const target = this.findTarget(direction, WEAPONS['binding-engine'].range, this.verticalAutoAimTolerance());
      let endpoint = this.traceWorldImpact(direction, WEAPONS['binding-engine'].range);
      if (target) {
        const healthBefore = target.health;
        this.damageActor(target, this.rollWeaponDamage('binding-engine'), 'player');
        endpoint = this.targetRayPoint(direction, target);
        this.emitParticles('energy', endpoint, 2, impactParticleDirection(direction));
        window.dispatchEvent(new CustomEvent<WeaponImpactEventDetail>('weapon-impact', { detail: {
          weapon: 'binding-engine',
          kind: 'actor',
          damage: Math.max(0, healthBefore - target.health),
          targetUid: target.uid,
          killed: target.dead,
        } }));
      }
      else {
        const breakable = this.findBreakableTarget(direction, WEAPONS['binding-engine'].range, this.verticalAutoAimTolerance());
        if (breakable) {
          endpoint = breakable.position.clone().add(new Vector3(0, .6, 0));
          this.damageBreakable(breakable.key, this.rollWeaponDamage('binding-engine'), impactParticleDirection(direction));
        }
      }
      if (this.bindingBeam.pulses % 5 === 0) this.audio.weaponImpactCue('binding-engine', 0, .5);
      this.bindingBeam.pulses -= 1;
      this.bindingBeam.timer += 1 / 22;
      if (this.bindingBeam.pulses <= 0) this.bindingBeam.timer += .12;
    }
    if (this.bindingBeam) {
      const direction = this.aimDirection();
      const target = this.findTarget(direction, WEAPONS['binding-engine'].range, this.verticalAutoAimTolerance());
      const endpoint = target
        ? this.targetRayPoint(direction, target)
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
        const targetHealthBefore = target?.health;
        if (target) this.damageActor(target, projectile.damage, 'player');
        else {
          const breakable = this.world.closestBreakable(projectile.position, projectile.radius + .9);
          if (breakable) this.damageBreakable(breakable.key, projectile.damage, impactParticleDirection(projectile.velocity));
        }
        this.playWeaponImpact(projectile.weapon, projectile.position, Boolean(target));
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
        window.dispatchEvent(new CustomEvent<WeaponImpactEventDetail>('weapon-impact', { detail: {
          weapon: projectile.weapon,
          kind: target ? 'actor' : 'wall',
          damage: target && targetHealthBefore !== undefined ? Math.max(0, targetHealthBefore - target.health) : 0,
          targetUid: target?.uid,
          killed: target?.dead ?? false,
        } }));
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
    if (playerDistance < radius && this.world.hasLineOfSight(center, this.player.position)) {
      this.damagePlayer(maxDamage * (1 - playerDistance / radius), 'player', 'impact');
    }
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
      const horizontalDistance = Math.hypot(
        center.x - this.player.position.x,
        center.z - this.player.position.z,
      );
      const volume = verticalAutoAimCylinder(
        actor.position,
        definition.radius,
        definition.height,
        horizontalDistance,
        tolerance,
      );
      const distance = rayVerticalCylinderDistance(
        this.player.position, direction, volume.base,
        volume.radius, volume.height, bestDistance,
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
      const horizontalDistance = Math.hypot(
        center.x - this.player.position.x,
        center.z - this.player.position.z,
      );
      const volume = verticalAutoAimCylinder(
        breakable.position,
        .35,
        1.2,
        horizontalDistance,
        tolerance,
      );
      const distance = rayVerticalCylinderDistance(
        this.player.position, direction, volume.base, volume.radius, volume.height, bestDistance,
      );
      if (distance === undefined || !this.world.hasLineOfSight(this.player.position, center)) continue;
      result = breakable;
      bestDistance = distance;
    }
    return result;
  }

  private verticalAssistedDirection(direction: Vector3, target: RuntimeActor): Vector3 {
    const center = target.position.clone().add(new Vector3(0, ENEMIES[target.id].height * .5, 0));
    const assisted = verticalAutoAimDirection(this.player.position, direction, center);
    return new Vector3(assisted.x, assisted.y, assisted.z);
  }

  private targetRayPoint(direction: Vector3, target: RuntimeActor): Vector3 {
    const center = target.position.clone().add(new Vector3(0, ENEMIES[target.id].height * .5, 0));
    const ray = this.verticalAutoAim ? this.verticalAssistedDirection(direction, target) : direction;
    const horizontalRay = Math.hypot(ray.x, ray.z);
    if (horizontalRay <= 1e-8) return center;
    const horizontalDistance = Math.hypot(
      center.x - this.player.position.x,
      center.z - this.player.position.z,
    );
    return this.player.position.clone().addScaledVector(ray, horizontalDistance / horizontalRay);
  }

  private verticalAutoAimTolerance(): number {
    return this.verticalAutoAim ? VERTICAL_AUTO_AIM_RADIANS : 0;
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
    const spatial = this.pointSpatialAudio(impactPoint);
    this.audio.worldCue('breakable', spatial.pan, spatial.gain);
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
    if (actor.tallyEligible) this.tally.kills += 1;
    const awardsScore = sourceUid === 'player' && actor.scoreEligible;
    actor.scoreEligible = false;
    if (awardsScore) {
      this.momentum.chain = this.momentum.timer > 0 ? this.momentum.chain + 1 : 1;
      this.momentum.best = Math.max(this.momentum.best, this.momentum.chain);
      const momentumPresentation = combatMomentumPresentation(this.momentum.chain);
      this.momentum.timer = momentumPresentation.windowSeconds;
      this.momentum.score += Math.round((100 + Math.min(400, actor.maxHealth * .35)) * this.momentum.chain);
      if (this.momentum.chain > 1) this.audio.uiCue('momentum');
      window.dispatchEvent(new CustomEvent<CombatMomentumEventDetail>('combat-momentum', {
        detail: { ...this.momentum, ...momentumPresentation },
      }));
      if (momentumPresentation.thresholdReached) {
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
    this.resolveEncounterCompletion(actor.encounter, deathPoint);
  }

  private resolveEncounterCompletion(id?: string, position?: Vector3): void {
    if (!id || this.isEncounterActive(id)) return;
    const encounter = this.world.map.encounters.find((candidate) => candidate.id === id);
    if (!encounter || encounter.completion === 'switch') return;
    const completionToken = `encounter-complete:${id}`;
    if (this.triggered.has(completionToken)) return;
    this.triggered.add(completionToken);
    const targets = this.world.map.id === 'E3M8' && id === 'boss-1'
      ? (encounter.opens ?? []).filter((target) => target !== 'boss-2')
      : encounter.opens ?? [];
    this.unlockTargets(targets);
    this.emitParticles(
      encounter.completion === 'boss-phase' ? 'authority' : 'momentum',
      position ?? this.player.position.clone().add(new Vector3(0, -.15, 0)),
      4,
    );
    if (this.applyingEnemyEventBatch) this.enemyEventBatchCheckpointPending = true;
    else this.checkpoint();
  }

  private setActorDeadVisual(actor: RuntimeActor, restart: boolean): void {
    if (restart) actor.animationTime = 0;
    actor.position.y = this.world.floorHeightAt(actor.position);
    actor.sprite.position.y = actor.position.y + DEFEATED_ACTOR_FLOOR_OFFSET;
    actor.visualKey = '';
    actor.visualState = 'death';
    actor.sprite.scale.set(ENEMIES[actor.id].height, ENEMIES[actor.id].height, 1);
    this.updateActorVisual(actor);
  }

  private updateEnemies(dt: number, refreshVisibility: boolean): void {
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
        targetingDisrupted: this.player.powerups.forensic > 0,
      },
      world: {
        hasLineOfSight: (from, to) => this.world.hasLineOfSight(
          this.behaviorLineOfSightFrom.set(from.x, from.y, from.z),
          this.behaviorLineOfSightTo.set(to.x, to.y, to.z),
        ),
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
    this.applyEnemyEventBatch(result.events, dt, difficulty.enemySpeed, difficulty.enemyDamage);
    const livePressure = this.world.actors.filter((actor) => actor.awake && !actor.dead && !actor.phaseLocked
      && this.horizontalDistance(actor.position, this.player.position) < 28).length;
    const bossPressure = this.world.actors.some((actor) => actor.kind === 'boss' && actor.awake && !actor.dead && !actor.phaseLocked) ? .35 : 0;
    this.audio.setCombatIntensity(Math.min(1, livePressure / 9 + bossPressure));
    this.syncCombatEffects(result.projectiles, result.hazards, dt);
    this.world.actors.forEach((actor) => this.updateActorVisual(actor, refreshVisibility));
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
    return `${this.world.map.id}|${this.world.navigationTopologyRevision}`;
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

  private applyEnemyEventBatch(events: readonly BehaviorEvent[], dt: number, speedScale: number, damageScale: number): void {
    this.applyingEnemyEventBatch = true;
    let completed = false;
    try {
      events.forEach((event) => this.applyEnemyEvent(event, dt, speedScale, damageScale));
      completed = true;
    } finally {
      this.applyingEnemyEventBatch = false;
      const createCheckpoint = completed && this.enemyEventBatchCheckpointPending;
      this.enemyEventBatchCheckpointPending = false;
      if (createCheckpoint) this.checkpoint();
    }
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
          this.audio.enemyAttackCue(event.attackId, 'resolve', this.actorPan(actor), this.actorAudibility(actor));
          if (event.attackId === 'denial-beam' || event.attackId === 'uninsurable-denial') {
            if (event.resolved || event.blocked) this.spawnHostileBeamVisual(actor, event.resolved, (event.hitCount ?? 0) > 0);
          }
        }
        break;
      case 'state':
        if (actor && event.state === 'windup') {
          actor.attackFlash = Math.max(actor.attackFlash, event.duration);
          if (event.attackId) this.audio.enemyAttackCue(event.attackId, 'windup', this.actorPan(actor), this.actorAudibility(actor));
          else this.audio.enemyCue(actor.id, 'windup', this.actorPan(actor), this.actorAudibility(actor));
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
        const adjusted = event.amount * damageScale;
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
        target.position.y = this.world.floorHeightAt(target.position);
        target.sprite.position.y = target.position.y;
        target.sprite.material.opacity = 1;
        (target as RuntimeActor & { redacted?: boolean }).redacted = event.redacted;
        this.enemyBehavior.markResurrected(target.uid, event.redacted);
        target.sprite.material.color.set(event.redacted ? 0xc93434 : 0xffffff);
        target.sprite.scale.set(ENEMIES[target.id].height, ENEMIES[target.id].height, 1);
        if (target.tallyEligible) this.tally.kills = Math.max(0, this.tally.kills - 1);
        this.showMessage('Closed exposure reopened', 1.2);
        this.emitParticles('smoke', target.position.clone().add(new Vector3(0, .4, 0)), 10);
        this.emitParticles('toner', target.position.clone().add(new Vector3(0, .6, 0)), 8);
        this.playEffectCue(
          resurrectionEffect(ENEMIES[target.id].height),
          target.position.clone().add(new Vector3(0, ENEMIES[target.id].height * .5, 0)),
        );
        break;
      }
      case 'summon': {
        const acceptedActorUids: string[] = [];
        event.positions.forEach((position, index) => {
          const point = new Vector3(position.x, 0, position.z);
          if (this.world.isSolid(point, ENEMIES[event.enemyId].radius)) return;
          const summoned = this.world.summonEnemy(event.enemyId, point, event.actorUids[index]);
          acceptedActorUids.push(summoned.uid);
          const arrival = point.clone().add(new Vector3(0, .3, 0));
          this.emitParticles('toner', arrival, 5);
          this.playSemanticCue('rejection', arrival);
        });
        this.enemyBehavior.reconcileSummonPlacements(event.actorUid, event.actorUids, acceptedActorUids);
        break;
      }
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
    const healthDamage = Math.max(0, amount - absorbed);
    this.player.health -= healthDamage;
    if (healthDamage > 0) this.lastDamageContext = {
      source: this.damageSourceLabel(sourceUid, damageKind),
      kind: damageKind ?? 'hazard',
      amount: healthDamage,
    };
    this.audio.playerCue(absorbed > 0 ? 'armor' : 'hurt');
    const source = sourceUid ? this.world.actors.find((actor) => actor.uid === sourceUid) : undefined;
    let direction: 'left' | 'right' | 'center' = 'center';
    if (source) {
      const angle = Math.atan2(source.position.x - this.player.position.x, source.position.z - this.player.position.z) - this.player.yaw;
      const side = Math.sin(angle);
      direction = side > .25 ? 'right' : side < -.25 ? 'left' : 'center';
    }
    window.dispatchEvent(new CustomEvent('player-hurt', { detail: { amount, direction, ...(damageKind ? { damageKind } : {}) } }));
  }

  private damageSourceLabel(sourceUid?: string, damageKind?: DamageKind): string {
    if (sourceUid === 'player') return 'Your Catastrophe Launcher';
    const actor = sourceUid ? this.world.actors.find((candidate) => candidate.uid === sourceUid) : undefined;
    if (actor) return this.pretty(actor.id);
    if (damageKind === 'prediction') return 'Predicted strike';
    if (damageKind === 'redaction') return 'Redaction field';
    if (damageKind === 'fire') return 'Active fire';
    if (damageKind === 'hazard') return 'Environmental hazard';
    return 'Unidentified exposure';
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

  private updateActorVisual(actor: RuntimeActor, refreshVisibility = true): void {
    if (actor.dead) {
      actor.position.y = this.world.floorHeightAt(actor.position);
      actor.sprite.position.y = actor.position.y + DEFEATED_ACTOR_FLOOR_OFFSET;
    }
    const redacted = Boolean((actor as RuntimeActor & { redacted?: boolean }).redacted);
    const forensicSignature = this.player.powerups.forensic > 0 && !actor.dead;
    actor.sprite.material.color.set(hostileSignatureTint(forensicSignature, redacted, actor.dead));
    const signatureBlending = forensicSignature ? AdditiveBlending : NormalBlending;
    if (actor.sprite.material.blending !== signatureBlending) {
      actor.sprite.material.blending = signatureBlending;
      actor.sprite.material.needsUpdate = true;
    }
    if (actor.phaseLocked) {
      actor.sprite.visible = false;
      return;
    }
    if (refreshVisibility) {
      actor.sprite.visible = this.horizontalDistance(actor.position, this.player.position) <= 56
        && this.world.hasLineOfSight(this.player.position, actor.position);
    }
    if (!actor.sprite.visible) return;
    const behaviorState = this.enemyBehavior.getActorState(actor.uid);
    actor.sprite.material.opacity = forensicSignature ? .82 : behaviorState?.visible === false ? .18 : 1;
    actor.sprite.material.depthWrite = !forensicSignature && actor.sprite.material.opacity >= 1;
    let state = this.actorVisualState(actor, behaviorState);
    let frameRate = state === 'attack' ? 10 : 7;
    if (actor.dead) {
      const deathFrames = this.assets.actorFrameCount(actor.kind, actor.id, 'death');
      const deathFrame = Math.floor(actor.animationTime * 10);
      state = deathFrame < deathFrames ? 'death' : 'corpse';
      frameRate = 10;
      const scale = defeatedActorScale(ENEMIES[actor.id].height, deathFrame / Math.max(1, deathFrames), state === 'corpse');
      actor.sprite.scale.set(scale.width, scale.height, 1);
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
      if (pickup.collected || pickup.phaseLocked || this.horizontalDistance(pickup.position, this.player.position) > 1.05) continue;
      if (!this.canCollectPickup(pickup)) continue;
      pickup.collected = true;
      pickup.sprite.visible = false;
      if (pickup.counted) this.tally.items += 1;
      if (pickup.ammoDrop) {
        const { ammoId, amount } = pickup.ammoDrop;
        if (ammoId === 'none') continue;
        this.player.ammo[ammoId] = addAmmoWithinCap(this.player.ammo[ammoId], { ammo: ammoId, amount });
        this.showMessage(`${this.pretty(ammoId)} recovered`);
      } else if (pickup.kind === 'weapon') {
        const acquired = pickup.id as WeaponId;
        this.player.weapons.add(acquired);
        this.requestWeapon(acquired);
        const weapon = WEAPONS[pickup.id as WeaponId];
        const grant = weaponAcquisitionAmmoGrant(weapon);
        if (grant) this.player.ammo[grant.ammo] = addAmmoWithinCap(this.player.ammo[grant.ammo], grant);
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
      this.audio.pickupCue(pickupAudioFeedbackCue(pickup));
      window.dispatchEvent(new CustomEvent('pickup-collected', { detail: { id: pickup.id, kind: pickup.kind } }));
    }
  }

  private canCollectPickup(pickup: World['pickups'][number]): boolean {
    if (pickup.ammoDrop) return pickup.ammoDrop.ammoId !== 'none'
      && this.player.ammo[pickup.ammoDrop.ammoId] < ammoCap(pickup.ammoDrop.ammoId);
    if (pickup.kind === 'credential') return !this.player.credentials.has(pickup.id as Credential);
    if (pickup.kind === 'weapon') {
      const weapon = WEAPONS[pickup.id as WeaponId];
      return !this.player.weapons.has(weapon.id) || (weapon.ammo !== 'none' && this.player.ammo[weapon.ammo] < ammoCap(weapon.ammo));
    }
    const id = pickup.id as PickupId;
    const grant = pickupAmmoGrant(id);
    if (grant) return this.player.ammo[grant.ammo] < ammoCap(grant.ammo);
    if (id === 'loss-control-vest') return this.player.armor < 100 || this.player.armorClass === 'none';
    if (id === 'catastrophe-suit') return this.player.armor < 200 || this.player.armorClass !== 'heavy';
    if (id === 'emergency-reserve') return this.player.health < 200 || this.player.armor < 200;
    if (id === 'goodwill-token') return this.player.health < 200;
    if (id === 'adhesive-bandage' || id === 'field-medical-case') return this.player.health < 100;
    return true;
  }

  private applyPickup(id: PickupId): void {
    const ammoSupply = DIFFICULTY[this.difficulty].ammoSupply;
    const ammoGrant = pickupAmmoGrant(id, ammoSupply);
    if (ammoGrant) this.player.ammo[ammoGrant.ammo] = addAmmoWithinCap(this.player.ammo[ammoGrant.ammo], ammoGrant);
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
    this.showMessage(timedPickupAnnouncement(id) ?? this.pretty(id));
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
      const doorTile = this.world.map.legend[this.world.map.grid[door.z]?.[door.x]];
      this.emitParticles(doorParticleFeedbackKind(doorTile?.wallMaterial ?? '', door.credential), doorPoint, door.credential ? 5 : 3);
      const spatial = this.pointSpatialAudio(doorPoint);
      this.audio.worldCue('door-open', spatial.pan, spatial.gain);
      this.showMessage('Access granted', .8);
      return;
    }
    const trigger = interaction.trigger;
    if (trigger) {
      let checkpointChanged = false;
      let outcomeMessage = trigger.message ?? this.pretty(trigger.action);
      let outcomeDuration = 1.4;
      if (trigger.requiresCredential && !this.player.credentials.has(trigger.requiresCredential)) {
        this.rejectUse(`${this.pretty(trigger.requiresCredential)} credential required`, 'credential', trigger.requiresCredential);
        return;
      }
      const threatLock = trigger.requiresEncounter ? this.controlThreatLock(trigger.requiresEncounter) : undefined;
      if (threatLock) {
        this.rejectUse(this.threatLockMessage(threatLock.encounter), 'encounter');
        return;
      }
      this.triggered.add(trigger.id);
      if (trigger.action === 'complete-map') {
        const exitControl = this.world.map.triggers.find((candidate) => candidate.action === 'open-exit');
        const exitThreatLock = exitControl?.requiresEncounter ? this.controlThreatLock(exitControl.requiresEncounter) : undefined;
        if (exitThreatLock) {
          this.triggered.delete(trigger.id);
          this.rejectUse(this.threatLockMessage(exitThreatLock.encounter), 'encounter');
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
          this.audio.worldCue('secret');
          const secret = this.world.map.secrets.find((candidate) => candidate.id === secretId);
          if (secret) {
            outcomeMessage = `Anomaly confirmed: ${secret.clue}`;
            outcomeDuration = 2.2;
            this.playSemanticCue('secret', this.player.position.clone().addScaledVector(this.aimDirection(), 1.05).add(new Vector3(0, .2, 0)));
          }
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
          checkpointChanged = true;
          this.emitParticles('energy', this.player.position.clone().addScaledVector(this.aimDirection(), 1.4), 14);
          outcomeMessage = `Binding gate ${this.world.bindingGateCount} of 3 released`;
          outcomeDuration = 1.5;
          if (this.world.canExposeCore) {
            this.world.applyBossMechanism('expose-core');
            this.world.unlockEncounter('boss-2');
          }
        } else if (mechanismId) {
          if (!this.world.applyMechanism(mechanismId)) {
            this.triggered.delete(trigger.id);
            this.rejectUse('A prior control must be activated first', 'encounter');
            return;
          }
          this.unlockTargets(this.world.mechanismOpens(mechanismId));
          checkpointChanged = true;
          const mechanismKind: ParticleKind = trigger.action === 'drain-liquid' || trigger.action === 'flood-liquid' ? 'water'
            : trigger.action === 'raise-floor' || trigger.action === 'lower-floor' || trigger.action === 'move-walls' ? 'concrete' : 'spark';
          this.emitParticles(mechanismKind, this.player.position.clone().addScaledVector(this.aimDirection(), 1.4), 10);
        }
        else this.world.applyTransformation(trigger.action);
      }
      if (trigger.action !== 'teleport' && trigger.action !== 'reveal-secret') {
        if (trigger.action === 'raise-floor' || trigger.action === 'lower-floor' || trigger.action === 'move-walls'
          || trigger.action === 'drain-liquid' || trigger.action === 'flood-liquid') this.audio.worldCue('lift-start');
        else if (trigger.action === 'open-door' || trigger.action === 'open-exit') this.audio.worldCue('switch');
        else this.audio.worldCue('mechanism');
      }
      this.showMessage(outcomeMessage, outcomeDuration);
      if (checkpointChanged) this.checkpoint();
      if (trigger.action !== 'open-exit') return;
    }
    const exit = new Vector3(this.world.map.exit.x * this.world.map.cellSize, 0, this.world.map.exit.z * this.world.map.cellSize);
    if (interaction.exit || this.horizontalDistance(this.player.position, exit) <= 2.2) {
      const pendingBoss = this.world.actors.find((actor) => actor.kind === 'boss' && !actor.dead);
      if (pendingBoss) {
        const threatLock = this.controlThreatLock(pendingBoss.encounter ?? 'boss-1');
        this.rejectUse(this.threatLockMessage(threatLock?.encounter ?? pendingBoss.encounter ?? 'boss-1'), 'encounter', undefined, exit);
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
      if (trigger.requiresEncounter && this.controlThreatLock(trigger.requiresEncounter)) {
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
    if (reason === 'nothing') this.audio.uiCue('menu-back');
    else {
      const spatial = point ? this.pointSpatialAudio(point) : { pan: 0, gain: 1 };
      this.audio.worldCue('door-locked', spatial.pan, spatial.gain);
    }
    this.showMessage(message, reason === 'nothing' ? .65 : 1.2);
    let direction: 'left' | 'right' | 'center' = 'center';
    if (point) {
      const relative = Math.atan2(point.x - this.player.position.x, point.z - this.player.position.z) - this.player.yaw;
      direction = Math.sin(relative) > .25 ? 'right' : Math.sin(relative) < -.25 ? 'left' : 'center';
      const cuePoint = point.clone().add(new Vector3(0, .7, 0));
      if (reason === 'credential') this.playSemanticCue('rejection', cuePoint);
      else this.emitParticles('spark', cuePoint, 2);
    }
    if (reason === 'encounter') this.escalateRouteGuidance();
    window.dispatchEvent(new CustomEvent('use-failed', { detail: { reason, direction, icon: credential ?? (reason === 'encounter' ? 'authority' : 'use'), ...(credential ? { credential } : {}) } }));
  }

  private isEncounterActive(id: string): boolean {
    return this.world.actors.some((actor) => !actor.dead && !actor.phaseLocked && actor.encounter === id && (actor.mandatory || actor.kind === 'boss'));
  }

  private controlThreatLock(requiredEncounter: string): { readonly encounter: string; readonly threats: readonly RuntimeActor[] } | undefined {
    const directThreats = this.world.actors.filter((actor) => !actor.dead && !actor.phaseLocked
      && actor.encounter === requiredEncounter && (actor.mandatory || actor.kind === 'boss'));
    if (directThreats.length) return { encounter: requiredEncounter, threats: directThreats };

    const requiredPhasePending = this.world.actors.some((actor) => !actor.dead && actor.phaseLocked
      && actor.encounter === requiredEncounter && (actor.mandatory || actor.kind === 'boss'));
    if (!requiredPhasePending) return undefined;

    const activeThreats = this.world.actors.filter((actor) => !actor.dead && !actor.phaseLocked
      && (actor.mandatory || actor.kind === 'boss'));
    if (!activeThreats.length) return undefined;
    return { encounter: activeThreats[0].encounter ?? requiredEncounter, threats: activeThreats };
  }

  private threatLockMessage(encounter: string): string {
    return encounter.startsWith('boss-') ? 'Binding authority remains active' : `${this.pretty(encounter)} remains active`;
  }

  private teleportTell(position: Vector3): void {
    const spatial = this.pointSpatialAudio(position);
    this.audio.worldCue('teleport', spatial.pan, spatial.gain);
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
    const scoreBreakdown = mapScoreBreakdown({
      combatScore: this.momentum.score,
      killsPercent,
      itemsPercent,
      secretsPercent,
      beatPar: this.tally.elapsed <= this.world.map.parSeconds,
      secretRoute,
      difficulty: this.difficulty,
    });
    const completionBonus = scoreBreakdown.bonusSubtotal;
    this.momentum.score = scoreBreakdown.finalScore;
    const performance: MapPerformance = {
      mapId: this.world.map.id,
      difficulty: this.difficulty,
      runVariant: this.runVariant ?? 'fresh-start',
      elapsed: this.tally.elapsed,
      parSeconds: this.world.map.parSeconds,
      score: this.momentum.score,
      bestChain: this.momentum.best,
      killsPercent,
      itemsPercent,
      secretsPercent,
      grade: performanceGrade(killsPercent, itemsPercent, secretsPercent, this.tally.elapsed, this.world.map.parSeconds),
    };
    let record: MapRecord;
    let newBests: string[];
    if (this.playtestReadOnly) {
      record = transientPlaytestRecord(performance);
      newBests = ['Playtest only'];
    } else {
      const recordKey = mapRecordKey(performance.mapId, performance.difficulty, performance.runVariant);
      const before = this.persistence.campaignUnlocks().records[recordKey];
      const progress = this.persistence.completeMap(this.world.map.id, performance, secretRoute ? nextMap : undefined);
      record = progress.records[recordKey];
      newBests = before ? [
        ...(performance.elapsed < before.bestTime ? ['Best time'] : []),
        ...(performance.score > before.highScore ? ['High score'] : []),
        ...(performance.bestChain > before.bestChain ? ['Best chain'] : []),
        ...(performance.killsPercent > before.bestKillsPercent ? ['Threat mastery'] : []),
        ...(performance.itemsPercent > before.bestItemsPercent ? ['Item mastery'] : []),
        ...(performance.secretsPercent > before.bestSecretsPercent ? ['Secret mastery'] : []),
        ...(performance.grade !== before.bestGrade && record.bestGrade === performance.grade ? ['Grade'] : []),
      ] : [`First clear: ${runVariantLabel(performance.runVariant)} track`];
    }
    this.lastMapResult = { performance, record, completionBonus, scoreBreakdown, newBests, secretRoute };
    if (!this.playtestReadOnly && this.world.map.index === 8) {
      const episode = CAMPAIGN.episodes.find((candidate) => candidate.id === this.world.map.episode);
      const nextEpisode = episode && CAMPAIGN.episodes[episode.number];
      this.persistence.completeEpisode(this.world.map.episode, nextEpisode?.id);
    }
    this.nextMap = nextMap;
    this.mode = 'intermission';
    this.audio.worldCue('exit');
    this.audio.uiCue('map-clear');
    if (this.world.map.index === 8) this.audio.startEndingMusic(Number(this.world.map.id[1]));
    else this.audio.startIntermissionMusic();
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
    const sameEpisode = currentEpisode === nextEpisode;
    this.loadMap(
      this.nextMap,
      sameEpisode,
      true,
      sameEpisode ? 'campaign-carry' : 'fresh-start',
    );
  }

  retryCurrentMap(): void {
    if (this.mode !== 'intermission') return;
    this.loadMap(this.world.map.id, false, true, 'fresh-start');
  }

  private newestCurrentMapAutosave(): ValidSlotResult<SaveData> | undefined {
    return this.persistence.listAutosaves()
      .filter((entry): entry is ValidSlotResult<SaveData> => entry.status === 'valid' && entry.state.mapId === this.world.map.id)
      .sort((left, right) => right.metadata.sequence - left.metadata.sequence
      || right.metadata.savedAt - left.metadata.savedAt)[0];
  }

  private tallyProgressPresentation(): string {
    return `Threats ${this.tally.kills}/${this.tally.totalKills} • Items ${this.tally.items}/${this.tally.totalItems} • Secrets ${this.tally.secrets}/${this.tally.totalSecrets} • ${this.saveTime(this.tally.elapsed)}`;
  }

  pauseDetails(): PauseDetails {
    const checkpoint = this.newestCurrentMapAutosave();
    const recoveryState: PauseDetails['recoveryState'] = checkpoint
      ? checkpoint.persistence === 'persistent' ? 'persistent' : 'session-only'
      : 'unavailable';
    const recovery = checkpoint
      ? `${checkpoint.persistence === 'persistent' ? 'Checkpoint saved' : 'Session-only checkpoint'} at ${this.saveTime(checkpoint.metadata.playSeconds)}`
      : 'No automatic checkpoint is currently available';
    const difficulty = this.pretty(this.difficulty);
    const runVariant = runVariantLabel(this.runVariant);
    const objective = this.currentObjective();
    const progress = this.tallyProgressPresentation();
    return {
      mapId: this.world.map.id,
      mapTitle: this.world.map.title,
      difficulty,
      runVariant,
      objective,
      progress,
      recovery,
      recoveryState,
      summary: `${this.world.map.id} ${this.world.map.title}. ${difficulty}. ${runVariant}. Objective: ${objective}. ${progress}. ${recovery}.`,
    };
  }

  exitReview(): ExitReview {
    const mapId = this.world.map.id;
    const mapTitle = this.world.map.title;
    const checkpoint = this.persistence.newestValidContinue();
    if (!checkpoint) {
      const consequence = `Returning now discards this ${mapId} attempt; Continue will open New Game.`;
      const durability = 'Nothing from this attempt is recoverable from the title screen.';
      return {
        mapId,
        mapTitle,
        returnPoint: 'No recoverable save is available',
        recoveryState: 'unavailable',
        consequenceState: 'discard',
        consequence,
        durability,
        summary: `${mapId} ${mapTitle}. No recoverable save is available. ${consequence} ${durability}`,
      };
    }

    const playTime = this.saveTime(checkpoint.metadata.playSeconds);
    const returnPoint = `${SAVE_KIND_LABELS[checkpoint.kind]} • ${checkpoint.metadata.mapId} ${checkpoint.metadata.mapTitle} • ${playTime}`;
    const sameMap = checkpoint.metadata.mapId === mapId;
    const rewind = sameMap ? Math.max(0, this.tally.elapsed - checkpoint.metadata.playSeconds) : 0;
    const consequenceState: ExitReview['consequenceState'] = !sameMap ? 'discard' : rewind >= 1 ? 'rewind' : 'safe';
    const consequence = !sameMap
      ? `Returning now discards this ${mapId} attempt; Continue resumes the saved ${checkpoint.metadata.mapId} file.`
      : rewind >= 1
        ? `Returning now rewinds ${this.saveTime(rewind)} of progress made after that save.`
        : 'Returning now preserves this map at the recorded checkpoint.';
    const recoveryState: ExitReview['recoveryState'] = checkpoint.persistence === 'persistent' ? 'persistent' : 'session-only';
    const durability = checkpoint.persistence === 'persistent'
      ? 'This return point survives closing or reloading the browser.'
      : 'This return point is available only while this tab remains open.';
    return {
      mapId,
      mapTitle,
      returnPoint,
      recoveryState,
      consequenceState,
      consequence,
      durability,
      summary: `${mapId} ${mapTitle}. Return point: ${returnPoint}. ${consequence} ${durability}`,
    };
  }

  private deathRecoveryPresentation(): Pick<DeathReview, 'recovery' | 'restartLabel'> {
    if (this.playtestReadOnly) return {
      restartLabel: 'Restart Map',
      recovery: 'Playtest mode restarts this map with its standard loadout.',
    };
    const checkpoint = this.newestCurrentMapAutosave();
    if (checkpoint) {
      const age = Math.max(0, this.tally.elapsed - checkpoint.metadata.playSeconds);
      return {
        restartLabel: 'Restart Last Checkpoint',
        recovery: `Checkpoint at ${this.saveTime(checkpoint.metadata.playSeconds)} • rewinds ${this.saveTime(age)}`,
      };
    }
    const episode = this.persistence.loadEpisodeRecovery(this.world.map.episode);
    if (episode.status === 'valid') return {
      restartLabel: 'Restart Episode Recovery',
      recovery: `${episode.metadata.mapId} ${episode.metadata.mapTitle} • ${this.saveTime(episode.metadata.playSeconds)}`,
    };
    return {
      restartLabel: 'Restart Map',
      recovery: 'No recovery file is available; restart this map with its standard loadout.',
    };
  }

  private deathAdvice(context?: LastDamageContext): string {
    if (context?.source === 'Your Catastrophe Launcher') return 'Create more distance before firing canisters; their blast can reach you through an open lane.';
    if (context?.kind === 'hazard' || context?.kind === 'prediction' || context?.kind === 'fire') {
      return 'Leave marked floor zones before they arm, then re-enter after the danger clears.';
    }
    if (context?.kind === 'impact') return 'Create space before the next close-range exchange and use cover to break pursuit.';
    if (context?.kind === 'denial' || context?.kind === 'ballistic' || context?.kind === 'toner') {
      return 'Break line of sight during the attack tell, then answer while the exposure recovers.';
    }
    if (context?.kind === 'redaction') return 'Keep moving across the redaction lane and commit only after its pulse resolves.';
    return 'Review the current objective, use available cover, and reopen from the recovery point below.';
  }

  private createDeathReview(): DeathReview {
    const recovery = this.deathRecoveryPresentation();
    const damage = this.lastDamageContext;
    const cause = damage
      ? `${damage.source} • ${this.pretty(damage.kind)} • ${Math.max(1, Math.ceil(damage.amount))} final damage`
      : 'Unidentified exposure • review the surrounding threats';
    return {
      cause,
      progress: this.tallyProgressPresentation(),
      objective: this.currentObjective(),
      recovery: recovery.recovery,
      restartLabel: recovery.restartLabel,
      advice: this.deathAdvice(damage),
    };
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
    this.lastDeathReview = this.createDeathReview();
    this.mode = 'dead';
    this.audio.stopMusic();
    this.audio.playerCue('death');
    document.exitPointerLock();
    this.showMessage('Claim denied', 2);
    this.emit();
  }

  restartFromCheckpoint(): boolean {
    if (this.playtestReadOnly) {
      this.runVariant = 'fresh-start';
      this.loadMap(this.world.map.id, false, false);
      return true;
    }
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
    this.runVariant = 'fresh-start';
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
    if (this.weaponState === 'raising' && this.pendingWeapon
      && this.pendingWeapon !== this.player.weapon && this.player.weapons.has(this.pendingWeapon)) {
      this.weaponState = 'lowering';
      this.weaponTransition = WEAPONS[this.player.weapon].lowerTime;
      window.dispatchEvent(new CustomEvent('weapon-switch', {
        detail: { from: this.player.weapon, to: this.pendingWeapon, state: 'lowering', duration: this.weaponTransition },
      }));
      return;
    }
    this.pendingWeapon = undefined;
    this.weaponState = 'ready';
    this.weaponTransition = 0;
    window.dispatchEvent(new CustomEvent('weapon-switch', { detail: { to: this.player.weapon, state: 'ready', duration: 0 } }));
  }

  private createSaveData(): SaveData {
    return {
      version: 1,
      mode: this.mode === 'paused' ? 'paused' : 'playing',
      runVariant: this.runVariant,
      mapId: this.world.map.id,
      difficulty: this.difficulty,
      player: {
        health: this.player.health, armor: this.player.armor, armorClass: this.player.armorClass, position: this.player.position.toArray(), yaw: this.player.yaw, pitch: this.player.pitch,
        ammo: { ...this.player.ammo }, weapons: [...this.player.weapons], weapon: this.player.weapon,
        credentials: [...this.player.credentials], floorPlan: this.player.floorPlan, powerups: { ...this.player.powerups },
      },
      actors: this.world.actors.map((actor) => ({
        uid: actor.uid, kind: actor.kind, id: actor.id, health: actor.health, dead: actor.dead, scoreEligible: actor.scoreEligible, tallyEligible: actor.tallyEligible, phaseLocked: actor.phaseLocked,
        ...(actor.authoredKey ? { authoredKey: actor.authoredKey } : {}),
        position: actor.position.toArray(), awake: actor.awake, facing: actor.facing, animationTime: actor.animationTime, attackFlash: actor.attackFlash,
        ...((actor as RuntimeActor & { redacted?: boolean }).redacted ? { redacted: true } : {}),
      })),
      pickups: this.world.pickups.map((pickup) => ({
        uid: pickup.uid,
        kind: pickup.kind,
        id: pickup.id,
        position: pickup.position.toArray(),
        collected: pickup.collected,
        phaseLocked: pickup.phaseLocked,
      })),
      doors: [...this.world.doors.values()].map((door) => ({ key: door.key, open: door.open, progress: door.progress })),
      secrets: [...this.world.discoveredSecrets],
      visited: [...this.world.visitedTiles],
      triggered: [...this.triggered],
      mechanisms: [...this.world.activatedMechanisms],
      unlockedEncounters: this.world.map.encounters
        .filter((encounter) => encounter.id === 'entry'
          || this.world.actors.some((actor) => actor.encounter === encounter.id && !actor.phaseLocked)
          || this.world.pickups.some((pickup) => pickup.route === encounter.id && !pickup.phaseLocked))
        .map((encounter) => encounter.id),
      hazardsEnabled: this.world.hazardsEnabled,
      hazardSectors: this.world.serializeHazardSectors(),
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

  private checkpoint(periodic = false): boolean {
    if (this.applyingSimulationTick) {
      if (!periodic) this.simulationCheckpointPending = true;
      return false;
    }
    if (!this.world.map || !recoveryCheckpointAllowed({
      mode: this.mode,
      demoPlayback: Boolean(this.activeDemo),
      demoRecording: Boolean(this.demoRecorder),
      demoReadOnly: this.demoReadOnly,
      playtestReadOnly: this.playtestReadOnly,
    })) return false;
    const elapsed = this.tally.elapsed;
    if (this.player.health <= 0 || !recoveryCheckpointDue(this.recoveryCheckpointState, elapsed, periodic)) return false;
    const state = this.createSaveData();
    if (!isSaveData(state)) return false;
    const metadata = this.saveMetadata();
    this.persistence.autosave(state, metadata);
    const recovery = this.persistence.loadEpisodeRecovery(this.world.map.episode);
    if (this.world.map.index === 1 || recovery.status !== 'valid') this.persistence.saveEpisodeRecovery(this.world.map.episode, state, metadata);
    this.recoveryCheckpointState = createRecoveryCheckpointSchedule(elapsed, true);
    return true;
  }

  save(): void {
    if (!this.world.map || this.activeDemo || this.demoReadOnly || this.playtestReadOnly) return;
    this.persistence.quicksave(this.createSaveData(), this.saveMetadata(undefined, true));
    this.audio.uiCue('save');
  }

  saveManual(slot: number, name?: string): void {
    if (!this.world.map || this.activeDemo || this.demoReadOnly || this.playtestReadOnly) return;
    this.persistence.saveManual(slot, this.createSaveData(), this.saveMetadata(name, true));
    this.audio.uiCue('save');
  }

  manualSlots(): readonly ManualSlotSummary[] {
    return this.persistence.listManualSlots().map((entry, index) => ({
      slot: index + 1,
      slotId: entry.slotId,
      kind: entry.kind,
      status: entry.status,
      name: entry.status === 'valid' ? entry.metadata.name : entry.defaultName,
      detail: entry.status === 'valid'
        ? `${entry.metadata.mapId} ${entry.metadata.mapTitle} | ${this.pretty(entry.metadata.difficulty)} | ${runVariantLabel(restoredRunVariant(entry.state))} | ${this.saveTime(entry.metadata.playSeconds)} | ${new Date(entry.metadata.savedAt).toLocaleString()}`
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
        if (rightTime !== leftTime) return rightTime - leftTime;
        const leftSequence = left.status === 'valid' ? left.metadata.sequence : -1;
        const rightSequence = right.status === 'valid' ? right.metadata.sequence : -1;
        return rightSequence - leftSequence;
      })
      .map((entry, index) => ({
        slot: index + 1,
        slotId: entry.slotId,
        kind: entry.kind,
        status: entry.status,
        name: entry.status === 'valid' ? entry.metadata.name : entry.defaultName,
        detail: entry.status === 'valid'
          ? `${entry.metadata.mapId} ${entry.metadata.mapTitle} | ${this.pretty(entry.metadata.difficulty)} | ${runVariantLabel(restoredRunVariant(entry.state))} | ${this.saveTime(entry.metadata.playSeconds)} | ${new Date(entry.metadata.savedAt).toLocaleString()}`
          : entry.status === 'invalid' ? `Unreadable: ${entry.reason}` : 'Empty',
        ...(entry.status === 'valid' ? { thumbnail: entry.metadata.thumbnail } : {}),
      }));
  }

  deleteManual(slot: number): void {
    if (this.playtestReadOnly) return;
    this.persistence.clearManual(slot);
  }

  loadManual(slot: number): boolean {
    const result = this.persistence.loadManual(slot);
    if (result.status !== 'valid') return false;
    const restored = this.restoreSave(result.state, false);
    if (restored) this.audio.uiCue('load');
    return restored;
  }

  loadQuicksave(): boolean {
    const result = this.persistence.loadQuicksave();
    if (result.status === 'valid') {
      const restored = this.restoreSave(result.state);
      if (restored) this.audio.uiCue('load');
      return restored;
    }
    this.showMessage('No quicksave is available', 1.8);
    this.emit();
    return false;
  }

  loadAutomatic(slotId: string): boolean {
    const result = this.persistence.inspectAllSlots().find((entry) => entry.slotId === slotId && entry.kind !== 'manual');
    if (result?.status !== 'valid') return false;
    const restored = this.restoreSave(result.state, false);
    if (restored) this.audio.uiCue('load');
    return restored;
  }

  load(): boolean {
    const result = this.persistence.newestValidContinue();
    if (!result) return false;
    const restored = this.restoreSave(result.state);
    if (restored) this.audio.uiCue('load');
    return restored;
  }

  private restoreSave(save: SaveData, resume = true): boolean {
    if (!isSaveData(save)) return false;
    try {
      this.difficulty = save.difficulty;
      this.loadMap(save.mapId, true, false, restoredRunVariant(save));
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
      resolveRestoredUnlockedEncounters(this.world.map, save).forEach((id) => this.world.unlockEncounter(id));
      const legacySummonPlan = planLegacyRegionalDirectorSummonRestore(
        save.actors,
        save.enemyBehavior?.summonOwners,
      );
      const restoredLegacySummons = new Set(legacySummonPlan?.actorUids ?? []);
      const restoredActorUids = new Set<string>();
      const restoredBehaviorActors: RestoredBehaviorActorIdentity[] = [];
      for (const saved of save.actors) {
        if (legacySummonPlan
          && saved.id === 'desk-warden'
          && isDynamicSummonUid(saved.uid)
          && !restoredLegacySummons.has(saved.uid)) continue;
        const uidActor = this.world.actors.find((candidate) => candidate.uid === saved.uid);
        let actor = findMatchingRuntimeActorIdentity(saved, this.world.actors);
        if (!actor && saved.kind === 'boss') actor = findUniqueRuntimeActorIdentity(saved, this.world.actors);
        if (!actor && !uidActor && isDynamicSummonUid(saved.uid) && saved.kind === 'enemy' && saved.id && saved.id in ENEMIES) {
          actor = this.world.summonEnemy(saved.id as Exclude<RuntimeActor['id'], 'regional-director' | 'aggregate' | 'chief-actuary' | 'uninsurable'>, new Vector3().fromArray(saved.position), saved.uid);
        }
        if (!actor || restoredActorUids.has(actor.uid)) continue;
        restoredActorUids.add(actor.uid);
        restoredBehaviorActors.push({ savedUid: saved.uid, runtimeUid: actor.uid, id: actor.id });
        actor.health = saved.health;
        actor.dead = saved.dead;
        actor.tallyEligible = !isDynamicSummonUid(actor.uid) && (saved.tallyEligible ?? actor.tallyEligible);
        actor.scoreEligible = actor.tallyEligible && (saved.scoreEligible ?? !saved.dead);
        actor.phaseLocked = saved.phaseLocked ?? false;
        actor.awake = resolveRestoredActorAwake(saved.awake, actor.phaseLocked);
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
      const completedLegacyEncounters = new Set(resolveLegacyCompletedEncounters(this.world.map, save));
      this.world.actors.forEach((actor) => {
        if (restoredActorUids.has(actor.uid) || !actor.mandatory || !actor.encounter
          || !completedLegacyEncounters.has(actor.encounter)) return;
        actor.health = 0;
        actor.dead = true;
        actor.scoreEligible = false;
        actor.phaseLocked = false;
        actor.sprite.visible = true;
        this.setActorDeadVisual(actor, false);
      });
      const restoredPickupUids = new Set<string>();
      for (const saved of save.pickups) {
        const pickup = findMatchingRuntimePickupIdentity(saved, this.world.pickups);
        if (!pickup || restoredPickupUids.has(pickup.uid)) continue;
        restoredPickupUids.add(pickup.uid);
        pickup.collected = saved.collected;
        pickup.phaseLocked = saved.phaseLocked ?? false;
        pickup.sprite.visible = !pickup.collected && !pickup.phaseLocked;
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
      this.tally = reconcileRestoredTally(
        save.tally,
        this.world.actors,
        this.world.pickups,
        this.world.discoveredSecrets.size,
        this.world.map.secrets.length,
      );
      save.visited?.forEach((key) => this.world.visitedTiles.add(key));
      save.triggered?.forEach((key) => this.triggered.add(key));
      this.world.restoreActivatedMechanisms(save.mechanisms ?? []);
      this.world.restoreHazardState(save.hazardsEnabled, save.hazardSectors, save.mechanisms ?? []);
      if (save.enemyBehavior || legacySummonPlan) {
        let behavior = save.enemyBehavior
          ? reconcileEnemyBehaviorSnapshot(save.enemyBehavior, restoredBehaviorActors)
          : this.enemyBehavior.serialize();
        if (legacySummonPlan) {
          const restoredIdentities = new Map(restoredBehaviorActors.map((actor) => [actor.savedUid, actor.runtimeUid]));
          const ownerUid = restoredIdentities.get(legacySummonPlan.ownerUid);
          behavior = {
            ...behavior,
            summonOwners: ownerUid ? [{
              ownerUid,
              actorUids: legacySummonPlan.actorUids.flatMap((uid) => {
                const runtimeUid = restoredIdentities.get(uid);
                return runtimeUid ? [runtimeUid] : [];
              }),
              total: legacySummonPlan.total,
            }] : [],
          };
        }
        this.enemyBehavior.restore(behavior);
      }
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
      this.recoveryCheckpointState = createRecoveryCheckpointSchedule(this.tally.elapsed, true);
      this.updateVisionEffects();
      this.updateCamera();
      this.resetPresentationHistory();
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  hasSave(): boolean { return Boolean(this.persistence.newestValidContinue()); }
  persistenceConflicts(): readonly PersistenceConflict[] { return this.persistence.conflicts(); }
  continueDetails(): ContinueDetails | undefined {
    const result = this.persistence.newestValidContinue();
    if (!result) return undefined;
    const kind = SAVE_KIND_LABELS[result.kind];
    const difficulty = this.pretty(result.metadata.difficulty);
    const runVariant = runVariantLabel(restoredRunVariant(result.state));
    const playTime = this.saveTime(result.metadata.playSeconds);
    const savedDate = new Date(result.metadata.savedAt);
    const savedAt = savedDate.toLocaleString();
    return {
      kind,
      mapId: result.metadata.mapId,
      mapTitle: result.metadata.mapTitle,
      difficulty,
      runVariant,
      playTime,
      savedAt,
      savedAtIso: savedDate.toISOString(),
      summary: `${kind} | ${result.metadata.mapId} ${result.metadata.mapTitle} | ${difficulty} | ${runVariant} | Play ${playTime} | ${savedAt}`,
    };
  }
  continueSummary(): string | undefined { return this.continueDetails()?.summary; }
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
      playbackSettings: { verticalAutoAim: this.verticalAutoAim },
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
    const userVerticalAutoAim = this.activeDemo?.userVerticalAutoAim ?? this.verticalAutoAim;
    this.demoRecorder = undefined;
    this.demoTick = 0;
    this.activeDemo = undefined;
    if (!this.restoreSave(structuredClone(demo.initialState), true)) {
      this.verticalAutoAim = userVerticalAutoAim;
      return false;
    }
    const playbackVerticalAutoAim = demo.playbackSettings.verticalAutoAim;
    const finished = demo.totalTicks === 0;
    this.verticalAutoAim = finished ? userVerticalAutoAim : playbackVerticalAutoAim;
    this.activeDemo = {
      demo,
      playback: new DemoPlayback<GameplayCommand>(demo),
      userVerticalAutoAim,
      paused: true,
      finished,
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
    this.verticalAutoAim = this.activeDemo.userVerticalAutoAim;
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
      this.verticalAutoAim = active.userVerticalAutoAim;
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
    const userVerticalAutoAim = this.activeDemo?.userVerticalAutoAim ?? this.verticalAutoAim;
    this.demoRecorder = undefined;
    this.demoTick = 0;
    this.activeDemo = undefined;
    if (!this.restoreSave(structuredClone(demo.initialState), true)) {
      this.verticalAutoAim = userVerticalAutoAim;
      return false;
    }
    this.verticalAutoAim = demo.playbackSettings.verticalAutoAim;
    const playback = new DemoPlayback<GameplayCommand>(demo);
    this.demoReadOnly = true;
    try {
      while (!playback.finished && this.mode === 'playing') {
        const commands = playback.next();
        this.simulate(STEP, commands.at(-1) ?? NEUTRAL_COMMAND, false);
      }
    } finally {
      this.demoReadOnly = false;
      this.verticalAutoAim = userVerticalAutoAim;
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

  setPlaytestReadOnly(enabled: boolean): void { this.playtestReadOnly = enabled; }

  returnToMenu(): void {
    this.mode = 'menu';
    this.emit();
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
    this.loadMap(mapId, false, true, 'fresh-start');
  }

  private migrateLegacySave(storage: Storage): void {
    if (this.playtestReadOnly) return;
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
    this.movementParticleDistance = 0;
    this.updateCamera();
    this.resetPresentationHistory();
    this.world.actors.forEach((actor) => this.updateActorVisual(actor, true));
    this.refreshPickupVisibility();
    this.visibilityRefreshTimer = .1;
  }

  debugDefeatAll(): void {
    this.runAtomicDebugDefeat(this.world.actors.filter((actor) => !actor.dead));
  }

  debugDefeatPlayer(sourceId?: RuntimeActor['id'], damageKind: DamageKind = 'hazard'): void {
    if (this.mode !== 'playing') return;
    const source = sourceId ? this.world.actors.find((actor) => actor.id === sourceId) : undefined;
    this.lastDamageContext = {
      source: source ? this.pretty(source.id) : this.damageSourceLabel(undefined, damageKind),
      kind: damageKind,
      amount: Math.max(1, this.player.health),
    };
    this.player.health = 0;
    this.die();
  }

  debugSetAmmo(type: Exclude<AmmoType, 'none'>, amount: number): void {
    this.player.ammo[type] = Math.max(0, Math.floor(amount));
    this.emit();
  }

  debugDamageActor(id: string, amount: number): boolean {
    if (!Number.isFinite(amount) || amount <= 0) return false;
    const actor = this.world.actors.find((candidate) => candidate.id === id && !candidate.dead);
    if (!actor) return false;
    actor.phaseLocked = false;
    actor.sprite.visible = true;
    this.damageActor(actor, amount);
    return true;
  }

  debugDefeatEncounter(id: string): number {
    return this.runAtomicDebugDefeat(this.world.actors.filter((actor) => actor.encounter === id && !actor.dead));
  }

  debugDefeatMandatory(id: string): number {
    return this.runAtomicDebugDefeat(this.world.actors
      .filter((actor) => actor.encounter === id && actor.mandatory && !actor.dead));
  }

  private runAtomicDebugDefeat(actors: readonly RuntimeActor[]): number {
    const alreadyAtomic = this.applyingSimulationTick;
    if (!alreadyAtomic) this.applyingSimulationTick = true;
    let completed = false;
    let defeated = 0;
    try {
      actors.forEach((actor) => {
        actor.phaseLocked = false;
        actor.sprite.visible = true;
        this.damageActor(actor, actor.health + 1);
        defeated += Number(actor.dead);
      });
      completed = true;
      return defeated;
    } finally {
      if (!alreadyAtomic) {
        this.applyingSimulationTick = false;
        const createCheckpoint = completed && this.simulationCheckpointPending;
        this.simulationCheckpointPending = false;
        if (createCheckpoint) this.checkpoint();
      }
    }
  }

  debugTeleportToPickup(kind: 'pickup' | 'weapon' | 'credential', id?: string): boolean {
    const pickup = this.world.pickups.find((candidate) => !candidate.collected
      && !candidate.phaseLocked
      && candidate.kind === kind
      && (!id || candidate.id === id));
    if (!pickup) return false;
    this.debugTeleport(pickup.position.x, pickup.position.z);
    return true;
  }

  debugTeleportToSecretReward(secretId: string): boolean {
    const secret = this.world.map.secrets.find((candidate) => candidate.id === secretId);
    if (!secret) return false;
    const rewardId = secret.rewardPlacement.type === 'pickup'
      ? secret.rewardPlacement.pickup
      : secret.rewardPlacement.weapon;
    const reward = this.world.pickups.find((candidate) => !candidate.collected
      && !candidate.phaseLocked
      && candidate.kind === secret.rewardPlacement.type
      && candidate.id === rewardId
      && Math.floor(candidate.position.x / this.world.map.cellSize) === Math.floor(secret.at.x)
      && Math.floor(candidate.position.z / this.world.map.cellSize) === Math.floor(secret.at.z)
      && !this.world.isConcealedAt(candidate.position));
    if (!reward) return false;
    this.debugTeleport(reward.position.x, reward.position.z);
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
    this.player.yaw = Math.atan2(actor.position.x - point.x, actor.position.z - point.z) + Math.PI;
    const horizontal = Math.hypot(actor.position.x - point.x, actor.position.z - point.z);
    const targetY = actor.position.y + (actor.dead ? actor.sprite.scale.y : ENEMIES[actor.id].height) * .5;
    this.player.pitch = Math.atan2(targetY - point.y, horizontal);
    if (!actor.dead) actor.awake = true;
    this.movementParticleDistance = 0;
    this.updateCamera();
    this.resetPresentationHistory();
    this.world.actors.forEach((candidate) => this.updateActorVisual(candidate, true));
    this.refreshPickupVisibility();
    this.visibilityRefreshTimer = .1;
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
    this.resetPresentationHistory();
    return true;
  }

  renderText(): string {
    const visibleActors = this.world.actors.filter((actor) => !actor.dead && !actor.phaseLocked
      && this.horizontalDistance(actor.position, this.player.position) < 22
      && this.world.hasLineOfSight(this.player.position, actor.position)).map((actor) => ({
        id: actor.id,
        kind: actor.kind,
        x: +actor.position.x.toFixed(2),
        z: +actor.position.z.toFixed(2),
        y: +actor.position.y.toFixed(3),
        floorY: +this.world.floorHeightAt(actor.position).toFixed(3),
        health: Math.ceil(actor.health),
        visual: actor.visualState,
        distance: +this.horizontalDistance(actor.position, this.player.position).toFixed(2),
      }));
    const visibleCorpses = this.world.actors.filter((actor) => actor.dead && !actor.phaseLocked
      && this.horizontalDistance(actor.position, this.player.position) < 22
      && this.world.hasLineOfSight(this.player.position, actor.position)).slice(0, 16)
      .map((actor) => {
        const floorY = this.world.floorHeightAt(actor.position);
        return {
          id: actor.id,
          kind: actor.kind,
          x: +actor.position.x.toFixed(2),
          z: +actor.position.z.toFixed(2),
          y: +actor.sprite.position.y.toFixed(3),
          floorY: +floorY.toFixed(3),
          groundClearance: +(actor.sprite.position.y - floorY).toFixed(3),
          visualWidth: +actor.sprite.scale.x.toFixed(3),
          visualHeight: +actor.sprite.scale.y.toFixed(3),
          visual: actor.visualState,
          frame: Math.floor(actor.animationTime * 10),
        };
      });
    const nearbyPickups = this.world.pickups.filter((pickup) => !pickup.collected && !pickup.phaseLocked && this.horizontalDistance(pickup.position, this.player.position) < 14).map((pickup) => ({ id: pickup.id, kind: pickup.kind, x: +pickup.position.x.toFixed(2), z: +pickup.position.z.toFixed(2) }));
    return JSON.stringify({
      coordinateSystem: 'world units; x increases east/right on automap, z increases south/down; yaw 0 faces north (-z)',
      mode: this.mode,
      runVariant: this.runVariant,
      map: this.world.map ? { id: this.world.map.id, title: this.world.map.title, exit: this.world.map.exit } : null,
      player: { x: +this.player.position.x.toFixed(2), z: +this.player.position.z.toFixed(2), yaw: +this.player.yaw.toFixed(3), pitch: +this.player.pitch.toFixed(3), health: Math.ceil(this.player.health), armor: Math.ceil(this.player.armor), armorClass: this.player.armorClass, weapon: this.player.weapon, ammo: this.player.ammo, credentials: [...this.player.credentials], floorPlan: this.player.floorPlan, powerups: this.player.powerups },
      visibleActors,
      visibleCorpses,
      nearbyPickups,
      closedDoors: [...this.world.doors.values()].filter((door) => !door.open).map((door) => ({
        x: door.x,
        z: door.z,
        credential: door.credential ?? null,
        slabAxis: door.slabAxis,
      })),
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
        pickupLocks: (this.world.map?.encounters ?? []).map((encounter) => {
          const pickups = this.world.pickups.filter((pickup) => pickup.route === encounter.id && !pickup.collected);
          return { id: encounter.id, available: pickups.length, locked: pickups.filter((pickup) => pickup.phaseLocked).length };
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
      momentum: { ...this.momentum, presentation: combatMomentumPresentation(this.momentum.chain) },
      objective: this.currentObjective(),
      routeHint: this.routeHint ?? null,
      interaction: this.interactionHint() ?? null,
      message: this.message,
      death: this.mode === 'dead' ? this.lastDeathReview ?? null : null,
      pause: this.mode === 'paused' ? this.pauseDetails() : null,
      exitReview: this.mode === 'paused' || this.mode === 'dead' ? this.exitReview() : null,
      result: this.mode === 'intermission' && this.lastMapResult ? {
        grade: this.lastMapResult.performance.grade,
        newBests: this.lastMapResult.newBests,
        scoreBreakdown: this.lastMapResult.scoreBreakdown,
      } : null,
      demo: {
        recording: Boolean(this.demoRecorder),
        tick: this.demoTick,
        verticalAutoAim: this.verticalAutoAim,
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
        renderCount: this.renderCount,
        navigationFields: this.hostileNavigationFields.size,
        lineOfSightQueries: this.world.lineOfSightQueryCount,
        assets: this.assets.status(),
        presentation: {
          mode: 'bounded-predictive-interpolation',
          alpha: +this.presentationBlend.toFixed(3),
          x: +this.presentedPlayerPosition.x.toFixed(3),
          y: +this.presentedPlayerPosition.y.toFixed(3),
          z: +this.presentedPlayerPosition.z.toFixed(3),
          yaw: +this.presentedPlayerYaw.toFixed(4),
          pitch: +this.presentedPlayerPitch.toFixed(4),
        },
      },
    });
  }

  private capturePresentationSnapshot(): PresentationSnapshot {
    return {
      playerPosition: this.player.position.clone(),
      playerYaw: this.player.yaw,
      playerPitch: this.player.pitch,
      actorPositions: new Map(this.world.actors
        .filter((actor) => actor.sprite.visible)
        .map((actor) => [actor.uid, actor.sprite.position.clone()])),
      enemyProjectilePositions: new Map([...this.projectileSprites].map(([id, sprite]) => [id, sprite.position.clone()])),
      playerProjectilePositions: new Map([...this.playerProjectileSprites].map(([id, sprite]) => [id, sprite.position.clone()])),
    };
  }

  private resetPresentationHistory(): void {
    const current = this.capturePresentationSnapshot();
    this.previousPresentation = current;
    this.currentPresentation = current;
    this.presentationBlend = 0;
    this.presentedPlayerPosition.copy(current.playerPosition);
    this.presentedPlayerYaw = current.playerYaw;
    this.presentedPlayerPitch = current.playerPitch;
  }

  private beginPresentationTick(): void {
    this.previousPresentation = this.currentPresentation ?? this.capturePresentationSnapshot();
  }

  private finishPresentationTick(): void {
    this.currentPresentation = this.capturePresentationSnapshot();
  }

  private applyPredictedPosition(
    target: Vector3,
    previous: Vector3 | undefined,
    current: Vector3,
    alpha: number,
    maximumTickDistance: number,
  ): void {
    if (!previous || shouldSnapPresentation(previous, current, maximumTickDistance)) {
      target.copy(current);
      return;
    }
    target.set(
      predictiveScalar(previous.x, current.x, alpha),
      predictiveScalar(previous.y, current.y, alpha),
      predictiveScalar(previous.z, current.z, alpha),
    );
  }

  private render(alpha = 0): void {
    const current = this.currentPresentation;
    const previous = this.previousPresentation;
    const blend = current && previous ? Math.max(0, Math.min(1, alpha)) : 0;
    this.presentationBlend = blend;
    if (current) {
      this.applyPredictedPosition(this.camera.position, previous?.playerPosition, current.playerPosition, blend, 1.1);
      if (this.world.isSolid(this.camera.position)) this.camera.position.copy(current.playerPosition);
      const yawDelta = previous ? shortestAngleDelta(previous.playerYaw, current.playerYaw) : 0;
      const pitchDelta = previous ? current.playerPitch - previous.playerPitch : 0;
      const yaw = previous && Math.abs(yawDelta) <= Math.PI / 2
        ? predictiveAngle(previous.playerYaw, current.playerYaw, blend)
        : current.playerYaw;
      const pitch = previous && Math.abs(pitchDelta) <= Math.PI / 3
        ? predictiveScalar(previous.playerPitch, current.playerPitch, blend)
        : current.playerPitch;
      this.camera.rotation.set(pitch, yaw, 0);

      for (const actor of this.world.actors) {
        const position = current.actorPositions.get(actor.uid);
        if (position) this.applyPredictedPosition(actor.sprite.position, previous?.actorPositions.get(actor.uid), position, blend, 1.5);
      }
      for (const [id, sprite] of this.projectileSprites) {
        const position = current.enemyProjectilePositions.get(id);
        if (position) this.applyPredictedPosition(sprite.position, previous?.enemyProjectilePositions.get(id), position, blend, 4);
      }
      for (const [id, sprite] of this.playerProjectileSprites) {
        const position = current.playerProjectilePositions.get(id);
        if (position) this.applyPredictedPosition(sprite.position, previous?.playerProjectilePositions.get(id), position, blend, 4);
      }
    }

    this.presentedPlayerPosition.copy(this.camera.position);
    this.presentedPlayerYaw = this.camera.rotation.y;
    this.presentedPlayerPitch = this.camera.rotation.x;
    this.renderCount += 1;
    this.renderer.render(this.scene, this.camera);

    if (!current) return;
    this.camera.position.copy(current.playerPosition);
    this.camera.rotation.set(current.playerPitch, current.playerYaw, 0);
    for (const actor of this.world.actors) {
      const position = current.actorPositions.get(actor.uid);
      if (position) actor.sprite.position.copy(position);
    }
    for (const [id, sprite] of this.projectileSprites) {
      const position = current.enemyProjectilePositions.get(id);
      if (position) sprite.position.copy(position);
    }
    for (const [id, sprite] of this.playerProjectileSprites) {
      const position = current.playerProjectilePositions.get(id);
      if (position) sprite.position.copy(position);
    }
  }

  private refreshPickupVisibility(): void {
    for (const pickup of this.world.pickups) {
      pickup.sprite.visible = !pickup.collected
        && !pickup.phaseLocked
        && !this.world.isConcealedAt(pickup.position)
        && this.horizontalDistance(pickup.position, this.player.position) <= 28
        && this.world.hasLineOfSight(this.player.position, pickup.position);
    }
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
    const nextMechanism = [...this.world.map.mechanisms]
      .sort((left, right) => left.activationOrder - right.activationOrder)
      .find((mechanism) => !this.world.activatedMechanisms.has(mechanism.id)
        && mechanism.requires.every((requirement) => this.world.activatedMechanisms.has(requirement)));
    if (!nextMechanism) return 'Proceed to the exit';
    const unopenedCredentialRoute = this.world.map.triggers.find((trigger) => trigger.action === 'open-door'
      && trigger.requiresCredential && this.player.credentials.has(trigger.requiresCredential)
      && !this.triggered.has(trigger.id));
    if (unopenedCredentialRoute?.requiresCredential) return `Open ${this.pretty(unopenedCredentialRoute.requiresCredential)} access route`;
    const missingCredential = this.world.pickups.find((pickup) => pickup.kind === 'credential' && !pickup.collected
      && !this.player.credentials.has(pickup.id as Credential))?.id as Credential | undefined;
    if (missingCredential) return `Recover ${this.pretty(missingCredential)} credential`;
    return `Activate ${nextMechanism.label}`;
  }
  private routeProgressSignature(): string {
    const routeTriggers = this.world.map.triggers
      .filter((trigger) => trigger.action !== 'reveal-secret' && this.triggered.has(trigger.id))
      .map((trigger) => trigger.id)
      .sort();
    const openDoors = [...this.world.doors.values()].filter((door) => door.open).map((door) => door.key).sort();
    return [
      this.currentObjective(),
      [...this.player.credentials].sort().join(','),
      [...this.world.activatedMechanisms].sort().join(','),
      routeTriggers.join(','),
      openDoors.join(','),
    ].join('|');
  }
  private resetRouteGuidance(): void {
    this.routeGuidanceElapsed = 0;
    this.routeGuidanceSignature = this.routeProgressSignature();
    this.routeHint = undefined;
  }
  private routeGuidanceDescriptor(): RouteGuidanceDescriptor {
    const activeAnchors = this.world.actors.filter((actor) => actor.mandatory && !actor.dead && !actor.phaseLocked);
    if (activeAnchors.length) {
      const target = [...activeAnchors].sort((left, right) =>
        this.horizontalDistance(left.position, this.player.position) - this.horizontalDistance(right.position, this.player.position))[0];
      return {
        kind: 'combat',
        label: 'required exposure',
        mapId: this.world.map.id,
        target: { x: target.position.x, z: target.position.z },
      };
    }
    const nextMechanism = [...this.world.map.mechanisms]
      .sort((left, right) => left.activationOrder - right.activationOrder)
      .find((mechanism) => !this.world.activatedMechanisms.has(mechanism.id)
        && mechanism.requires.every((requirement) => this.world.activatedMechanisms.has(requirement)));
    if (!nextMechanism) {
      return {
        kind: 'exit',
        label: 'exit',
        mapId: this.world.map.id,
        target: { x: this.world.map.exit.x * this.world.map.cellSize, z: this.world.map.exit.z * this.world.map.cellSize },
      };
    }
    const unopenedCredentialRoute = this.world.map.triggers.find((trigger) => trigger.action === 'open-door'
      && trigger.requiresCredential && this.player.credentials.has(trigger.requiresCredential)
      && !this.triggered.has(trigger.id));
    if (unopenedCredentialRoute?.requiresCredential) {
      return {
        kind: 'access',
        label: `${this.pretty(unopenedCredentialRoute.requiresCredential)} credential`,
        mapId: this.world.map.id,
        credential: unopenedCredentialRoute.requiresCredential,
        target: {
          x: unopenedCredentialRoute.x * this.world.map.cellSize,
          z: unopenedCredentialRoute.z * this.world.map.cellSize,
        },
      };
    }
    const missingCredential = this.world.pickups.find((pickup) => pickup.kind === 'credential' && !pickup.collected
      && !this.player.credentials.has(pickup.id as Credential));
    if (missingCredential) {
      const credential = missingCredential.id as Credential;
      return {
        kind: 'credential',
        label: `${this.pretty(credential)} credential`,
        mapId: this.world.map.id,
        credential,
        target: { x: missingCredential.position.x, z: missingCredential.position.z },
      };
    }
    const trigger = this.world.map.triggers.find((candidate) => !this.triggered.has(candidate.id)
      && candidate.targets.includes(nextMechanism.id));
    return {
      kind: 'mechanism',
      label: nextMechanism.label,
      mapId: this.world.map.id,
      ...(trigger ? { target: { x: trigger.x * this.world.map.cellSize, z: trigger.z * this.world.map.cellSize } } : {}),
    };
  }
  private updateRouteGuidance(dt: number): void {
    const signature = this.routeProgressSignature();
    if (signature !== this.routeGuidanceSignature) {
      this.resetRouteGuidance();
      return;
    }
    this.routeGuidanceElapsed += dt;
    const tier = routeHintTier(this.routeGuidanceElapsed);
    if (tier === 0 || tier <= (this.routeHint?.tier ?? 0)) return;
    this.routeHint = buildRouteHint(this.routeGuidanceDescriptor(), tier, {
      x: this.player.position.x,
      z: this.player.position.z,
      yaw: this.player.yaw,
    });
  }
  private escalateRouteGuidance(): void {
    const activeThreats = this.world.actors.filter((actor) => actor.mandatory && !actor.dead && !actor.phaseLocked);
    activeThreats.forEach((actor) => { actor.awake = true; });
    this.routeGuidanceSignature = this.routeProgressSignature();
    this.routeHint = buildRouteHint(this.routeGuidanceDescriptor(), 2, {
      x: this.player.position.x,
      z: this.player.position.z,
      yaw: this.player.yaw,
    });
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
      ...(this.routeHint ? { routeHint: this.routeHint } : {}),
      ...(interaction ? { interaction } : {}),
      ...(this.mode === 'dead' && this.lastDeathReview ? { death: this.lastDeathReview } : {}),
      ...(this.mode === 'paused' ? { pause: this.pauseDetails() } : {}),
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
  private updateAmbientAudio(dt: number): void {
    if (this.mode !== 'playing') return;
    this.ambientAudioTimer -= dt;
    if (this.ambientAudioTimer > 0) return;
    const groups = ambientAudioGroups(this.world.map.id);
    const group = groups[this.ambientAudioCursor % groups.length];
    const phase = this.ambientAudioCursor * 1.73 + Number(this.world.map.id[1]);
    this.audio.playCue(group, {
      gain: .22,
      pan: Math.sin(phase) * .72,
      priority: 'ambient',
    });
    this.ambientAudioCursor += 1;
    this.ambientAudioTimer = 7.2 + (this.ambientAudioCursor % 4) * 1.35;
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
    this.resetMapScopedPlayerState();
  }

  private resetMapScopedPlayerState(): void {
    this.player.floorPlan = false;
    this.player.powerups = { binder: 0, hazard: 0, rapid: 0, forensic: 0, goggles: 0 };
  }
}
