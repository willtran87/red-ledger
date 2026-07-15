import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
fs.mkdirSync('output/replays', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
try {
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const persistentGameplay = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage)
  .filter((key) => key.startsWith('red-ledger-v2:save:') || key === 'red-ledger-v2:campaign')
  .sort().map((key) => [key, localStorage.getItem(key)])));

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('red-ledger-replays-v1', JSON.stringify([{ name: 'Legacy replay' }])));
await page.click('#replays-button');
assert((await page.locator('#replay-feedback').textContent()).includes('incompatible simulation version'), 'Legacy replay incompatibility is not explained');
await page.click('#replay-back');
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').nth(2).click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

await page.evaluate(() => window.dispatchEvent(new CustomEvent('input-action', {
  detail: { action: 'pause', source: 'keyboard', repeat: false },
})));
await page.click('#record-replay');
await page.locator('#recording-indicator').waitFor({ state: 'visible' });
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
const initial = await state();
await page.keyboard.down('w');
await page.evaluate(() => window.advanceTime(200));
await page.keyboard.up('w');
await page.evaluate(() => window.advanceTime(100));
await page.evaluate(() => window.dispatchEvent(new CustomEvent('input-action', {
  detail: { action: 'pause', source: 'keyboard', repeat: false },
})));
assert(await page.locator('#record-replay').textContent() === 'Stop & Save Replay', 'Pause menu did not expose recording completion');
await page.click('#record-replay');
assert(await page.locator('#replay-library').isVisible(), 'Stopping did not open the replay library');
assert(await page.locator('#replay-list .replay-row').count() === 1, 'Recorded replay was not persisted');

const downloadPromise = page.waitForEvent('download');
await page.locator('#replay-list .replay-row button').filter({ hasText: 'Export' }).click();
const download = await downloadPromise;
const exported = 'output/replays/exported-replay.json';
await download.saveAs(exported);
assert(fs.statSync(exported).size > 100, 'Exported replay is empty');
assert(JSON.parse(fs.readFileSync(exported, 'utf8')).version === 2, 'Exported replay did not use the current deterministic schema');

const storageBefore = await persistentGameplay();
await page.reload({ waitUntil: 'networkidle' });
await page.click('#replays-button');
assert(await page.locator('#replay-list .replay-row').count() === 1, 'Current replay was unavailable after a fresh-page reload');
await page.locator('#replay-list .replay-row button').filter({ hasText: 'Play' }).click();
let snapshot = await state();
assert(snapshot.demo.playback?.currentTick === 0, 'Replay fast-forwarded instead of starting at tick zero');
assert(snapshot.player.x === initial.player.x && snapshot.player.z === initial.player.z, 'Replay did not restore its initial state');
assert(snapshot.audio.lifecycleSuspended, 'Replay preview did not begin with audio suspended');
assert(snapshot.audio.musicActive, 'Fresh-page replay did not initialize its music scheduler');
await page.click('#replay-pause');
await page.evaluate(() => window.advanceTime(100));
snapshot = await state();
assert(snapshot.demo.playback.currentTick > 0 && snapshot.demo.playback.currentTick < snapshot.demo.playback.totalTicks, 'Replay did not advance incrementally');
assert(!snapshot.audio.lifecycleSuspended, 'Playing replay did not resume audio');
await page.click('#replay-pause');
const pausedTick = (await state()).demo.playback.currentTick;
assert((await state()).audio.lifecycleSuspended, 'Paused replay left audio running');
await page.evaluate(() => window.advanceTime(250));
assert((await state()).demo.playback.currentTick === pausedTick, 'Paused replay continued advancing');
await page.click('#replay-pause');
await page.click('#replay-speed');
assert((await state()).demo.playback.speed === 2, 'Replay speed did not cycle to 2x');
await page.screenshot({ path: 'output/replays/active-controls.png' });
await page.evaluate(() => window.advanceTime(100));
assert((await state()).demo.playback.currentTick >= pausedTick + 6, '2x replay did not advance at double tick rate');
await page.click('#replay-restart');
snapshot = await state();
assert(snapshot.demo.playback.currentTick === 0, `Replay restart did not return to tick zero (${snapshot.demo.playback.currentTick})`);
assert(snapshot.player.x === initial.player.x && snapshot.player.z === initial.player.z, 'Replay restart did not restore the initial world state');
await page.click('#replay-pause');
await page.evaluate(() => { window.advanceTime(250); window.advanceTime(250); });
assert((await state()).demo.playback.finished, 'Replay did not reach its finished state');
assert((await state()).audio.lifecycleSuspended, 'Completed replay left audio running');
assert(await page.locator('#replay-state').textContent() === 'Replay Complete', 'Finished replay controls were not visible');
const storageAfter = await persistentGameplay();
assert(JSON.stringify(storageAfter) === JSON.stringify(storageBefore), 'Replay mutated campaign or save persistence');
await page.click('#replay-exit');
assert(await page.locator('#menu').isVisible(), 'Replay Exit did not return to the main menu');

await page.click('#replays-button');
await page.locator('#replay-list .replay-delete').click();
await page.click('#confirm-accept');
assert(await page.locator('#replay-list .replay-row').count() === 0, 'Replay deletion did not persist');
await page.setInputFiles('#replay-file', exported);
await page.locator('#replay-list .replay-row').waitFor();
assert(await page.locator('#replay-list .replay-row').count() === 1, 'Exported replay could not be imported');
await page.reload({ waitUntil: 'networkidle' });
await page.click('#replays-button');
assert(await page.locator('#replay-list .replay-row').count() === 1, 'Replay library did not survive reload');
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);

console.log('Player replay library E2E passed');
} finally {
  await browser.close();
}
