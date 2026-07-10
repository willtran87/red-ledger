import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const maps = Array.from({ length: 3 }, (_, episode) => Array.from({ length: 9 }, (_, map) => `E${episode + 1}M${map + 1}`)).flat();
fs.mkdirSync('output/campaign', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').nth(1).click();
await page.click('#begin-episode');
await page.waitForTimeout(300);
for (const id of maps) {
  await page.evaluate((mapId) => window.__redLedger.loadMap(mapId), id);
  await page.waitForTimeout(80);
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  if (state.map?.id !== id || state.mode !== 'playing') throw new Error(`Runtime map load failed for ${id}`);
  if (['E1M8', 'E2M8', 'E3M8'].includes(id)) {
    await page.screenshot({ path: `output/campaign/${id}.png` });
  }
}
await page.waitForTimeout(800);
if (errors.length) throw new Error(`Campaign runtime errors:\n${[...new Set(errors)].join('\n')}`);
fs.writeFileSync('output/campaign/runtime-smoke.json', JSON.stringify({ maps: maps.length, passed: true }, null, 2));
console.log(`Campaign runtime smoke passed: ${maps.length} maps`);
await browser.close();
