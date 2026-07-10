"""Build the map decal library from one normalized 6x4 keyed glyph grid."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from finalize_slice_assets import content_bbox, nearest_color


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art/source/alpha/normalized/decal_environment-grid_v01.png"
OUTPUT = ROOT / "assets/public_runtime/textures/decals"
MANIFEST = ROOT / "manifests/decal-runtime-metadata.json"
IDS = (
    "shelter", "chevron", "exit", "suppression", "medical", "credential",
    "waterline", "pump", "electrical", "valve", "rail-switch", "salvage-cut",
    "archive-box", "rolling-shelf", "document-stack", "redaction", "approval-seal", "broken-contract",
    "probability-network", "transfer-arrows", "vault-wheel", "calculation-grid", "danger-octagon", "secret-sensor",
)
TINTS = {
    "neutral": (183, 184, 180),
    "red": (217, 35, 46),
    "cyan": (71, 188, 209),
    "brass": (226, 185, 59),
    "ivory": (244, 241, 234),
    "dark": (100, 106, 112),
}


def flattened(image: Image.Image):
    return image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()


def fit(cell: Image.Image) -> Image.Image:
    subject = cell.crop(content_bbox(cell))
    scale = min(54 / subject.width, 54 / subject.height)
    subject = subject.resize((max(1, round(subject.width * scale)), max(1, round(subject.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    canvas.alpha_composite(subject, ((64 - subject.width) // 2, (64 - subject.height) // 2))
    canvas.putdata([nearest_color(pixel) for pixel in flattened(canvas)])
    return canvas


def tint(image: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    output = image.copy()
    pixels = []
    for r, g, b, a in flattened(output):
        if a <= 24:
            pixels.append((0, 0, 0, 0))
            continue
        value = (r + g + b) / (255 * 3)
        if value < 0.18:
            pixels.append((17, 18, 20, 255))
        else:
            pixels.append((*color, 255))
    output.putdata(pixels)
    return output


def worn(image: Image.Image, phase: int) -> Image.Image:
    output = image.copy()
    pixels = output.load()
    for y in range(output.height):
        for x in range(output.width):
            if pixels[x, y][3] and (x * 7 + y * 11 + phase * 13) % 29 < phase + 2:
                pixels[x, y] = (0, 0, 0, 0)
    return output


def main() -> None:
    sheet = Image.open(SOURCE).convert("RGBA")
    cell_width = sheet.width // 6
    cell_height = sheet.height // 4
    OUTPUT.mkdir(parents=True, exist_ok=True)
    frames = []
    for index, asset_id in enumerate(IDS):
        column, row = index % 6, index // 6
        base = fit(sheet.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height)))
        variants = {name: tint(base, color) for name, color in TINTS.items()}
        variants.update({"worn-1": worn(variants["ivory"], 1), "worn-2": worn(variants["red"], 2), "worn-3": worn(variants["cyan"], 3)})
        for variant, image in variants.items():
            output = OUTPUT / f"decal_{asset_id}_{variant}.png"
            image.save(output, optimize=True)
            frames.append({"id": asset_id, "variant": variant, "file": output.relative_to(ROOT).as_posix(), "size": [64, 64]})
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({"source": SOURCE.relative_to(ROOT).as_posix(), "frames": frames}, indent=2) + "\n", encoding="ascii")
    print(f"Built {len(frames)} runtime decal images across {len(IDS)} glyph families")


if __name__ == "__main__":
    main()
