import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
fs.mkdirSync('output/particles', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').nth(2).click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

assert(await page.evaluate(() => window.__redLedger.teleportNearActor('returned-mail', 4)), 'Could not stage particle impact');
await page.evaluate(() => window.__redLedger.fire());
let particles = (await state()).combatEffects.particles;
assert(particles.active > 0 && particles.byKind.ink + particles.byKind.spark > 0, 'Weapon impact emitted no particles');
await page.screenshot({ path: 'output/particles/weapon-impact.png' });

assert(await page.evaluate(() => window.__redLedger.defeatActor('returned-mail')), 'Could not stage particle death');
particles = (await state()).combatEffects.particles;
assert(particles.byKind.ink > 0 && particles.byKind.paper > 0, 'Enemy death omitted ink or paper particles');
await page.screenshot({ path: 'output/particles/enemy-death.png' });

await page.evaluate(() => {
  window.__redLedger.loadMap('E1M3');
  window.__redLedger.defeatEncounter('entry');
  window.__redLedger.defeatEncounter('transformation');
  window.__redLedger.teleportToTrigger('raise-floor');
  window.__redLedger.use();
});
particles = (await state()).combatEffects.particles;
assert(particles.byKind.concrete > 0, 'Lift mechanism activation emitted no concrete feedback');
await page.screenshot({ path: 'output/particles/mechanism-sparks.png' });

await page.evaluate(() => {
  window.__redLedger.loadMap('E1M1');
  window.__redLedger.teleportToTrigger('reveal-secret');
  window.__redLedger.use();
});
particles = (await state()).combatEffects.particles;
assert(particles.byKind.approval > 0, 'Secret reveal emitted no approval particles');
await page.screenshot({ path: 'output/particles/secret-reveal.png' });

await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('accessibility-settings-change', { detail: { reducedEffects: true } }));
  window.__redLedger.loadMap('E1M1');
  window.dispatchEvent(new CustomEvent('input-action', { detail: { action: 'pause', source: 'keyboard', repeat: false } }));
  window.__redLedger.fire();
});
particles = (await state()).combatEffects.particles;
assert(particles.active > 0 && particles.active <= 4, `Reduced effects did not preserve a restrained cue: ${particles.active}`);
assert(particles.capacity === 192, 'Particle pool capacity changed unexpectedly');
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);

console.log('Generated particle feedback E2E passed');
await browser.close();
