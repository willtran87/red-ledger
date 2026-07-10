"""Build deterministic environmental overlay loops from a normalized seed grid."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from finalize_slice_assets import content_bbox, nearest_color


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art/source/alpha/normalized/overlay_environment-grid_v01.png"
OUTPUT = ROOT / "assets/public_runtime/effects/overlays"
MANIFEST = ROOT / "manifests/overlay-runtime-metadata.json"
SPECS = (
    ("rain", (64, 64), 4),
    ("water-drip", (32, 64), 6),
    ("ash", (64, 64), 4),
    ("redaction", (64, 64), 4),
)


def flattened(image: Image.Image):
    return image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()


def prepare(cell: Image.Image, size: tuple[int, int], occupancy: float) -> Image.Image:
    subject = cell.crop(content_bbox(cell))
    scale = min(size[0] * occupancy / subject.width, size[1] * occupancy / subject.height)
    subject = subject.resize((max(1, round(subject.width * scale)), max(1, round(subject.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(subject, ((size[0] - subject.width) // 2, (size[1] - subject.height) // 2))
    canvas.putdata([nearest_color(pixel) for pixel in flattened(canvas)])
    return canvas


def shifted(source: Image.Image, dx: int, dy: int, phase: int) -> Image.Image:
    output = Image.new("RGBA", source.size, (0, 0, 0, 0))
    for ox in (-source.width, 0, source.width):
        for oy in (-source.height, 0, source.height):
            output.alpha_composite(source, (dx + ox, dy + oy))
    pixels = output.load()
    for y in range(output.height):
        for x in range(output.width):
            if pixels[x, y][3] and (x * 5 + y * 7 + phase * 11) % 37 == 0:
                pixels[x, y] = (0, 0, 0, 0)
    return output


def main() -> None:
    sheet = Image.open(SOURCE).convert("RGBA")
    cell_width = sheet.width // 4
    OUTPUT.mkdir(parents=True, exist_ok=True)
    frames = []
    for index, (asset_id, size, count) in enumerate(SPECS):
        seed = prepare(sheet.crop((index * cell_width, 0, (index + 1) * cell_width, sheet.height)), size, 0.90)
        directory = OUTPUT / asset_id
        directory.mkdir(parents=True, exist_ok=True)
        for frame in range(count):
            if asset_id == "rain":
                image = shifted(seed, frame * 3, frame * 7, frame)
            elif asset_id == "water-drip":
                image = shifted(seed, 0, frame * 8, frame)
            elif asset_id == "ash":
                image = shifted(seed, frame * 4, frame * 3, frame)
            else:
                image = shifted(seed, -frame * 5, 0, frame)
            output = directory / f"overlay_{asset_id}_F_{frame + 1:02d}.png"
            image.save(output, optimize=True)
            frames.append({"id": asset_id, "frame": frame + 1, "file": output.relative_to(ROOT).as_posix(), "size": list(size)})
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({"source": SOURCE.relative_to(ROOT).as_posix(), "frames": frames}, indent=2) + "\n", encoding="ascii")
    print(f"Built {len(frames)} environmental overlay frames")


if __name__ == "__main__":
    main()
