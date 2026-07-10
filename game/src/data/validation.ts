import type { CampaignDefinition, CampaignMap, GridPoint, MapId } from './types';

export interface CampaignValidationIssue {
  readonly map?: MapId;
  readonly message: string;
}

const at = (map: CampaignMap, point: GridPoint): string | undefined =>
  map.grid[Math.floor(point.z)]?.[Math.floor(point.x)];

const canOccupy = (map: CampaignMap, point: GridPoint): boolean => {
  const cell = at(map, point);
  return cell !== undefined && map.legend[cell] !== undefined && !map.legend[cell].solid;
};

const exitReachable = (map: CampaignMap): boolean => {
  const key = (point: GridPoint): string => `${point.x},${point.z}`;
  const pending: GridPoint[] = [map.playerStart];
  const visited = new Set<string>([key(map.playerStart)]);

  while (pending.length > 0) {
    const current = pending.shift()!;
    if (current.x === map.exit.x && current.z === map.exit.z) return true;
    const neighbors = [
      { x: current.x + 1, z: current.z },
      { x: current.x - 1, z: current.z },
      { x: current.x, z: current.z + 1 },
      { x: current.x, z: current.z - 1 },
    ];
    neighbors.forEach((next) => {
      const nextKey = key(next);
      if (!visited.has(nextKey) && canOccupy(map, next)) {
        visited.add(nextKey);
        pending.push(next);
      }
    });
  }
  return false;
};

const reachableCells = (map: CampaignMap, start: GridPoint): Set<string> => {
  const key = (point: GridPoint): string => `${Math.floor(point.x)},${Math.floor(point.z)}`;
  const pending: GridPoint[] = [{ x: Math.floor(start.x), z: Math.floor(start.z) }];
  const visited = new Set<string>([key(start)]);
  while (pending.length) {
    const current = pending.shift()!;
    [{ x: current.x + 1, z: current.z }, { x: current.x - 1, z: current.z }, { x: current.x, z: current.z + 1 }, { x: current.x, z: current.z - 1 }]
      .forEach((next) => {
        const nextKey = key(next);
        if (!visited.has(nextKey) && canOccupy(map, next)) {
          visited.add(nextKey);
          pending.push(next);
        }
      });
  }
  return visited;
};

const macroLoopCount = (map: CampaignMap): number => {
  let vertices = 0;
  let edges = 0;
  map.grid.forEach((row, z) => [...row].forEach((_cell, x) => {
    if (!canOccupy(map, { x, z })) return;
    vertices += 1;
    if (canOccupy(map, { x: x + 1, z })) edges += 1;
    if (canOccupy(map, { x, z: z + 1 })) edges += 1;
  }));
  return Math.max(0, edges - vertices + 1);
};

const validateMap = (map: CampaignMap): CampaignValidationIssue[] => {
  const issues: CampaignValidationIssue[] = [];
  const report = (message: string): void => {
    issues.push({ map: map.id, message });
  };
  const width = map.grid[0]?.length ?? 0;

  if (map.grid.length < 8 || width < 8) report('grid is too small for a combat map');
  map.grid.forEach((row, z) => {
    if (row.length !== width) report(`row ${z} has width ${row.length}, expected ${width}`);
    [...row].forEach((cell) => {
      if (!(cell in map.legend)) report(`grid uses unknown sector symbol ${JSON.stringify(cell)}`);
    });
  });

  if (!canOccupy(map, map.playerStart)) report('player start is not on an occupiable sector');
  if (!canOccupy(map, map.exit)) report('exit is not on an occupiable sector');
  if (!exitReachable(map)) report('exit is not reachable from the player start in base geometry');
  if (macroLoopCount(map) < 1) report('map has no recoverable macro navigation loop');

  map.actors.forEach((actor, index) => {
    if (!canOccupy(map, actor)) report(`actor ${index} (${actor.type}) is outside occupiable geometry`);
  });
  const actorPositions = map.actors.map((actor) => `${actor.x.toFixed(3)},${actor.z.toFixed(3)}`);
  if (new Set(actorPositions).size !== actorPositions.length) report('two or more actors share an exact position');
  map.triggers.forEach((trigger) => {
    if (!canOccupy(map, trigger)) report(`trigger ${trigger.id} is outside occupiable geometry`);
  });
  const reachable = reachableCells(map, map.playerStart);
  const transformations = map.triggers.filter((trigger) => trigger.id.includes('-transformation-'));
  if (!transformations.length || transformations.some((trigger) => !reachable.has(`${Math.floor(trigger.x)},${Math.floor(trigger.z)}`))) {
    report('one or more signature transformations are not reachable from the base route');
  }

  const triggerIds = map.triggers.map((trigger) => trigger.id);
  if (new Set(triggerIds).size !== triggerIds.length) report('trigger ids are not unique');
  const encounterIds = map.encounters.map((encounter) => encounter.id);
  if (new Set(encounterIds).size !== encounterIds.length) report('encounter ids are not unique');
  const secretIds = map.secrets.map((secret) => secret.id);
  if (new Set(secretIds).size !== secretIds.length) report('secret ids are not unique');
  if (map.secrets.length < 2) report('map has fewer than two secrets');

  map.secrets.forEach((secret) => {
    if (!canOccupy(map, secret.at)) report(`secret ${secret.id} is outside occupiable geometry`);
    if (!map.triggers.some((trigger) => trigger.targets.includes(secret.id))) {
      report(`secret ${secret.id} has no reveal trigger`);
    }
    if (!secret.clueProp || !secret.rewardPickup) report(`secret ${secret.id} has no visible clue or concrete reward`);
    if (!map.actors.some((actor) => actor.type === 'pickup' && actor.secret && actor.pickup === secret.rewardPickup
      && Math.floor(actor.x) === Math.floor(secret.at.x) && Math.floor(actor.z) === Math.floor(secret.at.z))) {
      report(`secret ${secret.id} reward is not placed in its revealed space`);
    }
  });

  const expectedLandmarks = map.index <= 3 ? 2 : map.index <= 6 || map.index === 9 ? 3 : map.index === 7 ? 4 : 5;
  if (map.landmarks.length !== expectedLandmarks) report(`map has ${map.landmarks.length} landmarks, expected phase budget ${expectedLandmarks}`);
  map.landmarks.forEach((landmark) => {
    if (!canOccupy(map, landmark)) report(`landmark ${landmark.id} is outside occupiable geometry`);
    if (!landmark.mechanism || !map.mechanisms.some((mechanism) => mechanism.id === landmark.mechanism)) {
      report(`landmark ${landmark.id} is not tied to an authored mechanism`);
    }
  });

  if (map.breakables.length < 3) report('map has fewer than three interactive breakables');
  map.breakables.forEach((item) => {
    if (!canOccupy(map, item)) report(`breakable ${item.id} is outside occupiable geometry`);
    if (item.health <= 0) report(`breakable ${item.id} has invalid health`);
  });

  const expectedMechanisms = map.id === 'E2M6' ? 3 : map.id === 'E3M2' ? 2
    : map.index <= 3 ? 1 : map.index <= 6 || map.index === 9 ? 2 : 3;
  if (map.mechanisms.length !== expectedMechanisms) report(`map has ${map.mechanisms.length} mechanisms, expected phase budget ${expectedMechanisms}`);
  map.mechanisms.forEach((mechanism) => {
    if (!mechanism.persistState || !mechanism.restoresRoute) report(`mechanism ${mechanism.id} is not recoverable after restore`);
    const landmarkTarget = map.landmarks.some((landmark) => mechanism.landmarkTags.includes(landmark.tag));
    if (mechanism.action !== 'teleport' && mechanism.action !== 'blackout' && mechanism.sectorTags.length + mechanism.doorTags.length === 0 && !landmarkTarget) {
      report(`mechanism ${mechanism.id} has no concrete world targets`);
    }
    if (!map.triggers.some((trigger) => trigger.targets.includes(mechanism.id))) report(`mechanism ${mechanism.id} has no tagged switch`);
  });
  map.triggers.filter((trigger) => trigger.action === 'teleport').forEach((trigger) => {
    if (!trigger.destination || !canOccupy(map, trigger.destination)) report(`teleport ${trigger.id} has no explicit valid destination`);
    if (!map.triggers.some((candidate) => trigger.targets.includes(candidate.id))) report(`teleport ${trigger.id} destination id is unresolved`);
  });
  const blueprintPoints = [map.encounterBlueprint.entryAnchor, map.encounterBlueprint.transformationAnchor,
    map.encounterBlueprint.climaxAnchor, map.encounterBlueprint.rewardPocket, map.encounterBlueprint.infightingPocket]
    .filter((point): point is GridPoint => Boolean(point));
  blueprintPoints.forEach((point) => {
    if (!canOccupy(map, point)) report('encounter blueprint anchor is outside occupiable geometry');
  });

  const credentials = map.actors.filter((actor) => actor.type === 'credential').map((actor) => actor.credential);
  credentials.forEach((credential) => {
    if (!map.triggers.some((trigger) => trigger.requiresCredential === credential)) {
      report(`${credential} credential has no matching locked-route trigger`);
    }
  });

  const bosses = map.actors.filter((actor) => actor.type === 'boss');
  bosses.forEach((boss) => {
    if (!map.encounters.some((encounter) => encounter.id === boss.encounter)) {
      report(`${boss.boss} references missing encounter ${boss.encounter}`);
    }
  });

  if (!map.triggers.some((trigger) => trigger.action === 'complete-map')) report('map has no completion trigger');
  const normalEnemies = map.actors.filter((actor) => actor.type === 'enemy' && (!actor.difficulties || actor.difficulties.includes('normal'))).length;
  const minEnemies = map.index <= 3 ? 35 : map.index <= 6 || map.index === 9 ? 60 : 90;
  const maxEnemies = map.index <= 3 ? 65 : map.index <= 6 || map.index === 9 ? 110 : 160;
  if (normalEnemies < minEnemies || normalEnemies > maxEnemies) report(`normal enemy budget ${normalEnemies} is outside ${minEnemies}-${maxEnemies}`);
  if (map.parSeconds < 900 || map.parSeconds > 2100) report(`experienced par ${map.parSeconds}s is outside 15-35 minutes`);
  return issues;
};

export const validateCampaign = (campaign: CampaignDefinition): readonly CampaignValidationIssue[] => {
  const issues: CampaignValidationIssue[] = [];
  const ids = Object.keys(campaign.maps) as MapId[];
  if (ids.length !== 27) issues.push({ message: `campaign has ${ids.length} maps, expected 27` });

  campaign.episodes.forEach((episode) => {
    if (episode.maps.length !== 9) issues.push({ message: `${episode.id} has ${episode.maps.length} maps, expected 9` });
    episode.maps.forEach((id) => {
      if (!campaign.maps[id]) issues.push({ message: `${episode.id} references missing map ${id}` });
    });
  });

  ids.forEach((id) => {
    const map = campaign.maps[id];
    issues.push(...validateMap(map));
    if (map.nextMap && !campaign.maps[map.nextMap]) issues.push({ map: id, message: `next map ${map.nextMap} does not exist` });
    if (map.secretExitTo && !campaign.maps[map.secretExitTo]) issues.push({ map: id, message: `secret map ${map.secretExitTo} does not exist` });
  });

  const secretMaps = ids.filter((id) => campaign.maps[id].secretMap);
  if (secretMaps.length !== 3) issues.push({ message: `campaign has ${secretMaps.length} secret maps, expected 3` });
  const totalPar = ids.reduce((total, id) => total + campaign.maps[id].parSeconds, 0);
  if (totalPar < 6 * 3600 || totalPar > 9 * 3600) issues.push({ message: `campaign experienced par is ${(totalPar / 3600).toFixed(2)} hours, expected 6-9` });
  return issues;
};
