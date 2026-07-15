import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
fs.mkdirSync('output/responsive', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function run(viewport, name, mobile = false) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `output/responsive/${name}-menu.png` });
  await page.click('#new-game');
  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-actions button').nth(1).click();
  await page.click('#begin-episode');
  if (!mobile && viewport.width >= 1920) {
    const briefing = await page.locator('#entry-controls').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const value = element.querySelector('small');
      return { width: rect.width, valueFontSize: Number.parseFloat(getComputedStyle(value).fontSize) };
    });
    assert(briefing.width >= 720, `${name}: entry briefing is undersized on a high-resolution display`);
    assert(briefing.valueFontSize >= 14, `${name}: entry briefing values are too small on a high-resolution display`);
    await page.screenshot({ path: `output/responsive/${name}-briefing.png` });
  }
  if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
  await page.waitForTimeout(500);
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('#game-shell').getBoundingClientRect();
    const status = document.querySelector('#status').getBoundingClientRect();
    const weapon = document.querySelector('#weapon-view').getBoundingClientRect();
    return { shell: [shell.x, shell.y, shell.width, shell.height], status: [status.x, status.y, status.width, status.height], weapon: [weapon.x, weapon.y, weapon.width, weapon.height], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
  });
  if (!mobile) assert(Math.abs(metrics.shell[2] / metrics.shell[3] - 1.6) < .01, `${name}: stage aspect ratio drifted`);
  else assert(metrics.shell[2] === viewport.width && metrics.shell[3] === viewport.height, `${name}: portrait shell does not use the available viewport`);
  assert(metrics.shell[2] <= viewport.width && metrics.shell[3] <= viewport.height, `${name}: stage exceeds viewport`);
  assert(metrics.status[1] >= metrics.shell[1] && metrics.status[1] + metrics.status[3] <= metrics.shell[1] + metrics.shell[3] + 1, `${name}: status bar escaped stage`);
  assert(errors.length === 0, `${name}: ${errors.join(' | ')}`);
  await page.screenshot({ path: `output/responsive/${name}-gameplay.png` });
  if (mobile) {
    for (const selector of ['#touch-fire', '#touch-stick', '#touch-look', '#touch-use', '#touch-weapon', '#touch-map', '#touch-pause']) {
      assert(await page.locator(selector).isVisible(), `Mobile control ${selector} is not visible`);
      const box = await page.locator(selector).boundingBox();
      assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, `${selector} escaped the viewport`);
    }
    await page.locator('#touch-map').tap();
    assert(await page.locator('#automap').isVisible(), 'Touch automap control did not open the map');
    await page.locator('#touch-map').tap();
    await page.locator('#touch-pause').tap();
    assert(await page.locator('#pause-menu').isVisible(), 'Touch pause control did not open the pause menu');
    await page.locator('#pause-options').tap();
    const options = await page.locator('#options-menu').evaluate((element) => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
    assert(options.clientHeight > 700, 'Mobile options overlay is still compressed');
    await page.screenshot({ path: `output/responsive/${name}-options.png`, fullPage: true });
    await page.locator('#options-menu [data-back]').tap();
    await page.locator('#resume-game').tap();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert(await page.locator('#pause-menu').isVisible(), 'Focus loss did not pause gameplay');
    await page.locator('#quit-menu').tap();
    assert(await page.locator('#confirm-dialog').isVisible(), 'Leaving an active session did not request confirmation');
    await page.locator('#confirm-cancel').tap();
  }
  await context.close();
}

await run({ width: 2560, height: 1600 }, 'desktop-2560');
await run({ width: 1280, height: 720 }, 'desktop-1280');
await run({ width: 390, height: 844 }, 'mobile-390', true);
console.log('Responsive visual geometry passed');
await browser.close();
