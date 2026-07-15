import type { DamageKind } from './EnemyBehaviorSystem';

export type AuthoredEffectFamily =
  | 'binding-impact'
  | 'canister-explosion'
  | 'ceiling-impact'
  | 'ember-impact'
  | 'fraud-reveal'
  | 'generic-debris-metal'
  | 'generic-debris-paper'
  | 'generic-debris-wax'
  | 'hit-ink-large'
  | 'hit-paper'
  | 'hit-spark'
  | 'redaction-wipe'
  | 'resurrection-redaction';

export interface AuthoredEffectCue {
  readonly family: AuthoredEffectFamily;
  readonly frames: readonly string[];
  readonly size: number;
  readonly frameDuration: number;
  readonly blend: 'normal' | 'additive';
}

const standardFrames = (family: Exclude<AuthoredEffectFamily, 'hit-ink-large'>, count: number): readonly string[] =>
  Array.from({ length: count }, (_, index) => `/public_runtime/effects/${family}/fx_${family}_F_${String(index + 1).padStart(2, '0')}.png`);

const cue = (
  family: Exclude<AuthoredEffectFamily, 'hit-ink-large'>,
  count: number,
  size: number,
  frameDuration: number,
  blend: AuthoredEffectCue['blend'] = 'normal',
): AuthoredEffectCue => ({ family, frames: standardFrames(family, count), size, frameDuration, blend });

const largeInkCue = (size: number): AuthoredEffectCue => ({
  family: 'hit-ink-large',
  frames: ['impact', 'burst-01', 'burst-02', 'scatter-01', 'scatter-02', 'end']
    .map((frame) => `/public_runtime/effects/hit-ink-large/fx_hit-ink-large_${frame}.png`),
  size,
  frameDuration: .045,
  blend: 'normal',
});

export const debrisEffectFamily = (material: string): Extract<AuthoredEffectFamily,
  'generic-debris-metal' | 'generic-debris-paper' | 'generic-debris-wax'> => {
  if (['wax', 'spittle', 'ember'].includes(material)) return 'generic-debris-wax';
  if (['metal', 'glass', 'concrete', 'spark', 'debris'].includes(material)) return 'generic-debris-metal';
  return 'generic-debris-paper';
};

export const projectileResolutionEffect = (
  kind: string,
  damageKind: DamageKind,
  targetUid?: string,
): AuthoredEffectCue => {
  if (kind.includes('canister')) return cue('canister-explosion', 8, 2.25, .055);
  if (damageKind === 'redaction' || kind.includes('redaction') || kind.includes('subrogation')) {
    return cue('redaction-wipe', 4, 1.05, .05);
  }
  if (damageKind === 'hazard' || kind.includes('reserve-glob') || kind.includes('liability')) {
    return cue('generic-debris-wax', 6, .9, .05);
  }
  if (damageKind === 'fire' || kind.includes('ember')) return cue('ember-impact', 6, 1, .045, 'additive');
  if (!targetUid) return cue('ceiling-impact', 8, .8, .045);
  if (damageKind === 'toner' || kind.includes('coverage') || kind.includes('plasma')
    || kind.includes('joined-loss') || kind.includes('probability')) {
    return cue('binding-impact', 8, 1, .045);
  }
  return largeInkCue(.85);
};

export const actorDeathEffects = (
  actorId: string,
  material: string,
  redacted: boolean,
  height: number,
  boss: boolean,
): readonly AuthoredEffectCue[] => {
  const primary = redacted || actorId === 'fraud-apparition'
    ? cue('redaction-wipe', 4, height * 1.05, .055)
    : actorId === 'returned-mail' || actorId === 'bad-faith-counsel'
      ? cue('hit-paper', 4, height * .72, .045)
      : largeInkCue(height * (boss ? 1.05 : .72));
  return [primary, cue(debrisEffectFamily(material), 6, height * (boss ? .78 : .48), .055)];
};

export const fraudVisibilityEffect = (visible: boolean, height: number): AuthoredEffectCue => visible
  ? cue('fraud-reveal', 6, height * 1.08, .06)
  : cue('redaction-wipe', 4, height * .92, .05);

export const resurrectionEffect = (height: number): AuthoredEffectCue =>
  cue('resurrection-redaction', 8, height * 1.15, .065);

export const breakableDestructionEffects = (prop: string, material: string): readonly AuthoredEffectCue[] => {
  const effects: AuthoredEffectCue[] = [cue(debrisEffectFamily(material), 6, .9, .055)];
  if (['salvage-baler', 'paper-boulder', 'floating-drawer-cluster'].some((id) => prop.includes(id))) {
    effects.unshift(cue('ceiling-impact', 8, 1.45, .05));
  }
  return effects;
};
