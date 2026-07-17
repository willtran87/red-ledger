import { CAMPAIGN, type MapId } from '../data';
import type { GameDifficulty } from './definitions';
import { hasMasteryProof, type CampaignUnlocks, type MapRecord } from './PersistenceSystem';

const MILESTONE_SEAL_LABELS = Object.freeze({
  'first-clear': 'First Notice Seal',
  'second-review': 'Double Review Seal',
  'chain-five': 'Five-Link Seal',
  'chain-ten': 'Ten-Link Seal',
  'first-par': 'Ahead of Schedule Seal',
  'first-s': 'Red Ledger Seal',
  'first-mastery': 'Exception-Free Seal',
  'binding-mastery': 'Authority Seal',
  'episode-close': 'Regional Seal',
  'episode-mastery': 'Clean Ledger Seal',
  'campaign-mastery': 'One Standard Seal',
  'first-secret': 'Fine Print Seal',
  'secret-clear': 'Off the Record Seal',
  'all-secrets': 'Every Exclusion Seal',
  'campaign-close': 'National Seal',
} as const);

export type MilestoneId = keyof typeof MILESTONE_SEAL_LABELS;
export type MilestoneFilter = 'all' | 'open' | 'earned';

export interface MilestoneReward {
  readonly kind: 'seal';
  readonly label: string;
  readonly gameplayEffect: false;
}

export interface MilestoneStatus {
  readonly id: MilestoneId;
  readonly name: string;
  readonly description: string;
  readonly earned: boolean;
  readonly current: number;
  readonly target: number;
  readonly progress: string;
  readonly reward: MilestoneReward;
}

export interface MilestoneHighlights {
  readonly earned: number;
  readonly total: number;
  readonly featured: readonly MilestoneStatus[];
  readonly next?: MilestoneStatus;
}

const secretMaps = Object.values(CAMPAIGN.maps).filter((map) => map.secretMap).map((map) => map.id);
const standardMaps = Object.values(CAMPAIGN.maps).filter((map) => !map.secretMap).map((map) => map.id);

const mastered = (record: MapRecord): boolean => hasMasteryProof(record);

const bounded = (current: number, target: number): number => Math.min(target, Math.max(0, current));

interface LogicalRecordGroup {
  readonly mapId: string;
  readonly difficulty: string;
  readonly records: readonly MapRecord[];
}

const logicalRecordGroups = (records: readonly MapRecord[]): readonly LogicalRecordGroup[] => {
  const groups = new Map<string, { mapId: string; difficulty: string; records: MapRecord[] }>();
  records.forEach((record) => {
    const key = `${record.mapId}\u0000${record.difficulty}`;
    const group = groups.get(key) ?? { mapId: record.mapId, difficulty: record.difficulty, records: [] };
    group.records.push(record);
    groups.set(key, group);
  });
  return [...groups.values()];
};

export const milestoneReward = (id: MilestoneId): MilestoneReward => ({
  kind: 'seal',
  label: MILESTONE_SEAL_LABELS[id],
  gameplayEffect: false,
});

const status = (
  id: MilestoneId,
  name: string,
  description: string,
  current: number,
  target: number,
  progress = `${bounded(current, target)}/${target}`,
): MilestoneStatus => ({
  id,
  name,
  description,
  earned: current >= target,
  current: bounded(current, target),
  target,
  progress,
  reward: milestoneReward(id),
});

export const filterMilestones = (
  milestones: readonly MilestoneStatus[],
  filter: MilestoneFilter,
): readonly MilestoneStatus[] => filter === 'all'
  ? [...milestones]
  : milestones.filter((milestone) => milestone.earned === (filter === 'earned'));

export const newlyEarnedMilestones = (
  milestones: readonly MilestoneStatus[],
  knownEarnedIds: ReadonlySet<string>,
): readonly MilestoneStatus[] => milestones.filter((milestone) => milestone.earned && !knownEarnedIds.has(milestone.id));

const episodeMasteryDepth = (groups: readonly LogicalRecordGroup[]): number => {
  const difficulties = new Set(groups.map((group) => group.difficulty));
  let depth = 0;
  for (const difficulty of difficulties) {
    for (const episode of CAMPAIGN.episodes) {
      const episodeMaps = episode.maps.filter((id) => !CAMPAIGN.maps[id].secretMap);
      const count = episodeMaps.filter((id) => {
        const group = groups.find((candidate) => candidate.mapId === id && candidate.difficulty === difficulty);
        return Boolean(group?.records.some(mastered));
      }).length;
      depth = Math.max(depth, count);
    }
  }
  return depth;
};

const campaignMasteryDepth = (groups: readonly LogicalRecordGroup[]): number => {
  const difficulties = new Set(groups.map((group) => group.difficulty));
  let depth = 0;
  for (const difficulty of difficulties) {
    const count = standardMaps.filter((id) => {
      const group = groups.find((candidate) => candidate.mapId === id && candidate.difficulty === difficulty);
      return Boolean(group?.records.some(mastered));
    }).length;
    depth = Math.max(depth, count);
  }
  return depth;
};

/** Milestones are projections of campaign records, including their single-run mastery proofs. */
export const deriveMilestones = (progress: CampaignUnlocks): readonly MilestoneStatus[] => {
  const records = Object.values(progress.records).filter((record) => record.mapId in CAMPAIGN.maps);
  const groups = logicalRecordGroups(records);
  const maximumCompletions = Math.max(0, ...groups.map((group) =>
    group.records.reduce((total, record) => total + record.completions, 0)));
  const maximumChain = Math.max(0, ...records.map((record) => record.bestChain));
  const parRecords = groups.filter((group) => group.records.some((record) => record.parBeaten)).length;
  const sRecords = groups.filter((group) => group.records.some((record) => record.bestGrade === 'S')).length;
  const masteredRecords = groups.filter((group) => group.records.some(mastered)).length;
  const episodeDepth = episodeMasteryDepth(groups);
  const campaignDepth = campaignMasteryDepth(groups);
  const bindingMasteries = groups.filter((group) => group.difficulty === 'binding-authority'
    && group.records.some(mastered)).length;
  const discoveredSecrets = secretMaps.filter((id) => progress.discoveredSecretMaps.includes(id)).length;
  const completedSecretMaps = secretMaps.filter((id) => progress.completedMaps.includes(id)).length;
  const campaignEpisodes = CAMPAIGN.episodes.filter((episode) => progress.completedEpisodes.includes(episode.id)).length;

  return [
    status('first-clear', 'First Notice', 'Complete any file.', progress.completedMaps.length, 1),
    status('second-review', 'Second Review', 'Complete one file twice.', maximumCompletions, 2, `${bounded(maximumCompletions, 2)}/2 clears`),
    status('chain-five', 'In Sequence', 'Build a five-link momentum chain.', maximumChain, 5, `x${bounded(maximumChain, 5)}/x5`),
    status('chain-ten', 'Perfect Handoff', 'Build a ten-link momentum chain.', maximumChain, 10, `x${bounded(maximumChain, 10)}/x10`),
    status('first-par', 'Ahead of Schedule', 'Beat par on any file.', parRecords, 1),
    status('first-s', 'Red Seal', 'Earn an S grade on any file.', sRecords, 1),
    status('first-mastery', 'Closed Without Exception', 'Earn full mastery on any file.', masteredRecords, 1),
    status('binding-mastery', 'Authority Without Appeal', 'Master any file on Binding Authority.', bindingMasteries, 1),
    status('episode-close', 'Regional Close', 'Complete an episode.', progress.completedEpisodes.length, 1),
    status('episode-mastery', 'Clean Ledger', 'Master all eight standard files in one episode at one response level.', episodeDepth, 8, `${episodeDepth}/8 mastered`),
    status('campaign-mastery', 'One Response Standard', 'Master all 24 standard files at one response level.', campaignDepth, standardMaps.length, `${campaignDepth}/${standardMaps.length} mastered`),
    status('first-secret', 'Fine Print', 'Discover a concealed outbound route.', discoveredSecrets, 1),
    status('secret-clear', 'Off the Record', 'Complete a concealed file.', completedSecretMaps, 1),
    status('all-secrets', 'Every Exclusion', 'Discover all concealed outbound routes.', discoveredSecrets, secretMaps.length),
    status('campaign-close', 'National Close', 'Complete all three episodes.', campaignEpisodes, CAMPAIGN.episodes.length),
  ];
};

const contextualMilestoneIds = (
  progress: CampaignUnlocks,
  difficulty?: GameDifficulty,
  mapId?: MapId,
): ReadonlySet<string> => {
  if (!difficulty || !mapId) return new Set();
  const records = Object.values(progress.records)
    .filter((record) => record.mapId === mapId && record.difficulty === difficulty);
  if (!records.length) return new Set();
  const ids = new Set<string>(['first-clear']);
  const completions = records.reduce((total, record) => total + record.completions, 0);
  const bestChain = Math.max(...records.map((record) => record.bestChain));
  if (completions >= 2) ids.add('second-review');
  if (bestChain >= 5) ids.add('chain-five');
  if (bestChain >= 10) ids.add('chain-ten');
  if (records.some((record) => record.parBeaten)) ids.add('first-par');
  if (records.some((record) => record.bestGrade === 'S')) ids.add('first-s');
  if (records.some(mastered)) {
    ids.add('first-mastery');
    if (difficulty === 'binding-authority') ids.add('binding-mastery');
    if (!CAMPAIGN.maps[mapId].secretMap) ids.add('campaign-mastery');
  }
  const map = CAMPAIGN.maps[mapId];
  if (progress.completedEpisodes.includes(map.episode)) ids.add('episode-close');
  if (map.secretMap || map.secretExitTo && progress.discoveredSecretMaps.includes(map.secretExitTo)) ids.add('first-secret');
  if (map.secretMap && progress.completedMaps.includes(mapId)) ids.add('secret-clear');
  return ids;
};

export const milestoneHighlights = (
  milestones: readonly MilestoneStatus[],
  progress: CampaignUnlocks,
  difficulty?: GameDifficulty,
  mapId?: MapId,
): MilestoneHighlights => {
  const contextual = contextualMilestoneIds(progress, difficulty, mapId);
  const earned = milestones.filter((milestone) => milestone.earned);
  const preferred = [...earned].sort((left, right) => {
    const relevance = Number(contextual.has(right.id)) - Number(contextual.has(left.id));
    return relevance || milestones.indexOf(right) - milestones.indexOf(left);
  });
  const next = milestones
    .filter((milestone) => !milestone.earned)
    .sort((left, right) => right.current / right.target - left.current / left.target
      || milestones.indexOf(left) - milestones.indexOf(right))[0];
  return {
    earned: earned.length,
    total: milestones.length,
    featured: preferred.slice(0, 2),
    ...(next ? { next } : {}),
  };
};
