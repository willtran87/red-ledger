import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type {
  ActorPlacement,
  BossId,
  CampaignMap,
  Credential,
  EnemyId,
  PickupId,
  WeaponId,
  Difficulty,
  TriggerAction,
  LandmarkDefinition,
  BreakableDefinition,
} from '../data';
import { resolveMaterialAsset, resolveSkyAsset } from '../data/tiles';
import { AssetCatalog } from './AssetCatalog';
import { ENEMIES } from './definitions';
import type { AmmoType } from './definitions';

export interface RuntimeActor {
  uid: string;
  kind: 'enemy' | 'boss';
  id: EnemyId | BossId;
  readonly authoredKey?: string;
  sprite: Sprite;
  position: Vector3;
  health: number;
  maxHealth: number;
  cooldown: number;
  awake: boolean;
  readonly authoredDormant: boolean;
  dead: boolean;
  scoreEligible: boolean;
  attackFlash: number;
  facing: number;
  animationTime: number;
  moving: boolean;
  visualKey: string;
  visualState: string;
  phaseLocked: boolean;
  encounter?: string;
  mandatory: boolean;
  route?: string;
}

export interface RuntimePickup {
  uid: string;
  kind: 'pickup' | 'weapon' | 'credential';
  id: PickupId | WeaponId | Credential;
  sprite: Sprite;
  position: Vector3;
  collected: boolean;
  counted: boolean;
  phaseLocked: boolean;
  route?: string;
  ammoDrop?: { ammoId: AmmoType; amount: number };
}

export interface SavedActorIdentity {
  readonly uid?: string;
  readonly kind?: RuntimeActor['kind'];
  readonly id?: RuntimeActor['id'];
  readonly authoredKey?: string;
}

export interface SavedPickupIdentity {
  readonly uid?: string;
  readonly collected?: boolean;
  readonly phaseLocked?: boolean;
  readonly kind?: RuntimePickup['kind'];
  readonly id?: RuntimePickup['id'];
  readonly position?: readonly [number, number, number];
}

export const isDynamicSummonUid = (uid: string): boolean => /^summoned-.+-\d+$/.test(uid);

export const savedActorMatchesRuntime = (saved: SavedActorIdentity, actor: RuntimeActor): boolean => {
  if (saved.kind === undefined || saved.id === undefined || saved.kind !== actor.kind || saved.id !== actor.id) return false;
  if (saved.uid && isDynamicSummonUid(saved.uid)) return saved.uid === actor.uid && actor.authoredKey === undefined;
  return saved.authoredKey !== undefined && saved.authoredKey === actor.authoredKey;
};

export const findMatchingRuntimeActorIdentity = (
  saved: SavedActorIdentity,
  actors: readonly RuntimeActor[],
): RuntimeActor | undefined => {
  const positional = saved.uid ? actors.find((actor) => actor.uid === saved.uid) : undefined;
  if (positional && savedActorMatchesRuntime(saved, positional)) return positional;
  const stableMatches = actors.filter((actor) => savedActorMatchesRuntime(saved, actor));
  return stableMatches.length === 1 ? stableMatches[0] : undefined;
};

export const findUniqueRuntimeActorIdentity = (
  saved: SavedActorIdentity,
  actors: readonly RuntimeActor[],
): RuntimeActor | undefined => {
  if (saved.kind === undefined || saved.id === undefined) return undefined;
  const matches = actors.filter((actor) => actor.kind === saved.kind && actor.id === saved.id);
  return matches.length === 1 ? matches[0] : undefined;
};

export const savedPickupMatchesRuntime = (saved: SavedPickupIdentity, pickup: RuntimePickup): boolean => {
  if (saved.kind === undefined || saved.id === undefined || saved.position === undefined
    || saved.kind !== pickup.kind || saved.id !== pickup.id) return false;
  return Math.hypot(
    saved.position[0] - pickup.position.x,
    saved.position[2] - pickup.position.z,
  ) <= .01;
};

export const findMatchingRuntimePickupIdentity = (
  saved: SavedPickupIdentity,
  pickups: readonly RuntimePickup[],
): RuntimePickup | undefined => {
  const positional = saved.uid ? pickups.find((pickup) => pickup.uid === saved.uid) : undefined;
  if (positional && savedPickupMatchesRuntime(saved, positional)) return positional;
  const stableMatches = pickups.filter((pickup) => savedPickupMatchesRuntime(saved, pickup));
  return stableMatches.length === 1 ? stableMatches[0] : undefined;
};

export interface AmmoDropState {
  uid: string;
  position: [number, number, number];
  ammoId: AmmoType;
  amount: number;
  collected: boolean;
}

/** Legacy saves omitted awake; unlocked actors in those saves retain the original all-awake behavior. */
export const resolveRestoredActorAwake = (savedAwake: boolean | undefined, phaseLocked: boolean): boolean =>
  savedAwake ?? !phaseLocked;

export interface RuntimeDoor {
  key: string;
  x: number;
  z: number;
  mesh: Mesh;
  credential?: Credential;
  open: boolean;
  progress: number;
  baseY: number;
}

export interface RuntimeSector {
  key: string;
  x: number;
  z: number;
  char: string;
  index: number;
  floorMesh: Group;
  floorInstance: InstancedMesh;
  floorInstanceIndex: number;
  height: number;
  targetHeight: number;
  baseHeight: number;
}

export interface SectorMoverState {
  key: string;
  height: number;
  targetHeight: number;
}

export interface MoverCompletion {
  readonly kind: 'door' | 'sector';
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly material: string;
  readonly credential?: Credential;
}

export interface RuntimeLandmark {
  key: string;
  id: string;
  tag: string;
  sprite: Sprite;
  basePosition: Vector3;
  targetPosition: Vector3;
  active: boolean;
}

export interface LandmarkState {
  key: string;
  position: [number, number, number];
  targetPosition: [number, number, number];
  active: boolean;
}

export interface RuntimeBreakable {
  key: string;
  definition: BreakableDefinition;
  sprite: Sprite;
  position: Vector3;
  health: number;
  destroyed: boolean;
}

export interface BreakableState {
  key: string;
  health: number;
  destroyed: boolean;
}

export type BossMechanismAction = 'open-add-shutters' | 'disable-left-emitter' | 'disable-right-emitter' | 'sink-cover' | 'arena-switch-ready' | 'open-binding-gate' | 'expose-core';

export interface BossMechanismState {
  readonly actions: readonly BossMechanismAction[];
  readonly bindingGates: number;
}

const THEMES = {
  1: {
    wall: '/public_runtime/textures/walls/office-drywall-gray/texture_office-drywall-gray_clean_00.png',
    floor: '/public_runtime/textures/flats/commercial-carpet-charcoal/texture_commercial-carpet-charcoal_clean_00.png',
    door: '/public_runtime/textures/doors/office-standard/door_office-standard_closed.png',
    sky: '/public_runtime/skies/sky_storm-campus.png',
    fog: 0x34383d,
  },
  2: {
    wall: '/public_runtime/textures/walls/industrial-steel/texture_industrial-steel_clean_00.png',
    floor: '/public_runtime/textures/flats/wet-asphalt/texture_wet-asphalt_clean_00.png',
    door: '/public_runtime/textures/doors/loading-bay/door_loading-bay_closed.png',
    sky: '/public_runtime/skies/sky_catastrophe-city.png',
    fog: 0x18342f,
  },
  3: {
    wall: '/public_runtime/textures/walls/litigation-stone/texture_litigation-stone_clean_00.png',
    floor: '/public_runtime/textures/flats/red-wax/texture_red-wax_clean_00.png',
    door: '/public_runtime/textures/doors/wax-gate/door_wax-gate_sealed.png',
    sky: '/public_runtime/skies/sky_actuarial-void.png',
    fog: 0x33070b,
  },
} as const;

const PICKUP_IDS: Record<PickupId, string> = {
  'staples-small': 'staples-small', 'staples-large': 'staples-large',
  'fasteners-small': 'fasteners-small', 'fasteners-large': 'fasteners-large',
  canister: 'canister-single', 'canister-crate': 'canister-crate',
  'toner-cell': 'toner-small', 'toner-pack': 'toner-large',
  'adhesive-bandage': 'bandage', 'field-medical-case': 'medical-case',
  'goodwill-token': 'goodwill-token', 'loss-control-vest': 'loss-control-vest',
  'catastrophe-suit': 'catastrophe-suit', 'emergency-reserve': 'emergency-reserve',
  'temporary-binder': 'temporary-binder', 'night-inspection-goggles': 'night-goggles',
  'hazard-endorsement': 'hazard-endorsement', 'rapid-authority': 'rapid-authority',
  'floor-plan': 'floor-plan', 'forensic-lens': 'forensic-lens',
};

// Item mastery tracks deliberate exploration rewards, mirroring the classic
// COUNTITEM distinction. Capped ammunition, recovery, and equipment remain
// useful without requiring the player to waste them just to reach 100%.
export const COUNTED_PICKUP_IDS: ReadonlySet<PickupId> = new Set([
  'temporary-binder',
  'night-inspection-goggles',
  'hazard-endorsement',
  'rapid-authority',
  'floor-plan',
  'forensic-lens',
]);

export class World {
  readonly root = new Group();
  readonly actors: RuntimeActor[] = [];
  readonly pickups: RuntimePickup[] = [];
  readonly doors = new Map<string, RuntimeDoor>();
  readonly discoveredSecrets = new Set<string>();
  readonly visitedTiles = new Set<string>();
  readonly hazardMeshes: Mesh[] = [];
  readonly sectors = new Map<string, RuntimeSector>();
  readonly landmarks = new Map<string, RuntimeLandmark>();
  readonly breakables = new Map<string, RuntimeBreakable>();
  readonly activatedMechanisms = new Set<string>();
  hazardsEnabled = true;
  map!: CampaignMap;
  episode = 1;
  private exitMarker?: Sprite;
  private summonCounter = 0;
  private dropCounter = 0;
  private readonly bossMechanismActions = new Set<BossMechanismAction>();
  private readonly secretClues = new Map<string, Sprite>();
  private readonly hazardCells: Array<{ x: number; z: number }> = [];
  private hazardBatch?: InstancedMesh;
  private readonly lineOfSightProbe = new Vector3();
  private readonly moverCompletions: MoverCompletion[] = [];
  private bindingGates = 0;
  private navigationRevision = 0;
  private lineOfSightQueries = 0;

  constructor(
    readonly scene: Scene,
    readonly camera: PerspectiveCamera,
    readonly assets: AssetCatalog,
  ) {
    scene.add(this.root);
  }

  load(map: CampaignMap, placementDifficulty: Difficulty = 'normal'): void {
    this.dispose();
    this.map = map;
    this.navigationRevision = 0;
    this.lineOfSightQueries = 0;
    this.episode = Number(map.id[1]);
    const theme = THEMES[this.episode as 1 | 2 | 3];
    this.scene.background = new Color(theme.fog);
    this.root.add(new AmbientLight(0xb7b8b4, .92));
    const key = new DirectionalLight(0xfffdf7, 1.25);
    key.position.set(-8, 12, -6);
    this.root.add(key);
    this.buildSky(resolveSkyAsset(map.sky));
    this.buildFloor();
    this.buildWalls();
    this.buildLandmarks();
    this.buildBreakables();
    this.buildSecretClues();
    this.buildExit();
    this.spawnActors(map.actors.filter((placement) => !('difficulties' in placement) || !placement.difficulties || placement.difficulties.includes(placementDifficulty)));
  }

  private buildSky(url: string): void {
    const material = new MeshBasicMaterial({ map: this.assets.texture(url), side: BackSide, fog: false });
    const sky = new Mesh(new SphereGeometry(75, 32, 12), material);
    sky.position.y = 4;
    this.root.add(sky);
  }

  private buildFloor(): void {
    const cell = this.map.cellSize;
    let index = 0;
    type Surface = { x: number; z: number; y: number; tile: CampaignMap['legend'][string]; sector?: RuntimeSector };
    const floors = new Map<string, Surface[]>();
    const ceilings = new Map<string, Surface[]>();
    for (let z = 0; z < this.map.grid.length; z += 1) {
      for (let x = 0; x < this.map.grid[z].length; x += 1) {
        const char = this.map.grid[z][x];
        const tile = this.map.legend[char];
        if (!tile || tile.solid) continue;
        const floorKey = `${tile.floorMaterial}|${tile.light}`;
        const ceilingKey = `${tile.ceilingMaterial}|${tile.light}`;
        const proxy = new Group();
        proxy.position.set((x + .5) * cell, tile.floorHeight, (z + .5) * cell);
        const sector = {
          key: `${x},${z}`, x, z, char, index: index++, floorMesh: proxy,
          floorInstance: undefined as unknown as InstancedMesh, floorInstanceIndex: -1,
          height: tile.floorHeight, targetHeight: tile.floorHeight, baseHeight: tile.floorHeight,
        };
        this.sectors.set(`${x},${z}`, sector);
        const floorGroup = floors.get(floorKey) ?? [];
        floorGroup.push({ x, z, y: tile.floorHeight, tile, sector });
        floors.set(floorKey, floorGroup);
        const ceilingGroup = ceilings.get(ceilingKey) ?? [];
        ceilingGroup.push({ x, z, y: tile.ceilingHeight, tile });
        ceilings.set(ceilingKey, ceilingGroup);
      }
    }

    const rotation = new Matrix4().makeRotationX(-Math.PI / 2);
    floors.forEach((surfaces) => {
      const tile = surfaces[0].tile;
      const mesh = new InstancedMesh(
        new PlaneGeometry(cell, cell),
        new MeshLambertMaterial({ map: this.assets.texture(resolveMaterialAsset(tile.floorMaterial), true), color: new Color(tile.light, tile.light, tile.light), side: DoubleSide }),
        surfaces.length,
      );
      surfaces.forEach((surface, instanceIndex) => {
        const matrix = rotation.clone().setPosition((surface.x + .5) * cell, surface.y, (surface.z + .5) * cell);
        mesh.setMatrixAt(instanceIndex, matrix);
        surface.sector!.floorInstance = mesh;
        surface.sector!.floorInstanceIndex = instanceIndex;
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
    });
    const ceilingRotation = new Matrix4().makeRotationX(Math.PI / 2);
    ceilings.forEach((surfaces) => {
      const tile = surfaces[0].tile;
      const mesh = new InstancedMesh(
        new PlaneGeometry(cell, cell),
        new MeshLambertMaterial({ map: this.assets.texture(resolveMaterialAsset(tile.ceilingMaterial), true), color: new Color(tile.light, tile.light, tile.light), side: DoubleSide }),
        surfaces.length,
      );
      surfaces.forEach((surface, instanceIndex) => mesh.setMatrixAt(instanceIndex,
        ceilingRotation.clone().setPosition((surface.x + .5) * cell, surface.y, (surface.z + .5) * cell)));
      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
    });

    const hazardCells: Array<{ x: number; z: number }> = [];
    for (let z = 0; z < this.map.grid.length; z += 1) {
      for (let x = 0; x < this.map.grid[z].length; x += 1) {
        if (!['h', 'w'].includes(this.map.grid[z][x])) continue;
        hazardCells.push({ x, z });
      }
    }
    if (hazardCells.length > 0) {
      const hazard = new InstancedMesh(
        new PlaneGeometry(cell * .98, cell * .98),
        new MeshBasicMaterial({ color: 0x7a1018, transparent: true, opacity: .72 }),
        hazardCells.length,
      );
      this.hazardCells.push(...hazardCells);
      this.hazardBatch = hazard;
      hazard.frustumCulled = false;
      this.syncHazardInstances();
      this.root.add(hazard);
      this.hazardMeshes.push(hazard);
    }
  }

  private buildWalls(): void {
    const cell = this.map.cellSize;
    const groups = new Map<string, Array<{ x: number; z: number; height: number; floor: number; material: string; light: number }>>();
    for (let z = 0; z < this.map.grid.length; z += 1) {
      for (let x = 0; x < this.map.grid[z].length; x += 1) {
        const char = this.map.grid[z][x];
        if ('DRYC'.includes(char)) {
          this.createDoor(x, z, char);
          continue;
        }
        if (char !== '#') continue;
        const adjacent = [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]
          .map(([nx, nz]) => this.map.legend[this.map.grid[nz]?.[nx]])
          .find((tile) => tile && !tile.solid) ?? this.map.legend['#'];
        const height = adjacent.ceilingHeight - adjacent.floorHeight;
        const key = `${adjacent.wallMaterial}|${adjacent.light}|${height}|${adjacent.floorHeight}`;
        const group = groups.get(key) ?? [];
        group.push({ x, z, height, floor: adjacent.floorHeight, material: adjacent.wallMaterial, light: adjacent.light });
        groups.set(key, group);
      }
    }
    groups.forEach((walls) => {
      const wall = walls[0];
      const mesh = new InstancedMesh(
        new BoxGeometry(cell, wall.height, cell),
        new MeshLambertMaterial({ map: this.assets.texture(resolveMaterialAsset(wall.material), true), color: new Color(wall.light, wall.light, wall.light) }),
        walls.length,
      );
      walls.forEach((item, instanceIndex) => mesh.setMatrixAt(instanceIndex,
        new Matrix4().setPosition((item.x + .5) * cell, item.floor + item.height / 2, (item.z + .5) * cell)));
      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
    });
  }

  private createDoor(x: number, z: number, char: string): void {
    const cell = this.map.cellSize;
    const tile = this.map.legend[char];
    const mesh = new Mesh(
      new BoxGeometry(cell * .9, 3.4, .28),
      new MeshLambertMaterial({ map: this.assets.texture(resolveMaterialAsset(tile.wallMaterial)), transparent: true, color: new Color(tile.light, tile.light, tile.light) }),
    );
    const baseY = this.map.legend[char]?.floorHeight ?? 0;
    mesh.position.set((x + .5) * cell, baseY + 1.7, (z + .5) * cell);
    this.root.add(mesh);
    const credential = char === 'R' ? 'red' : char === 'Y' ? 'yellow' : char === 'C' ? 'cyan' : undefined;
    this.doors.set(`${x},${z}`, { key: `${x},${z}`, x, z, mesh, credential, open: false, progress: 0, baseY });
  }

  private buildExit(): void {
    const material = new SpriteMaterial({ map: this.assets.texture(this.assets.prop('claim-terminal', 'active_00')), transparent: true });
    const marker = new Sprite(material);
    marker.center.set(.5, 0);
    marker.scale.set(1.3, 1.6, 1);
    marker.position.set(this.map.exit.x * this.map.cellSize, 0, this.map.exit.z * this.map.cellSize);
    marker.position.y = this.floorHeightAt(marker.position);
    this.root.add(marker);
    this.exitMarker = marker;
  }

  private buildLandmarks(): void {
    this.map.landmarks.forEach((definition) => {
      const sprite = new Sprite(new SpriteMaterial({ map: this.assets.texture(this.assets.prop(definition.prop)), transparent: true, alphaTest: .1 }));
      sprite.center.set(.5, 0);
      const scale = definition.scale ?? 1.65;
      sprite.scale.set(scale, scale, 1);
      sprite.position.set(definition.x * this.map.cellSize, 0, definition.z * this.map.cellSize);
      sprite.position.y = this.floorHeightAt(sprite.position);
      this.root.add(sprite);
      this.landmarks.set(definition.id, { key: definition.id, id: definition.prop, tag: definition.tag, sprite, basePosition: sprite.position.clone(), targetPosition: sprite.position.clone(), active: false });
    });
  }

  private buildBreakables(): void {
    this.map.breakables.forEach((definition) => {
      const position = new Vector3(definition.x * this.map.cellSize, 0, definition.z * this.map.cellSize);
      position.y = this.floorHeightAt(position);
      const sprite = new Sprite(new SpriteMaterial({ map: this.assets.texture(this.assets.prop(definition.prop)), transparent: true, alphaTest: .1 }));
      sprite.center.set(.5, 0);
      sprite.scale.set(1.2, 1.2, 1);
      sprite.position.copy(position);
      this.root.add(sprite);
      this.breakables.set(definition.id, { key: definition.id, definition, sprite, position, health: definition.health, destroyed: false });
    });
  }

  private buildSecretClues(): void {
    this.map.secrets.forEach((secret) => {
      const sprite = new Sprite(new SpriteMaterial({ map: this.assets.texture(this.assets.prop(secret.clueProp)), transparent: true, opacity: .7, alphaTest: .1 }));
      sprite.center.set(.5, 0);
      sprite.scale.set(.52, .52, 1);
      sprite.position.set(secret.revealAt.x * this.map.cellSize, 0, secret.revealAt.z * this.map.cellSize);
      sprite.position.y = this.floorHeightAt(sprite.position) + .03;
      sprite.userData.secretId = secret.id;
      this.root.add(sprite);
      this.secretClues.set(secret.id, sprite);
    });
  }

  private spawnActors(placements: readonly ActorPlacement[]): void {
    placements.forEach((placement, index) => {
      const position = new Vector3(placement.x * this.map.cellSize, 0, placement.z * this.map.cellSize);
      position.y = this.floorHeightAt(position);
      if (placement.type === 'enemy' || placement.type === 'boss') {
        const id = placement.type === 'enemy' ? placement.enemy : placement.boss;
        const kind = placement.type;
        const definition = ENEMIES[id];
        const material = new SpriteMaterial({ map: this.assets.texture(this.assets.actorFrame(kind, id, 'idle')), transparent: true, alphaTest: .12 });
        const sprite = new Sprite(material);
        sprite.center.set(.5, 0);
        sprite.scale.set(definition.height, definition.height, 1);
        sprite.position.copy(position);
        const phaseLocked = Boolean(placement.encounter && placement.encounter !== 'entry')
          || (this.map.id === 'E3M8' && id === 'uninsurable');
        const authoredDormant = placement.type === 'enemy' && Boolean(placement.dormant);
        const authoredKey = [kind, id, placement.encounter ?? 'entry', placement.x.toFixed(3), placement.z.toFixed(3)].join(':');
        sprite.visible = !phaseLocked;
        this.root.add(sprite);
        const facing = ({ north: Math.PI, east: -Math.PI / 2, south: 0, west: Math.PI / 2 })[placement.facing ?? 'south'];
        this.actors.push({
          uid: `${kind}-${index}`, kind, id, authoredKey, sprite, position, health: definition.health, maxHealth: definition.health,
          cooldown: 0, awake: !phaseLocked && !authoredDormant, authoredDormant, dead: false,
          scoreEligible: true, attackFlash: 0, facing, animationTime: 0, moving: false, visualKey: '', visualState: 'idle', phaseLocked,
          encounter: placement.encounter,
          mandatory: placement.type === 'enemy' ? Boolean(placement.mandatory) : true,
          route: placement.type === 'enemy' ? placement.route : placement.encounter,
        });
        return;
      }
      const id = placement.type === 'pickup' ? placement.pickup : placement.type === 'weapon' ? placement.weapon : placement.credential;
      const url = placement.type === 'pickup'
        ? this.assets.pickup(PICKUP_IDS[placement.pickup])
        : placement.type === 'weapon'
          ? this.assets.weaponPickup(placement.weapon)
          : this.assets.pickup(`credential-${placement.credential}`);
      const sprite = new Sprite(new SpriteMaterial({ map: this.assets.texture(url), transparent: true, alphaTest: .1 }));
      sprite.center.set(.5, 0);
      sprite.scale.set(.85, .85, 1);
      sprite.position.copy(position);
      const route = placement.type === 'credential' ? undefined : placement.route;
      const phaseLocked = Boolean(route && route !== 'entry' && this.map.encounters.some((encounter) => encounter.id === route));
      sprite.visible = !phaseLocked;
      this.root.add(sprite);
      this.pickups.push({
        uid: `${placement.type}-${index}`,
        kind: placement.type,
        id,
        sprite,
        position,
        collected: false,
        counted: placement.type === 'pickup' && COUNTED_PICKUP_IDS.has(placement.pickup),
        phaseLocked,
        route,
      });
    });
  }

  summonEnemy(id: EnemyId, position: Vector3, uid?: string): RuntimeActor {
    const definition = ENEMIES[id];
    const material = new SpriteMaterial({ map: this.assets.texture(this.assets.actorFrame('enemy', id, 'idle')), transparent: true, alphaTest: .12 });
    const sprite = new Sprite(material);
    sprite.center.set(.5, 0);
    sprite.scale.set(definition.height, definition.height, 1);
    const actorPosition = position.clone();
    actorPosition.y = this.floorHeightAt(actorPosition);
    sprite.position.copy(actorPosition);
    this.root.add(sprite);
    const actorUid = uid ?? `summoned-${id}-${this.summonCounter++}`;
    const restoredSequence = /^summoned-.+-(\d+)$/.exec(actorUid);
    if (restoredSequence) this.summonCounter = Math.max(this.summonCounter, Number(restoredSequence[1]) + 1);
    const actor: RuntimeActor = {
      uid: actorUid,
      kind: 'enemy',
      id,
      sprite,
      position: actorPosition,
      health: definition.health,
      maxHealth: definition.health,
      cooldown: 0,
      awake: true,
      authoredDormant: false,
      dead: false,
      scoreEligible: true,
      attackFlash: 0,
      facing: 0,
      animationTime: 0,
      moving: false,
      visualKey: '',
      visualState: 'idle',
      phaseLocked: false,
      mandatory: false,
    };
    this.actors.push(actor);
    return actor;
  }

  spawnAmmoDrop(position: Vector3, ammoId: AmmoType, amount: number, uid?: string): RuntimePickup | undefined {
    if (ammoId === 'none' || amount <= 0) return undefined;
    const pickupId: PickupId = ammoId === 'staples' ? 'staples-small'
      : ammoId === 'fasteners' ? 'fasteners-small'
        : ammoId === 'canisters' ? 'canister' : 'toner-cell';
    const dropPosition = position.clone();
    dropPosition.y = this.floorHeightAt(dropPosition);
    const sprite = new Sprite(new SpriteMaterial({ map: this.assets.texture(this.assets.pickup(PICKUP_IDS[pickupId])), transparent: true, alphaTest: .1 }));
    sprite.center.set(.5, 0);
    sprite.scale.set(.72, .72, 1);
    sprite.position.copy(dropPosition);
    this.root.add(sprite);
    const pickupUid = uid ?? `ammo-drop-${this.dropCounter++}`;
    const restoredSequence = /^ammo-drop-(\d+)$/.exec(pickupUid);
    if (restoredSequence) this.dropCounter = Math.max(this.dropCounter, Number(restoredSequence[1]) + 1);
    const pickup: RuntimePickup = {
      uid: pickupUid,
      kind: 'pickup', id: pickupId, sprite, position: dropPosition, collected: false, counted: false,
      phaseLocked: false,
      ammoDrop: { ammoId, amount },
    };
    this.pickups.push(pickup);
    return pickup;
  }

  serializeAmmoDrops(): AmmoDropState[] {
    return this.pickups.filter((pickup) => pickup.ammoDrop).map((pickup) => ({
      uid: pickup.uid,
      position: pickup.position.toArray(),
      ammoId: pickup.ammoDrop!.ammoId,
      amount: pickup.ammoDrop!.amount,
      collected: pickup.collected,
    }));
  }

  restoreAmmoDrops(states: readonly AmmoDropState[]): void {
    states.forEach((state) => {
      const pickup = this.spawnAmmoDrop(new Vector3().fromArray(state.position), state.ammoId, state.amount, state.uid);
      if (!pickup) return;
      pickup.collected = state.collected;
      pickup.sprite.visible = !state.collected;
    });
  }

  openDoor(door: RuntimeDoor, instant = false): void {
    door.open = true;
    if (instant) {
      const wasBlockingNavigation = door.progress < .72;
      door.progress = 1;
      door.mesh.position.y = door.baseY + 5.1;
      door.mesh.visible = false;
      if (wasBlockingNavigation) this.bumpNavigationTopology();
    }
  }

  updateMovers(dt: number): readonly MoverCompletion[] {
    this.moverCompletions.length = 0;
    let navigationChanged = false;
    for (const door of this.doors.values()) {
      if (!door.open || door.progress >= 1) continue;
      const wasBlockingNavigation = door.progress < .72;
      door.progress = Math.min(1, door.progress + dt * 1.25);
      door.mesh.position.y = door.baseY + 1.7 + 3.4 * door.progress;
      door.mesh.visible = door.progress < 1;
      if (wasBlockingNavigation && door.progress >= .72) navigationChanged = true;
      if (door.progress >= 1) {
        const tile = this.map.legend[this.map.grid[door.z]?.[door.x]];
        this.moverCompletions.push({
          kind: 'door',
          key: door.key,
          x: door.mesh.position.x,
          y: door.baseY,
          z: door.mesh.position.z,
          material: tile?.wallMaterial ?? '',
          ...(door.credential ? { credential: door.credential } : {}),
        });
      }
    }
    let changed = false;
    for (const sector of this.sectors.values()) {
      if (Math.abs(sector.height - sector.targetHeight) < .001) continue;
      const previousNavigationHeight = Math.round(sector.height * 20);
      const direction = Math.sign(sector.targetHeight - sector.height);
      sector.height += direction * Math.min(Math.abs(sector.targetHeight - sector.height), dt * 1.25);
      this.syncSectorFloor(sector);
      if (Math.round(sector.height * 20) !== previousNavigationHeight) navigationChanged = true;
      if (Math.abs(sector.height - sector.targetHeight) < .001) {
        this.moverCompletions.push({
          kind: 'sector',
          key: sector.key,
          x: (sector.x + .5) * this.map.cellSize,
          y: sector.height,
          z: (sector.z + .5) * this.map.cellSize,
          material: this.map.legend[sector.char]?.floorMaterial ?? '',
        });
      }
      changed = true;
    }
    if (changed) {
      this.syncHazardInstances();
    }
    for (const landmark of this.landmarks.values()) {
      const floorY = this.floorHeightAt(landmark.sprite.position);
      landmark.targetPosition.y = floorY;
      landmark.sprite.position.lerp(landmark.targetPosition, Math.min(1, dt * 2.8));
    }
    if (navigationChanged) this.bumpNavigationTopology();
    return this.moverCompletions;
  }

  restoreDoor(door: RuntimeDoor, open: boolean, progress: number): void {
    const wasBlockingNavigation = door.progress < .72;
    door.open = open;
    door.progress = Math.max(0, Math.min(1, progress));
    door.mesh.position.y = door.baseY + 1.7 + 3.4 * door.progress;
    door.mesh.visible = door.progress < 1;
    if (wasBlockingNavigation !== (door.progress < .72)) this.bumpNavigationTopology();
  }

  closestDoor(position: Vector3, maxDistance = 2.6): RuntimeDoor | undefined {
    let closest: RuntimeDoor | undefined;
    let closestDistanceSquared = maxDistance * maxDistance;
    for (const door of this.doors.values()) {
      if (door.open) continue;
      const distanceSquared = position.distanceToSquared(door.mesh.position);
      if (distanceSquared > closestDistanceSquared || (closest && distanceSquared === closestDistanceSquared)) continue;
      closest = door;
      closestDistanceSquared = distanceSquared;
    }
    return closest;
  }

  isSolid(position: Vector3, radius = .28): boolean {
    const minX = position.x - radius;
    const maxX = position.x + radius;
    const minZ = position.z - radius;
    const maxZ = position.z + radius;
    if (this.isSolidCell(minX, minZ) || this.isSolidCell(maxX, minZ)
      || this.isSolidCell(minX, maxZ) || this.isSolidCell(maxX, maxZ)) return true;
    for (const breakable of this.breakables.values()) {
      if (breakable.destroyed || !breakable.definition.blocksMovement) continue;
      const nearX = Math.abs(breakable.position.x - minX) < .48 || Math.abs(breakable.position.x - maxX) < .48;
      if (!nearX) continue;
      const nearZ = Math.abs(breakable.position.z - minZ) < .48 || Math.abs(breakable.position.z - maxZ) < .48;
      if (nearZ) return true;
    }
    return false;
  }

  floorHeightAt(position: Vector3): number {
    const x = Math.floor(position.x / this.map.cellSize);
    const z = Math.floor(position.z / this.map.cellSize);
    return this.sectors.get(`${x},${z}`)?.height ?? this.map.legend[this.map.grid[z]?.[x]]?.floorHeight ?? 0;
  }

  canTraverse(from: Vector3, to: Vector3, radius = .28, maxStep = 1.05): boolean {
    if (this.isSolid(to, radius)) return false;
    return this.floorHeightAt(to) - this.floorHeightAt(from) <= maxStep;
  }

  hasLineOfSight(from: Vector3, to: Vector3): boolean {
    this.lineOfSightQueries += 1;
    const distance = from.distanceTo(to);
    const steps = Math.ceil(distance / .45);
    const probe = this.lineOfSightProbe;
    for (let i = 1; i < steps; i += 1) {
      probe.lerpVectors(from, to, i / steps);
      if (this.isSolid(probe, .05)) return false;
    }
    return true;
  }

  tileAt(position: Vector3): string {
    const x = Math.floor(position.x / this.map.cellSize);
    const z = Math.floor(position.z / this.map.cellSize);
    return this.map.grid[z]?.[x] ?? '#';
  }

  isHazardAt(position: Vector3): boolean {
    return this.hazardDamageAt(position) > 0;
  }

  hazardDamageAt(position: Vector3): number {
    if (!this.hazardsEnabled) return 0;
    return this.map.legend[this.tileAt(position)]?.damagePerSecond ?? 0;
  }

  applyMechanism(id: string): boolean {
    const mechanism = this.map.mechanisms.find((candidate) => candidate.id === id);
    if (!mechanism) return false;
    if (this.activatedMechanisms.has(id)) return true;
    if (!mechanism.independent && mechanism.requires.some((required) => !this.activatedMechanisms.has(required))) return false;
    this.applyTransformation(mechanism.action, mechanism.id);
    this.activatedMechanisms.add(id);
    return true;
  }

  mechanismOpens(id: string): readonly string[] {
    const mechanism = this.map.mechanisms.find((candidate) => candidate.id === id);
    if (!mechanism || !this.activatedMechanisms.has(id)) return [];
    if (mechanism.independent) {
      const family = this.map.mechanisms.filter((candidate) => candidate.independent);
      if (family.some((candidate) => !this.activatedMechanisms.has(candidate.id))) return [];
      return [...new Set(family.flatMap((candidate) => candidate.opens))];
    }
    return mechanism.opens;
  }

  restoreActivatedMechanisms(ids: readonly string[]): void {
    this.activatedMechanisms.clear();
    ids.filter((id) => this.map.mechanisms.some((mechanism) => mechanism.id === id))
      .forEach((id) => this.activatedMechanisms.add(id));
  }

  revealSecret(id: string): boolean {
    const secret = this.map.secrets.find((candidate) => candidate.id === id);
    if (!secret || this.discoveredSecrets.has(id)) return false;
    this.discoveredSecrets.add(id);
    this.bumpNavigationTopology();
    const clue = this.secretClues.get(id);
    if (clue) clue.visible = false;
    return true;
  }

  restoreSecrets(ids: readonly string[]): void {
    this.discoveredSecrets.clear();
    ids.forEach((id) => {
      if (this.map.secrets.some((secret) => secret.id === id)) this.revealSecret(id);
    });
  }

  isConcealedAt(position: Vector3): boolean {
    const x = Math.floor(position.x / this.map.cellSize);
    const z = Math.floor(position.z / this.map.cellSize);
    return this.isConcealedCell(`${x},${z}`);
  }

  private isConcealedCell(key: string): boolean {
    return this.map.secrets.some((secret) => !this.discoveredSecrets.has(secret.id) && secret.concealedCells.includes(key));
  }

  unlockEncounter(id: string): number {
    let unlocked = 0;
    this.actors.filter((actor) => actor.encounter === id && actor.phaseLocked).forEach((actor) => {
      actor.phaseLocked = false;
      actor.awake = !actor.authoredDormant;
      actor.sprite.visible = true;
      unlocked += 1;
    });
    this.pickups.filter((pickup) => pickup.route === id && pickup.phaseLocked).forEach((pickup) => {
      pickup.phaseLocked = false;
      pickup.sprite.visible = !pickup.collected;
    });
    return unlocked;
  }

  applyTransformation(action: TriggerAction, mechanismId?: string): void {
    const mechanism = mechanismId
      ? this.map.mechanisms.find((candidate) => candidate.id === mechanismId)
      : this.map.mechanisms.find((candidate) => candidate.action === action);
    if (['toggle-sectors', 'drain-liquid', 'flood-liquid'].includes(action)) {
      this.hazardsEnabled = action === 'flood-liquid' ? true : action === 'drain-liquid' ? false : !this.hazardsEnabled;
      this.hazardMeshes.forEach((mesh) => { mesh.visible = this.hazardsEnabled; });
    }
    if (['move-walls', 'lower-floor', 'raise-floor', 'open-door', 'open-exit'].includes(action)) {
      const targetedDoors = mechanism?.doorTags.length
        ? [...this.doors.values()].filter((door) => mechanism.doorTags.includes(door.key))
        : [...this.doors.values()].filter((door) => !door.open && !door.credential);
      targetedDoors.forEach((door) => this.openDoor(door));
    }
    const moving = [...this.sectors.values()].filter((sector) => mechanism?.sectorTags.includes(sector.key));
    if (mechanism?.motion === 'lift') moving.forEach((sector) => { sector.targetHeight = sector.baseHeight + mechanism.travel; });
    else if (mechanism?.motion === 'sink') moving.forEach((sector) => { sector.targetHeight = sector.baseHeight - mechanism.travel; });
    else if (mechanism?.motion === 'drain') moving.forEach((sector) => { sector.targetHeight = Math.min(0, sector.baseHeight + mechanism.travel); });
    else if (mechanism?.motion === 'flood') moving.forEach((sector) => { sector.targetHeight = sector.baseHeight - mechanism.travel; });
    else if (mechanism?.motion === 'swap') moving.forEach((sector, index) => {
      sector.targetHeight = Math.abs(sector.targetHeight - sector.baseHeight) < .01
        ? sector.baseHeight + (index % 2 === 0 ? mechanism.travel : -mechanism.travel)
        : sector.baseHeight;
    });
    else if (action === 'move-walls') moving.forEach((sector) => { sector.targetHeight = 0; });
    if (action === 'blackout') {
      this.root.children.filter((child) => child instanceof AmbientLight || child instanceof DirectionalLight).forEach((light) => { light.visible = !light.visible; });
    }
    [...this.landmarks.values()].filter((landmark) => !mechanism || mechanism.landmarkTags.some((tag) => landmark.tag.startsWith(tag))).forEach((landmark, index) => {
      landmark.active = true;
      landmark.sprite.material.map = this.assets.texture(this.assets.prop(landmark.id, 'active_00'));
      landmark.sprite.material.needsUpdate = true;
      if (mechanism?.motion === 'slide-x') landmark.targetPosition.x = landmark.basePosition.x + (index % 2 === 0 ? -1 : 1) * this.map.cellSize * mechanism.travel;
      else if (mechanism?.motion === 'slide-z') landmark.targetPosition.z = landmark.basePosition.z + (index % 2 === 0 ? -1 : 1) * this.map.cellSize * mechanism.travel;
      else if (mechanism?.motion === 'swap') landmark.targetPosition.z = landmark.basePosition.z + (index % 2 === 0 ? -1 : 1) * this.map.cellSize * mechanism.travel;
      else if (action === 'blackout') landmark.sprite.material.opacity = .45;
    });
  }

  serializeSectorMovers(): SectorMoverState[] {
    return [...this.sectors.values()]
      .filter((sector) => Math.abs(sector.height - sector.baseHeight) > .001 || Math.abs(sector.targetHeight - sector.baseHeight) > .001)
      .map((sector) => ({ key: sector.key, height: sector.height, targetHeight: sector.targetHeight }));
  }

  restoreSectorMovers(states: readonly SectorMoverState[]): void {
    let navigationChanged = false;
    states.forEach((state) => {
      const sector = this.sectors.get(state.key);
      if (!sector) return;
      if (Math.round(sector.height * 20) !== Math.round(state.height * 20)) navigationChanged = true;
      sector.height = state.height;
      sector.targetHeight = state.targetHeight;
      this.syncSectorFloor(sector);
    });
    if (navigationChanged) this.bumpNavigationTopology();
  }

  private syncSectorFloor(sector: RuntimeSector): void {
    sector.floorMesh.position.y = sector.height;
    const matrix = new Matrix4().makeRotationX(-Math.PI / 2).setPosition(
      (sector.x + .5) * this.map.cellSize,
      sector.height,
      (sector.z + .5) * this.map.cellSize,
    );
    sector.floorInstance.setMatrixAt(sector.floorInstanceIndex, matrix);
    sector.floorInstance.instanceMatrix.needsUpdate = true;
  }

  private syncHazardInstances(): void {
    if (!this.hazardBatch) return;
    const cellSize = this.map.cellSize;
    const matrix = new Matrix4().makeRotationX(-Math.PI / 2);
    this.hazardCells.forEach((cell, index) => {
      const height = this.sectors.get(`${cell.x},${cell.z}`)?.height
        ?? this.map.legend[this.map.grid[cell.z]?.[cell.x]]?.floorHeight
        ?? 0;
      matrix.setPosition((cell.x + .5) * cellSize, height + .015, (cell.z + .5) * cellSize);
      this.hazardBatch!.setMatrixAt(index, matrix);
    });
    this.hazardBatch.instanceMatrix.needsUpdate = true;
  }

  closestBreakable(position: Vector3, maxDistance = 3): RuntimeBreakable | undefined {
    let closest: RuntimeBreakable | undefined;
    let closestDistanceSquared = maxDistance * maxDistance;
    for (const item of this.breakables.values()) {
      if (item.destroyed) continue;
      const distanceSquared = position.distanceToSquared(item.position);
      if (distanceSquared > closestDistanceSquared || (closest && distanceSquared === closestDistanceSquared)) continue;
      closest = item;
      closestDistanceSquared = distanceSquared;
    }
    return closest;
  }

  damageBreakable(key: string, damage: number): { destroyed: boolean; reward?: PickupId } | undefined {
    const item = this.breakables.get(key);
    if (!item || item.destroyed) return undefined;
    item.health = Math.max(0, item.health - Math.max(0, damage));
    item.sprite.material.map = this.assets.texture(this.assets.prop(item.definition.prop, item.health > 0 ? 'damaged' : 'wrecked'));
    item.sprite.material.needsUpdate = true;
    if (item.health > 0) return { destroyed: false };
    item.destroyed = true;
    item.sprite.material.opacity = .55;
    this.bumpNavigationTopology();
    return { destroyed: true, reward: item.definition.reward };
  }

  serializeBreakables(): BreakableState[] {
    return [...this.breakables.values()].map((item) => ({ key: item.key, health: item.health, destroyed: item.destroyed }));
  }

  restoreBreakables(states: readonly BreakableState[]): void {
    let navigationChanged = false;
    states.forEach((state) => {
      const item = this.breakables.get(state.key);
      if (!item) return;
      if (item.destroyed !== state.destroyed) navigationChanged = true;
      item.health = Math.max(0, state.health);
      item.destroyed = state.destroyed;
      const visual = state.destroyed ? 'wrecked' : state.health < item.definition.health ? 'damaged' : 'base';
      item.sprite.material.map = this.assets.texture(this.assets.prop(item.definition.prop, visual));
      item.sprite.material.opacity = state.destroyed ? .55 : 1;
      item.sprite.material.needsUpdate = true;
    });
    if (navigationChanged) this.bumpNavigationTopology();
  }

  get navigationTopologyRevision(): number { return this.navigationRevision; }
  get lineOfSightQueryCount(): number { return this.lineOfSightQueries; }

  private bumpNavigationTopology(): void {
    this.navigationRevision = (this.navigationRevision + 1) >>> 0;
  }

  private isSolidCell(worldX: number, worldZ: number): boolean {
    const x = Math.floor(worldX / this.map.cellSize);
    const z = Math.floor(worldZ / this.map.cellSize);
    if (z < 0 || z >= this.map.grid.length || x < 0 || x >= this.map.grid[0].length) return true;
    if (this.map.grid[z][x] === '#') return true;
    const key = `${x},${z}`;
    if (this.isConcealedCell(key)) return true;
    const door = this.doors.get(key);
    return Boolean(door && door.progress < .72);
  }

  applyBossMechanism(action: BossMechanismAction, contextId?: string): void {
    this.bossMechanismActions.add(action);
    if (action === 'open-add-shutters' && this.map.id === 'E1M8') {
      [...this.doors.values()].filter((door) => !door.credential).forEach((door) => this.openDoor(door));
      [...this.landmarks.values()].forEach((landmark, index) => {
        landmark.active = true;
        landmark.targetPosition.x = landmark.basePosition.x + (index % 2 === 0 ? -2.2 : 2.2);
      });
    } else if ((action === 'disable-left-emitter' || action === 'disable-right-emitter') && this.map.id === 'E2M8') {
      const emitters = [...this.landmarks.values()].slice(0, 2);
      const emitter = emitters[action === 'disable-left-emitter' ? 0 : 1];
      if (emitter) {
        emitter.active = true;
        emitter.sprite.material.map = this.assets.texture(this.assets.prop(emitter.id, 'wrecked'));
        emitter.sprite.material.opacity = .42;
        emitter.sprite.material.needsUpdate = true;
        emitter.targetPosition.y = emitter.basePosition.y - .7;
      }
      const side = action === 'disable-left-emitter' ? 0 : 1;
      const mapWidth = this.map.grid[0]?.length ?? 0;
      [...this.sectors.values()].filter((sector) => (sector.x < mapWidth / 2 ? 0 : 1) === side && (sector.char === 'a' || sector.char === ','))
        .forEach((sector) => { sector.targetHeight = sector.baseHeight - .65; });
    } else if (action === 'sink-cover' && this.map.id === 'E2M8') {
      [...this.sectors.values()].filter((sector) => sector.char === 'a' || sector.char === ',')
        .forEach((sector) => { sector.targetHeight = sector.baseHeight - 1.5; });
    } else if (action === 'arena-switch-ready' && this.map.id === 'E3M8') {
      [...this.landmarks.values()].slice(0, 3).forEach((landmark) => {
        landmark.active = true;
        landmark.sprite.material.map = this.assets.texture(this.assets.prop(landmark.id, 'active_00'));
        landmark.sprite.material.needsUpdate = true;
      });
    } else if (action === 'open-binding-gate' && this.map.id === 'E3M8') {
      this.bindingGates = Math.min(3, this.bindingGates + 1);
      if (contextId && this.map.mechanisms.some((mechanism) => mechanism.id === contextId)) this.applyMechanism(contextId);
      else {
        const door = [...this.doors.values()].filter((candidate) => !candidate.open)[this.bindingGates - 1];
        if (door) this.openDoor(door);
      }
    } else if (action === 'expose-core' && this.map.id === 'E3M8' && this.bindingGates >= 3) {
      const landmarkValues = [...this.landmarks.values()];
      const core = landmarkValues[landmarkValues.length - 1];
      if (core) {
        core.active = true;
        core.sprite.material.map = this.assets.texture(this.assets.prop(core.id, 'active_00'));
        core.sprite.material.needsUpdate = true;
        core.sprite.scale.multiplyScalar(1.3);
      }
    }
  }

  serializeBossMechanisms(): BossMechanismState {
    return { actions: [...this.bossMechanismActions], bindingGates: this.bindingGates };
  }

  get bindingGateCount(): number { return this.bindingGates; }
  get canExposeCore(): boolean { return this.bindingGates >= 3; }

  restoreBossMechanisms(state?: BossMechanismState): void {
    if (!state) return;
    this.bossMechanismActions.clear();
    this.bindingGates = 0;
    for (let gate = 0; gate < state.bindingGates; gate += 1) this.applyBossMechanism('open-binding-gate');
    state.actions.forEach((action) => {
      if (action !== 'open-binding-gate') this.applyBossMechanism(action);
    });
  }

  serializeLandmarks(): LandmarkState[] {
    return [...this.landmarks.values()].map((landmark) => ({
      key: landmark.key,
      position: landmark.sprite.position.toArray(),
      targetPosition: landmark.targetPosition.toArray(),
      active: landmark.active,
    }));
  }

  restoreLandmarks(states: readonly LandmarkState[]): void {
    states.forEach((state) => {
      const landmark = this.landmarks.get(state.key);
      if (!landmark) return;
      landmark.sprite.position.fromArray(state.position);
      landmark.targetPosition.fromArray(state.targetPosition);
      landmark.active = state.active;
      if (state.active) {
        landmark.sprite.material.map = this.assets.texture(this.assets.prop(landmark.id, 'active_00'));
        landmark.sprite.material.needsUpdate = true;
      }
    });
  }

  markVisited(position: Vector3): void {
    const centerX = Math.floor(position.x / this.map.cellSize);
    const centerZ = Math.floor(position.z / this.map.cellSize);
    for (let z = centerZ - 1; z <= centerZ + 1; z += 1) {
      for (let x = centerX - 1; x <= centerX + 1; x += 1) this.visitedTiles.add(`${x},${z}`);
    }
  }

  dispose(): void {
    this.root.traverse((object) => {
      const renderable = object as Mesh & Sprite;
      renderable.geometry?.dispose?.();
      const materials = Array.isArray(renderable.material) ? renderable.material : renderable.material ? [renderable.material] : [];
      materials.forEach((material) => material.dispose());
    });
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    this.actors.length = 0;
    this.pickups.length = 0;
    this.doors.clear();
    this.discoveredSecrets.clear();
    this.visitedTiles.clear();
    this.hazardMeshes.length = 0;
    this.hazardCells.length = 0;
    this.hazardBatch = undefined;
    this.moverCompletions.length = 0;
    this.sectors.clear();
    this.landmarks.clear();
    this.breakables.clear();
    this.activatedMechanisms.clear();
    this.secretClues.clear();
    this.bossMechanismActions.clear();
    this.bindingGates = 0;
    this.hazardsEnabled = true;
    this.summonCounter = 0;
    this.dropCounter = 0;
    this.exitMarker = undefined;
  }
}
