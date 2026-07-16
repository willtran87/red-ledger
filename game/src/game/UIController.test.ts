import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../data';
import type { MapPerformance, MapRecord } from './PersistenceSystem';
import {
  automapPanDelta,
  boundedReplayEntries,
  entryBriefingLabels,
  entryObjectiveCue,
  formatRangeSetting,
  masteryPresentation,
  normalizeInterfacePreferences,
  resolveReducedMotionSetting,
  resolveScreenShakeSetting,
  touchBriefingPadLabels,
} from './UIController';

const mapRecord = (overrides: Partial<MapRecord> = {}): MapRecord => ({
  mapId: 'E1M1',
  difficulty: 'field-adjuster',
  completions: 3,
  bestTime: 120,
  highScore: 9000,
  bestChain: 8,
  bestKillsPercent: 100,
  bestItemsPercent: 100,
  bestSecretsPercent: 100,
  bestGrade: 'S',
  parBeaten: true,
  achievedAt: 1,
  ...overrides,
});

const mapPerformance = (overrides: Partial<MapPerformance> = {}): MapPerformance => ({
  mapId: 'E1M1',
  difficulty: 'field-adjuster',
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
      mapRecord({ bestKillsPercent: 55, bestGrade: 'A' }),
      mapPerformance({ killsPercent: 100, itemsPercent: 100, secretsPercent: 100, grade: 'S' }),
    );

    expect(presentation.complete).toBe(false);
    expect(presentation.target).toBe('Retry goal: Close every threat (55%)');
    expect(presentation.metrics[0]).toBe('Threats 100% / PB 55%');
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
});
