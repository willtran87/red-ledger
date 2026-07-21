import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const maps = Array.from({ length: 3 }, (_, episode) => Array.from({ length: 9 }, (_, map) => `E${episode + 1}M${map + 1}`)).flat();
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const label = (value) => value.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('#new-game');
  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-actions button').first().click();
  await page.click('#begin-episode');
  if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

  await page.evaluate(() => {
    window.__redLedger.loadMap('E1M1');
    window.__redLedger.defeatAll();
    for (let index = 0; index < 96; index += 1) window.advanceTime(250);
  });
  let guidance = await state();
  assert(guidance.objective === 'Recover Red credential', `Cleared E1M1 objective was ${guidance.objective}`);
  assert(guidance.routeHint?.tier === 1, 'E1M1 did not reveal its gentle stuck clue');
  assert(guidance.routeHint.text.includes('visible through glass'), `Unexpected E1M1 clue: ${guidance.routeHint.text}`);
  assert(await page.locator('#route-hint').isVisible(), 'Visible field hint did not render in the HUD');
  await page.evaluate(() => {
    for (let index = 0; index < 96; index += 1) window.advanceTime(250);
  });
  guidance = await state();
  assert(guidance.routeHint?.tier === 2, 'E1M1 did not escalate to directional guidance');
  assert(/paces away/.test(guidance.routeHint.text), `Directional guidance lacked a distance: ${guidance.routeHint.text}`);
  await page.evaluate(() => {
    window.__redLedger.teleportToPickup('credential', 'red');
    window.advanceTime(50);
  });
  guidance = await state();
  assert(guidance.player.credentials.includes('red'), 'E1M1 red credential was not collected');
  assert(guidance.objective === 'Open Red access route', `Credential route objective was ${guidance.objective}`);
  assert(guidance.routeHint === null, 'Stale route guidance remained after objective progress');
  assert(await page.locator('#route-hint').isHidden(), 'Field hint remained visible after objective progress');
  await page.evaluate(() => {
    for (let index = 0; index < 96; index += 1) window.advanceTime(250);
  });
  guidance = await state();
  assert(guidance.routeHint?.text.includes('matching access door'), `Credential access hint was ${guidance.routeHint?.text}`);
  await page.evaluate(() => {
    window.__redLedger.teleportToTrigger('open-door', 'red-route');
    window.__redLedger.use();
    window.advanceTime(50);
    window.__redLedger.use();
    window.advanceTime(50);
  });
  guidance = await state();
  assert(guidance.objective.startsWith('Activate Credential return loop'), `Access route did not advance to the mechanism: ${guidance.objective}`);
  assert(guidance.routeHint === null, 'Credential access hint remained after opening the route');

  let credentialMaps = 0;
  for (const id of maps) {
    await page.evaluate((mapId) => window.__redLedger.loadMap(mapId), id);
    await page.evaluate(() => {
      window.__redLedger.defeatMandatory('entry');
      window.__redLedger.defeatMandatory('transformation');
      window.__redLedger.defeatMandatory('climax');
    });
    const before = await state();
    const hasCredential = await page.evaluate(() => window.__redLedger.teleportToPickup('credential'));
    if (!hasCredential) continue;
    credentialMaps += 1;
    await page.evaluate(() => window.advanceTime(50));
    const after = await state();
    const acquired = after.player.credentials.find((credential) => !before.player.credentials.includes(credential));
    assert(acquired, `${id} did not collect its first staged credential`);
    assert(before.objective === `Recover ${label(acquired)} credential`, `${id} requested ${before.objective} before staged ${acquired}`);
  }

  assert(credentialMaps >= 18, `Guidance test covered only ${credentialMaps} credential maps`);
  assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
  console.log(`Campaign guidance passed across ${credentialMaps} credential maps`);
} finally {
  await browser.close();
}
