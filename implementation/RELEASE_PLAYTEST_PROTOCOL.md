# Release Playtest Protocol

- Protocol revision: 2026-07-15
- Current automated software baseline: `804f837b70efbfa201ffa3a1be4b18908e2896e5` (`804f837`)

This protocol closes the four release gates that cannot be truthfully certified by automated tests. Record raw observations and hardware details; do not replace failures with subjective summaries. Automated results are prerequisites, not substitutes for these records. This protocol does not close the separate authored-audio content gap recorded in `GAME_COMPLETION_AUDIT.md`.

## Current Signoff Status

| Gate | Status for `804f837` | Required evidence |
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
3. Record the exact command output, UTC timestamp, Node/npm versions, browser versions, production URL, build inventory count, and artifact-manifest SHA-256.
4. Generate and archive a sorted SHA-256 manifest for every published file. Keep `.nojekyll` in the manifest even though `pages:verify` intentionally ignores it as publication control metadata.
5. Verify that the deployed production URL loads the recorded candidate without console or page errors before human sessions begin.
6. Require `git status --short` to be clean again after preflight. If build or Pages synchronization changed tracked files, commit the intended output and repeat preflight from the new commit.

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

The gate locks runtime ammunition caps and grants, consumes supplies and weapon grants in encounter order with a 20% aim/overkill reserve, checks every map's fresh-start mandatory route and bosses, simulates a continuous Field Adjuster episode route with 60% optional pressure, verifies all five response levels, and bounds route recovery, pressure scaling, carry saturation, and the authored par envelope. It deliberately excludes secret and breakable supplies and credits only half of maximum launcher splash.

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
- Desktop pass target is 60 FPS without progressive memory growth. Touch passes at stable native refresh or at a documented device ceiling without control loss, runaway heat, or progressive degradation.

## 4. Rights And Public-Build Review

- Review every public title, filename, UI string, credit, illustration, sprite, texture, sound identity, metadata field, repository document, and deployed artifact.
- Confirm that every asset is original, commissioned, or covered by a recorded license and that the fictional identity is clear of restricted marks.
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

Release-final status requires all four rows to read **Pass**, refer to the same candidate commit and artifact-manifest SHA-256, and accompany a passing `npm run test:release` plus `npm run pages:verify` from that candidate. Until then, report the build as an automated-release candidate with open human signoffs.
