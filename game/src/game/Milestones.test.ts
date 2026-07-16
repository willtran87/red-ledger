import { describe, expect, it } from 'vitest';
import type { CampaignUnlocks, MapRecord } from './PersistenceSystem';
import { deriveMilestones, milestoneHighlights } from './Milestones';

const record = (mapId: string, overrides: Partial<MapRecord> = {}): MapRecord => ({
  mapId,
  difficulty: overrides.difficulty ?? 'field-adjuster',
  completions: 1,
  bestTime: 90,
  highScore: 8000,
  bestChain: 6,
  bestKillsPercent: 100,
  bestItemsPercent: 100,
  bestSecretsPercent: 100,
  bestGrade: 'S',
  parBeaten: true,
  masteryProof: {
    mapId,
    difficulty: overrides.difficulty ?? 'field-adjuster',
    elapsed: 90,
    parSeconds: 120,
    score: 8000,
    bestChain: 6,
    killsPercent: 100,
    itemsPercent: 100,
    secretsPercent: 100,
    grade: 'S',
    achievedAt: 1,
  },
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
    expect(milestones).toHaveLength(15);
    expect(milestones.every((milestone) => !milestone.earned)).toBe(true);
    expect(milestones.find((milestone) => milestone.id === 'episode-mastery')?.progress).toBe('0/8 mastered');
    expect(milestones.find((milestone) => milestone.id === 'campaign-mastery')?.progress).toBe('0/24 mastered');
  });

  it('derives clear, replay, chain, performance, episode, secret, and campaign awards without mutable award state', () => {
    const records = Object.fromEntries(
      [1, 2, 3].flatMap((episode) => Array.from({ length: 8 }, (_, index) => {
        const mapId = `E${episode}M${index + 1}`;
        return [`${mapId}:binding-authority`, record(mapId, {
          difficulty: 'binding-authority',
          ...(episode === 1 && index === 0 ? { completions: 2, bestChain: 12 } : {}),
        })];
      })),
    );
    const milestones = deriveMilestones(campaign({
      completedMaps: [1, 2, 3].flatMap((episode) => Array.from({ length: 9 }, (_, index) => `E${episode}M${index + 1}`)),
      completedEpisodes: ['first-notice', 'exclusions-apply', 'adverse-development'],
      discoveredSecretMaps: ['E1M9', 'E2M9', 'E3M9'],
      records,
    }));

    expect(milestones.every((milestone) => milestone.earned)).toBe(true);
    expect(milestones.find((milestone) => milestone.id === 'second-review')?.progress).toBe('2/2 clears');
    expect(milestones.find((milestone) => milestone.id === 'chain-ten')?.progress).toBe('x10/x10');
    expect(milestones.find((milestone) => milestone.id === 'campaign-mastery')?.progress).toBe('24/24 mastered');
  });

  it('does not award file or episode mastery from complementary personal bests without a single-run proof', () => {
    const records = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => {
        const mapId = `E1M${index + 1}`;
        return [`${mapId}:field-adjuster`, record(mapId, { masteryProof: undefined })];
      }),
    );
    const milestones = deriveMilestones(campaign({ records }));

    expect(milestones.find((milestone) => milestone.id === 'first-mastery')).toMatchObject({ earned: false, current: 0 });
    expect(milestones.find((milestone) => milestone.id === 'episode-mastery')).toMatchObject({ earned: false, current: 0 });
    expect(milestones.find((milestone) => milestone.id === 'campaign-mastery')).toMatchObject({ earned: false, current: 0 });
  });

  it('requires one response level and single-run proofs for national mastery', () => {
    const splitRecords = Object.fromEntries(
      [1, 2, 3].flatMap((episode) => Array.from({ length: 8 }, (_, index) => {
        const mapId = `E${episode}M${index + 1}`;
        const difficulty = (episode + index) % 2 === 0 ? 'field-adjuster' : 'binding-authority';
        return [`${mapId}:${difficulty}`, record(mapId, { difficulty })];
      })),
    );
    const split = deriveMilestones(campaign({ records: splitRecords }));
    expect(split.find((milestone) => milestone.id === 'campaign-mastery')).toMatchObject({ earned: false, current: 12 });
    expect(split.find((milestone) => milestone.id === 'binding-mastery')).toMatchObject({ earned: true });

    const noProofRecords = Object.fromEntries(Object.entries(splitRecords).map(([key, value]) => [
      key,
      { ...value, masteryProof: undefined },
    ]));
    const noProof = deriveMilestones(campaign({ records: noProofRecords }));
    expect(noProof.find((milestone) => milestone.id === 'binding-mastery')).toMatchObject({ earned: false, current: 0 });
    expect(noProof.find((milestone) => milestone.id === 'campaign-mastery')).toMatchObject({ earned: false, current: 0 });
  });

  it('distinguishes discovering a secret route from completing its concealed map', () => {
    const discovered = deriveMilestones(campaign({ discoveredSecretMaps: ['E1M9'] }));
    expect(discovered.find((milestone) => milestone.id === 'first-secret')).toMatchObject({ earned: true });
    expect(discovered.find((milestone) => milestone.id === 'secret-clear')).toMatchObject({ earned: false });

    const completedProgress = campaign({
      completedMaps: ['E1M9'],
      discoveredSecretMaps: ['E1M9'],
      records: { 'E1M9:field-adjuster': record('E1M9', { masteryProof: undefined }) },
    });
    const completed = deriveMilestones(completedProgress);
    expect(completed.find((milestone) => milestone.id === 'secret-clear')).toMatchObject({ earned: true });
    expect(milestoneHighlights(completed, completedProgress, 'field-adjuster', 'E1M9').featured
      .map((milestone) => milestone.id)).toContain('secret-clear');
  });

  it('features milestones relevant to the just-completed file and chooses the closest honest next target', () => {
    const progress = campaign({
      completedMaps: ['E1M1'],
      records: { 'E1M1:field-adjuster': record('E1M1', { completions: 2, bestChain: 6, bestGrade: 'A', masteryProof: undefined }) },
    });
    const highlights = milestoneHighlights(deriveMilestones(progress), progress, 'field-adjuster', 'E1M1');

    expect(highlights.earned).toBe(4);
    expect(highlights.featured.map((milestone) => milestone.id)).toEqual(['first-par', 'chain-five']);
    expect(highlights.next?.id).toBe('chain-ten');
    expect(highlights.next?.progress).toBe('x6/x10');
  });
});
