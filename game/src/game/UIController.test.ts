import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../data';
import type { CampaignUnlocks, MapPerformance, MapRecord } from './PersistenceSystem';
import {
  activeEffectsPresentation,
  advanceAssistiveGameplayGuidance,
  automapPanDelta,
  boundedReplayEntries,
  DIFFICULTY_OPTIONS,
  entryBriefingLabels,
  entryObjectiveBriefing,
  entryObjectiveCue,
  formatRangeSetting,
  levelSelectRecordTracks,
  masteryAggregatePresentation,
  masteryPresentation,
  milestoneAwardAnnouncement,
  normalizeInterfacePreferences,
  resolveReducedMotionSetting,
  resolveScreenShakeSetting,
  runVariantUiLabel,
  trackedIntermissionMastery,
  touchBriefingPadLabels,
} from './UIController';
import { deriveMilestones } from './Milestones';

describe('active timed-effect presentation', () => {
  it('uses a deterministic tactical order with rounded time and progress', () => {
    const effects = activeEffectsPresentation({
      goggles: 12.01,
      forensic: 9.1,
      binder: 30,
      rapid: 18.4,
      hazard: 24.2,
    });

    expect(effects.map(({ key }) => key)).toEqual(['binder', 'hazard', 'rapid', 'forensic', 'goggles']);
    expect(effects.map(({ seconds }) => seconds)).toEqual([30, 25, 19, 10, 13]);
    expect(effects.map(({ progress }) => progress)).toEqual([100, 81, 62, 31, 41]);
  });

  it('marks five seconds and below urgent while omitting nonpositive or invalid effects', () => {
    const effects = activeEffectsPresentation({ binder: 5, hazard: 5.01, rapid: 0, forensic: -1, goggles: Number.NaN });

    expect(effects).toHaveLength(2);
    expect(effects[0]).toMatchObject({ key: 'binder', seconds: 5, urgent: true });
    expect(effects[1]).toMatchObject({ key: 'hazard', seconds: 6, urgent: false });
    expect(activeEffectsPresentation({ rapid: Number.POSITIVE_INFINITY })).toEqual([]);
  });
});

describe('milestone award announcements', () => {
  it('announces each newly earned cosmetic reward once and stays silent for an empty diff', () => {
    const awards = deriveMilestones({
      unlockedEpisodes: ['first-notice'],
      completedEpisodes: [],
      completedMaps: ['E1M1'],
      discoveredSecretMaps: [],
      records: {},
      updatedAt: 1,
    }).filter(({ earned }) => earned);

    expect(milestoneAwardAnnouncement(awards)).toBe(
      'Milestone earned: First Notice. Cosmetic seal: First Notice Seal.',
    );
    expect(milestoneAwardAnnouncement([])).toBe('');
  });
});

describe('difficulty menu truthfulness', () => {
  it('states the exact ammunition-only economy modifier for every response level', () => {
    expect(DIFFICULTY_OPTIONS.map(({ id, detail }) => [id, detail])).toEqual([
      ['orientation', 'Story-focused: 50% more ammo from pickups, fewer and slower threats, and forgiving damage.'],
      ['desk-adjuster', 'Measured: 25% more ammo from pickups, fewer threats, and reduced threat speed and damage.'],
      ['field-adjuster', 'Recommended: standard ammo pickups with the intended threat placements, speed, and damage.'],
      ['catastrophe-team', 'Hard placements with ammo from pickups reduced to 80%; threat speed and damage remain standard.'],
      ['binding-authority', 'Hard placements, ammo from pickups reduced to 65%, and faster, harder-hitting threats.'],
    ]);
    expect(DIFFICULTY_OPTIONS.every(({ detail }) => !/suppl|recovery/i.test(detail))).toBe(true);
  });
});

const mapRecord = (overrides: Partial<MapRecord> = {}): MapRecord => ({
  mapId: 'E1M1',
  difficulty: 'field-adjuster',
  runVariant: overrides.runVariant ?? 'fresh-start',
  completions: 3,
  bestTime: 120,
  highScore: 9000,
  bestChain: 8,
  bestKillsPercent: 100,
  bestItemsPercent: 100,
  bestSecretsPercent: 100,
  bestGrade: 'S',
  parBeaten: true,
  masteryProof: {
    mapId: 'E1M1',
    difficulty: 'field-adjuster',
    runVariant: overrides.runVariant ?? 'fresh-start',
    elapsed: 120,
    parSeconds: 180,
    score: 9000,
    bestChain: 8,
    killsPercent: 100,
    itemsPercent: 100,
    secretsPercent: 100,
    grade: 'S',
    achievedAt: 1,
  },
  achievedAt: 1,
  ...overrides,
});

const mapPerformance = (overrides: Partial<MapPerformance> = {}): MapPerformance => ({
  mapId: 'E1M1',
  difficulty: 'field-adjuster',
  runVariant: overrides.runVariant ?? 'fresh-start',
  elapsed: 180,
  parSeconds: 240,
  score: 5000,
  bestChain: 3,
  killsPercent: 72,
  itemsPercent: 64,
  secretsPercent: 0,
  grade: 'B',
  ...overrides,
});

const campaignProgress = (records: CampaignUnlocks['records']): CampaignUnlocks => ({
  unlockedEpisodes: ['first-notice'],
  completedEpisodes: [],
  completedMaps: ['E1M1'],
  discoveredSecretMaps: [],
  records,
  updatedAt: 1,
});

describe('automap pointer panning', () => {
  it('tracks pointer pixels independently of cell scale', () => {
    for (const cellSize of [18, 32, 64]) {
      expect(automapPanDelta(48, cellSize) * cellSize).toBeCloseTo(48, 6);
      expect(automapPanDelta(-27, cellSize) * cellSize).toBeCloseTo(-27, 6);
    }
  });

  it('ignores movement until a rendered map scale is available', () => {
    expect(automapPanDelta(48, 0)).toBe(0);
    expect(automapPanDelta(48, Number.NaN)).toBe(0);
  });
});

describe('session replay library bounds', () => {
  const entry = (id: string, createdAt: number, payload = '') => ({ id, createdAt, payload });

  it('retains the replay currently being added while enforcing the count limit', () => {
    const entries = Array.from({ length: 8 }, (_, index) => entry(`replay-${index}`, index));
    const bounded = boundedReplayEntries(entries, 'replay-0', 6, Number.MAX_SAFE_INTEGER);
    expect(bounded).toHaveLength(6);
    expect(bounded.map((item) => item.id)).toEqual([
      'replay-7', 'replay-6', 'replay-5', 'replay-4', 'replay-3', 'replay-0',
    ]);
  });

  it('evicts optional entries to meet the aggregate byte budget without discarding the protected replay', () => {
    const required = entry('required', 1, 'r'.repeat(40));
    const entries = [required, entry('newest', 3, 'n'.repeat(80)), entry('middle', 2, 'm'.repeat(80))];
    const requiredBytes = JSON.stringify([required]).length * 2;
    expect(boundedReplayEntries(entries, required.id, 6, requiredBytes + 4)).toEqual([required]);
    expect(boundedReplayEntries(entries, undefined, 6, 1).map((item) => item.id)).toEqual(['newest']);
  });
});

describe('persistent mastery presentation', () => {
  it('keeps a mastered record complete when the current run is imperfect', () => {
    const presentation = masteryPresentation('E1M1', mapRecord(), mapPerformance());

    expect(presentation.complete).toBe(true);
    expect(presentation.target).toBe('Full mastery achieved');
    expect(presentation.metrics).toEqual([
      'Threats 72% / PB 100%',
      'Items 64% / PB 100%',
      'Secrets 0% / PB 100%',
    ]);
  });

  it('does not hide a persistent record gap behind a perfect current tally', () => {
    const presentation = masteryPresentation(
      'E1M1',
      mapRecord({ bestKillsPercent: 55, bestGrade: 'A', masteryProof: undefined }),
      mapPerformance({ killsPercent: 100, itemsPercent: 100, secretsPercent: 100, grade: 'S' }),
    );

    expect(presentation.complete).toBe(false);
    expect(presentation.target).toBe('Retry goal: Close every threat (55%)');
    expect(presentation.metrics[0]).toBe('Threats 100% / PB 55%');
  });

  it('asks for one complete run when personal bests cover every goal without a mastery proof', () => {
    const presentation = masteryPresentation('E1M1', mapRecord({ masteryProof: undefined }));

    expect(presentation.complete).toBe(false);
    expect(presentation.target).toBe('Retry goal: Complete every goal in one run');
  });

  it('keeps Level Select on Fresh Start while retaining carry and legacy tracks', () => {
    const fresh = mapRecord({ runVariant: 'fresh-start' });
    const carry = mapRecord({ runVariant: 'campaign-carry', highScore: 12_000 });
    const legacy = mapRecord({ runVariant: 'legacy-unclassified', highScore: 10_000 });
    const progress = campaignProgress({
      'E1M1:field-adjuster:fresh-start': fresh,
      'E1M1:field-adjuster:campaign-carry': carry,
      'E1M1:field-adjuster:legacy-unclassified': legacy,
    });

    expect(levelSelectRecordTracks(progress, 'E1M1', 'field-adjuster')).toEqual({
      freshStart: fresh,
      campaignCarry: carry,
      legacy,
    });
    expect(masteryAggregatePresentation(progress, 'field-adjuster', 'fresh-start')).toContain('Fresh Start Campaign 1/24 clear');
    expect(masteryAggregatePresentation(progress, 'field-adjuster', 'campaign-carry')).toContain('Campaign Carry Campaign 1/24 clear');
    expect(masteryAggregatePresentation(progress, 'field-adjuster', 'legacy-unclassified')).toContain('Legacy Run (retained) Campaign 1/24 clear');
  });

  it('reports the actual intermission track while making a carry retry target Fresh Start', () => {
    const fresh = mapRecord({
      runVariant: 'fresh-start',
      parBeaten: false,
      masteryProof: undefined,
    });
    const carry = mapRecord({ runVariant: 'campaign-carry' });
    const progress = campaignProgress({
      'E1M1:field-adjuster:fresh-start': fresh,
      'E1M1:field-adjuster:campaign-carry': carry,
    });
    const tracked = trackedIntermissionMastery(
      'E1M1',
      progress,
      'field-adjuster',
      'campaign-carry',
      carry,
      mapPerformance({ runVariant: 'campaign-carry' }),
    );

    expect(tracked.resultLabel).toBe('Campaign Carry');
    expect(tracked.result.complete).toBe(true);
    expect(tracked.retry.complete).toBe(false);
    expect(tracked.retryTarget).toMatch(/^Retry goal: Fresh Start - Beat par /);
    expect(runVariantUiLabel('legacy-unclassified')).toBe('Legacy Run (retained)');
  });
});

describe('reduced motion preference', () => {
  it('uses the operating-system preference until the player chooses explicitly', () => {
    expect(resolveReducedMotionSetting({}, true)).toBe(true);
    expect(resolveReducedMotionSetting({}, false)).toBe(false);
    expect(resolveReducedMotionSetting({ 'reduced-motion': 'false' }, true)).toBe(true);
  });

  it('lets either stored explicit choice override the operating-system preference', () => {
    expect(resolveReducedMotionSetting({ 'reduced-motion': false }, true)).toBe(false);
    expect(resolveReducedMotionSetting({ 'reduced-motion': true }, false)).toBe(true);
  });

  it('defaults screen shake off with reduced-motion preference without overriding an explicit choice', () => {
    expect(resolveScreenShakeSetting({}, true)).toBe(false);
    expect(resolveScreenShakeSetting({}, false)).toBe(true);
    expect(resolveScreenShakeSetting({ 'screen-shake': true }, true)).toBe(true);
    expect(resolveScreenShakeSetting({ 'screen-shake': false }, false)).toBe(false);
  });
});

describe('interface personalization', () => {
  it('formats continuous settings as visible and assistive values', () => {
    expect(formatRangeSetting('sensitivity', 1.2)).toBe('1.2x');
    expect(formatRangeSetting('controller-deadzone', .18)).toBe('18%');
    expect(formatRangeSetting('music-volume', .65)).toBe('65%');
  });

  it('keeps valid touch layout and text choices', () => {
    expect(normalizeInterfacePreferences({
      touchControlSize: 'large',
      touchControlOpacity: .62,
      touchHandedness: 'left',
      uiTextScale: 'largest',
    })).toEqual({
      touchControlSize: 'large',
      touchControlOpacity: .62,
      touchHandedness: 'left',
      uiTextScale: 'largest',
    });
  });

  it('bounds opacity and restores robust defaults for corrupt choices', () => {
    expect(normalizeInterfacePreferences({
      touchControlSize: 'huge',
      touchControlOpacity: 0,
      touchHandedness: 'center',
      uiTextScale: 4,
    })).toEqual({
      touchControlSize: 'standard',
      touchControlOpacity: .45,
      touchHandedness: 'right',
      uiTextScale: 'standard',
    });
  });
});

describe('contextual entry briefing', () => {
  it('teaches only the essential actions during initial orientation', () => {
    expect(entryBriefingLabels(true)).toEqual(['MOVE', 'LOOK', 'FIRE', 'USE']);
  });

  it('retains only route-relevant bindings after orientation', () => {
    expect(entryBriefingLabels(false)).toEqual(['USE', 'WEAPON', 'MAP']);
  });

  it('mirrors touch briefing pad names with the configured handedness', () => {
    expect(touchBriefingPadLabels('right')).toEqual({ move: 'Left pad', look: 'Right pad' });
    expect(touchBriefingPadLabels('left')).toEqual({ move: 'Right pad', look: 'Left pad' });
  });

  it('derives an honest objective cue from the current map', () => {
    expect(entryObjectiveCue(CAMPAIGN.maps.E1M1)).toContain('Red credential');
    expect(entryObjectiveCue(CAMPAIGN.maps.E3M8)).toContain('Chief Actuary and Uninsurable');
  });

  it('orders the live immediate objective before the authored route', () => {
    const briefing = entryObjectiveBriefing({
      map: CAMPAIGN.maps.E1M1,
      objective: 'Close initial exposures | 4 left',
    });

    expect(briefing).toContain('First: Close initial exposures | 4 left.');
    expect(briefing).toContain('Then: Secure Red credential');
  });

  it('omits start-of-file directions from a restored in-progress briefing', () => {
    const briefing = entryObjectiveBriefing({
      map: CAMPAIGN.maps.E1M1,
      objective: 'Proceed to the exit',
    }, false);

    expect(briefing).toBe('Current objective: Proceed to the exit.');
    expect(briefing).not.toContain('credential');
  });
});

describe('assistive gameplay guidance', () => {
  const initial = { objective: '', interactionSignature: '' };
  const input = {
    active: true,
    transientMessage: '',
    objective: 'Close initial exposures | 4 left',
    interaction: { signature: 'ready|minimal-terminal|Access', label: 'Access', state: 'ready' as const },
  };

  it('waits through menus, the entry gate, and transient messages before announcing once', () => {
    expect(advanceAssistiveGameplayGuidance({ ...input, active: false }, initial)).toEqual({ state: initial });
    expect(advanceAssistiveGameplayGuidance({ ...input, transientMessage: 'E1M1: First Notice' }, initial)).toEqual({ state: initial });

    const announced = advanceAssistiveGameplayGuidance(input, initial);
    expect(announced.announcement).toBe('Objective: Close initial exposures | 4 left. Action available: Access.');
    expect(advanceAssistiveGameplayGuidance(input, announced.state)).toEqual({ state: announced.state });
  });

  it('holds changed guidance behind transient feedback and rearms a prompt after it clears', () => {
    const baseline = advanceAssistiveGameplayGuidance(input, initial).state;
    const changed = {
      ...input,
      transientMessage: 'Exposure closed',
      objective: 'Recover Red credential',
      interaction: { signature: 'locked|credential-red|Red credential', label: 'Red credential', state: 'locked' as const },
    };

    expect(advanceAssistiveGameplayGuidance(changed, baseline)).toEqual({ state: baseline });
    const announced = advanceAssistiveGameplayGuidance({ ...changed, transientMessage: '' }, baseline);
    expect(announced.announcement).toBe('Objective: Recover Red credential. Blocked: Red credential.');

    const cleared = advanceAssistiveGameplayGuidance({ ...input, interaction: undefined }, announced.state);
    expect(cleared).toEqual({
      state: { objective: input.objective, interactionSignature: '' },
      announcement: 'Objective: Close initial exposures | 4 left.',
    });
    expect(advanceAssistiveGameplayGuidance(input, cleared.state).announcement).toBe('Action available: Access.');
  });
});
