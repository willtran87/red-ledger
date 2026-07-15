"""Build the authored ember-impact progression with one shared runtime scale."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from build_enemy_set_a import quantize_rgba


ROOT = Path(__file__).resolve().parents[1]
FAMILY = "ember-impact"
SOURCE_NAME = "fx_ember-impact_v01.png"
FRAME_COUNT = 6
CANVAS = (64, 64)
ALPHA_THRESHOLD = 24
PEAK_OCCUPANCY = 0.76


def visible_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A").point(lambda value: 255 if value > ALPHA_THRESHOLD else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("Ember-impact frame has no visible pixels")
    return bbox


def source_cells(root: Path) -> list[tuple[Image.Image, tuple[int, int, int, int]]]:
    source = Image.open(root / "art/source/alpha/normalized" / SOURCE_NAME).convert("RGBA")
    if source.width % FRAME_COUNT:
        raise ValueError(f"{SOURCE_NAME} width {source.width} is not divisible by {FRAME_COUNT}")
    cell_width = source.width // FRAME_COUNT
    cells = []
    for index in range(FRAME_COUNT):
        cell = source.crop((index * cell_width, 0, (index + 1) * cell_width, source.height))
        cells.append((cell, visible_bbox(cell)))
    return cells


def build_frames(root: Path = ROOT) -> list[dict]:
    cells = source_cells(root)
    peak_cell, peak_bbox = max(
        cells,
        key=lambda item: (item[1][2] - item[1][0]) * (item[1][3] - item[1][1]),
    )
    del peak_cell
    peak_width = peak_bbox[2] - peak_bbox[0]
    peak_height = peak_bbox[3] - peak_bbox[1]
    target_width = round(CANVAS[0] * PEAK_OCCUPANCY)
    target_height = round(CANVAS[1] * PEAK_OCCUPANCY)
    scale = min(target_width / peak_width, target_height / peak_height)

    output_dir = root / "assets/public_runtime/effects" / FAMILY
    output_dir.mkdir(parents=True, exist_ok=True)
    frames: list[Image.Image] = []
    records: list[dict] = []
    for index, (cell, bbox) in enumerate(cells, 1):
        subject = cell.crop(bbox)
        scaled_size = (
            max(1, round(subject.width * scale)),
            max(1, round(subject.height * scale)),
        )
        subject = subject.resize(scaled_size, Image.Resampling.LANCZOS)
        frame = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
        frame.alpha_composite(subject, ((CANVAS[0] - subject.width) // 2, (CANVAS[1] - subject.height) // 2))
        frame = quantize_rgba(frame)
        path = output_dir / f"fx_{FAMILY}_F_{index:02d}.png"
        frame.save(path, optimize=True)
        frames.append(frame)
        records.append({"family": FAMILY, "file": path.relative_to(root).as_posix(), "size": list(CANVAS)})

    preview = Image.new("RGBA", (CANVAS[0] * FRAME_COUNT, CANVAS[1]), (52, 56, 61, 255))
    for index, frame in enumerate(frames):
        preview.alpha_composite(frame, (index * CANVAS[0], 0))
    preview = preview.resize((preview.width * 4, preview.height * 4), Image.Resampling.NEAREST)
    preview_path = root / "art/approval/fx_ember-impact_preview.png"
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    preview.save(preview_path, optimize=True)
    return records


def refresh_metadata(records: list[dict], root: Path = ROOT) -> None:
    metadata_path = root / "manifests/effect-runtime-metadata.json"
    existing = json.loads(metadata_path.read_text(encoding="ascii")) if metadata_path.exists() else []
    merged = [record for record in existing if record.get("family") != FAMILY]
    merged.extend(records)
    metadata_path.write_text(json.dumps(merged, indent=2) + "\n", encoding="ascii")


def main() -> None:
    records = build_frames()
    refresh_metadata(records)
    print(f"Built {len(records)} {FAMILY} frames with shared scale and center")


if __name__ == "__main__":
    main()
