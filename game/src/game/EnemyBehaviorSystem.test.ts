import { describe, expect, it } from 'vitest';
import type { BossId, EnemyId } from '../data/types';
import { ENEMIES } from './definitions';
import { DIFFICULTY, WEAPONS } from './definitions';
import {
  ENEMY_BEHAVIOR_PROFILES,
  EnemyBehaviorSystem,
  REGIONAL_DIRECTOR_SUMMON_CAPS,
  planLegacyRegionalDirectorSummonRestore,
  SeededRandom,
  buildNavigationDistanceField,
  navigationDirectionFromField,
  reconcileEnemyBehaviorSnapshot,
  type BehaviorActor,
  type BehaviorEvent,
  type BehaviorStepInput,
  type BehaviorTarget,
  type HostileId,
  type NavigationGridAdapter,
} from './EnemyBehaviorSystem';

const BOSS_IDS = new Set<HostileId>(['regional-director', 'aggregate', 'chief-actuary', 'uninsurable']);

function actor(id: HostileId, overrides: Partial<BehaviorActor> = {}): BehaviorActor {
  const definition = ENEMIES[id];
  return {
    uid: `${id}-1`, kind: BOSS_IDS.has(id) ? 'boss' : 'enemy', id,
    position: { x: 0, y: 0, z: 0 }, health: definition.health, maxHealth: definition.health,
    radius: definition.radius, height: definition.height, faction: definition.faction,
    awake: true, dead: false, ...overrides,
  };
}

function target(z = 8, overrides: Partial<BehaviorTarget> = {}): BehaviorTarget {
  return { uid: 'player', position: { x: 0, y: 1, z }, velocity: { x: 0, y: 0, z: 0 }, radius: .35, alive: true, ...overrides };
}

const eventsOf = <T extends BehaviorEvent['type']>(events: BehaviorEvent[], type: T) =>
  events.filter((event): event is Extract<BehaviorEvent, { type: T }> => event.type === type);

function runFor(system: EnemyBehaviorSystem, input: Omit<BehaviorStepInput, 'dt'>, seconds: number, tick = .05): BehaviorEvent[] {
  const events: BehaviorEvent[] = [];
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += tick) events.push(...system.step({ ...input, dt: Math.min(tick, seconds - elapsed) }).events);
  return events;
}

describe('EnemyBehaviorSystem definitions', () => {
  it('defines the complete roster, locked health, and corrected combat roles', () => {
    const enemyIds: EnemyId[] = ['returned-mail', 'desk-warden', 'ember-clerk', 'exposure-hound', 'coverage-drone', 'liability-mass', 'denial-officer', 'subrogator', 'reserve-eater', 'fraud-apparition', 'cat-model', 'bad-faith-counsel'];
    const bossIds: BossId[] = ['regional-director', 'aggregate', 'chief-actuary', 'uninsurable'];
    expect(Object.keys(ENEMY_BEHAVIOR_PROFILES).sort()).toEqual([...enemyIds, ...bossIds].sort());
    expect(enemyIds.map((id) => ENEMIES[id].health)).toEqual([30, 50, 60, 75, 50, 300, 250, 150, 500, 100, 250, 350]);
    expect(bossIds.map((id) => ENEMIES[id].health)).toEqual([2000, 3000, 2500, 4000]);
    expect(ENEMY_BEHAVIOR_PROFILES['returned-mail'].attacks[0].kind).toBe('melee');
    expect(ENEMY_BEHAVIOR_PROFILES['fraud-apparition'].attacks[0].kind).toBe('melee');
    expect(ENEMY_BEHAVIOR_PROFILES.subrogator.attacks[0]).toMatchObject({ kind: 'projectile', pattern: { count: 3 } });
    expect(ENEMIES['desk-warden'].drop).toEqual({ kind: 'ammo', id: 'staples', amount: 1, chance: .15 });
    bossIds.forEach((id) => expect(ENEMY_BEHAVIOR_PROFILES[id].phases).toHaveLength(3));
    expect(ENEMY_BEHAVIOR_PROFILES['regional-director'].attacks.find((attack) => attack.kind === 'summon'))
      .toMatchObject({ liveCap: 4, totalCap: 8 });
  });

  it('locks weapon cadence, damage ranges, ammo IDs, and hardest aggression', () => {
    expect(Object.values(WEAPONS).map((weapon) => [weapon.id, weapon.cooldown, weapon.damageMin, weapon.damageMax, weapon.pellets])).toEqual([
      ['claim-stamp', 14 / 35, 20, 60, 1], ['staple-driver', 7 / 35, 5, 15, 1],
      ['twin-bore-riveter', 24 / 35, 3, 9, 14], ['audit-repeater', 4 / 35, 5, 15, 1],
      ['catastrophe-launcher', 28 / 35, 20, 40, 1], ['plasma-copier', 3 / 35, 5, 40, 1],
      ['binding-engine', 1, 10, 30, 20], ['umbra-saw', 4 / 35, 8, 24, 1],
    ]);
    expect(WEAPONS['plasma-copier'].ammo).toBe('toner-cells');
    expect(WEAPONS['binding-engine'].ammo).toBe('toner-cells');
    expect(DIFFICULTY['binding-authority']).toMatchObject({ reaction: .8, refire: .8, projectileSpeed: 1.2 });
  });
});

describe('deterministic hostile navigation', () => {
  const gridFor = (rows: readonly string[], openableDoors = true): NavigationGridAdapter => ({
    width: rows[0].length,
    height: rows.length,
    cellSize: 1,
    canTraverse: (_from, to) => {
      const tile = rows[to.z]?.[to.x] ?? '#';
      return tile !== '#' && (tile !== 'D' || openableDoors);
    },
  });

  it('routes around an ordinary L-corridor corner instead of steering into the wall', () => {
    const rows = ['#####', '#.#.#', '#...#', '#####'];
    const grid = gridFor(rows);
    const field = buildNavigationDistanceField({ x: 3, z: 1 }, grid);
    const direction = navigationDirectionFromField(
      'mail-corner',
      { x: 1.5, y: 0, z: 1.5 },
      { x: 3.5, y: 0, z: 1.5 },
      field,
      grid,
    );
    expect(direction).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('plans through an openable door while treating the same cell as unreachable when locked', () => {
    const rows = ['#####', '#.D.#', '#####'];
    const start = { x: 1.5, y: 0, z: 1.5 };
    const targetPosition = { x: 3.5, y: 0, z: 1.5 };
    const openableGrid = gridFor(rows, true);
    const openable = navigationDirectionFromField(
      'mail-door', start, targetPosition, buildNavigationDistanceField({ x: 3, z: 1 }, openableGrid), openableGrid,
    );
    const lockedGrid = gridFor(rows, false);
    const locked = navigationDirectionFromField(
      'mail-door', start, targetPosition, buildNavigationDistanceField({ x: 3, z: 1 }, lockedGrid), lockedGrid,
    );
    expect(openable).toEqual({ x: 1, y: 0, z: 0 });
    expect(locked).toBeUndefined();
  });

  it('uses a stable side step when another actor congests the preferred lane', () => {
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    const blockedLane = {
      hasLineOfSight: () => false,
      navigationDirection: () => ({ x: 1, y: 0, z: 0 }),
      canOccupy: (_actor: BehaviorActor, position: { x: number; z: number }) => position.z > .01,
    };
    const events = runFor(system, {
      actors: [actor('returned-mail')],
      target: target(12, { position: { x: 12, y: 1, z: 0 } }),
      world: blockedLane,
    }, .8);
    const moves = eventsOf(events, 'move');
    expect(moves.length).toBeGreaterThan(2);
    expect(moves.every((event) => event.velocity.x > 0 && event.velocity.z > 0)).toBe(true);
    expect(new Set(moves.map((event) => `${event.velocity.x.toFixed(6)},${event.velocity.z.toFixed(6)}`)).size).toBe(1);
  });
});

describe('EnemyBehaviorSystem state machine', () => {
  it('performs acquire, windup, committed attack, and recovery in order', () => {
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    const mail = actor('returned-mail');
    const events = runFor(system, { actors: [mail], target: target(1.2) }, 1.1);
    const states = eventsOf(events, 'state').map((event) => event.state);
    expect(states).toEqual(expect.arrayContaining(['chase', 'windup', 'recovery']));
    const windupIndex = events.findIndex((event) => event.type === 'state' && event.state === 'windup');
    const attackIndex = events.findIndex((event) => event.type === 'attack');
    const damageIndex = events.findIndex((event) => event.type === 'damage');
    expect(windupIndex).toBeGreaterThanOrEqual(0);
    expect(attackIndex).toBeGreaterThan(windupIndex);
    expect(damageIndex).toBeGreaterThanOrEqual(attackIndex);
  });

  it('rechecks hitscan range and line of sight after windup before applying damage', () => {
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    const warden = actor('desk-warden');
    let visible = true;
    runFor(system, { actors: [warden], target: target(7), world: { hasLineOfSight: () => visible } }, .25);
    expect(system.getActorState(warden.uid)?.action).toBe('windup');
    visible = false;
    const covered = runFor(system, { actors: [warden], target: target(7), world: { hasLineOfSight: () => visible } }, .5);
    expect(eventsOf(covered, 'attack')).toHaveLength(1);
    expect(eventsOf(covered, 'attack')[0]).toMatchObject({ resolved: false, blocked: true, hitCount: 0 });
    expect(eventsOf(covered, 'damage')).toHaveLength(0);
  });

  it('distinguishes an accuracy miss from a blocked hitscan resolution', () => {
    const system = new EnemyBehaviorSystem({ rng: () => .999 });
    const events = runFor(system, {
      actors: [actor('denial-officer')], target: target(7), world: { hasLineOfSight: () => true },
    }, 1);
    expect(eventsOf(events, 'attack')[0]).toMatchObject({ attackId: 'denial-beam', resolved: true, blocked: false, hitCount: 0 });
    expect(eventsOf(events, 'damage')).toHaveLength(0);
  });

  it('interrupts a pending attack with pain and retains the provoker', () => {
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    const hound = actor('exposure-hound');
    runFor(system, { actors: [hound], target: target(1.3) }, .3);
    expect(system.getActorState(hound.uid)?.action).toBe('windup');
    system.registerDamage(hound.uid, 'attacker-2', 5);
    const painTick = system.step({ dt: .01, actors: [hound, actor('desk-warden', { uid: 'attacker-2' })], target: target(1.3) });
    expect(eventsOf(painTick.events, 'pain')[0]).toMatchObject({ actorUid: hound.uid, sourceUid: 'attacker-2' });
    expect(system.getActorState(hound.uid)).toMatchObject({ action: 'pain', targetUid: 'attacker-2', provokerUid: 'attacker-2' });
  });

  it('wakes dormant actors through propagated sound without line of sight', () => {
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    const sleeper = actor('desk-warden', { awake: false, position: { x: 4, y: 0, z: 0 } });
    system.emitSound({ x: 0, y: 0, z: 0 }, 8, 'player');
    const result = system.step({ dt: .01, actors: [sleeper], target: target(30), world: { hasLineOfSight: () => false } });
    expect(eventsOf(result.events, 'wake')).toEqual([{ type: 'wake', actorUid: sleeper.uid, sourceUid: 'player', through: 'sound' }]);
    expect(system.getActorState(sleeper.uid)?.action).toBe('acquire');
  });

  it('lets an intervening actor absorb hitscan fire and naturally provoke retaliation', () => {
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    const attacker = actor('desk-warden', { uid: 'warden-a' });
    const intervening = actor('desk-warden', { uid: 'warden-b', awake: false, position: { x: 0, y: 0, z: 5 } });
    const firstVolley = runFor(system, {
      actors: [attacker, intervening],
      target: target(10),
      world: { hasLineOfSight: () => true },
    }, .8);
    const intercepted = eventsOf(firstVolley, 'damage').filter((event) => event.sourceUid === attacker.uid);
    expect(intercepted.length).toBeGreaterThan(0);
    expect(intercepted.every((event) => event.targetUid === intervening.uid)).toBe(true);

    system.registerDamage(intervening.uid, attacker.uid, intercepted.reduce((total, event) => total + event.amount, 0));
    const retaliation = runFor(system, {
      actors: [attacker, intervening],
      target: target(10),
      world: { hasLineOfSight: () => true },
    }, 1.4);
    expect(system.getActorState(intervening.uid)?.provokerUid).toBe(attacker.uid);
    expect(eventsOf(retaliation, 'damage')).toContainEqual(expect.objectContaining({
      sourceUid: intervening.uid,
      targetUid: attacker.uid,
    }));
  });
});

describe('Forensic Lens targeting disruption', () => {
  it('reduces visual acquisition range and lengthens a successful sight acquisition', () => {
    const hiddenNormal = new EnemyBehaviorSystem({ rng: () => 0 });
    const hiddenLens = new EnemyBehaviorSystem({ rng: () => 0 });
    const distant = actor('desk-warden', { awake: false });
    const normalWake = hiddenNormal.step({
      dt: .01,
      actors: [distant],
      target: target(18),
      world: { hasLineOfSight: () => true },
    });
    const disruptedWake = hiddenLens.step({
      dt: .01,
      actors: [distant],
      target: target(18, { targetingDisrupted: true }),
      world: { hasLineOfSight: () => true },
    });
    expect(eventsOf(normalWake.events, 'wake')).toHaveLength(1);
    expect(eventsOf(disruptedWake.events, 'wake')).toHaveLength(0);

    const nearNormal = new EnemyBehaviorSystem({ rng: () => 0 });
    const nearLens = new EnemyBehaviorSystem({ rng: () => 0 });
    nearNormal.step({ dt: .01, actors: [distant], target: target(10), world: { hasLineOfSight: () => true } });
    nearLens.step({ dt: .01, actors: [distant], target: target(10, { targetingDisrupted: true }), world: { hasLineOfSight: () => true } });
    expect(nearLens.getActorState(distant.uid)?.stateTimer).toBeGreaterThan(nearNormal.getActorState(distant.uid)?.stateTimer ?? 0);
  });

  it('degrades hitscan and projectile aim without changing deterministic simulation', () => {
    const normalHitscan = new EnemyBehaviorSystem({ rng: () => .5 });
    const disruptedHitscan = new EnemyBehaviorSystem({ rng: () => .5 });
    const warden = actor('desk-warden', { uid: 'accuracy-12' });
    const normalVolley = runFor(normalHitscan, {
      actors: [warden], target: target(7), world: { hasLineOfSight: () => true },
    }, .9);
    const disruptedVolley = runFor(disruptedHitscan, {
      actors: [warden], target: target(7, { targetingDisrupted: true }), world: { hasLineOfSight: () => true },
    }, .9);
    expect(eventsOf(normalVolley, 'damage').length).toBeGreaterThan(0);
    expect(eventsOf(disruptedVolley, 'attack')[0]).toMatchObject({ resolved: true, hitCount: 0 });
    expect(eventsOf(disruptedVolley, 'damage')).toHaveLength(0);

    const normalProjectile = new EnemyBehaviorSystem({ rng: () => .5 });
    const disruptedProjectile = new EnemyBehaviorSystem({ rng: () => .5 });
    const drone = actor('coverage-drone', { uid: 'accuracy-12' });
    const normalFan = eventsOf(runFor(normalProjectile, {
      actors: [drone], target: target(12), world: { hasLineOfSight: () => true },
    }, 1.1), 'spawn-projectile');
    const disruptedFan = eventsOf(runFor(disruptedProjectile, {
      actors: [drone], target: target(12, { targetingDisrupted: true }), world: { hasLineOfSight: () => true },
    }, 1.1), 'spawn-projectile');
    expect(normalFan).toHaveLength(3);
    expect(disruptedFan).toHaveLength(3);
    expect(normalFan[1].projectile.velocity.x).toBeCloseTo(0, 6);
    expect(Math.abs(disruptedFan[1].projectile.velocity.x)).toBeGreaterThan(.1);
  });

  it('displaces predictive hazards away from their undisrupted aim point', () => {
    const normal = new EnemyBehaviorSystem({ rng: () => 0 });
    const disrupted = new EnemyBehaviorSystem({ rng: () => 0 });
    const cat = actor('cat-model', { uid: 'forensic-hazard' });
    const normalHazard = eventsOf(runFor(normal, {
      actors: [cat],
      target: target(12),
      world: { hasLineOfSight: () => true, canPlaceHazard: () => true },
    }, 1.5), 'spawn-hazard')[0].hazard;
    const disruptedHazard = eventsOf(runFor(disrupted, {
      actors: [cat],
      target: target(12, { targetingDisrupted: true }),
      world: { hasLineOfSight: () => true, canPlaceHazard: () => true },
    }, 1.5), 'spawn-hazard')[0].hazard;

    expect(normalHazard.position).toMatchObject({ x: 0, z: 12 });
    expect(Math.hypot(
      disruptedHazard.position.x - normalHazard.position.x,
      disruptedHazard.position.z - normalHazard.position.z,
    )).toBeGreaterThan(.25);
  });

  it('suspends projectile homing for a disrupted target', () => {
    const snapshot = {
      version: 1 as const,
      elapsed: 0,
      nextEntityId: 2,
      actors: [],
      projectiles: [{
        id: 'homing-test',
        ownerUid: 'subrogator-1',
        ownerId: 'subrogator' as const,
        kind: 'subrogation-packet',
        position: { x: 0, y: 1, z: 0 },
        velocity: { x: 10, y: 0, z: 0 },
        radius: .2,
        damage: 10,
        damageKind: 'redaction' as const,
        remaining: 2,
        targetUid: 'player',
        homing: .7,
      }],
      hazards: [],
    };
    const normal = new EnemyBehaviorSystem({ rng: () => 0 });
    const disrupted = new EnemyBehaviorSystem({ rng: () => 0 });
    normal.restore(structuredClone(snapshot));
    disrupted.restore(structuredClone(snapshot));

    normal.step({ dt: .1, actors: [], target: target(10) });
    disrupted.step({ dt: .1, actors: [], target: target(10, { targetingDisrupted: true }) });
    const normalVelocity = normal.serialize().projectiles[0].velocity;
    const disruptedVelocity = disrupted.serialize().projectiles[0].velocity;
    expect(normalVelocity.z).toBeGreaterThan(0);
    expect(normalVelocity.x).toBeLessThan(10);
    expect(disruptedVelocity).toEqual({ x: 10, y: 0, z: 0 });
  });

  it('breaks an established ranged lock on a stable per-enemy cadence', () => {
    const quietProfile = {
      ...ENEMY_BEHAVIOR_PROFILES,
      'desk-warden': { ...ENEMY_BEHAVIOR_PROFILES['desk-warden'], initialCooldown: 100, cooldownJitter: 0 },
    };
    const normal = new EnemyBehaviorSystem({ rng: () => .5, profiles: quietProfile });
    const disrupted = new EnemyBehaviorSystem({ rng: () => .5, profiles: quietProfile });
    const warden = actor('desk-warden');
    const normalStates = eventsOf(runFor(normal, { actors: [warden], target: target(8) }, 2.5), 'state');
    const disruptedStates = eventsOf(runFor(disrupted, {
      actors: [warden], target: target(8, { targetingDisrupted: true }),
    }, 2.5), 'state');
    expect(normalStates.filter((event) => event.state === 'acquire')).toHaveLength(0);
    expect(disruptedStates).toContainEqual(expect.objectContaining({
      actorUid: warden.uid,
      state: 'acquire',
      duration: .32,
    }));
  });
});

describe('EnemyBehaviorSystem role mechanics', () => {
  it('emits lunge contact damage and a three-projectile subrogator burst', () => {
    const meleeSystem = new EnemyBehaviorSystem({ rng: () => 0 });
    const melee = runFor(meleeSystem, { actors: [actor('fraud-apparition')], target: target(1.2) }, .8);
    expect(eventsOf(melee, 'move')).toContainEqual(expect.objectContaining({ mode: 'lunge' }));
    expect(eventsOf(melee, 'damage')).toContainEqual(expect.objectContaining({ targetUid: 'player', damageKind: 'redaction' }));

    const burstSystem = new EnemyBehaviorSystem({ rng: () => 0 });
    const burst = runFor(burstSystem, { actors: [actor('subrogator')], target: target(9) }, .8);
    expect(eventsOf(burst, 'spawn-projectile')).toHaveLength(3);
  });

  it('continues lunging for the authored duration instead of one simulation tick', () => {
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    const events = runFor(system, { actors: [actor('exposure-hound')], target: target(1.3) }, 1, .02);
    const lunges = eventsOf(events, 'move').filter((event) => event.mode === 'lunge');
    expect(lunges.length).toBeGreaterThan(5);
    expect(lunges.reduce((total, event) => total + (event.duration ?? 0), 0)).toBeCloseTo(.28, 3);
  });

  it('scales projectile velocity on the hardest difficulty', () => {
    const normal = new EnemyBehaviorSystem({ rng: () => 0 });
    const hard = new EnemyBehaviorSystem({ rng: () => 0 });
    const input = { actors: [actor('coverage-drone')], target: target(12) };
    const normalEvents = runFor(normal, { ...input, difficulty: { reaction: 1, refire: 1, projectileSpeed: 1 } }, .8);
    const hardEvents = runFor(hard, { ...input, difficulty: { reaction: .8, refire: .8, projectileSpeed: 1.2 } }, .8);
    const normalSpeed = Math.hypot(...Object.values(eventsOf(normalEvents, 'spawn-projectile')[0].projectile.velocity));
    const hardSpeed = Math.hypot(...Object.values(eventsOf(hardEvents, 'spawn-projectile')[0].projectile.velocity));
    expect(hardSpeed / normalSpeed).toBeCloseTo(1.2, 5);
  });

  it('uses difficulty aggression to shorten the actual refire envelope', () => {
    const low = new EnemyBehaviorSystem({ rng: () => 0 });
    const high = new EnemyBehaviorSystem({ rng: () => 0 });
    const input = { actors: [actor('desk-warden')], target: target(7) };
    const lowAttacks = eventsOf(runFor(low, { ...input, difficulty: { reaction: 1, refire: 1, projectileSpeed: 1, aggression: .5 } }, 5), 'attack');
    const highAttacks = eventsOf(runFor(high, { ...input, difficulty: { reaction: 1, refire: 1, projectileSpeed: 1, aggression: 1.5 } }, 5), 'attack');
    expect(highAttacks.length).toBeGreaterThan(lowAttacks.length);
  });

  it('does not create an impact hazard when a projectile merely expires', () => {
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    runFor(system, { actors: [actor('ember-clerk')], target: target(10) }, .8);
    expect(system.serialize().projectiles.length).toBeGreaterThan(0);
    const expired = runFor(system, { actors: [], target: target(100, { alive: false }) }, 6);
    expect(eventsOf(expired, 'remove-projectile')).toContainEqual(expect.objectContaining({ reason: 'expired' }));
    expect(eventsOf(expired, 'spawn-hazard')).toHaveLength(0);
  });

  it('reports the authoritative projectile payload and resolved impact point', () => {
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    runFor(system, { actors: [actor('coverage-drone')], target: target(12) }, .8);
    expect(system.serialize().projectiles.length).toBeGreaterThan(0);
    const velocity = system.serialize().projectiles[0].velocity;
    const resolved = { x: 2.25, y: .75, z: 4.5 };
    const result = system.step({
      dt: .05,
      actors: [],
      target: target(100),
      world: { traceProjectile: () => ({ position: resolved, targetUid: 'player' }) },
    });
    expect(eventsOf(result.events, 'remove-projectile')[0]).toEqual({
      type: 'remove-projectile',
      projectileId: expect.any(String),
      reason: 'impact',
      kind: 'coverage-bolt',
      damageKind: 'toner',
      position: resolved,
      velocity,
      targetUid: 'player',
    });
  });

  it('arms prediction hazards and resurrects corpses as redacted variants', () => {
    const catSystem = new EnemyBehaviorSystem({ rng: () => 0 });
    const input = { actors: [actor('cat-model')], target: target(12) };
    const telegraph = runFor(catSystem, input, .9);
    expect(eventsOf(telegraph, 'spawn-hazard')[0].hazard).toMatchObject({ kind: 'prediction-zone', armed: false });
    const impact = runFor(catSystem, input, 1);
    expect(eventsOf(impact, 'hazard-armed')).toHaveLength(1);

    const counselSystem = new EnemyBehaviorSystem({ rng: () => 0 });
    const counsel = actor('bad-faith-counsel');
    const corpse = actor('desk-warden', { uid: 'fallen', position: { x: 2, y: 0, z: 0 }, health: 0, dead: true });
    const resurrection = runFor(counselSystem, { actors: [counsel, corpse], target: target(10) }, 1);
    expect(eventsOf(resurrection, 'resurrect')[0]).toEqual({ type: 'resurrect', actorUid: counsel.uid, targetUid: corpse.uid, health: 21, redacted: true });
  });

  it('cancels predicted hazards that resolve behind cover or on invalid geometry', () => {
    const coveredSystem = new EnemyBehaviorSystem({ rng: () => 0 });
    const cat = actor('cat-model');
    let visible = true;
    runFor(coveredSystem, {
      actors: [cat], target: target(12), world: { hasLineOfSight: () => visible, canPlaceHazard: () => true },
    }, .55);
    expect(coveredSystem.getActorState(cat.uid)?.action).toBe('windup');
    visible = false;
    const covered = runFor(coveredSystem, {
      actors: [cat], target: target(12), world: { hasLineOfSight: () => visible, canPlaceHazard: () => true },
    }, .5);
    expect(eventsOf(covered, 'attack')[0]).toMatchObject({ attackId: 'loss-prediction', resolved: false });
    expect(eventsOf(covered, 'spawn-hazard')).toHaveLength(0);

    const invalidSystem = new EnemyBehaviorSystem({ rng: () => 0 });
    const invalid = runFor(invalidSystem, {
      actors: [actor('cat-model')], target: target(12),
      world: { hasLineOfSight: () => true, canPlaceHazard: () => false },
    }, 1);
    expect(eventsOf(invalid, 'attack')[0]).toMatchObject({ attackId: 'loss-prediction', resolved: false });
    expect(eventsOf(invalid, 'spawn-hazard')).toHaveLength(0);
  });

  it('does not apply an armed hazard through cover', () => {
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    const cat = actor('cat-model');
    const player = target(12);
    const placed = runFor(system, {
      actors: [cat], target: player, world: { hasLineOfSight: () => true, canPlaceHazard: () => true },
    }, .9);
    expect(eventsOf(placed, 'spawn-hazard')).toHaveLength(1);
    const covered = runFor(system, {
      actors: [cat], target: player, world: { hasLineOfSight: () => false, canPlaceHazard: () => true },
    }, 1);
    expect(eventsOf(covered, 'hazard-armed')).toHaveLength(1);
    expect(eventsOf(covered, 'damage')).toHaveLength(0);
  });

  it('skips covered pulse times without banking catch-up damage for re-exposure', () => {
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    system.restore({
      version: 1,
      elapsed: 0,
      nextEntityId: 2,
      actors: [],
      projectiles: [],
      hazards: [{
        id: 'covered-hazard', ownerUid: 'reserve-eater-1', ownerId: 'reserve-eater', kind: 'reserve-hazard',
        position: { x: 0, y: 0, z: 0 }, radius: 2, damage: 8, damageKind: 'hazard',
        remaining: 4, armRemaining: 0, pulseRemaining: 0, pulseInterval: .5, armed: true,
      }],
    });
    const player = target(0);
    const covered = runFor(system, {
      actors: [], target: player, world: { hasLineOfSight: () => false },
    }, 1.125, .125);
    expect(eventsOf(covered, 'damage')).toHaveLength(0);
    expect(system.serialize().hazards[0].pulseRemaining).toBe(.375);

    const beforeNextPulse = runFor(system, {
      actors: [], target: player, world: { hasLineOfSight: () => true },
    }, .25, .125);
    expect(eventsOf(beforeNextPulse, 'damage')).toHaveLength(0);
    const nextPulse = runFor(system, {
      actors: [], target: player, world: { hasLineOfSight: () => true },
    }, .125, .125);
    expect(eventsOf(nextPulse, 'damage')).toHaveLength(1);
  });

  it.each([
    ['regional-director', 'open-add-shutters'],
    ['aggregate', 'disable-right-emitter'],
    ['chief-actuary', 'arena-switch-window'],
    ['uninsurable', 'spawn-wave'],
  ] as const)('emits an authored final-phase mechanism for %s', (id, mechanism) => {
    const boss = actor(id, { health: ENEMIES[id].health * .2 });
    const result = new EnemyBehaviorSystem({ rng: () => 0 }).step({ dt: 0, actors: [boss], target: target(10) });
    expect(eventsOf(result.events, 'boss-phase')[0]).toMatchObject({ bossId: id, phaseIndex: 2 });
    expect(eventsOf(result.events, 'boss-mechanism')[0]).toMatchObject({ bossId: id, mechanism });
  });

  it('bounds Regional Director summons across a long fight and preserves both caps through restore', () => {
    const boss = actor('regional-director', { health: ENEMIES['regional-director'].health * .5 });
    const actors: BehaviorActor[] = [boss];
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    const spawned: BehaviorActor[] = [];

    const soak = (subject: EnemyBehaviorSystem, seconds: number, retireAdds: boolean): string[] => {
      const emitted: string[] = [];
      for (let elapsed = 0; elapsed < seconds; elapsed += .05) {
        const result = subject.step({ dt: .05, actors, target: target(12) });
        eventsOf(result.events, 'summon').forEach((event) => event.positions.forEach((position, index) => {
          const add = actor(event.enemyId, { uid: event.actorUids[index], position });
          if (retireAdds) add.dead = true;
          actors.push(add);
          spawned.push(add);
          emitted.push(add.uid);
        }));
      }
      return emitted;
    };

    const liveLimited = soak(system, 120, false);
    expect(liveLimited).toHaveLength(REGIONAL_DIRECTOR_SUMMON_CAPS.live);
    expect(spawned.filter((add) => !add.dead)).toHaveLength(REGIONAL_DIRECTOR_SUMMON_CAPS.live);

    const snapshot = JSON.parse(JSON.stringify(system.serialize()));
    const restored = new EnemyBehaviorSystem({ rng: () => 0 });
    restored.restore(snapshot);
    expect(restored.serialize()).toEqual(system.serialize());

    spawned.forEach((add) => { add.dead = true; });
    const afterRestore = soak(restored, 240, true);
    expect(liveLimited.length + afterRestore.length).toBe(REGIONAL_DIRECTOR_SUMMON_CAPS.total);
    expect(restored.serialize().summonOwners).toEqual([expect.objectContaining({
      ownerUid: boss.uid,
      total: REGIONAL_DIRECTOR_SUMMON_CAPS.total,
    })]);
    expect(soak(restored, 120, true)).toHaveLength(0);
  });

  it('infers legacy summon ownership before applying live and lifetime caps', () => {
    const boss = actor('regional-director', { health: ENEMIES['regional-director'].health * .5 });
    const adds = Array.from({ length: REGIONAL_DIRECTOR_SUMMON_CAPS.live }, (_, index) => actor('desk-warden', {
      uid: `summoned-desk-warden-${index}`,
      position: { x: index + 1, y: 0, z: 0 },
    }));
    const actors: BehaviorActor[] = [boss, ...adds];
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    system.restore({ version: 1, elapsed: 0, nextEntityId: 20, actors: [], projectiles: [], hazards: [] });

    const soak = (seconds: number, retireAdds: boolean): string[] => {
      const emitted: string[] = [];
      for (let elapsed = 0; elapsed < seconds; elapsed += .05) {
        const result = system.step({ dt: .05, actors, target: target(12) });
        eventsOf(result.events, 'summon').forEach((event) => event.positions.forEach((position, index) => {
          const add = actor(event.enemyId, { uid: event.actorUids[index], position, dead: retireAdds });
          actors.push(add);
          emitted.push(add.uid);
        }));
      }
      return emitted;
    };

    expect(soak(120, false)).toHaveLength(0);
    adds.forEach((add) => { add.dead = true; });
    expect(soak(240, true)).toHaveLength(REGIONAL_DIRECTOR_SUMMON_CAPS.total - adds.length);
    expect(system.serialize().summonOwners).toEqual([expect.objectContaining({
      ownerUid: boss.uid,
      total: REGIONAL_DIRECTOR_SUMMON_CAPS.total,
    })]);
    expect(soak(120, true)).toHaveLength(0);
  });

  it('plans an over-cap legacy restore with four live actors and the original lifetime count', () => {
    const boss = actor('regional-director');
    const live = Array.from({ length: 6 }, (_, index) => actor('desk-warden', {
      uid: `summoned-desk-warden-${index}`,
    }));
    const dead = Array.from({ length: 5 }, (_, index) => actor('desk-warden', {
      uid: `summoned-desk-warden-${index + live.length}`,
      dead: true,
    }));

    const plan = planLegacyRegionalDirectorSummonRestore([boss, ...live, ...dead], undefined);
    expect(plan).toEqual({
      ownerUid: boss.uid,
      actorUids: [
        'summoned-desk-warden-0',
        'summoned-desk-warden-1',
        'summoned-desk-warden-2',
        'summoned-desk-warden-3',
        'summoned-desk-warden-10',
        'summoned-desk-warden-6',
        'summoned-desk-warden-7',
        'summoned-desk-warden-8',
      ],
      total: 11,
    });
    expect(plan!.actorUids.filter((uid) => Number(uid.split('-').at(-1)) < live.length)).toHaveLength(4);
    expect(planLegacyRegionalDirectorSummonRestore([boss, ...live], [])).toBeUndefined();
  });
});

describe('EnemyBehaviorSystem persistence', () => {
  it('round-trips explicit states, projectiles, hazards, entity IDs, and RNG', () => {
    const actors = [actor('cat-model'), actor('ember-clerk', { uid: 'ember-2', position: { x: 2, y: 0, z: 0 } })];
    const player = target(10, { velocity: { x: .5, y: 0, z: 0 } });
    const original = new EnemyBehaviorSystem({ rng: new SeededRandom(12345) });
    runFor(original, { actors, target: player }, 1.1);
    const snapshot = JSON.parse(JSON.stringify(original.serialize()));
    expect(snapshot.projectiles.length).toBeGreaterThan(0);
    expect(snapshot.hazards.length).toBeGreaterThan(0);
    expect(snapshot.actors.every((state: { action?: string }) => state.action)).toBe(true);
    const containsUndefined = (value: unknown): boolean => Boolean(value && typeof value === 'object' && Object.values(value).some((entry) => entry === undefined || containsUndefined(entry)));
    expect(containsUndefined(original.serialize())).toBe(false);

    const restored = new EnemyBehaviorSystem({ rng: new SeededRandom(1) });
    restored.restore(snapshot);
    expect(restored.serialize()).toEqual(original.serialize());
    const nextInput = { dt: .2, actors, target: player };
    expect(restored.step(nextInput)).toEqual(original.step(nextInput));
    expect(restored.serialize()).toEqual(original.serialize());
  });

  it('round-trips queued sound, damage, and an in-progress lunge exactly', () => {
    const source = new EnemyBehaviorSystem({ rng: new SeededRandom(77) });
    const hound = actor('exposure-hound');
    runFor(source, { actors: [hound], target: target(1.3) }, .45, .01);
    source.emitSound({ x: 2, y: 0, z: 3 }, 11, 'alarm');
    source.registerDamage(hound.uid, 'player', 9);
    const snapshot = JSON.parse(JSON.stringify(source.serialize()));
    const restored = new EnemyBehaviorSystem({ rng: new SeededRandom(1) });
    restored.restore(snapshot);
    expect(restored.serialize()).toEqual(source.serialize());
    const next = { dt: .02, actors: [hound], target: target(1.3) };
    expect(restored.step(next)).toEqual(source.step(next));
  });

  it('remaps summon ownership only through accepted restored actor identities', () => {
    const boss = actor('regional-director', { health: ENEMIES['regional-director'].health * .5 });
    const source = new EnemyBehaviorSystem({ rng: () => 0 });
    for (let tick = 0; tick < 400 && !source.serialize().summonOwners?.length; tick += 1) {
      source.step({ dt: .05, actors: [boss], target: target(12) });
    }
    const snapshot = source.serialize();
    const owner = snapshot.summonOwners?.[0];
    expect(owner?.actorUids).toHaveLength(2);

    const reconciled = reconcileEnemyBehaviorSnapshot(snapshot, [
      { savedUid: boss.uid, runtimeUid: 'regional-director-current', id: boss.id },
      { savedUid: owner!.actorUids[0], runtimeUid: 'summoned-desk-warden-current-1', id: 'desk-warden' },
    ]);
    expect(reconciled.summonOwners).toEqual([{
      ownerUid: 'regional-director-current',
      actorUids: ['summoned-desk-warden-current-1'],
      total: 2,
    }]);
  });
});
