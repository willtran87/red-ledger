import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
fs.mkdirSync('output/controls', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#options-button');

assert(await page.locator('#vertical-auto-aim').isChecked(), 'Vertical auto-aim did not default on');
assert(await page.locator('#controller-vibration').isChecked(), 'Controller vibration did not default on');
assert((await page.locator('#audio-profile-detail').textContent())?.includes('Balanced stereo direction'),
  'Default audio profile did not explain its listening behavior');
assert((await page.locator('#audio-profile').getAttribute('aria-describedby')) === 'audio-profile-detail',
  'Audio profile selection is not associated with its explanation');
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
await page.locator('#high-contrast').check();
await page.locator('#master-volume').fill('0.35');
await page.locator('#music-volume').fill('0.25');
await page.locator('#sfx-volume').fill('0.45');
await page.selectOption('#audio-profile', 'night');
await page.waitForTimeout(520);
assert(await page.locator('#audio-profile-detail').getAttribute('data-profile') === 'night'
  && (await page.locator('#audio-profile-detail').textContent())?.includes('Compressed dynamics'),
'Night profile did not expose its low-volume listening tradeoff');
await page.evaluate(() => {
  window.__audioPreviewCaptions = [];
  window.addEventListener('audio-caption', (event) => {
    if (['world/hazard-armed', 'ui/menu-accept', 'attack/denial-beam/windup'].includes(event.detail?.cue)) {
      window.__audioPreviewCaptions.push(event.detail);
    }
  });
});
const authoredBeforePreview = JSON.parse(await page.evaluate(() => window.render_game_to_text())).audio.authoredPlays;
await page.click('#audio-preview');
await page.waitForFunction(() => document.querySelector('#audio-preview-status')?.dataset.result === 'played');
await page.waitForTimeout(520);
const audioPreview = await page.evaluate(() => ({
  captions: window.__audioPreviewCaptions,
  audio: JSON.parse(window.render_game_to_text()).audio,
  status: document.querySelector('#audio-preview-status')?.textContent ?? '',
  role: document.querySelector('#audio-preview-status')?.getAttribute('role'),
  busy: document.querySelector('#audio-preview')?.getAttribute('aria-busy'),
}));
assert(audioPreview.status === 'Night preview: hazard left, confirmation center, critical attack right.',
  `Audio preview did not describe its deliberate sequence: ${audioPreview.status}`);
assert(audioPreview.role === 'status' && audioPreview.busy === null, 'Audio preview did not expose stable polite completion feedback');
assert(audioPreview.audio.authoredPlays >= authoredBeforePreview + 3 && audioPreview.audio.profile === 'night',
  'Audio preview did not play all three authored cues through the selected Night profile');
assert(JSON.stringify(audioPreview.captions.map(({ cue, direction, priority }) => ({ cue, direction, priority }))) === JSON.stringify([
  { cue: 'world/hazard-armed', direction: 'left', priority: 'important' },
  { cue: 'ui/menu-accept', direction: 'center', priority: 'routine' },
  { cue: 'attack/denial-beam/windup', direction: 'right', priority: 'critical' },
]), `Audio preview captions lost semantic direction or priority: ${JSON.stringify(audioPreview.captions)}`);
await page.screenshot({ path: 'output/controls/audio-preview-night.png' });

await page.locator('#mute-audio').check();
const authoredBeforeMutedPreview = JSON.parse(await page.evaluate(() => window.render_game_to_text())).audio.authoredPlays;
await page.click('#audio-preview');
await page.waitForFunction(() => document.querySelector('#audio-preview-status')?.dataset.result === 'muted');
await page.waitForTimeout(360);
assert((await page.locator('#audio-preview-status').textContent()) === 'Preview is silent because Mute audio is on.',
  'Muted audio preview did not explain why no sound played');
assert(JSON.parse(await page.evaluate(() => window.render_game_to_text())).audio.authoredPlays === authoredBeforeMutedPreview,
  'Muted audio preview emitted a misleading authored cue');
await page.locator('#mute-audio').uncheck();
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
const hapticFeedback = await page.evaluate(async () => {
  const calls = [];
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
  const actuator = {
    playEffect: async (type, parameters) => { calls.push({ type, parameters }); return 'complete'; },
    reset: async () => { calls.push({ type: 'reset' }); return 'complete'; },
  };
  const gamepad = { connected: true, buttons, axes: [0, 0, 0, 0], vibrationActuator: actuator };
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [gamepad] });
  window.dispatchEvent(new CustomEvent('input-device-change', { detail: { source: 'gamepad' } }));
  window.dispatchEvent(new CustomEvent('weapon-fire', {
    detail: { weapon: 'staple-driver', duration: .2, recoil: .018 },
  }));
  window.dispatchEvent(new CustomEvent('player-hurt', { detail: { amount: 12, direction: 'center' } }));
  await Promise.resolve();
  const enabledCalls = calls.filter((call) => call.type === 'dual-rumble');
  const checkbox = document.querySelector('#controller-vibration');
  checkbox.checked = false;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  const afterDisable = calls.length;
  window.dispatchEvent(new CustomEvent('player-hurt', { detail: { amount: 12, direction: 'center' } }));
  await Promise.resolve();
  return { enabledCalls, afterDisable, finalCalls: calls.length };
});
assert(hapticFeedback.enabledCalls.length === 2, `Controller cues did not reach the active actuator: ${JSON.stringify(hapticFeedback)}`);
assert(hapticFeedback.enabledCalls[0].parameters.weakMagnitude > hapticFeedback.enabledCalls[0].parameters.strongMagnitude,
  'Light weapon haptic did not favor the crisp weak motor');
assert(hapticFeedback.enabledCalls[1].parameters.strongMagnitude > hapticFeedback.enabledCalls[0].parameters.strongMagnitude,
  'Damage haptic did not override weapon feedback with a stronger cue');
assert(hapticFeedback.finalCalls === hapticFeedback.afterDisable, 'Disabled controller vibration still emitted gameplay feedback');
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
assert(!(await page.locator('#controller-vibration').isChecked()), 'Controller vibration opt-out did not persist');
assert(await page.locator('#classic-input').isChecked(), '1993 input preference did not persist');
assert(await page.locator('#text-scale').inputValue() === 'largest', 'Text size did not persist');
assert(await page.locator('#sound-captions').isChecked(), 'Sound caption preference did not persist');
assert(await page.locator('#high-contrast').isChecked(), 'High-contrast attack preference did not persist');
assert(await page.locator('#master-volume').inputValue() === '0.35', 'Master volume did not persist');
assert(await page.locator('#music-volume').inputValue() === '0.25', 'Music volume did not persist');
assert(await page.locator('#sfx-volume').inputValue() === '0.45', 'Effects volume did not persist');
assert(await page.locator('#audio-profile').inputValue() === 'night', 'Audio playback profile did not persist');

await page.click('#restore-options');
assert(await page.locator('#confirm-dialog').isVisible(), 'Restore option defaults did not request confirmation');
assert((await page.locator('#confirm-copy').textContent())?.includes('Custom control bindings'),
  'Restore confirmation did not explain that custom bindings are retained');
assert((await page.locator('#confirm-copy').textContent())?.includes('milestone seals'),
  'Restore confirmation did not explain that earned cosmetics are retained');
assert(await page.evaluate(() => document.activeElement?.id === 'confirm-cancel'),
  'Restore confirmation did not begin on its safe Cancel action');
await page.click('#confirm-cancel');
assert(await page.locator('#controller-sensitivity').inputValue() === '2.3',
  'Canceling option recovery changed a customized setting');
assert(await page.evaluate(() => document.activeElement?.id === 'restore-options'),
  'Canceling option recovery did not restore focus to its trigger');

await page.click('#restore-options');
await page.click('#confirm-accept');
await page.waitForFunction(() => document.querySelector('#options-feedback')?.textContent?.includes('Recommended defaults restored'));
const restoredOptions = await page.evaluate(() => ({
  settings: JSON.parse(localStorage.getItem('red-ledger-settings-v1') ?? '{}'),
  audio: JSON.parse(localStorage.getItem('red-ledger-audio-v1') ?? '{}'),
  feedback: document.querySelector('#options-feedback')?.textContent ?? '',
  feedbackRole: document.querySelector('#options-feedback')?.getAttribute('role'),
  focused: document.activeElement?.id,
  geometry: (() => {
    const screen = document.querySelector('#options-menu').getBoundingClientRect();
    const feedback = document.querySelector('#options-feedback').getBoundingClientRect();
    const actions = document.querySelector('.options-actions').getBoundingClientRect();
    return {
      screen: { top: screen.top, bottom: screen.bottom },
      feedback: { top: feedback.top, bottom: feedback.bottom },
      actions: { top: actions.top, bottom: actions.bottom },
    };
  })(),
}));
assert(await page.locator('#sensitivity').inputValue() === '1.2', 'Option recovery did not restore mouse sensitivity');
assert(await page.locator('#controller-sensitivity').inputValue() === '1.2', 'Option recovery did not restore controller sensitivity');
assert(await page.locator('#touch-sensitivity').inputValue() === '1.2', 'Option recovery did not restore touch sensitivity');
assert(await page.locator('#controller-deadzone').inputValue() === '0.18', 'Option recovery did not restore controller deadzone');
assert(!(await page.locator('#invert-y').isChecked()), 'Option recovery did not restore normal look direction');
assert(await page.locator('#vertical-auto-aim').isChecked(), 'Option recovery did not restore recommended vertical auto-aim');
assert(await page.locator('#controller-vibration').isChecked(), 'Option recovery did not restore controller vibration');
assert(!(await page.locator('#classic-input').isChecked()), 'Option recovery did not disable the 1993 input preset');
assert(await page.locator('#text-scale').inputValue() === 'standard', 'Option recovery did not restore standard text size');
assert(await page.locator('#render-scale').inputValue() === '1', 'Option recovery did not restore the baseline render scale');
assert(await page.locator('#hud-mode').inputValue() === 'classic', 'Option recovery did not restore the classic HUD');
assert(await page.locator('#screen-shake').isChecked() && !(await page.locator('#reduced-motion').isChecked()),
  'Option recovery did not restore the normal browser motion baseline');
assert(!(await page.locator('#high-contrast').isChecked()) && !(await page.locator('#reduced-effects').isChecked())
  && await page.locator('#flash-effects').isChecked(), 'Option recovery did not restore visual feedback defaults');
assert(await page.locator('#master-volume').inputValue() === '0.8'
  && await page.locator('#music-volume').inputValue() === '0.65'
  && await page.locator('#sfx-volume').inputValue() === '0.8', 'Option recovery did not restore audio levels');
assert(await page.locator('#audio-profile').inputValue() === 'speakers'
  && !(await page.locator('#mute-audio').isChecked())
  && !(await page.locator('#sound-captions').isChecked()), 'Option recovery did not restore audio mode defaults');
assert(await page.locator('#audio-profile-detail').getAttribute('data-profile') === 'speakers'
  && (await page.locator('#audio-profile-detail').textContent())?.includes('Balanced stereo direction'),
'Option recovery did not restore the matching audio profile guidance');
assert(restoredOptions.feedback.includes('Custom bindings and milestone seals were kept.'),
  'Option recovery feedback did not state what player data was preserved');
assert(restoredOptions.feedbackRole === 'status' && restoredOptions.focused === 'restore-options',
  'Option recovery lacked polite status feedback or stable post-confirm focus');
assert(restoredOptions.geometry.feedback.top >= restoredOptions.geometry.screen.top
  && restoredOptions.geometry.actions.bottom <= restoredOptions.geometry.screen.bottom + 1
  && restoredOptions.geometry.feedback.bottom <= restoredOptions.geometry.actions.top,
'Option recovery feedback shifted the focused action row outside the 720px viewport');
assert(restoredOptions.settings.controllerSensitivity === 1.2
  && restoredOptions.settings.uiTextScale === 'standard'
  && restoredOptions.settings['vertical-auto-aim'] === true,
'Recommended option defaults were not persisted to the interface settings record');
assert(restoredOptions.audio.master === .8 && restoredOptions.audio.music === .65
  && restoredOptions.audio.sfx === .8 && restoredOptions.audio.profile === 'speakers' && restoredOptions.audio.muted === false,
'Recommended audio defaults were not persisted to the audio settings record');
await page.screenshot({ path: 'output/controls/options-restored.png' });

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

const reducedContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
await reducedContext.addInitScript(() => localStorage.setItem('red-ledger-settings-v1', JSON.stringify({
  'reduced-motion': false,
  'screen-shake': true,
})));
const reducedPage = await reducedContext.newPage();
const reducedErrors = [];
reducedPage.on('pageerror', (error) => reducedErrors.push(String(error)));
reducedPage.on('console', (message) => { if (message.type() === 'error') reducedErrors.push(message.text()); });
await reducedPage.goto(url, { waitUntil: 'networkidle' });
await reducedPage.click('#options-button');
assert(!(await reducedPage.locator('#reduced-motion').isChecked()) && await reducedPage.locator('#screen-shake').isChecked(),
  'Explicit motion preferences were not loaded before recovery');
await reducedPage.click('#restore-options');
await reducedPage.click('#confirm-accept');
assert(await reducedPage.locator('#reduced-motion').isChecked() && !(await reducedPage.locator('#screen-shake').isChecked()),
  'Option recovery ignored the operating-system reduced-motion preference');
assert(reducedErrors.length === 0, `Reduced-motion option recovery errors: ${reducedErrors.join(' | ')}`);
await reducedContext.close();

assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
console.log('Controls/remapping E2E passed');
await browser.close();
