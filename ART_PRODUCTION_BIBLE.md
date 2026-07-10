# RED LEDGER ART PRODUCTION BIBLE

**Status:** Canonical preproduction specification  
**Companion documents:** [Game Design Document](GAME_DESIGN_DOCUMENT.md), [Image Generation Pipeline](IMAGEGEN_PIPELINE.md), [Asset Manifest](ASSET_MANIFEST.md)  
**Purpose:** Remove visual and technical ambiguity before generating production art.

---

## 1. Authority and Change Control

This document is the source of truth for dimensions, pivots, palettes, animation coverage, compositing, and visual acceptance. The Game Design Document owns fiction and game behavior. The Asset Manifest owns completeness. The Image Generation Pipeline owns execution.

When documents conflict, resolve them in this order:

1. Legal and release-track restrictions.
2. This Art Production Bible for visual implementation.
3. The Asset Manifest for required deliverables.
4. The Game Design Document for creative intent.

Changing any locked constant requires updating all affected manifests and regenerating an in-engine comparison scene. Do not silently change dimensions or pivots per asset.

---

## 2. Release Identity

Production defaults to the fictional public-release identity.

- Company name: **Red Ledger Mutual**.
- Mark: three offset roof panels above a square, called the **shelter seal**.
- Never use a red umbrella silhouette, umbrella handle, umbrella canopy segmentation, or a confusingly similar protection mark.
- Never use the unnamed real insurer's wordmark, slogan, building likeness, typography lockup, legal language, or marketing copy.
- No generated asset may contain a real company name, game franchise name, signature logo, watermark, artist signature, or legible generated text.
- The signal-red/black/white color relationship is permitted as a general palette; identity must come from the original shelter seal, materials, and fiction.

If written authorization later enables a licensed internal track, licensed assets live under a separate root and never overwrite public assets.

```text
art/licensed_source/       # Never distributed by the public build.
assets/public_runtime/     # Default and shippable.
```

---

## 3. Visual Target

### 3.1 Thesis

**Catastrophe modernism rendered by a 1993 office PC.**

The world begins as clean institutional modernism and is progressively invaded by water damage, burned paper, bent metal, black toner, red sealing wax, and brass calculation machinery. It is graphic, tactile, and readable rather than photorealistic.

### 3.2 Locked qualities

- Bold silhouettes readable at small size.
- Hard-edged light groups rather than soft cinematic gradients.
- Pixel clusters that describe material and volume; no uniform noise overlays.
- Restrained red accents during normal play.
- Strong value separation between actor and environment.
- Exaggerated attack anticipation and impact frames.
- Slightly chunky physical proportions and industrial hardware.
- Deadpan corporate specificity without legible generated copy.

### 3.3 Prohibited qualities

- Modern military realism.
- Smooth vector art, mobile-game gloss, or toy-like plastic rendering.
- Anime, comic-book ink outlines, cel shading, or painterly concept-art backgrounds.
- Generic gothic fantasy as the dominant language.
- Excessive rust, brown, or monochromatic red.
- Film grain, chromatic aberration, depth of field, bloom baked into opaque sprites, or texture smoothing.
- Tiny decorative detail that disappears at runtime.
- Direct visual quotations of copyrighted shooter enemies, weapons, HUDs, title treatments, or maps.

---

## 4. Canonical Display Geometry

### 4.1 Logical resolution

| Surface | Logical size | Notes |
|---|---:|---|
| Full classic frame | `320x200` | Canonical art and UI coordinate space |
| Classic playfield | `320x168` | Top portion when status bar is visible |
| Status bar | `320x32` | Fixed bottom band |
| Minimal-HUD playfield | `320x200` | Full frame, overlay UI |
| Widescreen frame | `426x200` | Optional 16:9 extension using the same vertical scale |
| Widescreen classic playfield | `426x168` | Center 320 pixels must remain compositionally valid |

### 4.2 Pixel aspect

- Art is stored in `320x200` logical pixels.
- Reference previews display logical pixels with a `1.2x` vertical stretch, making `320x200` appear at 4:3.
- Editors may work in square pixels, but every approval sheet includes the aspect-correct preview.
- Runtime scaling is integer nearest-neighbor after aspect correction.
- Never judge circles, faces, or weapon proportions solely from the unstretched source canvas.

### 4.3 Safe areas

- Critical classic-playfield content stays within `x=8..311`, `y=6..163`.
- View weapons may touch the left, right, and bottom edges by design.
- Status-bar numbers and icons stay inside a two-pixel inset.
- Menu selection text stays within `x=24..295`.
- Widescreen additions must be nonessential scenery; gameplay and UI remain valid in the central 320 pixels.

---

## 5. Runtime Palette

Generated sources may contain continuous color. Final runtime art uses the following 40-color master palette plus alpha. Small UI illustrations may use up to eight additional temporary colors only after art-lead approval.

### 5.1 Neutrals

| Index | Hex | Name |
|---:|---|---|
| 00 | `#08090A` | Void |
| 01 | `#111214` | Toner black |
| 02 | `#1D2023` | Black lift |
| 03 | `#2A2D31` | Deep charcoal |
| 04 | `#34383D` | Charcoal |
| 05 | `#4B5055` | Steel dark |
| 06 | `#646A70` | Steel mid |
| 07 | `#7D8388` | Steel light |
| 08 | `#9A9D9D` | Ash gray |
| 09 | `#B7B8B4` | Office gray |
| 10 | `#D4D2CB` | Paper shade |
| 11 | `#E6E2D9` | Warm white |
| 12 | `#F4F1EA` | Paper white |
| 13 | `#FFFDF7` | Highlight white |

### 5.2 Red and wax

| Index | Hex | Name |
|---:|---|---|
| 14 | `#33070B` | Dried red |
| 15 | `#520A10` | Red shadow |
| 16 | `#7A1018` | Deep red |
| 17 | `#A31822` | Wax red |
| 18 | `#D9232E` | Signal red |
| 19 | `#F14B51` | Red light |
| 20 | `#FF8484` | Hot red highlight |

### 5.3 Yellow, brass, and paper brown

| Index | Hex | Name |
|---:|---|---|
| 21 | `#3A2812` | Brown shadow |
| 22 | `#674A24` | Cardboard dark |
| 23 | `#927044` | Cardboard |
| 24 | `#B9955E` | Kraft light |
| 25 | `#8A6819` | Brass shadow |
| 26 | `#B68B24` | Brass |
| 27 | `#E2B93B` | Safety yellow |
| 28 | `#FFE17A` | Yellow highlight |

### 5.4 Oxide green

| Index | Hex | Name |
|---:|---|---|
| 29 | `#18342F` | Flood shadow |
| 30 | `#285046` | Oxide dark |
| 31 | `#477066` | Oxide green |
| 32 | `#6D9688` | Oxide light |
| 33 | `#A5C4B6` | Pale green |

### 5.5 Screen cyan and energy

| Index | Hex | Name |
|---:|---|---|
| 34 | `#11343E` | Cyan shadow |
| 35 | `#176175` | Screen dark |
| 36 | `#238CA5` | Screen mid |
| 37 | `#47BCD1` | Screen cyan |
| 38 | `#87E3EC` | Energy light |
| 39 | `#D1FBFA` | Energy white |

### 5.6 Palette rules

- Chroma-key colors are never palette entries.
- Quantize without diffusion dithering by default. Hand-place sparse ordered dither only to describe texture or light falloff.
- Actor outlines use local dark colors rather than pure black everywhere.
- Signal red should occupy 10-20% of a typical gameplay frame and no more than 35% outside bosses or transitions.
- Energy cyan is reserved for screens, one credential family, power weapons, and selected projectiles.
- Safety yellow is reserved for hazard communication and its credential family.
- Each sprite should use 12-24 opaque colors. Bosses may use up to 32.

---

## 6. Pixel Conversion

### 6.1 Source versus runtime

- Image-generation sources are produced at `1024x1024` unless a composition requires `1536x1024`.
- Sources are reference-grade illustrations, not final runtime pixels.
- Crop to the visible subject, preserve the prescribed padding, resize once with high-quality area/Lanczos reduction, then quantize to the master palette.
- Perform manual pixel cleanup after reduction.
- Use nearest-neighbor for every resize after the first runtime reduction.
- Never upscale a runtime frame and call it a new source master.

### 6.2 Runtime cleanup requirements

- Remove single-pixel noise that does not contribute to silhouette or material.
- Repair broken one-pixel limbs, wires, handles, and face features.
- Consolidate highlights into intentional clusters.
- Keep exterior edges one to three pixels thick depending on scale.
- Ensure the darkest 10% and lightest 10% of values are represented unless the asset is intentionally low contrast.
- Inspect at 1x logical size, 4x nearest-neighbor, and aspect-correct gameplay preview.

---

## 7. Sprite Coordinate System

### 7.1 Orientation codes

Angles describe the side of the actor visible to the camera:

| Code | View |
|---|---|
| `F` | Front |
| `FL` | Front-left three-quarter |
| `L` | Left profile |
| `BL` | Back-left three-quarter |
| `B` | Back |
| `BR` | Back-right three-quarter |
| `R` | Right profile |
| `FR` | Front-right three-quarter |

The actor's left and right are anatomical. Never rename frames based on screen position.

### 7.2 Common sprite canvases

| Class | Runtime canvas | Pivot | Maximum opaque bounds |
|---|---:|---:|---:|
| Small enemy | `64x72` | `(32,68)` | `58x66` |
| Standard enemy | `96x112` | `(48,106)` | `88x100` |
| Large enemy | `128x144` | `(64,137)` | `118x130` |
| Boss | `192x176` | `(96,168)` | `182x160` |
| Small pickup | `48x48` | `(24,43)` | `40x38` |
| Large pickup | `64x64` | `(32,58)` | `56x52` |
| Small prop | `64x80` | `(32,75)` | `58x70` |
| Standard prop | `96x112` | `(48,106)` | `88x100` |
| Projectile | `32x32` | `(16,16)` | `28x28` |
| Large projectile | `48x48` | `(24,24)` | `44x44` |
| Impact/effect | `64x64` | `(32,32)` | `60x60` |

Pivots are stored in metadata and do not move between animation frames. Feet or physical base sit on the pivot baseline. Overhead pieces may exceed the visual center; do not vertically recenter each frame.

### 7.3 Frame occupancy

- Standing actors occupy 72-88% of canvas height.
- Pickups occupy 55-75% of canvas height to preserve surrounding alpha.
- No opaque pixel touches a source-sheet edge.
- Detached sparks or fragments belong in a grouped frame only when they are part of the animation pose.

### 7.4 Rotation policy

- Generate all eight orientations for asymmetric enemies and all bosses.
- Five-view mirroring is allowed only for bilaterally symmetric actors without text, badges, single-arm tools, directional damage, or one-sided lights.
- Five-view source set is `F`, `FL`, `L`, `BL`, `B`; runtime mirrors the intermediate/right views.
- Death sequences use `F` only unless the death preserves a tall asymmetric corpse for more than six ticks.
- Pickups use one view plus a four-frame hover/shine loop. They do not rotate continuously.

---

## 8. Enemy Animation Standard

### 8.1 Required states

| State | Default frames | Rotation | Notes |
|---|---:|---|---|
| `idle` | 2 | Per actor policy | Subtle mechanical/paper motion, not breathing realism |
| `walk` | 4 | Per actor policy | Clean contact cycle; alternating stride or equivalent mechanism |
| `attack` | 4 | Per actor policy | Anticipation, release, follow-through, recovery |
| `pain` | 1 | Per actor policy | Strong readable recoil |
| `death` | 6 | Front only | Ends below 45% standing height where possible |
| `gib` | 6 | Front only | Optional by manifest; ink/paper/mechanical breakup |
| `corpse` | 1 | Front only | Final death frame duplicated as explicit asset |

Frame count deviations are locked in the Asset Manifest. Runtime timing comes from actor data, not duplicated art.

### 8.2 Pose continuity

- All rotations share the same pose and silhouette event for a given frame index.
- A left-foot contact frame remains the same anatomical contact across all angles.
- Attack release occurs on the same frame index for every rotation.
- Equipment, lights, tears, stamps, and damage remain on the same side of the actor.
- Head and torso scale vary by no more than 3% across a rotation set.
- The ground baseline may vary by at most one logical pixel after cleanup.

### 8.3 Enemy scale classes

| Enemy | Class | Rotations | Gib |
|---|---|---|---|
| Returned Mail | Small | 5 mirrored | Yes |
| Desk Warden | Standard | 8 | Yes |
| Ember Clerk | Standard | 5 mirrored | Yes |
| Exposure Hound | Small | 8 | Yes |
| Coverage Drone | Standard | 8 | No |
| Liability Mass | Large | 8 | Yes |
| Denial Officer | Large | 8 | Yes |
| Subrogator | Standard | 8 | Yes |
| Reserve Eater | Large | 8 | Yes |
| Fraud Apparition | Standard | 8 | No; separate reveal effect |
| Cat Model | Large | 8 | Yes |
| Bad-Faith Counsel | Large | 8 | No; dissolve effect |
| Regional Director | Boss | 8 | Custom collapse |
| The Aggregate | Boss | 8 | Custom collapse |
| Chief Actuary | Boss | 8 | Custom collapse |
| The Uninsurable | Boss/static | Front construction | Custom destruction stages |

---

## 9. View Weapons

### 9.1 Canvas and anchor

- Weapon frames are composited onto a transparent `320x168` playfield canvas.
- Primary anchor is bottom center at `(160,168)`.
- Weapon art may extend beyond the canvas bottom but is cropped consistently.
- The neutral weapon silhouette occupies 28-52% of playfield width depending on weapon class.
- Hands are part of the weapon asset and remain visually consistent across the arsenal.
- The character wears charcoal catastrophe gloves with off-white fabric backs and one narrow signal-red seam.

### 9.2 Required states

| State | Art requirement |
|---|---|
| `idle` | One frame; optional two-frame mechanical idle only where justified |
| `fire` | Weapon-specific sequence from Asset Manifest |
| `flash` | Separate additive/opaque flash where it improves light timing |
| `alt` | Not used in version 1.0 |
| `raise` | Procedural vertical motion of idle frame |
| `lower` | Procedural vertical motion of idle frame |
| `dry` | One frame only for zero-ammo feedback where specified |

### 9.3 Perspective

- Centered presentation with mild asymmetry from operating hands.
- Camera equivalent: approximately 55-65 mm, minimal wide-angle distortion.
- Weapon points toward screen center around `(160,72)` unless it is melee.
- Do not show a full forearm beyond the lower third of the playfield.
- Maintain a single glove and skin reference across every weapon.

### 9.4 Muzzle and impact separation

- Muzzle flashes are separate assets when they obscure more than 15% of the weapon or require palette-lighting control.
- Hitscan impacts are separate world effects.
- Shells, staples, paper scraps, and toner ejections are separate effect sprites if they travel independently.

---

## 10. Pickups, Props, and Effects

### 10.1 Pickups

- Present objects at a front three-quarter product angle with an obvious base.
- Use one static object frame plus four `shine` frames; the base silhouette does not change.
- Credential pickups are `48x48`; weapons and major powerups are `64x64`.
- Each pickup uses a distinct primary silhouette, not color alone.
- Avoid legible microtext. Use lines, blocks, icons, and the shelter seal.

### 10.2 Props

- Props use front-facing billboards only when they are small, nonblocking, or visually rotationally symmetric.
- Collision-critical props use simple world geometry with texture art instead of a misleading billboard.
- Breakable props require intact, damage, break, and debris states.
- Decorative variants may change color and damage but not collision silhouette.

### 10.3 Effects

- Opaque fire, ink, wax, sparks, and fragments use chroma-key extraction.
- Soft smoke, glass, translucent energy, and bloom are not keyed as opaque sprites. Build them as additive grayscale masks or request a separately approved native-alpha workflow.
- Every effect is tested over paper white, signal red, toner black, and oxide green.
- Avoid baked black halos and colored key fringes.

---

## 11. World Textures

### 11.1 Runtime sizes

| Type | Runtime size | Source target |
|---|---:|---:|
| Standard wall | `64x64` | `1024x1024` |
| Tall/detailed wall | `128x128` | `1024x1024` |
| Narrow trim | `32x64` | `512x1024` or crop |
| Door | `64x128` | `1024x1536` |
| Switch panel | `32x32` or `64x64` | `1024x1024` |
| Flat floor/ceiling | `64x64` | `1024x1024` |
| Animated liquid | `64x64`, 4 frames | Four controlled variants |
| Animated screen | `64x64`, 4 frames | Fixed housing; screen region changes |
| Sky panorama | `1024x128` | `2048x512` |
| Decal | `32x32`, `64x64`, or `128x64` | Chroma/alpha source |

### 11.2 Texel density

- Standard walls represent 128 world units per 64 pixels.
- Doors represent 128 units wide by 256 units tall per `64x128` texture.
- Repeated structural materials align to 8-pixel increments.
- Baseboards, chair rails, and hazard stripes align across adjacent textures.

### 11.3 Seam rules

- Seamless materials must tile in both axes unless identified as a one-axis panel.
- Use offset-preview validation at `3x3` tiles.
- Opposite edges must differ by no more than one palette step at corresponding pixels unless a deliberate grout/seam line occupies both edges.
- Lighting gradients are not baked into repeatable materials.
- Damage overlays and decals carry local lighting variation separately.

### 11.4 Texture families

Every structural family includes:

1. Clean base.
2. Light damage.
3. Heavy damage.
4. Transition/edge.
5. Trim or baseboard.
6. Door or access panel.
7. One accent panel.

The manifest defines which families also need wet, charred, wax-invaded, or infernal states.

---

## 12. UI, Fonts, and Illustration

### 12.1 Status bar

- Canvas: `320x32`.
- Portrait well: `32x32` centered at `x=144..175`.
- Portrait art: `28x28` inside a two-pixel inset.
- Health/protection primary numerals: 18 pixels high.
- Ammo numerals: 12 pixels high.
- Credential icons: `12x10` each.
- Decorative material is a scratched claims terminal with paper labels and restrained red indicators.
- The status bar is drawn as original art and must not reproduce the exact compartment layout of another game.

### 12.2 Portrait sheet

The adjuster portrait is a gender-ambiguous adult with close-cropped dark hair, charcoal field jacket collar, pale paper-reflected key light, and increasing soot/toner damage. Five damage tiers share identity and camera.

Required states per tier:

- Neutral center.
- Glance left.
- Glance right.
- Pain left.
- Pain right.
- Pain center.

Global states:

- Weapon-acquired grin.
- Overcharge.
- Invulnerable.
- Dead.

Total target: `34` frames at `28x28`.

### 12.3 Bitmap fonts

Generated text is prohibited. Fonts are authored as glyph atlases.

| Font | Cell | Use |
|---|---:|---|
| `ledger_small` | `6x8` | Menus, messages, tallies |
| `ledger_numeric` | `12x18` | HUD values |
| `ledger_title` | Variable, 24 px high | Episode/map titles |

Glyph coverage: uppercase A-Z, lowercase a-z for accessibility text, digits, common punctuation, arrows, percent, plus/minus, slash, colon, apostrophe, parentheses, and accented Latin characters required by localization. The title font may be uppercase-only.

### 12.4 Menus and intermissions

- Title screen: `320x200`, no embedded menu text.
- Menu background: `320x200`, quiet enough for overlaid bitmap text.
- Episode cards: `320x200`, one per episode.
- Intermission map: `320x200`, one per episode, with separate icon overlays.
- Ending illustrations: `320x200`, three plus final epilogue.
- Pause plaque, selectors, sliders, toggles, save thumbnails, and difficulty icons are separate assets.

---

## 13. Lighting and Value

- World lighting uses sector-level steps; textures remain usable across light levels.
- Actor source key light comes from upper front-left at approximately 45 degrees.
- Fill is weak and neutral. Rim light is used only for energy enemies or bosses.
- The bottom 20% of standing enemies is one to two value steps darker than the torso.
- Attack charges may temporarily introduce cyan, yellow, or red light, but the neutral frame remains material-led.
- Bright projectiles include a one-pixel near-white core at runtime.
- No sprite bakes a floor shadow. Runtime blob shadows are optional and off in authentic mode.

---

## 14. File Structure and Naming

```text
art/
  briefs/                  # Approved prompt and design briefs.
  references/              # Cleared references and generated identity anchors.
  source/imagegen/         # Untouched generated outputs.
  source/keyed/            # Chroma-key sources before alpha removal.
  source/alpha/            # Extracted RGBA sources.
  working/                 # Crops, paintovers, palette work, layered files.
  approval/                # Contact sheets and aspect-correct previews.
assets/public_runtime/
  enemies/
  weapons/view/
  weapons/pickups/
  pickups/
  props/
  effects/
  textures/walls/
  textures/flats/
  textures/doors/
  textures/decals/
  skies/
  ui/
  fonts/
manifests/
  art-assets.json
  generation-log.jsonl
```

### Naming pattern

```text
<category>_<subject>_<state>_<angle>_<frame>_v<revision>.<ext>
```

Examples:

```text
enemy_desk-warden_walk_FL_02_v03.png
weapon_staple-driver_fire_F_03_v02.png
pickup_red-credential_shine_F_01_v01.png
texture_office-wall_clean_00_v01.png
ui_portrait_damage-3_pain-left_F_00_v02.png
```

Runtime names omit revision only after approval. Hyphenated subject IDs stay stable for the life of the project.

---

## 15. Approval Gates

Every asset family passes these gates:

1. **Brief approved:** silhouette, materials, scale, state list, and key color locked.
2. **Identity anchor approved:** front/side/back or equivalent model sheet accepted.
3. **Source approved:** generated source has correct design and no prohibited content.
4. **Alpha approved:** clean edges, transparent corners, no fringe or lost parts.
5. **Runtime art approved:** palette, pixels, scale, pivot, and frame continuity accepted.
6. **In-engine approved:** readable in representative light, combat, and 320x200 capture.
7. **Final:** filename, metadata, provenance, and manifest status complete.

No family enters batch production before its identity anchor and one final runtime frame pass gate 6.

---

## 16. Visual Acceptance Checklist

An asset is final only when all applicable checks pass:

- Original identity and no prohibited trademarks or copyrighted imitation.
- Correct runtime canvas, pivot, baseline, and orientation label.
- Alpha channel present; corner alpha is zero for cutouts.
- No chroma-key pixels or visible spill remain.
- Master palette only, with approved alpha behavior.
- Correct subject scale relative to the comparison lineup.
- Silhouette readable at 1x over light and dark environments.
- Animation preserves anatomy, equipment side, lighting, and pose continuity.
- Attack event is obvious before the damaging frame.
- Texture tiles without seams and aligns to its family.
- UI remains legible after aspect correction.
- No generated text, watermark, signature, or accidental logo.
- Source prompt, model/tool, date, input references, and revision are logged.
- Runtime screenshot exists in the approval folder.

