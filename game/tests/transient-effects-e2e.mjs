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
const output = new URL('../output/transient-effects/', import.meta.url);
await mkdir(output, { recursive: true });

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').first().click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

assert(await page.evaluate(() => window.__redLedger.teleportNearActor('returned-mail', 4)), 'No actor available for impact animation');
await page.evaluate(() => { window.__redLedger.fire(); window.__redLedger.pause(); });
let effect = (await state()).combatEffects.animated.find((item) => item.family === 'hit-ink-small');
assert(effect?.frame === 1, 'Actor impact did not begin on authored frame one');
await page.evaluate(() => { window.__redLedger.resume(); window.advanceTime(70); window.__redLedger.pause(); });
effect = (await state()).combatEffects.animated.find((item) => item.family === 'hit-ink-small');
assert(effect && effect.frame > 1, 'Actor impact did not advance through authored frames');
await page.evaluate(() => document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active')));
await page.screenshot({ path: fileURLToPath(new URL('actor-impact.png', output)) });
await page.evaluate(() => { window.__redLedger.resume(); window.advanceTime(250); window.__redLedger.pause(); });
assert(!(await state()).combatEffects.animated.some((item) => item.family === 'hit-ink-small'), 'Finished impact effect leaked');

await page.evaluate(() => {
  window.__redLedger.resume();
  window.__redLedger.loadMap('E2M7');
  window.__redLedger.defeatAll();
  if (!window.__redLedger.teleportToTrigger('teleport')) throw new Error('Teleport trigger missing');
  window.__redLedger.use();
  window.__redLedger.pause();
});
effect = (await state()).combatEffects.animated.find((item) => item.family === 'teleport-approval-ring');
assert(effect && effect.frame < 8, `Teleport ring did not begin its authored sequence: ${JSON.stringify((await state()).combatEffects.animated)}`);
const teleportFrame = effect.frame;
await page.evaluate(() => { window.__redLedger.resume(); window.advanceTime(120); window.__redLedger.pause(); });
effect = (await state()).combatEffects.animated.find((item) => item.family === 'teleport-approval-ring');
assert(effect && effect.frame > teleportFrame, 'Teleport ring did not animate');
await page.evaluate(() => document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active')));
await page.screenshot({ path: fileURLToPath(new URL('teleport.png', output)) });

await page.evaluate(() => window.__redLedger.loadMap('E1M1'));
assert((await state()).combatEffects.animated.length === 0, 'Map load did not clear transient effects');
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
console.log('Transient effects E2E passed');
await browser.close();
