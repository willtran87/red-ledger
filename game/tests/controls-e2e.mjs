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
await page.locator('#sound-captions').check();
await page.waitForTimeout(520);
await page.selectOption('#text-scale', 'largest');
const scaledText = await page.locator('#options-menu label').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
assert(scaledText >= 19.5, 'Largest text setting did not increase inherited UI text');

await page.click('#controls-button');
assert(await page.locator('.control-row').count() === 34, 'Controls screen does not expose every remappable action');
await page.waitForFunction(() => document.querySelector('#controls-menu')?.scrollTop === 0
  && document.activeElement?.getAttribute('data-action') === 'move-forward');
await page.screenshot({ path: 'output/controls/controls.png' });

const automapRow = page.locator('.control-row', { has: page.getByText('Automap', { exact: true }) }).first();
const automapButton = automapRow.locator('button');
assert((await automapButton.getAttribute('aria-label'))?.includes('Automap'), 'Remapping control accessible name omits the action name');
await automapButton.click();
await page.keyboard.press('KeyM');
const remappedAutomapCopy = (await automapButton.textContent())?.trim() ?? '';
assert(remappedAutomapCopy.includes('M'), 'Automap binding capture did not update its keyboard label');
assert(remappedAutomapCopy.includes('View/Select'), 'Keyboard remap erased the controller automap binding');
await page.waitForFunction(() => (document.activeElement instanceof HTMLElement) && document.activeElement.dataset.action === 'automap');
assert((await automapButton.getAttribute('aria-label'))?.includes(`Current bindings: ${remappedAutomapCopy}`), 'Remapping control accessible name omits its current bindings');
assert((await page.locator('#controls-feedback').textContent())?.includes('Mouse and controller bindings retained.'), 'Remapping feedback did not explain preserved device bindings');

const quickSaveRow = page.locator('.control-row', { has: page.getByText('Quick Save', { exact: true }) }).first();
await quickSaveRow.locator('button').click();
await page.keyboard.press('KeyQ');
assert((await page.locator('#controls-feedback').textContent())?.includes('Removed from Weapon Previous'), 'Conflict resolution was not announced');

await page.click('#controls-back');
await page.locator('#options-menu [data-back]').click();
await page.evaluate(() => {
  window.__assistiveGuidance = [];
  const announcer = document.querySelector('#announcer');
  let lastText = '';
  new MutationObserver(() => {
    const text = announcer.textContent.trim();
    if (!text) {
      lastText = '';
      return;
    }
    if (text === lastText) return;
    lastText = text;
    if (/^(Objective:|Action available:|Blocked:)/.test(text)) window.__assistiveGuidance.push(text);
  }).observe(announcer, { childList: true, subtree: true, characterData: true });
});
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').nth(2).click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) {
  assert(await page.locator('#ready-overlay').getAttribute('role') === 'dialog', 'Entry briefing is not exposed as a dialog');
  assert((await page.locator('#ready-overlay').getAttribute('aria-labelledby'))?.includes('ready-map'), 'Entry briefing has no map label');
  assert(await page.locator('#entry-controls').getAttribute('role') === 'list', 'Essential controls are not exposed as a list');
  assert(await page.locator('#entry-controls [role="listitem"]').count() === 4, 'Initial orientation did not expose four essential controls');
  const entryObjective = await page.locator('#entry-objective').innerText();
  assert(entryObjective.includes('First: Close initial exposures'), 'Entry briefing omits the current immediate exposure objective');
  assert(entryObjective.includes('Then: Secure Red credential'), 'Entry briefing omits the authored red credential route');
  assert(await page.locator('#announcer').getAttribute('aria-live') === 'polite', 'Gameplay guidance is not exposed through a polite live region');
  await page.waitForTimeout(150);
  assert((await page.evaluate(() => window.__assistiveGuidance)).length === 0, 'Gameplay guidance announced while the entry gate was open');
  await page.click('#enter-file');
}
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
await page.evaluate(() => {
  for (let index = 0; index < 12; index += 1) window.advanceTime(250);
});
await page.waitForFunction(() => window.__assistiveGuidance.some((message) => message.startsWith('Objective: Close initial exposures')));
await page.waitForTimeout(150);
let assistiveGuidance = await page.evaluate(() => window.__assistiveGuidance);
assert(assistiveGuidance.filter((message) => message.startsWith('Objective: Close initial exposures')).length === 1,
  `Stable objective produced repeated guidance: ${JSON.stringify(assistiveGuidance)}`);

const contextOrigin = await page.evaluate(() => {
  const before = JSON.parse(window.render_game_to_text()).player;
  const found = window.__redLedger.teleportToDoor('red');
  window.advanceTime(35);
  return { found, x: before.x, z: before.z };
});
assert(contextOrigin.found, 'Could not stage the locked red credential context prompt');
await page.waitForFunction(() => window.__assistiveGuidance.some((message) => message.includes('Blocked: Red credential.')));
await page.waitForTimeout(150);
assistiveGuidance = await page.evaluate(() => window.__assistiveGuidance);
assert(assistiveGuidance.filter((message) => message.includes('Blocked: Red credential.')).length === 1,
  `Stable context prompt produced repeated guidance: ${JSON.stringify(assistiveGuidance)}`);
await page.evaluate(({ x, z }) => {
  window.__redLedger.teleport(x, z);
  window.advanceTime(35);
}, contextOrigin);
await page.mouse.down();
await page.waitForTimeout(80);
await page.mouse.up();
await page.waitForFunction(() => !document.querySelector('#sound-caption')?.hasAttribute('hidden'));
assert((await page.locator('#sound-caption').textContent())?.includes('Staple Driver'), 'Gameplay sound caption did not identify the fired weapon');
await page.screenshot({ path: 'output/controls/sound-caption.png' });
const hudTextScale = await page.evaluate(() => {
  const root = document.documentElement;
  const objective = document.querySelector('#objective');
  const status = document.querySelector('#status');
  const current = () => ({
    objective: Number.parseFloat(getComputedStyle(objective).fontSize),
    status: Number.parseFloat(getComputedStyle(status).fontSize),
  });
  const largest = current();
  root.dataset.uiTextScale = 'standard';
  const standard = current();
  root.dataset.uiTextScale = 'largest';
  return { largest, standard };
});
assert(hudTextScale.largest.objective >= hudTextScale.standard.objective * 1.12, 'Largest text setting barely changed objective text');
assert(hudTextScale.largest.status >= hudTextScale.standard.status * 1.12, 'Largest text setting barely changed status text');

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
assert(await page.locator('#sound-captions').isChecked(), 'Sound caption preference did not persist');
await page.click('#controls-button');
const restoredRow = page.locator('.control-row', { has: page.getByText('Automap', { exact: true }) }).first();
assert(await restoredRow.count() === 1, 'Remapped binding did not persist across reload');
assert((await restoredRow.locator('button').textContent())?.includes('M'), 'Persisted automap keyboard binding changed after reload');
assert((await restoredRow.locator('button').textContent())?.includes('View/Select'), 'Persisted automap controller binding changed after reload');
await page.click('#reset-controls');
assert(await page.locator('#confirm-dialog').isVisible(), 'Reset controls did not request confirmation');
await page.click('#confirm-accept');
assert((await restoredRow.locator('button').textContent())?.includes('Tab'), 'Reset did not restore the default automap binding');

await page.click('#controls-back');
await page.locator('#options-menu [data-back]').click();
await page.waitForFunction(() => document.activeElement?.id === 'options-button');
await page.keyboard.press('ArrowDown');
assert((await page.evaluate(() => document.activeElement?.id)) === 'credits-button', 'Keyboard menu navigation did not continue from restored focus');

await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelector('#credits')?.classList.contains('active'));
await page.waitForFunction(() => document.activeElement?.matches('#credits a[href]'));
assert(await page.evaluate(() => document.activeElement?.matches('#credits a[href]')), 'Credits did not expose its links to keyboard/controller focus');

await page.evaluate(() => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
  window.__testGamepad = { connected: true, buttons, axes: [0, 0, 0, 0, 0] };
  window.__gamepadNavigation = [];
  window.__controllerLifecycle = [];
  window.__announcements = [];
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => window.__testGamepad.connected ? [window.__testGamepad] : [],
  });
  window.addEventListener('input-menu-navigation', (event) => {
    if (event.detail.source === 'gamepad') window.__gamepadNavigation.push(event.detail);
  });
  window.addEventListener('input-controller-disconnected', () => window.__controllerLifecycle.push('disconnected'));
  window.addEventListener('input-controller-reconnected', () => window.__controllerLifecycle.push('reconnected'));
  const announcer = document.querySelector('#announcer');
  let lastAnnouncement = '';
  new MutationObserver(() => {
    const text = announcer.textContent.trim();
    if (!text) {
      lastAnnouncement = '';
      return;
    }
    if (text === lastAnnouncement) return;
    lastAnnouncement = text;
    window.__announcements.push(text);
  }).observe(announcer, { childList: true, subtree: true, characterData: true });
  buttons[13].pressed = true;
  buttons[13].touched = true;
  buttons[13].value = 1;
});
await page.waitForTimeout(700);
await page.evaluate(() => {
  const button = window.__testGamepad.buttons[13];
  button.pressed = false;
  button.touched = false;
  button.value = 0;
});
await page.waitForTimeout(120);
const gamepadNavigation = await page.evaluate(() => window.__gamepadNavigation);
assert(gamepadNavigation.length >= 3, 'Held controller navigation did not repeat after its initial step');
assert(gamepadNavigation[0].repeat === false && gamepadNavigation.slice(1).some((event) => event.repeat), 'Controller navigation did not distinguish its initial press from repeats');
assert(await page.locator('#game-shell').getAttribute('data-input-device') === 'gamepad', 'Controller activity did not become the active input device');
assert((await page.evaluate(() => window.__controllerLifecycle)).length === 0, 'Initial controller detection was misreported as a reconnection');

await page.locator('#credits [data-back]').click();
await page.click('#options-button');
await page.click('#controls-button');
const menuConfirmRow = page.locator('.control-row', { has: page.getByText('Menu Confirm', { exact: true }) }).first();
const menuConfirmButton = menuConfirmRow.locator('button');
await menuConfirmButton.click();
await page.evaluate(() => {
  window.__gamepadNavigation = [];
  window.__testGamepad.axes[4] = .8;
});
await page.waitForFunction(() => document.querySelector('.control-row button[data-action="menu-confirm"]')?.textContent?.includes('Axis 5 +'));
await page.waitForTimeout(400);
assert((await page.evaluate(() => window.__gamepadNavigation)).length === 0, 'The axis capture gesture immediately activated Menu Confirm');

await page.evaluate(() => { window.__testGamepad.axes[4] = 0; });
await page.waitForTimeout(150);
await page.locator('#controls-back').focus();
await page.evaluate(() => { window.__testGamepad.axes[4] = .8; });
await page.waitForFunction(() => window.__gamepadNavigation.length === 1);
await page.waitForTimeout(500);
let commandNavigation = await page.evaluate(() => window.__gamepadNavigation);
assert(commandNavigation.length === 1 && commandNavigation[0].action === 'confirm' && commandNavigation[0].repeat === false,
  'Held Menu Confirm axis repeated instead of firing one edge');

await page.evaluate(() => { window.__testGamepad.axes[4] = 0; });
await page.waitForTimeout(150);
await page.evaluate(() => { window.__testGamepad.axes[4] = .8; });
await page.waitForFunction(() => window.__gamepadNavigation.length === 2);
commandNavigation = await page.evaluate(() => window.__gamepadNavigation);
assert(commandNavigation.every((event) => event.action === 'confirm' && event.repeat === false),
  'Menu Confirm axis did not require release before its second edge');
await page.evaluate(() => { window.__testGamepad.axes[4] = 0; });
await page.waitForTimeout(150);

await page.waitForSelector('#controls-menu.active');
const menuBackRow = page.locator('.control-row', { has: page.getByText('Menu Back', { exact: true }) }).first();
await menuBackRow.locator('button').click();
await page.evaluate(() => {
  window.__gamepadNavigation = [];
  window.__testGamepad.axes[4] = -.8;
});
await page.waitForFunction(() => document.querySelector('.control-row button[data-action="menu-back"]')?.textContent?.includes('Axis 5 -'));
await page.waitForTimeout(400);
assert((await page.evaluate(() => window.__gamepadNavigation)).length === 0, 'The axis capture gesture immediately activated Menu Back');

await page.evaluate(() => { window.__testGamepad.axes[4] = 0; });
await page.waitForTimeout(150);
await page.evaluate(() => { window.__testGamepad.axes[4] = -.8; });
await page.waitForFunction(() => window.__gamepadNavigation.length === 1);
await page.waitForTimeout(500);
commandNavigation = await page.evaluate(() => window.__gamepadNavigation);
assert(commandNavigation.length === 1 && commandNavigation[0].action === 'back' && commandNavigation[0].repeat === false,
  'Held Menu Back axis repeated instead of firing one edge');
await page.evaluate(() => { window.__testGamepad.axes[4] = 0; });

await page.evaluate(() => { window.__testGamepad.connected = false; });
await page.waitForFunction(() => window.__controllerLifecycle.includes('disconnected'));
await page.evaluate(() => { window.__testGamepad.connected = true; });
await page.waitForFunction(() => window.__controllerLifecycle.includes('reconnected'));
await page.waitForFunction(() => document.querySelector('#runtime-warning').hasAttribute('hidden'));
await page.waitForFunction(() => window.__announcements.includes('Controller reconnected. Controller input is available.'));
let recoveryAnnouncements = await page.evaluate(() => window.__announcements
  .filter((message) => message === 'Controller reconnected. Controller input is available.'));
assert(recoveryAnnouncements.length === 1, `Controller recovery was not announced once: ${JSON.stringify(recoveryAnnouncements)}`);

await page.evaluate(() => window.dispatchEvent(new Event('red-ledger-asset-degraded')));
await page.waitForFunction(() => document.querySelector('#runtime-warning')?.textContent?.includes('visual assets could not load'));
await page.evaluate(() => { window.__testGamepad.connected = false; });
await page.waitForFunction(() => window.__controllerLifecycle.length === 3);
await page.waitForFunction(() => document.querySelector('#runtime-warning')?.textContent?.includes('Controller disconnected'));
await page.evaluate(() => { window.__testGamepad.connected = true; });
await page.waitForFunction(() => window.__controllerLifecycle.length === 4);
await page.waitForFunction(() => !document.querySelector('#runtime-warning')?.textContent?.includes('Controller disconnected'));
assert(await page.locator('#runtime-warning').isVisible(), 'Recovery hid an unrelated runtime warning');
assert((await page.locator('#runtime-warning').textContent())?.includes('visual assets could not load'), 'Recovery removed an unrelated runtime warning');
await page.waitForFunction(() => window.__announcements
  .filter((message) => message === 'Controller reconnected. Controller input is available.').length === 2);
recoveryAnnouncements = await page.evaluate(() => window.__announcements
  .filter((message) => message === 'Controller reconnected. Controller input is available.'));
assert(recoveryAnnouncements.length === 2, `A real second recovery was not announced exactly once: ${JSON.stringify(recoveryAnnouncements)}`);
const controllerLifecycle = await page.evaluate(() => window.__controllerLifecycle);
assert(JSON.stringify(controllerLifecycle) === JSON.stringify(['disconnected', 'reconnected', 'disconnected', 'reconnected']),
  `Controller lifecycle emitted unexpected transitions: ${JSON.stringify(controllerLifecycle)}`);

await page.evaluate(() => window.dispatchEvent(new Event('input-controller-reconnected')));
await page.waitForTimeout(100);
recoveryAnnouncements = await page.evaluate(() => window.__announcements
  .filter((message) => message === 'Controller reconnected. Controller input is available.'));
assert(recoveryAnnouncements.length === 2, 'A duplicate reconnect event announced recovery without a disconnect warning');

assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
console.log('Controls/remapping E2E passed');
await browser.close();
