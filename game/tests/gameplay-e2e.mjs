import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
fs.mkdirSync('output/e2e', { recursive: true });
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
await page.waitForTimeout(1200);

const initial = await state();
assert(initial.mode === 'playing', `Expected playing mode, got ${initial.mode}`);
assert(initial.map?.id === 'E1M1', `Expected E1M1, got ${initial.map?.id}`);
assert(initial.visibleActors.length > 0, 'Expected visible enemies near the start');
await page.screenshot({ path: 'output/e2e/gameplay-start.png' });

await page.keyboard.down('ArrowUp');
await page.waitForTimeout(600);
await page.keyboard.up('ArrowUp');
const moved = await state();
assert(moved.player.x !== initial.player.x || moved.player.z !== initial.player.z, 'Player did not move');

const ammoBefore = moved.player.ammo.staples;
await page.mouse.click(640, 300);
await page.mouse.down();
await page.waitForTimeout(340);
await page.mouse.up();
const fired = await state();
assert(fired.player.ammo.staples < ammoBefore, 'Firing did not consume ammunition');
await page.screenshot({ path: 'output/e2e/gameplay-fired.png' });

await page.keyboard.press('Tab');
await page.waitForTimeout(100);
assert(await page.locator('#automap').isVisible(), 'Automap did not open');
await page.screenshot({ path: 'output/e2e/automap.png' });
await page.keyboard.press('Tab');

await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F5' })));
await page.waitForTimeout(80);
const saved = await state();
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(220);
await page.keyboard.up('ArrowRight');
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F9' })));
await page.waitForTimeout(200);
const restored = await state();
assert(Math.abs(restored.player.yaw - saved.player.yaw) < 0.02, `Quicksave restore did not restore yaw: saved ${saved.player.yaw}, restored ${restored.player.yaw}`);

const escapeActions = await page.evaluate(() => {
  const actions = [];
  const onAction = (event) => actions.push(`action:${event.detail.action}`);
  const onMenu = (event) => actions.push(`menu:${event.detail.action}`);
  window.addEventListener('input-action', onAction);
  window.addEventListener('input-menu-navigation', onMenu);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  window.removeEventListener('input-action', onAction);
  window.removeEventListener('input-menu-navigation', onMenu);
  return actions;
});
await page.waitForTimeout(100);
const escaped = await state();
const escapeUi = await page.evaluate(() => ({
  activeScreen: document.querySelector('.screen.active')?.id ?? null,
  ready: !document.querySelector('#ready-overlay').hasAttribute('hidden'),
  pointerLocked: document.pointerLockElement === document.querySelector('#game-canvas'),
  activeElement: document.activeElement?.id ?? document.activeElement?.tagName ?? null,
}));
assert(escaped.mode === 'paused', `Escape did not pause: mode=${escaped.mode}, active=${escapeUi.activeScreen}, ready=${escapeUi.ready}, pointerLocked=${escapeUi.pointerLocked}, activeElement=${escapeUi.activeElement}, actions=${escapeActions.join(',')}`);
assert(await page.locator('#pause-menu').isVisible(), 'Pause menu is not visible');
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
assert((await state()).mode === 'playing', 'Escape did not resume paused play');
assert(!(await page.locator('#pause-menu').isVisible()), 'Escape resume left the pause menu visible');
assert(await page.evaluate(() => document.pointerLockElement === document.querySelector('#game-canvas')), 'Escape resumed without restoring desktop pointer ownership');

const quickTapAmmo = (await state()).player.ammo.staples;
await page.mouse.click(640, 300, { delay: 1 });
await page.waitForTimeout(90);
assert((await state()).player.ammo.staples < quickTapAmmo, 'A sub-tick fire tap was lost');

await page.keyboard.press('KeyE');
await page.waitForTimeout(70);
assert(await page.locator('#use-feedback').isVisible(), 'Failed use has no immediate visual feedback');
assert((await page.locator('#use-feedback').getAttribute('role')) === 'status', 'Failed use feedback is not exposed accessibly');
assert(await page.locator('#use-feedback img').evaluate((image) => image.complete && image.naturalWidth > 0), 'Failed use feedback icon did not load');

assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
fs.writeFileSync('output/e2e/final-state.json', JSON.stringify(await state(), null, 2));
console.log('Gameplay E2E passed');
await browser.close();
