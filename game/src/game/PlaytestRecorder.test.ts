import { describe, expect, it } from 'vitest';
import {
  PlaytestRecorder,
  candidateAssetFingerprint,
  isPlaytestFragment,
  sha256Hex,
  type CandidateAssetFingerprint,
  type PlaytestRuntimeSample,
  type PlaytestSnapshot,
} from './PlaytestRecorder';

const fingerprint: CandidateAssetFingerprint = {
  status: 'ready',
  algorithm: 'SHA-256',
  value: 'a'.repeat(64),
  components: ['data/game-assets.json', 'audio/audio-library.json'],
  bytes: 42,
};

const runtime = (overrides: Partial<PlaytestRuntimeSample> = {}): PlaytestRuntimeSample => ({
  viewportWidth: 1280,
  viewportHeight: 720,
  devicePixelRatio: 2,
  renderScale: 2,
  usedHeapBytes: 12_000,
  drawCalls: 18,
  triangles: 440,
  textures: 72,
  audio: {
    lifecycleSuspended: false,
    contextState: 'running',
    libraryStatus: 'ready',
    spriteStatus: 'loading',
    source: 'authored',
    trackSource: 'authored',
    authoredPlays: 4,
    fallbackPlays: 1,
    rejectedVoices: 0,
  },
  ...overrides,
});

const snapshot = (mode: string, mapId = 'E1M1', player: Partial<PlaytestSnapshot['player']> = {}): PlaytestSnapshot => ({
  mode,
  mapId,
  difficulty: 'field-adjuster',
  player: { x: 0, z: 0, yaw: 0, pitch: 0, ...player },
});

describe('local playtest report', () => {
  it('activates only for the exact opt-in fragment', () => {
    expect(isPlaytestFragment('#playtest')).toBe(true);
    expect(isPlaytestFragment('')).toBe(false);
    expect(isPlaytestFragment('#Playtest')).toBe(false);
    expect(isPlaytestFragment('#playtest-extra')).toBe(false);
  });

  it('collects bounded frame, device, renderer, audio, and first-action evidence', async () => {
    let now = 100;
    const recorder = new PlaytestRecorder('WebGL test renderer', Promise.resolve(fingerprint), () => now);
    recorder.recordFrame(0);
    recorder.recordFrame(16.7);
    recorder.recordFrame(33.4);
    recorder.recordFrame(90);
    recorder.sampleRuntime(runtime());
    recorder.observeSnapshot(snapshot('playing'));
    now = 160;
    recorder.observeSnapshot(snapshot('playing', 'E1M1', { x: .1, yaw: .01 }));
    now = 180;
    recorder.observeInput('fire');
    now = 200;
    recorder.observeInput('use');
    now = 240;
    recorder.observeSnapshot(snapshot('dead', 'E1M1', { x: .1, yaw: .01 }));
    recorder.sampleRuntime(runtime({
      usedHeapBytes: 18_000,
      drawCalls: 24,
      triangles: 900,
      textures: 80,
      audio: { ...runtime().audio, authoredPlays: 9, fallbackPlays: 3, rejectedVoices: 2, error: 'not exported' },
    }));

    const report = await recorder.report();
    expect(report.collection).toBe('local-opt-in');
    expect(report.transport).toBe('none');
    expect(report.persistent).toBe(false);
    expect(report.frames).toMatchObject({ samples: 3, medianMs: 16.5, p95Ms: 56.5, longFrames: 1 });
    expect(report.memory.peakHeapBytes).toBe(18_000);
    expect(report.renderer).toEqual({ maxDrawCalls: 24, maxTriangles: 900, maxTextures: 80 });
    expect(report.audio).toMatchObject({ authoredPlays: 5, fallbackPlays: 2, maxRejectedVoices: 2, errorObserved: true });
    expect(report.maps.E1M1).toEqual({ attempts: 1, deaths: 1, completions: 0 });
    expect(report.attempts[0]).toMatchObject({
      mapId: 'E1M1',
      outcome: 'dead',
      firstActionsMs: { move: 60, look: 60, fire: 80, use: 100 },
    });
  });

  it('exports a SHA-256 checksum over the exact report and no browser identity fields', async () => {
    let now = 0;
    const recorder = new PlaytestRecorder('WebGL renderer', Promise.resolve(fingerprint), () => now);
    recorder.sampleRuntime(runtime());
    recorder.observeSnapshot(snapshot('playing'));
    now = 25;
    const envelope = await recorder.checksummedReport();
    expect(envelope.checksum.value).toBe(await sha256Hex(JSON.stringify(envelope.report)));
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toMatch(/userAgent|timezone|language|platform|observer|comment/i);
  });

  it('excludes staging time and closes menu exits as abandoned attempts', async () => {
    let now = 0;
    const recorder = new PlaytestRecorder('WebGL renderer', Promise.resolve(fingerprint), () => now);
    recorder.suspendAttemptTracking();
    recorder.observeSnapshot(snapshot('playing', 'E2M8'));
    now = 8_000;
    recorder.observeSnapshot(snapshot('paused', 'E2M8'));
    recorder.resumeAttemptTracking();
    recorder.observeSnapshot(snapshot('playing', 'E2M8'));
    now = 8_120;
    recorder.observeSnapshot(snapshot('playing', 'E2M8', { x: .2 }));
    now = 8_200;
    recorder.observeSnapshot(snapshot('menu', 'E2M8', { x: .2 }));

    const report = await recorder.report();
    expect(report.maps.E2M8).toEqual({ attempts: 1, deaths: 0, completions: 0 });
    expect(report.attempts).toEqual([expect.objectContaining({
      durationMs: 200,
      outcome: 'abandoned',
      firstActionsMs: expect.objectContaining({ move: 120 }),
    })]);
  });

  it('fingerprints only the two candidate asset manifests and degrades without leaking errors', async () => {
    const calls: string[] = [];
    const result = await candidateAssetFingerprint(
      ['https://local.invalid/data/game-assets.json', 'https://local.invalid/audio/audio-library.json'],
      (async (input) => {
        calls.push(String(input));
        return new Response(calls.length === 1 ? '{"game":1}' : '{"audio":1}', { status: 200 });
      }) as typeof fetch,
    );
    expect(calls).toHaveLength(2);
    expect(result).toMatchObject({ status: 'ready', algorithm: 'SHA-256', components: fingerprint.components });
    expect(result.value).toMatch(/^[a-f0-9]{64}$/);

    const unavailable = await candidateAssetFingerprint(
      ['one', 'two'],
      (async () => new Response('', { status: 503 })) as typeof fetch,
    );
    expect(unavailable).toEqual({
      status: 'unavailable',
      algorithm: 'SHA-256',
      value: null,
      components: fingerprint.components,
      bytes: 0,
    });
  });
});
