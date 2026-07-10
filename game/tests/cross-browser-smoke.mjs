import { chromium, firefox, webkit } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const engines = { chromium, firefox, webkit };
const failures = [];
let executed = 0;

for (const [name, type] of Object.entries(engines)) {
  console.log(`Testing ${name}`);
  let browser;
  try {
    browser = await type.launch({ headless: true });
  } catch (error) {
    console.warn(`${name}: browser binary unavailable, install with: npx playwright install ${name}`);
    continue;
  }
  executed += 1;
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.click('#new-game');
    await page.locator('.episode-card').first().click();
    await page.locator('#difficulty-actions button').nth(1).click();
    await page.locator('#episode-intro.active').waitFor();
    await page.click('#begin-episode');
    await page.waitForTimeout(250);
    const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    if (state.mode !== 'playing') failures.push(`${name}: campaign did not enter gameplay`);
    if (errors.length) failures.push(`${name}: ${errors.join(' | ')}`);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : error}`);
  } finally {
    await browser.close();
  }
}

if (!executed) failures.push('No Playwright browser engine was available');
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Cross-browser smoke passed in ${executed} installed engine(s)`);
