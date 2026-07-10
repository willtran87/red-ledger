"""Slice separated transparent sprite components into fixed-size PNG frames.

Usage:
  python tools/slice_transparent_sprite_sheet.py \
    --input assets/sprites/transparent/toast-tortoise-evolution-v1-transparent.png \
    --out-dir assets/sprites/runtime/toast-tortoise \
    --names toastlet butterback clubshell \
    --prefix toast-tortoise \
    --size 192
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def mask_to_square_crop(
    img: Image.Image,
    mask: Image.Image,
    padding_ratio: float,
) -> Image.Image:
    bbox = alpha_bbox(mask, 0)
    if bbox is None:
        raise SystemExit("Component group contains no visible sprite pixels")
    isolated = Image.new("RGBA", img.size, (0, 0, 0, 0))
    isolated.paste(img, (0, 0), mask)
    return square_crop_from_bbox(isolated, bbox, padding_ratio)


def find_components(alpha: Image.Image, threshold: int, min_pixels: int) -> list[tuple[int, int, int, int, int]]:
    w, h = alpha.size
    px = alpha.load()
    visited = bytearray(w * h)
    components: list[tuple[int, int, int, int, int]] = []

    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if visited[idx] or px[x, y] <= threshold:
                continue
            visited[idx] = 1
            queue: deque[tuple[int, int]] = deque([(x, y)])
            minx = maxx = x
            miny = maxy = y
            count = 0

            while queue:
                cx, cy = queue.popleft()
                count += 1
                minx = min(minx, cx)
                maxx = max(maxx, cx)
                miny = min(miny, cy)
                maxy = max(maxy, cy)

                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    nidx = ny * w + nx
                    if not visited[nidx] and px[nx, ny] > threshold:
                        visited[nidx] = 1
                        queue.append((nx, ny))

            if count >= min_pixels:
                components.append((minx, miny, maxx + 1, maxy + 1, count))

    return sorted(components, key=lambda box: box[0])


def find_component_masks(
    alpha: Image.Image,
    threshold: int,
    min_pixels: int,
) -> list[dict[str, object]]:
    w, h = alpha.size
    px = alpha.load()
    visited = bytearray(w * h)
    components: list[dict[str, object]] = []

    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if visited[idx] or px[x, y] <= threshold:
                continue
            visited[idx] = 1
            queue: deque[tuple[int, int]] = deque([(x, y)])
            minx = maxx = x
            miny = maxy = y
            pixels: list[tuple[int, int]] = []

            while queue:
                cx, cy = queue.popleft()
                pixels.append((cx, cy))
                minx = min(minx, cx)
                maxx = max(maxx, cx)
                miny = min(miny, cy)
                maxy = max(maxy, cy)

                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    nidx = ny * w + nx
                    if not visited[nidx] and px[nx, ny] > threshold:
                        visited[nidx] = 1
                        queue.append((nx, ny))

            if len(pixels) >= min_pixels:
                components.append(
                    {
                        "bbox": (minx, miny, maxx + 1, maxy + 1),
                        "centerX": (minx + maxx + 1) / 2,
                        "count": len(pixels),
                        "pixels": pixels,
                    }
                )

    return components


def crop_grouped_components(
    img: Image.Image,
    count: int,
    threshold: int,
    min_pixels: int,
    padding_ratio: float,
) -> list[Image.Image]:
    components = find_component_masks(img.getchannel("A"), threshold, min_pixels)
    if len(components) < count:
        raise SystemExit(f"Expected at least {count} components, found {len(components)}")

    anchors = sorted(
        sorted(components, key=lambda component: int(component["count"]), reverse=True)[:count],
        key=lambda component: float(component["centerX"]),
    )
    masks = [Image.new("L", img.size, 0) for _ in anchors]

    for component in components:
        center_x = float(component["centerX"])
        group = min(range(len(anchors)), key=lambda i: abs(center_x - float(anchors[i]["centerX"])))
        mask_px = masks[group].load()
        for x, y in component["pixels"]:  # type: ignore[index]
            mask_px[x, y] = 255

    return [mask_to_square_crop(img, mask, padding_ratio) for mask in masks]


def alpha_bbox(alpha: Image.Image, threshold: int) -> tuple[int, int, int, int] | None:
    w, h = alpha.size
    px = alpha.load()
    minx = w
    miny = h
    maxx = -1
    maxy = -1
    for y in range(h):
        for x in range(w):
            if px[x, y] <= threshold:
                continue
            minx = min(minx, x)
            miny = min(miny, y)
            maxx = max(maxx, x)
            maxy = max(maxy, y)
    if maxx < minx or maxy < miny:
        return None
    return (minx, miny, maxx + 1, maxy + 1)


def square_crop_from_bbox(
    img: Image.Image,
    bbox: tuple[int, int, int, int],
    padding_ratio: float,
) -> Image.Image:
    w, h = img.size
    minx, miny, maxx, maxy = bbox
    bw = maxx - minx
    bh = maxy - miny
    pad = round(max(bw, bh) * padding_ratio)
    side = max(bw, bh) + pad * 2
    cx = (minx + maxx) // 2
    cy = (miny + maxy) // 2
    left = max(0, cx - side // 2)
    top = max(0, cy - side // 2)
    right = min(w, left + side)
    bottom = min(h, top + side)
    left = max(0, right - side)
    top = max(0, bottom - side)
    crop = img.crop((left, top, right, bottom))
    frame = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    frame.alpha_composite(crop, (0, 0))
    return frame


def square_crop(img: Image.Image, box: tuple[int, int, int, int, int], padding_ratio: float) -> Image.Image:
    return square_crop_from_bbox(img, box[:4], padding_ratio)


def crop_equal_columns(
    img: Image.Image,
    count: int,
    threshold: int,
    padding_ratio: float,
) -> list[Image.Image]:
    w, h = img.size
    frames: list[Image.Image] = []
    for index in range(count):
        left = round(index * w / count)
        right = round((index + 1) * w / count)
        region = img.crop((left, 0, right, h))
        bbox = alpha_bbox(region.getchannel("A"), threshold)
        if bbox is None:
            raise SystemExit(f"Column {index + 1} contains no visible sprite pixels")
        frames.append(square_crop_from_bbox(region, bbox, padding_ratio))
    return frames


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--names", nargs="+", required=True)
    parser.add_argument("--prefix", required=True)
    parser.add_argument("--size", type=int, default=192)
    parser.add_argument("--alpha-threshold", type=int, default=24)
    parser.add_argument("--min-pixels", type=int, default=2000)
    parser.add_argument("--padding-ratio", type=float, default=0.12)
    parser.add_argument(
        "--mode",
        choices=("components", "columns", "grouped"),
        default="components",
        help="components detects separated alpha islands; columns crops one form from each equal-width sheet column; grouped assigns detached islands to the three main sprites.",
    )
    args = parser.parse_args()

    img = Image.open(args.input).convert("RGBA")
    if args.mode == "components":
        components = find_components(img.getchannel("A"), args.alpha_threshold, args.min_pixels)
        if len(components) < len(args.names):
            raise SystemExit(f"Expected at least {len(args.names)} components, found {len(components)}")
        source_frames = [square_crop(img, box, args.padding_ratio) for box in components[: len(args.names)]]
    elif args.mode == "columns":
        source_frames = crop_equal_columns(img, len(args.names), args.alpha_threshold, args.padding_ratio)
    else:
        source_frames = crop_grouped_components(
            img,
            len(args.names),
            args.alpha_threshold,
            args.min_pixels,
            args.padding_ratio,
        )

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    frames: list[Image.Image] = []

    for name, frame in zip(args.names, source_frames):
        runtime = frame.resize((args.size, args.size), Image.Resampling.NEAREST)
        runtime.save(out_dir / f"{args.prefix}_{name}_idle_SW_00.png")
        frames.append(runtime)

    sheet = Image.new("RGBA", (args.size * len(frames), args.size), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.alpha_composite(frame, (i * args.size, 0))
    sheet.save(out_dir / f"{args.prefix}_evolution_SW_sheet.png")

    print(f"Sliced {len(frames)} frames from {args.input} into {out_dir}")


if __name__ == "__main__":
    main()
