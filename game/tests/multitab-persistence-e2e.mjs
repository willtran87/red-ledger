import fs from 'node:fs';
import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
fs.mkdirSync('output/multitab', { recursive: true });

const errors = [];
const watch = (page, label) => {
  page.on('pageerror', (error) => errors.push(`${label}: ${String(error)}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${label}: ${message.text()}`); });
};
const state = async (page) => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const start = async (page) => {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('#new-game');
  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-actions button').nth(2).click();
  await page.click('#begin-episode');
  if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
};

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const firstTab = await context.newPage();
  const secondTab = await context.newPage();
  watch(firstTab, 'first tab');
  watch(secondTab, 'second tab');
  await start(firstTab);
  await start(secondTab);

  await firstTab.evaluate(() => { window.__redLedger.loadMap('E1M2'); window.__redLedger.pause(); });
  await secondTab.evaluate(() => { window.__redLedger.loadMap('E1M3'); window.__redLedger.pause(); });
  await firstTab.click('#save-game');
  await secondTab.click('#save-game');
  await firstTab.locator('#save-slot-list .slot-action').first().click();
  await secondTab.locator('#save-slot-list .slot-action').first().click();

  const warning = await secondTab.locator('#runtime-warning').textContent();
  assert(await secondTab.locator('#runtime-warning').isVisible(), 'The stale tab did not expose its save-conflict warning');
  assert(warning.includes('Both versions were kept'), `Save-conflict warning was unclear: ${warning}`);
  const continuePreview = await secondTab.locator('#menu-feedback').textContent();
  assert(continuePreview.includes('Manual file') && continuePreview.includes('E1M3'), `An older tab copy unexpectedly won Continue: ${continuePreview}`);

  await secondTab.click('#load-game');
  const conflictRow = secondTab.locator('#automatic-slot-list .slot-row')
    .filter({ hasText: 'Tab Copy' })
    .filter({ hasText: 'E1M2' });
  assert(await conflictRow.count() === 1, 'The external manual save was not exposed as one distinct E1M2 Tab Copy');
  const conflictDetail = await conflictRow.locator('small').textContent();
  assert(conflictDetail.includes('E1M2'), `The tab copy did not preserve the external map: ${conflictDetail}`);
  await secondTab.screenshot({ path: 'output/multitab/conflict-recovery.png' });
  await conflictRow.locator('.slot-action').click();
  assert((await state(secondTab)).map.id === 'E1M2', 'Loading the preserved tab copy did not restore its state');

  await firstTab.evaluate(() => {
    window.__redLedger.resume();
    window.__redLedger.loadMap('E1M8');
    window.__redLedger.defeatAll();
    window.__redLedger.teleportToExit();
    window.__redLedger.use();
  });
  await firstTab.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'intermission');
  await secondTab.evaluate(() => {
    window.__redLedger.resume();
    window.__redLedger.loadMap('E1M3');
    window.__redLedger.defeatAll();
    window.__redLedger.teleportToExit();
    window.__redLedger.use();
  });
  await secondTab.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'intermission');

  const campaignBeforeCompaction = await secondTab.evaluate(() => {
    const raw = localStorage.getItem('red-ledger-v2:campaign');
    return raw ? JSON.parse(raw) : undefined;
  });
  assert(campaignBeforeCompaction?.progress.completedMaps.includes('E1M8'), 'The first tab campaign branch was lost');
  assert(campaignBeforeCompaction?.progress.completedMaps.includes('E1M3'), 'The second tab campaign branch was lost');
  assert(campaignBeforeCompaction.appliedMutations.length >= 2, 'Campaign mutations were not tracked idempotently before compaction');

  await secondTab.waitForTimeout(5_500);
  const compacted = await secondTab.evaluate(() => ({
    mutationKeys: Object.keys(localStorage).filter((key) => key.startsWith('red-ledger-v2:campaign-mutation:')),
    campaign: JSON.parse(localStorage.getItem('red-ledger-v2:campaign')),
    shadowKeys: Object.keys(localStorage).filter((key) => key.startsWith('red-ledger-v2:save-shadow:')),
  }));
  assert(compacted.mutationKeys.length === 0, `Applied campaign journals were not compacted: ${compacted.mutationKeys.join(', ')}`);
  assert(compacted.campaign.appliedMutations.length === 0, 'Compacted campaign retained stale mutation ids');
  const manualShadowKeys = compacted.shadowKeys.filter((key) => key.startsWith('red-ledger-v2:save-shadow:manual-1:'));
  assert(manualShadowKeys.length === 1, `Unexpected manual save-conflict copy count: ${manualShadowKeys.length}`);
  assert(compacted.shadowKeys.length <= 8, `Save-conflict history exceeded its global bound: ${compacted.shadowKeys.length}`);
  assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
  await context.close();
  console.log('Multi-tab persistence conflict and campaign reconciliation E2E passed');
} finally {
  await browser.close();
}
