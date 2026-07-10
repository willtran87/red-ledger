"""Split, crop, and palette-lock the five-cell narrative source strip."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from prepare_runtime_image import PALETTE_HEX


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art/source/imagegen/illustration_episode-2-3-strip_v01.png"
MAP_SOURCE = ROOT / "art/source/imagegen/intermission_episode-2-3-strip_v01.png"
OUTPUT = ROOT / "assets/public_runtime/ui/illustrations"
MANIFEST = ROOT / "manifests/narrative-illustration-metadata.json"
MAGENTA = (255, 0, 255)
NAMES = (
    "episode-2-intro",
    "episode-2-outro",
    "episode-3-intro",
    "episode-3-outro",
    "final-epilogue",
)


def is_gutter_column(image: Image.Image, x: int) -> bool:
    pixels = [image.getpixel((x, y))[:3] for y in range(image.height)]
    keyed = sum(
        1 for r, g, b in pixels
        if abs(r - MAGENTA[0]) <= 24 and g <= 32 and abs(b - MAGENTA[2]) <= 24
    )
    return keyed / image.height >= 0.92


def scene_ranges(image: Image.Image, expected_count: int) -> list[tuple[int, int]]:
    gutter = [is_gutter_column(image, x) for x in range(image.width)]
    ranges = []
    start = 0
    for x, keyed in enumerate(gutter + [True]):
        if keyed and x > start:
            if x - start >= image.width // 10:
                ranges.append((start, x))
            start = x + 1
        elif keyed:
            start = x + 1
    if len(ranges) != expected_count:
        raise ValueError(f"expected {expected_count} scene cells, detected {len(ranges)}: {ranges}")
    return ranges


def crop_16_10(image: Image.Image) -> Image.Image:
    target = 16 / 10
    current = image.width / image.height
    if current > target:
        width = round(image.height * target)
        left = (image.width - width) // 2
        return image.crop((left, 0, left + width, image.height))
    height = round(image.width / target)
    top = (image.height - height) // 2
    return image.crop((0, top, image.width, top + height))


def palette_lock(image: Image.Image) -> Image.Image:
    palette = Image.new("P", (1, 1))
    colors = [tuple(bytes.fromhex(value)) for value in PALETTE_HEX]
    raw = [channel for color in colors for channel in color]
    raw.extend(list(colors[-1]) * (256 - len(colors)))
    palette.putpalette(raw)
    return image.convert("RGB").quantize(palette=palette, dither=Image.Dither.FLOYDSTEINBERG).convert("RGBA")


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    frames = []
    for name, (left, right) in zip(NAMES, scene_ranges(source, len(NAMES))):
        scene = crop_16_10(source.crop((left, 0, right, source.height)))
        scene = scene.resize((320, 200), Image.Resampling.LANCZOS)
        scene = palette_lock(scene)
        output = OUTPUT / f"{name}.png"
        scene.save(output, optimize=True)
        frames.append({"id": name, "file": output.relative_to(ROOT).as_posix(), "size": [320, 200]})

    map_source = Image.open(MAP_SOURCE).convert("RGBA")
    map_ranges = scene_ranges(map_source, 2)
    for episode, (left, right) in enumerate(map_ranges, start=2):
        scene = crop_16_10(map_source.crop((left, 0, right, map_source.height)))
        scene = palette_lock(scene.resize((320, 200), Image.Resampling.LANCZOS))
        name = f"intermission-episode-{episode}"
        output = OUTPUT / f"{name}.png"
        scene.save(output, optimize=True)
        frames.append({"id": name, "file": output.relative_to(ROOT).as_posix(), "size": [320, 200]})

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(
        json.dumps({
            "sources": [SOURCE.relative_to(ROOT).as_posix(), MAP_SOURCE.relative_to(ROOT).as_posix()],
            "gutter": "#FF00FF",
            "frames": frames,
        }, indent=2) + "\n",
        encoding="ascii",
    )
    print(f"Built {len(frames)} narrative and intermission illustrations")


if __name__ == "__main__":
    main()
