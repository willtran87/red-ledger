import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(15_000);
page.setDefaultNavigationTimeout(15_000);
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const output = new URL('../output/milestone-ledger/', import.meta.url);
const shot = (name) => fileURLToPath(new URL(name, output));
await mkdir(output, { recursive: true });

const inspectLedger = async (target) => target.locator('#milestone-ledger').evaluate((screen) => {
  const px = (selector) => Math.min(...[...screen.querySelectorAll(selector)]
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
  const firstItem = screen.querySelector('.milestone-ledger-item');
  const rewardNote = screen.querySelector('.milestone-ledger-reward small');
  const itemBackground = firstItem ? getComputedStyle(firstItem).backgroundColor : 'rgb(0, 0, 0)';
  const rewardColor = rewardNote ? getComputedStyle(rewardNote).color : 'rgb(0, 0, 0)';
  const items = [...screen.querySelectorAll('.milestone-ledger-item')];
  return {
    viewportWidth: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    screenWidth: screen.scrollWidth,
    screenClientWidth: screen.clientWidth,
    itemOverflow: items.some((item) => item.scrollWidth > item.clientWidth + 1),
    tabHeights: [...screen.querySelectorAll('[role="tab"]')].map((tab) => tab.getBoundingClientRect().height),
    fontSizes: {
      condition: px('.milestone-ledger-item > p'),
      progress: px('.milestone-ledger-progress-copy'),
      state: px('.milestone-ledger-state'),
      reward: px('.milestone-ledger-reward strong'),
      rewardNote: px('.milestone-ledger-reward small'),
    },
    rewardContrast: contrast(rewardColor, itemBackground),
  };
});

const assertLedgerReadability = (metrics, label, touch = false) => {
  assert(metrics.documentWidth <= metrics.viewportWidth, `${label} ledger overflows the viewport horizontally`);
  assert(metrics.screenWidth <= metrics.screenClientWidth + 1, `${label} ledger content overflows its screen horizontally`);
  assert(!metrics.itemOverflow, `${label} milestone copy overflows a ledger row horizontally`);
  assert(metrics.fontSizes.condition >= 11, `${label} condition copy fell below 11px`);
  assert(metrics.fontSizes.progress >= 10, `${label} progress copy fell below 10px`);
  assert(metrics.fontSizes.state >= 10, `${label} state copy fell below 10px`);
  assert(metrics.fontSizes.reward >= 10, `${label} reward label fell below 10px`);
  assert(metrics.fontSizes.rewardNote >= 10, `${label} reward note fell below 10px`);
  assert(metrics.rewardContrast >= 4.5, `${label} reward-note contrast is only ${metrics.rewardContrast.toFixed(2)}:1`);
  if (touch) assert(metrics.tabHeights.every((height) => height >= 44), `${label} milestone tabs miss the 44px touch target`);
};

await page.goto(url, { waitUntil: 'networkidle' });
console.log('[milestone-ledger] desktop menu ready');
await page.click('#milestones-button');
assert(await page.locator('#milestone-ledger').isVisible(), 'Main menu did not open the Milestone Ledger');
assert(await page.locator('.milestone-ledger-item').count() === 15, 'All filter does not show all 15 milestones');
const initialItems = await page.locator('.milestone-ledger-item').evaluateAll((items) => items.map((item) => ({
  state: item.getAttribute('data-state'),
  text: item.textContent ?? '',
  progressText: item.querySelector('progress')?.getAttribute('aria-valuetext') ?? '',
})));
assert(initialItems.every(({ state }) => state === 'open'), 'A clean campaign incorrectly begins with an earned milestone');
assert(initialItems.every(({ text, progressText }) => text.includes('Condition:')
  && text.includes('Progress:')
  && text.includes('Seal:')
  && text.includes('Cosmetic only')
  && progressText.length > 0), 'A ledger row is missing its condition, progress, state, or cosmetic reward');
assertLedgerReadability(await inspectLedger(page), 'Desktop');

await page.setViewportSize({ width: 2560, height: 1600 });
await page.waitForTimeout(100);
assertLedgerReadability(await inspectLedger(page), 'High-resolution desktop');
await page.screenshot({ path: shot('clean-all-high-resolution.png') });
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(100);
console.log('[milestone-ledger] clean ledger and readability verified');

await page.locator('#milestone-filter-all').focus();
await page.keyboard.press('ArrowRight');
assert(await page.locator('#milestone-filter-open').getAttribute('aria-selected') === 'true', 'ArrowRight did not activate the Open tab');
assert(await page.locator('.milestone-ledger-item').count() === 15, 'Open filter omitted clean-campaign milestones');
await page.keyboard.press('End');
assert(await page.locator('#milestone-filter-earned').getAttribute('aria-selected') === 'true', 'End did not activate the Earned tab');
assert(await page.locator('#milestone-ledger-empty').isVisible(), 'Earned filter lacks an honest empty state');
assert((await page.locator('#milestone-ledger-empty').innerText()) === 'No earned milestones yet.', 'Earned empty-state copy is incorrect');
await page.keyboard.press('Home');
assert(await page.locator('#milestone-filter-all').getAttribute('aria-selected') === 'true', 'Home did not return to the All tab');
await page.screenshot({ path: shot('clean-all-desktop.png') });
await page.click('#milestone-ledger-back');
assert(await page.locator('#menu').isVisible(), 'Ledger Back did not return to the main menu');

await page.click('#level-select-button');
await page.click('#level-select-milestones');
assert(await page.locator('#milestone-ledger').isVisible(), 'Level Select did not open the Milestone Ledger');
await page.click('#milestone-ledger-back');
assert(await page.locator('#level-select').isVisible(), 'Ledger Back did not return to Level Select');
await page.locator('#level-select [data-back]').click();
assert(await page.locator('#menu').isVisible(), 'Level Select Back did not return to the main menu');
console.log('[milestone-ledger] menu origins verified');

await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button[data-difficulty="field-adjuster"]').click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
console.log('[milestone-ledger] gameplay fixture ready');
await page.evaluate(() => {
  window.__milestoneAnnouncementEvents = [];
  const announcer = document.querySelector('#announcer');
  new MutationObserver(() => {
    const message = announcer?.textContent ?? '';
    if (message.includes('Milestone earned:')) window.__milestoneAnnouncementEvents.push(message);
  }).observe(announcer, { childList: true, subtree: true, characterData: true });
  window.__redLedger.loadMap('E1M8');
  window.__redLedger.defeatAll();
  window.__redLedger.teleportToExit();
  window.__redLedger.use();
});
await page.locator('#intermission').waitFor({ state: 'visible' });
assert(await page.locator('#intermission-milestone-awards').isVisible(), 'A first clear did not show its new milestone awards');
const awardText = await page.locator('#intermission-milestone-awards').innerText();
assert(/Milestones? Earned/.test(awardText) && awardText.includes('Seal:'), `Intermission award omits its cosmetic seal: ${awardText}`);
await page.waitForFunction(() => window.__milestoneAnnouncementEvents.length === 1);
const firstAnnouncement = await page.evaluate(() => window.__milestoneAnnouncementEvents[0]);
assert(firstAnnouncement.includes('Cosmetic seal:'), 'Assistive milestone announcement omits the cosmetic reward');
console.log('[milestone-ledger] first-clear award verified');

await page.evaluate(() => window.__redLedger.rerenderIntermission());
await page.waitForTimeout(100);
assert(await page.evaluate(() => window.__milestoneAnnouncementEvents.length) === 1, 'Repeated intermission rendering reannounced known milestone history');

await page.click('#intermission-milestones-button');
assert(await page.locator('#milestone-ledger').isVisible(), 'Intermission did not open the Milestone Ledger');
await page.click('#milestone-filter-earned');
const earnedCount = await page.locator('.milestone-ledger-item[data-state="earned"]').count();
assert(earnedCount > 0, 'Earned filter does not expose newly earned milestones');
assert(await page.locator('.milestone-ledger-item[data-state="open"]').count() === 0, 'Earned filter leaked open milestones');
assertLedgerReadability(await inspectLedger(page), 'Earned desktop');
await page.screenshot({ path: shot('earned-desktop.png') });
await page.click('#milestone-ledger-back');
assert(await page.locator('#intermission').isVisible(), 'Ledger Back did not return to intermission');

const persistedStorage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await mobileContext.addInitScript((entries) => {
  for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
}, persistedStorage);
const mobile = await mobileContext.newPage();
mobile.setDefaultTimeout(15_000);
mobile.setDefaultNavigationTimeout(15_000);
const mobileErrors = [];
mobile.on('pageerror', (error) => mobileErrors.push(String(error)));
mobile.on('console', (message) => { if (message.type() === 'error') mobileErrors.push(message.text()); });
await mobile.goto(url, { waitUntil: 'networkidle' });
await mobile.tap('#milestones-button');
assert(await mobile.locator('.milestone-ledger-item').count() === 15, 'Mobile All filter does not show all milestones');
await mobile.tap('#milestone-filter-earned');
assert(await mobile.locator('.milestone-ledger-item[data-state="earned"]').count() === earnedCount, 'Mobile Earned filter disagrees with desktop progress');
assertLedgerReadability(await inspectLedger(mobile), 'Portrait', true);
await mobile.screenshot({ path: shot('earned-mobile.png'), fullPage: true });
await mobileContext.close();
console.log('[milestone-ledger] portrait ledger verified');

const landscapeContext = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
await landscapeContext.addInitScript((entries) => {
  for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
}, persistedStorage);
const landscape = await landscapeContext.newPage();
landscape.setDefaultTimeout(15_000);
landscape.setDefaultNavigationTimeout(15_000);
const landscapeErrors = [];
landscape.on('pageerror', (error) => landscapeErrors.push(String(error)));
landscape.on('console', (message) => { if (message.type() === 'error') landscapeErrors.push(message.text()); });
await landscape.goto(url, { waitUntil: 'networkidle' });
await landscape.tap('#milestones-button');
assert(await landscape.locator('.milestone-ledger-item').count() === 15, 'Landscape All filter does not show all milestones');
assertLedgerReadability(await inspectLedger(landscape), 'Landscape', true);
await landscape.screenshot({ path: shot('all-landscape.png'), fullPage: true });
await landscapeContext.close();
console.log('[milestone-ledger] landscape ledger verified');

assert(errors.length === 0, `Desktop console errors: ${errors.join(' | ')}`);
assert(mobileErrors.length === 0, `Mobile console errors: ${mobileErrors.join(' | ')}`);
assert(landscapeErrors.length === 0, `Landscape console errors: ${landscapeErrors.join(' | ')}`);
console.log('Milestone ledger E2E passed');
await browser.close();
