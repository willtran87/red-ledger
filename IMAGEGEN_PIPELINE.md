# RED LEDGER IMAGE GENERATION PIPELINE

**Status:** Canonical execution workflow  
**Companion documents:** [Art Production Bible](ART_PRODUCTION_BIBLE.md), [Asset Manifest](ASSET_MANIFEST.md)  
**Default path:** Built-in image generation, flat chroma background for opaque cutouts, local alpha extraction, manual runtime cleanup.

---

## 1. Pipeline Principles

- Generate one coherent asset family at a time.
- Approve identity before animation volume.
- Keep untouched generated sources.
- Use references to preserve design; do not rely on repeated text prompts alone.
- Chroma key is an extraction aid, not a finished look.
- Produce runtime art from high-resolution sources once, then keep edits at runtime resolution.
- Validate inside the actual game presentation after each family.
- Never batch the full manifest before the first enemy, weapon, texture family, pickup set, and portrait pass in-engine review.

---

## 2. Generation Units

Use these units rather than asking for an entire game's art in one sheet:

| Asset | Generation unit | Maximum subjects per source |
|---|---|---:|
| Enemy identity | One model sheet | 5 views |
| Enemy animation | One state and one pose index across required angles | 5-8 |
| Boss animation | One pose across 3-5 adjacent angles | 5 |
| View weapon | One state strip | 4-6 frames |
| Pickup family | One related product lineup | 4-6 objects |
| Prop family | One scale/material family | 3-6 objects |
| Effect | One effect progression | 4-6 frames |
| Wall/flat | One seamless material | 1 |
| Door family | One front elevation with state variants | 3-4 |
| Portrait | One damage tier and expression group | 3-6 frames |
| Intermission | One complete illustration without text | 1 |

Smaller units cost more calls but materially improve consistency, slicing, and revision control.

---

## 3. Folder Lifecycle

For asset ID `enemy.desk-warden`, files move through:

```text
art/briefs/enemy_desk-warden.md
art/references/enemy_desk-warden_anchor-v01.png
art/source/imagegen/enemy_desk-warden_walk-01_v01.png
art/source/keyed/enemy_desk-warden_walk-01_v01.png
art/source/alpha/enemy_desk-warden_walk-01_v01.png
art/working/enemy/desk-warden/
art/approval/enemy_desk-warden_contact-v03.png
assets/public_runtime/enemies/desk-warden/
```

Never overwrite a generated source. Revisions increment `v01`, `v02`, and so on.

---

## 4. Shared Prompt Invariants

Append this block to every generation prompt where applicable:

```text
Visual target: original early-1990s 2.5D first-person game art, catastrophe-modernist corporate horror, bold readable silhouette, chunky practical construction, hard grouped lighting, restrained color detail, designed to survive reduction to low-resolution pixel art.
Palette direction: paper white, toner black, charcoal steel, signal red accents, with safety yellow, oxide green, or screen cyan only when specified.
Identity restrictions: fictional Red Ledger Mutual world; use only the original three-roof-panel shelter-seal motif when a mark is needed. No umbrella symbol or silhouette. No real company names, wordmarks, slogans, recognizable buildings, or branded uniforms.
Originality restrictions: no recognizable characters, monsters, weapons, HUD elements, maps, logos, or title treatments from existing games or media.
Output restrictions: no legible text, captions, labels, watermark, signature, frame borders, UI mockup, environment, cast shadow, contact shadow, reflection, or floor plane unless explicitly requested.
Consistency: preserve the approved identity reference, anatomy, materials, proportions, damage, equipment side, and upper-front-left key light.
```

Do not mention a copyrighted franchise or real insurer in generation prompts. Describe the technical and aesthetic qualities directly.

---

## 5. Chroma-Key Specification

### 5.1 Key selection

| Subject colors | Key | Rule |
|---|---|---|
| Red, black, white, yellow, brown | `#00FF00` | Default |
| Green, cyan, flood material | `#FF00FF` | Avoid green spill/loss |
| Mixed green and magenta effects | Do not use chroma | Use additive mask or approved native-alpha workflow |

The key must not appear in the subject. Magenta is not part of the runtime palette and is the safest alternate.

### 5.2 Required chroma wording

```text
Place every figure on a perfectly flat solid #00FF00 chroma-key background for removal. The entire background must be exactly one uniform color with no gradient, texture, vignette, lighting variation, horizon, floor, reflection, cast shadow, or contact shadow. Keep each complete figure separated from all others with generous empty space. Do not use #00FF00 anywhere in the figures. Crisp opaque edges; no translucent material.
```

Substitute `#FF00FF` when required.

### 5.3 Sheet composition

- Use one horizontal row.
- Figures are ordered exactly as listed in the prompt, left to right.
- All figures share scale and baseline.
- Treat the source as equal-width cells, one figure per cell. Register the exact cell count in `SHEET_COUNTS` in `tools/validate_art_library.py` before normalization.
- After normalization, maintain at least 8% of each cell's width between the opaque bounds and both vertical cell edges.
- Maintain at least 8% source height above every opaque bound and below the shared baseline.
- Center each opaque bound horizontally within its cell to within two source pixels; bottom gaps may differ by no more than two source pixels across a strip.
- No arrows, labels, numbers, boxes, dividers, or captions.
- Detached pieces stay within their figure's horizontal cell.

Raw generations may be imperfectly spaced. The normalized alpha and keyed copies are the slicing authority:

```powershell
python tools/normalize_chroma_sheets.py
python tools/validate_art_library.py
```

Normalization caps each subject at 76% of its cell width and 84% of source height, centers it in the cell, and places its baseline at 92% of source height. The validator fails on unregistered sheets, missing alpha/keyed pairs, nonuniform keyed borders, insufficient margins, horizontal drift, or baseline drift. Add the correct registry entry; never choose a false count merely to make validation pass.

### 5.4 Alpha extraction

Use the installed helper after copying the generated source into the workspace:

```powershell
python "$env:USERPROFILE\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py" `
  --input art/source/keyed/<source>.png `
  --out art/source/alpha/<source>.png `
  --auto-key border `
  --soft-matte `
  --transparent-threshold 12 `
  --opaque-threshold 220 `
  --despill
```

If a one-pixel fringe remains, retry once with `--edge-contract 1`. Use `--edge-feather 0.25` only for visibly stair-stepped opaque edges. Do not feather pixel-runtime files.

### 5.5 Extraction validation

- Output is RGBA.
- All four corners have alpha `0`.
- Border median alpha is `0`.
- Opaque subject coverage is between 15% and 80% of the source.
- No pixels remain within 12 RGB units of the key at alpha above `32`.
- No fingers, tools, paper edges, antennae, or detached effect pieces were erased.
- Preview over white, black, signal red, and oxide green.
- `tools/validate_art_library.py` must report matching counts for source alpha, source keyed, normalized alpha, and normalized keyed inventories.

Complex hair, smoke, glass, reflections, and translucent materials are outside the chroma workflow. Simplify them into opaque graphic shapes or obtain approval for native transparency.

---

## 6. Spaced-Sheet Slicing

The repository tool can split separated transparent components or equal columns:

```powershell
python tools/slice_transparent_sprite_sheet.py `
  --input art/source/alpha/<sheet>.png `
  --out-dir art/working/<family> `
  --names <ordered names> `
  --prefix <stable prefix> `
  --size <temporary square size> `
  --mode columns
```

Use `--mode columns` for animation/rotation sheets because detached scraps and limbs can confuse connected-component detection. Use `components` only for simple single-piece pickups. Use `grouped` for three to six objects with detached details.

The current slicer creates square nearest-neighbor outputs and legacy-style temporary names. Treat these as working crops, not automatic final runtime frames. Finalization must:

1. Place each crop on the canonical canvas from the Art Production Bible.
2. Align the fixed pivot and ground baseline.
3. Downsample from source once using area/Lanczos reduction.
4. Quantize to the master palette.
5. Clean pixels manually.
6. Export final semantic filenames and metadata.

---

## 7. Identity-Anchor Workflow

Before generating animation for an enemy, boss, weapon, portrait, or recurring prop:

1. Write a one-page brief from the manifest and design document.
2. Generate three silhouette thumbnails.
3. Select one and generate a five-view model sheet: `F`, `FL`, `L`, `BL`, `B`.
4. Correct asymmetry, materials, and proportions through a targeted edit.
5. Create a transparent/keyed anchor contact sheet.
6. Reduce the front frame to runtime scale and test it in the comparison room.
7. Approve the anchor before animation prompts.

The saved anchor image is a required reference input for every subsequent generation in the family. If a generated pose drifts, edit against the anchor; do not compensate by rewriting the identity in prose.

### Anchor sheet prompt template

```text
Use case: stylized-concept
Asset type: identity model sheet for a low-resolution 2.5D game sprite
Primary request: create five consistent rotational views of [SUBJECT], ordered front, front-left three-quarter, left profile, back-left three-quarter, back.
Subject: [LOCKED IDENTITY DESCRIPTION]
Pose: neutral alert stance, identical pose in every view, feet planted, arms and equipment clearly separated from torso.
Materials: [LOCKED MATERIALS]
Lighting: identical hard upper-front-left key light in each view, weak neutral fill.
Composition: one horizontal row, identical scale and baseline, generous separation.
[SHARED INVARIANTS]
[CHROMA WORDING]
```

---

## 8. Enemy Animation Workflow

Generate animation by pose index across angles, not a full animation from one angle at a time. This keeps the pose event aligned rotationally.

Example order for `walk_02`:

```text
front, front-left, left, back-left, back, back-right, right, front-right
```

### Enemy pose prompt template

```text
Use case: stylized-concept
Asset type: rotational frames for an animated 2.5D game enemy
Input image: approved [SUBJECT] identity anchor; preserve it exactly.
Primary request: show [STATE AND POSE EVENT] in eight rotational views ordered [ANGLE ORDER].
Pose lock: [ANATOMICAL CONTACTS, WEAPON POSITION, ATTACK CHARGE/RELEASE, DAMAGE LOCATION].
Identity lock: same body proportions, materials, equipment side, damage, lights, and silhouette landmarks as the reference.
Composition: one horizontal row, identical scale, fixed foot baseline, generous separation.
[SHARED INVARIANTS]
[CHROMA WORDING]
```

### Animation review order

1. Front-view flipbook for timing and silhouette.
2. Eight-angle turntable for identity continuity.
3. Each pose index as a rotation strip.
4. Runtime animation in neutral light.
5. Runtime animation in darkest and brightest intended sectors.

---

## 9. View-Weapon Workflow

### Weapon anchor prompt template

```text
Use case: stylized-concept
Asset type: centered first-person view-weapon sprite source
Primary request: [WEAPON] held ready by the same catastrophe-adjuster hands, aimed toward center.
Weapon design: [LOCKED SILHOUETTE, MATERIALS, OPERATING METHOD].
Hands: charcoal catastrophe gloves, off-white fabric backs, one narrow signal-red seam; preserve the shared hand reference.
Perspective: centered early first-person presentation, mild operating-hand asymmetry, approximately 60 mm equivalent, no wide-angle distortion.
Composition: weapon and hands occupy the lower 60% of a square source, complete silhouette, generous side padding.
[SHARED INVARIANTS]
[CHROMA WORDING]
```

For fire strips, list the exact mechanical event in each left-to-right frame. Generate no more than six frames per call. Muzzle flashes should be absent when they are separate manifest assets.

Runtime review overlays crosshairs at `(160,72)`, canvas center, and safe-area boundaries. No weapon sight may drift more than four logical pixels between idle and pre-release frames unless recoil intentionally begins.

---

## 10. Pickup and Prop Workflow

### Product-lineup prompt template

```text
Use case: stylized-concept
Asset type: spaced pickup or prop sprites for a low-resolution 2.5D game
Primary request: create [COUNT] distinct but related [FAMILY] objects in this exact left-to-right order: [LIST].
View: consistent front three-quarter product angle, each object resting on the same invisible baseline.
Design goal: silhouettes must remain distinguishable at [RUNTIME CANVAS] without relying only on color.
Materials: [MATERIAL FAMILY].
Composition: one horizontal row, equal visual scale, generous separation, no overlap.
[SHARED INVARIANTS]
[CHROMA WORDING]
```

After the base object is approved, generate shine frames as controlled edits that change only highlight pixels or an attached glow. Do not regenerate the whole object for every shine frame.

---

## 11. Texture Workflow

Do not use chroma key for opaque tile textures.

### Seamless material prompt template

```text
Use case: stylized-concept
Asset type: seamless square source texture for a low-resolution 2.5D game
Primary request: a straight-on orthographic material sample of [MATERIAL], designed to tile seamlessly in both axes.
Material structure: [PANEL/JOINT/GRAIN SCALE AND DIRECTION].
Lighting: flat diffuse material reference, no directional gradient, hotspot, cast shadow, vignette, perspective, depth of field, or environment.
Color palette: [APPROVED RAMP].
Constraints: one material only, edge-to-edge, no objects, no signage, no text, no logo, no frame, no border.
```

### Texture finalization

1. Crop square and correct perspective.
2. Offset by 50% in both axes.
3. Repair the central seam without smearing structural rhythm.
4. Downsample to runtime size.
5. Quantize to palette.
6. Restore crisp panel lines and pixel clusters.
7. Preview as a `3x3` tile field in four sector light levels.
8. Add damage as a separate variant or overlay, never by painting every base tile independently.

Doors and control panels are front elevations, not seamless textures. Generate their states from the same approved housing reference.

---

## 12. Portrait and Illustration Workflow

### Portrait identity

Generate one neutral high-resolution identity anchor first. All damage tiers are edits of that anchor. Damage accumulates monotonically: soot, toner, small abrasions, then torn collar and severe exhaustion. Facial structure, hairline, camera, collar, and lighting never change.

Expressions are generated per damage tier as one spaced row. Reduce to `28x28`, where the art is extensively repainted for eye and mouth clarity.

### Intermission illustrations

- Generate without any text or UI.
- Compose for `320x200` with a 16-pixel safe border.
- Keep the central 65% readable under optional tallies.
- Preserve the game palette direction, but illustrations may initially use more source colors.
- Final version is reduced, palette-managed, and pixel-cleaned like all runtime art.

---

## 13. Generation Log

Append one JSON object per source to `manifests/generation-log.jsonl`:

```json
{"asset_id":"enemy.desk-warden.walk.02","revision":1,"date":"YYYY-MM-DD","tool":"built-in-imagegen","prompt_file":"art/briefs/enemy_desk-warden.md","reference_files":["art/references/enemy_desk-warden_anchor-v01.png"],"source_file":"art/source/imagegen/enemy_desk-warden_walk-02_v01.png","key":"#00FF00","status":"source-approved","notes":""}
```

Required fields: `asset_id`, `revision`, `date`, `tool`, `prompt_file`, `reference_files`, `source_file`, `key`, `status`, and `notes`.

---

## 14. Batch Stop Conditions

Stop generating a family and correct the anchor or prompt when any occurs twice:

- Material or equipment changes sides.
- Subject height differs by more than 3% across views.
- Chroma contamination removes subject detail.
- The model adds text, logos, frames, or floor shadows.
- Pose order is wrong or figures overlap.
- A silhouette becomes confusing at runtime scale.
- The result resembles a recognizable third-party design.
- Two consecutive revisions require extensive redraw of more than 25% of opaque pixels.

At that point, reduce the generation unit, simplify the design, or build the frame through a controlled edit/paintover.

---

## 15. Production Order

### Art target pack

1. Master palette preview and material strip.
2. Adjuster hand reference and portrait anchor.
3. Staple Driver view weapon and pickup.
4. Desk Warden complete sprite family.
5. Red credential and four basic pickups.
6. Office wall family with clean/damaged variants, door, switch, and floor.
7. Hitscan impact, ink hit, approval-ring teleport, and one projectile.
8. Final `320x200` comparison-room screenshot.

### Vertical-slice order

1. Remaining three view weapons.
2. Remaining five standard enemies and Regional Director mini-boss subset.
3. All recovery, armor, ammo, key, and powerup pickups used by the three maps.
4. Shared office, warehouse, flood, executive, and machinery texture families.
5. Interactive and decorative props.
6. HUD/status portrait, fonts, menus, and tallies.
7. Map-specific decals, skies, intermission, and ending card.

### Full campaign order

Produce the remaining arsenal and enemy roster before final maps so level composition uses the actual readable assets. Then finish episode texture libraries, map-specific props, skies, UI illustrations, and endings.

---

## 16. Definition of Pipeline-Ready

The pipeline is ready to scale when the art target pack demonstrates:

- Clean chroma removal on both green and magenta keys.
- Consistent eight-view identity and one complete animation.
- Correct fixed pivots and baseline in-engine.
- Palette reduction that retains material readability.
- A seamless material family at four light levels.
- A weapon aligned in both 4:3 and widescreen playfields.
- A portrait readable at `28x28` after aspect correction.
- Proven filenames, generation logs, and manifest state transitions.
