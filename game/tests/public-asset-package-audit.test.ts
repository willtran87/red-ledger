import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface CatalogFile {
  readonly url: string;
  readonly sourcePath: string;
}

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const catalogPath = join(projectRoot, 'assets/data/runtime-assets.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as Record<string, unknown> & {
  counts: { files: number };
};

const collectCatalogFiles = (value: unknown, output: CatalogFile[] = []): CatalogFile[] => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectCatalogFiles(item, output));
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.url === 'string' && typeof record.sourcePath === 'string') {
      output.push({ url: record.url, sourcePath: record.sourcePath });
    }
    Object.values(record).forEach((item) => collectCatalogFiles(item, output));
  }
  return output;
};

const walkFiles = (root: string): string[] => readdirSync(root).flatMap((name) => {
  const path = join(root, name);
  return statSync(path).isDirectory() ? walkFiles(path) : [path];
});

const catalogFiles = collectCatalogFiles(catalog);

describe('public runtime asset URLs and package', () => {
  it('maps every catalog URL to an existing traversal-safe source file', () => {
    expect(catalogFiles.length).toBeGreaterThan(3_000);
    const failures: string[] = [];
    for (const file of catalogFiles) {
      const normalizedSource = file.sourcePath.replaceAll('\\', '/');
      const expectedUrl = normalizedSource.replace(/^assets/, '');
      const absolute = normalize(join(projectRoot, file.sourcePath));
      const outsideProject = relative(projectRoot, absolute).split(sep).includes('..');
      if (file.url !== expectedUrl) failures.push(`${file.url}: expected URL ${expectedUrl}`);
      if (!file.url.startsWith('/public_runtime/') || file.url.includes('..') || file.url.includes('\\')) {
        failures.push(`${file.url}: unsafe or non-public URL`);
      }
      if (outsideProject || !existsSync(absolute)) failures.push(`${file.url}: missing ${file.sourcePath}`);
    }
    expect(failures).toEqual([]);
  });

  it('has valid PNG signatures, parseable JSON, unique URLs, and an accurate inventory count', () => {
    const publicRoot = join(projectRoot, 'assets/public_runtime');
    const files = walkFiles(publicRoot);
    expect(files).toHaveLength(catalog.counts.files);
    const pathsByUrl = new Map<string, Set<string>>();
    catalogFiles.forEach((file) => {
      const paths = pathsByUrl.get(file.url) ?? new Set<string>();
      paths.add(file.sourcePath.replaceAll('\\', '/'));
      pathsByUrl.set(file.url, paths);
    });
    expect(pathsByUrl.size).toBe(catalog.counts.files);
    for (const [url, paths] of pathsByUrl) expect(paths.size, url).toBe(1);

    for (const file of files) {
      if (extname(file).toLowerCase() === '.png') {
        expect(readFileSync(file).subarray(0, 8).toString('hex'), relative(publicRoot, file)).toBe('89504e470d0a1a0a');
      } else if (extname(file).toLowerCase() === '.json') {
        expect(() => JSON.parse(readFileSync(file, 'utf8')), relative(publicRoot, file)).not.toThrow();
      }
    }
  }, 15_000);

  it('resolves every literal runtime URL used by source and HTML', () => {
    const roots = [join(projectRoot, 'game/src'), join(projectRoot, 'game/index.html')];
    const sourceFiles = roots.flatMap((root) => statSync(root).isDirectory() ? walkFiles(root) : [root]);
    const urls = new Set<string>();
    const pattern = /\/public_runtime\/[A-Za-z0-9_./-]+\.(?:png|json)/g;
    sourceFiles.forEach((file) => (readFileSync(file, 'utf8').match(pattern) ?? []).forEach((url) => urls.add(url)));
    expect(urls.size).toBeGreaterThan(0);
    for (const url of urls) expect(existsSync(join(projectRoot, 'assets', url))).toBe(true);
  });

  it('ships the compact game catalog and public assets in the standalone production dist package', () => {
    const dist = join(projectRoot, 'game/dist');
    expect(existsSync(join(dist, 'data/game-assets.json'))).toBe(true);
    expect(existsSync(join(dist, 'data/runtime-assets.json'))).toBe(false);
    expect(existsSync(join(dist, 'public_runtime'))).toBe(true);
  });
});
