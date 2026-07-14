import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const port = Number(process.env.RELEASE_TEST_PORT ?? 5419);
const gameUrl = `http://${host}:${port}`;
const node = process.execPath;

const run = (label, args, env = {}) => new Promise((resolve, reject) => {
  console.log(`\n[release] ${label}`);
  const child = spawn(node, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`${label} failed (${signal ?? `exit ${code}`})`));
  });
});

const waitForServer = async (url, timeoutMs = 15_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* Server is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not become ready at ${url} within ${timeoutMs}ms`);
};

await run('unit and data audits', ['node_modules/vitest/vitest.mjs', 'run', 'src', 'tests']);
await run('nested production package', ['tests/production-portability-e2e.mjs']);

console.log(`\n[release] starting isolated Vite server at ${gameUrl}`);
const server = spawn(node, [
  'node_modules/vite/bin/vite.js', '--host', host, '--port', String(port), '--strictPort',
], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk; });
server.stderr.on('data', (chunk) => { serverLog += chunk; });

const browserTests = [
  ['gameplay', 'tests/gameplay-e2e.mjs'],
  ['campaign runtime', 'tests/campaign-runtime-e2e.mjs'],
  ['progression', 'tests/progression-e2e.mjs'],
  ['responsive visuals', 'tests/visual-responsive.mjs'],
  ['mobile controls', 'tests/mobile-ux-e2e.mjs'],
  ['combat and save', 'tests/combat-save-visual-e2e.mjs'],
  ['deterministic demos', 'tests/demo-runtime-e2e.mjs'],
  ['input remapping', 'tests/controls-e2e.mjs'],
  ['map mechanisms', 'tests/mechanisms-e2e.mjs'],
  ['generated particle feedback', 'tests/particles-e2e.mjs'],
  ['material and status particle feedback', 'tests/particle-materials-e2e.mjs'],
  ['combat feel and guidance', 'tests/combat-feel-e2e.mjs'],
  ['mastery records and secret discovery', 'tests/mastery-progression-e2e.mjs'],
  ['authored transient effect animation', 'tests/transient-effects-e2e.mjs'],
  ['semantic enemy and boss animation', 'tests/semantic-animation-e2e.mjs'],
  ['lifecycle and active-combat performance', 'tests/lifecycle-performance-e2e.mjs'],
  ['Chromium, Firefox, and WebKit', 'tests/cross-browser-smoke.mjs'],
];

try {
  await waitForServer(gameUrl);
  for (const [label, script] of browserTests) await run(label, [script], { GAME_URL: gameUrl });
  console.log('\n[release] all release gates passed');
} catch (error) {
  if (serverLog.trim()) console.error(`\n[release] Vite output:\n${serverLog.trim()}`);
  throw error;
} finally {
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
}
