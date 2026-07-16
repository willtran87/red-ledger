import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../data';
import {
  ambientAudioGroups,
  pickupAudioFeedbackCue,
  surfaceAudioFeedbackGroup,
} from './AudioSemantics';

describe('audio semantics', () => {
  it('assigns every campaign map a concise authored ambience palette', () => {
    const maps = Object.values(CAMPAIGN.maps);
    expect(maps).toHaveLength(27);
    for (const map of maps) {
      const groups = ambientAudioGroups(map.id);
      expect(groups.length).toBeGreaterThanOrEqual(2);
      expect(new Set(groups).size).toBe(groups.length);
      expect(groups.every((group) => group.startsWith('ambient/'))).toBe(true);
    }
  });

  it('maps authored floor materials to distinct footstep families', () => {
    expect(surfaceAudioFeedbackGroup('floor.carpet-gray-clean')).toBe('footstep/fiber');
    expect(surfaceAudioFeedbackGroup('floor.wet-asphalt-clean')).toBe('footstep/water');
    expect(surfaceAudioFeedbackGroup('floor.toner-sludge-01')).toBe('footstep/toner');
    expect(surfaceAudioFeedbackGroup('floor.red-wax-03')).toBe('footstep/wax');
    expect(surfaceAudioFeedbackGroup('floor.train-steel-clean')).toBe('footstep/metal');
    expect(surfaceAudioFeedbackGroup('floor.probability-grid-01')).toBe('footstep/glass');
    expect(surfaceAudioFeedbackGroup('floor.ink-fluid-01')).toBe('footstep/fluid');
    expect(surfaceAudioFeedbackGroup('floor.litigation-stone-clean')).toBe('footstep/concrete');
  });

  it('routes each pickup class to a recognizable semantic cue', () => {
    expect(pickupAudioFeedbackCue({ kind: 'credential', id: 'red' })).toBe('credential');
    expect(pickupAudioFeedbackCue({ kind: 'weapon', id: 'audit-repeater' })).toBe('weapon');
    expect(pickupAudioFeedbackCue({ kind: 'pickup', id: 'toner-pack' })).toBe('ammo');
    expect(pickupAudioFeedbackCue({ kind: 'pickup', id: 'catastrophe-suit' })).toBe('armor');
    expect(pickupAudioFeedbackCue({ kind: 'pickup', id: 'forensic-lens' })).toBe('powerup');
    expect(pickupAudioFeedbackCue({ kind: 'pickup', id: 'field-medical-case' })).toBe('health');
  });
});
