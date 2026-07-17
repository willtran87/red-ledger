import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const newestAutosave = () => page.evaluate(() => Object.keys(localStorage)
  .filter((key) => key.startsWith('red-ledger-v2:save:autosave-'))
  .flatMap((key) => {
    try {
      const envelope = JSON.parse(localStorage.getItem(key));
      return [{ key, sequence: envelope.metadata.sequence, state: envelope.state }];
    } catch {
      return [];
    }
  })
  .sort((left, right) => right.sequence - left.sequence)[0]);

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#new-game');
  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-actions button').nth(2).click();
  await page.click('#begin-episode');
  if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

  const entry = await newestAutosave();
  assert(entry?.state.mapId === 'E1M1', 'Map entry did not create an E1M1 recovery checkpoint');
  assert(entry.state.tally.elapsed === 0, `Map-entry recovery was not anchored at zero: ${entry.state.tally.elapsed}`);

  const queued = await page.evaluate(() => {
    const newestAutosaveSequence = () => Math.max(-1, ...Object.keys(localStorage)
      .filter((key) => key.startsWith('red-ledger-v2:save:autosave-'))
      .map((key) => JSON.parse(localStorage.getItem(key)).metadata.sequence));
    const api = window.__redLedger;
    if (!api.selectWeapon('claim-stamp')) throw new Error('Could not begin the first weapon switch');
    window.advanceTime(115);
    if (!api.selectWeapon('staple-driver')) throw new Error('Could not queue a weapon while raising');
    window.dispatchEvent(new Event('pagehide'));
    const firstPagehideSequence = newestAutosaveSequence();
    window.dispatchEvent(new Event('pagehide'));
    return {
      snapshot: JSON.parse(window.render_game_to_text()),
      firstPagehideSequence,
      duplicatePagehideSequence: newestAutosaveSequence(),
    };
  });
  assert(queued.snapshot.player.weapon === 'claim-stamp', `First weapon did not enter its raise phase: ${queued.snapshot.player.weapon}`);
  assert(queued.duplicatePagehideSequence === queued.firstPagehideSequence, 'Duplicate pagehide rotated the same elapsed tick twice');

  const queuedSave = await newestAutosave();
  assert(queuedSave.sequence > entry.sequence, 'A meaningful pagehide did not rotate the autosave');
  assert(queuedSave.state.runtime.weaponState === 'raising', `Pagehide missed the raising state: ${queuedSave.state.runtime.weaponState}`);
  assert(queuedSave.state.runtime.pendingWeapon === 'staple-driver', `Pagehide missed the queued target: ${queuedSave.state.runtime.pendingWeapon}`);
  await page.evaluate(() => window.__redLedger.pause());
  await page.click('#load-game');
  const queuedSlotName = `Autosave ${queuedSave.key.match(/autosave-(\d+)$/)?.[1] ?? ''}`;
  const newestAutomatic = page.locator('#automatic-slot-list .slot-row').filter({ hasText: queuedSlotName });
  assert(await newestAutomatic.count() === 1, `Could not identify the queued recovery slot ${queuedSlotName}`);
  assert(await newestAutomatic.locator('.slot-action').isEnabled(), 'Queued autosave was not accepted by strict validation');
  await newestAutomatic.locator('.slot-action').click();
  assert((await state()).mode === 'paused', 'Automatic queued-state restore did not remain paused');
  await page.click('#resume-game');
  await page.waitForTimeout(100);
  if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
  await page.evaluate(() => {
    window.advanceTime(250);
    window.advanceTime(250);
  });
  assert((await state()).player.weapon === 'staple-driver', 'Restored raising state did not lower into its queued target');

  await page.evaluate(() => window.__redLedger.defeatAll());
  const encounterCheckpoint = await newestAutosave();
  const periodicDeadline = encounterCheckpoint.state.tally.elapsed + 60;
  const periodicProbe = await page.evaluate(({ deadline, priorSequence }) => {
    const autosaves = () => Object.keys(localStorage)
      .filter((key) => key.startsWith('red-ledger-v2:save:autosave-'))
      .map((key) => JSON.parse(localStorage.getItem(key)))
      .sort((left, right) => right.metadata.sequence - left.metadata.sequence);
    const newestAutosaveSequence = () => autosaves()[0]?.metadata.sequence ?? -1;
    const elapsed = () => JSON.parse(window.render_game_to_text()).tally.elapsed;
    let coarseSteps = 0;
    while (elapsed() < deadline - 1 && coarseSteps < 300) {
      window.advanceTime(250);
      coarseSteps += 1;
    }
    let singleTickSteps = 0;
    while (elapsed() < deadline - .04 && singleTickSteps < 80) {
      window.advanceTime(29);
      singleTickSteps += 1;
    }
    const beforeDeadline = {
      elapsed: elapsed(),
      sequence: newestAutosaveSequence(),
      coarseSteps,
      singleTickSteps,
    };
    let crossingSteps = 0;
    while (newestAutosaveSequence() === priorSequence
      && elapsed() < deadline + 1
      && crossingSteps < 80) {
      window.advanceTime(29);
      crossingSteps += 1;
    }
    const periodicSequence = newestAutosaveSequence();
    const periodicSaveElapsed = autosaves()[0]?.state.tally.elapsed ?? -1;
    const periodicElapsed = elapsed();
    if (periodicSequence === priorSequence) {
      return {
        beforeDeadline,
        periodicSequence,
        pagehideSequence: periodicSequence,
        periodicSaveElapsed,
        pagehideSaveElapsed: periodicSaveElapsed,
        periodicElapsed,
        crossingSteps,
      };
    }
    window.dispatchEvent(new Event('pagehide'));
    return {
      beforeDeadline,
      periodicSequence,
      pagehideSequence: newestAutosaveSequence(),
      periodicSaveElapsed,
      pagehideSaveElapsed: autosaves()[0]?.state.tally.elapsed ?? -1,
      periodicElapsed,
      crossingSteps,
    };
  }, { deadline: periodicDeadline, priorSequence: encounterCheckpoint.sequence });
  assert(periodicProbe.beforeDeadline.coarseSteps < 300 && periodicProbe.beforeDeadline.singleTickSteps < 80,
    `Pre-deadline recovery probe exceeded its bounded steps: ${JSON.stringify(periodicProbe)}`);
  assert(periodicProbe.beforeDeadline.elapsed < periodicDeadline,
    `Pre-deadline recovery probe crossed its deadline: ${JSON.stringify(periodicProbe)}`);
  assert(periodicProbe.beforeDeadline.sequence === encounterCheckpoint.sequence,
    `Periodic recovery fired before 60 simulation seconds: ${JSON.stringify(periodicProbe)}`);
  assert(periodicProbe.crossingSteps < 80,
    `Periodic recovery crossing probe exceeded its bounded steps: ${JSON.stringify(periodicProbe)}`);
  const periodic = await newestAutosave();
  assert(periodicProbe.periodicSequence > encounterCheckpoint.sequence,
    `Periodic recovery did not fire after 60 simulation seconds: ${JSON.stringify(periodicProbe)}`);
  assert(periodic.state.tally.elapsed >= periodicDeadline, 'Periodic recovery saved before its deterministic deadline');
  assert(periodicProbe.pagehideSequence === periodicProbe.periodicSequence,
    `Pagehide duplicated a periodic checkpoint on the same tick: ${JSON.stringify(periodicProbe)}`);
  await page.evaluate(() => window.advanceTime(35));
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const lifecycle = await newestAutosave();
  assert(lifecycle.sequence > periodic.sequence, 'Pagehide did not preserve post-periodic progress');
  await page.evaluate(() => window.__redLedger.pause());
  const pausedSequence = (await newestAutosave()).sequence;
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert((await newestAutosave()).sequence === pausedSequence, 'Paused pagehide wrote outside ordinary gameplay');

  assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
  console.log('Recovery checkpoint timing, lifecycle, validation, and queued restore E2E passed');
} finally {
  await browser.close();
}
