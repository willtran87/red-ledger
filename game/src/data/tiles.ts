import type { SectorTile } from './types';

const FLAT = '/public_runtime/textures/flats';
const WALL = '/public_runtime/textures/walls';
const DOOR = '/public_runtime/textures/doors';

export const MATERIAL_ASSETS: Readonly<Record<string, string>> = {
  'floor.carpet-gray-clean': `${FLAT}/commercial-carpet-charcoal/texture_commercial-carpet-charcoal_clean_00.png`,
  'floor.carpet-red-clean': `${FLAT}/commercial-carpet-red/texture_commercial-carpet-red_clean_00.png`,
  'floor.concrete-clean': `${FLAT}/loading-plate/texture_loading-plate_clean_00.png`,
  'floor.loading-plate-clean': `${FLAT}/loading-plate/texture_loading-plate_clean_00.png`,
  'floor.hazard-stripe': `${FLAT}/loading-plate/texture_loading-plate_accent_00.png`,
  'floor.wet-asphalt-clean': `${FLAT}/wet-asphalt/texture_wet-asphalt_clean_00.png`,
  'floor.toner-sludge-01': `${FLAT}/toner-sludge/texture_toner-sludge_animated_01.png`,
  'floor.toner-sludge-02': `${FLAT}/toner-sludge/texture_toner-sludge_animated_02.png`,
  'floor.rubber-clean': `${FLAT}/commercial-carpet-charcoal/texture_commercial-carpet-charcoal_accent_00.png`,
  'floor.train-steel-clean': `${FLAT}/loading-plate/texture_loading-plate_heavy-damage_00.png`,
  'floor.data-center-clean': `${FLAT}/loading-plate/texture_loading-plate_transition_00.png`,
  'floor.litigation-stone-clean': `${FLAT}/red-wax/texture_red-wax_heavy-damage_00.png`,
  'floor.brass-calculator-clean': `${FLAT}/red-wax/texture_red-wax_accent_00.png`,
  'floor.red-wax-01': `${FLAT}/red-wax/texture_red-wax_animated_01.png`,
  'floor.red-wax-03': `${FLAT}/red-wax/texture_red-wax_animated_03.png`,
  'floor.white-void-clean': `${FLAT}/commercial-carpet-charcoal/texture_commercial-carpet-charcoal_transition_00.png`,
  'floor.probability-grid-01': `${FLAT}/red-wax/texture_red-wax_transition_00.png`,
  'ceiling.acoustic-clean': `${WALL}/acoustic-panel/texture_acoustic-panel_clean_00.png`,
  'ceiling.industrial-clean': `${WALL}/industrial-steel/texture_industrial-steel_clean_00.png`,
  'ceiling.paper-clean': `${WALL}/bone-paper/texture_bone-paper_clean_00.png`,
  'wall.drywall-gray-clean': `${WALL}/office-drywall-gray/texture_office-drywall-gray_clean_00.png`,
  'wall.parking-concrete-clean': `${WALL}/parking-concrete/texture_parking-concrete_clean_00.png`,
  'wall.industrial-steel-clean': `${WALL}/industrial-steel/texture_industrial-steel_clean_00.png`,
  'wall.flood-wall-clean': `${WALL}/flood-wall/texture_flood-wall_clean_00.png`,
  'wall.archive-cardboard-clean': `${WALL}/archive-cardboard/texture_archive-cardboard_clean_00.png`,
  'wall.corrugated-metal-clean': `${WALL}/corrugated-metal/texture_corrugated-metal_clean_00.png`,
  'wall.oxidized-pipe-clean': `${WALL}/oxidized-pipe/texture_oxidized-pipe_clean_00.png`,
  'wall.train-steel-clean': `${WALL}/train-car-steel/texture_train-car-steel_clean_00.png`,
  'wall.bone-paper-clean': `${WALL}/bone-paper/texture_bone-paper_clean_00.png`,
  'wall.compressed-paper-clean': `${WALL}/compressed-paper-stone/texture_compressed-paper-stone_clean_00.png`,
  'wall.litigation-stone-heavy': `${WALL}/litigation-stone/texture_litigation-stone_heavy-damage_00.png`,
  'wall.litigation-stone-clean': `${WALL}/litigation-stone/texture_litigation-stone_clean_00.png`,
  'wall.reserve-vault-clean': `${WALL}/reserve-vault/texture_reserve-vault_clean_00.png`,
  'wall.white-void-clean': `${WALL}/white-void-panel/texture_white-void-panel_clean_00.png`,
  'door.office-steel': `${DOOR}/office-standard/door_office-standard_closed.png`,
  'door.loading-bay': `${DOOR}/loading-bay/door_loading-bay_closed.png`,
  'door.perforated-shutter': `${DOOR}/fire-shutter/door_fire-shutter_closed.png`,
  'door.credential-red': `${DOOR}/archive-red/door_archive-red_locked.png`,
  'door.credential-yellow': `${DOOR}/executive-yellow/door_executive-yellow_locked.png`,
  'door.credential-cyan': `${DOOR}/catastrophe-cyan/door_catastrophe-cyan_locked.png`,
  'door.wax-gate': `${DOOR}/wax-gate/door_wax-gate_sealed.png`,
};

export const SKY_ASSETS: Readonly<Record<string, string>> = {
  'sky.storm-campus': '/public_runtime/skies/sky_storm-campus.png',
  'sky.catastrophe-city': '/public_runtime/skies/sky_catastrophe-city.png',
  'sky.actuarial-void': '/public_runtime/skies/sky_actuarial-void.png',
};

export const resolveMaterialAsset = (id: string): string => MATERIAL_ASSETS[id] ?? MATERIAL_ASSETS['wall.drywall-gray-clean'];
export const resolveSkyAsset = (id: string): string => SKY_ASSETS[id] ?? SKY_ASSETS['sky.storm-campus'];

const tile = (
  floorMaterial: string,
  wallMaterial: string,
  light = 0.72,
  overrides: Partial<SectorTile> = {},
): SectorTile => ({
  floorHeight: 0,
  ceilingHeight: 4,
  floorMaterial,
  ceilingMaterial: 'ceiling.acoustic-clean',
  wallMaterial,
  light,
  ...overrides,
});

const themedTile = (
  floorMaterial: string,
  wallMaterial: string,
  ceilingMaterial: string,
  light = 0.72,
  overrides: Partial<SectorTile> = {},
): SectorTile => tile(floorMaterial, wallMaterial, light, { ceilingMaterial, ...overrides });

export const EPISODE_TILESETS = {
  office: {
    '#': tile('floor.carpet-gray-clean', 'wall.drywall-gray-clean', 0.1, { solid: true }),
    '.': tile('floor.carpet-gray-clean', 'wall.drywall-gray-clean'),
    ',': tile('floor.concrete-clean', 'wall.parking-concrete-clean', 0.58),
    'a': tile('floor.carpet-red-clean', 'wall.drywall-gray-clean', 0.82, { floorHeight: 0.5, ceilingHeight: 6 }),
    'h': tile('floor.toner-sludge-01', 'wall.industrial-steel-clean', 0.46, { damagePerSecond: 8 }),
    'w': tile('floor.wet-asphalt-clean', 'wall.flood-wall-clean', 0.52),
    's': tile('floor.carpet-gray-clean', 'wall.drywall-gray-clean', 0.62, { secret: true }),
    'v': tile('floor.concrete-clean', 'wall.archive-cardboard-clean', 0.64, { floorHeight: -1, ceilingHeight: 5 }),
    'D': tile('floor.concrete-clean', 'door.office-steel', 0.68),
    'R': tile('floor.carpet-red-clean', 'door.credential-red', 0.78),
    'Y': tile('floor.hazard-stripe', 'door.credential-yellow', 0.74),
    'C': tile('floor.data-center-clean', 'door.credential-cyan', 0.7),
  },
  catastrophe: {
    '#': themedTile('floor.wet-asphalt-clean', 'wall.industrial-steel-clean', 'ceiling.industrial-clean', 0.08, { solid: true }),
    '.': themedTile('floor.wet-asphalt-clean', 'wall.corrugated-metal-clean', 'ceiling.industrial-clean', 0.5),
    ',': tile('floor.concrete-clean', 'wall.flood-wall-clean', 0.58),
    'a': tile('floor.loading-plate-clean', 'wall.corrugated-metal-clean', 0.7, { floorHeight: 0.75, ceilingHeight: 7 }),
    'h': tile('floor.toner-sludge-01', 'wall.oxidized-pipe-clean', 0.4, { damagePerSecond: 12 }),
    'w': tile('floor.wet-asphalt-clean', 'wall.flood-wall-clean', 0.42, { floorHeight: -0.75 }),
    's': tile('floor.rubber-clean', 'wall.corrugated-metal-clean', 0.52, { secret: true }),
    'v': tile('floor.train-steel-clean', 'wall.train-steel-clean', 0.48, { floorHeight: -1.5, ceilingHeight: 6 }),
    'D': tile('floor.loading-plate-clean', 'door.loading-bay', 0.62),
    'R': tile('floor.hazard-stripe', 'door.credential-red', 0.72),
    'Y': tile('floor.hazard-stripe', 'door.credential-yellow', 0.72),
    'C': tile('floor.data-center-clean', 'door.credential-cyan', 0.76),
  },
  actuarial: {
    '#': themedTile('floor.litigation-stone-clean', 'wall.bone-paper-clean', 'ceiling.paper-clean', 0.06, { solid: true }),
    '.': themedTile('floor.litigation-stone-clean', 'wall.compressed-paper-clean', 'ceiling.paper-clean', 0.48, { ceilingHeight: 5 }),
    ',': tile('floor.brass-calculator-clean', 'wall.reserve-vault-clean', 0.62),
    'a': tile('floor.red-wax-01', 'wall.bone-paper-clean', 0.74, { floorHeight: 1, ceilingHeight: 8 }),
    'h': tile('floor.red-wax-03', 'wall.litigation-stone-heavy', 0.58, { damagePerSecond: 16 }),
    'w': tile('floor.white-void-clean', 'wall.white-void-clean', 0.86, { floorHeight: -2, damagePerSecond: 20 }),
    's': tile('floor.probability-grid-01', 'wall.compressed-paper-clean', 0.68, { secret: true }),
    'v': tile('floor.toner-sludge-02', 'wall.litigation-stone-clean', 0.34, { floorHeight: -2, ceilingHeight: 7 }),
    'D': tile('floor.brass-calculator-clean', 'door.perforated-shutter', 0.62),
    'R': tile('floor.red-wax-01', 'door.wax-gate', 0.8),
    'Y': tile('floor.brass-calculator-clean', 'door.credential-yellow', 0.78),
    'C': tile('floor.probability-grid-01', 'door.credential-cyan', 0.84),
  },
} as const;
