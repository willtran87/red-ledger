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

const inspectIntermissionReadability = async (target) => target.locator('#intermission').evaluate((screen) => {
  const font = (selector) => [...screen.querySelectorAll(selector)]
    .filter((element) => !element.hidden)
    .map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  return {
    clientWidth: screen.clientWidth,
    scrollWidth: screen.scrollWidth,
    itemOverflow: [...screen.querySelectorAll('.score-breakdown, .score-breakdown-totals span, .score-breakdown-bonuses span, .mastery-panel, .milestone-awards, .milestone-panel, .episode-mastery, #episode-progress')]
      .some((element) => element.scrollWidth > element.clientWidth + 1),
    fonts: {
      tally: font('#tally'),
      scoreSummary: font('.score-breakdown summary'),
      scoreDetails: font('.score-breakdown-totals b, .score-breakdown-totals output, .score-breakdown-bonuses b, .score-breakdown-bonuses small'),
      result: font('#result-bests'),
      masteryTitle: font('.mastery-panel > strong'),
      masterySummary: font('.mastery-panel > span'),
      masteryDetail: font('.mastery-panel small'),
      award: font('.milestone-award-item b, .milestone-award-item small'),
      milestone: font('.milestone-panel > strong, .milestone-list span'),
      episodeMastery: font('.episode-mastery'),
      progress: font('#episode-progress span'),
    },
  };
});

const assertIntermissionReadability = (metrics, label, highResolution = false) => {
  assert(metrics.scrollWidth <= metrics.clientWidth + 1, `${label} intermission overflows horizontally`);
  assert(!metrics.itemOverflow, `${label} result panel content overflows horizontally`);
  const floor = (values, minimum, name) => assert(values.length > 0 && values.every((value) => value >= minimum),
    `${label} ${name} fell below ${minimum}px: ${values.join(', ')}`);
  floor(metrics.fonts.tally, highResolution ? 18 : 14, 'tally');
  floor(metrics.fonts.scoreSummary, highResolution ? 14 : 11, 'score summary');
  floor(metrics.fonts.scoreDetails, highResolution ? 12 : 10, 'score detail');
  floor(metrics.fonts.result, highResolution ? 15 : 11, 'record summary');
  floor(metrics.fonts.masteryTitle, highResolution ? 14 : 11, 'mastery heading');
  floor(metrics.fonts.masterySummary, highResolution ? 12 : 10, 'mastery summary');
  floor(metrics.fonts.masteryDetail, highResolution ? 11 : 10, 'mastery detail');
  floor(metrics.fonts.award, highResolution ? 12 : 10, 'award copy');
  floor(metrics.fonts.milestone, highResolution ? 11 : 10, 'milestone summary');
  floor(metrics.fonts.episodeMastery, highResolution ? 11 : 10, 'episode mastery');
  floor(metrics.fonts.progress, highResolution ? 12 : 10, 'episode progress');
};

const inspectFieldOrder = async (target, label, highResolution = false) => {
  assert(await target.locator('#entry-field-order').isVisible(), `${label} returning briefing omitted its field order`);
  await target.locator('#enter-file:not(:disabled)').waitFor({ state: 'visible' });
  const metrics = await target.locator('#entry-field-order').evaluate((order) => {
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    };
    const overlay = box(document.querySelector('#ready-overlay'));
    const controls = box(document.querySelector('#entry-controls'));
    return {
      order: box(order),
      overlay,
      controls,
      overflow: order.scrollWidth > order.clientWidth + 1 || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      state: order.getAttribute('data-state'),
      track: order.getAttribute('data-track'),
      accessibleName: order.getAttribute('aria-label') ?? '',
      target: order.querySelector('#entry-field-order-target').textContent ?? '',
      fonts: [...order.querySelectorAll('strong, span, small')].map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    };
  });
  assert(metrics.order.left >= metrics.overlay.left && metrics.order.right <= metrics.overlay.right
    && metrics.order.top >= metrics.overlay.top && metrics.order.bottom <= metrics.overlay.bottom,
  `${label} field order escaped its briefing`);
  assert(metrics.order.bottom <= metrics.controls.top, `${label} field order overlaps essential controls`);
  assert(!metrics.overflow, `${label} field order introduced horizontal overflow`);
  assert(metrics.state === 'open' && metrics.track === 'fresh-start', `${label} field order reports the wrong mastery state or track`);
  assert(metrics.target.includes('Find every secret'), `${label} field order does not expose the highest-priority record gap`);
  assert(metrics.accessibleName.includes('Fresh Start field order') && metrics.accessibleName.includes('Threats 100%')
    && metrics.accessibleName.includes('Items 0%') && metrics.accessibleName.includes('Secrets 0%'),
  `${label} field order accessible summary is incomplete`);
  assert(metrics.fonts.every((fontSize) => fontSize >= (highResolution ? 12 : 10)),
    `${label} field order contains undersized copy: ${metrics.fonts.join(', ')}`);
};

await page.goto(url, { waitUntil: 'networkidle' });
const cleanStorage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
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
assertIntermissionReadability(await inspectIntermissionReadability(page), 'Desktop');
const scoreState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
assert(scoreState.result?.scoreBreakdown?.finalScore === scoreState.momentum.score, 'Text state final score disagrees with the awarded score');
assert(scoreState.result.scoreBreakdown.bonuses.length === 5, 'Text state does not expose all five clear goals');
assert(await page.locator('#score-breakdown').getAttribute('aria-label') === `Score details. Combat ${scoreState.result.scoreBreakdown.combatScore} points. Clear goals ${scoreState.result.scoreBreakdown.bonusSubtotal} points. Difficulty multiplier 1 times. Final score ${scoreState.result.scoreBreakdown.finalScore} points.`,
  'Score disclosure lacks a complete accessible calculation');
await page.locator('#score-breakdown summary').click();
assert(await page.locator('#score-breakdown').getAttribute('open') !== null, 'Score details did not expand');
assert(await page.locator('#score-breakdown-bonuses [role="listitem"]').count() === 5, 'Score details omitted a clear goal');
assert(await page.locator('[data-score-bonus="threats"].earned').count() === 1, 'Perfect threat clear was not identified as earned');
assert(await page.locator('[data-score-bonus="items"].missed').count() === 1, 'Missed item mastery was not identified');
assert(await page.locator('[data-score-bonus="secret-route"].missed').count() === 1, 'Unused secret route was not identified');
await page.screenshot({ path: shot('score-breakdown-desktop.png') });
assert(await page.locator('#intermission-milestone-awards').isVisible(), 'A first clear did not show its new milestone awards');
const awardText = await page.locator('#intermission-milestone-awards').innerText();
assert(/Milestones? Earned/.test(awardText) && awardText.includes('Seal:'), `Intermission award omits its cosmetic seal: ${awardText}`);
const directAward = page.locator('.milestone-award-equip').first();
assert(await directAward.isVisible(), 'A newly earned seal lacks an immediate equip action');
assert(await directAward.getAttribute('aria-pressed') === 'false', 'A newly earned seal begins in an incorrect equipped state');
const directSealLabel = (await directAward.getAttribute('aria-label')).replace(/^Equip\s+/, '');
const directAwardId = await directAward.getAttribute('data-milestone-award');
await page.waitForFunction(() => window.__milestoneAnnouncementEvents.length === 1);
const firstAnnouncement = await page.evaluate(() => window.__milestoneAnnouncementEvents[0]);
assert(firstAnnouncement.includes('Cosmetic seal:'), 'Assistive milestone announcement omits the cosmetic reward');
await page.screenshot({ path: shot('award-equip-desktop.png') });
await page.setViewportSize({ width: 2560, height: 1600 });
assertIntermissionReadability(await inspectIntermissionReadability(page), 'High-resolution intermission', true);
await page.screenshot({ path: shot('award-equip-high-resolution.png') });
await page.setViewportSize({ width: 1280, height: 720 });
await directAward.click();
assert(await page.locator(`.milestone-award-equip[aria-label="Remove ${directSealLabel}"]`).getAttribute('aria-pressed') === 'true', 'Intermission equip action did not enter the equipped state');
assert((await page.locator(`.milestone-award-equip[aria-label="Remove ${directSealLabel}"]`).innerText()) === 'Equipped', 'Intermission equip action lacks visible state feedback');
assert(await page.evaluate((milestoneId) => {
  const settings = JSON.parse(localStorage.getItem('red-ledger-settings-v1') ?? '{}');
  return settings.equippedMilestoneSeal === milestoneId;
}, directAwardId), 'Intermission equip action did not persist the selected milestone seal');
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
const equippedReward = page.getByRole('button', { name: `Remove ${directSealLabel}` });
assert(await equippedReward.count() === 1 && await equippedReward.getAttribute('aria-pressed') === 'true', 'Ledger did not reflect the seal equipped at intermission');
assert((await page.locator('#milestone-ledger-summary').innerText()).includes(`Active seal: ${directSealLabel}.`), 'Ledger summary does not identify the active seal');
assert((await equippedReward.innerText()).includes('Equipped'), 'Equipped reward lacks visible state copy');
await equippedReward.click();
assert((await page.locator('#milestone-ledger-summary').innerText()).includes('No active seal.'), 'Selecting an equipped seal did not remove it');
const removedReward = page.getByRole('button', { name: `Equip ${directSealLabel}` });
assert(await removedReward.getAttribute('aria-pressed') === 'false', 'Removed seal retained pressed state');
await removedReward.click();
assert(await page.getByRole('button', { name: `Remove ${directSealLabel}` }).getAttribute('aria-pressed') === 'true', 'Removed seal could not be equipped again');
const equippedSealLabel = directSealLabel;
await page.screenshot({ path: shot('earned-desktop.png') });
await page.click('#milestone-ledger-back');
assert(await page.locator('#intermission').isVisible(), 'Ledger Back did not return to intermission');
await page.click('#retry-map');
await page.locator('#ready-overlay').waitFor({ state: 'visible' });
assert(await page.locator('#entry-field-order').isHidden(), 'Fresh Start retry borrowed a Campaign Carry field order');
await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
await page.evaluate(() => {
  window.__redLedger.defeatAll();
  window.__redLedger.teleportToExit();
  window.__redLedger.use();
});
await page.locator('#intermission').waitFor({ state: 'visible' });
await page.click('#retry-map');
await page.locator('#ready-overlay').waitFor({ state: 'visible' });
await inspectFieldOrder(page, 'Desktop');
await page.screenshot({ path: shot('field-order-desktop.png') });
await page.setViewportSize({ width: 2560, height: 1600 });
await inspectFieldOrder(page, 'High-resolution desktop', true);
await page.screenshot({ path: shot('field-order-high-resolution.png') });
await page.setViewportSize({ width: 1280, height: 720 });
await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
await page.evaluate(() => {
  window.__redLedger.defeatAll();
  window.__redLedger.teleportToExit();
  window.__redLedger.use();
});
await page.locator('#intermission').waitFor({ state: 'visible' });
console.log('[milestone-ledger] returning field order verified');
await page.click('#intermission-level-select');
const levelSelectReadability = await page.locator('#level-select').evaluate((screen) => ({
  overflow: screen.scrollWidth > screen.clientWidth + 1,
  cardOverflow: [...screen.querySelectorAll('.level-map-grid button')]
    .some((button) => button.scrollWidth > button.clientWidth + 1),
  fonts: [...screen.querySelectorAll('.level-episode h2 small, .level-map-grid small')]
    .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
}));
assert(!levelSelectReadability.overflow && !levelSelectReadability.cardOverflow,
  'Level Select overflows after increasing compact record copy');
assert(levelSelectReadability.fonts.length > 0 && levelSelectReadability.fonts.every((fontSize) => fontSize >= 10),
  'Level Select contains sub-10px mastery or record copy');
await page.screenshot({ path: shot('level-select-desktop.png') });
await page.click('#level-select [data-back]');
assert(await page.locator('#intermission').isVisible(), 'Level Select Back did not return to intermission');
await page.click('#intermission-menu');
assert(await page.locator('#menu').isVisible(), 'Intermission Main Menu did not return to the title screen');
assert(await page.locator('#profile-seal').isVisible(), 'Equipped seal is not visible on the title screen');
assert((await page.locator('#profile-seal').innerText()).includes(equippedSealLabel), 'Title screen shows the wrong active seal');
assert(await page.locator('#profile-seal span').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)) >= 10,
  'Title-screen active-seal label fell below 10px');
await page.screenshot({ path: shot('equipped-title.png') });
await page.click('#milestones-button');
await page.click('#milestone-filter-earned');
const persistedEarnedCount = await page.locator('.milestone-ledger-item[data-state="earned"]').count();
assert(persistedEarnedCount >= earnedCount, 'Repeat-clear field-order journey lost earned milestone history');
await page.click('#milestone-ledger-back');
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button[data-difficulty="field-adjuster"]').click();
await page.click('#begin-episode');
assert(await page.locator('#ready-seal').isVisible(), 'Equipped seal is not carried into the field briefing');
assert((await page.locator('#ready-seal').innerText()).includes(equippedSealLabel), 'Field briefing shows the wrong active seal');
assert(await page.locator('#ready-seal').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)) >= 10,
  'Field-briefing active seal fell below 10px');
await page.screenshot({ path: shot('equipped-briefing.png') });

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
assert(await mobile.locator('#profile-seal').isVisible(), 'Portrait reload did not restore the equipped seal');
assert((await mobile.locator('#profile-seal').innerText()).includes(equippedSealLabel), 'Portrait reload restored the wrong seal');
assert(await mobile.locator('#profile-seal span').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)) >= 10,
  'Portrait active-seal label fell below 10px');
await mobile.tap('#level-select-button');
await mobile.getByRole('button', { name: /E1M8/ }).tap();
await mobile.locator('#ready-overlay').waitFor({ state: 'visible' });
await inspectFieldOrder(mobile, 'Portrait');
await mobile.screenshot({ path: shot('field-order-mobile.png'), fullPage: true });
await mobile.reload({ waitUntil: 'networkidle' });
await mobile.tap('#milestones-button');
assert(await mobile.locator('.milestone-ledger-item').count() === 15, 'Mobile All filter does not show all milestones');
await mobile.tap('#milestone-filter-earned');
assert(await mobile.locator('.milestone-ledger-item[data-state="earned"]').count() === persistedEarnedCount, 'Mobile Earned filter disagrees with desktop progress');
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
assert(await landscape.locator('#profile-seal').isVisible(), 'Landscape reload did not restore the equipped seal');
await landscape.tap('#level-select-button');
await landscape.getByRole('button', { name: /E1M8/ }).tap();
await landscape.locator('#ready-overlay').waitFor({ state: 'visible' });
await inspectFieldOrder(landscape, 'Landscape');
await landscape.screenshot({ path: shot('field-order-landscape.png'), fullPage: true });
await landscape.reload({ waitUntil: 'networkidle' });
await landscape.tap('#milestones-button');
assert(await landscape.locator('.milestone-ledger-item').count() === 15, 'Landscape All filter does not show all milestones');
assertLedgerReadability(await inspectLedger(landscape), 'Landscape', true);
await landscape.screenshot({ path: shot('all-landscape.png'), fullPage: true });
await landscapeContext.close();
console.log('[milestone-ledger] landscape ledger verified');

const awardContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await awardContext.addInitScript((entries) => {
  for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
}, cleanStorage);
const awardMobile = await awardContext.newPage();
awardMobile.setDefaultTimeout(15_000);
awardMobile.setDefaultNavigationTimeout(15_000);
const awardErrors = [];
awardMobile.on('pageerror', (error) => awardErrors.push(String(error)));
awardMobile.on('console', (message) => { if (message.type() === 'error') awardErrors.push(message.text()); });
await awardMobile.goto(url, { waitUntil: 'networkidle' });
await awardMobile.tap('#new-game');
await awardMobile.locator('.episode-card').first().tap();
await awardMobile.locator('#difficulty-actions button[data-difficulty="field-adjuster"]').tap();
await awardMobile.locator('#difficulty-confirm').tap();
await awardMobile.tap('#begin-episode');
if (await awardMobile.locator('#ready-overlay').isVisible()) await awardMobile.tap('#enter-file');
await awardMobile.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
await awardMobile.evaluate(() => {
  window.__redLedger.loadMap('E1M8');
  window.__redLedger.defeatAll();
  window.__redLedger.teleportToExit();
  window.__redLedger.use();
});
await awardMobile.locator('#intermission').waitFor({ state: 'visible' });
for (const viewport of [{ width: 390, height: 844, name: 'portrait' }, { width: 844, height: 390, name: 'landscape' }]) {
  await awardMobile.setViewportSize(viewport);
  await awardMobile.locator('#score-breakdown').evaluate((details) => { details.open = true; });
  assertIntermissionReadability(await inspectIntermissionReadability(awardMobile), `Touch ${viewport.name}`);
  const scoreMetrics = await awardMobile.locator('#score-breakdown').evaluate((details) => {
    const rect = details.getBoundingClientRect();
    const screen = document.querySelector('#intermission').getBoundingClientRect();
    return {
      left: rect.left, right: rect.right, screenLeft: screen.left, screenRight: screen.right,
      overflow: details.scrollWidth > details.clientWidth + 1,
      targetHeight: details.querySelector('summary').getBoundingClientRect().height,
    };
  });
  assert(scoreMetrics.left >= scoreMetrics.screenLeft && scoreMetrics.right <= scoreMetrics.screenRight && !scoreMetrics.overflow,
    `Touch ${viewport.name} score breakdown overflows horizontally: ${JSON.stringify(scoreMetrics)}`);
  assert(scoreMetrics.targetHeight >= 44, `Touch ${viewport.name} score disclosure misses the 44px target`);
  const metrics = await awardMobile.locator('#intermission-milestone-awards').evaluate((container) => {
    const rect = container.getBoundingClientRect();
    const screen = document.querySelector('#intermission').getBoundingClientRect();
    const button = container.querySelector('.milestone-award-equip').getBoundingClientRect();
    return {
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      screenLeft: screen.left, screenRight: screen.right, screenTop: screen.top, screenBottom: screen.bottom,
      overflow: container.scrollWidth > container.clientWidth + 1,
      buttonHeight: button.height,
    };
  });
  assert(metrics.left >= metrics.screenLeft && metrics.right <= metrics.screenRight && !metrics.overflow,
    `Touch ${viewport.name} milestone award overflows horizontally: ${JSON.stringify(metrics)}`);
  assert(metrics.buttonHeight >= 44, `Touch ${viewport.name} award equip action misses the 44px target`);
  await awardMobile.locator('#intermission-milestone-awards').evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await awardMobile.screenshot({ path: shot(`award-equip-${viewport.name}.png`), fullPage: true });
  await awardMobile.locator('#intermission-milestone-awards').screenshot({ path: shot(`award-card-${viewport.name}.png`) });
}
await awardMobile.locator('.milestone-award-equip').first().tap();
assert(await awardMobile.locator('.milestone-award-equip').first().getAttribute('aria-pressed') === 'true', 'Touch award action did not equip its seal');
await awardContext.close();
console.log('[milestone-ledger] touch award layouts verified');

assert(errors.length === 0, `Desktop console errors: ${errors.join(' | ')}`);
assert(mobileErrors.length === 0, `Mobile console errors: ${mobileErrors.join(' | ')}`);
assert(landscapeErrors.length === 0, `Landscape console errors: ${landscapeErrors.join(' | ')}`);
assert(awardErrors.length === 0, `Touch award console errors: ${awardErrors.join(' | ')}`);
console.log('Milestone ledger E2E passed');
await browser.close();
