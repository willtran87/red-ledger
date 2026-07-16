import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const requestedCommit = process.argv[2] ?? 'HEAD';
const repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const commit = execFileSync('git', ['rev-parse', `${requestedCommit}^{commit}`], { encoding: 'utf8' }).trim();
const treePaths = execFileSync(
  'git',
  ['ls-tree', '-r', '-z', '--name-only', commit, '--', 'docs'],
  { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 },
)
  .toString('utf8')
  .split('\0')
  .filter(Boolean)
  .map((path) => {
    if (!path.startsWith('docs/')) throw new Error(`Unexpected Pages tree path: ${path}`);
    if (/[\r\n]/.test(path)) throw new Error(`Pages paths cannot contain line breaks: ${JSON.stringify(path)}`);
    return path.slice('docs/'.length);
  });

const collator = new Intl.Collator('en-US', { sensitivity: 'variant' });
treePaths.sort(collator.compare);

const batchInput = treePaths.map((path) => `${commit}:docs/${path}\n`).join('');
const batch = spawnSync('git', ['cat-file', '--batch'], {
  cwd: repositoryRoot,
  input: batchInput,
  encoding: null,
  maxBuffer: 256 * 1024 * 1024,
});
if (batch.error) throw batch.error;
if (batch.status !== 0) throw new Error(batch.stderr.toString('utf8').trim() || `git cat-file exited ${batch.status}`);

let offset = 0;
let publishedBytes = 0;
const lines = [];
for (const path of treePaths) {
  const headerEnd = batch.stdout.indexOf(0x0a, offset);
  if (headerEnd < 0) throw new Error(`Missing git cat-file header for ${path}`);
  const header = batch.stdout.subarray(offset, headerEnd).toString('utf8');
  const fields = header.split(' ');
  if (fields.length !== 3 || fields[1] !== 'blob') throw new Error(`Unexpected git cat-file header for ${path}: ${header}`);
  const size = Number(fields[2]);
  const contentStart = headerEnd + 1;
  const contentEnd = contentStart + size;
  if (!Number.isSafeInteger(size) || batch.stdout[contentEnd] !== 0x0a) {
    throw new Error(`Invalid git blob framing for ${path}`);
  }
  const content = batch.stdout.subarray(contentStart, contentEnd);
  const sha256 = createHash('sha256').update(content).digest('hex');
  lines.push(`${sha256}  ${path}`);
  publishedBytes += size;
  offset = contentEnd + 1;
}
if (offset !== batch.stdout.length) throw new Error('Unexpected trailing data from git cat-file');

const manifest = `${lines.join('\n')}\n`;
const manifestPath = join(repositoryRoot, 'manifests', 'pages-artifact-sha256.txt');
writeFileSync(manifestPath, manifest, 'utf8');

console.log(JSON.stringify({
  commit,
  publishedFiles: treePaths.length,
  publishedBytes,
  manifestBytes: Buffer.byteLength(manifest),
  manifestSha256: createHash('sha256').update(manifest).digest('hex'),
  manifestPath,
}, null, 2));
