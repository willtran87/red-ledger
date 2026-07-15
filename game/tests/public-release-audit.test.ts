import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const dist = join(projectRoot, 'game/dist');
const assetData = join(projectRoot, 'assets/data');
const repositoryTextExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.ps1', '.py', '.sh', '.ts', '.txt', '.yaml', '.yml']);
const walk = (root: string): string[] => readdirSync(root).flatMap((name) => {
  const path = join(root, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

describe('public release identity and notices', () => {
  it('ships the compact game catalog and legal notices', () => {
    const fullCatalog = join(assetData, 'runtime-assets.json');
    const gameCatalog = join(assetData, 'game-assets.json');
    expect(existsSync(gameCatalog)).toBe(true);
    expect(statSync(gameCatalog).size).toBeLessThan(statSync(fullCatalog).size * .15);
    expect(existsSync(join(dist, 'data/game-assets.json'))).toBe(true);
    expect(existsSync(join(dist, 'data/runtime-assets.json'))).toBe(false);
    expect(existsSync(join(dist, 'LICENSE.txt'))).toBe(true);
    expect(existsSync(join(dist, 'THIRD_PARTY_NOTICES.txt'))).toBe(true);
    expect(readFileSync(join(dist, 'THIRD_PARTY_NOTICES.txt'), 'utf8')).toContain('three.js authors');
  });

  it('contains no absolute workstation paths in tracked text files', () => {
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: projectRoot, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
    const workstationPath = /(?:[a-z]:[\\/](?:users|documents and settings)[\\/]|\/users\/[^/]+\/|\/home\/[^/]+\/)/i;
    const failures = tracked.filter((name) => {
      const file = join(projectRoot, name);
      const textFile = repositoryTextExtensions.has(extname(file).toLowerCase()) || !extname(file);
      return textFile && existsSync(file) && workstationPath.test(readFileSync(file, 'utf8'));
    });
    expect(failures).toEqual([]);
  });

  it('contains no restricted reference identity in public filenames or text', () => {
    const restricted = [
      { label: 'restricted insurer identity', pattern: /\btravelers(?: insurance)?\b/i },
      { label: 'reference game title', pattern: /\bdoom\b/i },
      { label: 'reference studio identity', pattern: /\bid software\b/i },
      { label: 'restricted logo description', pattern: /\bumbrella logo\b/i },
    ];
    const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.txt']);
    const failures: string[] = [];
    for (const file of walk(dist)) {
      const name = relative(dist, file).replaceAll('\\', '/');
      for (const entry of restricted) if (entry.pattern.test(name)) failures.push(`${name}: ${entry.label} in filename`);
      if (!textExtensions.has(extname(file).toLowerCase())) continue;
      const content = readFileSync(file, 'utf8');
      for (const entry of restricted) if (entry.pattern.test(content)) failures.push(`${name}: ${entry.label} in content`);
    }
    expect(failures).toEqual([]);
  });
});
