import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from './campaign';
import { validateCampaign } from './validation';

describe('campaign data', () => {
  it('contains three complete nine-map episodes', () => {
    expect(CAMPAIGN.episodes).toHaveLength(3);
    expect(Object.keys(CAMPAIGN.maps)).toHaveLength(27);
    CAMPAIGN.episodes.forEach((episode) => expect(episode.maps).toHaveLength(9));
  });

  it('passes geometry, progression, and trigger validation', () => {
    expect(validateCampaign(CAMPAIGN)).toEqual([]);
  });

  it('introduces the complete roster in episode order', () => {
    const enemies = new Set(Object.values(CAMPAIGN.maps).flatMap((map) =>
      map.actors.filter((actor) => actor.type === 'enemy').map((actor) => actor.enemy),
    ));
    expect(enemies).toEqual(new Set([
      'returned-mail', 'desk-warden', 'ember-clerk', 'exposure-hound', 'coverage-drone', 'liability-mass',
      'denial-officer', 'subrogator', 'reserve-eater', 'fraud-apparition', 'cat-model', 'bad-faith-counsel',
    ]));
  });

  it('wires all four bosses and three secret exits', () => {
    const bosses = Object.values(CAMPAIGN.maps).flatMap((map) =>
      map.actors.filter((actor) => actor.type === 'boss').map((actor) => actor.boss),
    );
    expect(bosses).toEqual(['regional-director', 'aggregate', 'chief-actuary', 'uninsurable']);
    expect(Object.values(CAMPAIGN.maps).filter((map) => map.secretExitTo)).toHaveLength(3);
  });

  it('meets phase enemy budgets and the six-to-nine-hour experienced par target', () => {
    const maps = Object.values(CAMPAIGN.maps);
    maps.forEach((map) => {
      const normalEnemies = map.actors.filter((actor) => actor.type === 'enemy'
        && (!actor.difficulties || actor.difficulties.includes('normal'))).length;
      const [minimum, maximum] = map.index <= 3 ? [35, 65] : map.index <= 6 || map.index === 9 ? [60, 110] : [90, 160];
      expect(normalEnemies, map.id).toBeGreaterThanOrEqual(minimum);
      expect(normalEnemies, map.id).toBeLessThanOrEqual(maximum);
      expect(map.parSeconds, map.id).toBeGreaterThanOrEqual(15 * 60);
      expect(map.parSeconds, map.id).toBeLessThanOrEqual(35 * 60);
    });
    const total = maps.reduce((seconds, map) => seconds + map.parSeconds, 0);
    expect(total).toBeGreaterThanOrEqual(6 * 3600);
    expect(total).toBeLessThanOrEqual(9 * 3600);
  });

  it('authors phase-scaled landmarks, persistent mechanisms, visible secrets, and explicit teleports', () => {
    Object.values(CAMPAIGN.maps).forEach((map) => {
      const expected = map.index <= 3 ? 2 : map.index <= 6 || map.index === 9 ? 3 : map.index === 7 ? 4 : 5;
      expect(map.landmarks, map.id).toHaveLength(expected);
      const expectedMechanisms = map.id === 'E2M6' ? 3 : map.id === 'E3M2' ? 2
        : map.index <= 3 ? 1 : map.index <= 6 || map.index === 9 ? 2 : 3;
      expect(map.mechanisms, map.id).toHaveLength(expectedMechanisms);
      expect(new Set(map.mechanisms.flatMap((mechanism) => mechanism.landmarkTags)).size, map.id)
        .toBe(map.mechanisms.flatMap((mechanism) => mechanism.landmarkTags).length);
      expect(map.mechanisms.every((mechanism) => mechanism.persistState && mechanism.restoresRoute)).toBe(true);
      expect(map.mechanisms.every((mechanism) => map.triggers.some((trigger) => trigger.targets.includes(mechanism.id)))).toBe(true);
      expect(map.secrets.every((secret) => Boolean(secret.clueProp && secret.rewardPickup))).toBe(true);
      map.triggers.filter((trigger) => trigger.action === 'teleport').forEach((trigger) => {
        expect(trigger.destination, trigger.id).toBeDefined();
        expect(map.triggers.some((candidate) => trigger.targets.includes(candidate.id)), trigger.id).toBe(true);
      });
    });
  });
});
