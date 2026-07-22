#!/usr/bin/env python3
"""Validate the corrected character review mattes for chroma spill."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parent
ALPHA_ROOT = ROOT / "alpha"
EXPECTED = (
    "adjuster-brown-hair-turnaround-alpha.png",
    "agent-silver-hair-turnaround-alpha.png",
    "counsel-dark-hair-turnaround-alpha.png",
    "counsel-dark-hair-back-alpha.png",
    "counsel-dark-hair-side-alpha.png",
)
VISIBLE_ALPHA = 32


def is_magenta_spill(red: int, green: int, blue: int) -> bool:
    return (
        red >= 90
        and blue >= 90
        and green * 1.30 < min(red, blue)
        and abs(red - blue) <= 120
    )


def is_green_spill(red: int, green: int, blue: int) -> bool:
    return (
        green >= 90
        and red * 1.30 < green
        and blue * 1.30 < green
        and abs(red - blue) <= 120
    )


def validate(path: Path) -> list[str]:
    source = Image.open(path)
    image = source.convert("RGBA")
    alpha = image.getchannel("A")
    errors: list[str] = []

    if source.mode != "RGBA":
        errors.append(f"mode is {source.mode}, expected RGBA")

    border = []
    for x in range(image.width):
        border.extend((alpha.getpixel((x, 0)), alpha.getpixel((x, image.height - 1))))
    for y in range(1, image.height - 1):
        border.extend((alpha.getpixel((0, y)), alpha.getpixel((image.width - 1, y))))
    if max(border) != 0:
        errors.append(f"border alpha reaches {max(border)}, expected 0")

    transparent_neighbor = alpha.point(
        lambda value: 255 if value <= VISIBLE_ALPHA else 0
    ).filter(ImageFilter.MaxFilter(3))
    boundary_magenta = 0
    boundary_green = 0
    visible_magenta = 0
    for (red, green, blue, pixel_alpha), neighbor in zip(
        image.get_flattened_data(), transparent_neighbor.get_flattened_data()
    ):
        if pixel_alpha <= VISIBLE_ALPHA:
            continue
        magenta = is_magenta_spill(red, green, blue)
        visible_magenta += int(magenta)
        if neighbor:
            boundary_magenta += int(magenta)
            boundary_green += int(is_green_spill(red, green, blue))

    if visible_magenta:
        errors.append(f"{visible_magenta} broadly magenta visible pixels remain")
    if boundary_magenta:
        errors.append(f"{boundary_magenta} magenta boundary pixels remain")
    if boundary_green:
        errors.append(f"{boundary_green} green boundary pixels remain")
    return errors


def main() -> None:
    actual = {path.name for path in ALPHA_ROOT.glob("*.png")}
    expected = set(EXPECTED)
    failures: list[str] = []
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        failures.append(f"inventory mismatch: missing={missing}, extra={extra}")

    for name in EXPECTED:
        path = ALPHA_ROOT / name
        if not path.exists():
            continue
        failures.extend(f"{name}: {error}" for error in validate(path))

    if failures:
        raise SystemExit("Character chroma review failed:\n- " + "\n- ".join(failures))
    print(
        "Character chroma review passed: 5 RGBA files, transparent borders, "
        "zero visible magenta and zero chroma-colored boundary pixels."
    )


if __name__ == "__main__":
    main()
