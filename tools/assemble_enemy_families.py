#!/usr/bin/env python3
"""Build complete vertical-slice actor inventories from approved alpha source strips."""

from __future__ import annotations

import json
import math
from pathlib import Path
from PIL import Image, ImageDraw

from finalize_enemy_strip import RGB, nearest_palette


ROOT = Path(__file__).resolve().parents[1]
ANGLES = ["F", "FL", "L", "BL", "B", "BR", "R", "FR"]

FAMILIES = {
    "exposure-hound": {
        "kind": "enemy", "canvas": (64, 72), "pivot": (32, 68), "bounds": (58, 66),
        "active": {"walk": "enemy_exposure-hound_walk-master-v01.png", "attack": "enemy_exposure-hound_attack-master-v01.png"},
        "sequences": {"death": ("enemy_exposure-hound_death-v01.png", 6, 6), "gib": ("enemy_exposure-hound_gib-v01.png", 6, 6)},
        "states": {"idle": 2, "walk": 4, "attack": 4, "pain": 1, "lunge": 3},
    },
    "coverage-drone": {
        "kind": "enemy", "canvas": (96, 112), "pivot": (48, 106), "bounds": (88, 100),
        "active": {"walk": "enemy_coverage-drone_walk-master-v01.png", "attack": "enemy_coverage-drone_attack-master-v01.png"},
        "sequences": {"death": ("enemy_coverage-drone_death-v01.png", 6, 6)},
        "states": {"idle": 2, "walk": 4, "attack": 4, "pain": 1, "hover": 4},
    },
    "liability-mass": {
        "kind": "enemy", "canvas": (128, 144), "pivot": (64, 137), "bounds": (118, 130),
        "active": {"attack": "enemy_liability-mass_attack-master-v01.png"},
        "sequences": {"death": ("enemy_liability-mass_death-v01.png", 6, 7), "gib": ("enemy_liability-mass_gib-v01.png", 6, 6)},
        "states": {"idle": 2, "walk": 4, "attack": 5, "pain": 1, "charge": 2},
    },
    "regional-director": {
        "kind": "boss", "canvas": (192, 176), "pivot": (96, 168), "bounds": (182, 160),
        "active": {"walk": "boss_regional-director_walk-master-v01.png", "canister": "boss_regional-director_canister-master-v01.png"},
        "sequences": {"collapse": ("boss_regional-director_collapse-v01.png", 6, 10)},
        "states": {"idle": 2, "walk": 4, "canister": 6, "summon": 6, "pain": 2},
    },
}


def crop_cells(path: Path, count: int) -> list[Image.Image]:
    image = Image.open(path).convert("RGBA")
    cells = []
    for i in range(count):
        left = round(i * image.width / count)
        right = round((i + 1) * image.width / count)
        cell = image.crop((left, 0, right, image.height))
        box = cell.getchannel("A").getbbox()
        if not box:
            raise ValueError(f"empty cell {i} in {path}")
        cells.append(cell.crop(box))
    return cells


def place(subject: Image.Image, canvas: tuple[int, int], pivot: tuple[int, int], scale: float) -> Image.Image:
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    out = Image.new("RGBA", canvas)
    out.alpha_composite(subject, (pivot[0] - size[0] // 2, pivot[1] - size[1]))
    return nearest_palette(out)


def scale_for(subjects: list[Image.Image], bounds: tuple[int, int], consistent: bool = False) -> float | list[float]:
    if consistent:
        first = subjects[0]
        return min(bounds[0] / first.width, bounds[1] / first.height)
    return [min(bounds[0] / s.width, bounds[1] / s.height) for s in subjects]


def anchor_views(name: str, cfg: dict) -> list[Image.Image]:
    prefix = "boss" if cfg["kind"] == "boss" else "enemy"
    cells = crop_cells(ROOT / "art/source/alpha/normalized" / f"{prefix}_{name}_anchor-v01.png", 5)
    # Five generated views plus controlled mirrors for the right side.
    ordered = [cells[0], cells[1], cells[2], cells[3], cells[4], cells[3].transpose(Image.Transpose.FLIP_LEFT_RIGHT),
               cells[2].transpose(Image.Transpose.FLIP_LEFT_RIGHT), cells[1].transpose(Image.Transpose.FLIP_LEFT_RIGHT)]
    scales = scale_for(ordered, cfg["bounds"])
    return [place(s, cfg["canvas"], cfg["pivot"], scale) for s, scale in zip(ordered, scales)]


def master_views(filename: str, cfg: dict) -> list[Image.Image]:
    cells = crop_cells(ROOT / "art/source/alpha/normalized" / filename, 8)
    scales = scale_for(cells, cfg["bounds"])
    return [place(s, cfg["canvas"], cfg["pivot"], scale) for s, scale in zip(cells, scales)]


def variant(image: Image.Image, sx: float = 1.0, sy: float = 1.0, dx: int = 0) -> Image.Image:
    box = image.getchannel("A").getbbox()
    if not box:
        return image.copy()
    subject = image.crop(box)
    size = (max(1, round(subject.width * sx)), max(1, round(subject.height * sy)))
    subject = subject.resize(size, Image.Resampling.NEAREST)
    out = Image.new("RGBA", image.size)
    base_y = box[3]
    x = (image.width - size[0]) // 2 + dx
    y = base_y - size[1]
    out.alpha_composite(subject, (x, y))
    return nearest_palette(out)


def state_frames(state: str, count: int, anchors: list[Image.Image], masters: dict[str, list[Image.Image]]) -> list[list[Image.Image]]:
    output: list[list[Image.Image]] = []
    for frame in range(count):
        angles = []
        for a, anchor in enumerate(anchors):
            master = masters.get(state, anchors)[a]
            if state == "idle":
                image = variant(anchor, sy=1.0 if frame == 0 else 0.985, sx=1.0 if frame == 0 else 1.01)
            elif state == "walk":
                cycle = [anchor, master, variant(anchor, sx=.98, sy=1.01, dx=1), variant(master, sx=1.01, sy=.99, dx=-1)]
                image = cycle[frame % 4]
            elif state in ("attack", "canister"):
                progress = frame / max(1, count - 1)
                if frame == 0 or frame == count - 1:
                    image = anchor
                elif progress < .55:
                    image = variant(master, sx=.98 + progress * .05, sy=1.01 - progress * .04)
                else:
                    image = variant(master, sx=1.01, sy=.99)
            elif state == "pain":
                image = variant(anchor, sx=1.02, sy=.96, dx=(-1 if frame % 2 == 0 else 1))
            elif state == "lunge":
                attack = masters.get("attack", anchors)[a]
                image = [variant(anchor, sx=.97, sy=1.02), variant(attack, sx=1.04, sy=.96, dx=2), attack][frame]
            elif state == "hover":
                image = variant(anchor, sx=[1, 1.01, 1, .99][frame], sy=[1, .99, 1.01, 1][frame])
            elif state == "charge":
                attack = masters.get("attack", anchors)[a]
                image = variant(anchor, sx=.98, sy=1.01) if frame == 0 else variant(attack, sx=1.03, sy=.98)
            elif state == "summon":
                wave = math.sin(frame / max(1, count - 1) * math.pi)
                image = variant(anchor, sx=1.0 + .06 * wave, sy=1.0 - .03 * wave, dx=(-1 if frame % 2 else 1))
                draw = ImageDraw.Draw(image)
                px, py = image.width // 2, image.height - 8
                radius = 2 + min(frame, 4)
                draw.rectangle((px - radius, py - 112 - radius, px + radius, py - 112 + radius), fill="#D9232E")
                if frame >= 2:
                    draw.point((px, py - 112), fill="#FFFDF7")
            else:
                image = anchor
            angles.append(image)
        output.append(angles)
    return output


def sequence_frames(filename: str, source_count: int, output_count: int, cfg: dict) -> list[Image.Image]:
    cells = crop_cells(ROOT / "art/source/alpha/normalized" / filename, source_count)
    scale = scale_for(cells, cfg["bounds"], consistent=True)
    placed = [place(cell, cfg["canvas"], cfg["pivot"], scale) for cell in cells]
    if output_count == source_count:
        return placed
    if output_count == 7:
        return placed[:5] + [variant(placed[4], sx=1.02, sy=.94)] + placed[5:]
    if output_count == 8:
        return [placed[0], placed[1], variant(placed[1], sx=1.01, sy=.96), placed[2], placed[3],
                variant(placed[3], sx=1.02, sy=.94), placed[4], placed[5]]
    if output_count == 10:
        return [
            placed[0], placed[1], variant(placed[1], sx=1.01, sy=.97), placed[2],
            variant(placed[2], sx=1.02, sy=.95), placed[3],
            variant(placed[3], sx=1.03, sy=.93), placed[4],
            variant(placed[4], sx=1.04, sy=.91), placed[5],
        ]
    raise ValueError(output_count)


def save_family(name: str, cfg: dict) -> None:
    prefix = "boss" if cfg["kind"] == "boss" else "enemy"
    out_dir = ROOT / "assets/public_runtime" / ("bosses" if cfg["kind"] == "boss" else "enemies") / name
    out_dir.mkdir(parents=True, exist_ok=True)
    anchors = anchor_views(name, cfg)
    masters = {state: master_views(filename, cfg) for state, filename in cfg["active"].items()}
    records = []
    for state, count in cfg["states"].items():
        frames = state_frames(state, count, anchors, masters)
        for frame_index, angle_images in enumerate(frames, 1):
            for angle, image in zip(ANGLES, angle_images):
                filename = f"{prefix}_{name}_{state}_{frame_index:02d}_{angle}.png"
                image.save(out_dir / filename, optimize=True)
                records.append({"file": filename, "state": state, "frame": frame_index, "angle": angle})
    final_sequence = None
    for state, (filename, source_count, output_count) in cfg["sequences"].items():
        sequence = sequence_frames(filename, source_count, output_count, cfg)
        for frame_index, image in enumerate(sequence, 1):
            output = f"{prefix}_{name}_{state}_{frame_index:02d}_F.png"
            image.save(out_dir / output, optimize=True)
            records.append({"file": output, "state": state, "frame": frame_index, "angle": "F"})
        if state in ("death", "collapse"):
            final_sequence = sequence[-1]
    if final_sequence is None:
        raise ValueError(f"{name}: no corpse-producing sequence")
    corpse_name = f"{prefix}_{name}_corpse_01_F.png"
    final_sequence.save(out_dir / corpse_name, optimize=True)
    records.append({"file": corpse_name, "state": "corpse", "frame": 1, "angle": "F"})
    metadata = {
        "asset_id": f"{prefix}.{name}", "canvas": list(cfg["canvas"]), "pivot": list(cfg["pivot"]),
        "angles": ANGLES, "palette": "red-ledger-40", "frames": records,
    }
    (out_dir / "actor.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="ascii")


if __name__ == "__main__":
    for family, config in FAMILIES.items():
        save_family(family, config)
