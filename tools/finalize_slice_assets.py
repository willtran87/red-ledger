"""Finalize generated slice cutouts into fixed-canvas palette PNG assets."""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


PALETTE = [
    "08090A", "111214", "1D2023", "2A2D31", "34383D", "4B5055", "646A70", "7D8388",
    "9A9D9D", "B7B8B4", "D4D2CB", "E6E2D9", "F4F1EA", "FFFDF7", "33070B", "520A10",
    "7A1018", "A31822", "D9232E", "F14B51", "FF8484", "3A2812", "674A24", "927044",
    "B9955E", "8A6819", "B68B24", "E2B93B", "FFE17A", "18342F", "285046", "477066",
    "6D9688", "A5C4B6", "11343E", "176175", "238CA5", "47BCD1", "87E3EC", "D1FBFA",
]
RGB = [tuple(bytes.fromhex(value)) for value in PALETTE]


def content_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 24 else 0).getbbox()
    if bbox is None:
        raise ValueError("source contains no opaque content")
    return bbox


def remove_small_components(image: Image.Image) -> Image.Image:
    """Remove detached column spill while preserving meaningful loose parts."""
    full_alpha = image.getchannel("A")
    sample_scale = min(1.0, 256 / max(image.size))
    width = max(1, round(image.width * sample_scale))
    height = max(1, round(image.height * sample_scale))
    alpha = full_alpha.resize((width, height), Image.Resampling.BOX)
    alpha_values = alpha.get_flattened_data() if hasattr(alpha, "get_flattened_data") else alpha.getdata()
    opaque = bytearray(1 if value > 1 else 0 for value in alpha_values)
    seen = bytearray(width * height)
    components: list[list[int]] = []
    for start, value in enumerate(opaque):
        if not value or seen[start]:
            continue
        queue = deque([start])
        seen[start] = 1
        component: list[int] = []
        while queue:
            index = queue.popleft()
            component.append(index)
            x, y = index % width, index // width
            for nx, ny in ((x-1,y), (x+1,y), (x,y-1), (x,y+1)):
                if 0 <= nx < width and 0 <= ny < height:
                    neighbor = ny * width + nx
                    if opaque[neighbor] and not seen[neighbor]:
                        seen[neighbor] = 1
                        queue.append(neighbor)
        components.append(component)
    if not components:
        return image
    largest = max(len(component) for component in components)
    keep = bytearray(width * height)
    threshold = max(16, int(largest * .05))
    for component in components:
        if len(component) >= threshold:
            for index in component:
                keep[index] = 1
    low_mask = Image.new("L", (width, height), 0)
    low_mask.putdata([255 if value else 0 for value in keep])
    full_mask = low_mask.resize(image.size, Image.Resampling.NEAREST).filter(ImageFilter.MaxFilter(9))
    result = image.copy()
    result.putalpha(Image.composite(full_alpha, Image.new("L", image.size, 0), full_mask))
    return result


def nearest_color(pixel: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    r, g, b, a = pixel
    if a <= 24:
        return (0, 0, 0, 0)
    color = min(RGB, key=lambda candidate: (r-candidate[0])**2 + (g-candidate[1])**2 + (b-candidate[2])**2)
    return (*color, 255)


def finalize(source: Path, output: Path, width: int, height: int, occupancy: float, pivot_x: int, baseline: int) -> dict:
    image = remove_small_components(Image.open(source).convert("RGBA"))
    cropped = image.crop(content_bbox(image))
    max_w = max(1, int(width * occupancy))
    max_h = max(1, int(height * occupancy))
    scale = min(max_w / cropped.width, max_h / cropped.height)
    resized = cropped.resize((max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    x = pivot_x - resized.width // 2
    y = baseline - resized.height
    canvas.alpha_composite(resized, (x, y))
    source_pixels = canvas.get_flattened_data() if hasattr(canvas, "get_flattened_data") else canvas.getdata()
    pixels = [nearest_color(pixel) for pixel in source_pixels]
    canvas.putdata(pixels)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, optimize=True)
    bbox = content_bbox(canvas)
    return {"file": output.as_posix(), "size": [width, height], "pivot": [pivot_x, baseline], "opaque_bbox": list(bbox)}


def shine(source: Path, output: Path, frame: int) -> dict:
    image = Image.open(source).convert("RGBA")
    pixels = image.load()
    width, height = image.size
    x_center = int(width * (0.18 + frame * 0.16))
    candidates = [(abs(x-x_center), y, x) for y in range(int(height * .72)) for x in range(width) if pixels[x, y][3]]
    if candidates:
        _, center_y, center_x = min(candidates)
        for dx, dy, color_index in ((0,0,13), (-1,0,12), (1,0,12), (0,-1,13), (0,1,12)):
            x, y = center_x + dx, center_y + dy
            if 0 <= x < width and 0 <= y < height and pixels[x, y][3]:
                pixels[x, y] = (*RGB[color_index], pixels[x, y][3])
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, optimize=True)
    return {"file": output.as_posix(), "size": [width, height], "derived_from": source.as_posix(), "shine_frame": frame}


def contact(inputs: list[Path], output: Path, columns: int = 8, scale: int = 3) -> None:
    images = [Image.open(path).convert("RGBA") for path in inputs]
    cell_w = max(image.width for image in images)
    cell_h = max(image.height for image in images)
    rows = (len(images) + columns - 1) // columns
    sheet = Image.new("RGB", (cell_w * columns, cell_h * rows), RGB[2])
    for index, image in enumerate(images):
        checker = Image.new("RGB", (cell_w, cell_h), RGB[10] if index % 2 else RGB[1])
        x = index % columns * cell_w
        y = index // columns * cell_h
        checker.paste(image, ((cell_w-image.width)//2, (cell_h-image.height)//2), image)
        sheet.paste(checker, (x, y))
    sheet.resize((sheet.width * scale, sheet.height * scale), Image.Resampling.NEAREST).save(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    final = sub.add_parser("finalize")
    final.add_argument("--input", type=Path, required=True)
    final.add_argument("--output", type=Path, required=True)
    final.add_argument("--size", required=True)
    final.add_argument("--occupancy", type=float, default=.72)
    final.add_argument("--pivot", required=True)
    effect = sub.add_parser("shine")
    effect.add_argument("--input", type=Path, required=True)
    effect.add_argument("--output", type=Path, required=True)
    effect.add_argument("--frame", type=int, required=True)
    board = sub.add_parser("contact")
    board.add_argument("--inputs", type=Path, nargs="+", required=True)
    board.add_argument("--output", type=Path, required=True)
    board.add_argument("--columns", type=int, default=8)
    board.add_argument("--scale", type=int, default=3)
    args = parser.parse_args()
    if args.command == "finalize":
        width, height = map(int, args.size.lower().split("x"))
        pivot_x, baseline = map(int, args.pivot.split(","))
        print(json.dumps(finalize(args.input, args.output, width, height, args.occupancy, pivot_x, baseline)))
    elif args.command == "shine":
        print(json.dumps(shine(args.input, args.output, args.frame)))
    else:
        contact(args.inputs, args.output, args.columns, args.scale)


if __name__ == "__main__":
    main()
