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
  readonly parSeconds: number;
  readonly normalEnemies: number;
  readonly enemies: readonly EnemyId[];
  readonly weapons: readonly WeaponId[];
  readonly credentials: readonly Credential[];
  readonly transformation: TriggerAction;
  readonly signatureBeat: string;
  readonly secretClues: readonly string[];
  readonly bosses?: readonly BossId[];
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

const specs: readonly MapSpec[] = [
  {
    id: 'E1M1', title: 'First Notice', location: 'Branch office and parking deck', layout: 'loop',
    parSeconds: 105, normalEnemies: 38, enemies: E1, weapons: ['twin-bore-riveter'], credentials: ['red'],
    transformation: 'open-door', nextMap: 'E1M2',
    signatureBeat: 'The red credential is visible through glass from the starting room, then opens the parking return loop.',
    secretClues: ['A misaligned reception baseboard', 'A red lamp flickering behind parking mesh'],
  },
  {
    id: 'E1M2', title: 'Intake', location: 'Call center and mail-routing floor', layout: 'lanes',
    parSeconds: 170, normalEnemies: 52, enemies: E1_FAST, weapons: ['audit-repeater'], credentials: ['red'],
    transformation: 'move-walls', nextMap: 'E1M3',
    signatureBeat: 'Cubicle shutters drop and turn long sightlines into a reactive ambush maze.',
    secretClues: ['A ringing phone with no desk', 'An intake diagram matching the west lanes', 'A displaced ceiling tile'],
  },
  {
    id: 'E1M3', title: 'Total Loss', location: 'Vehicle inspection warehouse and flooded bays', layout: 'bays',
    parSeconds: 240, normalEnemies: 62, enemies: E1_FULL, weapons: ['catastrophe-launcher'], credentials: ['yellow'],
    transformation: 'raise-floor', nextMap: 'E1M4', secretExitTo: 'E1M9',
    signatureBeat: 'Inspection lifts raise damaged cars into temporary cover and bridge the flooded bays.',
    secretClues: ['A vehicle silhouette behind frosted glass', 'A dry trail crossing the flooded floor', 'A crooked inspection placard'],
  },
  {
    id: 'E1M4', title: 'Mitigation', location: 'Water and fire restoration plant', layout: 'channels',
    parSeconds: 300, normalEnemies: 72, enemies: E1_FULL, weapons: ['catastrophe-launcher'], credentials: ['red', 'yellow'],
    transformation: 'toggle-sectors', nextMap: 'E1M5',
    signatureBeat: 'Pump controls exchange safe walkways and hazardous restoration channels.',
    secretClues: ['A dry pipe that carries combat sound', 'A hazard stripe that breaks its pattern', 'A dark service alcove above the pumps'],
  },
  {
    id: 'E1M5', title: 'Records Retention', location: 'Archive stacks around a central lift', layout: 'hub',
    parSeconds: 360, normalEnemies: 84, enemies: E1_FULL, weapons: ['plasma-copier'], credentials: ['red', 'cyan'],
    transformation: 'move-walls', nextMap: 'E1M6',
    signatureBeat: 'Rolling shelves expose crossfire lanes, shortcuts, and an early Plasma Copier.',
    secretClues: ['A shelf label missing its sequence number', 'A humming wall beside the lift', 'A map-shaped patch of carpet', 'A single backward archive box'],
  },
  {
    id: 'E1M6', title: 'Tower Annex', location: 'Corporate offices wrapping a tall atrium', layout: 'rings',
    parSeconds: 420, normalEnemies: 92, enemies: E1_FULL, weapons: ['plasma-copier'], credentials: ['red', 'yellow', 'cyan'],
    transformation: 'raise-floor', nextMap: 'E1M7',
    signatureBeat: 'Credentials reopen familiar lower floors from newly reached balconies and lifts.',
    secretClues: ['An unreachable vest visible across the atrium', 'A conference phone ringing below', 'A red ceiling light reflected in glass', 'A narrow exterior maintenance ledge'],
  },
  {
    id: 'E1M7', title: 'The Underwriting Floor', location: 'Executive zone descending into machinery', layout: 'descent',
    parSeconds: 480, normalEnemies: 108, enemies: E1_FULL, weapons: ['binding-engine'], credentials: ['red', 'yellow', 'cyan'],
    transformation: 'lower-floor', nextMap: 'E1M8',
    signatureBeat: 'A boardroom table splits apart and reveals the risk machinery below.',
    secretClues: ['A chair facing away from the boardroom', 'A policy diagram aligned to the floor', 'A voice behind a sealed deposition wall', 'An executive washroom with a false ceiling'],
  },
  {
    id: 'E1M8', title: 'Regional Authority', location: 'Fortress atrium and binding arena', layout: 'arena',
    parSeconds: 390, normalEnemies: 76, enemies: E1_FULL, weapons: ['binding-engine'], credentials: [],
    transformation: 'spawn-wave', nextMap: 'E2M1', bosses: ['regional-director'],
    signatureBeat: 'Meeting-room shutters feed adds into the Regional Director canister barrage.',
    secretClues: ['A cracked authority seal beneath the entry stairs', 'A dark meeting room overlooking the arena', 'A maintenance hatch behind a canister rack'],
  },
  {
    id: 'E1M9', title: 'Unscheduled Inspection', location: 'Perfect model home and showroom', layout: 'showroom',
    parSeconds: 330, normalEnemies: 86, enemies: E1_FULL, weapons: ['umbra-saw', 'plasma-copier'], credentials: ['red', 'yellow'],
    transformation: 'move-walls', nextMap: 'E1M4', secretMap: true,
    signatureBeat: 'Each immaculate room opens onto a more absurd covered peril.',
    secretClues: ['A family portrait with one blank face', 'A smoke alarm chirping in an empty room', 'A refrigerator containing only a credential', 'A showroom window facing another interior'],
  },
  {
    id: 'E2M1', title: 'Catastrophe Staging', location: 'Storm logistics yard and response hangar', layout: 'loop',
    parSeconds: 270, normalEnemies: 68, enemies: E2_OPEN, weapons: ['catastrophe-launcher', 'audit-repeater'], credentials: ['yellow'],
    transformation: 'move-walls', nextMap: 'E2M2',
    signatureBeat: 'Lightning silhouettes long-range threats between shifting container lanes.',
    secretClues: ['A container with inward-facing locks', 'A warning beacon blinking out of sequence', 'A painted loading number visible only in lightning'],
  },
  {
    id: 'E2M2', title: 'Waterline', location: 'Flood-damaged hotel around a submerged lobby', layout: 'bays',
    parSeconds: 390, normalEnemies: 82, enemies: E2_HEAVY, weapons: ['plasma-copier'], credentials: ['red', 'cyan'],
    transformation: 'drain-liquid', nextMap: 'E2M3',
    signatureBeat: 'Changing water levels reconnect guest-room loops and reveal the drowned lobby route.',
    secretClues: ['A room-service bell ringing underwater', 'A dry carpet seam above the waterline', 'A guest-room number repeated twice', 'A luggage cart blocking a narrow stair'],
  },
  {
    id: 'E2M3', title: 'Server Farm', location: 'Claims data center and redundant power halls', layout: 'lanes',
    parSeconds: 430, normalEnemies: 94, enemies: E2_FULL, weapons: ['plasma-copier'], credentials: ['cyan', 'yellow'],
    transformation: 'blackout', nextMap: 'E2M4',
    signatureBeat: 'Power routing wakes one enemy-filled wing while blacking out the other.',
    secretClues: ['A cyan status light on a dead rack', 'A cable run disappearing through the floor', 'A fan noise behind an unvented wall', 'A mirrored server label'],
  },
  {
    id: 'E2M4', title: 'Claims Express', location: 'Armored records train and switching depot', layout: 'descent',
    parSeconds: 450, normalEnemies: 104, enemies: E2_FULL, weapons: ['umbra-saw'], credentials: ['red', 'yellow'],
    transformation: 'move-walls', nextMap: 'E2M5',
    signatureBeat: 'Train cars shift between platforms and create new cross-car routes during combat.',
    secretClues: ['A timetable with an impossible platform', 'A silent carriage with warm lights', 'A switch lever pointing between labels', 'A maintenance crawlspace beneath the consist'],
  },
  {
    id: 'E2M5', title: 'Salvage Rights', location: 'Vehicle and equipment salvage district', layout: 'showroom',
    parSeconds: 500, normalEnemies: 112, enemies: E2_FULL, weapons: ['catastrophe-launcher'], credentials: ['red', 'yellow', 'cyan'],
    transformation: 'move-walls', nextMap: 'E2M6', secretExitTo: 'E2M9',
    signatureBeat: 'Crushers reshape sightlines and reveal buried routes through the salvage blocks.',
    secretClues: ['A pristine door on a flattened vehicle', 'A crusher control with a second detent', 'A salvage tag matching the automap outline', 'An engine still ticking in a silent yard'],
  },
  {
    id: 'E2M6', title: 'Pump Station', location: 'Municipal flood-control plant', layout: 'channels',
    parSeconds: 530, normalEnemies: 120, enemies: E2_FULL, weapons: ['binding-engine'], credentials: ['red', 'yellow', 'cyan'],
    transformation: 'toggle-sectors', nextMap: 'E2M7',
    signatureBeat: 'Three pumps redirect liquid, enemy access, and the player return route.',
    secretClues: ['A pressure gauge with a fourth mark', 'A ladder shadow with no ladder', 'A dry culvert carrying enemy sound', 'A red valve among yellow controls', 'A flood map with one raised contour'],
  },
  {
    id: 'E2M7', title: 'Discovery', location: 'Litigation tower and evidence repository', layout: 'rings',
    parSeconds: 560, normalEnemies: 128, enemies: E2_FULL, weapons: ['binding-engine'], credentials: ['red', 'cyan'],
    transformation: 'teleport', nextMap: 'E2M8',
    signatureBeat: 'Deposition rooms teleport between contradictory versions of the same floor.',
    secretClues: ['Two clocks disagree by exactly one minute', 'A deposition lamp casting two shadows', 'An evidence seal applied backward', 'A window showing the room from outside', 'A court reporter key heard through stone'],
  },
  {
    id: 'E2M8', title: 'The Aggregate', location: 'Flooded data hall and joined-loss arena', layout: 'arena',
    parSeconds: 480, normalEnemies: 90, enemies: E2_FULL, weapons: ['binding-engine'], credentials: [],
    transformation: 'lower-floor', nextMap: 'E3M1', bosses: ['aggregate'],
    signatureBeat: 'Cover islands sink while the Aggregate alternates independent attack emitters.',
    secretClues: ['A submerged console still accepting input', 'A narrow dry ledge behind an emitter', 'A reflected doorway absent from the wall'],
  },
  {
    id: 'E2M9', title: 'Tabletop Exercise', location: 'Cheerful catastrophe training simulation', layout: 'hub',
    parSeconds: 420, normalEnemies: 108, enemies: E2_FULL, weapons: ['binding-engine', 'umbra-saw'], credentials: ['red', 'cyan'],
    transformation: 'move-walls', nextMap: 'E2M6', secretMap: true,
    signatureBeat: 'Bright modular scenery collapses and exposes the observers and machinery behind it.',
    secretClues: ['A cardboard cloud hanging too low', 'A smiling cutout facing the wall', 'A training prompt whose buttons all work', 'A painted evacuation door with a real handle'],
  },
  {
    id: 'E3M1', title: 'Earned Premium', location: 'Brass premium foundry at the underworld edge', layout: 'loop',
    parSeconds: 420, normalEnemies: 92, enemies: E3_OPEN, weapons: ['plasma-copier'], credentials: ['yellow'],
    transformation: 'open-door', nextMap: 'E3M2',
    signatureBeat: 'Currency channels power the foundry doors and release Reserve Eaters in return.',
    secretClues: ['A coin channel flowing uphill', 'A silent calculator wheel', 'A brass tile colder than the surrounding floor'],
  },
  {
    id: 'E3M2', title: 'Mortality Table', location: 'Sliding calculation-table labyrinth', layout: 'lanes',
    parSeconds: 500, normalEnemies: 108, enemies: E3_FULL, weapons: ['umbra-saw'], credentials: ['red', 'cyan'],
    transformation: 'move-walls', nextMap: 'E3M3',
    signatureBeat: 'Row and column switches realign combat lanes around fixed brass landmarks.',
    secretClues: ['A column total that does not balance', 'A movable row with no switch', 'A zero embossed beneath a stair', 'A probability grid with one red square'],
  },
  {
    id: 'E3M3', title: 'Treaty Vault', location: 'Layered reinsurance vaults and transfer machinery', layout: 'hub',
    parSeconds: 540, normalEnemies: 118, enemies: E3_FULL, weapons: ['binding-engine'], credentials: ['red', 'yellow', 'cyan'],
    transformation: 'teleport', nextMap: 'E3M4',
    signatureBeat: 'Opening one vault transfers its monsters and resources into another layer.',
    secretClues: ['A vault dial with an ultraviolet number', 'A transfer tube carrying an item silhouette', 'A contract stack arranged as a stair', 'A locked room visible in two layers'],
  },
  {
    id: 'E3M4', title: 'Probability Chapel', location: 'Ritual calculation chamber over a white void', layout: 'rings',
    parSeconds: 570, normalEnemies: 124, enemies: E3_FULL, weapons: ['binding-engine'], credentials: ['cyan', 'yellow'],
    transformation: 'toggle-sectors', nextMap: 'E3M5',
    signatureBeat: 'Prediction zones mark future impacts across rotating floor sectors.',
    secretClues: ['A prediction circle that never activates', 'A chant audible only beside the void', 'A brass lectern facing away from the altar', 'A white tile casting a black reflection', 'A broken probability sequence'],
  },
  {
    id: 'E3M5', title: 'Reserve Pits', location: 'Deep storage wells filled with wax and toner', layout: 'descent',
    parSeconds: 610, normalEnemies: 134, enemies: E3_FULL, weapons: ['binding-engine'], credentials: ['red', 'yellow'],
    transformation: 'lower-floor', nextMap: 'E3M6',
    signatureBeat: 'Lifts descend past optional ledges while enemies fire across the central shaft.',
    secretClues: ['A lift call light below the lowest floor', 'A wax spill shaped like a credential', 'A ledge visible only during descent', 'A chain moving without a counterweight', 'A toner ripple against the current'],
  },
  {
    id: 'E3M6', title: 'Redaction Court', location: 'Abstract courtrooms and sealed evidence halls', layout: 'showroom',
    parSeconds: 640, normalEnemies: 142, enemies: E3_FULL, weapons: ['binding-engine'], credentials: ['red', 'cyan'],
    transformation: 'move-walls', nextMap: 'E3M7', secretExitTo: 'E3M9',
    signatureBeat: 'Black redaction walls erase and restore routes in a readable courtroom sequence.',
    secretClues: ['An objection light beneath the defense table', 'A redaction bar with a visible hinge', 'A witness microphone carrying distant combat', 'A sealed exhibit casting no shadow', 'A verdict form matching the map shape'],
  },
  {
    id: 'E3M7', title: 'Infinite Ledger', location: 'Compressed-paper machine feeding the final model', layout: 'channels',
    parSeconds: 690, normalEnemies: 154, enemies: E3_FULL, weapons: ['binding-engine', 'umbra-saw'], credentials: ['red', 'yellow', 'cyan'],
    transformation: 'toggle-sectors', nextMap: 'E3M8',
    signatureBeat: 'Distorted versions of earlier landmarks return as connected combat modules.',
    secretClues: ['A reception bell fused into black stone', 'A drowned hotel door above a dry pit', 'A model-home window overlooking the machine', 'A train switch embedded in an archive shelf', 'A brass page numbered zero', 'A familiar red lamp at impossible height'],
  },
  {
    id: 'E3M8', title: 'The Uninsurable', location: 'Chief Actuary arena and reserve-core engine', layout: 'arena',
    parSeconds: 600, normalEnemies: 112, enemies: E3_FULL, weapons: ['binding-engine'], credentials: [],
    transformation: 'open-door', bosses: ['chief-actuary', 'uninsurable'],
    signatureBeat: 'Defeat the mobile gatekeeper, open three binding gates, then fire into the exposed reserve core.',
    secretClues: ['A prediction terminal showing a safe sector', 'A binding gate with a fourth maintenance latch', 'A void ledge behind the reserve feed', 'A silent wave alcove beneath the arena'],
  },
  {
    id: 'E3M9', title: 'Orientation Day', location: 'Cheerful onboarding-video soundstage', layout: 'bays',
    parSeconds: 480, normalEnemies: 126, enemies: E3_FULL, weapons: ['binding-engine', 'umbra-saw'], credentials: ['red', 'yellow', 'cyan'],
    transformation: 'move-walls', nextMap: 'E3M7', secretMap: true,
    signatureBeat: 'Painted smiles and perfect offices peel away to reveal a hostile soundstage.',
    secretClues: ['An applause sign that responds to gunfire', 'A camera filming an empty mark', 'A painted window with depth behind it', 'A teleprompter displaying a switch sequence', 'A break-room clock running backward'],
  },
] as const;

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
  const doorKeys: string[] = [];
  grid.forEach((row, z) => [...row].forEach((char, x) => {
    if (desiredChars.includes(char)) sectorKeys.push(`${x},${z}`);
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

const phaseEnemyBudget = (spec: MapSpec): number => {
  const index = Number(spec.id[3]);
  const minimum = index <= 3 ? 35 : index <= 6 || index === 9 ? 60 : 90;
  const maximum = index <= 3 ? 65 : index <= 6 || index === 9 ? 110 : 160;
  return Math.max(minimum, Math.min(maximum, spec.normalEnemies));
};

// Preserve the authored relative pars while scaling the classic-speed estimates
// to the campaign's deliberate exploration and combat target.
const experiencedPar = (spec: MapSpec): number => Math.max(900, Math.min(2100, spec.parSeconds * 2));

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

const chooseStartExit = (grid: readonly string[]): { start: GridPoint & { facing: Facing }; exit: GridPoint } => {
  const points = baseRoutePoints(grid);
  const start = points[0];
  const exit = points.reduce((best, point) => distance(start, point) > distance(start, best) ? point : best, points[0]);
  const facing: Facing = start.x < grid[0].length / 2 ? 'east' : 'west';
  return { start: { ...start, facing }, exit };
};

const difficultyMask = (index: number, normalCount: number): readonly Difficulty[] => {
  const common = Math.ceil(normalCount * 0.72);
  if (index < common) return ['easy', 'normal', 'hard'];
  if (index < normalCount) return ['normal', 'hard'];
  return ['hard'];
};

const supplyFor = (episode: 1 | 2 | 3): readonly PickupId[] => episode === 1
  ? ['staples-small', 'fasteners-small', 'adhesive-bandage', 'goodwill-token', 'staples-large', 'field-medical-case', 'loss-control-vest', 'canister']
  : episode === 2
    ? ['staples-large', 'fasteners-large', 'canister', 'toner-cell', 'adhesive-bandage', 'field-medical-case', 'loss-control-vest', 'hazard-endorsement']
    : ['staples-large', 'fasteners-large', 'canister-crate', 'toner-cell', 'toner-pack', 'field-medical-case', 'catastrophe-suit', 'rapid-authority', 'emergency-reserve'];

const makeEncounterBlueprint = (spec: MapSpec, grid: readonly string[]): EncounterBlueprint => {
  const cells = baseRoutePoints(grid);
  const authored = ENCOUNTER_BLUEPRINTS[spec.id];
  const point = (index: number): GridPoint => cells[index % cells.length];
  return {
    entryAnchor: point(authored.anchors[0]),
    transformationAnchor: point(authored.anchors[1]),
    climaxAnchor: point(authored.anchors[2]),
    ambushFacing: authored.facing,
    infightingPocket: authored.infighting === undefined ? undefined : point(authored.infighting),
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
  const available = baseRoutePoints(grid).filter((point) => distance(point, start) > 4 && distance(point, exit) > 2);
  const authoredZones = {
    entry: [...available].sort((a, b) => distance(a, blueprint.entryAnchor) - distance(b, blueprint.entryAnchor)),
    transformation: [...available].sort((a, b) => distance(a, blueprint.transformationAnchor) - distance(b, blueprint.transformationAnchor)),
    climax: [...available].sort((a, b) => distance(a, blueprint.climaxAnchor) - distance(b, blueprint.climaxAnchor)),
  };
  const normalCount = phaseEnemyBudget(spec);
  const hardCount = normalCount + Math.ceil(normalCount * 0.25);
  const actors: ActorPlacement[] = [];
  const occupancy = new Map<string, number>();
  const occupy = (point: GridPoint): GridPoint => {
    const key = `${Math.floor(point.x)},${Math.floor(point.z)}`;
    const slot = occupancy.get(key) ?? 0;
    occupancy.set(key, slot + 1);
    const ring = Math.floor(slot / 8) + 1;
    const angle = (slot % 8) * Math.PI / 4;
    const radius = slot === 0 ? 0 : Math.min(.38, .11 * ring);
    const offsetX = Math.cos(angle) * radius;
    const offsetZ = Math.sin(angle) * radius;
    return { x: point.x + offsetX, z: point.z + offsetZ };
  };

  for (let i = 0; i < hardCount; i += 1) {
    const encounter = i < hardCount * 0.34 ? 'entry' : i < hardCount * 0.72 ? 'transformation' : 'climax';
    const encounterStart = encounter === 'entry' ? 0 : encounter === 'transformation' ? Math.ceil(hardCount * .34) : Math.ceil(hardCount * .72);
    const zone = authoredZones[encounter];
    let point = blueprint.infightingPocket && i > 0 && i % 19 === 0
      ? blueprint.infightingPocket
      : zone[(i * 7 + hash(`${spec.id}:${encounter}`)) % zone.length];
    if (spec.id === 'E1M1' && i === 0) point = { x: start.x + 3, z: start.z };
    const enemy = spec.enemies[(i * 5 + hash(`${spec.id}:${i}`)) % spec.enemies.length];
    actors.push({
      ...occupy(point),
      type: 'enemy',
      enemy,
      difficulties: difficultyMask(i, normalCount),
      dormant: i % 5 === 0,
      encounter,
      mandatory: i - encounterStart < 3,
      route: encounter,
      facing: i % 4 === 0 ? blueprint.ambushFacing : (['north', 'east', 'south', 'west'] as const)[i % 4],
    });
  }

  const supply = supplyFor(episode);
  const pickupCount = 10 + episode * 4 + Math.floor(normalCount / 25);
  for (let i = 0; i < pickupCount; i += 1) {
    const routeId = (['entry', 'transformation', 'climax'] as const)[i % 3];
    const route = authoredZones[routeId];
    const point = i % 5 === 0 ? blueprint.rewardPocket : route[(hardCount + i * 11) % route.length];
    // Five guaranteed boxes per route provide a conservative pistol-start
    // damage budget; authored later supplies add weapon-specific efficiency.
    actors.push({ ...occupy(point), type: 'pickup', pickup: i < 15 ? 'staples-large' : supply[i % supply.length], route: routeId });
  }

  spec.weapons.forEach((weapon, index) => {
    const point = available[(hardCount + pickupCount + index * 11) % available.length];
    actors.push({ ...occupy(point), type: 'weapon', weapon, secret: index > 0, route: index === 0 ? 'entry' : 'transformation' });
  });

  spec.credentials.forEach((credential, index) => {
    const ungated = baseRoutePoints(grid, 'sRYC').filter((point) => distance(point, start) > 2);
    const point = ungated[(hash(`${spec.id}:credential:${credential}`) + index * 7) % ungated.length] ?? available[index];
    actors.push({ ...occupy(point), type: 'credential', credential });
  });

  spec.bosses?.forEach((boss, index) => {
    const point = available.reduce((best, candidate) => {
      const offsetCenter = { x: blueprint.climaxAnchor.x + index * 2, z: blueprint.climaxAnchor.z };
      return distance(candidate, offsetCenter) < distance(best, offsetCenter) ? candidate : best;
    }, available[0]);
    actors.push({ ...occupy(point), type: 'boss', boss, encounter: `boss-${index + 1}`, facing: 'south' });
  });

  return actors;
};

const makeSecrets = (spec: MapSpec, grid: readonly string[]): readonly SecretDefinition[] => {
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
    const fallback = baseRoutePoints(grid).filter((point) => distance(point, secret) >= 2);
    return neighbors[0] ?? fallback[hash(`${spec.id}:secret-switch:${index}`) % fallback.length];
  };
  return secretPoints.slice(0, spec.secretClues.length).map((at, index) => {
    const clue = spec.secretClues[index];
    return {
      id: `${spec.id.toLowerCase()}-secret-${index + 1}`,
      clue,
      reward: index % 4 === 0 ? 'armor or over-heal' : index % 4 === 1 ? 'ammunition efficiency' : index % 4 === 2 ? 'shortcut or map information' : 'early weapon or powerup',
      rewardPickup: (['goodwill-token', 'staples-large', 'floor-plan', 'hazard-endorsement'] as const)[index % 4],
      clueProp: (['office-phone-stamp', 'evidence-case-cart', 'desk-lamp-paper-stack'] as const)[index % 3],
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
  const grid = getLayout(spec.layout, episode.number);
  const { start, exit } = chooseStartExit(grid);
  const encounterBlueprint = makeEncounterBlueprint(spec, grid);
  const secrets = makeSecrets(spec, grid);
  const landmarks = makeLandmarks(spec, grid);
  const breakables = makeBreakables(spec, grid, episode.number, landmarks);
  const mechanisms = makeMechanisms(spec, grid, landmarks);
  const actors: readonly ActorPlacement[] = [
    ...makeActors(spec, grid, episode.number, start, exit, encounterBlueprint),
    ...secrets.map((secret, index) => ({
      x: secret.at.x + (index % 2 === 0 ? -.12 : .12),
      z: secret.at.z + (index % 3 === 0 ? -.12 : .12),
      type: 'pickup' as const,
      pickup: secret.rewardPickup,
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
    music: `music.${spec.id.toLowerCase()}`,
    sky: skies[episode.number],
    parSeconds: experiencedPar(spec),
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
      { id: 'entry', label: 'Approach pressure', zones: ['entry'], roles: ['pressure', 'shape'], completion: 'clear' },
      { id: 'transformation', label: 'Signature mechanism contest', zones: ['transformation'], roles: ['anchor', 'pressure', 'reward'], completion: 'switch', opens: ['climax'] },
      { id: 'climax', label: 'Exit-route crossfire', zones: ['climax'], roles: ['anchor', 'pressure', 'shape', 'punish'], completion: 'clear', opens: spec.bosses?.length ? ['boss-1'] : ['map-exit'] },
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
