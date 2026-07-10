# Release Playtest Protocol

This protocol closes the four release gates that cannot be truthfully certified by automated tests. Record raw observations and hardware details; do not replace failures with subjective summaries.

## 1. Blind Onboarding

- Recruit at least five players who have not seen the design documents or watched prior play.
- Give only the production URL and the instruction to finish E1M1 on Desk Adjuster.
- Record time to movement, first shot, first Use interaction, first credential door, first death, and map completion.
- Pass when at least four of five finish without coaching, and every blocked interaction produces feedback the player can correctly explain.

## 2. Campaign Balance And Duration

- Complete one continuous Field Adjuster run and one fresh-start run of every map.
- Record map time, deaths, kills/items/secrets, ammunition entering and leaving, mandatory encounter ammunition, and soft-lock/restart incidents.
- Target 15-35 minutes per experienced main-map clear and 6-9 hours for the full main campaign.
- Pass only when every mandatory route remains completable from its declared starter-equivalent supply and no recovery path depends on a debug command.

## 3. Representative Hardware

- Test current Chromium, Firefox, and WebKit-class browsers on integrated graphics, a midrange discrete GPU, and one touch device.
- Run E1M1, a mixed eight-enemy fight, E2M8, and E3M8 for at least ten minutes each at the default 320x200 internal scale.
- Record median, 95th-percentile, and worst frame time, peak JS heap, context-loss behavior, input latency observations, and any visual corruption.
- Desktop pass target is 60 FPS without progressive memory growth; touch pass target is stable native refresh or a documented device ceiling without control loss.

## 4. Rights And Public-Build Review

- Review every public title, filename, UI string, credit, illustration, sprite, texture, sound identity, and metadata field.
- Confirm that all assets are original, commissioned, or covered by recorded licenses and that the fictional identity is clear of restricted marks.
- Archive the signed review, asset provenance manifest, build checksum, and release date together.

## Signoff Record

For each gate, record tester/reviewer, date, build checksum, result, blocking findings, retest evidence, and final approval. Release-final status requires all four signed records plus a passing `npm run test:release` on the same build.
