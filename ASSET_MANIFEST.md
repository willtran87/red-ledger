# RED LEDGER ART ASSET MANIFEST

**Status:** Full-game planning baseline  
**Companion documents:** [Art Production Bible](ART_PRODUCTION_BIBLE.md), [Image Generation Pipeline](IMAGEGEN_PIPELINE.md)  
**Tracking states:** `planned`, `briefed`, `anchor-approved`, `generated`, `alpha-clean`, `runtime-clean`, `in-engine`, `final`

This manifest defines all required art families. Individual frame files are expanded from the state patterns below. Additions require a documented gameplay or map need; omissions require design approval.

---

## 1. Frame Expansion Rules

### Enemy standard pattern

```text
idle:   2 x rotations
walk:   4 x rotations
attack: 4 x rotations unless overridden
pain:   1 x rotations
death:  6 x F
gib:    6 x F when enabled
corpse: 1 x F
```

Five-view actors use five authored rotations and three runtime mirrors. Eight-view actors author eight rotations. Death/gib frames do not rotate unless overridden.

### Pickup pattern

```text
base: 1 x F
shine: 4 x F
```

### Breakable prop pattern

```text
intact: 1
damage: 1
break: 4
debris: 2-4 static variants
```

### Texture family pattern

```text
clean, light-damage, heavy-damage, transition, trim, door/panel, accent
```

---

## 2. Enemy Families

| ID | Canvas | Views | Attack frames | Death | Extra states | Episode | Slice | State |
|---|---:|---:|---:|---:|---|---:|---|---|
| `enemy.returned-mail` | `64x72` | 5 | 3 | 6 + gib | emerge 3 | 1 | Yes | planned |
| `enemy.desk-warden` | `96x112` | 8 | 4 | 6 + gib | aim 2 | 1 | Yes | planned |
| `enemy.ember-clerk` | `96x112` | 5 | 4 | 6 + gib | charge 2 | 1 | Yes | planned |
| `enemy.exposure-hound` | `64x72` | 8 | 4 | 6 + gib | lunge 3 | 1 | Yes | planned |
| `enemy.coverage-drone` | `96x112` | 8 | 4 | 6 | hover 4 | 1 | Yes | planned |
| `enemy.liability-mass` | `128x144` | 8 | 5 | 7 + gib | charge 2 | 1 | Yes | planned |
| `enemy.denial-officer` | `128x144` | 8 | 5 | 7 + gib | lock-on 3 | 2 | No | planned |
| `enemy.subrogator` | `96x112` | 8 | 5 | 7 + gib | split-flinch 2 | 2 | No | planned |
| `enemy.reserve-eater` | `128x144` | 8 | 6 | 8 + gib | hazard-spit 5 | 2 | No | planned |
| `enemy.fraud-apparition` | `96x112` | 8 | 4 | 6 dissolve | reveal 4, fade 4 | 2 | No | planned |
| `enemy.cat-model` | `128x144` | 8 | 6 | 8 + gib | predict 4, impact-call 2 | 3 | No | planned |
| `enemy.bad-faith-counsel` | `128x144` | 8 | 5 | 7 dissolve | resurrect 6 | 3 | No | planned |

### Enemy identity briefs

| ID | Locked silhouette and materials | Key |
|---|---|---|
| `returned-mail` | Low hunched humanoid knot of envelopes, tape bands, bent mail-bin ribs, oversized red rejection stamp as head landmark | Green |
| `desk-warden` | Hollow office-security shell, squared shoulders, desk-lamp cyclops eye, perforated steel torso, compact staple weapon on anatomical right | Green |
| `ember-clerk` | Charred paper humanoid, white shirt remnants, narrow red tie, ember gaps in torso, two clear throwing hands | Green |
| `exposure-hound` | Low quadruped of measuring wheels, scorched binders, survey tape tendons, wedge-shaped head | Green |
| `coverage-drone` | Floating projector/camera body, four policy-ribbon stabilizers, cyan lens, no humanoid face | Magenta |
| `liability-mass` | Wide wax-and-stamp organism in shredded suit remnants, red translucent-looking but opaque attack sacs, heavy ground contact | Green |
| `denial-officer` | Tall plated adjuster, rotating shutter collar, long denial emitter, yellow-black warning hardware | Green |
| `subrogator` | Two offset torsos joined by one red case-file spine, mirrored arms, shared lower body | Green |
| `reserve-eater` | Vault-shaped torso, intake jaw, brass coin tracks, short load-bearing legs, wax pressure vessel on back | Magenta |
| `fraud-apparition` | Human signature outline built from contradictory document fragments, offset limbs, opaque graphic shimmer layers | Magenta |
| `cat-model` | Walking catastrophe terminal, four articulated legs, red hazard-map projector, cyan data aperture | Magenta |
| `bad-faith-counsel` | Empty legal robes suspended around a deposition lamp, paper-tab halo, long redaction sleeves | Green |

---

## 3. Boss Families

| ID | Canvas | Views | Required state groups | Episode | Slice | State |
|---|---:|---:|---|---:|---|---|
| `boss.regional-director` | `192x176` | 8 | idle 2, walk 4, canister 6, summon 6, pain 2, collapse 10, corpse 1 | 1 | Reduced | planned |
| `boss.aggregate` | `192x176` | 8 | idle 3, walk 4, left-emit 5, right-emit 5, dual 7, pain 2, collapse 12 | 2 | No | planned |
| `boss.chief-actuary` | `192x176` | 8 | idle 2, run 6, predict 6, salvo 6, pain 2, collapse 12 | 3 | No | planned |
| `boss.uninsurable` | World construction | F | sealed 1, gate-open 3, core 4, damage stages 3, destroy 16, debris 8 | 3 | No | planned |

Boss anchors require a scale lineup beside Desk Warden, Liability Mass, and the player collision silhouette.

### Boss identity briefs

| ID | Locked silhouette and materials | Key |
|---|---|---|
| `regional-director` | Broad executive exoskeleton around a small hollow suit core, rectangular shutter shoulders, paired red response-canister racks, brass authority cylinder at sternum, heavy squared feet | Green |
| `aggregate` | Towering asymmetric joined-loss body made from flood tanks, data racks, vehicle plate, hotel structure, and compressed records; visually separate left and right emitters with different silhouettes | Magenta |
| `chief-actuary` | Fast six-limbed calculation machine, low forward brass chassis, black articulated legs, abacus-like spine, single cyan prediction aperture, narrow red rate bands | Magenta |
| `uninsurable` | World-integrated reserve engine behind three mechanically distinct binding gates; black paper conduits feed a faceted red-wax core inside a brass calculation frame; no face or humanoid anatomy | Green |

The vertical slice uses `regional-director` states `idle`, `walk`, `canister`, `pain`, and an eight-frame temporary collapse. Summon frames and final ten-frame collapse arrive with Episode 1 production.

---

## 4. View Weapons

| ID | Idle | Fire sequence | Dry | Separate flash/effects | Pickup | Slice | State |
|---|---:|---:|---:|---|---|---|---|
| `weapon.claim-stamp` | 1 | 5 | 0 | impact stamp 4, ink flecks 3 | No | No | planned |
| `weapon.staple-driver` | 1 | 4 | 1 | muzzle snap 2, staple impact 4 | Yes | Yes | planned |
| `weapon.twin-bore-riveter` | 1 | 5 | 1 | dual flash 3, fastener impact 4 | Yes | Yes | planned |
| `weapon.audit-repeater` | 2 | 4 loop | 1 | flash 3, casing/paper eject 4 | Yes | Yes | planned |
| `weapon.catastrophe-launcher` | 1 | 5 | 1 | canister projectile 4x8, explosion 8 | Yes | Yes | planned |
| `weapon.plasma-copier` | 2 | 4 loop | 1 | cyan bolt 4x8, impact 6 | Yes | No | planned |
| `weapon.binding-engine` | 2 | 7 | 1 | beam start 4, beam loop 4, impact 8 | Yes | No | planned |
| `weapon.umbra-saw` | 2 | 6 loop | 0 | sparks 5, contact debris 4 | Yes | No | planned |

### Weapon identity briefs

| ID | Locked silhouette and operation | Key |
|---|---|---|
| `claim-stamp` | Oversized rectangular self-inking stamp, two-hand downward drive, red pad visible only during return | Green |
| `staple-driver` | Compact pneumatic industrial stapler, squared white/steel housing, small red pressure gauge | Green |
| `twin-bore-riveter` | Broad two-channel salvage riveter, stacked pressure chambers, mechanical break/open recoil without reload | Green |
| `audit-repeater` | Motorized document perforator, rotating feed drum, paper-strip ejection, narrow long silhouette | Green |
| `catastrophe-launcher` | Heavy suppression-canister projector, open red canister cradle, warning-yellow latch | Green |
| `plasma-copier` | Copier-derived cyan emitter, sliding scan bar, off-white panels over black machinery | Magenta |
| `binding-engine` | Portable policy-binding core, brass frame, cyan-white chamber, red mechanical clamps | Magenta |
| `umbra-saw` | Rotary salvage cutter with three offset protective roof plates; never an umbrella canopy | Green |

---

## 5. Pickups

### Ammunition

| ID | Canvas | Family variants | Slice | State |
|---|---:|---|---|---|
| `pickup.staples-small` | `48x48` | loose box | Yes | planned |
| `pickup.staples-large` | `64x64` | shipping carton | Yes | planned |
| `pickup.fasteners-small` | `48x48` | red strip pack | Yes | planned |
| `pickup.fasteners-large` | `64x64` | steel case | Yes | planned |
| `pickup.canister-single` | `48x48` | one suppression canister | Yes | planned |
| `pickup.canister-crate` | `64x64` | four-canister rack | Yes | planned |
| `pickup.toner-small` | `48x48` | cyan cell | No | planned |
| `pickup.toner-large` | `64x64` | dual-cell copier pack | No | planned |

### Recovery and protection

| ID | Canvas | Visual | Slice | State |
|---|---:|---|---|---|
| `pickup.bandage` | `48x48` | white adhesive packet with red block icon | Yes | planned |
| `pickup.medical-case` | `64x64` | charcoal field case, white latch, red block icon | Yes | planned |
| `pickup.goodwill-token` | `48x48` | red enamel coin with shelter seal | Yes | planned |
| `pickup.loss-control-vest` | `64x64` | charcoal vest with white plates | Yes | planned |
| `pickup.catastrophe-suit` | `64x64` | folded heavy oxide/charcoal suit | Yes | planned |
| `pickup.emergency-reserve` | `64x64` | illuminated white reserve capsule with red clamps | No | planned |

### Credentials

| ID | Canvas | Visual | Slice | State |
|---|---:|---|---|---|
| `pickup.credential-red` | `48x48` | signal-red access card, shelter seal cutout | Yes | planned |
| `pickup.credential-cyan` | `48x48` | cyan catastrophe badge, octagonal silhouette | Yes | planned |
| `pickup.credential-yellow` | `48x48` | brass executive seal, circular notched silhouette | Yes | planned |

### Powerups

| ID | Canvas | Visual | Slice | State |
|---|---:|---|---|---|
| `pickup.temporary-binder` | `64x64` | white-red locking mechanism | No | planned |
| `pickup.night-goggles` | `64x64` | compact cyan-lens inspection goggles | Yes | planned |
| `pickup.hazard-endorsement` | `64x64` | sealed yellow rider capsule | Yes | planned |
| `pickup.rapid-authority` | `64x64` | motorized red approval wheel | No | planned |
| `pickup.floor-plan` | `64x64` | rolled plan with glowing cyan grid | Yes | planned |
| `pickup.forensic-lens` | `64x64` | signature-analysis lens in charcoal frame | No | planned |

All pickups follow base plus four-frame shine unless the runtime uses a procedural palette pulse approved during the art target.

---

## 6. Effects

| ID | Canvas | Frames/views | Blend | Slice | State |
|---|---:|---|---|---|---|
| `fx.teleport-approval-ring` | `64x64` | 8 F | Opaque | Yes | planned |
| `fx.hit-ink-small` | `32x32` | 4 F | Opaque | Yes | planned |
| `fx.hit-ink-large` | `64x64` | 6 F | Opaque | Yes | planned |
| `fx.hit-spark` | `32x32` | 4 F | Additive/opaque | Yes | planned |
| `fx.hit-paper` | `32x32` | 4 F | Opaque | Yes | planned |
| `fx.staple-impact` | `32x32` | 4 F | Opaque | Yes | planned |
| `fx.fastener-impact` | `32x32` | 4 F | Opaque | Yes | planned |
| `fx.canister-projectile` | `48x48` | 4x8 | Opaque | Yes | planned |
| `fx.canister-explosion` | `96x96` | 8 F | Opaque/additive core | Yes | planned |
| `fx.ember-claim-fire` | `32x32` | 4x8 | Opaque | Yes | planned |
| `fx.coverage-bolt` | `32x32` | 4x8 | Additive/opaque | Yes | planned |
| `fx.liability-orb` | `48x48` | 4x8 | Opaque | Yes | planned |
| `fx.plasma-bolt` | `32x32` | 4x8 | Additive | No | planned |
| `fx.binding-beam` | Tiled | start 4, loop 4, end 8 | Additive | No | planned |
| `fx.denial-beam` | Tiled | start 3, loop 2, impact 5 | Additive | No | planned |
| `fx.reserve-hazard` | `64x64` | 6 F | Opaque | No | planned |
| `fx.fraud-reveal` | `96x112` | 6 F | Dithered | No | planned |
| `fx.prediction-zone` | `64x64` tile | 4 F | Additive | No | planned |
| `fx.ceiling-impact` | `96x96` | 8 F | Opaque | No | planned |
| `fx.resurrection-redaction` | `96x112` | 8 F | Opaque/dithered | No | planned |
| `fx.generic-debris-paper` | `32x32` | 6 variants | Opaque | Yes | planned |
| `fx.generic-debris-metal` | `32x32` | 6 variants | Opaque | Yes | planned |
| `fx.generic-debris-wax` | `32x32` | 6 variants | Opaque | No | planned |
| `fx.particle-weapon-feedback` | `32x32` | 8 variants | Opaque | Yes | produced |
| `fx.particle-world-feedback` | `32x32` | 8 variants | Opaque/additive | Yes | produced |
| `fx.particle-death-feedback` | `32x32` | 8 variants | Opaque | Yes | produced |

---

## 7. Structural Texture Families

Each family expands through the texture-family pattern unless exceptions are listed.

| ID | Size | Variants beyond base pattern | Episode | Slice | State |
|---|---:|---|---:|---|---|
| `tex.office-drywall-white` | `64x64` | wet, charred | 1 | Yes | planned |
| `tex.office-drywall-gray` | `64x64` | wet, wax-invasive | 1 | Yes | planned |
| `tex.acoustic-panel` | `64x64` | missing-tile, stained | 1 | Yes | planned |
| `tex.commercial-carpet-charcoal` | `64x64` | wet, burned | 1 | Yes | planned |
| `tex.commercial-carpet-red` | `64x64` | worn, burned | 1 | Yes | planned |
| `tex.rubber-baseboard` | `32x64` | corner, damaged | 1 | Yes | planned |
| `tex.frosted-glass` | `64x64` | cracked, broken | 1 | Yes | planned |
| `tex.wire-glass` | `64x64` | cracked, broken | 1 | Yes | planned |
| `tex.elevator-steel` | `128x128` | dented, wax-invasive | 1 | Yes | planned |
| `tex.perforated-shutter` | `128x128` | bent, open-state | 1 | Yes | planned |
| `tex.concrete-interior` | `64x64` | wet, cracked, charred | 1 | Yes | planned |
| `tex.parking-concrete` | `128x128` | oil, flood-line | 1 | Yes | planned |
| `tex.wet-asphalt` | `64x64` | drain, painted-line | 1/2 | Yes | planned |
| `tex.loading-plate` | `64x64` | bent, hazard-edge | 1/2 | Yes | planned |
| `tex.archive-cardboard` | `64x64` | torn, burned, waxed | 1 | Yes | planned |
| `tex.paper-stack` | `64x64` | red-folder, blackened | 1 | Yes | planned |
| `tex.thermal-label-grid` | `64x64` | corrupted, redacted | 1 | Yes | planned |
| `tex.industrial-steel` | `128x128` | rust-light, flood, char | 2 | Yes | planned |
| `tex.corrugated-metal` | `64x64` | bent, torn | 2 | Yes | planned |
| `tex.flood-wall` | `128x128` | high-water, scum | 2 | Yes | planned |
| `tex.oxidized-pipe` | `64x64` | joint, valve panel | 2 | Yes | planned |
| `tex.hotel-wallpaper` | `64x64` | wet, peeled, blackened | 2 | No | planned |
| `tex.data-center-panel` | `128x128` | open, failed, cyan-active | 2 | No | planned |
| `tex.train-car-steel` | `128x128` | door, damaged, red line | 2 | No | planned |
| `tex.salvage-sheet` | `64x64` | cut, stacked, burned | 2 | No | planned |
| `tex.litigation-stone` | `128x128` | cracked, redacted | 2/3 | No | planned |
| `tex.toner-sludge` | `64x64` | 4 animated frames | 2/3 | Yes | planned |
| `tex.red-wax` | `64x64` | 4 animated frames, hardened | 3 | Yes | planned |
| `tex.brass-calculator` | `128x128` | active, broken, overheated | 3 | Yes | planned |
| `tex.compressed-paper-stone` | `128x128` | cracked, carved, wet | 3 | No | planned |
| `tex.bone-paper` | `64x64` | ribbed, torn, redacted | 3 | No | planned |
| `tex.probability-grid` | `128x128` | 4 animated frames, failed | 3 | No | planned |
| `tex.reserve-vault` | `128x128` | locked, open, ruptured | 3 | No | planned |
| `tex.white-void-panel` | `128x128` | fractured, shadowed | 3 | No | planned |

Target after family expansion: 230-290 wall/flat/door/switch runtime images.

---

## 8. Doors, Switches, and Credentials

| ID | Size | States | Slice | State |
|---|---:|---|---|---|
| `door.office-standard` | `64x128` | closed, moving, open-edge, damaged | Yes | planned |
| `door.archive-red` | `64x128` | locked, unlocked, moving | Yes | planned |
| `door.catastrophe-cyan` | `64x128` | locked, unlocked, moving | Yes | planned |
| `door.executive-yellow` | `64x128` | locked, unlocked, moving | Yes | planned |
| `door.fire-shutter` | `64x128` | closed, warning, moving, bent | Yes | planned |
| `door.loading-bay` | `128x128` | closed, moving, damaged | Yes | planned |
| `door.elevator` | `64x128` | closed, split-open, failed | Yes | planned |
| `door.vault` | `128x128` | sealed, unlocked, open-edge | No | planned |
| `door.wax-gate` | `128x128` | sealed, melting 4, open | No | planned |
| `switch.wall-basic` | `32x32` | off, on, failed | Yes | planned |
| `switch.pump` | `64x64` | off, active, overload | Yes | planned |
| `switch.archive` | `64x64` | off, active | Yes | planned |
| `switch.executive` | `64x64` | locked, ready, active | Yes | planned |
| `switch.actuarial` | `64x64` | idle, calculating 4, complete | No | planned |
| `sign.lock-red` | `32x32` | locked, accepted | Yes | planned |
| `sign.lock-cyan` | `32x32` | locked, accepted | Yes | planned |
| `sign.lock-yellow` | `32x32` | locked, accepted | Yes | planned |
| `sign.exit` | `64x32` | idle, active 2 | Yes | planned |

Signage uses icons and authored bitmap glyphs. No generated text is embedded.

---

## 9. Props

### Interactive and breakable

| ID | Canvas/type | States | Slice | State |
|---|---|---|---|---|
| `prop.copier-bank` | World geometry + `128x128` | intact, damage, break 5, open | Yes | planned |
| `prop.suppression-cylinder` | `64x80` | idle, hit, explode 8, debris | Yes | planned |
| `prop.pneumatic-tube` | World + `64x64` | idle, transit 4, deliver 4 | Yes | planned |
| `prop.rolling-shelf` | World + `128x128` | closed, moving, open | Yes | planned |
| `prop.flood-pump` | World + `128x128` | off, active 4, failed | Yes | planned |
| `prop.generator` | World + `128x128` | off, active 4, overload 6 | Yes | planned |
| `prop.vehicle-lift` | World + `128x128` | low, moving, high | Yes | planned |
| `prop.phone` | `48x48` | idle, ring 2, broken | Yes | planned |
| `prop.claim-terminal` | World + `64x64` | idle, active 4, failed | Yes | planned |
| `prop.catastrophe-model` | World + `128x128` | idle, active 4, broken | No | planned |

### Decorative families

Each family requires the listed count of silhouette variants plus one damaged palette/material variant where appropriate.

| Family | Count | Slice | State |
|---|---:|---|---|
| Office desks | 6 | Yes | planned |
| Office chairs | 4 | Yes | planned |
| Queue barriers | 3 | Yes | planned |
| Filing cabinets | 5 | Yes | planned |
| Mail bins/carts | 5 | Yes | planned |
| Break-room appliances | 6 | Yes | planned |
| Personal desk objects | 8 | Yes | planned |
| Warehouse pallets/crates | 8 | Yes | planned |
| Damaged vehicles | 8 | Yes | planned |
| HVAC and roof equipment | 6 | Yes | planned |
| Flood debris | 8 | Yes | planned |
| Hotel furniture | 8 | No | planned |
| Data-center racks | 6 | No | planned |
| Train equipment | 6 | No | planned |
| Salvage machinery | 8 | No | planned |
| Court/litigation furniture | 6 | No | planned |
| Brass actuarial machines | 10 | No | planned |
| Compressed-paper formations | 8 | No | planned |

---

## 10. Skies and Environmental Overlays

| ID | Size | Description | Episode | Slice | State |
|---|---:|---|---:|---|---|
| `sky.storm-campus` | `1024x128` | Regional campus under red-black storm shelf | 1 | Yes | planned |
| `sky.catastrophe-city` | `1024x128` | Flooded industrial city, distant response lights | 2 | No | planned |
| `sky.actuarial-void` | `1024x128` | White-black probability void with brass structures | 3 | No | planned |
| `overlay.rain` | `64x64` | 4 tileable frames | 1/2 | Yes | planned |
| `overlay.water-drip` | `32x64` | 6 frames | 1/2 | Yes | planned |
| `overlay.ash` | `64x64` | 4 tileable frames | 1/3 | Yes | planned |
| `overlay.redaction` | `64x64` | 4 dithered frames | 3 | No | planned |

---

## 11. HUD and Menus

| ID | Size/count | Slice | State |
|---|---:|---|---|
| `ui.status-bar` | `320x32` | Yes | planned |
| `ui.portrait` | 34 x `28x28` | Yes | planned |
| `ui.credential-icons` | 6 x `12x10` | Yes | planned |
| `ui.weapon-icons` | 8 x `16x8` | Yes | planned |
| `ui.ammo-icons` | 4 x `10x10` | Yes | planned |
| `ui.minimal-hud-icons` | 16 x variable | Yes | planned |
| `ui.crosshair` | 6 x `9x9` | Yes | planned |
| `ui.automap-icons` | 12 x `8x8` | Yes | planned |
| `ui.menu-background` | `320x200` | Yes | planned |
| `ui.title-screen` | `320x200` | Yes | planned |
| `ui.pause-plaque` | `128x24` | Yes | planned |
| `ui.selector` | 4 frames x `16x16` | Yes | planned |
| `ui.slider` | rail + knob + states | Yes | planned |
| `ui.toggle` | off/on/focus/disabled | Yes | planned |
| `ui.save-thumbnail-frame` | `96x60` | Yes | planned |
| `ui.difficulty-icons` | 5 x `32x32` | Yes | planned |
| `ui.end-map-tally` | panel + icons | Yes | planned |
| `ui.episode-select` | 3 cards x `128x80` | No | planned |

---

## 12. Fonts

| ID | Cell/height | Glyph coverage | State |
|---|---:|---|---|
| `font.ledger-small` | `6x8` | Latin upper/lower, digits, punctuation, symbols | planned |
| `font.ledger-numeric` | `12x18` | digits, percent, plus, minus, slash | planned |
| `font.ledger-title` | 24 px | uppercase, digits, punctuation | planned |

Fonts are authored, not image-generated as text. Image generation may supply abstract texture inspiration only.

---

## 13. Narrative and Map Illustrations

| ID | Size | Description | Slice | State |
|---|---:|---|---|---|
| `illustration.episode-1-intro` | `320x200` | Quiet campus before catastrophe | Yes | planned |
| `illustration.episode-1-outro` | `320x200` | Regional machine breached | Yes | planned |
| `illustration.episode-2-intro` | `320x200` | Response convoy entering flooded city | No | planned |
| `illustration.episode-2-outro` | `320x200` | Aggregate hall collapsing | No | planned |
| `illustration.episode-3-intro` | `320x200` | Descent through impossible ledger strata | No | planned |
| `illustration.episode-3-outro` | `320x200` | Reserve core exposed | No | planned |
| `illustration.final-epilogue` | `320x200` | Dawn over repaired ordinary office | No | planned |
| `map.intermission-episode-1` | `320x200` | Campus/branch progression map | Yes | planned |
| `map.intermission-episode-2` | `320x200` | Catastrophe city progression map | No | planned |
| `map.intermission-episode-3` | `320x200` | Actuarial underworld progression map | No | planned |
| `map.marker-current` | 4 x `16x16` | Animated current-map marker | Yes | planned |
| `map.marker-complete` | `16x16` | Shelter-seal completion stamp | Yes | planned |

No illustration contains embedded narrative text. Copy is rendered separately with the bitmap font.

---

## 14. Map-Specific Decal Budget

Each normal map receives:

- Two location identity decals.
- Two operational icon decals.
- Two damage/story decals.
- One secret clue decal.

Each boss map receives three additional mechanism decals. Secret maps receive six bespoke humorous/environmental decals. Total budget for 27 maps: approximately 210 decals, primarily `32x32`, `64x64`, and `128x64`.

Decal copy uses authored font glyphs at composition time; image-generated sources contain shapes only.

---

## 15. Map Art Bundles

Each map receives one bundle brief before final art. Shared structural families come from section 7; the bundle below defines its unique first-viewport landmark, bespoke prop or mechanism, and decal subject. These are requirements, not permission to embed generated text.

| Map | Hero landmark | Bespoke art/mechanism | Decal subjects |
|---|---|---|---|
| E1M1 | Glass branch-office lobby over parking deck | Intake kiosk and access-card reader | Parking arrows, reception icon, evacuation clue |
| E1M2 | Terraced call-center floor | Cubicle shutter banks and mail-router spine | Queue status blocks, headset icon, routing arrows |
| E1M3 | Flooded vehicle inspection bay | Three damaged vehicle lifts | Bay numbers, waterline marks, total-loss stamp shapes |
| E1M4 | Restoration turbine chamber | Pump manifold and drying fan | Moisture diagram, flow arrows, hazard endorsement icon |
| E1M5 | Central archive lift between moving stacks | Rolling-shelf machinery | Retention bands, shelf geometry clue, red-folder markers |
| E1M6 | Multi-floor tower atrium | Suspended meeting pods and elevator banks | Floor directory icons, department bands, fire route |
| E1M7 | Boardroom split over calculation machinery | Opening conference table and brass underfloor | Authority seals, voting lights, hidden descent diagram |
| E1M8 | Fortress atrium with response seal floor | Regional Director dais and shutter portals | Regional map, authority rank shapes, binding gate icons |
| E1M9 | Perfect modular model home street | Breakaway walls and peril demonstration rigs | Home-system icons, staged warning symbols, secret jokes |
| E2M1 | Lightning-lit response hangar | Moving container lanes and dispatch crane | Convoy arrows, zone colors, weather warning blocks |
| E2M2 | Submerged hotel lobby chandelier | Water-level controls and guest stair loops | Room icons, floor marks, flood evacuation path |
| E2M3 | Cyan data-routing core | Power transfer columns and server shutters | Circuit routes, redundancy symbols, failure blocks |
| E2M4 | Armored records train in switching depot | Moving train consist and platform bridges | Car identifiers, switching arrows, transit hazard icons |
| E2M5 | Salvage crusher canyon | Vehicle crushers and suspended equipment | Lot symbols, cut lines, salvage classification marks |
| E2M6 | Three-pump flood-control nave | Pump turbines and channel gates | Flow diagram, depth bands, pump-state icons |
| E2M7 | Evidence repository atrium | Contradictory deposition-room teleport sets | Exhibit tabs, route contradictions, redaction marks |
| E2M8 | Flooded aggregate data hall | Sinking cover islands and dual-emitter boss platform | Joined-loss diagram, emitter status, evacuation rings |
| E2M9 | Cheerful modular training town | Breakaway sets, camera rigs, observer booth | Training targets, artificial weather icons, stage marks |
| E3M1 | Brass premium crucible | Currency channels and binding furnaces | Rate bands, flow arrows, furnace authority seals |
| E3M2 | Giant sliding mortality table | Row and column drive mechanisms | Age bands, probability blocks, alignment clues |
| E3M3 | Concentric treaty vault doors | Threat-transfer machinery | Layer icons, transfer arrows, sealed-limit marks |
| E3M4 | Calculation altar above white void | Rotating prediction floor sectors | Future-impact rings, sequence clues, risk constellations |
| E3M5 | Wax-lit reserve shaft | Descending central lift and storage wells | Depth measures, reserve bands, ledge-route clues |
| E3M6 | Black-and-white redaction court | Erasing wall planes and evidence seals | Exhibit shapes, erased arrows, restoration sequence |
| E3M7 | Endless ledger feed mechanism | Distorted landmark modules from episodes 1 and 2 | Repeated corrupted icons, feed direction, terminal warnings |
| E3M8 | Reserve core behind three binding gates | Chief Actuary platform, gate machinery, core damage stages | Three gate seals, prediction warnings, core-state rings |
| E3M9 | Onboarding soundstage office | Painted flats, studio lamps, hidden machinery | Smile shapes, camera marks, orientation-step icons |

Every bundle also includes one `320x200` art target capture, a minimap thumbnail for the intermission artist, and a material-use list.

---

## 16. Comparison and Approval Assets

These non-shipping assets are required to keep scale and style stable:

| ID | Deliverable | State |
|---|---|---|
| `guide.scale-lineup` | Player proxy, every enemy, every boss on common baseline | planned |
| `guide.weapon-lineup` | All idle view weapons on 320x168 overlays | planned |
| `guide.pickup-lineup` | All pickups on light/dark/checker backgrounds | planned |
| `guide.material-board` | Master texture families and palette ramps | planned |
| `guide.effect-board` | Every effect over four backgrounds | planned |
| `guide.ui-board` | Status bar, minimal HUD, menus, fonts, aspect-correct views | planned |
| `guide.art-target-room` | Final 320x200 representative gameplay screenshot | planned |

---

## 17. Completeness Gate

Art production is complete only when:

- Every manifest row is `final` or explicitly waived with a reason.
- Expanded animation frame counts match actor metadata.
- Every texture referenced by a map exists and passes seam validation where required.
- Every visible pickup and weapon has both world and view representation as applicable.
- All UI states have keyboard, mouse, controller, focus, disabled, and selected visuals where applicable.
- All generated sources have provenance log entries.
- The public runtime tree contains no licensed/internal asset.
- The prohibited-name/logo scan is clean.
- Full-campaign capture confirms no missing sprites, pink keys, alpha boxes, pivot jumps, or unreadable critical objects.
