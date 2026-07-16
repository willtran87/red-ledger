import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
fs.mkdirSync('output/controls', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#options-button');

await page.locator('#sensitivity').evaluate((element) => { element.value = '1.2'; });
await page.locator('#sensitivity').focus();
await page.keyboard.press('ArrowRight');
assert(await page.locator('#sensitivity').inputValue() === '1.3', 'A single settings arrow press changed sensitivity more than one step');
await page.selectOption('#render-scale', '1');
await page.locator('#render-scale').focus();
await page.keyboard.press('ArrowRight');
assert(await page.locator('#render-scale').inputValue() === '2', 'A single settings arrow press changed render scale more than one option');
await page.selectOption('#render-scale', '1');
await page.locator('#controller-sensitivity').fill('2.3');
await page.locator('#touch-sensitivity').fill('0.7');
await page.locator('#controller-deadzone').fill('0.22');
await page.locator('#invert-y').check();
await page.selectOption('#text-scale', 'largest');
const scaledText = await page.locator('#options-menu label').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
assert(scaledText >= 19.5, 'Largest text setting did not increase inherited UI text');

await page.click('#controls-button');
assert(await page.locator('.control-row').count() === 34, 'Controls screen does not expose every remappable action');
await page.screenshot({ path: 'output/controls/controls.png' });

const automapRow = page.locator('.control-row', { has: page.getByText('Automap', { exact: true }) }).first();
const automapButton = automapRow.locator('button');
assert((await automapButton.getAttribute('aria-label'))?.includes('Automap'), 'Remapping control accessible name omits the action name');
await automapButton.click();
await page.keyboard.press('KeyM');
assert((await automapButton.textContent())?.trim() === 'M', 'Automap binding capture did not update its label');
await page.waitForFunction(() => (document.activeElement instanceof HTMLElement) && document.activeElement.dataset.action === 'automap');
assert((await automapButton.getAttribute('aria-label'))?.includes('Current bindings: M'), 'Remapping control accessible name omits its current binding');

await page.click('#controls-back');
await page.locator('#options-menu [data-back]').click();
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').nth(2).click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

await page.evaluate(() => window.__redLedger.radial(0, -1, true));
assert(await page.locator('#weapon-radial').isVisible(), 'Controller radial selector did not open');
assert((await page.locator('#weapon-radial button.selected').textContent()) === '1', 'Right-stick radial selection did not select the claim stamp');
await page.evaluate(() => window.__redLedger.radial(0, -1, false));
assert(!(await page.locator('#weapon-radial').isVisible()), 'Controller radial selector did not close on release');
assert(JSON.parse(await page.evaluate(() => window.render_game_to_text())).player.weapon !== 'claim-stamp', 'Radial selection switched weapons before the lower animation');
assert(await page.locator('#weapon-view').evaluate((element) => element.getAnimations().length > 0), 'Weapon view did not animate its lowering state');
await page.evaluate(() => window.advanceTime(600));
assert(JSON.parse(await page.evaluate(() => window.render_game_to_text())).player.weapon === 'claim-stamp', 'Radial release did not commit the selected weapon');

await page.keyboard.press('KeyM');
assert(await page.locator('#automap').isVisible(), 'Remapped automap action did not work in gameplay');
await page.keyboard.press('KeyM');
assert(!(await page.locator('#automap').isVisible()), 'Remapped automap action did not toggle closed');
await page.keyboard.press('Tab');
assert(!(await page.locator('#automap').isVisible()), 'Replaced default automap key remained active');

await page.reload({ waitUntil: 'networkidle' });
await page.click('#options-button');
assert(await page.locator('#controller-sensitivity').inputValue() === '2.3', 'Controller sensitivity did not persist independently');
assert(await page.locator('#touch-sensitivity').inputValue() === '0.7', 'Touch sensitivity did not persist independently');
assert(await page.locator('#controller-deadzone').inputValue() === '0.22', 'Controller deadzone did not persist');
assert(await page.locator('#invert-y').isChecked(), 'Y inversion did not persist');
assert(await page.locator('#text-scale').inputValue() === 'largest', 'Text size did not persist');
await page.click('#controls-button');
const restoredRow = page.locator('.control-row', { has: page.getByText('Automap', { exact: true }) }).first();
assert(await restoredRow.count() === 1, 'Remapped binding did not persist across reload');
assert((await restoredRow.locator('button').textContent())?.trim() === 'M', 'Persisted automap binding label changed after reload');
await page.click('#reset-controls');
assert(await page.locator('#confirm-dialog').isVisible(), 'Reset controls did not request confirmation');
await page.click('#confirm-accept');
assert((await restoredRow.locator('button').textContent())?.includes('Tab'), 'Reset did not restore the default automap binding');

await page.click('#controls-back');
await page.locator('#options-menu [data-back]').click();
await page.waitForFunction(() => document.activeElement?.id === 'new-game');
await page.keyboard.press('ArrowDown');
assert((await page.evaluate(() => document.activeElement?.id)) === 'continue-game', 'Keyboard menu navigation did not advance to the next command');

assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
console.log('Controls/remapping E2E passed');
await browser.close();
