import { describe, expect, it } from 'vitest';
import type { CampaignUnlocks, MapRecord } from './PersistenceSystem';
import {
  deriveMilestones,
  filterMilestones,
  milestoneHighlights,
  milestoneReward,
  newlyEarnedMilestones,
} from './Milestones';

const record = (mapId: string, overrides: Partial<MapRecord> = {}): MapRecord => ({
  mapId,
  difficulty: overrides.difficulty ?? 'field-adjuster',
  runVariant: overrides.runVariant ?? 'fresh-start',
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
    runVariant: overrides.runVariant ?? 'fresh-start',
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

  it('maps every milestone to one deterministic cosmetic-only seal', () => {
    const milestones = deriveMilestones(campaign());
    const rewards = milestones.map(({ reward }) => reward);

    expect(new Set(rewards.map(({ label }) => label)).size).toBe(milestones.length);
    expect(rewards.every((reward) => reward.kind === 'seal' && reward.gameplayEffect === false)).toBe(true);
    expect(milestoneReward('first-clear')).toEqual({
      kind: 'seal',
      label: 'First Notice Seal',
      gameplayEffect: false,
    });
    expect(milestoneReward('first-clear')).toEqual(milestoneReward('first-clear'));
  });

  it('filters the ledger in authored order and exposes an honest empty earned view', () => {
    const empty = deriveMilestones(campaign());
    expect(filterMilestones(empty, 'all')).toEqual(empty);
    expect(filterMilestones(empty, 'open')).toEqual(empty);
    expect(filterMilestones(empty, 'earned')).toEqual([]);

    const mixed = deriveMilestones(campaign({ completedMaps: ['E1M1'] }));
    expect(filterMilestones(mixed, 'earned').map(({ id }) => id)).toEqual(['first-clear']);
    expect(filterMilestones(mixed, 'open').map(({ id }) => id)).toEqual(
      mixed.filter(({ id }) => id !== 'first-clear').map(({ id }) => id),
    );
  });

  it('diffs newly earned awards against session-known history without mutating either input', () => {
    const milestones = deriveMilestones(campaign({
      completedMaps: ['E1M1'],
      records: { 'E1M1:field-adjuster': record('E1M1') },
    }));
    const earned = milestones.filter(({ earned: isEarned }) => isEarned);
    const known = new Set(earned.slice(0, 2).map(({ id }) => id));
    const before = [...known];

    expect(newlyEarnedMilestones(milestones, known).map(({ id }) => id)).toEqual(earned.slice(2).map(({ id }) => id));
    expect([...known]).toEqual(before);
    expect(newlyEarnedMilestones(milestones, new Set(earned.map(({ id }) => id)))).toEqual([]);
  });

  it('deduplicates sibling run tracks while preserving legacy and cross-track eligibility', () => {
    const progress = campaign({
      completedMaps: ['E1M1'],
      records: {
        'E1M1:field-adjuster:fresh-start': record('E1M1', {
          runVariant: 'fresh-start',
          completions: 1,
          bestGrade: 'A',
          parBeaten: false,
          masteryProof: undefined,
        }),
        'E1M1:field-adjuster:campaign-carry': record('E1M1', {
          runVariant: 'campaign-carry',
          completions: 1,
          masteryProof: undefined,
        }),
        'E1M1:field-adjuster:legacy-unclassified': record('E1M1', {
          runVariant: 'legacy-unclassified',
        }),
      },
    });
    const milestones = deriveMilestones(progress);

    expect(milestones.find(({ id }) => id === 'second-review')).toMatchObject({ earned: true, current: 2 });
    expect(milestones.find(({ id }) => id === 'episode-mastery')?.progress).toBe('1/8 mastered');
    expect(milestones.find(({ id }) => id === 'campaign-mastery')?.progress).toBe('1/24 mastered');
    expect(milestoneHighlights(milestones, progress, 'field-adjuster', 'E1M1').featured
      .map(({ id }) => id)).toContain('first-mastery');
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
