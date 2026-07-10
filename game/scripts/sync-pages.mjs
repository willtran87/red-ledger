import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(gameRoot, '..');
const source = resolve(gameRoot, 'dist');
const destination = resolve(projectRoot, 'docs');

if (!existsSync(resolve(source, 'index.html'))) throw new Error('game/dist is missing; run npm run build first');
if (dirname(destination) !== projectRoot || destination === projectRoot) throw new Error(`Refusing unsafe Pages destination: ${destination}`);

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
writeFileSync(resolve(destination, '.nojekyll'), '');
console.log(`Synced verified production output: ${source} -> ${destination}`);
