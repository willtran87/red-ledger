import { describe, expect, it, vi } from 'vitest';
import { AdditiveBlending, NormalBlending, Sprite, SpriteMaterial, Vector3 } from 'three';
import { CAMPAIGN } from '../data';
import { VERTICAL_AUTO_AIM_RADIANS } from './CombatMath';
import { ENEMIES } from './definitions';
import {
  EnemyBehaviorSystem,
  type BehaviorActor,
  type BehaviorEvent,
  type BehaviorTarget,
} from './EnemyBehaviorSystem';
import {
  GameEngine,
  MAX_DEMO_TICKS,
  hostileSignatureTint,
  reconcileRestoredTally,
  resolveLegacyCompletedEncounters,
  resolveRestoredUnlockedEncounters,
} from './GameEngine';
import type { RuntimeActor } from './World';
import { PRE_PROFILE_E1M1_RUNTIME_FIXTURE } from './__fixtures__/runtimeCompatibilityFixtures';

const runtimeActor = (
  uid: string,
  position: Vector3,
  awake = true,
): RuntimeActor => ({
  uid,
  kind: 'enemy',
  id: 'desk-warden',
  sprite: new Sprite(new SpriteMaterial()),
  position,
  health: ENEMIES['desk-warden'].health,
  maxHealth: ENEMIES['desk-warden'].health,
  cooldown: 0,
  awake,
  authoredDormant: !awake,
  dead: false,
  scoreEligible: true,
  attackFlash: 0,
  facing: 0,
  animationTime: 0,
  moving: false,
  visualKey: '',
  visualState: 'idle',
  phaseLocked: false,
  mandatory: true,
});

const behaviorActor = (actor: RuntimeActor): BehaviorActor => ({
  uid: actor.uid,
  kind: actor.kind,
  id: actor.id,
  position: actor.position,
  health: actor.health,
  maxHealth: actor.maxHealth,
  radius: ENEMIES[actor.id].radius,
  height: ENEMIES[actor.id].height,
  faction: ENEMIES[actor.id].faction,
  awake: actor.awake,
  dead: actor.dead,
  phaseLocked: actor.phaseLocked,
});

const runBehaviorFor = (
  system: EnemyBehaviorSystem,
  actors: readonly RuntimeActor[],
  target: BehaviorTarget,
  seconds: number,
): BehaviorEvent[] => {
  const events: BehaviorEvent[] = [];
  const tick = .05;
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += tick) {
    events.push(...system.step({
      dt: Math.min(tick, seconds - elapsed),
      actors: actors.map(behaviorActor),
      target,
      world: { hasLineOfSight: () => true },
    }).events);
  }
  return events;
};

describe('long-form replay contract', () => {
  it('covers every authored map par with headroom for exploration', () => {
    const longestParTicks = Math.max(...Object.values(CAMPAIGN.maps).map((map) => map.parSeconds * 35));
    expect(MAX_DEMO_TICKS).toBe(35 * 60 * 45);
    expect(MAX_DEMO_TICKS).toBeGreaterThan(longestParTicks);
  });
});

describe('powerup combat contracts', () => {
  it('applies a cyan live-hostile signature and restores the underlying material tint', () => {
    expect(hostileSignatureTint(true, false, false)).toBe(0x47bcd1);
    expect(hostileSignatureTint(true, true, false)).toBe(0x47bcd1);
    expect(hostileSignatureTint(false, false, false)).toBe(0xffffff);
    expect(hostileSignatureTint(false, true, false)).toBe(0xc93434);
    expect(hostileSignatureTint(true, true, true)).toBe(0xc93434);
  });

  it('does not reduce incoming damage while the Forensic Lens is active', () => {
    const damagePlayer = vi.fn();
    const harness = {
      world: { actors: [] },
      player: { powerups: { forensic: 30 } },
      damagePlayer,
    };
    const applyEnemyEvent = (GameEngine.prototype as unknown as {
      applyEnemyEvent(event: BehaviorEvent, dt: number, speedScale: number, damageScale: number): void;
    }).applyEnemyEvent;
    applyEnemyEvent.call(harness, {
      type: 'damage', sourceUid: 'desk-warden-1', targetUid: 'player', amount: 20, damageKind: 'ballistic',
    }, .05, 1, 1.5);
    expect(damagePlayer).toHaveBeenCalledWith(30, 'desk-warden-1', 'ballistic');
  });

  it('restores an actual hostile material and blend mode when the Forensic Lens expires', () => {
    const actor = Object.assign(runtimeActor('redacted-warden', new Vector3()), {
      redacted: true,
      phaseLocked: true,
    });
    const harness = { player: { powerups: { forensic: 30 } } };
    const updateActorVisual = (GameEngine.prototype as unknown as {
      updateActorVisual(actor: RuntimeActor, refreshVisibility?: boolean): void;
    }).updateActorVisual;

    updateActorVisual.call(harness, actor, false);
    expect(actor.sprite.material.color.getHex()).toBe(0x47bcd1);
    expect(actor.sprite.material.blending).toBe(AdditiveBlending);

    harness.player.powerups.forensic = 0;
    updateActorVisual.call(harness, actor, false);
    expect(actor.sprite.material.color.getHex()).toBe(0xc93434);
    expect(actor.sprite.material.blending).toBe(NormalBlending);
  });
});

describe('runtime combat integration', () => {
  it('selects an elevated hostile only when the six-degree vertical auto-aim tolerance is enabled', () => {
    const elevated = runtimeActor('elevated-warden', new Vector3(0, 2.2, -10));
    const harness = {
      world: {
        actors: [elevated],
        hasLineOfSight: vi.fn(() => true),
      },
      player: { position: new Vector3(0, 1.35, 0) },
    };
    const findTarget = (GameEngine.prototype as unknown as {
      findTarget(direction: Vector3, range: number, tolerance: number): RuntimeActor | undefined;
    }).findTarget;
    const forward = new Vector3(0, 0, -1);

    expect(findTarget.call(harness, forward, 20, 0)).toBeUndefined();
    expect(findTarget.call(harness, forward, 20, VERTICAL_AUTO_AIM_RADIANS)).toBe(elevated);
    expect(harness.world.hasLineOfSight).toHaveBeenCalledWith(harness.player.position, expect.any(Vector3));
  });

  it('routes intercepted hostile fire through GameEngine damage handling and provokes retaliation', () => {
    const system = new EnemyBehaviorSystem({ rng: () => 0 });
    const attacker = runtimeActor('warden-a', new Vector3(0, 0, 0));
    const intervening = runtimeActor('warden-b', new Vector3(0, 0, 5), false);
    const actors = [attacker, intervening];
    const player: BehaviorTarget = {
      uid: 'player',
      position: { x: 0, y: 1, z: 10 },
      velocity: { x: 0, y: 0, z: 0 },
      radius: .35,
      alive: true,
    };
    const intercepted = runBehaviorFor(system, actors, player, .8)
      .filter((event): event is Extract<BehaviorEvent, { type: 'damage' }> =>
        event.type === 'damage' && event.sourceUid === attacker.uid);
    expect(intercepted.length).toBeGreaterThan(0);
    expect(intercepted.every((event) => event.targetUid === intervening.uid)).toBe(true);

    const damageActor = (GameEngine.prototype as unknown as {
      damageActor(actor: RuntimeActor, damage: number, sourceUid?: string): void;
    }).damageActor;
    const applyEnemyEvent = (GameEngine.prototype as unknown as {
      applyEnemyEvent(event: BehaviorEvent, dt: number, speedScale: number, damageScale: number): void;
    }).applyEnemyEvent;
    const harness = {
      world: { actors },
      enemyBehavior: system,
      damageActor(actor: RuntimeActor, damage: number, sourceUid?: string): void {
        damageActor.call(this, actor, damage, sourceUid);
      },
    };
    intercepted.forEach((event) => applyEnemyEvent.call(harness, event, .05, 1, 1));

    expect(intervening.awake).toBe(true);
    expect(intervening.health).toBeLessThan(intervening.maxHealth);
    const retaliation = runBehaviorFor(system, actors, player, 1.4);
    expect(system.getActorState(intervening.uid)?.provokerUid).toBe(attacker.uid);
    expect(retaliation).toContainEqual(expect.objectContaining({
      type: 'damage',
      sourceUid: intervening.uid,
      targetUid: attacker.uid,
    }));
  });
});

describe('published runtime-state compatibility', () => {
  it('recomputes tallies after incompatible positional identities are discarded', () => {
    const published = PRE_PROFILE_E1M1_RUNTIME_FIXTURE;
    expect(reconcileRestoredTally(
      published.tally,
      [{ dead: false }],
      [{ counted: true, collected: false }],
      0,
      2,
    )).toEqual({
      kills: 0,
      totalKills: 1,
      items: 0,
      totalItems: 1,
      secrets: 0,
      totalSecrets: 2,
      elapsed: 40,
    });
  });

  it('reconstructs legacy encounter unlocks from completion and mechanism evidence', () => {
    const map = CAMPAIGN.maps.E1M1;
    expect(resolveRestoredUnlockedEncounters(map, {
      triggered: ['encounter-complete:entry', 'e1m1-transformation-1'],
      mechanisms: ['e1m1-mechanism-1'],
    })).toEqual(['entry', 'transformation', 'climax']);
  });

  it('keeps the second final authority locked until all three saved binding gates opened', () => {
    const map = CAMPAIGN.maps.E3M8;
    expect(resolveRestoredUnlockedEncounters(map, {
      triggered: ['encounter-complete:boss-1'],
      bossMechanisms: { actions: [], bindingGates: 2 },
    })).not.toContain('boss-2');
    expect(resolveRestoredUnlockedEncounters(map, {
      triggered: ['encounter-complete:boss-1'],
      bossMechanisms: { actions: ['open-binding-gate'], bindingGates: 3 },
    })).toContain('boss-2');
  });

  it('uses explicit encounter state authoritatively in current saves', () => {
    expect(resolveRestoredUnlockedEncounters(CAMPAIGN.maps.E1M1, {
      unlockedEncounters: ['entry'],
      triggered: ['encounter-complete:entry', 'e1m1-transformation-1'],
      mechanisms: ['e1m1-mechanism-1'],
    })).toEqual(['entry']);
  });

  it('does not infer an independent mechanism family complete from one saved switch', () => {
    const map = CAMPAIGN.maps.E2M6;
    const independent = map.mechanisms.filter((mechanism) => mechanism.independent).map((mechanism) => mechanism.id);
    expect(independent.length).toBeGreaterThan(1);
    expect(resolveRestoredUnlockedEncounters(map, {
      triggered: [],
      mechanisms: [independent.at(-1)!],
    })).not.toContain('climax');
    expect(resolveRestoredUnlockedEncounters(map, {
      triggered: [],
      mechanisms: independent,
    })).toContain('climax');
  });

  it('preserves completed mandatory legacy phases without inventing completion for current saves', () => {
    const map = CAMPAIGN.maps.E1M1;
    const evidence = {
      triggered: ['encounter-complete:entry', 'e1m1-transformation-1'],
      mechanisms: ['e1m1-mechanism-1'],
    };
    expect(resolveLegacyCompletedEncounters(map, evidence)).toEqual(['entry', 'transformation']);
    expect(resolveLegacyCompletedEncounters(map, { ...evidence, unlockedEncounters: ['entry', 'transformation', 'climax'] })).toEqual([]);
  });
});
