import { CAMPAIGN, type MapId } from '../data';
import type { GameDifficulty } from './definitions';
import type { CampaignUnlocks, MapRecord } from './PersistenceSystem';

export interface MilestoneStatus {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly earned: boolean;
  readonly current: number;
  readonly target: number;
  readonly progress: string;
}

export interface MilestoneHighlights {
  readonly earned: number;
  readonly total: number;
  readonly featured: readonly MilestoneStatus[];
  readonly next?: MilestoneStatus;
}

const secretMaps = Object.values(CAMPAIGN.maps).filter((map) => map.secretMap).map((map) => map.id);

const mastered = (record: MapRecord): boolean => record.parBeaten
  && record.bestGrade === 'S'
  && record.bestKillsPercent === 100
  && record.bestItemsPercent === 100
  && record.bestSecretsPercent === 100;

const bounded = (current: number, target: number): number => Math.min(target, Math.max(0, current));

const status = (
  id: string,
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
});

const episodeMasteryDepth = (records: readonly MapRecord[]): number => {
  const difficulties = new Set(records.map((record) => record.difficulty));
  let depth = 0;
  for (const difficulty of difficulties) {
    for (const episode of CAMPAIGN.episodes) {
      const episodeMaps = episode.maps.filter((id) => !CAMPAIGN.maps[id].secretMap);
      const count = episodeMaps.filter((id) => {
        const record = records.find((candidate) => candidate.mapId === id && candidate.difficulty === difficulty);
        return Boolean(record && mastered(record));
      }).length;
      depth = Math.max(depth, count);
    }
  }
  return depth;
};

/** Milestones are projections of campaign records, so they require no additional save data. */
export const deriveMilestones = (progress: CampaignUnlocks): readonly MilestoneStatus[] => {
  const records = Object.values(progress.records).filter((record) => record.mapId in CAMPAIGN.maps);
  const maximumCompletions = Math.max(0, ...records.map((record) => record.completions));
  const maximumChain = Math.max(0, ...records.map((record) => record.bestChain));
  const parRecords = records.filter((record) => record.parBeaten).length;
  const sRecords = records.filter((record) => record.bestGrade === 'S').length;
  const masteredRecords = records.filter(mastered).length;
  const episodeDepth = episodeMasteryDepth(records);
  const discoveredSecrets = secretMaps.filter((id) => progress.discoveredSecretMaps.includes(id)).length;
  const campaignEpisodes = CAMPAIGN.episodes.filter((episode) => progress.completedEpisodes.includes(episode.id)).length;

  return [
    status('first-clear', 'First Notice', 'Complete any file.', progress.completedMaps.length, 1),
    status('second-review', 'Second Review', 'Complete one file twice.', maximumCompletions, 2, `${bounded(maximumCompletions, 2)}/2 clears`),
    status('chain-five', 'In Sequence', 'Build a five-link momentum chain.', maximumChain, 5, `x${bounded(maximumChain, 5)}/x5`),
    status('chain-ten', 'Perfect Handoff', 'Build a ten-link momentum chain.', maximumChain, 10, `x${bounded(maximumChain, 10)}/x10`),
    status('first-par', 'Ahead of Schedule', 'Beat par on any file.', parRecords, 1),
    status('first-s', 'Red Seal', 'Earn an S grade on any file.', sRecords, 1),
    status('first-mastery', 'Closed Without Exception', 'Earn full mastery on any file.', masteredRecords, 1),
    status('episode-close', 'Regional Close', 'Complete an episode.', progress.completedEpisodes.length, 1),
    status('episode-mastery', 'Clean Ledger', 'Master all eight standard files in one episode at one response level.', episodeDepth, 8, `${episodeDepth}/8 mastered`),
    status('first-secret', 'Fine Print', 'Discover a concealed outbound route.', discoveredSecrets, 1),
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
  const record = progress.records[`${mapId}:${difficulty}`];
  if (!record) return new Set();
  const ids = new Set<string>(['first-clear']);
  if (record.completions >= 2) ids.add('second-review');
  if (record.bestChain >= 5) ids.add('chain-five');
  if (record.bestChain >= 10) ids.add('chain-ten');
  if (record.parBeaten) ids.add('first-par');
  if (record.bestGrade === 'S') ids.add('first-s');
  if (mastered(record)) ids.add('first-mastery');
  const map = CAMPAIGN.maps[mapId];
  if (progress.completedEpisodes.includes(map.episode)) ids.add('episode-close');
  if (map.secretMap || map.secretExitTo && progress.discoveredSecretMaps.includes(map.secretExitTo)) ids.add('first-secret');
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
