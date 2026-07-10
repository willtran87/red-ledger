"""Build the remaining pickup families from one normalized six-cell sheet."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from finalize_slice_assets import contact, finalize, shine


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art/source/alpha/normalized/pickup_missing-lineup_v01.png"
WORK = ROOT / "art/working/pickups/missing"
RUNTIME = ROOT / "assets/public_runtime/pickups"
MANIFEST = ROOT / "manifests/missing-pickup-runtime-metadata.json"

PICKUPS = (
    ("toner-small", 48, 48, 0.66),
    ("toner-large", 64, 64, 0.72),
    ("emergency-reserve", 64, 64, 0.74),
    ("temporary-binder", 64, 64, 0.76),
    ("rapid-authority", 64, 64, 0.76),
    ("forensic-lens", 64, 64, 0.74),
)


def split_cells(image: Image.Image) -> list[Path]:
    WORK.mkdir(parents=True, exist_ok=True)
    results = []
    for index, (asset_id, *_rest) in enumerate(PICKUPS):
        left = round(index * image.width / len(PICKUPS))
        right = round((index + 1) * image.width / len(PICKUPS))
        output = WORK / f"{asset_id}.png"
        image.crop((left, 0, right, image.height)).save(output, optimize=True)
        results.append(output)
    return results


def main() -> None:
    image = Image.open(SOURCE).convert("RGBA")
    sources = split_cells(image)
    records = []
    bases = []
    for source, (asset_id, width, height, occupancy) in zip(sources, PICKUPS):
        directory = RUNTIME / asset_id
        base = directory / "base.png"
        records.append(finalize(source, base, width, height, occupancy, width // 2, height - 3))
        bases.append(base)
        for frame in range(4):
            records.append(shine(base, directory / f"shine-{frame}.png", frame))

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(
        json.dumps({"source": SOURCE.relative_to(ROOT).as_posix(), "families": len(PICKUPS), "frames": records}, indent=2) + "\n",
        encoding="ascii",
    )
    contact(bases, ROOT / "art/approval/pickup-missing-board.png", columns=6, scale=4)
    print(f"Built {len(records)} runtime images across {len(PICKUPS)} pickup families")


if __name__ == "__main__":
    main()
