"""Resize generated source art into the locked runtime palette and dimensions."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageOps


PALETTE_HEX = (
    "08090A", "111214", "1D2023", "2A2D31", "34383D", "4B5055", "646A70", "7D8388",
    "9A9D9D", "B7B8B4", "D4D2CB", "E6E2D9", "F4F1EA", "FFFDF7", "33070B", "520A10",
    "7A1018", "A31822", "D9232E", "F14B51", "FF8484", "3A2812", "674A24", "927044",
    "B9955E", "8A6819", "B68B24", "E2B93B", "FFE17A", "18342F", "285046", "477066",
    "6D9688", "A5C4B6", "11343E", "176175", "238CA5", "47BCD1", "87E3EC", "D1FBFA",
)


def locked_palette() -> Image.Image:
    colors: list[int] = []
    for value in PALETTE_HEX:
        colors.extend(int(value[index:index + 2], 16) for index in (0, 2, 4))
    # Pillow considers every one of the 256 palette entries during quantization.
    # Repeat the final approved color so padding cannot introduce pure black as
    # an accidental 41st runtime color.
    colors.extend(colors[-3:] * ((768 - len(colors)) // 3))
    palette = Image.new("P", (1, 1))
    palette.putpalette(colors)
    return palette


def quantize_rgba(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    quantized = rgba.convert("RGB").quantize(
        palette=locked_palette(),
        dither=Image.Dither.NONE,
    ).convert("RGBA")
    quantized.putalpha(alpha)
    return quantized


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--width", required=True, type=int)
    parser.add_argument("--height", required=True, type=int)
    parser.add_argument("--fit", choices=("crop", "stretch", "contain"), default="crop")
    parser.add_argument("--preview", default="")
    parser.add_argument("--tile-preview", action="store_true")
    parser.add_argument("--aspect-correct-preview", action="store_true")
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    size = (args.width, args.height)
    if args.fit == "crop":
        resized = ImageOps.fit(source, size, method=Image.Resampling.LANCZOS)
    elif args.fit == "contain":
        resized = ImageOps.contain(source, size, method=Image.Resampling.LANCZOS)
        frame = Image.new("RGBA", size, (0, 0, 0, 0))
        frame.alpha_composite(resized, ((size[0] - resized.width) // 2, (size[1] - resized.height) // 2))
        resized = frame
    else:
        resized = source.resize(size, Image.Resampling.LANCZOS)

    runtime = quantize_rgba(resized)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    runtime.save(out)

    if args.preview:
        if args.tile_preview:
            preview = Image.new("RGBA", (args.width * 3, args.height * 3))
            for y in range(3):
                for x in range(3):
                    preview.alpha_composite(runtime, (x * args.width, y * args.height))
        else:
            preview = runtime
        scale = 4
        preview = preview.resize((preview.width * scale, preview.height * scale), Image.Resampling.NEAREST)
        if args.aspect_correct_preview:
            preview = preview.resize((preview.width, round(preview.height * 1.2)), Image.Resampling.NEAREST)
        preview_path = Path(args.preview)
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        preview.save(preview_path)


if __name__ == "__main__":
    main()
