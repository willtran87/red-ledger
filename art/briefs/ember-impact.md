# Ember Impact

This authored six-frame effect closes the missing impact language for hostile ember projectiles. It is a short animation progression rather than a pool of interchangeable particle seeds.

## Runtime Contract

- Source: `art/source/imagegen/fx_ember-impact_v01.png`
- Keyed authority: `art/source/keyed/fx_ember-impact_v01.png`
- Alpha authority: `art/source/alpha/normalized/fx_ember-impact_v01.png`
- Runtime family: `assets/public_runtime/effects/ember-impact/`
- Canvas: `64x64`, centered pivot, six frames, additive blend
- Frame order: contact point, ignition, compact bloom, peak fragment burst, contracting embers, sparse dying flecks
- Direction: early-1990s low-resolution corporate-horror game art, chunky pixel clusters, hard grouped light, paper-white and safety-yellow hot core, signal-red and wax-red body, toner-black edge accents
- Use: resolved hostile ember projectile impact only; never as a projectile trail, generic weapon impact, status cue, or ambient decoration

## Generation Prompt

```text
Generate one panoramic source sheet containing exactly one horizontal row of six evenly spaced animation frames for a compact ember projectile impact, ordered left to right: tiny contact point, ignition snap, compact circular bloom, peak burst with short detached fragments, contracting ember cluster, sparse dying flecks.

Original early-1990s low-resolution 2.5D corporate-horror game art. Chunky opaque pixel clusters, crisp hard edges, grouped upper-front-left lighting, and a strong readable silhouette after reduction to 64x64. Use a paper-white and safety-yellow hot core, signal-red and wax-red flame body, and sparse toner-black edge accents. Keep the effect compact and energetic, with no smoke cloud and no realistic fire rendering. Each frame is one centered complete effect. Maintain a shared center and baseline, equal cell spacing, at least 12 percent empty horizontal clearance, and at least 8 percent empty vertical clearance. Keep every detached fragment inside its frame cell.

No text, labels, numbers, logo, umbrella imagery, watermark, UI, weapon, character, environment, floor, horizon, cast shadow, contact shadow, reflection, borders, dividers, overlapping cells, blur, anti-aliased glow, translucent gradient, or recognizable third-party design.

Place everything on a perfectly flat solid #00FF00 chroma-key background. The background must be one uniform green with no gradient, texture, vignette, lighting variation, or shadow. Do not use green inside the effect.
```

The selected built-in image-generation result is `2172x724`. Preserve the untouched output before chroma removal. Use border auto-key detection, the standard soft matte and despill settings, registered six-cell normalization, then finalize to six palette-locked RGBA frames.

## Runtime Build

```powershell
python tools/build_ember_impact.py
```

`tools/build_ember_impact.py` is the shipping authority for this family. It slices the six equal normalized cells, identifies the peak frame by visible area, derives one shared scale from that peak, and applies that scale to every frame around the fixed `(32,32)` center. It never fits frames independently, so the small contact, peak burst, contraction, and dying flecks retain their authored relative sizes. The builder palette-locks all six `64x64` frames, refreshes their effect metadata without disturbing other families, and rebuilds `art/approval/fx_ember-impact_preview.png`.

`python tools/build_effect_library.py` invokes the same ember builder during an ordinary full effect rebuild and preserves metadata owned by the particle and other specialized effect builders.
