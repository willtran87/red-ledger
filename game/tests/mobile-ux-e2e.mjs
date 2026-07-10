import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
fs.mkdirSync('output/mobile-ux', { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#options-button');
const optionGeometry = await page.locator('#options-menu').evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, width: rect.width, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight };
});
assert(optionGeometry.top === 0 && optionGeometry.bottom === 844 && optionGeometry.width === 390, 'Options does not occupy the portrait viewport');
assert(optionGeometry.clientHeight === 844, 'Options is compressed on portrait mobile');
await page.locator('#sfx-volume').fill('0.35');
await page.locator('#flash-effects').uncheck();
await page.screenshot({ path: 'output/mobile-ux/options-390x844.png' });

await page.click('#controls-button');
const lastControl = page.locator('.control-row').last();
await lastControl.scrollIntoViewIfNeeded();
assert(await lastControl.isVisible(), 'Last remappable control is unreachable on mobile');
await page.locator('.control-row button').first().click();
await page.keyboard.press('Escape');
assert(!(await page.locator('#cancel-binding').isVisible()), 'Escape did not cancel binding capture');
await page.click('#reset-controls');
assert(await page.locator('#confirm-dialog').isVisible(), 'Destructive reset has no confirmation');
assert((await page.evaluate(() => document.activeElement?.id)) === 'confirm-cancel', 'Confirmation does not place focus on the safe action');
await page.keyboard.press('Escape');
assert(!(await page.locator('#confirm-dialog').isVisible()), 'Escape did not cancel confirmation');
assert(await page.locator('#controls-menu').isVisible(), 'Cancelling confirmation escaped the underlying controls screen');
await page.screenshot({ path: 'output/mobile-ux/controls-390x844.png' });

await page.evaluate(() => {
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
  document.querySelector('#hud').classList.add('active');
  window.__touchEvents = [];
  window.addEventListener('input-action', (event) => window.__touchEvents.push(`press:${event.detail.action}:${event.detail.source}`));
  window.addEventListener('input-action-release', (event) => window.__touchEvents.push(`release:${event.detail.action}:${event.detail.source}`));
});
for (const selector of ['#touch-stick', '#touch-look', '#touch-fire', '#touch-use', '#touch-weapon', '#touch-map', '#touch-pause']) {
  assert(await page.locator(selector).isVisible(), `${selector} is not visible in the portrait control deck`);
  const box = await page.locator(selector).boundingBox();
  assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, `${selector} escapes the portrait viewport`);
}
await page.locator('#touch-use').tap();
await page.locator('#touch-weapon').tap();
await page.locator('#touch-map').tap();
await page.locator('#touch-pause').tap();
const fireBox = await page.locator('#touch-fire').boundingBox();
await page.mouse.move(fireBox.x + fireBox.width / 2, fireBox.y + fireBox.height / 2);
await page.mouse.down();
await page.locator('#touch-fire').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'touch' });
await page.mouse.up();
const events = await page.evaluate(() => window.__touchEvents);
for (const action of ['use', 'weapon-next', 'automap', 'pause']) {
  assert(events.includes(`press:${action}:touch`), `Touch ${action} did not emit the canonical action`);
}
assert(events.includes('release:fire:touch'), 'Fire did not release after pointer cancellation');
await page.screenshot({ path: 'output/mobile-ux/control-deck-390x844.png' });

await page.reload({ waitUntil: 'networkidle' });
await page.click('#options-button');
assert(await page.locator('#sfx-volume').inputValue() === '0.35', 'SFX volume did not persist');
assert(!(await page.locator('#flash-effects').isChecked()), 'Flash preference did not persist');
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
console.log('Mobile UX, touch events, focus, and settings persistence passed');
await browser.close();
