import { runtimeUrl } from './AssetCatalog';

export type AudioBus = 'music' | 'sfx';
export type EnemyCueEvent = 'idle' | 'alert' | 'windup' | 'pain' | 'attack' | 'death' | 'phase';
export type EnemyAttackCueEvent = 'windup' | 'resolve';
export type AudioVoicePriority = 'ambient' | 'routine' | 'important' | 'critical';
export type AudioPlaybackProfile = 'speakers' | 'headphones' | 'night' | 'mono';
export type WorldAudioCue =
  | 'door-open' | 'door-locked' | 'switch' | 'lift-start' | 'lift-end'
  | 'secret' | 'teleport' | 'breakable' | 'hazard-placed' | 'hazard-armed'
  | 'mechanism' | 'exit';
export type PlayerAudioCue = 'hurt' | 'death' | 'armor';
export type PickupAudioCue = 'health' | 'armor' | 'ammo' | 'weapon' | 'credential' | 'powerup';
export type UiAudioCue = 'menu-accept' | 'menu-back' | 'save' | 'load' | 'map-clear' | 'status-expire' | 'momentum';

interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  profile: AudioPlaybackProfile;
}

export interface SemanticCueOptions {
  bus?: AudioBus;
  gain?: number;
  pan?: number;
  priority?: AudioVoicePriority;
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'failed';
type PlaybackSource = 'none' | 'authored' | 'fallback';

interface AudioTrackDefinition {
  url: string;
  duration: number;
  encodedDuration?: number;
  kind?: string;
  title?: string;
}

interface AudioSpriteCueDefinition {
  id: string;
  start: number;
  duration: number;
}

interface AudioSpriteShardDefinition {
  url: string;
  duration: number;
  encodedDuration?: number;
  groupCount: number;
  cueCount: number;
}

interface AudioSpriteGroupDefinition {
  shard: string;
  cues: AudioSpriteCueDefinition[];
}

interface AuthoredAudioLibrary {
  schema: 2;
  music: Record<string, AudioTrackDefinition>;
  sfx: {
    shardCount: number;
    groupCount: number;
    cueCount: number;
    shards: Record<string, AudioSpriteShardDefinition>;
    groups: Record<string, AudioSpriteGroupDefinition>;
  };
}

interface SpatialCueDiagnostic {
  kind: string;
  pan: number;
  gain: number;
}

interface ActiveVoice {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  auxiliaryNodes: AudioNode[];
  loudness: number;
  order: number;
  priority: AudioVoicePriority;
  bus: AudioBus;
}

interface PlaybackProfileConfig {
  panScale: number;
  musicScale: number;
  sfxScale: number;
  compressorThreshold: number;
  compressorRatio: number;
}

const STORAGE_KEY = 'red-ledger-audio-v1';
const AUDIO_LIBRARY_URL = 'audio/audio-library.json';
const AUDIO_FETCH_TIMEOUT_MS = 12_000;
const AUDIO_RETRY_DELAY_MS = 3_000;
const ACTIVE_VOICE_BUDGET = 32;
const AUTHORED_SFX_GAIN = .72;
const MUSIC_FADE_SECONDS = .08;
const NOISE_BUFFER_SECONDS = 1;
const SPATIAL_CUE_HISTORY_LIMIT = 16;
const VOICE_PRIORITY_ORDER: Record<AudioVoicePriority, number> = {
  ambient: 0,
  routine: 1,
  important: 2,
  critical: 3,
};
// Cumulative caps keep eight voices available above routine feedback and four
// available exclusively to critical attack, boss, and hazard tells.
const VOICE_PRIORITY_CAPACITY: Record<AudioVoicePriority, number> = {
  ambient: 12,
  routine: 24,
  important: 28,
  critical: ACTIVE_VOICE_BUDGET,
};
const PLAYBACK_PROFILES: Record<AudioPlaybackProfile, PlaybackProfileConfig> = {
  speakers: { panScale: .78, musicScale: 1, sfxScale: 1, compressorThreshold: -18, compressorRatio: 6 },
  headphones: { panScale: 1, musicScale: .92, sfxScale: .92, compressorThreshold: -20, compressorRatio: 5 },
  night: { panScale: .62, musicScale: .62, sfxScale: .74, compressorThreshold: -30, compressorRatio: 12 },
  mono: { panScale: 0, musicScale: .9, sfxScale: .9, compressorThreshold: -22, compressorRatio: 8 },
};

const clamp = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const isPlaybackProfile = (value: unknown): value is AudioPlaybackProfile =>
  typeof value === 'string' && value in PLAYBACK_PROFILES;

const isAudioLibrary = (value: unknown): value is AuthoredAudioLibrary => {
  if (!isRecord(value) || value.schema !== 2 || !isRecord(value.music) || !isRecord(value.sfx)) return false;
  const sfx = value.sfx;
  if (!Number.isFinite(sfx.shardCount) || !Number.isFinite(sfx.groupCount)
    || !Number.isFinite(sfx.cueCount) || !isRecord(sfx.shards) || !isRecord(sfx.groups)) return false;
  const tracksValid = Object.values(value.music).every((track) => isRecord(track)
    && typeof track.url === 'string' && typeof track.duration === 'number' && Number.isFinite(track.duration) && track.duration > 0);
  const shards = sfx.shards;
  const shardsValid = Object.values(shards).every((shard) => isRecord(shard)
    && typeof shard.url === 'string' && typeof shard.duration === 'number' && Number.isFinite(shard.duration) && shard.duration > 0
    && typeof shard.groupCount === 'number' && Number.isFinite(shard.groupCount) && shard.groupCount > 0
    && typeof shard.cueCount === 'number' && Number.isFinite(shard.cueCount) && shard.cueCount > 0);
  const groups = Object.values(sfx.groups);
  const groupsValid = groups.every((group) => {
    if (!isRecord(group) || typeof group.shard !== 'string' || !(group.shard in shards)
      || !Array.isArray(group.cues) || group.cues.length === 0) return false;
    const shard = shards[group.shard];
    if (!isRecord(shard) || typeof shard.duration !== 'number') return false;
    const shardDuration = shard.duration;
    return group.cues.every((cue) => isRecord(cue) && typeof cue.id === 'string'
      && typeof cue.start === 'number' && Number.isFinite(cue.start) && cue.start >= 0
      && typeof cue.duration === 'number' && Number.isFinite(cue.duration) && cue.duration > 0
      && cue.start + cue.duration <= shardDuration + .05);
  });
  const cueCount = groups.reduce<number>((total, group) => total
    + (isRecord(group) && Array.isArray(group.cues) ? group.cues.length : 0), 0);
  return tracksValid && shardsValid && groupsValid
    && Object.keys(shards).length === sfx.shardCount
    && groups.length === sfx.groupCount
    && cueCount === sfx.cueCount;
};

export class AudioSystem {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private masterCompressor?: DynamicsCompressorNode;
  private musicGain?: GainNode;
  private sfxGain?: GainNode;
  private noiseBuffer?: AudioBuffer;
  private noiseCursor = 0;
  private activeVoices: ActiveVoice[] = [];
  private voiceOrder = 0;
  private rejectedVoices = 0;
  private lifecycleSuspended = false;

  private library?: AuthoredAudioLibrary;
  private libraryStatus: LoadStatus = 'idle';
  private spriteStatus: LoadStatus = 'idle';
  private libraryPromise?: Promise<AuthoredAudioLibrary>;
  private readonly spritePromises = new Map<string, Promise<AudioBuffer>>();
  private readonly spriteBuffers = new Map<string, AudioBuffer>();
  private libraryRetryAfter = 0;
  private readonly spriteRetryAfter = new Map<string, number>();
  private readonly groupCursors = new Map<string, number>();
  private audioError?: string;
  private lastSource: PlaybackSource = 'none';
  private authoredPlays = 0;
  private fallbackPlays = 0;

  private musicTimer?: number;
  private musicElement?: HTMLAudioElement;
  private musicMediaSource?: MediaElementAudioSourceNode;
  private musicVoiceGain?: GainNode;
  private musicPausedForLifecycle = false;
  private musicElementToken?: number;
  private musicToken = 0;
  private activatingMusicToken?: number;
  private currentTrack?: string;
  private currentTrackSource: PlaybackSource = 'none';
  private currentTrackLoop = true;
  private step = 0;
  private musicPattern: Array<number | null> = [];
  private combatIntensity = 0;
  private lastSpatialCue?: SpatialCueDiagnostic;
  private readonly spatialCueHistory: SpatialCueDiagnostic[] = [];
  private settings: AudioSettings = { master: .8, music: .65, sfx: .8, muted: false, profile: 'speakers' };

  constructor() { this.restoreSettings(); }

  get masterVolume(): number { return this.settings.master; }
  get musicVolume(): number { return this.settings.music; }
  get sfxVolume(): number { return this.settings.sfx; }
  get muted(): boolean { return this.settings.muted; }
  get playbackProfile(): AudioPlaybackProfile { return this.settings.profile; }

  unlock(): void {
    const AudioContextClass = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.context ??= new AudioContextClass();
    if (!this.masterGain) {
      this.masterGain = this.context.createGain();
      this.masterCompressor = this.context.createDynamicsCompressor();
      this.musicGain = this.context.createGain();
      this.sfxGain = this.context.createGain();
      const now = this.context.currentTime;
      this.masterCompressor.knee.setValueAtTime(12, now);
      this.masterCompressor.attack.setValueAtTime(.003, now);
      this.masterCompressor.release.setValueAtTime(.22, now);
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.masterCompressor);
      this.masterCompressor.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer();
      this.applyGainValues();
    }
    if (this.lifecycleSuspended) this.changeContextState('suspend');
    else this.resumeContext();
    this.requestLibraryLoad();
    if (this.currentTrack && this.currentTrackSource !== 'authored' && this.musicTimer === undefined) {
      void this.activateMusicRequest(this.musicToken);
    }
  }

  async prepareAuthoredAudio(): Promise<boolean> {
    this.unlock();
    if (!this.context) return false;
    try {
      const library = await this.ensureLibraryLoaded();
      await this.ensureGroupLoaded('ui/menu-accept', library);
      return true;
    } catch {
      return false;
    }
  }

  async prepareCueGroups(groups: readonly string[]): Promise<boolean> {
    this.unlock();
    if (!this.context) return false;
    try {
      const library = await this.ensureLibraryLoaded();
      const shardIds = [...new Set(groups.map((group) => library.sfx.groups[group]?.shard).filter((id): id is string => Boolean(id)))];
      if (shardIds.length === 0) return false;
      await Promise.all(shardIds.map((id) => this.ensureShardLoaded(id, library)));
      return true;
    } catch {
      return false;
    }
  }

  suspend(): void {
    this.lifecycleSuspended = true;
    if (this.musicElement && !this.musicElement.paused) {
      this.musicPausedForLifecycle = true;
      this.musicElement.pause();
    }
    this.changeContextState('suspend');
  }

  resume(): void {
    this.lifecycleSuspended = false;
    this.resumeContext();
    if (this.musicPausedForLifecycle && this.musicElement && this.currentTrackSource === 'authored') {
      this.musicPausedForLifecycle = false;
      void this.musicElement.play().catch((error) => {
        this.recordAudioError(`Track ${this.currentTrack ?? 'unknown'}: ${errorMessage(error)}`);
        if (this.currentTrack) this.startFallbackMusic(this.currentTrack);
      });
    } else if (this.currentTrack && this.currentTrackSource !== 'authored') {
      void this.activateMusicRequest(this.musicToken);
    }
  }

  setMasterVolume(value: number): void { this.settings.master = clamp(value); this.settingsChanged(); }
  setMusicVolume(value: number): void { this.settings.music = clamp(value); this.settingsChanged(); }
  setSfxVolume(value: number): void { this.settings.sfx = clamp(value); this.settingsChanged(); }
  setMuted(value: boolean): void { this.settings.muted = value; this.settingsChanged(); }
  setPlaybackProfile(value: AudioPlaybackProfile): void {
    if (!isPlaybackProfile(value) || this.settings.profile === value) return;
    this.settings.profile = value;
    this.settingsChanged();
  }

  tone(
    frequency: number,
    duration = .08,
    type: OscillatorType = 'square',
    volume = .045,
    bus: AudioBus = 'sfx',
    pan = 0,
    priority: AudioVoicePriority = 'routine',
  ): void {
    if (this.synthTone(frequency, duration, type, volume, bus, pan, priority)) this.markFallbackPlay();
  }

  noise(
    duration = .06,
    volume = .045,
    bus: AudioBus = 'sfx',
    pan = 0,
    priority: AudioVoicePriority = 'routine',
  ): void {
    if (this.synthNoise(duration, volume, bus, pan, priority)) this.markFallbackPlay();
  }

  playMusic(trackId: string, loop = true): void {
    if (this.currentTrack === trackId && this.currentTrackLoop === loop
      && (this.musicTimer !== undefined || (this.currentTrackSource === 'authored' && !this.musicElement?.paused))) return;
    this.stopMusicPlayback();
    this.currentTrack = trackId;
    this.currentTrackLoop = loop;
    this.currentTrackSource = 'none';
    const token = ++this.musicToken;
    if (this.context) void this.activateMusicRequest(token);
  }

  startMusic(episode: number, map: number): void {
    this.playMusic(`E${episode}M${map}`);
  }

  startMenuMusic(): void { this.playMusic('menu'); }
  startIntermissionMusic(): void { this.playMusic('intermission'); }
  startEndingMusic(episode: number): void {
    const safeEpisode = Number.isFinite(episode) ? Math.max(1, Math.min(3, Math.round(episode))) : 3;
    this.playMusic(`episode-${safeEpisode}-outro`);
  }
  startCreditsMusic(): void { this.playMusic('credits'); }

  setCombatIntensity(value: number): void { this.combatIntensity = clamp(value); }

  playCue(group: string, options: SemanticCueOptions = {}): boolean {
    if (!this.context || this.lifecycleSuspended) return false;
    const authored = this.playAuthoredGroup(group, options);
    if (authored) return true;
    this.requestLibraryLoad();
    return this.playGenericFallback(group, options);
  }

  weaponCue(id: string, pan = 0): void {
    if (this.playAuthoredGroup(`weapon/${id}/fire`, { pan, priority: 'important' })) {
      this.duckMusic(id === 'catastrophe-launcher' || id === 'binding-engine' ? .18 : .1);
      return;
    }
    this.requestLibraryLoad();
    const profiles: Record<string, { transient: number; body: number; tail: number; noise: number; type: OscillatorType }> = {
      'claim-stamp': { transient: 120, body: 62, tail: 48, noise: .018, type: 'square' },
      'staple-driver': { transient: 620, body: 155, tail: 92, noise: .035, type: 'square' },
      'twin-bore-riveter': { transient: 390, body: 92, tail: 58, noise: .065, type: 'sawtooth' },
      'audit-repeater': { transient: 760, body: 210, tail: 118, noise: .032, type: 'square' },
      'catastrophe-launcher': { transient: 105, body: 48, tail: 38, noise: .1, type: 'sawtooth' },
      'plasma-copier': { transient: 980, body: 330, tail: 180, noise: .025, type: 'triangle' },
      'binding-engine': { transient: 1320, body: 245, tail: 112, noise: .02, type: 'sawtooth' },
      'umbra-saw': { transient: 185, body: 74, tail: 52, noise: .07, type: 'sawtooth' },
    };
    const profile = profiles[id] ?? profiles['staple-driver'];
    let played = this.synthNoise(id === 'catastrophe-launcher' ? .11 : .045, profile.noise, 'sfx', pan, 'important');
    played = this.synthTone(profile.transient, .045, profile.type, .028, 'sfx', pan, 'important') || played;
    played = this.synthTone(profile.body, id === 'umbra-saw' ? .17 : .09, profile.type, .034, 'sfx', pan, 'important') || played;
    played = this.synthTone(profile.tail, id === 'catastrophe-launcher' ? .19 : .12, 'triangle', .018, 'sfx', pan, 'important') || played;
    if (played) this.markFallbackPlay();
    this.duckMusic(id === 'catastrophe-launcher' || id === 'binding-engine' ? .18 : .1);
  }

  weaponDryCue(id: string, pan = 0): void {
    if (!this.playAuthoredGroup(`weapon/${id}/dry`, { pan, priority: 'important' })) {
      this.requestLibraryLoad();
      if (this.synthTone(80, .06, 'square', .025, 'sfx', pan, 'important')) this.markFallbackPlay();
    }
  }

  weaponImpactCue(id: string, pan = 0, gain = 1): void {
    if (!this.playAuthoredGroup(`weapon/${id}/impact`, { pan, gain, priority: 'important' })) {
      this.requestLibraryLoad();
      const played = this.synthNoise(.045, .025 * clamp(gain), 'sfx', pan, 'important');
      if (played) this.markFallbackPlay();
    }
  }

  enemyCue(id: string, event: EnemyCueEvent, pan = 0, gain = 1): void {
    const spatialGain = clamp(gain);
    this.recordSpatialCue({ kind: `enemy:${id}:${event}`, pan, gain: spatialGain });
    const priority: AudioVoicePriority = event === 'idle'
      ? 'ambient'
      : event === 'alert' || event === 'pain' || event === 'death'
        ? 'important'
        : event === 'windup' || event === 'attack' || event === 'phase'
          ? 'critical'
          : 'routine';
    if (event !== 'windup' && event !== 'attack'
      && this.playAuthoredGroup(`enemy/${id}/${event}`, { pan, gain: spatialGain, priority })) return;
    this.requestLibraryLoad();
    let hash = 2166136261;
    for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const base = 72 + (hash >>> 0) % 210;
    const offsets: Record<EnemyCueEvent, number> = { idle: -8, alert: 80, windup: 118, pain: 46, attack: 24, death: -34, phase: 140 };
    const type: OscillatorType = (hash & 3) === 0 ? 'sawtooth' : (hash & 3) === 1 ? 'square' : (hash & 3) === 2 ? 'triangle' : 'sine';
    const duration = event === 'death' ? .22 : event === 'phase' ? .28 : event === 'windup' ? .16 : event === 'pain' ? .12 : event === 'idle' ? .16 : .09;
    const volume = (event === 'phase' ? .04 : event === 'idle' ? .012 : event === 'windup' ? .021 : .024) * spatialGain;
    let played = this.synthTone(Math.max(42, base + offsets[event]), duration, type, volume, 'sfx', pan, priority);
    if (event === 'windup') played = this.synthTone(base * 2.05, .045, 'sine', .009 * spatialGain, 'sfx', pan, priority) || played;
    if (event === 'attack' && (hash & 1) === 0) played = this.synthTone(base * 1.5, .055, 'square', .012 * spatialGain, 'sfx', pan, priority) || played;
    if (event === 'death' || event === 'pain') {
      played = this.synthNoise(event === 'death' ? .12 : .05, (event === 'death' ? .024 : .014) * spatialGain, 'sfx', pan, priority) || played;
    }
    if (played) this.markFallbackPlay();
  }

  enemyAttackCue(attackId: string, event: EnemyAttackCueEvent, pan = 0, gain = 1): void {
    const spatialGain = clamp(gain);
    this.recordSpatialCue({ kind: `attack:${attackId}:${event}`, pan, gain: spatialGain });
    if (this.playAuthoredGroup(`attack/${attackId}/${event}`, { pan, gain: spatialGain, priority: 'critical' })) return;
    this.requestLibraryLoad();
    let hash = 2166136261;
    for (const char of attackId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const base = 180 + (hash >>> 0) % 520;
    const played = this.synthTone(event === 'windup' ? base * 1.35 : base, event === 'windup' ? .16 : .1,
      event === 'windup' ? 'sine' : 'square', .026 * spatialGain, 'sfx', pan, 'critical');
    if (played) this.markFallbackPlay();
  }

  hazardCue(event: 'placed' | 'armed', pan = 0, gain = 1): void {
    const spatialGain = clamp(gain);
    this.recordSpatialCue({ kind: `hazard:${event}`, pan, gain: spatialGain });
    if (this.playAuthoredGroup(`world/hazard-${event}`, { pan, gain: spatialGain, priority: 'critical' })) return;
    this.requestLibraryLoad();
    let played: boolean;
    if (event === 'placed') {
      played = this.synthTone(176, .13, 'triangle', .018 * spatialGain, 'sfx', pan, 'critical');
      played = this.synthNoise(.055, .01 * spatialGain, 'sfx', pan, 'critical') || played;
    } else {
      played = this.synthTone(690, .09, 'square', .022 * spatialGain, 'sfx', pan, 'critical');
      played = this.synthTone(920, .07, 'sine', .012 * spatialGain, 'sfx', pan, 'critical') || played;
    }
    if (played) this.markFallbackPlay();
  }

  worldCue(event: WorldAudioCue, pan = 0, gain = 1): void {
    const priority: AudioVoicePriority = event === 'hazard-placed' || event === 'hazard-armed' ? 'critical' : 'routine';
    this.playCue(`world/${event}`, { pan, gain, priority });
  }

  playerCue(event: PlayerAudioCue, pan = 0, gain = 1): void {
    this.playCue(`player/${event}`, { pan, gain, priority: 'important' });
  }

  pickupCue(event: PickupAudioCue, pan = 0): void {
    this.playCue(`pickup/${event}`, { pan, priority: 'important' });
  }

  uiCue(event: UiAudioCue): void {
    this.playCue(`ui/${event}`, { priority: event === 'map-clear' ? 'important' : 'routine' });
  }

  diagnostics(): {
    lifecycleSuspended: boolean;
    contextState?: AudioContextState;
    activeVoices: number;
    voicesByPriority: Record<AudioVoicePriority, number>;
    rejectedVoices: number;
    musicActive?: boolean;
    libraryStatus: LoadStatus;
    spriteStatus: LoadStatus;
    libraryReady: boolean;
    spriteReady: boolean;
    source: PlaybackSource;
    track?: string;
    trackSource: PlaybackSource;
    authoredPlays: number;
    fallbackPlays: number;
    decodedTracks: number;
    loadedSfxShards: number;
    sfxShardCount: number;
    profile: AudioPlaybackProfile;
    error?: string;
    lastSpatialCue?: SpatialCueDiagnostic;
    recentSpatialCues: readonly SpatialCueDiagnostic[];
  } {
    return {
      lifecycleSuspended: this.lifecycleSuspended,
      activeVoices: this.activeVoices.length,
      voicesByPriority: this.countVoicesByPriority(),
      rejectedVoices: this.rejectedVoices,
      libraryStatus: this.libraryStatus,
      spriteStatus: this.spriteStatus,
      libraryReady: this.libraryStatus === 'ready',
      spriteReady: this.spriteBuffers.size > 0,
      source: this.lastSource,
      trackSource: this.currentTrackSource,
      authoredPlays: this.authoredPlays,
      fallbackPlays: this.fallbackPlays,
      decodedTracks: 0,
      loadedSfxShards: this.spriteBuffers.size,
      sfxShardCount: this.library ? Object.keys(this.library.sfx.shards).length : 0,
      profile: this.settings.profile,
      ...(this.context ? { contextState: this.context.state } : {}),
      ...(this.musicTimer !== undefined || (this.musicElement && !this.musicElement.paused) ? { musicActive: true } : {}),
      ...(this.currentTrack ? { track: this.currentTrack } : {}),
      ...(this.audioError ? { error: this.audioError } : {}),
      ...(this.lastSpatialCue ? { lastSpatialCue: { ...this.lastSpatialCue } } : {}),
      recentSpatialCues: this.spatialCueHistory.map((cue) => ({ ...cue })),
    };
  }

  clearSpatialDiagnostics(): void {
    this.lastSpatialCue = undefined;
    this.spatialCueHistory.length = 0;
  }

  stopMusic(): void {
    this.musicToken += 1;
    this.stopMusicPlayback();
    this.currentTrack = undefined;
    this.currentTrackSource = 'none';
    this.combatIntensity = 0;
  }

  private requestLibraryLoad(): void {
    if (this.context) void this.ensureLibraryLoaded().catch(() => undefined);
  }

  private async ensureLibraryLoaded(): Promise<AuthoredAudioLibrary> {
    if (this.library) return this.library;
    if (this.libraryPromise) return this.libraryPromise;
    if (this.libraryStatus === 'failed' && Date.now() < this.libraryRetryAfter) throw new Error('Audio library retry is cooling down');
    this.libraryStatus = 'loading';
    this.libraryPromise = (async () => {
      try {
        const response = await this.fetchAudio(AUDIO_LIBRARY_URL);
        if (!response.ok) throw new Error(`Audio library request failed (${response.status})`);
        const value: unknown = await response.json();
        if (!isAudioLibrary(value)) throw new Error('Audio library schema is invalid');
        this.library = value;
        this.libraryStatus = 'ready';
        this.libraryRetryAfter = 0;
        if (this.audioError?.startsWith('Library:')) this.audioError = undefined;
        if (this.spriteBuffers.size === 0) this.spriteStatus = 'idle';
        if (this.currentTrack && this.currentTrackSource !== 'authored' && !this.lifecycleSuspended) {
          queueMicrotask(() => void this.activateMusicRequest(this.musicToken));
        }
        return value;
      } catch (error) {
        this.libraryPromise = undefined;
        this.libraryStatus = 'failed';
        this.spriteStatus = 'failed';
        this.libraryRetryAfter = Date.now() + AUDIO_RETRY_DELAY_MS;
        this.recordAudioError(`Library: ${errorMessage(error)}`);
        throw error;
      }
    })();
    return this.libraryPromise;
  }

  private requestGroupLoad(group: string): void {
    if (!this.context) return;
    void (async () => {
      const library = this.library ?? await this.ensureLibraryLoaded();
      await this.ensureGroupLoaded(group, library);
    })().catch(() => undefined);
  }

  private async ensureGroupLoaded(group: string, library: AuthoredAudioLibrary): Promise<AudioBuffer> {
    const definition = library.sfx.groups[group];
    if (!definition) throw new Error(`Unknown authored SFX group ${group}`);
    return this.ensureShardLoaded(definition.shard, library);
  }

  private async ensureShardLoaded(shardId: string, library: AuthoredAudioLibrary): Promise<AudioBuffer> {
    const cached = this.spriteBuffers.get(shardId);
    if (cached) return cached;
    const pending = this.spritePromises.get(shardId);
    if (pending) return pending;
    if ((this.spriteRetryAfter.get(shardId) ?? 0) > Date.now()) throw new Error(`SFX shard ${shardId} retry is cooling down`);
    if (!this.context) throw new Error('Audio context is unavailable');
    const shard = library.sfx.shards[shardId];
    if (!shard) throw new Error(`Unknown authored SFX shard ${shardId}`);
    this.spriteStatus = 'loading';
    const promise = (async () => {
      try {
        const response = await this.fetchAudio(shard.url);
        if (!response.ok) throw new Error(`SFX shard request failed (${response.status})`);
        const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
        const finalCueEnd = Math.max(...Object.values(library.sfx.groups)
          .filter((group) => group.shard === shardId)
          .flatMap((group) => group.cues)
          .map((cue) => cue.start + cue.duration));
        if (buffer.duration + .05 < finalCueEnd) throw new Error('Decoded SFX shard is shorter than its cue table');
        this.spriteBuffers.set(shardId, buffer);
        this.spriteRetryAfter.delete(shardId);
        this.spriteStatus = 'ready';
        if (this.audioError?.startsWith(`SFX shard ${shardId}:`)) this.audioError = undefined;
        return buffer;
      } catch (error) {
        this.spriteRetryAfter.set(shardId, Date.now() + AUDIO_RETRY_DELAY_MS);
        this.spriteStatus = this.spriteBuffers.size > 0 ? 'ready' : 'failed';
        this.recordAudioError(`SFX shard ${shardId}: ${errorMessage(error)}`);
        throw error;
      } finally {
        this.spritePromises.delete(shardId);
      }
    })();
    this.spritePromises.set(shardId, promise);
    return promise;
  }

  private async activateMusicRequest(token: number): Promise<void> {
    const trackId = this.currentTrack;
    if (!trackId || !this.context || token !== this.musicToken || this.lifecycleSuspended
      || this.activatingMusicToken === token) return;
    this.activatingMusicToken = token;
    try {
      this.startFallbackMusic(trackId);
      const library = this.library ?? await this.ensureLibraryLoaded();
      if (token !== this.musicToken || this.currentTrack !== trackId) return;
      const track = library.music[trackId];
      if (!track) throw new Error(`Unknown authored music track ${trackId}`);
      await this.startAuthoredMusic(trackId, track, this.currentTrackLoop, token);
    } catch (error) {
      if (token === this.musicToken && this.currentTrack === trackId && !this.lifecycleSuspended) {
        this.recordAudioError(`Track ${trackId}: ${errorMessage(error)}`);
      }
      // The explicit procedural fallback remains active for this request.
    } finally {
      if (this.activatingMusicToken === token) this.activatingMusicToken = undefined;
    }
  }

  private ensureMusicElement(): HTMLAudioElement {
    if (this.musicElement) return this.musicElement;
    if (!this.context || !this.musicGain || typeof Audio === 'undefined'
      || typeof this.context.createMediaElementSource !== 'function') throw new Error('Streaming music is unavailable');
    const element = new Audio();
    element.preload = 'auto';
    element.crossOrigin = 'anonymous';
    const source = this.context.createMediaElementSource(element);
    const gain = this.context.createGain();
    source.connect(gain).connect(this.musicGain);
    this.musicElement = element;
    this.musicMediaSource = source;
    this.musicVoiceGain = gain;
    return element;
  }

  private async startAuthoredMusic(
    trackId: string,
    track: AudioTrackDefinition,
    loop: boolean,
    token: number,
  ): Promise<void> {
    if (!this.context || !this.musicGain) return;
    const element = this.ensureMusicElement();
    element.pause();
    element.loop = loop;
    element.src = runtimeUrl(track.url);
    element.currentTime = 0;
    this.musicElementToken = token;
    element.load();
    const now = this.context.currentTime;
    this.musicVoiceGain?.gain.cancelScheduledValues(now);
    this.musicVoiceGain?.gain.setValueAtTime(.0001, now);
    this.musicVoiceGain?.gain.linearRampToValueAtTime(1, now + MUSIC_FADE_SECONDS);
    const playback = element.play();
    if (playback) await playback;
    if (token !== this.musicToken || this.currentTrack !== trackId || this.lifecycleSuspended) {
      if (this.musicElementToken === token) element.pause();
      return;
    }
    this.stopFallbackMusic();
    this.currentTrackSource = 'authored';
    if (this.audioError?.startsWith(`Track ${trackId}:`)) this.audioError = undefined;
    this.markAuthoredPlay();
  }

  private startFallbackMusic(trackId: string): void {
    if (!this.context || this.musicTimer !== undefined || (this.musicElement && !this.musicElement.paused)) return;
    let state = 0x9e3779b9;
    for (const char of trackId) state = Math.imul(state ^ char.charCodeAt(0), 0x85ebca6b) >>> 0;
    const seed = state;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const episode = /^E([1-3])M/.exec(trackId)?.[1];
    const roots = [82.41, 73.42, 65.41];
    const root = roots[Math.max(0, Number(episode ?? 1) - 1)] ?? roots[0];
    const modes = [[0, 2, 3, 5, 7, 8, 10], [0, 1, 3, 5, 6, 8, 10], [0, 1, 4, 5, 7, 8, 11]];
    const mode = modes[Math.max(0, Number(episode ?? 1) - 1)] ?? modes[0];
    this.musicPattern = Array.from({ length: 512 }, (_, index) => {
      if (index % 64 < 4 || random() < .16) return null;
      const phrase = Math.floor(index / 32);
      const degree = mode[(Math.floor(random() * mode.length) + phrase + seed) % mode.length];
      return degree + (random() > .82 ? 12 : random() < .12 ? -12 : 0);
    });
    this.step = 0;
    this.currentTrackSource = 'fallback';
    this.markFallbackPlay();
    this.musicTimer = window.setInterval(() => {
      if (this.lifecycleSuspended) return;
      const note = this.musicPattern[this.step % this.musicPattern.length];
      if (note !== null) this.synthTone(root * 2 ** (note / 12), .19, this.step % 8 === 0 ? 'sawtooth' : 'square', .011, 'music', 0, 'ambient');
      if (this.step % 8 === 0) this.synthTone(root / 2 * 2 ** (((seed % 5) - 2) / 12), .38, 'triangle', .017, 'music', 0, 'ambient');
      if (this.step % 32 === 28) this.synthTone(root * 4, .06, 'square', .008, 'music', 0, 'ambient');
      if (this.combatIntensity > .15 && this.step % 4 === 0) {
        this.synthTone(root * (this.step % 8 === 0 ? 1 : 1.5), .065, episode === '2' ? 'sawtooth' : 'square', .006 + this.combatIntensity * .008, 'music', 0, 'ambient');
      }
      this.step = (this.step + 1) % this.musicPattern.length;
    }, 300);
  }

  private stopFallbackMusic(): void {
    if (this.musicTimer !== undefined) window.clearInterval(this.musicTimer);
    this.musicTimer = undefined;
    for (const voice of [...this.activeVoices]) {
      if (voice.bus === 'music') this.releaseVoice(voice, true);
    }
  }

  private stopMusicPlayback(): void {
    this.stopFallbackMusic();
    this.musicPausedForLifecycle = false;
    this.musicElementToken = undefined;
    if (this.musicElement) {
      this.musicElement.pause();
      this.musicElement.removeAttribute('src');
      this.musicElement.load();
    }
  }

  private playAuthoredGroup(group: string, options: SemanticCueOptions): boolean {
    if (!this.context || this.lifecycleSuspended) return false;
    const definition = this.library?.sfx.groups[group];
    if (!definition) {
      this.requestGroupLoad(group);
      return false;
    }
    const buffer = this.spriteBuffers.get(definition.shard);
    if (!buffer) {
      this.requestGroupLoad(group);
      return false;
    }
    const variants = definition.cues;
    const cursor = this.groupCursors.get(group) ?? 0;
    const cue = variants[cursor % variants.length];
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    const volume = AUTHORED_SFX_GAIN * clamp(options.gain ?? 1);
    const duration = Math.max(.001, Math.min(cue.duration, buffer.duration - cue.start));
    source.buffer = buffer;
    gain.gain.setValueAtTime(volume, now);
    source.connect(gain);
    const bus = options.bus ?? 'sfx';
    const auxiliaryNodes = this.connectToBus(gain, bus, options.pan ?? 0);
    if (!this.trackVoice(source, gain, volume, auxiliaryNodes, options.priority ?? 'routine', bus)) return false;
    this.groupCursors.set(group, cursor + 1);
    this.markAuthoredPlay();
    source.start(now, cue.start, duration);
    source.stop(now + duration);
    return true;
  }

  private playGenericFallback(group: string, options: SemanticCueOptions): boolean {
    let hash = 2166136261;
    for (const char of group) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const frequency = 110 + (hash >>> 0) % 770;
    const priority = options.priority ?? 'routine';
    const pan = options.pan ?? 0;
    const gain = clamp(options.gain ?? 1);
    const type: OscillatorType = (hash & 3) === 0 ? 'sawtooth' : (hash & 3) === 1 ? 'square' : (hash & 3) === 2 ? 'triangle' : 'sine';
    const played = this.synthTone(frequency, group.startsWith('ui/') ? .08 : .13, type, .032 * gain, options.bus ?? 'sfx', pan, priority);
    if (played) this.markFallbackPlay();
    return played;
  }

  private synthTone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    bus: AudioBus,
    pan: number,
    priority: AudioVoicePriority,
  ): boolean {
    if (!this.context || this.lifecycleSuspended) return false;
    const safeDuration = Math.max(.001, Number.isFinite(duration) ? duration : .08);
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * .62), now + safeDuration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + safeDuration);
    oscillator.connect(gain);
    const auxiliaryNodes = this.connectToBus(gain, bus, pan);
    if (!this.trackVoice(oscillator, gain, volume, auxiliaryNodes, priority, bus)) return false;
    oscillator.start(now);
    oscillator.stop(now + safeDuration);
    return true;
  }

  private synthNoise(
    duration: number,
    volume: number,
    bus: AudioBus,
    pan: number,
    priority: AudioVoicePriority,
  ): boolean {
    if (!this.context || !this.noiseBuffer || this.lifecycleSuspended) return false;
    const safeDuration = Math.max(.001, Number.isFinite(duration) ? duration : .06);
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = this.noiseBuffer.duration;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + safeDuration);
    source.connect(gain);
    const auxiliaryNodes = this.connectToBus(gain, bus, pan);
    if (!this.trackVoice(source, gain, volume, auxiliaryNodes, priority, bus)) return false;
    const offsetSamples = this.noiseCursor;
    const durationSamples = Math.max(1, Math.floor(this.context.sampleRate * safeDuration));
    this.noiseCursor = (this.noiseCursor + durationSamples) % this.noiseBuffer.length;
    source.start(now, offsetSamples / this.context.sampleRate);
    source.stop(now + safeDuration);
    return true;
  }

  private markAuthoredPlay(): void {
    this.authoredPlays += 1;
    this.lastSource = 'authored';
  }

  private markFallbackPlay(): void {
    this.fallbackPlays += 1;
    this.lastSource = 'fallback';
  }

  private recordAudioError(message: string): void { this.audioError = message; }

  private async fetchAudio(path: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), AUDIO_FETCH_TIMEOUT_MS);
    try {
      return await fetch(runtimeUrl(path), { signal: controller.signal });
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  private recordSpatialCue(cue: SpatialCueDiagnostic): void {
    this.lastSpatialCue = cue;
    this.spatialCueHistory.push(cue);
    if (this.spatialCueHistory.length > SPATIAL_CUE_HISTORY_LIMIT) this.spatialCueHistory.shift();
  }

  private connectToBus(node: AudioNode, bus: AudioBus, pan: number): AudioNode[] {
    if (!this.context) return [];
    const destination = bus === 'music' ? this.musicGain : this.sfxGain;
    if (!destination) return [];
    const profilePan = Math.max(-1, Math.min(1, pan * PLAYBACK_PROFILES[this.settings.profile].panScale));
    if (typeof this.context.createStereoPanner === 'function' && Math.abs(profilePan) > .001) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = profilePan;
      node.connect(panner).connect(destination);
      return [panner];
    }
    node.connect(destination);
    return [];
  }

  private createNoiseBuffer(): AudioBuffer {
    if (!this.context) throw new Error('Audio context must exist before creating noise');
    const length = Math.max(1, Math.floor(this.context.sampleRate * NOISE_BUFFER_SECONDS));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let state = 0x51f15e;
    for (let index = 0; index < length; index += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      data[index] = state / 0x80000000 - 1;
    }
    return buffer;
  }

  private trackVoice(
    source: AudioScheduledSourceNode,
    gain: GainNode,
    volume: number,
    auxiliaryNodes: AudioNode[],
    priority: AudioVoicePriority,
    bus: AudioBus,
  ): boolean {
    const priorityOrder = VOICE_PRIORITY_ORDER[priority];
    const eligibleVoices = this.activeVoices.filter((voice) => VOICE_PRIORITY_ORDER[voice.priority] <= priorityOrder);
    const tierAtCapacity = eligibleVoices.length >= VOICE_PRIORITY_CAPACITY[priority];
    if (tierAtCapacity || this.activeVoices.length >= ACTIVE_VOICE_BUDGET) {
      const candidate = this.selectVoiceToReplace(eligibleVoices);
      if (!candidate) {
        this.rejectedVoices += 1;
        this.disconnectVoiceNodes(source, gain, auxiliaryNodes);
        return false;
      }
      this.releaseVoice(candidate, true);
    }
    const voice: ActiveVoice = {
      source,
      gain,
      auxiliaryNodes,
      loudness: Math.max(0, Number.isFinite(volume) ? volume : 0),
      order: this.voiceOrder++,
      priority,
      bus,
    };
    source.onended = () => this.releaseVoice(voice, false);
    this.activeVoices.push(voice);
    return true;
  }

  private selectVoiceToReplace(voices: ActiveVoice[]): ActiveVoice | undefined {
    let candidate: ActiveVoice | undefined;
    for (const voice of voices) {
      if (!candidate
        || VOICE_PRIORITY_ORDER[voice.priority] < VOICE_PRIORITY_ORDER[candidate.priority]
        || (voice.priority === candidate.priority && voice.loudness < candidate.loudness)
        || (voice.priority === candidate.priority && voice.loudness === candidate.loudness && voice.order < candidate.order)) {
        candidate = voice;
      }
    }
    return candidate;
  }

  private countVoicesByPriority(): Record<AudioVoicePriority, number> {
    const counts: Record<AudioVoicePriority, number> = { ambient: 0, routine: 0, important: 0, critical: 0 };
    for (const voice of this.activeVoices) counts[voice.priority] += 1;
    return counts;
  }

  private disconnectVoiceNodes(source: AudioScheduledSourceNode, gain: GainNode, auxiliaryNodes: AudioNode[]): void {
    source.onended = null;
    try { source.disconnect(); } catch { /* Rejected sources are disconnected best-effort. */ }
    try { gain.disconnect(); } catch { /* Rejected gain nodes are disconnected best-effort. */ }
    for (const node of auxiliaryNodes) {
      try { node.disconnect(); } catch { /* Rejected auxiliary nodes are disconnected best-effort. */ }
    }
  }

  private releaseVoice(voice: ActiveVoice, stop: boolean): void {
    const index = this.activeVoices.indexOf(voice);
    if (index < 0) return;
    this.activeVoices.splice(index, 1);
    voice.source.onended = null;
    if (stop) {
      try { voice.source.stop(this.context?.currentTime ?? 0); } catch { /* A naturally ended source is already released. */ }
    }
    this.disconnectVoiceNodes(voice.source, voice.gain, voice.auxiliaryNodes);
  }

  private resumeContext(): void { this.changeContextState('resume'); }

  private changeContextState(action: 'suspend' | 'resume'): void {
    if (!this.context || this.context.state === 'closed') return;
    try {
      const transition = action === 'suspend' ? this.context.suspend() : this.context.resume();
      void transition.catch(() => undefined);
    } catch { /* Lifecycle requests remain safe if a browser rejects an early transition. */ }
  }

  private duckMusic(duration: number): void {
    if (!this.context || !this.musicGain) return;
    const now = this.context.currentTime;
    const target = this.musicBusTarget();
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(target * .52, now + .015);
    this.musicGain.gain.linearRampToValueAtTime(target, now + duration);
  }

  private musicBusTarget(): number {
    return this.settings.music * PLAYBACK_PROFILES[this.settings.profile].musicScale;
  }

  private settingsChanged(): void {
    this.applyGainValues();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* Audio remains configurable in memory. */ }
    window.dispatchEvent(new CustomEvent('audio-settings-change', { detail: { ...this.settings } }));
  }

  private applyGainValues(): void {
    if (!this.context || !this.masterGain || !this.masterCompressor || !this.musicGain || !this.sfxGain) return;
    const now = this.context.currentTime;
    const profile = PLAYBACK_PROFILES[this.settings.profile];
    this.masterGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.cancelScheduledValues(now);
    this.sfxGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.settings.muted ? 0 : this.settings.master, now);
    this.musicGain.gain.setValueAtTime(this.musicBusTarget(), now);
    this.sfxGain.gain.setValueAtTime(this.settings.sfx * profile.sfxScale, now);
    this.masterCompressor.threshold.setValueAtTime(profile.compressorThreshold, now);
    this.masterCompressor.ratio.setValueAtTime(profile.compressorRatio, now);
    try {
      this.masterGain.channelCount = this.settings.profile === 'mono' ? 1 : 2;
      this.masterGain.channelCountMode = this.settings.profile === 'mono' ? 'explicit' : 'max';
    } catch { /* Some older engines expose channel configuration as read-only. */ }
  }

  private restoreSettings(): void {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<AudioSettings>;
      if (typeof value.master === 'number') this.settings.master = clamp(value.master);
      if (typeof value.music === 'number') this.settings.music = clamp(value.music);
      if (typeof value.sfx === 'number') this.settings.sfx = clamp(value.sfx);
      if (typeof value.muted === 'boolean') this.settings.muted = value.muted;
      if (isPlaybackProfile(value.profile)) this.settings.profile = value.profile;
    } catch { /* Defaults are intentionally usable when storage is unavailable or corrupt. */ }
  }
}
