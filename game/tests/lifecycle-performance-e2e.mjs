import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
fs.mkdirSync('output/lifecycle-performance', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-precise-memory-info'] });
try {
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const loadStarted = performance.now();
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
const readyMilliseconds = performance.now() - loadStarted;
assert(readyMilliseconds < 10000, `Interactive startup exceeded 10 seconds: ${Math.round(readyMilliseconds)}ms`);

await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').first().click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
await page.waitForTimeout(250);

const mapIds = await page.evaluate(() => Object.keys(JSON.parse(window.render_game_to_text()).map ? {
  E1M1: 1, E1M2: 1, E1M3: 1, E1M4: 1, E1M5: 1, E1M6: 1, E1M7: 1, E1M8: 1, E1M9: 1,
  E2M1: 1, E2M2: 1, E2M3: 1, E2M4: 1, E2M5: 1, E2M6: 1, E2M7: 1, E2M8: 1, E2M9: 1,
  E3M1: 1, E3M2: 1, E3M3: 1, E3M4: 1, E3M5: 1, E3M6: 1, E3M7: 1, E3M8: 1, E3M9: 1,
} : {}));
for (const id of mapIds) await page.evaluate((mapId) => window.__redLedger.loadMap(mapId), id);
let runtime = JSON.parse(await page.evaluate(() => window.render_game_to_text())).runtime;
assert(runtime.textureCount < 256, `Map transitions retained too many GPU textures: ${runtime.textureCount}`);

await page.evaluate(() => window.__redLedger.loadMap('E3M7'));
const sightQueriesBefore = JSON.parse(await page.evaluate(() => window.render_game_to_text())).runtime.lineOfSightQueries;
await page.waitForTimeout(3000);
const sightQueriesAfter = JSON.parse(await page.evaluate(() => window.render_game_to_text())).runtime.lineOfSightQueries;
const denseMapSightQueries = sightQueriesAfter - sightQueriesBefore;
assert(denseMapSightQueries <= 6000, `Dense-map visibility budget regressed: ${denseMapSightQueries} sight queries in 3 seconds`);

await page.reload({ waitUntil: 'networkidle' });
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').first().click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
await page.evaluate(() => {
  const scale = document.querySelector('#render-scale');
  scale.value = '3';
  scale.dispatchEvent(new Event('change', { bubbles: true }));
  window.__redLedger.loadMap('E2M6');
});
await page.waitForTimeout(250);
const highResolutionFrameStats = await page.evaluate(() => new Promise((resolve) => {
  const intervals = [];
  let first;
  let previous;
  const sample = (now) => {
    first ??= now;
    if (previous !== undefined) intervals.push(now - previous);
    previous = now;
    if (now - first < 3000) requestAnimationFrame(sample);
    else {
      intervals.sort((a, b) => a - b);
      resolve({
        frames: intervals.length,
        mean: intervals.reduce((total, value) => total + value, 0) / Math.max(1, intervals.length),
        p95: intervals[Math.floor(intervals.length * .95)] ?? 0,
      });
    }
  };
  requestAnimationFrame(sample);
}));
assert(highResolutionFrameStats.frames >= 55 && highResolutionFrameStats.p95 <= 150,
  `960x600 hazard-map pacing regressed: frames=${highResolutionFrameStats.frames} p95=${highResolutionFrameStats.p95.toFixed(1)}ms`);
await page.evaluate(() => {
  const scale = document.querySelector('#render-scale');
  scale.value = '1';
  scale.dispatchEvent(new Event('change', { bubbles: true }));
  window.__redLedger.loadMap('E1M1');
});
await page.waitForTimeout(800);
const combatStart = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert(combatStart.tally.totalKills - combatStart.tally.kills >= 8, 'Performance soak does not contain at least eight live hostiles');
await page.locator('#game-canvas').click({ position: { x: 900, y: 420 } });
await page.keyboard.down('ArrowRight');
await page.mouse.down();
const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
const frameStats = await page.evaluate(() => new Promise((resolve) => {
  const intervals = [];
  let first;
  let previous;
  const sample = (now) => {
    first ??= now;
    if (previous !== undefined) intervals.push(now - previous);
    previous = now;
    if (now - first < 10000) requestAnimationFrame(sample);
    else {
      intervals.sort((a, b) => a - b);
      const mean = intervals.reduce((total, value) => total + value, 0) / Math.max(1, intervals.length);
      resolve({ frames: intervals.length, mean, p95: intervals[Math.floor(intervals.length * .95)] ?? 0 });
    }
  };
  requestAnimationFrame(sample);
}));
await page.mouse.up();
await page.keyboard.up('ArrowRight');
const heapAfter = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
assert(JSON.parse(await page.evaluate(() => window.render_game_to_text())).mode === 'playing', 'Player did not survive the active-combat soak on Orientation difficulty');
const report = {
  passed: false,
  readyMilliseconds: Math.round(readyMilliseconds),
  liveHostiles: combatStart.tally.totalKills - combatStart.tally.kills,
  frameStats,
  highResolutionFrameStats,
  heapGrowthBytes: heapAfter && heapBefore ? heapAfter - heapBefore : null,
  textureCount: runtime.textureCount,
  denseMapSightQueries,
  contextLossSupported: null,
};
fs.writeFileSync('output/lifecycle-performance/report.json', JSON.stringify(report, null, 2));
// SwiftShader is a CPU fallback, so this gate protects a stable 22 FPS floor;
// representative GPU hardware remains responsible for the 60 FPS release target.
assert(frameStats.frames >= 220, `10-second software-renderer soak delivered only ${frameStats.frames} frames`);
assert(frameStats.mean < 46 && frameStats.p95 <= 100, `Software-renderer frame pacing regressed: mean=${frameStats.mean.toFixed(1)}ms p95=${frameStats.p95.toFixed(1)}ms`);
if (heapBefore && heapAfter) assert(heapAfter - heapBefore < 64 * 1024 * 1024, `Heap grew by ${Math.round((heapAfter - heapBefore) / 1048576)}MB during the soak`);

await page.evaluate(() => window.dispatchEvent(new Event('blur')));
await page.waitForTimeout(80);
assert(JSON.parse(await page.evaluate(() => window.render_game_to_text())).mode === 'paused', 'Window blur did not pause and clear live input');
assert(await page.locator('#pause-menu').isVisible(), 'Lifecycle pause did not expose a resumable screen');
const pausedRenderCount = JSON.parse(await page.evaluate(() => window.render_game_to_text())).runtime.renderCount;
await page.waitForTimeout(250);
assert(JSON.parse(await page.evaluate(() => window.render_game_to_text())).runtime.renderCount === pausedRenderCount,
  'Paused runtime continued rendering unchanged frames');
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
await page.waitForTimeout(40);
assert(JSON.parse(await page.evaluate(() => window.render_game_to_text())).runtime.renderCount > pausedRenderCount,
  'Paused viewport resize did not redraw the canvas');
await page.click('#resume-game');

const contextLossSupported = await page.evaluate(() => {
  const canvas = document.querySelector('#game-canvas');
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  const extension = gl?.getExtension('WEBGL_lose_context');
  extension?.loseContext();
  return Boolean(extension);
});
if (contextLossSupported) {
  await page.waitForTimeout(100);
  assert(await page.locator('#fatal-error').isVisible(), 'WebGL context loss did not expose recovery UI');
  assert(await page.locator('#fatal-reload').isVisible(), 'Context-loss recovery UI has no reload action');
}

assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
report.passed = true;
report.contextLossSupported = contextLossSupported;
fs.writeFileSync('output/lifecycle-performance/report.json', JSON.stringify(report, null, 2));
console.log(`Lifecycle/performance passed: ready=${report.readyMilliseconds}ms hostiles=${report.liveHostiles} frames=${frameStats.frames} mean=${frameStats.mean.toFixed(1)}ms p95=${frameStats.p95.toFixed(1)}ms textures=${runtime.textureCount}`);
} finally {
  await browser.close();
}
