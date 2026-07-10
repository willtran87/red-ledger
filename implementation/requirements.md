# Implementation Requirements Matrix

This is the coding contract distilled from `GAME_DESIGN_DOCUMENT.md`, `ART_PRODUCTION_BIBLE.md`, and `ASSET_MANIFEST.md`. Requirements marked **Locked** come directly from those documents. Values marked **Baseline** fill deliberate numeric gaps so implementation can proceed; they remain data-driven tuning values.

## 1. Product Scope

| Area | Requirement | Status |
|---|---|---|
| Mode | Single-player campaign at launch | Locked |
| Campaign | 3 episodes x 9 maps = 27 maps total | Locked |
| Main/secret split | 24 main maps, 3 secret maps; one secret map per episode | Locked |
| Campaign duration | 6-9 hours first play; 15-35 minutes experienced play per map | Locked |
| Simulation | Fixed 35 Hz tick; presentation may interpolate | Locked |
| Persistence | Health, protection, ammo, and weapons persist between maps within an episode | Locked |
| Map starts | Every map must be completable from a starter-weapon-equivalent inventory on Field Adjuster | Locked |
| Networking | No co-op/deathmatch in 1.0; architecture should not make later multiplayer impossible | Locked |
| Excluded mechanics | No required jump, crouch, lean, mantle, free-look, reloads, inventory grid, builds, location damage, or physics destruction | Locked |
| Content identity | No real company name, slogan, protected mark, or uncleared third-party expression in the public build | Locked |

## 2. Simulation Contract

| System | Coding requirement |
|---|---|
| Determinism | All gameplay mutations occur on 35 Hz ticks. Combat RNG uses one persisted deterministic stream. Identical starting state plus input recording must reproduce identical results. |
| World | Sector-like data supports floor/ceiling height, light, materials, adjacency, tags, triggers, movers, damaging floors, doors, lifts, shutters, crushers, and teleports. |
| Player collision | Cylinder/capsule, automatic low-step traversal, no required jumping. Damage never takes control away from the player. |
| Movement | Equal forward/strafe speed, quick acceleration, modest release friction, always-run default, lateral movement capable of outrunning ordinary projectiles. |
| Aiming | Modern mouse default; optional cosmetic vertical look. Conservative vertical auto-aim enabled by default. A `1993 input` preset enables keyboard turning and classic restrictions. |
| Combat | Hitscan, projectile, splash radius/falloff, melee, pain chance, line of sight, sound wakeup, corpse persistence, and monster infighting are independent reusable systems. |
| Interaction | One `use` action opens usable doors, presses switches, and activates lifts. Failed use always produces sound plus color/icon feedback. Critical movers must be recoverable and cannot soft-lock a map. |
| Actor data | Radius, height, speed, health, pain chance, states, rotations, sounds, attacks, drops, faction, flags, and difficulty modifiers live in definitions rather than actor-specific code. |
| Feedback | Every damaging weapon has audio, view recoil, flash, impact, and pain response. Player damage has palette flash, directional edge cue, portrait reaction, and audio. |
| Accessibility | Toggles for flashes, shake, high-contrast projectiles, and reduced ink/debris. Explosion/boss shake is brief and configurable; rapid weapons do not shake the screen. |

### Player baseline tuning

These are implementation starting values, not design-locked balance.

| Value | Baseline |
|---|---:|
| Health / normal cap / overcharge cap | 100 / 100 / 200 |
| Protection cap | 200 |
| Light vest absorption | 33% while protection remains |
| Heavy suit absorption | 50% while protection remains |
| Run / walk speed | 280 / 140 world units per second |
| Collision radius / height / step | 16 / 56 / 24 world units |
| Use and melee reach | 64 world units |
| Vertical auto-aim cone | +/- 6 degrees |

## 3. Campaign and Progression

Normal exits advance from M1 through M8. M8 ends the episode. M9 is secret and returns to the next normal map. Because the design does not name secret-exit origins, the routes below are coding baselines chosen to spread discovery across each episode.

| Map | Title | Required gameplay/set piece | Progression |
|---|---|---|---|
| E1M1 | First Notice | Branch office/parking tutorial loop; red credential visible from start | -> E1M2 |
| E1M2 | Intake | Cubicle shutters convert lanes into an ambush maze | -> E1M3 |
| E1M3 | Total Loss | Flooded vehicle bay; raised vehicles become cover/bridges | -> E1M4; secret -> E1M9 |
| E1M4 | Mitigation | Pump controls swap safe and hazardous floor channels | -> E1M5 |
| E1M5 | Records Retention | Moving shelves reveal combat routes, shortcut, early secret weapon | -> E1M6 |
| E1M6 | Tower Annex | Multi-level atrium; credentials reopen earlier floors from new heights | -> E1M7 |
| E1M7 | The Underwriting Floor | Executive maze; boardroom splits into impossible machinery descent | -> E1M8 |
| E1M8 | Regional Authority | Regional Director boss; add shutters; episode close | Episode 1 complete |
| E1M9 | Unscheduled Inspection | Model-home rooms conceal escalating covered perils | -> E1M4 |
| E2M1 | Catastrophe Staging | Storm yard; lightning reads long-range threats between moving containers | -> E2M2 |
| E2M2 | Waterline | Flooded hotel; water state reopens stair/guest-room loops | -> E2M3 |
| E2M3 | Server Farm | Power routing activates one wing while blacking out another | -> E2M4 |
| E2M4 | Claims Express | Records train/depot; train and platform relationships change | -> E2M5 |
| E2M5 | Salvage Rights | Crushers reshape cover and expose routes; not twitch-only timing | -> E2M6; secret -> E2M9 |
| E2M6 | Pump Station | Three pumps alter liquid channels, access, and return routes | -> E2M7 |
| E2M7 | Discovery | Teleport between contradictory versions of litigation floor | -> E2M8 |
| E2M8 | The Aggregate | Aggregate boss; independent emitters and sinking cover islands | Episode 2 complete |
| E2M9 | Tabletop Exercise | Cheerful training set fails to expose machinery/observers | -> E2M6 |
| E3M1 | Earned Premium | Currency channels open doors and release Reserve Eaters | -> E3M2 |
| E3M2 | Mortality Table | Row/column switches realign combat lanes around fixed landmarks | -> E3M3 |
| E3M3 | Treaty Vault | Opening a vault transfers its threat/resources into another layer | -> E3M4 |
| E3M4 | Probability Chapel | Prediction zones telegraph impacts on rotating floor sectors | -> E3M5 |
| E3M5 | Reserve Pits | Central-shaft lift descent with optional ledges and cross-shaft combat | -> E3M6 |
| E3M6 | Redaction Court | Redaction walls erase/restore routes in a readable sequence | -> E3M7; secret -> E3M9 |
| E3M7 | Infinite Ledger | Distorted modules recall earlier landmarks before final machine | -> E3M8 |
| E3M8 | The Uninsurable | Defeat Chief Actuary, open three gates, destroy reserve core amid waves | Campaign complete |
| E3M9 | Orientation Day | Perfect office/onboarding soundstage peels open into machinery | -> E3M7 |

Each episode has a pre-episode paragraph, an illustrated post-episode intermission, its own map-progression screen, and a fresh episode-start recovery state. M8 must unlock episode completion and completed maps unlock level select. Entering a new episode resets combat inventory to its authored start; continuing inside an episode carries resources forward.

## 4. Weapons

All eight weapons require idle, raise, lower, committed fire event, flash/effect, and world-pickup presentation. Switching is quick but not instant. Fire may be interrupted only after its committed damage event. There are no reloads.

| Slot / ID | Role | Ammo | Locked behavior | Baseline cadence/damage |
|---|---|---|---|---|
| 1 `claim-stamp` | Emergency melee | None | Short-range, viable against fodder | 14 ticks; 20-60 |
| 2 `staple-driver` | Accurate starter hitscan | Staples | Crisp single shots | 7 ticks; 5-15 |
| 3 `twin-bore-riveter` | Close burst/workhorse | Fasteners | Broad two-blast paper/metal cone | 24 ticks; 14 pellets x 3-9; costs 2 |
| 4 `audit-repeater` | Sustained hitscan | Staples | Shares starter ammo to create economy tension | 4 ticks; 5-15 |
| 5 `catastrophe-launcher` | Slow explosive projectile | Canisters | Strong splash; dangerous at close range | 28 ticks; direct 20-40 + max 128 splash in radius 128 |
| 6 `plasma-copier` | High-rate energy projectile | Toner cells | Cyan-white stream; scorched-form ejection | 3 ticks; 5-40 |
| 7 `binding-engine` | Rare room-clear beam | Toner cells | Long discharge and very high cell cost | 35 ticks; 20 pulses x 10-30; costs 40 |
| 8 `umbra-saw` | High-risk sustained melee | None | Continuous short-range cutter | 4 ticks; 8-24 |

Ammo IDs are exactly `staples`, `fasteners`, `canisters`, and `toner-cells`. Baseline carry caps: 200, 50, 50, and 300. Backpack-style capacity expansion is not specified and should not be inferred unless later authored.

## 5. Standard Enemies

All enemies implement: dormant/listening -> acquire by sight/sound -> chase/spacing -> attack wind-up -> attack event -> recovery, with optional pain interruption and terminal death/corpse. Each has unique idle, alert, attack, pain, and death audio. Enemy maximum health never changes with difficulty.

| ID | First use | Role and required behavior | Baseline HP |
|---|---|---|---:|
| `returned-mail` | E1M1 | Low-health erratic melee swarm; can emerge from mail slots/bins | 30 |
| `desk-warden` | E1M1 | Light hitscan; visible aim tell then short accurate burst; drops staples | 50 |
| `ember-clerk` | E1M1 | Slow arcing claim-fire projectile; moderate pain susceptibility | 60 |
| `exposure-hound` | E1M2 | Fast melee pressure; pause telegraphs lunge; commonly paired | 75 |
| `coverage-drone` | E1M2 | Low-health flying harasser; elevation changes; slow cyan projectile | 50 |
| `liability-mass` | E1M3 | Durable, wide route-blocking bruiser; large red orb volley | 300 |
| `denial-officer` | E2M1+ | Priority heavy hitscan; audible lock then multi-shot audit beam | 250 |
| `subrogator` | E2M1+ | Aggressive pursuit; three-projectile spread burst | 150 |
| `reserve-eater` | E2M1+ | Tank; alternates direct explosive glob and persistent floor hazard | 500 |
| `fraud-apparition` | E2M1+ | Partially visible until attacking; flank, melee, then retreat | 100 |
| `cat-model` | E3M1+ | Support area denial; paints red prediction zone before ceiling impact | 250 |
| `bad-faith-counsel` | E3M1+ | Support/resurrection; revives corpses as redacted variants; weak direct bolt | 350 |

Actor-versus-actor damage must attribute a provoker and permit faction infighting. Flying actors change elevation but still obey map collision and line of sight. Corpses persist and resurrectable corpses retain their actor definition and location.

## 6. Bosses

| ID | Encounter | Hard requirements | Baseline HP |
|---|---|---|---:|
| `regional-director` | E1M8 | Canister barrages; adds enter through meeting-room shutters; death unlocks episode close | 2,000 |
| `aggregate` | E2M8 | Independent left/right emitters, dual attacks, infighting opportunities, cover islands sink in authored phases | 3,000 |
| `chief-actuary` | E3M8 phase 1 | Fast mobile predictive salvos; arena switches alter rates, cover, and hazard sectors | 2,500 |
| `uninsurable` | E3M8 phase 2 | Stationary world engine; invulnerable while sealed; three distinct binding gates; elevated shots reach exposed core; enemy waves; destroy core to win | 4,000 core |

Boss state changes, spawned waves, gate state, cover state, and remaining health are part of the save state. E3M8 is one map with two sequential boss encounters, making four bosses across three boss maps.

## 7. Pickups, Credentials, and World Objects

| Category | IDs / behavior |
|---|---|
| Recovery | `adhesive-bandage-packet` small health; `field-medical-case` large health; `goodwill-token` tiny health that may overcharge; `emergency-reserve` rare full health/protection overcharge |
| Protection | `loss-control-vest` light absorption; `catastrophe-suit` heavy absorption |
| Ammo | Staple, fastener, canister, and toner-cell pickups, with small and bulk quantities where art exists |
| Weapon pickups | One world pickup for each of the eight weapons; first acquisition grants weapon plus authored starter ammo |
| Credentials | `red-access-card`, `cyan-catastrophe-badge`, `yellow-executive-seal`; luminous, visible, persistent for current map; locked-use feedback names required color/icon |
| Powerups | `temporary-binder` invulnerability; `night-inspection-goggles` darkness correction; `hazard-endorsement` environmental immunity; `rapid-authority` faster firing; `floor-plan` reveal geometry; `forensic-lens` partial invisibility/target disruption |
| Breakables | Copier banks spill toner cells; suppression cylinders explode with unique warning language; broken state persists |
| Movers | Fire shutters, archive doors, office partitions, loading-bay doors, rolling shelves, pumps, generators, vehicles, lifts, and claim tubes expose standard tagged trigger/mover interfaces |

Baseline pickup values: bandage +10, medical case +25, goodwill +1 up to 200, vest 100 protection at 33%, suit 200 protection at 50%, emergency reserve sets health/protection to at least 200. Baseline timed powerup duration is 30 seconds (1,050 ticks), except Floor Plan which lasts for the map.

## 8. Level and Secret Requirements

Every main map must contain:

- One landmark visible from at least two routes, 2-4 macro loops, and a faster return route.
- A locked destination shown before or near its credential.
- At least one major transformation that reuses known space.
- At least one optional high-risk resource pocket and one fight where infighting is sensible.
- A clean exit, reachable mandatory progression, recoverable critical movers, and no irreversible soft lock.
- Encounter groups composed from anchor, pressure, shape, punish, and reward roles; ordinary fights use 2-3 roles.
- Fair ambush tells and at least one viable immediate response. Never spawn unavoidable hitscan attackers directly behind the player.
- Teleport arrivals with a visible red ring and distinct audio tell.

| Map phase | First-play time | Standard enemies | Secrets | Credentials | Transformations | Landmarks |
|---|---:|---:|---:|---:|---:|---:|
| Early | 8-15 min | 35-65 | 2-3 | 1-2 | 1 | 2 |
| Mid | 15-25 min | 60-110 | 3-5 | 2-3 | 1-2 | 3 |
| Late | 20-35 min | 90-160 | 4-7 | 2-3 | 2-3 | 3-5 |

Use early for M1-M3, mid for M4-M6 and secret M9, late for M7-M8. This resolves the broader `2-5` topology guidance in favor of the explicit late-map budget. At least one secret per map must be found through a visual clue rather than indiscriminate wall use. Secret rewards may grant ammo efficiency, early weapon, armor, map information, micro-scene, or shortcut; secrets never gate required story comprehension.

End-map results record kills, counted items, secrets, elapsed time, and par time. The map validator must reject unreachable mandatory credentials/switches, missing exits/starts/tags/materials/actors, invalid actor placement, unreachable secret triggers, items incorrectly counted toward 100%, and any difficulty with no ammunition path through mandatory combat.

## 9. Difficulty

Thing placement and supply mix are the primary difficulty mechanism. Actor HP is identical on all tiers.

| Index / ID | Label | Placement/supply contract | Baseline modifiers |
|---:|---|---|---|
| 0 `orientation` | Orientation | Fewer hard placements, more supplies | incoming damage 0.5x; aggression 0.85x; supply 1.5x |
| 1 `desk-adjuster` | Desk Adjuster | Forgiving placements, surplus resources | incoming 0.75x; aggression 0.9x; supply 1.25x |
| 2 `field-adjuster` | Field Adjuster | Authored intended baseline | all 1.0x |
| 3 `catastrophe-team` | Catastrophe Team | Denser crossfire, scarcer recovery | incoming 1.0x; aggression 1.0x; supply 0.8x |
| 4 `binding-authority` | Binding Authority | Hardest placements, faster aggression/projectiles, amplified damage | incoming 1.5x; reaction/refire 0.8x duration; projectile speed 1.2x; supply 0.65x |

Difficulty placement masks are serialized in map data and tested. Do not add respawning monsters or change enemy HP unless separately approved.

## 10. UI, Controls, and Flow

### Required controls

| Action | Keyboard/mouse | Controller |
|---|---|---|
| Move | WASD | Left stick |
| Turn/aim | Mouse | Right stick |
| Fire | Left mouse | Right trigger |
| Use | E or Space | South face button |
| Run/walk | Always run; Shift toggles walk | Always run; stick tilt |
| Weapon cycle | Mouse wheel | Bumpers |
| Direct weapon | 1-8 | Hold radial selector |
| Automap | Tab | View/Select |
| Quick save/load | F6 / F9 | Pause menu |

All actions are remappable. Menus support keyboard and controller immediately, use confirmation only for destructive actions, and include New Game, Continue, Save/Load, Options, Accessibility, episode/map completion, Credits, and Quit.

### HUD and automap

- Two HUD modes: classic status bar and minimal overlay.
- Status bar occupies roughly 16-20% of a 4:3 frame: ammo/weapons left, animated portrait center, health/protection/credentials right.
- Minimal overlay shows health, protection, current ammo, and credentials in corners.
- Portrait responds to direction and severity of damage, low health, firing after quiet, weapon acquisition, overcharge, invulnerability, and death.
- Automap supports full-screen and overlay modes, zoom, pan, player trail, and distinct seen walls, doors, locked doors, and exits.
- Floor Plan reveals ordinary unseen geometry. Secrets remain hidden until discovery unless an enhanced map upgrade is authored.
- Text remains readable at integer-scaled 720p and on a 13-inch laptop.

### Game flow

`Title -> Main Menu -> New Game -> Episode -> Difficulty -> Episode Intro -> Map -> Results -> Next Map/Intermission`. Death offers restart from current map entry/autosave or load. Results update completed-map unlocks and episode progression before loading the next map.

## 11. Save, Continue, and Demo Requirements

| Feature | Requirement |
|---|---|
| Manual saves | Baseline 8 named local slots with thumbnail, map ID, difficulty, and elapsed time |
| Quicksave | One dedicated slot; F6 saves and F9 loads on keyboard |
| Autosave | Atomic rotating autosave on every map entry |
| Recovery | Dedicated episode-start recovery state for each begun episode |
| Continue | Loads newest valid quick/manual/autosave; if none, opens New Game |
| Schema | Versioned from first implementation; corrupted/incompatible saves fail clearly without destroying valid slots |
| Persisted state | Map ID, difficulty, full player inventory, actor state/corpses, projectiles, movers, switches, breakables, credentials, RNG state, elapsed time, discovered secrets, tallies, boss phase, and campaign unlocks |
| Load invariants | Loading does not advance simulation, replay pickup sounds, awaken enemies, move a sector by one tick, or consume RNG |
| Demo | Record tick-indexed gameplay inputs plus version/map/difficulty/RNG seed; playback uses the deterministic simulation and rejects incompatible schemas |

Save writes must be atomic. A map-entry autosave is captured after the map state and player inventory are initialized but before the first playable simulation tick.

## 12. Completion Gates

- Blind players understand movement, fire, use, credentials, health, and exit during E1M1 without tutorial walls.
- Combat reads at target internal resolution with at least eight simultaneous mixed hitscan/projectile enemies.
- Every weapon retains a distinct high-value use; every enemy reads by silhouette and alert/attack audio.
- All 24 main maps satisfy topology, transformation, fairness, and optional-discovery requirements.
- All 27 maps pass reachability, placement-mask, ammunition-path, tally, and save/restore validation.
- Every map is completable from a starter-equivalent inventory on Field Adjuster; continuous episode inventory does not trivialize late maps.
- Active combat, projectiles, corpses, movers, switches, boss phases, RNG, and tallies restore exactly after save/load.
- 60 displayed FPS at 1080p on integrated graphics while retaining the 35 Hz simulation; browser reaches stable play within 10 seconds after caching.
- Public-build prohibited-name/mark scan and art-library validation both pass.

