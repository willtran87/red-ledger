#!/usr/bin/env python3
"""Convert a keyed/alpha image-generation pose strip into canonical runtime frames."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw


PALETTE = [
    "08090A", "111214", "1D2023", "2A2D31", "34383D", "4B5055", "646A70", "7D8388",
    "9A9D9D", "B7B8B4", "D4D2CB", "E6E2D9", "F4F1EA", "FFFDF7", "33070B", "520A10",
    "7A1018", "A31822", "D9232E", "F14B51", "FF8484", "3A2812", "674A24", "927044",
    "B9955E", "8A6819", "B68B24", "E2B93B", "FFE17A", "18342F", "285046", "477066",
    "6D9688", "A5C4B6", "11343E", "176175", "238CA5", "47BCD1", "87E3EC", "D1FBFA",
]
RGB = [tuple(bytes.fromhex(value)) for value in PALETTE]
ANGLES = ["F", "FL", "L", "BL", "B", "BR", "R", "FR"]


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").getbbox()


def nearest_palette(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    px = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = px[x, y]
            if a < 32:
                px[x, y] = (0, 0, 0, 0)
                continue
            color = min(RGB, key=lambda c: (r-c[0])**2 + (g-c[1])**2 + (b-c[2])**2)
            px[x, y] = (*color, 255)
    return rgba


def finalize(cell: Image.Image, canvas: tuple[int, int], pivot: tuple[int, int], max_bounds: tuple[int, int]) -> Image.Image:
    box = alpha_bbox(cell)
    if not box:
        raise ValueError("empty frame")
    subject = cell.crop(box)
    target_w, target_h = max_bounds
    scale = min(target_w / subject.width, target_h / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    result = Image.new("RGBA", canvas)
    x = pivot[0] - size[0] // 2
    y = pivot[1] - size[1]
    result.alpha_composite(subject, (x, y))
    return nearest_palette(result)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--asset", required=True)
    parser.add_argument("--state", required=True)
    parser.add_argument("--frame", type=int, required=True)
    parser.add_argument("--views", type=int, choices=(1, 8), required=True)
    parser.add_argument("--canvas", required=True, help="WIDTHxHEIGHT")
    parser.add_argument("--pivot", required=True, help="X,Y")
    parser.add_argument("--max-bounds", required=True, help="WIDTHxHEIGHT")
    args = parser.parse_args()

    canvas = tuple(map(int, args.canvas.lower().split("x")))
    pivot = tuple(map(int, args.pivot.split(",")))
    max_bounds = tuple(map(int, args.max_bounds.lower().split("x")))
    source = Image.open(args.input).convert("RGBA")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    views = ANGLES if args.views == 8 else ["F"]
    columns = len(views)
    records = []
    for index, angle in enumerate(views):
        left = round(index * source.width / columns)
        right = round((index + 1) * source.width / columns)
        runtime = finalize(source.crop((left, 0, right, source.height)), canvas, pivot, max_bounds)
        filename = f"{args.asset}_{args.state}_{args.frame:02d}_{angle}.png"
        output = args.out_dir / filename
        runtime.save(output, optimize=True)
        bbox = alpha_bbox(runtime)
        records.append({"file": filename, "state": args.state, "frame": args.frame, "angle": angle,
                        "canvas": list(canvas), "pivot": list(pivot), "bbox": list(bbox) if bbox else None})
    meta = args.out_dir / f"{args.asset}_{args.state}_{args.frame:02d}.json"
    meta.write_text(json.dumps(records, indent=2) + "\n", encoding="ascii")


if __name__ == "__main__":
    main()

