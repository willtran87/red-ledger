import { chromium, firefox, webkit } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const engines = { chromium, firefox, webkit };
const failures = [];
const executed = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const state = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()));

const monitor = (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text());
  });
  return errors;
};

const pressTouchControl = async (page, selector, holdMs = 100) => {
  const control = page.locator(selector);
  const bounds = await control.boundingBox();
  assert(bounds, `${selector} has no touch target`);
  const pointerId = selector === '#touch-fire' ? 41 : 42;
  await control.evaluate((element, id) => {
    let captured;
    element.setPointerCapture = (candidate) => { captured = candidate; };
    element.hasPointerCapture = (candidate) => captured === candidate;
    element.releasePointerCapture = (candidate) => { if (captured === candidate) captured = undefined; };
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: id,
      pointerType: 'touch',
      isPrimary: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }));
  }, pointerId);
  await page.waitForTimeout(holdMs);
  await control.evaluate((element, id) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      pointerId: id,
      pointerType: 'touch',
      isPrimary: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }));
  }, pointerId);
};

const pause = async (page) => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('input-action', {
    detail: { action: 'pause', source: 'keyboard', repeat: false },
  })));
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'paused');
};

const resume = async (page) => {
  await page.locator('#resume-game').tap();
  const ready = page.locator('#ready-overlay:not([hidden]) #enter-file');
  if (await ready.isVisible().catch(() => false)) await ready.tap();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
};

for (const [name, type] of Object.entries(engines)) {
  console.log(`Testing ${name}`);
  let browser;
  try {
    browser = await type.launch({ headless: true });
  } catch (error) {
    failures.push(`${name}: required browser could not launch (${error instanceof Error ? error.message : error}). Install with: npx playwright install ${name}`);
    continue;
  }
  executed.push(name);
  try {
    // Headless Gecko and WebKit do not grant pointer lock. Coarse input still lets
    // this journey exercise real touch controls in every required engine.
    const context = await browser.newContext({ viewport: { width: 1024, height: 640 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = monitor(page);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('#new-game').tap();
    await page.locator('.episode-card').first().tap();
    await page.locator('#difficulty-actions button').nth(1).tap();
    await page.locator('#difficulty-confirm').tap();
    await page.locator('#episode-intro.active').waitFor();
    await page.locator('#begin-episode').tap();
    if (await page.locator('#ready-overlay').isVisible()) await page.locator('#enter-file').tap();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
    const audioCapable = await page.evaluate(() => Boolean(window.AudioContext || window.webkitAudioContext));
    if (audioCapable) {
      await page.waitForFunction(() => {
        const audio = JSON.parse(window.render_game_to_text()).audio;
        return audio.libraryReady && audio.spriteReady && audio.trackSource === 'authored' && audio.loadedSfxShards >= 4;
      }, undefined, { timeout: 15_000 });
      const audio = (await state(page)).audio;
      assert(audio.track === 'E1M1' && audio.decodedTracks === 0,
        `${name}: authored map music was not streamed with bounded memory`);
      assert(!audio.error, `${name}: authored audio reported ${audio.error}`);
    } else {
      const audio = (await state(page)).audio;
      assert(audio.libraryStatus === 'idle' && audio.trackSource === 'none',
        `${name}: audio-less engine entered a misleading partial state`);
    }
    await page.waitForTimeout(250);

    const beforeTouchFire = await state(page);
    assert(await page.locator('#touch-fire').isVisible(), `${name}: touch fire control is not visible`);
    await pressTouchControl(page, '#touch-fire', 130);
    await page.waitForTimeout(80);
    const initial = await state(page);
    assert(initial.player.ammo.staples < beforeTouchFire.player.ammo.staples,
      `${name}: touch fire did not consume ammunition`);

    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(220);
    await page.keyboard.up('ArrowUp');
    const moved = await state(page);
    assert(Math.hypot(moved.player.x - initial.player.x, moved.player.z - initial.player.z) > .05,
      `${name}: keyboard movement did not advance the player`);

    await pause(page);
    const paused = await state(page);
    assert(paused.audio.lifecycleSuspended, `${name}: pausing did not suspend audio`);
    const savedPosition = { x: paused.player.x, z: paused.player.z };
    await page.click('#save-game');
    await page.locator('#save-slot-list .slot-action').first().click();
    await resume(page);
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(220);
    await page.keyboard.up('ArrowDown');
    await pause(page);
    const altered = await state(page);
    assert(Math.hypot(altered.player.x - savedPosition.x, altered.player.z - savedPosition.z) > .05,
      `${name}: pre-load movement did not change the saved position`);
    await page.click('#load-game');
    await page.locator('#load-slot-list .slot-action').first().click();
    const restored = await state(page);
    assert(restored.mode === 'paused', `${name}: manual load did not return to a paused state`);
    assert(Math.hypot(restored.player.x - savedPosition.x, restored.player.z - savedPosition.z) < .02,
      `${name}: manual load did not restore the saved position`);
    await resume(page);

    await page.evaluate(() => {
      window.__redLedger.loadMap('E1M3');
      window.__redLedger.defeatEncounter('entry');
      window.__redLedger.defeatEncounter('transformation');
      if (!window.__redLedger.teleportToTrigger('raise-floor')) throw new Error('Raise-floor trigger missing');
    });
    const triggeredBeforeUse = (await state(page)).world.triggered.length;
    await pressTouchControl(page, '#touch-use', 80);
    await page.waitForFunction((previousCount) => {
      if (typeof window.render_game_to_text !== 'function') return false;
      const world = JSON.parse(window.render_game_to_text()).world;
      return world.triggered.length > previousCount && world.sectorMovers.length > 0;
    }, triggeredBeforeUse);

    const contextLoss = await page.evaluate(() => {
      const event = new Event('webglcontextlost', { cancelable: true });
      document.querySelector('#game-canvas').dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert(contextLoss, `${name}: context loss was not claimed`);
    await page.waitForFunction(() => {
      const snapshot = JSON.parse(window.render_game_to_text());
      return snapshot.runtime.halted && snapshot.mode === 'paused' && snapshot.audio.lifecycleSuspended;
    });
    assert(await page.locator('#fatal-error').isVisible(), `${name}: context loss omitted recovery UI`);
    assert(errors.length === 0, `${name}: ${errors.join(' | ')}`);
    await context.close();

    const deniedContext = await browser.newContext({ viewport: { width: 1024, height: 640 }, hasTouch: true });
    await deniedContext.addInitScript(() => {
      const deny = () => { throw new DOMException('Denied by cross-engine fixture', 'SecurityError'); };
      for (const method of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
        Object.defineProperty(Storage.prototype, method, { configurable: true, value: deny });
      }
    });
    const deniedPage = await deniedContext.newPage();
    const deniedErrors = monitor(deniedPage);
    await deniedPage.goto(url, { waitUntil: 'networkidle' });
    await deniedPage.waitForFunction(() => typeof window.render_game_to_text === 'function');
    assert(await deniedPage.locator('#runtime-warning').isVisible(), `${name}: storage denial omitted its warning`);
    assert(await deniedPage.locator('#menu').isVisible(), `${name}: storage denial prevented startup`);
    assert(deniedErrors.length === 0, `${name} storage fallback: ${deniedErrors.join(' | ')}`);
    await deniedContext.close();
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : error}`);
  } finally {
    await browser.close();
  }
}

const missing = Object.keys(engines).filter((name) => !executed.includes(name));
if (missing.length) failures.push(`Required browser coverage missing: ${missing.join(', ')}`);
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Cross-browser smoke passed in all required engines: ${executed.join(', ')}`);
