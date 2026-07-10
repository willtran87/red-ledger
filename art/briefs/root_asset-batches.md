# Root Asset Batch Briefs

These batches use the fictional red-ledger identity and the palette, edge, pivot, and lighting rules in `ART_PRODUCTION_BIBLE.md`. No generated source may contain third-party names, marks, text, labels, numerals, or readable signage.

## Missing Pickups

- Source: `pickup_missing-lineup_v01.png`
- Geometry: one row, six equal cells, common baseline, 12% minimum side clearance
- Key: exact green `#00FF00`
- Order: toner small, toner large, emergency reserve, temporary binder, rapid authority, forensic lens
- Runtime: fixed `48x48` or `64x64` base plus four derived shine frames

## Narrative Strip

- Source: `illustration_episode-2-3-strip_v01.png`
- Geometry: one row, five equal 16:10 scenes, exact magenta `#FF00FF` gutters
- Order: episode 2 intro, episode 2 outro, episode 3 intro, episode 3 outro, final epilogue
- Runtime: center-cropped and palette-locked to `320x200`; no embedded copy

## Intermission Strip

- Source: `intermission_episode-2-3-strip_v01.png`
- Geometry: one row, two equal 16:10 maps, exact magenta `#FF00FF` gutter
- Order: flooded industrial city, actuarial strata
- Runtime: center-cropped and palette-locked to `320x200`; route markers are rendered separately

## Environment Decal Grid

- Source: `decal_environment-grid_v01.png`
- Geometry: six columns by four rows, equal cells, 15% requested clearance, centered on both axes
- Key: exact green `#00FF00`
- Order: shelter, chevron, exit, suppression, medical, credential; waterline, pump, electrical, valve, rail switch, salvage cut; archive box, rolling shelf, document stack, redaction, approval seal, broken contract; probability network, transfer arrows, vault wheel, calculation grid, danger octagon, secret sensor
- Runtime: `64x64`, six palette treatments and three deterministic worn treatments per family

## Structural Material Strips

- Sources: `texture_material-strip-01_v01.png` through `texture_material-strip-04_v01.png`
- Geometry: one row, six seamless material swatches per strip
- Background: full-bleed material, no chroma; no text or signage
- Runtime: `128x128` family bases with clean, light damage, heavy damage, transition, and accent derivatives; animated families use deterministic runtime frames

## Environmental Overlay Seeds

- Source: `overlay_environment-grid_v01.png`
- Geometry: four columns by one row, equal cells, centered on both axes
- Key: exact green `#00FF00`
- Order: rain, water drip, ash, redaction fragments
- Runtime: deterministic wrapped translation and sparse alpha dropout; 4, 6, 4, and 4 frames respectively

## Validation

Run in this order:

```powershell
python tools/normalize_chroma_sheets.py
python tools/validate_art_library.py
```

Runtime builders consume only `art/source/alpha/normalized`. A failed registry, chroma, alpha, spacing, centering, baseline, palette, mode, or metadata check blocks approval.
