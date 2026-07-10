import './style.css';
import { GameEngine } from './game/GameEngine';
import { UIController } from './game/UIController';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Game canvas is missing');

const showFatalError = (reason: unknown): void => {
  const message = reason instanceof Error ? reason.message : String(reason || 'Unknown startup error');
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
  const screen = document.querySelector<HTMLElement>('#fatal-error');
  const copy = document.querySelector<HTMLElement>('#fatal-error-copy');
  if (copy) copy.textContent = `The renderer or asset library could not initialize. ${message}`;
  screen?.classList.add('active');
};

canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  showFatalError(new Error('The graphics context was lost. Reload to continue.'));
});

let game: GameEngine;
try {
  game = await GameEngine.create(canvas);
} catch (error) {
  showFatalError(error);
  throw error;
}
new UIController(game);

window.render_game_to_text = () => game.renderText();
window.advanceTime = (milliseconds: number) => game.step(milliseconds / 1000);
if (import.meta.env.DEV) {
  window.__redLedger = {
    loadMap: (id) => game.loadMap(id),
    teleport: (x, z) => game.debugTeleport(x, z),
    defeatAll: () => game.debugDefeatAll(),
    teleportToPickup: (kind, id) => game.debugTeleportToPickup(kind, id),
    teleportToDoor: (credential) => game.debugTeleportToDoor(credential),
    teleportToExit: () => game.debugTeleportToExit(),
    use: () => game.debugUse(),
    fire: () => game.debugFire(),
    teleportToTrigger: (action) => game.debugTeleportToTrigger(action),
    defeatActor: (id) => game.debugDefeatActor(id),
    teleportNearActor: (id, distance) => game.debugTeleportNearActor(id, distance),
    startDemo: () => game.startDemoRecording(),
    finishDemo: () => game.finishDemoRecording(),
    playDemo: (demo) => game.playDemo(demo),
    teleportNearLandmark: (index, distance) => game.debugTeleportNearLandmark(index, distance),
    radial: (x, y, active) => {
      game.input.gamepadLook = { x, y };
      window.dispatchEvent(new CustomEvent(active ? 'input-action' : 'input-action-release', {
        detail: { action: 'weapon-radial', source: 'gamepad', repeat: false },
      }));
    },
  };
}

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (milliseconds: number) => void;
    __redLedger?: {
      loadMap: (id: import('./data').MapId) => void;
      teleport: (x: number, z: number) => void;
      defeatAll: () => void;
      teleportToPickup: (kind: 'pickup' | 'weapon' | 'credential', id?: string) => boolean;
      teleportToDoor: (credential?: import('./data').Credential) => boolean;
      teleportToExit: () => void;
      use: () => void;
      fire: () => void;
      teleportToTrigger: (action: string) => boolean;
      defeatActor: (id: string) => boolean;
      teleportNearActor: (id: string, distance?: number) => boolean;
      startDemo: () => boolean;
      finishDemo: () => unknown;
      playDemo: (demo: unknown) => boolean;
      teleportNearLandmark: (index?: number, distance?: number) => boolean;
      radial: (x: number, y: number, active: boolean) => void;
    };
  }
}
