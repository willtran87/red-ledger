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
