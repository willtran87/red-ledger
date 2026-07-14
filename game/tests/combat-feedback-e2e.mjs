import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').nth(2).click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');

await page.evaluate(() => {
  window.__impactEvents = [];
  window.addEventListener('weapon-impact', (event) => window.__impactEvents.push(event.detail));
  window.__redLedger.teleportToPickup('weapon', 'twin-bore-riveter');
  window.advanceTime(250);
  window.advanceTime(250);
  window.advanceTime(250);
});
assert(await page.evaluate(() => window.__redLedger.teleportNearActor('returned-mail', 4)), 'Could not stage the twin-bore target');
await page.evaluate(() => window.__redLedger.fire());
const impacts = await page.evaluate(() => window.__impactEvents);
assert(impacts.length === 1, `Twin-bore emitted ${impacts.length} feedback events for one shot`);
assert(impacts[0].kind === 'actor' && impacts[0].hitCount > 0, 'Aggregated twin-bore result lost its actor hits');

await page.evaluate(() => {
  const reduced = document.querySelector('#reduced-effects');
  reduced.checked = true;
  reduced.dispatchEvent(new Event('change', { bubbles: true }));
  window.__redLedger.selectWeapon('staple-driver');
  window.advanceTime(250);
  window.advanceTime(250);
});
assert(await page.evaluate(() => window.__redLedger.teleportNearActor('desk-warden', 4)), 'Could not stage reduced-effects hit feedback');
await page.evaluate(() => window.__redLedger.fire());
assert(await page.locator('#hit-marker').evaluate((element) => element.classList.contains('active')), 'Reduced Effects removed the semantic hit marker');

await page.evaluate(() => {
  const reduced = document.querySelector('#reduced-effects');
  reduced.checked = false;
  reduced.dispatchEvent(new Event('change', { bubbles: true }));
  const flashes = document.querySelector('#flash-effects');
  flashes.checked = false;
  flashes.dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('#muzzle-flash').getAnimations().forEach((animation) => animation.cancel());
  window.__redLedger.fire();
});
assert(await page.locator('#muzzle-flash').evaluate((element) => element.getAnimations().length === 0), 'Screen Flashes off still animated the muzzle flash');
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);

console.log('Aggregated and accessible combat feedback E2E passed');
await browser.close();
