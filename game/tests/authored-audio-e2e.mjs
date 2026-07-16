import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const state = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()));

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const errors = [];
  const audioResponses = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/audio/')) audioResponses.push({ url: response.url(), status: response.status() });
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('#new-game');
  await page.waitForFunction(() => {
    const audio = JSON.parse(window.render_game_to_text()).audio;
    return audio.libraryReady && audio.spriteReady && audio.track === 'menu' && audio.trackSource === 'authored';
  });
  const menuAudio = (await state(page)).audio;
  assert(menuAudio.decodedTracks === 0, 'Long-form music was decoded instead of streamed');
  assert(menuAudio.loadedSfxShards === 1 && menuAudio.sfxShardCount === 5,
    `Menu should decode only the player/UI shard, got ${menuAudio.loadedSfxShards}/${menuAudio.sfxShardCount}`);
  assert(!menuAudio.error, `Menu audio reported an error: ${menuAudio.error}`);

  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-actions button').nth(2).click();
  await page.locator('#episode-intro.active').waitFor();
  await page.click('#begin-episode');
  if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
  await page.waitForFunction(() => {
    const audio = JSON.parse(window.render_game_to_text()).audio;
    return audio.track === 'E1M1' && audio.trackSource === 'authored' && audio.loadedSfxShards >= 4;
  });

  const beforeFeedback = (await state(page)).audio.authoredPlays;
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(650);
  await page.keyboard.up('ArrowUp');
  await page.evaluate(() => {
    window.__redLedger.teleportNearActor('returned-mail', 5);
    window.__redLedger.fire();
  });
  await page.waitForFunction((previous) => {
    const audio = JSON.parse(window.render_game_to_text()).audio;
    return audio.authoredPlays > previous && audio.loadedSfxShards >= 4;
  }, beforeFeedback);
  const gameplayAudio = (await state(page)).audio;
  assert(gameplayAudio.source === 'authored', 'Gameplay feedback did not use authored SFX');
  assert(gameplayAudio.recentSpatialCues.some((cue) => cue.kind.startsWith('enemy:') || cue.kind.startsWith('attack:')),
    'Hostile spatial audio diagnostics were not populated');
  assert(gameplayAudio.decodedTracks === 0, 'Gameplay decoded a long-form music track');
  assert(!gameplayAudio.error, `Gameplay audio reported an error: ${gameplayAudio.error}`);

  await page.evaluate(() => window.__redLedger.pause());
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.lifecycleSuspended);
  const paused = (await state(page)).audio;
  assert(paused.contextState === 'suspended', `Audio context did not suspend (${paused.contextState})`);
  await page.evaluate(() => window.__redLedger.resume());
  await page.waitForFunction(() => {
    const audio = JSON.parse(window.render_game_to_text()).audio;
    return !audio.lifecycleSuspended && audio.contextState === 'running' && audio.trackSource === 'authored';
  });

  await page.evaluate(() => window.__redLedger.pause());
  await page.locator('#pause-menu.active').waitFor();
  await page.click('#pause-options');
  await page.selectOption('#audio-profile', 'mono');
  assert((await state(page)).audio.profile === 'mono', 'Mono playback profile did not apply');
  assert(audioResponses.some(({ url: responseUrl, status }) => responseUrl.endsWith('/audio/audio-library.json') && status >= 200 && status < 300),
    'Authored audio manifest was not served successfully');
  assert(audioResponses.some(({ url: responseUrl, status }) => responseUrl.endsWith('/audio/music/e1m1.mp3') && status >= 200 && status < 300),
    'E1M1 streamed music was not served successfully');
  assert(audioResponses.filter(({ url: responseUrl, status }) => responseUrl.includes('/audio/sfx/') && status >= 200 && status < 300).length >= 3,
    'Semantic SFX shards were not served successfully');
  assert(errors.length === 0, errors.join(' | '));
  await context.close();

  const recoveryContext = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  const recoveryPage = await recoveryContext.newPage();
  recoveryPage.setDefaultTimeout(20_000);
  let manifestFailures = 1;
  await recoveryPage.route('**/audio/audio-library.json', async (route) => {
    if (manifestFailures > 0) {
      manifestFailures -= 1;
      await route.abort('failed');
    } else await route.continue();
  });
  await recoveryPage.goto(url, { waitUntil: 'networkidle' });
  await recoveryPage.click('#new-game');
  await recoveryPage.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.libraryStatus === 'failed');
  const fallback = (await state(recoveryPage)).audio;
  assert(fallback.track === 'menu' && fallback.trackSource === 'fallback' && fallback.fallbackPlays > 0,
    'Procedural fallback did not preserve the menu after an authored manifest failure');
  assert(await recoveryPage.locator('#episode-menu').isVisible(), 'Audio failure blocked menu navigation');

  await recoveryPage.waitForTimeout(3_200);
  await recoveryPage.locator('.episode-card').first().click();
  await recoveryPage.waitForFunction(() => {
    const audio = JSON.parse(window.render_game_to_text()).audio;
    return audio.libraryReady && audio.spriteReady && audio.trackSource === 'authored';
  });
  const recovered = (await state(recoveryPage)).audio;
  assert(recovered.authoredPlays > 0, 'Authored playback did not recover after the retry window');
  assert(!await recoveryPage.locator('#fatal-error').isVisible(), 'Recoverable audio failure opened the fatal screen');
  await recoveryContext.close();
} finally {
  await browser.close();
}

console.log('Authored streaming music, sharded SFX, lifecycle, profile, and recovery passed');
