import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const output = new URL('../output/combat-feel/', import.meta.url);
await mkdir(output, { recursive: true });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

await page.goto(url);
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.locator('#menu:not([hidden]) #new-game').waitFor({ state: 'visible' });
await page.click('#new-game');
await page.locator('.episode-card:not(:disabled)').first().click();
await page.locator('#difficulty-actions button').nth(2).click();
await page.click('#begin-episode');

let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const frozenAt = state.tally.elapsed;
assert(state.mode === 'paused', 'Desktop entry did not freeze before pointer capture');
assert(await page.locator('#ready-overlay').isVisible(), 'Desktop entry overlay is not visible');
assert(await page.locator('#ready-overlay').getAttribute('data-input') === 'desktop', 'Entry briefing did not select desktop guidance');
const briefing = await page.locator('#entry-controls').innerText();
for (const action of ['MOVE', 'LOOK', 'FIRE', 'USE']) {
  assert(briefing.includes(action), `Entry briefing omits ${action}`);
}
for (const deferred of ['WEAPON', 'MAP']) assert(!briefing.includes(deferred), `Initial orientation is cluttered by ${deferred}`);
assert(briefing.includes('W') && briefing.includes('Mouse 1'), 'Entry briefing does not expose the active movement/fire bindings');
assert((await page.locator('#entry-objective').innerText()).includes('Red credential'), 'Initial orientation has no contextual objective');
assert(await page.locator('#ready-overlay').getAttribute('data-briefing') === 'orientation', 'Fresh E1M1 did not use initial orientation');
assert(await page.locator('#entry-field-order').isHidden(), 'Fresh E1M1 onboarding was overloaded with a returning-player field order');
await page.waitForTimeout(250);
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert(state.tally.elapsed === frozenAt, 'Simulation advanced behind the entry overlay');
await page.screenshot({ path: fileURLToPath(new URL('ready.png', output)) });

const ammoBeforeEntry = state.player.ammo.staples;
await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
await page.waitForTimeout(80);
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert(state.mode === 'playing', 'Enter File did not resume gameplay');
assert(state.player.ammo.staples === ammoBeforeEntry, 'Pointer capture spent ammunition');
assert(await page.locator('#reticle').isVisible(), 'Persistent reticle is not visible');
assert((await page.locator('#objective').textContent())?.trim().length > 0, 'Objective cue is empty');
assert(await page.locator('#reticle').getAttribute('data-weapon') === 'staple-driver', 'Reticle does not identify the equipped weapon');

assert(await page.evaluate(() => window.__redLedger.teleportNearActor('returned-mail', 3)), 'Could not stage weapon feedback target');
await page.evaluate(() => window.advanceTime(60));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const damageTarget = state.visibleActors.find((actor) => actor.id === 'returned-mail');
assert(damageTarget, 'Centered starter target is not visible before real-input fire');
const damageAmmoBefore = state.player.ammo.staples;
await page.mouse.down({ button: 'left' });
await page.waitForTimeout(55);
await page.mouse.up({ button: 'left' });
await page.evaluate(() => window.advanceTime(35));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const damagedTarget = state.visibleActors.find((actor) => actor.id === 'returned-mail');
assert(state.player.ammo.staples === damageAmmoBefore - 1, 'Real mouse fire did not consume one staple');
assert(damagedTarget && damagedTarget.health < damageTarget.health,
  'A centered real-input shot consumed ammunition without damaging its target');
const confirmedDamage = Math.round(damageTarget.health - damagedTarget.health);
assert(await page.locator('#hit-marker').getAttribute('data-label') === `HIT ${confirmedDamage}`,
  'A damaging real-input shot did not report the health actually removed');
await page.waitForTimeout(220);
assert(await page.locator('#hit-marker').getAttribute('data-label') === `HIT ${confirmedDamage}`,
  'Ordinary hit confirmation vanished before it could be read');
await page.evaluate(() => window.dispatchEvent(new CustomEvent('weapon-impact', { detail: { kind: 'wall' } })));
assert(await page.locator('#hit-marker').getAttribute('data-label') === null
  && !await page.locator('#hit-marker').evaluate((element) => element.classList.contains('active')),
  'A miss left stale damage confirmation on screen');
await page.evaluate(() => { for (let shot = 0; shot < 6; shot += 1) window.__redLedger.fire(); });
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert(state.visibleCorpses.some((actor) => actor.id === 'returned-mail'), 'Repeated centered shots did not kill the starter target');
assert(state.tally.kills === 1 && state.momentum.chain === 1, 'The shooting kill did not update tally and momentum');
assert(await page.locator('#hit-marker').getAttribute('data-label') === 'CLOSED', 'A lethal hit did not show distinct closure feedback');
await page.screenshot({ path: fileURLToPath(new URL('weapon-kill.png', output)) });

await page.evaluate(() => window.__redLedger.loadMap('E1M1'));
assert(await page.evaluate(() => window.__redLedger.teleportNearActor('returned-mail', 3)), 'Could not restage weapon feedback target');
await page.evaluate(() => window.advanceTime(60));
const reticleGapBeforeFire = await page.locator('#reticle').evaluate((element) => Number.parseFloat(element.style.getPropertyValue('--reticle-gap')));
await page.evaluate(() => window.__redLedger.fire());
await page.evaluate(() => window.advanceTime(35));
await page.waitForTimeout(10);
const fireFeedback = await page.evaluate(() => ({
  reticleGap: Number.parseFloat(document.querySelector('#reticle').style.getPropertyValue('--reticle-gap')),
  authoredMuzzle: document.querySelector('#muzzle-flash').style.backgroundImage.includes('particle-weapon-feedback'),
  hitMarkerActive: document.querySelector('#hit-marker').classList.contains('active'),
}));
assert(fireFeedback.reticleGap > reticleGapBeforeFire + .5, 'Reticle did not communicate weapon recoil/spread after firing');
assert(fireFeedback.authoredMuzzle, 'Muzzle feedback did not select an authored effect');
assert(fireFeedback.hitMarkerActive, 'Actor hit did not activate the hit marker');
await page.screenshot({ path: fileURLToPath(new URL('weapon-fire.png', output)) });

await page.evaluate(() => {
  const setting = document.querySelector('#reduced-motion');
  setting.checked = true;
  setting.dispatchEvent(new Event('change', { bubbles: true }));
  window.advanceTime(260);
});
const reducedReticleBefore = await page.locator('#reticle').evaluate((element) => Number.parseFloat(element.style.getPropertyValue('--reticle-gap')));
const reducedAmmoBefore = JSON.parse(await page.evaluate(() => window.render_game_to_text())).player.ammo.staples;
await page.evaluate(() => {
  document.querySelector('#muzzle-flash').getAnimations().forEach((animation) => animation.cancel());
  document.querySelector('#reticle').getAnimations().forEach((animation) => animation.cancel());
  window.dispatchEvent(new CustomEvent('weapon-impact', { detail: { kind: 'wall' } }));
  window.__redLedger.fire();
});
await page.waitForTimeout(40);
const reducedReticleAfter = await page.locator('#reticle').evaluate((element) => Number.parseFloat(element.style.getPropertyValue('--reticle-gap')));
assert(Math.abs(reducedReticleAfter - reducedReticleBefore) < .05, 'Reduced Motion did not suppress reticle recoil animation');
const reducedMotionFeedback = await page.evaluate(() => ({
  muzzleAnimations: document.querySelector('#muzzle-flash').getAnimations().length,
  reticleAnimations: document.querySelector('#reticle').getAnimations().length,
  muzzleOpacity: Number.parseFloat(document.querySelector('#muzzle-flash').style.opacity),
  ammo: JSON.parse(window.render_game_to_text()).player.ammo.staples,
}));
assert(reducedMotionFeedback.ammo === reducedAmmoBefore - 1, 'Reduced Motion feedback check did not actually fire the ready weapon');
assert(reducedMotionFeedback.muzzleAnimations === 0, 'Reduced Motion still animated the muzzle flash');
assert(reducedMotionFeedback.reticleAnimations === 0, 'Reduced Motion still animated the wall-impact reticle');
assert(reducedMotionFeedback.muzzleOpacity === 1, 'Reduced Motion removed the static muzzle cue');
await page.evaluate(() => {
  const setting = document.querySelector('#reduced-motion');
  setting.checked = false;
  setting.dispatchEvent(new Event('change', { bubbles: true }));
});

assert(await page.evaluate(() => window.__redLedger.teleportToDoor('red')), 'Could not stage credential door');
await page.evaluate(() => window.advanceTime(60));
assert(await page.locator('#context-prompt').isVisible(), 'Context prompt did not appear at a door');
assert(await page.locator('#context-prompt').evaluate((element) => element.classList.contains('locked')), 'Credential prompt is not visibly locked');
await page.screenshot({ path: fileURLToPath(new URL('context.png', output)) });

const openingRoster = ['returned-mail', 'desk-warden', 'ember-clerk'];
const defeatNextOpeningActor = async () => page.evaluate((actorIds) => {
  for (const actorId of actorIds) {
    if (window.__redLedger.defeatActor(actorId)) return actorId;
  }
  return null;
}, openingRoster);
const refreshMomentum = () => page.evaluate(() => window.advanceTime(30));
const waitForMomentumAnnouncement = async (label, seconds) => {
  const handle = await page.waitForFunction(({ expectedLabel, expectedSeconds }) => {
    const text = document.querySelector('#announcer').textContent;
    return text.includes(expectedLabel) && text.includes(`${expectedSeconds} seconds`) ? text : null;
  }, { expectedLabel: label, expectedSeconds: seconds });
  return handle.jsonValue();
};
let kills = 0;
while (kills < 2 && await defeatNextOpeningActor()) kills += 1;
assert(kills === 2, 'Could not stage a two-kill momentum chain');
await refreshMomentum();
await page.waitForTimeout(900);
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert(state.momentum.chain === 2 && state.momentum.score > 0, 'Momentum chain did not score consecutive kills');
assert(state.momentum.presentation.tier === 'chain' && state.momentum.presentation.windowSeconds === 4,
  'Base momentum did not expose its deterministic four-second window');
assert(await page.locator('#combat-streak').isVisible(), 'Momentum HUD did not appear');
await page.screenshot({ path: fileURLToPath(new URL('momentum.png', output)) });

assert(await defeatNextOpeningActor(), 'Could not stage the escalation threshold');
const escalationAnnouncement = await waitForMomentumAnnouncement('Escalation', 4.75);
await refreshMomentum();
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert(state.momentum.chain === 3 && state.momentum.presentation.tier === 'escalation',
  'Three-kill chain did not enter Escalation');
assert(state.momentum.presentation.windowSeconds === 4.75 && state.momentum.timer > 4.5,
  'Escalation did not earn its 4.75-second tactical window');
assert(escalationAnnouncement.includes('Escalation') && escalationAnnouncement.includes('4.75 seconds'),
  'Escalation threshold was not announced accessibly');
assert(await page.locator('#combat-streak').getAttribute('data-tier') === 'escalation',
  'Momentum HUD did not expose the Escalation visual tier');
assert((await page.locator('#combat-streak').getAttribute('aria-label')).includes('Escalation'),
  'Momentum HUD accessible name omitted the active tier');
await page.screenshot({ path: fileURLToPath(new URL('momentum-escalation.png', output)) });

for (let chain = 4; chain <= 5; chain += 1) {
  assert(await defeatNextOpeningActor(), `Could not stage momentum chain x${chain}`);
}
const redlineAnnouncement = await waitForMomentumAnnouncement('Redline', 5.5);
await refreshMomentum();
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert(state.momentum.chain === 5 && state.momentum.presentation.tier === 'redline'
  && state.momentum.presentation.windowSeconds === 5.5,
  'Five-kill chain did not enter Redline with its earned window');
assert(redlineAnnouncement.includes('Redline') && redlineAnnouncement.includes('5.5 seconds'),
  'Redline threshold was not announced accessibly');
assert(await page.locator('#combat-streak').getAttribute('data-tier') === 'redline',
  'Momentum HUD did not expose the Redline visual tier');

for (let chain = 6; chain <= 8; chain += 1) {
  assert(await defeatNextOpeningActor(), `Could not stage momentum chain x${chain}`);
}
const authorityRushAnnouncement = await waitForMomentumAnnouncement('Authority Rush', 6.25);
await refreshMomentum();
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert(state.momentum.chain === 8 && state.momentum.presentation.tier === 'authority-rush'
  && state.momentum.presentation.windowSeconds === 6.25,
  'Eight-kill chain did not enter Authority Rush with its earned window');
assert(authorityRushAnnouncement.includes('Authority Rush') && authorityRushAnnouncement.includes('6.25 seconds'),
  'Authority Rush threshold was not announced accessibly');
assert(await page.locator('#combat-streak').getAttribute('data-tier') === 'authority-rush',
  'Momentum HUD did not expose the Authority Rush visual tier');
await page.waitForTimeout(180);
await page.screenshot({ path: fileURLToPath(new URL('momentum-authority-rush.png', output)) });

await page.evaluate(() => { for (let tick = 0; tick < 16; tick += 1) window.advanceTime(250); });
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert(state.momentum.chain === 8, 'Authority Rush expired at the base four-second momentum window');
await page.evaluate(() => { for (let tick = 0; tick < 12; tick += 1) window.advanceTime(250); });
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert(state.momentum.chain === 0 && state.momentum.timer === 0, 'Momentum did not expire cleanly after its earned window');
assert(await page.locator('#combat-streak').isHidden(), 'Expired momentum HUD remained visible');

assert(state.tally.totalKills >= 35 && state.tally.totalKills <= 65,
  `Opening map fell outside the canonical 35-65 enemy budget (${state.tally.totalKills})`);
await page.evaluate(() => window.__redLedger.loadMap('E1M1'));
let cappedPickupStayed = false;
for (let attempt = 0; attempt < 8; attempt += 1) {
  assert(await page.evaluate(() => window.__redLedger.teleportToPickup('pickup', 'staples-large')), 'Ran out of staple reserves before testing the cap');
  const before = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.evaluate(() => window.advanceTime(60));
  const after = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  if (before.player.ammo.staples === 200) {
    cappedPickupStayed = after.player.ammo.staples === 200 && after.tally.items === before.tally.items
      && await page.evaluate(() => window.__redLedger.teleportToPickup('pickup', 'staples-large'));
    break;
  }
}
assert(cappedPickupStayed, 'A capped ammunition pickup was consumed instead of remaining available');
assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join(' | ')}`);
await browser.close();
console.log('Combat feel, contextual guidance, and momentum E2E passed.');
