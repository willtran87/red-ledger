import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const root = normalize(join(process.cwd(), 'dist'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
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
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const failures = [];
page.on('requestfailed', (request) => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
page.on('pageerror', (error) => failures.push(String(error)));
await page.goto(`http://127.0.0.1:${port}/red-ledger/`, { waitUntil: 'networkidle' });
if (!(await page.locator('.title-art').evaluate((image) => image.complete && image.naturalWidth > 0))) failures.push('Title asset did not load');
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').nth(1).click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForTimeout(300);
const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.mode !== 'playing') failures.push('Production campaign did not start');
if (failures.length) throw new Error(failures.join('\n'));
console.log('Production build passed from nested /red-ledger/ mount');
await browser.close();
await new Promise((resolve) => server.close(resolve));
