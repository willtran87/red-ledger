# Audio Production Bible

## Authority

This document, `manifests/audio-production-spec.json`, and `tools/build_audio_library.py` define the production audio contract. The rendered MP3 files under `assets/audio` are committed runtime outputs. The schema-2 runtime manifest at `assets/audio/audio-library.json` maps every track and semantic group to those files. The validation record in `manifests/audio-library-validation.json` binds the outputs to the source spec with SHA-256 hashes, media probes, level measurements, cue boundaries, and per-cue PCM fingerprints.

All music and sound effects are original offline synthesis authored for this project. The library contains no sampled recordings, borrowed melodies, sound-alike arrangements, speech, brands, or third-party audio. The generator is the lossless source authority; compressed runtime files are disposable derivatives.

## Runtime Scope

| Content | Shipping count | Contract |
|---|---:|---|
| Map music | 27 | One unique 154-236 second loop per map, each with a distinct opening motif |
| UI and ending music | 6 | Menu, intermission, credits, and one ending cue per episode |
| Music total | 33 | Within the full-game target of 30-35 tracks |
| SFX sprite shards | 5 | Actors, attacks, weapons, world/environment, and player/UI decode independently on demand |
| Semantic SFX groups | 189 | Typed actor, attack, weapon, player, pickup, ambience, footstep, world, UI, and progression events |
| Unique SFX cues | 347 | Within the full-game target of 250-350 effects; every PCM fingerprint is distinct |

The schema-2 SFX library is shipped as five padded mono audio sprite shards. Every semantic group names exactly one shard in the runtime manifest, so the browser fetches and decodes only the family needed by the current interaction while still avoiding hundreds of individual requests. The longest shard is under 90 seconds instead of requiring a single 154-second decode. Music is stored as one stereo file per track and streamed through an `HTMLMediaElement` connected to the Web Audio mix graph; long-form tracks are never decoded into whole-track `AudioBuffer` allocations.

## Music Direction

The score uses tracker-like repetition, FM-inspired leads, gated bass, relay percussion, machinery resonance, and deliberate negative space. It alternates among three authored arrangement families:

- `industrial`: propulsive mechanical rhythm, compact low end, and hard transient punctuation.
- `minimal`: anxious office pulse, sparse counters, and exposed motifs.
- `ambient`: pumps, mains hum, long harmonic beds, and interrupted machine gestures.

Episode 1 is dry, procedural, and increasingly forceful. Episode 2 adds wet machinery, glass, and unstable pulse spacing. Episode 3 becomes mathematical, wax-heavy, and harmonically severe. Boss tracks retain attack-tell headroom and do not replace gameplay rhythm with an unbroken wall of sound.

Every map entry in the source spec owns tempo, root, mode, arrangement family, opening motif, harmonic progression, density, and grit. Map definitions reference the canonical track ID directly. Runtime music uses browser media streaming and native looping rather than whole-track decoding or main-thread interval timing.

## Sound Language

Hostile identity combines paper strain, relay chatter, synthetic formants, motor harmonics, and event-specific envelopes. Each hostile owns distinct idle, alert, pain, and death groups. Every defined hostile attack also owns a distinct windup and resolve cue, so multi-attack enemies and bosses communicate the chosen threat before damage resolves.

Weapons use separate mechanical profiles and three fire variants. Dry fire and terminal impact are independently authored. Pickups are divided into health, armor, ammunition, weapon, credential, and powerup bands so confirmation remains readable during combat.

World feedback covers doors, locked access, switches, lift starts and endpoints, secrets, teleports, breakables, hazards, mechanisms, exits, eight footstep materials, and seven environmental ambience identities. Player and progression feedback covers hurt, armor response, death, menu acceptance, save/load, map clear, status expiry, and momentum milestones.

## Mix Contract

1. Incoming attack, boss-phase, and hazard tells are `critical`.
2. Player weapon events, damage, and important pickup confirmation are `important`.
3. Ordinary impacts, state confirmation, and mechanisms are `routine`.
4. Hostile idle and optional ambience are `ambient`.
5. Music uses its own bus and ducks under high-value weapon events.

The master compressor is a safety stage, not a loudness repair. Encoded SFX retain at least 3 dB of measured peak headroom. Spatial events use equal-power stereo panning when available, distance attenuation, and a centered fallback. The 32-voice semantic limiter must never evict critical tells in favor of lower-priority feedback.

Playback profiles alter presentation without changing gameplay: speakers retain broad center information, headphones increase spatial separation, night reduces transient range, and mono folds positional cues while preserving priority. Master, music, SFX, mute, and profile settings persist independently and remain usable when browser storage is unavailable.

## Loading And Failure Behavior

- The manifest begins loading after a user gesture unlocks Web Audio. Requests for the same semantic shard coalesce; a successfully decoded shard remains cached, while failed attempts may retry after the bounded cooldown.
- The current music track streams lazily through a reusable media element and replaces any loading fallback only if it is still the requested track.
- Map transitions abort the prior media request; token ownership prevents a superseded request from pausing or replacing the current track.
- Pause, focus loss, and replay pause suspend playback and resume it only with the matching lifecycle transition. Player death stops music but leaves the audio context available for the death and menu cues. Fatal shutdown stops playback and tears down active audio work.
- Missing, rejected, or undecodable content records a degraded diagnostic and uses deterministic synthesized fallback feedback. Manifest and shard failures retry after a bounded cooldown, and a content failure must not halt simulation.
- Save restoration never replays pickup, alert, attack, or mechanism transients.

## Reproduction And Validation

Install the authoring dependency and render from the repository root:

```powershell
py -3.11 -m pip install -r tools/audio-requirements.txt
py -3.11 tools/build_audio_library.py --force
```

Then run the content and runtime gates:

```powershell
cd game
npx vitest run tests/audio-content-contracts.test.ts src/game/AudioSystem.test.ts
```

Release validation rejects missing tracks, duplicate map motifs, map durations outside 2.5-4 minutes, SFX counts outside 250-350, duplicate cue fingerprints, missing or multiply assigned semantic shards, overlapping regions within any sprite shard, altered file hashes, unregistered semantic groups, missing definition references, invalid channel/sample-rate metadata, and unsafe encoded levels.
