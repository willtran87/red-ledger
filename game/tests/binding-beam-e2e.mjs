import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
fs.mkdirSync('output/binding-beam', { recursive: true });
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

await page.evaluate(() => {
  window.__redLedger.loadMap('E1M7');
  window.__redLedger.teleportToPickup('weapon', 'binding-engine');
  window.advanceTime(250);
  window.advanceTime(250);
  window.advanceTime(250);
});
let snapshot = await state();
assert(snapshot.player.weapon === 'binding-engine', `Binding Engine did not equip: ${snapshot.player.weapon}`);
assert(snapshot.player.ammo['toner-cells'] >= 40, 'Binding Engine pickup did not provide a discharge');
assert(await page.evaluate(() => window.__redLedger.teleportNearActor('ember-clerk', 11)), 'Could not stage a beam target');

await page.evaluate(() => { window.__redLedger.fire(); window.advanceTime(35); });
snapshot = await state();
assert(snapshot.combatEffects.bindingBeam.active, 'Binding beam ribbon is not active during discharge');
assert(snapshot.combatEffects.bindingBeam.length > 1, `Binding beam length is invalid: ${snapshot.combatEffects.bindingBeam.length}`);
await page.evaluate(() => {
  window.__redLedger.pause();
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
});
await page.screenshot({ path: 'output/binding-beam/active-beam.png' });

await page.evaluate(() => { window.__redLedger.resume(); window.advanceTime(250); window.advanceTime(250); window.advanceTime(250); window.advanceTime(250); window.advanceTime(250); });
snapshot = await state();
assert(!snapshot.combatEffects.bindingBeam.active && snapshot.combatEffects.bindingPulses === 0, 'Binding beam visual leaked after discharge');
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);

console.log('Binding beam presentation E2E passed');
await browser.close();
