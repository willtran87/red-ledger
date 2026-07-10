"""Build every structural texture family from approved generated material sources."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageOps

from generate_texture_variants import accent, cracked, transition
from prepare_runtime_image import quantize_rgba


ROOT = Path(__file__).resolve().parents[1]

STRIPS = [
    (
        "texture_material-strip-01_v01.png",
        [
            ("acoustic-panel", 64, "walls"),
            ("frosted-glass", 64, "walls"),
            ("wire-glass", 64, "walls"),
            ("parking-concrete", 128, "walls"),
            ("loading-plate", 64, "flats"),
            ("thermal-label-grid", 64, "walls"),
        ],
    ),
    (
        "texture_material-strip-02_v01.png",
        [
            ("corrugated-metal", 64, "walls"),
            ("oxidized-pipe", 64, "walls"),
            ("hotel-wallpaper", 64, "walls"),
            ("data-center-panel", 128, "walls"),
            ("train-car-steel", 128, "walls"),
            ("salvage-sheet", 64, "walls"),
        ],
    ),
    (
        "texture_material-strip-03_v01.png",
        [
            ("toner-sludge", 64, "flats"),
            ("compressed-paper-stone", 128, "walls"),
            ("bone-paper", 64, "walls"),
            ("probability-grid", 128, "walls"),
            ("reserve-vault", 128, "walls"),
            ("white-void-panel", 128, "walls"),
        ],
    ),
    (
        "texture_material-strip-04_v01.png",
        [
            ("commercial-carpet-red", 64, "flats"),
            ("office-drywall-gray", 64, "walls"),
            ("rubber-baseboard", 64, "walls"),
            ("perforated-shutter", 128, "walls"),
            ("paper-stack", 64, "walls"),
            ("litigation-stone", 128, "walls"),
        ],
    ),
]

EXISTING = [
    ("office-drywall-white", ROOT / "assets/public_runtime/textures/walls/office-drywall-white_clean_00.png", "walls"),
    ("commercial-carpet-charcoal", ROOT / "assets/public_runtime/textures/flats/commercial-carpet-charcoal_clean_00.png", "flats"),
    ("elevator-steel", ROOT / "assets/public_runtime/textures/walls/elevator-steel_clean_00.png", "walls"),
    ("concrete-interior", ROOT / "art/working/texture_concrete-interior_base.png", "walls"),
    ("archive-cardboard", ROOT / "art/working/texture_archive-cardboard_base.png", "walls"),
    ("wet-asphalt", ROOT / "art/working/texture_wet-asphalt_base.png", "flats"),
    ("industrial-steel", ROOT / "art/working/texture_industrial-steel_base.png", "walls"),
    ("flood-wall", ROOT / "art/working/texture_flood-wall_base.png", "walls"),
    ("red-wax", ROOT / "art/working/texture_red-wax_base.png", "flats"),
    ("brass-calculator", ROOT / "art/working/texture_brass-calculator_base.png", "walls"),
]


def clean_cell(source: Image.Image, index: int, count: int, size: int) -> Image.Image:
    left = round(index * source.width / count)
    right = round((index + 1) * source.width / count)
    cell = source.crop((left, round(source.height * 0.12), right, round(source.height * 0.80)))
    # The generated strips include charcoal gutters; crop a small horizontal inset.
    inset = max(2, round(cell.width * 0.025))
    cell = cell.crop((inset, 0, cell.width - inset, cell.height))
    return quantize_rgba(ImageOps.fit(cell.convert("RGBA"), (size, size), method=Image.Resampling.LANCZOS))


def animated_frames(base: Image.Image, family: str) -> list[Image.Image]:
    frames = []
    for index in range(4):
        shifted = Image.new("RGBA", base.size, (0, 0, 0, 0))
        offset = index * max(1, base.width // 16)
        shifted.alpha_composite(base, (-offset, 0))
        shifted.alpha_composite(base, (base.width - offset, 0))
        if family in {"toner-sludge", "red-wax", "probability-grid"}:
            frames.append(quantize_rgba(shifted))
    return frames


def write_family(family: str, base: Image.Image, category: str, seed: int, records: list[dict]) -> None:
    directory = ROOT / "assets/public_runtime/textures" / category / family
    directory.mkdir(parents=True, exist_ok=True)
    variants = {
        "clean_00": quantize_rgba(base),
        "light-damage_00": cracked(base, seed, 1),
        "heavy-damage_00": cracked(base, seed + 1009, 2),
    }
    variants["transition_00"] = transition(base, variants["heavy-damage_00"], seed + 2017)
    variants["accent_00"] = accent(base)
    for suffix, image in variants.items():
        path = directory / f"texture_{family}_{suffix}.png"
        image.save(path, optimize=True)
        records.append({"family": family, "variant": suffix, "file": path.relative_to(ROOT).as_posix(), "size": list(image.size)})
    for index, image in enumerate(animated_frames(base, family), 1):
        path = directory / f"texture_{family}_animated_{index:02d}.png"
        image.save(path, optimize=True)
        records.append({"family": family, "variant": f"animated_{index:02d}", "file": path.relative_to(ROOT).as_posix(), "size": list(image.size)})


def main() -> None:
    records: list[dict] = []
    seed = 101
    for filename, specs in STRIPS:
        source = Image.open(ROOT / "art/source/imagegen" / filename).convert("RGBA")
        for index, (family, size, category) in enumerate(specs):
            write_family(family, clean_cell(source, index, len(specs), size), category, seed, records)
            seed += 17
    for family, path, category in EXISTING:
        write_family(family, Image.open(path).convert("RGBA"), category, seed, records)
        seed += 17
    (ROOT / "manifests/texture-runtime-metadata.json").write_text(json.dumps(records, indent=2) + "\n", encoding="ascii")
    print(f"Built {len(records)} runtime texture images across {len({item['family'] for item in records})} families")


if __name__ == "__main__":
    main()
