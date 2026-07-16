import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN,
  CAMPAIGN_ENCOUNTER_PROFILES,
  CAMPAIGN_PHASE_ENEMY_PALETTES,
  scaleEncounterPhaseBudgets,
} from '../src/data/campaign';
import type { CampaignMap, Difficulty, EncounterRole, MapId } from '../src/data/types';
import { ENEMIES } from '../src/game/definitions';
import { actorIsEnabled, cellKey } from './audit-helpers';

const phases = ['entry', 'transformation', 'climax'] as const;
const placements: readonly Difficulty[] = ['easy', 'normal', 'hard'];

const pressureFor = (map: CampaignMap, placement: Difficulty): number => map.actors.reduce((total, actor) => {
  if (actor.type === 'enemy' && actorIsEnabled(actor, placement)) {
    const enemy = ENEMIES[actor.enemy];
    return total + enemy.health * (1 + enemy.damage / 50);
  }
  if (actor.type === 'boss') {
    const enemy = ENEMIES[actor.boss];
    return total + enemy.health * (1 + enemy.damage / 50);
  }
  return total;
}, 0);

describe('authored campaign pressure profiles', () => {
  it('keeps each phase cast focused and makes adjacent phases visibly distinct', () => {
    const failures: string[] = [];
    const signatures = {
      E2: new Set(['denial-officer', 'subrogator', 'reserve-eater', 'fraud-apparition']),
      E3: new Set(['cat-model', 'bad-faith-counsel']),
    } as const;

    for (const map of Object.values(CAMPAIGN.maps)) {
      const palettes = CAMPAIGN_PHASE_ENEMY_PALETTES[map.id];
      const realizedByPhase = {} as Record<typeof phases[number], Set<string>>;
      for (const phase of phases) {
        const palette = palettes[phase];
        const realized = new Set(map.actors
          .filter((actor) => actor.type === 'enemy' && actor.route === phase && actorIsEnabled(actor, 'normal'))
          .map((actor) => actor.enemy));
        realizedByPhase[phase] = realized;
        if (new Set(palette).size !== palette.length) failures.push(`${map.id}:${phase} repeats an authored archetype`);
        if (palette.length > 6) failures.push(`${map.id}:${phase} exposes ${palette.length} archetypes`);
        if ([...realized].some((enemy) => !palette.includes(enemy))) failures.push(`${map.id}:${phase} escapes its palette`);
        if (realized.size > 6) failures.push(`${map.id}:${phase} realizes ${realized.size} archetypes`);
        const episodeSignatures = map.id.startsWith('E2') ? signatures.E2 : map.id.startsWith('E3') ? signatures.E3 : undefined;
        if (episodeSignatures && !palette.some((enemy) => episodeSignatures.has(enemy))) {
          failures.push(`${map.id}:${phase} drops its episode signature cast`);
        }
      }

      for (let index = 1; index < phases.length; index += 1) {
        const previous = new Set(palettes[phases[index - 1]]);
        const current = new Set(palettes[phases[index]]);
        const changed = [...previous].filter((enemy) => !current.has(enemy)).length
          + [...current].filter((enemy) => !previous.has(enemy)).length;
        if (changed < 2) failures.push(`${map.id}:${phases[index - 1]}->${phases[index]} changes only ${changed} archetypes`);
        const previousRealized = realizedByPhase[phases[index - 1]];
        const currentRealized = realizedByPhase[phases[index]];
        const realizedChange = [...previousRealized].filter((enemy) => !currentRealized.has(enemy)).length
          + [...currentRealized].filter((enemy) => !previousRealized.has(enemy)).length;
        if (realizedChange < 2) failures.push(`${map.id}:${phases[index - 1]}->${phases[index]} realizes only ${realizedChange} archetype changes`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('stages a readable first threat in E1M1 without crowding the spawn', () => {
    const map = CAMPAIGN.maps.E1M1;
    const opening = map.actors.find((actor) => actor.type === 'enemy' && actor.route === 'entry');
    expect(opening?.type).toBe('enemy');
    if (!opening || opening.type !== 'enemy') return;
    expect(Math.abs(opening.x - map.playerStart.x) + Math.abs(opening.z - map.playerStart.z)).toBeCloseTo(3, 5);
    expect(opening.z).toBe(map.playerStart.z);
    expect(opening.dormant).toBe(false);
    expect(opening.difficulties).toContain('normal');
  });

  it('materializes every per-phase budget, mandatory lineup, role pattern, and reward pocket', () => {
    const failures: string[] = [];

    for (const [id, profile] of Object.entries(CAMPAIGN_ENCOUNTER_PROFILES) as Array<[MapId, (typeof CAMPAIGN_ENCOUNTER_PROFILES)[MapId]]>) {
      const map = CAMPAIGN.maps[id];
      const normalBudgets = scaleEncounterPhaseBudgets(profile, map.standardEnemyBudget);
      if (profile.intent.trim().length < 24) failures.push(`${id}: pressure intent is not documented`);

      for (const phase of phases) {
        const authored = profile.phases[phase];
        const actors = map.actors.filter((actor) => actor.type === 'enemy'
          && actor.route === phase
          && actorIsEnabled(actor, 'normal'));
        if (actors.length !== normalBudgets[phase]) {
          failures.push(`${id}:${phase} realizes ${actors.length}/${normalBudgets[phase]} normal actors`);
        }

        const mandatoryRoles = actors.filter((actor) => actor.mandatory).map((actor) => actor.role);
        if (mandatoryRoles.join(',') !== authored.mandatoryRoles.join(',')) {
          failures.push(`${id}:${phase} mandatory roles ${mandatoryRoles.join('/')} do not match ${authored.mandatoryRoles.join('/')}`);
        }

        const optionalRoles = actors.filter((actor) => !actor.mandatory).map((actor) => actor.role);
        optionalRoles.forEach((role, index) => {
          const expected = authored.optionalPattern[index % authored.optionalPattern.length];
          if (role !== expected) failures.push(`${id}:${phase} optional slot ${index + 1} is ${role}, expected ${expected}`);
        });

        const expectedRoles = new Set<EncounterRole>([...authored.mandatoryRoles, ...authored.optionalPattern]);
        if (authored.reward) expectedRoles.add('reward');
        const declaredRoles = map.encounters.find((encounter) => encounter.id === phase)?.roles ?? [];
        if ([...declaredRoles].sort().join(',') !== [...expectedRoles].sort().join(',')) {
          failures.push(`${id}:${phase} encounter metadata does not describe its generated roles`);
        }
        const combatRoleCount = declaredRoles.filter((role) => role !== 'reward').length;
        if (combatRoleCount < 2 || combatRoleCount > 3) {
          failures.push(`${id}:${phase} declares ${combatRoleCount} combat roles instead of 2-3`);
        }

        if (authored.reward) {
          const rewardCell = cellKey(map.encounterBlueprint.rewardPocket);
          const hasRewardPocket = map.actors.some((actor) => actor.type === 'pickup'
            && actor.route === phase
            && cellKey(actor) === rewardCell);
          if (!hasRewardPocket) failures.push(`${id}:${phase} does not consume its authored reward role`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('scales every authored map and phase monotonically across placement difficulties', () => {
    const failures: string[] = [];

    for (const [id, profile] of Object.entries(CAMPAIGN_ENCOUNTER_PROFILES) as Array<[MapId, (typeof CAMPAIGN_ENCOUNTER_PROFILES)[MapId]]>) {
      const map = CAMPAIGN.maps[id];
      const normalTotal = map.standardEnemyBudget;
      const expectedTotals = [Math.ceil(normalTotal * .72), normalTotal, normalTotal + Math.ceil(normalTotal * .25)];
      const actualTotals = placements.map((placement) => map.actors.filter((actor) => actor.type === 'enemy'
        && actorIsEnabled(actor, placement)).length);
      if (actualTotals.join(',') !== expectedTotals.join(',')) {
        failures.push(`${id}: difficulty totals ${actualTotals.join('/')} expected ${expectedTotals.join('/')}`);
      }

      for (const phase of phases) {
        const phaseCounts = placements.map((placement) => map.actors.filter((actor) => actor.type === 'enemy'
          && actor.route === phase
          && actorIsEnabled(actor, placement)).length);
        if (!(phaseCounts[0] < phaseCounts[1] && phaseCounts[1] < phaseCounts[2])) {
          failures.push(`${id}:${phase} is not monotonic (${phaseCounts.join('/')})`);
        }
      }

      const pressures = placements.map((placement) => pressureFor(map, placement));
      if (!(pressures[0] < pressures[1] && pressures[1] < pressures[2])) {
        failures.push(`${id}: weighted pressure is not monotonic (${pressures.map(Math.round).join('/')})`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('realizes role depth, ambush facing, dormancy, and infighting pockets', () => {
    const failures: string[] = [];
    const distance = (left: { x: number; z: number }, right: { x: number; z: number }): number =>
      Math.hypot(left.x - right.x, left.z - right.z);

    for (const map of Object.values(CAMPAIGN.maps)) {
      const anchors = {
        entry: map.encounterBlueprint.entryAnchor,
        transformation: map.encounterBlueprint.transformationAnchor,
        climax: map.encounterBlueprint.climaxAnchor,
      };
      for (const phase of phases) {
        const actors = map.actors.filter((actor) => actor.type === 'enemy' && actor.route === phase);
        const roleOccurrences: Record<string, number> = {};
        actors.forEach((actor) => {
          const occurrence = roleOccurrences[actor.role!] ?? 0;
          roleOccurrences[actor.role!] = occurrence + 1;
          const shouldDormant = actor.role === 'punish' || (actor.role === 'shape' && occurrence % 3 === 2);
          if (Boolean(actor.dormant) !== shouldDormant) failures.push(`${map.id}:${phase}:${actor.role} dormancy ${occurrence}`);
          if (['anchor', 'punish'].includes(actor.role!) && actor.facing !== map.encounterBlueprint.ambushFacing) {
            failures.push(`${map.id}:${phase}:${actor.role} does not use ambush facing`);
          }
        });

        const normal = actors.filter((actor) => actorIsEnabled(actor, 'normal'));
        const anchorDistances = normal.filter((actor) => actor.role === 'anchor').map((actor) => distance(actor, anchors[phase]));
        const pocket = map.encounterBlueprint.infightingPocket;
        const deepPunishDistances = normal
          .filter((actor) => actor.role === 'punish' && (!pocket || distance(actor, pocket) > .05))
          .map((actor) => distance(actor, anchors[phase]));
        if (anchorDistances.length && deepPunishDistances.length) {
          const anchorAverage = anchorDistances.reduce((sum, value) => sum + value, 0) / anchorDistances.length;
          const punishAverage = deepPunishDistances.reduce((sum, value) => sum + value, 0) / deepPunishDistances.length;
          if (punishAverage <= anchorAverage) failures.push(`${map.id}:${phase} deep punish ${punishAverage.toFixed(2)} <= anchor ${anchorAverage.toFixed(2)}`);
        }
      }
      if (map.encounterBlueprint.infightingPocket) {
        const pocketActors = map.actors.filter((actor) => actor.type === 'enemy'
          && (actor.role === 'punish' || actor.role === 'shape')
          && distance(actor, map.encounterBlueprint.infightingPocket!) <= .05);
        if (pocketActors.length === 0) failures.push(`${map.id}: infighting pocket has no punish actor`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('rises through every unmarked main-route beat and preserves only documented relief valleys', () => {
    const failures: string[] = [];
    const reliefMaps = Object.entries(CAMPAIGN_ENCOUNTER_PROFILES)
      .filter(([, profile]) => profile.beat === 'relief')
      .map(([id]) => id);
    expect(reliefMaps).toEqual(['E2M1', 'E3M1', 'E3M5']);

    for (const episode of CAMPAIGN.episodes) {
      const route = episode.maps.filter((id) => !CAMPAIGN.maps[id].secretMap);
      route.forEach((id, index) => {
        const current = pressureFor(CAMPAIGN.maps[id], 'normal');
        const profile = CAMPAIGN_ENCOUNTER_PROFILES[id];
        const previousId = route[index - 1];
        const nextId = route[index + 1];

        if (previousId) {
          const previous = pressureFor(CAMPAIGN.maps[previousId], 'normal');
          if (profile.beat === 'relief' ? current >= previous : current <= previous) {
            failures.push(`${id}:${profile.beat} pressure ${Math.round(current)} follows ${previousId} at ${Math.round(previous)}`);
          }
        }
        if (profile.beat === 'relief' && nextId && current >= pressureFor(CAMPAIGN.maps[nextId], 'normal')) {
          failures.push(`${id}: relief valley does not rebuild at ${nextId}`);
        }
      });
    }

    expect(CAMPAIGN.episodes.map((episode) => CAMPAIGN_ENCOUNTER_PROFILES[episode.maps[7]].beat)).toEqual(['boss', 'boss', 'boss']);
    expect(CAMPAIGN.episodes.map((episode) => CAMPAIGN_ENCOUNTER_PROFILES[episode.maps[8]].beat)).toEqual(['secret', 'secret', 'secret']);
    expect(pressureFor(CAMPAIGN.maps.E2M1, 'normal')).toBeLessThan(pressureFor(CAMPAIGN.maps.E1M8, 'normal'));
    expect(pressureFor(CAMPAIGN.maps.E3M1, 'normal')).toBeLessThan(pressureFor(CAMPAIGN.maps.E2M8, 'normal'));
    expect(failures).toEqual([]);
  });

  it('does not collapse encounter declarations back to one metadata template', () => {
    const signatures = new Set(Object.values(CAMPAIGN.maps).map((map) => phases
      .map((phase) => map.encounters.find((encounter) => encounter.id === phase)?.roles.join(','))
      .join('|')));
    expect(signatures.size).toBeGreaterThanOrEqual(8);
  });
});
