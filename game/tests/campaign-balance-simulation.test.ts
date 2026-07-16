import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/data/campaign';
import type { CampaignMap, Difficulty, PickupId, WeaponId } from '../src/data/types';
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
  const drop = ENEMIES['desk-warden'].drop;
  return amount + (drop?.amount ?? 0) * (drop?.chance ?? 0) * (actor.mandatory ? 1 : optionalEngagement);
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
    if (actor.pickup === 'emergency-reserve') {
      result.reserve += 1;
      result.heavyArmor += 200;
    }
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

type ArmorClass = 'none' | 'light' | 'heavy';

interface RecoveryState {
  health: number;
  armor: number;
  armorClass: ArmorClass;
  readonly weapons: Set<WeaponId>;
}

interface RecoveryCollectionStats {
  healthOffered: number;
  healthAccepted: number;
  armorOffered: number;
  armorAccepted: number;
}

interface AvoidanceProfile {
  readonly id: 'conservative' | 'median' | 'expert';
  readonly minimumDps: number;
  readonly weaponUptime: number;
  readonly attackContactShare: number;
}

const avoidanceProfiles: readonly AvoidanceProfile[] = [
  // Attack-contact share is the fraction of uninterrupted attack windows that
  // land after strafing, cover, pain interrupts, and line-of-sight breaks. Even
  // the conservative profile assumes basic FPS movement; Binding Authority is
  // explicitly the mastered-play setting. DPS spans the roughly 50 DPS
  // Staple Driver opening, the 85-120 DPS Repeater/Riveter midgame, and the
  // roughly 260 DPS Plasma Copier ceiling without assuming perfect uptime.
  { id: 'conservative', minimumDps: 50, weaponUptime: .65, attackContactShare: .05 },
  { id: 'median', minimumDps: 75, weaponUptime: .8, attackContactShare: .032 },
  { id: 'expert', minimumDps: 100, weaponUptime: .95, attackContactShare: .025 },
];

const difficultyOrder: readonly GameDifficulty[] = [
  'orientation', 'desk-adjuster', 'field-adjuster', 'catastrophe-team', 'binding-authority',
];

const freshRecoveryState = (): RecoveryState => ({
  health: 100,
  armor: 0,
  armorClass: 'none',
  weapons: new Set(starterWeapons),
});

const emptyRecoveryStats = (): RecoveryCollectionStats => ({
  healthOffered: 0,
  healthAccepted: 0,
  armorOffered: 0,
  armorAccepted: 0,
});

const recoveryAccepted = (stats: RecoveryCollectionStats): number =>
  stats.healthAccepted + stats.armorAccepted;

const recoveryOffered = (stats: RecoveryCollectionStats): number =>
  stats.healthOffered + stats.armorOffered;

const collectRecoveryPickup = (
  state: RecoveryState,
  pickup: PickupId,
  stats: RecoveryCollectionStats,
): void => {
  const acceptHealth = (amount: number, cap: number): void => {
    // This mirrors canCollectPickup: a capped pickup stays in the world and is
    // neither offered to nor discarded by this run.
    if (state.health >= cap) return;
    stats.healthOffered += amount;
    const before = state.health;
    state.health = Math.min(cap, state.health + amount);
    stats.healthAccepted += state.health - before;
  };
  const acceptArmorReset = (cap: number, armorClass: Exclude<ArmorClass, 'none'>): void => {
    const before = state.armor;
    state.armor = Math.max(state.armor, cap);
    state.armorClass = armorClass;
    const accepted = state.armor - before;
    // Armor pickups are floor resets, not additive grants: a vest at 40 armor
    // offers 60 points up to its 100 cap. Count that real reset value rather
    // than inventing 40 points of overflow the runtime never offers.
    stats.armorOffered += accepted;
    stats.armorAccepted += accepted;
  };

  if (pickup === 'adhesive-bandage') acceptHealth(10, 100);
  if (pickup === 'field-medical-case') acceptHealth(25, 100);
  if (pickup === 'goodwill-token') acceptHealth(1, 200);
  if (pickup === 'loss-control-vest' && (state.armor < 100 || state.armorClass === 'none')) {
    acceptArmorReset(100, 'light');
  }
  if (pickup === 'catastrophe-suit' && (state.armor < 200 || state.armorClass !== 'heavy')) {
    acceptArmorReset(200, 'heavy');
  }
  if (pickup === 'emergency-reserve' && (state.health < 200 || state.armor < 200)) {
    const healthBefore = state.health;
    const armorBefore = state.armor;
    state.health = 200;
    state.armor = Math.max(state.armor, 200);
    state.armorClass = 'heavy';
    const healthReset = state.health - healthBefore;
    const armorReset = state.armor - armorBefore;
    stats.healthOffered += healthReset;
    stats.armorOffered += armorReset;
    stats.healthAccepted += healthReset;
    stats.armorAccepted += armorReset;
  }
};

const collectStageRecovery = (
  map: CampaignMap,
  route: string,
  difficulty: GameDifficulty,
  state: RecoveryState,
): RecoveryCollectionStats => {
  const stats = emptyRecoveryStats();
  for (const actor of map.actors) {
    if (actor.secret || actor.route !== route) continue;
    if (!actorIsEnabled(actor, DIFFICULTY[difficulty].placement) || !standardReachable(map, actor)) continue;
    if (actor.type === 'weapon') state.weapons.add(actor.weapon);
    if (actor.type === 'pickup') collectRecoveryPickup(state, actor.pickup, stats);
  }
  return stats;
};

const applyIncomingDamage = (state: RecoveryState, amount: number): void => {
  const absorption = state.armorClass === 'heavy' ? .5 : state.armorClass === 'light' ? .33 : 0;
  const absorbed = Math.min(state.armor, amount * absorption);
  state.armor -= absorbed;
  if (state.armor <= 0) {
    state.armor = 0;
    state.armorClass = 'none';
  }
  state.health -= amount - absorbed;
};

const hostileIncomingDamage = (
  hostile: keyof typeof ENEMIES,
  difficulty: GameDifficulty,
  profile: AvoidanceProfile,
  neutralizationDps: number,
): number => {
  const enemy = ENEMIES[hostile];
  const policy = DIFFICULTY[difficulty];
  const neutralizationSeconds = enemy.health / neutralizationDps;
  const firstTellSeconds = enemy.windup * policy.reaction;
  const exposedSeconds = Math.max(0, neutralizationSeconds - firstTellSeconds);
  const attackWindows = exposedSeconds / Math.max(Number.EPSILON, enemy.cooldown * policy.refire);
  const tempoPressure = Math.sqrt(policy.enemySpeed * policy.projectileSpeed);
  return attackWindows
    * enemy.damage
    * policy.enemyDamage
    * policy.aggression
    * tempoPressure
    * profile.attackContactShare;
};

const recoveryStages = (map: CampaignMap): readonly string[] => [
  ...phases,
  ...map.actors.filter((actor) => actor.type === 'boss').map((actor) => actor.encounter),
];

const stageIncomingDamage = (
  map: CampaignMap,
  route: string,
  difficulty: GameDifficulty,
  profile: AvoidanceProfile,
  neutralizationDps: number,
  optionalEngagement: number,
): number => map.actors.reduce((total, actor) => {
  if (actor.type === 'enemy') {
    if (actor.route !== route || !actorIsEnabled(actor, DIFFICULTY[difficulty].placement)) return total;
    const engagement = actor.mandatory ? 1 : optionalEngagement;
    return total + hostileIncomingDamage(actor.enemy, difficulty, profile, neutralizationDps) * engagement;
  }
  if (actor.type === 'boss' && actor.encounter === route) {
    return total + hostileIncomingDamage(actor.boss, difficulty, profile, neutralizationDps);
  }
  return total;
}, 0);

const weaponDamagePerSecond = (weapon: WeaponId): number => {
  const definition = WEAPONS[weapon];
  const direct = ((definition.damageMin + definition.damageMax) / 2) * definition.pellets;
  const practicalSplash = (definition.splashDamage ?? 0) * .35;
  return (direct + practicalSplash) / definition.cooldown;
};

const profileDamagePerSecond = (state: RecoveryState, profile: AvoidanceProfile): number => Math.max(
  profile.minimumDps,
  ...[...state.weapons]
    .filter((weapon) => weapon !== 'claim-stamp')
    .map((weapon) => weaponDamagePerSecond(weapon) * profile.weaponUptime),
);

interface RecoveryStageResult {
  readonly route: string;
  readonly incoming: number;
  readonly healthBeforeDamage: number;
  readonly armorBeforeDamage: number;
  readonly healthAfter: number;
  readonly armorAfter: number;
  readonly collection: RecoveryCollectionStats;
}

interface RecoverySimulationOptions {
  readonly optionalEngagement?: number;
  readonly collectionTiming?: 'before-damage' | 'after-damage';
}

const simulateRecoveryMap = (
  map: CampaignMap,
  difficulty: GameDifficulty,
  profile: AvoidanceProfile,
  state: RecoveryState = freshRecoveryState(),
  options: RecoverySimulationOptions = {},
): readonly RecoveryStageResult[] => recoveryStages(map).map((route) => {
  const optionalEngagement = options.optionalEngagement ?? 0;
  const collectionTiming = options.collectionTiming ?? 'before-damage';
  let collection = emptyRecoveryStats();
  if (collectionTiming === 'before-damage') {
    collection = collectStageRecovery(map, route, difficulty, state);
  }
  const incoming = stageIncomingDamage(
    map,
    route,
    difficulty,
    profile,
    profileDamagePerSecond(state, profile),
    optionalEngagement,
  );
  const healthBeforeDamage = state.health;
  const armorBeforeDamage = state.armor;
  applyIncomingDamage(state, incoming);
  const healthAfter = state.health;
  const armorAfter = state.armor;
  // Delayed collection is the conservative route-order bound: unlocked
  // supplies remain useful for the next stage, but cannot erase lethal damage.
  if (collectionTiming === 'after-damage' && healthAfter > 0) {
    collection = collectStageRecovery(map, route, difficulty, state);
  }
  return {
    route,
    incoming,
    healthBeforeDamage,
    armorBeforeDamage,
    healthAfter,
    armorAfter,
    collection,
  };
});

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
  it('limits Episode 3 to one deliberate standard-route full reset per map', () => {
    const failures: string[] = [];
    for (const map of Object.values(CAMPAIGN.maps).filter((candidate) => candidate.id.startsWith('E3'))) {
      const standard = map.actors.filter((actor) => actor.type === 'pickup' && !actor.secret);
      const reserves = standard.filter((actor) => actor.pickup === 'emergency-reserve');
      const suits = standard.filter((actor) => actor.pickup === 'catastrophe-suit');
      if (reserves.length !== 1) failures.push(`${map.id}: ${reserves.length} emergency reserves`);
      if (suits.length !== 0) failures.push(`${map.id}: ${suits.length} redundant catastrophe suits`);
    }
    expect(failures).toEqual([]);
  });

  it('keeps fresh-start routes survivable with delayed pickups and incidental optional pressure', () => {
    const failures: string[] = [];
    const scenarios: readonly { id: string; options: RecoverySimulationOptions }[] = [
      {
        id: 'mandatory-delayed-pickups',
        options: { collectionTiming: 'after-damage' },
      },
      {
        id: 'quarter-optional-pressure',
        options: { optionalEngagement: .25 },
      },
    ];
    for (const scenario of scenarios) {
      for (const difficulty of difficultyOrder) {
        for (const profile of avoidanceProfiles) {
          for (const map of Object.values(CAMPAIGN.maps)) {
            const stages = simulateRecoveryMap(map, difficulty, profile, freshRecoveryState(), scenario.options);
            const failed = stages.find((stage) => stage.healthAfter <= 0);
            if (failed) {
              failures.push(
                `${scenario.id}:${difficulty}:${profile.id}:${map.id}:${failed.route}`
                + ` start ${failed.healthBeforeDamage.toFixed(1)}H/${failed.armorBeforeDamage.toFixed(1)}A`
                + ` -> ${failed.healthAfter.toFixed(1)}H after ${failed.incoming.toFixed(1)} incoming`,
              );
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('does not credit delayed entry supplies as opening armor or weapon throughput', () => {
    const map = CAMPAIGN.maps.E1M1;
    const profile = avoidanceProfiles.find((candidate) => candidate.id === 'conservative')!;
    const beforeDamage = simulateRecoveryMap(map, 'field-adjuster', profile)[0];
    const afterDamage = simulateRecoveryMap(map, 'field-adjuster', profile, freshRecoveryState(), {
      collectionTiming: 'after-damage',
    })[0];

    expect(beforeDamage.armorBeforeDamage).toBe(100);
    expect(afterDamage.armorBeforeDamage).toBe(0);
    expect(afterDamage.incoming).toBeGreaterThan(beforeDamage.incoming);
    expect(afterDamage.collection.armorAccepted).toBe(100);
  });

  it('turns continuous expert-route recovery into usable survival margin without starvation streaks', () => {
    const failures: string[] = [];
    const expert = avoidanceProfiles.find((profile) => profile.id === 'expert')!;

    for (const difficulty of difficultyOrder) {
      let totalOffered = 0;
      let totalAccepted = 0;
      let longestStarvation = 0;

      for (const episode of CAMPAIGN.episodes) {
        const state = freshRecoveryState();
        let starvation = 0;
        let episodeOffered = 0;
        let episodeAccepted = 0;
        const episodeMapRecovery: string[] = [];
        for (const id of episode.maps.filter((mapId) => !CAMPAIGN.maps[mapId].secretMap)) {
          // Expert continuity models a full standard-route clear. Fresh-start
          // progression above deliberately remains mandatory-only.
          const stages = simulateRecoveryMap(CAMPAIGN.maps[id], difficulty, expert, state, {
            optionalEngagement: 1,
          });
          const mapOffered = stages.reduce((total, stage) => total + recoveryOffered(stage.collection), 0);
          const mapAccepted = stages.reduce((total, stage) => total + recoveryAccepted(stage.collection), 0);
          totalOffered += mapOffered;
          totalAccepted += mapAccepted;
          episodeOffered += mapOffered;
          episodeAccepted += mapAccepted;
          if (mapOffered > mapAccepted) {
            episodeMapRecovery.push(`${id} ${mapAccepted.toFixed(1)}/${mapOffered.toFixed(1)}`);
          }

          for (const stage of stages) {
            const startsCriticallyLow = stage.healthBeforeDamage < 60 && stage.armorBeforeDamage < 25;
            starvation = startsCriticallyLow ? starvation + 1 : 0;
            longestStarvation = Math.max(longestStarvation, starvation);
            if (stage.healthAfter <= 0) {
              failures.push(`${difficulty}:${id}:${stage.route} continuous expert route does not survive`);
              break;
            }
          }
        }

        // Lower response levels deliberately retain surplus recovery as part
        // of their accessibility contract. Binding Authority is the expert
        // full-clear contract, so both each episode and the whole campaign
        // must convert at least 65% of every pickup it actually consumes.
        if (difficulty === 'binding-authority' && episodeOffered > 0) {
          const discarded = 1 - episodeAccepted / episodeOffered;
          if (discarded > .35) {
            failures.push(
              `${difficulty}:${episode.id} discards ${(discarded * 100).toFixed(1)}% of collected recovery`
              + ` (${episodeMapRecovery.join(', ')})`,
            );
          }
        }
      }

      const discardedShare = totalOffered > 0 ? 1 - totalAccepted / totalOffered : 0;
      if (difficulty === 'binding-authority' && discardedShare > .35) {
        failures.push(`${difficulty}: discards ${(discardedShare * 100).toFixed(1)}% of collected recovery`);
      }
      if (longestStarvation > 1) {
        failures.push(`${difficulty}: ${longestStarvation} consecutive mandatory stages begin critically low`);
      }
    }

    expect(failures).toEqual([]);
  });

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
      .map(({ map, reserve, owned }) => ({
        map,
        reserve,
        sum: COMBAT_AMMO_TYPES.reduce((total, ammo) => total + reserve[ammo] / ammoCap(ammo), 0),
        owned,
      }));

    expect(diagnostics).toHaveLength(24);
    expect(saturatedMaps.slice(diagnostics.length / 2)
      .map(({ map, reserve }) => `${map}:${JSON.stringify(reserve)}`)).toEqual([]);
    expect(diagnostics
      .filter(({ capped }) => capped > 1)
      .map(({ map, capped, reserve }) => `${map}:${capped}:${JSON.stringify(reserve)}`)).toEqual([]);
    expect(diagnostics
      .filter(({ map, capped }) => cacheMaps.has(map) && capped > 0)
      .map(({ map, capped, reserve }) => `${map}:${capped}:${JSON.stringify(reserve)}`)).toEqual([]);
    expect(diagnostics
      .filter(({ map, collection }) => cacheMaps.has(map) && collection.accepted / collection.offered < .35)
      .map(({ map, collection }) => `${map}:${collection.accepted}/${collection.offered}`)).toEqual([]);
    expect(episodeEndReserve
      .filter(({ sum, owned }) => sum < .1 || sum / Math.max(1, owned) > .35)).toEqual([]);
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
    expect(mainMaps.every((map) => map.parSeconds >= 7 * 60 && map.parSeconds <= 22 * 60)).toBe(true);
    const mainPar = mainMaps.reduce((total, map) => total + map.parSeconds, 0);
    expect(mainPar).toBeGreaterThanOrEqual(4.5 * 3600);
    expect(mainPar).toBeLessThanOrEqual(6.5 * 3600);

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
