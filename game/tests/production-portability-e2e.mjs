import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

const root = normalize(join(process.cwd(), 'dist'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/red-ledger/')) throw new Error('Unknown mount');
    const relative = decodeURIComponent(pathname.slice('/red-ledger/'.length)) || 'index.html';
    let file = normalize(join(root, relative));
    if (!file.startsWith(root)) throw new Error('Invalid path');
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    response.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end('Not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/red-ledger/`;
const browser = await chromium.launch({ headless: true });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const state = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()));

const monitor = (page, ignoredRequest = () => false) => {
  const failures = [];
  page.on('requestfailed', (request) => {
    const error = request.failure()?.errorText;
    const expectedStreamStop = request.url().includes('/audio/music/') && error === 'net::ERR_ABORTED';
    if (!expectedStreamStop && !ignoredRequest(request)) failures.push(`${request.url()}: ${error}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !ignoredRequest(response.request())) failures.push(`${response.status()} ${response.url()}`);
  });
  page.on('pageerror', (error) => failures.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) failures.push(message.text());
  });
  return failures;
};

const startCampaign = async (page) => {
  await page.click('#new-game');
  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-actions button').nth(1).click();
  await page.click('#begin-episode');
  if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
};

const resumeWithOwnership = async (page) => {
  await page.click('#resume-game');
  const gate = page.locator('#ready-overlay:not([hidden]) #enter-file');
  if (await gate.isVisible().catch(() => false)) await gate.click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing'
    && document.pointerLockElement === document.querySelector('#game-canvas'));
};

try {
  const compact = await fetch(`${base}data/game-assets.json`);
  const authoring = await fetch(`${base}data/runtime-assets.json`);
  const audioManifestResponse = await fetch(`${base}audio/audio-library.json`);
  const license = await fetch(`${base}LICENSE.txt`);
  const notices = await fetch(`${base}THIRD_PARTY_NOTICES.txt`);
  assert(compact.ok && Number(compact.headers.get('content-length') ?? 0) < 500_000, 'Compact production catalog is missing or oversized');
  assert(authoring.status === 404, 'Authoring-only catalog leaked into the production package');
  assert(audioManifestResponse.ok, 'Authored audio manifest is missing from the production package');
  const audioManifest = await audioManifestResponse.json();
  const musicEntries = Object.values(audioManifest.music ?? {});
  const sfxShards = Object.values(audioManifest.sfx?.shards ?? {});
  assert(audioManifest.schema === 2 && musicEntries.length === 33,
    'Production authored music manifest is incomplete');
  assert(audioManifest.sfx?.shardCount === 5 && audioManifest.sfx?.groupCount === 189
    && audioManifest.sfx?.cueCount === 347 && sfxShards.length === 5,
  'Production authored SFX manifest is incomplete');
  const packagedAudio = await Promise.all([
    fetch(new URL(musicEntries[0].url, base)),
    ...sfxShards.map((shard) => fetch(new URL(shard.url, base))),
  ]);
  assert(packagedAudio.every((response) => response.ok && response.headers.get('content-type') === 'audio/mpeg'),
    'Production authored audio media is missing or served with the wrong type');
  assert((await Promise.all(packagedAudio.map((response) => response.arrayBuffer())))
    .every((payload) => payload.byteLength > 10_000), 'Production authored audio media is unexpectedly empty');
  assert(license.ok && (await license.text()).includes('All rights reserved'), 'Production license notice is missing');
  assert(notices.ok && (await notices.text()).includes('three.js authors'), 'Production third-party notice is missing');

  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  const failures = monitor(page);
  await page.goto(base, { waitUntil: 'networkidle' });
  assert(await page.evaluate(() => window.__redLedger === undefined), 'Development debug API leaked into the production package');
  assert(await page.locator('.title-art').evaluate((image) => image.complete && image.naturalWidth > 0), 'Title asset did not load');

  await page.click('#new-game');
  await page.locator('#episode-menu [data-back]').click();
  assert(await page.locator('#menu').isVisible(), 'Production Episode Back did not return to the main menu');
  await page.click('#new-game');
  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-menu [data-back]').click();
  assert(await page.locator('#episode-menu').isVisible(), 'Production Difficulty Back did not return to episode selection');
  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-actions button').nth(1).click();
  await page.locator('#episode-intro [data-back]').click();
  assert(await page.locator('#difficulty-menu').isVisible(), 'Production Intro Back did not return to difficulty selection');
  await page.locator('#difficulty-actions button').nth(1).click();
  await page.click('#begin-episode');
  await page.click('#enter-file');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('input-action', { detail: { action: 'pause', source: 'keyboard', repeat: false } })));
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'paused');
  await page.click('#save-game');
  await page.locator('#save-slot-list .slot-action').first().click();
  await page.click('#load-game');
  assert(await page.locator('#load-slot-list .slot-action').first().isEnabled(), 'Production save was not readable');
  await page.locator('#load-slot-list .slot-action').first().click();
  assert((await state(page)).mode === 'paused', 'Production load did not return to a valid paused state');
  await resumeWithOwnership(page);

  const contextLost = await page.evaluate(() => {
    const event = new Event('webglcontextlost', { cancelable: true });
    document.querySelector('#game-canvas').dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert(contextLost, 'Production context loss was not claimed');
  await page.waitForFunction(() => {
    const snapshot = JSON.parse(window.render_game_to_text());
    return snapshot.runtime.halted && snapshot.mode === 'paused' && snapshot.audio.lifecycleSuspended
      && document.pointerLockElement === null;
  });
  assert(await page.locator('#fatal-error').isVisible(), 'Production fatal recovery UI is not visible');
  assert(failures.length === 0, failures.join('\n'));
  await page.close();

  const deniedContext = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  await deniedContext.addInitScript(() => {
    const deny = () => { throw new DOMException('Denied by production fixture', 'SecurityError'); };
    for (const method of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
      Object.defineProperty(Storage.prototype, method, { configurable: true, value: deny });
    }
  });
  const deniedPage = await deniedContext.newPage();
  const deniedFailures = monitor(deniedPage);
  await deniedPage.goto(base, { waitUntil: 'networkidle' });
  assert(await deniedPage.locator('#runtime-warning').isVisible(), 'Production storage denial did not expose the session-only warning');
  await deniedPage.click('#continue-game');
  assert(await deniedPage.locator('#episode-menu').isVisible(), 'Production first-run Continue did not fall through to New Game');
  assert(deniedFailures.length === 0, deniedFailures.join('\n'));
  await deniedContext.close();

  const retryContext = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  const retryPage = await retryContext.newPage();
  let catalogRequests = 0;
  await retryPage.route('**/data/game-assets.json', async (route) => {
    catalogRequests += 1;
    if (catalogRequests === 1) await route.abort('failed');
    else await route.continue();
  });
  const retryFailures = monitor(retryPage, (request) => request.url().includes('/data/game-assets.json') && catalogRequests === 1);
  await retryPage.goto(base, { waitUntil: 'domcontentloaded' });
  await retryPage.locator('#fatal-error').waitFor({ state: 'visible' });
  await Promise.all([
    retryPage.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    retryPage.click('#fatal-reload'),
  ]);
  await retryPage.waitForFunction(() => typeof window.render_game_to_text === 'function');
  assert(catalogRequests >= 2 && await retryPage.locator('#menu').isVisible(), 'Production catalog reload did not recover');
  assert(retryFailures.length === 0, retryFailures.join('\n'));
  await retryContext.close();

  for (const [name, browserType] of Object.entries({ firefox, webkit })) {
    const packagedBrowser = await browserType.launch({ headless: true });
    try {
      const context = await packagedBrowser.newContext({ viewport: { width: 1024, height: 640 }, hasTouch: true });
      const packagedPage = await context.newPage();
      const packagedFailures = monitor(packagedPage);
      await packagedPage.goto(base, { waitUntil: 'networkidle' });
      assert(await packagedPage.locator('.title-art').evaluate((image) => image.complete && image.naturalWidth > 0),
        `${name} could not load the packaged title asset`);
      await startCampaign(packagedPage);
      assert((await state(packagedPage)).mode === 'playing', `${name} could not start the packaged campaign`);
      assert(packagedFailures.length === 0, `${name} packaged errors: ${packagedFailures.join('\n')}`);
      await context.close();
    } finally {
      await packagedBrowser.close();
    }
  }

  console.log('Production nested package, persistence, navigation, resilience, notices, and cross-engine startup passed');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
