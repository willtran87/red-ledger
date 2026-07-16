# Red Ledger Game

Browser first-person shooter implementation using Three.js, Vite, and the validated runtime art library in `../assets/public_runtime`.

## Run

```powershell
cd game
npm install
npm run dev
```

The Vite configuration mounts `../assets` as the public root. Runtime images resolve under `/public_runtime`; `npm run build` projects the authoring catalog into the compact runtime catalog at `/data/game-assets.json` and removes authoring-only metadata from the production package.

## Controls

| Action | Input |
|---|---|
| Move | WASD |
| Turn | Mouse or left/right arrows |
| Fire | Left mouse |
| Use/open | E or Space |
| Weapons | 1-8; Q for previous |
| Automap | Tab full, O overlay, +/- zoom; all actions remappable in Options |
| Pause | Escape |
| Quicksave / quickload | F6 (F5 alias) / F9 |
| Fullscreen | F |

Touch devices receive labeled, configurable movement/look controls and fire/use actions. Standard controllers support movement, aim, fire, use, weapon cycling, automap, and pause. Options expose independent mouse/controller/touch look sensitivity, Y inversion, controller deadzone, a default-on six-degree vertical-only auto-aim cone, touch size/opacity/handedness, and three interface text scales.

## Implemented Systems

- Fixed 35 Hz simulation and low-resolution 16:10 rendering
- Three episodes and 27 original, topology-unique campaign maps with canonical `35-65` early, `60-110` mid/secret, and `90-160` late normal-tier enemy budgets
- Eighty-one authored phase profiles with two or three combat roles, spatially realized ambush/infighting intent, difficulty-scaled rosters, pressure curves, and documented relief valleys
- Five difficulty tiers with placement and supply masks
- Eight weapons, four ammunition economies, phase-proportional route supplies and recovery, authored view animation frames, traveling canister/plasma attacks, splash risk, and a multi-pulse room-clear beam
- Twelve standard enemies and four bosses with directional animation, distinct attack profiles, projectiles, hazards, stealth, resurrection, summons, actor-intercepting crossfire, infighting, and phase changes
- Two-phase final encounter
- Credentials, doors, transformations, teleports, secrets with typed armor/ammo/map/weapon/powerup rewards, hazards, powerups, and exits
- A Forensic Lens that disrupts hostile acquisition, ranged locks, accuracy, predictive aim, and homing while marking live threats with cyan signatures
- Per-sector floor heights, automatic step traversal, animated lifts/bridges, and two map-specific landmark machines per map
- Persistent episode inventory, intermissions, tallies, narrative art, and final epilogue
- Explored automap and face-driven status bar
- Eight manual slots, quicksave/quickload, rotating map-entry autosaves, episode recovery, corruption-safe Continue, campaign unlocks, and level select
- Compatibility-aware restore with stable authored actor keys, exact pickup identity, explicit encounter unlock state, isolated dynamic-summon identities, and conservative legacy reconstruction
- Schema-2 authored audio with 33 streamed tracks, including one distinct 2.5-4 minute score per map, plus 347 cues in 189 semantic groups across five lazy SFX shards, persisted speakers/headphones/night/mono profiles, bounded retry, and synthesized failure fallback
- Desktop, fullscreen, and touch layouts
- Deterministic `window.advanceTime(ms)` and `window.render_game_to_text()` hooks
- Checksummed schema-4 35 Hz gameplay demos with required recorded vertical-auto-aim state, an isolated v3 replay-library key that leaves v2/v1 data untouched, persistent keyboard/mouse/controller remapping, menu navigation, and a held controller weapon radial
- Forty fixed-pivot transparent `32x32` particle seeds from five uniformly spaced eight-cell sheets, with chroma, alpha, palette, metadata, and spacing validation

## Verification

```powershell
npm run test
npm run test:e2e
npm run test:progression
npm run test:campaign
npm run test:visual
npm run test:combat-save
npm run test:demo
npm run test:controls
npm run test:mechanisms
npx vitest run tests/audio-content-contracts.test.ts src/game/AudioSystem.test.ts
npm run test:release
```

High-resolution visual coverage uses `2560x1600`, ordinary desktop uses `1280x720`, compact pointer-fine/zoom coverage uses `640x400`, and the mobile breakpoint uses `390x844`.

## Runtime Data

- Campaign: `src/data`
- Engine: `src/game`
- Runtime catalog: `../assets/data/game-assets.json`
- Runtime audio manifest: `../assets/audio/audio-library.json`
- Audio production contract: `../AUDIO_PRODUCTION_BIBLE.md`
- Authoring catalog: `../assets/data/runtime-assets.json`
- Runtime projection: `scripts/build-game-catalog.mjs`
- Authoring catalog generator: `../implementation/generate-runtime-catalog.mjs`
- Requirements matrix: `../implementation/requirements.md`
