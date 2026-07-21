"""Recompose extracted sheets with exact chroma keys and uniform spacing."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

from validate_art_library import GRID_SHEETS, KEYS, REGISTERED_SHEETS, SHEET_COUNTS, classify_border


def visible_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").point(lambda value: 255 if value > 24 else 0).getbbox()


def resize_rgba(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Resample premultiplied RGBA so hidden chroma RGB cannot bleed into edges."""
    return image.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")


def transparent_gutter_regions(image: Image.Image, count: int) -> list[tuple[int, int]]:
    """Split a generated lineup at its actual transparent gutters.

    Image generation keeps subjects separated but does not guarantee that their
    centers land on exact equal-column centers. Finding real gutters before
    recomposition prevents a wide prop from spilling into its neighbor's cell.
    """
    alpha = image.getchannel("A")
    occupied = []
    for x in range(image.width):
        occupied.append(alpha.crop((x, 0, x + 1, image.height)).getbbox() is not None)
    visible = [index for index, value in enumerate(occupied) if value]
    if not visible:
        raise ValueError("empty sheet")
    gutters: list[tuple[int, int]] = []
    start = None
    for x in range(visible[0], visible[-1] + 1):
        if not occupied[x] and start is None:
            start = x
        elif occupied[x] and start is not None:
            gutters.append((start, x))
            start = None
    if start is not None:
        gutters.append((start, visible[-1] + 1))
    if len(gutters) < count - 1:
        raise ValueError(f"expected {count - 1} transparent gutters, found {len(gutters)}")
    chosen = sorted(sorted(gutters, key=lambda item: item[1] - item[0], reverse=True)[:count - 1])
    cuts = [(left + right) // 2 for left, right in chosen]
    boundaries = [0, *cuts, image.width]
    return list(zip(boundaries, boundaries[1:]))


def normalize_spacing(image: Image.Image, count: int, actual_gutters: bool = False) -> Image.Image:
    cell_width = image.width // count
    output = Image.new("RGBA", (cell_width * count, image.height), (0, 0, 0, 0))
    max_width = round(cell_width * 0.76)
    max_height = round(image.height * 0.84)
    baseline = round(image.height * 0.92)
    regions = transparent_gutter_regions(image, count) if actual_gutters else [
        (round(index * image.width / count), round((index + 1) * image.width / count))
        for index in range(count)
    ]
    for index, (left, right) in enumerate(regions):
        region = image.crop((left, 0, right, image.height))
        bbox = visible_bbox(region)
        if bbox is None:
            raise ValueError(f"empty cell {index}")
        subject = region.crop(bbox)
        scale = min(max_width / subject.width, max_height / subject.height, 1.0)
        if scale < 1.0:
            subject = resize_rgba(
                subject,
                (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
            )
        x = index * cell_width + (cell_width - subject.width) // 2
        y = baseline - subject.height
        output.alpha_composite(subject, (x, y))
    return output


def normalize_single(image: Image.Image) -> Image.Image:
    bbox = visible_bbox(image)
    if bbox is None:
        return image
    margin_x = round(image.width * 0.05)
    margin_y = round(image.height * 0.05)
    if bbox[0] >= margin_x and bbox[1] >= margin_y and bbox[2] <= image.width - margin_x and bbox[3] <= image.height - margin_y:
        return image
    subject = image.crop(bbox)
    scale = min(
        (image.width - margin_x * 2) / subject.width,
        (image.height - margin_y * 2) / subject.height,
        1.0,
    )
    if scale < 1.0:
        subject = resize_rgba(
            subject,
            (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
        )
    output = Image.new("RGBA", image.size, (0, 0, 0, 0))
    output.alpha_composite(subject, ((image.width - subject.width) // 2, (image.height - subject.height) // 2))
    return output


def normalize_grid(image: Image.Image, columns: int, rows: int) -> Image.Image:
    cell_width = image.width // columns
    cell_height = image.height // rows
    output = Image.new("RGBA", (cell_width * columns, cell_height * rows), (0, 0, 0, 0))
    max_width = round(cell_width * 0.76)
    max_height = round(cell_height * 0.76)
    for row in range(rows):
        for column in range(columns):
            region = image.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height))
            bbox = visible_bbox(region)
            if bbox is None:
                raise ValueError(f"empty grid cell {column},{row}")
            subject = region.crop(bbox)
            scale = min(max_width / subject.width, max_height / subject.height, 1.0)
            if scale < 1.0:
                subject = resize_rgba(subject, (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))))
            x = column * cell_width + (cell_width - subject.width) // 2
            y = row * cell_height + (cell_height - subject.height) // 2
            output.alpha_composite(subject, (x, y))
    return output


def exact_keyed(alpha: Image.Image, key: tuple[int, int, int]) -> Image.Image:
    background = Image.new("RGBA", alpha.size, (*key, 255))
    background.alpha_composite(alpha)
    return background.convert("RGB")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root.resolve()
    alpha_root = root / "art/source/alpha"
    keyed_root = root / "art/source/keyed"
    normalized_alpha = alpha_root / "normalized"
    normalized_keyed = keyed_root / "normalized"
    normalized_alpha.mkdir(parents=True, exist_ok=True)
    normalized_keyed.mkdir(parents=True, exist_ok=True)

    processed = 0
    source_names = {path.name for path in alpha_root.glob("*.png")}
    unregistered = sorted(source_names - REGISTERED_SHEETS)
    if unregistered:
        raise ValueError(f"unregistered alpha sheets: {unregistered}")
    for source in sorted(alpha_root.glob("*.png")):
        alpha = Image.open(source).convert("RGBA")
        count = SHEET_COUNTS.get(source.name)
        grid = GRID_SHEETS.get(source.name)
        if grid:
            alpha = normalize_grid(alpha, *grid)
        elif count:
            alpha = normalize_spacing(alpha, count, actual_gutters=source.name.startswith("prop_"))
        else:
            alpha = normalize_single(alpha)
        alpha.save(normalized_alpha / source.name, optimize=True)

        keyed_source = keyed_root / source.name
        if keyed_source.exists():
            key_name = classify_border(Image.open(keyed_source))["key"]
        else:
            key_name = "magenta" if "coverage-drone" in source.name else "green"
        exact_keyed(alpha, KEYS[key_name]).save(normalized_keyed / source.name, optimize=True)
        processed += 1
    print(f"Normalized {processed} alpha/chroma sheets")


if __name__ == "__main__":
    main()
