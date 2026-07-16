import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/data/campaign';
import { ENEMY_BEHAVIOR_PROFILES } from '../src/game/EnemyBehaviorSystem';
import { ENEMIES, WEAPONS } from '../src/game/definitions';

interface AudioProbe {
  codec: string;
  sampleRate: number;
  channels: number;
  duration: number;
  bytes: number;
  meanDb: number;
  peakDb: number;
}

interface MusicValidation {
  id: string;
  file: string;
  sha256: string;
  motifSha256: string;
  kind: 'map' | 'ui' | 'ending';
  declaredDuration: number;
  probe: AudioProbe;
}

interface CueValidation {
  id: string;
  group: string;
  shard: string;
  start: number;
  duration: number;
  pcmSha256: string;
}

interface SfxShardValidation {
  id: string;
  file: string;
  sha256: string;
  duration: number;
  probe: AudioProbe;
  groupCount: number;
  cueCount: number;
}

interface ValidationManifest {
  musicTrackCount: number;
  mapTrackCount: number;
  distinctMapMotifs: number;
  music: MusicValidation[];
  sfx: {
    shardCount: number;
    shards: SfxShardValidation[];
    groupCount: number;
    cueCount: number;
    distinctPcmFingerprints: number;
    cues: CueValidation[];
  };
}

interface RuntimeCue { id: string; start: number; duration: number }
interface RuntimeSfxGroup { shard: string; cues: RuntimeCue[] }
interface RuntimeManifest {
  schema: number;
  provenance: string;
  music: Record<string, {
    url: string;
    title: string;
    kind: 'map' | 'ui' | 'ending';
    duration: number;
    encodedDuration: number;
    motifSha256: string;
    sha256: string;
  }>;
  sfx: {
    shardCount: number;
    groupCount: number;
    cueCount: number;
    shards: Record<string, {
      url: string;
      sha256: string;
      duration: number;
      encodedDuration: number;
      groupCount: number;
      cueCount: number;
    }>;
    groups: Record<string, RuntimeSfxGroup>;
  };
}

const root = resolve(process.cwd(), '..');
const validation = JSON.parse(readFileSync(resolve(root, 'manifests/audio-library-validation.json'), 'utf8')) as ValidationManifest;
const runtime = JSON.parse(readFileSync(resolve(root, 'assets/audio/audio-library.json'), 'utf8')) as RuntimeManifest;
const digest = (path: string): string => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
const mp3Signature = (path: string): boolean => {
  const bytes = readFileSync(resolve(root, path)).subarray(0, 3);
  return bytes.toString('ascii') === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
};

const expectedShard = (group: string): string => {
  if (group.startsWith('enemy/')) return 'actors';
  if (group.startsWith('attack/')) return 'attacks';
  if (group.startsWith('weapon/')) return 'weapons';
  if (group.startsWith('world/') || group.startsWith('ambient/') || group.startsWith('footstep/')) {
    return 'world-environment';
  }
  if (group.startsWith('player/') || group.startsWith('pickup/') || group.startsWith('ui/')) return 'player-ui';
  throw new Error(`No expected SFX shard for ${group}`);
};

const expectedGroups = (): Set<string> => {
  const groups = new Set<string>();
  Object.values(ENEMIES).forEach((enemy) => Object.values(enemy.audio).forEach((group) => groups.add(group)));
  Object.values(ENEMY_BEHAVIOR_PROFILES).forEach((profile) => profile.attacks.forEach((attack) => {
    if (!attack.audio) throw new Error(`${attack.id} is missing audio metadata`);
    groups.add(attack.audio.windup);
    groups.add(attack.audio.resolve);
  }));
  Object.values(WEAPONS).forEach((weapon) => Object.values(weapon.audio).forEach((group) => groups.add(group)));
  [
    'player/hurt', 'player/death', 'player/armor',
    'pickup/health', 'pickup/armor', 'pickup/ammo', 'pickup/weapon', 'pickup/credential', 'pickup/powerup',
    'world/door-open', 'world/door-locked', 'world/switch', 'world/lift-start', 'world/lift-end',
    'world/secret', 'world/teleport', 'world/breakable', 'world/hazard-placed', 'world/hazard-armed',
    'world/mechanism', 'world/exit', 'ui/menu-accept', 'ui/menu-back', 'ui/save', 'ui/load',
    'ui/map-clear', 'ui/status-expire', 'ui/momentum',
    'ambient/hvac', 'ambient/fluorescent', 'ambient/distant-phone', 'ambient/rain', 'ambient/pumps',
    'ambient/shelving', 'ambient/elevator-cable', 'footstep/fiber', 'footstep/concrete', 'footstep/glass',
    'footstep/water', 'footstep/metal', 'footstep/toner', 'footstep/wax', 'footstep/fluid',
  ].forEach((group) => groups.add(group));
  return groups;
};

describe('authored audio content', () => {
  it('ships the complete original music scope with distinct map motifs and valid durations', () => {
    expect(runtime.schema).toBe(2);
    expect(runtime.provenance).toContain('no sampled third-party recordings');
    expect(validation.musicTrackCount).toBe(33);
    expect(validation.mapTrackCount).toBe(27);
    expect(validation.distinctMapMotifs).toBe(27);
    expect(Object.keys(runtime.music)).toHaveLength(33);

    const mapTracks = validation.music.filter((track) => track.kind === 'map');
    expect(new Set(mapTracks.map((track) => track.id))).toEqual(new Set(Object.keys(CAMPAIGN.maps)));
    expect(new Set(mapTracks.map((track) => track.motifSha256)).size).toBe(27);
    expect(mapTracks.every((track) => track.probe.duration >= 150 && track.probe.duration <= 240)).toBe(true);
    expect(new Set(validation.music.map((track) => track.sha256)).size).toBe(33);

    for (const track of validation.music) {
      const published = runtime.music[track.id];
      expect(published, track.id).toMatchObject({
        kind: track.kind,
        duration: track.declaredDuration,
        encodedDuration: track.probe.duration,
        motifSha256: track.motifSha256,
        sha256: track.sha256,
      });
      expect(track.probe.codec).toBe('mp3');
      expect(track.probe.channels).toBe(2);
      expect(track.probe.sampleRate).toBe(22_050);
      expect(track.probe.bytes).toBeGreaterThan(500_000);
      expect(track.probe.peakDb, track.id).toBeLessThanOrEqual(0);
      expect(track.probe.meanDb, track.id).toBeGreaterThanOrEqual(-30);
      expect(track.probe.meanDb, track.id).toBeLessThanOrEqual(-14);
      expect(digest(track.file)).toBe(track.sha256);
      expect(mp3Signature(track.file)).toBe(true);
    }
  });

  it('ships 347 distinct SFX cues in five independently decodable semantic sprite shards', () => {
    expect(validation.sfx.shardCount).toBe(5);
    expect(runtime.sfx.shardCount).toBe(5);
    expect(Object.keys(runtime.sfx.shards)).toEqual([
      'actors', 'attacks', 'weapons', 'world-environment', 'player-ui',
    ]);
    expect(validation.sfx.groupCount).toBe(189);
    expect(validation.sfx.cueCount).toBe(347);
    expect(validation.sfx.distinctPcmFingerprints).toBe(347);
    expect(runtime.sfx.groupCount).toBe(189);
    expect(runtime.sfx.cueCount).toBe(347);
    expect(Object.keys(runtime.sfx.groups)).toHaveLength(189);
    expect(new Set(validation.sfx.cues.map((cue) => cue.pcmSha256)).size).toBe(347);
    expect(new Set(validation.sfx.cues.map((cue) => cue.id)).size).toBe(347);
    expect(new Set(Object.keys(runtime.sfx.groups))).toEqual(expectedGroups());

    Object.entries(runtime.sfx.groups).forEach(([group, entry]) => {
      expect(entry.shard, group).toBe(expectedShard(group));
      expect(entry.cues.length, group).toBeGreaterThan(0);
    });

    const encodedHashes = new Set<string>();
    for (const validationShard of validation.sfx.shards) {
      const published = runtime.sfx.shards[validationShard.id];
      expect(published, validationShard.id).toMatchObject({
        sha256: validationShard.sha256,
        duration: validationShard.duration,
        encodedDuration: validationShard.probe.duration,
        groupCount: validationShard.groupCount,
        cueCount: validationShard.cueCount,
      });
      expect(published.duration, validationShard.id).toBeLessThan(90);
      expect(digest(validationShard.file)).toBe(validationShard.sha256);
      expect(mp3Signature(validationShard.file)).toBe(true);
      expect(validationShard.probe).toMatchObject({ codec: 'mp3', channels: 1, sampleRate: 16_000 });
      expect(validationShard.probe.bytes).toBeGreaterThan(50_000);
      expect(validationShard.probe.peakDb).toBeLessThanOrEqual(-3);
      expect(validationShard.probe.meanDb).toBeGreaterThanOrEqual(-30);
      encodedHashes.add(validationShard.sha256);

      const shardCues = validation.sfx.cues.filter((cue) => cue.shard === validationShard.id);
      const shardGroups = Object.entries(runtime.sfx.groups)
        .filter(([_group, entry]) => entry.shard === validationShard.id);
      expect(shardCues).toHaveLength(validationShard.cueCount);
      expect(shardGroups).toHaveLength(validationShard.groupCount);
      expect(shardGroups.reduce((sum, [_group, entry]) => sum + entry.cues.length, 0)).toBe(validationShard.cueCount);

      const ordered = [...shardCues].sort((left, right) => left.start - right.start);
      ordered.forEach((cue, index) => {
        expect(cue.duration, cue.id).toBeGreaterThanOrEqual(0.09);
        expect(cue.shard, cue.id).toBe(expectedShard(cue.group));
        expect(runtime.sfx.groups[cue.group].cues, cue.id).toContainEqual({
          id: cue.id,
          start: cue.start,
          duration: cue.duration,
        });
        const next = ordered[index + 1];
        if (next) expect(next.start - (cue.start + cue.duration), cue.id).toBeGreaterThanOrEqual(0.039);
      });
      const last = ordered.at(-1)!;
      expect(last.start + last.duration).toBeLessThanOrEqual(published.duration);
      expect(published.duration).toBeLessThanOrEqual(validationShard.probe.duration + 0.01);
    }
    expect(encodedHashes.size).toBe(5);
  });

  it('owns audio references in maps, actors, attacks, and weapons', () => {
    Object.values(CAMPAIGN.maps).forEach((map) => {
      expect(runtime.music[map.music], map.id).toBeDefined();
      expect(runtime.music[map.music].kind, map.id).toBe('map');
    });
    Object.entries(ENEMIES).forEach(([id, enemy]) => {
      expect(runtime.sfx.groups[enemy.audio.idle].cues, `${id} idle`).toHaveLength(2);
      expect(runtime.sfx.groups[enemy.audio.alert].cues, `${id} alert`).toHaveLength(2);
      expect(runtime.sfx.groups[enemy.audio.pain].cues, `${id} pain`).toHaveLength(2);
      expect(runtime.sfx.groups[enemy.audio.death].cues, `${id} death`).toHaveLength(3);
      if (enemy.audio.phase) expect(runtime.sfx.groups[enemy.audio.phase].cues, `${id} phase`).toHaveLength(3);
    });
    Object.values(ENEMY_BEHAVIOR_PROFILES).forEach((profile) => profile.attacks.forEach((attack) => {
      expect(runtime.sfx.groups[attack.audio!.windup].cues, `${attack.id} windup`).toHaveLength(1);
      expect(runtime.sfx.groups[attack.audio!.resolve].cues, `${attack.id} resolve`).toHaveLength(1);
    }));
    Object.entries(WEAPONS).forEach(([id, weapon]) => {
      expect(runtime.sfx.groups[weapon.audio.fire].cues, `${id} fire`).toHaveLength(3);
      expect(runtime.sfx.groups[weapon.audio.dry].cues, `${id} dry`).toHaveLength(1);
      expect(runtime.sfx.groups[weapon.audio.impact].cues, `${id} impact`).toHaveLength(2);
    });
  });
});
