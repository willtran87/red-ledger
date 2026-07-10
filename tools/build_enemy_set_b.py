#!/usr/bin/env python3
"""Build late-game runtime enemy families from approved identity anchors."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

from build_enemy_set_a import (
    ANGLE_CODES,
    checker,
    extract_views,
    gib_frame,
    make_contact,
    place_on_canvas,
    pose_transform,
    quantize_rgba,
    save_frame,
    validate_family,
)


SPECS = {
    "denial-officer": {
        "canvas": (128, 144), "pivot": (64, 137), "max_bounds": (118, 130),
        "views": ANGLE_CODES, "attack": 5, "death": 7, "gib": 6,
        "extras": [("lock-on", 3)], "kind": "denial", "anchor_revision": 1,
    },
    "subrogator": {
        "canvas": (96, 112), "pivot": (48, 106), "max_bounds": (88, 100),
        "views": ANGLE_CODES, "attack": 5, "death": 7, "gib": 6,
        "extras": [("split-flinch", 2)], "kind": "split", "anchor_revision": 1,
    },
    "reserve-eater": {
        "canvas": (128, 144), "pivot": (64, 137), "max_bounds": (118, 130),
        "views": ANGLE_CODES, "attack": 6, "death": 8, "gib": 6,
        "extras": [("hazard-spit", 5)], "kind": "reserve", "anchor_revision": 1,
    },
    "fraud-apparition": {
        "canvas": (96, 112), "pivot": (48, 106), "max_bounds": (88, 100),
        "views": ANGLE_CODES, "attack": 4, "death": 6, "gib": 0,
        "extras": [("reveal", 4), ("fade", 4)], "kind": "fraud", "anchor_revision": 2,
    },
    "cat-model": {
        "canvas": (128, 144), "pivot": (64, 137), "max_bounds": (118, 130),
        "views": ANGLE_CODES, "source_views": 5, "attack": 6, "death": 8, "gib": 6,
        "extras": [("predict", 4), ("impact-call", 2)], "kind": "cat", "anchor_revision": 1,
    },
    "bad-faith-counsel": {
        "canvas": (128, 144), "pivot": (64, 137), "max_bounds": (118, 130),
        "views": ANGLE_CODES, "source_views": 5, "attack": 5, "death": 7, "gib": 0,
        "extras": [("resurrect", 6)], "kind": "counsel", "anchor_revision": 1,
    },
}


def add_event_pixels(frame: Image.Image, spec: dict, state: str, index: int, angle: str) -> None:
    draw = ImageDraw.Draw(frame)
    px, py = spec["pivot"]
    side_shift = {"F": 0, "FL": -7, "L": -12, "BL": -8, "B": 0, "BR": 8, "R": 12, "FR": 7}[angle]
    kind = spec["kind"]
    if kind == "denial":
        if state == "lock-on":
            radius = 2 + index
            center = (px + side_shift, py - round(spec["max_bounds"][1] * 0.75))
            draw.rectangle((center[0] - radius, center[1] - 1, center[0] + radius, center[1] + 1), fill="#E2B93B")
            if index == 2:
                draw.point(center, fill="#FFFDF7")
        elif state == "attack":
            direction = -1 if angle in {"F", "FL", "L", "BL"} else 1
            center = (px + direction * 24 + side_shift // 3, py - 48)
            radius = min(4, index + 1)
            draw.rectangle((center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius), fill="#E2B93B")
            if index in {2, 3}:
                draw.line((center[0], center[1], center[0] + direction * 8, center[1]), fill="#FFFDF7", width=2)
    elif kind == "split" and state in {"attack", "split-flinch"}:
        center = (px + side_shift // 4, py - 62)
        height = 4 + index * 3
        draw.rectangle((center[0] - 2, center[1] - height, center[0] + 2, center[1] + height), fill="#D9232E")
        if state == "attack" and index >= 2:
            draw.rectangle((center[0] - 1, center[1] - 1, center[0] + 1, center[1] + 1), fill="#FFFDF7")
    elif kind == "reserve" and state in {"attack", "hazard-spit"}:
        center = (px + side_shift, py - 52)
        radius = 1 + min(5, index)
        draw.rectangle((center[0] - radius, center[1] - radius // 2, center[0] + radius, center[1] + radius // 2 + 1), fill="#477066")
        if index >= 2:
            draw.rectangle((center[0] - 1, center[1] - 1, center[0] + 1, center[1] + 1), fill="#FFE17A")
    elif kind == "fraud" and state == "attack":
        center = (px + side_shift, py - 52)
        reach = 4 + index * 3
        draw.line((center[0] - reach, center[1], center[0] + reach, center[1]), fill="#47BCD1", width=2)
        draw.point(center, fill="#D1FBFA")
    elif kind == "cat" and state in {"attack", "predict", "impact-call"}:
        center = (px + side_shift, py - 106)
        radius = 2 + min(6, index * 2)
        color = "#D9232E" if state != "impact-call" else "#FFE17A"
        draw.rectangle((center[0] - radius, center[1] - 1, center[0] + radius, center[1] + 1), fill=color)
        draw.line((center[0], center[1] - radius, center[0], center[1] + radius), fill="#47BCD1", width=1)
        if index >= 2:
            draw.point(center, fill="#D1FBFA")
    elif kind == "counsel" and state in {"attack", "resurrect"}:
        center = (px + side_shift, py - 70)
        reach = 5 + index * 3
        draw.rectangle((center[0] - reach, center[1] - 1, center[0] + reach, center[1] + 1), fill="#A31822")
        if index % 2:
            draw.rectangle((center[0] - 1, center[1] - reach // 2, center[0] + 1, center[1] + reach // 2), fill="#F4F1EA")


def dither_visibility(frame: Image.Image, visible: float, phase: int = 0) -> Image.Image:
    output = frame.copy()
    alpha = output.getchannel("A")
    pixels = alpha.load()
    bayer = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))
    threshold = round(max(0.0, min(1.0, visible)) * 16)
    for y in range(output.height):
        for x in range(output.width):
            if pixels[x, y] and bayer[(y + phase) % 4][(x + phase) % 4] >= threshold:
                pixels[x, y] = 0
    output.putalpha(alpha)
    return output


def make_state(base: Image.Image, spec: dict, state: str, index: int, count: int, angle: str) -> Image.Image:
    if state == "idle":
        frame = pose_transform(base, spec, sy=1.0 - 0.01 * index, dy=index)
    elif state == "walk":
        dx, dy, turn = [(-2, 0, -1), (0, -2, 1), (2, 0, 1), (0, -1, -1)][index]
        frame = pose_transform(base, spec, sx=0.99, dx=dx, dy=dy, angle=turn)
    elif state == "attack":
        wave = math.sin(index / max(1, count - 1) * math.pi)
        frame = pose_transform(base, spec, sx=1.0 + 0.07 * wave, sy=1.0 - 0.03 * wave, dy=-round(2 * wave))
        add_event_pixels(frame, spec, state, index, angle)
    elif state == "pain":
        frame = pose_transform(base, spec, sx=1.05, sy=0.95, dx=-3, angle=-5)
        tint = Image.new("RGBA", frame.size, "#A31822")
        tint.putalpha(frame.getchannel("A").point(lambda alpha: 72 if alpha else 0))
        frame = Image.alpha_composite(frame, tint)
    elif state == "lock-on":
        frame = pose_transform(base, spec, sx=1.0 + index * 0.01, dy=-index)
        add_event_pixels(frame, spec, state, index, angle)
    elif state == "split-flinch":
        frame = pose_transform(base, spec, sx=1.0 + index * 0.06, sy=1.0 - index * 0.03, dx=(-2 if index else 2), angle=(-3 if index else 3))
        add_event_pixels(frame, spec, state, index, angle)
    elif state == "hazard-spit":
        wave = math.sin(index / max(1, count - 1) * math.pi)
        frame = pose_transform(base, spec, sx=1.0 + 0.09 * wave, sy=1.0 - 0.05 * wave, dy=-round(wave * 2))
        add_event_pixels(frame, spec, state, index, angle)
    elif state == "reveal":
        frame = dither_visibility(base, (index + 1) / count, phase=index)
    elif state == "fade":
        frame = dither_visibility(base, (count - index - 1) / count, phase=index)
    elif state == "predict":
        wave = math.sin(index / max(1, count - 1) * math.pi)
        frame = pose_transform(base, spec, sx=1.0 + 0.04 * wave, sy=1.0 - 0.02 * wave, dy=-round(wave * 2))
        add_event_pixels(frame, spec, state, index, angle)
    elif state == "impact-call":
        frame = pose_transform(base, spec, sx=1.03 + index * 0.02, sy=0.98, dy=-index)
        add_event_pixels(frame, spec, state, index, angle)
    elif state == "resurrect":
        wave = math.sin(index / max(1, count - 1) * math.pi)
        frame = pose_transform(base, spec, sx=1.0 + 0.08 * wave, sy=1.0 - 0.04 * wave, dy=-round(4 * wave), angle=round((index - count / 2) * 2))
        add_event_pixels(frame, spec, state, index, angle)
    else:
        raise ValueError(state)
    return quantize_rgba(frame)


def collapse_frame(base: Image.Image, spec: dict, index: int, count: int) -> Image.Image:
    progress = index / max(1, count - 1)
    if spec["kind"] in {"fraud", "counsel"}:
        flattened = pose_transform(base, spec, sx=1.0 + 0.2 * progress, sy=1.0 - 0.55 * progress, dy=round(progress * 2), angle=-round(progress * 18))
        return quantize_rgba(dither_visibility(flattened, 1.0 - 0.82 * progress, phase=index))
    angle = -round(78 * progress)
    sy = 1.0 - 0.74 * progress
    sx = 1.0 + 0.38 * progress
    return quantize_rgba(pose_transform(base, spec, sx=sx, sy=sy, dx=-round(index * 0.8), angle=angle))


def build(root: Path, subject: str) -> dict:
    spec = SPECS[subject]
    revision = spec["anchor_revision"]
    anchor_name = f"enemy_{subject}_anchor-v{revision:02d}.png"
    alpha_path = root / "art/source/alpha/normalized" / anchor_name
    anchor = Image.open(alpha_path).convert("RGBA")
    source_views = spec.get("source_views", len(spec["views"]))
    extracted = extract_views(anchor, source_views)
    if source_views == 5:
        extracted = [
            extracted[0], extracted[1], extracted[2], extracted[3], extracted[4],
            extracted[3].transpose(Image.Transpose.FLIP_LEFT_RIGHT),
            extracted[2].transpose(Image.Transpose.FLIP_LEFT_RIGHT),
            extracted[1].transpose(Image.Transpose.FLIP_LEFT_RIGHT),
        ]
    bases = {angle: place_on_canvas(crop, spec) for angle, crop in zip(spec["views"], extracted)}
    runtime = root / "assets/public_runtime/enemies" / subject
    working = root / "art/working/enemy" / subject
    approval = root / "art/approval"
    references = root / "art/references"
    for directory in (runtime, working, approval, references):
        directory.mkdir(parents=True, exist_ok=True)
    Image.open(alpha_path).save(references / anchor_name, optimize=True)

    records = []
    samples = []
    states = [("idle", 2), ("walk", 4), ("attack", spec["attack"]), ("pain", 1), *spec["extras"]]
    for state, count in states:
        for angle, base in bases.items():
            for index in range(count):
                frame = make_state(base, spec, state, index, count, angle)
                name = save_frame(frame, runtime, subject, state, angle, index + 1, spec["pivot"][1])
                records.append({"file": name, "state": state, "angle": angle, "frame": index + 1})
                if angle == "F":
                    samples.append((f"{state}.{index+1}", frame))

    front = bases["F"]
    deaths = []
    for index in range(spec["death"]):
        frame = collapse_frame(front, spec, index, spec["death"])
        deaths.append(frame)
        name = save_frame(frame, runtime, subject, "death", "F", index + 1, spec["pivot"][1])
        records.append({"file": name, "state": "death", "angle": "F", "frame": index + 1})
        samples.append((f"death.{index+1}", frame))
    for index in range(spec["gib"]):
        frame = gib_frame(front, spec, index)
        name = save_frame(frame, runtime, subject, "gib", "F", index + 1, spec["pivot"][1])
        records.append({"file": name, "state": "gib", "angle": "F", "frame": index + 1})
        samples.append((f"gib.{index+1}", frame))
    corpse = deaths[-1]
    name = save_frame(corpse, runtime, subject, "corpse", "F", 1, spec["pivot"][1])
    records.append({"file": name, "state": "corpse", "angle": "F", "frame": 1})
    samples.append(("corpse.1", corpse))

    metadata = {
        "asset_id": f"enemy.{subject}", "revision": 1, "canvas": list(spec["canvas"]),
        "pivot": list(spec["pivot"]), "authored_angles": spec["views"], "runtime_mirrors": {},
        "palette": "red-ledger-master-40", "source_anchor": f"art/references/{anchor_name}",
        "death_mode": "dissolve" if spec["kind"] in {"fraud", "counsel"} else "collapse",
        "frames": records,
    }
    (runtime / "actor-art.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="ascii")
    contact = make_contact(subject, spec, bases, samples, approval)
    expected = sum(count * len(spec["views"]) for _, count in states) + spec["death"] + spec["gib"] + 1
    validation = validate_family(runtime, spec, expected)
    validation.update({"asset_id": f"enemy.{subject}", "contact_sheet": str(contact.relative_to(root)).replace("\\", "/")})
    (working / "validation.json").write_text(json.dumps(validation, indent=2) + "\n", encoding="ascii")
    if not validation["passed"]:
        raise RuntimeError(f"validation failed for {subject}: {validation}")
    return validation


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--subject", choices=[*SPECS, "all"], default="all")
    args = parser.parse_args()
    subjects = list(SPECS) if args.subject == "all" else [args.subject]
    print(json.dumps([build(args.root, subject) for subject in subjects], indent=2))


if __name__ == "__main__":
    main()
