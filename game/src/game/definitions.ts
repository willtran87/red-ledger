import type { BossId, EnemyId, WeaponId } from '../data/types';

export type AmmoType = 'staples' | 'fasteners' | 'canisters' | 'toner-cells' | 'none';
export type GameDifficulty = 'orientation' | 'desk-adjuster' | 'field-adjuster' | 'catastrophe-team' | 'binding-authority';

export interface WeaponDefinition {
  id: WeaponId;
  slot: number;
  damage: number;
  damageMin: number;
  damageMax: number;
  pellets: number;
  spread: number;
  cooldown: number;
  ammo: AmmoType;
  ammoCost: number;
  range: number;
  splashDamage?: number;
  splashRadius?: number;
  raiseTime: number;
  lowerTime: number;
  recoil: number;
  idle: string;
  fire: string;
}

const weaponPath = (id: WeaponId, state: string) =>
  `/public_runtime/weapons/view/${id}/weapon_${id}_${state}.png`;

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  'claim-stamp': { id: 'claim-stamp', slot: 1, damage: 40, damageMin: 20, damageMax: 60, pellets: 1, spread: .02, cooldown: 14 / 35, ammo: 'none', ammoCost: 0, range: 2.6, raiseTime: .14, lowerTime: .11, recoil: .025, idle: weaponPath('claim-stamp', 'idle_F_00'), fire: weaponPath('claim-stamp', 'fire_F_01') },
  'staple-driver': { id: 'staple-driver', slot: 2, damage: 10, damageMin: 5, damageMax: 15, pellets: 1, spread: .018, cooldown: 7 / 35, ammo: 'staples', ammoCost: 1, range: 36, raiseTime: .14, lowerTime: .1, recoil: .018, idle: weaponPath('staple-driver', 'idle_F_00'), fire: weaponPath('staple-driver', 'fire_F_01') },
  'twin-bore-riveter': { id: 'twin-bore-riveter', slot: 3, damage: 6, damageMin: 3, damageMax: 9, pellets: 14, spread: .11, cooldown: 24 / 35, ammo: 'fasteners', ammoCost: 2, range: 24, raiseTime: .18, lowerTime: .13, recoil: .055, idle: weaponPath('twin-bore-riveter', 'idle_F_00'), fire: weaponPath('twin-bore-riveter', 'fire_F_01') },
  'audit-repeater': { id: 'audit-repeater', slot: 4, damage: 10, damageMin: 5, damageMax: 15, pellets: 1, spread: .035, cooldown: 4 / 35, ammo: 'staples', ammoCost: 1, range: 42, raiseTime: .16, lowerTime: .12, recoil: .012, idle: weaponPath('audit-repeater', 'idle_F_00'), fire: weaponPath('audit-repeater', 'fire_F_01') },
  'catastrophe-launcher': { id: 'catastrophe-launcher', slot: 5, damage: 30, damageMin: 20, damageMax: 40, pellets: 1, spread: .012, cooldown: 28 / 35, ammo: 'canisters', ammoCost: 1, range: 48, splashDamage: 128, splashRadius: 3.8, raiseTime: .2, lowerTime: .15, recoil: .075, idle: weaponPath('catastrophe-launcher', 'idle_F_00'), fire: weaponPath('catastrophe-launcher', 'fire_F_01') },
  'plasma-copier': { id: 'plasma-copier', slot: 6, damage: 22.5, damageMin: 5, damageMax: 40, pellets: 1, spread: .025, cooldown: 3 / 35, ammo: 'toner-cells', ammoCost: 1, range: 44, raiseTime: .16, lowerTime: .12, recoil: .01, idle: weaponPath('plasma-copier', 'idle_F_00'), fire: weaponPath('plasma-copier', 'fire_F_01') },
  'binding-engine': { id: 'binding-engine', slot: 7, damage: 400, damageMin: 10, damageMax: 30, pellets: 20, spread: .005, cooldown: 35 / 35, ammo: 'toner-cells', ammoCost: 40, range: 52, raiseTime: .24, lowerTime: .18, recoil: .04, idle: weaponPath('binding-engine', 'idle_F_01'), fire: weaponPath('binding-engine', 'fire_F_01') },
  'umbra-saw': { id: 'umbra-saw', slot: 8, damage: 16, damageMin: 8, damageMax: 24, pellets: 1, spread: .04, cooldown: 4 / 35, ammo: 'none', ammoCost: 0, range: 2.4, raiseTime: .16, lowerTime: .12, recoil: .02, idle: weaponPath('umbra-saw', 'idle_F_01'), fire: weaponPath('umbra-saw', 'fire_F_01') },
};

export interface EnemyDefinition {
  health: number;
  speed: number;
  damage: number;
  attackRange: number;
  cooldown: number;
  radius: number;
  height: number;
  faction: 'bureaucracy' | 'executive' | 'world-engine';
  painChance: number;
  painDuration: number;
  windup: number;
  recovery: number;
  drop?: { kind: 'ammo'; id: AmmoType; amount: number; chance: number };
}

export const ENEMIES: Record<EnemyId | BossId, EnemyDefinition> = {
  'returned-mail': { health: 30, speed: 2.6, damage: 10, attackRange: 1.6, cooldown: .8, radius: .32, height: 1.25, faction: 'bureaucracy', painChance: .7, painDuration: .18, windup: .16, recovery: .32 },
  'desk-warden': { health: 50, speed: 1.7, damage: 7, attackRange: 20, cooldown: 1.15, radius: .38, height: 1.5, faction: 'bureaucracy', painChance: .5, painDuration: .2, windup: .3, recovery: .35, drop: { kind: 'ammo', id: 'staples', amount: 5, chance: 1 } },
  'ember-clerk': { health: 60, speed: 2, damage: 8, attackRange: 15, cooldown: .9, radius: .34, height: 1.35, faction: 'bureaucracy', painChance: .58, painDuration: .22, windup: .28, recovery: .35 },
  'exposure-hound': { health: 75, speed: 3.3, damage: 12, attackRange: 1.5, cooldown: .75, radius: .44, height: 1.1, faction: 'bureaucracy', painChance: .45, painDuration: .16, windup: .32, recovery: .28 },
  'coverage-drone': { health: 50, speed: 2.4, damage: 9, attackRange: 22, cooldown: 1.25, radius: .42, height: 1.2, faction: 'bureaucracy', painChance: .6, painDuration: .16, windup: .24, recovery: .3 },
  'liability-mass': { health: 300, speed: 1.15, damage: 18, attackRange: 13, cooldown: 1.35, radius: .72, height: 1.8, faction: 'bureaucracy', painChance: .2, painDuration: .16, windup: .38, recovery: .42 },
  'denial-officer': { health: 250, speed: 1.7, damage: 13, attackRange: 25, cooldown: 1.05, radius: .45, height: 1.65, faction: 'bureaucracy', painChance: .28, painDuration: .18, windup: .48, recovery: .4 },
  subrogator: { health: 150, speed: 2.25, damage: 15, attackRange: 18, cooldown: .92, radius: .5, height: 1.7, faction: 'bureaucracy', painChance: .42, painDuration: .2, windup: .24, recovery: .3 },
  'reserve-eater': { health: 500, speed: 1.45, damage: 22, attackRange: 18, cooldown: .8, radius: .72, height: 1.9, faction: 'bureaucracy', painChance: .16, painDuration: .16, windup: .4, recovery: .45 },
  'fraud-apparition': { health: 100, speed: 2.8, damage: 16, attackRange: 2, cooldown: 1.1, radius: .42, height: 1.75, faction: 'bureaucracy', painChance: .36, painDuration: .17, windup: .15, recovery: .55 },
  'cat-model': { health: 250, speed: 1.1, damage: 24, attackRange: 24, cooldown: 1.4, radius: .8, height: 2.1, faction: 'bureaucracy', painChance: .25, painDuration: .2, windup: .45, recovery: .45 },
  'bad-faith-counsel': { health: 350, speed: 1.8, damage: 19, attackRange: 26, cooldown: .88, radius: .48, height: 1.8, faction: 'bureaucracy', painChance: .25, painDuration: .2, windup: .36, recovery: .45 },
  'regional-director': { health: 2000, speed: 1.4, damage: 28, attackRange: 28, cooldown: .72, radius: .9, height: 2.5, faction: 'executive', painChance: .08, painDuration: .12, windup: .35, recovery: .35 },
  aggregate: { health: 3000, speed: .8, damage: 32, attackRange: 30, cooldown: .66, radius: 1.15, height: 2.7, faction: 'executive', painChance: .04, painDuration: .1, windup: .32, recovery: .3 },
  'chief-actuary': { health: 2500, speed: 1.25, damage: 36, attackRange: 32, cooldown: .58, radius: .92, height: 2.7, faction: 'executive', painChance: .06, painDuration: .1, windup: .24, recovery: .25 },
  uninsurable: { health: 4000, speed: 0, damage: 42, attackRange: 36, cooldown: .7, radius: 1.4, height: 3, faction: 'world-engine', painChance: 0, painDuration: 0, windup: .4, recovery: .3 },
};

export const DIFFICULTY = {
  orientation: { enemyDamage: .5, enemySpeed: .85, aggression: .85, reaction: 1 / .85, refire: 1 / .85, projectileSpeed: .9, supply: 1.5, placement: 'easy' },
  'desk-adjuster': { enemyDamage: .75, enemySpeed: .9, aggression: .9, reaction: 1 / .9, refire: 1 / .9, projectileSpeed: .95, supply: 1.25, placement: 'easy' },
  'field-adjuster': { enemyDamage: 1, enemySpeed: 1, aggression: 1, reaction: 1, refire: 1, projectileSpeed: 1, supply: 1, placement: 'normal' },
  'catastrophe-team': { enemyDamage: 1, enemySpeed: 1, aggression: 1, reaction: 1, refire: 1, projectileSpeed: 1, supply: .8, placement: 'hard' },
  'binding-authority': { enemyDamage: 1.5, enemySpeed: 1.2, aggression: 1.25, reaction: .8, refire: .8, projectileSpeed: 1.2, supply: .65, placement: 'hard' },
} as const;
