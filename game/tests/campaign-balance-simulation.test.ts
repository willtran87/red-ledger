import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/data/campaign';
import type { CampaignMap, Difficulty, WeaponId } from '../src/data/types';
import { DIFFICULTY, ENEMIES, WEAPONS, type GameDifficulty } from '../src/game/definitions';
import {
  COMBAT_AMMO_TYPES,
  addAmmoWithinCap,
  ammoCap,
  pickupAmmoGrant,
  weaponAcquisitionAmmoGrant,
  type CombatAmmo,
} from '../src/game/EconomyPolicy';
import { actorIsEnabled, cellKey, credentialAwareReachableCells } from './audit-helpers';

type EncounterPhase = 'entry' | 'transformation' | 'climax';

const phases: readonly EncounterPhase[] = ['entry', 'transformation', 'climax'];
const starterWeapons: readonly WeaponId[] = ['claim-stamp', 'staple-driver'];

const expectedDamagePerAmmo = (weapon: WeaponId): number => {
  const definition = WEAPONS[weapon];
  if (definition.ammo === 'none') return 0;
  const direct = ((definition.damageMin + definition.damageMax) / 2) * definition.pellets;
  // Launcher splash has distance/occlusion falloff. Credit only half of its maximum so
  // the model does not require perfect clustered shots to pass.
  const conservativeSplash = (definition.splashDamage ?? 0) * .5;
  return (direct + conservativeSplash) / definition.ammoCost;
};

const reachableCache = new WeakMap<CampaignMap, Set<string>>();
const reachableFor = (map: CampaignMap): Set<string> => {
  const cached = reachableCache.get(map);
  if (cached) return cached;
  const reachable = credentialAwareReachableCells(map);
  reachableCache.set(map, reachable);
  return reachable;
};
const standardReachable = (map: CampaignMap, point: { x: number; z: number }): boolean =>
  reachableFor(map).has(cellKey(point));

interface EconomyInventory {
  readonly ammo: Record<CombatAmmo, number>;
  readonly weapons: Set<WeaponId>;
}

const freshInventory = (): EconomyInventory => ({
  ammo: { staples: 50, fasteners: 0, canisters: 0, 'toner-cells': 0 },
  weapons: new Set(starterWeapons),
});

const addAmmo = (inventory: EconomyInventory, ammo: CombatAmmo, amount: number): void => {
  inventory.ammo[ammo] = addAmmoWithinCap(inventory.ammo[ammo], { ammo, amount });
};

const acquireWeapon = (inventory: EconomyInventory, weapon: WeaponId): void => {
  inventory.weapons.add(weapon);
  const grant = weaponAcquisitionAmmoGrant(WEAPONS[weapon]);
  if (grant) addAmmo(inventory, grant.ammo, grant.amount);
};

const damageCapacity = (inventory: EconomyInventory): number => COMBAT_AMMO_TYPES.reduce((total, ammo) => {
  const efficiency = [...inventory.weapons]
    .filter((weapon) => WEAPONS[weapon].ammo === ammo)
    .reduce((best, weapon) => Math.max(best, expectedDamagePerAmmo(weapon)), 0);
  return total + inventory.ammo[ammo] * efficiency;
}, 0);

const spendRangedDamage = (inventory: EconomyInventory, targetHealth: number, aimTax = 1.2) => {
  let remaining = targetHealth * aimTax;
  const choices = [...inventory.weapons]
    .map((weapon) => ({ weapon, definition: WEAPONS[weapon], efficiency: expectedDamagePerAmmo(weapon) }))
    .filter((choice) => choice.definition.ammo !== 'none' && choice.efficiency > 0)
    .sort((a, b) => b.efficiency - a.efficiency || a.weapon.localeCompare(b.weapon));
  const used = { staples: 0, fasteners: 0, canisters: 0, 'toner-cells': 0 };

  for (const choice of choices) {
    if (remaining <= 0) break;
    const ammo = choice.definition.ammo as CombatAmmo;
    const availableShots = Math.floor(inventory.ammo[ammo] / choice.definition.ammoCost);
    if (availableShots <= 0) continue;
    const damagePerShot = choice.efficiency * choice.definition.ammoCost;
    const shots = Math.min(availableShots, Math.ceil(remaining / damagePerShot));
    const ammoUsed = shots * choice.definition.ammoCost;
    inventory.ammo[ammo] -= ammoUsed;
    used[ammo] += ammoUsed;
    remaining = Math.max(0, remaining - shots * damagePerShot);
  }

  return {
    requiredDamage: targetHealth * aimTax,
    deficit: remaining,
    used,
  };
};

const phaseHealth = (
  map: CampaignMap,
  phase: EncounterPhase,
  placement: Difficulty,
  mandatoryOnly: boolean,
): number => map.actors.reduce((total, actor) => {
  if (actor.type !== 'enemy' || actor.route !== phase || !actorIsEnabled(actor, placement)) return total;
  if (mandatoryOnly && !actor.mandatory) return total;
  return total + ENEMIES[actor.enemy].health;
}, 0);

interface AmmoCollectionStats {
  offered: number;
  accepted: number;
  saturatedPickups: number;
}

const collectRouteResources = (
  map: CampaignMap,
  inventory: EconomyInventory,
  phase: string,
  difficulty: GameDifficulty,
): AmmoCollectionStats => {
  const stats = { offered: 0, accepted: 0, saturatedPickups: 0 };
  const multiplier = DIFFICULTY[difficulty].supply;
  for (const actor of map.actors) {
    if (actor.secret || actor.route !== phase || !actorIsEnabled(actor, DIFFICULTY[difficulty].placement)) continue;
    if (!standardReachable(map, actor)) continue;
    if (actor.type === 'weapon') acquireWeapon(inventory, actor.weapon);
    if (actor.type === 'pickup') {
      const grant = pickupAmmoGrant(actor.pickup, multiplier);
      if (grant) {
        const before = inventory.ammo[grant.ammo];
        addAmmo(inventory, grant.ammo, grant.amount);
        const accepted = inventory.ammo[grant.ammo] - before;
        stats.offered += grant.amount;
        stats.accepted += accepted;
        if (accepted < grant.amount) stats.saturatedPickups += 1;
      }
    }
  }
  return stats;
};

const deskWardenDrops = (
  map: CampaignMap,
  phase: EncounterPhase,
  placement: Difficulty,
  optionalEngagement: number,
): number => map.actors.reduce((amount, actor) => {
  if (actor.type !== 'enemy' || actor.route !== phase || actor.enemy !== 'desk-warden' || !actorIsEnabled(actor, placement)) return amount;
  return amount + 5 * (actor.mandatory ? 1 : optionalEngagement);
}, 0);

const mapPressureHealth = (map: CampaignMap, placement: Difficulty): number => map.actors.reduce((total, actor) => {
  if (actor.type === 'enemy' && actorIsEnabled(actor, placement)) return total + ENEMIES[actor.enemy].health;
  if (actor.type === 'boss') return total + ENEMIES[actor.boss].health;
  return total;
}, 0);

const mapRecovery = (map: CampaignMap): { health: number; lightArmor: number; heavyArmor: number; reserve: number } => {
  const result = { health: 0, lightArmor: 0, heavyArmor: 0, reserve: 0 };
  for (const actor of map.actors) {
    if (actor.type !== 'pickup' || actor.secret || !standardReachable(map, actor)) continue;
    if (actor.pickup === 'adhesive-bandage') result.health += 10;
    if (actor.pickup === 'field-medical-case') result.health += 25;
    if (actor.pickup === 'goodwill-token') result.health += 1;
    if (actor.pickup === 'loss-control-vest') result.lightArmor += 100;
    if (actor.pickup === 'catastrophe-suit') result.heavyArmor += 200;
    if (actor.pickup === 'emergency-reserve') result.reserve += 1;
  }
  return result;
};

const routeHealthRecovery = (map: CampaignMap, route: EncounterPhase): number => map.actors.reduce((total, actor) => {
  if (actor.type !== 'pickup' || actor.secret || actor.route !== route || !standardReachable(map, actor)) return total;
  if (actor.pickup === 'adhesive-bandage') return total + 10;
  if (actor.pickup === 'field-medical-case') return total + 25;
  if (actor.pickup === 'goodwill-token') return total + 1;
  if (actor.pickup === 'emergency-reserve') return total + 200;
  return total;
}, 0);

const hostileHealth = (map: CampaignMap, placement: Difficulty): number => map.actors.reduce((total, actor) => {
  if (actor.type !== 'enemy' || !actorIsEnabled(actor, placement)) return total;
  return total + ENEMIES[actor.enemy].health;
}, 0);

const difficultyPressure = (map: CampaignMap, difficulty: GameDifficulty): number => {
  const policy = DIFFICULTY[difficulty];
  const base = map.actors.reduce((total, actor) => {
    if (actor.type === 'enemy' && actorIsEnabled(actor, policy.placement)) {
      const enemy = ENEMIES[actor.enemy];
      return total + enemy.health * (1 + enemy.damage / 50);
    }
    if (actor.type === 'boss') {
      const enemy = ENEMIES[actor.boss];
      return total + enemy.health * (1 + enemy.damage / 50);
    }
    return total;
  }, 0);
  return base * policy.enemyDamage * policy.enemySpeed * policy.aggression;
};

const pearsonCorrelation = (left: readonly number[], right: readonly number[]): number => {
  const leftMean = left.reduce((total, value) => total + value, 0) / left.length;
  const rightMean = right.reduce((total, value) => total + value, 0) / right.length;
  const covariance = left.reduce((total, value, index) => total + (value - leftMean) * (right[index] - rightMean), 0);
  const leftSpread = Math.sqrt(left.reduce((total, value) => total + (value - leftMean) ** 2, 0));
  const rightSpread = Math.sqrt(right.reduce((total, value) => total + (value - rightMean) ** 2, 0));
  return covariance / Math.max(Number.EPSILON, leftSpread * rightSpread);
};

interface CombatStageResult {
  readonly id: string;
  readonly targetHealth: number;
  readonly capacityBefore: number;
  readonly deficit: number;
}

const simulateMap = (
  map: CampaignMap,
  difficulty: GameDifficulty,
  inventory: EconomyInventory = freshInventory(),
  optionalEngagement = 0,
) => {
  const placement = DIFFICULTY[difficulty].placement;
  const stages: CombatStageResult[] = [];
  const collection: AmmoCollectionStats = { offered: 0, accepted: 0, saturatedPickups: 0 };
  const collect = (phase: string): void => {
    const result = collectRouteResources(map, inventory, phase, difficulty);
    collection.offered += result.offered;
    collection.accepted += result.accepted;
    collection.saturatedPickups += result.saturatedPickups;
  };
  for (const phase of phases) {
    collect(phase);
    const mandatoryHealth = phaseHealth(map, phase, placement, true);
    const fullHealth = phaseHealth(map, phase, placement, false);
    const targetHealth = mandatoryHealth + (fullHealth - mandatoryHealth) * optionalEngagement;
    const capacityBefore = damageCapacity(inventory);
    const spent = spendRangedDamage(inventory, targetHealth);
    stages.push({ id: phase, targetHealth, capacityBefore, deficit: spent.deficit });
    addAmmo(inventory, 'staples', deskWardenDrops(map, phase, placement, optionalEngagement));
  }

  for (const boss of map.actors.filter((actor) => actor.type === 'boss')) {
    collect(boss.encounter);
    const targetHealth = ENEMIES[boss.boss].health;
    const capacityBefore = damageCapacity(inventory);
    const spent = spendRangedDamage(inventory, targetHealth);
    stages.push({ id: boss.encounter, targetHealth, capacityBefore, deficit: spent.deficit });
  }

  return { stages, collection };
};

describe('deterministic whole-campaign balance model', () => {
  it('funds every mandatory Field Adjuster route and boss from a fresh starter inventory', () => {
    const failures: string[] = [];
    for (const map of Object.values(CAMPAIGN.maps)) {
      const result = simulateMap(map, 'field-adjuster');
      result.stages.forEach((stage) => {
        if (stage.deficit > 0) {
          failures.push(`${map.id}:${stage.id} lacks ${Math.ceil(stage.deficit)} expected ranged damage`);
        }
      });
    }
    expect(failures).toEqual([]);
  });

  it('sustains an engaged continuous Field Adjuster route through every episode', () => {
    const failures: string[] = [];
    for (const episode of CAMPAIGN.episodes) {
      const inventory = freshInventory();
      for (const id of episode.maps.filter((mapId) => !CAMPAIGN.maps[mapId].secretMap)) {
        // Progression requires only authored anchors. This profile additionally fights
        // 60% of optional pressure and credits the same share of guaranteed optional drops.
        const result = simulateMap(CAMPAIGN.maps[id], 'field-adjuster', inventory, .6);
        result.stages.forEach((stage) => {
          if (stage.deficit > 0) failures.push(`${id}:${stage.id} lacks ${Math.ceil(stage.deficit)} engaged-route damage`);
        });
      }
    }
    expect(failures).toEqual([]);
  });

  it('preserves ammunition pressure instead of routinely ending maps at cap', () => {
    const diagnostics: Array<{
      map: string;
      reserve: Record<CombatAmmo, number>;
      capped: number;
      owned: number;
      collection: AmmoCollectionStats;
    }> = [];
    for (const episode of CAMPAIGN.episodes) {
      const inventory = freshInventory();
      for (const id of episode.maps.filter((mapId) => !CAMPAIGN.maps[mapId].secretMap)) {
        const result = simulateMap(CAMPAIGN.maps[id], 'field-adjuster', inventory, .6);
        const ownedAmmo = new Set([...inventory.weapons]
          .map((weapon) => WEAPONS[weapon].ammo)
          .filter((ammo): ammo is CombatAmmo => ammo !== 'none'));
        diagnostics.push({
          map: id,
          reserve: { ...inventory.ammo },
          capped: [...ownedAmmo].filter((ammo) => inventory.ammo[ammo] === ammoCap(ammo)).length,
          owned: ownedAmmo.size,
          collection: result.collection,
        });
      }
    }
    const saturatedMaps = diagnostics.filter(({ capped }) => capped > 0);
    const cacheMaps = new Set(['E2M7', 'E2M8', 'E3M7', 'E3M8']);
    const episodeEndReserve = diagnostics
      .filter(({ map }) => map.endsWith('M8'))
      .map(({ reserve }) => COMBAT_AMMO_TYPES.reduce((total, ammo) => total + reserve[ammo] / ammoCap(ammo), 0));

    expect(diagnostics).toHaveLength(24);
    expect(saturatedMaps.length).toBeLessThanOrEqual(diagnostics.length / 2);
    expect(diagnostics.every(({ capped }) => capped <= 1)).toBe(true);
    expect(diagnostics.filter(({ map }) => cacheMaps.has(map)).every(({ capped }) => capped === 0)).toBe(true);
    expect(diagnostics
      .filter(({ map }) => cacheMaps.has(map))
      .every(({ collection }) => collection.accepted / collection.offered >= .35)).toBe(true);
    expect(episodeEndReserve.every((reserve) => reserve >= .1 && reserve <= .35)).toBe(true);
  });

  it('stages recovery and reaction space throughout every mandatory route', () => {
    const failures: string[] = [];
    for (const map of Object.values(CAMPAIGN.maps)) {
      const episode = Number(map.id[1]);
      const recovery = mapRecovery(map);
      const expectedRouteHealing = episode === 1 ? 10 : 25;
      for (const phase of phases) {
        const actors = map.actors.filter((actor) => actor.type === 'enemy'
          && actor.mandatory
          && actor.route === phase
          && actorIsEnabled(actor, 'normal'));
        const uniqueCells = new Set(actors.map(cellKey));
        const fullHealth = phaseHealth(map, phase, 'normal', false);
        const mandatoryHealth = phaseHealth(map, phase, 'normal', true);
        if (uniqueCells.size < Math.ceil(actors.length / 2)) failures.push(`${map.id}:${phase} stacks mandatory anchors too tightly`);
        if (mandatoryHealth > fullHealth * .8) failures.push(`${map.id}:${phase} makes optional pressure effectively mandatory (${mandatoryHealth}/${fullHealth}; ${actors.map((actor) => `${actor.enemy}:${ENEMIES[actor.enemy].health}`).join(',')})`);
        if (routeHealthRecovery(map, phase) < expectedRouteHealing) failures.push(`${map.id}:${phase} lacks route recovery`);
      }

      const closestEntry = Math.min(...map.actors
        .filter((actor) => actor.type === 'enemy' && actor.route === 'entry' && actorIsEnabled(actor, 'normal'))
        .map((actor) => Math.abs(actor.x - map.playerStart.x) + Math.abs(actor.z - map.playerStart.z)));
      const minimumEntryDistance = map.id === 'E1M1' ? 3 : 4;
      if (closestEntry < minimumEntryDistance) failures.push(`${map.id}: first pressure begins only ${closestEntry.toFixed(1)} cells from spawn`);
      if (recovery.health < (episode === 1 ? 30 : episode === 2 ? 75 : 75)) failures.push(`${map.id}: insufficient health recovery`);
      if (episode < 3 && recovery.lightArmor < 100) failures.push(`${map.id}: no standard light protection reset`);
      if (episode === 3 && (recovery.heavyArmor < 200 || recovery.reserve < 1)) failures.push(`${map.id}: no late-game heavy recovery cache`);
    }
    expect(failures).toEqual([]);
  });

  it('scales pressure monotonically without hidden health cliffs between response levels', () => {
    const order: readonly GameDifficulty[] = [
      'orientation', 'desk-adjuster', 'field-adjuster', 'catastrophe-team', 'binding-authority',
    ];
    const failures: string[] = [];

    for (const map of Object.values(CAMPAIGN.maps)) {
      const easy = hostileHealth(map, 'easy');
      const normal = hostileHealth(map, 'normal');
      const hard = hostileHealth(map, 'hard');
      if (!(easy < normal && normal < hard)) failures.push(`${map.id}: hostile health is not monotonic`);
      if (normal / easy > 2 || hard / normal > 1.75) failures.push(`${map.id}: placement health changes too abruptly`);

      const pressure = order.map((difficulty) => difficultyPressure(map, difficulty));
      pressure.forEach((value, index) => {
        if (index > 0 && value <= pressure[index - 1]) failures.push(`${map.id}:${order[index]} does not increase pressure`);
        // Desk Adjuster deliberately retains the forgiving easy placement mask;
        // Field Adjuster introduces the authored normal mask as well as 1.0x modifiers.
        if (index > 0 && value / pressure[index - 1] > 3.25) failures.push(`${map.id}:${order[index]} pressure cliff is ${(value / pressure[index - 1]).toFixed(2)}x`);
      });
    }
    expect(failures).toEqual([]);
  });

  it('keeps the forgiving Desk Adjuster contract intact', () => {
    expect(DIFFICULTY['desk-adjuster']).toEqual({
      enemyDamage: .75,
      enemySpeed: .9,
      aggression: .9,
      reaction: 1 / .9,
      refire: 1 / .9,
      projectileSpeed: .95,
      supply: 1.25,
      placement: 'easy',
    });
  });

  it('keeps every response level starter-route sustainable', () => {
    const failures: string[] = [];
    for (const difficulty of [
      'orientation', 'desk-adjuster', 'field-adjuster', 'catastrophe-team', 'binding-authority',
    ] as const) {
      for (const map of Object.values(CAMPAIGN.maps)) {
        const result = simulateMap(map, difficulty);
        result.stages.forEach((stage) => {
          if (stage.deficit > 0) failures.push(`${difficulty}:${map.id}:${stage.id}:${Math.ceil(stage.deficit)}`);
        });
      }
    }
    expect(failures).toEqual([]);
  });

  it('gates the main-route par envelope and keeps authored pars tied to structural load', () => {
    const mainMaps = Object.values(CAMPAIGN.maps).filter((map) => !map.secretMap);
    expect(mainMaps).toHaveLength(24);
    expect(mainMaps.every((map) => map.parSeconds >= 15 * 60 && map.parSeconds <= 35 * 60)).toBe(true);
    const mainPar = mainMaps.reduce((total, map) => total + map.parSeconds, 0);
    expect(mainPar).toBeGreaterThanOrEqual(6 * 3600);
    expect(mainPar).toBeLessThanOrEqual(9 * 3600);

    const structuralLoad = mainMaps.map((map) => mapPressureHealth(map, 'normal')
      + credentialAwareReachableCells(map).size * 20
      + map.mechanisms.length * 250
      + map.actors.filter((actor) => actor.type === 'credential').length * 150);
    const correlation = pearsonCorrelation(structuralLoad, mainMaps.map((map) => map.parSeconds));
    // This guards relative authoring drift only. Production duration still requires
    // the representative human runs in the release playtest protocol.
    expect(correlation).toBeGreaterThan(.55);
  });
});
