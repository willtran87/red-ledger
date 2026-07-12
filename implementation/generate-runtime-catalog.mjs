import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const implementationDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(implementationDir, '..');
const runtimeRoot = join(repoRoot, 'assets', 'public_runtime');
const outputPath = join(repoRoot, 'assets', 'data', 'runtime-assets.json');
const assetBaseUrl = '/public_runtime';
const sourceBasePath = 'assets/public_runtime';
const checkOnly = process.argv.includes('--check');

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const byName = (a, b) => collator.compare(a, b);
const toPosix = (value) => value.replaceAll('\\', '/');

function walkFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => byName(a.name, b.name))) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function objectFromEntries(entries) {
  return Object.fromEntries(entries.sort(([a], [b]) => byName(a, b)));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function relativeRuntimePath(absolutePath) {
  return toPosix(relative(runtimeRoot, absolutePath));
}

function assetKey(relativePath) {
  const extension = extname(relativePath).slice(1).toLowerCase();
  const stem = relativePath
    .replace(/\.[^.]+$/, '')
    .split('/')
    .map((part) => part.replaceAll('_', '-'))
    .join('.');
  return extension ? `${stem}.${extension}` : stem;
}

function assetRef(relativePath, details = {}) {
  const normalized = toPosix(relativePath);
  return {
    key: assetKey(normalized),
    url: `${assetBaseUrl}/${normalized}`,
    sourcePath: `${sourceBasePath}/${normalized}`,
    ...details,
  };
}

function dimensionsMap(manifestName) {
  const manifestPath = join(repoRoot, 'manifests', manifestName);
  if (!existsSync(manifestPath)) return new Map();
  const data = readJson(manifestPath);
  if (!Array.isArray(data)) return new Map();
  return new Map(
    data
      .filter((entry) => entry.file && Array.isArray(entry.size))
      .map((entry) => [
        toPosix(entry.file).replace(/^assets\/public_runtime\//, ''),
        { size: entry.size, ...(entry.pivot ? { pivot: entry.pivot } : {}) },
      ]),
  );
}

const dimensions = new Map([
  ...dimensionsMap('weapons-pickups-ui-runtime-metadata.json'),
  ...dimensionsMap('effect-runtime-metadata.json'),
  ...dimensionsMap('overlay-runtime-metadata.json'),
  ...dimensionsMap('texture-runtime-metadata.json'),
  ...dimensionsMap('missing-pickup-runtime-metadata.json'),
]);

function refForAbsolute(absolutePath, details = {}) {
  const runtimePath = relativeRuntimePath(absolutePath);
  return assetRef(runtimePath, { ...(dimensions.get(runtimePath) ?? {}), ...details });
}

function groupActorFrames(frameRows, actorDirectory) {
  const grouped = new Map();
  for (const row of frameRows) {
    const state = row.state ?? 'unknown';
    const angle = row.angle ?? 'F';
    if (!grouped.has(state)) grouped.set(state, new Map());
    const angleMap = grouped.get(state);
    if (!angleMap.has(angle)) angleMap.set(angle, []);
    const absolute = join(actorDirectory, row.file);
    if (!existsSync(absolute)) throw new Error(`Actor metadata references a missing file: ${absolute}`);
    angleMap.get(angle).push(refForAbsolute(absolute, { frame: Number(row.frame ?? 0), angle }));
  }

  return objectFromEntries(
    [...grouped].map(([state, angleMap]) => [
      state,
      {
        angles: objectFromEntries(
          [...angleMap].map(([angle, frames]) => [
            angle,
            frames.sort((a, b) => a.frame - b.frame || byName(a.url, b.url)),
          ]),
        ),
      },
    ]),
  );
}

function representativeFrames(states) {
  const result = {};
  const roles = {
    idle: ['idle', 'sealed'],
    walk: ['walk', 'run', 'gate-open'],
    attack: ['attack', 'canister', 'salvo', 'dual', 'predict', 'summon', 'core', 'left-emit', 'right-emit'],
    pain: ['pain', 'damage'],
    death: ['death', 'collapse', 'destroy'],
    corpse: ['corpse', 'debris'],
  };
  for (const [role, candidates] of Object.entries(roles)) {
    const selectedState = candidates.find((candidate) => states[candidate]);
    const angles = selectedState ? states[selectedState].angles : null;
    if (!angles) continue;
    const preferredAngle = angles.F ? 'F' : Object.keys(angles).sort(byName)[0];
    const frames = angles[preferredAngle];
    if (frames?.length) result[role] = { ...frames[0], sourceState: selectedState };
  }
  return result;
}

function buildActors(category) {
  const categoryRoot = join(runtimeRoot, category);
  return objectFromEntries(
    readdirSync(categoryRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(byName)
      .map((slug) => {
        const actorDirectory = join(categoryRoot, slug);
        const metadataFile = readdirSync(actorDirectory)
          .filter((file) => file.endsWith('.json'))
          .sort(byName)[0];
        if (!metadataFile) throw new Error(`Missing actor metadata in ${actorDirectory}`);
        const metadata = readJson(join(actorDirectory, metadataFile));
        const states = groupActorFrames(metadata.frames ?? [], actorDirectory);
        const pngCount = walkFiles(actorDirectory).filter((file) => extname(file).toLowerCase() === '.png').length;
        const metadataFrameCount = Object.values(states).reduce(
          (total, state) => total + Object.values(state.angles).reduce((sum, frames) => sum + frames.length, 0),
          0,
        );
        if (metadataFrameCount !== pngCount) {
          throw new Error(`${category}/${slug}: metadata has ${metadataFrameCount} frames but disk has ${pngCount} PNGs`);
        }
        return [
          slug,
          {
            id: metadata.asset_id ?? `${category === 'enemies' ? 'enemy' : 'boss'}.${slug}`,
            canvas: metadata.canvas ?? null,
            pivot: metadata.pivot ?? null,
            palette: metadata.palette ?? null,
            authoredAngles: metadata.authored_angles ?? metadata.angles ?? [],
            runtimeMirrors: metadata.runtime_mirrors ?? {},
            frameCount: metadataFrameCount,
            states,
            representative: representativeFrames(states),
          },
        ];
      }),
  );
}

function parseStateAngleFrame(basename, prefixPatterns = []) {
  let stem = basename.replace(/\.png$/i, '');
  for (const prefix of prefixPatterns) stem = stem.replace(prefix, '');
  const match = stem.match(/^(.+)_([FBLR]{1,2})_(\d+)(?:_v\d+)?$/i);
  if (!match) return { state: stem, angle: null, frame: 0 };
  return { state: match[1], angle: match[2].toUpperCase(), frame: Number(match[3]) };
}

function groupStateFiles(files, parser) {
  const groups = new Map();
  for (const file of files.sort(byName)) {
    const parsed = parser(file);
    if (!groups.has(parsed.state)) groups.set(parsed.state, []);
    groups.get(parsed.state).push(refForAbsolute(file, { angle: parsed.angle, frame: parsed.frame }));
  }
  return objectFromEntries(
    [...groups].map(([state, frames]) => [
      state,
      frames.sort((a, b) => a.frame - b.frame || byName(a.url, b.url)),
    ]),
  );
}

function buildWeapons() {
  const viewRoot = join(runtimeRoot, 'weapons', 'view');
  const pickupRoot = join(runtimeRoot, 'weapons', 'pickups');
  const slugs = readdirSync(viewRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(byName);

  return objectFromEntries(
    slugs.map((slug) => {
      const viewFiles = walkFiles(join(viewRoot, slug)).filter((file) => extname(file).toLowerCase() === '.png');
      const pickupDirectory = join(pickupRoot, slug);
      const pickupFiles = existsSync(pickupDirectory)
        ? walkFiles(pickupDirectory).filter((file) => extname(file).toLowerCase() === '.png')
        : [];
      return [
        slug,
        {
          view: groupStateFiles(viewFiles, (file) =>
            parseStateAngleFrame(file.split(/[\\/]/).at(-1), [new RegExp(`^weapon_${slug}_`)]),
          ),
          pickup: groupStateFiles(pickupFiles, (file) =>
            parseStateAngleFrame(file.split(/[\\/]/).at(-1), [
              new RegExp(`^pickup_weapon-${slug}_`),
              new RegExp(`^weapon_${slug}_`),
            ]),
          ),
        },
      ];
    }),
  );
}

function buildPickups() {
  const pickupsRoot = join(runtimeRoot, 'pickups');
  const pickupFamilies = new Map();
  for (const file of readdirSync(pickupsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => join(pickupsRoot, entry.name))
    .sort(byName)) {
    const match = file.split(/[\\/]/).at(-1).match(/^pickup_(.+)_(idle|shine)_F_(\d+)\.png$/i);
    if (!match) throw new Error(`Unrecognized root pickup filename: ${file}`);
    const [, slug, state, frameText] = match;
    if (!pickupFamilies.has(slug)) pickupFamilies.set(slug, { base: null, shine: [] });
    const family = pickupFamilies.get(slug);
    const ref = refForAbsolute(file, { frame: Number(frameText) });
    if (state.toLowerCase() === 'idle') family.base = ref;
    else family.shine.push(ref);
  }

  for (const slug of readdirSync(pickupsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(byName)) {
    const files = walkFiles(join(pickupsRoot, slug)).filter((file) => extname(file).toLowerCase() === '.png');
    const base = files.find((file) => file.split(/[\\/]/).at(-1) === 'base.png') ?? files[0];
    const shine = files.filter((file) => /shine/i.test(file)).sort(byName).map((file, frame) => refForAbsolute(file, { frame }));
    pickupFamilies.set(slug, { base: refForAbsolute(base), shine });
  }

  for (const [slug, family] of pickupFamilies) {
    if (!family.base) throw new Error(`Pickup ${slug} has no base/idle frame`);
    family.shine.sort((a, b) => a.frame - b.frame || byName(a.url, b.url));
  }
  return objectFromEntries([...pickupFamilies]);
}

function buildProps() {
  const propsRoot = join(runtimeRoot, 'props');
  return objectFromEntries(
    readdirSync(propsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(byName)
      .map((slug) => {
        const directory = join(propsRoot, slug);
        const metadataFile = readdirSync(directory).filter((file) => file.endsWith('.json')).sort(byName)[0];
        const metadata = metadataFile ? readJson(join(directory, metadataFile)) : {};
        const files = walkFiles(directory).filter((file) => extname(file).toLowerCase() === '.png');
        const states = objectFromEntries(
          files.map((file) => {
            const stem = file.split(/[\\/]/).at(-1).replace(/\.png$/i, '');
            const state = stem.replace(new RegExp(`^prop_${slug}_`), '');
            return [state, refForAbsolute(file)];
          }),
        );
        return [slug, { ...metadata, states }];
      }),
  );
}

function buildTextures() {
  const texturesRoot = join(runtimeRoot, 'textures');
  const categories = readdirSync(texturesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(byName);
  return objectFromEntries(
    categories.map((category) => {
      const categoryRoot = join(texturesRoot, category);
      const groupedFamilies = new Map();
      const families = readdirSync(categoryRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(byName);
      for (const family of families) {
        const files = walkFiles(join(categoryRoot, family)).filter((file) => extname(file).toLowerCase() === '.png');
        groupedFamilies.set(
          family,
          objectFromEntries(
            files.map((file) => {
              const stem = file.split(/[\\/]/).at(-1).replace(/\.png$/i, '');
              const variant = stem
                .replace(new RegExp(`^(?:texture|flat|decal|door|switch)_${family}_`), '')
                .replace(new RegExp(`^${family}_`), '');
              return [variant, refForAbsolute(file)];
            }),
          ),
        );
      }

      const rootFiles = readdirSync(categoryRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
        .map((entry) => join(categoryRoot, entry.name))
        .sort(byName);
      for (const file of rootFiles) {
        const stem = file.split(/[\\/]/).at(-1).replace(/\.png$/i, '');
        let family;
        let variant;
        if (category === 'decals') {
          const match = stem.match(/^decal_(.+)_(brass|cyan|dark|ivory|neutral|red|worn-[123])$/);
          if (!match) throw new Error(`Unrecognized decal filename: ${file}`);
          [, family, variant] = match;
        } else {
          const match = stem.match(/^(.*)_(clean_\d+)$/);
          if (!match) throw new Error(`Unrecognized root texture filename: ${file}`);
          [, family, variant] = match;
        }
        if (!groupedFamilies.has(family)) groupedFamilies.set(family, {});
        if (groupedFamilies.get(family)[variant]) variant = `legacy-${variant}`;
        groupedFamilies.get(family)[variant] = refForAbsolute(file);
      }
      return [category, objectFromEntries([...groupedFamilies])];
    }),
  );
}

function buildDoorAndSwitchFamilies() {
  const metadataPath = join(repoRoot, 'manifests', 'door-switch-sky-runtime-metadata.json');
  const data = readJson(metadataPath);
  const result = { doors: {}, switches: {} };
  for (const family of data.families ?? []) {
    if (family.kind !== 'door' && family.kind !== 'switch') continue;
    const target = family.kind === 'door' ? result.doors : result.switches;
    target[family.slug] = {
      size: family.size,
      states: objectFromEntries(
        family.states.map((state, index) => {
          const runtimePath = toPosix(family.outputs[index]).replace(/^assets\/public_runtime\//, '');
          return [state, assetRef(runtimePath, { size: family.size })];
        }),
      ),
    };
  }
  const mechanismRoot = join(runtimeRoot, 'textures', 'doors');
  for (const entry of readdirSync(mechanismRoot, { withFileTypes: true }).filter((item) => item.isDirectory())) {
    const files = walkFiles(join(mechanismRoot, entry.name)).filter((file) => extname(file).toLowerCase() === '.png');
    if (!files.length) continue;
    const firstName = files[0].split(/[\\/]/).at(-1);
    const kind = firstName.startsWith('switch_') ? 'switch' : firstName.startsWith('door_') ? 'door' : null;
    if (!kind) continue;
    const target = kind === 'door' ? result.doors : result.switches;
    if (target[entry.name]) continue;
    const prefix = new RegExp(`^${kind}_${entry.name}_`);
    target[entry.name] = {
      size: dimensions.get(relativeRuntimePath(files[0]))?.size ?? null,
      states: objectFromEntries(
        files.map((file) => {
          const state = file.split(/[\\/]/).at(-1).replace(/\.png$/i, '').replace(prefix, '');
          return [state, refForAbsolute(file)];
        }),
      ),
    };
  }
  result.doors = objectFromEntries(Object.entries(result.doors));
  result.switches = objectFromEntries(Object.entries(result.switches));
  return result;
}

function parseEffectFrame(file, family) {
  const stem = file.split(/[\\/]/).at(-1).replace(/\.png$/i, '').replace(new RegExp(`^fx_${family}_`), '');
  const directional = stem.match(/^(.*?)(?:_)?([FBLR]{1,2})_(\d+)$/i);
  if (directional) {
    return { state: directional[1] || 'active', angle: directional[2].toUpperCase(), frame: Number(directional[3]) };
  }
  const numbered = stem.match(/^(.*?)(?:[_-])?(\d+)$/);
  if (numbered) return { state: numbered[1] || 'active', angle: null, frame: Number(numbered[2]) };
  return { state: stem || 'active', angle: null, frame: 0 };
}

function buildEffects() {
  const effectsRoot = join(runtimeRoot, 'effects');
  return objectFromEntries(
    readdirSync(effectsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(byName)
      .map((family) => {
        const files = walkFiles(join(effectsRoot, family)).filter((file) => extname(file).toLowerCase() === '.png');
        const frames = files
          .map((file) => {
            const parsed = parseEffectFrame(file, family);
            return refForAbsolute(file, parsed);
          })
          .sort((a, b) => byName(a.state, b.state) || byName(a.angle ?? '', b.angle ?? '') || a.frame - b.frame || byName(a.url, b.url));
        return [family, { frameCount: frames.length, frames }];
      }),
  );
}

function buildSkies() {
  return objectFromEntries(
    walkFiles(join(runtimeRoot, 'skies'))
      .filter((file) => extname(file).toLowerCase() === '.png')
      .map((file) => {
        const slug = file.split(/[\\/]/).at(-1).replace(/^sky_/, '').replace(/\.png$/i, '');
        return [slug, refForAbsolute(file)];
      }),
  );
}

function buildUi() {
  const uiRoot = join(runtimeRoot, 'ui');
  const entries = walkFiles(uiRoot).filter((file) => extname(file).toLowerCase() === '.png');
  const groups = new Map();
  for (const file of entries) {
    const relativePath = toPosix(relative(uiRoot, file));
    const segments = relativePath.split('/');
    const group = segments.length > 1 ? segments[0] : 'screens';
    if (!groups.has(group)) groups.set(group, {});
    const name = segments.at(-1).replace(/\.png$/i, '');
    groups.get(group)[name] = refForAbsolute(file);
  }
  return objectFromEntries([...groups].map(([group, files]) => [group, objectFromEntries(Object.entries(files))]));
}

function buildFonts() {
  const fontsRoot = join(runtimeRoot, 'fonts');
  const names = [...new Set(walkFiles(fontsRoot).map((file) => file.split(/[\\/]/).at(-1).replace(/\.[^.]+$/, '')))].sort(byName);
  return objectFromEntries(
    names.map((name) => {
      const image = join(fontsRoot, `${name}.png`);
      const data = join(fontsRoot, `${name}.json`);
      return [
        name,
        {
          image: existsSync(image) ? refForAbsolute(image) : null,
          data: existsSync(data) ? refForAbsolute(data) : null,
        },
      ];
    }),
  );
}

function buildFileIndex() {
  return walkFiles(runtimeRoot).map((file) => {
    const runtimePath = relativeRuntimePath(file);
    return assetRef(runtimePath, {
      type: extname(file).toLowerCase().replace('.', ''),
      bytes: statSync(file).size,
      ...(dimensions.get(runtimePath) ?? {}),
    });
  });
}

function countValues(value) {
  if (Array.isArray(value)) return value.length;
  return value && typeof value === 'object' ? Object.keys(value).length : 0;
}

function countStateArrays(states) {
  return Object.values(states).reduce((total, frames) => total + frames.length, 0);
}

function buildCatalog() {
  const enemies = buildActors('enemies');
  const bosses = buildActors('bosses');
  const weapons = buildWeapons();
  const pickups = buildPickups();
  const props = buildProps();
  const textures = buildTextures();
  const mechanisms = buildDoorAndSwitchFamilies();
  const effects = buildEffects();
  const skies = buildSkies();
  const ui = buildUi();
  const fonts = buildFonts();
  const files = buildFileIndex();
  const pngCount = files.filter((file) => file.type === 'png').length;
  const pngByCategory = objectFromEntries(
    [...files.filter((file) => file.type === 'png').reduce((groups, file) => {
      const category = file.sourcePath.slice(`${sourceBasePath}/`.length).split('/')[0];
      groups.set(category, (groups.get(category) ?? 0) + 1);
      return groups;
    }, new Map())],
  );
  const structuredPngByCategory = {
    enemies: Object.values(enemies).reduce((total, actor) => total + actor.frameCount, 0),
    bosses: Object.values(bosses).reduce((total, actor) => total + actor.frameCount, 0),
    weapons: Object.values(weapons).reduce(
      (total, weapon) => total + countStateArrays(weapon.view) + countStateArrays(weapon.pickup),
      0,
    ),
    pickups: Object.values(pickups).reduce((total, pickup) => total + 1 + pickup.shine.length, 0),
    effects: Object.values(effects).reduce((total, effect) => total + effect.frameCount, 0),
    textures: Object.values(textures).reduce(
      (total, category) => total + Object.values(category).reduce((sum, family) => sum + Object.keys(family).length, 0),
      0,
    ),
    props: Object.values(props).reduce((total, prop) => total + Object.keys(prop.states).length, 0),
    skies: Object.keys(skies).length,
    ui: Object.values(ui).reduce((total, group) => total + Object.keys(group).length, 0),
    fonts: Object.values(fonts).filter((font) => font.image).length,
  };

  return {
    schemaVersion: 1,
    generator: 'implementation/generate-runtime-catalog.mjs',
    sourceRoot: sourceBasePath,
    assetBaseUrl,
    notes: [
      'Paths are repository-relative in sourcePath and browser-relative in url.',
      'Actor states preserve authored frame order, angles, canvas, pivot, and runtime mirror metadata.',
      'No generation timestamp is stored so identical inputs produce byte-identical output.',
    ],
    counts: {
      files: files.length,
      png: pngCount,
      enemies: countValues(enemies),
      bosses: countValues(bosses),
      weapons: countValues(weapons),
      pickups: countValues(pickups),
      props: countValues(props),
      effects: countValues(effects),
      skies: countValues(skies),
      uiGroups: countValues(ui),
      fonts: countValues(fonts),
      pngByCategory,
      structuredPngByCategory,
    },
    enemies,
    bosses,
    weapons,
    pickups,
    props,
    textures,
    mechanisms,
    effects,
    skies,
    ui,
    fonts,
    files,
  };
}

function validateCatalog(catalog) {
  const errors = [];
  if (catalog.counts.png !== 3525) errors.push(`Expected 3525 PNGs, found ${catalog.counts.png}`);
  for (const [category, diskCount] of Object.entries(catalog.counts.pngByCategory)) {
    const structuredCount = catalog.counts.structuredPngByCategory[category];
    if (structuredCount !== diskCount) {
      errors.push(`${category} has ${diskCount} PNGs on disk but ${structuredCount ?? 0} structured catalog entries`);
    }
  }
  for (const category of ['enemies', 'bosses']) {
    for (const [slug, actor] of Object.entries(catalog[category])) {
      for (const state of ['idle', 'attack', 'death']) {
        if (!actor.representative[state]) errors.push(`${category}/${slug} has no representative ${state} frame`);
      }
      if (category === 'enemies' && !actor.representative.walk) errors.push(`enemies/${slug} has no representative walk frame`);
    }
  }
  const sourcePaths = new Set();
  const keys = new Set();
  for (const file of catalog.files) {
    if (!file.url.startsWith(`${assetBaseUrl}/`)) errors.push(`Invalid runtime URL: ${file.url}`);
    if (!existsSync(join(repoRoot, file.sourcePath))) errors.push(`Missing source path: ${file.sourcePath}`);
    if (sourcePaths.has(file.sourcePath)) errors.push(`Duplicate source path: ${file.sourcePath}`);
    if (keys.has(file.key)) errors.push(`Duplicate asset key: ${file.key}`);
    sourcePaths.add(file.sourcePath);
    keys.add(file.key);
  }
  if (errors.length) throw new Error(`Catalog validation failed:\n- ${errors.join('\n- ')}`);
}

const catalog = buildCatalog();
validateCatalog(catalog);
const serialized = `${JSON.stringify(catalog, null, 2)}\n`;

if (checkOnly) {
  if (!existsSync(outputPath)) throw new Error(`Catalog does not exist: ${outputPath}`);
  const current = readFileSync(outputPath, 'utf8');
  if (current !== serialized) throw new Error('Runtime asset catalog is stale. Run: node implementation/generate-runtime-catalog.mjs');
  console.log(`Runtime asset catalog is current: ${catalog.counts.png} PNGs, ${catalog.counts.files} files.`);
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serialized, 'utf8');
  console.log(`Wrote ${toPosix(relative(repoRoot, outputPath))}: ${catalog.counts.png} PNGs, ${catalog.counts.files} files.`);
}
