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
const completionGeometry = async () => page.locator('#intermission').evaluate((screen) => {
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const particles = [...screen.querySelectorAll('.completion-particle')].map((element) => element.getBoundingClientRect());
  const protectedCopy = ['#intermission-grade', '#tally', '#result-bests', '#intermission-mastery',
    '#intermission-milestone-awards', '#intermission-milestones', '#episode-mastery', '#episode-progress', '.intermission-actions']
    .map((selector) => screen.querySelector(selector))
    .filter((element) => element && !element.hidden)
    .map((element) => ({ selector: element.id ? `#${element.id}` : '.intermission-actions', rect: element.getBoundingClientRect() }));
  const collisions = [];
  particles.forEach((particle, index) => protectedCopy.forEach(({ selector, rect }) => {
    if (overlaps(particle, rect)) collisions.push(`${index}:${selector}`);
  }));
  const layerElement = screen.querySelector('#completion-burst');
  const layer = layerElement.getBoundingClientRect();
  return {
    collisions,
    clipped: getComputedStyle(layerElement).overflow === 'hidden',
    layerBottom: layer.bottom,
    tallyTop: screen.querySelector('#tally').getBoundingClientRect().top,
  };
});
for (let sample = 0; sample < 4; sample += 1) {
  const geometry = await completionGeometry();
  assert(geometry.collisions.length === 0, `Completion burst obscured result copy: ${geometry.collisions.join(', ')}`);
  assert(geometry.clipped, 'Completion burst layer does not clip decorative overflow');
  assert(geometry.layerBottom <= geometry.tallyTop, `Completion layer reaches the tally: ${JSON.stringify(geometry)}`);
  await page.waitForTimeout(90);
}
await page.screenshot({ path: fileURLToPath(new URL('map-completion.png', output)) });

await page.evaluate(() => {
  const reducedMotion = document.querySelector('#reduced-motion');
  reducedMotion.checked = true;
  reducedMotion.dispatchEvent(new Event('change', { bubbles: true }));
  window.__redLedger.resume();
  window.__redLedger.loadMap('E1M1');
  window.__redLedger.defeatAll();
  window.__redLedger.teleportToExit();
  window.__redLedger.use();
});
await page.waitForTimeout(40);
assert(await page.locator('.completion-particle').count() === 1, 'Reduced Motion did not constrain completion feedback to one static mark');
assert(await page.locator('.completion-particle').evaluate((element) => element.getAnimations().length) === 0,
  'Reduced Motion completion feedback still animates');
assert((await completionGeometry()).collisions.length === 0, 'Reduced Motion completion mark obscures result copy');
await page.waitForTimeout(180);
assert(await page.locator('.completion-particle').count() === 0, 'Reduced Motion completion mark did not clear promptly');

assert((await state()).combatEffects.particles.capacity === 192, 'Particle pool capacity changed');
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
console.log('Material and status particle E2E passed');
await browser.close();
