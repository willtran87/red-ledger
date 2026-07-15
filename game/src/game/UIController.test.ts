import { describe, expect, it } from 'vitest';
import { automapPanDelta, boundedReplayEntries } from './UIController';

describe('automap pointer panning', () => {
  it('tracks pointer pixels independently of cell scale', () => {
    for (const cellSize of [18, 32, 64]) {
      expect(automapPanDelta(48, cellSize) * cellSize).toBeCloseTo(48, 6);
      expect(automapPanDelta(-27, cellSize) * cellSize).toBeCloseTo(-27, 6);
    }
  });

  it('ignores movement until a rendered map scale is available', () => {
    expect(automapPanDelta(48, 0)).toBe(0);
    expect(automapPanDelta(48, Number.NaN)).toBe(0);
  });
});

describe('session replay library bounds', () => {
  const entry = (id: string, createdAt: number, payload = '') => ({ id, createdAt, payload });

  it('retains the replay currently being added while enforcing the count limit', () => {
    const entries = Array.from({ length: 8 }, (_, index) => entry(`replay-${index}`, index));
    const bounded = boundedReplayEntries(entries, 'replay-0', 6, Number.MAX_SAFE_INTEGER);
    expect(bounded).toHaveLength(6);
    expect(bounded.map((item) => item.id)).toEqual([
      'replay-7', 'replay-6', 'replay-5', 'replay-4', 'replay-3', 'replay-0',
    ]);
  });

  it('evicts optional entries to meet the aggregate byte budget without discarding the protected replay', () => {
    const required = entry('required', 1, 'r'.repeat(40));
    const entries = [required, entry('newest', 3, 'n'.repeat(80)), entry('middle', 2, 'm'.repeat(80))];
    const requiredBytes = JSON.stringify([required]).length * 2;
    expect(boundedReplayEntries(entries, required.id, 6, requiredBytes + 4)).toEqual([required]);
    expect(boundedReplayEntries(entries, undefined, 6, 1).map((item) => item.id)).toEqual(['newest']);
  });
});
