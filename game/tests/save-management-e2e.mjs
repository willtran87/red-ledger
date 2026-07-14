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
await page.locator('#difficulty-actions button').nth(2).click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');

await page.evaluate(() => {
  localStorage.removeItem('red-ledger-v2:save:quicksave');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F9', key: 'F9', bubbles: true }));
  window.advanceTime(35);
});
let snapshot = await state();
assert(snapshot.mode === 'playing' && snapshot.map.id === 'E1M1', 'Missing quicksave loaded another save type');
assert(snapshot.message.includes('No quicksave'), `Missing quicksave feedback was not shown: ${snapshot.message}`);

await page.evaluate(() => window.dispatchEvent(new CustomEvent('input-action', {
  detail: { action: 'pause', source: 'keyboard', repeat: false },
})));
await page.click('#save-game');
await page.locator('#save-slot-list .slot-action').first().click();
await page.click('#load-game');

const manualDetail = await page.locator('#load-slot-list .slot-row').first().locator('small').textContent();
assert(manualDetail.includes('Field Adjuster') && /\d+:\d{2}/.test(manualDetail), `Manual slot omits difficulty or play time: ${manualDetail}`);
assert(await page.locator('#automatic-slot-list .slot-row').count() >= 2, 'Autosave and recovery entries are not visible');
assert(await page.locator('#automatic-slot-list .slot-action').first().isEnabled(), 'Newest automatic recovery is not loadable');
await page.locator('#automatic-slot-list .slot-action').first().click();
snapshot = await state();
assert(snapshot.mode === 'paused' && snapshot.map.id === 'E1M1', 'Automatic recovery did not restore a paused E1M1 state');

await page.click('#load-game');
assert(await page.locator('#load-slot-list .slot-row').first().locator('.slot-delete').isVisible(), 'Manual delete action is missing');
await page.locator('#load-slot-list .slot-row').first().locator('.slot-delete').click();
assert(await page.locator('#confirm-dialog').evaluate((dialog) => dialog.open), 'Delete confirmation did not open');
await page.click('#confirm-accept');
assert(await page.locator('#load-slot-list .slot-row').first().locator('.slot-delete').count() === 0, 'Deleted slot still exposes a delete action');
assert(await page.locator('#load-slot-list .slot-action').first().isDisabled(), 'Deleted slot remains loadable');
assert(await page.evaluate(() => localStorage.getItem('red-ledger-v2:save:manual-1') === null), 'Deleted manual save remains in storage');
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);

console.log('Save management and recovery E2E passed');
await browser.close();
