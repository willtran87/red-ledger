import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const root = normalize(join(process.cwd(), 'dist'));
const requests = [];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const server = createServer(async (request, response) => {
  requests.push({ method: request.method, url: request.url });
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
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

try {
  const ordinary = await context.newPage();
  await ordinary.goto(base, { waitUntil: 'networkidle' });
  await ordinary.waitForFunction(() => typeof window.render_game_to_text === 'function');
  assert(await ordinary.locator('#playtest-tools').isHidden(), 'Playtest controls activated without the opt-in fragment');
  await ordinary.click('#new-game');
  await ordinary.locator('.episode-card').first().click();
  await ordinary.locator('#difficulty-actions button').nth(2).click();
  await ordinary.click('#begin-episode');
  if (await ordinary.locator('#ready-overlay').isVisible()) await ordinary.click('#enter-file');
  await ordinary.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
  await ordinary.keyboard.press('F6');
  await ordinary.waitForTimeout(50);
  const seededLegacyStorage = await ordinary.evaluate(() => {
    const envelope = JSON.parse(localStorage.getItem('red-ledger-v2:save:quicksave'));
    const audioPreferences = localStorage.getItem('red-ledger-audio-v1');
    localStorage.clear();
    if (audioPreferences !== null) localStorage.setItem('red-ledger-audio-v1', audioPreferences);
    localStorage.setItem('red-ledger-save-v1', JSON.stringify(envelope.state));
    return JSON.stringify(Object.fromEntries(
      Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
    ));
  });
  await ordinary.close();

  const page = await context.newPage();
  const failures = [];
  const outbound = [];
  page.on('request', (request) => outbound.push({ method: request.method(), url: request.url() }));
  page.on('pageerror', (error) => failures.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
  await page.goto(`${base}#playtest`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  assert(await page.locator('#playtest-tools').isVisible(), 'Playtest controls did not activate for #playtest');
  assert(typeof await page.evaluate(() => window.__redLedger) === 'undefined', 'Production exposed the development debug API');

  const storageBefore = await page.evaluate(() => JSON.stringify(Object.fromEntries(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  )));
  assert(
    storageBefore === seededLegacyStorage,
    `Playtest bootstrap changed storage keys (${Object.keys(JSON.parse(seededLegacyStorage)).join(', ')} -> ${Object.keys(JSON.parse(storageBefore)).join(', ')})`,
  );
  await page.selectOption('#playtest-map', 'E2M8');
  await page.click('#playtest-stage');
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text());
    return state.map?.id === 'E2M8' && state.mode === 'playing' && state.runtime.assets.pendingCount === 0;
  });
  assert(await page.evaluate(() => document.pointerLockElement?.id === 'game-canvas'), 'Fine-pointer staging did not retain mouse-look pointer lock');
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.advanceTime(180));
  await page.keyboard.up('KeyW');
  await page.keyboard.press('F6');
  await page.evaluate(() => window.advanceTime(40));
  await page.waitForTimeout(120);
  const storageAfter = await page.evaluate(() => JSON.stringify(Object.fromEntries(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  )));
  assert(storageAfter === storageBefore, 'QA staging or quick-save changed persistent browser storage');

  await page.click('#playtest-preview');
  await page.waitForFunction(() => document.querySelector('#playtest-report-dialog')?.open === true);
  const envelope = JSON.parse(await page.locator('#playtest-report-output').textContent());
  const checksum = createHash('sha256').update(JSON.stringify(envelope.report)).digest('hex');
  assert(envelope.checksum.value === checksum, 'Preview checksum does not cover the exact report');
  assert(envelope.report.candidateAssets.status === 'ready' && /^[a-f0-9]{64}$/.test(envelope.report.candidateAssets.value), 'Candidate asset fingerprint is unavailable');
  assert(envelope.report.frames.samples > 0, 'Report did not sample RAF frame times');
  assert(envelope.report.renderer.maxTextures > 0, 'Report did not sample renderer texture use');
  assert(envelope.report.maps.E2M8?.attempts === 1, 'Staged gated map was not recorded as an attempt');
  assert(envelope.report.attempts[0].firstActionsMs.move !== null, 'First movement timing was not recorded');
  assert(envelope.report.attempts[0].firstActionsMs.move < 1_000, 'Texture staging time leaked into first-action timing');
  assert(envelope.report.transport === 'none' && envelope.report.persistent === false, 'Report privacy contract is not explicit');
  const serialized = JSON.stringify(envelope);
  assert(!/userAgent|timezone|language|platform|observer|comment/i.test(serialized), 'Report contains an identity or free-text field');

  await page.screenshot({ path: 'output/playtest-report.png' });
  await page.click('#playtest-report-close');
  const downloadPromise = page.waitForEvent('download');
  await page.click('#playtest-export');
  const download = await downloadPromise;
  const downloaded = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert(downloaded.checksum.value === createHash('sha256').update(JSON.stringify(downloaded.report)).digest('hex'), 'Exported report checksum is invalid');
  await page.click('#playtest-clear');
  assert((await page.locator('#playtest-status').textContent()) === 'Session cleared', 'Clear did not reset the local session');

  assert(requests.every((request) => request.method === 'GET' && !request.url.includes('#playtest')), 'The URL fragment was sent to the host');
  assert(outbound.every((request) => request.method === 'GET' && new URL(request.url).origin === new URL(base).origin), 'Playtest mode emitted remote analytics or a non-GET transport');
  assert(failures.length === 0, `Playtest report produced browser errors: ${failures.join(' | ')}`);
  console.log(JSON.stringify({ map: envelope.report.attempts[0].mapId, frames: envelope.report.frames, fingerprint: envelope.report.candidateAssets.value }));
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
