# Game Completion Audit

- Current evidence review: 2026-07-15
- Previous released software baseline: `804f837b70efbfa201ffa3a1be4b18908e2896e5` (`804f837`)
- Current candidate: **Pending an immutable software commit and final evidence capture**
- Release status: **The authored-audio target is implemented; candidate-wide automated evidence is pending, and four external human signoffs remain open.**

## Current Authority And Scope

This section supersedes every count, status, and verdict in the archived 2026-07-10 audit below. Commit `804f837` remains the previous immutable software baseline, but the current source and runtime assets contain later authored-audio and accessibility work. Those changes are not a promoted release baseline until they have an immutable commit, a clean full release run, an exact Pages inventory, and the other preflight evidence required by `implementation/RELEASE_PLAYTEST_PROTOCOL.md`. Values that depend on that run are deliberately marked pending.

Automated tests prove only the covered behavior on their recorded environments. They do not replace blind-player observations, full-campaign judgment, representative-device measurements, or formal rights review. The authored-audio content target is now implemented; listening, device, and provenance checks for that library are included inside the four remaining human gates rather than treated as a separate content gap.

Status meanings for this current section:

| Status | Meaning |
|---|---|
| **Proven on previous baseline** | Direct automated or inspectable evidence passed on `804f837`; the current candidate still requires its full rerun. |
| **Implemented in current candidate** | Direct source, asset, focused-test, or browser evidence covers the new work; candidate-wide promotion evidence is still pending. |
| **Pending candidate evidence** | The final immutable commit or full candidate preflight has not yet been recorded. |
| **Open human gate** | Automation is a prerequisite, but the requirement needs recorded external judgment or representative hardware. |
| **Not applicable** | The product intentionally does not contain the feature. |

## Current Release Evidence

| Evidence surface | Status | Current evidence | Limit of the evidence |
|---|---|---|---|
| Full release command | **Pending candidate evidence** | The previous baseline passed 210 unit/data/public-release checks and 30 registered browser scenarios. The changed candidate has not yet recorded its final `npm run test:release` result. | No prior count may be reused as the current candidate's result. Automated success would still not provide human play, rights, or representative-device signoff. |
| Campaign structure and runtime | **Proven on previous baseline** | All 27 maps and 24 credential-bearing routes passed the previous runtime and data gates, including encounter phases, mechanisms, starts, supplies, secrets, exits, phase-gated recovery, and the two-stage finale. | The current candidate requires the same gates again; full continuous and fresh-start human playthrough balance remains open. |
| Gameplay, feedback, and progression | **Proven on previous baseline** | Focused browser suites cover combat feel, hostile telegraphs, weapon selection, optional encounters, intermission flow, mastery, milestones, replays, mechanisms, semantic animation, and 40 validated particle seeds. | The current candidate requires the full regression; subjective readability and long-session pacing require playtest records. |
| Difficulty, goals, and replayability | **Proven on previous baseline** | Five response levels, pistol-start retry, records, grades, pars, secret discovery, milestones, mastery targets, deterministic demos, replay, and the deterministic campaign economy simulator passed their prior gates. | Human play remains necessary to judge difficulty curves, strategy variety, incoming-damage fairness, duration, and reward pacing. |
| Visual and animation integration | **Proven on previous baseline** | Responsive visuals, particles, material/status feedback, transient effects, semantic animation, the Binding Engine, hostile telegraphs, and combat feedback passed focused checks. | The current candidate requires the full regression; beauty and long-session readability remain qualitative concerns. |
| Authored audio content and runtime | **Implemented in current candidate** | The schema-2 library contains 33 original streamed tracks, including unique 154-236 second music and opening motifs for all 27 maps, plus 347 distinct cues in 189 semantic groups across five lazy SFX shards. Focused content contracts, 16 AudioSystem tests, failure/recovery browser coverage, and Chromium/Firefox/WebKit audio smoke pass. The 32-voice priority limiter, spatial mix, speakers/headphones/night/mono profiles, bounded retry, and deterministic procedural fallback are wired. | Candidate-wide release/package evidence is pending. Human sessions must still judge loop seams, mix and tell readability, profile behavior, device dropouts, and provenance/sound resemblance. |
| Controls, onboarding, UI, and accessibility | **Implemented in current candidate** | Existing desktop, touch, controller/remapping, responsive layouts, reduced-motion/effects behavior, semantic meters, and entry guidance are joined by leak-free resume input, single-step settings navigation, controller-operable replay, accessible remap focus/names, one event-cadence-independent held-stick look model, handedness-aware briefing labels, configured menu/gameplay deadzone with menu hysteresis, compact-layout reachability, and hybrid-device guidance; 22 focused unit tests and the relevant browser checks pass for that remediation. Current source also exposes persisted independent look sensitivities, Y inversion, controller deadzone, touch size/opacity/handedness, and three text scales. Visual gates cover collision-free Large controls at 320x568 in both handedness modes, Largest-text Difficulty at 568x320, and exact long-message/objective separation. | The full candidate still requires its final recorded regression evidence. Blind E1M1 onboarding with five independent players remains an open human gate. |
| Persistence and resilience | **Proven on previous baseline** | Fifty-nine persistence tests plus a two-tab browser journey cover fixtures, manual/quick/rotating auto saves, recovery fallback, bounded conflict copies, idempotent campaign journals, old writers, quota and removal failures, corrupt/future/empty byte preservation, repaired canonicals, storage denial, and exact paused restore. | The current candidate requires the full regression. Browser storage cannot guarantee durability when the platform denies or clears storage. |
| Performance and lifecycle | **Proven on previous baseline** / **Implemented in current candidate** | The prior SwiftShader sample delivered 443 frames over ten seconds at 22.6 ms mean / 50.0 ms p95 with 90 resident textures. Current music streams without whole-track `AudioBuffer` decoding, and SFX decode by semantic shard rather than as one monolith. | New candidate measurements are pending. Representative integrated GPU, discrete GPU, and touch-device targets remain an open human gate. |
| Browser portability | **Pending candidate evidence** | Focused authored-audio smoke passes in Chromium, Firefox, and WebKit; the previous baseline also passed its complete cross-engine and nested-production suites. | The full changed candidate has not yet recorded its final cross-engine and production-package result. |
| Production package and Pages source | **Pending candidate evidence** | The previous baseline contained 3,620 build files with exact `dist`/`docs` SHA-256 parity and zero high-threshold production vulnerabilities. | Audio assets change the inventory. New build counts, hashes, dependency audit, deployment, and live smoke must be captured from the immutable candidate. |
| Public-release scanning and provenance | **Pending candidate evidence** / **Open human gate** | The prior automated public-release scan covered restricted text/artifact references, licenses, notices, asset signatures, and package leakage. The audio generator, source specification, media hashes, and PCM fingerprints provide inspectable provenance inputs. | The changed public package needs a new automated scan; formal visual/audio/mark rights review and a signed provenance record remain open. |
| Monetization | **Not applicable** | No monetization, paid currency, advertising, or engagement purchase system is present. | Any future monetization would require a new design and release review. |

## Current Verdict

The current candidate closes the authored-audio content target. Promotion still requires an immutable commit, a clean full release run, exact production/Pages inventory verification, dependency audit, deployment, and live smoke evidence. It is **not release-final** until the following four human records exist for that same immutable candidate:

1. Blind E1M1 onboarding signoff.
2. Continuous-campaign and every-map fresh-start balance/duration signoff.
3. Representative integrated-GPU, discrete-GPU, and touch-device performance signoff, including the authored-audio listening matrix.
4. Formal rights and public-build review signoff, including audio provenance and sound-resemblance review.

## Candidate Promotion Record

| Candidate field | Recorded value |
|---|---|
| Software commit | **Pending:** record the immutable candidate SHA after the software commit |
| Full release gate | **Pending final candidate evidence** |
| Cross-engine result | **Focused audio pass:** Chromium, Firefox, and WebKit; full candidate result pending |
| Campaign runtime | **Previous baseline pass; current candidate rerun pending** |
| Performance sample | **Previous baseline:** 443 frames / 10 seconds; 22.6 ms mean; 50.0 ms p95; 90 textures. Current candidate sample pending. |
| Particle stress | **Previous baseline:** 28 baseline draw calls to 30 with 120+ active particles. Current candidate result pending. |
| Production inventory | **Pending:** audio-inclusive build count and SHA-256 manifest |
| Pages source | **Pending:** exact per-path SHA-256 verification for the immutable candidate |
| Production dependency audit | **Pending final candidate evidence** |
| Authored-audio content | **Implemented:** schema 2; 33 tracks; 347 cues; 189 groups; five lazy SFX shards |
| Human signoffs | **All four remain open** |

This table is not a promotion record until every pending field is replaced by evidence from one clean immutable candidate. Any later source, data, asset, dependency, or built-output change invalidates that evidence and requires the full candidate preflight again.

---

## Archived 2026-07-10 Audit

> **Archive notice:** Everything below this line is a historical pre-integration record. Its counts, failures, verdicts, and completion order are intentionally preserved to explain what drove implementation work. They do not describe the current release and must not be quoted as current evidence.

Archived audit date: 2026-07-10

### Post-Audit Implementation Update (Archived Snapshot)

The findings below record the baseline that was audited before the final integration pass. At the time this snapshot was written, the following gaps had been closed and were covered by its then-current default test/build gates:

- Distinct behavior profiles for all 12 enemies and four bosses are integrated, including projectiles, lunges, hazards, stealth, resurrection, summons, and three-stage boss phases.
- Enemy and player projectiles render from the validated keyed/alpha effect library. Launcher splash/self-risk and the Binding Engine multi-pulse discharge are live runtime systems.
- Eight manual slots, quicksave, three rotating autosaves, episode recovery, newest-valid Continue, corruption reporting, campaign unlocks, and completed-map level select are integrated.
- Active enemy/player projectiles, hazards, summoned actors, moving doors, switches, boss phases, RNG, tallies, and protection tiers are serialized. Manual restore remains paused at the exact saved tick.
- Five difficulty tiers, controller basics, full/overlay automap, accessibility settings, and F6/F9 controls are integrated.
- `E3M2` now has a compatible starter-ammo path; enemy placements carry mandatory-route annotations; all independent audit assertions are ordinary passing tests.
- `game/dist` now contains all 3,568 runtime files plus the catalog and is a standalone production package.
- One persisted deterministic RNG stream now drives gameplay combat; the remaining `Math.random()` use is audio-noise synthesis only.
- Tick-indexed demo recording/playback is integrated into the engine and browser-tested against the full terminal world state; incompatible checksums are rejected.
- Persistent remapping is integrated for 34 keyboard, mouse, wheel, and controller actions, with capture/reset UI and menu navigation.
- Sector floor heights, damaging-floor values, step traversal, animated/persisted sector movers, and two map-specific landmark machines per map are now rendered from campaign data.
- All 27 maps now have individually authored 21x15 footprints. Connectivity, dimensions, credentials, mechanism vocabulary, and D4 topology uniqueness are enforced by tests, so no map is a duplicate, mirror, or rotation of another.
- Map music now uses deterministic 512-step, 153.6-second episode/map-specific arrangements. Every hostile identity has distinct alert, attack, death, and phase cue synthesis.
- The remapping layer now includes keyboard/controller menu navigation and a held right-stick weapon radial whose release commits the selected slot.

Snapshot automated evidence at that time: 63 unit/data/audit tests plus gameplay, progression, 27-map campaign, responsive, portrait-mobile UX, combat/save, deterministic demo, remapping, authored mechanism, lifecycle/performance, nested production, and Chromium/Firefox/WebKit suites passed under `npm run test:release`. The production package was standalone. The lifecycle gate verified sub-10-second readiness, bounded GPU texture residency, heap stability, blur pause/input clearing, context-loss recovery, and a 10-second software-renderer frame floor. Remaining release signoff was explicitly human: campaign-duration/balance, blind onboarding, representative-GPU 60 FPS, and formal rights review follow `implementation/RELEASE_PLAYTEST_PROTOCOL.md`.

Snapshot authority: `GAME_DESIGN_DOCUMENT.md`, `implementation/requirements.md`, the then-current source tree, generated runtime catalog, and executable tests. This audit treated a feature as complete only when evidence proved the shipping behavior. A data declaration, asset, helper class, debug shortcut, or smoke-loaded map was not by itself proof of integrated gameplay.

### Verdict (Archived)

**The automated implementation scope was complete for that snapshot and its release matrix passed; four human signoff gates remained.** The historical matrix below records the pre-integration audit and is retained to show which gaps drove the implementation work. The post-audit update above was authoritative for that integration snapshot only. No automated result was presented as a substitute for human campaign-duration, blind-onboarding, representative-hardware, or rights review evidence.

Status meanings:

| Status | Meaning |
|---|---|
| **Proven** | Current automated or directly inspectable evidence covers the requirement. |
| **Partial** | A working subset exists, but material requirements are absent or unwired. |
| **Failed** | Current evidence directly contradicts the requirement or a dedicated audit detects a failure. |
| **Unverified** | The claim may be true, but current evidence cannot establish it. |

### Executed Evidence (Archived)

| Gate | Result | What it proves and does not prove |
|---|---|---|
| `npm test` | **Pass:** 27 tests; 4 deliberate expected failures | Unit/static invariants pass. Expected failures preserve four known completion gaps instead of hiding them. |
| `npm run build` | **Pass with 608 kB chunk warning** | TypeScript and Vite compile. It does not prove the output is deployable with its runtime assets. |
| `npm run test:e2e` | **Pass on rerun** | Basic menu, movement, firing, automap, quick save/load, pause. First run timed out waiting for async episode cards, exposing a bootstrap race in the harness or app readiness contract. |
| `npm run test:progression` | **Pass** | Credential door, one transformation, ordinary progression, boss gate, final phase unlock, and one powerup through debug-assisted paths. |
| `npm run test:campaign` | **Pass on rerun: 27 maps** | Every map can be debug-loaded without a recorded browser error. First run reached the page before `window.__redLedger` existed. It does not prove playthroughs. |
| `npm run test:visual` | **Pass** | Current responsive geometry assertions pass. It is not a full visual/fidelity review. |
| `manifests/art-library-validation.json` | **Pass** | 16 actor families, 87 keyed/alpha source pairs, 81 spaced sheets, and 1,337 other runtime PNG checks pass the art pipeline. |
| `assets/data/runtime-assets.json` | **Pass in source package** | 3,592 files / 3,525 PNGs resolve, signatures parse, and catalog URLs map safely to files. |

### Known Expected Failures (Archived)

The audit tests use `it.fails` for requirements known to be absent. Vitest therefore keeps the ordinary suite usable while still requiring these assertions to fail until the product gap is fixed and the marker is removed.

1. `E3M2` has no credential-reachable ranged ammunition compatible with the starter weapons or its only authored map weapon (`umbra-saw`). See `game/tests/map-pistol-start-audit.test.ts`.
2. Maps do not serialize mandatory-combat membership or route-specific ammunition budgets, so full pistol-start completion cannot be proven statically.
3. `PersistenceSystem` models campaign unlocks, but `GameEngine` and `UIController` do not consume it; there is no integrated completed-map level select.
4. `game/dist` omits both `data/runtime-assets.json` and `public_runtime`, so the Vite production output is not a standalone playable package.

### Requirement Matrix (Archived)

#### 1. Product Scope

| Requirement | Status | Evidence / gap |
|---|---|---|
| Single-player, 3 x 9 maps, 24 main + 3 secret | **Proven** | `campaign.test.ts`, progression audit, and 27-map browser load pass. |
| 6-9 hour campaign; 15-35 minute maps | **Unverified** | Par values exist, but no representative human completion-time evidence or telemetry exists. |
| Fixed 35 Hz simulation | **Partial** | The live accumulator uses `STEP = 1/35`; the public `step(seconds)` can execute a shorter final mutation tick. No determinism replay test is wired to `GameEngine`. |
| Intra-episode inventory persistence and episode reset | **Proven** | `loadMap` preserves inventory; cross-episode intermission resets it. Progression E2E exercises transitions, though not a complete episode inventory balance. |
| Every Field Adjuster map supports starter-equivalent completion | **Failed** | Static credential/exit reachability passes, but `E3M2` fails compatible ranged-supply reachability and mandatory combat budgets are absent. No normal-input 27-map pistol-start playthrough exists. |
| Excluded mechanics remain excluded | **Proven** | No reload, required jump/crouch/mantle, inventory grid, builds, or location damage appears in the runtime. |
| Cleared fictional public identity | **Partial** | Art validation and fictional naming rules pass. Rights/mark clearance and a dedicated full public-build text/image scan are not release-signoff evidence. |

#### 2. Simulation Contract

| Requirement | Status | Evidence / gap |
|---|---|---|
| One deterministic persisted gameplay RNG | **Failed** | Combat uses persisted LCG state, but actor spawn cooldowns use `Math.random()` in `World.spawnActors`. Integrated input recording/playback is absent. |
| Sector world with per-sector heights/materials/light and real movers | **Failed** | Data contains these fields, but `World` renders one global floor/ceiling/material theme. Transformations generally toggle all hazards or open all ordinary doors; lifts, crushers, shelves, vehicles, gates, and authored sector motion are not simulated. |
| Player collision, stepping, fast equal-axis movement | **Partial** | Grid/door collision and equal movement axes work. There is no height/step traversal because runtime sector height is not represented. |
| Mouse/classic aiming and conservative vertical auto-aim | **Partial** | Mouse, keyboard turning, and gamepad look exist. Vertical look, auto-aim cone, and a 1993 input preset are absent. |
| Reusable hitscan/projectile/splash/melee/pain/LOS/infighting systems | **Failed** | All eight weapons resolve immediate target hits. Launcher splash is a short actor-radius secondary hit; there are no runtime projectiles. Enemies share one chase/direct-damage loop. Pain chance, factions, provoker attribution, and designed infighting are absent. |
| Recoverable use interactions and feedback | **Partial** | Doors, credential feedback, switches, and generic transformations work. Authored movers and soft-lock recovery are not implemented or verified. |
| Fully data-driven actor state/attack/sound/drop definitions | **Failed** | Basic HP/speed/damage/range values are data-driven. Unique states, pain, attacks, drops, faction, flags, and sounds are not represented in definitions. |
| Complete combat/accessibility feedback | **Partial** | Synthesized weapon/damage audio, view flashes, portrait pain, shake, HUD modes, reduced motion/effects, and contrast settings exist. Most settings do not cover the specified projectile/debris systems because those systems do not exist; directional damage and per-weapon impacts are absent. |

#### 3. Campaign and Level Composition

| Requirement | Status | Evidence / gap |
|---|---|---|
| Normal/secret campaign graph | **Proven** | All 27 nodes are reachable from E1M1; M8 and M9 transitions match the authored graph. |
| 27 original hand-authored compositions and named set pieces | **Failed** | Maps are generated from nine 21 x 15 templates, mirrored/reversed by episode. `signatureBeat` text names each set piece, but runtime transformations reduce to shared door/hazard/light operations. Named trains, pumps, crushers, shelves, prediction floors, and three final gates are not authored behaviors. |
| Landmark/loop/key/fairness/secret budgets | **Partial** | Static layouts, credentials, clue text, secret cells, roles, and counts exist. Landmarks and rewards are descriptive strings rather than placed gameplay; fairness, optional resource pockets, infighting opportunities, and immediate ambush responses have no semantic validator or playtest proof. |
| Intro/outro/intermission/progression presentation | **Partial** | Episode intros, illustrations, tallies, and transitions render. There is no integrated map progression/level-select screen driven by completion state. |

#### 4. Weapons

| Requirement | Status | Evidence / gap |
|---|---|---|
| Eight weapons and matching art | **Proven** | Definitions and runtime catalog contain all eight; view and pickup assets resolve. |
| Distinct locked behaviors | **Failed** | Every ranged weapon uses the same immediate targeting loop. Plasma is not a projectile stream, Binding Engine is not a long multi-pulse discharge, and launcher projectile travel/self-risk is absent. |
| Raise/lower/committed event/flash/effect presentation | **Partial** | Idle/fire frames and fire events are wired. Runtime switching is immediate; raise/lower sequences and committed-event interruption rules are absent. |
| Ammo/caps/economy | **Partial** | Four runtime ammo pools and most caps exist. Fastener cap is 100 rather than the requirements baseline of 50, and `E3M2` exposes a pistol-start supply-path gap. |

#### 5. Enemies and Bosses

| Requirement | Status | Evidence / gap |
|---|---|---|
| Twelve standard enemies and four bosses placed with art | **Proven** | Full roster and boss placement tests pass; directional frames resolve. |
| Unique standard-enemy roles/state machines/audio | **Failed** | All standard enemies share one distance chase and probabilistic direct-hit routine. Flying elevation, arcing/orb/spread attacks, hazards, invisibility, resurrection, drops, and unique audio are absent. |
| Regional Director and Aggregate mechanics | **Failed** | They are higher-stat generic actors. Add shutters, emitter damage states, dual attacks, infighting design, and sinking cover phases are not implemented. |
| Chief Actuary -> Uninsurable sequence | **Partial** | Killing Chief Actuary reveals the core. Three distinct binding gates, switch-altered arena systems, predictive salvos, elevated shots, waves, and saved gate/cover state are absent. |

#### 6. Pickups, Credentials, Props, and Powerups

| Requirement | Status | Evidence / gap |
|---|---|---|
| Pickup/credential catalog and collection | **Proven** | Catalog IDs, collection, credentials, ammo, health, and weapon acquisition are wired. |
| Protection and recovery values | **Failed** | Damage always absorbs 45%, ignoring vest/suit tiers. Emergency Reserve sets armor to at least 100, not the required 200. Medical case grants 30 rather than the stated baseline 25. |
| Powerup behavior | **Partial** | Binder, hazard immunity, rapid fire, forensic disruption, goggles state, and Floor Plan state are collected/timed. Several effects are minimal or presentation-only and lack focused tests. |
| Breakable props and tagged movers | **Failed** | Art exists, but copier banks, cylinders, shelves, pumps, generators, vehicles, lifts, and claim tubes are not runtime world actors with persistent state. |

#### 7. Difficulty

| Requirement | Status | Evidence / gap |
|---|---|---|
| Five tiers and serialized placement masks | **Proven** | Every map has exact easy/normal/hard counts; tiers resolve to the intended mask; boss count and HP remain invariant. |
| Supply mix and tier modifiers | **Partial** | Supply quantity scalars and enemy damage/speed modifiers exist. Binding Authority refire and projectile-speed rules cannot be met because enemy cooldown scaling/projectiles are absent. Pickup placements themselves are identical across tiers. |

#### 8. UI, Controls, and Flow

| Requirement | Status | Evidence / gap |
|---|---|---|
| Core title-to-map-to-results flow | **Proven** | Browser gameplay/progression suites pass on rerun. |
| Keyboard, mouse, touch, controller basics | **Partial** | Core movement/fire/use, wheel/cycle, gamepad sticks/buttons, and touch controls exist. Remapping, controller radial selection, and complete menu-controller navigation are absent. |
| Classic/minimal HUD and automap | **Partial** | Both HUD modes, full/overlay map, zoom, trail, visited geometry, credentials, and exits are represented. Pan and the full specified visual distinction/secret reveal rules are incomplete. |
| Portrait, menus, accessibility | **Partial** | Responsive UI and settings exist. Portrait runtime uses neutral and central pain only; level select, credits, full save-slot UI, and destructive confirmations are absent. |

#### 9. Persistence, Continue, and Demos

| Requirement | Status | Evidence / gap |
|---|---|---|
| Eight manual slots, quicksave, rotating autosaves, recovery, newest-valid continue | **Partial** | `PersistenceSystem` and its unit tests implement these as a library. `GameEngine` still uses one `red-ledger-save-v1` local-storage record and UI exposes only one Save/Load action. F5 is wired despite the F6 requirement. |
| Campaign unlock persistence | **Partial** | Library tests prove unlock calculations. No engine completion call, menu level select, or UI consumption is wired. |
| Full exact runtime save/restore | **Failed** | Current engine save covers player, actors, pickups, open doors, secrets, visited tiles, triggered IDs, hazard flag, tally, and LCG state. It cannot store absent projectiles/movers/breakables and omits campaign unlocks; load reinitializes the map before restoring. Atomicity and no-side-effect load are unproven. |
| Deterministic demo record/playback | **Partial** | Generic recorder/playback documents are unit-tested in `PersistenceSystem`; they are not integrated with input, the simulation tick, UI, or engine state. |

#### 10. Assets and Packaging

| Requirement | Status | Evidence / gap |
|---|---|---|
| Art pipeline consistency | **Proven** | Chroma, spacing, alpha, palette, actor metadata, signatures, and source URL checks pass. |
| Runtime catalog completeness in development | **Proven** | 3,568 unique public files resolve and every literal source URL exists. Reused catalog references map to one source path. |
| Standalone production package | **Failed** | Vite builds JS/CSS/HTML with `copyPublicDir: false`; `dist` contains neither catalog nor runtime art. Preview/deployment requires an undocumented external asset mount. |
| Audio asset/content target | **Failed** | Runtime uses synthesized tones/noise and short procedural music patterns, not distinct authored enemy events or 2.5-4 minute per-map tracks. |

#### 11. Completion and Release Gates

| Gate | Status | Missing proof |
|---|---|---|
| Blind E1M1 onboarding | **Unverified** | No external blind-player evidence. |
| Eight-enemy combat readability | **Unverified** | No focused mixed-combat visual/performance test. |
| Weapon/enemy distinctness | **Failed** | Generic runtime behavior directly contradicts the gate. |
| 24 main-map topology/transformation/fairness | **Failed** | Nine reused templates and generic transformations do not prove 24 authored maps. |
| 27-map reachability/ammo/tally/save validation | **Failed** | Geometry and masks pass; `E3M2`, mandatory budgets, tally rules, and exact save/restore do not. |
| Continuous-vs-pistol-start balance | **Unverified** | No full playthrough/balance corpus. |
| Exact active-state restore | **Failed** | Required systems are absent or not serialized. |
| 60 FPS / 10-second stable load | **Unverified** | No benchmark across the required hardware profile; browser tests had two readiness races before passing on rerun. |
| Public art/name validation | **Partial** | Art-library validation passes; release rights and final packaged-build scan remain. |

### Independent Audit Files (Archived)

- `game/tests/audit-helpers.ts`
- `game/tests/map-pistol-start-audit.test.ts`
- `game/tests/difficulty-placement-audit.test.ts`
- `game/tests/campaign-progression-audit.test.ts`
- `game/tests/public-asset-package-audit.test.ts`

### Completion Order (Archived)

1. Replace template declarations with authored per-map geometry and semantic transformation/mover data; add mandatory-route and ammo-budget annotations.
2. Implement reusable projectiles, splash, pain, factions/provokers, corpses/resurrection, actor states, and the distinct weapon/enemy/boss contracts.
3. Integrate `PersistenceSystem` with engine snapshots, map completion, level select, autosave/recovery, and deterministic demos.
4. Fix `E3M2` pistol-start supply, pickup/protection baselines, tally semantics, and all map validators.
5. Produce a deployable asset package and verify it through production preview, clean-install, 27-map normal-input playthroughs, save/restore matrices, performance tests, and human onboarding/balance sessions.
