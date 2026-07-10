# Red Ledger

A complete retro first-person action campaign set inside a surreal insurance operation. The browser game contains three episodes, 27 maps, eight weapons, twelve standard enemies, four bosses, authored mechanisms, secrets, deterministic demos, save slots, touch controls, and five difficulty levels.

![Red Ledger title screen](assets/public_runtime/ui/title-screen.png)

**Play:** https://willtran87.github.io/red-ledger/

## Run Locally

```powershell
cd game
npm ci
npm run dev
```

Open the local URL printed by Vite. Keyboard, mouse, controller, and touch input are supported. Controls can be remapped from Options.

## Verify

```powershell
cd game
npm run test:release
```

The release gate builds the standalone package and runs unit, campaign, gameplay, progression, responsive/mobile, combat/save, deterministic demo, controls, mechanisms, lifecycle/performance, production portability, and cross-browser tests.

## Documentation

- [Game design document](GAME_DESIGN_DOCUMENT.md)
- [Art production bible](ART_PRODUCTION_BIBLE.md)
- [Asset manifest](ASSET_MANIFEST.md)
- [Image-generation pipeline](IMAGEGEN_PIPELINE.md)
- [Completion audit](implementation/GAME_COMPLETION_AUDIT.md)
- [Release playtest protocol](implementation/RELEASE_PLAYTEST_PROTOCOL.md)

The public repository includes the complete runtime art library and reproducible game source. Raw generation intermediates and third-party reference boards are intentionally excluded.
The verified production build is published from `docs/` through GitHub Pages.
