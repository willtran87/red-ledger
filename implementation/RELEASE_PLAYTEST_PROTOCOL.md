# Release Playtest Protocol

- Protocol revision: 2026-07-22
- Previous automated software candidate: `ac5e4d6290502366f487f6c4d9cd171126019500` (`ac5e4d6`)
- Candidate under review: `e708749138333697a187be091485461f56ec246e` (`e708749`)
- Automated preflight and exact-candidate live deployment: **Pass**; exact output, structured evidence, committed-file hashes, and Pages run `29879441618` are archived under `manifests/`

This protocol closes the four release gates that cannot be truthfully certified by automated tests. Record raw observations and hardware details; do not replace failures with subjective summaries. Automated results are prerequisites, not substitutes for these records. The authored-audio content target is implemented; its subjective listening, device, and provenance checks are part of the representative-hardware and rights gates below.

The current candidate includes the later combat-hit, contextual route-hint, grounded-defeat, and chroma-fringe fixes, the corrected runtime asset catalog, and a materially clearer first-run orientation. Ordinary desktop briefing copy now uses an 18px map title, 13px objective and bindings, 12px metadata, and 11px action labels, with stronger 2560 scaling and preserved compact/touch containment. It passed a clean `npm ci`, 397 tests across 36 files, the nested production package, 36 registered browser scenarios, Chromium/Firefox/WebKit smoke, exact 3,660-file `dist`/Pages parity, a zero-vulnerability production audit, 11 focused public/audio tests across three files, a current 3,547-PNG runtime catalog, and the complete alpha-boundary/chroma/spacing validator. GitHub Pages then deployed the committed 3,661-file tree including `.nojekyll`; seven sampled live HTML, JS, CSS, audio, music, and particle-art byte streams match that tree. The installed browser-game client reaches the paused E1M1 orientation locally and live with complete assets, a ready authored-audio library, matching state, no captured page errors, and visually readable contained instructions. Use `manifests/release-candidate-evidence.json`, `manifests/release-candidate-preflight.txt`, and `manifests/pages-artifact-sha256.txt` as the candidate header evidence for every human record below.

## Current Signoff Status

| Gate | Status for current candidate | Required evidence |
|---|---|---|
| Blind E1M1 onboarding | **Open** | Five independent blind-player records and the aggregate pass calculation. |
| Campaign balance and duration | **Open** | One continuous Field Adjuster campaign plus a fresh-start run of every map. |
| Representative hardware | **Open** | Integrated-GPU, midrange discrete-GPU, and touch-device measurements. |
| Rights and public-build review | **Open** | Signed review, provenance manifest, artifact checksum, and final disposition. |

Do not change an **Open** status based on an automated run, an internal developer playthrough, or an undocumented conversation. A gate closes only when its completed record is archived and linked from the final signoff register.

## Candidate Control And Preflight

All four gates must refer to the same immutable candidate. Before recruiting testers:

1. Record the full output of `git rev-parse HEAD` and require a clean `git status --short`.
2. From `game/`, run `npm ci`, `npm run test:release`, `npm run pages:sync`, `npm run pages:verify`, and `npm audit --omit=dev`.
3. Confirm that `assets/audio/audio-library.json` is schema 2 and records 33 music tracks, 347 unique cues, 189 semantic groups, and five SFX shards; archive its SHA-256 and `manifests/audio-library-validation.json` with the candidate evidence.
4. Record the exact command output, UTC timestamp, Node/npm versions, browser versions, production URL, build inventory count, and artifact-manifest SHA-256.
5. Run `node tools/generate_pages_artifact_manifest.mjs <candidate-commit>` from the repository root and archive its sorted SHA-256 manifest for every raw committed published file. Keep `.nojekyll` in the manifest even though `pages:verify` intentionally ignores it as publication control metadata.
6. Verify that the deployed production URL loads the recorded candidate without console or page errors before human sessions begin.
7. Require `git status --short` to be clean again after preflight. If build or Pages synchronization changed tracked files, commit the intended output and repeat preflight from the new commit.

Any source, campaign-data, asset, dependency, build, or runtime change creates a new candidate. Repeat the automated preflight and every human gate affected by that change. Documentation-only record corrections do not invalidate gameplay results when the candidate commit and artifact hash remain unchanged.

## 1. Blind Onboarding

- Recruit at least five players who have not seen the design documents, watched prior play, or received control coaching.
- Give only the production URL and the instruction: `Finish E1M1 on Desk Adjuster.`
- Do not answer gameplay questions during the attempt. Record requested-help moments as observations even when no help is given.
- Record time to movement, first look, first shot, first Use interaction, first credential door, first death, and map completion.
- Ask each player to explain blocked-interaction feedback, the current objective, and what they would try next.
- Pass when at least four of five finish without coaching and every blocked interaction produces feedback the player can correctly explain.

## 2. Campaign Balance And Duration

### Automated Prerequisite

From `game/`, run this deterministic balance gate on the exact candidate before scheduling human sessions:

```powershell
npx vitest run src/game/EconomyPolicy.test.ts tests/campaign-balance-simulation.test.ts
```

The gate locks runtime ammunition caps and grants, consumes supplies and weapon grants in encounter order with a 20% aim/overkill reserve, and checks every map's fresh-start mandatory route and bosses. Fresh-start coverage includes the ordinary route, a conservative case that withholds entry pickups until after nonlethal damage, and a case with 25% optional pressure; delayed supplies are never credited after lethal damage. It also simulates a continuous Field Adjuster episode route with 60% optional pressure, verifies all five response levels, and bounds route recovery, pressure scaling, carry saturation, and the authored par envelope. It deliberately excludes secret and breakable supplies and credits only half of maximum launcher splash.

This prerequisite does **not** certify fun, real aiming behavior, incoming-damage fairness, navigation time, secret discovery, or a human 6-9 hour completion time. Those claims require the raw records below and remain open even when automation passes.

- Complete one continuous Field Adjuster run from E1M1 through the main ending.
- Complete one fresh-start Field Adjuster run of every main and secret map. Secret-map runs may be scheduled directly only after their normal entry route has been verified in the continuous run.
- Record map time, deaths, kills/items/secrets, ammunition entering and leaving, mandatory-encounter ammunition, health/armor, and every soft-lock, restart, or recovery incident.
- Target 15-35 minutes per experienced main-map clear and 6-9 hours for the full main campaign.
- Pass only when every mandatory route remains completable from its declared starter-equivalent supply, no recovery path depends on a debug command, and outlier times have an accepted written disposition.

## 3. Representative Hardware

- Test current Chromium, Firefox, and WebKit-class browsers across an integrated GPU, a midrange discrete GPU, and one touch device. A single device may cover more than one browser, but all three hardware classes and all three engine classes must appear in the matrix.
- Run E1M1, a mixed eight-enemy fight, E2M8, and E3M8 for at least ten minutes each at default settings. Also test the highest supported internal render scale on at least the discrete-GPU system.
- Record startup time, median, 95th-percentile, and worst frame time, peak JS heap, context-loss behavior, input latency observations, audio dropouts, thermal throttling, and visual corruption.
- Exercise keyboard/mouse, controller, and touch on hardware that supports each method. Verify pause/resume, pointer recapture, orientation/resize, and background/foreground restoration.
- On real speakers and headphones, exercise the speakers, headphones, night, and mono profiles. Include menu/intermission, at least one map from every episode, one multi-attack enemy, one boss phase, save/load, player death, pause/resume, and a map transition.
- Listen for audible loop seams, unintended silence or restart, stale music after rapid transitions, attack tells masked by music or weapon fire, spatial collapse, clipping, excessive loudness change between profiles, and authored-to-fallback discontinuity during an intentionally blocked media request. Record whether recovery returns to authored playback without stopping simulation.
- Desktop pass target is 60 FPS without progressive memory growth. Touch passes at stable native refresh or at a documented device ceiling without control loss, runaway heat, or progressive degradation.

## 4. Rights And Public-Build Review

- Review every public title, filename, UI string, credit, illustration, sprite, texture, sound identity, metadata field, repository document, and deployed artifact.
- Confirm that every asset is original, commissioned, or covered by a recorded license and that the fictional identity is clear of restricted marks.
- For audio, review `manifests/audio-production-spec.json`, `tools/build_audio_library.py`, `manifests/audio-library-validation.json`, and the shipped manifest/file hashes. Confirm the declared offline-synthesis provenance, absence of unrecorded samples, required notices, and an acceptable manual sound-resemblance disposition.
- Re-run the automated public-release scan on the exact candidate, then manually inspect its known blind spots, including imagery, implied identity, sound resemblance, and third-party license obligations.
- Archive the signed review, asset provenance manifest, automated scan output, artifact-manifest SHA-256, production URL, and release date together.
- Any unresolved ownership, attribution, license, or mark question fails this gate.

## Record Templates

Create one record set per candidate. Store raw notes, exports, screenshots, traces, and signed approvals beside the completed templates.

### Candidate Header

| Field | Recorded value |
|---|---|
| Candidate name/version | |
| Full commit SHA | |
| Working tree clean | Yes / No |
| Production URL | |
| Test start/end in UTC | |
| Node / npm versions | |
| Browser versions | Chromium: / Firefox: / WebKit: |
| `npm run test:release` result and log | |
| `npm run pages:verify` file count and log | |
| `npm audit --omit=dev` result and log | |
| Artifact manifest path | |
| Artifact manifest SHA-256 | |
| Audio runtime manifest SHA-256 | |
| Audio validation record path/SHA-256 | |
| Coordinator and signature | |

### Blind Onboarding Observations

| Tester ID | Date/UTC | Device/input | Move | Look | First shot | First Use | Credential door | First death | Complete | Coaching | Feedback explanation correct | Objective/next action | Raw notes |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|
| P01 | | | | | | | | | | | | | |
| P02 | | | | | | | | | | | | | |
| P03 | | | | | | | | | | | | | |
| P04 | | | | | | | | | | | | | |
| P05 | | | | | | | | | | | | | |

Blind-onboarding result: **Pass / Fail**

Completed without coaching: `__/5`

Blocking findings, retest evidence, reviewer, date, and signature:

### Campaign Run Log

Use one row per map attempt. The continuous run must retain one run ID across all maps; fresh-start attempts use a distinct run ID per map.

| Run ID | Continuous/fresh | Map | Attempt | Time | Deaths | K/I/S | HP/armor in -> out | Ammo in -> out | Mandatory ammo spent | Restarts/soft-locks/debug | Result | Evidence/notes |
|---|---|---|---:|---:|---:|---|---|---|---:|---|---|---|
| | | | | | | | | | | | | |

| Aggregate | Recorded value |
|---|---|
| Continuous main-campaign duration | |
| Main maps outside 15-35 minute target | |
| Fresh-start maps completed / required | |
| Secret routes entered normally | |
| Mandatory-route failures | |
| Debug-dependent recoveries | |
| Accepted outlier dispositions | |
| Final result, reviewer, date, signature | |

### Hardware Measurement Log

Use one row per device/browser/scenario combination. Attach the raw performance capture rather than recording only summary values.

| Device ID | CPU / GPU / driver / RAM | OS | Browser/engine | Input | Viewport / DPR / render scale | Scenario / duration | Startup ms | Median / p95 / worst ms | Peak heap | Context loss | Latency/audio/thermal/visual notes | Result | Raw capture |
|---|---|---|---|---|---|---|---:|---|---:|---|---|---|---|
| | | | | | | | | | | | | | |

Hardware coverage: integrated GPU **Pass / Fail**; discrete GPU **Pass / Fail**; touch device **Pass / Fail**; Chromium **Pass / Fail**; Firefox **Pass / Fail**; WebKit-class **Pass / Fail**.

Final result, reviewer, date, and signature:

### Authored Audio Listening Log

Use one row per output device/profile/scenario combination. A profile passes only when critical attack information remains intelligible and lifecycle transitions do not leave stale, duplicated, or permanently silent playback.

| Device / output | Browser | Profile | Scenario / map | Track identity and loop | Attack-tell readability | Spatial/mono result | Pause/death/transition | Dropout/fallback/recovery | Result | Evidence/notes |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | |

Audio coverage: speakers **Pass / Fail**; headphones **Pass / Fail**; night **Pass / Fail**; mono **Pass / Fail**; all three episodes **Pass / Fail**; boss lifecycle **Pass / Fail**; forced fallback/recovery **Pass / Fail**.

### Rights And Provenance Log

| Asset/content family | Public paths | Creator/source | Ownership or license basis | Required attribution/notice | Automated scan | Manual visual/audio/mark review | Finding/disposition | Evidence link | Reviewer/date |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

| Final rights field | Recorded value |
|---|---|
| Provenance manifest path and SHA-256 | |
| License/notice bundle path | |
| Automated public-release scan log | |
| Unresolved findings | |
| Reviewer name, authority, date, signature | |
| Final result | Pass / Fail |

## Final Signoff Register

| Gate | Candidate commit | Artifact-manifest SHA-256 | Record location | Result | Blocking findings | Approved by | Approval date/UTC |
|---|---|---|---|---|---|---|---|
| Blind onboarding | | | | Open | | | |
| Campaign balance and duration | | | | Open | | | |
| Representative hardware | | | | Open | | | |
| Rights and public-build review | | | | Open | | | |

Release-final status requires all four rows to read **Pass**, refer to the same candidate commit and artifact-manifest SHA-256, and accompany a passing `npm run test:release` plus `npm run pages:verify` from that candidate. Before that automated preflight is recorded, report the build as a candidate awaiting automated evidence; after it passes, report it as an automated-release candidate with open human signoffs.
