import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
fs.mkdirSync('output/asset-readiness', { recursive: true });

const enterEpisode = async (page) => {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('#new-game');
  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-actions button').nth(2).click();
  await page.click('#begin-episode');
};

const verifyTitleLayout = async (name, viewport, screenshot = false) => {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  let releaseTitle;
  const titleGate = new Promise((resolve) => { releaseTitle = resolve; });
  let delayedTitleSeen = false;
  await page.route('**/public_runtime/ui/title-screen.png', async (route) => {
    delayedTitleSeen = true;
    await titleGate;
    await route.continue();
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#game-shell')?.getAttribute('aria-busy') === 'false');
  const before = await page.evaluate(() => {
    const image = document.querySelector('.title-art');
    const actions = document.querySelector('.menu-actions').getBoundingClientRect();
    return {
      naturalWidth: image.naturalWidth,
      width: image.getAttribute('width'),
      height: image.getAttribute('height'),
      imageHeight: image.getBoundingClientRect().height,
      actionsY: actions.y,
    };
  });
  assert(delayedTitleSeen && before.naturalWidth === 0, `${name}: title response was not held`);
  assert(before.width === '320' && before.height === '200', `${name}: title art omits its intrinsic dimensions`);
  assert(before.imageHeight > 0, `${name}: title art did not reserve vertical space before decode`);
  releaseTitle();
  await page.waitForFunction(() => document.querySelector('.title-art')?.naturalWidth > 0);
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({
    imageHeight: document.querySelector('.title-art').getBoundingClientRect().height,
    actionsY: document.querySelector('.menu-actions').getBoundingClientRect().y,
  }));
  assert(Math.abs(after.imageHeight - before.imageHeight) <= .5, `${name}: title image height changed after decode`);
  assert(Math.abs(after.actionsY - before.actionsY) <= .5, `${name}: main-menu actions shifted after title image decode`);
  assert(errors.length === 0, `${name}: delayed title scenario errors: ${errors.join(' | ')}`);
  if (screenshot) await page.screenshot({ path: 'output/asset-readiness/title-layout-stability.png' });
  await page.close();
};

await verifyTitleLayout('desktop-1280', { width: 1280, height: 720 }, true);
await verifyTitleLayout('high-resolution-2560', { width: 2560, height: 1440 });
await verifyTitleLayout('mobile-portrait-390', { width: 390, height: 844 });
await verifyTitleLayout('mobile-landscape-568', { width: 568, height: 320 });

const verifyTransitionLayout = async (name, viewport, screenshot = false) => {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  let releaseIntro;
  const introGate = new Promise((resolve) => { releaseIntro = resolve; });
  let delayedIntroSeen = false;
  await page.route('**/public_runtime/ui/illustrations/episode-1-intro.png', async (route) => {
    delayedIntroSeen = true;
    await introGate;
    await route.continue();
  });
  let releaseIntermission;
  const intermissionGate = new Promise((resolve) => { releaseIntermission = resolve; });
  let delayedIntermissionSeen = false;
  await page.route('**/public_runtime/ui/illustrations/intermission-episode-1.png', async (route) => {
    delayedIntermissionSeen = true;
    await intermissionGate;
    await route.continue();
  });

  const geometry = async (imageSelector, dependentSelectors) => page.evaluate(({ imageSelector, dependentSelectors }) => {
    const image = document.querySelector(imageSelector);
    return {
      naturalWidth: image.naturalWidth,
      width: image.getAttribute('width'),
      height: image.getAttribute('height'),
      imageHeight: image.getBoundingClientRect().height,
      dependents: dependentSelectors.map((selector) => document.querySelector(selector).getBoundingClientRect().y),
    };
  }, { imageSelector, dependentSelectors });

  await page.goto(url, { waitUntil: 'networkidle' });
  const imageDimensions = await page.evaluate(() => Object.fromEntries([
    ['#episode-intro-art', ['320', '200']],
    ['#intermission-art', ['320', '200']],
    ['#pause-menu > img', ['128', '24']],
    ['#epilogue-art', ['320', '200']],
    ['#portrait', ['28', '28']],
  ].map(([selector, expected]) => {
    const image = document.querySelector(selector);
    return [selector, { expected, actual: [image.getAttribute('width'), image.getAttribute('height')] }];
  })));
  for (const [selector, dimensions] of Object.entries(imageDimensions)) {
    assert(JSON.stringify(dimensions.actual) === JSON.stringify(dimensions.expected),
      `${name}: ${selector} omits its intrinsic dimensions`);
  }
  await page.click('#new-game');
  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-actions button').nth(2).click();
  await page.locator('#episode-intro').waitFor({ state: 'visible' });
  const introBefore = await geometry('#episode-intro-art', ['#episode-intro-copy', '#begin-episode']);
  assert(delayedIntroSeen && introBefore.naturalWidth === 0, `${name}: episode-intro response was not held`);
  assert(introBefore.width === '320' && introBefore.height === '200', `${name}: episode-intro art omits its intrinsic dimensions`);
  assert(introBefore.imageHeight > 0, `${name}: episode-intro art did not reserve vertical space before decode`);
  assert(await page.locator('#episode-intro-art').getAttribute('alt') === 'Storm clouds gathering over a dark regional office campus',
    `${name}: episode-intro art lacks a specific description`);
  releaseIntro();
  await page.waitForFunction(() => document.querySelector('#episode-intro-art')?.naturalWidth > 0);
  await page.waitForTimeout(100);
  const introAfter = await geometry('#episode-intro-art', ['#episode-intro-copy', '#begin-episode']);
  assert(Math.abs(introAfter.imageHeight - introBefore.imageHeight) <= .5, `${name}: episode-intro image height changed after decode`);
  introAfter.dependents.forEach((position, index) => assert(Math.abs(position - introBefore.dependents[index]) <= .5,
    `${name}: episode-intro content shifted after image decode`));
  if (screenshot) await page.screenshot({ path: 'output/asset-readiness/episode-intro-layout-stability.png' });

  await page.click('#begin-episode');
  await page.locator('#ready-overlay').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#enter-file')?.disabled);
  await page.click('#enter-file');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
  await page.evaluate(() => {
    window.__redLedger.defeatAll();
    window.__redLedger.teleportToExit();
    window.__redLedger.use();
  });
  await page.locator('#intermission').waitFor({ state: 'visible' });
  const intermissionBefore = await geometry('#intermission-art', ['#intermission-grade', '#tally', '.intermission-actions']);
  assert(delayedIntermissionSeen && intermissionBefore.naturalWidth === 0, `${name}: intermission response was not held`);
  assert(intermissionBefore.width === '320' && intermissionBefore.height === '200', `${name}: intermission art omits its intrinsic dimensions`);
  assert(intermissionBefore.imageHeight > 0, `${name}: intermission art did not reserve vertical space before decode`);
  assert(await page.locator('#intermission-art').getAttribute('alt') === 'A traced red route through the regional office campus',
    `${name}: intermission art lacks a specific description`);
  releaseIntermission();
  await page.waitForFunction(() => document.querySelector('#intermission-art')?.naturalWidth > 0);
  await page.waitForTimeout(100);
  const intermissionAfter = await geometry('#intermission-art', ['#intermission-grade', '#tally', '.intermission-actions']);
  assert(Math.abs(intermissionAfter.imageHeight - intermissionBefore.imageHeight) <= .5, `${name}: intermission image height changed after decode`);
  intermissionAfter.dependents.forEach((position, index) => assert(Math.abs(position - intermissionBefore.dependents[index]) <= .5,
    `${name}: intermission content shifted after image decode`));
  assert(errors.length === 0, `${name}: delayed transition scenario errors: ${errors.join(' | ')}`);
  if (screenshot) await page.screenshot({ path: 'output/asset-readiness/transition-layout-stability.png' });
  await page.close();
};

await verifyTransitionLayout('desktop-transition-1280', { width: 1280, height: 720 }, true);
await verifyTransitionLayout('high-resolution-transition-2560', { width: 2560, height: 1440 });
await verifyTransitionLayout('mobile-transition-390', { width: 390, height: 844 });
await verifyTransitionLayout('landscape-transition-568', { width: 568, height: 320 });

const delayedPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const delayedErrors = [];
delayedPage.on('pageerror', (error) => delayedErrors.push(String(error)));
delayedPage.on('console', (message) => { if (message.type() === 'error') delayedErrors.push(message.text()); });
let delayedTextureSeen = false;
await delayedPage.route('**/texture_office-drywall-gray_clean_00.png', async (route) => {
  delayedTextureSeen = true;
  await new Promise((resolve) => setTimeout(resolve, 700));
  await route.continue();
});
await enterEpisode(delayedPage);
assert(delayedTextureSeen, 'Delayed critical texture route was not requested');
assert(await delayedPage.locator('#ready-overlay').getAttribute('aria-busy') === 'true', 'Ready overlay did not expose busy state during texture decoding');
assert(await delayedPage.locator('#enter-file').isDisabled(), 'Entry was enabled while a critical map texture was pending');
assert(await delayedPage.locator('#enter-file').textContent() === 'Preparing File...', 'Pending entry did not expose preparation status');
await delayedPage.waitForFunction(() => !document.querySelector('#enter-file')?.disabled, undefined, { timeout: 5_000 });
assert(await delayedPage.locator('#ready-overlay').getAttribute('aria-busy') === null, 'Ready overlay stayed busy after textures settled');
const delayedRuntime = JSON.parse(await delayedPage.evaluate(() => window.render_game_to_text())).runtime;
assert(delayedRuntime.assets.pendingCount === 0, 'Texture readiness left pending map assets behind');
assert(delayedErrors.length === 0, `Delayed texture scenario errors: ${delayedErrors.join(' | ')}`);
await delayedPage.close();

const failedPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const failedErrors = [];
failedPage.on('pageerror', (error) => failedErrors.push(String(error)));
failedPage.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource: net::ERR_FAILED')) failedErrors.push(message.text());
});
await failedPage.route('**/texture_office-drywall-gray_clean_00.png', (route) => route.abort('failed'));
await enterEpisode(failedPage);
await failedPage.waitForFunction(() => !document.querySelector('#enter-file')?.disabled, undefined, { timeout: 5_000 });
const failedRuntime = JSON.parse(await failedPage.evaluate(() => window.render_game_to_text())).runtime;
assert(failedRuntime.assets.mode === 'placeholder-fallback', 'Failed critical texture did not enter safe placeholder mode');
assert(failedRuntime.assets.failedUrls.some((assetUrl) => assetUrl.includes('office-drywall-gray')), 'Failed critical texture was not diagnosed');
assert(await failedPage.locator('#runtime-warning').isVisible(), 'Safe degradation did not notify the player');
await failedPage.click('#enter-file');
await failedPage.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
await failedPage.screenshot({ path: 'output/asset-readiness/fallback-gameplay.png' });
assert(failedErrors.length === 0, `Failed texture scenario errors: ${failedErrors.join(' | ')}`);

console.log('Title/transition layout stability and critical map texture readiness E2E passed');
await browser.close();
