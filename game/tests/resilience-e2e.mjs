import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const monitorUnexpectedErrors = (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const value = message.text();
    if (!value.includes('Failed to load resource')) errors.push(value);
  });
  return errors;
};

const expectNoUnexpectedErrors = (label, errors) => {
  assert(errors.length === 0, `${label} emitted unexpected errors: ${errors.join(' | ')}`);
};

const waitForGame = async (page) => {
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
};

const state = async (page) => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

const startNewGame = async (page) => {
  await page.click('#new-game');
  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-actions button').nth(2).click();
  await page.click('#begin-episode');
  if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
};

const openReadyOverlay = async (page) => {
  await page.click('#new-game');
  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-actions button').nth(2).click();
  await page.click('#begin-episode');
  await page.locator('#ready-overlay').waitFor({ state: 'visible' });
  assert((await state(page)).mode === 'paused', 'Ready overlay did not keep the runtime paused');
};

const triggerContextLoss = async (page, exposeReplayGate = false) => page.evaluate((showReplayGate) => {
  const ready = document.querySelector('#ready-overlay');
  const replay = document.querySelector('#replay-controls');
  const warning = document.querySelector('#runtime-warning');
  const dialog = document.querySelector('#confirm-dialog');
  if (showReplayGate) replay.hidden = false;
  window.dispatchEvent(new CustomEvent('red-ledger-asset-degraded', { detail: { url: 'fatal-layer-fixture.png' } }));
  const before = {
    readyVisible: !ready.hidden,
    replayVisible: !replay.hidden,
    warningVisible: !warning.hidden,
    dialogOpen: dialog.open,
  };
  const event = new Event('webglcontextlost', { cancelable: true });
  document.querySelector('#game-canvas').dispatchEvent(event);
  return {
    before,
    defaultPrevented: event.defaultPrevented,
    readyHidden: ready.hidden,
    replayHidden: replay.hidden,
    warningHidden: warning.hidden,
    dialogOpen: dialog.open,
    fatalActive: document.querySelector('#fatal-error').classList.contains('active'),
    activeElement: document.activeElement?.id,
  };
}, exposeReplayGate);

const assertFatalLayering = async (page, transition, label) => {
  assert(transition.defaultPrevented, `${label} context loss was not claimed by the runtime`);
  assert(transition.readyHidden, `${label} left the ready overlay above Fatal`);
  assert(transition.replayHidden, `${label} left replay controls above Fatal`);
  assert(transition.warningHidden, `${label} left the runtime warning above Fatal`);
  assert(!transition.dialogOpen, `${label} left a modal dialog above Fatal`);
  assert(transition.fatalActive, `${label} did not synchronously activate Fatal`);
  assert(transition.activeElement === 'fatal-reload', `${label} did not focus Reload`);

  await page.waitForTimeout(100);
  assert(await page.locator('#fatal-error').isVisible(), `${label} Fatal screen is not visible`);
  assert((await page.locator('.screen.active').count()) === 1, `${label} left another screen active with Fatal`);
  assert(await page.locator('#fatal-error-copy').textContent().then((copy) => copy.includes('graphics context was lost')), `${label} Fatal copy did not explain the renderer loss`);
  assert(await page.locator('#fatal-reload').isEnabled(), `${label} Reload is disabled`);
  assert(await page.evaluate(() => {
    const reload = document.querySelector('#fatal-reload');
    const bounds = reload.getBoundingClientRect();
    const top = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return top === reload || reload.contains(top);
  }), `${label} Reload is covered by another layer`);
};

const readyContextLossScenario = async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = monitorUnexpectedErrors(page);
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await waitForGame(page);
    await openReadyOverlay(page);
    const transition = await triggerContextLoss(page, true);
    assert(transition.before.readyVisible, 'Ready context-loss fixture did not expose the ready overlay');
    assert(transition.before.replayVisible, 'Ready context-loss fixture did not expose replay controls');
    assert(transition.before.warningVisible, 'Ready context-loss fixture did not expose the runtime warning');
    await assertFatalLayering(page, transition, 'Ready context loss');
    expectNoUnexpectedErrors('Ready context-loss scenario', errors);
  } finally {
    await context.close();
  }
};

const confirmationContextLossScenario = async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = monitorUnexpectedErrors(page);
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await waitForGame(page);
    await page.click('#quit-game');
    assert(await page.locator('#confirm-dialog').evaluate((dialog) => dialog.open), 'Confirmation context-loss fixture did not open its dialog');
    const transition = await triggerContextLoss(page);
    assert(transition.before.dialogOpen, 'Confirmation context-loss fixture was not modal before the fault');
    assert(transition.before.warningVisible, 'Confirmation context-loss fixture did not expose the runtime warning');
    await assertFatalLayering(page, transition, 'Confirmation context loss');
    expectNoUnexpectedErrors('Confirmation context-loss scenario', errors);
  } finally {
    await context.close();
  }
};

const activeGameplayContextLossScenario = async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = monitorUnexpectedErrors(page);
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await waitForGame(page);
    await startNewGame(page);
    const before = await state(page);
    assert(before.mode === 'playing', 'Active context-loss fixture did not reach gameplay');

    const transition = await triggerContextLoss(page);
    await assertFatalLayering(page, transition, 'Active gameplay context loss');
    await page.waitForFunction(() => {
      const snapshot = JSON.parse(window.render_game_to_text());
      return snapshot.runtime.halted
        && snapshot.mode === 'paused'
        && snapshot.audio.lifecycleSuspended
        && document.pointerLockElement === null;
    });
    const frozen = await state(page);
    await page.waitForTimeout(250);
    const after = await state(page);
    assert(after.tally.elapsed === frozen.tally.elapsed, 'Fatal gameplay continued simulating behind the recovery screen');
    assert(after.player.x === frozen.player.x && after.player.z === frozen.player.z, 'Fatal gameplay continued moving behind the recovery screen');
    assert(after.audio.activeVoices === frozen.audio.activeVoices, 'Fatal gameplay continued allocating audio voices');
    expectNoUnexpectedErrors('Active gameplay context-loss scenario', errors);
  } finally {
    await context.close();
  }
};

const activeGameplayRuntimeFaultScenario = async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = monitorUnexpectedErrors(page);
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await waitForGame(page);
    await startNewGame(page);
    const before = await state(page);
    assert(before.mode === 'playing', 'Runtime-fault fixture did not reach gameplay');

    await page.evaluate(() => window.__redLedger.failRuntime());
    await page.locator('#fatal-error').waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const snapshot = JSON.parse(window.render_game_to_text());
      return snapshot.runtime.halted
        && snapshot.mode === 'paused'
        && snapshot.audio.lifecycleSuspended
        && document.pointerLockElement === null;
    });
    const copy = await page.locator('#fatal-error-copy').textContent();
    assert(copy.includes('unexpected error interrupted the game'), `Runtime Fatal copy did not explain the interruption: ${copy}`);
    assert(copy.includes('Injected runtime frame failure'), `Runtime Fatal copy omitted the fault reason: ${copy}`);
    assert((await page.locator('.screen.active').count()) === 1, 'Runtime fault left another screen active with Fatal');
    assert(await page.evaluate(() => document.activeElement?.id === 'fatal-reload'), 'Runtime fault did not focus Reload');

    const frozen = await state(page);
    await page.waitForTimeout(250);
    const after = await state(page);
    assert(after.tally.elapsed === frozen.tally.elapsed, 'Runtime fault continued simulating behind Fatal');
    assert(after.player.x === frozen.player.x && after.player.z === frozen.player.z, 'Runtime fault continued moving behind Fatal');
    expectNoUnexpectedErrors('Active gameplay runtime-fault scenario', errors);
  } finally {
    await context.close();
  }
};

const deniedFullscreenScenario = async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value: () => Promise.reject(new DOMException('Fullscreen denied by browser policy', 'NotAllowedError')),
    });
  });
  const page = await context.newPage();
  const errors = monitorUnexpectedErrors(page);
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await waitForGame(page);
    await startNewGame(page);
    await page.keyboard.press('KeyF');
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).message === 'Fullscreen unavailable');
    const snapshot = await state(page);
    assert(snapshot.mode === 'playing' && !snapshot.runtime.halted, 'Denied fullscreen halted active gameplay');
    assert(!(await page.locator('#fatal-error').isVisible()), 'Denied fullscreen escalated to Fatal');
    expectNoUnexpectedErrors('Denied-fullscreen scenario', errors);
  } finally {
    await context.close();
  }
};

const deniedStorageScenario = async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => {
    const deny = () => {
      throw new DOMException('Storage access denied by browser policy', 'SecurityError');
    };
    for (const method of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
      Object.defineProperty(Storage.prototype, method, { configurable: true, value: deny });
    }
  });
  const page = await context.newPage();
  const errors = monitorUnexpectedErrors(page);

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await waitForGame(page);
    assert(await page.locator('#menu').isVisible(), 'Denied storage did not reach the main menu');
    assert(await page.locator('#bootstrap-status').evaluate((node) => node.hidden), 'Bootstrap status remained after storage fallback');
    assert(await page.locator('#game-shell').getAttribute('aria-busy') === 'false', 'Game shell remained busy after storage fallback');
    const warning = await page.locator('#runtime-warning').textContent();
    assert(await page.locator('#runtime-warning').isVisible(), 'Denied storage did not show a runtime warning');
    assert(warning.includes('Browser storage is unavailable'), `Denied storage warning was unclear: ${warning}`);
    assert(await page.evaluate(() => {
      try {
        localStorage.setItem('resilience-probe', 'denied');
        return false;
      } catch {
        return true;
      }
    }), 'Storage denial harness did not remain active');

    await startNewGame(page);
    await page.evaluate(() => window.__redLedger.pause());
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'paused');
    const pausedFallback = await state(page);
    assert(pausedFallback.pause?.recoveryState === 'session-only',
      `Denied storage did not identify its session-only checkpoint: ${JSON.stringify(pausedFallback.pause)}`);
    assert(pausedFallback.pause.recovery.includes('Session-only checkpoint'),
      `Denied storage pause dossier obscured checkpoint durability: ${pausedFallback.pause.recovery}`);
    assert(await page.locator('#pause-review').getAttribute('data-recovery') === 'session-only',
      'Denied storage pause dossier lacks its visible session-only state');
    await page.click('#save-game');
    await page.locator('#save-slot-list .slot-action').first().click();
    assert(await page.locator('#pause-menu').isVisible(), 'In-session manual save did not return to pause');

    await page.click('#load-game');
    const savedSlot = page.locator('#load-slot-list .slot-row').first();
    assert(await savedSlot.locator('.slot-action').isEnabled(), 'In-session manual save was not readable from fallback memory');
    const savedDetail = await savedSlot.locator('small').textContent();
    assert(savedDetail.includes('E1M1'), `Fallback save did not retain its map metadata: ${savedDetail}`);
    await savedSlot.locator('.slot-action').click();
    const restored = await state(page);
    assert(restored.mode === 'paused' && restored.map.id === 'E1M1', 'Fallback manual save did not restore in-session');
    assert(restored.exitReview?.recoveryState === 'session-only',
      `Denied storage text state hid its session-only exit review: ${JSON.stringify(restored.exitReview)}`);
    await page.click('#quit-menu');
    const exitFallback = await page.locator('#confirm-review').evaluate((review) => ({
      recovery: review.dataset.recovery,
      consequence: review.dataset.consequence,
      returnPoint: review.querySelector('#confirm-return-point').textContent,
      durability: review.querySelector('#confirm-durability').textContent,
      label: review.getAttribute('aria-label'),
    }));
    assert(exitFallback.recovery === 'session-only', `Denied storage exit review hid its tab-only return point: ${JSON.stringify(exitFallback)}`);
    assert(exitFallback.returnPoint.includes('Manual file') && exitFallback.returnPoint.includes('E1M1'),
      `Denied storage exit review did not name the exact Continue file: ${exitFallback.returnPoint}`);
    assert(exitFallback.durability.includes('only while this tab remains open'),
      `Denied storage exit review misstated durability: ${exitFallback.durability}`);
    assert(exitFallback.label.includes('Return point') && exitFallback.label.includes('E1M1'),
      'Denied storage exit review lacks a complete accessible summary');
    await page.click('#confirm-cancel');
    assert(await page.locator('#pause-menu').isVisible(), 'Canceling the session-only exit review did not return to pause');

    await page.click('#resume-game');
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
    await page.evaluate(() => {
      window.__redLedger.defeatAll();
      window.__redLedger.teleportToExit();
      window.__redLedger.use();
    });
    assert((await state(page)).mode === 'intermission', 'Fallback campaign could not complete E1M1');
    await page.locator('#intermission').waitFor({ state: 'visible' });
    await page.click('#intermission-level-select');
    const recordSummary = await page.locator('#level-select-list button').first().locator('small').first().textContent();
    assert(/^Fresh Start \| Grade [SABCDF] /.test(recordSummary),
      `Fallback campaign record was not readable in-session: ${recordSummary}`);
    expectNoUnexpectedErrors('Denied-storage scenario', errors);
  } finally {
    await context.close();
  }
};

const catalogRetryScenario = async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = monitorUnexpectedErrors(page);
  let requests = 0;
  await page.route('**/data/game-assets.json', async (route) => {
    requests += 1;
    if (requests === 1) await route.abort('failed');
    else await route.continue();
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('#fatal-error').waitFor({ state: 'visible' });
    const fatalCopy = await page.locator('#fatal-error-copy').textContent();
    assert(fatalCopy.includes('could not initialize'), `Catalog failure did not explain the fatal startup state: ${fatalCopy}`);
    assert(await page.locator('#bootstrap-status').evaluate((node) => node.hidden), 'Fatal startup left the bootstrap status visible');
    assert(await page.locator('#game-shell').getAttribute('aria-busy') === 'false', 'Fatal startup left the game shell busy');
    assert(await page.evaluate(() => typeof window.render_game_to_text === 'undefined'), 'Fatal startup exposed an unusable render hook');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.click('#fatal-reload'),
    ]);
    await waitForGame(page);
    assert(requests >= 2, `Reload did not retry the catalog request; observed ${requests}`);
    assert(await page.locator('#menu').isVisible(), 'Successful catalog retry did not reach the main menu');
    assert(!(await page.locator('#fatal-error').isVisible()), 'Fatal screen remained after successful retry');
    assert(await page.locator('#bootstrap-status').evaluate((node) => node.hidden), 'Successful retry left bootstrap status visible');
    assert(await page.locator('#game-shell').getAttribute('aria-busy') === 'false', 'Successful retry left the game shell busy');
    expectNoUnexpectedErrors('Catalog-retry scenario', errors);
  } finally {
    await context.close();
  }
};

const textureFallbackScenario = async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => {
    window.__resilienceAssetDegradations = [];
    window.addEventListener('red-ledger-asset-degraded', (event) => {
      window.__resilienceAssetDegradations.push(event.detail?.url ?? 'unknown');
    });
  });
  const page = await context.newPage();
  const errors = monitorUnexpectedErrors(page);
  let failedTextureRequests = 0;
  const texturePattern = /\/public_runtime\/textures\/walls\/office-drywall-gray\/texture_office-drywall-gray_clean_00\.png(?:\?.*)?$/;
  await page.route(texturePattern, async (route) => {
    failedTextureRequests += 1;
    await route.abort('failed');
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await waitForGame(page);
    await startNewGame(page);
    await page.waitForFunction(() => window.__resilienceAssetDegradations.length > 0);
    assert(failedTextureRequests > 0, 'Gameplay texture failure route was not exercised');
    const failedUrls = await page.evaluate(() => [...window.__resilienceAssetDegradations]);
    assert(failedUrls.some((value) => value.includes('office-drywall-gray')), `Placeholder branch did not report the failed texture: ${failedUrls.join(', ')}`);
    const warning = await page.locator('#runtime-warning').textContent();
    assert(await page.locator('#runtime-warning').isVisible(), 'Texture failure did not show a runtime warning');
    assert(warning.includes('Safe placeholder art is in use'), `Texture fallback warning was unclear: ${warning}`);
    assert(!(await page.locator('#fatal-error').isVisible()), 'A gameplay texture failure escalated to the fatal screen');

    const before = await state(page);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(350);
    await page.keyboard.up('ArrowUp');
    const after = await state(page);
    assert(after.mode === 'playing' && after.map.id === 'E1M1', 'Map stopped running after placeholder substitution');
    assert(after.player.x !== before.player.x || after.player.z !== before.player.z, 'Map did not remain navigable after placeholder substitution');
    expectNoUnexpectedErrors('Texture-fallback scenario', errors);
  } finally {
    await context.close();
  }
};

const delayedCatalogScenario = async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = monitorUnexpectedErrors(page);
  let releaseCatalog;
  let catalogRequested;
  const catalogGate = new Promise((resolve) => { releaseCatalog = resolve; });
  const requestStarted = new Promise((resolve) => { catalogRequested = resolve; });
  await page.route('**/data/game-assets.json', async (route) => {
    catalogRequested();
    await catalogGate;
    await route.continue();
  });

  let navigation;
  try {
    navigation = page.goto(url, { waitUntil: 'domcontentloaded' });
    await requestStarted;
    await page.locator('#bootstrap-status').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    assert(await page.locator('#bootstrap-status').isVisible(), 'Bootstrap status disappeared while the catalog was still pending');
    assert(await page.locator('#game-shell').getAttribute('aria-busy') === 'true', 'Game shell stopped reporting busy while the catalog was pending');
    assert(await page.evaluate(() => typeof window.render_game_to_text === 'undefined'), 'Game became interactive before the delayed catalog resolved');
  } finally {
    releaseCatalog();
  }

  try {
    await navigation;
    await waitForGame(page);
    assert(await page.locator('#bootstrap-status').evaluate((node) => node.hidden), 'Bootstrap status remained after interactive initialization');
    assert(await page.locator('#game-shell').getAttribute('aria-busy') === 'false', 'Game shell remained busy after interactive initialization');
    await page.click('#new-game');
    assert(await page.locator('#episode-menu').isVisible(), 'Menu was not interactive after the delayed catalog resolved');
    expectNoUnexpectedErrors('Delayed-catalog scenario', errors);
  } finally {
    await context.close();
  }
};

const scenarios = [
  ['Ready-overlay context loss', readyContextLossScenario],
  ['Confirmation-dialog context loss', confirmationContextLossScenario],
  ['Active-gameplay context loss', activeGameplayContextLossScenario],
  ['Active-gameplay runtime fault', activeGameplayRuntimeFaultScenario],
  ['Denied fullscreen remains nonfatal', deniedFullscreenScenario],
  ['Denied localStorage fallback', deniedStorageScenario],
  ['Catalog failure and reload retry', catalogRetryScenario],
  ['Gameplay texture placeholder fallback', textureFallbackScenario],
  ['Delayed catalog bootstrap gating', delayedCatalogScenario],
];
const failures = [];

try {
  for (const [label, scenario] of scenarios) {
    try {
      await scenario();
      console.log(`${label} passed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${label}: ${message}`);
      console.error(`${label} failed: ${message}`);
    }
  }
} finally {
  await browser.close();
}

assert(failures.length === 0, `Resilience E2E failures:\n${failures.join('\n')}`);
console.log('Resilience E2E passed');
