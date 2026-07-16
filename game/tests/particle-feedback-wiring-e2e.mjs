import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').first().click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

const move = async (code) => page.evaluate((movementCode) => {
  const before = JSON.parse(window.render_game_to_text()).player;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: movementCode }));
  window.advanceTime(250);
  window.advanceTime(250);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: movementCode }));
  const after = JSON.parse(window.render_game_to_text());
  return { distance: Math.hypot(after.player.x - before.x, after.player.z - before.z), particles: after.combatEffects.particles };
}, code);

let movement;
let movementCode;
for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
  await page.evaluate(() => window.__redLedger.loadMap('E1M1'));
  const result = await move(code);
  if (result.distance < 3.1) continue;
  movement = result;
  movementCode = code;
  break;
}
assert(movement && movement.particles.byKind.fiber > 0, 'Distance-based carpet movement emitted no restrained fiber step');
assert(movement.particles.byKind.fiber <= 2, `One short stride emitted excessive movement particles: ${movement.particles.byKind.fiber}`);

await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('accessibility-settings-change', { detail: { reducedEffects: true, flashEffects: true } }));
  window.__redLedger.loadMap('E1M1');
});
const reducedMovement = await move(movementCode);
assert(reducedMovement.distance >= 3.1, 'Reduced-effects movement fixture did not traverse the same route');
assert(reducedMovement.particles.byKind.fiber === 0, 'Reduced Effects retained ambient movement particles');
await page.evaluate(() => window.dispatchEvent(new CustomEvent('accessibility-settings-change', { detail: { reducedEffects: false, flashEffects: true } })));

await page.evaluate(() => {
  window.__expiredPowerups = [];
  window.addEventListener('powerup-expired', (event) => window.__expiredPowerups.push(event.detail), { once: true });
  window.__redLedger.loadMap('E3M1');
  window.__redLedger.defeatEncounter('entry');
  window.__redLedger.defeatEncounter('transformation');
  if (!window.__redLedger.teleportToTrigger('open-door')) throw new Error('E3M1 route mechanism missing');
  window.__redLedger.use();
  window.__redLedger.defeatAll();
  if (!window.__redLedger.teleportToPickup('pickup', 'rapid-authority')) throw new Error('Rapid Authority pickup missing');
  window.advanceTime(35);
  for (let index = 0; index < 140 && window.__expiredPowerups.length === 0; index += 1) window.advanceTime(250);
});
const expiration = await page.evaluate(() => window.__expiredPowerups[0]);
assert(expiration?.powerup === 'rapid' && expiration?.kind === 'authority', `Timed status expired without its authored cue: ${JSON.stringify(expiration)}`);

await page.evaluate(() => {
  window.__redLedger.loadMap('E1M3');
  window.__redLedger.defeatEncounter('entry');
  window.__redLedger.defeatEncounter('transformation');
  if (!window.__redLedger.teleportToTrigger('raise-floor')) throw new Error('Raise-floor mechanism missing');
  window.__redLedger.use();
  for (let index = 0; index < 40; index += 1) {
    window.advanceTime(100);
    const movers = JSON.parse(window.render_game_to_text()).world.sectorMovers;
    if (movers.length > 0 && movers.every((mover) => Math.abs(mover.height - mover.targetHeight) < .001)) break;
  }
});
const settled = await state();
assert(settled.world.sectorMovers.length > 0 && settled.world.sectorMovers.every((mover) => Math.abs(mover.height - mover.targetHeight) < .001), 'Sector movement did not settle');
assert(['fiber', 'concrete', 'water', 'metal', 'toner', 'wax', 'scan'].some((kind) => settled.combatEffects.particles.byKind[kind] > 0),
  `Settled sector emitted no material endpoint punctuation: ${JSON.stringify(settled.combatEffects.particles.byKind)}`);

await page.evaluate(() => {
  window.__redLedger.loadMap('E1M1');
  window.__redLedger.defeatMandatory('entry');
});
const checkpoint = await state();
assert(checkpoint.world.triggered.includes('encounter-complete:entry'), 'Encounter completion was not persisted idempotently');
assert(checkpoint.combatEffects.particles.byKind.momentum > 0, 'Encounter checkpoint omitted its pooled completion cue');

await page.evaluate(() => {
  window.__redLedger.loadMap('E1M1');
  if (!window.__redLedger.teleportToTrigger('reveal-secret')) throw new Error('Secret clue trigger missing');
  window.__redLedger.use();
});
const secret = await state();
assert(secret.message.startsWith('Anomaly confirmed: ') && secret.message !== 'Reveal Secret', `Secret clue prose was overwritten: ${secret.message}`);

await page.evaluate(() => {
  window.__redLedger.loadMap('E2M1');
  if (window.__redLedger.teleportToSecretReward('e2m1-secret-3')) throw new Error('Concealed weapon secret was collectible before reveal');
  if (!window.__redLedger.teleportToTrigger('reveal-secret', 'e2m1-secret-3')) throw new Error('Weapon-secret clue trigger missing');
  window.__redLedger.use();
  window.advanceTime(35);
  if (!window.__redLedger.teleportToSecretReward('e2m1-secret-3')) throw new Error('Revealed Audit Repeater secret was not spawned at its concealed cell');
  window.advanceTime(250);
  window.advanceTime(250);
  window.advanceTime(250);
});
const weaponSecret = await state();
assert(weaponSecret.player.weapon === 'audit-repeater', 'Revealed secret weapon did not enter and select from the player inventory');

await page.evaluate(() => {
  window.__redLedger.loadMap('E1M8');
  if (!window.__redLedger.damageActor('regional-director', 700)) throw new Error('Regional Director could not be damaged into summon phase');
  if (!window.__redLedger.activateActor('regional-director')) throw new Error('Regional Director could not be activated');
  if (!window.__redLedger.teleportNearActor('regional-director', 20)) throw new Error('Regional Director sightline missing');
});
const summonBaseline = await state();
let summon;
for (let index = 0; index < 180; index += 1) {
  await page.evaluate(() => window.advanceTime(40));
  const snapshot = await state();
  if (!snapshot.combatEffects.semanticCues.some((cue) => cue.kind === 'rejection')) continue;
  summon = snapshot;
  break;
}
assert(summon, 'Enemy summon never produced its threat-semantic arrival cue');
assert(summon.tally.totalKills === summonBaseline.tally.totalKills,
  `Dynamic summons changed the authored kill denominator (${summonBaseline.tally.totalKills} -> ${summon.tally.totalKills})`);
assert(summon.combatEffects.particles.byKind.toner > 0, 'Enemy summon omitted toner threat material');
assert(summon.combatEffects.particles.byKind.approval === 0, 'Enemy summon retained reward-like approval particles');

assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);
console.log('Particle feedback wiring E2E passed');
await browser.close();
