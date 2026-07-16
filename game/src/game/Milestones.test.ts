import { describe, expect, it } from 'vitest';
import type { CampaignUnlocks, MapRecord } from './PersistenceSystem';
import { deriveMilestones, milestoneHighlights } from './Milestones';

const record = (mapId: string, overrides: Partial<MapRecord> = {}): MapRecord => ({
  mapId,
  difficulty: 'field-adjuster',
  completions: 1,
  bestTime: 90,
  highScore: 8000,
  bestChain: 6,
  bestKillsPercent: 100,
  bestItemsPercent: 100,
  bestSecretsPercent: 100,
  bestGrade: 'S',
  parBeaten: true,
  achievedAt: 1,
  ...overrides,
});

const campaign = (overrides: Partial<CampaignUnlocks> = {}): CampaignUnlocks => ({
  unlockedEpisodes: ['first-notice'],
  completedEpisodes: [],
  completedMaps: [],
  discoveredSecretMaps: [],
  records: {},
  updatedAt: 0,
  ...overrides,
});

describe('derived campaign milestones', () => {
  it('starts empty and reports honest bounded progress', () => {
    const milestones = deriveMilestones(campaign());
    expect(milestones).toHaveLength(12);
    expect(milestones.every((milestone) => !milestone.earned)).toBe(true);
    expect(milestones.find((milestone) => milestone.id === 'episode-mastery')?.progress).toBe('0/8 mastered');
  });

  it('derives clear, replay, chain, performance, episode, secret, and campaign awards without mutable award state', () => {
    const records = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => {
        const mapId = `E1M${index + 1}`;
        return [`${mapId}:field-adjuster`, record(mapId, index === 0 ? { completions: 2, bestChain: 12 } : {})];
      }),
    );
    const milestones = deriveMilestones(campaign({
      completedMaps: Array.from({ length: 24 }, (_, index) => `standard-${index}`),
      completedEpisodes: ['first-notice', 'exclusions-apply', 'adverse-development'],
      discoveredSecretMaps: ['E1M9', 'E2M9', 'E3M9'],
      records,
    }));

    expect(milestones.every((milestone) => milestone.earned)).toBe(true);
    expect(milestones.find((milestone) => milestone.id === 'second-review')?.progress).toBe('2/2 clears');
    expect(milestones.find((milestone) => milestone.id === 'chain-ten')?.progress).toBe('x10/x10');
  });

  it('features milestones relevant to the just-completed file and chooses the closest honest next target', () => {
    const progress = campaign({
      completedMaps: ['E1M1'],
      records: { 'E1M1:field-adjuster': record('E1M1', { completions: 2, bestChain: 6, bestGrade: 'A' }) },
    });
    const highlights = milestoneHighlights(deriveMilestones(progress), progress, 'field-adjuster', 'E1M1');

    expect(highlights.earned).toBe(4);
    expect(highlights.featured.map((milestone) => milestone.id)).toEqual(['first-par', 'chain-five']);
    expect(highlights.next?.id).toBe('chain-ten');
    expect(highlights.next?.progress).toBe('x6/x10');
  });
});
