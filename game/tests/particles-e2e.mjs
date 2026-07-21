import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
fs.mkdirSync('output/particles', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').nth(2).click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
const baselineDrawCalls = (await state()).runtime.drawCalls;
await page.evaluate(() => window.__redLedger.particleGallery([
  'ink', 'paper', 'spark', 'ember', 'energy', 'smoke', 'debris', 'fiber',
]));
await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
const batchedBurst = await state();
assert(batchedBurst.combatEffects.particles.active >= 120, `Particle stress burst was not staged: ${batchedBurst.combatEffects.particles.active}`);
assert(
  batchedBurst.runtime.drawCalls - baselineDrawCalls <= 2,
  `Particle batches added more than two draw calls: baseline=${baselineDrawCalls} burst=${batchedBurst.runtime.drawCalls}`,
);

await page.evaluate(() => window.__redLedger.loadMap('E1M1'));
await page.evaluate(() => { window.__redLedger.defeatAll(); window.advanceTime(35); });
await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
const massEffects = await state();
assert(massEffects.combatEffects.animated.length <= 10, `Authored effect concurrency exceeded its budget: ${massEffects.combatEffects.animated.length}`);
await page.evaluate(() => { window.advanceTime(3_000); });
await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
const settledMassClose = await state();
assert(
  massEffects.runtime.drawCalls - settledMassClose.runtime.drawCalls <= 12,
  `Mass-close feedback exceeded the 10 authored + 2 pooled draw budget: ${settledMassClose.runtime.drawCalls} settled -> ${massEffects.runtime.drawCalls} active`,
);

await page.evaluate(() => window.__redLedger.loadMap('E1M1'));

assert(await page.evaluate(() => window.__redLedger.teleportNearActor('returned-mail', 4)), 'Could not stage particle impact');
await page.evaluate(() => window.__redLedger.fire());
let particles = (await state()).combatEffects.particles;
assert(particles.active > 0 && particles.byKind.ink + particles.byKind.spark > 0, 'Weapon impact emitted no particles');
await page.screenshot({ path: 'output/particles/weapon-impact.png' });

assert(await page.evaluate(() => window.__redLedger.defeatActor('returned-mail')), 'Could not stage particle death');
particles = (await state()).combatEffects.particles;
assert(particles.byKind.ink > 0 && particles.byKind.paper > 0, 'Enemy death omitted ink or paper particles');
await page.screenshot({ path: 'output/particles/enemy-death.png' });
await page.evaluate(() => {
  for (let index = 0; index < 4; index += 1) window.advanceTime(250);
});
const settledCorpse = (await state()).visibleCorpses.find((corpse) => corpse.id === 'returned-mail');
assert(settledCorpse?.visual === 'corpse', `Enemy did not reach its floor pose: ${settledCorpse?.visual}`);
assert(settledCorpse.groundClearance > 0 && settledCorpse.groundClearance < .03,
  `Enemy corpse floated ${settledCorpse.groundClearance} above the floor`);
assert(settledCorpse.visualHeight < .5 && settledCorpse.visualWidth > 1.45,
  `Enemy corpse retained a blocking silhouette: ${settledCorpse.visualWidth}x${settledCorpse.visualHeight}`);
assert(await page.evaluate(() => window.__redLedger.teleportNearActor('returned-mail', 6, true)),
  'Could not frame the settled enemy corpse');
await page.evaluate(() => window.advanceTime(35));
await page.screenshot({ path: 'output/particles/enemy-corpse-grounded.png' });
await page.keyboard.press('F6');
await page.evaluate(() => window.advanceTime(50));
await page.evaluate(() => window.__redLedger.loadMap('E1M2'));
await page.keyboard.press('F9');
await page.evaluate(() => window.advanceTime(50));
const restoredCorpse = (await state()).visibleCorpses.find((corpse) => corpse.id === 'returned-mail');
assert(restoredCorpse?.visual === 'corpse' && restoredCorpse.groundClearance < .03 && restoredCorpse.visualHeight < .5,
  `Saved corpse did not restore on the floor: ${JSON.stringify(restoredCorpse)}`);
assert(await page.evaluate(() => window.__redLedger.teleportNearActor('returned-mail', 1.4, true)),
  'Could not stage corpse traversal');
const traversalBefore = await state();
await page.keyboard.down('KeyW');
await page.evaluate(() => {
  for (let index = 0; index < 2; index += 1) window.advanceTime(250);
});
await page.keyboard.up('KeyW');
const traversalAfter = await state();
const startSideX = traversalBefore.player.x - settledCorpse.x;
const startSideZ = traversalBefore.player.z - settledCorpse.z;
const endSideX = traversalAfter.player.x - settledCorpse.x;
const endSideZ = traversalAfter.player.z - settledCorpse.z;
assert(startSideX * endSideX + startSideZ * endSideZ < 0,
  `Player did not pass through the non-blocking corpse: ${JSON.stringify({ before: traversalBefore.player, after: traversalAfter.player })}`);

const droneMap = await page.evaluate(() => {
  const maps = Array.from({ length: 3 }, (_, episode) => Array.from({ length: 9 }, (_unused, map) => `E${episode + 1}M${map + 1}`)).flat();
  for (const map of maps) {
    window.__redLedger.loadMap(map);
    if (!window.__redLedger.activateActor('coverage-drone')) continue;
    if (!window.__redLedger.teleportNearActor('coverage-drone', 5)) continue;
    return map;
  }
  return '';
});
assert(droneMap, 'No coverage drone was available for airborne death coverage');
await page.evaluate(() => {
  for (let index = 0; index < 4; index += 1) window.advanceTime(250);
});
const hoveringDrone = (await state()).visibleActors.find((actor) => actor.id === 'coverage-drone');
assert(hoveringDrone && hoveringDrone.y - hoveringDrone.floorY > .5,
  `Coverage drone did not reach an airborne pose on ${droneMap}`);
assert(await page.evaluate(() => window.__redLedger.defeatActor('coverage-drone')), 'Could not defeat the airborne coverage drone');
await page.evaluate(() => {
  window.__redLedger.defeatAll();
  for (let index = 0; index < 4; index += 1) window.advanceTime(250);
});
const groundedDrone = (await state()).visibleCorpses.find((corpse) => corpse.id === 'coverage-drone');
assert(groundedDrone?.visual === 'corpse' && groundedDrone.groundClearance < .03,
  `Coverage drone remained airborne after defeat: ${JSON.stringify(groundedDrone)}`);
await page.screenshot({ path: 'output/particles/airborne-enemy-corpse-grounded.png' });

const tonerMap = await page.evaluate(() => {
  const maps = Array.from({ length: 3 }, (_, episode) => Array.from({ length: 9 }, (_unused, map) => `E${episode + 1}M${map + 1}`)).flat();
  for (const map of maps) {
    window.__redLedger.loadMap(map);
    window.__redLedger.setAmmo('toner-cells', 0);
    if (!window.__redLedger.teleportToPickup('pickup', 'toner-cell')) continue;
    window.advanceTime(35);
    return map;
  }
  return '';
});
assert(tonerMap, 'No toner-cell pickup was available for particle mapping coverage');
particles = (await state()).combatEffects.particles;
assert(particles.byKind.toner > 0 && particles.byKind.paper === 0, `Toner pickup on ${tonerMap} used the wrong material cue`);

await page.evaluate(() => {
  window.__redLedger.loadMap('E1M3');
  window.__redLedger.defeatEncounter('entry');
  window.__redLedger.defeatEncounter('transformation');
  window.__redLedger.teleportToTrigger('raise-floor');
  window.__redLedger.use();
});
particles = (await state()).combatEffects.particles;
assert(particles.byKind.concrete > 0, 'Lift mechanism activation emitted no concrete feedback');
await page.screenshot({ path: 'output/particles/mechanism-sparks.png' });

await page.evaluate(() => {
  window.__redLedger.loadMap('E1M1');
  window.__redLedger.teleportToTrigger('reveal-secret');
  window.__redLedger.use();
});
const secretEffects = (await state()).combatEffects;
assert(secretEffects.semanticCues.filter((cue) => cue.kind === 'secret').length === 1, 'Secret reveal emitted no single anchored semantic cue');
assert(secretEffects.particles.byKind.approval === 0, 'Secret reveal retained a duplicate approval cloud');
await page.screenshot({ path: 'output/particles/secret-reveal.png' });

const teleportMap = await page.evaluate(() => {
  const maps = Array.from({ length: 3 }, (_, episode) => Array.from({ length: 9 }, (_unused, map) => `E${episode + 1}M${map + 1}`)).flat();
  for (const map of maps) {
    window.__redLedger.loadMap(map);
    window.__redLedger.defeatAll();
    if (!window.__redLedger.teleportToTrigger('teleport')) continue;
    window.__redLedger.use();
    return map;
  }
  return '';
});
assert(teleportMap, 'No authored teleport trigger was available for semantic feedback coverage');
const teleportEffects = (await state()).combatEffects;
assert(teleportEffects.semanticCues.filter((cue) => cue.kind === 'teleport').length === 1, `Teleport on ${teleportMap} omitted its anchored cue`);
assert(teleportEffects.particles.byKind.approval === 0, `Teleport on ${teleportMap} retained duplicate approval particles`);

const initialSemanticCue = await page.evaluate(() => {
  window.__redLedger.loadMap('E1M1');
  window.__redLedger.particleBurst('deflection');
  return JSON.parse(window.render_game_to_text()).combatEffects.semanticCues.find((cue) => cue.kind === 'deflection');
});
assert(initialSemanticCue?.opacity === 0, `Semantic cue skipped its transparent fade origin: ${JSON.stringify(initialSemanticCue)}`);

await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('accessibility-settings-change', { detail: { reducedEffects: true, flashEffects: true } }));
  window.__redLedger.loadMap('E1M1');
  window.__redLedger.particleBurst('paper');
});
particles = (await state()).combatEffects.particles;
assert(particles.active === 1 && particles.byKind.paper === 1, `Reduced effects did not preserve exactly one primary cue: ${particles.active}`);

await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('accessibility-settings-change', { detail: { reducedEffects: false, flashEffects: false } }));
  window.__redLedger.loadMap('E1M1');
  window.__redLedger.particleBurst('spark');
  window.__redLedger.particleBurst('toner');
  window.__redLedger.particleBurst('deflection');
});
const flashDisabledEffects = (await state()).combatEffects;
particles = flashDisabledEffects.particles;
assert(particles.byKind.spark === 0, 'Flash-disabled mode retained an additive spark burst');
assert(particles.byKind.toner > 0, 'Flash-disabled mode incorrectly suppressed non-additive material feedback');
assert(particles.byKind.deflection === 0, 'Anchored deflection feedback leaked into a ballistic cloud');
assert(
  flashDisabledEffects.semanticCues.some((cue) => cue.kind === 'deflection' && cue.blend === 'normal'),
  'Flash-disabled mode omitted the non-additive anchored status cue',
);
assert(particles.capacity === 192, 'Particle pool capacity changed unexpectedly');
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);

console.log(`Generated particle feedback E2E passed; stress draw calls ${baselineDrawCalls} -> ${batchedBurst.runtime.drawCalls}`);
await browser.close();
