import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const output = new URL('../output/powerup-hud/', import.meta.url);
const shot = (name) => fileURLToPath(new URL(name, output));
await mkdir(output, { recursive: true });

const startGame = async (page, touch = false) => {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('#new-game').click();
  await page.locator('.episode-card').first().click();
  const difficulty = page.locator('#difficulty-actions button').first();
  if (touch) {
    await difficulty.tap();
    await page.locator('#difficulty-confirm').tap();
  } else {
    await difficulty.click();
  }
  await page.locator('#begin-episode').click();
  if (await page.locator('#ready-overlay').isVisible()) await page.locator('#enter-file').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
};

const collectBinder = async (page) => page.evaluate(() => {
  window.__redLedger.loadMap('E1M2');
  const found = window.__redLedger.teleportToPickup('pickup', 'temporary-binder');
  window.advanceTime(80);
  return found;
});

const stageRapidEffectForLayout = async (page) => page.locator('#active-effects').evaluate((strip) => {
  const binder = strip.querySelector('[data-effect="binder"]');
  if (!binder) throw new Error('Temporary Binder card was replaced before the layout fixture could be staged');
  const rapid = binder.cloneNode(true);
  rapid.dataset.effect = 'rapid';
  rapid.setAttribute('aria-label', 'Rapid Authority, weapons fire faster, 30 seconds remaining');
  const icon = rapid.querySelector('img');
  icon.src = new URL('./public_runtime/pickups/rapid-authority/base.png', document.baseURI).href;
  icon.alt = '';
  rapid.querySelector('strong').textContent = 'Rapid Authority';
  rapid.querySelector('small').textContent = 'Weapons fire faster.';
  rapid.querySelector('time').textContent = '30s';
  rapid.querySelector('time').dateTime = 'PT30S';
  strip.append(rapid);
  return new Promise((resolve) => {
    if (icon.complete && icon.naturalWidth > 0) resolve(true);
    else {
      icon.addEventListener('load', () => resolve(true), { once: true });
      icon.addEventListener('error', () => resolve(false), { once: true });
    }
  });
});

const installOnsetObserver = async (page) => page.evaluate(() => {
  window.__powerupOnsetObserver?.disconnect();
  window.__powerupOnsetAnnouncements = [];
  const announcer = document.querySelector('#announcer');
  window.__powerupOnsetObserver = new MutationObserver(() => {
    const message = announcer?.textContent?.trim() ?? '';
    if (message) window.__powerupOnsetAnnouncements.push(message);
  });
  window.__powerupOnsetObserver.observe(announcer, { childList: true, subtree: true, characterData: true });
});

const inspectEffects = async (target) => target.locator('#active-effects').evaluate((strip) => {
  const rect = (element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  };
  const px = (selector) => Math.min(...[...strip.querySelectorAll(selector)]
    .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
  const rgb = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const luminance = (value) => {
    const channels = rgb(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= .03928 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
    });
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const contrast = (foreground, background) => {
    const light = Math.max(luminance(foreground), luminance(background));
    const dark = Math.min(luminance(foreground), luminance(background));
    return (light + .05) / (dark + .05);
  };
  const shell = document.querySelector('#game-shell');
  const cards = [...strip.querySelectorAll('.active-effect')];
  const firstCard = cards[0];
  const description = firstCard?.querySelector('small');
  const stripRect = rect(strip);
  const shellRect = shell ? rect(shell) : { left: 0, right: innerWidth, top: 0, bottom: innerHeight };
  return {
    count: cards.length,
    withinShell: stripRect.left >= shellRect.left && stripRect.right <= shellRect.right
      && stripRect.top >= shellRect.top && stripRect.bottom <= shellRect.bottom,
    cardOverflow: cards.some((card) => card.scrollWidth > card.clientWidth + 1),
    fontSizes: {
      label: px('.active-effect strong'),
      description: px('.active-effect small'),
      timer: px('.active-effect time'),
    },
    descriptionContrast: description && firstCard
      ? contrast(getComputedStyle(description).color, getComputedStyle(firstCard).backgroundColor)
      : 0,
  };
});

const assertEffectReadability = (metrics, label, expectedCount = 1) => {
  assert(metrics.count === expectedCount, `${label} shows ${metrics.count} effects instead of ${expectedCount}`);
  assert(metrics.withinShell, `${label} active effects escape the game shell`);
  assert(!metrics.cardOverflow, `${label} active-effect copy overflows its card horizontally`);
  assert(metrics.fontSizes.label >= 10, `${label} active-effect label fell below 10px`);
  assert(metrics.fontSizes.description >= 10, `${label} active-effect description fell below 10px`);
  assert(metrics.fontSizes.timer >= 10, `${label} active-effect timer fell below 10px`);
  assert(metrics.descriptionContrast >= 4.5,
    `${label} active-effect description contrast is only ${metrics.descriptionContrast.toFixed(2)}:1`);
};

const inspectVisibleMessage = async (target) => target.locator('#message').evaluate((message) => {
  const box = message.getBoundingClientRect();
  const shell = document.querySelector('#game-shell').getBoundingClientRect();
  return {
    text: message.textContent?.trim() ?? '',
    withinShell: box.left >= shell.left && box.right <= shell.right && box.top >= shell.top && box.bottom <= shell.bottom,
    horizontalOverflow: message.scrollWidth > message.clientWidth + 1,
    verticalOverflow: message.scrollHeight > message.clientHeight + 1,
  };
});

const assertVisibleMessage = (metrics, label) => {
  assert(metrics.text === 'Temporary Binder: blocks all damage for 30 seconds',
    `${label} visible onset copy is incomplete: ${metrics.text}`);
  assert(metrics.withinShell, `${label} visible onset message escapes the game shell`);
  assert(!metrics.horizontalOverflow, `${label} visible onset message overflows horizontally`);
  assert(!metrics.verticalOverflow, `${label} visible onset message overflows vertically`);
};

const inspectTouchGeometry = async (target) => target.evaluate(() => {
  const rect = (selector) => {
    const element = document.querySelector(selector);
    const box = element.getBoundingClientRect();
    return { selector, left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  };
  const effect = rect('#active-effects');
  const blockers = ['#objective', '#message', '#status', '#sound-caption', '#touch-stick', '#touch-look', '#touch-fire', '#touch-use', '#touch-weapon', '#touch-map', '#touch-pause']
    .filter((selector) => getComputedStyle(document.querySelector(selector)).display !== 'none')
    .map(rect);
  const caption = rect('#sound-caption');
  const touchControls = ['#touch-stick', '#touch-look', '#touch-fire', '#touch-use', '#touch-weapon', '#touch-map', '#touch-pause']
    .filter((selector) => getComputedStyle(document.querySelector(selector)).display !== 'none')
    .map(rect);
  return { effect, blockers, caption, touchControls, width: innerWidth, height: innerHeight };
});

const assertTouchGeometry = (geometry, label) => {
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  assert(geometry.effect.left >= 0 && geometry.effect.right <= geometry.width
    && geometry.effect.top >= 0 && geometry.effect.bottom <= geometry.height,
  `${label} active effects escape the viewport: ${JSON.stringify(geometry.effect)}`);
  for (const blocker of geometry.blockers) {
    assert(!overlaps(geometry.effect, blocker),
      `${label} active effects overlap ${blocker.selector}: ${JSON.stringify({ effect: geometry.effect, blocker })}`);
  }
  for (const control of geometry.touchControls) {
    assert(!overlaps(geometry.caption, control),
      `${label} sound caption overlaps ${control.selector}: ${JSON.stringify({ caption: geometry.caption, control })}`);
  }
};

const desktop = await browser.newPage({ viewport: { width: 1280, height: 720 } });
desktop.setDefaultTimeout(15_000);
desktop.setDefaultNavigationTimeout(15_000);
const errors = [];
desktop.on('pageerror', (error) => errors.push(String(error)));
desktop.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await startGame(desktop);
console.log('[powerup-hud] desktop game ready');
await installOnsetObserver(desktop);
assert(await collectBinder(desktop), 'The E1M2 Temporary Binder pickup was unavailable');
console.log('[powerup-hud] desktop effect collected');

const strip = desktop.locator('#active-effects');
const binder = strip.locator('[data-effect="binder"]');
assert(await strip.isVisible(), 'Active effect strip did not appear after collection');
assert(await strip.getAttribute('aria-live') === 'off', 'Countdown strip would announce every timer update');
assert(await binder.getAttribute('role') === 'group', 'Active effect is not grouped accessibly');
assert((await binder.innerText()).includes('Temporary Binder'), 'Active effect omits its label');
assert((await binder.innerText()).includes('Blocks all damage.'), 'Active effect omits its plain-language behavior');
assert(await binder.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0), 'Active effect icon did not load');
const initialSeconds = Number((await binder.locator('time').innerText()).replace(/\D/g, ''));
assert(initialSeconds > 0 && initialSeconds <= 30, `Active effect has an invalid initial timer: ${initialSeconds}`);
await desktop.waitForFunction(() => window.__powerupOnsetAnnouncements
  .filter((message) => message === 'Temporary Binder: blocks all damage for 30 seconds').length === 1);
assert(await desktop.evaluate(() => window.__powerupOnsetAnnouncements
  .filter((message) => message === 'Temporary Binder: blocks all damage for 30 seconds').length) === 1,
'Temporary Binder onset was not announced exactly once');
assertVisibleMessage(await inspectVisibleMessage(desktop), 'Desktop');
assertEffectReadability(await inspectEffects(desktop), 'Desktop');
await desktop.screenshot({ path: shot('binder-desktop.png') });

await desktop.setViewportSize({ width: 2560, height: 1600 });
await desktop.waitForTimeout(100);
assertEffectReadability(await inspectEffects(desktop), 'High-resolution desktop');
await desktop.screenshot({ path: shot('binder-high-resolution.png') });
await desktop.setViewportSize({ width: 1280, height: 720 });
await desktop.waitForTimeout(100);
console.log('[powerup-hud] desktop readability verified');

await desktop.evaluate(() => {
  for (let index = 0; index < 8; index += 1) window.advanceTime(250);
});
const laterSeconds = Number((await binder.locator('time').innerText()).replace(/\D/g, ''));
assert(laterSeconds < initialSeconds, `Active effect did not count down: ${initialSeconds} -> ${laterSeconds}`);
assert(await desktop.evaluate(() => window.__powerupOnsetAnnouncements
  .filter((message) => message === 'Temporary Binder: blocks all damage for 30 seconds').length) === 1,
'Countdown updates repeated the Temporary Binder onset announcement');

await desktop.keyboard.press('Tab');
assert(await desktop.locator('#automap').isVisible(), 'Automap did not open');
assert(await strip.evaluate((element) => getComputedStyle(element).display === 'none'), 'Active effects remained visible over the full automap');
await desktop.keyboard.press('Tab');
assert(await strip.isVisible(), 'Active effects did not return after closing the automap');

const beforeSave = await desktop.evaluate(() => {
  window.__redLedger.pause();
  return JSON.parse(window.render_game_to_text()).player.powerups.binder;
});
await desktop.locator('#save-game').click();
await desktop.locator('#save-slot-list .slot-action').first().click();
await desktop.locator('#load-game').click();
await desktop.locator('#load-slot-list .slot-action').first().click();
const afterLoad = await desktop.evaluate(() => JSON.parse(window.render_game_to_text()).player.powerups.binder);
assert(Math.abs(afterLoad - beforeSave) < .01, `Save restore changed the active duration: ${beforeSave} -> ${afterLoad}`);
assert(!await strip.getAttribute('hidden'), 'Save restore dropped the active effects strip');
await desktop.locator('#resume-game').click();
await desktop.waitForTimeout(100);
if (await desktop.locator('#ready-overlay').isVisible()) await desktop.locator('#enter-file').click();
await desktop.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
console.log('[powerup-hud] save restore verified');

await desktop.evaluate(() => {
  for (let index = 0; index < 120; index += 1) {
    const remaining = JSON.parse(window.render_game_to_text()).player.powerups.binder;
    if (remaining <= 5) return;
    window.advanceTime(250);
  }
  throw new Error('Temporary Binder did not reach its warning window');
});
assert(await binder.evaluate((element) => element.classList.contains('urgent')), 'Five-second warning state did not activate');
assert(Number((await binder.locator('time').innerText()).replace(/\D/g, '')) <= 5, 'Urgent warning displayed above five seconds');
await desktop.evaluate(() => {
  for (let index = 0; index < 24; index += 1) {
    if (JSON.parse(window.render_game_to_text()).player.powerups.binder <= 0) return;
    window.advanceTime(250);
  }
  throw new Error('Temporary Binder did not expire');
});
assert(await strip.getAttribute('hidden') !== null, 'Expired active effect strip remained exposed');
console.log('[powerup-hud] countdown states verified');

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mobile = await mobileContext.newPage();
mobile.setDefaultTimeout(15_000);
mobile.setDefaultNavigationTimeout(15_000);
mobile.on('pageerror', (error) => errors.push(String(error)));
mobile.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await startGame(mobile, true);
console.log('[powerup-hud] mobile game ready');
await mobile.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 81, pointerType: 'touch' })));
assert(await collectBinder(mobile), 'Portrait fixture could not collect the Temporary Binder');
await mobile.evaluate(() => {
  const caption = document.querySelector('#sound-caption');
  caption.hidden = false;
  caption.textContent = 'Metal mechanism nearby';
});
assertVisibleMessage(await inspectVisibleMessage(mobile), 'Portrait');
assertEffectReadability(await inspectEffects(mobile), 'Portrait');
assertTouchGeometry(await inspectTouchGeometry(mobile), 'Portrait');
await mobile.screenshot({ path: shot('binder-portrait.png') });
await mobile.evaluate(() => window.dispatchEvent(new CustomEvent('input-action', {
  detail: { action: 'automap', source: 'touch', repeat: false },
})));
assert(await mobile.locator('#active-effects').evaluate((element) => getComputedStyle(element).display === 'none'),
  'Portrait active effects remained visible over the full automap');
await mobileContext.close();
console.log('[powerup-hud] portrait layout verified');

const landscapeContext = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const landscape = await landscapeContext.newPage();
landscape.setDefaultTimeout(15_000);
landscape.setDefaultNavigationTimeout(15_000);
landscape.on('pageerror', (error) => errors.push(String(error)));
landscape.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await startGame(landscape, true);
console.log('[powerup-hud] landscape game ready');
await landscape.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 82, pointerType: 'touch' })));
assert(await collectBinder(landscape), 'Landscape fixture could not collect the Temporary Binder');
assert(await stageRapidEffectForLayout(landscape), 'Landscape layout fixture could not load the Rapid Authority icon');
await landscape.evaluate(() => {
  const caption = document.querySelector('#sound-caption');
  caption.hidden = false;
  caption.textContent = 'Metal mechanism nearby';
});
assertVisibleMessage(await inspectVisibleMessage(landscape), 'Landscape');
assertEffectReadability(await inspectEffects(landscape), 'Landscape', 2);
assertTouchGeometry(await inspectTouchGeometry(landscape), 'Landscape');
await landscape.screenshot({ path: shot('stacked-landscape.png') });
await landscape.evaluate(() => window.dispatchEvent(new CustomEvent('input-action', {
  detail: { action: 'automap', source: 'touch', repeat: false },
})));
assert(await landscape.locator('#active-effects').evaluate((element) => getComputedStyle(element).display === 'none'),
  'Landscape active effects remained visible over the full automap');
await landscapeContext.close();
console.log('[powerup-hud] stacked landscape layout verified');

assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
console.log('Power-up HUD E2E passed');
await browser.close();
