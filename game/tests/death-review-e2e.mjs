import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
await mkdir('output/death-review', { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const errors = [];

const watchErrors = (page, label) => {
  page.on('pageerror', (error) => errors.push(`${label}: ${String(error)}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${label}: ${message.text()}`); });
};

const startFirstMap = async (page) => {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('#new-game');
  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-actions button[data-difficulty="field-adjuster"]').click();
  await page.click('#begin-episode');
  if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
};

const inspectReview = async (page) => page.locator('#death-menu').evaluate((screen) => {
  const rect = (element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
  };
  const review = screen.querySelector('#death-review');
  return {
    viewport: { width: innerWidth, height: innerHeight },
    screen: rect(screen),
    review: rect(review),
    overflow: screen.scrollWidth > screen.clientWidth + 1 || review.scrollWidth > review.clientWidth + 1,
    fonts: [...review.querySelectorAll('#death-cause, dt, dd, #death-advice')]
      .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    buttons: [...screen.querySelectorAll('.death-actions button')].map(rect),
  };
});

try {
  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const desktop = await desktopContext.newPage();
  watchErrors(desktop, 'desktop');
  await startFirstMap(desktop);
  const entryDefeated = await desktop.evaluate(() => window.__redLedger.defeatMandatory('entry'));
  assert(entryDefeated > 0, 'Desktop fixture did not create meaningful checkpoint progress');
  await desktop.evaluate(() => { for (let index = 0; index < 12; index += 1) window.advanceTime(250); });
  await desktop.evaluate(() => window.__redLedger.defeatPlayer('desk-warden', 'ballistic'));
  await desktop.locator('#death-menu').waitFor({ state: 'visible' });

  const desktopState = JSON.parse(await desktop.evaluate(() => window.render_game_to_text()));
  assert(desktopState.mode === 'dead' && desktopState.death, 'Text state omitted the death review');
  assert(desktopState.death.cause.includes('Desk Warden') && desktopState.death.cause.includes('Ballistic'),
    `Hostile cause is not specific: ${desktopState.death.cause}`);
  assert(desktopState.death.progress.includes(`Threats ${entryDefeated}/`),
    `Run progress is not preserved in the review: ${desktopState.death.progress}`);
  assert(desktopState.death.objective === desktopState.objective, 'Death review objective disagrees with text state');
  assert(desktopState.death.recovery.includes('Checkpoint at') && desktopState.death.recovery.includes('rewinds'),
    `Checkpoint recovery is not explicit: ${desktopState.death.recovery}`);
  assert(!desktopState.death.recovery.endsWith('0:00'), `Checkpoint rewind did not expose elapsed progress: ${desktopState.death.recovery}`);
  assert(desktopState.death.advice.includes('Break line of sight'), `Ballistic counterplay is not actionable: ${desktopState.death.advice}`);
  assert((await desktop.locator('#restart-checkpoint').innerText()) === 'Restart Last Checkpoint', 'Restart action does not name its recovery source');
  assert((await desktop.locator('#restart-checkpoint').getAttribute('aria-describedby')) === 'death-recovery', 'Restart action is not associated with its recovery detail');
  const desktopReview = await inspectReview(desktop);
  assert(!desktopReview.overflow, 'Desktop death review overflows horizontally');
  assert(desktopReview.fonts.every((fontSize) => fontSize >= 10), 'Desktop death review contains sub-10px copy');
  assert(desktopReview.buttons.every((button) => button.left >= desktopReview.screen.left
    && button.right <= desktopReview.screen.right + 1), 'Desktop death action escapes its screen');
  await desktop.screenshot({ path: 'output/death-review/desktop-1280.png' });

  await desktop.click('#restart-checkpoint');
  if (await desktop.locator('#ready-overlay').isVisible()) await desktop.click('#enter-file');
  await desktop.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
  const restored = JSON.parse(await desktop.evaluate(() => window.render_game_to_text()));
  assert(restored.tally.kills === entryDefeated, `Restart did not restore the advertised checkpoint: ${restored.tally.kills}/${entryDefeated}`);
  await desktopContext.close();

  const highContext = await browser.newContext({ viewport: { width: 2560, height: 1600 } });
  const high = await highContext.newPage();
  watchErrors(high, 'high-resolution');
  await startFirstMap(high);
  await high.evaluate(() => window.__redLedger.defeatPlayer(undefined, 'hazard'));
  await high.locator('#death-menu').waitFor({ state: 'visible' });
  const highReview = await inspectReview(high);
  assert(highReview.review.width >= 900, `High-resolution death review remained undersized at ${highReview.review.width}px`);
  assert(highReview.fonts.every((fontSize) => fontSize >= 12), 'High-resolution death review did not use its larger type scale');
  assert(highReview.buttons.every((button) => button.height >= 48), 'High-resolution death actions are undersized');
  await high.screenshot({ path: 'output/death-review/desktop-2560.png' });
  await highContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  watchErrors(mobile, 'mobile');
  await startFirstMap(mobile);
  await mobile.evaluate(() => localStorage.clear());
  await mobile.evaluate(() => window.__redLedger.defeatPlayer(undefined, 'prediction'));
  await mobile.locator('#death-menu').waitFor({ state: 'visible' });
  const mobileState = JSON.parse(await mobile.evaluate(() => window.render_game_to_text()));
  assert(mobileState.death.cause.includes('Predicted strike') && mobileState.death.cause.includes('Prediction'),
    `Touch hazard cause is not specific: ${mobileState.death.cause}`);
  assert(mobileState.death.advice.includes('marked floor zones'), `Touch hazard advice is not actionable: ${mobileState.death.advice}`);
  assert(mobileState.death.restartLabel === 'Restart Map' && mobileState.death.recovery.includes('No recovery file'),
    `Missing recovery did not produce a truthful map restart: ${JSON.stringify(mobileState.death)}`);
  assert((await mobile.locator('#restart-checkpoint').innerText()) === 'Restart Map', 'Touch restart action retained a nonexistent checkpoint label');
  const mobileReview = await inspectReview(mobile);
  assert(!mobileReview.overflow, 'Portrait death review overflows horizontally');
  assert(mobileReview.screen.left >= 0 && mobileReview.screen.right <= mobileReview.viewport.width + 1,
    'Portrait death screen escapes the viewport');
  assert(mobileReview.review.left >= mobileReview.screen.left && mobileReview.review.right <= mobileReview.screen.right + 1,
    'Portrait death review escapes its screen');
  assert(mobileReview.fonts.every((fontSize) => fontSize >= 10), 'Portrait death review contains sub-10px copy');
  assert(mobileReview.buttons.every((button) => button.width >= 44 && button.height >= 44), 'Portrait death action misses the 44px touch target');
  await mobile.screenshot({ path: 'output/death-review/mobile-390.png', fullPage: true });
  await mobileContext.close();

  assert(errors.length === 0, `Death review produced errors: ${errors.join(' | ')}`);
  console.log('Death cause, progress, recovery, advice, accessibility, and responsive layout E2E passed');
} finally {
  await browser.close();
}
