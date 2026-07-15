import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const output = new URL('../output/particle-materials/', import.meta.url);
await mkdir(output, { recursive: true });
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').nth(2).click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

const environment = ['fiber', 'concrete', 'glass', 'water', 'metal', 'toner', 'wax', 'spittle'];
await page.evaluate((kinds) => window.__redLedger.particleGallery(kinds), environment);
await page.evaluate(() => { window.advanceTime(28); window.__redLedger.pause(); document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active')); });
let counts = (await state()).combatEffects.particles.byKind;
environment.forEach((kind) => assert(counts[kind] > 0, `Missing environment particle kind ${kind}`));
await page.screenshot({ path: fileURLToPath(new URL('environment-materials.png', output)) });

await page.evaluate(() => { window.__redLedger.resume(); window.__redLedger.loadMap('E1M1'); window.advanceTime(28); });
const status = ['deflection', 'neutralize', 'authority', 'scan', 'momentum', 'rejection', 'confetti'];
await page.evaluate((kinds) => window.__redLedger.particleGallery(kinds), status);
await page.evaluate(() => { window.advanceTime(28); window.__redLedger.pause(); document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active')); });
const semantic = (await state()).combatEffects.semanticCues.map((cue) => cue.kind);
['deflection', 'neutralize', 'authority', 'scan', 'momentum', 'rejection', 'map-clear']
  .forEach((kind) => assert(semantic.includes(kind), `Missing anchored status cue ${kind}`));
await page.screenshot({ path: fileURLToPath(new URL('status-feedback.png', output)) });

await page.evaluate(() => {
  window.__redLedger.resume();
  window.__redLedger.loadMap('E1M1');
  window.__redLedger.defeatAll();
  window.__redLedger.teleportToExit();
  window.__redLedger.use();
});
await page.waitForTimeout(160);
const completionParticles = await page.locator('.completion-particle').count();
assert(completionParticles > 0 && completionParticles <= 10, `Map completion feedback was missing or excessive: ${completionParticles}`);
await page.screenshot({ path: fileURLToPath(new URL('map-completion.png', output)) });

assert((await state()).combatEffects.particles.capacity === 192, 'Particle pool capacity changed');
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
console.log('Material and status particle E2E passed');
await browser.close();
