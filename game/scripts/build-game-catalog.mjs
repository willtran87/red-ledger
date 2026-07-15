import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.resolve(root, '..', 'assets');
const sourcePath = path.join(assetRoot, 'data', 'runtime-assets.json');
const outputPath = path.join(assetRoot, 'data', 'game-assets.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const sections = ['enemies', 'bosses', 'weapons', 'pickups', 'props', 'skies'];

for (const section of sections) {
  if (!source[section] || typeof source[section] !== 'object') throw new Error(`Runtime catalog is missing ${section}`);
}

const file = (entry) => ({ url: entry.url });
const files = (entries) => entries.map(file);
const fileRecord = (record) => Object.fromEntries(Object.entries(record).map(([key, entries]) => [key, files(entries)]));
const actors = (record) => Object.fromEntries(Object.entries(record).map(([id, actor]) => [id, {
  states: Object.fromEntries(Object.entries(actor.states).map(([state, value]) => [state, {
    angles: fileRecord(value.angles),
  }])),
}]));

const catalog = {
  enemies: actors(source.enemies),
  bosses: actors(source.bosses),
  weapons: Object.fromEntries(Object.entries(source.weapons).map(([id, weapon]) => [id, {
    view: fileRecord(weapon.view),
    pickup: fileRecord(weapon.pickup),
  }])),
  pickups: Object.fromEntries(Object.entries(source.pickups).map(([id, pickup]) => [id, {
    base: file(pickup.base),
    shine: files(pickup.shine),
  }])),
  props: Object.fromEntries(Object.entries(source.props).map(([id, prop]) => [id, {
    states: Object.fromEntries(Object.entries(prop.states).map(([state, value]) => [state, file(value)])),
  }])),
  skies: Object.fromEntries(Object.entries(source.skies).map(([id, value]) => [id, file(value)])),
};
fs.writeFileSync(outputPath, `${JSON.stringify(catalog)}\n`);
console.log(`Projected ${sections.length} runtime sections to ${path.relative(root, outputPath)}`);
