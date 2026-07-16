import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const output = new URL('../output/mastery/', import.meta.url);
const shot = (name) => fileURLToPath(new URL(name, output));
await mkdir(output, { recursive: true });

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').nth(1).click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

await page.evaluate(() => {
  window.__redLedger.loadMap('E1M8');
  window.__redLedger.defeatAll();
  window.__redLedger.teleportToExit();
  window.__redLedger.use();
});
assert(await page.locator('#intermission').isVisible(), 'Map clear did not open intermission');
assert(/^[SABCD]$/.test(await page.locator('#intermission-grade').innerText()), 'Intermission grade is missing');
assert((await page.locator('#tally').innerText()).includes('Par '), 'Intermission has no par comparison');
assert((await page.locator('#result-bests').innerText()).includes('First clear'), 'First clear was not identified');
const intermissionMastery = await page.locator('#intermission-mastery').innerText();
assert(intermissionMastery.includes('Retry goal:') && intermissionMastery.includes('PB matched'), `Intermission lacks a concrete current-vs-PB retry target: ${intermissionMastery}`);
assert((await page.locator('#episode-mastery').innerText()).includes('Episode 1/8 clear'), 'Intermission episode aggregate is missing or incorrect');
const intermissionMilestones = await page.locator('#intermission-milestones').innerText();
assert(intermissionMilestones.includes('Milestones') && /Closed Without Exception|Red Seal|Ahead of Schedule/.test(intermissionMilestones), `Intermission does not surface relevant earned milestones: ${intermissionMilestones}`);
assert(intermissionMilestones.includes('Next:'), 'Intermission does not surface a relevant next milestone');
assert((await page.locator('#retry-map').innerText()) === 'Retry Goal', 'Retry action is not tied to the visible mastery target');
await page.screenshot({ path: shot('intermission.png') });

await page.evaluate(() => document.querySelector('#level-select-button').click());
assert(await page.locator('#level-select').isVisible(), 'Level select did not open');
assert(await page.locator('.level-map-grid button', { hasText: 'E1M8' }).count() === 1, 'Completed map is missing from level select');
assert(await page.locator('.level-map-grid button', { hasText: 'E1M9' }).count() === 0, 'Ordinary E1M8 completion leaked the secret map');
assert((await page.locator('#campaign-mastery').innerText()).includes('Campaign 1/24 clear'), 'Campaign mastery aggregate is missing');
const levelMilestones = await page.locator('#level-milestones').innerText();
assert(levelMilestones.includes('Milestones') && /Closed Without Exception|Red Seal|Ahead of Schedule/.test(levelMilestones), `Level Select does not summarize earned milestones: ${levelMilestones}`);
const completedMap = page.locator('.level-map-grid button', { hasText: 'E1M8' });
assert((await completedMap.innerText()).includes('Target:'), 'Completed map has no next mastery target');
assert((await page.locator('.level-episode h2').first().innerText()).includes('1/8 clear'), 'Episode mastery aggregate is missing from Level Select');

await page.locator('#level-select-difficulty').selectOption('field-adjuster');
assert((await page.locator('.level-map-grid button', { hasText: 'E1M8' }).innerText()).includes('First clear'), 'Per-difficulty mastery target leaked another response level record');
await page.locator('#level-select-difficulty').selectOption('desk-adjuster');

await page.evaluate(() => {
  window.__redLedger.loadMap('E1M3');
  window.__redLedger.defeatAll();
  if (!window.__redLedger.teleportToTrigger('complete-map', 'E1M9')) throw new Error('Secret exit trigger missing');
  window.__redLedger.use();
});
assert(await page.locator('#intermission').isVisible(), 'Secret exit did not complete the map');
await page.evaluate(() => document.querySelector('#level-select-button').click());
assert(await page.locator('.level-map-grid button', { hasText: 'E1M9' }).count() === 1, 'Discovered secret map did not appear');
assert((await page.locator('.level-map-grid button', { hasText: 'E1M3' }).innerText()).includes('Grade'), 'Map record is missing from level select');
await page.screenshot({ path: shot('level-select.png') });

await page.reload({ waitUntil: 'networkidle' });
await page.click('#level-select-button');
assert(await page.locator('.level-map-grid button', { hasText: 'E1M9' }).count() === 1, 'Secret discovery did not persist across reload');
const campaign = await page.evaluate(() => {
  const key = Object.keys(localStorage).find((candidate) => candidate.endsWith(':campaign'));
  return key ? { key, value: localStorage.getItem(key) } : undefined;
});
assert(campaign?.value, 'Campaign persistence envelope was not written');

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await mobileContext.addInitScript(({ key, value }) => localStorage.setItem(key, value), campaign);
const mobile = await mobileContext.newPage();
await mobile.goto(url, { waitUntil: 'networkidle' });
await mobile.click('#level-select-button');
assert(await mobile.locator('.level-map-grid button', { hasText: 'E1M9' }).count() === 1, 'Mobile level select lost secret discovery');
assert(await mobile.locator('#campaign-mastery').isVisible(), 'Mobile level select hides campaign mastery');
assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile level select overflows horizontally');
await mobile.screenshot({ path: shot('level-select-mobile.png'), fullPage: true });
await mobileContext.close();

assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
console.log('Mastery progression E2E passed');
await browser.close();
