import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const step = (count = 1) => page.evaluate((iterations) => {
  for (let index = 0; index < iterations; index += 1) window.advanceTime(250);
}, count);

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#new-game');
  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-actions button').nth(2).click();
  await page.click('#begin-episode');
  await page.click('#enter-file');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

  await page.evaluate(() => window.__redLedger.loadMap('E1M3'));
  assert(await page.evaluate(() => window.__redLedger.teleportToPickup('weapon', 'catastrophe-launcher')), 'E1M3 has no launcher pickup');
  await step(2);
  assert((await state()).player.weapon === 'catastrophe-launcher', 'Launcher pickup was not equipped');

  // Slot 4's direction is closest to the owned slot 5. Selection must follow
  // the eight displayed slot positions, not redistribute only owned weapons.
  await page.evaluate(() => window.__redLedger.radial(Math.SQRT1_2, Math.SQRT1_2, true));
  assert((await page.locator('#weapon-radial button.selected').textContent()) === '5', 'Radial direction disagrees with its displayed slot geometry');
  await page.evaluate(() => window.__redLedger.radial(Math.SQRT1_2, Math.SQRT1_2, false));

  await page.evaluate(() => window.__redLedger.setAmmo('canisters', 0));
  await page.evaluate(() => window.__redLedger.fire());
  await step(3);
  const switched = await state();
  assert(switched.player.weapon === 'staple-driver', `Dry launcher did not select the strongest usable fallback: ${switched.player.weapon}`);
  assert(switched.player.ammo.staples > 0, 'Dry-fire fallback selected an unusable staple driver');
  assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
  console.log('Weapon radial geometry and dry-fire fallback E2E passed');
} finally {
  await browser.close();
}
