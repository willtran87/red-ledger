import type { MapId } from '../data';
import { runtimeUrl } from './AssetCatalog';
import { GameEngine, type GameSnapshot } from './GameEngine';
import {
  PlaytestRecorder,
  candidateAssetFingerprint,
  type PlaytestRuntimeSample,
  type PlaytestSnapshot,
} from './PlaytestRecorder';

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing playtest control ${selector}`);
  return element;
};

const cleanRenderer = (value: unknown): string => String(value || 'unknown')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 160) || 'unknown';

const snapshotForRecorder = (snapshot: GameSnapshot, difficulty: string): PlaytestSnapshot => ({
  mode: snapshot.mode,
  mapId: snapshot.map.id,
  difficulty,
  player: {
    x: snapshot.player.position.x,
    z: snapshot.player.position.z,
    yaw: snapshot.player.yaw,
    pitch: snapshot.player.pitch,
  },
});

const downloadJson = (value: unknown): void => {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'red-ledger-playtest-report.json';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export interface InstalledPlaytestTools {
  observeSnapshot(snapshot: GameSnapshot): void;
}

export function installPlaytestTools(game: GameEngine, canvas: HTMLCanvasElement): InstalledPlaytestTools {
  game.setPlaytestReadOnly(true);
  const controls = $('#playtest-tools');
  const dialog = $<HTMLDialogElement>('#playtest-report-dialog');
  const reportOutput = $<HTMLElement>('#playtest-report-output');
  const status = $('#playtest-status');
  const context = game.renderer.getContext();
  const rendererName = cleanRenderer(context.getParameter(context.RENDERER));
  const recorder = new PlaytestRecorder(rendererName, candidateAssetFingerprint([
    runtimeUrl('data/game-assets.json'),
    runtimeUrl('audio/audio-library.json'),
  ]));

  controls.toggleAttribute('hidden', false);
  const runtimeSample = (): PlaytestRuntimeSample => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
    const audio = game.audio.diagnostics();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      renderScale: Number($<HTMLSelectElement>('#render-scale').value),
      ...(typeof memory?.usedJSHeapSize === 'number' ? { usedHeapBytes: memory.usedJSHeapSize } : {}),
      drawCalls: game.renderer.info.render.calls,
      triangles: game.renderer.info.render.triangles,
      textures: game.renderer.info.memory.textures,
      audio,
    };
  };

  const sampleNow = (): void => recorder.sampleRuntime(runtimeSample());
  sampleNow();
  window.setInterval(sampleNow, 500);
  const frame = (timestamp: number): void => {
    recorder.recordFrame(timestamp, document.visibilityState === 'visible');
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => recorder.pauseFrames());
  window.addEventListener('input-action', (event) => {
    const action = (event as CustomEvent<{ action?: unknown }>).detail?.action;
    if (typeof action === 'string') recorder.observeInput(action);
  });

  const envelope = async () => {
    sampleNow();
    return recorder.checksummedReport();
  };
  const busy = async (button: HTMLButtonElement, action: () => Promise<void>): Promise<void> => {
    button.disabled = true;
    try {
      await action();
    } finally {
      button.disabled = false;
    }
  };

  $<HTMLButtonElement>('#playtest-preview').addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    void busy(button, async () => {
      reportOutput.textContent = JSON.stringify(await envelope(), null, 2);
      if (!dialog.open) dialog.showModal();
    });
  });
  $<HTMLButtonElement>('#playtest-export').addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    void busy(button, async () => downloadJson(await envelope()));
  });
  $<HTMLButtonElement>('#playtest-clear').addEventListener('click', () => {
    recorder.clear();
    sampleNow();
    status.textContent = 'Session cleared';
  });
  $<HTMLButtonElement>('#playtest-report-close').addEventListener('click', () => dialog.close());
  $<HTMLButtonElement>('#playtest-stage').addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const mapId = $<HTMLSelectElement>('#playtest-map').value as MapId;
    recorder.suspendAttemptTracking();
    game.loadMap(mapId, false, false);
    game.pause();
    const pointerLock = matchMedia('(pointer: fine)').matches
      ? (() => {
        try {
          return Promise.resolve(canvas.requestPointerLock()).catch(() => undefined);
        } catch {
          return Promise.resolve();
        }
      })()
      : Promise.resolve();
    button.disabled = true;
    void Promise.all([game.assets.waitForTextures(), pointerLock]).catch(() => undefined).finally(() => {
      recorder.resumeAttemptTracking();
      game.resume();
      document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
      $('#ready-overlay').toggleAttribute('hidden', true);
      canvas.focus({ preventScroll: true });
      status.textContent = `${mapId} staged`;
      button.disabled = false;
    });
  });

  return {
    observeSnapshot(snapshot: GameSnapshot): void {
      recorder.observeSnapshot(snapshotForRecorder(snapshot, game.difficulty));
    },
  };
}
