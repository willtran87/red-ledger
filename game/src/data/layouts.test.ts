import { describe, expect, it } from 'vitest';
import { getLayout, type LayoutId } from './layouts';

const IDS: readonly LayoutId[] = [
  'loop', 'lanes', 'bays', 'channels', 'hub', 'rings', 'descent', 'arena', 'showroom',
];

const rotate = (grid: readonly string[]): readonly string[] => {
  const height = grid.length;
  const width = grid[0].length;
  return Array.from({ length: width }, (_, x) =>
    Array.from({ length: height }, (_, z) => grid[height - 1 - z][x]).join(''),
  );
};

const mirror = (grid: readonly string[]): readonly string[] =>
  grid.map((row) => [...row].reverse().join(''));

const geometry = (grid: readonly string[]): string =>
  grid.map((row) => [...row].map((cell) => cell === '#' ? '#' : '.').join('')).join('\n');

const canonicalGeometry = (grid: readonly string[]): string => {
  const variants: string[] = [];
  let current: readonly string[] = geometry(grid).split('\n');
  for (let index = 0; index < 4; index += 1) {
    variants.push(current.join('\n'), mirror(current).join('\n'));
    current = rotate(current);
  }
  return variants.sort()[0];
};

describe('authored campaign layouts', () => {
  const entries = ([1, 2, 3] as const).flatMap((episode) =>
    IDS.map((id) => ({ episode, id, grid: getLayout(id, episode) })),
  );

  it('provides 27 closed 21 x 15 footprints', () => {
    expect(entries).toHaveLength(27);
    entries.forEach(({ episode, id, grid }) => {
      expect(grid, `${episode}:${id}`).toHaveLength(15);
      grid.forEach((row) => expect(row, `${episode}:${id}`).toHaveLength(21));
      expect(grid[0], `${episode}:${id}`).toBe('#'.repeat(21));
      expect(grid[14], `${episode}:${id}`).toBe('#'.repeat(21));
      grid.slice(1, -1).forEach((row) => {
        expect(row[0], `${episode}:${id}`).toBe('#');
        expect(row[20], `${episode}:${id}`).toBe('#');
      });
    });
  });

  it('retains combat space, secrets, mechanisms, and doors in every map', () => {
    entries.forEach(({ episode, id, grid }) => {
      const cells = grid.join('');
      expect(cells, `${episode}:${id} walkable`).toMatch(/[.,awvsDRYC]/);
      expect(cells, `${episode}:${id} secrets`).toContain('s');
      expect(cells, `${episode}:${id} mechanism`).toMatch(/[a,]/);
      expect(cells, `${episode}:${id} doors`).toMatch(/[DRYC]/);
    });
  });

  it('contains the credential gates required by each campaign map', () => {
    const required: Readonly<Record<1 | 2 | 3, Readonly<Record<LayoutId, string>>>> = {
      1: { loop: 'R', lanes: 'R', bays: 'Y', channels: 'RY', hub: 'RC', rings: 'RYC', descent: 'RYC', arena: '', showroom: 'RY' },
      2: { loop: 'Y', lanes: 'CY', bays: 'RC', channels: 'RYC', hub: 'RC', rings: 'RC', descent: 'RY', arena: '', showroom: 'RYC' },
      3: { loop: 'Y', lanes: 'RC', bays: 'RYC', channels: 'RYC', hub: 'RYC', rings: 'CY', descent: 'RY', arena: '', showroom: 'RC' },
    };
    entries.forEach(({ episode, id, grid }) => {
      const cells = grid.join('');
      [...required[episode][id]].forEach((credential) =>
        expect(cells, `${episode}:${id} credential ${credential}`).toContain(credential));
    });
  });

  it('keeps every occupiable sector in one navigation component', () => {
    const disconnected: string[] = [];
    entries.forEach(({ episode, id, grid }) => {
      const open = new Set<string>();
      grid.forEach((row, z) => [...row].forEach((cell, x) => {
        if (cell !== '#') open.add(`${x},${z}`);
      }));
      const pending = [open.values().next().value as string];
      const visited = new Set(pending);
      while (pending.length > 0) {
        const [x, z] = pending.shift()!.split(',').map(Number);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const key = `${x + dx},${z + dz}`;
          if (open.has(key) && !visited.has(key)) {
            visited.add(key);
            pending.push(key);
          }
        }
      }
      if (visited.size !== open.size) {
        const missing = [...open].filter((key) => !visited.has(key)).join(' ');
        disconnected.push(`${episode}:${id} connected ${visited.size}/${open.size}; missing ${missing}`);
      }
    });
    expect(disconnected).toEqual([]);
  });

  it('has no duplicate, mirrored, or rotated solid-wall topology', () => {
    const canonical = entries.map(({ grid }) => canonicalGeometry(grid));
    expect(new Set(canonical).size).toBe(entries.length);
  });
});
