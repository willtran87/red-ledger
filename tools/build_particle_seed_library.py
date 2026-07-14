"""Build the generated 32x32 particle seed library and metadata records."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from build_enemy_set_a import quantize_rgba
from finalize_sheet_frames import fit_frame


ROOT = Path(__file__).resolve().parents[1]
SPECS = (
    ("weapon-feedback", "fx_weapon-feedback_v01.png", .72),
    ("world-feedback", "fx_world-feedback_v01.png", .72),
    ("death-feedback", "fx_death-feedback_v01.png", .72),
    ("environment-material-feedback", "fx_environment-material-feedback_v01.png", .68),
    ("status-feedback", "fx_status-feedback_v01.png", .64),
)


def build_family(family: str, source_name: str, occupancy: float) -> list[dict]:
    source_path = ROOT / "art/source/alpha/normalized" / source_name
    source = Image.open(source_path).convert("RGBA")
    output_dir = ROOT / "assets/public_runtime/effects" / f"particle-{family}"
    output_dir.mkdir(parents=True, exist_ok=True)
    records: list[dict] = []
    for index in range(8):
        left = round(index * source.width / 8)
        right = round((index + 1) * source.width / 8)
        frame = fit_frame(source.crop((left, 0, right, source.height)), (32, 32), "center", 2, 2, occupancy, occupancy)
        frame = quantize_rgba(frame)
        path = output_dir / f"fx_particle-{family}_F_{index + 1:02d}.png"
        frame.save(path, optimize=True)
        records.append({"family": f"particle-{family}", "file": path.relative_to(ROOT).as_posix(), "size": [32, 32]})
    return records


def main() -> None:
    generated_families = {f"particle-{family}" for family, _source, _occupancy in SPECS}
    metadata_path = ROOT / "manifests/effect-runtime-metadata.json"
    records = json.loads(metadata_path.read_text(encoding="ascii"))
    records = [record for record in records if record.get("family") not in generated_families]
    for family, source, occupancy in SPECS:
        records.extend(build_family(family, source, occupancy))
    metadata_path.write_text(json.dumps(records, indent=2) + "\n", encoding="ascii")
    print(f"Built {len(SPECS) * 8} generated particle seeds")


if __name__ == "__main__":
    main()
