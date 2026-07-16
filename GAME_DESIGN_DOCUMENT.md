# RED LEDGER

## Preproduction Game Design Document

**Document status:** Concept / preproduction plan  
**Target:** Desktop and browser, single player first  
**Genre:** Fast 2.5D first-person shooter  
**Reference experience:** The combat tempo, spatial grammar, readability, and technical presentation of a 1993 shareware shooter  
**Working tagline:** Every loss must be adjusted.

**Production companions:** [Art Production Bible](ART_PRODUCTION_BIBLE.md), [Image Generation Pipeline](IMAGEGEN_PIPELINE.md), [Asset Manifest](ASSET_MANIFEST.md)

---

## 1. High Concept

An overnight catastrophe has turned a regional insurance campus into an impossible labyrinth. The player is the last field adjuster still on duty. Armed with improvised office equipment and industrial response tools, they fight corrupted claim forms, predatory middle managers, animated hazards, and vast actuarial entities while tracing the loss from a damaged branch office to the infernal engine beneath the company.

The game should feel immediately familiar to a player who understands early 1990s shooters: extremely fast ground movement, no reloading, generous weapon switching, distinct monster silhouettes, compact looping maps, colored keys, secrets, traps, resource pressure, and a face-driven status bar. The theme changes completely, but the cadence does not.

The shipped game never names or spells out the real-world brand that inspired its palette. In-world identity is communicated through red, black, white, brushed steel, office architecture, protection imagery, policy language, catastrophe-response equipment, and a recurring shelter motif.

### Player fantasy

> I am an absurdly capable catastrophe adjuster descending through a bureaucracy that has become physically hostile, solving spaces at full speed and turning administrative tools into overwhelming weapons.

### Tone

- Deadpan corporate horror, not broad parody.
- Aggressive and kinetic in play; eerily procedural between fights.
- Graphic and crunchy rather than realistic or gruesome.
- Environmental jokes reward attention but never interrupt movement.
- The company appears competent on the surface and cosmically compromised underneath.

---

## 2. Product Boundaries

### 2.1 What “faithful” means

Faithfulness applies to the experiential grammar:

- Immediate starts and short time-to-action.
- High movement speed with acceleration that is quick but perceptible.
- 2.5D sector-based spaces, billboard sprites, no required vertical aiming.
- Hitscan and slow projectile threats mixed in readable combinations.
- Enemy infighting.
- No reload, aim-down-sights, sprint meter, skill tree, crafting, or cover system.
- Hand-authored maps built around loops, keys, landmarks, ambushes, and secrets.
- Six core weapons plus the starting tool and one rare superweapon.
- Persistent health, armor, ammunition, and weapons across an episode.
- End-of-map tallies for kills, items, secrets, and completion time.
- Five difficulty settings that alter placements and pressure, not enemy health.
- A low-resolution software-rendered look presented sharply at modern resolutions.

Faithfulness does **not** mean copying source maps, code, names, dialogue, sprites, textures, music, sound effects, UI layout pixel-for-pixel, or enemy designs. All expressive content must be original.

### 2.2 Trademark and release tracks

The red umbrella mark is a registered trademark for insurance and financial services. The real brand’s published legal terms also state that use of its trademarks requires permission. This plan therefore supports two tracks:

**Licensed/internal track**

- Exact approved logo, palette, proportions, spacing, and brand assets may be used only with written authorization and a supplied asset kit.
- Brand review is a content gate at concept, vertical slice, beta, and release candidate.
- No artist redraws the mark from memory.

**Public/unlicensed track**

- Use the working fictional company identity **Red Ledger Mutual**.
- Use a distinct “shelter seal”: three offset roof panels over a square, never an umbrella silhouette.
- Use an original red led by `#D9232E`, supported by charcoal, paper white, safety yellow, oxidized green, and electric cyan.
- Do not use the real company name, slogan, typography lockup, legal text, building likenesses, or exact logo.
- Run trademark and trade-dress review before public marketing.

The rest of this document uses the public/unlicensed track as its safe production default.

### 2.3 Copyright boundary

- Build original maps from the level grammar below; do not trace or transform original map geometry.
- Create all sprites, textures, sounds, music, fonts, intermission screens, and UI from scratch.
- Treat original gameplay statistics as reference points to tune against, not data to ship verbatim without review.
- Do not package or require commercial game data files.
- If an existing engine or source port is used, record its license and distribution obligations before implementation.

---

## 3. Design Pillars

### 3.1 Move like an emergency

Traversal is a combat verb. The player should circle threats, cross rooms before projectiles arrive, herd enemies into crossfire, and use doors and corners without the game feeling like a cover shooter.

### 3.2 Read the room in one second

Enemy silhouettes, projectile colors, pickups, doors, lifts, keys, and hazards must remain legible at an internal 320x200 presentation. Each combat space needs a recognizable landmark and a dominant movement route.

### 3.3 Turn bureaucracy into architecture

Forms, queues, records, cubicles, mail systems, elevators, loss diagrams, and policy exclusions become spatial mechanisms. The satire is embedded in doors, traps, and props rather than explanatory dialogue.

### 3.4 Reward nerve and curiosity

Players who push forward get ammunition, space, and monster infighting. Players who inspect suspicious walls, sightlines, and sound cues find shortcuts, weapons, jokes, and optional fights.

### 3.5 Escalate from plausible to impossible

Episode one begins in recognizable offices and response facilities. By the finale, filing systems are temples, premium calculations power machinery, and the company seal is embedded in the geology.

---

## 4. Target Experience and Scope

### 4.1 Full game

- Three episodes, nine maps each.
- One secret map per episode.
- Target first-play campaign length: 6-9 hours.
- Target experienced play time: 15-35 minutes per map.
- Single-player campaign at launch.
- Optional local save slots, quicksave, quickload, level select after completion, and demo recording/playback.
- Deathmatch/co-op are post-launch only; architecture should avoid making them impossible.

### 4.2 Vertical slice

Build three connected maps representing the full quality bar:

1. **First Notice**: onboarding, branch office, basic firearm, red access card.
2. **Total Loss**: catastrophe warehouse and flooded vehicle bay, first major nonlinear loop.
3. **The Underwriting Floor**: executive maze descending into impossible machinery, mini-boss climax.

The slice includes four weapons, six enemy types, two armor tiers, three keys, six secrets, one environmental hazard family, end-map tallies, save/load, two difficulty settings, and a complete audio/visual identity.

### 4.3 Non-goals for version 1.0

- Cinematic cutscenes or voiced story scenes.
- Procedural maps.
- Loot rarity, inventory grids, weapon attachments, or character builds.
- Required jumping, crouching, leaning, mantling, or free-look.
- Realistic ballistics, location damage, or physics destruction.
- Live service systems, accounts, telemetry-dependent progression, or monetization.

---

## 5. Core Game Loop

1. Enter a hostile operational zone with limited context.
2. Read landmarks, locked routes, hazards, and enemy composition.
3. Fight while moving, choosing weapons by range, ammunition, and crowd shape.
4. Find access credentials and operate switches, lifts, shutters, and claim-routing machinery.
5. Loop back through recontextualized spaces; survive repopulation or ambushes.
6. Spend risk to search for secrets and resources.
7. Reach the loss-control terminal and close the map.
8. Review kills, items, secrets, and time; carry resources into the next map.

---

## 6. Player Model

### 6.1 Movement

- Movement is fast enough to outrun common projectiles laterally.
- Forward and strafe speeds are equal unless playtesting proves diagonal movement too dominant.
- Acceleration reaches useful combat speed quickly; release friction remains low enough for flow but not ice-skating.
- Player collision is a simple cylinder/capsule with classic step-up behavior.
- Automatic step-up handles low ledges and stairs.
- No mandatory jump. A hidden optional “modern movement” setting may enable jump but maps cannot depend on it.
- Vertical look is cosmetic/optional; weapons auto-aim within a conservative cone by default.
- Use interaction opens doors, presses switches, and activates lifts.
- Getting hurt never steals input through long animations.

### 6.2 Health and protection

- Base health maximum: 100.
- Small rare over-heal items allow health above the normal maximum.
- Light protection vest absorbs a minority of incoming damage.
- Heavy catastrophe suit absorbs a larger share until depleted.
- Damage feedback combines palette flash, directional screen-edge cue, face portrait reaction, and distinct audio.
- Environmental damage is pulse-based and predictable enough to route through.

### 6.3 Interaction rules

- Doors clearly distinguish usable, locked, remote-controlled, and decorative states.
- Every failed interaction returns a short sound plus color/icon feedback.
- Switches visibly change state.
- Critical lifts return or remain recoverable; the player cannot soft-lock the map.
- Keys are large, luminous credentials: red access card, cyan catastrophe badge, yellow executive seal.

### 6.4 Controls

| Action | Keyboard/mouse default | Controller default |
|---|---|---|
| Move | WASD | Left stick |
| Turn/aim | Mouse | Right stick |
| Fire | Left mouse | Right trigger |
| Use | E / Space | South face button |
| Run | Always run; Shift toggles walk | Always run; stick tilt |
| Weapon next/previous | Wheel | Bumpers |
| Direct weapon | 1-8 | Radial on hold |
| Automap | Tab | View/Select |
| Quick save/load | F6/F9 | Pause menu |

The mouse should feel modern by default, while a “1993 input” preset offers keyboard turning and original-style restrictions.

---

## 7. Combat Model

### 7.1 Combat principles

- Position and threat selection matter more than precision aim.
- Every enemy has a clear sound, silhouette, wind-up, pain response, and death read.
- Hitscan enemies create urgency; projectile enemies create movement patterns.
- Doorways help briefly but cannot trivialize every encounter.
- Splash damage is powerful and dangerous at close range.
- Monsters can damage and provoke one another, creating intentional infighting opportunities.
- Corpses remain as navigational memory unless performance requires capped persistence.

### 7.2 Damage and feedback

- Use discrete damage ranges to preserve volatility.
- Weapons produce immediate audio, view-sprite recoil, muzzle flash, target pain chance, and wall impact.
- Blood is replaced by stylized black ink, red approval-stamp fragments, paper fibers, sparks, and hazard fluid according to enemy family.
- Avoid screen shake on rapid weapons; reserve brief, configurable shake for explosions and boss attacks.
- Add accessibility toggles for flashes, shake, high-contrast projectiles, and reduced gore/ink debris.

### 7.3 Difficulty

| Setting | Intent | Rules |
|---|---|---|
| Orientation | Story/easy | More supplies, fewer hard placements, reduced incoming damage |
| Desk Adjuster | Relaxed | Forgiving placements and resource surplus |
| Field Adjuster | Intended | Authored baseline |
| Catastrophe Team | Hard | Denser placements, scarcer recovery, more dangerous crossfire |
| Binding Authority | Extreme | Hard placements, faster aggression/projectiles, amplified damage, no casual safety |

Difficulty primarily changes thing placement and supply mix. Enemy maximum health stays constant so weapon knowledge remains transferable.

---

## 8. Weapons

Weapon identities should parallel the tactical coverage of a classic 1993 arsenal without duplicating its visual designs.

| Slot | Weapon | Role | Ammo | Production notes |
|---|---|---|---|---|
| 1 | **Claim Stamp** | Emergency melee | None | Oversized self-inking stamp; wet red impact, humiliating but viable against fodder |
| 2 | **Staple Driver** | Accurate starter hitscan | Staples | Industrial pneumatic tool, crisp cadence, strong first-shot clarity |
| 3 | **Twin-Bore Riveter** | Close burst / workhorse | Fasteners | Two compressed blasts; broad paper-and-metal debris cone |
| 4 | **Audit Repeater** | Sustained hitscan | Staples | Motorized document perforator; shares starter ammo to create economy tension |
| 5 | **Catastrophe Launcher** | Slow explosive projectile | Canisters | Fires red suppression canisters; essential splash tool, dangerous nearby |
| 6 | **Plasma Copier** | High-rate energy stream | Toner cells | Emits cyan-white copy arcs and ejects scorched forms |
| 7 | **Binding Engine** | Rare room-clear beam | Toner cells | Portable policy-binding core; enormous cell cost, long luminous discharge |
| 8 | **Umbra Saw** | High-risk sustained melee | None | Rotary salvage cutter protected by three offset roof plates; no umbrella form |

### Weapon feel targets

- View weapons are large, central, sprite-based, and readable in four to eight primary frames.
- Pickup order creates a reliable power curve: Staple Driver, Twin-Bore Riveter, Audit Repeater/Catastrophe Launcher, Plasma Copier, Binding Engine.
- Weapon switching is quick but not instant. Firing animations can be interrupted only after their committed damage event.
- Each weapon needs idle, raise, lower, fire, flash, and pickup-world art.
- No reload animations.
- Ammo types remain limited to four: staples, fasteners, canisters, toner cells.

---

## 9. Enemy Roster

The roster is built by combat role. Names and visuals are original; no enemy should be a one-to-one reskin of a copyrighted monster.

### 9.1 Standard enemies

| Enemy | Role | Attack and behavior | Visual direction | First use |
|---|---|---|---|---|
| **Returned Mail** | Fodder melee swarm | Erratic rush; low health; arrives from mail slots and bins | Humanoid knot of envelopes, tape, and red rejection stamps | Map 1 |
| **Desk Warden** | Light hitscan | Brief aim tell, short accurate burst, drops staples | Hollow office security shell with desk-lamp eye | Map 1 |
| **Ember Clerk** | Basic projectile | Throws slow arcing claim-fire; moderate pain chance | Charred paper person in white shirt and red tie | Map 1 |
| **Exposure Hound** | Fast melee pressure | Sprints, pauses before lunge, works in pairs | Low quadruped made from measuring wheels and scorched binders | Map 2 |
| **Coverage Drone** | Flying harasser | Changes elevation, fires slow cyan bolts, low health | Floating projector/camera wrapped in policy ribbons | Map 2 |
| **Liability Mass** | Durable bruiser | Large red orb volley, high health, wide body blocks routes | Swollen stamp-and-wax organism in a shredded suit | Map 3 |
| **Denial Officer** | Heavy hitscan | Multi-shot audit beam after audible lock-on; must be prioritized | Tall armored adjuster with rotating denial shutters | Episode 2 |
| **Subrogator** | Mid-tier burst projectile | Three-shot spread and aggressive pursuit | Split humanoid sharing one case file, mirrored movement | Episode 2 |
| **Reserve Eater** | Heavy projectile tank | Alternates direct explosive glob and floor hazard | Vault-bodied creature consuming coins and claim folders | Episode 2 |
| **Fraud Apparition** | Stealth flanker | Partially visible until attacking; melee plus retreat | Heat-haze silhouette composed of inconsistent signatures | Episode 2 |
| **Cat Model** | Area denial support | Predicts red danger zones, then calls ceiling impacts | Walking catastrophe-model terminal on articulated legs | Episode 3 |
| **Bad-Faith Counsel** | Resurrection/support | Reopens destroyed enemies as redacted variants; weak direct bolt | Floating legal robes around an empty deposition lamp | Episode 3 |

### 9.2 Bosses

| Boss | Function | Fight concept |
|---|---|---|
| **Regional Director** | Episode 1 gatekeeper | Enormous executive exoskeleton fires canister barrages in a destructured atrium; adds arrive through meeting-room shutters |
| **The Aggregate** | Episode 2 spectacle | Towering joined loss organism with dual attack emitters; player uses infighting and cover islands in a flooded data hall |
| **Chief Actuary** | Final tactical boss | Fast cybernetic calculator-beast launches predictive salvos; arena changes rates, cover, and hazard sectors through switches |
| **The Uninsurable** | Final icon encounter | Stationary engine behind the world; player opens three binding gates and sends elevated shots into its exposed reserve core while waves spawn |

### 9.3 AI state model

Every standard enemy uses the same inspectable state framework:

1. Dormant/listening.
2. Acquiring target through sight or sound.
3. Chase with role-specific spacing.
4. Attack wind-up.
5. Attack event.
6. Recovery.
7. Pain interruption, if eligible.
8. Death and persistent corpse.

AI does not need sophisticated navigation. It needs reliable line-of-sight, sector traversal, door compatibility where intended, sound propagation, obstacle steering, and deterministic enough behavior for replay demos.

---

## 10. Pickups and World Objects

### 10.1 Recovery and protection

- **Adhesive Bandage Packet:** small health recovery.
- **Field Medical Case:** large health recovery.
- **Goodwill Token:** tiny over-heal; red enamel coin.
- **Loss-Control Vest:** light armor.
- **Catastrophe Suit:** heavy armor.
- **Emergency Reserve:** rare full health and protection overcharge.

### 10.2 Utility powerups

- **Temporary Binder:** short invulnerability; player becomes high-contrast white/red.
- **Night Inspection Goggles:** correct darkness without flattening all lighting.
- **Hazard Endorsement:** temporary environmental-damage immunity.
- **Rapid Authority:** temporary increased weapon cadence.
- **Floor Plan:** reveals map geometry; optional hidden upgrade reveals secrets.
- **Forensic Lens:** partial invisibility/targeting disruption, represented by a static cyan additive signature on live hostiles.

### 10.3 Interactive props

- Breakable copier banks that spill toner cells.
- Red fire shutters, steel archive doors, glass office partitions, loading-bay doors.
- Pneumatic claim tubes carrying item silhouettes before delivery.
- Desks, queue barriers, rolling archive shelves, flood pumps, generators, vehicles, roof HVAC.
- Explosive suppression cylinders with a red-white warning language distinct from any source barrel design.
- Wall terminals with one-frame state change and strong mechanical sound.
- Decorative phones that ring when nearby enemies wake.

---

## 11. World and Episode Structure

### Episode 1: FIRST NOTICE

**Arc:** From ordinary branch operations into the buried cause of the incident.  
**Palette:** Paper white, charcoal, concrete gray, safety yellow, strong red accents, small cyan screens.  
**Mechanical teaching:** Core weapons, credentials, lifts, damaging floors, secrets, infighting.

| Map | Title | Location and purpose | Signature beat |
|---|---|---|---|
| E1M1 | First Notice | Branch office and parking deck; compact tutorial loop | Red credential visible through glass from the starting room |
| E1M2 | Intake | Call center and mail-routing floor | Cubicle shutters drop, turning lanes into an ambush maze |
| E1M3 | Total Loss | Vehicle inspection warehouse and flooded bays | Raise damaged cars as temporary cover and bridges |
| E1M4 | Mitigation | Water/fire restoration plant | Pump controls swap safe and hazardous floor channels |
| E1M5 | Records Retention | Dense archive stacks around a central lift | Moving shelves reveal enemies, shortcuts, and a secret weapon |
| E1M6 | Tower Annex | Corporate offices wrapping an atrium | Keys reopen earlier floors from new balconies and lifts |
| E1M7 | The Underwriting Floor | Executive zone becoming impossible | Boardroom table splits to expose a descent into machinery |
| E1M8 | Regional Authority | Fortress-like atrium and boss arena | Defeat Regional Director and bind the first catastrophic loss |
| E1M9 | Unscheduled Inspection | Secret model home/showroom | Each perfect room hides an increasingly absurd covered peril |

### Episode 2: EXCLUSIONS APPLY

**Arc:** Catastrophe-response infrastructure has become a hostile industrial city.  
**Palette:** Oxidized green, wet asphalt, hazard orange, steel, emergency red, cold cyan.  
**Mechanical growth:** Larger loops, crushers, teleports, heavy enemies, long-range crossfire, resource austerity.

| Map | Title | Location and purpose | Signature beat |
|---|---|---|---|
| E2M1 | Catastrophe Staging | Storm logistics yard and response hangar | Lightning reveals long-range enemies between moving container lanes |
| E2M2 | Waterline | Flood-damaged hotel around a submerged lobby | Stairwells and guest-room loops reopen as the water level changes |
| E2M3 | Server Farm | Claims data center with redundant power halls | Routing power wakes one wing while blacking out another |
| E2M4 | Claims Express | Armored records train and switching depot | Move between train cars and platforms while the consist changes position |
| E2M5 | Salvage Rights | Vehicle and equipment salvage district | Crushers reshape cover and expose buried routes rather than acting as timing puzzles alone |
| E2M6 | Pump Station | Municipal flood-control plant | Three pumps change liquid channels, enemy access, and return routes |
| E2M7 | Discovery | Litigation tower and evidence repository | Deposition rooms teleport the player between contradictory versions of one floor |
| E2M8 | The Aggregate | Flooded data hall and joined-loss boss arena | Cover islands sink as the Aggregate alternates independent attack emitters |
| E2M9 | Tabletop Exercise | Secret catastrophe training simulation | Cheerful modular sets fail, exposing the machinery and observers behind them |

### Episode 3: ADVERSE DEVELOPMENT

**Arc:** Descend into the actuarial substrate where risk is manufactured.  
**Palette:** Black stone, bone paper, molten red wax, brass, stark white voids, ultraviolet/cyan energy.  
**Mechanical mastery:** Abstract navigation, rapid threat mixtures, support enemies, boss-scale mechanisms, severe but fair supply planning.

| Map | Title | Location and purpose | Signature beat |
|---|---|---|---|
| E3M1 | Earned Premium | Brass premium foundry at the edge of the underworld | Currency channels power doors but also release reserve creatures |
| E3M2 | Mortality Table | Sliding calculation-table labyrinth | Row and column switches realign whole combat lanes around fixed landmarks |
| E3M3 | Treaty Vault | Layered reinsurance vaults and transfer machinery | Opening one vault transfers its threat and resources into another layer |
| E3M4 | Probability Chapel | Ritual calculation chamber over a white void | Prediction zones telegraph future impacts across rotating floor sectors |
| E3M5 | Reserve Pits | Deep storage wells filled with wax and toner | Lifts descend past optional ledges while enemies attack across the central shaft |
| E3M6 | Redaction Court | Abstract courtrooms and sealed evidence halls | Black redaction walls erase and restore routes in a readable sequence |
| E3M7 | Infinite Ledger | Vast compressed-paper machine feeding the final model | Earlier episode landmarks reappear as distorted combat modules |
| E3M8 | The Uninsurable | Chief Actuary arena and reserve-core finale | Defeat the mobile gatekeeper, open three binding gates, then destroy the exposed core |
| E3M9 | Orientation Day | Secret cheerful onboarding-video set | Painted smiles and perfect offices peel away to reveal a hostile soundstage |

---

## 12. Level Composition Bible

### 12.1 Map topology

Each main map should include:

- One memorable central landmark visible from two or more routes.
- Two to four macro loops rather than a single corridor chain.
- One locked route telegraphed before its credential is found.
- One transformation that reuses a known space: shutters open, floor lowers, lights fail, liquid drains, shelves move, or enemies repopulate.
- One optional high-risk resource pocket.
- Two to five secrets, at least one of which is discoverable through sight rather than wall-humping.
- A return route that is faster than the outbound route.
- At least one encounter where infighting is a sensible strategy.
- A clean exit state and no irreversible soft lock.

### 12.2 Spatial rhythm

Use the sequence **compress, reveal, contest, release**:

1. **Compress:** short hall, stair, service tunnel, or low-ceiling archive.
2. **Reveal:** vista into a tall atrium, bay, yard, flooded chamber, or machine hall.
3. **Contest:** enemies occupy multiple distances/elevations with one dominant pressure source.
4. **Release:** loop, pickup pocket, secret clue, or quiet connector gives the player time to form a plan.

Avoid repeating square room-corridor-square room. Use height changes, non-orthogonal walls, windows, overlooks, partial cover, light gradients, and floor materials to imply space without relying on clutter.

### 12.3 Key and switch grammar

- Show the destination before or near the key whenever possible.
- Credentials open themed areas, not arbitrary single doors.
- A remote switch must produce visible motion, a camera cue no longer than one second, or an unmistakable sound from a known location.
- Multi-switch puzzles are acceptable only when spatially legible and interruptible by combat.
- Never hide mandatory progress behind an unmarked ordinary wall.

### 12.4 Encounter construction

Build encounters from roles:

- **Anchor:** durable enemy that claims space.
- **Pressure:** fast or hitscan threat that forces immediate action.
- **Shape:** projectiles or hazards that define movement lanes.
- **Punish:** close enemy hidden behind a likely retreat route.
- **Reward:** resource or switch that motivates crossing danger.

Most fights need only two or three roles. Save all-role encounters for climaxes.

### 12.5 Ambush fairness

- Signal traps with suspicious resources, repeated architecture, monster sounds, or a conspicuously quiet arena.
- Give the player at least one viable first response: move forward, reverse, circle, or trigger infighting.
- Do not spawn unavoidable hitscan enemies directly behind the player.
- Closet doors should have a readable opening sound and enough delay for reaction.
- Teleport arrivals display a bright red approval-ring effect and distinct stamp-thump audio.

### 12.6 Secrets

Secret languages, in increasing difficulty:

- Misaligned baseboard, flickering red light, displaced ceiling tile.
- Window revealing an apparently unreachable pickup.
- Map-shaped carpet or policy diagram hinting at geometry.
- Sound traveling through a wall.
- A sequence of mundane office interactions that produces an absurd payoff.

Secret rewards include ammunition efficiency, early weapon access, armor, map information, humorous micro-scenes, and shortcuts. Avoid secrets containing mandatory narrative comprehension.

### 12.7 Map budgets

| Metric | Early | Mid | Late |
|---|---:|---:|---:|
| First-play target | 8-15 min | 15-25 min | 20-35 min |
| Standard enemy count | 35-65 | 60-110 | 90-160 |
| Secrets | 2-3 | 3-5 | 4-7 |
| Credentials | 1-2 | 2-3 | 2-3 |
| Major transformations | 1 | 1-2 | 2-3 |
| Distinct landmarks | 2 | 3 | 3-5 |

Each map declares one normal-tier standard-enemy budget inside its phase range, and the realized normal placement must match it exactly. Entry, transformation, and climax profiles distribute that total while keeping ordinary phases to two or three combat roles; easier and harder placement masks scale monotonically without replacing the authored profile. Episode openings and other relief maps are explicit valleys that must rebuild into the following pressure beat.

Mandatory-route ammunition and recovery are allocated in proportion to phase pressure and the weapons available on that map. Optional reward pockets may improve the economy, but the deterministic route simulation must remain viable without counting secret supplies.

The table ranges are starting design budgets rather than pressure quotas. Once a map's normal-tier count is declared, however, its generated placement must realize that count exactly; encounter quality is tuned through composition, space, activation, and difficulty masks rather than silent underfill.

---

## 13. Art Direction

### 13.1 Visual thesis

**Catastrophe modernism rendered by a 1993 office PC.** Clean institutional spaces and carefully managed brand surfaces are invaded by wet paper, fire damage, black toner, bent steel, red wax, and impossible accounting machinery.

The game uses low-resolution authored assets rather than applying a generic pixel filter to high-resolution art.

### 13.2 Presentation target

- Internal render target: 320x200 or a modern aspect-correct equivalent with integer scaling.
- Default display: 4:3 presentation with optional widescreen extension that does not reveal unloaded/invalid geometry.
- Nearest-neighbor texture sampling; no smoothing.
- Sector lighting with deliberate hard value steps and animated light sequences.
- Sprites use eight-direction rotations for enemies where silhouette benefits; five mirrored directions are acceptable for budget enemies.
- World textures predominantly 64x64 and 128x128.
- UI/status art is authored at target resolution.
- Optional authentic mode limits frame update to 35 Hz; default mode may interpolate presentation while simulation remains fixed.

### 13.3 Palette

| Color | Hex | Use |
|---|---|---|
| Signal red | `#D9232E` | Credentials, brand surfaces, danger, wax, priority UI |
| Deep red | `#7A1018` | Shadowed red, damaged signage, enemy interiors |
| Paper white | `#F4F1EA` | Forms, walls, UI numbers, lighting contrast |
| Toner black | `#111214` | Ink, voids, outlines, machinery |
| Charcoal | `#34383D` | Metal, office equipment, neutral surfaces |
| Safety yellow | `#E2B93B` | Hazard trim and yellow credential |
| Oxide green | `#477066` | Flood zones and industrial episode identity |
| Screen cyan | `#47BCD1` | Energy weapons, screens, cyan credential |

Red should occupy roughly 10-20% of a normal gameplay frame so it remains an information color instead of becoming visual wallpaper. Large red rooms are reserved for narrative escalation and boss spaces.

### 13.4 Materials

Create texture families with clean, damaged, and infernal variants:

- Painted drywall and acoustic panels.
- Low-pile commercial carpet and rubber baseboard.
- Frosted glass, wire glass, and interior windows.
- Brushed elevator steel and perforated shutters.
- Concrete deck, wet asphalt, loading dock plate.
- Archive cardboard, paper stacks, red folders, thermal labels.
- Flood scum, soot, char, cracked tile, exposed insulation.
- Black toner sludge, red sealing wax, brass calculation machinery.
- Bone-like paper pulp and stone made from compressed documents.

### 13.5 Sprite construction

- Begin with thumbnail silhouettes at 32-96 pixels tall.
- Sculpt simple physical maquettes or low-poly models for consistent rotations, then render and repaint at target resolution.
- Enforce a shared overhead key light and dark lower-body value.
- Attacks use anticipation frames with exaggerated pose and color charge.
- Pain frames must read even when partly obscured.
- Death animations finish with low, navigable shapes.
- Do not use generative output as final game art without repainting, rotation consistency, provenance review, and animation cleanup.

### 13.6 Environmental storytelling

- Forms show impossible dates, circular approval chains, and claim values larger than the building.
- Whiteboards reveal evacuation plans that match secret routes.
- Office awards become more alarming deeper underground.
- Catastrophe photos gradually depict rooms the player has not reached yet.
- Break rooms and personal desks keep the vanished staff human without audio diaries.
- No visible use of the real brand name or its slogans.

---

## 14. UI and UX

### 14.1 HUD

Offer two modes:

**Status bar**

- Bottom band occupying roughly 16-20% of the 4:3 frame.
- Left: ammunition and weapon inventory.
- Center: animated adjuster portrait with damage direction, health state, and rare grin reactions.
- Right: health, protection, and credential indicators.
- Visual material: scratched claims terminal with paper labels and red seven-segment accents.

**Minimal overlay**

- Health, protection, current ammo, and keys at screen corners.
- No decorative panels larger than needed.

### 14.2 Portrait states

Neutral scan, left/right glance, taking light/heavy damage, directional hit, low health, firing after a quiet period, acquiring weapon, overcharge, invulnerability, and death. Use an original character portrait and animation timing.

### 14.3 Automap

- Full-screen or overlay.
- Clear distinction for seen walls, doors, locked doors, exits, and player trail.
- Zoom and pan controls.
- Floor Plan pickup reveals unseen regular geometry.
- Secrets appear only after discovery unless the enhanced map upgrade is found.

### 14.4 Menus

- Immediate keyboard/controller navigation.
- New game, continue, save/load, options, accessibility, episode/map completion, credits, quit.
- Difficulty selection uses short in-world labels plus plain-language descriptions.
- Confirm only destructive actions.
- All text remains readable at integer-scaled 720p and on a 13-inch laptop.

---

## 15. Narrative Delivery

Story is compact and optional.

- One paragraph before each episode.
- One illustrated intermission after each episode.
- Map names and environmental progression carry most context.
- No mid-map dialogue interruption.
- Computer terminals provide one-line procedural messages, not lore dumps.
- The player character never speaks.

### Narrative outline

1. A record storm causes simultaneous losses across the region.
2. The automated binding system begins denying reality itself to keep reserves intact.
3. Staff disappear as the office and catastrophe sites merge.
4. The player follows corrupted claims into the underwriting machine.
5. The machine reveals that it has begun manufacturing disasters to validate its own model.
6. The player closes the impossible claim by destroying the model, its actuary, and the reserve core.

---

## 16. Audio Direction

### 16.1 Music

- Original tracker/MIDI-style score with FM-synth-friendly arrangements.
- Alternate between propulsive industrial metal, anxious corporate minimalism, and low ambient machinery.
- Each map receives one looping track of 2.5-4 minutes with a distinct opening motif.
- Do not imitate recognizable melodies, riffs, or arrangements from existing game music.
- Music volume and playback device profile are configurable.

### 16.2 Sound palette

- Weapons: staplers, pneumatic tools, riveters, copiers, industrial suppression systems, rotary cutters, processed into exaggerated impacts.
- Enemies: paper strain, office equipment, servo motors, voice fragments recorded specifically for the game and transformed beyond intelligible branding.
- UI: key clicks, dot-matrix ticks, approval stamps, badge readers.
- World: HVAC, fluorescent buzz, distant phones, rain, water pumps, rolling shelving, elevator cables.
- Pickups need short, frequency-separated cues recognizable during combat.
- Every enemy needs unique idle, alert, attack, pain, and death cues.

### 16.3 Mix priorities

1. Incoming attack tells.
2. Player weapon event.
3. Damage and pickup confirmation.
4. Door/switch/lift state.
5. Enemy idle and ambience.
6. Music.

The mix should support locating active enemies through stereo sound without requiring headphones.

---

## 17. Asset Inventory

Production dimensions, frame expansion rules, generation workflow, and the authoritative completeness list are defined in the [Art Production Bible](ART_PRODUCTION_BIBLE.md), [Image Generation Pipeline](IMAGEGEN_PIPELINE.md), and [Asset Manifest](ASSET_MANIFEST.md). The counts below remain scope summaries rather than implementation specifications.

### 17.1 Vertical slice minimum

| Category | Approximate count |
|---|---:|
| Enemy sprite sets | 6 |
| Boss/mini-boss sprite set | 1 |
| View weapon sets | 4 |
| World weapon pickups | 4 |
| Ammo pickups | 4 |
| Health/armor/powerup pickups | 10-12 |
| Interactive props | 15 |
| Decorative props | 25 |
| Wall texture tiles | 70-90 |
| Flats/floor/ceiling tiles | 35-45 |
| Animated texture sets | 10-14 |
| Door/switch sets | 18-24 |
| HUD portrait frames | 25-35 |
| UI screens/backgrounds | 8-12 |
| Impact/effect sprite sets | 20-25 |
| Music tracks | 4 including menu/intermission |
| Unique sound effects | 90-120 |

### 17.2 Full game target

- 12 standard enemy sets, 4 bosses, and 2 special variants.
- 8 view weapon sets.
- 27 map packages plus intermission art.
- 220-300 world textures/flats across shared episode libraries.
- 250-350 unique sound effects.
- 30-35 music tracks including UI and endings.
- 80-120 props, with strict collision and readability rules.

### 17.3 Asset naming

Use semantic names and metadata rather than legacy lump-name limits:

```text
enemy/ember_clerk/idle/front/01
enemy/ember_clerk/attack/front_left/03
weapon/staple_driver/view/fire/02
world/door/archive_red/locked
fx/teleport/approval_ring/04
audio/enemy/desk_warden/alert/02
```

An export pipeline may generate compact runtime identifiers.

---

## 18. Technical Direction

### 18.1 Engine decision gate

Prototype movement, renderer, doors/lifts, enemy state logic, and map loading in two candidates for no more than one week each:

**Option A: Godot 4 custom 2.5D stack**

- Strong cross-platform tooling, input, audio, save system, and browser export.
- Implement a constrained sector/mesh renderer or use 3D geometry authored to 2.5D rules.
- Best if the team wants full control and a standalone identity.

**Option B: GPL-compatible Doom-family technology**

- Authentic map semantics, AI behavior, demos, and rendering arrive sooner.
- Licensing, packaging, web targets, and clean-room asset boundaries require early diligence.
- Best if mechanical authenticity is the dominant requirement.

Decision criteria: time to one polished room, deterministic simulation, browser performance, authoring ergonomics, license obligations, mod support, save stability, and pixel presentation. Do not build the campaign before this gate closes.

### 18.2 Recommended simulation model

- Fixed 35 Hz gameplay tick with optional render interpolation.
- Deterministic pseudorandom stream for combat and demo playback.
- Sector or sector-like map data: floor/ceiling height, materials, light level, tags, triggers, and adjacency.
- Actor definitions are data-driven: radius, height, speed, health, pain chance, state frames, sounds, attacks, drops, and flags.
- Separate simulation state from presentation so interpolation cannot alter gameplay.
- Hitscan, projectile, explosion radius, line-of-sight, and sound propagation each receive dedicated tests.

### 18.3 Data model

```text
Map
  Sectors
  Linedefs / boundaries
  Sidedefs / materials
  Actors / pickups / starts
  Triggers / tags
  Difficulty placement masks
  Metadata / par time / music / sky

ActorDefinition
  Physical dimensions
  Combat stats
  State graph
  Sprite rotations
  Audio events
  Faction and infighting flags
  Difficulty behavior modifiers
```

### 18.4 Save requirements

- Manual save slots, quicksave, autosave at map entry, and episode-start recovery.
- Persist full simulation state: actors, corpses, projectiles, sector movers, switches, player inventory, RNG state, elapsed time, and secrets.
- Version the save schema from day one.
- Loading a save must not replay pickup sounds, awaken enemies, or move lifts by a tick.
- Persist authored actors with stable placement identities rather than runtime array positions; keep dynamic summons in a distinct identity namespace. A supported legacy save must never apply mutable actor, behavior, or pickup state to an ambiguous placement.
- Persist the exact unlocked encounter set. For older supported saves without that field, reconstruct only progression proven by completed encounters and activated mechanisms, with the current explicit field authoritative whenever present.
- Demo schemas include checksummed gameplay-affecting playback settings. Reject incompatible simulation versions without mutating them, and keep each active replay-library generation in a distinct storage namespace so legacy libraries remain untouched.

### 18.5 Performance targets

- 60 displayed frames per second at 1080p on integrated graphics while preserving fixed simulation.
- Browser build reaches stable play within ten seconds on a typical broadband connection after caching.
- No visible frame spikes from opening closets, spawning effects, or first weapon use.
- Cap dynamic debris and audio voices without dropping attack tells.
- Validate worst-case late-game rooms at 2x intended enemy count during development.

---

## 19. Production Plan

### Phase 0: Rights and reference, 1-2 weeks

- Decide licensed/internal versus public/unlicensed identity.
- Produce trademark, copyright, engine-license, font, and audio-source checklist.
- Capture reference footage and measurable experience targets from legally owned copies.
- Lock the “do not copy” asset and map policy.
- Approve high concept, tone, player fantasy, and rating target.

**Exit:** Signed creative/IP boundaries and approved reference matrix.

### Phase 1: Graybox proving ground, 3-5 weeks

- Resolve engine gate.
- Implement fixed tick, movement, collision, use interaction, one door, one lift, one hazard floor.
- Build two weapons, three enemy roles, ammo/health/armor, death/restart, and primitive HUD.
- Create a single 5-minute combat loop with key, transformation, ambush, and secret.
- Tune movement and combat daily with captured metrics.

**Exit:** Ten consecutive testers can finish the room; experienced players describe movement as fast, readable, and controllable.

### Phase 2: Visual target, 3-4 weeks

- Finalize palette, material library, sprite pipeline, view weapon scale, HUD composition, impact language, and sector lighting.
- Replace all proving-ground placeholders in one room.
- Establish audio recording and processing chain.
- Validate integer scaling and color readability at target resolution.

**Exit:** One screenshot and 30 seconds of play represent the intended final quality without borrowed assets.

### Phase 3: Vertical slice, 8-12 weeks

- Produce First Notice, Total Loss, and The Underwriting Floor.
- Complete four weapons, six enemies, pickups, three credentials, automap, secrets, difficulty placements, save/load, menus, accessibility, music, and tallies.
- Run weekly external playtests and maintain heatmaps for deaths, missed routes, and secret discovery.
- Optimize desktop and browser builds.

**Exit:** 45-75 polished minutes, no blocker bugs, 90% of testers can complete on intended difficulty without developer explanation.

### Phase 4: Episode production, 4-6 months

- Produce remaining enemy and weapon roster early so level designers can compose with the final sandbox.
- Graybox an entire episode before art lock.
- Review each map at graybox, first combat pass, art pass, audio pass, difficulty pass, and release-candidate pass.
- Maintain one map in integration while others remain independently editable.

**Exit:** Three complete episodes, all difficulty placements, secrets, intermissions, and progression functional.

### Phase 5: Alpha and beta, 8-12 weeks

- Alpha: content complete, progression complete, saves migration-tested.
- Beta: tune supplies, encounter fairness, onboarding, accessibility, and performance.
- Run blind first-play, veteran, speedrun, low-end hardware, and browser cohorts.
- Complete legal, credits, licenses, and provenance audit.

**Exit:** Zero known blockers/critical defects, save stability across the whole campaign, performance target met, brand/legal sign-off complete.

### Phase 6: Release candidate, 2-4 weeks

- Freeze content.
- Verify clean install, input devices, resolutions, save paths, pause/focus behavior, audio device changes, browser storage, and crash recovery.
- Produce screenshots/trailer only from final cleared assets.
- Archive source assets, licenses, build inputs, and reproducible build steps.

---

## 20. Team and Ownership

Minimum practical core team:

- Creative director/game designer: pillars, combat, episode arc, approvals.
- Lead engineer: simulation, renderer, tools, save/load, platform builds.
- Level designer: map topology, encounters, difficulty placements, secrets.
- Pixel artist/animator: enemies, weapons, effects, HUD.
- Environment artist: textures, props, lighting language, intermissions.
- Sound designer/composer: full audio identity and mix.
- Producer/QA: milestones, provenance, test matrix, bug triage.

Small-team consolidation is possible, but level design and sprite production are each full workloads during content production.

---

## 21. Testing Strategy

### 21.1 Automated tests

- Fixed-tick determinism across repeated input recordings.
- Hitscan line-of-sight and vertical tolerance.
- Projectile collision, splash falloff, owner immunity window, and infighting attribution.
- Door/lift/crusher state transitions and save restoration.
- Credential and switch state persistence.
- Difficulty placement masks.
- Kill/item/secret tallies.
- Map reachability and exit availability.
- Save version loading and corrupted-save handling.

### 21.2 Map validation

Every map build runs checks for:

- Missing materials and actor definitions.
- Player starts and exit trigger.
- Unreachable mandatory keys/switches.
- One-way drops without valid continuation.
- Doors/lifts with missing tags.
- Actors outside valid sectors or embedded in walls.
- Secrets with no reachable trigger.
- Items incorrectly counted toward 100%.
- Difficulty with zero ammunition path to mandatory combat.

### 21.3 Playtest cohorts

- **Newcomers:** Can they read doors, keys, damage, pickups, and exits without explanation?
- **Classic shooter players:** Does movement, weapon cadence, monster herding, and map rhythm feel authentic?
- **Speedrunners:** Are there expressive routes and recoverable movement tricks without uncontrolled skips?
- **Accessibility testers:** Are flashes, contrast, audio dependence, text, input, and motion settings sufficient?
- **Low-end/browser testers:** Are load, frame pacing, focus loss, audio unlock, and storage reliable?

### 21.4 Metrics to capture

- Time to first input, first enemy, first weapon, first key, and exit.
- Death position and cause.
- Damage dealt/taken by enemy and weapon type.
- Ammo starvation and overflow by room.
- Route heatmap and time spent lost.
- Secret discovery rate.
- Weapon usage share.
- Save/load failures and abandoned sessions.

Metrics inform observation; they do not replace watching play.

---

## 22. Acceptance Criteria

The game is ready when:

- A blind player understands movement, firing, use, credentials, health, and exit within the first map without tutorial text walls.
- Combat remains readable at the internal target resolution with at least eight active enemies and mixed projectile/hitscan threats.
- Each weapon has a distinct high-value situation and no weapon is made obsolete in all cases by the next pickup.
- Each enemy can be identified by silhouette and alert/attack sound.
- Every main map contains meaningful loops, one spatial transformation, fair telegraphing, and multiple optional discoveries.
- The campaign is completable from a pistol-start equivalent on every map at intended difficulty.
- Continuous episode play creates resource continuity without making later maps trivial.
- Save/load accurately restores active combat and sector machinery.
- Desktop and browser performance targets are met on agreed minimum hardware.
- No shipped asset, name, map, sound, melody, UI screen, or logo depends on uncleared third-party expression.
- The public build contains no real company name, slogan, registered umbrella mark, or confusingly similar lockup.

---

## 23. Immediate Next Actions

1. Approve the fictional public identity or secure written authorization for the licensed track.
2. Choose the target platform priority: browser-first or downloadable desktop-first.
3. Run the two engine spikes and record results against the decision criteria.
4. Graybox the First Notice central loop with placeholder geometry only.
5. Prototype Staple Driver, Twin-Bore Riveter, Desk Warden, Ember Clerk, and Returned Mail.
6. Produce the art target pack in the order specified by the Image Generation Pipeline, including one complete eight-direction enemy set.
7. Validate the full chroma, slicing, palette, pivot, and in-engine approval flow before batch generation.
8. Playtest movement and the first five-minute loop before producing additional maps or final assets.

---

## 24. Reference Notes

- The real insurer’s published logo guide describes its red umbrella as a valuable, protected brand asset.
- Its legal page identifies the company name and umbrella logo as registered trademarks and does not grant use rights.
- The original 1993 shooter’s source code was later released under GPL terms, but its commercial game data and expressive assets are separate from that code license.
- A period-authentic technical target includes a 320x200 internal presentation, billboard actors, fixed simulation, and 2.5D spaces without room-over-room geometry.

These notes are planning context, not legal advice. Obtain qualified review before external distribution or marketing.
