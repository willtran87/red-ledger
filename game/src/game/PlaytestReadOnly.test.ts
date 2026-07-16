import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from './GameEngine';

afterEach(() => vi.unstubAllGlobals());

describe('playtest read-only staging', () => {
  it('blocks checkpoint, quick, manual, and deletion writes', () => {
    const persistence = {
      autosave: vi.fn(),
      loadEpisodeRecovery: vi.fn(),
      saveEpisodeRecovery: vi.fn(),
      quicksave: vi.fn(),
      saveManual: vi.fn(),
      clearManual: vi.fn(),
    };
    const game = {
      playtestReadOnly: false,
      activeDemo: undefined,
      demoReadOnly: false,
      world: { map: { episode: 'episode-1', index: 1 } },
      persistence,
      audio: { uiCue: vi.fn() },
      createSaveData: vi.fn(),
      saveMetadata: vi.fn(),
    };
    GameEngine.prototype.setPlaytestReadOnly.call(game as never, true);
    GameEngine.prototype.save.call(game as never);
    GameEngine.prototype.saveManual.call(game as never, 1);
    GameEngine.prototype.deleteManual.call(game as never, 1);
    const checkpoint = (GameEngine.prototype as unknown as { checkpoint(this: typeof game): void }).checkpoint;
    checkpoint.call(game);

    expect(persistence.autosave).not.toHaveBeenCalled();
    expect(persistence.saveEpisodeRecovery).not.toHaveBeenCalled();
    expect(persistence.quicksave).not.toHaveBeenCalled();
    expect(persistence.saveManual).not.toHaveBeenCalled();
    expect(persistence.clearManual).not.toHaveBeenCalled();
    expect(game.createSaveData).not.toHaveBeenCalled();
  });

  it('blocks legacy-save migration before playtest initialization completes', () => {
    const persistence = { newestValidContinue: vi.fn(), quicksave: vi.fn() };
    const storage = { getItem: vi.fn() };
    const game = { playtestReadOnly: true, persistence };
    const migrateLegacySave = (GameEngine.prototype as unknown as {
      migrateLegacySave(this: typeof game, source: typeof storage): void;
    }).migrateLegacySave;
    migrateLegacySave.call(game, storage);

    expect(persistence.newestValidContinue).not.toHaveBeenCalled();
    expect(persistence.quicksave).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it('finishes staged maps normally while producing no campaign mutation', () => {
    vi.stubGlobal('document', { exitPointerLock: vi.fn() });
    const persistence = {
      campaignUnlocks: vi.fn(),
      completeMap: vi.fn(),
      completeEpisode: vi.fn(),
    };
    const game = {
      playtestReadOnly: true,
      activeDemo: undefined,
      demoReadOnly: false,
      demoRecorder: undefined,
      world: {
        map: {
          id: 'E2M8',
          episode: 'episode-2',
          index: 8,
          parSeconds: 300,
          secretExitTo: undefined,
        },
      },
      tally: { kills: 10, totalKills: 10, items: 2, totalItems: 4, secrets: 0, totalSecrets: 1, elapsed: 240 },
      momentum: { chain: 2, best: 4, score: 2_000, timer: 0 },
      difficulty: 'field-adjuster',
      persistence,
      audio: {
        worldCue: vi.fn(),
        uiCue: vi.fn(),
        startEndingMusic: vi.fn(),
        startIntermissionMusic: vi.fn(),
      },
      onIntermission: vi.fn(),
      emit: vi.fn(),
      mode: 'playing',
      lastMapResult: undefined,
      nextMap: undefined,
    };
    const completeMap = (GameEngine.prototype as unknown as {
      completeMap(this: typeof game): void;
    }).completeMap;
    completeMap.call(game);

    expect(game.mode).toBe('intermission');
    expect(game.lastMapResult).toMatchObject({
      newBests: ['Playtest only'],
      record: { mapId: 'E2M8', completions: 1, achievedAt: 0 },
    });
    expect(persistence.campaignUnlocks).not.toHaveBeenCalled();
    expect(persistence.completeMap).not.toHaveBeenCalled();
    expect(persistence.completeEpisode).not.toHaveBeenCalled();
    expect(game.onIntermission).toHaveBeenCalledOnce();
  });

  it('restarts a staged map fresh without consulting real autosaves or recovery', () => {
    const game = {
      playtestReadOnly: true,
      world: { map: { id: 'E3M8' } },
      persistence: { listAutosaves: vi.fn(), loadEpisodeRecovery: vi.fn() },
      loadMap: vi.fn(),
    };
    expect(GameEngine.prototype.restartFromCheckpoint.call(game as never)).toBe(true);
    expect(game.loadMap).toHaveBeenCalledWith('E3M8', false, false);
    expect(game.persistence.listAutosaves).not.toHaveBeenCalled();
    expect(game.persistence.loadEpisodeRecovery).not.toHaveBeenCalled();
  });
});
