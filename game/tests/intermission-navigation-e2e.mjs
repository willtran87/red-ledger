import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const finishMap = async () => {
  await page.evaluate(() => {
    window.__redLedger.defeatAll();
    window.__redLedger.teleportToExit();
    window.__redLedger.use();
  });
  assert((await state()).mode === 'intermission', 'Map did not reach intermission');
};

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').nth(2).click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');

await finishMap();
for (const id of ['continue-map', 'retry-map', 'intermission-level-select', 'intermission-menu']) {
  assert(await page.locator(`#${id}`).isVisible(), `${id} is not visible at intermission`);
}

await page.click('#retry-map');
assert(await page.locator('#ready-overlay').isVisible(), 'Retry did not restore the entry gate');
await page.click('#enter-file');
let snapshot = await state();
assert(snapshot.mode === 'playing' && snapshot.map.id === 'E1M1', 'Retry did not restart the completed map');
assert(snapshot.tally.kills === 0 && snapshot.tally.elapsed < .5, 'Retry retained the prior run tally');
assert(snapshot.player.weapon === 'staple-driver', 'Retry did not use a pistol-start inventory');

await finishMap();
await page.click('#intermission-level-select');
assert(await page.locator('#level-select').isVisible(), 'Intermission Level Select did not open');
assert(await page.locator('#level-select-difficulty').inputValue() === 'field-adjuster', 'Level Select lost the completed run difficulty');
assert(await page.locator('#level-select-list button').first().isEnabled(), 'Completed map is not replayable from Level Select');
await page.locator('#level-select-list button').first().click();
assert(await page.locator('#ready-overlay').isVisible(), 'Level Select replay did not restore the entry gate');
await page.click('#enter-file');
assert((await state()).map.id === 'E1M1', 'Level Select did not start the selected map');

await finishMap();
await page.click('#intermission-menu');
assert(await page.locator('#menu').isVisible(), 'Intermission Main Menu did not return to the menu');
assert((await state()).mode === 'menu', 'Game mode did not return to menu');
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);

console.log('Intermission replay navigation E2E passed');
await browser.close();
