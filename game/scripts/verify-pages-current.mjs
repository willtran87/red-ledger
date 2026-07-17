import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(gameRoot, 'dist');
const destination = resolve(gameRoot, '../docs');
const ignored = new Set(['.nojekyll']);

const noJekyll = resolve(destination, '.nojekyll');
if (!existsSync(noJekyll) || !statSync(noJekyll).isFile()) {
  throw new Error('docs/.nojekyll is missing. Run npm run pages:sync before publishing.');
}

const inventory = (root) => {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files.push(relative(root, absolute).replaceAll('\\', '/'));
    }
  };
  visit(root);
  return files.sort();
};
const digest = (root, file) => createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex');

const built = inventory(source);
const published = inventory(destination);
if (JSON.stringify(built) !== JSON.stringify(published)) {
  throw new Error('docs/ file inventory is stale. Run npm run pages:sync after building.');
}
for (const file of built) {
  if (digest(source, file) !== digest(destination, file)) {
    throw new Error(`docs/${file} is stale. Run npm run pages:sync after building.`);
  }
}
console.log(`GitHub Pages source matches the production build exactly (${built.length} files)`);
