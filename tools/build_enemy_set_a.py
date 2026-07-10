#!/usr/bin/env python3
"""Build runtime enemy families from approved chroma-key identity anchors."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


PALETTE = [
    "08090A", "111214", "1D2023", "2A2D31", "34383D", "4B5055", "646A70",
    "7D8388", "9A9D9D", "B7B8B4", "D4D2CB", "E6E2D9", "F4F1EA", "FFFDF7",
    "33070B", "520A10", "7A1018", "A31822", "D9232E", "F14B51", "FF8484",
    "3A2812", "674A24", "927044", "B9955E", "8A6819", "B68B24", "E2B93B",
    "FFE17A", "18342F", "285046", "477066", "6D9688", "A5C4B6", "11343E",
    "176175", "238CA5", "47BCD1", "87E3EC", "D1FBFA",
]
RGB_PALETTE = [tuple(bytes.fromhex(value)) for value in PALETTE]
ANGLE_CODES = ["F", "FL", "L", "BL", "B", "BR", "R", "FR"]

SPECS = {
    "returned-mail": {
        "canvas": (64, 72), "pivot": (32, 68), "max_bounds": (58, 66),
        "views": ["F", "FL", "L", "BL", "B"], "attack": 3,
        "extra": ("emerge", 3), "kind": "paper",
    },
    "desk-warden": {
        "canvas": (96, 112), "pivot": (48, 106), "max_bounds": (88, 100),
        "views": ANGLE_CODES, "attack": 4, "extra": ("aim", 2), "kind": "steel",
    },
    "ember-clerk": {
        "canvas": (96, 112), "pivot": (48, 106), "max_bounds": (88, 100),
        "views": ["F", "FL", "L", "BL", "B"], "attack": 4,
        "extra": ("charge", 2), "kind": "ember",
    },
}


def quantize_rgba(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    alpha = image.getchannel("A").point(lambda value: 255 if value >= 96 else 0)
    pal = Image.new("P", (1, 1))
    flat = [channel for color in RGB_PALETTE for channel in color]
    filler = list(RGB_PALETTE[0]) * ((768 - len(flat)) // 3)
    pal.putpalette(flat + filler)
    rgb = image.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
    rgb.putalpha(alpha)
    return rgb


def extract_views(sheet: Image.Image, count: int) -> list[Image.Image]:
    width, height = sheet.size
    result = []
    for index in range(count):
        left = round(index * width / count)
        right = round((index + 1) * width / count)
        cell = sheet.crop((left, 0, right, height)).convert("RGBA")
        bbox = cell.getchannel("A").point(lambda a: 255 if a > 32 else 0).getbbox()
        if not bbox:
            raise ValueError(f"empty anchor cell {index}")
        result.append(cell.crop(bbox))
    return result


def place_on_canvas(subject: Image.Image, spec: dict) -> Image.Image:
    canvas_size = spec["canvas"]
    pivot = spec["pivot"]
    max_w, max_h = spec["max_bounds"]
    scale = min(max_w / subject.width, max_h / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    reduced = subject.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", canvas_size)
    x = pivot[0] - size[0] // 2
    y = pivot[1] - size[1]
    canvas.alpha_composite(reduced, (x, y))
    return quantize_rgba(canvas)


def pose_transform(base: Image.Image, spec: dict, *, sx=1.0, sy=1.0, dx=0, dy=0, angle=0) -> Image.Image:
    alpha = base.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return base.copy()
    subject = base.crop(bbox)
    new_size = (max(1, round(subject.width * sx)), max(1, round(subject.height * sy)))
    subject = subject.resize(new_size, Image.Resampling.NEAREST)
    if angle:
        subject = subject.rotate(angle, resample=Image.Resampling.NEAREST, expand=True)
    output = Image.new("RGBA", base.size)
    pivot_x, pivot_y = spec["pivot"]
    x = pivot_x - subject.width // 2 + dx
    y = pivot_y - subject.height + dy
    output.alpha_composite(subject, (x, y))
    return output


def glow_overlay(frame: Image.Image, spec: dict, state: str, index: int, angle: str) -> None:
    draw = ImageDraw.Draw(frame)
    px, py = spec["pivot"]
    facing_shift = {"F": 0, "FL": -5, "L": -9, "BL": -6, "B": 0, "BR": 6, "R": 9, "FR": 5}[angle]
    if spec["kind"] == "paper" and state == "attack":
        radius = index + 1
        center = (px + facing_shift, py - 34)
        draw.rectangle((center[0]-radius, center[1]-radius, center[0]+radius, center[1]+radius), fill="#D9232E")
        if index == 2:
            draw.point(center, fill="#FFFDF7")
    elif spec["kind"] == "steel" and state in {"attack", "aim"}:
        side = -1 if angle in {"F", "FL", "L", "BL"} else 1
        center = (px + side * (15 + abs(facing_shift) // 2), py - 40)
        radius = 1 + (index % 2)
        draw.rectangle((center[0]-radius, center[1]-radius, center[0]+radius, center[1]+radius), fill="#D9232E")
        if state == "attack" and index == 2:
            draw.line((center[0], center[1], center[0] + side * 5, center[1]), fill="#FFFDF7", width=2)
    elif spec["kind"] == "ember" and state in {"attack", "charge"}:
        radius = (index + 1) if state == "attack" else (2 + index * 2)
        for side in (-1, 1):
            center = (px + facing_shift + side * 18, py - 40)
            draw.rectangle((center[0]-radius, center[1]-radius, center[0]+radius, center[1]+radius), fill="#E2B93B")
            if radius >= 3:
                draw.rectangle((center[0]-1, center[1]-1, center[0]+1, center[1]+1), fill="#FFFDF7")


def make_state(base: Image.Image, spec: dict, state: str, index: int, count: int, angle: str) -> Image.Image:
    if state == "idle":
        frame = pose_transform(base, spec, sy=1.0 - 0.012 * index, dy=index)
    elif state == "walk":
        cycle = [(-2, 0, -1), (0, -2, 1), (2, 0, 1), (0, -1, -1)][index]
        frame = pose_transform(base, spec, sx=0.99, sy=1.0, dx=cycle[0], dy=cycle[1], angle=cycle[2])
    elif state == "attack":
        progress = index / max(1, count - 1)
        lean = [0.0, 0.04, 0.08, 0.02][min(index, 3)]
        frame = pose_transform(base, spec, sx=1.0 + lean, sy=1.0 - lean / 2, dy=-round(2 * math.sin(progress * math.pi)))
        glow_overlay(frame, spec, state, index, angle)
    elif state == "pain":
        frame = pose_transform(base, spec, sx=1.04, sy=0.96, dx=-2, angle=-4)
        red = Image.new("RGBA", frame.size, "#A3182260")
        red.putalpha(frame.getchannel("A").point(lambda a: 80 if a else 0))
        frame = Image.alpha_composite(frame, red)
    elif state in {"aim", "charge"}:
        frame = pose_transform(base, spec, sx=1.0 + 0.02 * index, sy=1.0 - 0.01 * index, dy=-index)
        glow_overlay(frame, spec, state, index, angle)
    elif state == "emerge":
        visible = [0.34, 0.67, 1.0][index]
        frame = base.copy()
        cutoff = spec["pivot"][1] - round(spec["max_bounds"][1] * visible)
        mask = frame.getchannel("A")
        ImageDraw.Draw(mask).rectangle((0, 0, frame.width, max(0, cutoff)), fill=0)
        frame.putalpha(mask)
    else:
        raise ValueError(state)
    return quantize_rgba(frame)


def collapse_frame(base: Image.Image, spec: dict, index: int) -> Image.Image:
    angles = [0, -8, -22, -40, -62, -78]
    sy = [1.0, 0.94, 0.82, 0.66, 0.43, 0.26][index]
    sx = [1.0, 1.02, 1.06, 1.12, 1.24, 1.38][index]
    return quantize_rgba(pose_transform(base, spec, sx=sx, sy=sy, dx=-index, angle=angles[index]))


def gib_frame(base: Image.Image, spec: dict, index: int) -> Image.Image:
    bbox = base.getchannel("A").getbbox()
    if not bbox:
        return base.copy()
    subject = base.crop(bbox)
    cols, rows = 3, 3
    output = Image.new("RGBA", base.size)
    px, py = spec["pivot"]
    for row in range(rows):
        for col in range(cols):
            x0 = round(col * subject.width / cols)
            x1 = round((col + 1) * subject.width / cols)
            y0 = round(row * subject.height / rows)
            y1 = round((row + 1) * subject.height / rows)
            chunk = subject.crop((x0, y0, x1, y1))
            direction = col - 1
            fall = round(1.5 * index * index - (3 - row) * index * 2.2)
            x = px - subject.width // 2 + x0 + direction * index * 3
            y = py - subject.height + y0 + fall
            output.alpha_composite(chunk, (x, y))
    return quantize_rgba(output)


def save_frame(frame: Image.Image, output: Path, subject: str, state: str, angle: str, number: int, pivot_y: int | None = None) -> str:
    name = f"enemy_{subject}_{state}_{angle}_{number:02d}_v01.png"
    alpha = frame.getchannel("A")
    draw = ImageDraw.Draw(alpha)
    draw.rectangle((0, 0, frame.width - 1, frame.height - 1), outline=0, width=1)
    if pivot_y is not None and pivot_y + 1 < frame.height:
        draw.rectangle((0, pivot_y + 1, frame.width - 1, frame.height - 1), fill=0)
    frame.putalpha(alpha)
    frame.save(output / name, optimize=True)
    return name


def checker(size: tuple[int, int], cell: int = 8) -> Image.Image:
    bg = Image.new("RGB", size, "#34383D")
    draw = ImageDraw.Draw(bg)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill="#646A70")
    return bg.convert("RGBA")


def make_contact(subject: str, spec: dict, bases: dict[str, Image.Image], samples: list[tuple[str, Image.Image]], approval: Path) -> Path:
    scale = 3
    cell_w, cell_h = spec["canvas"][0] * scale, spec["canvas"][1] * scale
    columns = max(len(bases), 6)
    rows = 1 + math.ceil(len(samples) / columns)
    header = 34
    sheet = checker((columns * cell_w, header + rows * cell_h), 12)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.rectangle((0, 0, sheet.width, header), fill="#111214")
    draw.text((8, 6), f"{subject.upper()} / V01 / RUNTIME CONTACT", font=font, fill="#F4F1EA")
    draw.text((8, 19), f"canvas {spec['canvas'][0]}x{spec['canvas'][1]}  pivot {spec['pivot']}  palette 40+alpha", font=font, fill="#B7B8B4")
    for index, (angle, frame) in enumerate(bases.items()):
        x = index * cell_w
        preview = frame.resize((cell_w, cell_h), Image.Resampling.NEAREST)
        sheet.alpha_composite(preview, (x, header))
        draw.text((x + 4, header + 4), angle, font=font, fill="#FFFDF7")
    for index, (label, frame) in enumerate(samples):
        row = 1 + index // columns
        col = index % columns
        x, y = col * cell_w, header + row * cell_h
        backgrounds = ["#E6E2D9", "#18342F", "#34383D", "#33070B"]
        bg_color = backgrounds[(row - 1) % len(backgrounds)]
        draw.rectangle((x, y, x + cell_w - 1, y + cell_h - 1), fill=bg_color)
        sheet.alpha_composite(frame.resize((cell_w, cell_h), Image.Resampling.NEAREST), (x, y))
        draw.rectangle((x, y, x + cell_w - 1, y + 14), fill="#111214")
        draw.text((x + 3, y + 3), label, font=font, fill="#FFFDF7")
    path = approval / f"enemy_{subject}_contact-v01.png"
    sheet.convert("RGB").save(path, optimize=True)
    return path


def validate_family(output: Path, spec: dict, expected: int) -> dict:
    files = sorted(output.glob("*.png"))
    bad_size, bad_mode, bad_corner, bad_baseline, key_like, nonpalette = [], [], [], [], 0, 0
    allowed = set(RGB_PALETTE)
    for path in files:
        image = Image.open(path).convert("RGBA")
        if image.size != spec["canvas"]:
            bad_size.append(path.name)
        if Image.open(path).mode != "RGBA":
            bad_mode.append(path.name)
        if any(image.getpixel(point)[3] != 0 for point in [(0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)]):
            bad_corner.append(path.name)
        bbox = image.getchannel("A").getbbox()
        if bbox and bbox[3] - 1 > spec["pivot"][1]:
            bad_baseline.append(path.name)
        pixels = image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()
        for r, g, b, a in pixels:
            if not a:
                continue
            if g > 220 and g > r * 1.8 and g > b * 1.8:
                key_like += 1
            if (r, g, b) not in allowed:
                nonpalette += 1
    return {
        "expected_files": expected, "actual_files": len(files), "dimensions_ok": not bad_size,
        "rgba_ok": not bad_mode, "transparent_corners_ok": not bad_corner, "baseline_ok": not bad_baseline,
        "key_like_opaque_pixels": key_like, "nonpalette_opaque_pixels": nonpalette,
        "passed": len(files) == expected and not bad_size and not bad_mode and not bad_corner and not bad_baseline and key_like == 0 and nonpalette == 0,
    }


def build(root: Path, subject: str) -> dict:
    spec = SPECS[subject]
    alpha_path = root / "art/source/alpha/normalized" / f"enemy_{subject}_anchor-v01.png"
    anchor = Image.open(alpha_path).convert("RGBA")
    extracted = extract_views(anchor, len(spec["views"]))
    bases = {angle: place_on_canvas(crop, spec) for angle, crop in zip(spec["views"], extracted)}
    runtime = root / "assets/public_runtime/enemies" / subject
    working = root / "art/working/enemy" / subject
    approval = root / "art/approval"
    references = root / "art/references"
    for directory in (runtime, working, approval, references):
        directory.mkdir(parents=True, exist_ok=True)
    Image.open(alpha_path).save(references / f"enemy_{subject}_anchor-v01.png", optimize=True)

    records = []
    samples = []
    states = [("idle", 2), ("walk", 4), ("attack", spec["attack"]), ("pain", 1), spec["extra"]]
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
    for index in range(6):
        frame = collapse_frame(front, spec, index)
        deaths.append(frame)
        name = save_frame(frame, runtime, subject, "death", "F", index + 1, spec["pivot"][1])
        records.append({"file": name, "state": "death", "angle": "F", "frame": index + 1})
        samples.append((f"death.{index+1}", frame))
    for index in range(6):
        frame = gib_frame(front, spec, index)
        name = save_frame(frame, runtime, subject, "gib", "F", index + 1, spec["pivot"][1])
        records.append({"file": name, "state": "gib", "angle": "F", "frame": index + 1})
        samples.append((f"gib.{index+1}", frame))
    corpse = deaths[-1]
    name = save_frame(corpse, runtime, subject, "corpse", "F", 1, spec["pivot"][1])
    records.append({"file": name, "state": "corpse", "angle": "F", "frame": 1})
    samples.append(("corpse.1", corpse))

    mirror_map = {}
    if len(spec["views"]) == 5:
        mirror_map = {"BR": "BL", "R": "L", "FR": "FL"}
    metadata = {
        "asset_id": f"enemy.{subject}", "revision": 1, "canvas": list(spec["canvas"]),
        "pivot": list(spec["pivot"]), "authored_angles": spec["views"], "runtime_mirrors": mirror_map,
        "palette": "red-ledger-master-40", "source_anchor": f"art/references/enemy_{subject}_anchor-v01.png",
        "frames": records,
    }
    (runtime / "actor-art.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="ascii")
    contact = make_contact(subject, spec, bases, samples, approval)
    expected = sum(count * len(spec["views"]) for _, count in states) + 13
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
    report = [build(args.root, subject) for subject in subjects]
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
