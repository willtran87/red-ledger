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

assert((await state()).visibleActors.some((candidate) => candidate.id === 'denial-officer'), 'Nearby Denial Officer was not represented in text state');
const nearResult = await page.evaluate(() => ({
  defeated: window.__redLedger.defeatActor('denial-officer'),
  cue: JSON.parse(window.render_game_to_text()).audio.lastSpatialCue,
}));
assert(nearResult.defeated, 'Could not stage the nearby Denial Officer cue');
const nearCue = nearResult.cue;
assert(nearCue?.kind === 'enemy:denial-officer:death' && nearCue.gain > .7,
  `Nearby hostile audio was not identity-specific, full, and readable: ${JSON.stringify(nearCue)}`);

const distantDenial = await page.evaluate((ids) => {
  for (const mapId of ids) {
    window.__redLedger.loadMap(mapId);
    if (!window.__redLedger.activateActor('denial-officer')) continue;
    if (!window.__redLedger.teleportNearActor('denial-officer', 20)) continue;
    const snapshot = JSON.parse(window.render_game_to_text());
    const actor = snapshot.visibleActors.find((candidate) => candidate.id === 'denial-officer');
    if (actor?.distance >= 18) return { mapId, distance: actor.distance };
  }
  return undefined;
}, maps);
assert(distantDenial, 'No genuinely distant Denial Officer sightline was available');
const farResult = await page.evaluate(() => ({
  defeated: window.__redLedger.defeatActor('denial-officer'),
  cue: JSON.parse(window.render_game_to_text()).audio.lastSpatialCue,
}));
assert(farResult.defeated, 'Could not stage the distant Denial Officer cue');
const farCue = farResult.cue;
assert(farCue?.kind === 'enemy:denial-officer:death' && farCue.gain < nearCue.gain * .8,
  `Distant hostile audio was not identity-specific and attenuated: near=${JSON.stringify(nearCue)}, far=${JSON.stringify(farCue)}`);

await page.evaluate((mapId) => {
  window.__redLedger.loadMap(mapId);
  if (!window.__redLedger.activateActor('denial-officer')) throw new Error('Denial Officer missing for beam test');
  if (!window.__redLedger.teleportNearActor('denial-officer', 7)) throw new Error('No beam sightline');
}, denialMap);
let beamState;
for (let attempt = 0; attempt < 200; attempt += 1) {
  await page.evaluate(() => window.advanceTime(25));
  beamState = await state();
  if (beamState.combatEffects.hostileBeams.some((beam) => beam.hit)
    && beamState.combatEffects.semanticCues.some((cue) => cue.kind === 'rejection')
    && beamState.audio.recentSpatialCues.some((cue) => cue.kind === 'attack:denial-beam:resolve')) break;
}
const hitBeam = beamState?.combatEffects.hostileBeams.find((beam) => beam.hit);
assert(hitBeam?.length > 1, 'Denial hitscan never landed with its authored beam');
assert(beamState.combatEffects.semanticCues.some((cue) => cue.kind === 'rejection'), 'Denial impact omitted its anchored rejection cue');
assert(beamState.audio.recentSpatialCues.some((cue) => cue.kind === 'attack:denial-beam:resolve'),
  'Denial resolution omitted its authored attack-specific cue');
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
assert(hazardState.audio.recentSpatialCues.some((cue) => cue.kind === 'hazard:armed'), 'Armed hazard emitted no distinct spatial cue');
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
