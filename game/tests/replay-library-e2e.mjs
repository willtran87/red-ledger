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
const dispatchMenu = (action) => page.evaluate((menuAction) => {
  window.dispatchEvent(new CustomEvent('input-menu-navigation', {
    detail: { action: menuAction, source: 'gamepad', repeat: false },
  }));
}, action);
const persistentGameplay = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage)
  .filter((key) => key.startsWith('red-ledger-v2:save:') || key === 'red-ledger-v2:campaign')
  .sort().map((key) => [key, localStorage.getItem(key)])));

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('red-ledger-replays-v1', JSON.stringify([{ name: 'Legacy replay' }])));
await page.click('#replays-button');
assert((await page.locator('#replay-feedback').textContent()).includes('incompatible simulation version'), 'Legacy replay incompatibility is not explained');
await dispatchMenu('back');
assert(await page.locator('#menu').isVisible(), 'Controller Back did not leave the replay library');
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
await page.evaluate(() => {
  const original = Storage.prototype.setItem;
  window.__restoreReplayStorage = () => { Storage.prototype.setItem = original; };
  Storage.prototype.setItem = function setItem(key, value) {
    if (key === 'red-ledger-replays-v2') throw new DOMException('Replay quota denied', 'QuotaExceededError');
    return original.call(this, key, value);
  };
});
await page.click('#record-replay');
assert(await page.locator('#replay-library').isVisible(), 'Stopping did not open the replay library');
assert(await page.locator('#replay-list .replay-row').count() === 1, 'Quota-denied replay was discarded');
assert((await page.locator('#replay-feedback').textContent()).includes('kept in this tab only'), 'Manual stop falsely claimed a quota-denied replay was saved');
assert((await page.locator('#replay-list .replay-row small').textContent()).includes('This tab only'), 'Manual fallback replay was not visibly identified');
assert(await page.evaluate(() => localStorage.getItem('red-ledger-replays-v2')) === null, 'Session-only replay leaked into persistent storage');

const downloadPromise = page.waitForEvent('download');
await page.locator('#replay-list .replay-row button').filter({ hasText: 'Export' }).click();
const download = await downloadPromise;
const exported = 'output/replays/exported-replay.json';
await download.saveAs(exported);
assert(fs.statSync(exported).size > 100, 'Exported replay is empty');
assert(JSON.parse(fs.readFileSync(exported, 'utf8')).version === 3, 'Exported replay did not use the current deterministic schema');
await page.evaluate(() => window.__restoreReplayStorage?.());
await page.locator('#replay-list .replay-delete').click();
await page.click('#confirm-accept');
await page.setInputFiles('#replay-file', exported);
await page.locator('#replay-list .replay-row').waitFor();
assert((await page.locator('#replay-feedback').textContent()).includes('saved to this browser'), 'Exported session replay could not be promoted to persistent storage');

const storageBefore = await persistentGameplay();
await page.reload({ waitUntil: 'networkidle' });
await page.click('#replays-button');
assert(await page.locator('#replay-list .replay-row').count() === 1, 'Current replay was unavailable after a fresh-page reload');
await page.locator('#replay-list .replay-row button').filter({ hasText: 'Play' }).click();
await page.waitForFunction(() => document.activeElement?.id === 'replay-pause');
let snapshot = await state();
assert(snapshot.demo.playback?.currentTick === 0, 'Replay fast-forwarded instead of starting at tick zero');
assert(snapshot.player.x === initial.player.x && snapshot.player.z === initial.player.z, 'Replay did not restore its initial state');
assert(snapshot.audio.lifecycleSuspended, 'Replay preview did not begin with audio suspended');
assert(snapshot.audio.musicActive, 'Fresh-page replay did not initialize its music scheduler');
await dispatchMenu('confirm');
await page.evaluate(() => window.advanceTime(100));
snapshot = await state();
assert(snapshot.demo.playback.currentTick > 0 && snapshot.demo.playback.currentTick < snapshot.demo.playback.totalTicks, 'Replay did not advance incrementally');
assert(!snapshot.audio.lifecycleSuspended, 'Playing replay did not resume audio');
await dispatchMenu('confirm');
const pausedTick = (await state()).demo.playback.currentTick;
assert((await state()).audio.lifecycleSuspended, 'Paused replay left audio running');
await page.evaluate(() => window.advanceTime(250));
assert((await state()).demo.playback.currentTick === pausedTick, 'Paused replay continued advancing');
await dispatchMenu('confirm');
await dispatchMenu('right');
assert(await page.evaluate(() => document.activeElement?.id) === 'replay-speed', 'Controller navigation did not reach replay speed');
await dispatchMenu('confirm');
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
await dispatchMenu('back');
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

// A valid completed replay must remain usable in this tab when persistent storage refuses it.
await page.locator('#replay-list .replay-delete').click();
await page.click('#confirm-accept');
assert(await page.locator('#replay-list .replay-row').count() === 0, 'Persistent replay was not cleared before storage-denial coverage');
const exportedDemo = JSON.parse(fs.readFileSync(exported, 'utf8'));
await page.evaluate(() => {
  const original = Storage.prototype.setItem;
  window.__restoreReplayStorage = () => { Storage.prototype.setItem = original; };
  Storage.prototype.setItem = function setItem(key, value) {
    if (key === 'red-ledger-replays-v2') throw new DOMException('Replay quota denied', 'QuotaExceededError');
    return original.call(this, key, value);
  };
});
await page.evaluate((demo) => window.dispatchEvent(new CustomEvent('demo-recording-complete', {
  detail: { demo, reason: 'size' },
})), exportedDemo);
assert((await page.locator('#replay-feedback').textContent()).includes('Replay storage limit reached.'), 'Automatic size stop did not report its distinct reason');
assert((await page.locator('#replay-feedback').textContent()).includes('kept in this tab only'), 'Automatic storage failure falsely claimed persistence');
assert(await page.locator('#replay-list .replay-row').count() === 1, 'Automatic storage failure discarded the session replay');
assert((await page.locator('#replay-list .replay-row small').textContent()).includes('This tab only'), 'Session replay was not visibly identified');
assert(await page.locator('#runtime-warning').isVisible(), 'Storage failure was not surfaced during gameplay');
await page.evaluate((demo) => {
  for (let index = 0; index < 7; index += 1) {
    window.dispatchEvent(new CustomEvent('demo-recording-complete', { detail: { demo, reason: 'size' } }));
  }
}, exportedDemo);
assert(await page.locator('#replay-list .replay-row').count() === 6, 'Session replay fallback exceeded its bounded library size');
assert(await page.evaluate(() => localStorage.getItem('red-ledger-replays-v2')) === null, 'Bounded session replays leaked into persistent storage');
await page.screenshot({ path: 'output/replays/session-only-library.png' });

const sessionDownloadPromise = page.waitForEvent('download');
await page.locator('#replay-list .replay-row button').filter({ hasText: 'Export' }).first().click();
const sessionDownload = await sessionDownloadPromise;
const sessionExport = 'output/replays/session-only-replay.json';
await sessionDownload.saveAs(sessionExport);
assert(JSON.parse(fs.readFileSync(sessionExport, 'utf8')).version === 3, 'Session-only replay could not be exported intact');
await page.locator('#replay-list .replay-row button').filter({ hasText: 'Play' }).first().click();
assert((await state()).demo.playback?.currentTick === 0, 'Session-only replay could not be played');
await page.click('#replay-exit');
await page.evaluate(() => window.__restoreReplayStorage?.());
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);

console.log('Player replay library E2E passed');
} finally {
  await browser.close();
}
