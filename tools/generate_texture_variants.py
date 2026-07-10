"""Create deterministic damage and transition variants from an approved base tile."""

from __future__ import annotations

import argparse
import random
from pathlib import Path

from PIL import Image, ImageDraw

from prepare_runtime_image import quantize_rgba


DARK = (29, 32, 35, 255)
DEEP = (17, 18, 20, 255)
LIGHT = (183, 184, 180, 255)
RED = (217, 35, 46, 255)


def cracked(base: Image.Image, seed: int, severity: int) -> Image.Image:
    rng = random.Random(seed)
    image = base.copy()
    draw = ImageDraw.Draw(image)
    count = 3 + severity * 5
    for _ in range(count):
        x = rng.randrange(image.width)
        y = rng.randrange(image.height)
        points = [(x, y)]
        for _ in range(rng.randint(2, 4 + severity)):
            x = max(0, min(image.width - 1, x + rng.randint(-7, 7)))
            y = max(0, min(image.height - 1, y + rng.randint(2, 9)))
            points.append((x, y))
        draw.line(points, fill=DEEP, width=1 if severity == 1 else 2)
        if severity > 1 and rng.random() < 0.65:
            px, py = points[rng.randrange(len(points))]
            radius = rng.randint(1, 3)
            draw.rectangle((px - radius, py - radius, px + radius, py + radius), fill=DARK)
    return quantize_rgba(image)


def transition(base: Image.Image, damaged: Image.Image, seed: int) -> Image.Image:
    rng = random.Random(seed)
    mask = Image.new("L", base.size, 0)
    draw = ImageDraw.Draw(mask)
    edge = []
    for y in range(-4, base.height + 8, 8):
        edge.append((base.width // 2 + rng.randint(-8, 8), y))
    polygon = [(base.width, 0), (base.width, base.height), *reversed(edge)]
    draw.polygon(polygon, fill=255)
    return quantize_rgba(Image.composite(damaged, base, mask))


def accent(base: Image.Image) -> Image.Image:
    image = base.copy()
    draw = ImageDraw.Draw(image)
    x = max(2, image.width // 4)
    draw.rectangle((x, 0, x + max(1, image.width // 32), image.height - 1), fill=DEEP)
    draw.rectangle((x + 1, 0, x + max(2, image.width // 32), image.height - 1), fill=RED)
    return quantize_rgba(image)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--prefix", required=True)
    parser.add_argument("--seed", type=int, default=1)
    args = parser.parse_args()

    base = Image.open(args.input).convert("RGBA")
    light = cracked(base, args.seed, 1)
    heavy = cracked(base, args.seed + 1009, 2)
    outputs = {
        "clean_00": quantize_rgba(base),
        "light-damage_00": light,
        "heavy-damage_00": heavy,
        "transition_00": transition(base, heavy, args.seed + 2017),
        "accent_00": accent(base),
    }
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for suffix, image in outputs.items():
        image.save(out_dir / f"{args.prefix}_{suffix}.png")


if __name__ == "__main__":
    main()
