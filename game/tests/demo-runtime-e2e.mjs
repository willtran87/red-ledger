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
  if (!api) throw new Error('Development game API unavailable');
  const stableStringify = (value) => {
    if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  };
  const checksum = (value) => {
    const input = stableStringify(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };
  const sessionState = (state) => ({
    mode: state.mode,
    map: state.map,
    player: state.player,
    tally: state.tally,
    demo: state.demo,
  });
  api.setVerticalAutoAim(true);
  if (!api.startDemo()) throw new Error('Demo recording did not start');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
  document.querySelector('#game-canvas').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
  window.advanceTime(200);
  window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }));
  const demo = api.finishDemo();
  const recorded = JSON.parse(window.render_game_to_text());

  api.setVerticalAutoAim(false);
  if (!api.startDemo()) throw new Error('Second demo recording did not start');
  window.advanceTime(40);
  const autoAimOffDemo = api.finishDemo();

  api.setVerticalAutoAim(false);
  const onReplayAccepted = api.startReplay(demo);
  const onDuringPlayback = JSON.parse(window.render_game_to_text()).demo.verticalAutoAim;
  document.querySelector('#replay-pause').click();
  for (let step = 0; step < 12; step += 1) window.advanceTime(30);
  const onFinishedState = JSON.parse(window.render_game_to_text());
  api.stopReplay();
  const onRestoredAfterStop = JSON.parse(window.render_game_to_text()).demo.verticalAutoAim;

  api.setVerticalAutoAim(true);
  const offReplayAccepted = api.startReplay(autoAimOffDemo);
  const offDuringPlayback = JSON.parse(window.render_game_to_text()).demo.verticalAutoAim;
  api.stopReplay();
  const offRestoredAfterStop = JSON.parse(window.render_game_to_text()).demo.verticalAutoAim;

  api.setVerticalAutoAim(false);
  const accepted = api.playDemo(demo);
  const replayed = JSON.parse(window.render_game_to_text());
  const restoredAfterSynchronousPlayback = replayed.demo.verticalAutoAim;
  const corrupted = structuredClone(demo);
  corrupted.checksum = '00000000';
  const corruptAccepted = api.playDemo(corrupted);
  const invalidLocalDemo = structuredClone(demo);
  invalidLocalDemo.initialState.runtime.weaponState = 'ready';
  invalidLocalDemo.initialState.runtime.weaponTransition = 0;
  invalidLocalDemo.initialState.runtime.pendingWeapon = 'claim-stamp';
  const { checksum: _oldChecksum, ...unsignedInvalidLocalDemo } = invalidLocalDemo;
  invalidLocalDemo.checksum = checksum(unsignedInvalidLocalDemo);
  const beforeInvalidLocalDemo = sessionState(JSON.parse(window.render_game_to_text()));
  const invalidLocalDemoAccepted = api.startReplay(invalidLocalDemo);
  const afterInvalidLocalDemo = sessionState(JSON.parse(window.render_game_to_text()));
  const invalidCommandDemo = structuredClone(demo);
  invalidCommandDemo.frames[0].commands[0].weaponSlot = 1.5;
  const { checksum: _oldCommandChecksum, ...unsignedInvalidCommandDemo } = invalidCommandDemo;
  invalidCommandDemo.checksum = checksum(unsignedInvalidCommandDemo);
  const invalidCommandDemoAccepted = api.startReplay(invalidCommandDemo);
  const afterInvalidCommandDemo = sessionState(JSON.parse(window.render_game_to_text()));
  return {
    demo,
    autoAimOffDemo,
    recorded,
    replayed,
    accepted,
    corruptAccepted,
    invalidLocalDemoAccepted,
    beforeInvalidLocalDemo,
    afterInvalidLocalDemo,
    invalidCommandDemoAccepted,
    afterInvalidCommandDemo,
    onReplayAccepted,
    onDuringPlayback,
    onFinishedState,
    onRestoredAfterStop,
    offReplayAccepted,
    offDuringPlayback,
    offRestoredAfterStop,
    restoredAfterSynchronousPlayback,
  };
});

assert(result.accepted, 'Valid deterministic demo was rejected');
assert(!result.corruptAccepted, 'Checksum-tampered demo was accepted');
assert(!result.invalidLocalDemoAccepted, 'Structurally invalid local demo was accepted');
assert(JSON.stringify(result.beforeInvalidLocalDemo) === JSON.stringify(result.afterInvalidLocalDemo), 'Rejected local demo changed the current session');
assert(!result.invalidCommandDemoAccepted, 'Demo with an invalid command range was accepted');
assert(JSON.stringify(result.beforeInvalidLocalDemo) === JSON.stringify(result.afterInvalidCommandDemo), 'Rejected demo command changed the current session');
assert(result.demo.tickRate === 35 && result.demo.totalTicks === 7, `Expected seven 35 Hz ticks, got ${result.demo.totalTicks}`);
assert(result.demo.frames.length > 0 && result.demo.frames.length < result.demo.totalTicks, 'Recorder did not compress repeated command ticks');
assert(result.demo.frames.reduce((ticks, frame) => ticks + (frame.duration ?? 1), 0) === result.demo.totalTicks, 'Compressed demo spans do not cover every simulated tick');
assert(result.demo.frames.some((frame) => frame.commands.some((command) => command.fire)), 'Demo regression did not exercise a recorded shot');
assert(result.demo.playbackSettings?.verticalAutoAim === true, 'Recording did not capture enabled vertical auto-aim');
assert(result.autoAimOffDemo.playbackSettings?.verticalAutoAim === false, 'Recording did not capture disabled vertical auto-aim');
assert(result.onReplayAccepted && result.onDuringPlayback === true, 'Enabled recording did not override a disabled viewer preference during playback');
assert(result.onFinishedState.demo.playback.finished && result.onFinishedState.demo.verticalAutoAim === false, 'Natural replay completion did not restore the disabled viewer preference');
assert(result.onRestoredAfterStop === false, 'Stopping the completed replay changed the restored disabled viewer preference');
assert(result.offReplayAccepted && result.offDuringPlayback === false, 'Disabled recording did not override an enabled viewer preference during playback');
assert(result.offRestoredAfterStop === true, 'Stopping replay did not restore the enabled viewer preference');
assert(result.restoredAfterSynchronousPlayback === false, 'Synchronous playback did not restore the viewer preference');

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
