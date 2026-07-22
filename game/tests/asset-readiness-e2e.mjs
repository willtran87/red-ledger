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

console.log('Title layout stability and critical map texture readiness E2E passed');
await browser.close();
