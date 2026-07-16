export type AudioBus = 'music' | 'sfx';
export type EnemyCueEvent = 'idle' | 'alert' | 'windup' | 'pain' | 'attack' | 'death' | 'phase';
export type AudioVoicePriority = 'ambient' | 'routine' | 'important' | 'critical';

interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

const STORAGE_KEY = 'red-ledger-audio-v1';
const ACTIVE_VOICE_BUDGET = 32;
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
const NOISE_BUFFER_SECONDS = 1;
const SPATIAL_CUE_HISTORY_LIMIT = 16;
const clamp = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

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
}

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
  private musicTimer?: number;
  private step = 0;
  private musicPattern: Array<number | null> = [];
  private combatIntensity = 0;
  private lastSpatialCue?: SpatialCueDiagnostic;
  private readonly spatialCueHistory: SpatialCueDiagnostic[] = [];
  private settings: AudioSettings = { master: .8, music: .65, sfx: .8, muted: false };

  constructor() { this.restoreSettings(); }

  get masterVolume(): number { return this.settings.master; }
  get musicVolume(): number { return this.settings.music; }
  get sfxVolume(): number { return this.settings.sfx; }
  get muted(): boolean { return this.settings.muted; }

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
      this.masterCompressor.threshold.setValueAtTime(-18, now);
      this.masterCompressor.knee.setValueAtTime(12, now);
      this.masterCompressor.ratio.setValueAtTime(6, now);
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
  }

  suspend(): void {
    this.lifecycleSuspended = true;
    this.changeContextState('suspend');
  }

  resume(): void {
    this.lifecycleSuspended = false;
    this.resumeContext();
  }

  setMasterVolume(value: number): void { this.settings.master = clamp(value); this.settingsChanged(); }
  setMusicVolume(value: number): void { this.settings.music = clamp(value); this.settingsChanged(); }
  setSfxVolume(value: number): void { this.settings.sfx = clamp(value); this.settingsChanged(); }
  setMuted(value: boolean): void { this.settings.muted = value; this.settingsChanged(); }

  tone(
    frequency: number,
    duration = .08,
    type: OscillatorType = 'square',
    volume = .045,
    bus: AudioBus = 'sfx',
    pan = 0,
    priority: AudioVoicePriority = 'routine',
  ): void {
    if (!this.context || this.lifecycleSuspended) return;
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
    if (!this.trackVoice(oscillator, gain, volume, auxiliaryNodes, priority)) return;
    oscillator.start(now);
    oscillator.stop(now + safeDuration);
  }

  noise(
    duration = .06,
    volume = .045,
    bus: AudioBus = 'sfx',
    pan = 0,
    priority: AudioVoicePriority = 'routine',
  ): void {
    if (!this.context || !this.noiseBuffer || this.lifecycleSuspended) return;
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
    if (!this.trackVoice(source, gain, volume, auxiliaryNodes, priority)) return;
    const offsetSamples = this.noiseCursor;
    const durationSamples = Math.max(1, Math.floor(this.context.sampleRate * safeDuration));
    this.noiseCursor = (this.noiseCursor + durationSamples) % this.noiseBuffer.length;
    source.start(now, offsetSamples / this.context.sampleRate);
    source.stop(now + safeDuration);
  }

  startMusic(episode: number, map: number): void {
    this.stopMusic();
    const roots = [82.41, 73.42, 65.41];
    const root = roots[episode - 1] ?? roots[0];
    const modes = [[0, 2, 3, 5, 7, 8, 10], [0, 1, 3, 5, 6, 8, 10], [0, 1, 4, 5, 7, 8, 11]];
    const mode = modes[episode - 1] ?? modes[0];
    let state = (0x9e3779b9 ^ episode * 0x85ebca6b ^ map * 0xc2b2ae35) >>> 0;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    this.musicPattern = Array.from({ length: 512 }, (_, index) => {
      if (index % 64 < 4 || random() < .16) return null;
      const phrase = Math.floor(index / 32);
      const degree = mode[(Math.floor(random() * mode.length) + phrase + map) % mode.length];
      return degree + (random() > .82 ? 12 : random() < .12 ? -12 : 0);
    });
    this.step = 0;
    this.musicTimer = window.setInterval(() => {
      if (this.lifecycleSuspended) return;
      const note = this.musicPattern[this.step % this.musicPattern.length];
      if (note !== null) this.tone(root * 2 ** (note / 12), .19, this.step % 8 === 0 ? 'sawtooth' : 'square', .011, 'music', 0, 'ambient');
      if (this.step % 8 === 0) this.tone(root / 2 * 2 ** ((map % 5 - 2) / 12), .38, 'triangle', .017, 'music', 0, 'ambient');
      if (this.step % 32 === 28) this.tone(root * 4, .06, 'square', .008, 'music', 0, 'ambient');
      if (this.combatIntensity > .15 && this.step % 4 === 0) {
        this.tone(root * (this.step % 8 === 0 ? 1 : 1.5), .065, episode === 2 ? 'sawtooth' : 'square', .006 + this.combatIntensity * .008, 'music', 0, 'ambient');
      }
      this.step = (this.step + 1) % this.musicPattern.length;
    }, 300);
  }

  setCombatIntensity(value: number): void { this.combatIntensity = clamp(value); }

  weaponCue(id: string, pan = 0): void {
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
    this.noise(id === 'catastrophe-launcher' ? .11 : .045, profile.noise, 'sfx', pan, 'important');
    this.tone(profile.transient, .045, profile.type, .028, 'sfx', pan, 'important');
    this.tone(profile.body, id === 'umbra-saw' ? .17 : .09, profile.type, .034, 'sfx', pan, 'important');
    this.tone(profile.tail, id === 'catastrophe-launcher' ? .19 : .12, 'triangle', .018, 'sfx', pan, 'important');
    this.duckMusic(id === 'catastrophe-launcher' || id === 'binding-engine' ? .18 : .1);
  }

  enemyCue(id: string, event: EnemyCueEvent, pan = 0, gain = 1): void {
    const spatialGain = clamp(gain);
    this.recordSpatialCue({ kind: `enemy:${id}:${event}`, pan, gain: spatialGain });
    let hash = 2166136261;
    for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const base = 72 + (hash >>> 0) % 210;
    const offsets: Record<EnemyCueEvent, number> = { idle: -8, alert: 80, windup: 118, pain: 46, attack: 24, death: -34, phase: 140 };
    const type: OscillatorType = (hash & 3) === 0 ? 'sawtooth' : (hash & 3) === 1 ? 'square' : (hash & 3) === 2 ? 'triangle' : 'sine';
    const duration = event === 'death' ? .22 : event === 'phase' ? .28 : event === 'windup' ? .16 : event === 'pain' ? .12 : event === 'idle' ? .16 : .09;
    const volume = (event === 'phase' ? .04 : event === 'idle' ? .012 : event === 'windup' ? .021 : .024) * spatialGain;
    const priority: AudioVoicePriority = event === 'idle'
      ? 'ambient'
      : event === 'alert'
        ? 'important'
        : event === 'windup' || event === 'attack' || event === 'phase'
          ? 'critical'
          : 'routine';
    this.tone(Math.max(42, base + offsets[event]), duration, type, volume, 'sfx', pan, priority);
    if (event === 'windup') this.tone(base * 2.05, .045, 'sine', .009 * spatialGain, 'sfx', pan, priority);
    if (event === 'attack' && (hash & 1) === 0) this.tone(base * 1.5, .055, 'square', .012 * spatialGain, 'sfx', pan, priority);
    if (event === 'death' || event === 'pain') this.noise(event === 'death' ? .12 : .05, (event === 'death' ? .024 : .014) * spatialGain, 'sfx', pan, priority);
  }

  hazardCue(event: 'placed' | 'armed', pan = 0, gain = 1): void {
    const spatialGain = clamp(gain);
    this.recordSpatialCue({ kind: `hazard:${event}`, pan, gain: spatialGain });
    if (event === 'placed') {
      this.tone(176, .13, 'triangle', .018 * spatialGain, 'sfx', pan, 'critical');
      this.noise(.055, .01 * spatialGain, 'sfx', pan, 'critical');
      return;
    }
    this.tone(690, .09, 'square', .022 * spatialGain, 'sfx', pan, 'critical');
    this.tone(920, .07, 'sine', .012 * spatialGain, 'sfx', pan, 'critical');
  }

  diagnostics(): {
    lifecycleSuspended: boolean;
    contextState?: AudioContextState;
    activeVoices: number;
    voicesByPriority: Record<AudioVoicePriority, number>;
    rejectedVoices: number;
    musicActive?: boolean;
    lastSpatialCue?: SpatialCueDiagnostic;
    recentSpatialCues: readonly SpatialCueDiagnostic[];
  } {
    return {
      lifecycleSuspended: this.lifecycleSuspended,
      activeVoices: this.activeVoices.length,
      voicesByPriority: this.countVoicesByPriority(),
      rejectedVoices: this.rejectedVoices,
      ...(this.context ? { contextState: this.context.state } : {}),
      ...(this.musicTimer !== undefined ? { musicActive: true } : {}),
      ...(this.lastSpatialCue ? { lastSpatialCue: { ...this.lastSpatialCue } } : {}),
      recentSpatialCues: this.spatialCueHistory.map((cue) => ({ ...cue })),
    };
  }

  clearSpatialDiagnostics(): void {
    this.lastSpatialCue = undefined;
    this.spatialCueHistory.length = 0;
  }

  stopMusic(): void {
    if (this.musicTimer !== undefined) window.clearInterval(this.musicTimer);
    this.musicTimer = undefined;
    this.combatIntensity = 0;
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
    if (typeof this.context.createStereoPanner === 'function' && Math.abs(pan) > .001) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
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
    const target = this.settings.music;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(target * .52, now + .015);
    this.musicGain.gain.linearRampToValueAtTime(target, now + duration);
  }

  private settingsChanged(): void {
    this.applyGainValues();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* Audio remains configurable in memory. */ }
    window.dispatchEvent(new CustomEvent('audio-settings-change', { detail: { ...this.settings } }));
  }

  private applyGainValues(): void {
    if (!this.context || !this.masterGain || !this.musicGain || !this.sfxGain) return;
    const now = this.context.currentTime;
    this.masterGain.gain.setValueAtTime(this.settings.muted ? 0 : this.settings.master, now);
    this.musicGain.gain.setValueAtTime(this.settings.music, now);
    this.sfxGain.gain.setValueAtTime(this.settings.sfx, now);
  }

  private restoreSettings(): void {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<AudioSettings>;
      if (typeof value.master === 'number') this.settings.master = clamp(value.master);
      if (typeof value.music === 'number') this.settings.music = clamp(value.music);
      if (typeof value.sfx === 'number') this.settings.sfx = clamp(value.sfx);
      if (typeof value.muted === 'boolean') this.settings.muted = value.muted;
    } catch { /* Defaults are intentionally usable when storage is unavailable or corrupt. */ }
  }
}
