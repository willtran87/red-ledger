"""Build the complete runtime projectile, impact, beam, and debris library."""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

from build_enemy_set_a import quantize_rgba
from build_ember_impact import FAMILY as EMBER_IMPACT_FAMILY, build_frames as build_ember_impact
from finalize_sheet_frames import fit_frame


ROOT = Path(__file__).resolve().parents[1]
ANGLES = ("F", "FL", "L", "BL", "B", "BR", "R", "FR")
ANGLE_DEGREES = (0, 45, 90, 135, 180, 225, 270, 315)


def cells(path: Path, count: int, size: tuple[int, int], ratio: float = 0.82) -> list[Image.Image]:
    source = Image.open(path).convert("RGBA")
    result = []
    for index in range(count):
        left = round(index * source.width / count)
        right = round((index + 1) * source.width / count)
        result.append(fit_frame(source.crop((left, 0, right, source.height)), size, "center", 2, 12, ratio, ratio))
    return result


def transform(base: Image.Image, index: int, count: int, rotation: int = 0, fade: bool = False) -> Image.Image:
    progress = index / max(1, count - 1)
    scale = 0.86 + 0.18 * math.sin(progress * math.pi)
    box = base.getchannel("A").getbbox()
    if box is None:
        return base.copy()
    subject = base.crop(box)
    subject = subject.resize((max(1, round(subject.width * scale)), max(1, round(subject.height * scale))), Image.Resampling.NEAREST)
    if rotation:
        subject = subject.rotate(rotation, resample=Image.Resampling.NEAREST, expand=True)
    output = Image.new("RGBA", base.size, (0, 0, 0, 0))
    output.alpha_composite(subject, ((base.width - subject.width) // 2, (base.height - subject.height) // 2))
    if fade:
        alpha = output.getchannel("A")
        pixels = alpha.load()
        threshold = index * 2
        for y in range(output.height):
            for x in range(output.width):
                if pixels[x, y] and (x + y + index) % max(2, count + 2) < threshold:
                    pixels[x, y] = 0
        output.putalpha(alpha)
    return quantize_rgba(output)


def save(image: Image.Image, family: str, name: str, records: list[dict]) -> None:
    directory = ROOT / "assets/public_runtime/effects" / family
    directory.mkdir(parents=True, exist_ok=True)
    image = quantize_rgba(image)
    path = directory / name
    image.save(path, optimize=True)
    records.append({"family": family, "file": path.relative_to(ROOT).as_posix(), "size": list(image.size)})


def projectile_families(records: list[dict]) -> None:
    specs = [
        ("canister-projectile", (48, 48), 4, True),
        ("ember-claim-fire", (32, 32), 4, True),
        ("coverage-bolt", (32, 32), 4, True),
        ("liability-orb", (48, 48), 4, True),
        ("plasma-bolt", (32, 32), 4, True),
        ("denial-packet", (32, 32), 4, True),
        ("reserve-hazard", (64, 64), 6, False),
        ("prediction-zone", (64, 64), 4, False),
    ]
    source = ROOT / "art/source/alpha/normalized/fx_projectile-lineup_v01.png"
    raw = Image.open(source).convert("RGBA")
    for source_index, (family, size, count, rotated) in enumerate(specs):
        left = round(source_index * raw.width / len(specs))
        right = round((source_index + 1) * raw.width / len(specs))
        base = fit_frame(raw.crop((left, 0, right, raw.height)), size, "center", 2, 12, 0.82, 0.82)
        if rotated:
            for frame in range(count):
                for angle, degrees in zip(ANGLES, ANGLE_DEGREES):
                    save(transform(base, frame, count, degrees), family, f"fx_{family}_{angle}_{frame + 1:02d}.png", records)
        else:
            for frame in range(count):
                save(transform(base, frame, count, fade=family == "reserve-hazard" and frame >= 4), family, f"fx_{family}_F_{frame + 1:02d}.png", records)


def impact_families(records: list[dict]) -> None:
    specs = [
        ("hit-spark", (32, 32), 4),
        ("hit-paper", (32, 32), 4),
        ("staple-impact", (32, 32), 4),
        ("fastener-impact", (32, 32), 4),
        ("binding-impact", (64, 64), 8),
        ("ceiling-impact", (96, 96), 8),
    ]
    source = ROOT / "art/source/alpha/normalized/fx_impact-lineup_v01.png"
    raw = Image.open(source).convert("RGBA")
    bases = []
    for source_index, (family, size, count) in enumerate(specs):
        left = round(source_index * raw.width / len(specs))
        right = round((source_index + 1) * raw.width / len(specs))
        base = fit_frame(raw.crop((left, 0, right, raw.height)), size, "center", 2, 12, 0.84, 0.84)
        bases.append(base)
        for frame in range(count):
            save(transform(base, frame, count, rotation=(frame % 3 - 1) * 8, fade=frame >= count // 2), family, f"fx_{family}_F_{frame + 1:02d}.png", records)

    # Beam tiles use the approved impact color language but fixed tile-safe geometry.
    for family, color, impact_base in (("binding-beam", "#47BCD1", bases[4]), ("denial-beam", "#E2B93B", bases[0])):
        for state, count in (("start", 4), ("loop", 4 if family == "binding-beam" else 2), ("impact", 8 if family == "binding-beam" else 5)):
            for frame in range(count):
                if state == "impact":
                    image = transform(impact_base, frame, count, fade=frame >= count // 2)
                else:
                    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
                    draw = ImageDraw.Draw(image)
                    width = 2 + (frame % 3)
                    draw.rectangle((0, 32 - width, 63, 32 + width), fill=color)
                    draw.line((0, 32, 63, 32), fill="#FFFDF7", width=1)
                save(quantize_rgba(image), family, f"fx_{family}_{state}_F_{frame + 1:02d}.png", records)


def explosion(records: list[dict]) -> None:
    frames = cells(ROOT / "art/source/alpha/normalized/fx_canister-explosion_v01.png", 8, (96, 96), 0.92)
    for index, frame in enumerate(frames, 1):
        save(frame, "canister-explosion", f"fx_canister-explosion_F_{index:02d}.png", records)


def support_and_debris(records: list[dict]) -> None:
    specs = [
        ("fraud-reveal", (96, 112), 6),
        ("resurrection-redaction", (96, 112), 8),
        ("redaction-wipe", (64, 64), 4),
        ("generic-debris-paper", (32, 32), 6),
        ("generic-debris-metal", (32, 32), 6),
        ("generic-debris-wax", (32, 32), 6),
    ]
    source = ROOT / "art/source/alpha/normalized/fx_support-debris-lineup_v01.png"
    raw = Image.open(source).convert("RGBA")
    for source_index, (family, size, count) in enumerate(specs):
        left = round(source_index * raw.width / len(specs))
        right = round((source_index + 1) * raw.width / len(specs))
        base = fit_frame(raw.crop((left, 0, right, raw.height)), size, "center", 2, 12, 0.86, 0.86)
        for frame in range(count):
            rotation = frame * 17 if family.startswith("generic-debris") else (frame % 2) * 3
            save(transform(base, frame, count, rotation=rotation, fade=frame >= count // 2), family, f"fx_{family}_F_{frame + 1:02d}.png", records)


def small_ink(records: list[dict]) -> None:
    source_dir = ROOT / "assets/public_runtime/effects/hit-ink-large"
    source_files = sorted(source_dir.glob("*.png"))[:4]
    for index, path in enumerate(source_files, 1):
        image = Image.open(path).convert("RGBA").resize((32, 32), Image.Resampling.NEAREST)
        save(quantize_rgba(image), "hit-ink-small", f"fx_hit-ink-small_F_{index:02d}.png", records)


def main() -> None:
    metadata_path = ROOT / "manifests/effect-runtime-metadata.json"
    existing = json.loads(metadata_path.read_text(encoding="ascii")) if metadata_path.exists() else []
    records: list[dict] = []
    projectile_families(records)
    impact_families(records)
    explosion(records)
    support_and_debris(records)
    small_ink(records)
    generated_count = len(records)
    owned_families = {record["family"] for record in records}
    preserved = [
        record for record in existing
        if record.get("family") not in owned_families and record.get("family") != EMBER_IMPACT_FAMILY
    ]
    records.extend(preserved)
    ember_records = build_ember_impact()
    records.extend(ember_records)
    metadata_path.write_text(json.dumps(records, indent=2) + "\n", encoding="ascii")
    print(f"Built {generated_count + len(ember_records)} effect frames; wrote {len(records)} metadata records")


if __name__ == "__main__":
    main()
