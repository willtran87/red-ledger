import type { BossId, EnemyId } from '../data/types';
import { ENEMIES } from './definitions';

export type HostileId = EnemyId | BossId;

export interface BehaviorVector {
  x: number;
  y: number;
  z: number;
}

export interface BehaviorActor {
  uid: string;
  kind: 'enemy' | 'boss';
  id: HostileId;
  position: BehaviorVector;
  health: number;
  maxHealth: number;
  radius: number;
  awake: boolean;
  dead: boolean;
  phaseLocked?: boolean;
  faction?: string;
  height?: number;
  redacted?: boolean;
}

export interface BehaviorTarget {
  uid: string;
  position: BehaviorVector;
  velocity: BehaviorVector;
  radius: number;
  alive?: boolean;
}

export interface ProjectileTraceHit {
  position: BehaviorVector;
  targetUid?: string;
}

export interface BehaviorWorldAdapter {
  hasLineOfSight?(from: BehaviorVector, to: BehaviorVector): boolean;
  canOccupy?(actor: BehaviorActor, position: BehaviorVector): boolean;
  canPlaceHazard?(position: BehaviorVector, radius: number): boolean;
  traceProjectile?(
    projectile: Readonly<ProjectileState>,
    from: BehaviorVector,
    to: BehaviorVector,
  ): ProjectileTraceHit | undefined;
}

export interface StatefulRandomSource {
  next(): number;
  getState?(): number;
  setState?(state: number): void;
}

export type RandomSource = StatefulRandomSource | (() => number);

export class SeededRandom implements StatefulRandomSource {
  private state: number;

  constructor(seed = 0x5eed1234) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }
}

export type MovementKind = 'chase' | 'zigzag' | 'strafe' | 'hover' | 'stalk' | 'stationary';
export type ProjectilePatternKind = 'single' | 'spread' | 'burst' | 'radial' | 'alternating';
export type DamageKind = 'ballistic' | 'fire' | 'impact' | 'denial' | 'toner' | 'hazard' | 'prediction' | 'redaction';

export interface MovementSpec {
  kind: MovementKind;
  speed: number;
  preferredRange: number;
  retreatRange?: number;
  strafeWeight?: number;
  zigzagFrequency?: number;
  bobAmplitude?: number;
  bobFrequency?: number;
}

export interface ProjectileTemplate {
  kind: string;
  speed: number;
  damage: number;
  damageKind: DamageKind;
  radius: number;
  ttl: number;
  homing?: number;
  originHeight?: number;
  leadSeconds?: number;
  impactHazard?: HazardTemplate;
  gravity?: number;
}

export interface HazardTemplate {
  kind: string;
  radius: number;
  damage: number;
  damageKind: DamageKind;
  duration: number;
  armTime: number;
  pulseInterval: number;
}

interface AttackBase {
  id: string;
  range: number;
  minRange?: number;
  cooldown: number;
  priority?: number;
  requiresLineOfSight?: boolean;
  windup?: number;
  recovery?: number;
}

export interface HitscanAttack extends AttackBase {
  kind: 'hitscan';
  damage: number;
  damageKind: DamageKind;
  accuracy: number;
  pellets?: number;
}

export interface MeleeAttack extends AttackBase {
  kind: 'melee';
  damage: number;
  damageKind: DamageKind;
  contactRange: number;
  lungeSpeed: number;
  lungeDuration: number;
}

export interface ProjectileAttack extends AttackBase {
  kind: 'projectile';
  projectile: ProjectileTemplate;
  pattern: {
    kind: ProjectilePatternKind;
    count: number;
    spread?: number;
    lateralOffset?: number;
  };
}

export interface HazardAttack extends AttackBase {
  kind: 'hazard' | 'prediction';
  hazard: HazardTemplate;
  leadSeconds?: number;
}

export interface ResurrectAttack extends AttackBase {
  kind: 'resurrect';
  healthFraction: number;
}

export interface SummonAttack extends AttackBase {
  kind: 'summon';
  enemyId: EnemyId;
  count: number;
  radius: number;
}

export type AttackSpec = HitscanAttack | MeleeAttack | ProjectileAttack | HazardAttack | ResurrectAttack | SummonAttack;

export interface StealthSpec {
  fadeDistance: number;
  revealDistance: number;
  revealDuration: number;
  hiddenOpacity: number;
}

export interface BossPhaseSpec {
  id: string;
  healthRatio: number;
  attackIds: readonly string[];
  movementMultiplier: number;
  cooldownMultiplier: number;
}

export interface BehaviorProfile {
  id: HostileId;
  movement: MovementSpec;
  attacks: readonly AttackSpec[];
  phases?: readonly BossPhaseSpec[];
  stealth?: StealthSpec;
  initialCooldown: number;
  cooldownJitter: number;
  faction?: string;
  painChance?: number;
  painDuration?: number;
  reactionTime?: number;
  postAttackRetreat?: boolean;
}

export type ActorActionState = 'dormant' | 'acquire' | 'chase' | 'windup' | 'recovery' | 'pain' | 'dead';

export interface ActorBehaviorState {
  uid: string;
  hostileId: HostileId;
  cooldown: number;
  attackCursor: number;
  phaseIndex: number;
  phaseId: string;
  bobClock: number;
  visible: boolean;
  revealRemaining: number;
  strafeSign: -1 | 1;
  action: ActorActionState;
  stateTimer: number;
  pendingAttackId?: string;
  targetUid: string;
  provokerUid?: string;
  redacted: boolean;
  lungeRemaining: number;
  lungeVelocity?: BehaviorVector;
}

export interface ProjectileState {
  id: string;
  ownerUid: string;
  ownerId: HostileId;
  kind: string;
  position: BehaviorVector;
  velocity: BehaviorVector;
  radius: number;
  damage: number;
  damageKind: DamageKind;
  remaining: number;
  targetUid: string;
  homing: number;
  gravity?: number;
  impactHazard?: HazardTemplate;
}

export interface HazardState {
  id: string;
  ownerUid: string;
  ownerId: HostileId;
  kind: string;
  position: BehaviorVector;
  radius: number;
  damage: number;
  damageKind: DamageKind;
  remaining: number;
  armRemaining: number;
  pulseRemaining: number;
  pulseInterval: number;
  armed: boolean;
}

export interface EnemyBehaviorSnapshot {
  version: 1;
  elapsed: number;
  nextEntityId: number;
  actors: ActorBehaviorState[];
  projectiles: ProjectileState[];
  hazards: HazardState[];
  pendingSounds?: PendingSound[];
  pendingDamage?: Array<{ targetUid: string; sourceUid: string; amount: number }>;
  rngState?: number;
}

export type BehaviorEvent =
  | { type: 'move'; actorUid: string; velocity: BehaviorVector; mode: MovementKind | 'lunge'; duration?: number }
  | { type: 'elevation'; actorUid: string; offset: number }
  | { type: 'visibility'; actorUid: string; visible: boolean; opacity: number }
  | { type: 'attack'; actorUid: string; attackId: string; attackKind: AttackSpec['kind']; resolved: boolean; blocked?: boolean; hitCount?: number }
  | { type: 'state'; actorUid: string; state: ActorActionState; duration: number; attackId?: string }
  | { type: 'wake'; actorUid: string; sourceUid: string; through: 'sight' | 'sound' | 'damage' }
  | { type: 'pain'; actorUid: string; sourceUid: string; interruptedAttack?: string }
  | { type: 'damage'; sourceUid: string; targetUid: string; amount: number; damageKind: DamageKind }
  | { type: 'spawn-projectile'; projectile: ProjectileState }
  | { type: 'remove-projectile'; projectileId: string; reason: 'impact' | 'expired' }
  | { type: 'spawn-hazard'; hazard: HazardState }
  | { type: 'hazard-armed'; hazardId: string }
  | { type: 'remove-hazard'; hazardId: string }
  | { type: 'resurrect'; actorUid: string; targetUid: string; health: number; redacted: true }
  | { type: 'summon'; actorUid: string; enemyId: EnemyId; positions: BehaviorVector[] }
  | { type: 'boss-phase'; actorUid: string; bossId: BossId; phaseIndex: number; phaseId: string }
  | { type: 'boss-mechanism'; actorUid: string; bossId: BossId; mechanism: 'open-add-shutters' | 'disable-left-emitter' | 'disable-right-emitter' | 'sink-cover' | 'arena-switch-window' | 'open-binding-gate' | 'expose-core' | 'spawn-wave'; index?: number };

export interface BehaviorStepInput {
  dt: number;
  actors: readonly BehaviorActor[];
  target: BehaviorTarget;
  world?: BehaviorWorldAdapter;
  difficulty?: { reaction: number; refire: number; projectileSpeed: number; aggression?: number };
}

export interface PendingSound {
  position: BehaviorVector;
  radius: number;
  sourceUid: string;
}

export interface BehaviorStepResult {
  events: BehaviorEvent[];
  projectiles: ProjectileState[];
  hazards: HazardState[];
}

const projectile = (
  kind: string,
  speed: number,
  damage: number,
  damageKind: DamageKind,
  overrides: Partial<ProjectileTemplate> = {},
): ProjectileTemplate => ({ kind, speed, damage, damageKind, radius: .22, ttl: 5, originHeight: 1, ...overrides });

const hazard = (
  kind: string,
  radius: number,
  damage: number,
  damageKind: DamageKind,
  duration: number,
  armTime: number,
  pulseInterval: number,
): HazardTemplate => ({ kind, radius, damage, damageKind, duration, armTime, pulseInterval });

const baseProfile = (
  id: HostileId,
  movement: MovementSpec,
  attacks: readonly AttackSpec[],
  extras: Partial<Omit<BehaviorProfile, 'id' | 'movement' | 'attacks'>> = {},
): BehaviorProfile => ({ id, movement, attacks, initialCooldown: .35, cooldownJitter: .16, ...extras });

const returnedMail = baseProfile('returned-mail',
  { kind: 'zigzag', speed: 2.6, preferredRange: 1.1, zigzagFrequency: 5 },
  [{ id: 'rejection-rush', kind: 'melee', range: 2.2, cooldown: .8, damage: 10, damageKind: 'impact', contactRange: 1.55, lungeSpeed: 5.8, lungeDuration: .2, requiresLineOfSight: true }]);

const deskWarden = baseProfile('desk-warden',
  { kind: 'strafe', speed: 1.7, preferredRange: 13, retreatRange: 5, strafeWeight: .38 },
  [{ id: 'staple-burst', kind: 'hitscan', range: 20, cooldown: 1.15, damage: 3, damageKind: 'ballistic', accuracy: .74, pellets: 3, requiresLineOfSight: true }]);

const emberClerk = baseProfile('ember-clerk',
  { kind: 'chase', speed: 2, preferredRange: 10, retreatRange: 4 },
  [{
    id: 'ember-claims', kind: 'projectile', range: 15, cooldown: .9, requiresLineOfSight: true,
    projectile: projectile('ember-claim', 9, 8, 'fire', { gravity: 7.5, impactHazard: hazard('ember-patch', 1.1, 2, 'fire', 2.2, 0, .7) }),
    pattern: { kind: 'burst', count: 2, spread: .08 },
  }]);

const exposureHound = baseProfile('exposure-hound',
  { kind: 'chase', speed: 3.3, preferredRange: 1.1 },
  [{ id: 'survey-lunge', kind: 'melee', range: 5, cooldown: .75, damage: 12, damageKind: 'impact', contactRange: 1.55, lungeSpeed: 8, lungeDuration: .28, requiresLineOfSight: true }]);

const coverageDrone = baseProfile('coverage-drone',
  { kind: 'hover', speed: 2.4, preferredRange: 15, retreatRange: 7, strafeWeight: .55, bobAmplitude: .28, bobFrequency: 2.4 },
  [{
    id: 'coverage-fan', kind: 'projectile', range: 22, cooldown: 1.25, requiresLineOfSight: true,
    projectile: projectile('coverage-bolt', 12, 9, 'toner', { originHeight: 1.35 }),
    pattern: { kind: 'spread', count: 3, spread: .18 },
  }]);

const liabilityMass = baseProfile('liability-mass',
  { kind: 'chase', speed: 1.15, preferredRange: 8, retreatRange: 3 },
  [{
    id: 'liability-orbs', kind: 'projectile', range: 13, cooldown: 1.35, requiresLineOfSight: true,
    projectile: projectile('liability-orb', 7, 18, 'impact', { radius: .36, originHeight: 1.45, leadSeconds: .35 }),
    pattern: { kind: 'spread', count: 3, spread: .28 },
  }]);

const denialOfficer = baseProfile('denial-officer',
  { kind: 'strafe', speed: 1.7, preferredRange: 18, retreatRange: 9, strafeWeight: .65 },
  [{ id: 'denial-beam', kind: 'hitscan', range: 25, cooldown: 1.05, damage: 13, damageKind: 'denial', accuracy: .91, pellets: 3, requiresLineOfSight: true, windup: .5 }]);

const subrogator = baseProfile('subrogator',
  { kind: 'chase', speed: 2.25, preferredRange: 9, retreatRange: 3 },
  [{
    id: 'paired-recovery', kind: 'projectile', range: 18, cooldown: .92, requiresLineOfSight: true,
    projectile: projectile('subrogation-packet', 13, 15, 'redaction', { homing: .7 }),
    pattern: { kind: 'spread', count: 3, spread: .18 },
  }]);

const reserveEater = baseProfile('reserve-eater',
  { kind: 'chase', speed: 1.45, preferredRange: 1.6 },
  [
    { id: 'vault-bite', kind: 'melee', range: 2.3, cooldown: .8, priority: 2, damage: 22, damageKind: 'impact', contactRange: 2.3, lungeSpeed: 3.8, lungeDuration: .22 },
    {
      id: 'reserve-spill', kind: 'projectile', minRange: 2.1, range: 18, cooldown: 1.35, requiresLineOfSight: true,
      projectile: projectile('reserve-glob', 7, 9, 'hazard', { radius: .3, impactHazard: hazard('reserve-hazard', 2.2, 8, 'hazard', 6, .25, .65) }),
      pattern: { kind: 'single', count: 1 },
    },
  ]);

const fraudApparition = baseProfile('fraud-apparition',
  { kind: 'stalk', speed: 2.8, preferredRange: 1.4, retreatRange: .7, strafeWeight: .9 },
  [{ id: 'contradiction-rend', kind: 'melee', range: 2.4, cooldown: 1.1, damage: 16, damageKind: 'redaction', contactRange: 1.65, lungeSpeed: 7.2, lungeDuration: .22, requiresLineOfSight: true, recovery: .6 }],
  { stealth: { fadeDistance: 7, revealDistance: 4, revealDuration: .8, hiddenOpacity: .16 }, postAttackRetreat: true });

const catModel = baseProfile('cat-model',
  { kind: 'chase', speed: 1.1, preferredRange: 16, retreatRange: 8 },
  [{
    id: 'loss-prediction', kind: 'prediction', range: 24, cooldown: 1.4, requiresLineOfSight: true, leadSeconds: .7,
    hazard: hazard('prediction-zone', 2.5, 24, 'prediction', 1.7, .85, 10),
  }]);

const badFaithCounsel = baseProfile('bad-faith-counsel',
  { kind: 'strafe', speed: 1.8, preferredRange: 17, retreatRange: 7, strafeWeight: .52 },
  [
    { id: 'adverse-opinion', kind: 'projectile', range: 26, cooldown: .88, requiresLineOfSight: true, projectile: projectile('redaction-writ', 14, 19, 'redaction', { homing: .45 }), pattern: { kind: 'spread', count: 2, spread: .12 } },
    { id: 'reopen-file', kind: 'resurrect', range: 14, cooldown: 3.8, priority: 3, healthFraction: .42 },
  ]);

const regionalDirector = baseProfile('regional-director',
  { kind: 'strafe', speed: 1.4, preferredRange: 18, retreatRange: 8, strafeWeight: .32 },
  [
    { id: 'response-canister', kind: 'projectile', range: 28, cooldown: .72, requiresLineOfSight: true, projectile: projectile('response-canister', 11, 28, 'impact', { radius: .34, impactHazard: hazard('canister-fire', 1.8, 7, 'fire', 3.5, .1, .7) }), pattern: { kind: 'spread', count: 2, spread: .12 } },
    { id: 'authority-summons', kind: 'summon', range: 30, cooldown: 4.5, enemyId: 'desk-warden', count: 2, radius: 3.2 },
    { id: 'executive-volley', kind: 'projectile', range: 30, cooldown: .62, projectile: projectile('response-canister', 13, 30, 'impact', { impactHazard: hazard('canister-fire', 2, 8, 'fire', 4, .1, .6) }), pattern: { kind: 'radial', count: 8 } },
  ],
  { phases: [
    { id: 'command', healthRatio: 1, attackIds: ['response-canister'], movementMultiplier: 1, cooldownMultiplier: 1 },
    { id: 'escalation', healthRatio: .66, attackIds: ['response-canister', 'authority-summons'], movementMultiplier: 1.12, cooldownMultiplier: .9 },
    { id: 'final-authority', healthRatio: .3, attackIds: ['executive-volley', 'authority-summons'], movementMultiplier: 1.25, cooldownMultiplier: .75 },
  ] });

const aggregate = baseProfile('aggregate',
  { kind: 'strafe', speed: .8, preferredRange: 21, retreatRange: 10, strafeWeight: .22 },
  [
    { id: 'joined-loss-emitters', kind: 'projectile', range: 30, cooldown: .66, projectile: projectile('joined-loss-bolt', 10, 32, 'toner', { radius: .32 }), pattern: { kind: 'alternating', count: 2, spread: .16, lateralOffset: .9 } },
    { id: 'joined-loss-right', kind: 'projectile', range: 30, cooldown: .76, projectile: projectile('joined-loss-bolt', 10, 32, 'toner', { radius: .32 }), pattern: { kind: 'single', count: 1 } },
    { id: 'aggregate-pool', kind: 'hazard', range: 30, cooldown: 2.6, leadSeconds: .45, hazard: hazard('aggregate-pool', 3.1, 11, 'hazard', 7, .45, .55) },
    { id: 'total-loss-ring', kind: 'projectile', range: 32, cooldown: .56, projectile: projectile('joined-loss-bolt', 12, 35, 'toner', { radius: .35 }), pattern: { kind: 'radial', count: 12 } },
  ],
  { phases: [
    { id: 'left-emitter', healthRatio: 1, attackIds: ['joined-loss-emitters'], movementMultiplier: 1, cooldownMultiplier: 1 },
    { id: 'joined-loss', healthRatio: .65, attackIds: ['joined-loss-right', 'aggregate-pool'], movementMultiplier: 1.08, cooldownMultiplier: .88 },
    { id: 'total-loss', healthRatio: .28, attackIds: ['total-loss-ring', 'aggregate-pool'], movementMultiplier: 1.15, cooldownMultiplier: .7 },
  ] });

const chiefActuary = baseProfile('chief-actuary',
  { kind: 'zigzag', speed: 1.25, preferredRange: 19, retreatRange: 7, zigzagFrequency: 3.6 },
  [
    { id: 'actuarial-prediction', kind: 'prediction', range: 32, cooldown: .95, leadSeconds: 1.1, hazard: hazard('actuarial-zone', 2.2, 36, 'prediction', 1.55, .7, 10) },
    { id: 'probability-salvo', kind: 'projectile', range: 32, cooldown: .58, projectile: projectile('probability-bolt', 16, 22, 'toner', { homing: .35 }), pattern: { kind: 'burst', count: 5, spread: .24 } },
    { id: 'certainty-lunge', kind: 'melee', range: 7, cooldown: .5, damage: 36, damageKind: 'impact', contactRange: 2.1, lungeSpeed: 10, lungeDuration: .32 },
  ],
  { phases: [
    { id: 'forecast', healthRatio: 1, attackIds: ['actuarial-prediction'], movementMultiplier: 1.2, cooldownMultiplier: 1 },
    { id: 'variance', healthRatio: .62, attackIds: ['actuarial-prediction', 'probability-salvo'], movementMultiplier: 1.75, cooldownMultiplier: .75 },
    { id: 'certainty', healthRatio: .25, attackIds: ['probability-salvo', 'certainty-lunge'], movementMultiplier: 2.35, cooldownMultiplier: .55 },
  ] });

const uninsurable = baseProfile('uninsurable',
  { kind: 'stationary', speed: 0, preferredRange: 0 },
  [
    { id: 'reserve-core-pulse', kind: 'projectile', range: 36, cooldown: .7, projectile: projectile('reserve-core-pulse', 11, 42, 'redaction', { radius: .38, originHeight: 1.8 }), pattern: { kind: 'radial', count: 10 } },
    { id: 'binding-failure', kind: 'hazard', range: 40, cooldown: 2.2, leadSeconds: .3, hazard: hazard('binding-failure', 3.5, 15, 'hazard', 8, .35, .5) },
    { id: 'uninsurable-denial', kind: 'hitscan', range: 40, cooldown: .48, damage: 42, damageKind: 'denial', accuracy: .84, requiresLineOfSight: true },
  ],
  { phases: [
    { id: 'sealed-core', healthRatio: 1, attackIds: ['reserve-core-pulse'], movementMultiplier: 1, cooldownMultiplier: 1 },
    { id: 'fractured-reserve', healthRatio: .7, attackIds: ['reserve-core-pulse', 'binding-failure'], movementMultiplier: 1, cooldownMultiplier: .8 },
    { id: 'red-line', healthRatio: .35, attackIds: ['binding-failure', 'uninsurable-denial'], movementMultiplier: 1, cooldownMultiplier: .58 },
  ] });

export const ENEMY_BEHAVIOR_PROFILES = {
  'returned-mail': returnedMail,
  'desk-warden': deskWarden,
  'ember-clerk': emberClerk,
  'exposure-hound': exposureHound,
  'coverage-drone': coverageDrone,
  'liability-mass': liabilityMass,
  'denial-officer': denialOfficer,
  subrogator,
  'reserve-eater': reserveEater,
  'fraud-apparition': fraudApparition,
  'cat-model': catModel,
  'bad-faith-counsel': badFaithCounsel,
  'regional-director': regionalDirector,
  aggregate,
  'chief-actuary': chiefActuary,
  uninsurable,
} as const satisfies Record<HostileId, BehaviorProfile>;

const copyVector = (value: BehaviorVector): BehaviorVector => ({ x: value.x, y: value.y, z: value.z });
const add = (a: BehaviorVector, b: BehaviorVector): BehaviorVector => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const subtract = (a: BehaviorVector, b: BehaviorVector): BehaviorVector => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (value: BehaviorVector, amount: number): BehaviorVector => ({ x: value.x * amount, y: value.y * amount, z: value.z * amount });
const length = (value: BehaviorVector): number => Math.hypot(value.x, value.y, value.z);
const horizontalDistance = (a: BehaviorVector, b: BehaviorVector): number => Math.hypot(a.x - b.x, a.z - b.z);
const normalize = (value: BehaviorVector): BehaviorVector => {
  const magnitude = length(value);
  return magnitude > 1e-6 ? scale(value, 1 / magnitude) : { x: 0, y: 0, z: 0 };
};
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const rotateY = (value: BehaviorVector, angle: number): BehaviorVector => ({
  x: value.x * Math.cos(angle) - value.z * Math.sin(angle),
  y: value.y,
  z: value.x * Math.sin(angle) + value.z * Math.cos(angle),
});

const cloneProjectile = (value: ProjectileState): ProjectileState => ({
  id: value.id, ownerUid: value.ownerUid, ownerId: value.ownerId, kind: value.kind,
  position: copyVector(value.position),
  velocity: copyVector(value.velocity),
  radius: value.radius, damage: value.damage, damageKind: value.damageKind, remaining: value.remaining,
  targetUid: value.targetUid, homing: value.homing,
  ...(value.gravity !== undefined ? { gravity: value.gravity } : {}),
  ...(value.impactHazard ? { impactHazard: { ...value.impactHazard } } : {}),
});
const cloneHazard = (value: HazardState): HazardState => ({ ...value, position: copyVector(value.position) });
const cloneActorState = (value: ActorBehaviorState): ActorBehaviorState => ({
  uid: value.uid, hostileId: value.hostileId, cooldown: value.cooldown, attackCursor: value.attackCursor,
  phaseIndex: value.phaseIndex, phaseId: value.phaseId, bobClock: value.bobClock, visible: value.visible,
  revealRemaining: value.revealRemaining, strafeSign: value.strafeSign, action: value.action,
  stateTimer: value.stateTimer, targetUid: value.targetUid, redacted: value.redacted,
  lungeRemaining: value.lungeRemaining,
  ...(value.lungeVelocity ? { lungeVelocity: copyVector(value.lungeVelocity) } : {}),
  ...(value.pendingAttackId ? { pendingAttackId: value.pendingAttackId } : {}),
  ...(value.provokerUid ? { provokerUid: value.provokerUid } : {}),
});

function segmentFractionToPoint(start: BehaviorVector, end: BehaviorVector, point: BehaviorVector): { fraction: number; distance: number } {
  const segment = subtract(end, start);
  const pointDelta = subtract(point, start);
  const denominator = segment.x ** 2 + segment.y ** 2 + segment.z ** 2;
  const fraction = denominator > 1e-8
    ? clamp01((pointDelta.x * segment.x + pointDelta.y * segment.y + pointDelta.z * segment.z) / denominator)
    : 0;
  return { fraction, distance: length(subtract(add(start, scale(segment, fraction)), point)) };
}

export class EnemyBehaviorSystem {
  private elapsed = 0;
  private nextEntityId = 1;
  private readonly actorStates = new Map<string, ActorBehaviorState>();
  private projectiles: ProjectileState[] = [];
  private hazards: HazardState[] = [];
  private readonly randomSource: StatefulRandomSource;
  private readonly profiles: Readonly<Record<HostileId, BehaviorProfile>>;
  private pendingSounds: PendingSound[] = [];
  private readonly pendingDamage = new Map<string, { sourceUid: string; amount: number }>();

  constructor(options: {
    rng?: RandomSource;
    profiles?: Readonly<Record<HostileId, BehaviorProfile>>;
  } = {}) {
    const source = options.rng ?? Math.random;
    this.randomSource = typeof source === 'function' ? { next: source } : source;
    this.profiles = options.profiles ?? ENEMY_BEHAVIOR_PROFILES;
  }

  step(input: BehaviorStepInput): BehaviorStepResult {
    if (!Number.isFinite(input.dt) || input.dt < 0) throw new Error('EnemyBehaviorSystem dt must be a finite, non-negative number');
    const events: BehaviorEvent[] = [];
    const world = input.world ?? {};
    const actors = [...input.actors].sort((a, b) => a.uid.localeCompare(b.uid));
    const actorByUid = new Map(actors.map((actor) => [actor.uid, actor]));
    const targets = new Map<string, BehaviorTarget>([[input.target.uid, input.target]]);
    actors.forEach((actor) => targets.set(actor.uid, {
      uid: actor.uid,
      position: { x: actor.position.x, y: actor.position.y + (actor.height ?? 1) * .5, z: actor.position.z },
      velocity: { x: 0, y: 0, z: 0 }, radius: actor.radius, alive: !actor.dead,
    }));
    const difficulty = input.difficulty ?? { reaction: 1, refire: 1, projectileSpeed: 1, aggression: 1 };
    this.elapsed += input.dt;

    this.updateHazards(input.dt, input.target, world, events);
    this.updateProjectiles(input.dt, targets, world, events);

    for (const actor of actors) {
      const profile = this.profiles[actor.id];
      const state = this.stateFor(actor, profile);
      state.cooldown -= input.dt;
      state.bobClock += input.dt;
      state.revealRemaining = Math.max(0, state.revealRemaining - input.dt);
      this.updatePhase(actor, profile, state, events);
      if (actor.dead) {
        this.setAction(actor.uid, state, 'dead', 0, events);
        continue;
      }
      if (actor.phaseLocked) continue;
      this.applyPendingDamage(actor, profile, state, actorByUid, events);
      this.applyAwareness(actor, state, input.target, world, events);
      if (!actor.awake && state.action === 'dormant') continue;

      const selected = targets.get(state.targetUid);
      const combatTarget = selected?.alive === false || !selected ? input.target : selected;
      if (combatTarget.alive === false) continue;
      const distance = horizontalDistance(actor.position, combatTarget.position);
      this.updateStealth(actor, profile, state, distance, events);

      if (state.lungeRemaining > 0 && state.lungeVelocity) {
        const duration = Math.min(input.dt, state.lungeRemaining);
        events.push({ type: 'move', actorUid: actor.uid, velocity: copyVector(state.lungeVelocity), mode: 'lunge', duration });
        state.lungeRemaining = Math.max(0, state.lungeRemaining - input.dt);
        if (state.lungeRemaining <= 0) state.lungeVelocity = undefined;
      }

      if (state.action === 'pain') {
        state.stateTimer -= input.dt;
        if (state.stateTimer <= 0) this.setAction(actor.uid, state, 'chase', 0, events);
        continue;
      }
      if (state.action === 'acquire') {
        state.stateTimer -= input.dt;
        if (state.stateTimer > 0) continue;
        this.setAction(actor.uid, state, 'chase', 0, events);
      }
      if (state.action === 'windup') {
        state.stateTimer -= input.dt;
        if (state.stateTimer > 0) continue;
        this.executePendingAttack(actor, actors, profile, state, combatTarget, distance, world, events, difficulty.projectileSpeed);
        const attack = profile.attacks.find((candidate) => candidate.id === state.pendingAttackId);
        const recovery = (attack?.recovery ?? ENEMIES[actor.id].recovery) * difficulty.refire;
        state.pendingAttackId = undefined;
        this.setAction(actor.uid, state, 'recovery', recovery, events);
        continue;
      }
      if (state.action === 'recovery') {
        if (profile.postAttackRetreat) {
          const away = normalize(subtract(actor.position, combatTarget.position));
          events.push({ type: 'move', actorUid: actor.uid, velocity: scale(away, profile.movement.speed * 1.2), mode: profile.movement.kind });
        }
        state.stateTimer -= input.dt;
        if (state.stateTimer > 0) continue;
        this.setAction(actor.uid, state, 'chase', 0, events);
      }
      this.emitMovement(actor, profile, state, combatTarget, distance, world, events);
      if (state.cooldown <= 0) this.beginAttack(actor, actors, profile, state, combatTarget, distance, world, events, difficulty);
    }
    this.pendingSounds = [];
    this.pendingDamage.clear();

    return {
      events,
      projectiles: this.projectiles.map(cloneProjectile),
      hazards: this.hazards.map(cloneHazard),
    };
  }

  serialize(): EnemyBehaviorSnapshot {
    const rngState = this.randomSource.getState?.();
    return {
      version: 1,
      elapsed: this.elapsed,
      nextEntityId: this.nextEntityId,
      actors: [...this.actorStates.values()].sort((a, b) => a.uid.localeCompare(b.uid)).map(cloneActorState),
      projectiles: this.projectiles.map(cloneProjectile),
      hazards: this.hazards.map(cloneHazard),
      pendingSounds: this.pendingSounds.map((sound) => ({ ...sound, position: copyVector(sound.position) })),
      pendingDamage: [...this.pendingDamage.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([targetUid, pending]) => ({ targetUid, ...pending })),
      ...(rngState === undefined ? {} : { rngState }),
    };
  }

  restore(snapshot: EnemyBehaviorSnapshot): void {
    if (snapshot.version !== 1) throw new Error(`Unsupported EnemyBehaviorSystem snapshot version: ${String(snapshot.version)}`);
    this.elapsed = snapshot.elapsed;
    this.nextEntityId = snapshot.nextEntityId;
    this.actorStates.clear();
    snapshot.actors.forEach((state) => this.actorStates.set(state.uid, cloneActorState({
      ...state,
      action: state.action ?? 'chase',
      stateTimer: state.stateTimer ?? 0,
      targetUid: state.targetUid ?? 'player',
      redacted: state.redacted ?? false,
      lungeRemaining: state.lungeRemaining ?? 0,
    })));
    this.projectiles = snapshot.projectiles.map(cloneProjectile);
    this.hazards = snapshot.hazards.map(cloneHazard);
    this.pendingSounds = (snapshot.pendingSounds ?? []).map((sound) => ({ ...sound, position: copyVector(sound.position) }));
    this.pendingDamage.clear();
    (snapshot.pendingDamage ?? []).forEach(({ targetUid, sourceUid, amount }) => this.pendingDamage.set(targetUid, { sourceUid, amount }));
    if (snapshot.rngState !== undefined) this.randomSource.setState?.(snapshot.rngState);
  }

  clear(): void {
    this.elapsed = 0;
    this.nextEntityId = 1;
    this.actorStates.clear();
    this.projectiles = [];
    this.hazards = [];
    this.pendingSounds = [];
    this.pendingDamage.clear();
  }

  emitSound(position: BehaviorVector, radius: number, sourceUid = 'player'): void {
    if (radius > 0) this.pendingSounds.push({ position: copyVector(position), radius, sourceUid });
  }

  registerDamage(targetUid: string, sourceUid: string, amount: number): void {
    const previous = this.pendingDamage.get(targetUid);
    this.pendingDamage.set(targetUid, { sourceUid, amount: amount + (previous?.amount ?? 0) });
  }

  markResurrected(targetUid: string, redacted = true): void {
    const state = this.actorStates.get(targetUid);
    if (!state) return;
    state.redacted = redacted;
    state.action = 'acquire';
    state.stateTimer = .16;
    state.targetUid = 'player';
    state.pendingAttackId = undefined;
  }

  removeOwner(ownerUid: string): void {
    this.actorStates.delete(ownerUid);
    this.projectiles = this.projectiles.filter((item) => item.ownerUid !== ownerUid);
    this.hazards = this.hazards.filter((item) => item.ownerUid !== ownerUid);
  }

  getActorState(uid: string): ActorBehaviorState | undefined {
    const state = this.actorStates.get(uid);
    return state ? cloneActorState(state) : undefined;
  }

  private random(): number {
    return clamp01(this.randomSource.next());
  }

  private stateFor(actor: BehaviorActor, profile: BehaviorProfile): ActorBehaviorState {
    const existing = this.actorStates.get(actor.uid);
    if (existing) {
      if (existing.hostileId !== actor.id) throw new Error(`Actor ${actor.uid} changed hostile id from ${existing.hostileId} to ${actor.id}`);
      return existing;
    }
    const initialPhase = profile.phases?.[0];
    const state: ActorBehaviorState = {
      uid: actor.uid,
      hostileId: actor.id,
      cooldown: profile.initialCooldown * this.random(),
      attackCursor: 0,
      phaseIndex: 0,
      phaseId: initialPhase?.id ?? 'base',
      bobClock: this.random() * Math.PI * 2,
      visible: true,
      revealRemaining: 0,
      strafeSign: this.random() < .5 ? -1 : 1,
      action: actor.awake ? 'acquire' : 'dormant',
      stateTimer: actor.awake ? (profile.reactionTime ?? .18) : 0,
      targetUid: 'player',
      redacted: actor.redacted ?? false,
      lungeRemaining: 0,
    };
    this.actorStates.set(actor.uid, state);
    return state;
  }

  private updatePhase(actor: BehaviorActor, profile: BehaviorProfile, state: ActorBehaviorState, events: BehaviorEvent[]): void {
    if (!profile.phases?.length || actor.dead) return;
    const ratio = actor.maxHealth > 0 ? actor.health / actor.maxHealth : 0;
    let nextIndex = 0;
    profile.phases.forEach((phase, index) => {
      if (ratio <= phase.healthRatio) nextIndex = index;
    });
    if (nextIndex === state.phaseIndex) return;
    state.phaseIndex = nextIndex;
    state.phaseId = profile.phases[nextIndex].id;
    state.cooldown = Math.min(state.cooldown, .18);
    events.push({ type: 'boss-phase', actorUid: actor.uid, bossId: actor.id as BossId, phaseIndex: nextIndex, phaseId: state.phaseId });
    const mechanisms: Partial<Record<BossId, Array<Extract<BehaviorEvent, { type: 'boss-mechanism' }>['mechanism']>>> = {
      'regional-director': ['open-add-shutters', 'open-add-shutters'],
      aggregate: ['disable-left-emitter', 'disable-right-emitter'],
      'chief-actuary': ['arena-switch-window', 'arena-switch-window'],
      uninsurable: ['spawn-wave', 'spawn-wave'],
    };
    const mechanism = mechanisms[actor.id as BossId]?.[nextIndex - 1];
    if (mechanism) events.push({ type: 'boss-mechanism', actorUid: actor.uid, bossId: actor.id as BossId, mechanism, index: nextIndex });
  }

  private setAction(actorUid: string, state: ActorBehaviorState, action: ActorActionState, duration: number, events: BehaviorEvent[], attackId?: string): void {
    if (state.action === action && Math.abs(state.stateTimer - duration) < 1e-6 && state.pendingAttackId === attackId) return;
    state.action = action;
    state.stateTimer = Math.max(0, duration);
    events.push({ type: 'state', actorUid, state: action, duration: state.stateTimer, ...(attackId ? { attackId } : {}) });
  }

  private applyAwareness(
    actor: BehaviorActor,
    state: ActorBehaviorState,
    player: BehaviorTarget,
    world: BehaviorWorldAdapter,
    events: BehaviorEvent[],
  ): void {
    if (state.action !== 'dormant') return;
    let sourceUid: string | undefined;
    let through: 'sight' | 'sound' = 'sight';
    if (actor.awake || (horizontalDistance(actor.position, player.position) <= 25 && (world.hasLineOfSight?.(actor.position, player.position) ?? true))) {
      sourceUid = player.uid;
    } else {
      const sound = this.pendingSounds.find((item) => horizontalDistance(actor.position, item.position) <= item.radius);
      if (sound) {
        sourceUid = sound.sourceUid;
        through = 'sound';
      }
    }
    if (!sourceUid) return;
    state.targetUid = sourceUid;
    const reaction = ENEMIES[actor.id].windup * .5;
    this.setAction(actor.uid, state, 'acquire', reaction, events);
    events.push({ type: 'wake', actorUid: actor.uid, sourceUid, through });
  }

  private applyPendingDamage(
    actor: BehaviorActor,
    profile: BehaviorProfile,
    state: ActorBehaviorState,
    actors: ReadonlyMap<string, BehaviorActor>,
    events: BehaviorEvent[],
  ): void {
    const pending = this.pendingDamage.get(actor.uid);
    if (!pending) return;
    const provoker = actors.get(pending.sourceUid);
    state.provokerUid = pending.sourceUid;
    state.targetUid = pending.sourceUid === actor.uid || (!provoker && pending.sourceUid !== 'player') ? 'player' : pending.sourceUid;
    if (state.action === 'dormant') {
      this.setAction(actor.uid, state, 'acquire', 0, events);
      events.push({ type: 'wake', actorUid: actor.uid, sourceUid: pending.sourceUid, through: 'damage' });
    }
    const painChance = profile.painChance ?? ENEMIES[actor.id].painChance;
    if (this.random() <= painChance && state.action !== 'dead') {
      const interruptedAttack = state.pendingAttackId;
      state.pendingAttackId = undefined;
      this.setAction(actor.uid, state, 'pain', profile.painDuration ?? ENEMIES[actor.id].painDuration, events);
      events.push({ type: 'pain', actorUid: actor.uid, sourceUid: pending.sourceUid, ...(interruptedAttack ? { interruptedAttack } : {}) });
    }
  }

  private updateStealth(
    actor: BehaviorActor,
    profile: BehaviorProfile,
    state: ActorBehaviorState,
    distance: number,
    events: BehaviorEvent[],
  ): void {
    if (!profile.stealth) return;
    const visible = state.revealRemaining > 0 || distance <= profile.stealth.revealDistance || distance < profile.stealth.fadeDistance;
    this.setVisibility(actor.uid, state, visible, profile.stealth.hiddenOpacity, events);
  }

  private setVisibility(actorUid: string, state: ActorBehaviorState, visible: boolean, hiddenOpacity: number, events: BehaviorEvent[]): void {
    if (state.visible === visible) return;
    state.visible = visible;
    events.push({ type: 'visibility', actorUid, visible, opacity: visible ? 1 : hiddenOpacity });
  }

  private emitMovement(
    actor: BehaviorActor,
    profile: BehaviorProfile,
    state: ActorBehaviorState,
    target: BehaviorTarget,
    distance: number,
    world: BehaviorWorldAdapter,
    events: BehaviorEvent[],
  ): void {
    const movement = profile.movement;
    const phase = profile.phases?.[state.phaseIndex];
    const speed = movement.speed * (phase?.movementMultiplier ?? 1);
    if (speed <= 0 || movement.kind === 'stationary') return;

    const toward = normalize({ x: target.position.x - actor.position.x, y: 0, z: target.position.z - actor.position.z });
    const perpendicular = { x: -toward.z * state.strafeSign, y: 0, z: toward.x * state.strafeSign };
    let forwardWeight = distance > movement.preferredRange ? 1 : distance < (movement.retreatRange ?? 0) ? -1 : 0;
    let strafeWeight = movement.strafeWeight ?? 0;
    if (movement.kind === 'zigzag') strafeWeight = Math.sin(this.elapsed * (movement.zigzagFrequency ?? 4) + state.bobClock) * .62;
    if (movement.kind === 'stalk') {
      forwardWeight = distance > movement.preferredRange ? .72 : distance < (movement.retreatRange ?? 0) ? -.45 : .16;
      strafeWeight = (movement.strafeWeight ?? .6) * Math.sin(this.elapsed * 2.1 + state.bobClock);
    }
    if (movement.kind === 'chase') strafeWeight = 0;
    const direction = normalize(add(scale(toward, forwardWeight), scale(perpendicular, strafeWeight)));
    if (length(direction) <= 1e-6) return;
    let velocity = scale(direction, speed);
    const proposed = add(actor.position, scale(velocity, .12));
    if (world.canOccupy && !world.canOccupy(actor, proposed)) {
      state.strafeSign = state.strafeSign === 1 ? -1 : 1;
      velocity = scale({ x: toward.z * state.strafeSign, y: 0, z: -toward.x * state.strafeSign }, speed);
    }
    events.push({ type: 'move', actorUid: actor.uid, velocity, mode: movement.kind });
    if (movement.kind === 'hover') {
      events.push({
        type: 'elevation',
        actorUid: actor.uid,
        offset: .85 + Math.sin(state.bobClock * (movement.bobFrequency ?? 2)) * (movement.bobAmplitude ?? .2),
      });
    }
  }

  private beginAttack(
    actor: BehaviorActor,
    actors: readonly BehaviorActor[],
    profile: BehaviorProfile,
    state: ActorBehaviorState,
    target: BehaviorTarget,
    distance: number,
    world: BehaviorWorldAdapter,
    events: BehaviorEvent[],
    difficulty: { reaction: number; refire: number; projectileSpeed: number; aggression?: number },
  ): void {
    const phase = profile.phases?.[state.phaseIndex];
    const lineOfSight = world.hasLineOfSight?.(actor.position, target.position) ?? true;
    const activeAttacks = phase ? profile.attacks.filter((attack) => phase.attackIds.includes(attack.id)) : profile.attacks;
    const eligible = activeAttacks.filter((attack) => {
      if (distance > attack.range || distance < (attack.minRange ?? 0)) return false;
      if (attack.requiresLineOfSight && !lineOfSight) return false;
      if (attack.kind === 'resurrect') return this.findResurrectionTarget(actor, actors, attack) !== undefined;
      return true;
    });
    if (!eligible.length) return;
    const maxPriority = Math.max(...eligible.map((attack) => attack.priority ?? 0));
    const candidates = eligible.filter((attack) => (attack.priority ?? 0) === maxPriority);
    const attack = candidates[state.attackCursor % candidates.length];
    state.attackCursor += 1;
    state.cooldown = attack.cooldown * (phase?.cooldownMultiplier ?? 1) * difficulty.refire
      / Math.max(.1, difficulty.aggression ?? 1) * (1 + (this.random() * 2 - 1) * profile.cooldownJitter);
    state.pendingAttackId = attack.id;
    const windup = (attack.windup ?? ENEMIES[actor.id].windup) * difficulty.reaction;
    this.setAction(actor.uid, state, 'windup', windup, events, attack.id);

    if (profile.stealth) {
      state.revealRemaining = profile.stealth.revealDuration;
      this.setVisibility(actor.uid, state, true, profile.stealth.hiddenOpacity, events);
    }
  }

  private executePendingAttack(
    actor: BehaviorActor,
    actors: readonly BehaviorActor[],
    profile: BehaviorProfile,
    state: ActorBehaviorState,
    target: BehaviorTarget,
    distance: number,
    world: BehaviorWorldAdapter,
    events: BehaviorEvent[],
    projectileSpeed: number,
  ): void {
    const attack = profile.attacks.find((candidate) => candidate.id === state.pendingAttackId);
    if (!attack) return;
    const attackEvent: Extract<BehaviorEvent, { type: 'attack' }> = {
      type: 'attack', actorUid: actor.uid, attackId: attack.id, attackKind: attack.kind, resolved: true,
    };
    events.push(attackEvent);
    switch (attack.kind) {
      case 'hitscan': {
        const resolution = this.executeHitscan(actor, target, distance, attack, world, events);
        attackEvent.resolved = resolution.resolved;
        attackEvent.blocked = resolution.blocked;
        attackEvent.hitCount = resolution.hitCount;
        break;
      }
      case 'melee': this.executeMelee(actor, target, distance, attack, state, world, events); break;
      case 'projectile': this.executeProjectile(actor, target, state, attack, events, projectileSpeed); break;
      case 'hazard':
      case 'prediction': attackEvent.resolved = this.executeHazard(actor, target, attack, world, events); break;
      case 'resurrect': this.executeResurrection(actor, actors, attack, events); break;
      case 'summon': this.executeSummon(actor, attack, events); break;
    }
  }

  private executeHitscan(actor: BehaviorActor, target: BehaviorTarget, distance: number, attack: HitscanAttack, world: BehaviorWorldAdapter, events: BehaviorEvent[]): { resolved: boolean; blocked: boolean; hitCount: number } {
    const currentDistance = horizontalDistance(actor.position, target.position);
    if (currentDistance > attack.range || currentDistance < (attack.minRange ?? 0)) return { resolved: false, blocked: false, hitCount: 0 };
    if (attack.requiresLineOfSight && !(world.hasLineOfSight?.(actor.position, target.position) ?? true)) return { resolved: false, blocked: true, hitCount: 0 };
    const pellets = attack.pellets ?? 1;
    const rangeFactor = 1 - .45 * clamp01(currentDistance / Math.max(attack.range, 1));
    let hitCount = 0;
    for (let index = 0; index < pellets; index += 1) {
      if (this.random() > attack.accuracy * rangeFactor) continue;
      const amount = attack.damage * (.85 + this.random() * .3);
      events.push({ type: 'damage', sourceUid: actor.uid, targetUid: target.uid, amount, damageKind: attack.damageKind });
      hitCount += 1;
    }
    return { resolved: true, blocked: false, hitCount };
  }

  private executeMelee(actor: BehaviorActor, target: BehaviorTarget, distance: number, attack: MeleeAttack, state: ActorBehaviorState, world: BehaviorWorldAdapter, events: BehaviorEvent[]): void {
    const direction = normalize({ x: target.position.x - actor.position.x, y: 0, z: target.position.z - actor.position.z });
    state.lungeVelocity = scale(direction, attack.lungeSpeed);
    state.lungeRemaining = attack.lungeDuration;
    if (distance <= attack.contactRange && (!attack.requiresLineOfSight || (world.hasLineOfSight?.(actor.position, target.position) ?? true))) {
      const amount = attack.damage * (.9 + this.random() * .2);
      events.push({ type: 'damage', sourceUid: actor.uid, targetUid: target.uid, amount, damageKind: attack.damageKind });
    }
  }

  private executeProjectile(actor: BehaviorActor, target: BehaviorTarget, state: ActorBehaviorState, attack: ProjectileAttack, events: BehaviorEvent[], speedScale = 1): void {
    const template = attack.projectile;
    const lead = template.leadSeconds ?? 0;
    const aimPoint = add(target.position, scale(target.velocity, lead));
    const origin = { x: actor.position.x, y: actor.position.y + (template.originHeight ?? 1), z: actor.position.z };
    const baseDirection = normalize(subtract(aimPoint, origin));
    const count = Math.max(1, attack.pattern.count);

    for (let index = 0; index < count; index += 1) {
      let angle = 0;
      if (attack.pattern.kind === 'radial') angle = (Math.PI * 2 * index) / count;
      else if (count > 1) angle = ((index / (count - 1)) - .5) * (attack.pattern.spread ?? 0);
      let projectileOrigin = copyVector(origin);
      if (attack.pattern.kind === 'alternating') {
        const side = (index + state.attackCursor) % 2 === 0 ? -1 : 1;
        const perpendicular = normalize({ x: -baseDirection.z, y: 0, z: baseDirection.x });
        projectileOrigin = add(projectileOrigin, scale(perpendicular, side * (attack.pattern.lateralOffset ?? .4)));
      }
      const direction = attack.pattern.kind === 'radial'
        ? { x: Math.sin(angle), y: 0, z: Math.cos(angle) }
        : rotateY(baseDirection, angle);
      const velocity = scale(direction, template.speed * speedScale);
      if (template.gravity) velocity.y += Math.min(7, horizontalDistance(origin, aimPoint) * .34);
      const item: ProjectileState = {
        id: `${actor.uid}:projectile:${this.nextEntityId++}`,
        ownerUid: actor.uid,
        ownerId: actor.id,
        kind: template.kind,
        position: projectileOrigin,
        velocity,
        radius: template.radius,
        damage: template.damage,
        damageKind: template.damageKind,
        remaining: template.ttl,
        targetUid: target.uid,
        homing: template.homing ?? 0,
        ...(template.gravity !== undefined ? { gravity: template.gravity } : {}),
        impactHazard: template.impactHazard ? { ...template.impactHazard } : undefined,
      };
      this.projectiles.push(item);
      events.push({ type: 'spawn-projectile', projectile: cloneProjectile(item) });
    }
  }

  private executeHazard(actor: BehaviorActor, target: BehaviorTarget, attack: HazardAttack, world: BehaviorWorldAdapter, events: BehaviorEvent[]): boolean {
    if (horizontalDistance(actor.position, target.position) > attack.range) return false;
    if (attack.requiresLineOfSight && !(world.hasLineOfSight?.(actor.position, target.position) ?? true)) return false;
    const position = add(target.position, scale(target.velocity, attack.leadSeconds ?? 0));
    position.y = 0;
    const predictedSightline = { ...position, y: target.position.y };
    if (attack.requiresLineOfSight && !(world.hasLineOfSight?.(actor.position, predictedSightline) ?? true)) return false;
    if (world.canPlaceHazard && !world.canPlaceHazard(position, attack.hazard.radius)) return false;
    this.spawnHazard(actor.uid, actor.id, position, attack.hazard, events);
    return true;
  }

  private findResurrectionTarget(actor: BehaviorActor, actors: readonly BehaviorActor[], attack: ResurrectAttack): BehaviorActor | undefined {
    return actors
      .filter((candidate) => candidate.dead && candidate.kind === 'enemy' && candidate.uid !== actor.uid && horizontalDistance(actor.position, candidate.position) <= attack.range)
      .sort((a, b) => horizontalDistance(actor.position, a.position) - horizontalDistance(actor.position, b.position) || a.uid.localeCompare(b.uid))[0];
  }

  private executeResurrection(actor: BehaviorActor, actors: readonly BehaviorActor[], attack: ResurrectAttack, events: BehaviorEvent[]): void {
    const target = this.findResurrectionTarget(actor, actors, attack);
    if (!target) return;
    events.push({ type: 'resurrect', actorUid: actor.uid, targetUid: target.uid, health: Math.max(1, Math.round(target.maxHealth * attack.healthFraction)), redacted: true });
  }

  private executeSummon(actor: BehaviorActor, attack: SummonAttack, events: BehaviorEvent[]): void {
    const startAngle = this.random() * Math.PI * 2;
    const positions = Array.from({ length: attack.count }, (_, index) => {
      const angle = startAngle + (Math.PI * 2 * index) / attack.count;
      return {
        x: actor.position.x + Math.cos(angle) * attack.radius,
        y: actor.position.y,
        z: actor.position.z + Math.sin(angle) * attack.radius,
      };
    });
    events.push({ type: 'summon', actorUid: actor.uid, enemyId: attack.enemyId, positions });
  }

  private updateProjectiles(
    dt: number,
    targets: ReadonlyMap<string, BehaviorTarget>,
    world: BehaviorWorldAdapter,
    events: BehaviorEvent[],
  ): void {
    const survivors: ProjectileState[] = [];
    for (const item of this.projectiles) {
      const target = targets.get(item.targetUid);
      const from = copyVector(item.position);
      if (target && item.homing > 0 && target.alive !== false) {
        const speed = length(item.velocity);
        const desired = normalize(subtract(target.position, item.position));
        const current = normalize(item.velocity);
        const blend = clamp01(item.homing * dt);
        item.velocity = scale(normalize(add(scale(current, 1 - blend), scale(desired, blend))), speed);
      }
      const to = add(item.position, scale(item.velocity, dt));
      const worldHit = world.traceProjectile?.(item, from, to);
      const targetContact = target ? segmentFractionToPoint(from, to, target.position) : { fraction: Number.POSITIVE_INFINITY, distance: Number.POSITIVE_INFINITY };
      const targetHit = Boolean(target && target.alive !== false && targetContact.distance <= item.radius + target.radius);
      const worldFraction = worldHit ? segmentFractionToPoint(from, to, worldHit.position).fraction : Number.POSITIVE_INFINITY;

      if (targetHit && targetContact.fraction <= worldFraction) {
        item.position = add(from, scale(subtract(to, from), targetContact.fraction));
        events.push({ type: 'damage', sourceUid: item.ownerUid, targetUid: target!.uid, amount: item.damage, damageKind: item.damageKind });
        this.finishProjectile(item, 'impact', events);
        continue;
      }
      if (worldHit) {
        item.position = copyVector(worldHit.position);
        if (worldHit.targetUid) events.push({ type: 'damage', sourceUid: item.ownerUid, targetUid: worldHit.targetUid, amount: item.damage, damageKind: item.damageKind });
        this.finishProjectile(item, 'impact', events);
        continue;
      }
      item.position = to;
      if (item.gravity) item.velocity.y -= item.gravity * dt;
      item.remaining -= dt;
      if (item.remaining <= 0) {
        this.finishProjectile(item, 'expired', events);
        continue;
      }
      survivors.push(item);
    }
    this.projectiles = survivors;
  }

  private finishProjectile(item: ProjectileState, reason: 'impact' | 'expired', events: BehaviorEvent[]): void {
    if (reason === 'impact' && item.impactHazard) this.spawnHazard(item.ownerUid, item.ownerId, item.position, item.impactHazard, events);
    events.push({ type: 'remove-projectile', projectileId: item.id, reason });
  }

  private spawnHazard(
    ownerUid: string,
    ownerId: HostileId,
    position: BehaviorVector,
    template: HazardTemplate,
    events: BehaviorEvent[],
  ): void {
    const item: HazardState = {
      id: `${ownerUid}:hazard:${this.nextEntityId++}`,
      ownerUid,
      ownerId,
      kind: template.kind,
      position: copyVector(position),
      radius: template.radius,
      damage: template.damage,
      damageKind: template.damageKind,
      remaining: template.duration,
      armRemaining: template.armTime,
      pulseRemaining: 0,
      pulseInterval: template.pulseInterval,
      armed: template.armTime <= 0,
    };
    this.hazards.push(item);
    events.push({ type: 'spawn-hazard', hazard: cloneHazard(item) });
  }

  private updateHazards(dt: number, target: BehaviorTarget, world: BehaviorWorldAdapter, events: BehaviorEvent[]): void {
    const survivors: HazardState[] = [];
    for (const item of this.hazards) {
      item.remaining -= dt;
      item.pulseRemaining -= dt;
      if (!item.armed) {
        item.armRemaining -= dt;
        if (item.armRemaining <= 0) {
          item.armRemaining = 0;
          item.armed = true;
          events.push({ type: 'hazard-armed', hazardId: item.id });
        }
      }
      const targetExposed = world.hasLineOfSight?.(item.position, target.position) ?? true;
      if (item.armed) {
        const canDamage = target.alive !== false && targetExposed
          && horizontalDistance(item.position, target.position) <= item.radius + target.radius;
        while (item.pulseRemaining <= 0 && item.remaining > 0) {
          if (canDamage) events.push({ type: 'damage', sourceUid: item.ownerUid, targetUid: target.uid, amount: item.damage, damageKind: item.damageKind });
          item.pulseRemaining += Math.max(.05, item.pulseInterval);
        }
      }
      if (item.remaining <= 0) {
        events.push({ type: 'remove-hazard', hazardId: item.id });
        continue;
      }
      survivors.push(item);
    }
    this.hazards = survivors;
  }
}
