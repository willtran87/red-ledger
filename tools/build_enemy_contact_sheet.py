#!/usr/bin/env python3
"""Build an inspection contact sheet from canonical runtime frames."""

from __future__ import annotations

import argparse
from pathlib import Path
from PIL import Image, ImageDraw


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--scale", type=int, default=2)
    args = parser.parse_args()
    files = sorted(args.input_dir.glob("*.png"))
    if not files:
        raise SystemExit("no PNG frames")
    sample = Image.open(files[0])
    cell_w = sample.width * args.scale + 8
    cell_h = sample.height * args.scale + 22
    columns = 8
    rows = (len(files) + columns - 1) // columns
    sheet = Image.new("RGBA", (cell_w * columns, cell_h * rows), (29, 32, 35, 255))
    draw = ImageDraw.Draw(sheet)
    for i, path in enumerate(files):
        image = Image.open(path).convert("RGBA").resize((sample.width * args.scale, sample.height * args.scale), Image.Resampling.NEAREST)
        x = (i % columns) * cell_w + 4
        y = (i // columns) * cell_h + 4
        sheet.alpha_composite(image, (x, y))
        draw.text((x, y + sample.height * args.scale + 2), path.stem[-18:], fill=(244, 241, 234, 255))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(args.output, quality=92)


if __name__ == "__main__":
    main()
