import { chromium } from 'playwright';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const encounter = (snapshot, id) => snapshot.world.encounters.find((candidate) => candidate.id === id);
const assert = (condition, message) => { if (!condition) throw new Error(message); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.click('#new-game');
await page.locator('.episode-card').first().click();
await page.locator('#difficulty-actions button').nth(4).click();
await page.click('#begin-episode');
if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');

let snapshot = await state();
const totalKills = snapshot.tally.totalKills;
const entry = encounter(snapshot, 'entry');
assert(entry.mandatoryLive > 0 && entry.live > entry.mandatoryLive, 'Entry phase lacks optional pressure enemies');

const mandatoryEntry = await page.evaluate(() => window.__redLedger.defeatMandatory('entry'));
assert(mandatoryEntry === entry.mandatoryLive, 'Mandatory entry anchors were not defeated exactly');
snapshot = await state();
assert(encounter(snapshot, 'entry').live > 0, 'Optional entry enemies were incorrectly removed');
assert(encounter(snapshot, 'transformation').locked === 0, 'Transformation did not unlock after mandatory entry anchors');
assert(snapshot.objective.includes('control exposures'), `Objective did not advance to the active blocker: ${snapshot.objective}`);

const transformationBefore = encounter(snapshot, 'transformation');
await page.evaluate(() => window.__redLedger.defeatMandatory('transformation'));
snapshot = await state();
assert(encounter(snapshot, 'transformation').live > 0, 'Optional transformation enemies were incorrectly removed');
assert(encounter(snapshot, 'transformation').mandatoryLive === 0, 'Mandatory transformation anchors remain');
assert(await page.evaluate(() => window.__redLedger.teleportToTrigger('open-door', 'transformation-wave')), 'Transformation control was not found');
await page.evaluate(() => window.__redLedger.use());
snapshot = await state();
assert(encounter(snapshot, 'climax').locked === 0, 'Climax did not unlock after the transformation control');

await page.evaluate(() => window.__redLedger.defeatMandatory('climax'));
snapshot = await state();
assert(encounter(snapshot, 'climax').live > 0, 'Optional climax enemies were incorrectly removed');
assert(snapshot.tally.kills < totalKills, 'Test did not preserve optional survivors');
assert(await page.evaluate(() => window.__redLedger.teleportToPickup('credential', 'red')), 'Red credential was not found');
await page.evaluate(() => window.advanceTime(100));
snapshot = await state();
assert(snapshot.objective === 'Proceed to the exit', `Exit objective stayed blocked: ${snapshot.objective}`);

await page.evaluate(() => { window.__redLedger.teleportToExit(); window.__redLedger.use(); });
snapshot = await state();
assert(snapshot.mode === 'intermission', 'Map exit remained locked by optional survivors');
assert(snapshot.tally.kills < totalKills, 'Intermission unexpectedly reports a full clear');
assert(transformationBefore.live > transformationBefore.mandatoryLive, 'Transformation phase lacked optional pressure enemies');
assert(errors.length === 0, `Console errors: ${errors.join(' | ')}`);

console.log('Optional encounter progression E2E passed');
await browser.close();
