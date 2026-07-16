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

assert(await page.locator('#vertical-auto-aim').isChecked(), 'Vertical auto-aim did not default on');
await page.locator('#vertical-auto-aim').uncheck();
await page.locator('#classic-input').check();

await page.locator('#sensitivity').evaluate((element) => { element.value = '1.2'; });
await page.locator('#sensitivity').focus();
await page.keyboard.press('ArrowRight');
assert(await page.locator('#sensitivity').inputValue() === '1.3', 'A single settings arrow press changed sensitivity more than one step');
assert(await page.locator('#sensitivity-value').textContent() === '1.3x', 'Sensitivity output did not follow the slider');
assert(await page.locator('#sensitivity').getAttribute('aria-valuetext') === '1.3x', 'Sensitivity did not expose its formatted value');
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
if (await page.locator('#ready-overlay').isVisible()) {
  assert(await page.locator('#ready-overlay').getAttribute('role') === 'dialog', 'Entry briefing is not exposed as a dialog');
  assert((await page.locator('#ready-overlay').getAttribute('aria-labelledby'))?.includes('ready-map'), 'Entry briefing has no map label');
  assert(await page.locator('#entry-controls').getAttribute('role') === 'list', 'Essential controls are not exposed as a list');
  assert(await page.locator('#entry-controls [role="listitem"]').count() === 4, 'Initial orientation did not expose four essential controls');
  await page.click('#enter-file');
}
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

const classicLookBefore = JSON.parse(await page.evaluate(() => window.render_game_to_text())).player;
await page.evaluate(() => {
  window.dispatchEvent(new MouseEvent('mousemove', { movementX: 36, movementY: 36 }));
  window.advanceTime(35);
});
const classicLookAfter = JSON.parse(await page.evaluate(() => window.render_game_to_text())).player;
assert(Math.abs(classicLookAfter.yaw - classicLookBefore.yaw) > .02, '1993 preset discarded horizontal mouse turning');
assert(classicLookAfter.pitch === classicLookBefore.pitch, '1993 preset retained vertical free-look');

await page.keyboard.down('KeyW');
const presentationSamples = await page.evaluate(async () => {
  const samples = [];
  await new Promise((resolve) => {
    const sample = () => {
      const snapshot = JSON.parse(window.render_game_to_text());
      samples.push({ player: snapshot.player, presentation: snapshot.runtime.presentation });
      if (samples.length >= 42) resolve();
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  return samples;
});
await page.keyboard.up('KeyW');
assert(presentationSamples.every((sample) => sample.presentation.mode === 'bounded-predictive-interpolation'), 'Runtime did not expose the presentation interpolation contract');
assert(presentationSamples.some((sample) => sample.presentation.alpha > .05 && sample.presentation.alpha < .95
  && Math.hypot(sample.presentation.x - sample.player.x, sample.presentation.z - sample.player.z) > .001), 'Presentation never produced a between-tick movement pose');
assert(presentationSamples.some((sample, index) => index > 0
  && sample.player.x === presentationSamples[index - 1].player.x
  && sample.player.z === presentationSamples[index - 1].player.z
  && (sample.presentation.x !== presentationSamples[index - 1].presentation.x
    || sample.presentation.z !== presentationSamples[index - 1].presentation.z)), 'Visible movement remained quantized to simulation ticks');

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

await page.evaluate(() => {
  const checkbox = document.querySelector('#reduced-motion');
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  window.dispatchEvent(new CustomEvent('weapon-impact', { detail: { kind: 'actor', killed: false } }));
});
const reducedMotionFeedback = await page.evaluate(() => {
  const recording = document.querySelector('#recording-indicator');
  const marker = document.querySelector('#hit-marker');
  recording.hidden = false;
  return {
    recordingAnimations: recording.getAnimations().length,
    markerAnimations: marker.getAnimations().length,
    markerOpacity: getComputedStyle(marker).opacity,
  };
});
assert(reducedMotionFeedback.recordingAnimations === 0, 'Reduced motion left the recording pulse active');
assert(reducedMotionFeedback.markerAnimations === 0, 'Reduced motion left the hit-marker scale animation active');
assert(reducedMotionFeedback.markerOpacity === '1', 'Reduced motion removed semantic hit confirmation');

await page.reload({ waitUntil: 'networkidle' });
await page.click('#options-button');
assert(await page.locator('#controller-sensitivity').inputValue() === '2.3', 'Controller sensitivity did not persist independently');
assert(await page.locator('#touch-sensitivity').inputValue() === '0.7', 'Touch sensitivity did not persist independently');
assert(await page.locator('#controller-deadzone').inputValue() === '0.22', 'Controller deadzone did not persist');
assert(await page.locator('#invert-y').isChecked(), 'Y inversion did not persist');
assert(!(await page.locator('#vertical-auto-aim').isChecked()), 'Vertical auto-aim preference did not persist');
assert(await page.locator('#classic-input').isChecked(), '1993 input preference did not persist');
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
