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

const runWithRetry = async (label, args, env = {}, attempts = 1) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await run(label, args, env);
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.warn(`[release] ${label} missed attempt ${attempt}/${attempts}; retrying after browser cleanup`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
};

const waitForServer = async (url, child, timeoutMs = 15_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Vite exited before becoming ready at ${url}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Vite exited while checking ${url}`);
        return;
      }
    } catch { /* Server is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not become ready at ${url} within ${timeoutMs}ms`);
};

await run('unit and data audits', ['node_modules/vitest/vitest.mjs', 'run', 'src', 'tests']);
await run('nested production package', ['tests/production-portability-e2e.mjs']);
await run('production local playtest report', ['tests/playtest-report-e2e.mjs']);

console.log(`\n[release] starting isolated Vite server at ${gameUrl}`);
const server = spawn(node, [
  'node_modules/vite/bin/vite.js', '--host', host, '--port', String(port), '--strictPort',
], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk; });
server.stderr.on('data', (chunk) => { serverLog += chunk; });

const browserTests = [
  ['lifecycle and active-combat performance', 'tests/lifecycle-performance-e2e.mjs', 2],
  ['gameplay', 'tests/gameplay-e2e.mjs'],
  ['campaign runtime', 'tests/campaign-runtime-e2e.mjs'],
  ['authored streaming audio and fallback recovery', 'tests/authored-audio-e2e.mjs'],
  ['campaign credential guidance', 'tests/campaign-guidance-e2e.mjs'],
  ['progression', 'tests/progression-e2e.mjs'],
  ['optional encounter progression', 'tests/optional-encounter-e2e.mjs'],
  ['intermission replay navigation', 'tests/intermission-navigation-e2e.mjs'],
  ['responsive visuals', 'tests/visual-responsive.mjs'],
  ['mobile controls', 'tests/mobile-ux-e2e.mjs'],
  ['combat and save', 'tests/combat-save-visual-e2e.mjs'],
  ['save management and recovery', 'tests/save-management-e2e.mjs'],
  ['periodic and lifecycle recovery checkpoints', 'tests/recovery-checkpoint-e2e.mjs'],
  ['multi-tab persistence safety', 'tests/multitab-persistence-e2e.mjs'],
  ['deterministic demos', 'tests/demo-runtime-e2e.mjs'],
  ['player replay library', 'tests/replay-library-e2e.mjs'],
  ['navigation and session continuity', 'tests/navigation-continuity-e2e.mjs'],
  ['startup and storage resilience', 'tests/resilience-e2e.mjs'],
  ['critical map texture readiness', 'tests/asset-readiness-e2e.mjs'],
  ['hostile telegraphs', 'tests/hostile-telegraph-e2e.mjs'],
  ['input remapping', 'tests/controls-e2e.mjs'],
  ['weapon selection and fallback', 'tests/weapon-selection-e2e.mjs'],
  ['map mechanisms', 'tests/mechanisms-e2e.mjs'],
  ['generated particle feedback', 'tests/particles-e2e.mjs'],
  ['material and status particle feedback', 'tests/particle-materials-e2e.mjs'],
  ['movement, mover, checkpoint, and threat particle wiring', 'tests/particle-feedback-wiring-e2e.mjs'],
  ['combat feel and guidance', 'tests/combat-feel-e2e.mjs'],
  ['aggregated and accessible combat feedback', 'tests/combat-feedback-e2e.mjs'],
  ['timed power-up HUD', 'tests/powerup-hud-e2e.mjs'],
  ['mastery records and secret discovery', 'tests/mastery-progression-e2e.mjs'],
  ['milestone ledger and cosmetic awards', 'tests/milestone-ledger-e2e.mjs'],
  ['authored transient effect animation', 'tests/transient-effects-e2e.mjs'],
  ['binding beam presentation', 'tests/binding-beam-e2e.mjs'],
  ['semantic enemy and boss animation', 'tests/semantic-animation-e2e.mjs'],
  ['Chromium, Firefox, and WebKit', 'tests/cross-browser-smoke.mjs'],
];

try {
  await waitForServer(gameUrl, server);
  for (const [label, script, attempts] of browserTests) {
    await runWithRetry(label, [script], { GAME_URL: gameUrl }, attempts);
  }
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
