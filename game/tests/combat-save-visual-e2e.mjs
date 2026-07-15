import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
fs.mkdirSync('output/combat-save', { recursive: true });
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
await page.waitForTimeout(250);

assert(await page.evaluate(() => window.__redLedger.teleportNearActor('ember-clerk', 8)), 'Could not stage ember projectile encounter');
let volley;
for (let index = 0; index < 12; index += 1) {
  await page.evaluate(() => window.advanceTime(35));
  volley = await state();
  if (volley.combatEffects.projectiles.length > 0) break;
}
assert(volley.combatEffects.projectiles.length > 0, 'Enemy projectile did not enter runtime state');
// Capture and save on the exact tick where the projectile exists; a nearby target
// may legitimately be hit on the following fixed step.
await page.screenshot({ path: 'output/combat-save/enemy-projectile.png' });

const modeBeforePause = (await state()).mode;
assert(['playing', 'paused'].includes(modeBeforePause), `Combat staging left a non-playable mode before save: ${modeBeforePause}`);
if (modeBeforePause === 'playing') {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('input-action', {
    detail: { action: 'pause', source: 'keyboard', repeat: false },
  })));
}
await page.waitForTimeout(100);
const pausedState = await state();
assert(pausedState.mode === 'paused', 'Pause input did not reach game state');
await page.click('#save-game');
assert(await page.locator('#save-slots').isVisible(), 'Save slot screen did not open');
assert(await page.locator('#save-slot-list .slot-row').count() === 8, 'Expected eight manual save slots');
await page.screenshot({ path: 'output/combat-save/save-slots.png' });
await page.locator('#save-slot-list .slot-action').first().click();
await page.click('#load-game');
assert((await page.locator('#load-slot-list .slot-action').first().isEnabled()), 'Written manual slot is not loadable');
await page.screenshot({ path: 'output/combat-save/load-slots.png' });
await page.locator('#load-slot-list .slot-action').first().click();
const restored = await state();
assert(restored.mode === 'paused', 'Manual load did not preserve the paused restore tick');
assert(restored.combatEffects.projectiles.length === pausedState.combatEffects.projectiles.length, 'Active projectile count did not restore exactly');
assert(restored.combatEffects.projectiles.map((item) => item.id).join('|') === pausedState.combatEffects.projectiles.map((item) => item.id).join('|'), 'Active projectile identities changed during restore');

await page.click('#resume-game');
await page.evaluate(() => {
  window.__redLedger.loadMap('E1M3');
  window.__redLedger.teleportToPickup('weapon', 'catastrophe-launcher');
  window.advanceTime(250);
  window.advanceTime(250);
  window.advanceTime(250);
  window.__redLedger.teleportNearActor('liability-mass', 10);
});
const launchedState = await page.evaluate(() => {
  window.__redLedger.fire();
  return JSON.parse(window.render_game_to_text());
});
assert(launchedState.player.weapon === 'catastrophe-launcher', `Launcher pickup did not equip: ${launchedState.player.weapon}`);
assert(launchedState.combatEffects.playerProjectiles.length > 0, 'Player canister was not created on the committed fire event');
const canisterState = launchedState;
assert(canisterState.combatEffects.playerProjectiles.some((item) => item.weapon === 'catastrophe-launcher'), 'Player canister did not enter runtime state');
await page.screenshot({ path: 'output/combat-save/player-canister.png' });

assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
fs.writeFileSync('output/combat-save/state.json', JSON.stringify(volley, null, 2));
console.log('Combat/save visual E2E passed');
await browser.close();
