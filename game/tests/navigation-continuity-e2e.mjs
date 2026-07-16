import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const errors = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const watchErrors = (page) => {
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
};

const state = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const activeScreen = (page) => page.locator('.screen.active').getAttribute('id');
const dispatchMenu = (page, action) => page.evaluate((menuAction) => {
  window.dispatchEvent(new CustomEvent('input-menu-navigation', {
    detail: { action: menuAction, source: 'gamepad', repeat: false },
  }));
}, action);
const pauseGame = async (page) => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('input-action', {
    detail: { action: 'pause', source: 'keyboard', repeat: false },
  })));
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'paused');
};

const desktopInputState = (page) => page.evaluate(() => {
  const snapshot = JSON.parse(window.render_game_to_text());
  const canvas = document.querySelector('#game-canvas');
  const gate = document.querySelector('#ready-overlay:not([hidden]), [data-recapture-gate]:not([hidden])');
  return {
    mode: snapshot.mode,
    pointerLocked: document.pointerLockElement === canvas,
    recaptureGateVisible: Boolean(gate && getComputedStyle(gate).display !== 'none'),
  };
});

const assertDesktopInputOwned = async (page, label) => {
  let result;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    result = await desktopInputState(page);
    if (result.mode === 'playing' && result.pointerLocked) return 'locked';
    if (result.mode === 'paused' && result.recaptureGateVisible) return 'gate';
    await page.waitForTimeout(50);
  }
  throw new Error(`${label} silently entered ${result.mode} without pointer lock or a paused recapture gate: ${JSON.stringify(result)}`);
};

const resolveDesktopGate = async (page, readiness) => {
  if (readiness === 'gate') {
    const action = page.locator(
      '#ready-overlay:not([hidden]) #enter-file, [data-recapture-gate]:not([hidden]) [data-recapture-action]',
    ).first();
    assert(await action.isVisible(), 'The desktop recapture gate has no visible action');
    await action.click();
  }
  await page.waitForFunction(() => {
    const snapshot = JSON.parse(window.render_game_to_text());
    return snapshot.mode === 'playing' && document.pointerLockElement === document.querySelector('#game-canvas');
  });
};

const startFirstMap = async (page) => {
  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-actions button').nth(2).click();
  await page.click('#begin-episode');
  assert(await page.locator('#ready-overlay').isVisible(), 'New game did not expose the initial input gate');
  await page.evaluate(() => {
    const canvas = document.querySelector('#game-canvas');
    const requestPointerLock = canvas.requestPointerLock.bind(canvas);
    Object.defineProperty(canvas, 'requestPointerLock', {
      configurable: true,
      value: (...args) => {
        Object.defineProperty(canvas, 'requestPointerLock', { configurable: true, value: requestPointerLock });
        void requestPointerLock(...args)?.catch(() => undefined);
        return undefined;
      },
    });
  });
  await page.click('#enter-file');
  await page.waitForFunction(() => {
    const snapshot = JSON.parse(window.render_game_to_text());
    return snapshot.mode === 'playing'
      && document.pointerLockElement === document.querySelector('#game-canvas')
      && document.querySelector('#ready-overlay').hasAttribute('hidden');
  });
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  watchErrors(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // Main-menu destinations must return to the main menu without changing engine mode.
  await page.click('#replays-button');
  await dispatchMenu(page, 'back');
  assert(await activeScreen(page) === 'menu' && (await state(page)).mode === 'menu', 'Main-menu Replay Back lost its valid origin');
  await page.click('#level-select-button');
  await page.locator('#level-select [data-back]').click();
  assert(await activeScreen(page) === 'menu' && (await state(page)).mode === 'menu', 'Main-menu Level Select Back lost its valid origin');

  // Controller Confirm and Back must be consumed by the modal before the underlying screen.
  await page.click('#quit-game');
  assert(await page.locator('#confirm-dialog').isVisible(), 'Quit did not open its confirmation dialog');
  assert(await page.evaluate(() => document.activeElement?.id) === 'confirm-cancel', 'Confirmation did not focus the safe action');
  await dispatchMenu(page, 'confirm');
  assert(!(await page.locator('#confirm-dialog').isVisible()), 'Gamepad Confirm did not activate the focused dialog action');
  assert(await activeScreen(page) === 'menu', 'Gamepad Confirm activated the screen behind the dialog');
  await page.click('#quit-game');
  await dispatchMenu(page, 'back');
  assert(!(await page.locator('#confirm-dialog').isVisible()), 'Gamepad Back did not cancel the open dialog');
  assert(await activeScreen(page) === 'menu', 'Gamepad Back navigated the screen behind the dialog');

  // A first-run Continue should enter New Game, whose episode choices require visible names.
  assert((await state(page)).mode === 'menu', 'First-run flow did not begin in menu mode');
  await page.click('#continue-game');
  assert(await activeScreen(page) === 'episode-menu', 'Continue without a save did not open Episode Select');
  const episodeLabels = await page.locator('.episode-card').evaluateAll((cards) => cards.map((card) => ({
    text: card.textContent?.trim() ?? '',
    visible: card.getClientRects().length > 0,
  })));
  const expectedEpisodes = ['First Notice', 'Exclusions Apply', 'Adverse Development'];
  assert(episodeLabels.length === expectedEpisodes.length, 'Episode Select does not expose every episode card');
  expectedEpisodes.forEach((label, index) => {
    assert(episodeLabels[index].visible && episodeLabels[index].text.includes(label), `Episode card ${index + 1} has no visible ${label} label`);
  });

  await startFirstMap(page);

  // A key used to confirm Resume must not leak through as a gameplay Use action.
  assert(await page.evaluate(() => window.__redLedger.teleportToDoor('red')), 'Could not stage a locked credential door');
  await page.evaluate(() => window.advanceTime(100));
  await pauseGame(page);
  await page.locator('#resume-game').focus();
  await page.keyboard.press('Space');
  let readiness = await assertDesktopInputOwned(page, 'Keyboard Resume');
  await resolveDesktopGate(page, readiness);
  await page.evaluate(() => window.advanceTime(100));
  assert(!/credential required/i.test((await state(page)).message), 'Resume confirmation leaked through as a gameplay Use action');
  assert(!(await page.locator('#use-feedback').isVisible()), 'Resume confirmation displayed failed Use feedback');

  // Every desktop resume path must either recapture immediately or remain frozen behind an explicit gate.
  await pauseGame(page);
  await page.click('#resume-game');
  readiness = await assertDesktopInputOwned(page, 'Pause Resume');
  await resolveDesktopGate(page, readiness);

  await pauseGame(page);
  await page.click('#record-replay');
  readiness = await assertDesktopInputOwned(page, 'Record Replay');
  await resolveDesktopGate(page, readiness);
  assert(await page.locator('#recording-indicator').isVisible(), 'Recording did not start after desktop input was reacquired');
  await page.evaluate(() => window.advanceTime(200));
  await pauseGame(page);
  await page.click('#record-replay');
  assert(await activeScreen(page) === 'replay-library' && (await state(page)).mode === 'paused', 'Stopping a replay did not preserve the paused session');
  await dispatchMenu(page, 'back');
  assert(await activeScreen(page) === 'pause-menu' && (await state(page)).mode === 'paused', 'Replay Back stranded a paused session at the title');

  // Manual load is paused by design; its subsequent Resume still owns the desktop input transition.
  await page.click('#save-game');
  await page.locator('#save-slot-list .slot-action').first().click();
  await page.click('#load-game');
  await page.locator('#load-slot-list .slot-action').first().click();
  assert(await activeScreen(page) === 'pause-menu' && (await state(page)).mode === 'paused', 'Manual load did not return to a valid paused screen');
  await page.click('#resume-game');
  readiness = await assertDesktopInputOwned(page, 'Load Resume');
  await resolveDesktopGate(page, readiness);

  // Level Select opened from results must return to results, not expose a title over intermission mode.
  await page.evaluate(() => {
    window.__redLedger.defeatAll();
    window.__redLedger.teleportToExit();
    window.__redLedger.use();
  });
  assert(await activeScreen(page) === 'intermission' && (await state(page)).mode === 'intermission', 'Map did not reach intermission');
  await page.click('#intermission-level-select');
  await page.locator('#level-select [data-back]').click();
  assert(await activeScreen(page) === 'intermission' && (await state(page)).mode === 'intermission', 'Intermission Level Select Back stranded results at the title');

  // Death/checkpoint recovery is another desktop transition that must not run unlocked.
  const deathPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  watchErrors(deathPage);
  await deathPage.goto(url, { waitUntil: 'networkidle' });
  await deathPage.evaluate(() => localStorage.clear());
  await deathPage.reload({ waitUntil: 'networkidle' });
  await deathPage.click('#new-game');
  await startFirstMap(deathPage);
  await deathPage.evaluate(() => window.__redLedger.defeatPlayer());
  assert(await activeScreen(deathPage) === 'death-menu' && (await state(deathPage)).mode === 'dead', 'Hazard fixture did not reach the death flow');
  await deathPage.click('#restart-checkpoint');
  await assertDesktopInputOwned(deathPage, 'Restart Checkpoint');

  assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
  console.log('Navigation continuity E2E passed');
} finally {
  await browser.close();
}
