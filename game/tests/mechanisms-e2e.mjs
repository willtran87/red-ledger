import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
fs.mkdirSync('output/mechanisms', { recursive: true });
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
await page.evaluate(() => {
  window.__redLedger.loadMap('E1M3');
  window.__redLedger.defeatAll();
  window.__redLedger.teleportToTrigger('raise-floor');
  window.__redLedger.use();
  window.advanceTime(115);
});

let moving = await state();
assert(moving.world.sectorMovers.length > 0, 'Raise-floor transformation did not create sector movers');
assert(moving.world.sectorMovers.some((sector) => sector.height > 0 && sector.height < sector.targetHeight), 'No sector was captured mid-motion');
assert(moving.world.landmarks.length === 2 && moving.world.landmarks.every((landmark) => landmark.active), 'Map-specific vehicle machinery did not activate');
assert(await page.evaluate(() => window.__redLedger.teleportNearLandmark(0, 7)), 'Could not stage transformed landmark view');
await page.screenshot({ path: 'output/mechanisms/e1m3-vehicle-lift.png' });

await page.evaluate(() => window.dispatchEvent(new CustomEvent('input-action', {
  detail: { action: 'pause', source: 'keyboard', repeat: false },
})));
await page.waitForTimeout(80);
const paused = await state();
await page.click('#save-game');
const beforeWrite = await state();
assert(beforeWrite.world.sectorMovers.length === paused.world.sectorMovers.length, `Opening save slots changed mover state: map=${beforeWrite.map.id} mode=${beforeWrite.mode} triggers=${JSON.stringify(beforeWrite.world.triggered)} movers=${beforeWrite.world.sectorMovers.length}`);
await page.locator('#save-slot-list .slot-row button').nth(1).click();
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('red-ledger-v2:save:manual-2')));
assert(stored.state.mapId === 'E1M3', `Manual slot captured the wrong map: ${stored.state.mapId}`);
assert(stored.state.sectors.length === paused.world.sectorMovers.length, `Manual slot omitted active sector movers: ${stored.state.sectors.length}`);
await page.click('#load-game');
await page.locator('#load-slot-list .slot-row button').nth(1).click();
const restored = await state();
assert(restored.map.id === 'E1M3', `Mechanism save restored the wrong map: ${restored.map.id}`);
assert(restored.mode === 'paused', 'Mechanism restore advanced out of the paused tick');
assert(JSON.stringify(restored.world.sectorMovers) === JSON.stringify(paused.world.sectorMovers), `Sector mover state changed across save/load: ${JSON.stringify(paused.world.sectorMovers)} -> ${JSON.stringify(restored.world.sectorMovers)}`);
assert(JSON.stringify(restored.world.landmarks) === JSON.stringify(paused.world.landmarks), `Landmark machinery state changed across save/load: ${JSON.stringify(paused.world.landmarks)} -> ${JSON.stringify(restored.world.landmarks)}`);
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);

console.log('Authored mechanism E2E passed');
await browser.close();
