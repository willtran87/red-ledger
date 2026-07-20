import fs from 'node:fs';
import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
try {
fs.mkdirSync('output/save-management', { recursive: true });
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
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

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
const continuePreview = await page.locator('#menu-feedback').textContent();
assert(continuePreview.includes('Manual file') && continuePreview.includes('Play ') && continuePreview.includes('E1M1'), `Continue preview omits save kind or play time: ${continuePreview}`);
assert(await page.locator('#menu-feedback header').count() === 1, 'Continue preview is not presented as a structured resume card');
assert((await page.locator('#menu-feedback').getAttribute('aria-label')).includes('Continue available.'), 'Continue card lacks a complete spoken summary');
assert(await page.locator('#menu-feedback time').getAttribute('datetime'), 'Continue card save time lacks machine-readable date metadata');
await page.click('#quit-menu');
const exitReview = await page.locator('#confirm-review').evaluate((review) => ({
  recovery: review.dataset.recovery,
  consequence: review.dataset.consequence,
  returnPoint: review.querySelector('#confirm-return-point').textContent,
  durability: review.querySelector('#confirm-durability').textContent,
  label: review.getAttribute('aria-label'),
}));
assert(exitReview.recovery === 'persistent' && exitReview.returnPoint.includes('Manual file') && exitReview.returnPoint.includes('E1M1'),
  `Saved exit review did not name the durable Continue file: ${JSON.stringify(exitReview)}`);
assert(exitReview.durability.includes('survives closing or reloading'), `Saved exit review misstated durability: ${exitReview.durability}`);
assert(exitReview.label.includes('Return point') && exitReview.label.includes('E1M1'), 'Saved exit review lacks a complete accessible summary');
await page.screenshot({ path: 'output/save-management/exit-review-desktop.png' });
await page.click('#confirm-accept');
assert(await page.locator('#menu').isVisible(), 'Main menu did not reopen after saving');
await page.screenshot({ path: 'output/save-management/continue-desktop.png' });
const savedStorage = await page.evaluate(() => Object.entries(localStorage));
const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await touchContext.addInitScript((entries) => entries.forEach(([key, value]) => localStorage.setItem(key, value)), savedStorage);
const touchPage = await touchContext.newPage();
touchPage.on('pageerror', (error) => errors.push(`touch: ${String(error)}`));
touchPage.on('console', (message) => { if (message.type() === 'error') errors.push(`touch: ${message.text()}`); });
await touchPage.goto(url, { waitUntil: 'networkidle' });
for (const viewport of [{ width: 390, height: 844, name: 'portrait' }, { width: 844, height: 390, name: 'landscape' }]) {
  await touchPage.setViewportSize(viewport);
  const geometry = await touchPage.locator('#menu-feedback').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const shell = document.querySelector('#game-shell').getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, shellLeft: shell.left, shellRight: shell.right, shellTop: shell.top, shellBottom: shell.bottom, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  });
  assert(geometry.left >= geometry.shellLeft && geometry.right <= geometry.shellRight
    && geometry.top >= geometry.shellTop && geometry.bottom <= geometry.shellBottom && geometry.scrollWidth <= geometry.clientWidth,
  `Continue card overflows touch ${viewport.name}: ${JSON.stringify(geometry)}`);
  await touchPage.screenshot({ path: `output/save-management/continue-${viewport.name}.png` });
}
await touchContext.close();
await page.click('#continue-game');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing'
  || document.querySelector('#enter-file')?.textContent === 'Resume File');
await page.evaluate(() => window.dispatchEvent(new CustomEvent('input-action', {
  detail: { action: 'pause', source: 'keyboard', repeat: false },
})));
await page.locator('#pause-menu').waitFor({ state: 'visible' });
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

const protectedRaw = '{"schema":"red-ledger-save","version":999,"futureData":{"retained":true}}';
await page.evaluate((raw) => localStorage.setItem('red-ledger-v2:save:manual-1', raw), protectedRaw);
await page.locator('#load-slots .slot-back').click();
await page.click('#save-game');
assert((await page.locator('#save-slot-list .slot-row').first().locator('small').textContent()).includes('Unreadable'),
  'A newer manual slot was not identified before replacement');
await page.locator('#save-slot-list .slot-action').first().click();
assert(await page.locator('#confirm-dialog').evaluate((dialog) => dialog.open), 'Unreadable-slot replacement did not request confirmation');
assert((await page.locator('#confirm-title').textContent()) === 'Replace unreadable save?', 'Unreadable-slot warning used the generic overwrite prompt');
assert((await page.locator('#confirm-copy').textContent()).includes('newer build'), 'Unreadable-slot warning did not explain the compatibility risk');
await page.click('#confirm-cancel');
assert(await page.evaluate((raw) => localStorage.getItem('red-ledger-v2:save:manual-1') === raw, protectedRaw),
  'Canceling unreadable-slot replacement changed the protected bytes');
await page.locator('#save-slot-list .slot-action').first().click();
assert((await page.locator('#confirm-accept').textContent()) === 'Replace', 'Unreadable-slot confirmation has an ambiguous action label');
await page.click('#confirm-accept');
assert(await page.evaluate((raw) => localStorage.getItem('red-ledger-v2:save:manual-1') !== raw, protectedRaw),
  'Confirming unreadable-slot replacement did not write the current save');
assert(await page.locator('#pause-menu').isVisible(), 'Confirmed unreadable-slot replacement did not return to pause');
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);

console.log('Save management and recovery E2E passed');
} finally {
  await browser.close();
}
