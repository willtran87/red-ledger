import { CAMPAIGN, type CampaignMap, type Credential, type MapId } from '../data';
import { INPUT_ACTIONS, bindingLabel, type CaptureResult, type InputAction } from './InputBindings';
import {
  DEFAULT_INPUT_PREFERENCES,
  normalizeInputPreferences,
  type InputActionEvent,
  type InputPreferences,
  type MenuNavigationEvent,
} from './InputSystem';
import { WEAPONS, type GameDifficulty } from './definitions';
import { ControllerHaptics } from './ControllerHaptics';
import {
  GameEngine,
  combatMomentumPresentation,
  type CombatMomentumEventDetail,
  type ContinueDetails,
  type DeathReview,
  type ExitReview,
  type GameSnapshot,
  type MapResult,
  type PauseDetails,
  type WeaponImpactEventDetail,
} from './GameEngine';
import { ASSET_DEGRADED_EVENT, runtimeUrl } from './AssetCatalog';
import {
  AUDIO_CAPTION_EVENT,
  DEFAULT_AUDIO_SETTINGS,
  type AudioCaptionDetail,
  type AudioSettings,
  type AudioPlaybackProfile,
} from './AudioSystem';
import {
  DEMO_SCHEMA_VERSION,
  PERSISTENCE_CONFLICT_EVENT,
  PERSISTENCE_DEGRADED_EVENT,
  hasMasteryProof,
  mapRecordKey,
  type CampaignUnlocks,
  type MapPerformance,
  type MapRecord,
  type PersistenceConflict,
  type RunVariant,
} from './PersistenceSystem';
import {
  deriveMilestones,
  filterMilestones,
  milestoneHighlights,
  newlyEarnedMilestones,
  type MilestoneFilter,
  type MilestoneId,
  type MilestoneStatus,
} from './Milestones';

type PortraitState = 'neutral' | 'pain-center' | 'pain-left' | 'pain-right' | 'glance-left' | 'glance-right' | 'weapon-acquired' | 'overcharge' | 'invulnerable' | 'dead';
export type EntryInputDevice = 'desktop' | 'gamepad' | 'touch';

export const shouldPreviewDifficultyOnPointer = (pointerType: string, activeDevice: EntryInputDevice): boolean =>
  pointerType !== 'touch' && activeDevice === 'desktop';

export const weaponImpactLabel = (detail: Pick<WeaponImpactEventDetail, 'damage' | 'killed'>): string => {
  if (detail.killed) return 'CLOSED';
  const damage = Math.max(0, Math.round(detail.damage ?? 0));
  return damage > 0 ? `HIT ${damage}` : 'HIT';
};

export const weaponImpactFeedbackDuration = (killed = false): number => killed ? 900 : 650;

interface ReplayLibraryEntry {
  id: string;
  name: string;
  mapId: MapId;
  createdAt: number;
  duration: number;
  demo: unknown;
  sessionOnly?: true;
}

type ReplayStoreResult = 'persistent' | 'session-only' | 'invalid';

const REPLAY_LIBRARY_KEY = 'red-ledger-replays-v3';
const LEGACY_REPLAY_LIBRARY_KEYS = ['red-ledger-replays-v2', 'red-ledger-replays-v1'] as const;
const REPLAY_LIBRARY_BYTES = 3_500_000;
const REPLAY_LIBRARY_LIMIT = 6;

export type TouchControlSize = 'small' | 'standard' | 'large';
export type TouchHandedness = 'right' | 'left';
export type UiTextScale = 'standard' | 'large' | 'largest';

export interface InterfacePreferences {
  touchControlSize: TouchControlSize;
  touchControlOpacity: number;
  touchHandedness: TouchHandedness;
  uiTextScale: UiTextScale;
}

export const DEFAULT_INTERFACE_PREFERENCES: Readonly<InterfacePreferences> = Object.freeze({
  touchControlSize: 'standard',
  touchControlOpacity: .78,
  touchHandedness: 'right',
  uiTextScale: 'standard',
});

export const normalizeInterfacePreferences = (value: unknown): InterfacePreferences => {
  const record = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const sizes: readonly TouchControlSize[] = ['small', 'standard', 'large'];
  const hands: readonly TouchHandedness[] = ['right', 'left'];
  const textScales: readonly UiTextScale[] = ['standard', 'large', 'largest'];
  const opacity = typeof record.touchControlOpacity === 'number' && Number.isFinite(record.touchControlOpacity)
    ? Math.max(.45, Math.min(1, record.touchControlOpacity))
    : DEFAULT_INTERFACE_PREFERENCES.touchControlOpacity;
  return {
    touchControlSize: sizes.includes(record.touchControlSize as TouchControlSize)
      ? record.touchControlSize as TouchControlSize
      : DEFAULT_INTERFACE_PREFERENCES.touchControlSize,
    touchControlOpacity: opacity,
    touchHandedness: hands.includes(record.touchHandedness as TouchHandedness)
      ? record.touchHandedness as TouchHandedness
      : DEFAULT_INTERFACE_PREFERENCES.touchHandedness,
    uiTextScale: textScales.includes(record.uiTextScale as UiTextScale)
      ? record.uiTextScale as UiTextScale
      : DEFAULT_INTERFACE_PREFERENCES.uiTextScale,
  };
};

export interface RecommendedOptionSettings {
  input: InputPreferences;
  presentation: InterfacePreferences;
  renderScale: 1;
  hudMode: 'classic';
  classicInput: false;
  verticalAutoAim: true;
  controllerVibration: true;
  screenShake: boolean;
  reducedMotion: boolean;
  highContrast: false;
  reducedEffects: false;
  flashEffects: true;
  soundCaptions: false;
  audio: AudioSettings;
}

export const recommendedOptionSettings = (systemPrefersReducedMotion: boolean): RecommendedOptionSettings => ({
  input: { ...DEFAULT_INPUT_PREFERENCES },
  presentation: { ...DEFAULT_INTERFACE_PREFERENCES },
  renderScale: 1,
  hudMode: 'classic',
  classicInput: false,
  verticalAutoAim: true,
  controllerVibration: true,
  screenShake: !systemPrefersReducedMotion,
  reducedMotion: systemPrefersReducedMotion,
  highContrast: false,
  reducedEffects: false,
  flashEffects: true,
  soundCaptions: false,
  audio: { ...DEFAULT_AUDIO_SETTINGS },
});

export interface AudioProfilePresentation {
  label: string;
  detail: string;
}

const AUDIO_PROFILE_PRESENTATIONS: Readonly<Record<AudioPlaybackProfile, AudioProfilePresentation>> = Object.freeze({
  speakers: {
    label: 'Speakers',
    detail: 'Balanced stereo direction with full music and effects range.',
  },
  headphones: {
    label: 'Headphones',
    detail: 'Full stereo direction with slightly restrained music and effects for close listening.',
  },
  night: {
    label: 'Night',
    detail: 'Compressed dynamics and quieter music help critical cues stay readable at low volume.',
  },
  mono: {
    label: 'Mono',
    detail: 'Centers directional cues in one compatible channel while retaining semantic captions.',
  },
});

export const audioProfilePresentation = (profile: AudioPlaybackProfile): AudioProfilePresentation =>
  AUDIO_PROFILE_PRESENTATIONS[profile];

export const DIFFICULTY_OPTIONS: ReadonlyArray<{ id: GameDifficulty; label: string; detail: string }> = [
  { id: 'orientation', label: 'Orientation', detail: 'Story-focused: 50% more ammo from pickups, fewer and slower threats, and forgiving damage.' },
  { id: 'desk-adjuster', label: 'Desk Adjuster', detail: 'Measured: 25% more ammo from pickups, fewer threats, and reduced threat speed and damage.' },
  { id: 'field-adjuster', label: 'Field Adjuster', detail: 'Recommended: standard ammo pickups with the intended threat placements, speed, and damage.' },
  { id: 'catastrophe-team', label: 'Catastrophe Team', detail: 'Hard placements with ammo from pickups reduced to 80%; threat speed and damage remain standard.' },
  { id: 'binding-authority', label: 'Binding Authority', detail: 'Hard placements, ammo from pickups reduced to 65%, and faster, harder-hitting threats.' },
];

const formatTime = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const formatLabel = (value: string): string => value.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
const CONTROLLER_DISCONNECTED_WARNING = 'Controller disconnected. Reconnect it or continue with keyboard, mouse, or touch controls.';
const CONTROLLER_RECONNECTED_ANNOUNCEMENT = 'Controller reconnected. Controller input is available.';

type ActiveEffectKey = keyof GameSnapshot['player']['powerups'];

export interface AnnouncementCandidate {
  readonly message: string;
  readonly priority: number;
}

export const preferredAnnouncement = (
  current: AnnouncementCandidate | undefined,
  next: AnnouncementCandidate,
): AnnouncementCandidate => !current || next.priority >= current.priority ? next : current;

export interface ActiveEffectPresentation {
  readonly key: ActiveEffectKey;
  readonly assetId: string;
  readonly label: string;
  readonly effect: string;
  readonly seconds: number;
  readonly progress: number;
  readonly urgent: boolean;
}

const ACTIVE_EFFECT_DURATION = 30;
const ACTIVE_EFFECT_DEFINITIONS: readonly Omit<ActiveEffectPresentation, 'seconds' | 'progress' | 'urgent'>[] = [
  { key: 'binder', assetId: 'temporary-binder', label: 'Temporary Binder', effect: 'Blocks all damage.' },
  { key: 'hazard', assetId: 'hazard-endorsement', label: 'Hazard Endorsement', effect: 'Prevents floor hazard damage.' },
  { key: 'rapid', assetId: 'rapid-authority', label: 'Rapid Authority', effect: 'Weapons fire faster.' },
  { key: 'forensic', assetId: 'forensic-lens', label: 'Forensic Lens', effect: 'Reveals threats and slows their targeting.' },
  { key: 'goggles', assetId: 'night-goggles', label: 'Night Inspection Goggles', effect: 'Improves distance visibility.' },
];

/** Produces stable, display-ready timed effects without mutating simulation state. */
export const activeEffectsPresentation = (
  powerups: Readonly<Partial<GameSnapshot['player']['powerups']>>,
): readonly ActiveEffectPresentation[] => ACTIVE_EFFECT_DEFINITIONS.flatMap((definition) => {
  const remaining = powerups[definition.key];
  if (typeof remaining !== 'number' || !Number.isFinite(remaining) || remaining <= 0) return [];
  return [{
    ...definition,
    seconds: Math.ceil(remaining),
    progress: Math.ceil(Math.min(1, remaining / ACTIVE_EFFECT_DURATION) * 100),
    urgent: remaining <= 5,
  }];
});

export interface MasteryPresentation {
  target: string;
  comparison: string;
  metrics: readonly string[];
  complete: boolean;
}

const recordPercentages = (record: MapRecord | MapPerformance) => 'bestKillsPercent' in record
  ? { threats: record.bestKillsPercent, items: record.bestItemsPercent, secrets: record.bestSecretsPercent }
  : { threats: record.killsPercent, items: record.itemsPercent, secrets: record.secretsPercent };

export const masteryPresentation = (mapId: MapId, record?: MapRecord, current?: MapPerformance): MasteryPresentation => {
  const map = CAMPAIGN.maps[mapId];
  if (!record) return {
    target: 'Retry goal: First clear',
    comparison: `Par ${formatTime(map.parSeconds)}`,
    metrics: ['Threats --', 'Items --', 'Secrets --'],
    complete: false,
  };
  const recordValues = recordPercentages(record);
  const currentValues = current ? recordPercentages(current) : recordValues;
  const gaps = [
    { label: 'Close every threat', value: recordValues.threats, weight: .35 },
    { label: 'Find every secret', value: recordValues.secrets, weight: .25 },
    { label: 'Recover every item', value: recordValues.items, weight: .15 },
  ].filter(({ value }) => value < 100).sort((left, right) =>
    (100 - right.value) * right.weight - (100 - left.value) * left.weight);
  const missedPar = !record.parBeaten;
  const complete = hasMasteryProof(record);
  const target = missedPar
    ? `Retry goal: Beat par ${formatTime(map.parSeconds)}`
    : gaps.length
      ? `Retry goal: ${gaps[0].label} (${gaps[0].value}%)`
      : record.bestGrade !== 'S'
        ? `Retry goal: Raise grade ${record.bestGrade}`
        : complete
          ? 'Full mastery achieved'
          : 'Retry goal: Complete every goal in one run';
  const comparison = current
    ? current.elapsed <= record.bestTime
      ? `Current ${formatTime(current.elapsed)} | PB matched | ${current.score} pts`
      : `Current ${formatTime(current.elapsed)} | ${formatTime(current.elapsed - record.bestTime)} behind PB | ${current.score}/${record.highScore} pts`
    : `Grade ${record.bestGrade} | PB ${formatTime(record.bestTime)} | ${record.highScore} pts | Chain x${record.bestChain}`;
  return {
    target,
    comparison,
    metrics: [
      `Threats ${currentValues.threats}%${current ? ` / PB ${record.bestKillsPercent}%` : ''}`,
      `Items ${currentValues.items}%${current ? ` / PB ${record.bestItemsPercent}%` : ''}`,
      `Secrets ${currentValues.secrets}%${current ? ` / PB ${record.bestSecretsPercent}%` : ''}`,
    ],
    complete,
  };
};

export const runVariantUiLabel = (runVariant: RunVariant): string => ({
  'fresh-start': 'Fresh Start',
  'campaign-carry': 'Campaign Carry',
  'legacy-unclassified': 'Legacy Run (retained)',
})[runVariant];

export interface EntryFieldOrderPresentation {
  readonly trackLabel: string;
  readonly target: string;
  readonly comparison: string;
  readonly metrics: readonly string[];
  readonly complete: boolean;
  readonly summary: string;
}

/** A returning briefing only shows goals backed by the exact record track being played. */
export const entryFieldOrderPresentation = (
  mapId: MapId,
  progress: CampaignUnlocks,
  difficulty: GameDifficulty,
  runVariant: RunVariant,
): EntryFieldOrderPresentation | undefined => {
  const record = progress.records[mapRecordKey(mapId, difficulty, runVariant)];
  if (!record) return undefined;
  const mastery = masteryPresentation(mapId, record);
  const trackLabel = runVariantUiLabel(runVariant);
  const target = mastery.complete
    ? `Priority: Beat PB ${formatTime(record.bestTime)} or ${record.highScore} pts`
    : mastery.target.replace('Retry goal: ', 'Priority: ');
  return {
    trackLabel,
    target,
    comparison: mastery.comparison,
    metrics: mastery.metrics,
    complete: mastery.complete,
    summary: `${trackLabel} field order. ${target}. Record: ${mastery.comparison}. ${mastery.metrics.join('. ')}.`,
  };
};

export interface LevelSelectRecordTracks {
  readonly freshStart?: MapRecord;
  readonly campaignCarry?: MapRecord;
  readonly legacy?: MapRecord;
}

export const levelSelectRecordTracks = (
  progress: CampaignUnlocks,
  mapId: MapId,
  difficulty: GameDifficulty,
): LevelSelectRecordTracks => ({
  freshStart: progress.records[mapRecordKey(mapId, difficulty, 'fresh-start')],
  campaignCarry: progress.records[mapRecordKey(mapId, difficulty, 'campaign-carry')],
  legacy: progress.records[mapRecordKey(mapId, difficulty, 'legacy-unclassified')],
});

export interface TrackedIntermissionMastery {
  readonly result: MasteryPresentation;
  readonly retry: MasteryPresentation;
  readonly resultTrack: RunVariant;
  readonly resultLabel: string;
  readonly retryTarget: string;
}

export const trackedIntermissionMastery = (
  mapId: MapId,
  progress: CampaignUnlocks,
  difficulty: GameDifficulty,
  resultTrack: RunVariant,
  resultRecord?: MapRecord,
  current?: MapPerformance,
): TrackedIntermissionMastery => {
  const retry = masteryPresentation(
    mapId,
    progress.records[mapRecordKey(mapId, difficulty, 'fresh-start')],
  );
  return {
    result: masteryPresentation(mapId, resultRecord, current),
    retry,
    resultTrack,
    resultLabel: runVariantUiLabel(resultTrack),
    retryTarget: retry.complete
      ? 'Fresh Start mastery achieved'
      : retry.target.replace('Retry goal: ', 'Retry goal: Fresh Start - '),
  };
};

export const masteryAggregatePresentation = (
  progress: CampaignUnlocks,
  difficulty: GameDifficulty,
  runVariant: RunVariant,
  episodeIndex?: number,
): string => {
  const episodes = episodeIndex === undefined ? CAMPAIGN.episodes : [CAMPAIGN.episodes[episodeIndex]];
  const maps = episodes.flatMap((episode) => episode.maps).filter((id) => !CAMPAIGN.maps[id].secretMap);
  const records = maps.flatMap((id) => {
    const record = progress.records[mapRecordKey(id, difficulty, runVariant)];
    return record ? [record] : [];
  });
  const pars = records.filter((record) => record.parBeaten).length;
  const elite = records.filter((record) => record.bestGrade === 'S' || record.bestGrade === 'A').length;
  const mastered = records.filter(hasMasteryProof).length;
  const track = runVariantUiLabel(runVariant);
  if (episodeIndex === undefined) {
    const completedEpisodes = CAMPAIGN.episodes.filter((episode) => episode.maps
      .filter((id) => !CAMPAIGN.maps[id].secretMap)
      .every((id) => progress.records[mapRecordKey(id, difficulty, runVariant)])).length;
    return `${track} Campaign ${records.length}/${maps.length} clear | ${completedEpisodes}/${CAMPAIGN.episodes.length} episodes | ${pars} par | ${elite} A+ | ${mastered} mastered`;
  }
  const secretMaps = CAMPAIGN.episodes[episodeIndex].maps.filter((id) => CAMPAIGN.maps[id].secretMap);
  const knownSecrets = secretMaps.filter((id) => progress.discoveredSecretMaps.includes(id)).length;
  return `${track} Episode ${records.length}/${maps.length} clear | ${pars} par | ${elite} A+ | ${mastered} mastered | ${knownSecrets}/${secretMaps.length} secret routes`;
};

export const resolveReducedMotionSetting = (
  settings: Readonly<Record<string, unknown>>,
  systemPrefersReducedMotion: boolean,
): boolean => typeof settings['reduced-motion'] === 'boolean'
  ? settings['reduced-motion']
  : systemPrefersReducedMotion;

export const resolveScreenShakeSetting = (
  settings: Readonly<Record<string, unknown>>,
  systemPrefersReducedMotion: boolean,
): boolean => typeof settings['screen-shake'] === 'boolean'
  ? settings['screen-shake']
  : !systemPrefersReducedMotion;

const SENSITIVITY_RANGE_IDS = new Set(['sensitivity', 'controller-sensitivity', 'touch-sensitivity']);

export const formatRangeSetting = (id: string, value: number): string =>
  SENSITIVITY_RANGE_IDS.has(id) ? `${value.toFixed(1)}x` : `${Math.round(value * 100)}%`;

export const entryBriefingLabels = (initialOrientation: boolean): readonly string[] => initialOrientation
  ? ['MOVE', 'LOOK', 'FIRE', 'USE']
  : ['USE', 'WEAPON', 'MAP'];

export const touchBriefingPadLabels = (handedness: TouchHandedness): { move: string; look: string } =>
  handedness === 'left'
    ? { move: 'Right pad', look: 'Left pad' }
    : { move: 'Left pad', look: 'Right pad' };

export const entryObjectiveCue = (map: CampaignMap): string => {
  const authorities = map.actors
    .filter((actor) => actor.type === 'boss')
    .map((actor) => formatLabel(actor.boss));
  if (authorities.length) return `Contain ${authorities.join(' and ')}, work the authority controls, then reach the outbound file.`;
  const credentials = [...new Set(map.actors
    .filter((actor) => actor.type === 'credential')
    .map((actor) => formatLabel(actor.credential)))];
  if (credentials.length) {
    return `Secure ${credentials.join(' and ')} credential${credentials.length === 1 ? '' : 's'}, work the marked controls, then reach the outbound file.`;
  }
  return 'Clear the required response, work the marked controls, then reach the outbound file.';
};

const sentenceFragment = (value: string): string => value.trim().replace(/[.!?]+$/, '');

export const entryObjectiveBriefing = (
  snapshot: Readonly<Pick<GameSnapshot, 'map' | 'objective'>>,
  includeAuthoredRoute = true,
): string => {
  const immediate = sentenceFragment(snapshot.objective) || 'Review the current objective';
  if (!includeAuthoredRoute) return `Current objective: ${immediate}.`;
  const route = sentenceFragment(entryObjectiveCue(snapshot.map));
  return `First: ${immediate}. Then: ${route}.`;
};

export interface AssistiveGameplayGuidanceState {
  readonly objective: string;
  readonly interactionSignature: string;
}

export interface AssistiveGameplayGuidanceInput {
  readonly active: boolean;
  readonly transientMessage: string;
  readonly objective: string;
  readonly interaction?: {
    readonly signature: string;
    readonly label: string;
    readonly state: 'ready' | 'locked';
  };
}

export const advanceAssistiveGameplayGuidance = (
  input: Readonly<AssistiveGameplayGuidanceInput>,
  state: Readonly<AssistiveGameplayGuidanceState>,
): { state: AssistiveGameplayGuidanceState; announcement?: string } => {
  if (!input.active) return { state };

  const interactionSignature = input.interaction?.signature ?? '';
  if (input.transientMessage) {
    return interactionSignature || !state.interactionSignature
      ? { state }
      : { state: { ...state, interactionSignature: '' } };
  }

  const objective = input.objective.trim();
  const announcement: string[] = [];
  if (objective && objective !== state.objective) {
    announcement.push(`Objective: ${sentenceFragment(objective)}.`);
  }
  if (input.interaction && interactionSignature !== state.interactionSignature) {
    const prefix = input.interaction.state === 'locked' ? 'Blocked' : 'Action available';
    announcement.push(`${prefix}: ${sentenceFragment(input.interaction.label)}.`);
  }
  const nextState = { objective, interactionSignature };
  return announcement.length ? { state: nextState, announcement: announcement.join(' ') } : { state: nextState };
};

export const milestoneAwardAnnouncement = (awards: readonly MilestoneStatus[]): string => awards
  .map((milestone) => `Milestone earned: ${milestone.name}. Cosmetic seal: ${milestone.reward.label}.`)
  .join(' ');

export const resolveEquippedMilestoneSeal = (
  value: unknown,
  milestones: readonly MilestoneStatus[],
): MilestoneId | undefined => typeof value === 'string'
  ? milestones.find((milestone) => milestone.id === value && milestone.earned)?.id
  : undefined;

const updateText = (element: Element, value: string): void => {
  if (element.textContent !== value) element.textContent = value;
};

const updateAttribute = (element: Element, name: string, value: string): void => {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
};

const updateStyle = (element: HTMLElement, property: string, value: string): void => {
  if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
};

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};

export const automapPanDelta = (pixels: number, renderedCellSize: number): number =>
  Number.isFinite(renderedCellSize) && renderedCellSize > 0 ? pixels / renderedCellSize : 0;

export type CredentialMapCueShape = 'square' | 'circle' | 'diamond';

export interface CredentialMapCue {
  readonly credential: Credential;
  readonly glyph: 'R' | 'Y' | 'C';
  readonly shape: CredentialMapCueShape;
  readonly color: string;
}

const CREDENTIAL_MAP_CUES: Readonly<Record<Credential, CredentialMapCue>> = {
  red: { credential: 'red', glyph: 'R', shape: 'square', color: '#ff5964' },
  yellow: { credential: 'yellow', glyph: 'Y', shape: 'circle', color: '#ffe17a' },
  cyan: { credential: 'cyan', glyph: 'C', shape: 'diamond', color: '#53d7df' },
};

/** Critical route locks always carry color, shape, and text redundancy. */
export const credentialMapCue = (credential: Credential): CredentialMapCue => CREDENTIAL_MAP_CUES[credential];

export const boundedReplayEntries = <T extends { id: string; createdAt: number }>(
  entries: readonly T[],
  requiredEntryId?: string,
  countLimit = REPLAY_LIBRARY_LIMIT,
  byteLimit = REPLAY_LIBRARY_BYTES,
): T[] => {
  const sorted = [...entries].sort((left, right) => right.createdAt - left.createdAt);
  const required = requiredEntryId ? sorted.find((entry) => entry.id === requiredEntryId) : undefined;
  const protectedId = required?.id ?? sorted[0]?.id;
  const bounded = required
    ? [required, ...sorted.filter((entry) => entry.id !== required.id)].slice(0, Math.max(1, countLimit))
    : sorted.slice(0, Math.max(1, countLimit));
  bounded.sort((left, right) => right.createdAt - left.createdAt);
  const removeOldestOptional = (): boolean => {
    let index = bounded.length - 1;
    while (index >= 0 && bounded[index].id === protectedId) index -= 1;
    if (index < 0) return false;
    bounded.splice(index, 1);
    return true;
  };
  while (JSON.stringify(bounded).length * 2 > byteLimit && removeOldestOptional()) {
    // A single protected replay may exceed the aggregate target, but is never silently discarded.
  }
  return bounded;
};

export class UIController {
  private pendingEpisode = 0;
  private pendingDifficulty: GameDifficulty = 'field-adjuster';
  private automapVisible = false;
  private automapMode: 'full' | 'overlay' = 'full';
  private automapZoom = 1;
  private automapPan = { x: 0, z: 0 };
  private automapDrag?: { pointerId: number; originX: number; originY: number; x: number; y: number; moved: boolean };
  private readonly playerTrail: Array<{ x: number; z: number }> = [];
  private trailMap = '';
  private weaponTimer?: number;
  private weaponFrameTimers: number[] = [];
  private lastMode = '';
  private currentWeapon = '';
  private portraitUntil = 0;
  private optionsReturn = 'menu';
  private capturingAction?: InputAction;
  private radialActive = false;
  private radialWeapon?: keyof typeof WEAPONS;
  private weaponSwitchAnimation?: Animation;
  private confirmAction?: () => void;
  private focusBeforeDialog?: HTMLElement;
  private slotReturn = 'pause-menu';
  private lastAnnouncedMessage = '';
  private useFeedbackTimer?: number;
  private hitMarkerTimer?: number;
  private muzzleFlashTimer?: number;
  private weaponVisualToken = 0;
  private weaponBobPhase = 0;
  private weaponBob = { x: 0, y: 0 };
  private lastView?: { x: number; z: number; yaw: number };
  private levelSelectReturn: 'menu' | 'intermission' = 'menu';
  private milestoneReturn: 'menu' | 'level-select' | 'intermission' = 'menu';
  private milestoneFilter: MilestoneFilter = 'all';
  private equippedMilestoneSeal?: MilestoneId;
  private readonly knownEarnedMilestoneIds = new Set<string>();
  private replayReturn: 'menu' | 'pause-menu' = 'menu';
  private sessionReplays: ReplayLibraryEntry[] = [];
  private entryDevice: EntryInputDevice = 'desktop';
  private entryContinuation?: () => void;
  private readonly runtimeWarnings = new Set<string>();
  private readonly screenFocusHistory = new Map<string, HTMLElement>();
  private reticleKick = 0;
  private lastCredentialSignature = '';
  private lastActiveEffectsSignature = '';
  private lastInteractionSignature?: string;
  private latestSnapshot?: Readonly<GameSnapshot>;
  private assistiveGuidanceState: AssistiveGameplayGuidanceState = { objective: '', interactionSignature: '' };
  private lastPortraitFile = '';
  private audioReadyRequested = false;
  private entryPreparationToken = 0;
  private soundCaptionTimer?: number;
  private announcementFrame?: number;
  private pendingAnnouncement?: AnnouncementCandidate;
  private readonly controllerHaptics = new ControllerHaptics();

  constructor(readonly game: GameEngine) {
    window.addEventListener(PERSISTENCE_DEGRADED_EVENT, () => this.showRuntimeWarning(
      'Browser storage is unavailable. Progress is protected for this session, but it will be lost when this tab closes.',
    ));
    window.addEventListener(PERSISTENCE_CONFLICT_EVENT, (event) => this.showRuntimeWarning(
      (event as CustomEvent<PersistenceConflict>).detail.message,
    ));
    this.game.persistenceConflicts().forEach((conflict) => this.showRuntimeWarning(conflict.message));
    window.addEventListener(ASSET_DEGRADED_EVENT, () => this.showRuntimeWarning(
      'One or more visual assets could not load. Safe placeholder art is in use; reload when the connection is stable.',
    ));
    deriveMilestones(this.game.campaignProgress())
      .filter((milestone) => milestone.earned)
      .forEach((milestone) => this.knownEarnedMilestoneIds.add(milestone.id));
    this.buildEpisodeCards();
    this.buildDifficulties();
    this.bindActions();
    this.setEntryDevice(window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop');
    this.game.onChange = (snapshot) => this.update(snapshot);
    this.game.onIntermission = () => this.showIntermission();
    this.updateContinue();
    window.addEventListener('weapon-fire', (event) => {
      const detail = (event as CustomEvent<{ weapon: keyof typeof WEAPONS; duration: number; recoil: number }>).detail;
      this.flashWeapon(detail);
      this.controllerHaptics.cue(detail.recoil >= .04 ? 'weapon-heavy' : 'weapon-light');
    });
    window.addEventListener('view-recoil', (event) => this.viewRecoil((event as CustomEvent<{ amount: number }>).detail));
    window.addEventListener('weapon-impact', (event) => this.impactFeedback((event as CustomEvent<WeaponImpactEventDetail>).detail));
    window.addEventListener('weapon-dry', (event) => {
      this.dryWeapon((event as CustomEvent<{ weapon: keyof typeof WEAPONS }>).detail);
      this.controllerHaptics.cue('failure');
    });
    window.addEventListener('player-portrait', (event) => this.specialPortrait((event as CustomEvent<{ state: PortraitState }>).detail.state));
    window.addEventListener('weapon-switch', (event) => this.animateWeaponSwitch((event as CustomEvent<{
      state: 'lowering' | 'raising' | 'ready'; duration: number;
    }>).detail));
    window.addEventListener('player-hurt', (event) => {
      this.hurtFlash((event as CustomEvent<{ direction?: 'left' | 'right' | 'center' }>).detail);
      this.controllerHaptics.cue('damage');
    });
    window.addEventListener('use-failed', (event) => {
      this.useFailure((event as CustomEvent<{
        reason: 'credential' | 'encounter' | 'nothing';
        direction: 'left' | 'right' | 'center';
        icon: string;
        credential?: string;
      }>).detail);
      this.controllerHaptics.cue('failure');
    });
    window.addEventListener('pickup-collected', () => this.controllerHaptics.cue('pickup'));
    window.addEventListener('demo-recording-complete', (event) => {
      const detail = (event as CustomEvent<{ demo: unknown; reason: string }>).detail;
      const result = this.storeReplay(detail.demo);
      const message = this.replayStorageMessage(detail.reason, result);
      this.buildReplayLibrary();
      this.showMessageInReplayLibrary(message);
      if (detail.reason === 'size' || detail.reason === 'duration' || result !== 'persistent') {
        this.showRuntimeWarning(message);
      }
    });
    this.loadSettings();
    if (this.game.persistence.storageStatus().mode === 'memory-fallback') this.showRuntimeWarning(
      'Browser storage is unavailable. Progress is protected for this session, but it will be lost when this tab closes.',
    );
    if (this.game.assets.status().mode === 'placeholder-fallback') this.showRuntimeWarning(
      'One or more visual assets could not load. Safe placeholder art is in use; reload when the connection is stable.',
    );
  }

  private buildEpisodeCards(): void {
    const container = $('#episode-cards');
    ['First Notice', 'Exclusions Apply', 'Adverse Development'].forEach((title, index) => {
      const button = document.createElement('button');
      button.className = 'episode-card';
      button.title = title;
      button.dataset.title = title;
      button.setAttribute('aria-label', title);
      button.style.backgroundImage = `url('${runtimeUrl(`public_runtime/ui/episode-select-${index + 1}.png`)}')`;
      const label = document.createElement('span');
      button.append(label);
      button.disabled = !this.game.isEpisodeUnlocked(index);
      label.textContent = `Episode ${index + 1}: ${title}${button.disabled ? ' - Locked' : ''}`;
      if (button.disabled) button.title = `${title} - locked`;
      button.addEventListener('click', () => {
        this.pendingEpisode = index;
        $<HTMLButtonElement>('#difficulty-confirm').toggleAttribute('hidden', true);
        this.syncDifficultySelection();
        this.showScreen('difficulty-menu');
      });
      container.append(button);
    });
  }

  private buildDifficulties(): void {
    const container = $('#difficulty-actions');
    const detail = $('#difficulty-detail');
    const confirmation = $<HTMLButtonElement>('#difficulty-confirm');
    const describe = (copy: string) => { detail.textContent = copy; };
    DIFFICULTY_OPTIONS.forEach(({ id, label, detail: copy }) => {
      const button = document.createElement('button');
      const description = document.createElement('span');
      let activationPointer = '';
      button.textContent = id === 'field-adjuster' ? `${label} - Recommended` : label;
      button.dataset.difficulty = id;
      button.setAttribute('aria-pressed', String(id === this.pendingDifficulty));
      description.id = `difficulty-${id}-description`;
      description.className = 'visually-hidden';
      description.textContent = copy;
      button.setAttribute('aria-describedby', description.id);
      button.addEventListener('focus', () => describe(copy));
      button.addEventListener('pointerenter', (event) => {
        if (shouldPreviewDifficultyOnPointer(event.pointerType, this.entryDevice)) describe(copy);
      });
      button.addEventListener('pointerdown', (event) => { activationPointer = event.pointerType; });
      button.addEventListener('keydown', () => { activationPointer = 'keyboard'; });
      button.addEventListener('click', () => {
        this.game.audio.unlock();
        this.pendingDifficulty = id;
        this.syncDifficultySelection();
        if (activationPointer === 'touch') {
          confirmation.toggleAttribute('hidden', false);
          activationPointer = '';
          return;
        }
        activationPointer = '';
        this.showEpisodeIntro();
      });
      button.classList.toggle('selected', id === this.pendingDifficulty);
      container.append(button, description);
    });
    this.syncDifficultySelection();
  }

  private syncDifficultySelection(): void {
    const selected = DIFFICULTY_OPTIONS.find(({ id }) => id === this.pendingDifficulty) ?? DIFFICULTY_OPTIONS[2];
    $('#difficulty-actions').querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      const active = button.dataset.difficulty === selected.id;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('selected', active);
    });
    $('#difficulty-detail').textContent = selected.detail;
    $<HTMLButtonElement>('#difficulty-confirm').textContent = `Continue: ${selected.label}`;
  }

  private bindActions(): void {
    window.addEventListener('pointerdown', (event) => {
      this.unlockAudio();
      this.setEntryDevice(event.pointerType === 'touch' ? 'touch' : 'desktop');
    }, { capture: true });
    window.addEventListener('keydown', () => {
      this.unlockAudio();
      this.setEntryDevice('desktop');
    }, { capture: true });
    document.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
      if (!button || button.disabled || !button.closest('.screen, dialog, #ready-overlay')) return;
      if (button.id === 'audio-preview') return;
      const isBack = button.matches('[data-back], #confirm-cancel, #controls-back, .slot-back, #replay-back, #replay-exit');
      this.game.audio.uiCue(isBack ? 'menu-back' : 'menu-accept');
    }, { capture: true });
    $('#new-game').addEventListener('click', () => { this.updateEpisodeLocks(); this.showScreen('episode-menu'); });
    $('#difficulty-confirm').addEventListener('click', () => {
      this.game.audio.unlock();
      this.showEpisodeIntro();
    });
    $('#continue-game').addEventListener('click', () => {
      this.game.audio.unlock();
      if (this.game.load()) {
        $('#menu-feedback').textContent = '';
        this.prepareGameEntry();
      } else {
        const message = 'No saved file found. Choose an episode to begin.';
        this.updateEpisodeLocks();
        this.showScreen('episode-menu');
        this.announce(message);
      }
    });
    $('#options-button').addEventListener('click', () => {
      $('#options-feedback').textContent = '';
      this.optionsReturn = 'menu';
      this.showScreen('options-menu');
    });
    $('#pause-options').addEventListener('click', () => {
      $('#options-feedback').textContent = '';
      this.optionsReturn = 'pause-menu';
      this.showScreen('options-menu');
    });
    $('#credits-button').addEventListener('click', () => this.showScreen('credits'));
    $('#quit-game').addEventListener('click', () => this.confirm(
      'Quit game?', 'This browser session will end. Unsaved progress will be lost.', 'Quit', () => this.endSession(),
    ));
    $('#session-return').addEventListener('click', () => location.reload());
    $('#controls-button').addEventListener('click', () => {
      this.game.audio.stopPreviewMix();
      this.clearAudioPreviewStatus();
      $('#controls-feedback').textContent = '';
      this.buildControls();
      this.showScreen('controls-menu');
    });
    $('#audio-preview').addEventListener('click', () => void this.previewAudioMix());
    $('#restore-options').addEventListener('click', () => this.confirm(
      'Restore option defaults?',
      'Input, display, and audio options will return to their recommended defaults. Custom control bindings and earned or equipped milestone seals will stay unchanged.',
      'Restore Defaults',
      () => this.restoreRecommendedOptions(),
    ));
    $('#controls-back').addEventListener('click', () => { this.cancelBindingCapture(); this.showScreen('options-menu'); });
    $('#reset-controls').addEventListener('click', () => this.confirm(
      'Reset controls?',
      'All keyboard, mouse, and controller bindings will return to their defaults.',
      'Reset',
      () => {
        this.game.input.resetBindings();
        this.buildControls();
        $('#controls-feedback').textContent = 'All controls restored to their defaults.';
      },
    ));
    $('#cancel-binding').addEventListener('click', () => this.cancelBindingCapture());
    $('#level-select-button').addEventListener('click', () => { this.levelSelectReturn = 'menu'; this.showLevelSelect(); });
    $('#milestones-button').addEventListener('click', () => this.showMilestoneLedger('menu'));
    $('#level-select-milestones').addEventListener('click', () => this.showMilestoneLedger('level-select'));
    document.querySelectorAll<HTMLButtonElement>('[data-milestone-filter]').forEach((button) => {
      button.addEventListener('click', () => this.setMilestoneFilter(button.dataset.milestoneFilter as MilestoneFilter));
      button.addEventListener('keydown', (event) => this.handleMilestoneTabKeydown(event));
    });
    $('#replays-button').addEventListener('click', () => { this.replayReturn = 'menu'; this.showReplayLibrary(); });
    $('#replay-back').addEventListener('click', () => this.returnFromReplayLibrary());
    $('#import-replay').addEventListener('click', () => $<HTMLInputElement>('#replay-file').click());
    $<HTMLInputElement>('#replay-file').addEventListener('change', (event) => void this.importReplay((event.target as HTMLInputElement).files?.[0]));
    document.querySelectorAll<HTMLElement>('[data-back]').forEach((button) => button.addEventListener('click', () => {
      const screen = button.closest<HTMLElement>('.screen');
      this.returnFromScreen(screen?.id ?? 'menu');
    }));
    $('#resume-game').addEventListener('click', () => this.resumeGameplay());
    $('#save-game').addEventListener('click', () => { this.slotReturn = 'pause-menu'; this.showSlotScreen('save'); });
    $('#load-game').addEventListener('click', () => { this.slotReturn = 'pause-menu'; this.showSlotScreen('load'); });
    $('#record-replay').addEventListener('click', () => {
      if (this.game.isDemoRecording()) {
        const demo = this.game.finishDemoRecording();
        const result = demo ? this.storeReplay(demo) : 'invalid';
        this.replayReturn = 'pause-menu';
        this.showReplayLibrary(this.replayStorageMessage('manual', result));
        return;
      }
      this.resumeGameplay(() => {
        if (!this.game.startDemoRecording()) {
          this.game.pause();
          this.showScreen('pause-menu');
        }
      });
    });
    document.querySelectorAll('.slot-back').forEach((button) => button.addEventListener('click', () => this.showScreen(this.slotReturn)));
    $('#quit-menu').addEventListener('click', () => this.confirmMainMenu());
    $('#restart-checkpoint').addEventListener('click', () => {
      const game = this.game as GameEngine & { restartFromCheckpoint?: () => boolean };
      if (game.restartFromCheckpoint?.()) this.prepareGameEntry();
    });
    $('#death-load').addEventListener('click', () => { this.slotReturn = 'death-menu'; this.showSlotScreen('load'); });
    $('#death-menu-button').addEventListener('click', () => this.confirmMainMenu());
    $('#confirm-cancel').addEventListener('click', () => this.closeConfirm());
    $('#confirm-accept').addEventListener('click', () => {
      const action = this.confirmAction;
      this.closeConfirm();
      action?.();
    });
    $<HTMLDialogElement>('#confirm-dialog').addEventListener('cancel', (event) => { event.preventDefault(); this.closeConfirm(); });
    $('#continue-map').addEventListener('click', () => {
      const next = this.game.pendingMap;
      if (next && Number(next[1]) !== Number(this.game.world.map.id[1])) {
        this.pendingEpisode = Number(next[1]) - 1;
        this.pendingDifficulty = this.game.difficulty;
        this.showEpisodeIntro();
        return;
      }
      this.game.continueFromIntermission();
      if (this.game.mode === 'playing') this.prepareGameEntry();
    });
    $('#retry-map').addEventListener('click', () => {
      this.game.retryCurrentMap();
      this.prepareGameEntry();
    });
    $('#intermission-level-select').addEventListener('click', () => {
      this.pendingDifficulty = this.game.difficulty;
      this.levelSelectReturn = 'intermission';
      this.showLevelSelect();
    });
    $('#intermission-milestones-button').addEventListener('click', () => this.showMilestoneLedger('intermission'));
    $('#intermission-menu').addEventListener('click', () => {
      this.game.audio.stopMusic();
      this.game.returnToMenu();
      this.updateEpisodeLocks();
      this.updateContinue();
      this.showScreen('menu');
    });
    $('#replay-pause').addEventListener('click', () => this.game.toggleDemoPlayback());
    $('#replay-speed').addEventListener('click', () => this.game.cycleDemoSpeed());
    $('#replay-restart').addEventListener('click', () => {
      if (this.game.restartDemoPlayback()) this.hideScreens();
    });
    $('#replay-exit').addEventListener('click', () => {
      this.game.stopDemoPlayback();
      this.updateContinue();
      this.showScreen('menu');
    });
    $('#begin-episode').addEventListener('click', () => { this.game.startEpisode(this.pendingEpisode, this.pendingDifficulty); this.prepareGameEntry(); });
    $('#enter-file').addEventListener('click', () => this.enterReadyState());
    $('#epilogue-menu').addEventListener('click', () => {
      this.game.audio.stopMusic();
      this.game.returnToMenu();
      this.updateEpisodeLocks();
      this.updateContinue();
      this.showScreen('menu');
    });
    const commitOptionChange = () => {
      this.game.audio.stopPreviewMix();
      this.clearAudioPreviewStatus();
      $('#options-feedback').textContent = '';
      this.applySettings(true);
    };
    ['sensitivity', 'controller-sensitivity', 'touch-sensitivity', 'invert-y', 'vertical-auto-aim', 'controller-deadzone',
      'touch-size', 'touch-opacity', 'touch-handedness', 'text-scale', 'render-scale', 'hud-mode', 'classic-input',
      'controller-vibration', 'screen-shake', 'reduced-motion', 'high-contrast', 'reduced-effects', 'flash-effects',
      'master-volume', 'music-volume', 'sfx-volume', 'audio-profile', 'mute-audio', 'sound-captions'].forEach((id) => {
      $(`#${id}`).addEventListener('change', commitOptionChange);
    });
    for (const id of ['sensitivity', 'controller-sensitivity', 'touch-sensitivity', 'controller-deadzone',
      'touch-opacity', 'master-volume', 'music-volume', 'sfx-volume']) {
      $(`#${id}`).addEventListener('input', commitOptionChange);
    }
    $('#audio-profile').addEventListener('change', () => this.renderAudioProfilePresentation());
    window.addEventListener('keydown', (event) => {
      if (this.automapVisible && (event.code === 'Equal' || event.code === 'NumpadAdd')) this.automapZoom = Math.min(3, this.automapZoom + .25);
      if (this.automapVisible && (event.code === 'Minus' || event.code === 'NumpadSubtract')) this.automapZoom = Math.max(.6, this.automapZoom - .25);
      if (this.automapVisible && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.code)) {
        const amount = event.shiftKey ? 3 : 1;
        if (event.code === 'ArrowLeft') this.automapPan.x += amount;
        if (event.code === 'ArrowRight') this.automapPan.x -= amount;
        if (event.code === 'ArrowUp') this.automapPan.z += amount;
        if (event.code === 'ArrowDown') this.automapPan.z -= amount;
        if (event.code === 'Home') this.automapPan = { x: 0, z: 0 };
        this.game.input.keys.delete(event.code);
        event.preventDefault();
      }
    });
    const automap = $<HTMLCanvasElement>('#automap');
    automap.addEventListener('pointerdown', (event) => {
      this.automapDrag = { pointerId: event.pointerId, originX: event.clientX, originY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
      automap.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    automap.addEventListener('pointermove', (event) => {
      if (!this.automapDrag || this.automapDrag.pointerId !== event.pointerId) return;
      const dx = event.clientX - this.automapDrag.x;
      const dy = event.clientY - this.automapDrag.y;
      const cellSize = Number(automap.dataset.cellSize);
      this.automapDrag.moved ||= Math.hypot(event.clientX - this.automapDrag.originX, event.clientY - this.automapDrag.originY) > 3;
      this.automapPan.x += automapPanDelta(dx, cellSize);
      this.automapPan.z += automapPanDelta(dy, cellSize);
      this.automapDrag.x = event.clientX;
      this.automapDrag.y = event.clientY;
    });
    const stopMapDrag = (event: PointerEvent) => {
      if (this.automapDrag?.pointerId !== event.pointerId) return;
      const closeOnTap = event.pointerType === 'touch' && !this.automapDrag.moved
        && this.automapVisible && this.automapMode === 'full';
      this.automapDrag = undefined;
      if (closeOnTap) this.toggleAutomap('full');
    };
    automap.addEventListener('pointerup', stopMapDrag);
    automap.addEventListener('pointercancel', (event) => {
      if (this.automapDrag?.pointerId === event.pointerId) this.automapDrag = undefined;
    });
    window.addEventListener('input-action', (event) => this.handleInputAction((event as CustomEvent<InputActionEvent>).detail));
    window.addEventListener('input-action-release', (event) => this.handleInputRelease((event as CustomEvent<InputActionEvent>).detail));
    window.addEventListener('input-menu-navigation', (event) => this.handleMenuNavigation((event as CustomEvent<MenuNavigationEvent>).detail));
    window.addEventListener('input-binding-captured', (event) => {
      const detail = (event as CustomEvent<CaptureResult>).detail;
      const action = detail.action;
      this.capturingAction = undefined;
      $('#cancel-binding').toggleAttribute('hidden', true);
      this.buildControls(action);
      const family = detail.binding.device === 'keyboard' ? 'Keyboard'
        : detail.binding.device === 'mouse-button' || detail.binding.device === 'mouse-wheel' ? 'Mouse'
          : 'Controller';
      const retained = family === 'Keyboard' ? 'Mouse and controller bindings retained.'
        : family === 'Mouse' ? 'Keyboard and controller bindings retained.'
          : 'Keyboard and mouse bindings retained.';
      const conflicts = detail.removedFrom.length
        ? ` Removed from ${detail.removedFrom.map(formatLabel).join(', ')} to prevent a conflict.`
        : '';
      $('#controls-feedback').textContent = `${bindingLabel(detail.binding)} assigned to ${formatLabel(action)}. ${retained}${conflicts}`;
    });
    window.addEventListener('input-device-change', (event) => {
      const source = (event as CustomEvent<{ source: InputActionEvent['source'] }>).detail.source;
      this.setEntryDevice(source === 'gamepad' ? 'gamepad' : source === 'touch' ? 'touch' : 'desktop');
      this.controllerHaptics.setActive(source === 'gamepad');
    });
    window.addEventListener('input-controller-disconnected', () => {
      this.controllerHaptics.setActive(false);
      this.showRuntimeWarning(CONTROLLER_DISCONNECTED_WARNING);
      this.announce(CONTROLLER_DISCONNECTED_WARNING, 3);
      if (this.game.mode === 'playing') this.game.pause();
    });
    window.addEventListener('input-controller-reconnected', () => {
      if (this.clearRuntimeWarning(CONTROLLER_DISCONNECTED_WARNING)) {
        this.announce(CONTROLLER_RECONNECTED_ANNOUNCEMENT, 2);
      }
    });
    window.addEventListener(AUDIO_CAPTION_EVENT, (event) => {
      this.showSoundCaption((event as CustomEvent<AudioCaptionDetail>).detail);
    });
    window.addEventListener('combat-momentum', (event) => {
      const detail = (event as CustomEvent<CombatMomentumEventDetail>).detail;
      if (!detail.thresholdReached) return;
      this.controllerHaptics.cue('momentum');
      this.announce(`${detail.label}. Momentum window extended to ${detail.windowSeconds} seconds at chain x${detail.chain}.`, 2);
    });
    window.addEventListener('input-binding-cancelled', () => this.cancelBindingCapture());
    window.addEventListener('input-lifecycle-pause', () => {
      if (this.game.isDemoPlayback()) this.game.pauseDemoPlayback();
      else if (this.game.mode === 'playing') this.game.pause();
    });
  }

  private update(snapshot: GameSnapshot): void {
    this.latestSnapshot = snapshot;
    if (this.trailMap !== snapshot.map.id) {
      this.playerTrail.length = 0;
      this.trailMap = snapshot.map.id;
      this.automapPan = { x: 0, z: 0 };
      this.lastView = undefined;
      this.reticleKick = 0;
      this.assistiveGuidanceState = { objective: '', interactionSignature: '' };
    }
    const healthValue = Math.max(0, Math.ceil(snapshot.player.health));
    const armorValue = Math.max(0, Math.ceil(snapshot.player.armor));
    const health = $('#health');
    const armor = $('#armor');
    updateText(health, String(healthValue));
    updateAttribute(health, 'aria-valuenow', String(healthValue));
    updateAttribute(health, 'aria-valuetext', `${healthValue} health`);
    updateText(armor, String(armorValue));
    updateAttribute(armor, 'aria-valuenow', String(armorValue));
    updateAttribute(armor, 'aria-valuetext', `${armorValue} armor`);
    const weapon = WEAPONS[snapshot.player.weapon];
    const ammoValue = weapon.ammo === 'none' ? 0 : Math.max(0, Math.floor(snapshot.player.ammo[weapon.ammo]));
    const ammoMaximum = weapon.ammo === 'staples' ? 200 : weapon.ammo === 'toner-cells' ? 300 : weapon.ammo === 'none' ? 1 : 50;
    const ammo = $('#ammo');
    updateText(ammo, weapon.ammo === 'none' ? '--' : String(ammoValue));
    updateAttribute(ammo, 'aria-valuemax', String(ammoMaximum));
    updateAttribute(ammo, 'aria-valuenow', String(ammoValue));
    updateAttribute(ammo, 'aria-valuetext', weapon.ammo === 'none' ? 'No ammunition required' : `${ammoValue} ammunition`);
    updateText($('#message'), snapshot.message);
    if (snapshot.message && snapshot.message !== this.lastAnnouncedMessage) {
      this.lastAnnouncedMessage = snapshot.message;
      this.announce(snapshot.message);
    } else if (!snapshot.message) this.lastAnnouncedMessage = '';
    updateText($('#map-name'), `${snapshot.map.id} ${snapshot.map.title}`);
    updateText($('#objective'), snapshot.objective);
    this.renderActiveEffects(snapshot.player.powerups);
    const interaction = snapshot.interaction;
    const interactionSignature = interaction ? `${interaction.state}|${interaction.icon}|${interaction.label}` : '';
    if (interactionSignature !== this.lastInteractionSignature) {
      const prompt = $('#context-prompt');
      prompt.toggleAttribute('hidden', !interaction);
      prompt.classList.toggle('locked', interaction?.state === 'locked');
      if (interaction) {
        prompt.querySelector<HTMLImageElement>('img')!.src = runtimeUrl(`public_runtime/ui/icons/${interaction.icon}.png`);
        updateText(prompt.querySelector<HTMLElement>('span')!, interaction.label);
      }
      this.lastInteractionSignature = interactionSignature;
    }
    const guidance = advanceAssistiveGameplayGuidance({
      active: snapshot.mode === 'playing'
        && !document.querySelector('.screen.active')
        && $('#ready-overlay').hasAttribute('hidden'),
      transientMessage: snapshot.message,
      objective: snapshot.objective,
      ...(interaction ? { interaction: { signature: interactionSignature, label: interaction.label, state: interaction.state } } : {}),
    }, this.assistiveGuidanceState);
    this.assistiveGuidanceState = guidance.state;
    if (guidance.announcement) this.announce(guidance.announcement, 1);
    const streak = $<HTMLElement>('#combat-streak');
    const momentumPresentation = combatMomentumPresentation(snapshot.momentum.chain);
    streak.toggleAttribute('hidden', snapshot.momentum.chain < 2);
    streak.dataset.tier = momentumPresentation.tier;
    updateText(streak.querySelector<HTMLElement>('strong')!, `x${snapshot.momentum.chain}`);
    updateText(streak.querySelector<HTMLElement>('span')!, `${momentumPresentation.label} \u2022 ${snapshot.momentum.score} pts`);
    updateStyle(streak, '--momentum', `${Math.max(0, Math.min(100, snapshot.momentum.timer / momentumPresentation.windowSeconds * 100))}%`);
    updateAttribute(streak, 'aria-label', snapshot.momentum.chain < 2
      ? 'No active momentum'
      : `${momentumPresentation.label}, chain x${snapshot.momentum.chain}, ${snapshot.momentum.score} points, ${snapshot.momentum.timer.toFixed(1)} seconds remaining`);
    if (snapshot.mode === 'dead') this.setPortrait('dead');
    else if (performance.now() >= this.portraitUntil) this.setPortrait('neutral');
    if (this.currentWeapon !== weapon.id) {
      this.cancelWeaponFrames();
      const weaponView = $<HTMLElement>('#weapon-view');
      weaponView.style.backgroundImage = `url('${runtimeUrl(weapon.idle)}')`;
      weaponView.dataset.weapon = weapon.id;
      this.currentWeapon = weapon.id;
    }
    const movementDistance = this.updateWeaponBob(snapshot);
    this.updateReticle(weapon.id, movementDistance);
    const credentialSignature = [...snapshot.player.credentials].join('|');
    if (credentialSignature !== this.lastCredentialSignature) {
      const keys = $('#keys');
      const credentials = [...snapshot.player.credentials];
      keys.replaceChildren(...credentials.map((key) => {
        const icon = document.createElement('img');
        icon.alt = '';
        icon.setAttribute('aria-hidden', 'true');
        icon.src = runtimeUrl(`public_runtime/ui/icons/credential-${key}.png`);
        return icon;
      }));
      updateAttribute(keys, 'aria-label', credentials.length ? `Credentials: ${credentials.map(formatLabel).join(', ')}` : 'Credentials: none');
      this.lastCredentialSignature = credentialSignature;
    }
    const bossBar = $('#boss-bar');
    bossBar.toggleAttribute('hidden', !snapshot.boss);
    if (snapshot.boss) {
      const bossName = formatLabel(snapshot.boss.id);
      updateText(bossBar.querySelector<HTMLElement>('strong')!, bossName);
      const phase = this.game.enemyBehavior.getActorState(snapshot.boss.uid)?.phaseId;
      const phaseLabel = phase ? formatLabel(phase) : 'Active';
      updateText(bossBar.querySelector<HTMLElement>('small')!, phaseLabel);
      const bossPercent = Math.max(0, Math.min(100, snapshot.boss.health / snapshot.boss.maxHealth * 100));
      const bossProgress = bossBar.querySelector<HTMLElement>('[role="progressbar"]')!;
      updateStyle(bossProgress.querySelector<HTMLElement>('span')!, 'width', `${bossPercent}%`);
      updateAttribute(bossProgress, 'aria-valuenow', String(Math.round(bossPercent)));
      updateAttribute(bossProgress, 'aria-valuetext', `${Math.max(0, Math.ceil(snapshot.boss.health))} of ${snapshot.boss.maxHealth} health`);
      updateAttribute(bossBar, 'aria-label', `${bossName}, ${phaseLabel}`);
    }
    const recording = this.game.isDemoRecording();
    $('#recording-indicator').toggleAttribute('hidden', !recording);
    updateText($<HTMLButtonElement>('#record-replay'), recording ? 'Stop & Save Replay' : 'Record Replay');
    const verticalAutoAim = $<HTMLInputElement>('#vertical-auto-aim');
    verticalAutoAim.disabled = recording;
    verticalAutoAim.title = recording ? 'Locked while recording a replay' : '';
    const replayControls = $('#replay-controls');
    replayControls.toggleAttribute('hidden', !snapshot.replay);
    if (snapshot.replay) {
      const replay = snapshot.replay;
      const current = replay.currentTick / 35;
      const total = replay.totalTicks / 35;
      updateText($('#replay-state'), replay.finished ? 'Replay Complete' : replay.paused ? 'Replay Paused' : 'Replay');
      updateText($('#replay-time'), `${formatTime(current)} / ${formatTime(total)}`);
      updateStyle($<HTMLElement>('#replay-progress'), 'width', `${replay.totalTicks ? Math.min(100, replay.currentTick / replay.totalTicks * 100) : 100}%`);
      const pause = $<HTMLButtonElement>('#replay-pause');
      updateText(pause, replay.paused && !replay.finished ? 'Resume' : 'Pause');
      pause.disabled = replay.finished;
      updateText($<HTMLButtonElement>('#replay-speed'), `${replay.speed}x`);
      this.hideScreens();
    }
    $('#hud').classList.toggle('active', snapshot.mode === 'playing' || snapshot.mode === 'paused');
    if (snapshot.mode === 'paused') this.renderPauseDetails(snapshot.pause);
    if (!snapshot.replay && snapshot.mode === 'paused' && this.lastMode !== 'paused') this.showScreen('pause-menu');
    if (!snapshot.replay && snapshot.mode === 'dead' && this.lastMode !== 'dead') {
      this.renderDeathReview(snapshot.death);
      this.showScreen('death-menu');
    }
    if (!snapshot.replay && snapshot.mode === 'complete') {
      const art = $<HTMLImageElement>('#epilogue-art');
      art.src ||= runtimeUrl(art.dataset.src ?? 'public_runtime/ui/illustrations/final-epilogue.png');
      this.showScreen('epilogue');
    }
    if (this.radialActive) this.updateWeaponRadial();
    if (this.lastMode !== snapshot.mode) this.updateContinue();
    if (this.automapVisible) this.drawAutomap(snapshot);
    const lastTrail = this.playerTrail[this.playerTrail.length - 1];
    if (!lastTrail || Math.hypot(lastTrail.x - snapshot.player.position.x, lastTrail.z - snapshot.player.position.z) > .8) {
      this.playerTrail.push({ x: snapshot.player.position.x, z: snapshot.player.position.z });
      if (this.playerTrail.length > 180) this.playerTrail.shift();
    }
    this.lastMode = snapshot.mode;
  }

  private renderDeathReview(review: DeathReview | undefined): void {
    const details = review ?? {
      cause: 'Unidentified exposure • review the surrounding threats',
      progress: 'No run summary is available.',
      objective: 'Review the current route before reopening the file.',
      recovery: 'Choose a recovery option below.',
      restartLabel: 'Restart Map',
      advice: 'Use available cover and reopen when ready.',
    };
    updateText($('#death-cause'), details.cause);
    updateText($('#death-progress'), details.progress);
    updateText($('#death-objective'), details.objective);
    updateText($('#death-recovery'), details.recovery);
    updateText($('#death-advice'), details.advice);
    updateText($<HTMLButtonElement>('#restart-checkpoint'), details.restartLabel);
    $('#death-menu').setAttribute('aria-label', `Claim denied. ${details.cause}`);
  }

  private renderPauseDetails(details: PauseDetails | undefined): void {
    if (!details) return;
    updateText($('#pause-map'), `${details.mapId}: ${details.mapTitle}`);
    updateText($('#pause-difficulty'), details.difficulty);
    updateText($('#pause-run'), details.runVariant);
    updateText($('#pause-objective'), details.objective);
    updateText($('#pause-progress'), details.progress);
    updateText($('#pause-recovery'), details.recovery);
    const review = $<HTMLElement>('#pause-review');
    review.dataset.recovery = details.recoveryState;
    review.setAttribute('aria-label', details.summary);
  }

  private renderActiveEffects(powerups: Readonly<GameSnapshot['player']['powerups']>): void {
    const effects = activeEffectsPresentation(powerups);
    const signature = effects.map(({ key, seconds, progress }) => `${key}:${seconds}:${progress}`).join('|');
    if (signature === this.lastActiveEffectsSignature) return;
    this.lastActiveEffectsSignature = signature;

    const container = $('#active-effects');
    container.toggleAttribute('hidden', effects.length === 0);
    if (effects.length === 0) {
      container.replaceChildren();
      container.setAttribute('aria-label', 'No active effects');
      return;
    }

    container.setAttribute('aria-label', `Active effects: ${effects.map(({ label }) => label).join(', ')}`);
    container.replaceChildren(...effects.map((effect) => {
      const item = document.createElement('div');
      item.className = 'active-effect';
      item.dataset.effect = effect.key;
      item.classList.toggle('urgent', effect.urgent);
      item.setAttribute('role', 'group');
      item.setAttribute('aria-label', `${effect.label}. ${effect.effect} ${effect.seconds} seconds remaining.`);

      const icon = document.createElement('img');
      icon.src = runtimeUrl(this.game.assets.pickup(effect.assetId));
      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');

      const copy = document.createElement('span');
      const label = document.createElement('strong');
      const description = document.createElement('small');
      label.textContent = effect.label;
      description.textContent = effect.effect;
      copy.append(label, description);

      const time = document.createElement('time');
      time.textContent = `${effect.seconds}s`;
      time.dateTime = `PT${effect.seconds}S`;
      time.setAttribute('aria-hidden', 'true');

      const progress = document.createElement('i');
      progress.setAttribute('role', 'progressbar');
      progress.setAttribute('aria-label', `${effect.label} time remaining`);
      progress.setAttribute('aria-valuemin', '0');
      progress.setAttribute('aria-valuemax', '30');
      progress.setAttribute('aria-valuenow', String(Math.min(ACTIVE_EFFECT_DURATION, effect.seconds)));
      progress.setAttribute('aria-valuetext', `${effect.seconds} seconds remaining`);
      progress.style.setProperty('--effect-progress', `${effect.progress}%`);
      progress.append(document.createElement('span'));

      item.append(icon, copy, time, progress);
      return item;
    }));
  }

  private drawAutomap(snapshot: GameSnapshot): void {
    const canvas = $('#automap') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const pixelBudgetRatio = Math.sqrt(4_000_000 / Math.max(1, width * height));
    const pixelRatio = Math.min(2, pixelBudgetRatio, Math.max(1, window.devicePixelRatio || 1));
    const backingWidth = Math.max(1, Math.round(width * pixelRatio));
    const backingHeight = Math.max(1, Math.round(height * pixelRatio));
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }
    const context = canvas.getContext('2d')!;
    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#08090a'; context.fillRect(0, 0, width, height);
    const grid = snapshot.map.grid;
    const full = this.automapMode === 'full';
    const portrait = height > width;
    const compactLandscape = !portrait && height <= 500;
    const legendHeight = full ? Math.max(30, Math.min(44, Math.round(height * .065))) : 0;
    const mapHeight = height - legendHeight;
    const padding = Math.max(10, Math.min(24, Math.round(Math.min(width, mapHeight) * .04)));
    const targetColumns = portrait ? 18 : full ? 30 : 24;
    const targetRows = portrait ? 34 : full ? (compactLandscape ? 15 : 16) : 18;
    const baseScale = Math.max(6, Math.min(
      (width - padding * 2) / targetColumns,
      (mapHeight - padding * 2) / targetRows,
    ));
    const scale = baseScale * this.automapZoom;
    const playerGridX = snapshot.player.position.x / snapshot.map.cellSize;
    const playerGridZ = snapshot.player.position.z / snapshot.map.cellSize;
    const ox = width / 2 - playerGridX * scale + this.automapPan.x * scale;
    const oy = mapHeight / 2 - playerGridZ * scale + this.automapPan.z * scale;
    canvas.dataset.cellSize = scale.toFixed(3);
    canvas.dataset.pixelRatioX = scaleX.toFixed(3);
    canvas.dataset.pixelRatioY = scaleY.toFixed(3);
    canvas.dataset.legendHeight = String(legendHeight);
    canvas.dataset.viewportCellsX = (width / scale).toFixed(2);
    canvas.dataset.viewportCellsZ = (mapHeight / scale).toFixed(2);
    for (let z = 0; z < grid.length; z += 1) {
      for (let x = 0; x < grid[z].length; x += 1) {
        if (!snapshot.player.floorPlan && !this.game.world.visitedTiles.has(`${x},${z}`)) continue;
        const tile = grid[z][x];
        if (tile === '#') context.fillStyle = '#646a70';
        else if ('RYC'.includes(tile)) context.fillStyle = tile === 'R' ? '#d9232e' : tile === 'Y' ? '#e2b93b' : '#47bcd1';
        else if (tile === 'h') context.fillStyle = '#7a1018';
        else if (tile === 's' && !snapshot.player.floorPlan) context.fillStyle = '#1d2023';
        else context.fillStyle = '#34383d';
        context.fillRect(ox + x * scale, oy + z * scale, Math.ceil(scale), Math.ceil(scale));
      }
    }
    context.fillStyle = '#fffdf7';
    context.strokeStyle = '#238ca5';
    context.beginPath();
    this.playerTrail.forEach((point, index) => {
      const tx = ox + point.x / snapshot.map.cellSize * scale;
      const tz = oy + point.z / snapshot.map.cellSize * scale;
      if (index === 0) context.moveTo(tx, tz); else context.lineTo(tx, tz);
    });
    context.stroke();
    context.fillStyle = '#fffdf7';
    context.beginPath();
    const px = ox + snapshot.player.position.x / snapshot.map.cellSize * scale;
    const pz = oy + snapshot.player.position.z / snapshot.map.cellSize * scale;
    canvas.dataset.playerX = px.toFixed(2);
    canvas.dataset.playerY = pz.toFixed(2);
    context.arc(px, pz, 2.5, 0, Math.PI * 2); context.fill();
    context.strokeStyle = '#d9232e'; context.beginPath(); context.moveTo(px, pz);
    context.lineTo(px - Math.sin(snapshot.player.yaw) * 7, pz - Math.cos(snapshot.player.yaw) * 7); context.stroke();

    const mapPoint = (x: number, z: number) => ({ x: ox + x / snapshot.map.cellSize * scale, y: oy + z / snapshot.map.cellSize * scale });
    const visibleCredentialCues = new Set<Credential>();
    this.game.world.doors.forEach((door) => {
      if (!snapshot.player.floorPlan && !this.game.world.visitedTiles.has(`${door.x},${door.z}`)) return;
      const point = mapPoint((door.x + .5) * snapshot.map.cellSize, (door.z + .5) * snapshot.map.cellSize);
      if (!door.open && door.credential) {
        visibleCredentialCues.add(door.credential);
        this.drawCredentialMapCue(context, point, credentialMapCue(door.credential), scale);
      } else {
        context.fillStyle = door.open ? '#646a70' : '#f4f1ea';
        context.fillRect(point.x - 2, point.y - (door.open ? 1 : 3), 4, door.open ? 2 : 6);
      }
    });
    const exit = mapPoint(snapshot.map.exit.x * snapshot.map.cellSize, snapshot.map.exit.z * snapshot.map.cellSize);
    context.strokeStyle = '#ffe17a'; context.lineWidth = 1.5; context.beginPath();
    context.moveTo(exit.x - 4, exit.y - 4); context.lineTo(exit.x + 4, exit.y + 4);
    context.moveTo(exit.x + 4, exit.y - 4); context.lineTo(exit.x - 4, exit.y + 4); context.stroke();
    this.game.world.pickups.filter((pickup) => !pickup.collected && !pickup.phaseLocked).forEach((pickup) => {
      const tile = `${Math.floor(pickup.position.x / snapshot.map.cellSize)},${Math.floor(pickup.position.z / snapshot.map.cellSize)}`;
      if (!snapshot.player.floorPlan && !this.game.world.visitedTiles.has(tile)) return;
      const point = mapPoint(pickup.position.x, pickup.position.z);
      if (pickup.kind === 'credential' && ['red', 'yellow', 'cyan'].includes(String(pickup.id))) {
        const credential = pickup.id as Credential;
        visibleCredentialCues.add(credential);
        this.drawCredentialMapCue(context, point, credentialMapCue(credential), scale * .72);
      } else {
        context.fillStyle = pickup.kind === 'weapon' ? '#d9232e' : '#47bcd1';
        context.fillRect(point.x - 1.5, point.y - 1.5, 3, 3);
      }
    });
    if (snapshot.player.powerups.forensic > 0) this.game.world.actors.filter((actor) => !actor.dead && !actor.phaseLocked).forEach((actor) => {
      const point = mapPoint(actor.position.x, actor.position.z);
      context.fillStyle = actor.kind === 'boss' ? '#ffe17a' : '#d9232e';
      context.beginPath(); context.arc(point.x, point.y, actor.kind === 'boss' ? 2.5 : 1.5, 0, Math.PI * 2); context.fill();
    });
    snapshot.map.triggers.filter((trigger) => !this.game.world.activatedMechanisms.has(trigger.id)
      && this.game.world.visitedTiles.has(`${Math.floor(trigger.x)},${Math.floor(trigger.z)}`)
      && ['open-door', 'toggle-sectors', 'lower-floor', 'raise-floor', 'drain-liquid', 'flood-liquid', 'move-walls'].includes(trigger.action))
      .forEach((trigger) => {
        const point = mapPoint(trigger.x * snapshot.map.cellSize, trigger.z * snapshot.map.cellSize);
        context.fillStyle = '#e2b93b'; context.fillRect(point.x - 2, point.y - 2, 4, 4);
      });
    snapshot.map.secrets.filter((secret) => this.game.world.discoveredSecrets.has(secret.id)).forEach((secret) => {
      const point = mapPoint(secret.at.x * snapshot.map.cellSize, secret.at.z * snapshot.map.cellSize);
      context.strokeStyle = '#fffdf7'; context.strokeRect(point.x - 3, point.y - 3, 6, 6);
    });
    canvas.dataset.credentialCues = [...visibleCredentialCues].sort().join(',');
    if (full) {
      const fontSize = Math.max(10, Math.min(13, Math.floor(width / 48)));
      context.fillStyle = 'rgba(17,18,20,.97)';
      context.fillRect(0, mapHeight, width, legendHeight);
      context.strokeStyle = '#646a70'; context.lineWidth = 1;
      context.beginPath(); context.moveTo(0, mapHeight + .5); context.lineTo(width, mapHeight + .5); context.stroke();
      context.fillStyle = '#d4d2cb'; context.font = `${fontSize}px monospace`; context.textAlign = 'center';
      context.fillText('EXIT X | LOCK R□ Y○ C◇ | RESOURCE □ | CONTROL □', width / 2, mapHeight + legendHeight / 2 + fontSize * .35);
    }
  }

  private drawCredentialMapCue(
    context: CanvasRenderingContext2D,
    point: Readonly<{ x: number; y: number }>,
    cue: CredentialMapCue,
    renderedCellSize: number,
  ): void {
    const radius = Math.max(5, Math.min(8, renderedCellSize * .24));
    context.save();
    context.translate(point.x, point.y);
    context.beginPath();
    if (cue.shape === 'square') context.rect(-radius, -radius, radius * 2, radius * 2);
    else if (cue.shape === 'circle') context.arc(0, 0, radius, 0, Math.PI * 2);
    else {
      context.moveTo(0, -radius - 1);
      context.lineTo(radius + 1, 0);
      context.lineTo(0, radius + 1);
      context.lineTo(-radius - 1, 0);
      context.closePath();
    }
    context.fillStyle = 'rgba(8, 9, 10, .9)';
    context.fill();
    context.strokeStyle = cue.color;
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = '#fffdf7';
    context.font = `bold ${Math.max(10, Math.min(11, renderedCellSize * .32))}px monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(cue.glyph, 0, .5);
    context.restore();
  }

  private renderMastery(container: HTMLElement, presentation: TrackedIntermissionMastery): void {
    const target = document.createElement('strong');
    target.textContent = presentation.retryTarget;
    const comparison = document.createElement('span');
    comparison.textContent = `${presentation.resultLabel} result | ${presentation.result.comparison}`;
    const metrics = document.createElement('div');
    presentation.result.metrics.forEach((value) => {
      const metric = document.createElement('small');
      metric.textContent = value;
      metrics.append(metric);
    });
    container.dataset.resultTrack = presentation.resultTrack;
    container.dataset.retryTrack = 'fresh-start';
    container.classList.toggle('complete', presentation.retry.complete);
    container.replaceChildren(target, comparison, metrics);
  }

  private showMilestoneLedger(origin: 'menu' | 'level-select' | 'intermission'): void {
    this.milestoneReturn = origin;
    this.milestoneFilter = 'all';
    this.screenFocusHistory.delete('milestone-ledger');
    this.renderMilestoneLedger();
    this.showScreen('milestone-ledger');
  }

  private setMilestoneFilter(filter: MilestoneFilter, focus = false): void {
    this.milestoneFilter = filter;
    this.renderMilestoneLedger();
    if (focus) $<HTMLButtonElement>(`#milestone-filter-${filter}`).focus();
  }

  private handleMilestoneTabKeydown(event: KeyboardEvent): void {
    const filters: readonly MilestoneFilter[] = ['all', 'open', 'earned'];
    const current = filters.indexOf((event.currentTarget as HTMLButtonElement).dataset.milestoneFilter as MilestoneFilter);
    if (current < 0) return;
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % filters.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + filters.length) % filters.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = filters.length - 1;
    else return;
    event.preventDefault();
    event.stopPropagation();
    this.setMilestoneFilter(filters[next], true);
  }

  private renderMilestoneLedger(): void {
    const milestones = deriveMilestones(this.game.campaignProgress());
    const filtered = filterMilestones(milestones, this.milestoneFilter);
    const earned = milestones.filter((milestone) => milestone.earned).length;
    const equipped = milestones.find((milestone) => milestone.id === this.equippedMilestoneSeal && milestone.earned);
    document.querySelectorAll<HTMLButtonElement>('[data-milestone-filter]').forEach((button) => {
      const selected = button.dataset.milestoneFilter === this.milestoneFilter;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    const panel = $('#milestone-ledger-panel');
    panel.setAttribute('aria-labelledby', `milestone-filter-${this.milestoneFilter}`);
    $('#milestone-ledger-summary').textContent = `Showing ${filtered.length} of ${milestones.length}. ${earned} earned. ${equipped ? `Active seal: ${equipped.reward.label}.` : 'No active seal.'}`;
    const list = $('#milestone-ledger-list');
    list.setAttribute('aria-label', `${formatLabel(this.milestoneFilter)} milestones`);
    list.replaceChildren(...filtered.map((milestone) => this.buildMilestoneLedgerItem(milestone)));
    list.toggleAttribute('hidden', filtered.length === 0);
    const empty = $('#milestone-ledger-empty');
    empty.textContent = this.milestoneFilter === 'earned'
      ? 'No earned milestones yet.'
      : this.milestoneFilter === 'open'
        ? 'Every milestone is earned.'
        : 'No milestones are available.';
    empty.toggleAttribute('hidden', filtered.length > 0);
  }

  private buildMilestoneLedgerItem(milestone: MilestoneStatus): HTMLElement {
    const item = document.createElement('article');
    item.className = `milestone-ledger-item ${milestone.earned ? 'earned' : 'open'}`;
    item.dataset.milestone = milestone.id;
    item.dataset.state = milestone.earned ? 'earned' : 'open';
    item.setAttribute('role', 'listitem');

    const header = document.createElement('header');
    const name = document.createElement('strong');
    name.id = `milestone-${milestone.id}-name`;
    name.textContent = milestone.name;
    const state = document.createElement('span');
    state.id = `milestone-${milestone.id}-state`;
    state.className = 'milestone-ledger-state';
    state.textContent = milestone.earned ? 'Earned' : 'Open';
    item.setAttribute('aria-labelledby', `${name.id} ${state.id}`);
    header.append(name, state);

    const condition = document.createElement('p');
    condition.textContent = `Condition: ${milestone.description}`;
    const progressCopy = document.createElement('span');
    progressCopy.id = `milestone-${milestone.id}-progress`;
    progressCopy.className = 'milestone-ledger-progress-copy';
    progressCopy.textContent = `Progress: ${milestone.progress} (${milestone.current} of ${milestone.target})`;
    const progress = document.createElement('progress');
    progress.max = milestone.target;
    progress.value = milestone.current;
    progress.setAttribute('aria-label', `${milestone.name} progress`);
    progress.setAttribute('aria-describedby', progressCopy.id);
    progress.setAttribute('aria-valuetext', milestone.progress);

    const reward = document.createElement('button');
    reward.type = 'button';
    reward.className = 'milestone-ledger-reward';
    const equipped = milestone.earned && this.equippedMilestoneSeal === milestone.id;
    reward.disabled = !milestone.earned;
    reward.setAttribute('aria-pressed', String(equipped));
    reward.setAttribute('aria-label', milestone.earned
      ? `${equipped ? 'Remove' : 'Equip'} ${milestone.reward.label}`
      : `${milestone.reward.label} is locked`);
    reward.addEventListener('click', () => this.toggleMilestoneSeal(milestone));
    const seal = document.createElement('span');
    seal.className = 'milestone-seal-mark';
    seal.textContent = 'SEAL';
    seal.setAttribute('aria-hidden', 'true');
    const rewardCopy = document.createElement('span');
    const rewardLabel = document.createElement('strong');
    rewardLabel.textContent = `Seal: ${milestone.reward.label}`;
    const rewardRule = document.createElement('small');
    rewardRule.textContent = milestone.earned
      ? equipped ? 'Equipped | Select to remove' : 'Select to equip | Cosmetic only'
      : 'Earn to equip | Cosmetic only';
    rewardCopy.append(rewardLabel, rewardRule);
    reward.append(seal, rewardCopy);

    item.append(header, condition, progressCopy, progress, reward);
    return item;
  }

  private toggleMilestoneSeal(milestone: MilestoneStatus): void {
    if (!milestone.earned) return;
    const removing = this.equippedMilestoneSeal === milestone.id;
    this.equippedMilestoneSeal = removing ? undefined : milestone.id;
    this.updateEquippedMilestonePresentation();
    this.applySettings(true);
    this.renderMilestoneLedger();
    this.announce(removing
      ? `${milestone.reward.label} removed.`
      : `${milestone.reward.label} equipped. Cosmetic only; gameplay remains unchanged.`);
  }

  private updateEquippedMilestonePresentation(): void {
    const milestones = deriveMilestones(this.game.campaignProgress());
    const equipped = milestones.find((milestone) => milestone.id === this.equippedMilestoneSeal && milestone.earned);
    if (!equipped) this.equippedMilestoneSeal = undefined;
    const profile = $('#profile-seal');
    const ready = $('#ready-seal');
    profile.toggleAttribute('hidden', !equipped);
    ready.toggleAttribute('hidden', !equipped);
    if (!equipped) {
      profile.removeAttribute('aria-label');
      profile.querySelector('strong')!.textContent = '';
      ready.textContent = '';
      return;
    }
    profile.setAttribute('aria-label', `Active milestone seal: ${equipped.reward.label}`);
    profile.querySelector('strong')!.textContent = equipped.reward.label;
    ready.textContent = `ACTIVE SEAL  ${equipped.reward.label}`;
  }

  private renderMilestoneAwards(awards: readonly MilestoneStatus[]): void {
    const container = $('#intermission-milestone-awards');
    container.toggleAttribute('hidden', awards.length === 0);
    if (!awards.length) {
      container.replaceChildren();
      return;
    }
    const title = document.createElement('strong');
    title.textContent = awards.length === 1 ? 'Milestone Earned' : `${awards.length} Milestones Earned`;
    const list = document.createElement('div');
    list.className = 'milestone-award-list';
    awards.forEach((milestone) => {
      const item = document.createElement('article');
      item.className = 'milestone-award-item';
      const mark = document.createElement('span');
      mark.className = 'milestone-seal-mark';
      mark.textContent = 'SEAL';
      mark.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('span');
      const name = document.createElement('b');
      name.textContent = milestone.name;
      const seal = document.createElement('small');
      seal.textContent = `Seal: ${milestone.reward.label}`;
      copy.append(name, seal);
      const equip = document.createElement('button');
      equip.type = 'button';
      equip.className = 'milestone-award-equip';
      equip.dataset.milestoneAward = milestone.id;
      const equipped = this.equippedMilestoneSeal === milestone.id;
      equip.setAttribute('aria-pressed', String(equipped));
      equip.setAttribute('aria-label', `${equipped ? 'Remove' : 'Equip'} ${milestone.reward.label}`);
      equip.textContent = equipped ? 'Equipped' : 'Equip Seal';
      equip.addEventListener('click', () => {
        this.toggleMilestoneSeal(milestone);
        this.renderMilestoneAwards(awards);
        container.querySelector<HTMLButtonElement>(`[data-milestone-award="${milestone.id}"]`)?.focus();
      });
      item.append(mark, copy, equip);
      list.append(item);
    });
    container.replaceChildren(title, list);
  }

  private renderMilestones(
    container: HTMLElement,
    progress: CampaignUnlocks,
    difficulty: GameDifficulty,
    mapId?: MapId,
  ): void {
    const presentation = milestoneHighlights(deriveMilestones(progress), progress, difficulty, mapId);
    const summary = document.createElement('strong');
    summary.textContent = `Milestones ${presentation.earned}/${presentation.total}`;
    const list = document.createElement('div');
    list.className = 'milestone-list';
    presentation.featured.forEach((milestone) => {
      const item = document.createElement('span');
      item.className = 'earned';
      item.textContent = milestone.name;
      item.title = milestone.description;
      list.append(item);
    });
    if (presentation.next) {
      const item = document.createElement('span');
      item.className = 'next';
      item.textContent = `Next: ${presentation.next.name} ${presentation.next.progress}`;
      item.title = presentation.next.description;
      list.append(item);
    }
    container.setAttribute('aria-label', `${presentation.earned} of ${presentation.total} milestones earned`);
    container.replaceChildren(summary, list);
  }

  private showIntermission(): void {
    const episode = Number(this.game.world.map.id[1]);
    const art = this.game.world.map.index === 8 ? `episode-${episode}-outro` : `intermission-episode-${episode}`;
    $('#intermission-art').setAttribute('src', runtimeUrl(`public_runtime/ui/illustrations/${art}.png`));
    const tally = this.game.tally;
    const result = this.game.mapResult;
    const percent = (value: number, total: number) => total ? Math.round(value / total * 100) : 100;
    $('#intermission-grade').textContent = result ? result.performance.grade : '-';
    $('#tally').textContent = [
      `${this.game.world.map.id}: ${this.game.world.map.title}`,
      `Threats ${tally.kills}/${tally.totalKills}  ${percent(tally.kills, tally.totalKills)}%`,
      `Items   ${tally.items}/${tally.totalItems}  ${percent(tally.items, tally.totalItems)}%`,
      `Secrets ${tally.secrets}/${tally.totalSecrets}  ${percent(tally.secrets, tally.totalSecrets)}%`,
      `Score   ${this.game.momentum.score}`,
      ...(result?.completionBonus ? [`Clear bonus +${result.completionBonus}`] : []),
      `Best chain x${this.game.momentum.best}`,
      `Time    ${formatTime(tally.elapsed)} / Par ${formatTime(this.game.world.map.parSeconds)}`,
      ...(result ? [`Record (${runVariantUiLabel(result.record.runVariant)})  ${formatTime(result.record.bestTime)} / ${result.record.highScore} pts / ${result.record.completions} clear${result.record.completions === 1 ? '' : 's'}`] : []),
    ].join('\n');
    this.renderScoreBreakdown(result);
    $('#result-bests').textContent = result
      ? `${runVariantUiLabel(result.record.runVariant)}: ${result.newBests.length ? `NEW: ${result.newBests.join(' / ')}` : 'Record held'}`
      : 'Record held';
    const episodeMaps = CAMPAIGN.episodes[episode - 1].maps;
    const progress = this.game.campaignProgress();
    const milestoneStatuses = deriveMilestones(progress);
    const milestoneAwards = newlyEarnedMilestones(milestoneStatuses, this.knownEarnedMilestoneIds);
    milestoneStatuses.filter((milestone) => milestone.earned)
      .forEach((milestone) => this.knownEarnedMilestoneIds.add(milestone.id));
    const mastery = trackedIntermissionMastery(
      this.game.world.map.id,
      progress,
      this.game.difficulty,
      result?.record.runVariant ?? this.game.runVariant,
      result?.record,
      result?.performance,
    );
    this.renderMastery($<HTMLElement>('#intermission-mastery'), mastery);
    this.renderMilestoneAwards(milestoneAwards);
    this.renderMilestones($<HTMLElement>('#intermission-milestones'), progress, this.game.difficulty, this.game.world.map.id);
    $('#episode-mastery').textContent = masteryAggregatePresentation(
      progress,
      this.game.difficulty,
      mastery.resultTrack,
      episode - 1,
    );
    const retry = $<HTMLButtonElement>('#retry-map');
    retry.classList.toggle('recommended', !mastery.retry.complete);
    retry.textContent = mastery.resultTrack === 'fresh-start'
      ? (mastery.retry.complete ? 'Retry Map' : 'Retry Goal')
      : (mastery.retry.complete ? 'Retry Fresh Start' : 'Retry Fresh Start Goal');
    retry.title = mastery.retryTarget;
    const visibleMaps = episodeMaps.filter((id) => !CAMPAIGN.maps[id].secretMap
      || id === this.game.world.map.id || progress.discoveredSecretMaps.includes(id) || progress.completedMaps.includes(id));
    $('#episode-progress').replaceChildren(...visibleMaps.map((id) => {
      const marker = document.createElement('span');
      marker.textContent = id;
      marker.className = id === this.game.world.map.id ? 'current' : progress.completedMaps.includes(id) ? 'complete' : '';
      return marker;
    }));
    this.showScreen('intermission');
    const awardAnnouncement = milestoneAwardAnnouncement(milestoneAwards);
    if (awardAnnouncement) this.announce(awardAnnouncement, 3);
    this.playCompletionBurst();
  }

  private renderScoreBreakdown(result: MapResult | undefined): void {
    const details = $<HTMLDetailsElement>('#score-breakdown');
    details.open = false;
    details.toggleAttribute('hidden', !result);
    if (!result) return;
    const breakdown = result.scoreBreakdown;
    details.dataset.multiplier = String(breakdown.multiplier);
    details.querySelector('summary')!.textContent = `Score details • ${breakdown.finalScore.toLocaleString()} pts`;
    details.setAttribute('aria-label', `Score details. Combat ${breakdown.combatScore} points. Clear goals ${breakdown.bonusSubtotal} points. Difficulty multiplier ${breakdown.multiplier} times. Final score ${breakdown.finalScore} points.`);
    const totals = $<HTMLElement>('#score-breakdown-totals');
    const difficulty = DIFFICULTY_OPTIONS.find(({ id }) => id === this.game.difficulty)?.label ?? formatLabel(this.game.difficulty);
    const totalRows: readonly [string, string][] = [
      ['Combat', breakdown.combatScore.toLocaleString()],
      ['Clear goals', `+${breakdown.bonusSubtotal.toLocaleString()}`],
      [difficulty, `×${breakdown.multiplier}`],
      ['Final', breakdown.finalScore.toLocaleString()],
    ];
    totals.replaceChildren(...totalRows.map(([label, value], index) => {
      const row = document.createElement('span');
      if (index === totalRows.length - 1) row.className = 'final';
      const title = document.createElement('b');
      title.textContent = label;
      const amount = document.createElement('output');
      amount.textContent = value;
      row.append(title, amount);
      return row;
    }));
    const bonuses = $<HTMLElement>('#score-breakdown-bonuses');
    bonuses.replaceChildren(...breakdown.bonuses.map((bonus) => {
      const item = document.createElement('span');
      item.className = bonus.earned ? 'earned' : 'missed';
      item.dataset.scoreBonus = bonus.id;
      item.setAttribute('role', 'listitem');
      item.setAttribute('aria-label', `${bonus.label}. ${bonus.requirement}. ${bonus.earned ? `Earned ${bonus.awarded} points` : `Missed; ${bonus.available} points available`}.`);
      const label = document.createElement('b');
      label.textContent = bonus.label;
      const amount = document.createElement('small');
      amount.textContent = bonus.earned ? `+${bonus.awarded}` : `0 / +${bonus.available}`;
      item.append(label, amount);
      return item;
    }));
  }

  private playCompletionBurst(): void {
    const layer = $<HTMLElement>('#completion-burst');
    layer.replaceChildren();
    layer.style.height = `${Math.max(44, $<HTMLElement>('#tally').offsetTop - 4)}px`;
    const texture = runtimeUrl('public_runtime/effects/particle-status-feedback/fx_particle-status-feedback_F_08.png');
    const reducedMotion = $<HTMLInputElement>('#reduced-motion').checked;
    const restrained = $<HTMLInputElement>('#reduced-effects').checked
      || !$<HTMLInputElement>('#flash-effects').checked
      || reducedMotion;
    const count = restrained ? 1 : 10;
    const anchors = [
      [8, 70], [92, 70], [18, 42], [82, 42], [29, 24],
      [71, 24], [41, 12], [59, 12], [25, 82], [75, 82],
    ] as const;
    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement('i');
      particle.className = 'completion-particle';
      particle.setAttribute('aria-hidden', 'true');
      particle.style.backgroundImage = `url('${texture}')`;
      const [x, y] = restrained ? [12, 50] : anchors[index];
      particle.style.left = `${x}%`;
      particle.style.top = `${y}%`;
      layer.append(particle);
      if (reducedMotion) {
        particle.style.opacity = '1';
        particle.style.transform = 'translate(-50%, -50%)';
        window.setTimeout(() => particle.remove(), 180);
        continue;
      }
      if (restrained) {
        const animation = particle.animate([
          { opacity: 0, transform: 'translate(-50%, -50%) scale(.72)' },
          { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: .3 },
          { opacity: 0, transform: 'translate(-50%, -50%) scale(.9)' },
        ], { duration: 620, easing: 'steps(4, end)', fill: 'forwards' });
        void animation.finished.then(() => particle.remove(), () => particle.remove());
        continue;
      }
      const side = index % 2 ? 1 : -1;
      const drift = side * (24 + (index * 17) % 54);
      const rise = -18 - (index * 13) % 44;
      const settle = 8 + (index * 11) % 28;
      const animation = particle.animate([
        { opacity: 0, transform: 'translate(-50%, -50%) scale(.45) rotate(0deg)' },
        { opacity: 1, transform: `translate(calc(-50% + ${drift * .55}px), calc(-50% + ${rise}px)) scale(1) rotate(${side * 120}deg)`, offset: .28 },
        { opacity: 0, transform: `translate(calc(-50% + ${drift}px), calc(-50% + ${settle}px)) scale(.68) rotate(${side * 520}deg)` },
      ], { duration: 900 + (index % 4) * 110, easing: 'cubic-bezier(.18,.7,.32,1)', fill: 'forwards' });
      void animation.finished.then(() => particle.remove(), () => particle.remove());
    }
  }

  private flashWeapon(detail: { weapon: keyof typeof WEAPONS; duration: number; recoil?: number }): void {
    const element = $<HTMLElement>('#weapon-view');
    const weapon = WEAPONS[detail.weapon];
    this.cancelWeaponFrames();
    const token = this.weaponVisualToken;
    const frames = (this.game.assets.data.weapons[detail.weapon]?.view.fire?.map((frame) => frame.url) ?? [weapon.fire]).map(runtimeUrl);
    const visualDuration = Math.max(detail.duration * 1000, frames.length * 38);
    frames.forEach((url, index) => {
      this.weaponFrameTimers.push(window.setTimeout(() => {
        if (token === this.weaponVisualToken) element.style.backgroundImage = `url('${url}')`;
      }, visualDuration * index / Math.max(1, frames.length)));
    });
    this.weaponTimer = window.setTimeout(() => {
      if (token === this.weaponVisualToken && this.currentWeapon === detail.weapon) element.style.backgroundImage = `url('${runtimeUrl(weapon.idle)}')`;
    }, visualDuration);
    if ($<HTMLInputElement>('#reduced-motion').checked) this.reticleKick = 0;
    else this.reticleKick = Math.min(9, this.reticleKick + 2 + (detail.recoil ?? weapon.recoil) * 90);
    this.flashMuzzle(detail.weapon);
    this.setPortrait(Math.floor(performance.now() / 180) % 2 ? 'glance-left' : 'glance-right');
    this.portraitUntil = performance.now() + Math.min(220, detail.duration * 1000);
  }

  private viewRecoil(detail: { amount: number }): void {
    if ($<HTMLInputElement>('#reduced-motion').checked) return;
    const weapon = $<HTMLElement>('#weapon-view');
    const kick = Math.min(14, Math.max(3, detail.amount * 180));
    weapon.animate([
      { translate: '0 0' },
      { translate: `0 ${kick}px` },
      { translate: '0 0' },
    ], { duration: 125, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  private impactFeedback(detail: WeaponImpactEventDetail): void {
    const marker = $<HTMLElement>('#hit-marker');
    if (detail.kind === 'actor') {
      marker.classList.remove('active', 'kill');
      marker.dataset.label = weaponImpactLabel(detail);
      if (detail.killed) marker.classList.add('kill');
      void (marker as HTMLElement).offsetWidth;
      marker.classList.add('active');
      if (this.hitMarkerTimer) window.clearTimeout(this.hitMarkerTimer);
      this.hitMarkerTimer = window.setTimeout(() => {
        marker.classList.remove('active', 'kill');
        delete marker.dataset.label;
        this.hitMarkerTimer = undefined;
      }, weaponImpactFeedbackDuration(detail.killed));
      return;
    }
    if (!marker.classList.contains('kill')) {
      if (this.hitMarkerTimer) window.clearTimeout(this.hitMarkerTimer);
      this.hitMarkerTimer = undefined;
      marker.classList.remove('active');
      delete marker.dataset.label;
    }
    if ($<HTMLInputElement>('#reduced-effects').checked || !$<HTMLInputElement>('#flash-effects').checked) return;
    if ($<HTMLInputElement>('#reduced-motion').checked) return;
    $<HTMLElement>('#reticle').animate([
      { opacity: .68, transform: 'translate(-50%, -50%) scale(1.16)' },
      { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
    ], { duration: 65, easing: 'steps(2, end)' });
  }

  private cancelWeaponFrames(): void {
    this.weaponVisualToken += 1;
    this.weaponFrameTimers.forEach((timer) => window.clearTimeout(timer));
    this.weaponFrameTimers = [];
    if (this.weaponTimer) window.clearTimeout(this.weaponTimer);
    this.weaponTimer = undefined;
  }

  private flashMuzzle(weapon: keyof typeof WEAPONS): void {
    if ($<HTMLInputElement>('#reduced-effects').checked || !$<HTMLInputElement>('#flash-effects').checked || weapon === 'claim-stamp') return;
    const flash = $<HTMLElement>('#muzzle-flash');
    const frame = weapon === 'binding-engine' || weapon === 'plasma-copier' ? 6
      : weapon === 'catastrophe-launcher' ? 7 : weapon === 'umbra-saw' ? 5
        : weapon === 'audit-repeater' || weapon === 'twin-bore-riveter' ? 3 : 2;
    const anchors: Partial<Record<keyof typeof WEAPONS, [number, number]>> = {
      'staple-driver': [50, 35], 'audit-repeater': [49, 34], 'twin-bore-riveter': [51, 36],
      'catastrophe-launcher': [52, 35], 'plasma-copier': [50, 34], 'binding-engine': [50, 33], 'umbra-saw': [53, 32],
    };
    const [left, bottom] = anchors[weapon] ?? [50, 35];
    const presentationBottom = bottom - (window.matchMedia('(pointer: fine)').matches ? 8 : 0);
    flash.style.left = `${left}%`;
    flash.style.bottom = `${presentationBottom}%`;
    flash.style.backgroundImage = `url('${runtimeUrl(`public_runtime/effects/particle-weapon-feedback/fx_particle-weapon-feedback_F_${String(frame).padStart(2, '0')}.png`)}')`;
    if (this.muzzleFlashTimer) window.clearTimeout(this.muzzleFlashTimer);
    this.muzzleFlashTimer = undefined;
    flash.getAnimations().forEach((animation) => animation.cancel());
    flash.style.opacity = '0';
    flash.style.transform = '';
    if ($<HTMLInputElement>('#reduced-motion').checked) {
      flash.style.opacity = '1';
      flash.style.transform = 'translate(-50%, 0)';
      this.muzzleFlashTimer = window.setTimeout(() => {
        flash.style.opacity = '0';
        flash.style.transform = '';
        this.muzzleFlashTimer = undefined;
      }, 180);
      return;
    }
    flash.animate([
      { opacity: 0, transform: 'translate(-50%, 30%) scale(.45) rotate(-8deg)' },
      { opacity: 1, transform: 'translate(-50%, 0) scale(1.25) rotate(4deg)' },
      { opacity: 0, transform: 'translate(-50%, -12%) scale(.72) rotate(10deg)' },
    ], { duration: 105, easing: 'steps(3, end)' });
  }

  private dryWeapon(detail: { weapon: keyof typeof WEAPONS }): void {
    const element = $<HTMLElement>('#weapon-view');
    const dry = this.game.assets.data.weapons[detail.weapon]?.view.dry?.[0]?.url;
    if (!dry) return;
    this.cancelWeaponFrames();
    const token = this.weaponVisualToken;
    element.style.backgroundImage = `url('${runtimeUrl(dry)}')`;
    if (!($<HTMLInputElement>('#reduced-motion').checked)) {
      element.animate([{ translate: '0 0' }, { translate: '2px 2px' }, { translate: '0 0' }], { duration: 90 });
    }
    this.weaponTimer = window.setTimeout(() => {
      if (token === this.weaponVisualToken && this.currentWeapon === detail.weapon) element.style.backgroundImage = `url('${runtimeUrl(WEAPONS[detail.weapon].idle)}')`;
    }, 120);
  }

  private updateWeaponBob(snapshot: GameSnapshot): number {
    const reduced = $<HTMLInputElement>('#reduced-motion').checked;
    const current = { x: snapshot.player.position.x, z: snapshot.player.position.z, yaw: snapshot.player.yaw };
    const previous = this.lastView;
    this.lastView = current;
    const distance = previous ? Math.hypot(current.x - previous.x, current.z - previous.z) : 0;
    this.weaponBobPhase += Math.min(.45, distance * 2.6);
    const moving = distance > .002 && !reduced;
    const targetX = moving ? Math.sin(this.weaponBobPhase) * 5 : 0;
    const targetY = moving ? Math.abs(Math.cos(this.weaponBobPhase)) * 4 : 0;
    this.weaponBob.x += (targetX - this.weaponBob.x) * .34;
    this.weaponBob.y += (targetY - this.weaponBob.y) * .34;
    const element = $<HTMLElement>('#weapon-view');
    element.style.setProperty('--weapon-bob-x', `${this.weaponBob.x.toFixed(2)}px`);
    element.style.setProperty('--weapon-bob-y', `${this.weaponBob.y.toFixed(2)}px`);
    return distance;
  }

  private updateReticle(weaponId: keyof typeof WEAPONS, movementDistance: number): void {
    const weapon = WEAPONS[weaponId];
    const baseGap = 4 + Math.min(6, weapon.spread * 52) + (weapon.pellets > 1 ? 1.5 : 0);
    const reduced = $<HTMLInputElement>('#reduced-motion').checked;
    const movementGap = reduced ? 0 : Math.min(4, movementDistance * 70);
    this.reticleKick = reduced ? 0 : this.reticleKick * .82;
    const gap = Math.max(4, Math.min(15, baseGap + movementGap + this.reticleKick));
    const reticle = $<HTMLElement>('#reticle');
    reticle.dataset.weapon = weaponId;
    reticle.style.setProperty('--reticle-gap', `${gap.toFixed(2)}px`);
  }

  private setEntryDevice(device: 'desktop' | 'gamepad' | 'touch'): void {
    const changed = this.entryDevice !== device;
    this.entryDevice = device;
    $('#game-shell').setAttribute('data-input-device', device);
    if (changed && !$('#ready-overlay').hasAttribute('hidden')) this.buildEntryBriefing();
  }

  private entryBinding(
    action: InputAction,
    device: 'keyboard' | 'mouse-button' | 'gamepad-button' | 'gamepad-axis' = 'keyboard',
  ): string {
    const bindings = this.game.input.getBinding(action);
    const preferred = bindings.find((binding) => binding.device === device) ?? bindings[0];
    return preferred ? bindingLabel(preferred) : '--';
  }

  private entryGamepadBinding(action: InputAction): string {
    return this.entryBinding(action, 'gamepad-button');
  }

  private buildEntryBriefing(): void {
    const device = this.entryDevice;
    const container = $('#entry-controls');
    const progress = this.game.campaignProgress();
    const initialOrientation = this.game.world.map.id === 'E1M1' && progress.completedMaps.length === 0;
    const movement = ['move-forward', 'strafe-left', 'move-backward', 'strafe-right']
      .map((action) => this.entryBinding(action as InputAction)).join(' ');
    const touchHandedness = $<HTMLSelectElement>('#touch-handedness').value === 'left' ? 'left' : 'right';
    const touchPads = touchBriefingPadLabels(touchHandedness);
    const values = device === 'touch' ? {
      MOVE: touchPads.move, LOOK: touchPads.look, FIRE: 'FIRE control', USE: 'USE control', WEAPON: 'WPN control', MAP: 'MAP control',
    } : device === 'gamepad' ? {
      MOVE: 'Left stick', LOOK: 'Right stick', FIRE: this.entryGamepadBinding('fire'), USE: this.entryGamepadBinding('use'),
      WEAPON: this.entryGamepadBinding('weapon-radial'), MAP: this.entryGamepadBinding('automap'),
    } : {
      MOVE: movement, LOOK: 'Mouse', FIRE: this.entryBinding('fire', 'mouse-button'), USE: this.entryBinding('use'),
      WEAPON: this.entryBinding('weapon-next'), MAP: this.entryBinding('automap'),
    };
    const entries = entryBriefingLabels(initialOrientation).map((label) => [label, values[label as keyof typeof values]]);
    container.replaceChildren(...entries.map(([label, value]) => {
      const item = document.createElement('span');
      item.setAttribute('role', 'listitem');
      const title = document.createElement('b');
      const binding = document.createElement('small');
      title.textContent = label;
      binding.textContent = value;
      item.append(title, binding);
      return item;
    }));
    $('#ready-overlay').setAttribute('data-input', device);
    $('#ready-overlay').setAttribute('data-briefing', initialOrientation ? 'orientation' : 'context');
    $('#ready-map').textContent = `${this.game.world.map.id} ${this.game.world.map.title}`;
    $('#ready-briefing-kind').textContent = initialOrientation ? 'INITIAL ORIENTATION' : 'FIELD BRIEFING';
    this.updateEquippedMilestonePresentation();
    const fieldOrder = initialOrientation ? undefined : entryFieldOrderPresentation(
      this.game.world.map.id,
      progress,
      this.game.difficulty,
      this.game.runVariant,
    );
    const fieldOrderElement = $<HTMLElement>('#entry-field-order');
    fieldOrderElement.toggleAttribute('hidden', !fieldOrder);
    $('#ready-overlay').setAttribute('aria-describedby', fieldOrder ? 'entry-objective entry-field-order' : 'entry-objective');
    if (fieldOrder) {
      fieldOrderElement.dataset.state = fieldOrder.complete ? 'mastered' : 'open';
      fieldOrderElement.dataset.track = this.game.runVariant;
      fieldOrderElement.setAttribute('aria-label', fieldOrder.summary);
      $('#entry-field-order-label').textContent = `${fieldOrder.trackLabel} field order`;
      $('#entry-field-order-target').textContent = fieldOrder.target;
      $('#entry-field-order-comparison').textContent = `Record: ${fieldOrder.comparison}`;
      $('#entry-field-order-metrics').replaceChildren(...fieldOrder.metrics.map((metric) => {
        const item = document.createElement('span');
        item.textContent = metric;
        return item;
      }));
    } else {
      delete fieldOrderElement.dataset.state;
      delete fieldOrderElement.dataset.track;
      fieldOrderElement.removeAttribute('aria-label');
      $('#entry-field-order-label').textContent = '';
      $('#entry-field-order-target').textContent = '';
      $('#entry-field-order-comparison').textContent = '';
      $('#entry-field-order-metrics').replaceChildren();
    }
    const snapshot = this.latestSnapshot?.map.id === this.game.world.map.id
      ? this.latestSnapshot
      : { map: this.game.world.map, objective: '' };
    $('#entry-objective').textContent = entryObjectiveBriefing(snapshot, this.game.tally.elapsed === 0);
  }

  private prepareGameEntry(onEntered?: () => void): void {
    const preparationToken = ++this.entryPreparationToken;
    this.buildEntryBriefing();
    this.game.pause();
    this.entryContinuation = onEntered;
    this.hideScreens();
    const overlay = $('#ready-overlay');
    const enter = $<HTMLButtonElement>('#enter-file');
    overlay.toggleAttribute('hidden', false);
    overlay.setAttribute('aria-busy', 'true');
    enter.disabled = true;
    enter.textContent = 'Preparing File...';
    void (async () => {
      try {
        await this.game.assets.waitForTextures();
      } catch {
        this.showRuntimeWarning('Visual preparation failed. Safe placeholder art is in use; reload when the connection is stable.');
      } finally {
        if (preparationToken === this.entryPreparationToken && !overlay.hasAttribute('hidden')) {
          overlay.removeAttribute('aria-busy');
          enter.disabled = false;
          enter.textContent = 'Enter File';
          enter.focus();
        }
      }
    })();
  }

  private enterReadyState(): void {
    if ($<HTMLButtonElement>('#enter-file').disabled) return;
    this.resumeGameplay(this.entryContinuation);
  }

  private resumeGameplay(onEntered?: () => void): void {
    this.entryContinuation = onEntered;
    const resume = () => {
      const continuation = this.entryContinuation;
      this.entryContinuation = undefined;
      this.entryPreparationToken += 1;
      $('#ready-overlay').toggleAttribute('hidden', true);
      this.hideScreens();
      this.game.resume();
      continuation?.();
    };
    if (this.entryDevice !== 'desktop') {
      resume();
      return;
    }
    const canvas = $<HTMLCanvasElement>('#game-canvas');
    const verifyCapture = () => {
      if (document.pointerLockElement === canvas) resume();
      else {
        this.buildEntryBriefing();
        this.hideScreens();
        $('#ready-overlay').toggleAttribute('hidden', false);
        const enter = $<HTMLButtonElement>('#enter-file');
        $('#ready-overlay').removeAttribute('aria-busy');
        enter.disabled = false;
        enter.textContent = 'Resume File';
        enter.focus();
      }
    };
    let settled = false;
    let fallbackTimer: number | undefined;
    const settleCapture = () => {
      if (settled) return;
      settled = true;
      document.removeEventListener('pointerlockchange', settleCapture);
      document.removeEventListener('pointerlockerror', settleCapture);
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
      verifyCapture();
    };
    document.addEventListener('pointerlockchange', settleCapture);
    document.addEventListener('pointerlockerror', settleCapture);
    fallbackTimer = window.setTimeout(settleCapture, 1500);
    try {
      const request = canvas.requestPointerLock() as Promise<void> | undefined;
      void request?.catch(settleCapture);
    } catch {
      settleCapture();
    }
  }

  private useFailure(detail: { reason: 'credential' | 'encounter' | 'nothing'; direction: 'left' | 'right' | 'center'; icon: string; credential?: string }): void {
    const feedback = $<HTMLElement>('#use-feedback');
    const copy = detail.reason === 'credential'
      ? `${detail.credential ?? 'Required'} credential needed`
      : detail.reason === 'encounter' ? 'Control locked while threats remain' : 'Nothing usable nearby';
    const icon = detail.reason === 'credential'
      ? `public_runtime/ui/icons/credential-${detail.icon}.png`
      : `public_runtime/ui/icons/${detail.reason === 'encounter' ? 'minimal-alert' : 'minimal-terminal'}.png`;
    feedback.className = `from-${detail.direction}`;
    feedback.querySelector<HTMLImageElement>('img')!.src = runtimeUrl(icon);
    feedback.querySelector<HTMLElement>('span')!.textContent = copy;
    feedback.toggleAttribute('hidden', false);
    this.announce(copy);
    if (this.useFeedbackTimer) window.clearTimeout(this.useFeedbackTimer);
    this.useFeedbackTimer = window.setTimeout(() => feedback.toggleAttribute('hidden', true), detail.reason === 'nothing' ? 650 : 1200);
  }

  private specialPortrait(state: PortraitState): void {
    this.setPortrait(state);
    this.portraitUntil = performance.now() + 900;
  }

  private animateWeaponSwitch(detail: { state: 'lowering' | 'raising' | 'ready'; duration: number }): void {
    const weapon = $<HTMLElement>('#weapon-view');
    if (detail.state === 'lowering') this.cancelWeaponFrames();
    this.weaponSwitchAnimation?.cancel();
    if ($<HTMLInputElement>('#reduced-motion').checked || detail.state === 'ready') {
      weapon.style.transform = 'translateX(-50%)';
      return;
    }
    const raised = 'translate(-50%, 0)';
    const lowered = 'translate(-50%, 100%)';
    const frames = detail.state === 'lowering' ? [raised, lowered] : [lowered, raised];
    this.weaponSwitchAnimation = weapon.animate(
      frames.map((transform) => ({ transform })),
      { duration: Math.max(1, detail.duration * 1000), easing: 'linear', fill: 'forwards' },
    );
  }

  private hurtFlash(detail: { direction?: 'left' | 'right' | 'center' } = {}): void {
    const shell = $<HTMLElement>('#game-shell');
    const direction = detail.direction ?? 'center';
    this.setPortrait(direction === 'left' ? 'pain-left' : direction === 'right' ? 'pain-right' : 'pain-center');
    this.portraitUntil = performance.now() + 320;
    if ($<HTMLInputElement>('#flash-effects').checked) {
      const flash = $('#damage-flash');
      flash.classList.remove('from-left', 'from-right');
      if (direction === 'left') flash.classList.add('from-left');
      if (direction === 'right') flash.classList.add('from-right');
      flash.classList.remove('active');
      void (flash as HTMLElement).offsetWidth;
      flash.classList.add('active');
    }
    if (!($<HTMLInputElement>('#screen-shake').checked) || $<HTMLInputElement>('#reduced-motion').checked) return;
    shell.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(4px,-2px)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(0,0)' }], { duration: 120 });
  }

  private setPortrait(state: PortraitState): void {
    const damage = Math.max(0, Math.min(4, Math.floor((100 - Math.min(100, this.game.player.health)) / 20)));
    const special: Partial<Record<PortraitState, string>> = {
      'weapon-acquired': 'ui_portrait_weapon-acquired-grin_F_00.png',
      overcharge: 'ui_portrait_overcharge_F_00.png',
      invulnerable: 'ui_portrait_invulnerable_F_00.png',
      dead: 'ui_portrait_dead_F_00.png',
    };
    const file = special[state] ?? `ui_portrait_damage-${damage}_${state}_F_00.png`;
    if (file === this.lastPortraitFile) return;
    $<HTMLImageElement>('#portrait').src = runtimeUrl(`public_runtime/ui/portrait/${file}`);
    this.lastPortraitFile = file;
  }

  private showEpisodeIntro(): void {
    const copy = [
      'A routine first notice reaches a quiet regional office. The building closes around the file before anyone can explain what was reported.',
      'The loss has escaped the campus. Response infrastructure now stretches across a flooded city where every exclusion has become physical.',
      'The trail descends beneath accounting and architecture into the machinery that decides which futures are affordable.',
    ][this.pendingEpisode];
    $('#episode-intro-art').setAttribute('src', runtimeUrl(`public_runtime/ui/illustrations/episode-${this.pendingEpisode + 1}-intro.png`));
    $('#episode-intro-copy').textContent = copy;
    this.showScreen('episode-intro');
  }

  private toggleAutomap(mode: 'full' | 'overlay'): void {
    const canvas = $<HTMLCanvasElement>('#automap');
    if (this.automapVisible && this.automapMode === mode) this.automapVisible = false;
    else { this.automapVisible = true; this.automapMode = mode; }
    canvas.classList.toggle('overlay', this.automapMode === 'overlay');
    canvas.toggleAttribute('hidden', !this.automapVisible);
    canvas.setAttribute('aria-label', this.automapVisible && this.automapMode === 'full'
      ? 'Automap. Drag to pan or tap to close.' : 'Automap');
    $('#hud').classList.toggle('full-automap', this.automapVisible && this.automapMode === 'full');
  }

  private showSlotScreen(mode: 'save' | 'load'): void {
    const container = $(`#${mode}-slot-list`);
    container.replaceChildren();
    this.game.manualSlots().forEach((slot) => {
      const row = document.createElement('div');
      row.className = 'slot-row';
      const preview = document.createElement('div');
      preview.className = 'slot-preview';
      const slotWithThumbnail = slot as typeof slot & { thumbnail?: { kind: 'image'; dataUrl: string } | { kind: 'placeholder'; label: string; palette: readonly [string, string] } };
      const thumbnail = slotWithThumbnail.thumbnail;
      if (thumbnail?.kind === 'image') {
        const image = document.createElement('img');
        image.src = thumbnail.dataUrl;
        image.alt = '';
        preview.append(image);
      } else if (thumbnail?.kind === 'placeholder') {
        preview.style.background = `linear-gradient(135deg, ${thumbnail.palette[0]}, ${thumbnail.palette[1]})`;
      }
      const label = document.createElement('strong');
      label.textContent = `Slot ${slot.slot}`;
      preview.append(label);
      const copy = document.createElement('span');
      copy.className = 'slot-copy';
      const name = mode === 'save' ? document.createElement('input') : document.createElement('strong');
      if (name instanceof HTMLInputElement) {
        name.value = slot.status === 'valid' ? slot.name : `Manual ${slot.slot}`;
        name.maxLength = 32;
        name.setAttribute('aria-label', `Slot ${slot.slot} name`);
      } else name.textContent = slot.name;
      const detail = document.createElement('small');
      detail.textContent = slot.detail;
      copy.append(name, detail);
      const action = document.createElement('button');
      action.className = 'slot-action';
      action.textContent = mode === 'save' ? 'Write' : 'Load';
      action.setAttribute('aria-label', `${mode === 'save' ? 'Write' : 'Load'} slot ${slot.slot}${slot.status === 'valid' ? `: ${slot.name}` : ''}`);
      action.disabled = mode === 'load' && slot.status !== 'valid';
      action.addEventListener('click', () => {
        if (mode === 'save') {
          const write = () => {
            const requestedName = name instanceof HTMLInputElement ? name.value.trim() : '';
            this.game.saveManual(slot.slot, requestedName || `Manual ${slot.slot}`);
            this.updateContinue();
            this.showScreen('pause-menu');
          };
          if (slot.status === 'valid') {
            this.confirm('Overwrite save?', `${slot.name} will be replaced and cannot be recovered.`, 'Overwrite', write);
          } else if (slot.status === 'invalid') {
            this.confirm(
              'Replace unreadable save?',
              'This slot contains data from a newer build or data that cannot be read. Replacing it cannot be undone.',
              'Replace',
              write,
            );
          } else write();
        } else if (this.game.loadManual(slot.slot)) {
          if (this.game.mode === 'paused') this.showScreen('pause-menu');
          else if (this.game.mode === 'playing') this.prepareGameEntry();
          else this.hideScreens();
        }
      });
      row.append(preview, copy, action);
      if (mode === 'load' && slot.status !== 'empty') {
        row.classList.add('deletable');
        const remove = document.createElement('button');
        remove.className = 'slot-delete';
        remove.textContent = '×';
        remove.title = `Delete slot ${slot.slot}`;
        remove.setAttribute('aria-label', `Delete slot ${slot.slot}`);
        remove.addEventListener('click', () => this.confirm(
          'Delete save?', `${slot.name} will be permanently removed.`, 'Delete', () => {
            this.game.deleteManual(slot.slot);
            this.updateContinue();
            this.showSlotScreen('load');
          },
        ));
        row.append(remove);
      }
      container.append(row);
    });
    if (mode === 'load') this.buildAutomaticSlots();
    this.showScreen(`${mode}-slots`);
  }

  private buildAutomaticSlots(): void {
    const container = $('#automatic-slot-list');
    container.replaceChildren();
    const slots = this.game.automaticSlots();
    $('#automatic-save-heading').toggleAttribute('hidden', slots.length === 0);
    container.toggleAttribute('hidden', slots.length === 0);
    slots.forEach((slot) => {
      const row = document.createElement('div');
      row.className = 'slot-row automatic-slot-row';
      const badge = document.createElement('strong');
      badge.className = 'automatic-kind';
      badge.textContent = slot.kind === 'quicksave' ? 'Quick'
        : slot.kind === 'autosave' ? 'Auto'
          : slot.kind === 'conflict' ? 'Tab Copy'
            : 'Recovery';
      const copy = document.createElement('span');
      copy.className = 'slot-copy';
      const name = document.createElement('strong');
      name.textContent = slot.name;
      const detail = document.createElement('small');
      detail.textContent = slot.detail;
      copy.append(name, detail);
      const action = document.createElement('button');
      action.className = 'slot-action';
      action.textContent = 'Load';
      action.setAttribute('aria-label', `Load ${badge.textContent.toLowerCase()} save: ${slot.name}`);
      action.disabled = slot.status !== 'valid';
      action.addEventListener('click', () => {
        if (!this.game.loadAutomatic(slot.slotId)) return;
        if (this.game.mode === 'paused') this.showScreen('pause-menu');
        else if (this.game.mode === 'playing') this.prepareGameEntry();
        else this.hideScreens();
      });
      row.append(badge, copy, action);
      container.append(row);
    });
  }

  private showLevelSelect(): void {
    const container = $('#level-select-list');
    container.replaceChildren();
    const progress = this.game.campaignProgress();
    const difficulty = $<HTMLSelectElement>('#level-select-difficulty');
    difficulty.value = this.pendingDifficulty;
    const selectedDifficulty = difficulty.value as GameDifficulty;
    const retainedLegacy = Object.values(progress.records).some((record) =>
      record.difficulty === selectedDifficulty && record.runVariant === 'legacy-unclassified');
    $('#campaign-mastery').textContent = `${masteryAggregatePresentation(progress, selectedDifficulty, 'fresh-start')}${retainedLegacy ? ' | Legacy records retained for milestone history' : ''}`;
    this.renderMilestones($<HTMLElement>('#level-milestones'), progress, difficulty.value as GameDifficulty);
    CAMPAIGN.episodes.forEach((episode, episodeIndex) => {
      if (!this.game.isEpisodeUnlocked(episodeIndex)) return;
      const section = document.createElement('section');
      section.className = 'level-episode';
      const heading = document.createElement('h2');
      const headingTitle = document.createElement('strong');
      headingTitle.textContent = `Episode ${episode.number}: ${episode.title}`;
      const headingMastery = document.createElement('small');
      headingMastery.textContent = masteryAggregatePresentation(
        progress,
        difficulty.value as GameDifficulty,
        'fresh-start',
        episodeIndex,
      );
      heading.append(headingTitle, headingMastery);
      const grid = document.createElement('div');
      grid.className = 'level-map-grid';
      episode.maps.forEach((id, mapIndex) => {
        const map = CAMPAIGN.maps[id];
        const secretKnown = progress.discoveredSecretMaps.includes(id) || progress.completedMaps.includes(id);
        if (map.secretMap && !secretKnown) return;
        const unlocked = map.secretMap ? secretKnown
          : mapIndex === 0 || progress.completedMaps.includes(id) || progress.completedMaps.includes(episode.maps[mapIndex - 1]);
        const tracks = levelSelectRecordTracks(progress, id, difficulty.value as GameDifficulty);
        const presentation = masteryPresentation(id, tracks.freshStart);
        const button = document.createElement('button');
        const label = document.createElement('strong');
        label.textContent = `${id} ${map.title}`;
        const detail = document.createElement('small');
        detail.textContent = `Fresh Start | ${presentation.comparison}`;
        const target = document.createElement('small');
        target.className = 'map-mastery-target';
        target.textContent = unlocked
          ? presentation.target.replace('Retry goal: ', 'Target: ')
          : `Unlock: Clear ${episode.maps[Math.max(0, mapIndex - 1)]}`;
        button.classList.toggle('mastered', presentation.complete);
        button.append(label, detail, target);
        if (tracks.campaignCarry) {
          const note = document.createElement('small');
          note.className = 'map-record-note campaign-carry';
          note.textContent = 'Campaign Carry record tracked separately';
          button.append(note);
        }
        if (tracks.legacy) {
          const note = document.createElement('small');
          note.className = 'map-record-note legacy';
          note.textContent = 'Legacy record retained for milestone history';
          button.append(note);
        }
        button.disabled = !unlocked;
        button.title = unlocked
          ? `${presentation.target}. ${presentation.metrics.join('. ')}`
          : `${id} - clear ${episode.maps[Math.max(0, mapIndex - 1)]} to unlock`;
        button.addEventListener('click', () => {
          this.game.audio.unlock();
          this.pendingDifficulty = difficulty.value as GameDifficulty;
          this.game.startMapFromSelect(id, this.pendingDifficulty);
          this.prepareGameEntry();
        });
        grid.append(button);
      });
      section.append(heading, grid);
      container.append(section);
    });
    difficulty.onchange = () => {
      this.pendingDifficulty = difficulty.value as GameDifficulty;
      this.showLevelSelect();
    };
    this.showScreen('level-select');
  }

  private persistentReplayLibrary(): ReplayLibraryEntry[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(REPLAY_LIBRARY_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((value): ReplayLibraryEntry[] => {
        if (!value || typeof value !== 'object') return [];
        const candidate = value as Partial<ReplayLibraryEntry>;
        const summary = this.game.demoSummary(candidate.demo);
        if (!summary || typeof candidate.id !== 'string' || typeof candidate.name !== 'string') return [];
        return [{
          id: candidate.id,
          name: candidate.name.slice(0, 48) || `${summary.mapId} Replay`,
          mapId: summary.mapId,
          createdAt: summary.createdAt,
          duration: summary.duration,
          demo: candidate.demo,
        }];
      }).sort((left, right) => right.createdAt - left.createdAt);
    } catch {
      this.showRuntimeWarning('The replay library is unavailable in this browser session.');
      return [];
    }
  }

  private replayLibrary(): ReplayLibraryEntry[] {
    const entries = [...this.sessionReplays, ...this.persistentReplayLibrary()];
    return [...new Map(entries.map((entry) => [entry.id, entry])).values()]
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  private writeReplayLibrary(entries: ReplayLibraryEntry[], warnOnFailure = true, requiredEntryId?: string): boolean {
    this.sessionReplays = boundedReplayEntries(entries.filter((entry) => entry.sessionOnly), requiredEntryId);
    const sorted = entries.filter((entry) => !entry.sessionOnly)
      .sort((left, right) => right.createdAt - left.createdAt);
    const required = requiredEntryId ? sorted.find((entry) => entry.id === requiredEntryId) : undefined;
    const bounded = required
      ? [required, ...sorted.filter((entry) => entry.id !== requiredEntryId)].slice(0, REPLAY_LIBRARY_LIMIT)
      : sorted.slice(0, REPLAY_LIBRARY_LIMIT);
    bounded.sort((left, right) => right.createdAt - left.createdAt);
    if (!bounded.length) {
      try {
        localStorage.removeItem(REPLAY_LIBRARY_KEY);
        return true;
      } catch {
        this.showRuntimeWarning('The replay library could not be updated. Existing campaign progress is unaffected.');
        return false;
      }
    }
    let serialized = JSON.stringify(bounded);
    const removeOldestOptional = (): boolean => {
      let index = bounded.length - 1;
      while (index >= 0 && bounded[index].id === requiredEntryId) index -= 1;
      if (index < 0) return false;
      bounded.splice(index, 1);
      serialized = JSON.stringify(bounded);
      return true;
    };
    while (serialized.length * 2 > REPLAY_LIBRARY_BYTES && removeOldestOptional()) {
      // Keep the replay currently being added; older entries yield first.
    }
    if (serialized.length * 2 > REPLAY_LIBRARY_BYTES) {
      if (warnOnFailure) this.showRuntimeWarning('The replay is too large for persistent browser storage.');
      return false;
    }
    while (bounded.length) {
      try {
        localStorage.setItem(REPLAY_LIBRARY_KEY, serialized);
        return true;
      } catch {
        if (!removeOldestOptional()) break;
      }
    }
    if (warnOnFailure) this.showRuntimeWarning('The replay library could not be saved. Existing campaign progress is unaffected.');
    return false;
  }

  private storeReplay(demo: unknown): ReplayStoreResult {
    const summary = this.game.demoSummary(demo);
    if (!summary) return 'invalid';
    const entry: ReplayLibraryEntry = {
      id: crypto.randomUUID(),
      name: `${summary.mapId} ${CAMPAIGN.maps[summary.mapId].title}`,
      mapId: summary.mapId,
      createdAt: summary.createdAt,
      duration: summary.duration,
      demo,
    };
    if (this.writeReplayLibrary([entry, ...this.replayLibrary()], false, entry.id)) return 'persistent';
    const sessionEntry: ReplayLibraryEntry = { ...entry, sessionOnly: true };
    this.sessionReplays = boundedReplayEntries([sessionEntry, ...this.sessionReplays], entry.id);
    return 'session-only';
  }

  private replayStorageMessage(reason: string, result: ReplayStoreResult): string {
    const subject = reason === 'size'
      ? 'Replay storage limit reached.'
      : reason === 'duration'
        ? '45-minute recording limit reached.'
        : 'Replay complete.';
    if (result === 'persistent') return `${subject} Saved to this browser.`;
    if (result === 'session-only') {
      return `${subject} Browser storage is full or unavailable, so it is kept in this tab only. Play or export it before closing.`;
    }
    return `${subject} The recording could not be validated.`;
  }

  private showReplayLibrary(message = ''): void {
    this.buildReplayLibrary();
    $('#replay-feedback').textContent = message || (this.hasLegacyReplayLibrary()
      ? 'Older replays use an incompatible simulation version and were left untouched.'
      : '');
    this.showScreen('replay-library');
  }

  private hasLegacyReplayLibrary(): boolean {
    try {
      return LEGACY_REPLAY_LIBRARY_KEYS.some((key) => {
        const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
        return Array.isArray(value) && value.length > 0;
      });
    } catch {
      return false;
    }
  }

  private showMessageInReplayLibrary(message: string): void {
    $('#replay-feedback').textContent = message;
  }

  private buildReplayLibrary(): void {
    const container = $('#replay-list');
    container.replaceChildren();
    const entries = this.replayLibrary();
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'screen-copy';
      empty.textContent = 'No saved replays.';
      container.append(empty);
      return;
    }
    entries.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'replay-row';
      const copy = document.createElement('span');
      const name = document.createElement('input');
      name.value = entry.name;
      name.maxLength = 48;
      name.setAttribute('aria-label', `Rename replay ${entry.name}`);
      name.addEventListener('change', () => {
        const entriesNow = this.replayLibrary();
        const stored = entriesNow.find((candidate) => candidate.id === entry.id);
        if (!stored) return;
        stored.name = name.value.trim().slice(0, 48) || `${entry.mapId} Replay`;
        name.value = stored.name;
        this.writeReplayLibrary(entriesNow);
      });
      const detail = document.createElement('small');
      detail.textContent = `${entry.mapId} | ${formatTime(entry.duration)} | ${new Date(entry.createdAt).toLocaleString()}${entry.sessionOnly ? ' | This tab only' : ''}`;
      copy.append(name, detail);
      const play = document.createElement('button');
      play.textContent = 'Play';
      play.setAttribute('aria-label', `Play replay ${entry.name}`);
      play.addEventListener('click', () => {
        this.game.audio.unlock();
        if (!this.game.startDemoPlayback(entry.demo)) {
          $('#replay-feedback').textContent = 'Replay could not be loaded.';
          return;
        }
        this.hideScreens();
        requestAnimationFrame(() => $<HTMLButtonElement>('#replay-pause').focus({ preventScroll: true }));
      });
      const save = document.createElement('button');
      save.textContent = 'Export';
      save.setAttribute('aria-label', `Export replay ${entry.name}`);
      save.addEventListener('click', () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(entry.demo)], { type: 'application/json' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${entry.mapId.toLowerCase()}-${entry.id.slice(0, 8)}.json`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      });
      const remove = document.createElement('button');
      remove.className = 'replay-delete';
      remove.textContent = '×';
      remove.title = `Delete ${entry.name}`;
      remove.setAttribute('aria-label', `Delete ${entry.name}`);
      remove.addEventListener('click', () => this.confirm(
        'Delete replay?', `${entry.name} will be permanently removed.`, 'Delete', () => {
          this.writeReplayLibrary(this.replayLibrary().filter((candidate) => candidate.id !== entry.id));
          this.showReplayLibrary('Replay deleted.');
        },
      ));
      row.append(copy, play, save, remove);
      container.append(row);
    });
  }

  private async importReplay(file?: File): Promise<void> {
    $<HTMLInputElement>('#replay-file').value = '';
    if (!file) return;
    if (file.size > REPLAY_LIBRARY_BYTES) {
      $('#replay-feedback').textContent = 'Replay file is too large.';
      return;
    }
    try {
      const demo: unknown = JSON.parse(await file.text());
      const result = this.storeReplay(demo);
      if (result === 'invalid') {
        const candidate = demo && typeof demo === 'object' ? demo as { schema?: unknown; version?: unknown } : undefined;
        $('#replay-feedback').textContent = candidate?.schema === 'red-ledger-demo' && candidate.version !== DEMO_SCHEMA_VERSION
          ? 'Replay uses an incompatible simulation version and cannot be imported.'
          : 'Replay file is invalid or storage is full.';
        return;
      }
      this.showReplayLibrary(result === 'persistent'
        ? 'Replay imported and saved to this browser.'
        : 'Replay imported, but browser storage is full or unavailable. It is kept in this tab only; play or export it before closing.');
    } catch {
      $('#replay-feedback').textContent = 'Replay file is invalid or storage is full.';
    }
  }

  private buildControls(focusAction?: InputAction): void {
    const container = $('#controls-list');
    container.replaceChildren();
    INPUT_ACTIONS.forEach((action) => {
      const row = document.createElement('div');
      row.className = 'control-row';
      const label = document.createElement('span');
      label.textContent = action.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
      const button = document.createElement('button');
      button.dataset.action = action;
      const bindings = this.game.input.getBinding(action);
      const bindingCopy = bindings.length ? bindings.map(bindingLabel).join(' / ') : 'Unbound';
      const setButtonCopy = (copy: string, capturing = false) => {
        button.textContent = copy;
        button.setAttribute('aria-label', capturing
          ? `${label.textContent}. Press an input or choose Cancel.`
          : `${label.textContent}. Current bindings: ${copy}. Activate to rebind.`);
      };
      setButtonCopy(bindingCopy);
      button.title = `Rebind ${label.textContent}`;
      button.classList.toggle('capturing', this.capturingAction === action);
      button.addEventListener('click', () => {
        this.capturingAction = action;
        this.game.input.beginBindingCapture(action);
        $('#controls-feedback').textContent = '';
        setButtonCopy('Press an input', true);
        button.classList.add('capturing');
        $('#cancel-binding').toggleAttribute('hidden', false);
      });
      row.append(label, button);
      container.append(row);
    });
    if (focusAction) {
      requestAnimationFrame(() => {
        [...container.querySelectorAll<HTMLButtonElement>('button[data-action]')]
          .find((button) => button.dataset.action === focusAction)
          ?.focus({ preventScroll: true });
      });
    }
  }

  private cancelBindingCapture(): void {
    const action = this.capturingAction;
    this.game.input.cancelBindingCapture();
    this.capturingAction = undefined;
    $('#cancel-binding').toggleAttribute('hidden', true);
    if ($('#controls-menu').classList.contains('active')) this.buildControls(action);
  }

  private handleInputAction(detail: InputActionEvent): void {
    if (detail.repeat) return;
    if (detail.source === 'gamepad') this.setEntryDevice('gamepad');
    else if (detail.source === 'touch') this.setEntryDevice('touch');
    else this.setEntryDevice('desktop');
    const dialog = $<HTMLDialogElement>('#confirm-dialog');
    if (dialog.open) {
      if (detail.action === 'pause') this.closeConfirm();
      return;
    }
    if (detail.action === 'pause') {
      this.game.input.keys.delete('Escape');
      const activeScreen = document.querySelector<HTMLElement>('.screen.active');
      const ready = !$('#ready-overlay').hasAttribute('hidden');
      if (this.game.mode === 'playing') this.game.pause();
      else if (this.game.mode === 'paused' && ready) {
        this.entryContinuation = undefined;
        $('#ready-overlay').toggleAttribute('hidden', true);
        this.showScreen('pause-menu');
      }
      else if (this.game.mode === 'paused' && activeScreen?.id === 'pause-menu') {
        this.resumeGameplay();
      }
      else this.handleBackNavigation();
      return;
    }
    if (this.game.mode !== 'playing') return;
    if (detail.action === 'automap') this.toggleAutomap('full');
    else if (detail.action === 'automap-overlay') this.toggleAutomap('overlay');
    else if (detail.action === 'weapon-radial') this.openWeaponRadial();
  }

  private handleInputRelease(detail: InputActionEvent): void {
    if (detail.action !== 'weapon-radial' || !this.radialActive) return;
    if (this.radialWeapon) this.game.selectWeapon(this.radialWeapon);
    this.radialActive = false;
    this.game.setRadialSelecting(false);
    $('#weapon-radial').toggleAttribute('hidden', true);
  }

  private openWeaponRadial(): void {
    this.radialActive = true;
    this.game.setRadialSelecting(true);
    const container = $('#weapon-radial');
    container.replaceChildren();
    const weapons = Object.values(WEAPONS).sort((left, right) => left.slot - right.slot);
    weapons.forEach((weapon, index) => {
      const button = document.createElement('button');
      const angle = index / weapons.length * Math.PI * 2;
      button.textContent = String(weapon.slot);
      button.title = weapon.id;
      button.dataset.weapon = weapon.id;
      button.disabled = !this.game.player.weapons.has(weapon.id);
      button.style.transform = `translate(${Math.sin(angle) * 72}px, ${-Math.cos(angle) * 72}px)`;
      container.append(button);
    });
    container.toggleAttribute('hidden', false);
    this.updateWeaponRadial();
  }

  private updateWeaponRadial(): void {
    const weapons = Object.values(WEAPONS).sort((left, right) => left.slot - right.slot);
    const owned = weapons.filter((weapon) => this.game.player.weapons.has(weapon.id));
    if (!owned.length) return;
    const stick = this.game.input.gamepadLook;
    if (Math.hypot(stick.x, stick.y) > .35) {
      const angle = (Math.atan2(stick.x, -stick.y) + Math.PI * 2) % (Math.PI * 2);
      const slotIndex = Math.round(angle / (Math.PI * 2) * weapons.length) % weapons.length;
      this.radialWeapon = [...owned].sort((left, right) => {
        const leftIndex = weapons.indexOf(left);
        const rightIndex = weapons.indexOf(right);
        const leftDistance = Math.min(Math.abs(leftIndex - slotIndex), weapons.length - Math.abs(leftIndex - slotIndex));
        const rightDistance = Math.min(Math.abs(rightIndex - slotIndex), weapons.length - Math.abs(rightIndex - slotIndex));
        return leftDistance - rightDistance || left.slot - right.slot;
      })[0].id;
    } else this.radialWeapon ??= this.game.player.weapon;
    document.querySelectorAll<HTMLButtonElement>('#weapon-radial button').forEach((button) => {
      button.classList.toggle('selected', button.dataset.weapon === this.radialWeapon);
    });
  }

  private handleMenuNavigation(detail: MenuNavigationEvent): void {
    this.setEntryDevice(detail.source === 'gamepad' ? 'gamepad' : 'desktop');
    if (detail.action === 'back' && !detail.repeat) {
      this.handleBackNavigation();
      return;
    }
    const dialog = $<HTMLDialogElement>('#confirm-dialog');
    const ready = $('#ready-overlay');
    const active = document.querySelector<HTMLElement>('.screen.active');
    const replayControls = $('#replay-controls');
    const root = dialog.open
      ? dialog
      : !ready.hasAttribute('hidden')
        ? ready
        : !replayControls.hasAttribute('hidden')
          ? replayControls
          : active;
    if (!root || this.capturingAction) return;
    const focusable = [...root.querySelectorAll<HTMLElement>('button:not(:disabled):not([hidden]), select:not(:disabled), input:not(:disabled), a[href]')]
      .filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const current = document.activeElement instanceof HTMLElement ? focusable.indexOf(document.activeElement) : -1;
    if (detail.action === 'up' || detail.action === 'down') {
      const direction = detail.action === 'down' ? 1 : -1;
      focusable[(current + direction + focusable.length) % focusable.length].focus();
      return;
    }
    if (detail.action === 'left' || detail.action === 'right') {
      const element = current >= 0 ? focusable[current] : focusable[0];
      const direction = detail.action === 'right' ? 1 : -1;
      if (element instanceof HTMLInputElement && element.type === 'range') {
        direction > 0 ? element.stepUp() : element.stepDown();
        element.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (element instanceof HTMLSelectElement) {
        element.selectedIndex = Math.max(0, Math.min(element.options.length - 1, element.selectedIndex + direction));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else focusable[(current + direction + focusable.length) % focusable.length].focus();
      return;
    }
    if (detail.action === 'confirm' && detail.source === 'gamepad' && !detail.repeat) {
      (current >= 0 ? focusable[current] : focusable[0]).click();
      return;
    }
  }

  private handleBackNavigation(): void {
    const dialog = $<HTMLDialogElement>('#confirm-dialog');
    const ready = $('#ready-overlay');
    const active = document.querySelector<HTMLElement>('.screen.active');
    if (dialog.open) {
      $<HTMLButtonElement>('#confirm-cancel').click();
      return;
    }
    if (!ready.hasAttribute('hidden')) {
      this.entryContinuation = undefined;
      ready.toggleAttribute('hidden', true);
      this.showScreen('pause-menu');
      return;
    }
    if (!$('#replay-controls').hasAttribute('hidden')) {
      $<HTMLButtonElement>('#replay-exit').click();
      return;
    }
    if (!active) return;
    if (active.id === 'controls-menu') $<HTMLButtonElement>('#controls-back').click();
    else if (active.id === 'save-slots' || active.id === 'load-slots') active.querySelector<HTMLElement>('.slot-back')?.click();
    else if (active.id === 'replay-library') $<HTMLButtonElement>('#replay-back').click();
    else if (active.id === 'pause-menu') $<HTMLButtonElement>('#resume-game').click();
    else active.querySelector<HTMLElement>('[data-back]')?.click();
  }

  private updateEpisodeLocks(): void {
    document.querySelectorAll<HTMLButtonElement>('.episode-card').forEach((button, index) => {
      button.disabled = !this.game.isEpisodeUnlocked(index);
      button.title = button.disabled ? `${button.getAttribute('aria-label')} - locked` : button.getAttribute('aria-label') ?? '';
      const title = button.dataset.title ?? button.getAttribute('aria-label') ?? `Episode ${index + 1}`;
      const label = button.querySelector('span');
      if (label) label.textContent = `Episode ${index + 1}: ${title}${button.disabled ? ' - Locked' : ''}`;
    });
  }

  private clearAudioPreviewStatus(): void {
    const status = $<HTMLElement>('#audio-preview-status');
    status.textContent = '';
    delete status.dataset.result;
  }

  private renderAudioProfilePresentation(): void {
    const profile = $<HTMLSelectElement>('#audio-profile').value as AudioPlaybackProfile;
    const presentation = audioProfilePresentation(profile);
    const detail = $<HTMLElement>('#audio-profile-detail');
    detail.dataset.profile = profile;
    detail.textContent = presentation.detail;
  }

  private async previewAudioMix(): Promise<void> {
    const button = $<HTMLButtonElement>('#audio-preview');
    const status = $<HTMLElement>('#audio-preview-status');
    const profile = $<HTMLSelectElement>('#audio-profile').value as AudioPlaybackProfile;
    const presentation = audioProfilePresentation(profile);
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    status.textContent = `Preparing ${presentation.label} preview...`;
    try {
      const result = await this.game.audio.previewMix();
      if (result === 'superseded') return;
      status.dataset.result = result;
      status.textContent = result === 'played'
        ? `${presentation.label} preview: hazard left, confirmation center, critical attack right.`
        : result === 'muted'
          ? 'Preview is silent because Mute audio is on.'
          : result === 'master-silent'
            ? 'Preview is silent because Master volume is 0%.'
            : result === 'effects-silent'
              ? 'Preview is silent because Effects volume is 0%.'
              : 'Audio preview is unavailable. Interact with the page, then try again.';
    } catch {
      status.dataset.result = 'unavailable';
      status.textContent = 'Audio preview is unavailable. Settings still apply; try again after interacting with the page.';
    } finally {
      if (!button.isConnected) return;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  private loadSettings(): void {
    let settings: Record<string, unknown> = {};
    try {
      const stored = JSON.parse(localStorage.getItem('red-ledger-settings-v1') ?? '{}') as unknown;
      settings = stored !== null && typeof stored === 'object' && !Array.isArray(stored)
        ? stored as Record<string, unknown>
        : {};
      this.equippedMilestoneSeal = resolveEquippedMilestoneSeal(
        settings.equippedMilestoneSeal,
        deriveMilestones(this.game.campaignProgress()),
      );
      const input = normalizeInputPreferences(settings);
      const presentation = normalizeInterfacePreferences(settings);
      $<HTMLInputElement>('#sensitivity').value = String(input.mouseSensitivity);
      $<HTMLInputElement>('#controller-sensitivity').value = String(input.controllerSensitivity);
      $<HTMLInputElement>('#touch-sensitivity').value = String(input.touchSensitivity);
      $<HTMLInputElement>('#invert-y').checked = input.invertY;
      $<HTMLInputElement>('#controller-deadzone').value = String(input.controllerDeadzone);
      $<HTMLSelectElement>('#touch-size').value = presentation.touchControlSize;
      $<HTMLInputElement>('#touch-opacity').value = String(presentation.touchControlOpacity);
      $<HTMLSelectElement>('#touch-handedness').value = presentation.touchHandedness;
      $<HTMLSelectElement>('#text-scale').value = presentation.uiTextScale;
      if (typeof settings.renderScale === 'number') $<HTMLSelectElement>('#render-scale').value = String(settings.renderScale);
      if (settings.hudMode === 'minimal') $<HTMLSelectElement>('#hud-mode').value = 'minimal';
      for (const id of ['classic-input', 'vertical-auto-aim', 'controller-vibration', 'screen-shake', 'reduced-motion', 'high-contrast', 'reduced-effects', 'flash-effects', 'sound-captions']) {
        if (typeof settings[id] === 'boolean') $<HTMLInputElement>(`#${id}`).checked = Boolean(settings[id]);
      }
    } catch {
      try { localStorage.removeItem('red-ledger-settings-v1'); } catch {
        this.showRuntimeWarning('Browser storage is unavailable. Settings apply for this session only.');
      }
    }
    let systemPrefersReducedMotion = false;
    try {
      systemPrefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    } catch {
      // A blocked media-query API should leave the authored default intact.
    }
    $<HTMLInputElement>('#reduced-motion').checked = resolveReducedMotionSetting(settings, systemPrefersReducedMotion);
    $<HTMLInputElement>('#screen-shake').checked = resolveScreenShakeSetting(settings, systemPrefersReducedMotion);
    $<HTMLInputElement>('#master-volume').value = String(this.game.audio.masterVolume);
    $<HTMLInputElement>('#music-volume').value = String(this.game.audio.musicVolume);
    $<HTMLInputElement>('#sfx-volume').value = String(this.game.audio.sfxVolume);
    $<HTMLSelectElement>('#audio-profile').value = this.game.audio.playbackProfile;
    $<HTMLInputElement>('#mute-audio').checked = this.game.audio.muted;
    this.renderAudioProfilePresentation();
    this.updateEquippedMilestonePresentation();
    this.applySettings(false);
  }

  private restoreRecommendedOptions(): void {
    this.game.audio.stopPreviewMix();
    this.clearAudioPreviewStatus();
    let systemPrefersReducedMotion = false;
    try {
      systemPrefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    } catch {
      // A blocked media-query API should retain the authored motion default.
    }
    const defaults = recommendedOptionSettings(systemPrefersReducedMotion);
    $<HTMLInputElement>('#sensitivity').value = String(defaults.input.mouseSensitivity);
    $<HTMLInputElement>('#controller-sensitivity').value = String(defaults.input.controllerSensitivity);
    $<HTMLInputElement>('#touch-sensitivity').value = String(defaults.input.touchSensitivity);
    $<HTMLInputElement>('#invert-y').checked = defaults.input.invertY;
    $<HTMLInputElement>('#controller-deadzone').value = String(defaults.input.controllerDeadzone);
    $<HTMLSelectElement>('#touch-size').value = defaults.presentation.touchControlSize;
    $<HTMLInputElement>('#touch-opacity').value = String(defaults.presentation.touchControlOpacity);
    $<HTMLSelectElement>('#touch-handedness').value = defaults.presentation.touchHandedness;
    $<HTMLSelectElement>('#text-scale').value = defaults.presentation.uiTextScale;
    $<HTMLSelectElement>('#render-scale').value = String(defaults.renderScale);
    $<HTMLSelectElement>('#hud-mode').value = defaults.hudMode;
    $<HTMLInputElement>('#classic-input').checked = defaults.classicInput;
    $<HTMLInputElement>('#vertical-auto-aim').checked = defaults.verticalAutoAim;
    $<HTMLInputElement>('#controller-vibration').checked = defaults.controllerVibration;
    $<HTMLInputElement>('#screen-shake').checked = defaults.screenShake;
    $<HTMLInputElement>('#reduced-motion').checked = defaults.reducedMotion;
    $<HTMLInputElement>('#high-contrast').checked = defaults.highContrast;
    $<HTMLInputElement>('#reduced-effects').checked = defaults.reducedEffects;
    $<HTMLInputElement>('#flash-effects').checked = defaults.flashEffects;
    $<HTMLInputElement>('#master-volume').value = String(defaults.audio.master);
    $<HTMLInputElement>('#music-volume').value = String(defaults.audio.music);
    $<HTMLInputElement>('#sfx-volume').value = String(defaults.audio.sfx);
    $<HTMLSelectElement>('#audio-profile').value = defaults.audio.profile;
    $<HTMLInputElement>('#mute-audio').checked = defaults.audio.muted;
    $<HTMLInputElement>('#sound-captions').checked = defaults.soundCaptions;
    const retainedReplayAutoAim = this.game.isDemoRecording() && this.game.verticalAutoAim !== defaults.verticalAutoAim;
    this.applySettings(true);
    this.renderAudioProfilePresentation();
    $('#options-feedback').textContent = retainedReplayAutoAim
      ? 'Recommended defaults restored. Replay-locked vertical auto-aim was retained until recording ends; custom bindings and milestone seals were kept.'
      : 'Recommended defaults restored. Custom bindings and milestone seals were kept.';
  }

  private applySettings(persist: boolean): void {
    const input: InputPreferences = this.game.setInputPreferences({
      mouseSensitivity: Number($<HTMLInputElement>('#sensitivity').value),
      controllerSensitivity: Number($<HTMLInputElement>('#controller-sensitivity').value),
      touchSensitivity: Number($<HTMLInputElement>('#touch-sensitivity').value),
      invertY: $<HTMLInputElement>('#invert-y').checked,
      controllerDeadzone: Number($<HTMLInputElement>('#controller-deadzone').value),
    });
    const presentation = normalizeInterfacePreferences({
      touchControlSize: $<HTMLSelectElement>('#touch-size').value,
      touchControlOpacity: Number($<HTMLInputElement>('#touch-opacity').value),
      touchHandedness: $<HTMLSelectElement>('#touch-handedness').value,
      uiTextScale: $<HTMLSelectElement>('#text-scale').value,
    });
    const renderScale = Number($<HTMLSelectElement>('#render-scale').value);
    const hudMode = $<HTMLSelectElement>('#hud-mode').value;
    this.game.classicInput = $<HTMLInputElement>('#classic-input').checked;
    this.controllerHaptics.setEnabled($<HTMLInputElement>('#controller-vibration').checked);
    const verticalAutoAim = $<HTMLInputElement>('#vertical-auto-aim');
    if (this.game.isDemoRecording()) verticalAutoAim.checked = this.game.verticalAutoAim;
    else this.game.verticalAutoAim = verticalAutoAim.checked;
    this.game.setRenderScale(renderScale);
    const shell = $<HTMLElement>('#game-shell');
    shell.dataset.touchSize = presentation.touchControlSize;
    shell.dataset.touchHandedness = presentation.touchHandedness;
    shell.style.setProperty('--touch-control-opacity', String(presentation.touchControlOpacity));
    document.documentElement.dataset.uiTextScale = presentation.uiTextScale;
    $('#hud').classList.toggle('minimal', hudMode === 'minimal');
    shell.classList.toggle('reduced-motion', $<HTMLInputElement>('#reduced-motion').checked);
    shell.classList.toggle('high-contrast-attacks', $<HTMLInputElement>('#high-contrast').checked);
    this.game.accessibility.highContrast = $<HTMLInputElement>('#high-contrast').checked;
    this.game.accessibility.reducedEffects = $<HTMLInputElement>('#reduced-effects').checked;
    this.game.audio.setMasterVolume(Number($<HTMLInputElement>('#master-volume').value));
    this.game.audio.setMusicVolume(Number($<HTMLInputElement>('#music-volume').value));
    this.game.audio.setSfxVolume(Number($<HTMLInputElement>('#sfx-volume').value));
    this.game.audio.setPlaybackProfile($<HTMLSelectElement>('#audio-profile').value as AudioPlaybackProfile);
    this.game.audio.setMuted($<HTMLInputElement>('#mute-audio').checked);
    if (!$<HTMLInputElement>('#sound-captions').checked) this.hideSoundCaption();
    this.updateRangeOutputs();
    window.dispatchEvent(new CustomEvent('accessibility-settings-change', { detail: {
      reducedMotion: $<HTMLInputElement>('#reduced-motion').checked,
      highContrast: $<HTMLInputElement>('#high-contrast').checked,
      reducedEffects: $<HTMLInputElement>('#reduced-effects').checked,
      flashEffects: $<HTMLInputElement>('#flash-effects').checked,
      screenShake: $<HTMLInputElement>('#screen-shake').checked,
    } }));
    if (!persist) return;
    try {
      localStorage.setItem('red-ledger-settings-v1', JSON.stringify({
        sensitivity: input.mouseSensitivity,
        mouseSensitivity: input.mouseSensitivity,
        controllerSensitivity: input.controllerSensitivity,
        touchSensitivity: input.touchSensitivity,
        invertY: input.invertY,
        controllerDeadzone: input.controllerDeadzone,
        touchControlSize: presentation.touchControlSize,
        touchControlOpacity: presentation.touchControlOpacity,
        touchHandedness: presentation.touchHandedness,
        uiTextScale: presentation.uiTextScale,
        renderScale,
        hudMode,
        'classic-input': $<HTMLInputElement>('#classic-input').checked,
        'vertical-auto-aim': $<HTMLInputElement>('#vertical-auto-aim').checked,
        'controller-vibration': $<HTMLInputElement>('#controller-vibration').checked,
        'screen-shake': $<HTMLInputElement>('#screen-shake').checked,
        'reduced-motion': $<HTMLInputElement>('#reduced-motion').checked,
        'high-contrast': $<HTMLInputElement>('#high-contrast').checked,
        'reduced-effects': $<HTMLInputElement>('#reduced-effects').checked,
        'flash-effects': $<HTMLInputElement>('#flash-effects').checked,
        'sound-captions': $<HTMLInputElement>('#sound-captions').checked,
        ...(this.equippedMilestoneSeal ? { equippedMilestoneSeal: this.equippedMilestoneSeal } : {}),
      }));
    } catch {
      this.showRuntimeWarning('Browser storage is unavailable. Settings apply for this session only.');
    }
  }

  private updateRangeOutputs(): void {
    for (const id of ['sensitivity', 'controller-sensitivity', 'controller-deadzone', 'touch-sensitivity',
      'touch-opacity', 'master-volume', 'music-volume', 'sfx-volume']) {
      const input = $<HTMLInputElement>(`#${id}`);
      const value = formatRangeSetting(id, Number(input.value));
      input.setAttribute('aria-valuetext', value);
      $<HTMLOutputElement>(`#${id}-value`).value = value;
    }
  }

  private updateContinue(): void {
    const button = $<HTMLButtonElement>('#continue-game');
    const available = this.game.hasSave();
    button.disabled = false;
    button.dataset.available = String(available);
    button.setAttribute('aria-describedby', 'menu-feedback');
    button.title = available ? 'Continue the newest valid save' : 'Start a new game';
    this.renderContinuePreview(this.game.continueDetails());
  }
  private renderContinuePreview(details: ContinueDetails | undefined): void {
    const card = $('#menu-feedback');
    card.replaceChildren();
    card.toggleAttribute('hidden', !details);
    if (!details) return;

    card.setAttribute('aria-label', `Continue available. ${details.summary}`);
    const header = document.createElement('header');
    const kind = document.createElement('span');
    kind.className = 'continue-kind';
    kind.textContent = details.kind;
    const map = document.createElement('strong');
    map.className = 'continue-map';
    map.textContent = `${details.mapId} ${details.mapTitle}`;
    header.append(kind, map);

    const tags = document.createElement('div');
    tags.className = 'continue-tags';
    const difficulty = document.createElement('span');
    difficulty.textContent = details.difficulty;
    const runVariant = document.createElement('span');
    runVariant.textContent = details.runVariant;
    tags.append(difficulty, runVariant);

    const meta = document.createElement('footer');
    const playTime = document.createElement('span');
    playTime.textContent = `Play ${details.playTime}`;
    const savedAt = document.createElement('time');
    savedAt.dateTime = details.savedAtIso;
    savedAt.textContent = `Saved ${details.savedAt}`;
    meta.append(playTime, savedAt);
    card.append(header, tags, meta);
  }
  private announce(message: string, priority = 0): void {
    const announcer = $('#announcer');
    this.pendingAnnouncement = preferredAnnouncement(this.pendingAnnouncement, { message, priority });
    if (this.announcementFrame !== undefined) return;
    announcer.textContent = '';
    this.announcementFrame = requestAnimationFrame(() => {
      const pending = this.pendingAnnouncement;
      this.pendingAnnouncement = undefined;
      this.announcementFrame = undefined;
      if (pending) announcer.textContent = pending.message;
    });
  }
  private showSoundCaption(detail: AudioCaptionDetail): void {
    if (!$<HTMLInputElement>('#sound-captions').checked || !detail?.text) return;
    if (document.querySelector('.screen.active') || !$('#ready-overlay').hasAttribute('hidden')) return;
    const caption = $<HTMLElement>('#sound-caption');
    caption.textContent = detail.text;
    caption.dataset.priority = detail.priority;
    caption.dataset.direction = detail.direction;
    caption.toggleAttribute('hidden', false);
    if (this.soundCaptionTimer !== undefined) window.clearTimeout(this.soundCaptionTimer);
    const duration = detail.priority === 'critical' ? 1_650
      : detail.priority === 'important' ? 1_450
        : detail.priority === 'ambient' ? 2_000
          : 1_250;
    this.soundCaptionTimer = window.setTimeout(() => this.hideSoundCaption(), duration);
  }
  private hideSoundCaption(): void {
    if (this.soundCaptionTimer !== undefined) window.clearTimeout(this.soundCaptionTimer);
    this.soundCaptionTimer = undefined;
    const caption = $<HTMLElement>('#sound-caption');
    caption.textContent = '';
    caption.toggleAttribute('hidden', true);
  }
  private showRuntimeWarning(message: string): void {
    this.runtimeWarnings.add(message);
    const warning = $('#runtime-warning');
    warning.textContent = [...this.runtimeWarnings].join(' ');
    warning.toggleAttribute('hidden', false);
  }
  private clearRuntimeWarning(message: string): boolean {
    if (!this.runtimeWarnings.delete(message)) return false;
    const warning = $('#runtime-warning');
    warning.textContent = [...this.runtimeWarnings].join(' ');
    warning.toggleAttribute('hidden', this.runtimeWarnings.size === 0);
    return true;
  }
  private hideScreens(): void { document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active')); }
  private showScreen(id: string): void {
    if (id === 'menu' && this.game.mode === 'menu' && this.audioReadyRequested) {
      this.game.audio.resume();
      this.game.audio.startMenuMusic();
    } else if (id === 'credits' && this.audioReadyRequested) this.game.audio.startCreditsMusic();
    $('#ready-overlay').toggleAttribute('hidden', true);
    const previous = document.querySelector<HTMLElement>('.screen.active');
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    if (previous && focused && previous.contains(focused)) this.screenFocusHistory.set(previous.id, focused);
    this.hideScreens();
    const screen = $<HTMLElement>(`#${id}`);
    screen.classList.add('active');
    requestAnimationFrame(() => {
      const selectedDifficulty = id === 'difficulty-menu'
        ? screen.querySelector<HTMLElement>(`button[data-difficulty="${this.pendingDifficulty}"]:not(:disabled)`)
        : undefined;
      const remembered = this.screenFocusHistory.get(id);
      (selectedDifficulty
        ?? (remembered?.isConnected && screen.contains(remembered) && !remembered.matches(':disabled') ? remembered : undefined)
        ?? screen.querySelector<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href]'))
        ?.focus({ preventScroll: true });
      screen.scrollTop = 0;
    });
  }

  private returnFromScreen(id: string): void {
    if (id === 'options-menu') {
      this.game.audio.stopPreviewMix();
      this.clearAudioPreviewStatus();
    }
    const target = id === 'level-select' ? this.levelSelectReturn
      : id === 'milestone-ledger' ? this.milestoneReturn
      : id === 'difficulty-menu' ? 'episode-menu'
        : id === 'episode-intro' ? 'difficulty-menu'
          : id === 'options-menu' ? this.optionsReturn
            : 'menu';
    this.showScreen(target);
  }

  private returnFromReplayLibrary(): void {
    const target = this.replayReturn === 'pause-menu' && this.game.mode === 'paused' ? 'pause-menu' : 'menu';
    this.showScreen(target);
  }

  private confirm(title: string, copy: string, acceptLabel: string, action: () => void, review?: ExitReview): void {
    const dialog = $<HTMLDialogElement>('#confirm-dialog');
    this.focusBeforeDialog = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.confirmAction = action;
    $('#confirm-title').textContent = title;
    $('#confirm-copy').textContent = copy;
    $('#confirm-accept').textContent = acceptLabel;
    const reviewElement = $<HTMLElement>('#confirm-review');
    reviewElement.toggleAttribute('hidden', !review);
    if (review) {
      reviewElement.dataset.recovery = review.recoveryState;
      reviewElement.dataset.consequence = review.consequenceState;
      reviewElement.setAttribute('aria-label', review.summary);
      $('#confirm-return-point').textContent = review.returnPoint;
      $('#confirm-consequence').textContent = review.consequence;
      $('#confirm-durability').textContent = review.durability;
    } else {
      delete reviewElement.dataset.recovery;
      delete reviewElement.dataset.consequence;
      reviewElement.removeAttribute('aria-label');
      $('#confirm-return-point').textContent = '';
      $('#confirm-consequence').textContent = '';
      $('#confirm-durability').textContent = '';
    }
    window.getSelection()?.removeAllRanges();
    if (!dialog.open) dialog.showModal();
    $<HTMLButtonElement>('#confirm-cancel').focus();
  }

  private closeConfirm(): void {
    const dialog = $<HTMLDialogElement>('#confirm-dialog');
    this.confirmAction = undefined;
    if (dialog.open) dialog.close();
    this.focusBeforeDialog?.focus();
    this.focusBeforeDialog = undefined;
  }

  private unlockAudio(): void {
    this.game.audio.unlock();
    if (this.audioReadyRequested) return;
    this.audioReadyRequested = true;
    if (this.game.mode === 'menu') this.game.audio.startMenuMusic();
    void this.game.audio.prepareAuthoredAudio();
  }

  private confirmMainMenu(): void {
    const review = this.game.exitReview();
    this.confirm('Return to title?', `Review what Continue will restore before leaving ${review.mapId}.`, 'Return to Title', () => {
      this.game.audio.stopMusic();
      this.game.returnToMenu();
      this.showScreen('menu');
    }, review);
  }

  private endSession(): void {
    this.game.audio.stopMusic();
    this.game.returnToMenu();
    this.showScreen('session-ended');
    window.close();
  }
}
