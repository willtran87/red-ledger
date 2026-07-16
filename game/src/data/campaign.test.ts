import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from './campaign';
import { statefulReachableCells, validateCampaign } from './validation';

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
      expect(normalEnemies, map.id).toBe(map.standardEnemyBudget);
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
      const authoredTriggerOrder = map.triggers
        .filter((trigger) => map.mechanisms.some((mechanism) => trigger.targets.includes(mechanism.id)))
        .map((trigger) => trigger.targets.find((target) => map.mechanisms.some((mechanism) => mechanism.id === target)));
      expect(authoredTriggerOrder, `${map.id} mechanism trigger order`).toEqual(map.mechanisms.map((mechanism) => mechanism.id));
      expect(map.secrets.every((secret) => Boolean(secret.clueProp && secret.reward && secret.rewardPlacement))).toBe(true);
      expect(new Set(map.mechanisms.map((mechanism) => mechanism.activationOrder)).size).toBe(map.mechanisms.length);
      expect(map.secrets.every((secret) => secret.persistState && secret.concealedCells.length > 0)).toBe(true);
      map.secrets.forEach((secret) => {
        expect(Math.floor(secret.revealAt.x) === Math.floor(secret.at.x) && Math.floor(secret.revealAt.z) === Math.floor(secret.at.z)).toBe(false);
        const rewardKey = `${Math.floor(secret.at.x)},${Math.floor(secret.at.z)}`;
        expect(statefulReachableCells(map).has(rewardKey), `${map.id}:${secret.id} concealed`).toBe(false);
        expect(statefulReachableCells(map, new Set([secret.id])).has(rewardKey), `${map.id}:${secret.id} revealed`).toBe(true);
      });
      map.triggers.filter((trigger) => trigger.action === 'teleport').forEach((trigger) => {
        expect(trigger.destination, trigger.id).toBeDefined();
        expect(map.triggers.some((candidate) => trigger.targets.includes(candidate.id)), trigger.id).toBe(true);
      });
    });
  });

  it('authors independent pump/gate states and resolvable encounter sequencing', () => {
    for (const id of ['E2M6', 'E3M8'] as const) {
      const map = CAMPAIGN.maps[id];
      expect(map.mechanisms).toHaveLength(3);
      expect(map.mechanisms.every((mechanism) => mechanism.independent && mechanism.requires.length === 0)).toBe(true);
      expect(new Set(map.mechanisms.flatMap((mechanism) => mechanism.sectorTags)).size)
        .toBe(map.mechanisms.flatMap((mechanism) => mechanism.sectorTags).length);
    }
    Object.values(CAMPAIGN.maps).forEach((map) => {
      const encounterIds = new Set(map.encounters.map((encounter) => encounter.id));
      map.encounters.forEach((encounter) => {
        encounter.zones.forEach((zone) => expect(map.zones[zone], `${map.id}:${zone}`).toBeDefined());
        encounter.opens?.forEach((opened) => expect(opened === 'map-exit' || encounterIds.has(opened), `${map.id}:${opened}`).toBe(true));
      });
      const anchors = [map.encounterBlueprint.entryAnchor, map.encounterBlueprint.transformationAnchor,
        map.encounterBlueprint.climaxAnchor, map.encounterBlueprint.rewardPocket]
        .map((point) => `${Math.floor(point.x)},${Math.floor(point.z)}`);
      expect(new Set(anchors).size, map.id).toBe(4);
    });
  });

  it('preserves authored MapSpec pacing instead of assigning pars only by map index', () => {
    expect(new Set(['E1M5', 'E2M5', 'E3M5'].map((id) => CAMPAIGN.maps[id as keyof typeof CAMPAIGN.maps].parSeconds)).size).toBeGreaterThan(1);
  });
});
