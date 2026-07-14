import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const output = new URL('../output/combat-feel/', import.meta.url);
await mkdir(output, { recursive: true });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

await page.goto(url);
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.click('#new-game');
await page.locator('.episode-card:not(:disabled)').first().click();
await page.locator('#difficulty-actions button').nth(2).click();
await page.click('#begin-episode');

let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const frozenAt = state.tally.elapsed;
assert(state.mode === 'paused', 'Desktop entry did not freeze before pointer capture');
assert(await page.locator('#ready-overlay').isVisible(), 'Desktop entry overlay is not visible');
assert(await page.locator('#ready-overlay').getAttribute('data-input') === 'desktop', 'Entry briefing did not select desktop guidance');
const briefing = await page.locator('#entry-controls').innerText();
for (const action of ['MOVE', 'LOOK', 'FIRE', 'USE', 'WEAPON', 'MAP']) {
  assert(briefing.includes(action), `Entry briefing omits ${action}`);
}
assert(briefing.includes('W') && briefing.includes('Mouse 1'), 'Entry briefing does not expose the active movement/fire bindings');
await page.waitForTimeout(250);
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert(state.tally.elapsed === frozenAt, 'Simulation advanced behind the entry overlay');
await page.screenshot({ path: fileURLToPath(new URL('ready.png', output)) });

const ammoBeforeEntry = state.player.ammo.staples;
await page.click('#enter-file');
await page.waitForTimeout(80);
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert(state.mode === 'playing', 'Enter File did not resume gameplay');
assert(state.player.ammo.staples === ammoBeforeEntry, 'Pointer capture spent ammunition');
assert(await page.locator('#reticle').isVisible(), 'Persistent reticle is not visible');
assert((await page.locator('#objective').textContent())?.trim().length > 0, 'Objective cue is empty');

assert(await page.evaluate(() => window.__redLedger.teleportNearActor('returned-mail', 5)), 'Could not stage weapon feedback target');
await page.evaluate(() => window.__redLedger.fire());
await page.waitForTimeout(70);
assert(await page.locator('#muzzle-flash').evaluate((element) => element.style.backgroundImage.includes('particle-weapon-feedback')), 'Muzzle feedback did not select an authored effect');
assert(await page.locator('#hit-marker').evaluate((element) => element.classList.contains('active')), 'Actor hit did not activate the hit marker');
await page.screenshot({ path: fileURLToPath(new URL('weapon-fire.png', output)) });

assert(await page.evaluate(() => window.__redLedger.teleportToDoor('red')), 'Could not stage credential door');
await page.evaluate(() => window.advanceTime(60));
assert(await page.locator('#context-prompt').isVisible(), 'Context prompt did not appear at a door');
assert(await page.locator('#context-prompt').evaluate((element) => element.classList.contains('locked')), 'Credential prompt is not visibly locked');
await page.screenshot({ path: fileURLToPath(new URL('context.png', output)) });

let kills = 0;
for (const id of ['returned-mail', 'desk-warden', 'ember-clerk', 'exposure-hound']) {
  if (await page.evaluate((actorId) => window.__redLedger.defeatActor(actorId), id)) kills += 1;
  if (kills === 2) break;
}
assert(kills === 2, 'Could not stage a two-kill momentum chain');
await page.evaluate(() => window.advanceTime(30));
await page.waitForTimeout(900);
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert(state.momentum.chain === 2 && state.momentum.score > 0, 'Momentum chain did not score consecutive kills');
assert(await page.locator('#combat-streak').isVisible(), 'Momentum HUD did not appear');
await page.screenshot({ path: fileURLToPath(new URL('momentum.png', output)) });

assert(state.tally.totalKills <= 35, `Opening map still has excessive enemy density (${state.tally.totalKills})`);
await page.evaluate(() => window.__redLedger.loadMap('E1M1'));
let cappedPickupStayed = false;
for (let attempt = 0; attempt < 8; attempt += 1) {
  assert(await page.evaluate(() => window.__redLedger.teleportToPickup('pickup', 'staples-large')), 'Ran out of staple reserves before testing the cap');
  const before = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.evaluate(() => window.advanceTime(60));
  const after = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  if (before.player.ammo.staples === 200) {
    cappedPickupStayed = after.player.ammo.staples === 200 && after.tally.items === before.tally.items
      && await page.evaluate(() => window.__redLedger.teleportToPickup('pickup', 'staples-large'));
    break;
  }
}
assert(cappedPickupStayed, 'A capped ammunition pickup was consumed instead of remaining available');
assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join(' | ')}`);
await browser.close();
console.log('Combat feel, contextual guidance, and momentum E2E passed.');
