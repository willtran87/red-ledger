import { describe, expect, it } from 'vitest';
import { GameEngine, type SaveData } from './GameEngine';
import type { SaveKind, SaveMetadata, SaveSlotResult } from './PersistenceSystem';

const slot = (
  slotId: string,
  kind: Exclude<SaveKind, 'manual'>,
  savedAt: number,
  sequence: number,
): SaveSlotResult<SaveData> => {
  const metadata: SaveMetadata = {
    slotId,
    kind,
    name: slotId,
    savedAt,
    sequence,
    episodeId: 'episode-1',
    mapId: 'E1M1',
    mapTitle: 'Intake',
    difficulty: 'field-adjuster',
    playSeconds: sequence,
    thumbnail: { kind: 'placeholder', label: 'E1M1', palette: ['#111111', '#cc0000'] },
  };
  return {
    status: 'valid',
    slotId,
    kind,
    defaultName: slotId,
    metadata,
    state: { runVariant: 'fresh-start' } as SaveData,
    persistence: 'persistent',
  };
};

describe('automatic save presentation ordering', () => {
  it('uses the monotonic sequence to order saves written in the same millisecond', () => {
    const older = slot('autosave-1', 'autosave', 1_750_000_000_000, 40);
    const newer = slot('recovery-episode-1', 'recovery', 1_750_000_000_000, 41);
    const harness = {
      persistence: { inspectAllSlots: () => [older, newer] },
      pretty: (value: string) => value,
      saveTime: (value: number) => String(value),
    };
    const automaticSlots = (GameEngine.prototype as unknown as {
      automaticSlots(this: typeof harness): readonly { slotId: string }[];
    }).automaticSlots;

    expect(automaticSlots.call(harness).map(({ slotId }) => slotId)).toEqual([
      'recovery-episode-1',
      'autosave-1',
    ]);
  });
});
