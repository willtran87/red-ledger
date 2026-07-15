# Particle Effects Batch

This batch supplies compact static seeds for the pooled runtime particle emitter. It complements the existing full-frame impact, projectile, beam, explosion, hazard, and debris animations under `assets/public_runtime/effects`; it does not replace them.

## Shared Direction

- Original early-1990s low-resolution corporate-horror game art.
- Catastrophe-modernist office, archive, industrial, flood, and actuarial materials.
- Chunky opaque silhouettes, hard grouped lighting, deliberate pixel clusters, and sparse two-tone highlights.
- Master palette direction: paper white, toner black, charcoal steel, signal red, safety yellow, oxide green, screen cyan, and wax brown.
- Every cell contains one isolated static particle seed, not an animation progression. Runtime rotation, scale, velocity, tint, lifetime, and fade create variation.
- One horizontal row of eight equal cells, ordered exactly as listed, with a common visual center and at least 8% empty clearance on every side.
- No labels, dividers, borders, text, floor, cast shadow, contact shadow, scene, weapon, character, or overlapping particles.
- Crisp opaque edges only. Dust, ash, and glow are rendered as hard-edged dithered clusters, never translucent gradients.
- Runtime output for every seed is `32x32`, centered at pivot `(16,16)`. Tiny particles may occupy only 25-60% of the canvas.

Append the shared invariants in `IMAGEGEN_PIPELINE.md` to each prompt.

## Source Sheets

| Source | Key | Eight cells, left to right | Primary feedback |
|---|---|---|---|
| `fx_weapon-feedback_v01.png` | generated key | red ink flecks, staple spark, twin fastener flash, curled paper ejecta, saw sparks, toner spurt, crushed canister, wax burst | weapon fire, ejection, hits, saw contact |
| `fx_world-feedback_v01.png` | generated key | concrete dust, switch sparks, floor grit, cyan splash, red secret motes, white pickup star, red/white teleport fragments, cyan bubbles | environment, interaction, reward, traversal |
| `fx_death-feedback_v01.png` | generated key | paper scraps, metal fragments, wax chunks, toner burst, ember ash, redaction strips, drone sparks and steel, boss core burst | enemy deaths, props, boss phases, arena collapse |
| `fx_environment-material-feedback_v01.png` | `#FF00FF` | carpet fiber puff, concrete seam chips, pale-cyan glass shards, flood-water crown, brass rail filings, toner sludge, red wax chips, oxide-green pump spittle | material-aware impacts, props, movers, hazards, ambience |
| `fx_status-feedback_v01.png` | `#FF00FF` | binder deflection, hazard neutralization, rapid-authority spark, forensic scan, inspection scan, momentum seal, credential rejection, map-clear confetti | powerups, status, mastery, rejection, completion |

The selected generated sources live under `art/source/keyed/`, their extracted copies under `art/source/alpha/`, and normalization authorities under each directory's `normalized/` child. `tools/validate_art_library.py` registers all five sheets at eight cells each.

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
  --despill

python tools/normalize_chroma_sheets.py
python tools/validate_art_library.py

python tools/slice_transparent_sprite_sheet.py `
  --input art/source/alpha/normalized/fx_weapon-feedback_v01.png `
  --out-dir art/working/effects/particle-weapon-feedback `
  --names 01 02 03 04 05 06 07 08 `
  --prefix particle-weapon-feedback `
  --size 192 `
  --mode columns
```

Repeat slicing for `world-feedback`, `death-feedback`, `environment-material-feedback`, and `status-feedback`. The slicer's files are working crops only. Finalize each numbered crop with the fixed center pivot; example for frame 01:

```powershell
python tools/finalize_slice_assets.py finalize `
  --input art/working/effects/particle-weapon-feedback/particle-weapon-feedback_01_idle_SW_00.png `
  --output assets/public_runtime/effects/particle-weapon-feedback/fx_particle-weapon-feedback_F_01.png `
  --size 32x32 `
  --occupancy 0.62 `
  --pivot 16,16
```

Use occupancy `0.62` as the default and lower it to `0.52` for broad dust, splash, ash, and boss-core silhouettes when they crowd the canvas. Preserve intentional detached flecks during review; if the generic finalizer removes a meaningful satellite, use a family builder based on `fit_frame` and `quantize_rgba` instead.

After all 40 files and metadata records exist:

```powershell
python tools/validate_art_library.py
node implementation/generate-runtime-catalog.mjs
node implementation/generate-runtime-catalog.mjs --check
```

The authoring generator writes `assets/data/runtime-assets.json`; the game build projects it into `assets/data/game-assets.json`, and Pages synchronization copies only the finalized production package to `docs`. The release completeness assertion in `implementation/generate-runtime-catalog.mjs` is `3541` PNGs. This complete batch adds exactly 40 runtime PNGs.

## Runtime Kind Map

| Particle kind | Preferred source frames |
|---|---|
| `ink` | weapon-feedback 01 and 06 |
| `paper` | weapon-feedback 04; death-feedback 01 |
| `spark` | weapon-feedback 02, 03, and 05; world-feedback 02 |
| `ember` | weapon-feedback 07; death-feedback 05 |
| `energy` | world-feedback 05 and 08; death-feedback 08 |
| `smoke` | world-feedback 01 and 03; death-feedback 04 and 05 |
| `debris` | weapon-feedback 07 and 08; death-feedback 01, 02, 03, and 06 |
| `approval` | world-feedback 05, 06, and 07 |
| `fiber`, `concrete`, `glass`, `water`, `metal`, `toner`, `wax`, `spittle` | environment-material-feedback 01-08 respectively |
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
- At 1x game scale, no seed resembles a full projectile or replaces the primary impact silhouette.
- Dust, ash, splash, and glow stay opaque; runtime alpha controls their fade.
- Catalog `effects` contains five particle families and 40 generated frames after regeneration.
