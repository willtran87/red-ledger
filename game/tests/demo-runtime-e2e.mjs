import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').nth(2).click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

const result = await page.evaluate(() => {
  const api = window.__redLedger;
  if (!api?.startDemo()) throw new Error('Demo recording did not start');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
  window.advanceTime(200);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }));
  const demo = api.finishDemo();
  const recorded = JSON.parse(window.render_game_to_text());
  const accepted = api.playDemo(demo);
  const replayed = JSON.parse(window.render_game_to_text());
  const corrupted = structuredClone(demo);
  corrupted.checksum = '00000000';
  const corruptAccepted = api.playDemo(corrupted);
  return { demo, recorded, replayed, accepted, corruptAccepted };
});

assert(result.accepted, 'Valid deterministic demo was rejected');
assert(!result.corruptAccepted, 'Checksum-tampered demo was accepted');
assert(result.demo.tickRate === 35 && result.demo.totalTicks === 7, `Expected seven 35 Hz ticks, got ${result.demo.totalTicks}`);
assert(result.demo.frames.length === result.demo.totalTicks, 'Recorder did not capture one command frame per simulated tick');

const terminal = (state) => ({
  map: state.map,
  player: state.player,
  visibleActors: state.visibleActors,
  combatEffects: state.combatEffects,
  world: state.world,
  bosses: state.bosses,
  tally: state.tally,
  message: state.message,
});
assert(JSON.stringify(terminal(result.recorded)) === JSON.stringify(terminal(result.replayed)), 'Replay terminal state diverged from the recorded terminal state');
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);

console.log('Deterministic demo runtime E2E passed');
await browser.close();
