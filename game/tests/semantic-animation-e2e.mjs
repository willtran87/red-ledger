import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const output = new URL('../output/semantic-animation/', import.meta.url);
await mkdir(output, { recursive: true });

const waitForVisual = async (id, accepted, attempts = 90) => {
  for (let index = 0; index < attempts; index += 1) {
    await page.evaluate(() => window.advanceTime(40));
    const actor = (await state()).visibleActors.find((candidate) => candidate.id === id);
    if (actor && accepted.includes(actor.visual)) return actor.visual;
  }
  return undefined;
};

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').first().click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');

await page.evaluate(() => window.__redLedger.loadMap('E1M3'));
assert(await page.evaluate(() => window.__redLedger.teleportNearActor('liability-mass', 8)), 'No Liability Mass available');
assert(await waitForVisual('liability-mass', ['charge']) === 'charge', 'Liability Mass never used its authored charge state');
await page.screenshot({ path: fileURLToPath(new URL('enemy-charge.png', output)) });

await page.evaluate(() => {
  window.__redLedger.loadMap('E1M8');
  window.__redLedger.selectWeapon('claim-stamp');
  window.advanceTime(500);
  if (!window.__redLedger.activateActor('regional-director')) throw new Error('Regional Director missing');
  if (!window.__redLedger.teleportNearActor('regional-director', 8)) throw new Error('No boss sightline');
});
const bossVisual = await waitForVisual('regional-director', ['canister', 'summon'], 120);
assert(bossVisual, 'Boss never used a semantic attack state');
await page.evaluate(() => {
  window.__redLedger.teleportNearActor('regional-director', 5);
  window.advanceTime(1);
  window.__redLedger.pause();
  document.querySelector('#weapon-view').style.visibility = 'hidden';
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
});
await page.screenshot({ path: fileURLToPath(new URL(`boss-${bossVisual}.png`, output)) });

await page.evaluate(() => window.__redLedger.resume());
assert(await page.evaluate(() => window.__redLedger.defeatActor('regional-director')), 'Boss defeat failed');
assert(await page.evaluate(() => window.__redLedger.teleportNearActor('regional-director', 6, true)), 'Could not inspect boss collapse');
await page.evaluate(() => window.advanceTime(300));
let corpse = (await state()).visibleCorpses.find((candidate) => candidate.id === 'regional-director');
assert(corpse?.visual === 'death' && corpse.frame >= 2, 'Boss collapse did not advance through death frames');
await page.screenshot({ path: fileURLToPath(new URL('boss-collapse.png', output)) });
await page.evaluate(() => { for (let index = 0; index < 6; index += 1) window.advanceTime(250); });
corpse = (await state()).visibleCorpses.find((candidate) => candidate.id === 'regional-director');
assert(corpse?.visual === 'corpse', 'Boss collapse did not settle on its authored corpse');

assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
console.log('Semantic actor animation E2E passed');
await browser.close();
