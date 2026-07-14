export type AudioBus = 'music' | 'sfx';
export type EnemyCueEvent = 'idle' | 'alert' | 'windup' | 'pain' | 'attack' | 'death' | 'phase';

interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

const STORAGE_KEY = 'red-ledger-audio-v1';
const clamp = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export class AudioSystem {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private musicGain?: GainNode;
  private sfxGain?: GainNode;
  private musicTimer?: number;
  private step = 0;
  private musicPattern: Array<number | null> = [];
  private noiseState = 0x51f15e;
  private combatIntensity = 0;
  private lastSpatialCue?: { kind: string; pan: number; gain: number };
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
      this.musicGain = this.context.createGain();
      this.sfxGain = this.context.createGain();
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
      this.applyGainValues();
    }
    void this.context.resume();
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
  ): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * .62), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain);
    this.connectToBus(gain, bus, pan);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  noise(duration = .06, volume = .045, bus: AudioBus = 'sfx', pan = 0): void {
    if (!this.context) return;
    const length = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      this.noiseState = (Math.imul(this.noiseState, 1664525) + 1013904223) >>> 0;
      data[i] = this.noiseState / 0x80000000 - 1;
    }
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, this.context.currentTime + duration);
    source.connect(gain);
    this.connectToBus(gain, bus, pan);
    source.start();
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
      const note = this.musicPattern[this.step % this.musicPattern.length];
      if (note !== null) this.tone(root * 2 ** (note / 12), .19, this.step % 8 === 0 ? 'sawtooth' : 'square', .011, 'music');
      if (this.step % 8 === 0) this.tone(root / 2 * 2 ** ((map % 5 - 2) / 12), .38, 'triangle', .017, 'music');
      if (this.step % 32 === 28) this.tone(root * 4, .06, 'square', .008, 'music');
      if (this.combatIntensity > .15 && this.step % 4 === 0) {
        this.tone(root * (this.step % 8 === 0 ? 1 : 1.5), .065, episode === 2 ? 'sawtooth' : 'square', .006 + this.combatIntensity * .008, 'music');
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
    this.noise(id === 'catastrophe-launcher' ? .11 : .045, profile.noise, 'sfx', pan);
    this.tone(profile.transient, .045, profile.type, .028, 'sfx', pan);
    this.tone(profile.body, id === 'umbra-saw' ? .17 : .09, profile.type, .034, 'sfx', pan);
    this.tone(profile.tail, id === 'catastrophe-launcher' ? .19 : .12, 'triangle', .018, 'sfx', pan);
    this.duckMusic(id === 'catastrophe-launcher' || id === 'binding-engine' ? .18 : .1);
  }

  enemyCue(id: string, event: EnemyCueEvent, pan = 0, gain = 1): void {
    const spatialGain = clamp(gain);
    this.lastSpatialCue = { kind: `enemy:${id}:${event}`, pan, gain: spatialGain };
    let hash = 2166136261;
    for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const base = 72 + (hash >>> 0) % 210;
    const offsets: Record<EnemyCueEvent, number> = { idle: -8, alert: 80, windup: 118, pain: 46, attack: 24, death: -34, phase: 140 };
    const type: OscillatorType = (hash & 3) === 0 ? 'sawtooth' : (hash & 3) === 1 ? 'square' : (hash & 3) === 2 ? 'triangle' : 'sine';
    const duration = event === 'death' ? .22 : event === 'phase' ? .28 : event === 'windup' ? .16 : event === 'pain' ? .12 : event === 'idle' ? .16 : .09;
    const volume = (event === 'phase' ? .04 : event === 'idle' ? .012 : event === 'windup' ? .021 : .024) * spatialGain;
    this.tone(Math.max(42, base + offsets[event]), duration, type, volume, 'sfx', pan);
    if (event === 'windup') this.tone(base * 2.05, .045, 'sine', .009 * spatialGain, 'sfx', pan);
    if (event === 'attack' && (hash & 1) === 0) this.tone(base * 1.5, .055, 'square', .012 * spatialGain, 'sfx', pan);
    if (event === 'death' || event === 'pain') this.noise(event === 'death' ? .12 : .05, (event === 'death' ? .024 : .014) * spatialGain, 'sfx', pan);
  }

  hazardCue(event: 'placed' | 'armed', pan = 0, gain = 1): void {
    const spatialGain = clamp(gain);
    this.lastSpatialCue = { kind: `hazard:${event}`, pan, gain: spatialGain };
    if (event === 'placed') {
      this.tone(176, .13, 'triangle', .018 * spatialGain, 'sfx', pan);
      this.noise(.055, .01 * spatialGain, 'sfx', pan);
      return;
    }
    this.tone(690, .09, 'square', .022 * spatialGain, 'sfx', pan);
    this.tone(920, .07, 'sine', .012 * spatialGain, 'sfx', pan);
  }

  diagnostics(): { lastSpatialCue?: { kind: string; pan: number; gain: number } } {
    return this.lastSpatialCue ? { lastSpatialCue: { ...this.lastSpatialCue } } : {};
  }

  stopMusic(): void {
    if (this.musicTimer !== undefined) window.clearInterval(this.musicTimer);
    this.musicTimer = undefined;
    this.combatIntensity = 0;
  }

  private connectToBus(node: AudioNode, bus: AudioBus, pan: number): void {
    if (!this.context) return;
    const destination = bus === 'music' ? this.musicGain : this.sfxGain;
    if (!destination) return;
    if (typeof this.context.createStereoPanner === 'function' && Math.abs(pan) > .001) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(panner).connect(destination);
    } else node.connect(destination);
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
