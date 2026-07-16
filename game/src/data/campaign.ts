import { getLayout, type LayoutId } from './layouts';
import { EPISODE_TILESETS } from './tiles';
import type {
  ActorPlacement,
  BossId,
  CampaignDefinition,
  CampaignMap,
  Credential,
  Difficulty,
  EnemyId,
  EnemyEncounterRole,
  EncounterRole,
  EpisodeDefinition,
  EpisodeId,
  Facing,
  GridPoint,
  LandmarkDefinition,
  BreakableDefinition,
  MapMechanism,
  EncounterBlueprint,
  MapId,
  MapTrigger,
  PickupId,
  SecretDefinition,
  SecretRewardCategory,
  SecretRewardPlacement,
  TriggerAction,
  WeaponId,
} from './types';

const LANDMARK_PROPS: Readonly<Record<MapId, readonly string[]>> = {
  E1M1: ['office-phone-stamp', 'mail-sort-cart', 'filing-cabinet'], E1M2: ['copier-bank', 'office-chair', 'queue-barrier'],
  E1M3: ['damaged-vehicle-cluster', 'vehicle-lift-control', 'generator'], E1M4: ['axial-blower', 'suppression-cylinder', 'flood-pump'],
  E1M5: ['rolling-shelf-closed', 'archive-crate-pallet', 'filing-cabinet'], E1M6: ['filing-cabinet', 'roof-hvac-damaged', 'office-chair'],
  E1M7: ['actuarial-calculator', 'ledger-integrator', 'calculation-tower'], E1M8: ['catastrophe-desk', 'queue-barrier', 'repair-cart'],
  E1M9: ['hotel-lobby-armchair', 'breakroom-microwave', 'office-phone-stamp'],
  E2M1: ['sandbag-barricade', 'generator', 'repair-cart'], E2M2: ['flood-pump', 'hotel-service-trolley', 'sandbag-barricade'],
  E2M3: ['data-rack-power', 'data-rack-open', 'generator'], E2M4: ['train-coupler-cluster', 'train-relay-cabinet', 'queue-barrier'],
  E2M5: ['salvage-compactor', 'salvage-shear', 'archive-crate-pallet'], E2M6: ['flood-pump', 'generator', 'suppression-cylinder'],
  E2M7: ['witness-lectern', 'litigation-chair', 'evidence-case-cart'], E2M8: ['probability-engine', 'paper-boulder', 'calculation-tower'],
  E2M9: ['calculation-tower', 'queue-barrier', 'ledger-integrator'],
  E3M1: ['actuarial-calculator', 'pneumatic-tube', 'ledger-integrator'], E3M2: ['calculation-tower', 'ledger-integrator', 'probability-engine'],
  E3M3: ['evidence-locker', 'evidence-case-cart', 'filing-cabinet'], E3M4: ['probability-engine', 'paper-arch', 'calculation-tower'],
  E3M5: ['floating-drawer-cluster', 'paper-stalagmite', 'paper-boulder'], E3M6: ['witness-lectern', 'paper-boulder', 'paper-arch'],
  E3M7: ['ledger-integrator', 'calculation-tower', 'evidence-locker'], E3M8: ['probability-engine', 'pneumatic-tube', 'ledger-integrator'],
  E3M9: ['desk-lamp-paper-stack', 'office-phone-stamp', 'queue-barrier'],
};

// Secret clues use an explicitly authored visual tell rather than borrowing a
// random landmark from the map. Every id is a shipped prop family and the
// ordering matches the clue copy in the corresponding map spec.
export const SECRET_CLUE_PROPS: Readonly<Record<MapId, readonly string[]>> = {
  E1M1: ['filing-cabinet', 'desk-lamp-paper-stack'],
  E1M2: ['office-phone-stamp', 'claim-terminal', 'roof-hvac-damaged'],
  E1M3: ['damaged-vehicle-cluster', 'flood-pump', 'vehicle-lift-control'],
  E1M4: ['pneumatic-tube', 'queue-barrier', 'flood-pump'],
  E1M5: ['rolling-shelf-closed', 'vehicle-lift-control', 'claim-terminal', 'archive-crate-pallet'],
  E1M6: ['evidence-locker', 'office-phone-stamp', 'desk-lamp-paper-stack', 'roof-hvac-damaged'],
  E1M7: ['office-chair', 'claim-terminal', 'witness-lectern', 'roof-exhaust-turbine'],
  E1M8: ['evidence-locker', 'litigation-chair', 'archive-crate-pallet'],
  E1M9: ['desk-lamp-paper-stack', 'roof-exhaust-turbine', 'breakroom-microwave', 'hotel-lobby-armchair'],
  E2M1: ['archive-crate-pallet', 'generator', 'train-relay-cabinet'],
  E2M2: ['office-phone-stamp', 'hotel-lobby-armchair', 'hotel-luggage-bench', 'hotel-service-trolley'],
  E2M3: ['data-rack-power', 'data-rack-open', 'roof-exhaust-turbine', 'data-rack-sealed'],
  E2M4: ['train-relay-cabinet', 'train-coupler-cluster', 'train-relay-cabinet', 'train-tool-trolley'],
  E2M5: ['damaged-vehicle-cluster', 'salvage-compactor', 'salvage-sorting-drum', 'damaged-vehicle-cluster'],
  E2M6: ['flood-pump', 'records-step-cart', 'pneumatic-tube', 'flood-pump', 'claim-terminal'],
  E2M7: ['actuarial-calculator', 'desk-lamp-paper-stack', 'evidence-locker', 'litigation-chair', 'witness-lectern'],
  E2M8: ['data-rack-power', 'probability-engine', 'paper-arch'],
  E2M9: ['paper-boulder', 'queue-barrier', 'claim-terminal', 'paper-arch'],
  E3M1: ['ledger-integrator', 'actuarial-calculator', 'calculation-tower'],
  E3M2: ['calculation-tower', 'ledger-integrator', 'records-step-cart', 'probability-engine'],
  E3M3: ['evidence-locker', 'pneumatic-tube', 'paper-stalagmite', 'paper-arch'],
  E3M4: ['probability-engine', 'witness-lectern', 'witness-lectern', 'calculation-tower', 'actuarial-calculator'],
  E3M5: ['vehicle-lift-control', 'evidence-case-cart', 'paper-arch', 'train-coupler-cluster', 'floating-drawer-cluster'],
  E3M6: ['desk-lamp-paper-stack', 'evidence-locker', 'witness-lectern', 'evidence-case-cart', 'claim-terminal'],
  E3M7: ['office-phone-stamp', 'hotel-lobby-armchair', 'breakroom-microwave', 'train-relay-cabinet', 'ledger-integrator', 'desk-lamp-paper-stack'],
  E3M8: ['probability-engine', 'evidence-locker', 'paper-arch', 'pneumatic-tube'],
  E3M9: ['queue-barrier', 'desk-lamp-paper-stack', 'paper-arch', 'claim-terminal', 'actuarial-calculator'],
};

const MECHANISM_LABELS: Readonly<Record<MapId, string>> = {
  E1M1: 'Credential return loop', E1M2: 'Cubicle shutter maze', E1M3: 'Vehicle lift bridges',
  E1M4: 'Restoration channel pumps', E1M5: 'Rolling archive shelves', E1M6: 'Balcony access lifts',
  E1M7: 'Splitting boardroom table', E1M8: 'Meeting-room add shutters', E1M9: 'Covered-peril scenery walls',
  E2M1: 'Storm container lanes', E2M2: 'Flooded hotel water table', E2M3: 'Alternating data-center power',
  E2M4: 'Cross-platform train cars', E2M5: 'Salvage crusher blocks', E2M6: 'Three-pump routing manifold',
  E2M7: 'Contradictory deposition rooms', E2M8: 'Sinking aggregate cover', E2M9: 'Collapsing modular soundstage',
  E3M1: 'Currency-channel foundry doors', E3M2: 'Row-column calculator matrix', E3M3: 'Layered evidence vault transfer',
  E3M4: 'Rotating prediction sectors', E3M5: 'Descending reserve shaft', E3M6: 'Sequenced redaction walls',
  E3M7: 'Distorted landmark modules', E3M8: 'Three binding gates', E3M9: 'Peeling perfect-office scenery',
};

interface EncounterBlueprintIndices {
  readonly anchors: readonly [number, number, number];
  readonly facing: Facing;
  readonly infighting?: number;
  readonly reward: number;
}

const ENCOUNTER_BLUEPRINTS: Readonly<Record<MapId, EncounterBlueprintIndices>> = {
  E1M1: { anchors: [2, 17, 38], facing: 'west', reward: 27 }, E1M2: { anchors: [5, 29, 61], facing: 'south', infighting: 44, reward: 33 },
  E1M3: { anchors: [7, 34, 72], facing: 'north', infighting: 51, reward: 63 }, E1M4: { anchors: [3, 41, 78], facing: 'east', infighting: 55, reward: 68 },
  E1M5: { anchors: [11, 37, 83], facing: 'west', infighting: 66, reward: 49 }, E1M6: { anchors: [8, 46, 91], facing: 'south', infighting: 70, reward: 58 },
  E1M7: { anchors: [13, 52, 97], facing: 'north', infighting: 74, reward: 85 }, E1M8: { anchors: [4, 57, 104], facing: 'east', infighting: 81, reward: 93 },
  E1M9: { anchors: [9, 43, 88], facing: 'west', infighting: 62, reward: 77 },
  E2M1: { anchors: [6, 31, 69], facing: 'south', infighting: 48, reward: 59 }, E2M2: { anchors: [12, 45, 86], facing: 'north', infighting: 67, reward: 73 },
  E2M3: { anchors: [1, 39, 94], facing: 'east', infighting: 71, reward: 82 }, E2M4: { anchors: [15, 53, 101], facing: 'west', infighting: 79, reward: 90 },
  E2M5: { anchors: [10, 48, 96], facing: 'south', infighting: 76, reward: 84 }, E2M6: { anchors: [14, 56, 108], facing: 'north', infighting: 87, reward: 99 },
  E2M7: { anchors: [3, 50, 112], facing: 'east', infighting: 89, reward: 102 }, E2M8: { anchors: [16, 62, 118], facing: 'west', infighting: 95, reward: 109 },
  E2M9: { anchors: [7, 47, 92], facing: 'south', infighting: 69, reward: 80 },
  E3M1: { anchors: [5, 36, 81], facing: 'north', infighting: 60, reward: 70 }, E3M2: { anchors: [18, 58, 107], facing: 'east', infighting: 88, reward: 98 },
  E3M3: { anchors: [2, 49, 103], facing: 'west', infighting: 83, reward: 94 }, E3M4: { anchors: [17, 64, 121], facing: 'south', infighting: 97, reward: 111 },
  E3M5: { anchors: [9, 55, 115], facing: 'north', infighting: 91, reward: 105 }, E3M6: { anchors: [20, 67, 126], facing: 'east', infighting: 101, reward: 116 },
  E3M7: { anchors: [6, 61, 130], facing: 'west', infighting: 106, reward: 119 }, E3M8: { anchors: [19, 72, 137], facing: 'south', infighting: 114, reward: 128 },
  E3M9: { anchors: [8, 54, 110], facing: 'north', infighting: 86, reward: 100 },
};

interface MapSpec {
  readonly id: MapId;
  readonly title: string;
  readonly location: string;
  readonly layout: LayoutId;
  readonly normalEnemies: number;
  readonly enemies: readonly EnemyId[];
  readonly weapons: readonly WeaponId[];
  readonly credentials: readonly Credential[];
  readonly transformation: TriggerAction;
  readonly signatureBeat: string;
  readonly secretClues: readonly string[];
  readonly bosses?: readonly BossId[];
  readonly recoverySupplies?: readonly { readonly pickup: PickupId; readonly route: string }[];
  readonly secretMap?: boolean;
  readonly secretExitTo?: MapId;
  readonly nextMap?: MapId;
}

const E1: readonly EnemyId[] = ['returned-mail', 'desk-warden', 'ember-clerk'];
const E1_FAST: readonly EnemyId[] = [...E1, 'exposure-hound', 'coverage-drone'];
const E1_FULL: readonly EnemyId[] = [...E1_FAST, 'liability-mass'];
const E2_OPEN: readonly EnemyId[] = [...E1_FULL, 'denial-officer', 'subrogator'];
const E2_HEAVY: readonly EnemyId[] = [...E2_OPEN, 'reserve-eater'];
const E2_FULL: readonly EnemyId[] = [...E2_HEAVY, 'fraud-apparition'];
const E3_OPEN: readonly EnemyId[] = [...E2_FULL, 'cat-model'];
const E3_FULL: readonly EnemyId[] = [...E3_OPEN, 'bad-faith-counsel'];

export type CampaignEncounterPhaseId = 'entry' | 'transformation' | 'climax';
export type CampaignPhaseEnemyPalettes = Readonly<Record<CampaignEncounterPhaseId, readonly EnemyId[]>>;

const enemies = (...ids: readonly EnemyId[]): readonly EnemyId[] => ids;

// Each phase owns a deliberately narrow cast. The map-level roster above still
// controls introductions, while these palettes keep a fight readable and make
// the next phase change its silhouette instead of sampling the full campaign.
export const CAMPAIGN_PHASE_ENEMY_PALETTES = {
  E1M1: {
    entry: enemies('returned-mail', 'desk-warden'),
    transformation: enemies('desk-warden', 'ember-clerk'),
    climax: enemies('returned-mail', 'ember-clerk'),
  },
  E1M2: {
    entry: enemies('returned-mail', 'exposure-hound', 'coverage-drone'),
    transformation: enemies('desk-warden', 'ember-clerk', 'exposure-hound'),
    climax: enemies('returned-mail', 'ember-clerk', 'coverage-drone'),
  },
  E1M3: {
    entry: enemies('returned-mail', 'exposure-hound', 'desk-warden', 'coverage-drone'),
    transformation: enemies('ember-clerk', 'coverage-drone', 'liability-mass', 'exposure-hound'),
    climax: enemies('returned-mail', 'desk-warden', 'coverage-drone', 'liability-mass'),
  },
  E1M4: {
    entry: enemies('ember-clerk', 'exposure-hound', 'desk-warden', 'coverage-drone'),
    transformation: enemies('returned-mail', 'liability-mass', 'coverage-drone', 'desk-warden'),
    climax: enemies('ember-clerk', 'liability-mass', 'exposure-hound', 'coverage-drone'),
  },
  E1M5: {
    entry: enemies('returned-mail', 'ember-clerk', 'exposure-hound', 'liability-mass'),
    transformation: enemies('desk-warden', 'coverage-drone', 'liability-mass', 'ember-clerk'),
    climax: enemies('returned-mail', 'desk-warden', 'coverage-drone', 'exposure-hound'),
  },
  E1M6: {
    entry: enemies('returned-mail', 'exposure-hound', 'desk-warden', 'liability-mass'),
    transformation: enemies('ember-clerk', 'coverage-drone', 'liability-mass', 'exposure-hound'),
    climax: enemies('returned-mail', 'desk-warden', 'coverage-drone', 'liability-mass'),
  },
  E1M7: {
    entry: enemies('ember-clerk', 'exposure-hound', 'desk-warden', 'coverage-drone'),
    transformation: enemies('returned-mail', 'liability-mass', 'coverage-drone', 'desk-warden'),
    climax: enemies('ember-clerk', 'liability-mass', 'exposure-hound', 'coverage-drone'),
  },
  E1M8: {
    entry: enemies('returned-mail', 'ember-clerk', 'exposure-hound', 'liability-mass'),
    transformation: enemies('desk-warden', 'coverage-drone', 'liability-mass', 'ember-clerk'),
    climax: enemies('returned-mail', 'liability-mass', 'coverage-drone', 'exposure-hound'),
  },
  E1M9: {
    entry: enemies('returned-mail', 'exposure-hound', 'desk-warden', 'liability-mass'),
    transformation: enemies('ember-clerk', 'coverage-drone', 'liability-mass', 'exposure-hound'),
    climax: enemies('returned-mail', 'desk-warden', 'coverage-drone', 'liability-mass'),
  },
  E2M1: {
    entry: enemies('returned-mail', 'exposure-hound', 'coverage-drone', 'denial-officer'),
    transformation: enemies('desk-warden', 'ember-clerk', 'liability-mass', 'subrogator'),
    climax: enemies('returned-mail', 'coverage-drone', 'denial-officer', 'subrogator', 'liability-mass'),
  },
  E2M2: {
    entry: enemies('returned-mail', 'exposure-hound', 'denial-officer', 'subrogator'),
    transformation: enemies('desk-warden', 'coverage-drone', 'liability-mass', 'reserve-eater', 'denial-officer'),
    climax: enemies('ember-clerk', 'subrogator', 'reserve-eater', 'liability-mass', 'coverage-drone'),
  },
  E2M3: {
    entry: enemies('returned-mail', 'exposure-hound', 'denial-officer', 'subrogator', 'fraud-apparition'),
    transformation: enemies('desk-warden', 'coverage-drone', 'liability-mass', 'reserve-eater', 'denial-officer'),
    climax: enemies('ember-clerk', 'subrogator', 'reserve-eater', 'fraud-apparition', 'liability-mass', 'coverage-drone'),
  },
  E2M4: {
    entry: enemies('ember-clerk', 'exposure-hound', 'denial-officer', 'reserve-eater', 'fraud-apparition'),
    transformation: enemies('returned-mail', 'desk-warden', 'coverage-drone', 'subrogator', 'liability-mass'),
    climax: enemies('exposure-hound', 'denial-officer', 'subrogator', 'reserve-eater', 'fraud-apparition', 'coverage-drone'),
  },
  E2M5: {
    entry: enemies('returned-mail', 'coverage-drone', 'denial-officer', 'subrogator', 'reserve-eater'),
    transformation: enemies('desk-warden', 'ember-clerk', 'liability-mass', 'fraud-apparition', 'denial-officer'),
    climax: enemies('exposure-hound', 'coverage-drone', 'subrogator', 'reserve-eater', 'fraud-apparition', 'liability-mass'),
  },
  E2M6: {
    entry: enemies('returned-mail', 'exposure-hound', 'denial-officer', 'subrogator', 'fraud-apparition'),
    transformation: enemies('desk-warden', 'coverage-drone', 'liability-mass', 'reserve-eater', 'denial-officer'),
    climax: enemies('ember-clerk', 'subrogator', 'reserve-eater', 'fraud-apparition', 'liability-mass', 'coverage-drone'),
  },
  E2M7: {
    entry: enemies('ember-clerk', 'exposure-hound', 'denial-officer', 'reserve-eater', 'fraud-apparition'),
    transformation: enemies('returned-mail', 'desk-warden', 'coverage-drone', 'subrogator', 'liability-mass'),
    climax: enemies('exposure-hound', 'denial-officer', 'subrogator', 'reserve-eater', 'fraud-apparition', 'coverage-drone'),
  },
  E2M8: {
    entry: enemies('returned-mail', 'coverage-drone', 'denial-officer', 'subrogator', 'reserve-eater'),
    transformation: enemies('desk-warden', 'ember-clerk', 'liability-mass', 'fraud-apparition', 'denial-officer'),
    climax: enemies('exposure-hound', 'coverage-drone', 'subrogator', 'reserve-eater', 'fraud-apparition', 'liability-mass'),
  },
  E2M9: {
    entry: enemies('returned-mail', 'exposure-hound', 'denial-officer', 'subrogator', 'fraud-apparition'),
    transformation: enemies('desk-warden', 'coverage-drone', 'liability-mass', 'reserve-eater', 'denial-officer'),
    climax: enemies('ember-clerk', 'subrogator', 'reserve-eater', 'fraud-apparition', 'liability-mass', 'coverage-drone'),
  },
  E3M1: {
    entry: enemies('returned-mail', 'exposure-hound', 'fraud-apparition', 'subrogator', 'cat-model'),
    transformation: enemies('subrogator', 'liability-mass', 'reserve-eater', 'denial-officer', 'cat-model', 'coverage-drone'),
    climax: enemies('ember-clerk', 'coverage-drone', 'subrogator', 'reserve-eater', 'fraud-apparition', 'cat-model'),
  },
  E3M2: {
    entry: enemies('returned-mail', 'exposure-hound', 'fraud-apparition', 'bad-faith-counsel', 'cat-model'),
    transformation: enemies('subrogator', 'coverage-drone', 'liability-mass', 'reserve-eater', 'denial-officer', 'cat-model'),
    climax: enemies('ember-clerk', 'subrogator', 'reserve-eater', 'fraud-apparition', 'returned-mail', 'cat-model'),
  },
  E3M3: {
    entry: enemies('subrogator', 'exposure-hound', 'denial-officer', 'fraud-apparition', 'bad-faith-counsel', 'cat-model'),
    transformation: enemies('returned-mail', 'subrogator', 'coverage-drone', 'liability-mass', 'reserve-eater', 'cat-model'),
    climax: enemies('exposure-hound', 'subrogator', 'denial-officer', 'fraud-apparition', 'bad-faith-counsel', 'cat-model'),
  },
  E3M4: {
    entry: enemies('returned-mail', 'coverage-drone', 'subrogator', 'reserve-eater', 'bad-faith-counsel', 'cat-model'),
    transformation: enemies('subrogator', 'ember-clerk', 'liability-mass', 'denial-officer', 'fraud-apparition', 'cat-model'),
    climax: enemies('exposure-hound', 'coverage-drone', 'reserve-eater', 'subrogator', 'bad-faith-counsel', 'cat-model'),
  },
  E3M5: {
    entry: enemies('returned-mail', 'exposure-hound', 'fraud-apparition', 'bad-faith-counsel', 'cat-model'),
    transformation: enemies('subrogator', 'coverage-drone', 'liability-mass', 'reserve-eater', 'denial-officer', 'cat-model'),
    climax: enemies('ember-clerk', 'subrogator', 'reserve-eater', 'fraud-apparition', 'bad-faith-counsel', 'cat-model'),
  },
  E3M6: {
    entry: enemies('ember-clerk', 'exposure-hound', 'denial-officer', 'fraud-apparition', 'bad-faith-counsel', 'cat-model'),
    transformation: enemies('returned-mail', 'subrogator', 'coverage-drone', 'liability-mass', 'reserve-eater', 'cat-model'),
    climax: enemies('exposure-hound', 'subrogator', 'denial-officer', 'fraud-apparition', 'bad-faith-counsel', 'cat-model'),
  },
  E3M7: {
    entry: enemies('returned-mail', 'coverage-drone', 'subrogator', 'reserve-eater', 'bad-faith-counsel', 'cat-model'),
    transformation: enemies('subrogator', 'ember-clerk', 'liability-mass', 'denial-officer', 'fraud-apparition', 'cat-model'),
    climax: enemies('exposure-hound', 'coverage-drone', 'reserve-eater', 'subrogator', 'bad-faith-counsel', 'cat-model'),
  },
  E3M8: {
    entry: enemies('returned-mail', 'exposure-hound', 'fraud-apparition', 'bad-faith-counsel', 'cat-model'),
    transformation: enemies('subrogator', 'coverage-drone', 'liability-mass', 'reserve-eater', 'denial-officer', 'cat-model'),
    climax: enemies('ember-clerk', 'subrogator', 'reserve-eater', 'fraud-apparition', 'bad-faith-counsel', 'cat-model'),
  },
  E3M9: {
    entry: enemies('ember-clerk', 'exposure-hound', 'denial-officer', 'fraud-apparition', 'bad-faith-counsel', 'cat-model'),
    transformation: enemies('returned-mail', 'subrogator', 'coverage-drone', 'liability-mass', 'reserve-eater', 'cat-model'),
    climax: enemies('exposure-hound', 'subrogator', 'denial-officer', 'fraud-apparition', 'bad-faith-counsel', 'cat-model'),
  },
} as const satisfies Readonly<Record<MapId, CampaignPhaseEnemyPalettes>>;

const specs: readonly MapSpec[] = [
  {
    id: 'E1M1', title: 'First Notice', location: 'Branch office and parking deck', layout: 'loop',
    normalEnemies: 38, enemies: E1, weapons: ['twin-bore-riveter'], credentials: ['red'],
    transformation: 'open-door', nextMap: 'E1M2',
    signatureBeat: 'The red credential is visible through glass from the starting room, then opens the parking return loop.',
    secretClues: ['A misaligned reception baseboard', 'A red lamp flickering behind parking mesh'],
  },
  {
    id: 'E1M2', title: 'Intake', location: 'Call center and mail-routing floor', layout: 'lanes',
    normalEnemies: 52, enemies: E1_FAST, weapons: ['audit-repeater'], credentials: ['red'],
    transformation: 'move-walls', nextMap: 'E1M3',
    signatureBeat: 'Cubicle shutters drop and turn long sightlines into a reactive ambush maze.',
    secretClues: ['A ringing phone with no desk', 'An intake diagram matching the west lanes', 'A displaced ceiling tile'],
  },
  {
    id: 'E1M3', title: 'Total Loss', location: 'Vehicle inspection warehouse and flooded bays', layout: 'bays',
    normalEnemies: 62, enemies: E1_FULL, weapons: ['catastrophe-launcher'], credentials: ['yellow'],
    transformation: 'raise-floor', nextMap: 'E1M4', secretExitTo: 'E1M9',
    signatureBeat: 'Inspection lifts raise damaged cars into temporary cover and bridge the flooded bays.',
    secretClues: ['A vehicle silhouette behind frosted glass', 'A dry trail crossing the flooded floor', 'A crooked inspection placard'],
  },
  {
    id: 'E1M4', title: 'Mitigation', location: 'Water and fire restoration plant', layout: 'channels',
    normalEnemies: 72, enemies: E1_FULL, weapons: ['catastrophe-launcher'], credentials: ['red', 'yellow'],
    transformation: 'toggle-sectors', nextMap: 'E1M5',
    signatureBeat: 'Pump controls exchange safe walkways and hazardous restoration channels.',
    secretClues: ['A dry pipe that carries combat sound', 'A hazard stripe that breaks its pattern', 'A dark service alcove above the pumps'],
  },
  {
    id: 'E1M5', title: 'Records Retention', location: 'Archive stacks around a central lift', layout: 'hub',
    normalEnemies: 84, enemies: E1_FULL, weapons: ['plasma-copier'], credentials: ['red', 'cyan'],
    transformation: 'move-walls', nextMap: 'E1M6',
    signatureBeat: 'Rolling shelves expose crossfire lanes, shortcuts, and an early Plasma Copier.',
    secretClues: ['A shelf label missing its sequence number', 'A humming wall beside the lift', 'A map-shaped patch of carpet', 'A single backward archive box'],
  },
  {
    id: 'E1M6', title: 'Tower Annex', location: 'Corporate offices wrapping a tall atrium', layout: 'rings',
    normalEnemies: 92, enemies: E1_FULL, weapons: ['plasma-copier'], credentials: ['red', 'yellow', 'cyan'],
    transformation: 'raise-floor', nextMap: 'E1M7', recoverySupplies: [{ pickup: 'toner-pack', route: 'climax' }],
    signatureBeat: 'Credentials reopen familiar lower floors from newly reached balconies and lifts.',
    secretClues: ['An unreachable vest visible across the atrium', 'A conference phone ringing below', 'A red ceiling light reflected in glass', 'A narrow exterior maintenance ledge'],
  },
  {
    id: 'E1M7', title: 'The Underwriting Floor', location: 'Executive zone descending into machinery', layout: 'descent',
    normalEnemies: 108, enemies: E1_FULL, weapons: ['binding-engine'], credentials: ['red', 'yellow', 'cyan'],
    transformation: 'lower-floor', nextMap: 'E1M8', recoverySupplies: [{ pickup: 'toner-pack', route: 'entry' }],
    signatureBeat: 'A boardroom table splits apart and reveals the risk machinery below.',
    secretClues: ['A chair facing away from the boardroom', 'A policy diagram aligned to the floor', 'A voice behind a sealed deposition wall', 'An executive washroom with a false ceiling'],
  },
  {
    id: 'E1M8', title: 'Regional Authority', location: 'Fortress atrium and binding arena', layout: 'arena',
    normalEnemies: 90, enemies: E1_FULL, weapons: ['plasma-copier', 'binding-engine'], credentials: [],
    transformation: 'spawn-wave', nextMap: 'E2M1', bosses: ['regional-director'],
    recoverySupplies: [
      { pickup: 'toner-pack', route: 'boss-1' },
      { pickup: 'toner-cell', route: 'boss-1' }, { pickup: 'toner-cell', route: 'boss-1' },
    ],
    signatureBeat: 'Meeting-room shutters feed adds into the Regional Director canister barrage.',
    secretClues: ['A cracked authority seal beneath the entry stairs', 'A dark meeting room overlooking the arena', 'A maintenance hatch behind a canister rack'],
  },
  {
    id: 'E1M9', title: 'Unscheduled Inspection', location: 'Perfect model home and showroom', layout: 'showroom',
    normalEnemies: 86, enemies: E1_FULL, weapons: ['umbra-saw', 'plasma-copier'], credentials: ['red', 'yellow'],
    transformation: 'move-walls', nextMap: 'E1M4', secretMap: true,
    signatureBeat: 'Each immaculate room opens onto a more absurd covered peril.',
    secretClues: ['A family portrait with one blank face', 'A smoke alarm chirping in an empty room', 'A refrigerator containing only a credential', 'A showroom window facing another interior'],
  },
  {
    id: 'E2M1', title: 'Catastrophe Staging', location: 'Storm logistics yard and response hangar', layout: 'loop',
    normalEnemies: 52, enemies: E2_OPEN, weapons: ['catastrophe-launcher', 'twin-bore-riveter', 'audit-repeater'], credentials: ['yellow'],
    transformation: 'move-walls', nextMap: 'E2M2',
    signatureBeat: 'Lightning silhouettes long-range threats between shifting container lanes.',
    secretClues: ['A container with inward-facing locks', 'A warning beacon blinking out of sequence', 'A painted loading number visible only in lightning'],
  },
  {
    id: 'E2M2', title: 'Waterline', location: 'Flood-damaged hotel around a submerged lobby', layout: 'bays',
    normalEnemies: 58, enemies: E2_HEAVY, weapons: ['plasma-copier'], credentials: ['red', 'cyan'],
    transformation: 'drain-liquid', nextMap: 'E2M3',
    signatureBeat: 'Changing water levels reconnect guest-room loops and reveal the drowned lobby route.',
    secretClues: ['A room-service bell ringing underwater', 'A dry carpet seam above the waterline', 'A guest-room number repeated twice', 'A luggage cart blocking a narrow stair'],
  },
  {
    id: 'E2M3', title: 'Server Farm', location: 'Claims data center and redundant power halls', layout: 'lanes',
    normalEnemies: 65, enemies: E2_FULL, weapons: ['plasma-copier'], credentials: ['cyan', 'yellow'],
    transformation: 'blackout', nextMap: 'E2M4',
    signatureBeat: 'Power routing wakes one enemy-filled wing while blacking out the other.',
    secretClues: ['A cyan status light on a dead rack', 'A cable run disappearing through the floor', 'A fan noise behind an unvented wall', 'A mirrored server label'],
  },
  {
    id: 'E2M4', title: 'Claims Express', location: 'Armored records train and switching depot', layout: 'descent',
    normalEnemies: 90, enemies: E2_FULL, weapons: ['twin-bore-riveter', 'umbra-saw'], credentials: ['red', 'yellow'],
    transformation: 'move-walls', nextMap: 'E2M5', recoverySupplies: [{ pickup: 'fasteners-large', route: 'climax' }],
    signatureBeat: 'Train cars shift between platforms and create new cross-car routes during combat.',
    secretClues: ['A timetable with an impossible platform', 'A silent carriage with warm lights', 'A switch lever pointing between labels', 'A maintenance crawlspace beneath the consist'],
  },
  {
    id: 'E2M5', title: 'Salvage Rights', location: 'Vehicle and equipment salvage district', layout: 'showroom',
    normalEnemies: 100, enemies: E2_FULL, weapons: ['catastrophe-launcher'], credentials: ['red', 'yellow', 'cyan'],
    transformation: 'move-walls', nextMap: 'E2M6', secretExitTo: 'E2M9',
    signatureBeat: 'Crushers reshape sightlines and reveal buried routes through the salvage blocks.',
    secretClues: ['A pristine door on a flattened vehicle', 'A crusher control with a second detent', 'A salvage tag matching the automap outline', 'An engine still ticking in a silent yard'],
  },
  {
    id: 'E2M6', title: 'Pump Station', location: 'Municipal flood-control plant', layout: 'channels',
    normalEnemies: 110, enemies: E2_FULL, weapons: ['binding-engine'], credentials: ['red', 'yellow', 'cyan'],
    transformation: 'toggle-sectors', nextMap: 'E2M7', recoverySupplies: [{ pickup: 'toner-cell', route: 'climax' }],
    signatureBeat: 'Three pumps redirect liquid, enemy access, and the player return route.',
    secretClues: ['A pressure gauge with a fourth mark', 'A ladder shadow with no ladder', 'A dry culvert carrying enemy sound', 'A red valve among yellow controls', 'A flood map with one raised contour'],
  },
  {
    id: 'E2M7', title: 'Discovery', location: 'Litigation tower and evidence repository', layout: 'rings',
    normalEnemies: 128, enemies: E2_FULL, weapons: ['binding-engine'], credentials: ['red', 'cyan'],
    transformation: 'teleport', nextMap: 'E2M8', recoverySupplies: [
      { pickup: 'toner-pack', route: 'transformation' }, { pickup: 'canister', route: 'climax' },
      { pickup: 'toner-cell', route: 'climax' }, { pickup: 'canister', route: 'climax' },
      { pickup: 'canister', route: 'climax' }, { pickup: 'fasteners-small', route: 'climax' },
    ],
    signatureBeat: 'Deposition rooms teleport between contradictory versions of the same floor.',
    secretClues: ['Two clocks disagree by exactly one minute', 'A deposition lamp casting two shadows', 'An evidence seal applied backward', 'A window showing the room from outside', 'A court reporter key heard through stone'],
  },
  {
    id: 'E2M8', title: 'The Aggregate', location: 'Flooded data hall and joined-loss arena', layout: 'arena',
    normalEnemies: 130, enemies: E2_FULL, weapons: ['plasma-copier', 'binding-engine'], credentials: [],
    transformation: 'lower-floor', nextMap: 'E3M1', bosses: ['aggregate'],
    recoverySupplies: [{ pickup: 'toner-pack', route: 'boss-1' }, { pickup: 'toner-cell', route: 'boss-1' }],
    signatureBeat: 'Cover islands sink while the Aggregate alternates independent attack emitters.',
    secretClues: ['A submerged console still accepting input', 'A narrow dry ledge behind an emitter', 'A reflected doorway absent from the wall'],
  },
  {
    id: 'E2M9', title: 'Tabletop Exercise', location: 'Cheerful catastrophe training simulation', layout: 'hub',
    normalEnemies: 108, enemies: E2_FULL, weapons: ['binding-engine', 'umbra-saw'], credentials: ['red', 'cyan'],
    transformation: 'move-walls', nextMap: 'E2M6', secretMap: true,
    recoverySupplies: [{ pickup: 'toner-cell', route: 'climax' }],
    signatureBeat: 'Bright modular scenery collapses and exposes the observers and machinery behind it.',
    secretClues: ['A cardboard cloud hanging too low', 'A smiling cutout facing the wall', 'A training prompt whose buttons all work', 'A painted evacuation door with a real handle'],
  },
  {
    id: 'E3M1', title: 'Earned Premium', location: 'Brass premium foundry at the underworld edge', layout: 'loop',
    normalEnemies: 52, enemies: E3_OPEN, weapons: ['plasma-copier', 'twin-bore-riveter', 'catastrophe-launcher'], credentials: ['yellow'],
    transformation: 'open-door', nextMap: 'E3M2',
    signatureBeat: 'Currency channels power the foundry doors and release Reserve Eaters in return.',
    secretClues: ['A coin channel flowing uphill', 'A silent calculator wheel', 'A brass tile colder than the surrounding floor'],
  },
  {
    id: 'E3M2', title: 'Mortality Table', location: 'Sliding calculation-table labyrinth', layout: 'lanes',
    normalEnemies: 58, enemies: E3_FULL, weapons: ['umbra-saw', 'plasma-copier'], credentials: ['red', 'cyan'],
    transformation: 'move-walls', nextMap: 'E3M3',
    signatureBeat: 'Row and column switches realign combat lanes around fixed brass landmarks.',
    secretClues: ['A column total that does not balance', 'A movable row with no switch', 'A zero embossed beneath a stair', 'A probability grid with one red square'],
  },
  {
    id: 'E3M3', title: 'Treaty Vault', location: 'Layered reinsurance vaults and transfer machinery', layout: 'hub',
    normalEnemies: 65, enemies: E3_FULL, weapons: ['binding-engine'], credentials: ['red', 'yellow', 'cyan'],
    transformation: 'teleport', nextMap: 'E3M4',
    signatureBeat: 'Opening one vault transfers its monsters and resources into another layer.',
    secretClues: ['A vault dial with an ultraviolet number', 'A transfer tube carrying an item silhouette', 'A contract stack arranged as a stair', 'A locked room visible in two layers'],
  },
  {
    id: 'E3M4', title: 'Probability Chapel', location: 'Ritual calculation chamber over a white void', layout: 'rings',
    normalEnemies: 100, enemies: E3_FULL, weapons: ['binding-engine'], credentials: ['cyan', 'yellow'],
    transformation: 'toggle-sectors', nextMap: 'E3M5',
    signatureBeat: 'Prediction zones mark future impacts across rotating floor sectors.',
    secretClues: ['A prediction circle that never activates', 'A chant audible only beside the void', 'A brass lectern facing away from the altar', 'A white tile casting a black reflection', 'A broken probability sequence'],
  },
  {
    id: 'E3M5', title: 'Reserve Pits', location: 'Deep storage wells filled with wax and toner', layout: 'descent',
    normalEnemies: 90, enemies: E3_FULL, weapons: ['binding-engine'], credentials: ['red', 'yellow'],
    transformation: 'lower-floor', nextMap: 'E3M6',
    signatureBeat: 'Lifts descend past optional ledges while enemies fire across the central shaft.',
    secretClues: ['A lift call light below the lowest floor', 'A wax spill shaped like a credential', 'A ledge visible only during descent', 'A chain moving without a counterweight', 'A toner ripple against the current'],
  },
  {
    id: 'E3M6', title: 'Redaction Court', location: 'Abstract courtrooms and sealed evidence halls', layout: 'showroom',
    normalEnemies: 110, enemies: E3_FULL, weapons: ['binding-engine'], credentials: ['red', 'cyan'],
    transformation: 'move-walls', nextMap: 'E3M7', secretExitTo: 'E3M9',
    signatureBeat: 'Black redaction walls erase and restore routes in a readable courtroom sequence.',
    secretClues: ['An objection light beneath the defense table', 'A redaction bar with a visible hinge', 'A witness microphone carrying distant combat', 'A sealed exhibit casting no shadow', 'A verdict form matching the map shape'],
  },
  {
    id: 'E3M7', title: 'Infinite Ledger', location: 'Compressed-paper machine feeding the final model', layout: 'channels',
    normalEnemies: 154, enemies: E3_FULL, weapons: ['binding-engine', 'umbra-saw'], credentials: ['red', 'yellow', 'cyan'],
    transformation: 'toggle-sectors', nextMap: 'E3M8', recoverySupplies: [{ pickup: 'toner-pack', route: 'climax' }],
    signatureBeat: 'Distorted versions of earlier landmarks return as connected combat modules.',
    secretClues: ['A reception bell fused into black stone', 'A drowned hotel door above a dry pit', 'A model-home window overlooking the machine', 'A train switch embedded in an archive shelf', 'A brass page numbered zero', 'A familiar red lamp at impossible height'],
  },
  {
    id: 'E3M8', title: 'The Uninsurable', location: 'Chief Actuary arena and reserve-core engine', layout: 'arena',
    normalEnemies: 112, enemies: E3_FULL, weapons: ['plasma-copier', 'catastrophe-launcher', 'binding-engine'], credentials: [],
    transformation: 'open-door', bosses: ['chief-actuary', 'uninsurable'],
    recoverySupplies: [
      { pickup: 'toner-pack', route: 'boss-1' }, { pickup: 'toner-pack', route: 'boss-1' },
      { pickup: 'toner-pack', route: 'boss-2' },
      { pickup: 'canister-crate', route: 'boss-2' },
    ],
    signatureBeat: 'Defeat the mobile gatekeeper, open three binding gates, then fire into the exposed reserve core.',
    secretClues: ['A prediction terminal showing a safe sector', 'A binding gate with a fourth maintenance latch', 'A void ledge behind the reserve feed', 'A silent wave alcove beneath the arena'],
  },
  {
    id: 'E3M9', title: 'Orientation Day', location: 'Cheerful onboarding-video soundstage', layout: 'bays',
    normalEnemies: 110, enemies: E3_FULL, weapons: ['binding-engine', 'umbra-saw'], credentials: ['red', 'yellow', 'cyan'],
    transformation: 'move-walls', nextMap: 'E3M7', secretMap: true,
    signatureBeat: 'Painted smiles and perfect offices peel away to reveal a hostile soundstage.',
    secretClues: ['An applause sign that responds to gunfire', 'A camera filming an empty mark', 'A painted window with depth behind it', 'A teleprompter displaying a switch sequence', 'A break-room clock running backward'],
  },
] as const;

interface AuthoredEncounterPhase {
  readonly normalBudget: number;
  readonly mandatoryRoles: readonly EnemyEncounterRole[];
  readonly optionalPattern: readonly EnemyEncounterRole[];
  readonly reward: boolean;
}

export interface CampaignEncounterProfile {
  readonly beat: 'opening' | 'build' | 'relief' | 'boss' | 'secret';
  readonly intent: string;
  readonly phases: Readonly<Record<'entry' | 'transformation' | 'climax', AuthoredEncounterPhase>>;
}

const MANDATORY = {
  entry2: ['pressure', 'shape'],
  entry3: ['pressure', 'shape', 'anchor'],
  entry4: ['pressure', 'shape', 'pressure', 'anchor'],
  contest2: ['anchor', 'pressure'],
  contest3: ['anchor', 'pressure', 'shape'],
  contest4: ['anchor', 'pressure', 'shape', 'pressure'],
  climax3: ['shape', 'pressure', 'anchor'],
  climax4: ['shape', 'pressure', 'anchor', 'pressure'],
  climax5: ['shape', 'pressure', 'punish', 'pressure', 'shape'],
} as const satisfies Readonly<Record<string, readonly EnemyEncounterRole[]>>;

const ROLE_PATTERN = {
  rush: ['pressure', 'pressure', 'shape'],
  crossfire: ['shape', 'pressure', 'punish', 'pressure'],
  siege: ['anchor', 'shape', 'pressure', 'shape'],
  ambush: ['punish', 'pressure', 'pressure', 'shape'],
  attrition: ['anchor', 'pressure', 'shape', 'punish'],
  mobile: ['pressure', 'shape', 'pressure', 'punish', 'shape'],
} as const satisfies Readonly<Record<string, readonly EnemyEncounterRole[]>>;

const phase = (
  normalBudget: number,
  mandatoryRoles: readonly EnemyEncounterRole[],
  optionalPattern: readonly EnemyEncounterRole[],
  reward = false,
): AuthoredEncounterPhase => {
  const allowedRoles = new Set<EnemyEncounterRole>(mandatoryRoles);
  optionalPattern.forEach((role) => { if (allowedRoles.size < 3) allowedRoles.add(role); });
  const focusedPattern = optionalPattern.filter((role) => allowedRoles.has(role));
  return { normalBudget, mandatoryRoles, optionalPattern: focusedPattern, reward };
};

// Main-route pressure builds inside each episode. E2M1 and E3M1 deliberately
// reset the tempo after a boss, E3M5 is the sole mid-episode traversal valley,
// and the lower add budgets on M8 reserve headroom for their authored bosses.
export const CAMPAIGN_ENCOUNTER_PROFILES = {
  E1M1: { beat: 'opening', intent: 'Teach short-range pressure before introducing a compact crossfire.', phases: {
    entry: phase(5, MANDATORY.entry2, ROLE_PATTERN.rush), transformation: phase(6, MANDATORY.contest2, ROLE_PATTERN.mobile, true), climax: phase(7, MANDATORY.climax3, ROLE_PATTERN.crossfire),
  } },
  E1M2: { beat: 'build', intent: 'Add lane-shaping fire around the shutter transformation.', phases: {
    entry: phase(7, MANDATORY.entry2, ROLE_PATTERN.mobile), transformation: phase(8, MANDATORY.contest2, ROLE_PATTERN.ambush, true), climax: phase(9, MANDATORY.climax3, ROLE_PATTERN.crossfire),
  } },
  E1M3: { beat: 'build', intent: 'Introduce a durable anchor while the raised bays change firing lanes.', phases: {
    entry: phase(8, MANDATORY.entry3, ROLE_PATTERN.rush), transformation: phase(9, MANDATORY.contest3, ROLE_PATTERN.siege, true), climax: phase(11, MANDATORY.climax3, ROLE_PATTERN.attrition),
  } },
  E1M4: { beat: 'build', intent: 'Alternate mobile channel pressure with anchored pump defense.', phases: {
    entry: phase(9, MANDATORY.entry3, ROLE_PATTERN.mobile), transformation: phase(11, MANDATORY.contest3, ROLE_PATTERN.siege, true), climax: phase(12, MANDATORY.climax4, ROLE_PATTERN.crossfire),
  } },
  E1M5: { beat: 'build', intent: 'Use moving shelves to trade ambushes for longer attrition fights.', phases: {
    entry: phase(10, MANDATORY.entry3, ROLE_PATTERN.rush), transformation: phase(12, MANDATORY.contest3, ROLE_PATTERN.mobile, true), climax: phase(15, MANDATORY.climax4, ROLE_PATTERN.crossfire),
  } },
  E1M6: { beat: 'build', intent: 'Escalate balcony crossfire without front-loading the route.', phases: {
    entry: phase(12, MANDATORY.entry3, ROLE_PATTERN.attrition), transformation: phase(14, MANDATORY.contest3, ROLE_PATTERN.attrition, true), climax: phase(16, MANDATORY.climax4, ROLE_PATTERN.attrition),
  } },
  E1M7: { beat: 'build', intent: 'Sustain the episode high point through mixed machinery-floor roles.', phases: {
    entry: phase(14, MANDATORY.entry4, ROLE_PATTERN.mobile), transformation: phase(17, MANDATORY.contest3, ROLE_PATTERN.attrition, true), climax: phase(21, MANDATORY.climax5, ROLE_PATTERN.siege),
  } },
  E1M8: { beat: 'boss', intent: 'Reduce add density so the Regional Director remains the episode peak.', phases: {
    entry: phase(11, MANDATORY.entry4, ROLE_PATTERN.crossfire), transformation: phase(13, MANDATORY.contest4, ROLE_PATTERN.ambush, true), climax: phase(18, MANDATORY.climax5, ROLE_PATTERN.mobile, true),
  } },
  E1M9: { beat: 'secret', intent: 'Offer a dense optional remix without changing main-route cadence.', phases: {
    entry: phase(11, MANDATORY.entry4, ROLE_PATTERN.ambush), transformation: phase(13, MANDATORY.contest3, ROLE_PATTERN.mobile, true), climax: phase(16, MANDATORY.climax5, ROLE_PATTERN.attrition),
  } },
  E2M1: { beat: 'relief', intent: 'Reset after the first boss while previewing the new ranged roster.', phases: {
    entry: phase(7, MANDATORY.entry2, ROLE_PATTERN.mobile, true), transformation: phase(8, MANDATORY.contest2, ROLE_PATTERN.crossfire), climax: phase(9, MANDATORY.climax3, ROLE_PATTERN.siege),
  } },
  E2M2: { beat: 'build', intent: 'Let the waterline separate rush pressure from durable anchors.', phases: {
    entry: phase(8, MANDATORY.entry2, ROLE_PATTERN.rush), transformation: phase(9, MANDATORY.contest2, ROLE_PATTERN.mobile, true), climax: phase(10, MANDATORY.climax3, ROLE_PATTERN.attrition),
  } },
  E2M3: { beat: 'build', intent: 'Pair blackout ambushes with deliberate long-lane shaping.', phases: {
    entry: phase(8, MANDATORY.entry3, ROLE_PATTERN.crossfire), transformation: phase(9, MANDATORY.contest3, ROLE_PATTERN.ambush, true), climax: phase(11, MANDATORY.climax3, ROLE_PATTERN.siege),
  } },
  E2M4: { beat: 'build', intent: 'Increase mobile pressure as train cars repeatedly redraw cover.', phases: {
    entry: phase(10, MANDATORY.entry3, ROLE_PATTERN.mobile), transformation: phase(11, MANDATORY.contest3, ROLE_PATTERN.rush, true), climax: phase(13, MANDATORY.climax4, ROLE_PATTERN.crossfire),
  } },
  E2M5: { beat: 'build', intent: 'Layer punishing salvage ambushes behind crusher sightline changes.', phases: {
    entry: phase(11, MANDATORY.entry3, ROLE_PATTERN.ambush), transformation: phase(13, MANDATORY.contest3, ROLE_PATTERN.attrition, true), climax: phase(14, MANDATORY.climax4, ROLE_PATTERN.siege),
  } },
  E2M6: { beat: 'build', intent: 'Hold the pump network with mixed anchors and flanking pressure.', phases: {
    entry: phase(12, MANDATORY.entry3, ROLE_PATTERN.mobile), transformation: phase(14, MANDATORY.contest3, ROLE_PATTERN.siege, true), climax: phase(16, MANDATORY.climax4, ROLE_PATTERN.attrition),
  } },
  E2M7: { beat: 'build', intent: 'Reach the episode add-density peak through teleporting crossfires.', phases: {
    entry: phase(16, MANDATORY.entry4, ROLE_PATTERN.crossfire), transformation: phase(19, MANDATORY.contest4, ROLE_PATTERN.ambush, true), climax: phase(23, MANDATORY.climax5, ROLE_PATTERN.attrition),
  } },
  E2M8: { beat: 'boss', intent: 'Trade add volume for space to read the Aggregate emitters.', phases: {
    entry: phase(12, MANDATORY.entry4, ROLE_PATTERN.mobile), transformation: phase(14, MANDATORY.contest3, ROLE_PATTERN.siege, true), climax: phase(20, MANDATORY.climax5, ROLE_PATTERN.crossfire, true),
  } },
  E2M9: { beat: 'secret', intent: 'Compress the episode roster into an optional scenery-collapse remix.', phases: {
    entry: phase(12, MANDATORY.entry4, ROLE_PATTERN.rush), transformation: phase(14, MANDATORY.contest3, ROLE_PATTERN.ambush, true), climax: phase(15, MANDATORY.climax5, ROLE_PATTERN.attrition),
  } },
  E3M1: { beat: 'relief', intent: 'Reset after the Aggregate while exposing the late-game roster in layers.', phases: {
    entry: phase(8, MANDATORY.entry2, ROLE_PATTERN.rush, true), transformation: phase(9, MANDATORY.contest2, ROLE_PATTERN.siege), climax: phase(11, MANDATORY.climax3, ROLE_PATTERN.crossfire),
  } },
  E3M2: { beat: 'build', intent: 'Use the matrix to alternate shaped lanes and close punishers.', phases: {
    entry: phase(8, MANDATORY.entry2, ROLE_PATTERN.mobile), transformation: phase(9, MANDATORY.contest2, ROLE_PATTERN.crossfire, true), climax: phase(11, MANDATORY.climax3, ROLE_PATTERN.ambush),
  } },
  E3M3: { beat: 'build', intent: 'Make vault transfers readable by limiting required anchors.', phases: {
    entry: phase(8, MANDATORY.entry3, ROLE_PATTERN.siege), transformation: phase(9, MANDATORY.contest4, ROLE_PATTERN.mobile, true), climax: phase(11, MANDATORY.climax3, ROLE_PATTERN.attrition),
  } },
  E3M4: { beat: 'build', intent: 'Escalate predictive-floor pressure with distant shaping fire.', phases: {
    entry: phase(11, MANDATORY.entry3, ROLE_PATTERN.crossfire), transformation: phase(13, MANDATORY.contest3, ROLE_PATTERN.siege, true), climax: phase(16, MANDATORY.climax5, ROLE_PATTERN.attrition),
  } },
  E3M5: { beat: 'relief', intent: 'Create a traversal-led breathing valley before the final ascent.', phases: {
    entry: phase(12, MANDATORY.entry3, ROLE_PATTERN.rush, true), transformation: phase(14, MANDATORY.contest3, ROLE_PATTERN.rush), climax: phase(16, MANDATORY.climax5, ROLE_PATTERN.mobile),
  } },
  E3M6: { beat: 'build', intent: 'Restore full pressure as redaction walls sequence layered ambushes.', phases: {
    entry: phase(12, MANDATORY.entry3, ROLE_PATTERN.ambush), transformation: phase(14, MANDATORY.contest3, ROLE_PATTERN.attrition, true), climax: phase(16, MANDATORY.climax5, ROLE_PATTERN.siege),
  } },
  E3M7: { beat: 'build', intent: 'Deliver the campaign add-density peak across returning landmarks.', phases: {
    entry: phase(18, MANDATORY.entry4, ROLE_PATTERN.mobile), transformation: phase(21, MANDATORY.contest3, ROLE_PATTERN.crossfire, true), climax: phase(25, MANDATORY.climax5, ROLE_PATTERN.attrition),
  } },
  E3M8: { beat: 'boss', intent: 'Reserve the final arena budget for two sequential authorities.', phases: {
    entry: phase(12, MANDATORY.entry4, ROLE_PATTERN.crossfire), transformation: phase(14, MANDATORY.contest3, ROLE_PATTERN.siege, true), climax: phase(20, MANDATORY.climax5, ROLE_PATTERN.mobile, true),
  } },
  E3M9: { beat: 'secret', intent: 'Run an optional high-pressure remix of the full hostile roster.', phases: {
    entry: phase(12, MANDATORY.entry4, ROLE_PATTERN.ambush), transformation: phase(14, MANDATORY.contest3, ROLE_PATTERN.mobile, true), climax: phase(16, MANDATORY.climax5, ROLE_PATTERN.attrition),
  } },
} as const satisfies Readonly<Record<MapId, CampaignEncounterProfile>>;

const episodeFor = (id: MapId): { id: EpisodeId; number: 1 | 2 | 3 } => {
  const number = Number(id[1]) as 1 | 2 | 3;
  return {
    number,
    id: number === 1 ? 'first-notice' : number === 2 ? 'exclusions-apply' : 'adverse-development',
  };
};

const hash = (value: string): number => {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};

const pointsFor = (grid: readonly string[], chars = '.,awvDRYC'): GridPoint[] => {
  const points: GridPoint[] = [];
  grid.forEach((row, z) => [...row].forEach((cell, x) => {
    if (chars.includes(cell)) points.push({ x: x + 0.5, z: z + 0.5 });
  }));
  return points;
};

const landmarkBudget = (spec: MapSpec): number => {
  const index = Number(spec.id[3]);
  return index <= 3 ? 2 : index <= 6 || index === 9 ? 3 : index === 7 ? 4 : 5;
};

const mechanismPhaseCount = (spec: MapSpec): number => {
  if (spec.id === 'E2M6') return 3;
  if (spec.id === 'E3M2') return 2;
  const index = Number(spec.id[3]);
  return index <= 3 ? 1 : index <= 6 || index === 9 ? 2 : 3;
};

const makeLandmarks = (spec: MapSpec, grid: readonly string[]): readonly LandmarkDefinition[] => {
  const props = LANDMARK_PROPS[spec.id];
  const mechanism = `${spec.id.toLowerCase()}-mechanism`;
  const candidates = pointsFor(grid, 'a,vw.').sort((a, b) =>
    hash(`${spec.id}:landmark:${a.x}:${a.z}`) - hash(`${spec.id}:landmark:${b.x}:${b.z}`));
  const selected: GridPoint[] = [];
  for (const point of candidates) {
    if (selected.every((other) => distance(point, other) >= 3)) selected.push(point);
    if (selected.length === landmarkBudget(spec)) break;
  }
  while (selected.length < landmarkBudget(spec)) selected.push(candidates[selected.length % candidates.length]);
  return selected.map((point, index) => ({
    ...point,
    id: `${spec.id.toLowerCase()}-landmark-${index + 1}`,
    prop: props[index % props.length],
    tag: `${mechanism}-${index % mechanismPhaseCount(spec) + 1}:landmark-${index + 1}`,
    mechanism: `${mechanism}-${index % mechanismPhaseCount(spec) + 1}`,
    scale: 1.35 + (index % 3) * .18,
  }));
};

const makeBreakables = (
  spec: MapSpec,
  grid: readonly string[],
  episode: 1 | 2 | 3,
  landmarks: readonly LandmarkDefinition[],
): readonly BreakableDefinition[] => {
  const props = episode === 1
    ? ['filing-cabinet', 'archive-crate-pallet', 'breakroom-microwave']
    : episode === 2
      ? ['archive-crate-pallet', 'repair-cart', 'data-rack-sealed', 'salvage-baler']
      : ['evidence-locker', 'paper-boulder', 'floating-drawer-cluster', 'desk-lamp-paper-stack'];
  const candidates = pointsFor(grid, '.,').filter((point) =>
    landmarks.every((landmark) => distance(point, landmark) >= 2));
  const count = 2 + episode;
  return Array.from({ length: count }, (_, index) => {
    const point = candidates[(hash(`${spec.id}:breakable:${index}`) + index * 17) % candidates.length];
    return {
      ...point,
      id: `${spec.id.toLowerCase()}-breakable-${index + 1}`,
      prop: props[index % props.length],
      health: 30 + episode * 15 + index * 5,
      blocksMovement: index % 2 === 0,
      reward: index === count - 1 ? supplyFor(episode)[episode] : undefined,
    };
  });
};

const makeMechanisms = (spec: MapSpec, grid: readonly string[], landmarks: readonly LandmarkDefinition[]): readonly MapMechanism[] => {
  const sectorTags: Record<TriggerAction, readonly string[]> = {
    'open-door': ['D'], 'open-exit': ['D'], 'toggle-sectors': ['a', 'v', 'w'], 'lower-floor': ['a'],
    'raise-floor': ['v', 'w'], 'drain-liquid': ['w', 'h'], 'flood-liquid': ['w', 'h'],
    'move-walls': ['v'], blackout: ['.', ','], teleport: ['a'], 'spawn-wave': ['D'],
    'reveal-secret': ['s'], 'complete-map': [],
  };
  const motion = spec.transformation === 'raise-floor' ? 'lift'
    : spec.transformation === 'lower-floor' ? 'sink'
      : spec.transformation === 'drain-liquid' ? 'drain'
        : spec.transformation === 'blackout' ? 'blackout'
          : spec.transformation === 'spawn-wave' ? 'shutters'
            : spec.transformation === 'toggle-sectors' ? 'swap'
              : Number(spec.id[3]) % 2 === 0 ? 'slide-z' : 'slide-x';
  const phaseCount = mechanismPhaseCount(spec);
  const desiredChars = sectorTags[spec.transformation];
  const sectorKeys: string[] = [];
  const hazardKeys: string[] = [];
  const doorKeys: string[] = [];
  grid.forEach((row, z) => [...row].forEach((char, x) => {
    if (desiredChars.includes(char)) sectorKeys.push(`${x},${z}`);
    if (['h', 'w'].includes(char)) hazardKeys.push(`${x},${z}`);
    if ((spec.transformation === 'open-door' || spec.transformation === 'spawn-wave') && char === 'D') doorKeys.push(`${x},${z}`);
  }));
  const specialLabels: Partial<Record<MapId, readonly string[]>> = {
    E2M6: ['West flood pump', 'Sump transfer pump', 'Return-route pump'],
    E3M2: ['Calculator row alignment', 'Calculator column alignment'],
    E3M8: ['First binding gate', 'Second binding gate', 'Third binding gate'],
  };
  return Array.from({ length: phaseCount }, (_, index) => {
    const id = `${spec.id.toLowerCase()}-mechanism-${index + 1}`;
    return {
      id,
      label: specialLabels[spec.id]?.[index] ?? `${MECHANISM_LABELS[spec.id]} ${index + 1}`,
      action: spec.transformation,
      sectorTags: sectorKeys.filter((_key, targetIndex) => targetIndex % phaseCount === index),
      hazardTags: spec.id === 'E2M6'
        ? hazardKeys.filter((_key, targetIndex) => targetIndex % phaseCount === index)
        : [],
      landmarkTags: landmarks.filter((landmark) => landmark.mechanism === id).map((landmark) => landmark.tag),
      doorTags: doorKeys.filter((_key, targetIndex) => targetIndex % phaseCount === index),
      motion: spec.id === 'E3M2' ? (index === 0 ? 'slide-x' : 'slide-z') : motion,
      travel: .65 + Number(spec.id[3]) * .11 + index * .18,
      persistState: true,
      restoresRoute: true,
      activationOrder: index + 1,
      independent: spec.id === 'E2M6' || spec.id === 'E3M8',
      requires: spec.id === 'E2M6' || spec.id === 'E3M8' || index === 0 ? [] : [`${spec.id.toLowerCase()}-mechanism-${index}`],
      opens: index === phaseCount - 1 ? ['climax'] : [`${spec.id.toLowerCase()}-mechanism-${index + 2}`],
    };
  });
};

const distance = (a: GridPoint, b: GridPoint): number => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

const baseRoutePoints = (grid: readonly string[], blocked = 's'): readonly GridPoint[] => {
  const start = pointsFor(grid, '.,a')[0];
  const pending: GridPoint[] = [{ x: Math.floor(start.x), z: Math.floor(start.z) }];
  const visited = new Set<string>([`${pending[0].x},${pending[0].z}`]);
  while (pending.length) {
    const current = pending.shift()!;
    [{ x: current.x + 1, z: current.z }, { x: current.x - 1, z: current.z }, { x: current.x, z: current.z + 1 }, { x: current.x, z: current.z - 1 }]
      .forEach((next) => {
        const cell = grid[next.z]?.[next.x];
        const key = `${next.x},${next.z}`;
        if (visited.has(key) || cell === undefined || cell === '#' || blocked.includes(cell)) return;
        visited.add(key);
        pending.push(next);
      });
  }
  return [...visited].map((key) => {
    const [x, z] = key.split(',').map(Number);
    return { x: x + .5, z: z + .5 };
  });
};

export interface CampaignRouteParInputs {
  readonly routeCells: number;
  readonly normalEnemies: number;
  readonly mechanisms: number;
  readonly credentials: number;
  readonly bossPhases: number;
}

export const standardRouteCellCount = (grid: readonly string[]): number => baseRoutePoints(grid).length;

// Experienced-route model: navigation/line reading, average normal-placement
// combat, mechanism operation, credential backtracking, and boss phases. Pars
// are rounded to classic 15-second intermission increments without a floor.
export const campaignRouteParSeconds = (inputs: CampaignRouteParInputs): number => Math.round((
  60
  + inputs.routeCells * 1.35
  + inputs.normalEnemies * 4
  + inputs.mechanisms * 45
  + inputs.credentials * 30
  + inputs.bossPhases * 180
) / 15) * 15;

const DOOR_CELLS = 'DRYC';
const actorRoutePoints = (grid: readonly string[], blocked = 's'): readonly GridPoint[] =>
  baseRoutePoints(grid, blocked).filter((point) =>
    !DOOR_CELLS.includes(grid[Math.floor(point.z)]?.[Math.floor(point.x)] ?? ''));

const chooseStartExit = (spec: MapSpec, grid: readonly string[]): { start: GridPoint & { facing: Facing }; exit: GridPoint } => {
  const route = actorRoutePoints(grid);
  const plainRoute = route.filter((point) => grid[Math.floor(point.z)]?.[Math.floor(point.x)] === '.');
  const initialRoute = actorRoutePoints(grid, 'sRYC');
  const initialPlainRoute = initialRoute.filter((point) => grid[Math.floor(point.z)]?.[Math.floor(point.x)] === '.');
  const secretCells = pointsFor(grid, 's');
  const clearRoute = initialPlainRoute.filter((point) => secretCells.every((secret) => distance(point, secret) >= 2));
  const safeStartRoute = clearRoute.length > 0 ? clearRoute : initialPlainRoute.length > 0 ? initialPlainRoute : initialRoute;
  const edgeDepth = (point: GridPoint): number => Math.min(
    point.x - .5,
    grid[0].length - .5 - point.x,
    point.z - .5,
    grid.length - .5 - point.z,
  );
  const shallowest = Math.min(...safeStartRoute.map(edgeDepth));
  const edgeRoute = safeStartRoute.filter((point) => edgeDepth(point) <= shallowest + 1);
  const start = spec.id === 'E1M1'
    ? route[0]
    : edgeRoute[hash(`${spec.id}:player-start`) % edgeRoute.length];
  const safeExitRoute = plainRoute.length > 0 ? plainRoute : route;
  const exit = safeExitRoute.reduce((best, point) => distance(start, point) > distance(start, best) ? point : best, safeExitRoute[0]);
  const routeKeys = new Set(route.map((point) => `${Math.floor(point.x)},${Math.floor(point.z)}`));
  const facingSteps: ReadonlyArray<{ facing: Facing; x: number; z: number }> = [
    { facing: 'north', x: 0, z: -1 },
    { facing: 'east', x: 1, z: 0 },
    { facing: 'south', x: 0, z: 1 },
    { facing: 'west', x: -1, z: 0 },
  ];
  const traversableFacings = facingSteps
    .filter((step) => routeKeys.has(`${Math.floor(start.x + step.x)},${Math.floor(start.z + step.z)}`));
  const facing = traversableFacings.reduce((best, step) =>
    distance({ x: start.x + step.x, z: start.z + step.z }, exit)
      < distance({ x: start.x + best.x, z: start.z + best.z }, exit) ? step : best,
    traversableFacings[0] ?? facingSteps[0]).facing;
  return { start: { ...start, facing }, exit };
};

const ENCOUNTER_PHASES = ['entry', 'transformation', 'climax'] as const;
type EncounterPhase = typeof ENCOUNTER_PHASES[number];

const totalNormalBudget = (profile: CampaignEncounterProfile): number => ENCOUNTER_PHASES
  .reduce((total, encounter) => total + profile.phases[encounter].normalBudget, 0);

export const scaleEncounterPhaseBudgets = (
  profile: CampaignEncounterProfile,
  targetTotal: number,
): Readonly<Record<EncounterPhase, number>> => {
  const normalTotal = totalNormalBudget(profile);
  const shares = ENCOUNTER_PHASES.map((encounter, index) => {
    const exact = profile.phases[encounter].normalBudget * targetTotal / normalTotal;
    return { encounter, index, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = targetTotal - shares.reduce((total, share) => total + share.count, 0);
  const distribution = [...shares].sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; remaining > 0; index += 1, remaining -= 1) {
    distribution[index % distribution.length].count += 1;
  }
  return Object.fromEntries(shares.map(({ encounter, count }) => [encounter, count])) as Readonly<Record<EncounterPhase, number>>;
};

const ENEMY_ROLE_ORDER: Readonly<Record<EnemyEncounterRole, readonly EnemyId[]>> = {
  anchor: ['liability-mass', 'denial-officer', 'reserve-eater', 'cat-model', 'bad-faith-counsel', 'ember-clerk', 'subrogator', 'coverage-drone', 'fraud-apparition', 'exposure-hound', 'returned-mail', 'desk-warden'],
  pressure: ['returned-mail', 'exposure-hound', 'fraud-apparition', 'subrogator', 'ember-clerk', 'coverage-drone', 'denial-officer', 'bad-faith-counsel', 'liability-mass', 'reserve-eater', 'cat-model', 'desk-warden'],
  shape: ['coverage-drone', 'denial-officer', 'subrogator', 'bad-faith-counsel', 'ember-clerk', 'cat-model', 'returned-mail', 'exposure-hound', 'fraud-apparition', 'liability-mass', 'reserve-eater', 'desk-warden'],
  punish: ['reserve-eater', 'cat-model', 'bad-faith-counsel', 'liability-mass', 'denial-officer', 'fraud-apparition', 'exposure-hound', 'subrogator', 'ember-clerk', 'coverage-drone', 'returned-mail', 'desk-warden'],
};

const enemyForRole = (
  spec: MapSpec,
  encounter: CampaignEncounterPhaseId,
  role: EnemyEncounterRole,
  occurrence: number,
): EnemyId => {
  const phasePalette = CAMPAIGN_PHASE_ENEMY_PALETTES[spec.id][encounter];
  const candidates = ENEMY_ROLE_ORDER[role]
    .filter((enemy) => spec.enemies.includes(enemy) && phasePalette.includes(enemy));
  if (candidates.length === 0) throw new Error(`${spec.id} has no enemy candidate for ${role}`);
  return candidates[occurrence % candidates.length];
};

const roleForPhaseSlot = (profile: AuthoredEncounterPhase, phaseIndex: number): EnemyEncounterRole => {
  if (phaseIndex < profile.mandatoryRoles.length) return profile.mandatoryRoles[phaseIndex];
  return profile.optionalPattern[(phaseIndex - profile.mandatoryRoles.length) % profile.optionalPattern.length];
};

const encounterRoles = (profile: AuthoredEncounterPhase): readonly EncounterRole[] => {
  const roles = new Set<EncounterRole>([...profile.mandatoryRoles, ...profile.optionalPattern]);
  if (profile.reward) roles.add('reward');
  return [...roles];
};

const difficultyMask = (phaseIndex: number, easyCount: number, normalCount: number): readonly Difficulty[] => {
  if (phaseIndex < easyCount) return ['easy', 'normal', 'hard'];
  if (phaseIndex < normalCount) return ['normal', 'hard'];
  return ['hard'];
};

const supplyFor = (episode: 1 | 2 | 3): readonly PickupId[] => episode === 1
  ? ['staples-small', 'fasteners-small', 'adhesive-bandage', 'goodwill-token', 'staples-large', 'field-medical-case', 'loss-control-vest', 'canister', 'night-inspection-goggles']
  : episode === 2
    ? ['fasteners-large', 'fasteners-large', 'canister', 'canister-crate', 'adhesive-bandage', 'field-medical-case', 'loss-control-vest', 'hazard-endorsement', 'forensic-lens']
    : ['toner-cell', 'fasteners-large', 'canister-crate', 'toner-cell', 'toner-pack', 'field-medical-case', 'rapid-authority', 'temporary-binder', 'adhesive-bandage', 'goodwill-token'];

const LATE_CAMPAIGN_RECOVERY_ROUTE: Readonly<Partial<Record<MapId, string>>> = {
  E3M1: 'entry', E3M2: 'transformation', E3M3: 'climax', E3M4: 'transformation', E3M5: 'entry',
  E3M6: 'climax', E3M7: 'transformation', E3M8: 'boss-1', E3M9: 'climax',
};

type PickupSecretRewardCategory = Exclude<SecretRewardCategory, 'weapon'>;

const SECRET_REWARD_CATEGORIES: readonly SecretRewardCategory[] = ['armor', 'ammo', 'map', 'weapon', 'powerup'];

const SECRET_PICKUP_REWARDS: Readonly<Record<1 | 2 | 3, Readonly<Record<PickupSecretRewardCategory, readonly PickupId[]>>>> = {
  1: {
    armor: ['loss-control-vest'],
    ammo: ['fasteners-large', 'staples-large'],
    map: ['floor-plan'],
    powerup: ['night-inspection-goggles', 'temporary-binder'],
  },
  2: {
    armor: ['loss-control-vest', 'catastrophe-suit'],
    ammo: ['canister-crate', 'fasteners-large'],
    map: ['floor-plan'],
    powerup: ['hazard-endorsement', 'forensic-lens'],
  },
  3: {
    armor: ['catastrophe-suit', 'emergency-reserve'],
    ammo: ['toner-pack', 'canister-crate'],
    map: ['floor-plan'],
    powerup: ['rapid-authority', 'temporary-binder', 'forensic-lens'],
  },
};

const rewardLabel = (placement: SecretRewardPlacement): string => {
  const id = placement.type === 'pickup' ? placement.pickup : placement.weapon;
  return id.split('-').map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join(' ');
};

const standardWeaponCountFor = (spec: MapSpec, episode: 1 | 2 | 3): number =>
  spec.bosses?.length || spec.id === 'E3M2' ? spec.weapons.length : spec.id.endsWith('M1') ? episode : 1;

const SECRET_WEAPON_REWARDS: Readonly<Partial<Record<MapId, { readonly secretIndex: number; readonly weapon: WeaponId }>>> = {
  E1M9: { secretIndex: 0, weapon: 'plasma-copier' },
  E2M1: { secretIndex: 2, weapon: 'audit-repeater' },
  E2M4: { secretIndex: 0, weapon: 'umbra-saw' },
  E2M9: { secretIndex: 0, weapon: 'umbra-saw' },
  E3M7: { secretIndex: 2, weapon: 'umbra-saw' },
  E3M9: { secretIndex: 0, weapon: 'umbra-saw' },
};

const meaningfulSecretAmmo = (spec: MapSpec, episode: 1 | 2 | 3, secretIndex: number): PickupId => {
  const standardWeapons = spec.weapons.slice(0, standardWeaponCountFor(spec, episode));
  const candidates: PickupId[] = ['staples-large'];
  if (standardWeapons.some((weapon) => weapon === 'twin-bore-riveter' || weapon === 'audit-repeater')) candidates.push('fasteners-large');
  if (standardWeapons.includes('catastrophe-launcher')) candidates.push('canister-crate');
  if (standardWeapons.some((weapon) => weapon === 'plasma-copier' || weapon === 'binding-engine')) candidates.push('toner-pack');
  return candidates[(Number(spec.id[3]) + secretIndex) % candidates.length];
};

const secretRewardFor = (
  spec: MapSpec,
  episode: 1 | 2 | 3,
  secretIndex: number,
): Pick<SecretDefinition, 'rewardCategory' | 'reward' | 'rewardPlacement'> => {
  const mapIndex = Number(spec.id[3]) - 1;
  const authoredWeapon = SECRET_WEAPON_REWARDS[spec.id];
  const scheduledCategory = SECRET_REWARD_CATEGORIES[(mapIndex + secretIndex) % SECRET_REWARD_CATEGORIES.length];
  const rewardCategory: SecretRewardCategory = authoredWeapon?.secretIndex === secretIndex
    ? 'weapon'
    : scheduledCategory === 'weapon'
      ? (mapIndex + secretIndex) % 2 === 0 ? 'ammo' : 'powerup'
      : scheduledCategory;
  const rewardPlacement: SecretRewardPlacement = rewardCategory === 'weapon'
    ? { type: 'weapon', weapon: authoredWeapon!.weapon }
    : {
      type: 'pickup',
      pickup: rewardCategory === 'ammo'
        ? meaningfulSecretAmmo(spec, episode, secretIndex)
        : SECRET_PICKUP_REWARDS[episode][rewardCategory][
          (mapIndex + secretIndex) % SECRET_PICKUP_REWARDS[episode][rewardCategory].length
        ],
    };
  return { rewardCategory, reward: rewardLabel(rewardPlacement), rewardPlacement };
};

const credentialDoorSymbol: Readonly<Record<Credential, string>> = { red: 'R', yellow: 'Y', cyan: 'C' };

const makeEncounterBlueprint = (spec: MapSpec, grid: readonly string[], start: GridPoint, exit: GridPoint): EncounterBlueprint => {
  const cells = actorRoutePoints(grid);
  const authored = ENCOUNTER_BLUEPRINTS[spec.id];
  const point = (index: number): GridPoint => cells[index % cells.length];
  const safeInfightingPoint = authored.infighting === undefined ? undefined : (() => {
    const preferred = point(authored.infighting);
    if (distance(preferred, start) > 4 && distance(preferred, exit) > 2) return preferred;
    const candidates = cells.filter((candidate) => distance(candidate, start) > 4 && distance(candidate, exit) > 2);
    return candidates.reduce((best, candidate) => distance(candidate, preferred) < distance(best, preferred) ? candidate : best, candidates[0]);
  })();
  return {
    entryAnchor: point(authored.anchors[0]),
    transformationAnchor: point(authored.anchors[1]),
    climaxAnchor: point(authored.anchors[2]),
    ambushFacing: authored.facing,
    infightingPocket: safeInfightingPoint,
    rewardPocket: point(authored.reward),
  };
};

const makeActors = (
  spec: MapSpec,
  grid: readonly string[],
  episode: 1 | 2 | 3,
  start: GridPoint,
  exit: GridPoint,
  blueprint: EncounterBlueprint,
): readonly ActorPlacement[] => {
  const available = actorRoutePoints(grid).filter((point) => distance(point, start) > 4 && distance(point, exit) > 2);
  const authoredZones = {
    entry: [...available].sort((a, b) => distance(a, blueprint.entryAnchor) - distance(b, blueprint.entryAnchor)),
    transformation: [...available].sort((a, b) => distance(a, blueprint.transformationAnchor) - distance(b, blueprint.transformationAnchor)),
    climax: [...available].sort((a, b) => distance(a, blueprint.climaxAnchor) - distance(b, blueprint.climaxAnchor)),
  };
  const encounterProfile = CAMPAIGN_ENCOUNTER_PROFILES[spec.id];
  const normalCount = spec.normalEnemies;
  const easyCount = Math.ceil(normalCount * .72);
  const hardCount = normalCount + Math.ceil(normalCount * 0.25);
  const phaseCounts = {
    easy: scaleEncounterPhaseBudgets(encounterProfile, easyCount),
    normal: scaleEncounterPhaseBudgets(encounterProfile, normalCount),
    hard: scaleEncounterPhaseBudgets(encounterProfile, hardCount),
  } as const;
  const actors: ActorPlacement[] = [];
  const occupancy = new Map<string, number>();
  const hostileOccupancy = new Map<string, number>();
  const cellKey = (point: GridPoint): string => `${Math.floor(point.x)},${Math.floor(point.z)}`;
  const occupy = (point: GridPoint): GridPoint => {
    const key = cellKey(point);
    const slot = occupancy.get(key) ?? 0;
    occupancy.set(key, slot + 1);
    const ring = Math.floor(slot / 8) + 1;
    const angle = (slot % 8) * Math.PI / 4;
    const radius = slot === 0 ? 0 : Math.min(.38, .11 * ring);
    const offsetX = Math.cos(angle) * radius;
    const offsetZ = Math.sin(angle) * radius;
    return { x: point.x + offsetX, z: point.z + offsetZ };
  };
  const reserveHostile = (zone: readonly GridPoint[], preferredIndex: number, preferred?: GridPoint): GridPoint => {
    const preferredDistanceFromStart = preferred ? distance(preferred, start) : Number.POSITIVE_INFINITY;
    const openingPreferred = spec.id === 'E1M1' && Math.abs(preferredDistanceFromStart - 3) <= .01;
    const preferredCell = preferred ? grid[Math.floor(preferred.z)]?.[Math.floor(preferred.x)] : undefined;
    const safePreferred = preferred
      && preferredDistanceFromStart > (openingPreferred ? 2 : 4)
      && distance(preferred, exit) > 2
      && preferredCell !== undefined
      && preferredCell !== '#'
      && preferredCell !== 's'
      && !DOOR_CELLS.includes(preferredCell)
      ? preferred
      : undefined;
    const preferredKey = safePreferred && cellKey(safePreferred);
    if (safePreferred && (hostileOccupancy.get(preferredKey!) ?? 0) < 2) {
      hostileOccupancy.set(preferredKey!, (hostileOccupancy.get(preferredKey!) ?? 0) + 1);
      return occupy(safePreferred);
    }
    const candidates = zone.filter((point) => cellKey(point) !== preferredKey);
    const startIndex = preferredIndex % candidates.length;
    for (let offset = 0; offset < candidates.length; offset += 1) {
      const point = candidates[(startIndex + offset) % candidates.length];
      const key = cellKey(point);
      if ((hostileOccupancy.get(key) ?? 0) >= 2) continue;
      hostileOccupancy.set(key, (hostileOccupancy.get(key) ?? 0) + 1);
      return occupy(point);
    }
    throw new Error(`${spec.id} encounter zone has no spawn cell below its occupancy cap`);
  };

  let enemyIndex = 0;
  for (const encounter of ENCOUNTER_PHASES) {
    const zone = authoredZones[encounter];
    const profile = encounterProfile.phases[encounter];
    const pocketRole: EnemyEncounterRole = [...profile.mandatoryRoles, ...profile.optionalPattern].includes('punish') ? 'punish' : 'shape';
    const roleOccurrences: Record<EnemyEncounterRole, number> = { anchor: 0, pressure: 0, shape: 0, punish: 0 };
    for (let phaseIndex = 0; phaseIndex < phaseCounts.hard[encounter]; phaseIndex += 1) {
      const role = roleForPhaseSlot(profile, phaseIndex);
      const roleOccurrence = roleOccurrences[role];
      roleOccurrences[role] += 1;
      const preferred = spec.id === 'E1M1' && enemyIndex === 0
        ? { x: start.x + 3, z: start.z }
        : role === pocketRole && blueprint.infightingPocket && roleOccurrence % 2 === 0
          ? blueprint.infightingPocket
          : undefined;
      const roleDepth = { anchor: 0, pressure: .24, shape: .52, punish: .76 }[role];
      const point = reserveHostile(zone, Math.floor(zone.length * roleDepth) + phaseIndex * 7, preferred);
      const enemy = enemyForRole(spec, encounter, role, roleOccurrence);
      actors.push({
        ...point,
        type: 'enemy',
        enemy,
        role,
        difficulties: difficultyMask(phaseIndex, phaseCounts.easy[encounter], phaseCounts.normal[encounter]),
        dormant: role === 'punish' || (role === 'shape' && roleOccurrence % 3 === 2),
        encounter,
        mandatory: phaseIndex < profile.mandatoryRoles.length,
        route: encounter,
        facing: role === 'anchor' || role === 'punish' ? blueprint.ambushFacing : (['north', 'east', 'south', 'west'] as const)[enemyIndex % 4],
      });
      enemyIndex += 1;
    }
  }

  // The first episode's arena uses small, recoverable increments so a player
  // can route through the boss floor without consuming oversized health items
  // for only a few missing points. Its guaranteed phase bandages remain intact.
  const supply = episode === 1 && spec.bosses?.length
    ? supplyFor(episode).map((pickup) => (
      pickup === 'field-medical-case' || pickup === 'adhesive-bandage' ? 'goodwill-token' : pickup
    ))
    : supplyFor(episode);
  const routeBundles: Readonly<Record<1 | 2 | 3, readonly PickupId[]>> = {
    1: ['staples-large', 'adhesive-bandage', 'staples-large', 'staples-large', 'staples-large'],
    2: ['fasteners-large', 'field-medical-case', 'fasteners-large', 'canister-crate', 'fasteners-large'],
    3: ['staples-large', 'field-medical-case', 'toner-pack', 'canister-crate', 'toner-cell'],
  };
  const episodeTwoRouteBundle: readonly PickupId[] = spec.weapons.some((weapon) => weapon === 'plasma-copier' || weapon === 'binding-engine')
    ? ['toner-cell', 'field-medical-case', 'fasteners-large', 'canister-crate', 'toner-cell']
    : spec.weapons.includes('catastrophe-launcher')
      ? ['canister-crate', 'field-medical-case', 'fasteners-large', 'canister', 'canister-crate']
      : spec.weapons.includes('audit-repeater') || spec.weapons.includes('twin-bore-riveter')
        ? ['fasteners-large', 'field-medical-case', 'fasteners-large', 'fasteners-large', 'fasteners-large']
        : ['staples-large', 'field-medical-case', 'fasteners-large', 'canister', 'staples-large'];
  const routeBundle = episode === 2
    ? episodeTwoRouteBundle
    : episode === 3 && spec.id !== 'E3M2'
      ? ['toner-cell', 'field-medical-case', 'canister-crate', 'toner-cell', 'toner-cell'] as const
      : routeBundles[episode];
  const pickupScale = episode === 1 ? .55
    : episode === 2 ? (Number(spec.id[3]) >= 7 && Number(spec.id[3]) <= 8 ? .4 : .5)
      : Number(spec.id[3]) >= 7 && Number(spec.id[3]) <= 8 ? .25 : .35;
  const pickupCount = 18 + episode * 2 + Math.ceil(normalCount * pickupScale);
  const pickupPhaseCounts = scaleEncounterPhaseBudgets(encounterProfile, pickupCount);
  let pickupIndex = 0;
  for (const routeId of ENCOUNTER_PHASES) {
    const route = authoredZones[routeId];
    for (let routeSlot = 0; routeSlot < pickupPhaseCounts[routeId]; routeSlot += 1) {
      const point = encounterProfile.phases[routeId].reward && routeSlot === 0
        ? blueprint.rewardPocket
        : route[(hardCount + pickupIndex * 11) % route.length];
      const pickup = routeSlot < routeBundle.length
        ? routeBundle[routeSlot]
        : supply[pickupIndex % supply.length];
      actors.push({ ...occupy(point), type: 'pickup', pickup, route: routeId });
      pickupIndex += 1;
    }
  }

  const lateRecoveryRoute = LATE_CAMPAIGN_RECOVERY_ROUTE[spec.id];
  if (lateRecoveryRoute) {
    const route = lateRecoveryRoute in authoredZones
      ? authoredZones[lateRecoveryRoute as EncounterPhase]
      : authoredZones.climax;
    const point = route[(hardCount + pickupCount + 17) % route.length];
    actors.push({ ...occupy(point), type: 'pickup', pickup: 'emergency-reserve', route: lateRecoveryRoute });
  }

  spec.recoverySupplies?.forEach(({ pickup, route: routeId }, index) => {
    const route = routeId in authoredZones ? authoredZones[routeId as EncounterPhase] : authoredZones.climax;
    const point = index === 0 ? blueprint.rewardPocket : route[(hardCount + pickupCount + index * 13) % route.length];
    actors.push({ ...occupy(point), type: 'pickup', pickup, route: routeId });
  });

  // Fresh-start boss routes need both a sustainable workhorse and the authored
  // set-piece weapon; hiding either behind a secret makes the arena depend on
  // carried inventory despite the per-map starter-equivalent contract. Other
  // weapons are materialized only by their concealed SecretDefinition.
  const standardWeaponCount = standardWeaponCountFor(spec, episode);
  spec.weapons.slice(0, standardWeaponCount).forEach((weapon, index) => {
    const point = available[(hardCount + pickupCount + index * 11) % available.length];
    actors.push({ ...occupy(point), type: 'weapon', weapon, route: index === 0 ? 'entry' : 'transformation' });
  });

  let previousCredentialReach = new Set<string>();
  spec.credentials.forEach((credential, index) => {
    const acquired = new Set(spec.credentials.slice(0, index));
    const blockedDoors = (['red', 'yellow', 'cyan'] as const)
      .filter((candidate) => !acquired.has(candidate))
      .map((candidate) => credentialDoorSymbol[candidate])
      .join('');
    const reachable = actorRoutePoints(grid, `s${blockedDoors}`).filter((point) => distance(point, start) > 2);
    const newlyUnlocked = index === 0 ? reachable : reachable.filter((point) => !previousCredentialReach.has(cellKey(point)));
    const candidates = newlyUnlocked.length > 0 ? newlyUnlocked : reachable;
    const point = candidates[(hash(`${spec.id}:credential:${credential}`) + index * 7) % candidates.length] ?? available[index];
    actors.push({ ...occupy(point), type: 'credential', credential });
    previousCredentialReach = new Set(reachable.map(cellKey));
  });

  spec.bosses?.forEach((boss, index) => {
    const preferred = available.reduce((best, candidate) => {
      const offsetCenter = { x: blueprint.climaxAnchor.x + index * 2, z: blueprint.climaxAnchor.z };
      return distance(candidate, offsetCenter) < distance(best, offsetCenter) ? candidate : best;
    }, available[0]);
    const point = reserveHostile(authoredZones.climax, hash(`${spec.id}:boss:${boss}`), preferred);
    actors.push({ ...point, type: 'boss', boss, encounter: `boss-${index + 1}`, facing: 'south' });
  });

  return actors;
};

const makeSecrets = (spec: MapSpec, grid: readonly string[], start: GridPoint): readonly SecretDefinition[] => {
  const episode = episodeFor(spec.id).number;
  const baseKeys = new Set(baseRoutePoints(grid).map((point) => `${Math.floor(point.x)},${Math.floor(point.z)}`));
  const secretPoints = pointsFor(grid, 's').filter((secret) => [
    { x: secret.x + 1, z: secret.z }, { x: secret.x - 1, z: secret.z },
    { x: secret.x, z: secret.z + 1 }, { x: secret.x, z: secret.z - 1 },
  ].some((point) => baseKeys.has(`${Math.floor(point.x)},${Math.floor(point.z)}`)));
  const revealPoint = (secret: GridPoint, index: number): GridPoint => {
    const neighbors = [
      { x: secret.x + 1, z: secret.z }, { x: secret.x - 1, z: secret.z },
      { x: secret.x, z: secret.z + 1 }, { x: secret.x, z: secret.z - 1 },
    ].filter((point) => {
      const symbol = grid[Math.floor(point.z)]?.[Math.floor(point.x)];
      return symbol !== undefined && symbol !== '#' && symbol !== 's'
        && baseKeys.has(`${Math.floor(point.x)},${Math.floor(point.z)}`);
    });
    const stagedNeighbors = neighbors.filter((point) => distance(point, start) > 0);
    const fallback = baseRoutePoints(grid).filter((point) => distance(point, secret) >= 2 && distance(point, start) > 0);
    return stagedNeighbors[hash(`${spec.id}:secret-switch:${index}`) % stagedNeighbors.length]
      ?? fallback[hash(`${spec.id}:secret-fallback:${index}`) % fallback.length];
  };
  return secretPoints.slice(0, spec.secretClues.length).map((at, index) => {
    const clue = spec.secretClues[index];
    return {
      id: `${spec.id.toLowerCase()}-secret-${index + 1}`,
      clue,
      ...secretRewardFor(spec, episode, index),
      clueProp: SECRET_CLUE_PROPS[spec.id][index],
      at,
      revealAt: revealPoint(at, index),
      concealedCells: [`${Math.floor(at.x)},${Math.floor(at.z)}`],
      persistState: true as const,
    };
  });
};

const makeTriggers = (
  spec: MapSpec,
  grid: readonly string[],
  exit: GridPoint,
  secrets: readonly SecretDefinition[],
  mechanisms: readonly MapMechanism[],
): readonly MapTrigger[] => {
  const doors = pointsFor(grid, 'DRYC');
  const baseKeys = new Set(baseRoutePoints(grid).map((point) => `${Math.floor(point.x)},${Math.floor(point.z)}`));
  const switches = pointsFor(grid, 'a,').filter((point) => baseKeys.has(`${Math.floor(point.x)},${Math.floor(point.z)}`));
  const bossRequirement = spec.bosses?.length ? `boss-${spec.bosses.length}` : 'climax';
  const triggers: MapTrigger[] = [
    {
      ...exit,
      id: `${spec.id.toLowerCase()}-exit-control`,
      action: 'open-exit',
      targets: ['map-exit'],
      requiresEncounter: bossRequirement,
    },
    {
      ...exit,
      id: `${spec.id.toLowerCase()}-map-exit`,
      action: 'complete-map',
      targets: spec.nextMap ? [spec.nextMap] : [],
    },
  ];
  const teleportCandidates = pointsFor(grid, '.,a').filter((point) => baseKeys.has(`${Math.floor(point.x)},${Math.floor(point.z)}`) && distance(point, exit) > 3);
  mechanisms.forEach((mechanism, index) => {
    const transformationPoint = switches[Math.floor((index + 1) * switches.length / (mechanisms.length + 1))] ?? exit;
    const transformationId = `${spec.id.toLowerCase()}-transformation-${index + 1}`;
    const teleportDestination = spec.transformation === 'teleport'
      ? [...teleportCandidates].sort((a, b) => distance(b, transformationPoint) - distance(a, transformationPoint))[index % teleportCandidates.length]
      : undefined;
    const teleportDestinationId = `${spec.id.toLowerCase()}-teleport-destination-${index + 1}`;
    triggers.splice(index, 0, {
      ...transformationPoint,
      id: transformationId,
      action: spec.transformation,
      targets: teleportDestination ? [teleportDestinationId, mechanism.id] : [mechanism.id, 'transformation-wave'],
      requiresEncounter: 'transformation',
      destination: teleportDestination,
      message: index === 0 ? spec.signatureBeat : mechanism.label,
    });
    if (teleportDestination) {
      triggers.push({
        ...teleportDestination,
        id: teleportDestinationId,
        action: 'teleport',
        targets: [transformationId],
        destination: transformationPoint,
        repeatable: true,
        message: 'The contradictory floor resolves around you.',
      });
    }
  });

  spec.credentials.forEach((credential, index) => {
    triggers.push({
      ...(doors[index % doors.length] ?? exit),
      id: `${spec.id.toLowerCase()}-${credential}-route`,
      action: 'open-door',
      targets: [`${credential}-route`],
      requiresCredential: credential,
    });
  });

  secrets.forEach((secret) => triggers.push({
    ...secret.revealAt,
    id: `${secret.id}-trigger`,
    action: 'reveal-secret',
    targets: [secret.id],
  }));

  if (spec.secretExitTo) {
    const secret = secrets[secrets.length - 1];
    triggers.push({
      ...secret.at,
      id: `${spec.id.toLowerCase()}-secret-exit`,
      action: 'complete-map',
      targets: [spec.secretExitTo],
    });
  }

  return triggers;
};

const skies = {
  1: 'sky.storm-campus',
  2: 'sky.catastrophe-city',
  3: 'sky.actuarial-void',
} as const;

const buildMap = (spec: MapSpec): CampaignMap => {
  const episode = episodeFor(spec.id);
  const encounterProfile = CAMPAIGN_ENCOUNTER_PROFILES[spec.id];
  const grid = getLayout(spec.layout, episode.number);
  const { start, exit } = chooseStartExit(spec, grid);
  const encounterBlueprint = makeEncounterBlueprint(spec, grid, start, exit);
  const secrets = makeSecrets(spec, grid, start);
  const landmarks = makeLandmarks(spec, grid);
  const breakables = makeBreakables(spec, grid, episode.number, landmarks);
  const mechanisms = makeMechanisms(spec, grid, landmarks);
  const actors: readonly ActorPlacement[] = [
    ...makeActors(spec, grid, episode.number, start, exit, encounterBlueprint),
    ...secrets.map((secret, index) => ({
      x: secret.at.x + (index % 2 === 0 ? -.12 : .12),
      z: secret.at.z + (index % 3 === 0 ? -.12 : .12),
      ...secret.rewardPlacement,
      secret: true,
    })),
  ];
  const bossEncounters = (spec.bosses ?? []).map((boss, index) => ({
    id: `boss-${index + 1}`,
    label: `${boss} phase ${index + 1}`,
    zones: ['arena', 'spawn-shutters'],
    roles: ['anchor', 'pressure', 'shape'] as const,
    completion: 'boss-phase' as const,
    opens: index === (spec.bosses?.length ?? 0) - 1 ? ['map-exit'] : [`boss-${index + 2}`],
  }));

  return {
    id: spec.id,
    episode: episode.id,
    index: Number(spec.id[3]),
    title: spec.title,
    location: spec.location,
    music: spec.id,
    sky: skies[episode.number],
    parSeconds: campaignRouteParSeconds({
      routeCells: standardRouteCellCount(grid),
      normalEnemies: spec.normalEnemies,
      mechanisms: mechanisms.length,
      credentials: spec.credentials.length,
      bossPhases: spec.bosses?.length ?? 0,
    }),
    standardEnemyBudget: spec.normalEnemies,
    secretMap: spec.secretMap,
    secretExitTo: spec.secretExitTo,
    nextMap: spec.nextMap,
    cellSize: 3,
    grid,
    playerStart: start,
    exit,
    legend: EPISODE_TILESETS[episode.number === 1 ? 'office' : episode.number === 2 ? 'catastrophe' : 'actuarial'],
    zones: {
      entry: 'outer walkable cells nearest playerStart',
      transformation: 'central D/a/v cells and adjacent loops',
      climax: 'far third of walkable cells nearest exit',
      arena: 'central raised and comma-marked sectors',
      'spawn-shutters': 'tagged arena doors that release authored boss reinforcements',
      'transformation-sectors': mechanisms[0].sectorTags.join(','),
      'transformation-wave': 'dormant actors assigned to the transformation encounter',
      'map-exit': `${exit.x},${exit.z}`,
    },
    actors,
    landmarks,
    breakables,
    mechanisms,
    triggers: makeTriggers(spec, grid, exit, secrets, mechanisms),
    encounters: [
      { id: 'entry', label: 'Approach pressure', zones: ['entry'], roles: encounterRoles(encounterProfile.phases.entry), completion: 'clear', opens: ['transformation'] },
      { id: 'transformation', label: 'Signature mechanism contest', zones: ['transformation'], roles: encounterRoles(encounterProfile.phases.transformation), completion: 'switch', opens: ['climax'] },
      { id: 'climax', label: 'Exit-route crossfire', zones: ['climax'], roles: encounterRoles(encounterProfile.phases.climax), completion: 'clear', opens: spec.bosses?.length ? ['boss-1'] : ['map-exit'] },
      ...bossEncounters,
    ],
    encounterBlueprint,
    secrets,
    signatureBeat: spec.signatureBeat,
  };
};

const mapEntries = specs.map((spec) => [spec.id, buildMap(spec)] as const);
export const CAMPAIGN_MAPS = Object.fromEntries(mapEntries) as Readonly<Record<MapId, CampaignMap>>;

export const EPISODES: readonly EpisodeDefinition[] = [
  {
    id: 'first-notice', number: 1, title: 'FIRST NOTICE',
    arc: 'Ordinary branch operations descend into the buried cause of the incident.',
    palette: ['paper white', 'charcoal', 'concrete gray', 'safety yellow', 'seal red', 'screen cyan'],
    maps: ['E1M1', 'E1M2', 'E1M3', 'E1M4', 'E1M5', 'E1M6', 'E1M7', 'E1M8', 'E1M9'],
  },
  {
    id: 'exclusions-apply', number: 2, title: 'EXCLUSIONS APPLY',
    arc: 'Catastrophe-response infrastructure becomes a hostile industrial city.',
    palette: ['oxidized green', 'wet asphalt', 'hazard orange', 'steel', 'emergency red', 'cold cyan'],
    maps: ['E2M1', 'E2M2', 'E2M3', 'E2M4', 'E2M5', 'E2M6', 'E2M7', 'E2M8', 'E2M9'],
  },
  {
    id: 'adverse-development', number: 3, title: 'ADVERSE DEVELOPMENT',
    arc: 'The player descends into the actuarial substrate where risk is manufactured.',
    palette: ['black stone', 'bone paper', 'molten red wax', 'brass', 'white void', 'ultraviolet cyan'],
    maps: ['E3M1', 'E3M2', 'E3M3', 'E3M4', 'E3M5', 'E3M6', 'E3M7', 'E3M8', 'E3M9'],
  },
] as const;

export const CAMPAIGN: CampaignDefinition = {
  title: 'RED LEDGER',
  episodes: EPISODES,
  maps: CAMPAIGN_MAPS,
};
