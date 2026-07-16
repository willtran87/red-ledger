"""Render the original authored music and compact SFX sprite shards used by the game.

The production files are committed so the web build has no authoring-time Python
or FFmpeg dependency. Re-running this script from the repository root reproduces
the library from manifests/audio-production-spec.json.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Any

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / "manifests/audio-production-spec.json"
AUDIO_ROOT = ROOT / "assets/audio"
MUSIC_ROOT = AUDIO_ROOT / "music"
SFX_ROOT = AUDIO_ROOT / "sfx"
RUNTIME_MANIFEST = AUDIO_ROOT / "audio-library.json"
VALIDATION_MANIFEST = ROOT / "manifests/audio-library-validation.json"
MUSIC_BITRATE = "64k"
SFX_BITRATE = "80k"
PAD_SECONDS = 0.04
SFX_SHARDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("actors", ("enemy/",)),
    ("attacks", ("attack/",)),
    ("weapons", ("weapon/",)),
    ("world-environment", ("world/", "ambient/", "footstep/")),
    ("player-ui", ("player/", "pickup/", "ui/")),
)


def stable_seed(value: str) -> int:
    return int.from_bytes(hashlib.sha256(value.encode("ascii")).digest()[:8], "little")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def midi_hz(note: float) -> float:
    return 440.0 * 2.0 ** ((note - 69.0) / 12.0)


def pan_gains(pan: float) -> tuple[float, float]:
    position = max(-1.0, min(1.0, pan))
    angle = (position + 1.0) * math.pi / 4.0
    return math.cos(angle), math.sin(angle)


def oscillator(kind: str, phase: np.ndarray, modulation: np.ndarray | None = None) -> np.ndarray:
    if modulation is not None:
        phase = phase + modulation
    if kind == "square":
        return np.where(np.sin(phase) >= 0.0, 1.0, -1.0)
    if kind == "saw":
        return 2.0 * ((phase / (2.0 * math.pi)) % 1.0) - 1.0
    if kind == "triangle":
        return 2.0 * np.abs(2.0 * ((phase / (2.0 * math.pi)) % 1.0) - 1.0) - 1.0
    return np.sin(phase)


def envelope(length: int, sample_rate: int, attack: float, release: float) -> np.ndarray:
    result = np.ones(length, dtype=np.float32)
    attack_samples = min(length, max(1, round(attack * sample_rate)))
    release_samples = min(length, max(1, round(release * sample_rate)))
    result[:attack_samples] *= np.linspace(0.0, 1.0, attack_samples, endpoint=True, dtype=np.float32)
    result[-release_samples:] *= np.linspace(1.0, 0.0, release_samples, endpoint=True, dtype=np.float32)
    return result


def add_stereo(
    left: np.ndarray,
    right: np.ndarray,
    signal: np.ndarray,
    start: float,
    sample_rate: int,
    pan: float,
    gain: float,
) -> None:
    first = max(0, round(start * sample_rate))
    if first >= len(left):
        return
    signal = signal[: len(left) - first]
    left_gain, right_gain = pan_gains(pan)
    left[first : first + len(signal)] += signal * gain * left_gain
    right[first : first + len(signal)] += signal * gain * right_gain


def synth_note(
    frequency: float,
    duration: float,
    sample_rate: int,
    kind: str,
    seed: int,
) -> np.ndarray:
    length = max(1, round(duration * sample_rate))
    time = np.arange(length, dtype=np.float64) / sample_rate
    phase = 2.0 * math.pi * frequency * time
    rng = np.random.default_rng(seed)
    if kind == "bass":
        raw = 0.72 * oscillator("square", phase) + 0.28 * oscillator("saw", phase * 0.5)
        raw += np.sin(phase * 2.0) * 0.12
        shaped = np.tanh(raw * 1.4)
        env = envelope(length, sample_rate, 0.008, min(0.12, duration * 0.38))
    elif kind == "lead":
        modulation = np.sin(phase * 2.01) * (1.8 + (seed % 7) * 0.23)
        shaped = 0.7 * oscillator("sine", phase, modulation) + 0.3 * oscillator("square", phase * 0.5)
        env = envelope(length, sample_rate, 0.012, min(0.15, duration * 0.48))
    elif kind == "pad":
        detune = 1.002 + (seed % 5) * 0.0007
        shaped = np.sin(phase) * 0.5 + np.sin(phase * detune) * 0.3 + np.sin(phase * 0.5) * 0.2
        env = envelope(length, sample_rate, min(0.18, duration * 0.25), min(0.35, duration * 0.35))
    else:
        shaped = oscillator("triangle", phase) * 0.75
        shaped += rng.normal(0.0, 0.08, length)
        env = envelope(length, sample_rate, 0.003, min(0.08, duration * 0.5))
    return (shaped * env).astype(np.float32)


def synth_kick(sample_rate: int, seed: int) -> np.ndarray:
    duration = 0.24
    length = round(duration * sample_rate)
    time = np.arange(length, dtype=np.float64) / sample_rate
    start_frequency = 112.0 + seed % 26
    frequency = 42.0 + (start_frequency - 42.0) * np.exp(-time * 25.0)
    phase = 2.0 * math.pi * np.cumsum(frequency) / sample_rate
    click = np.random.default_rng(seed).normal(0.0, 1.0, length) * np.exp(-time * 80.0)
    return (np.sin(phase) * np.exp(-time * 15.0) + click * 0.16).astype(np.float32)


def synth_snare(sample_rate: int, seed: int) -> np.ndarray:
    duration = 0.19
    length = round(duration * sample_rate)
    time = np.arange(length, dtype=np.float64) / sample_rate
    rng = np.random.default_rng(seed)
    noise = rng.normal(0.0, 1.0, length)
    low = np.convolve(noise, np.ones(7) / 7.0, mode="same")
    bright = noise - low
    body = np.sin(2.0 * math.pi * (148.0 + seed % 32) * time)
    return ((bright * 0.7 + body * 0.32) * np.exp(-time * 23.0)).astype(np.float32)


def synth_hat(sample_rate: int, seed: int, duration: float = 0.055) -> np.ndarray:
    length = round(duration * sample_rate)
    time = np.arange(length, dtype=np.float64) / sample_rate
    rng = np.random.default_rng(seed)
    noise = rng.normal(0.0, 1.0, length)
    return ((noise - np.roll(noise, 1)) * np.exp(-time * 62.0) * 0.52).astype(np.float32)


def synth_machine_hit(sample_rate: int, seed: int, duration: float = 0.42) -> np.ndarray:
    length = round(duration * sample_rate)
    time = np.arange(length, dtype=np.float64) / sample_rate
    base = 48.0 + seed % 74
    metallic = np.sin(2.0 * math.pi * base * time)
    metallic += np.sin(2.0 * math.pi * base * 2.73 * time) * 0.5
    metallic += np.sin(2.0 * math.pi * base * 4.19 * time) * 0.24
    pulses = np.where(np.sin(2.0 * math.pi * (11.0 + seed % 5) * time) > 0.55, 1.0, 0.22)
    return (metallic * pulses * np.exp(-time * 8.5)).astype(np.float32)


def render_music(track: dict[str, Any], sample_rate: int) -> np.ndarray:
    duration = float(track["duration"])
    length = round(duration * sample_rate)
    left = np.zeros(length, dtype=np.float32)
    right = np.zeros(length, dtype=np.float32)
    seed = stable_seed(f"music:{track['id']}")
    rng = np.random.default_rng(seed)
    bpm = float(track["bpm"])
    beat = 60.0 / bpm
    root = float(track["root"])
    motif = track["motif"]
    progression = [float(value) for value in track["progression"]]
    density = float(track["density"])
    grit = float(track["grit"])
    style = str(track["style"])
    total_beats = int(math.ceil(duration / beat))

    # Low machinery and mains hum anchors every track without occupying runtime voices.
    full_time = np.arange(length, dtype=np.float64) / sample_rate
    hum_frequency = midi_hz(root - 12.0)
    hum = np.sin(2.0 * math.pi * hum_frequency * full_time)
    hum += np.sin(2.0 * math.pi * (50.0 if track["id"].startswith("E2") else 60.0) * full_time) * 0.25
    slow_gate = 0.58 + 0.42 * np.sin(2.0 * math.pi * full_time / (beat * 8.0)) ** 2
    hum = (hum * slow_gate * (0.015 + grit * 0.014)).astype(np.float32)
    left += hum
    right += hum * 0.94

    for beat_index in range(total_beats):
        start = beat_index * beat
        bar = beat_index // 4
        beat_in_bar = beat_index % 4
        section = (bar // 8) % 4
        section_energy = (0.7, 1.0, 0.82, 1.12)[section]
        chord = progression[bar % len(progression)]

        bass_interval = 1 if style == "industrial" else 2 if style == "minimal" else 4
        if beat_index % bass_interval == 0:
            bass_note = root + chord + (0 if beat_in_bar in (0, 2) else -12)
            signal = synth_note(midi_hz(bass_note), beat * (0.78 if style != "ambient" else 1.8), sample_rate, "bass", seed + beat_index)
            add_stereo(left, right, signal, start, sample_rate, -0.08, (0.095 + density * 0.05) * section_energy)

        if style == "industrial":
            if beat_in_bar in (0, 2) or (section == 3 and beat_in_bar == 3):
                add_stereo(left, right, synth_kick(sample_rate, seed + beat_index), start, sample_rate, 0.0, 0.2 + grit * 0.08)
            if beat_in_bar in (1, 3):
                add_stereo(left, right, synth_snare(sample_rate, seed + beat_index), start, sample_rate, 0.06, 0.12 + grit * 0.07)
            add_stereo(left, right, synth_hat(sample_rate, seed + beat_index), start + beat * 0.5, sample_rate, 0.38 if beat_index % 2 else -0.38, 0.06)
        elif style == "minimal":
            if beat_in_bar == 0:
                add_stereo(left, right, synth_kick(sample_rate, seed + beat_index), start, sample_rate, 0.0, 0.12)
            if beat_in_bar in (1, 3):
                add_stereo(left, right, synth_hat(sample_rate, seed + beat_index, 0.035), start, sample_rate, (-1) ** beat_index * 0.52, 0.045)
        elif beat_in_bar == 0 and bar % 2 == 0:
            add_stereo(left, right, synth_machine_hit(sample_rate, seed + bar, beat * 1.7), start, sample_rate, (-1) ** bar * 0.26, 0.045 + grit * 0.035)

        if beat_in_bar == 0:
            pad_duration = min(duration - start, beat * (3.85 if style != "ambient" else 7.5))
            if pad_duration > 0.05:
                for chord_offset, pan in ((0.0, -0.42), (7.0, 0.42), (12.0, 0.0)):
                    pad = synth_note(midi_hz(root + 12 + chord + chord_offset), pad_duration, sample_rate, "pad", seed + bar * 7 + int(chord_offset))
                    add_stereo(left, right, pad, start, sample_rate, pan, (0.022 + density * 0.018) * section_energy)

        if beat_in_bar == 0 and bar % (4 if style == "industrial" else 8) == 0:
            hit = synth_machine_hit(sample_rate, seed + bar)
            add_stereo(left, right, hit, start, sample_rate, -0.5 if bar % 8 else 0.5, 0.08 + grit * 0.08)

    eighth = beat * 0.5
    total_steps = int(math.ceil(duration / eighth))
    for step in range(total_steps):
        value = motif[step % len(motif)]
        if value is None:
            continue
        # The first two phrases are unconditional and form the track's authored opening motif.
        if step >= len(motif) * 2 and rng.random() > density * (0.86 if style == "ambient" else 1.0):
            continue
        start = step * eighth
        bar = step // 8
        transpose = progression[(bar // 2) % len(progression)]
        octave = 12 if (bar // 8) % 4 != 2 else 0
        frequency = midi_hz(root + 12 + octave + transpose + float(value))
        note_duration = eighth * (0.74 if style == "industrial" else 1.28 if style == "ambient" else 0.92)
        lead = synth_note(frequency, min(note_duration, duration - start), sample_rate, "lead", seed + step * 13)
        pan = math.sin((step + seed % 17) * 0.47) * (0.46 if style != "ambient" else 0.68)
        add_stereo(left, right, lead, start, sample_rate, pan, 0.035 + density * 0.025)

    # Soft saturation and conservative loudness leave headroom for protected gameplay cues.
    left = np.tanh(left * (1.18 + grit * 0.28)).astype(np.float32)
    right = np.tanh(right * (1.18 + grit * 0.28)).astype(np.float32)
    left -= np.mean(left)
    right -= np.mean(right)
    peak = max(float(np.max(np.abs(left))), float(np.max(np.abs(right))), 1e-6)
    rms = math.sqrt(float(np.mean((left * left + right * right) * 0.5)))
    target_rms = 0.125 if style == "industrial" else 0.105 if style == "minimal" else 0.085
    scale = min(0.91 / peak, target_rms / max(rms, 1e-6))
    left *= scale
    right *= scale
    fade_samples = min(length // 2, round(sample_rate * 0.035))
    fade = np.linspace(0.0, 1.0, fade_samples, dtype=np.float32)
    left[:fade_samples] *= fade
    right[:fade_samples] *= fade
    left[-fade_samples:] *= fade[::-1]
    right[-fade_samples:] *= fade[::-1]
    return np.column_stack((left, right))


def sfx_duration(event: str, identity: str, variant: int) -> float:
    base = {
        "idle": 0.46,
        "alert": 0.34,
        "windup": 0.4,
        "attack": 0.27,
        "pain": 0.22,
        "death": 0.68,
        "phase": 0.82,
        "fire": 0.24,
        "dry": 0.1,
        "impact": 0.18,
        "hurt": 0.24,
        "armor": 0.19,
        "door-open": 0.48,
        "door-locked": 0.2,
        "lift-start": 0.42,
        "lift-end": 0.3,
        "teleport": 0.52,
        "hazard-placed": 0.36,
        "hazard-armed": 0.28,
        "map-clear": 0.72,
        "status-expire": 0.34,
        "momentum": 0.26,
    }.get(event, 0.3)
    if identity in ("binding-engine", "catastrophe-launcher") and event == "fire":
        base += 0.34
    if identity in ("umbra-saw",) and event == "fire":
        base += 0.16
    return base * (0.94 + variant * 0.055)


def render_sfx(group: str, variant: int, sample_rate: int) -> np.ndarray:
    parts = group.split("/")
    category = parts[0]
    identity = parts[1] if len(parts) > 2 else parts[0]
    event = parts[-1]
    duration = sfx_duration(event, identity, variant)
    if category == "ambient":
        duration = 1.8 + variant * 0.08
    elif category == "footstep":
        duration = 0.14 + variant * 0.012
    length = max(8, round(duration * sample_rate))
    time = np.arange(length, dtype=np.float64) / sample_rate
    seed = stable_seed(f"sfx:{group}:{variant}")
    identity_seed = stable_seed(identity)
    rng = np.random.default_rng(seed)
    base = 72.0 + identity_seed % 278
    noise = rng.normal(0.0, 1.0, length)
    low_noise = np.convolve(noise, np.ones(9) / 9.0, mode="same")
    high_noise = noise - low_noise
    signal = np.zeros(length, dtype=np.float64)

    if category == "ambient":
        slow = 0.52 + 0.48 * np.sin(2.0 * math.pi * (0.7 + identity_seed % 5 * 0.1) * time) ** 2
        motor = np.sin(2.0 * math.pi * (42.0 + identity_seed % 96) * time)
        signal = (motor * 0.42 + low_noise * 0.34 + high_noise * 0.08) * slow
        if event in ("rain", "pumps"):
            signal += low_noise * 0.36
    elif category == "footstep":
        impact = np.exp(-((time - 0.018) / 0.011) ** 2)
        tail = np.exp(-time * (20.0 + variant * 3.0))
        material_pitch = 72.0 + identity_seed % 520
        signal = high_noise * tail * 0.52 + np.sin(2.0 * math.pi * material_pitch * time) * tail * 0.38
        signal *= impact * 0.65 + tail * 0.35
    elif event == "idle":
        carrier = base * (0.76 + variant * 0.04)
        wobble = np.sin(2.0 * math.pi * (3.0 + identity_seed % 7) * time) * 2.4
        signal = np.sin(2.0 * math.pi * carrier * time + wobble) * 0.52 + low_noise * 0.2
        signal *= 0.55 + 0.45 * np.sin(math.pi * np.minimum(1.0, time / duration))
    elif event in ("alert", "windup", "phase"):
        rise = {"alert": 1.8, "windup": 2.45, "phase": 1.35}[event]
        frequency = base * (0.72 + (rise - 0.72) * (time / duration) ** (1.4 if event == "windup" else 0.8))
        phase = 2.0 * math.pi * np.cumsum(frequency) / sample_rate
        pulse_rate = (7.0 if event == "windup" else 4.0) + variant * 1.5
        pulse = 0.34 + 0.66 * (np.sin(2.0 * math.pi * pulse_rate * time) > -0.15)
        signal = (np.sin(phase) * 0.68 + oscillator("square", phase * 0.5) * 0.24 + high_noise * 0.12) * pulse
        if event == "phase":
            signal += np.sin(phase * 1.503) * 0.36
    elif event in ("attack", "resolve", "fire"):
        fall = np.maximum(42.0, base * (2.2 - 1.55 * (time / duration)))
        phase = 2.0 * math.pi * np.cumsum(fall) / sample_rate
        transient = high_noise * np.exp(-time * (26.0 if event == "attack" else 18.0))
        body_kind = "saw" if identity_seed & 1 else "square"
        signal = oscillator(body_kind, phase) * np.exp(-time * 5.5) * 0.65 + transient * 0.58
        if category == "weapon":
            profiles = {
                "claim-stamp": (0.7, 0.5),
                "staple-driver": (2.6, 0.72),
                "twin-bore-riveter": (1.55, 1.0),
                "audit-repeater": (3.1, 0.62),
                "catastrophe-launcher": (0.48, 1.25),
                "plasma-copier": (4.0, 0.44),
                "binding-engine": (5.4, 0.62),
                "umbra-saw": (0.82, 1.1),
            }
            pitch, grit = profiles.get(identity, (1.0, 0.7))
            signal += np.sin(phase * pitch) * np.exp(-time * 3.8) * 0.42
            signal += high_noise * np.exp(-time * 7.5) * grit * 0.24
    elif event in ("pain", "hurt"):
        frequency = np.maximum(48.0, base * (1.55 - 0.85 * time / duration))
        phase = 2.0 * math.pi * np.cumsum(frequency) / sample_rate
        signal = np.sin(phase + np.sin(phase * 0.31) * 2.2) * 0.68 + high_noise * 0.24
    elif event == "death":
        frequency = np.maximum(35.0, base * (1.2 - 0.98 * (time / duration) ** 0.72))
        phase = 2.0 * math.pi * np.cumsum(frequency) / sample_rate
        tearing = high_noise * (0.25 + time / duration * 0.75)
        signal = np.sin(phase + np.sin(phase * 0.17) * 3.0) * 0.62 + tearing * 0.42
    elif event == "dry":
        impulses = np.exp(-((time - 0.018) / 0.006) ** 2) + 0.62 * np.exp(-((time - 0.058) / 0.008) ** 2)
        signal = impulses * (high_noise * 0.7 + np.sin(2.0 * math.pi * (900 + identity_seed % 800) * time) * 0.3)
    elif event == "impact":
        signal = high_noise * np.exp(-time * 28.0) * 0.7
        signal += np.sin(2.0 * math.pi * (110 + identity_seed % 380) * time) * np.exp(-time * 18.0) * 0.5
    elif event in ("map-clear", "secret", "menu-accept", "save", "load", "credential", "powerup", "momentum"):
        intervals = (0, 4, 7, 12) if event in ("map-clear", "secret") else (0, 7, 12)
        for index, interval in enumerate(intervals):
            note_start = index * duration / (len(intervals) + 1)
            local = np.maximum(0.0, time - note_start)
            active = time >= note_start
            tone = np.sin(2.0 * math.pi * midi_hz(68 + (identity_seed % 5) + interval) * local)
            signal += tone * np.exp(-local * 9.0) * active * (0.62 / len(intervals) ** 0.35)
        signal += high_noise * np.exp(-time * 35.0) * 0.12
    elif event in ("teleport", "hazard-armed", "status-expire"):
        frequency = base * (0.8 + 1.7 * (time / duration))
        phase = 2.0 * math.pi * np.cumsum(frequency) / sample_rate
        signal = np.sin(phase) * 0.62 + np.sin(phase * 1.5) * 0.28
        signal *= 0.55 + 0.45 * np.sin(2.0 * math.pi * (6 + variant) * time)
    else:
        # World and UI mechanics use layered relay, motor, paper, and stamp signatures.
        rate = 6.0 + identity_seed % 11
        pulses = np.where(np.sin(2.0 * math.pi * rate * time) > 0.45, 1.0, 0.16)
        motor = np.sin(2.0 * math.pi * base * time + np.sin(2.0 * math.pi * 4.0 * time) * 1.4)
        signal = motor * pulses * 0.54 + low_noise * 0.34 + high_noise * np.exp(-time * 20.0) * 0.25

    attack = 0.002 if event not in ("idle", "phase") else 0.018
    release = min(duration * 0.45, 0.22 if event not in ("death", "phase") else 0.34)
    if category == "ambient":
        attack = release = 0.12
    signal *= envelope(length, sample_rate, attack, release)
    signal = np.tanh(signal * (1.3 + (identity_seed % 5) * 0.08))
    signal -= np.mean(signal)
    peak = max(float(np.max(np.abs(signal))), 1e-6)
    # Leave encoded-transient headroom; the runtime compressor should shape a
    # dense mix rather than repair inter-sample clipping baked into the sprite.
    signal *= 0.68 / peak
    return signal.astype(np.float32)


def expand_sfx_groups(spec: dict[str, Any]) -> list[tuple[str, int]]:
    groups: list[tuple[str, int]] = []
    for identity in spec["standardEnemies"]:
        for event, variants in spec["standardEnemyVariants"].items():
            groups.append((f"enemy/{identity}/{event}", int(variants)))
    for identity in spec["bosses"]:
        for event, variants in spec["bossVariants"].items():
            groups.append((f"enemy/{identity}/{event}", int(variants)))
    for attack in spec["hostileAttacks"]:
        for event, variants in spec["hostileAttackVariants"].items():
            groups.append((f"attack/{attack}/{event}", int(variants)))
    for identity in spec["weapons"]:
        for event, variants in spec["weaponVariants"].items():
            groups.append((f"weapon/{identity}/{event}", int(variants)))
    groups.extend((group, int(variants)) for group, variants in spec["additionalSfxGroups"].items())
    return groups


def sfx_shard_for_group(group: str) -> str:
    matches = [shard for shard, prefixes in SFX_SHARDS if group.startswith(prefixes)]
    if len(matches) != 1:
        raise ValueError(f"SFX group {group!r} must belong to exactly one sprite shard")
    return matches[0]


def write_wav(path: Path, samples: np.ndarray, sample_rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(samples, -1.0, 1.0)
    pcm = np.round(pcm * 32767.0).astype("<i2")
    channels = 1 if pcm.ndim == 1 else pcm.shape[1]
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())


def encode_mp3(wav_path: Path, output_path: Path, sample_rate: int, bitrate: str, volume_db: float = 0.0) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav_path),
        "-map_metadata", "-1", "-filter:a", f"volume={volume_db}dB",
        "-codec:a", "libmp3lame", "-b:a", bitrate,
        "-ar", str(sample_rate), str(output_path),
    ]
    subprocess.run(command, check=True)


def probe_audio(path: Path) -> dict[str, Any]:
    command = [
        "ffprobe", "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=codec_name,sample_rate,channels,duration:format=duration,size",
        "-of", "json", str(path),
    ]
    value = json.loads(subprocess.run(command, check=True, capture_output=True, text=True).stdout)
    stream = value["streams"][0]
    format_value = value["format"]
    levels = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
        check=True,
        capture_output=True,
        text=True,
    ).stderr
    mean_match = re.search(r"mean_volume:\s+(-?[\d.]+) dB", levels)
    peak_match = re.search(r"max_volume:\s+(-?[\d.]+) dB", levels)
    if not mean_match or not peak_match:
        raise RuntimeError(f"Could not measure encoded levels for {path}")
    return {
        "codec": stream["codec_name"],
        "sampleRate": int(stream["sample_rate"]),
        "channels": int(stream["channels"]),
        "duration": round(float(stream.get("duration", format_value["duration"])), 6),
        "bytes": int(format_value["size"]),
        "meanDb": float(mean_match.group(1)),
        "peakDb": float(peak_match.group(1)),
    }


def build_sfx(spec: dict[str, Any], sample_rate: int, temp_root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    groups = expand_sfx_groups(spec)
    groups_by_shard: dict[str, list[tuple[str, int]]] = {shard: [] for shard, _prefixes in SFX_SHARDS}
    for group, variants in groups:
        groups_by_shard[sfx_shard_for_group(group)].append((group, variants))

    runtime_groups: dict[str, dict[str, Any]] = {}
    runtime_shards: dict[str, dict[str, Any]] = {}
    validation_shards: list[dict[str, Any]] = []
    validation_cues: list[dict[str, Any]] = []
    pad = np.zeros(round(PAD_SECONDS * sample_rate), dtype=np.float32)
    fingerprints: set[str] = set()
    generated_files: set[str] = set()

    for shard, _prefixes in SFX_SHARDS:
        shard_groups = groups_by_shard[shard]
        pieces: list[np.ndarray] = [np.zeros(round(0.08 * sample_rate), dtype=np.float32)]
        cursor = len(pieces[0])
        shard_cue_count = 0

        for group, variants in shard_groups:
            entries: list[dict[str, Any]] = []
            for variant in range(variants):
                clip = render_sfx(group, variant, sample_rate)
                pcm = np.round(np.clip(clip, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
                fingerprint = hashlib.sha256(pcm).hexdigest()
                fingerprints.add(fingerprint)
                cue_id = f"{group}/{variant + 1:02d}"
                entry = {
                    "id": cue_id,
                    "start": round(cursor / sample_rate, 6),
                    "duration": round(len(clip) / sample_rate, 6),
                }
                entries.append(entry)
                validation_cues.append({
                    **entry,
                    "group": group,
                    "shard": shard,
                    "pcmSha256": fingerprint,
                })
                pieces.extend((clip, pad))
                cursor += len(clip) + len(pad)
                shard_cue_count += 1
            runtime_groups[group] = {"shard": shard, "cues": entries}

        sprite = np.concatenate(pieces)
        file_name = f"red-ledger-{shard}.mp3"
        generated_files.add(file_name)
        wav_path = temp_root / f"sfx-{shard}.wav"
        mp3_path = SFX_ROOT / file_name
        write_wav(wav_path, sprite, sample_rate)
        encode_mp3(wav_path, mp3_path, sample_rate, SFX_BITRATE, -6.0)
        probe = probe_audio(mp3_path)
        duration = round(len(sprite) / sample_rate, 6)
        digest = sha256(mp3_path)
        runtime_shards[shard] = {
            "url": f"audio/sfx/{file_name}",
            "sha256": digest,
            "duration": duration,
            "encodedDuration": probe["duration"],
            "groupCount": len(shard_groups),
            "cueCount": shard_cue_count,
        }
        validation_shards.append({
            "id": shard,
            "file": mp3_path.relative_to(ROOT).as_posix(),
            "sha256": digest,
            "duration": duration,
            "probe": probe,
            "groupCount": len(shard_groups),
            "cueCount": shard_cue_count,
        })

    for stale_path in SFX_ROOT.glob("*.mp3"):
        if stale_path.name not in generated_files:
            stale_path.unlink()

    runtime = {
        "shardCount": len(runtime_shards),
        "groupCount": len(runtime_groups),
        "cueCount": len(validation_cues),
        "shards": runtime_shards,
        "groups": runtime_groups,
    }
    validation = {
        "shardCount": len(validation_shards),
        "shards": validation_shards,
        "groupCount": len(runtime_groups),
        "cueCount": len(validation_cues),
        "distinctPcmFingerprints": len(fingerprints),
        "cues": validation_cues,
    }
    return runtime, validation


def build_music(spec: dict[str, Any], sample_rate: int, temp_root: Path, force: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    runtime: dict[str, Any] = {}
    validation: list[dict[str, Any]] = []
    for index, track in enumerate(spec["musicTracks"], start=1):
        track_id = str(track["id"])
        file_name = f"{track_id.lower()}.mp3"
        output_path = MUSIC_ROOT / file_name
        if force or not output_path.exists():
            print(f"Rendering music {index:02d}/{len(spec['musicTracks'])}: {track_id} - {track['title']}", flush=True)
            samples = render_music(track, sample_rate)
            wav_path = temp_root / f"{track_id.lower()}.wav"
            write_wav(wav_path, samples, sample_rate)
            encode_mp3(wav_path, output_path, sample_rate, MUSIC_BITRATE)
        probe = probe_audio(output_path)
        motif_hash = hashlib.sha256(json.dumps(track["motif"], separators=(",", ":")).encode("ascii")).hexdigest()
        entry = {
            "url": f"audio/music/{file_name}",
            "title": track["title"],
            "kind": track["kind"],
            "duration": track["duration"],
            "encodedDuration": probe["duration"],
            "bpm": track["bpm"],
            "style": track["style"],
            "motifSha256": motif_hash,
            "sha256": sha256(output_path),
        }
        runtime[track_id] = entry
        validation.append({
            "id": track_id,
            "file": output_path.relative_to(ROOT).as_posix(),
            "sha256": entry["sha256"],
            "motifSha256": motif_hash,
            "kind": track["kind"],
            "declaredDuration": track["duration"],
            "probe": probe,
        })
    return runtime, validation


def validate_spec(spec: dict[str, Any]) -> None:
    tracks = spec.get("musicTracks")
    if not isinstance(tracks, list) or len(tracks) < 30 or len(tracks) > 35:
        raise ValueError("Music scope must contain 30-35 tracks")
    ids = [track["id"] for track in tracks]
    if len(ids) != len(set(ids)):
        raise ValueError("Music track ids must be unique")
    map_ids = {f"E{episode}M{index}" for episode in range(1, 4) for index in range(1, 10)}
    if {track["id"] for track in tracks if track["kind"] == "map"} != map_ids:
        raise ValueError("Music scope must contain exactly one track for every campaign map")
    for track in tracks:
        if track["kind"] == "map" and not 150 <= float(track["duration"]) <= 240:
            raise ValueError(f"{track['id']} is outside the 2.5-4 minute map-track range")
        if len(track["motif"]) < 8:
            raise ValueError(f"{track['id']} needs an eight-step opening motif")
    map_motifs = [json.dumps(track["motif"], separators=(",", ":")) for track in tracks if track["kind"] == "map"]
    if len(map_motifs) != len(set(map_motifs)):
        raise ValueError("Every map needs a distinct opening motif")
    cue_count = sum(variants for _group, variants in expand_sfx_groups(spec))
    if not 250 <= cue_count <= 350:
        raise ValueError(f"SFX scope contains {cue_count} cues, expected 250-350")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Re-render music files even when they already exist")
    args = parser.parse_args()
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise RuntimeError("FFmpeg and ffprobe are required to render the audio library")
    spec_bytes = SPEC_PATH.read_bytes()
    spec = json.loads(spec_bytes)
    validate_spec(spec)
    MUSIC_ROOT.mkdir(parents=True, exist_ok=True)
    SFX_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="red-ledger-audio-") as temp:
        temp_root = Path(temp)
        music, music_validation = build_music(spec, int(spec["musicSampleRate"]), temp_root, args.force)
        print(f"Rendering {len(SFX_SHARDS)} compact semantic SFX sprite shards", flush=True)
        sfx, sfx_validation = build_sfx(spec, int(spec["sfxSampleRate"]), temp_root)

    runtime = {
        "schema": 2,
        "revision": spec["revision"],
        "provenance": "Original offline-rendered synthesis authored for this project; no sampled third-party recordings.",
        "music": music,
        "sfx": sfx,
    }
    RUNTIME_MANIFEST.write_text(json.dumps(runtime, indent=2) + "\n", encoding="ascii")
    validation = {
        "schema": 2,
        "passed": True,
        "revision": spec["revision"],
        "sourceSpec": SPEC_PATH.relative_to(ROOT).as_posix(),
        "sourceSpecSha256": hashlib.sha256(spec_bytes).hexdigest(),
        "generator": Path(__file__).relative_to(ROOT).as_posix(),
        "numpyVersion": np.__version__,
        "generationCommand": "py -3.11 tools/build_audio_library.py --force",
        "musicTrackCount": len(music_validation),
        "mapTrackCount": sum(1 for track in music_validation if track["kind"] == "map"),
        "distinctMapMotifs": len({track["motifSha256"] for track in music_validation if track["kind"] == "map"}),
        "music": music_validation,
        "sfx": sfx_validation,
    }
    VALIDATION_MANIFEST.write_text(json.dumps(validation, indent=2) + "\n", encoding="ascii")
    print(
        f"Built {validation['musicTrackCount']} music tracks and {sfx_validation['cueCount']} unique SFX "
        f"across {sfx_validation['groupCount']} semantic groups in {sfx_validation['shardCount']} sprite shards",
        flush=True,
    )


if __name__ == "__main__":
    main()
