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
  connect<T extends MockAudioNode>(destination: T): T { this.connections.push(destination); return destination; }
  disconnect(): void { this.disconnected = true; }
}

class MockGainNode extends MockAudioNode { readonly gain = new MockAudioParam(); }
class MockStereoPannerNode extends MockAudioNode { readonly pan = new MockAudioParam(); }

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
  resume(): Promise<void> { this.resumeCalls += 1; this.state = 'running'; return Promise.resolve(); }
  suspend(): Promise<void> { this.suspendCalls += 1; this.state = 'suspended'; return Promise.resolve(); }
}

beforeEach(() => {
  contexts.length = 0;
  intervalCallbacks.length = 0;
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
});

afterEach(() => vi.unstubAllGlobals());

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

  it('bounds active voices by stealing the quietest and then the oldest voice', () => {
    const audio = new AudioSystem();
    audio.unlock();
    const context = contexts[0];
    for (let index = 0; index < 32; index += 1) audio.tone(220 + index, 2, 'square', index === 1 ? .005 : .1);
    audio.tone(440, 2, 'square', .1);

    expect(context.oscillators).toHaveLength(33);
    expect(context.oscillators[0].stopCalls).toHaveLength(1);
    expect(context.oscillators[1].stopCalls).toHaveLength(2);
    expect(context.oscillators[1].disconnected).toBe(true);

    audio.tone(550, 2, 'square', .1);
    expect(context.oscillators[0].stopCalls).toHaveLength(2);
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
    expect(audio.diagnostics()).toEqual({
      lifecycleSuspended: false,
      activeVoices: 0,
      lastSpatialCue: { kind: 'enemy:denial-officer:attack', pan: -.35, gain: .72 },
    });
  });
});
