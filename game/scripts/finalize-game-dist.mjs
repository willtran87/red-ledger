import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const authoringOnlyFiles = [
  resolve(gameRoot, 'dist/data/runtime-assets.json'),
];

for (const file of authoringOnlyFiles) {
  if (existsSync(file)) rmSync(file);
}

console.log(`Removed ${authoringOnlyFiles.length} authoring-only file from dist`);
