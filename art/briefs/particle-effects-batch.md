# Particle Effects Batch

This batch supplies compact static seeds for the pooled runtime particle emitter. It complements the existing full-frame impact, projectile, beam, explosion, hazard, and debris animations under `assets/public_runtime/effects`; it does not replace them.

## Shared Direction

- Original early-1990s low-resolution corporate-horror game art.
- Catastrophe-modernist office, archive, industrial, flood, and actuarial materials.
- Chunky opaque silhouettes, hard grouped lighting, deliberate pixel clusters, and sparse two-tone highlights.
- Master palette direction: paper white, toner black, charcoal steel, signal red, safety yellow, oxide green, screen cyan, and wax brown.
- Every cell contains one isolated static particle seed, not an animation progression. Runtime rotation, scale, velocity, tint, lifetime, and fade create variation.
- One horizontal row of eight equal cells, ordered exactly as listed. Target 12% empty horizontal clearance; the validator requires at least 8% on every side.
- No labels, dividers, borders, text, floor, cast shadow, contact shadow, scene, weapon, character, or overlapping particles.
- Crisp opaque edges only. Dust, ash, and glow are rendered as hard-edged dithered clusters, never translucent gradients.
- Runtime output for every seed is `32x32`, centered at pivot `(16,16)`. Tiny particles may occupy only 25-60% of the canvas.

Append the shared invariants in `IMAGEGEN_PIPELINE.md` to each prompt.

## Source Sheets

| Source | Key | Eight cells, left to right | Primary feedback |
|---|---|---|---|
| `fx_weapon-feedback_v01.png` | `#00FF00` | red ink flecks, staple spark, twin fastener flash, curled paper ejecta, saw sparks, toner spurt, crushed canister, wax burst | weapon fire, ejection, hits, saw contact |
| `fx_world-feedback_v01.png` | `#FF00FF` | concrete dust, switch sparks, floor grit, cyan splash, red secret motes, white pickup star, red/white teleport fragments, cyan bubbles | environment, interaction, reward, traversal |
| `fx_death-feedback_v01.png` | `#00FF00` | paper scraps, metal fragments, wax chunks, toner burst, ember ash, redaction strips, drone sparks and steel, boss core burst | enemy deaths, props, boss phases, arena collapse |
| `fx_environment-material-feedback_v01.png` | `#FF00FF` | carpet fiber puff, concrete seam chips, pale-cyan glass shards, flood-water crown, brass rail filings, toner sludge, red wax chips, oxide-green pump spittle | material-aware impacts, props, movers, hazards, ambience |
| `fx_status-feedback_v01.png` | `#FF00FF` | binder deflection, hazard neutralization, rapid-authority spark, forensic scan, inspection scan, momentum seal, credential rejection, map-clear confetti | powerups, status, mastery, rejection, completion |

Copy untouched built-in image-generation results to `art/source/imagegen/` before any cleanup, then copy the selected keyed sources to `art/source/keyed/`. Extracted copies live under `art/source/alpha/`, and normalization authorities under each directory's `normalized/` child. Record every generation in `manifests/generation-log.jsonl`. `tools/validate_art_library.py` registers all five sheets at eight cells each.

## Canonical Generation Contract

- Request a panoramic `2048x768` source. Width below `1536` is not accepted for this batch.
- Generate exactly eight equal conceptual columns in one row. Normalization owns final cell geometry; never hand-slice an unnormalized source.
- The executable normalizer caps each subject at `76%` of its cell width and `84%` of source height, then aligns the baseline to `92%` of source height.
- All runtime seeds are RGBA `32x32`, binary alpha, no dithering, palette-locked, and centered at pivot `(16,16)`.
- Every seed may rotate through a full turn at runtime. Use compact rotation-safe silhouettes; directional beams, rings, projectiles, and impacts remain full-frame authored effects instead.
- Additive treatment is a runtime material choice. Generated pixels remain opaque: use a compact bright core with sparse dark edging for additive-capable cells, never a translucent halo.

Current normalized source authorities:

| Family | Normalized source | Cell width | Runtime fit | Allowed blend |
|---|---:|---:|---:|---|
| weapon-feedback | `2168x724` | `271` | max `20x20` | normal; additive for 02, 03, 05, and 07 |
| world-feedback | `2168x724` | `271` | max `20x20` | normal; additive for 02 and 05-08 |
| death-feedback | `1976x793` | `247` | max `20x20` | normal; additive for 05, 07, and 08 |
| environment-material-feedback | `1912x820` | `239` | max `19x19` | normal; additive for 05 |
| status-feedback | `1768x887` | `221` | max `18x18` | additive for 01-07; normal for 08 |

Reusable prompt body:

```text
Generate one panoramic 2048x768 source sheet containing exactly one horizontal row of eight isolated static particle seeds, ordered left to right as follows: [ORDERED CELL LIST].

Each equal-width column contains exactly one complete seed cluster. Center every cluster horizontally, keep all detached flecks inside its column, share one bottom alignment, and leave at least 12% empty horizontal clearance and 8% empty vertical clearance. No dividers or cell borders.

Original early-1990s low-resolution 2.5D corporate-horror game art. Chunky opaque silhouettes, deliberate pixel clusters, hard grouped upper-front-left lighting at roughly 45 degrees, weak neutral fill, and sparse two-tone highlights. Design every seed to remain readable after reduction to 32x32. Each is a static particle seed, not an animation frame, complete projectile, weapon, character, or scene. Favor rotation-safe compact silhouettes.

Use only appropriate colors from the locked paper-white, toner-black, charcoal-steel, signal-red, safety-yellow, oxide-green, screen-cyan, wax-red, and brass palette. Additive candidates use a bright compact core and minimal dark edging. Dust, smoke, splash, ash, and glow are hard-edged opaque clusters, never translucent gradients.

No text, labels, numbers, logo, umbrella imagery, watermark, UI, floor, horizon, cast shadow, contact shadow, reflection, overlapping cells, or recognizable third-party design.

Place everything on a perfectly flat solid [#00FF00 or #FF00FF] chroma-key background. The background is one uniform color with no gradient, texture, vignette, lighting variation, or shadow. Do not use the key color inside any seed. Crisp opaque edges only.
```

## Runtime Layout

Each source cell becomes one static runtime file. Keep these family directories and filenames exact so the runtime catalog groups them predictably:

```text
assets/public_runtime/effects/particle-weapon-feedback/fx_particle-weapon-feedback_F_01.png ... _08.png
assets/public_runtime/effects/particle-world-feedback/fx_particle-world-feedback_F_01.png ... _08.png
assets/public_runtime/effects/particle-death-feedback/fx_particle-death-feedback_F_01.png ... _08.png
assets/public_runtime/effects/particle-environment-material-feedback/fx_particle-environment-material-feedback_F_01.png ... _08.png
assets/public_runtime/effects/particle-status-feedback/fx_particle-status-feedback_F_01.png ... _08.png
```

Total source sheets: 5. Total runtime seeds: 40. The catalog generator requires no schema change: each directory becomes one `effects` family with eight parsed frames. Add all 40 records to `manifests/effect-runtime-metadata.json` with `size: [32, 32]` so catalog references retain dimensions.

## Extraction And Build

Raw selected sheets pass through the standard pipeline:

```powershell
python "$env:USERPROFILE\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py" `
  --input art/source/keyed/fx_weapon-feedback_v01.png `
  --out art/source/alpha/fx_weapon-feedback_v01.png `
  --auto-key border `
  --soft-matte `
  --transparent-threshold 12 `
  --opaque-threshold 220 `
  --despill `
  --edge-contract 1

python tools/normalize_chroma_sheets.py
python tools/validate_art_library.py

python tools/build_particle_seed_library.py
python tools/build_particle_contact_sheet.py
```

Start magenta-keyed sheets with the one-pixel matte contraction. It removes the
antialiased key-colored rim before normalization and downscaling; the art
validator rejects any remaining visible magenta spill pixel touching
transparency. If it reports a residual, increase contraction only for that
sheet until the boundary passes, then inspect the silhouette before approval.

`tools/build_particle_seed_library.py` is the sole shipping builder. It slices the normalized alpha authorities, applies fixed center pivots, quantizes to the locked 40-color palette without dithering, writes all 40 runtime files, and refreshes effect metadata. Its family occupancies are `.72` for weapon/world/death, `.68` for environment material, and `.64` for status. Preserve intentional detached flecks during review.

After all 40 files and metadata records exist:

```powershell
python tools/validate_art_library.py
node implementation/generate-runtime-catalog.mjs
node implementation/generate-runtime-catalog.mjs --check
```

The authoring generator writes `assets/data/runtime-assets.json`; the game build projects it into `assets/data/game-assets.json`, and Pages synchronization copies only the finalized production package to `docs`. The release completeness assertion in `implementation/generate-runtime-catalog.mjs` is `3547` PNGs. This complete static-seed batch adds exactly 40 runtime PNGs; the separate authored `ember-impact` progression adds six more.

## Runtime Kind Map

| Particle kind | Preferred source frames |
|---|---|
| `ink` | weapon-feedback 01 and 06 |
| `paper` | weapon-feedback 04; death-feedback 01 |
| `spark` | weapon-feedback 02, 03, and 05; world-feedback 02; death-feedback 07 |
| `ember` | weapon-feedback 07; death-feedback 05 |
| `energy` | world-feedback 05 and 08; death-feedback 08 |
| `smoke` | world-feedback 01 and 03; death-feedback 04 and 05 |
| `debris` | weapon-feedback 07 and 08; death-feedback 01, 02, 03, 06, and 07 |
| `approval` | world-feedback 05, 06, and 07 |
| `fiber`, `concrete`, `glass`, `toner`, `wax`, `spittle` | environment-material-feedback 01, 02, 03, 06, 07, and 08 respectively |
| `water` | environment-material-feedback 04; world-feedback 04 |
| `metal` | environment-material-feedback 05; death-feedback 07 |
| `deflection`, `neutralize`, `authority` | status-feedback 01-03 |
| `scan` | status-feedback 04 and 05 |
| `momentum`, `rejection`, `confetti` | status-feedback 06-08 respectively |

Particles remain secondary feedback. Spawn the existing authored effect first when one exists, then add a restrained burst of seeds. Accessibility `reducedEffects` should reduce counts and disable ambient emitters while retaining one readable impact seed.

## Coverage Map

| Event | Source cells | Existing full-frame companion |
|---|---|---|
| Stamp, staple, riveter, repeater, launcher, saw fire | weapon-feedback 01-08 | view-weapon fire frames |
| Paper, ink, metal, glass, and wax impacts | weapon-feedback 01-06 and 08 | hit and impact effect families |
| Switch, secret, credential, pickup, teleport | world-feedback 02 and 05-07 | teleport ring and UI feedback |
| Flood, leak, pump, rain, and submerged machinery | world-feedback 04 and 08 | reserve hazard and overlays |
| Doors, cover, props, moving sectors, ceiling strikes | world-feedback 01 and 03; death-feedback 01-03 | debris and ceiling-impact families |
| Enemy deaths and resurrection/redaction | death-feedback 01-07 | death sprites and redaction effects |
| Boss phase changes, disabled emitters, exposed core | death-feedback 02, 05, 07, and 08 | boss state and impact animations |
| Shield block, hazard immunity, scan powerups, momentum milestones | status-feedback 01-06 | HUD status and portrait feedback |
| Credential rejection and map clear | status-feedback 07-08 | use-failed cue and intermission transition |

## Approval Checks

- All 40 runtime PNGs are RGBA, `32x32`, palette-locked, and have transparent corners.
- No opaque pixel is within 12 RGB units of green or magenta chroma keys.
- Every seed remains readable over paper white, signal red, toner black, and oxide green.
- `art/approval/particle_seed_contact-v01.png` shows every seed at native 1x size over all four approval backgrounds.
- At 1x game scale, no seed resembles a full projectile or replaces the primary impact silhouette.
- Dust, ash, splash, and glow stay opaque; runtime alpha controls their fade.
- Catalog `effects` contains five particle families and 40 generated frames after regeneration.
