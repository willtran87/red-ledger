import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/data/campaign';
import { DIFFICULTY, ENEMIES } from '../src/game/definitions';
import { actorIsEnabled } from './audit-helpers';

const countEnemies = (map: (typeof CAMPAIGN.maps)[keyof typeof CAMPAIGN.maps], placement: 'easy' | 'normal' | 'hard') =>
  map.actors.filter((actor) => actor.type === 'enemy' && actorIsEnabled(actor, placement)).length;

describe('difficulty placement and ammunition contracts', () => {
  it('maps all five named tiers to the intended serialized placement layers', () => {
    expect(Object.keys(DIFFICULTY)).toEqual([
      'orientation',
      'desk-adjuster',
      'field-adjuster',
      'catastrophe-team',
      'binding-authority',
    ]);
    expect(Object.values(DIFFICULTY).map((difficulty) => difficulty.placement)).toEqual([
      'easy', 'easy', 'normal', 'hard', 'hard',
    ]);
    expect(Object.values(DIFFICULTY).map((difficulty) => difficulty.ammoSupply)).toEqual([
      1.5, 1.25, 1, 0.8, 0.65,
    ]);
  });

  it('has exact monotonic enemy counts on every map', () => {
    const failures: string[] = [];
    for (const map of Object.values(CAMPAIGN.maps)) {
      const easy = countEnemies(map, 'easy');
      const normal = countEnemies(map, 'normal');
      const hard = countEnemies(map, 'hard');
      const expectedEasy = Math.ceil(normal * 0.72);
      const expectedHard = normal + Math.ceil(normal * 0.25);
      if (easy !== expectedEasy || hard !== expectedHard) {
        failures.push(`${map.id}: easy/normal/hard ${easy}/${normal}/${hard}, expected ${expectedEasy}/${normal}/${expectedHard}`);
      }
      if (!(easy < normal && normal < hard)) failures.push(`${map.id}: placement counts are not strictly increasing`);
    }
    expect(failures).toEqual([]);
  });

  it('uses only canonical serialized enemy masks and never masks bosses', () => {
    const canonical = new Set(['easy,normal,hard', 'normal,hard', 'hard']);
    for (const map of Object.values(CAMPAIGN.maps)) {
      const enemies = map.actors.filter((actor) => actor.type === 'enemy');
      expect(enemies.length).toBeGreaterThan(0);
      enemies.forEach((actor) => expect(canonical.has(actor.difficulties?.join(',') ?? '')).toBe(true));
      map.actors.filter((actor) => actor.type === 'boss').forEach((boss) => expect('difficulties' in boss).toBe(false));
    }
  });

  it('keeps maximum health independent of difficulty', () => {
    for (const definition of Object.values(ENEMIES)) {
      expect(definition.health).toBeGreaterThan(0);
      expect(definition).not.toHaveProperty('difficultyHealth');
      expect(definition).not.toHaveProperty('healthMultiplier');
    }
  });
});
