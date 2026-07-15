import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').nth(1).click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
await page.waitForTimeout(300);

assert(await page.evaluate(() => window.__redLedger.teleportToPickup('credential', 'red')), 'No red credential pickup found');
await page.evaluate(() => window.advanceTime(100));
assert((await state()).player.credentials.includes('red'), 'Credential pickup did not update inventory');
const doorsBefore = (await state()).closedDoors.length;
assert(await page.evaluate(() => window.__redLedger.teleportToDoor('red')), 'No red door found');
await page.evaluate(() => window.__redLedger.use());
assert((await state()).closedDoors.length === doorsBefore - 1, 'Credential door did not open');

await page.evaluate(() => { window.__redLedger.defeatAll(); window.__redLedger.teleportToExit(); window.__redLedger.use(); });
assert((await state()).mode === 'intermission', 'Exit did not complete map');
assert(await page.locator('#intermission').isVisible(), 'Intermission screen not visible');
await page.click('#continue-map');
assert((await state()).map.id === 'E1M2', 'Intermission did not advance to E1M2');

await page.evaluate(() => {
  window.__redLedger.loadMap('E1M4');
  window.__redLedger.defeatEncounter('entry');
  window.__redLedger.defeatEncounter('transformation');
  window.__redLedger.teleportToTrigger('toggle-sectors');
  window.__redLedger.use();
});
assert((await state()).world.hazardsEnabled === false, 'Transformation switch did not toggle hazards');

await page.evaluate(() => { window.__redLedger.loadMap('E1M8'); window.__redLedger.teleportToExit(); window.__redLedger.use(); });
let bossGate = await state();
assert(bossGate.mode === 'playing' && bossGate.message.includes('authority'), 'Boss gate allowed premature exit');
await page.evaluate(() => { window.__redLedger.defeatAll(); window.__redLedger.use(); });
bossGate = await state();
assert(bossGate.mode === 'intermission', 'Boss defeat did not unlock exit');

await page.evaluate(() => window.__redLedger.loadMap('E3M8'));
let finale = await state();
assert(finale.bosses.find((boss) => boss.id === 'uninsurable')?.phaseLocked === true, 'Final core should begin phase-locked');
await page.evaluate(() => {
  window.__redLedger.defeatEncounter('entry');
  window.__redLedger.defeatEncounter('transformation');
});
assert(await page.evaluate(() => window.__redLedger.defeatActor('chief-actuary')), 'Chief Actuary could not be defeated');
finale = await state();
assert(finale.bosses.find((boss) => boss.id === 'uninsurable')?.phaseLocked === true, 'Final core unlocked before all three binding gates');
for (let gate = 1; gate <= 3; gate += 1) {
  assert(await page.evaluate(() => window.__redLedger.teleportToTrigger('open-door')), `Binding gate ${gate} control was not found`);
  await page.evaluate(() => window.__redLedger.use());
  finale = await state();
  assert(finale.world.bindingGates === gate, `Binding gate ${gate} did not persist its released state`);
  assert(finale.bosses.find((boss) => boss.id === 'uninsurable')?.phaseLocked === (gate < 3), `Final core lock state was wrong after gate ${gate}`);
}

await page.evaluate(() => {
  window.__redLedger.loadMap('E3M1');
  window.__redLedger.teleportToPickup('pickup', 'rapid-authority');
  window.advanceTime(100);
});
assert((await state()).player.powerups.rapid > 29, 'Timed rapid-authority powerup did not activate');

assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
console.log('Progression E2E passed');
await browser.close();
