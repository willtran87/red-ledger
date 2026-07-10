import { describe, expect, it } from 'vitest';
import type { BossId, EnemyId } from '../data/types';
import { ENEMIES } from './definitions';
import { DIFFICULTY, WEAPONS } from './definitions';
import {
  ENEMY_BEHAVIOR_PROFILES,
  EnemyBehaviorSystem,
  SeededRandom,
  type BehaviorActor,
  type BehaviorEvent,
  type BehaviorStepInput,
  type BehaviorTarget,
  type HostileId,
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
    expect(ENEMIES['desk-warden'].drop).toEqual({ kind: 'ammo', id: 'staples', amount: 5, chance: 1 });
    bossIds.forEach((id) => expect(ENEMY_BEHAVIOR_PROFILES[id].phases).toHaveLength(3));
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

  it('attributes a provoker and permits same-faction infighting', () => {
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    const attacker = actor('desk-warden', { uid: 'warden-a', position: { x: 0, y: 0, z: 3 } });
    const victim = actor('desk-warden', { uid: 'warden-b', awake: false });
    system.registerDamage(victim.uid, attacker.uid, 3);
    const events = runFor(system, { actors: [attacker, victim], target: target(30), world: { hasLineOfSight: () => true } }, 1.4);
    expect(system.getActorState(victim.uid)?.provokerUid).toBe(attacker.uid);
    expect(eventsOf(events, 'damage')).toContainEqual(expect.objectContaining({ sourceUid: victim.uid, targetUid: attacker.uid }));
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

  it.each([
    ['regional-director', 'open-add-shutters'],
    ['aggregate', 'sink-cover'],
    ['chief-actuary', 'arena-switch-window'],
    ['uninsurable', 'spawn-wave'],
  ] as const)('emits an authored final-phase mechanism for %s', (id, mechanism) => {
    const boss = actor(id, { health: ENEMIES[id].health * .2 });
    const result = new EnemyBehaviorSystem({ rng: () => 0 }).step({ dt: 0, actors: [boss], target: target(10) });
    expect(eventsOf(result.events, 'boss-phase')[0]).toMatchObject({ bossId: id, phaseIndex: 2 });
    expect(eventsOf(result.events, 'boss-mechanism')[0]).toMatchObject({ bossId: id, mechanism });
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
});
