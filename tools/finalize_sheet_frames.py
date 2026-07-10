"""Split an alpha sheet into fixed runtime canvases with stable anchors."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

from prepare_runtime_image import quantize_rgba


def visible_bbox(image: Image.Image, threshold: int) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A").point(lambda value: 255 if value > threshold else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("Frame has no visible pixels")
    return bbox


def fit_frame(
    source: Image.Image,
    size: tuple[int, int],
    anchor: str,
    padding: int,
    alpha_threshold: int,
    max_width_ratio: float,
    max_height_ratio: float,
) -> Image.Image:
    crop = source.crop(visible_bbox(source, alpha_threshold))
    available = (
        max(1, round((size[0] - padding * 2) * max_width_ratio)),
        max(1, round((size[1] - padding * 2) * max_height_ratio)),
    )
    scale = min(available[0] / crop.width, available[1] / crop.height)
    scaled_size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    scaled = crop.resize(scaled_size, Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (size[0] - scaled.width) // 2
    if anchor == "bottom":
        y = size[1] - padding - scaled.height
    else:
        y = (size[1] - scaled.height) // 2
    frame.alpha_composite(scaled, (x, y))
    return quantize_rgba(frame)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--prefix", required=True)
    parser.add_argument("--names", nargs="+", required=True)
    parser.add_argument("--width", type=int, required=True)
    parser.add_argument("--height", type=int, required=True)
    parser.add_argument("--anchor", choices=("bottom", "center"), default="bottom")
    parser.add_argument("--padding", type=int, default=4)
    parser.add_argument("--alpha-threshold", type=int, default=12)
    parser.add_argument("--max-width-ratio", type=float, default=1.0)
    parser.add_argument("--max-height-ratio", type=float, default=1.0)
    parser.add_argument("--preview", default="")
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    count = len(args.names)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    frames: list[Image.Image] = []
    for index, name in enumerate(args.names):
        left = round(index * source.width / count)
        right = round((index + 1) * source.width / count)
        region = source.crop((left, 0, right, source.height))
        frame = fit_frame(
            region,
            (args.width, args.height),
            args.anchor,
            args.padding,
            args.alpha_threshold,
            args.max_width_ratio,
            args.max_height_ratio,
        )
        frame.save(out_dir / f"{args.prefix}_{name}.png")
        frames.append(frame)

    if args.preview:
        sheet = Image.new("RGBA", (args.width * count, args.height), (52, 56, 61, 255))
        for index, frame in enumerate(frames):
            sheet.alpha_composite(frame, (index * args.width, 0))
        sheet = sheet.resize((sheet.width * 4, sheet.height * 4), Image.Resampling.NEAREST)
        preview = Path(args.preview)
        preview.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(preview)


if __name__ == "__main__":
    main()
