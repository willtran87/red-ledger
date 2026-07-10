"""Build full Aggregate and Chief Actuary boss sprite families."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

from build_enemy_set_a import (
    ANGLE_CODES,
    extract_views,
    make_contact,
    place_on_canvas,
    pose_transform,
    quantize_rgba,
    validate_family,
)


SPECS = {
    "aggregate": {
        "canvas": (192, 176), "pivot": (96, 168), "max_bounds": (182, 160),
        "states": [("idle", 3), ("walk", 4), ("left-emit", 5), ("right-emit", 5), ("dual", 7), ("pain", 2)],
        "collapse": 12, "kind": "aggregate",
    },
    "chief-actuary": {
        "canvas": (192, 176), "pivot": (96, 168), "max_bounds": (182, 160),
        "states": [("idle", 2), ("run", 6), ("predict", 6), ("salvo", 6), ("pain", 2)],
        "collapse": 12, "kind": "actuary",
    },
}


def eight_views(anchor: Image.Image, spec: dict) -> dict[str, Image.Image]:
    source = extract_views(anchor, 5)
    ordered = [
        source[0], source[1], source[2], source[3], source[4],
        source[3].transpose(Image.Transpose.FLIP_LEFT_RIGHT),
        source[2].transpose(Image.Transpose.FLIP_LEFT_RIGHT),
        source[1].transpose(Image.Transpose.FLIP_LEFT_RIGHT),
    ]
    return {angle: place_on_canvas(crop, spec) for angle, crop in zip(ANGLE_CODES, ordered)}


def event(frame: Image.Image, spec: dict, state: str, index: int, angle: str) -> None:
    draw = ImageDraw.Draw(frame)
    px, py = spec["pivot"]
    side = {"F": 0, "FL": -8, "L": -14, "BL": -8, "B": 0, "BR": 8, "R": 14, "FR": 8}[angle]
    if spec["kind"] == "aggregate":
        if state in {"left-emit", "dual"}:
            center = (px - 45 + side // 2, py - 80)
            radius = 2 + min(index, 4)
            draw.rectangle((center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius), fill="#477066")
            draw.point(center, fill="#FFE17A")
        if state in {"right-emit", "dual"}:
            center = (px + 45 + side // 2, py - 78)
            reach = 3 + min(index * 2, 10)
            draw.line((center[0] - reach, center[1], center[0] + reach, center[1]), fill="#47BCD1", width=2)
            draw.point(center, fill="#D1FBFA")
    else:
        center = (px + side, py - 88)
        if state == "predict":
            radius = 2 + min(index, 5)
            draw.rectangle((center[0] - radius, center[1] - 1, center[0] + radius, center[1] + 1), fill="#D9232E")
            draw.line((center[0], center[1] - radius, center[0], center[1] + radius), fill="#47BCD1")
        elif state == "salvo":
            radius = 2 + min(index, 4)
            for dx in (-8, 0, 8):
                draw.rectangle((center[0] + dx - radius, center[1] - radius, center[0] + dx + radius, center[1] + radius), fill="#E2B93B")
            draw.point(center, fill="#FFFDF7")


def make_state(base: Image.Image, spec: dict, state: str, index: int, count: int, angle: str) -> Image.Image:
    progress = index / max(1, count - 1)
    wave = math.sin(progress * math.pi)
    if state == "idle":
        frame = pose_transform(base, spec, sx=1.0 + 0.01 * wave, sy=1.0 - 0.01 * wave, dy=round(wave))
    elif state in {"walk", "run"}:
        cycle = [(-3, 0, -2), (-1, -2, 1), (3, 0, 2), (1, -1, -1), (-2, 0, -2), (2, -1, 2)]
        dx, dy, angle_shift = cycle[index % len(cycle)]
        frame = pose_transform(base, spec, sx=0.99, sy=1.0, dx=dx, dy=dy, angle=angle_shift)
    elif state == "pain":
        frame = pose_transform(base, spec, sx=1.04, sy=0.95, dx=(-3 if index == 0 else 3), angle=(-5 if index == 0 else 5))
        tint = Image.new("RGBA", frame.size, "#A31822")
        tint.putalpha(frame.getchannel("A").point(lambda alpha: 72 if alpha else 0))
        frame = Image.alpha_composite(frame, tint)
    else:
        frame = pose_transform(base, spec, sx=1.0 + 0.06 * wave, sy=1.0 - 0.03 * wave, dy=-round(3 * wave))
        event(frame, spec, state, index, angle)
    return quantize_rgba(frame)


def collapse(base: Image.Image, spec: dict, index: int, count: int) -> Image.Image:
    progress = index / max(1, count - 1)
    frame = pose_transform(
        base, spec,
        sx=1.0 + 0.42 * progress,
        sy=1.0 - 0.78 * progress,
        dx=-round(progress * 8),
        dy=round(progress * 3),
        angle=-round(progress * 82),
    )
    if index >= count // 2:
        alpha = frame.getchannel("A")
        pixels = alpha.load()
        for y in range(frame.height):
            for x in range(frame.width):
                if pixels[x, y] and (x + y + index) % 7 < index - count // 2:
                    pixels[x, y] = 0
        frame.putalpha(alpha)
    return quantize_rgba(frame)


def save_boss_frame(frame: Image.Image, output: Path, subject: str, state: str, angle: str, number: int, pivot_y: int) -> str:
    name = f"boss_{subject}_{state}_{angle}_{number:02d}_v01.png"
    alpha = frame.getchannel("A")
    draw = ImageDraw.Draw(alpha)
    draw.rectangle((0, 0, frame.width - 1, frame.height - 1), outline=0, width=1)
    if pivot_y + 1 < frame.height:
        draw.rectangle((0, pivot_y + 1, frame.width - 1, frame.height - 1), fill=0)
    frame.putalpha(alpha)
    frame.save(output / name, optimize=True)
    return name


def build(root: Path, subject: str) -> dict:
    spec = SPECS[subject]
    anchor_name = f"boss_{subject}_anchor-v01.png"
    anchor_path = root / "art/source/alpha/normalized" / anchor_name
    bases = eight_views(Image.open(anchor_path).convert("RGBA"), spec)
    runtime = root / "assets/public_runtime/bosses" / subject
    runtime.mkdir(parents=True, exist_ok=True)
    records = []
    samples = []
    for state, count in spec["states"]:
        for angle, base in bases.items():
            for index in range(count):
                frame = make_state(base, spec, state, index, count, angle)
                filename = save_boss_frame(frame, runtime, subject, state, angle, index + 1, spec["pivot"][1])
                records.append({"file": filename, "state": state, "angle": angle, "frame": index + 1})
                if angle == "F":
                    samples.append((f"{state}.{index + 1}", frame))
    collapsed = []
    for index in range(spec["collapse"]):
        frame = collapse(bases["F"], spec, index, spec["collapse"])
        collapsed.append(frame)
        filename = save_boss_frame(frame, runtime, subject, "collapse", "F", index + 1, spec["pivot"][1])
        records.append({"file": filename, "state": "collapse", "angle": "F", "frame": index + 1})
        samples.append((f"collapse.{index + 1}", frame))
    corpse = collapsed[-1]
    filename = save_boss_frame(corpse, runtime, subject, "corpse", "F", 1, spec["pivot"][1])
    records.append({"file": filename, "state": "corpse", "angle": "F", "frame": 1})
    metadata = {
        "asset_id": f"boss.{subject}", "canvas": list(spec["canvas"]), "pivot": list(spec["pivot"]),
        "authored_angles": ANGLE_CODES, "palette": "red-ledger-master-40", "frames": records,
    }
    (runtime / "actor-art.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="ascii")
    approval = root / "art/approval"
    contact = make_contact(subject, spec, bases, samples, approval)
    contact.replace(approval / f"boss_{subject}_contact-v01.png")
    expected = sum(count * 8 for _, count in spec["states"]) + spec["collapse"] + 1
    result = validate_family(runtime, spec, expected)
    result["asset_id"] = f"boss.{subject}"
    if not result["passed"]:
        raise RuntimeError(result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--subject", choices=[*SPECS, "all"], default="all")
    args = parser.parse_args()
    subjects = list(SPECS) if args.subject == "all" else [args.subject]
    print(json.dumps([build(args.root, subject) for subject in subjects], indent=2))


if __name__ == "__main__":
    main()
