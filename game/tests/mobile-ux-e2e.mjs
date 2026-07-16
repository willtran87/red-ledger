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
const dispatchMenu = (target, action) => target.evaluate((menuAction) => {
  window.dispatchEvent(new CustomEvent('input-menu-navigation', {
    detail: { action: menuAction, source: 'gamepad', repeat: false },
  }));
}, action);

await page.goto(url, { waitUntil: 'networkidle' });
assert(!(await page.locator('#continue-game').evaluate((button) => button.disabled)), 'Continue is undiscoverable when no save exists');
assert(await page.locator('#continue-game').getAttribute('data-available') === 'false', 'Continue does not expose its unavailable state');
await page.click('#continue-game');
assert(await page.locator('#episode-menu').isVisible(), 'Continue without a save did not open New Game episode selection');
assert((await page.locator('.episode-card').first().textContent())?.includes('First Notice'), 'Touch episode selection has no visible title');
await page.locator('#episode-menu [data-back]').click();
await page.click('#options-button');
const optionGeometry = await page.locator('#options-menu').evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, width: rect.width, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight };
});
assert(optionGeometry.top === 0 && optionGeometry.bottom === 844 && optionGeometry.width === 390, 'Options does not occupy the portrait viewport');
assert(optionGeometry.clientHeight === 844, 'Options is compressed on portrait mobile');
await page.locator('#sfx-volume').fill('0.35');
await page.locator('#flash-effects').uncheck();
await page.locator('#touch-sensitivity').fill('1.7');
await page.selectOption('#touch-size', 'large');
await page.locator('#touch-opacity').fill('0.62');
await page.selectOption('#touch-handedness', 'left');
const standardHudFonts = await page.evaluate(() => ({
  objective: parseFloat(getComputedStyle(document.querySelector('#objective')).fontSize),
  status: parseFloat(getComputedStyle(document.querySelector('#status')).fontSize),
}));
await page.selectOption('#text-scale', 'large');
const largeHudFonts = await page.evaluate(() => ({
  objective: parseFloat(getComputedStyle(document.querySelector('#objective')).fontSize),
  status: parseFloat(getComputedStyle(document.querySelector('#status')).fontSize),
}));
await page.selectOption('#text-scale', 'largest');
const largestHudFonts = await page.evaluate(() => ({
  objective: parseFloat(getComputedStyle(document.querySelector('#objective')).fontSize),
  status: parseFloat(getComputedStyle(document.querySelector('#status')).fontSize),
}));
assert(largeHudFonts.objective > standardHudFonts.objective
  && largestHudFonts.objective > largeHudFonts.objective,
  `Objective text scale is not progressive: ${JSON.stringify({ standardHudFonts, largeHudFonts, largestHudFonts })}`);
assert(largeHudFonts.status > standardHudFonts.status
  && largestHudFonts.status > largeHudFonts.status,
  `Status text scale is not progressive: ${JSON.stringify({ standardHudFonts, largeHudFonts, largestHudFonts })}`);
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
  window.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 91, pointerType: 'touch' }));
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
  document.querySelector('#hud').classList.add('active');
  window.__touchEvents = [];
  window.addEventListener('input-action', (event) => window.__touchEvents.push(`press:${event.detail.action}:${event.detail.source}`));
  window.addEventListener('input-action-release', (event) => window.__touchEvents.push(`release:${event.detail.action}:${event.detail.source}`));
});
assert(await page.locator('#game-shell').getAttribute('data-input-device') === 'touch', 'Touch activity did not become the active input device');
for (const selector of ['#touch-stick', '#touch-look', '#touch-fire', '#touch-use', '#touch-weapon', '#touch-map', '#touch-pause']) {
  assert(await page.locator(selector).isVisible(), `${selector} is not visible in the portrait control deck`);
  const box = await page.locator(selector).boundingBox();
  assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, `${selector} escapes the portrait viewport`);
}
await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 92, pointerType: 'mouse' })));
assert(await page.locator('#game-shell').getAttribute('data-input-device') === 'desktop', 'Mouse activity did not become the active input device');
assert(!(await page.locator('#touch-controls').isVisible()), 'A coarse primary pointer forced the touch deck over active mouse input');
await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 93, pointerType: 'touch' })));
assert(await page.locator('#touch-controls').isVisible(), 'Touch activity did not restore the touch deck');
const personalizedDeck = await page.evaluate(() => {
  const geometry = (selector) => {
    const element = document.querySelector(selector);
    const rect = element.getBoundingClientRect();
    return { x: rect.x, width: rect.width, opacity: Number(getComputedStyle(element).opacity) };
  };
  const shell = document.querySelector('#game-shell');
  return {
    size: shell.dataset.touchSize,
    hand: shell.dataset.touchHandedness,
    move: geometry('#touch-stick'),
    fire: geometry('#touch-fire'),
  };
});
assert(personalizedDeck.size === 'large' && personalizedDeck.move.width === 110, 'Large touch controls did not resize their visual and hit geometry');
assert(personalizedDeck.hand === 'left' && personalizedDeck.move.x > 390 / 2 && personalizedDeck.fire.x < 390 / 2, 'Left-handed touch controls did not mirror the deck');
assert(Math.abs(personalizedDeck.fire.opacity - .62) < .01, 'Touch opacity did not apply to the control deck');
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
assert(await page.locator('#touch-sensitivity').inputValue() === '1.7', 'Touch sensitivity did not persist');
assert(await page.locator('#touch-size').inputValue() === 'large', 'Touch control size did not persist');
assert(await page.locator('#touch-opacity').inputValue() === '0.62', 'Touch opacity did not persist');
assert(await page.locator('#touch-handedness').inputValue() === 'left', 'Touch handedness did not persist');
assert(await page.locator('#text-scale').inputValue() === 'largest', 'Mobile text size did not persist');

await page.locator('#options-menu [data-back]').click();
await page.click('#new-game');
await page.locator('.episode-card').first().click();
const orientationDifficulty = page.locator('#difficulty-actions button').first();
assert((await orientationDifficulty.getAttribute('aria-describedby'))?.includes('difficulty-orientation-description'),
  'Difficulty choice does not own a stable accessible description');
await orientationDifficulty.tap();
assert(await page.locator('#difficulty-menu').isVisible(), 'A touch preview committed the difficulty immediately');
assert((await page.locator('#difficulty-detail').innerText()).includes('Story-focused'), 'Touch preview did not expose the selected difficulty detail');
assert(await orientationDifficulty.getAttribute('aria-pressed') === 'true', 'Touch preview did not synchronize the selected difficulty state');
assert(await page.locator('#difficulty-confirm').isVisible(), 'Touch difficulty preview did not reveal an explicit Continue command');
assert((await page.locator('#difficulty-confirm').innerText()).includes('Orientation'), 'Touch confirmation does not name the selected difficulty');
await page.locator('#difficulty-confirm').tap();
await page.locator('#begin-episode').tap();
assert(await page.locator('#ready-overlay').isVisible(), 'Touch entry briefing is not visible');
assert(await page.locator('#ready-overlay').getAttribute('data-input') === 'touch', 'Entry briefing did not select touch guidance');
const touchBriefing = await page.locator('#entry-controls').innerText();
for (const action of ['MOVE', 'LOOK', 'FIRE', 'USE']) {
assert(touchBriefing.includes(action), `Touch briefing omits ${action}`);
}
const touchBriefingValues = await page.locator('#entry-controls > span').evaluateAll((items) => Object.fromEntries(items.map((item) => [
  item.querySelector('b').textContent,
  item.querySelector('small').textContent,
])));
assert(touchBriefingValues.MOVE === 'Right pad' && touchBriefingValues.LOOK === 'Left pad',
  `Left-handed briefing did not mirror its pad labels: ${JSON.stringify(touchBriefingValues)}`);
assert(touchBriefingValues.FIRE === 'FIRE control', 'Touch briefing identifies Fire by color instead of its command label');
const touchPadLabels = await page.evaluate(() => ({
  move: getComputedStyle(document.querySelector('#touch-stick'), '::after').content,
  look: getComputedStyle(document.querySelector('#touch-look'), '::after').content,
}));
assert(touchPadLabels.move.includes('MOVE') && touchPadLabels.look.includes('LOOK'), 'Touch pads lack persistent Move/Look labels');
assert(!touchBriefing.includes('WEAPON') && !touchBriefing.includes('MAP'), 'Touch orientation repeats advanced controls');
assert((await page.locator('#entry-objective').innerText()).includes('Red credential'), 'Touch orientation has no contextual objective');
assert((await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode)) === 'paused', 'Touch briefing did not freeze simulation');
await page.screenshot({ path: 'output/mobile-ux/entry-briefing-390x844.png' });
await page.locator('#enter-file').tap();
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
await page.waitForTimeout(300);
await page.waitForFunction(() => document.querySelector('#message').textContent.trim().length > 0);
const portraitHudCopy = await page.evaluate(() => {
  const rect = (selector) => {
    const bounds = document.querySelector(selector).getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width };
  };
  return { message: rect('#message'), objective: rect('#objective'), shell: rect('#game-shell') };
});
assert(Math.abs((portraitHudCopy.message.left + portraitHudCopy.message.right) / 2
  - (portraitHudCopy.shell.left + portraitHudCopy.shell.right) / 2) < 1, 'Largest text message does not have a real centered line box');
assert(portraitHudCopy.message.bottom <= portraitHudCopy.objective.top
  || portraitHudCopy.objective.bottom <= portraitHudCopy.message.top,
  'Largest text message overlaps the objective in portrait gameplay');
const acquiredCredential = await page.evaluate(() => {
  window.__redLedger.defeatMandatory('entry');
  window.__redLedger.defeatMandatory('transformation');
  window.__redLedger.defeatMandatory('climax');
  if (!window.__redLedger.teleportToPickup('credential', 'red')) return false;
  window.advanceTime(70);
  return JSON.parse(window.render_game_to_text()).player.credentials.includes('red');
});
assert(acquiredCredential, 'Mobile HUD fixture could not acquire the route-critical red credential');
const credentialGeometry = await page.evaluate(() => {
  const keys = document.querySelector('#keys').getBoundingClientRect();
  const icon = document.querySelector('#keys img')?.getBoundingClientRect();
  const status = document.querySelector('#status').getBoundingClientRect();
  return icon && {
    visible: getComputedStyle(document.querySelector('#keys')).display !== 'none',
    icon: { left: icon.left, right: icon.right, top: icon.top, bottom: icon.bottom },
    status: { left: status.left, right: status.right, top: status.top, bottom: status.bottom },
  };
});
assert(credentialGeometry?.visible, 'Mobile HUD hides acquired route credentials');
assert(credentialGeometry.icon.left >= credentialGeometry.status.left
  && credentialGeometry.icon.right <= credentialGeometry.status.right
  && credentialGeometry.icon.top >= credentialGeometry.status.top
  && credentialGeometry.icon.bottom <= credentialGeometry.status.bottom,
  'Mobile credential icon escapes the status bar');
const statusCopyFits = await page.locator('#status > span').evaluateAll((items) => items.every((item) => item.scrollWidth <= item.clientWidth + 1));
assert(statusCopyFits, 'Largest mobile status text overflows its compact HUD columns');
await page.screenshot({ path: 'output/mobile-ux/credential-hud-390x844.png' });
const readState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const beforeMove = await readState();
const drag = async (selector, dx, dy, duration = 300) => {
  const pointerId = selector === '#touch-stick' ? 95 : 96;
  await page.locator(selector).evaluate((control, detail) => {
    let captured;
    control.setPointerCapture = (id) => { captured = id; };
    control.hasPointerCapture = (id) => captured === id;
    control.releasePointerCapture = (id) => { if (captured === id) captured = undefined; };
    const rect = control.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const pointer = (type, clientX, clientY) => control.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      pointerId: detail.pointerId,
      pointerType: 'touch',
      clientX,
      clientY,
    }));
    pointer('pointerdown', x, y);
    for (let step = 1; step <= 4; step += 1) pointer('pointermove', x + detail.dx * step / 4, y + detail.dy * step / 4);
  }, { dx, dy, pointerId });
  await page.waitForTimeout(duration);
  await page.locator(selector).evaluate((control, detail) => {
    const rect = control.getBoundingClientRect();
    control.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: detail.pointerId,
      pointerType: 'touch',
      clientX: rect.left + rect.width / 2 + detail.dx,
      clientY: rect.top + rect.height / 2 + detail.dy,
    }));
  }, { dx, dy, pointerId });
};
await drag('#touch-stick', 0, -34);
const afterMove = await readState();
assert(Math.hypot(afterMove.player.x - beforeMove.player.x, afterMove.player.z - beforeMove.player.z) > .2, 'Dragging the move stick did not move the player');
await drag('#touch-look', 32, 12, 180);
const afterLook = await readState();
assert(Math.abs(afterLook.player.yaw - afterMove.player.yaw) > .02, 'Dragging the look stick did not turn the player');

const heldLookPitch = async (eventCount) => {
  return page.locator('#touch-look').evaluate((look, count) => {
    window.__redLedger.loadMap('E1M1');
    let captured;
    look.setPointerCapture = (pointerId) => { captured = pointerId; };
    look.hasPointerCapture = (pointerId) => captured === pointerId;
    look.releasePointerCapture = (pointerId) => { if (captured === pointerId) captured = undefined; };
    const rect = look.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const pointer = (type, y) => look.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      pointerId: 73,
      pointerType: 'touch',
      clientX: centerX,
      clientY: y,
    }));
    pointer('pointerdown', centerY);
    for (let index = 1; index <= count; index += 1) pointer('pointermove', centerY + 40 * index / count);
    window.advanceTime(160);
    const pitch = JSON.parse(window.render_game_to_text()).player.pitch;
    look.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 73,
      pointerType: 'touch',
      clientX: centerX,
      clientY: centerY + 40,
    }));
    return pitch;
  }, eventCount);
};
const sparsePitch = await heldLookPitch(1);
const densePitch = await heldLookPitch(8);
assert(Math.abs(sparsePitch) > .04 && Math.abs(densePitch) > .04,
  `Touch look cadence fixture did not produce a meaningful pitch: ${sparsePitch}/${densePitch}`);
assert(Math.abs(sparsePitch - densePitch) < .001,
  `Touch look depends on pointer event count: ${sparsePitch} vs ${densePitch}`);
await page.screenshot({ path: 'output/mobile-ux/gameplay-sticks-390x844.png' });

await page.locator('#touch-pause').tap();
await page.locator('#record-replay').tap();
await page.waitForTimeout(200);
await page.locator('#touch-pause').tap();
await page.locator('#record-replay').tap();
assert(await page.locator('#replay-library').isVisible(), 'Stopping a touch replay did not open the replay library');
const replayNameGeometry = await page.locator('.replay-row input').first().evaluate((input) => {
  const style = getComputedStyle(input);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.font = style.font;
  return { clientWidth: input.clientWidth, textWidth: context.measureText(input.value).width };
});
assert(replayNameGeometry.clientWidth >= replayNameGeometry.textWidth + 8, 'The default replay name is truncated on portrait mobile');
await page.screenshot({ path: 'output/mobile-ux/replay-library-390x844.png' });

const landscapeContext = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const landscapePage = await landscapeContext.newPage();
landscapePage.on('pageerror', (error) => errors.push(String(error)));
await landscapePage.goto(url, { waitUntil: 'networkidle' });
await landscapePage.evaluate(() => {
  window.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 94, pointerType: 'touch' }));
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
  document.querySelector('#hud').classList.add('active');
});
assert(await landscapePage.locator('#game-shell').getAttribute('data-input-device') === 'touch', 'Landscape touch activity did not select the touch deck');
const landscapeShell = await landscapePage.locator('#game-shell').boundingBox();
assert(landscapeShell, 'Landscape game shell has no layout bounds');
for (const selector of ['#touch-stick', '#touch-look', '#touch-fire', '#touch-use', '#touch-weapon', '#touch-map', '#touch-pause']) {
  assert(await landscapePage.locator(selector).isVisible(), `${selector} is not visible in the landscape control deck`);
  const box = await landscapePage.locator(selector).boundingBox();
  assert(box
    && box.x >= landscapeShell.x
    && box.y >= landscapeShell.y
    && box.x + box.width <= landscapeShell.x + landscapeShell.width
    && box.y + box.height <= landscapeShell.y + landscapeShell.height,
  `${selector} escapes the landscape game shell`);
}
await landscapePage.screenshot({ path: 'output/mobile-ux/control-deck-844x390.png' });
await landscapeContext.close();

const hybridContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const hybridPage = await hybridContext.newPage();
hybridPage.on('pageerror', (error) => errors.push(String(error)));
await hybridPage.goto(url, { waitUntil: 'networkidle' });
await dispatchMenu(hybridPage, 'confirm');
await hybridPage.locator('#episode-menu').waitFor({ state: 'visible' });
await dispatchMenu(hybridPage, 'confirm');
await hybridPage.locator('#difficulty-menu').waitFor({ state: 'visible' });
await dispatchMenu(hybridPage, 'confirm');
await hybridPage.locator('#episode-intro').waitFor({ state: 'visible' });
await dispatchMenu(hybridPage, 'confirm');
await hybridPage.locator('#ready-overlay').waitFor({ state: 'visible' });
assert(await hybridPage.locator('#game-shell').getAttribute('data-input-device') === 'gamepad', 'Hybrid input did not retain the controller as the active device');
assert(await hybridPage.locator('#ready-overlay').getAttribute('data-input') === 'gamepad', 'Hybrid entry briefing showed touch guidance after controller navigation');
const gamepadBriefing = await hybridPage.locator('#entry-controls').innerText();
for (const binding of ['Left stick', 'Right stick', 'Button 8', 'Button 1']) {
  assert(gamepadBriefing.includes(binding), `Hybrid controller briefing omits ${binding}`);
}
await dispatchMenu(hybridPage, 'confirm');
await hybridPage.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
assert(!(await hybridPage.locator('#touch-controls').isVisible()), 'Touch controls covered gameplay while a controller was active');
await hybridContext.close();

assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
console.log('Mobile UX, hybrid controller guidance, real stick gameplay, touch events, focus, feedback, and settings persistence passed');
await browser.close();
