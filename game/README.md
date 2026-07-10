# Red Ledger Game

Browser first-person shooter implementation using Three.js, Vite, and the validated runtime art library in `../assets/public_runtime`.

## Run

```powershell
cd game
npm install
npm run dev
```

The Vite configuration mounts `../assets` as the public root. Runtime images resolve under `/public_runtime`; the generated catalog resolves at `/data/runtime-assets.json`.

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

Touch devices receive a movement stick and fire control. Standard controllers support movement, aim, fire, use, weapon cycling, automap, and pause.

## Implemented Systems

- Fixed 35 Hz simulation and low-resolution 16:10 rendering
- Three episodes and 27 original, topology-unique authored campaign maps
- Five difficulty tiers with placement and supply masks
- Eight weapons, four ammunition economies, authored view animation frames, traveling canister/plasma attacks, splash risk, and a multi-pulse room-clear beam
- Twelve standard enemies and four bosses with directional animation, distinct attack profiles, projectiles, hazards, stealth, resurrection, summons, infighting, and phase changes
- Two-phase final encounter
- Credentials, doors, transformations, teleports, secrets, hazards, powerups, and exits
- Per-sector floor heights, automatic step traversal, animated lifts/bridges, and two map-specific landmark machines per map
- Persistent episode inventory, intermissions, tallies, narrative art, and final epilogue
- Explored automap and face-driven status bar
- Eight manual slots, quicksave/quickload, rotating map-entry autosaves, episode recovery, corruption-safe Continue, campaign unlocks, and level select
- Deterministic map-specific 2.56-minute procedural scores and identity-specific combat cues with no external audio dependency
- Desktop, fullscreen, and touch layouts
- Deterministic `window.advanceTime(ms)` and `window.render_game_to_text()` hooks
- Checksummed 35 Hz gameplay demo recording/playback, persistent keyboard/mouse/controller remapping, menu navigation, and a held controller weapon radial

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
npm run build
```

High-resolution visual coverage uses `2560x1600`, ordinary desktop uses `1280x720`, and the mobile breakpoint uses `390x844`.

## Runtime Data

- Campaign: `src/data`
- Engine: `src/game`
- Asset catalog: `../assets/data/runtime-assets.json`
- Catalog generator: `../implementation/generate-runtime-catalog.mjs`
- Requirements matrix: `../implementation/requirements.md`
