import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioSystem } from './AudioSystem';

class MockAudioParam {
  value = 0;
  setValueAtTime(value: number): this { this.value = value; return this; }
  exponentialRampToValueAtTime(value: number): this { this.value = value; return this; }
  linearRampToValueAtTime(value: number): this { this.value = value; return this; }
  cancelScheduledValues(): this { return this; }
}

class MockAudioNode {
  readonly connections: MockAudioNode[] = [];
  disconnected = false;
  channelCount = 2;
  channelCountMode: ChannelCountMode = 'max';
  connect<T extends MockAudioNode>(destination: T): T { this.connections.push(destination); return destination; }
  disconnect(): void { this.disconnected = true; }
}

class MockGainNode extends MockAudioNode { readonly gain = new MockAudioParam(); }
class MockStereoPannerNode extends MockAudioNode { readonly pan = new MockAudioParam(); }
class MockMediaElementSourceNode extends MockAudioNode {}

class MockAudioElement {
  src = '';
  preload = '';
  crossOrigin: string | null = null;
  currentTime = 0;
  loop = false;
  paused = true;
  loadCalls = 0;
  playCalls = 0;
  pauseCalls = 0;
  constructor() { mediaElements.push(this); }
  load(): void { this.loadCalls += 1; }
  play(): Promise<void> { this.playCalls += 1; this.paused = false; return mediaPlayFactory(); }
  pause(): void { this.pauseCalls += 1; this.paused = true; }
  removeAttribute(name: string): void { if (name === 'src') this.src = ''; }
}

class MockCompressorNode extends MockAudioNode {
  readonly threshold = new MockAudioParam();
  readonly knee = new MockAudioParam();
  readonly ratio = new MockAudioParam();
  readonly attack = new MockAudioParam();
  readonly release = new MockAudioParam();
}

class MockScheduledSourceNode extends MockAudioNode {
  onended: (() => void) | null = null;
  readonly startCalls: number[][] = [];
  readonly stopCalls: number[] = [];
  start(...values: number[]): void { this.startCalls.push(values); }
  stop(when = 0): void { this.stopCalls.push(when); }
}

class MockOscillatorNode extends MockScheduledSourceNode {
  type: OscillatorType = 'sine';
  readonly frequency = new MockAudioParam();
}

class MockAudioBuffer {
  readonly duration: number;
  private readonly data: Float32Array;
  constructor(readonly length: number, readonly sampleRate: number) {
    this.duration = length / sampleRate;
    this.data = new Float32Array(length);
  }
  getChannelData(): Float32Array { return this.data; }
}

class MockBufferSourceNode extends MockScheduledSourceNode {
  buffer: MockAudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
}

const contexts: MockAudioContext[] = [];
const intervalCallbacks: Array<() => void> = [];
const mediaElements: MockAudioElement[] = [];
let mediaPlayFactory: () => Promise<void> = () => Promise.resolve();

const authoredLibrary = {
  schema: 2,
  music: {
    E1M1: { url: 'audio/music/e1m1.mp3', duration: 3, encodedDuration: 3, kind: 'map', title: 'Test Map' },
    menu: { url: 'audio/music/menu.mp3', duration: 2, encodedDuration: 2, kind: 'ui', title: 'Test Menu' },
  },
  sfx: {
    shardCount: 4,
    groupCount: 5,
    cueCount: 6,
    shards: {
      'player-ui': { url: 'audio/sfx/player-ui.mp3', duration: 8, groupCount: 2, cueCount: 3 },
      weapons: { url: 'audio/sfx/weapons.mp3', duration: 8, groupCount: 1, cueCount: 1 },
      attacks: { url: 'audio/sfx/attacks.mp3', duration: 8, groupCount: 1, cueCount: 1 },
      world: { url: 'audio/sfx/world.mp3', duration: 8, groupCount: 1, cueCount: 1 },
    },
    groups: {
      'pickup/health': { shard: 'player-ui', cues: [
        { id: 'pickup/health/01', start: .5, duration: .1 },
        { id: 'pickup/health/02', start: .8, duration: .12 },
      ] },
      'weapon/staple-driver/fire': { shard: 'weapons', cues: [
        { id: 'weapon/staple-driver/fire/01', start: 1.2, duration: .2 },
      ] },
      'attack/denial-beam/windup': { shard: 'attacks', cues: [
        { id: 'attack/denial-beam/windup/01', start: 1.6, duration: .3 },
      ] },
      'world/hazard-armed': { shard: 'world', cues: [
        { id: 'world/hazard-armed/01', start: 2.1, duration: .18 },
      ] },
      'ui/menu-accept': { shard: 'player-ui', cues: [
        { id: 'ui/menu-accept/01', start: 2.5, duration: .08 },
      ] },
    },
  },
};

const useAuthoredFetch = (): ReturnType<typeof vi.fn> => {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('audio/audio-library.json')) {
      return { ok: true, status: 200, json: async () => structuredClone(authoredLibrary) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) };
  });
  vi.stubGlobal('fetch', mock);
  return mock;
};

class MockAudioContext {
  readonly sampleRate = 1_000;
  readonly currentTime = 4;
  readonly destination = new MockAudioNode();
  state: AudioContextState = 'suspended';
  readonly gains: MockGainNode[] = [];
  readonly compressors: MockCompressorNode[] = [];
  readonly oscillators: MockOscillatorNode[] = [];
  readonly sources: MockBufferSourceNode[] = [];
  readonly buffers: MockAudioBuffer[] = [];
  readonly panners: MockStereoPannerNode[] = [];
  readonly decodedBuffers: MockAudioBuffer[] = [];
  readonly mediaSources: MockMediaElementSourceNode[] = [];
  resumeCalls = 0;
  suspendCalls = 0;

  constructor() { contexts.push(this); }
  createGain(): MockGainNode { const node = new MockGainNode(); this.gains.push(node); return node; }
  createDynamicsCompressor(): MockCompressorNode { const node = new MockCompressorNode(); this.compressors.push(node); return node; }
  createOscillator(): MockOscillatorNode { const node = new MockOscillatorNode(); this.oscillators.push(node); return node; }
  createBufferSource(): MockBufferSourceNode { const node = new MockBufferSourceNode(); this.sources.push(node); return node; }
  createBuffer(_channels: number, length: number, sampleRate: number): MockAudioBuffer {
    const buffer = new MockAudioBuffer(length, sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }
  createStereoPanner(): MockStereoPannerNode { const node = new MockStereoPannerNode(); this.panners.push(node); return node; }
  createMediaElementSource(_element: HTMLMediaElement): MockMediaElementSourceNode {
    const node = new MockMediaElementSourceNode();
    this.mediaSources.push(node);
    return node;
  }
  decodeAudioData(_data: ArrayBuffer): Promise<MockAudioBuffer> {
    const buffer = new MockAudioBuffer(200_000, this.sampleRate);
    this.decodedBuffers.push(buffer);
    return Promise.resolve(buffer);
  }
  resume(): Promise<void> { this.resumeCalls += 1; this.state = 'running'; return Promise.resolve(); }
  suspend(): Promise<void> { this.suspendCalls += 1; this.state = 'suspended'; return Promise.resolve(); }
}

beforeEach(() => {
  contexts.length = 0;
  intervalCallbacks.length = 0;
  mediaElements.length = 0;
  mediaPlayFactory = () => Promise.resolve();
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal('window', {
    AudioContext: MockAudioContext,
    dispatchEvent: vi.fn(),
    setInterval: vi.fn((callback: () => void) => { intervalCallbacks.push(callback); return intervalCallbacks.length; }),
    clearInterval: vi.fn(),
  });
  vi.stubGlobal('Audio', MockAudioElement);
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('authored audio unavailable'))));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AudioSystem production lifecycle', () => {
  it('routes buses through a configured master compressor', () => {
    const audio = new AudioSystem();
    audio.unlock();
    const context = contexts[0];
    const [master, music, sfx] = context.gains;
    const compressor = context.compressors[0];

    expect(music.connections).toContain(master);
    expect(sfx.connections).toContain(master);
    expect(master.connections).toContain(compressor);
    expect(compressor.connections).toContain(context.destination);
    expect(compressor.threshold.value).toBe(-18);
    expect(compressor.ratio.value).toBe(6);
  });

  it('reuses one deterministic seeded noise buffer across cues', () => {
    const audio = new AudioSystem();
    audio.unlock();
    const context = contexts[0];
    const firstSamples = [...context.buffers[0].getChannelData().slice(0, 8)];

    audio.noise(.06);
    audio.noise(.04);
    expect(context.buffers).toHaveLength(1);
    expect(context.sources[0].buffer).toBe(context.buffers[0]);
    expect(context.sources[1].buffer).toBe(context.buffers[0]);
    expect(context.sources[0].startCalls[0]).toEqual([4, 0]);
    expect(context.sources[1].startCalls[0]).toEqual([4, .06]);

    const second = new AudioSystem();
    second.unlock();
    expect([...contexts[1].buffers[0].getChannelData().slice(0, 8)]).toEqual(firstSamples);
  });

  it('bounds routine voices by stealing the quietest and then the oldest voice', () => {
    const audio = new AudioSystem();
    audio.unlock();
    const context = contexts[0];
    for (let index = 0; index < 24; index += 1) audio.tone(220 + index, 2, 'square', index === 1 ? .005 : .1);
    audio.tone(440, 2, 'square', .1);

    expect(context.oscillators).toHaveLength(25);
    expect(context.oscillators[0].stopCalls).toHaveLength(1);
    expect(context.oscillators[1].stopCalls).toHaveLength(2);
    expect(context.oscillators[1].disconnected).toBe(true);

    audio.tone(550, 2, 'square', .1);
    expect(context.oscillators[0].stopCalls).toHaveLength(2);
    expect(audio.diagnostics()).toMatchObject({
      activeVoices: 24,
      voicesByPriority: { ambient: 0, routine: 24, important: 0, critical: 0 },
      rejectedVoices: 0,
    });
  });

  it('preserves enemy and hazard tells under routine and ambient saturation', () => {
    const audio = new AudioSystem();
    audio.unlock();
    const context = contexts[0];
    for (let index = 0; index < 40; index += 1) audio.tone(180 + index, 2, 'square', .08);

    const criticalStart = context.oscillators.length;
    audio.enemyCue('denial-officer', 'windup');
    audio.enemyCue('denial-officer', 'attack');
    audio.enemyCue('final-adjuster', 'phase');
    audio.hazardCue('armed');
    const criticalVoices = context.oscillators.slice(criticalStart);
    expect(criticalVoices.length).toBeGreaterThanOrEqual(6);

    for (let index = 0; index < 48; index += 1) audio.tone(500 + index, 2, 'square', .2);
    for (let index = 0; index < 24; index += 1) audio.tone(80 + index, 2, 'sine', .3, 'music', 0, 'ambient');

    for (const voice of criticalVoices) {
      expect(voice.stopCalls).toHaveLength(1);
      expect(voice.disconnected).toBe(false);
    }
    const diagnostics = audio.diagnostics();
    expect(diagnostics.activeVoices).toBe(32);
    expect(diagnostics.voicesByPriority.critical).toBe(criticalVoices.length);
    expect(diagnostics.voicesByPriority.routine).toBe(24);
    expect(diagnostics.voicesByPriority.important).toBe(0);
    expect(diagnostics.voicesByPriority.ambient).toBe(8 - criticalVoices.length);
    expect(diagnostics.rejectedVoices).toBe(0);
  });

  it('keeps four critical slots reserved under layered weapon saturation', () => {
    const audio = new AudioSystem();
    audio.unlock();
    const context = contexts[0];
    for (let index = 0; index < 7; index += 1) audio.weaponCue('staple-driver');
    expect(audio.diagnostics()).toMatchObject({
      activeVoices: 28,
      voicesByPriority: { ambient: 0, routine: 0, important: 28, critical: 0 },
    });

    const criticalStart = context.oscillators.length;
    audio.enemyCue('denial-officer', 'windup');
    audio.hazardCue('armed');
    const criticalVoices = context.oscillators.slice(criticalStart);
    expect(criticalVoices).toHaveLength(4);
    expect(audio.diagnostics().activeVoices).toBe(32);

    audio.weaponCue('catastrophe-launcher');
    for (const voice of criticalVoices) {
      expect(voice.stopCalls).toHaveLength(1);
      expect(voice.disconnected).toBe(false);
    }
    expect(audio.diagnostics()).toMatchObject({
      activeVoices: 32,
      voicesByPriority: { ambient: 0, routine: 0, important: 28, critical: 4 },
      rejectedVoices: 0,
    });
  });

  it('rejects lower-priority arrivals when all 32 voices are critical', () => {
    const audio = new AudioSystem();
    audio.unlock();
    const context = contexts[0];
    for (let index = 0; index < 32; index += 1) {
      audio.tone(220 + index, 2, 'square', .05, 'sfx', 0, 'critical');
    }

    audio.tone(90, 2, 'sine', .5, 'music', 0, 'ambient');
    audio.tone(440, 2, 'square', .5);
    const rejected = context.oscillators.slice(-2);
    for (const voice of rejected) {
      expect(voice.startCalls).toHaveLength(0);
      expect(voice.stopCalls).toHaveLength(0);
      expect(voice.disconnected).toBe(true);
    }
    expect(audio.diagnostics()).toMatchObject({
      activeVoices: 32,
      voicesByPriority: { ambient: 0, routine: 0, important: 0, critical: 32 },
      rejectedVoices: 2,
    });

    audio.tone(880, 2, 'square', .06, 'sfx', 0, 'critical');
    expect(context.oscillators[0].stopCalls).toHaveLength(2);
    expect(context.oscillators[0].disconnected).toBe(true);
    expect(context.oscillators.at(-1)?.startCalls).toHaveLength(1);
  });

  it('honors suspend and resume requests made before and after unlock', () => {
    const audio = new AudioSystem();
    expect(() => audio.suspend()).not.toThrow();
    audio.unlock();
    const context = contexts[0];
    expect(context.resumeCalls).toBe(0);
    expect(context.suspendCalls).toBe(1);

    audio.resume();
    expect(context.resumeCalls).toBe(1);
    audio.suspend();
    expect(context.suspendCalls).toBe(2);
  });

  it('does not advance or allocate music voices while lifecycle-suspended', () => {
    const audio = new AudioSystem();
    audio.unlock();
    audio.startMusic(1, 1);
    const tick = intervalCallbacks[0];

    audio.suspend();
    tick();
    tick();
    expect(contexts[0].oscillators).toHaveLength(0);

    audio.resume();
    tick();
    expect(contexts[0].oscillators.length).toBeGreaterThan(0);
    expect(audio.diagnostics()).toMatchObject({ lifecycleSuspended: false });
  });

  it('preserves deterministic spatial diagnostic metadata before unlock', () => {
    const audio = new AudioSystem();
    audio.enemyCue('denial-officer', 'attack', -.35, .72);
    expect(audio.diagnostics()).toMatchObject({
      lifecycleSuspended: false,
      activeVoices: 0,
      voicesByPriority: { ambient: 0, routine: 0, important: 0, critical: 0 },
      rejectedVoices: 0,
      lastSpatialCue: { kind: 'enemy:denial-officer:attack', pan: -.35, gain: .72 },
      recentSpatialCues: [{ kind: 'enemy:denial-officer:attack', pan: -.35, gain: .72 }],
    });

    for (let index = 0; index < 20; index += 1) audio.hazardCue('placed', index / 20, .5);
    expect(audio.diagnostics().recentSpatialCues).toHaveLength(16);
    audio.clearSpatialDiagnostics();
    expect(audio.diagnostics()).toMatchObject({
      lifecycleSuspended: false,
      activeVoices: 0,
      voicesByPriority: { ambient: 0, routine: 0, important: 0, critical: 0 },
      rejectedVoices: 0,
      recentSpatialCues: [],
    });
  });

  it('loads the authored library only after unlock and round-robins sprite variants deterministically', async () => {
    const fetchMock = useAuthoredFetch();
    const audio = new AudioSystem();
    audio.pickupCue('health');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(audio.diagnostics()).toMatchObject({ libraryStatus: 'idle', spriteStatus: 'idle' });

    expect(await audio.prepareAuthoredAudio()).toBe(true);
    const context = contexts[0];
    expect(fetchMock.mock.calls.map(([url]) => String(url).replace(/^\.\//, '/'))).toEqual([
      '/audio/audio-library.json',
      '/audio/sfx/player-ui.mp3',
    ]);
    expect(audio.diagnostics()).toMatchObject({
      libraryStatus: 'ready',
      spriteStatus: 'ready',
      libraryReady: true,
      spriteReady: true,
      loadedSfxShards: 1,
      sfxShardCount: 4,
    });

    audio.pickupCue('health');
    audio.pickupCue('health');
    audio.pickupCue('health');
    expect(context.sources.map((source) => source.startCalls[0])).toEqual([
      [4, .5, .1],
      [4, .8, .12],
      [4, .5, .1],
    ]);
    expect(context.sources.every((source) => source.buffer === context.decodedBuffers[0])).toBe(true);
    expect(audio.diagnostics()).toMatchObject({
      source: 'authored',
      authoredPlays: 3,
      fallbackPlays: 0,
      voicesByPriority: { ambient: 0, routine: 0, important: 3, critical: 0 },
    });
  });

  it('switches from fallback to bounded streaming authored music', async () => {
    const fetchMock = useAuthoredFetch();
    const audio = new AudioSystem();
    expect(await audio.prepareAuthoredAudio()).toBe(true);

    audio.playMusic('E1M1');
    expect(audio.diagnostics()).toMatchObject({ track: 'E1M1', trackSource: 'fallback', fallbackPlays: 1 });
    await vi.waitFor(() => expect(audio.diagnostics().trackSource).toBe('authored'));

    const context = contexts[0];
    const track = mediaElements[0];
    expect(track.src.replace(/^\.\//, '/')).toBe('/audio/music/e1m1.mp3');
    expect(track.loop).toBe(true);
    expect(track.currentTime).toBe(0);
    expect(track.playCalls).toBe(1);
    expect(context.mediaSources).toHaveLength(1);
    expect(context.decodedBuffers).toHaveLength(1);
    expect(audio.diagnostics()).toMatchObject({
      musicActive: true,
      track: 'E1M1',
      trackSource: 'authored',
      source: 'authored',
      authoredPlays: 1,
      fallbackPlays: 1,
      decodedTracks: 0,
    });

    audio.suspend();
    expect(track.paused).toBe(true);
    audio.resume();
    await vi.waitFor(() => expect(track.playCalls).toBe(2));
    expect(track.paused).toBe(false);

    const callsAfterStart = fetchMock.mock.calls.length;
    audio.playMusic('E1M1');
    expect(track.playCalls).toBe(2);
    audio.stopMusic();
    audio.playMusic('E1M1');
    await vi.waitFor(() => expect(audio.diagnostics().trackSource).toBe('authored'));
    expect(track.playCalls).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterStart);
  });

  it('recovers manifest and shard loading after the bounded retry delay', async () => {
    let now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    let manifestAttempts = 0;
    let shardAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('audio/audio-library.json')) {
        manifestAttempts += 1;
        if (manifestAttempts === 1) throw new Error('temporary manifest outage');
        return { ok: true, status: 200, json: async () => structuredClone(authoredLibrary) };
      }
      if (url.endsWith('audio/sfx/player-ui.mp3')) {
        shardAttempts += 1;
        if (shardAttempts === 1) throw new Error('temporary shard outage');
      }
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const audio = new AudioSystem();

    expect(await audio.prepareAuthoredAudio()).toBe(false);
    expect(audio.diagnostics()).toMatchObject({ libraryStatus: 'failed', spriteReady: false });
    now += 3_001;
    expect(await audio.prepareAuthoredAudio()).toBe(false);
    expect(audio.diagnostics()).toMatchObject({ libraryStatus: 'ready', spriteStatus: 'failed', spriteReady: false });
    now += 3_001;
    expect(await audio.prepareAuthoredAudio()).toBe(true);
    expect(audio.diagnostics()).toMatchObject({
      libraryStatus: 'ready',
      spriteStatus: 'ready',
      spriteReady: true,
      loadedSfxShards: 1,
    });
    expect(audio.diagnostics().error).toBeUndefined();
    expect(manifestAttempts).toBe(2);
    expect(shardAttempts).toBe(2);
  });

  it('lets the newest streamed track own the shared media element', async () => {
    useAuthoredFetch();
    const audio = new AudioSystem();
    expect(await audio.prepareAuthoredAudio()).toBe(true);
    const resolvers: Array<() => void> = [];
    mediaPlayFactory = () => new Promise<void>((resolve) => resolvers.push(resolve));

    audio.playMusic('E1M1');
    await vi.waitFor(() => expect(mediaElements[0]?.playCalls).toBe(1));
    audio.playMusic('menu');
    await vi.waitFor(() => expect(mediaElements[0]?.playCalls).toBe(2));
    resolvers[1]();
    await vi.waitFor(() => expect(audio.diagnostics()).toMatchObject({ track: 'menu', trackSource: 'authored' }));
    resolvers[0]();
    await Promise.resolve();

    expect(mediaElements[0].paused).toBe(false);
    expect(mediaElements[0].src.replace(/^\.\//, '/')).toBe('/audio/music/menu.mp3');
    expect(audio.diagnostics()).toMatchObject({ track: 'menu', trackSource: 'authored', decodedTracks: 0 });
  });

  it('reports authored loading failures and keeps explicit synthesized feedback available', async () => {
    const audio = new AudioSystem();
    audio.unlock();
    audio.pickupCue('health');
    await vi.waitFor(() => expect(audio.diagnostics().libraryStatus).toBe('failed'));

    expect(contexts[0].oscillators).toHaveLength(1);
    expect(audio.diagnostics()).toMatchObject({
      libraryReady: false,
      spriteReady: false,
      spriteStatus: 'failed',
      source: 'fallback',
      authoredPlays: 0,
      fallbackPlays: 1,
      error: 'Library: authored audio unavailable',
    });
  });

  it('persists playback profiles and applies mono and headphone routing', () => {
    const audio = new AudioSystem();
    audio.unlock();
    const context = contexts[0];

    audio.setPlaybackProfile('mono');
    audio.tone(440, .1, 'square', .04, 'sfx', .8);
    expect(context.panners).toHaveLength(0);
    expect(context.gains[0].channelCount).toBe(1);
    expect(context.gains[0].channelCountMode).toBe('explicit');
    expect(context.compressors[0].threshold.value).toBe(-22);
    expect(context.compressors[0].ratio.value).toBe(8);
    expect(new AudioSystem().playbackProfile).toBe('mono');

    audio.setPlaybackProfile('headphones');
    audio.tone(550, .1, 'square', .04, 'sfx', .8);
    expect(context.panners.at(-1)?.pan.value).toBe(.8);
    expect(context.gains[0].channelCount).toBe(2);
    expect(context.gains[0].channelCountMode).toBe('max');
  });

  it('plays authored attack tells as spatial critical voices', async () => {
    useAuthoredFetch();
    const audio = new AudioSystem();
    expect(await audio.prepareAuthoredAudio()).toBe(true);
    expect(await audio.prepareCueGroups(['attack/denial-beam/windup'])).toBe(true);
    audio.enemyAttackCue('denial-beam', 'windup', .5, .75);

    const context = contexts[0];
    expect(context.sources.at(-1)?.startCalls[0]).toEqual([4, 1.6, .3]);
    expect(context.panners.at(-1)?.pan.value).toBeCloseTo(.39);
    expect(audio.diagnostics()).toMatchObject({
      source: 'authored',
      authoredPlays: 1,
      voicesByPriority: { ambient: 0, routine: 0, important: 0, critical: 1 },
      lastSpatialCue: { kind: 'attack:denial-beam:windup', pan: .5, gain: .75 },
    });
  });
});
