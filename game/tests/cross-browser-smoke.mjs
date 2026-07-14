import { chromium, firefox, webkit } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const engines = { chromium, firefox, webkit };
const failures = [];
const executed = [];

for (const [name, type] of Object.entries(engines)) {
  console.log(`Testing ${name}`);
  let browser;
  try {
    browser = await type.launch({ headless: true });
  } catch (error) {
    failures.push(`${name}: required browser could not launch (${error instanceof Error ? error.message : error}). Install with: npx playwright install ${name}`);
    continue;
  }
  executed.push(name);
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
    if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
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

const missing = Object.keys(engines).filter((name) => !executed.includes(name));
if (missing.length) failures.push(`Required browser coverage missing: ${missing.join(', ')}`);
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Cross-browser smoke passed in all required engines: ${executed.join(', ')}`);
