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

console.log('Critical map texture readiness E2E passed');
await browser.close();
