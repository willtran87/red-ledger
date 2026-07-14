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
assert(!(await page.locator('#continue-game').evaluate((button) => button.disabled)), 'Continue is undiscoverable when no save exists');
assert(await page.locator('#continue-game').getAttribute('data-available') === 'false', 'Continue does not expose its unavailable state');
await page.click('#continue-game');
assert((await page.locator('#menu-feedback').textContent())?.includes('No valid save'), 'Continue without a save gives no visible failure feedback');
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

await page.locator('#options-menu [data-back]').click();
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').first().click();
await page.click('#begin-episode');
assert(await page.locator('#ready-overlay').isVisible(), 'Touch entry briefing is not visible');
assert(await page.locator('#ready-overlay').getAttribute('data-input') === 'touch', 'Entry briefing did not select touch guidance');
const touchBriefing = await page.locator('#entry-controls').innerText();
for (const action of ['MOVE', 'LOOK', 'FIRE', 'USE', 'WEAPON', 'MAP']) {
assert(touchBriefing.includes(action), `Touch briefing omits ${action}`);
}
assert((await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode)) === 'paused', 'Touch briefing did not freeze simulation');
await page.screenshot({ path: 'output/mobile-ux/entry-briefing-390x844.png' });
await page.click('#enter-file');
await page.waitForTimeout(300);
const readState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const beforeMove = await readState();
const drag = async (selector, dx, dy, duration = 300) => {
  const box = await page.locator(selector).boundingBox();
  assert(box, `${selector} has no bounds`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.waitForTimeout(duration);
  await page.mouse.up();
};
await drag('#touch-stick', 0, -34);
const afterMove = await readState();
assert(Math.hypot(afterMove.player.x - beforeMove.player.x, afterMove.player.z - beforeMove.player.z) > .2, 'Dragging the move stick did not move the player');
await drag('#touch-look', 32, 12, 180);
const afterLook = await readState();
assert(Math.abs(afterLook.player.yaw - afterMove.player.yaw) > .02, 'Dragging the look stick did not turn the player');
await page.screenshot({ path: 'output/mobile-ux/gameplay-sticks-390x844.png' });
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
console.log('Mobile UX, real stick gameplay, touch events, focus, feedback, and settings persistence passed');
await browser.close();
