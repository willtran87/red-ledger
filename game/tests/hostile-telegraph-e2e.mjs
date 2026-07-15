import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
await mkdir('output/hostile-telegraphs', { recursive: true });

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').first().click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

const maps = ['E2M1', 'E2M2', 'E2M3', 'E2M4', 'E2M5', 'E2M6', 'E2M7', 'E2M8'];
const lateMaps = ['E3M1', 'E3M2', 'E3M3', 'E3M4', 'E3M5', 'E3M6', 'E3M7', 'E3M8'];
const denialMap = await page.evaluate((ids) => {
  for (const id of ids) {
    window.__redLedger.loadMap(id);
    if (window.__redLedger.activateActor('denial-officer') && window.__redLedger.teleportNearActor('denial-officer', 7)) return id;
  }
  return undefined;
}, maps);
assert(denialMap, 'No Denial Officer was available for telegraph coverage');

let nearCue;
for (let attempt = 0; attempt < 30; attempt += 1) {
  await page.evaluate(() => window.advanceTime(35));
  nearCue = (await state()).audio.lastSpatialCue;
  if (nearCue?.kind.includes('denial-officer')) break;
}
assert(nearCue?.gain > .7, `Nearby hostile audio was not full and readable: ${JSON.stringify(nearCue)}`);

assert((await state()).visibleActors.some((candidate) => candidate.id === 'denial-officer'), 'Nearby Denial Officer was not represented in text state');
await page.evaluate((mapId) => {
  window.__redLedger.loadMap(mapId);
  if (!window.__redLedger.activateActor('denial-officer')) throw new Error('Denial Officer missing after reload');
  if (!window.__redLedger.teleportNearActor('denial-officer', 20)) throw new Error('No distant Denial Officer sightline');
}, denialMap);
let farCue;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await page.evaluate(() => window.advanceTime(35));
  farCue = (await state()).audio.lastSpatialCue;
  if (farCue?.kind.includes('denial-officer') && farCue.gain < nearCue.gain * .9) break;
}
assert(farCue?.gain < nearCue.gain * .8, `Distant hostile audio was not attenuated: near=${nearCue.gain}, far=${farCue?.gain}`);

await page.evaluate((mapId) => {
  window.__redLedger.loadMap(mapId);
  if (!window.__redLedger.activateActor('denial-officer')) throw new Error('Denial Officer missing for beam test');
  if (!window.__redLedger.teleportNearActor('denial-officer', 7)) throw new Error('No beam sightline');
}, denialMap);
let beamState;
for (let attempt = 0; attempt < 100; attempt += 1) {
  await page.evaluate(() => window.advanceTime(25));
  beamState = await state();
  if (beamState.combatEffects.hostileBeams.length) break;
}
assert(beamState?.combatEffects.hostileBeams[0]?.length > 1, 'Denial hitscan resolved without its authored beam');
assert(beamState.combatEffects.particles.byKind.rejection > 0, 'Denial impact omitted rejection particles');
assert(beamState.audio.lastSpatialCue?.kind.endsWith(':attack'), 'Denial resolution omitted its attack cue');
await page.evaluate(() => {
  window.__redLedger.pause();
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
});
await page.screenshot({ path: 'output/hostile-telegraphs/denial-beam.png' });
await page.evaluate(() => window.__redLedger.loadMap('E1M1'));
const expiredBeamState = await state();
assert(expiredBeamState.combatEffects.hostileBeams.length === 0, `Denial beam visual leaked across a map transition: ${JSON.stringify(expiredBeamState.combatEffects.hostileBeams)}`);

const hazardMap = await page.evaluate((ids) => {
  for (const id of ids) {
    window.__redLedger.loadMap(id);
    if (window.__redLedger.activateActor('cat-model') && window.__redLedger.teleportNearActor('cat-model', 8)) return id;
  }
  return undefined;
}, lateMaps);
assert(hazardMap, 'No Cat Model was available for hazard telegraph coverage');
let hazardState;
for (let attempt = 0; attempt < 120; attempt += 1) {
  await page.evaluate(() => window.advanceTime(25));
  hazardState = await state();
  if (hazardState.combatEffects.hazards.some((hazard) => hazard.armed)) break;
}
assert(hazardState?.combatEffects.hazards.some((hazard) => hazard.armed), 'Prediction hazard never reached its armed state');
assert(hazardState.audio.lastSpatialCue?.kind === 'hazard:armed', 'Armed hazard emitted no distinct spatial cue');
const armedHazard = hazardState.combatEffects.hazards.find((hazard) => hazard.armed);
const catModel = hazardState.visibleActors.find((candidate) => candidate.id === 'cat-model');
assert(armedHazard && catModel, 'Hazard inspection geometry was unavailable');
await page.evaluate(({ hazard, actor }) => {
  window.__redLedger.pause();
  const dx = hazard.x - actor.x;
  const dz = hazard.z - actor.z;
  const length = Math.max(.001, Math.hypot(dx, dz));
  window.__redLedger.teleport(hazard.x + dx / length * 4.5, hazard.z + dz / length * 4.5);
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
}, { hazard: armedHazard, actor: catModel });
await page.waitForTimeout(250);
await page.screenshot({ path: 'output/hostile-telegraphs/armed-hazard.png' });

assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
console.log('Hostile telegraph and spatial-audio E2E passed');
await browser.close();
