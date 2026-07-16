export type EpisodeId = 'first-notice' | 'exclusions-apply' | 'adverse-development';

export type MapId =
  | 'E1M1' | 'E1M2' | 'E1M3' | 'E1M4' | 'E1M5' | 'E1M6' | 'E1M7' | 'E1M8' | 'E1M9'
  | 'E2M1' | 'E2M2' | 'E2M3' | 'E2M4' | 'E2M5' | 'E2M6' | 'E2M7' | 'E2M8' | 'E2M9'
  | 'E3M1' | 'E3M2' | 'E3M3' | 'E3M4' | 'E3M5' | 'E3M6' | 'E3M7' | 'E3M8' | 'E3M9';

export type EnemyId =
  | 'returned-mail'
  | 'desk-warden'
  | 'ember-clerk'
  | 'exposure-hound'
  | 'coverage-drone'
  | 'liability-mass'
  | 'denial-officer'
  | 'subrogator'
  | 'reserve-eater'
  | 'fraud-apparition'
  | 'cat-model'
  | 'bad-faith-counsel';

export type BossId = 'regional-director' | 'aggregate' | 'chief-actuary' | 'uninsurable';

export type WeaponId =
  | 'claim-stamp'
  | 'staple-driver'
  | 'twin-bore-riveter'
  | 'audit-repeater'
  | 'catastrophe-launcher'
  | 'plasma-copier'
  | 'binding-engine'
  | 'umbra-saw';

export type PickupId =
  | 'staples-small' | 'staples-large'
  | 'fasteners-small' | 'fasteners-large'
  | 'canister' | 'canister-crate'
  | 'toner-cell' | 'toner-pack'
  | 'adhesive-bandage' | 'field-medical-case' | 'goodwill-token'
  | 'loss-control-vest' | 'catastrophe-suit' | 'emergency-reserve'
  | 'temporary-binder' | 'night-inspection-goggles' | 'hazard-endorsement'
  | 'rapid-authority' | 'floor-plan' | 'forensic-lens';

export type Credential = 'red' | 'yellow' | 'cyan';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Facing = 'north' | 'east' | 'south' | 'west';
export type EncounterRole = 'anchor' | 'pressure' | 'shape' | 'punish' | 'reward';
export type EnemyEncounterRole = Exclude<EncounterRole, 'reward'>;

export interface GridPoint {
  readonly x: number;
  readonly z: number;
}

export interface SectorTile {
  readonly solid?: boolean;
  readonly floorHeight: number;
  readonly ceilingHeight: number;
  readonly floorMaterial: string;
  readonly ceilingMaterial: string;
  readonly wallMaterial: string;
  readonly light: number;
  readonly damagePerSecond?: number;
  readonly secret?: boolean;
}

export interface EnemyPlacement extends GridPoint {
  readonly type: 'enemy';
  readonly enemy: EnemyId;
  readonly role: EnemyEncounterRole;
  readonly facing?: Facing;
  readonly difficulties?: readonly Difficulty[];
  readonly dormant?: boolean;
  readonly encounter?: string;
  readonly mandatory?: boolean;
  readonly route?: string;
}

export interface BossPlacement extends GridPoint {
  readonly type: 'boss';
  readonly boss: BossId;
  readonly facing?: Facing;
  readonly encounter: string;
}

export interface PickupPlacement extends GridPoint {
  readonly type: 'pickup';
  readonly pickup: PickupId;
  readonly difficulties?: readonly Difficulty[];
  readonly secret?: boolean;
  readonly route?: string;
}

export interface WeaponPlacement extends GridPoint {
  readonly type: 'weapon';
  readonly weapon: WeaponId;
  readonly difficulties?: readonly Difficulty[];
  readonly secret?: boolean;
  readonly route?: string;
}

export interface CredentialPlacement extends GridPoint {
  readonly type: 'credential';
  readonly credential: Credential;
}

export type ActorPlacement =
  | EnemyPlacement
  | BossPlacement
  | PickupPlacement
  | WeaponPlacement
  | CredentialPlacement;

export type TriggerAction =
  | 'open-door'
  | 'open-exit'
  | 'toggle-sectors'
  | 'lower-floor'
  | 'raise-floor'
  | 'drain-liquid'
  | 'flood-liquid'
  | 'move-walls'
  | 'blackout'
  | 'teleport'
  | 'spawn-wave'
  | 'reveal-secret'
  | 'complete-map';

export interface MapTrigger extends GridPoint {
  readonly id: string;
  readonly action: TriggerAction;
  readonly targets: readonly string[];
  readonly requiresCredential?: Credential;
  readonly requiresEncounter?: string;
  readonly repeatable?: boolean;
  readonly message?: string;
  readonly destination?: GridPoint;
}

export type MechanismMotion =
  | 'lift' | 'sink' | 'slide-x' | 'slide-z' | 'swap' | 'drain' | 'flood' | 'blackout' | 'shutters';

export interface MapMechanism {
  readonly id: string;
  readonly label: string;
  readonly action: TriggerAction;
  readonly sectorTags: readonly string[];
  readonly landmarkTags: readonly string[];
  readonly doorTags: readonly string[];
  readonly motion: MechanismMotion;
  readonly travel: number;
  readonly persistState: true;
  readonly restoresRoute: true;
  /** Explicit ordering and encounter coupling used by runtime and validators. */
  readonly activationOrder: number;
  readonly independent: boolean;
  readonly requires: readonly string[];
  readonly opens: readonly string[];
}

export interface LandmarkDefinition extends GridPoint {
  readonly id: string;
  readonly prop: string;
  readonly tag: string;
  readonly mechanism?: string;
  readonly scale?: number;
}

export interface BreakableDefinition extends GridPoint {
  readonly id: string;
  readonly prop: string;
  readonly health: number;
  readonly blocksMovement?: boolean;
  readonly reward?: PickupId;
}

export interface EncounterDefinition {
  readonly id: string;
  readonly label: string;
  readonly zones: readonly string[];
  readonly roles: readonly EncounterRole[];
  readonly completion: 'clear' | 'switch' | 'survive' | 'boss-phase';
  readonly opens?: readonly string[];
}

export interface EncounterBlueprint {
  readonly entryAnchor: GridPoint;
  readonly transformationAnchor: GridPoint;
  readonly climaxAnchor: GridPoint;
  readonly ambushFacing: Facing;
  readonly infightingPocket?: GridPoint;
  readonly rewardPocket: GridPoint;
}

export type SecretRewardCategory = 'armor' | 'ammo' | 'map' | 'weapon' | 'powerup';

export type SecretRewardPlacement =
  | { readonly type: 'pickup'; readonly pickup: PickupId }
  | { readonly type: 'weapon'; readonly weapon: WeaponId };

export interface SecretDefinition {
  readonly id: string;
  readonly clue: string;
  readonly rewardCategory: SecretRewardCategory;
  /** Human-readable name derived from the concrete reward placement. */
  readonly reward: string;
  readonly rewardPlacement: SecretRewardPlacement;
  readonly clueProp: string;
  readonly at: GridPoint;
  /** The clue-side switch is distinct from the concealed reward sector. */
  readonly revealAt: GridPoint;
  readonly concealedCells: readonly string[];
  readonly persistState: true;
}

export interface CampaignMap {
  readonly id: MapId;
  readonly episode: EpisodeId;
  readonly index: number;
  readonly title: string;
  readonly location: string;
  readonly music: string;
  readonly sky: string;
  readonly parSeconds: number;
  /** Realized enemy count on the standard placement tier. */
  readonly standardEnemyBudget: number;
  readonly secretMap?: boolean;
  readonly secretExitTo?: MapId;
  readonly nextMap?: MapId;
  readonly cellSize: number;
  readonly grid: readonly string[];
  readonly playerStart: GridPoint & { readonly facing: Facing };
  readonly exit: GridPoint;
  readonly legend: Readonly<Record<string, SectorTile>>;
  readonly zones: Readonly<Record<string, string>>;
  readonly actors: readonly ActorPlacement[];
  readonly landmarks: readonly LandmarkDefinition[];
  readonly breakables: readonly BreakableDefinition[];
  readonly mechanisms: readonly MapMechanism[];
  readonly triggers: readonly MapTrigger[];
  readonly encounters: readonly EncounterDefinition[];
  readonly encounterBlueprint: EncounterBlueprint;
  readonly secrets: readonly SecretDefinition[];
  readonly signatureBeat: string;
}

export interface EpisodeDefinition {
  readonly id: EpisodeId;
  readonly number: 1 | 2 | 3;
  readonly title: string;
  readonly arc: string;
  readonly palette: readonly string[];
  readonly maps: readonly MapId[];
}

export interface CampaignDefinition {
  readonly title: string;
  readonly episodes: readonly EpisodeDefinition[];
  readonly maps: Readonly<Record<MapId, CampaignMap>>;
}
