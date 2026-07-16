import './style.css';
import { GameEngine } from './game/GameEngine';
import { UIController } from './game/UIController';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Game canvas is missing');

type FatalContext = 'startup' | 'runtime' | 'graphics';

const showFatalError = (reason: unknown, context: FatalContext = 'startup'): void => {
  const message = reason instanceof Error ? reason.message : String(reason || 'Unknown startup error');
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
  ['#ready-overlay', '#replay-controls', '#runtime-warning'].forEach((selector) => {
    document.querySelector<HTMLElement>(selector)?.toggleAttribute('hidden', true);
  });
  const dialog = document.querySelector<HTMLDialogElement>('#confirm-dialog');
  if (dialog?.open) dialog.close();
  const screen = document.querySelector<HTMLElement>('#fatal-error');
  const copy = document.querySelector<HTMLElement>('#fatal-error-copy');
  const reload = document.querySelector<HTMLButtonElement>('#fatal-reload');
  const introduction = context === 'startup'
    ? 'The renderer or asset library could not initialize.'
    : context === 'graphics'
      ? 'The graphics renderer stopped safely.'
      : 'An unexpected error interrupted the game.';
  if (copy) copy.textContent = `${introduction} ${message}`;
  screen?.setAttribute('aria-label', context === 'startup' ? 'Game could not start' : 'Game stopped unexpectedly');
  document.querySelector<HTMLElement>('#bootstrap-status')?.toggleAttribute('hidden', true);
  document.querySelector<HTMLElement>('#game-shell')?.setAttribute('aria-busy', 'false');
  screen?.classList.add('active');
  reload?.focus({ preventScroll: true });
};

document.querySelector<HTMLButtonElement>('#fatal-reload')?.addEventListener('click', () => location.reload());

let game: GameEngine | undefined;
const stopForRuntimeFailure = (reason: unknown): void => {
  game?.shutdownForFatal();
  showFatalError(reason, game ? 'runtime' : 'startup');
};

window.addEventListener('error', (event) => {
  if (event.defaultPrevented) return;
  event.preventDefault();
  stopForRuntimeFailure(event.error ?? new Error(event.message || 'Unknown runtime error'));
});

window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  stopForRuntimeFailure(event.reason ?? new Error('Unknown asynchronous runtime error'));
});

canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  game?.shutdownForFatal();
  showFatalError(new Error('The graphics context was lost. Reload to continue.'), 'graphics');
});

try {
  game = await GameEngine.create(canvas);
} catch (error) {
  showFatalError(error);
}
if (game) initializeGame(game);

function initializeGame(activeGame: GameEngine): void {
  new UIController(activeGame);
  document.querySelector<HTMLElement>('#bootstrap-status')?.toggleAttribute('hidden', true);
  document.querySelector<HTMLElement>('#game-shell')?.setAttribute('aria-busy', 'false');
  window.render_game_to_text = () => activeGame.renderText();
  window.advanceTime = (milliseconds: number) => {
    try {
      activeGame.step(milliseconds / 1000);
    } catch (error) {
      stopForRuntimeFailure(error);
    }
  };
  if (import.meta.env.DEV) {
    const game = activeGame;
    window.__redLedger = {
    loadMap: (id) => game.loadMap(id),
    teleport: (x, z) => game.debugTeleport(x, z),
    defeatAll: () => game.debugDefeatAll(),
    defeatPlayer: () => game.debugDefeatPlayer(),
    damageActor: (id, amount) => game.debugDamageActor(id, amount),
    setAmmo: (type, amount) => game.debugSetAmmo(type, amount),
    defeatEncounter: (id) => game.debugDefeatEncounter(id),
    defeatMandatory: (id) => game.debugDefeatMandatory(id),
    teleportToPickup: (kind, id) => game.debugTeleportToPickup(kind, id),
    teleportToDoor: (credential) => game.debugTeleportToDoor(credential),
    teleportToExit: () => game.debugTeleportToExit(),
    use: () => game.debugUse(),
    fire: () => game.debugFire(),
    pause: () => game.pause(),
    resume: () => game.resume(),
    teleportToTrigger: (action, target) => game.debugTeleportToTrigger(action, target),
    defeatActor: (id) => game.debugDefeatActor(id),
    activateActor: (id) => game.debugActivateActor(id),
    particleBurst: (kind) => game.debugParticleBurst(kind),
    particleGallery: (kinds) => game.debugParticleGallery(kinds),
    selectWeapon: (id) => game.selectWeapon(id),
    teleportNearActor: (id, distance, includeDead) => game.debugTeleportNearActor(id, distance, includeDead),
    startDemo: () => game.startDemoRecording(),
    finishDemo: () => game.finishDemoRecording(),
    playDemo: (demo) => game.playDemo(demo),
    teleportNearLandmark: (index, distance) => game.debugTeleportNearLandmark(index, distance),
    failRuntime: () => requestAnimationFrame(() => {
      throw new Error('Injected runtime frame failure');
    }),
    radial: (x, y, active) => {
      game.input.gamepadLook = { x, y };
      window.dispatchEvent(new CustomEvent(active ? 'input-action' : 'input-action-release', {
        detail: { action: 'weapon-radial', source: 'gamepad', repeat: false },
      }));
    },
    };
  }
}

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (milliseconds: number) => void;
    __redLedger?: {
      loadMap: (id: import('./data').MapId) => void;
      teleport: (x: number, z: number) => void;
      defeatAll: () => void;
      defeatPlayer: () => void;
      damageActor: (id: string, amount: number) => boolean;
      setAmmo: (type: Exclude<import('./game/definitions').AmmoType, 'none'>, amount: number) => void;
      defeatEncounter: (id: string) => number;
      defeatMandatory: (id: string) => number;
      teleportToPickup: (kind: 'pickup' | 'weapon' | 'credential', id?: string) => boolean;
      teleportToDoor: (credential?: import('./data').Credential) => boolean;
      teleportToExit: () => void;
      use: () => void;
      fire: () => void;
      pause: () => void;
      resume: () => void;
      teleportToTrigger: (action: string, target?: string) => boolean;
      defeatActor: (id: string) => boolean;
      activateActor: (id: string) => boolean;
      particleBurst: (kind: import('./game/ParticleSystem').ParticleKind) => void;
      particleGallery: (kinds: readonly import('./game/ParticleSystem').ParticleKind[]) => void;
      selectWeapon: (id: import('./data').WeaponId) => boolean;
      teleportNearActor: (id: string, distance?: number, includeDead?: boolean) => boolean;
      startDemo: () => boolean;
      finishDemo: () => unknown;
      playDemo: (demo: unknown) => boolean;
      teleportNearLandmark: (index?: number, distance?: number) => boolean;
      failRuntime: () => number;
      radial: (x: number, y: number, active: boolean) => void;
    };
  }
}
