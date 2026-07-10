"""Build fixed-canvas runtime props from six-cell normalized alpha sheets."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

from prepare_runtime_image import PALETTE_HEX, quantize_rgba


ROOT = Path(__file__).resolve().parents[1]
ALPHA = ROOT / "art/source/alpha/normalized"
RUNTIME = ROOT / "assets/public_runtime/props"
APPROVAL = ROOT / "art/approval"
RGB = [tuple(bytes.fromhex(value)) for value in PALETTE_HEX]


SHEETS = {
    "prop_office-lineup_v01.png": [
        ("catastrophe-desk", (128, 128), (64, 121)),
        ("office-chair", (96, 112), (48, 106)),
        ("queue-barrier", (128, 112), (64, 106)),
        ("filing-cabinet", (96, 112), (48, 106)),
        ("mail-sort-cart", (128, 112), (64, 106)),
        ("breakroom-microwave", (96, 112), (48, 106)),
    ],
    "prop_archive-lineup_v01.png": [
        ("rolling-shelf-closed", (128, 128), (64, 121)),
        ("rolling-shelf-open", (128, 128), (64, 121)),
        ("pneumatic-tube", (64, 80), (32, 75)),
        ("claim-terminal", (64, 80), (32, 75)),
        ("records-step-cart", (96, 112), (48, 106)),
        ("evidence-locker", (96, 112), (48, 106)),
    ],
    "prop_flood-lineup_v01.png": [
        ("flood-pump", (128, 128), (64, 121)),
        ("generator", (128, 128), (64, 121)),
        ("floating-drawer-cluster", (96, 112), (48, 106)),
        ("damaged-vehicle-cluster", (128, 128), (64, 121)),
        ("sandbag-barricade", (128, 112), (64, 106)),
        ("roof-hvac-damaged", (96, 112), (48, 106)),
    ],
    "prop_industrial-lineup_v01.png": [
        ("vehicle-lift-control", (64, 80), (32, 75)),
        ("archive-crate-pallet", (128, 112), (64, 106)),
        ("salvage-compactor", (96, 112), (48, 106)),
        ("repair-cart", (96, 112), (48, 106)),
        ("axial-blower", (96, 112), (48, 106)),
        ("actuarial-calculator", (128, 112), (64, 106)),
    ],
    "prop_hotel-data-lineup_v01.png": [
        ("hotel-lobby-armchair", (96, 112), (48, 106)),
        ("hotel-luggage-bench", (128, 112), (64, 106)),
        ("hotel-service-trolley", (96, 112), (48, 106)),
        ("data-rack-sealed", (96, 112), (48, 106)),
        ("data-rack-open", (96, 112), (48, 106)),
        ("data-rack-power", (96, 112), (48, 106)),
    ],
    "prop_train-salvage-lineup_v01.png": [
        ("train-relay-cabinet", (96, 112), (48, 106)),
        ("train-coupler-cluster", (96, 112), (48, 106)),
        ("train-tool-trolley", (128, 112), (64, 106)),
        ("salvage-shear", (128, 128), (64, 121)),
        ("salvage-baler", (128, 128), (64, 121)),
        ("salvage-sorting-drum", (128, 128), (64, 121)),
    ],
    "prop_court-actuarial-lineup_v01.png": [
        ("litigation-chair", (96, 112), (48, 106)),
        ("witness-lectern", (96, 112), (48, 106)),
        ("evidence-case-cart", (128, 112), (64, 106)),
        ("probability-engine", (128, 128), (64, 121)),
        ("calculation-tower", (96, 112), (48, 106)),
        ("ledger-integrator", (128, 112), (64, 106)),
    ],
    "prop_paper-desk-hvac-lineup_v01.png": [
        ("paper-stalagmite", (96, 112), (48, 106)),
        ("paper-boulder", (128, 112), (64, 106)),
        ("paper-arch", (128, 128), (64, 121)),
        ("desk-lamp-paper-stack", (96, 80), (48, 75)),
        ("office-phone-stamp", (64, 80), (32, 75)),
        ("roof-exhaust-turbine", (96, 112), (48, 106)),
    ],
}


ACTIVE_PROPS = {
    "pneumatic-tube", "claim-terminal", "flood-pump", "generator",
    "data-rack-sealed", "data-rack-open", "data-rack-power",
    "probability-engine", "calculation-tower", "ledger-integrator",
}


def visible_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").point(lambda value: 255 if value > 24 else 0).getbbox()
    if bbox is None:
        raise ValueError("empty prop cell")
    return bbox


def extract_cell(sheet: Image.Image, index: int, count: int = 6) -> Image.Image:
    left = round(index * sheet.width / count)
    right = round((index + 1) * sheet.width / count)
    return sheet.crop((left, 0, right, sheet.height))


def fit_prop(cell: Image.Image, size: tuple[int, int], pivot: tuple[int, int]) -> Image.Image:
    subject = cell.crop(visible_bbox(cell))
    max_width = round(size[0] * 0.88)
    max_height = round((pivot[1] - 4) * 0.96)
    scale = min(max_width / subject.width, max_height / subject.height)
    subject = subject.resize(
        (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(subject, (pivot[0] - subject.width // 2, pivot[1] - subject.height))
    return quantize_rgba(canvas)


def damage_variant(base: Image.Image, severity: int) -> Image.Image:
    """Add deterministic hard-edged soot, cracks, and warning-color loss."""
    image = base.copy()
    draw = ImageDraw.Draw(image)
    bbox = visible_bbox(image)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    dark = (*RGB[1 if severity > 1 else 3], 255)
    soot = (*RGB[4], 255)
    for offset in range(2 + severity):
        x0 = bbox[0] + width * (31 + offset * 11) // 100
        y0 = bbox[1] + height * (12 + offset * 9) // 100
        x1 = x0 + (3 if offset % 2 else -4)
        y1 = y0 + max(4, height // 8)
        x2 = x1 + (5 if offset % 2 else -3)
        y2 = y1 + max(3, height // 10)
        draw.line((x0, y0, x1, y1, x2, y2), fill=dark, width=max(1, severity))
    for y in range(bbox[1] + height * 3 // 5, bbox[3]):
        for x in range(bbox[0], bbox[2]):
            if image.getpixel((x, y))[3] and (x * 17 + y * 31 + severity * 13) % 29 < severity + 1:
                image.putpixel((x, y), soot)
    return quantize_rgba(image)


def powered_variant(base: Image.Image, frame: int, failed: bool = False) -> Image.Image:
    image = base.copy()
    pixels = image.load()
    bbox = visible_bbox(image)
    red = RGB[14 if failed else 18 + frame % 3]
    cyan = RGB[34 if failed else 36 + frame % 3]
    for y in range(bbox[1], bbox[1] + max(2, (bbox[3] - bbox[1]) // 3)):
        for x in range(bbox[0], bbox[2]):
            r, g, b, a = pixels[x, y]
            if a <= 24:
                continue
            if b > r * 1.15 and b > g * 1.05:
                pixels[x, y] = (*cyan, 255)
            elif r > g * 1.25 and r > b * 1.2:
                pixels[x, y] = (*red, 255)
    return quantize_rgba(image)


def write_frame(directory: Path, name: str, image: Image.Image) -> dict:
    path = directory / name
    image.save(path, optimize=True)
    return {"file": name, "size": list(image.size), "opaque_bbox": list(visible_bbox(image))}


def contact_sheet(frames: list[tuple[str, Image.Image]]) -> None:
    columns = 6
    cell_w, cell_h = 144, 144
    rows = (len(frames) + columns - 1) // columns
    board = Image.new("RGB", (columns * cell_w, rows * cell_h), RGB[2])
    for index, (_, image) in enumerate(frames):
        cell = Image.new("RGBA", (cell_w, cell_h), (*RGB[9 if index % 2 else 1], 255))
        cell.alpha_composite(image, ((cell_w - image.width) // 2, cell_h - image.height - 6))
        board.paste(cell.convert("RGB"), ((index % columns) * cell_w, (index // columns) * cell_h))
    APPROVAL.mkdir(parents=True, exist_ok=True)
    board.resize((board.width * 2, board.height * 2), Image.Resampling.NEAREST).save(
        APPROVAL / "prop_environment-families_contact-v01.png", optimize=True
    )


def main() -> None:
    preview_frames: list[tuple[str, Image.Image]] = []
    totals = {"families": 0, "frames": 0}
    for sheet_name, specs in SHEETS.items():
        sheet = Image.open(ALPHA / sheet_name).convert("RGBA")
        for index, (prop_id, size, pivot) in enumerate(specs):
            base = fit_prop(extract_cell(sheet, index), size, pivot)
            directory = RUNTIME / prop_id
            directory.mkdir(parents=True, exist_ok=True)
            frames = [write_frame(directory, f"prop_{prop_id}_base.png", base)]
            frames.append(write_frame(directory, f"prop_{prop_id}_damaged.png", damage_variant(base, 1)))
            frames.append(write_frame(directory, f"prop_{prop_id}_wrecked.png", damage_variant(base, 2)))
            if prop_id in ACTIVE_PROPS:
                for active_frame in range(4):
                    frames.append(write_frame(
                        directory,
                        f"prop_{prop_id}_active_{active_frame:02d}.png",
                        powered_variant(base, active_frame),
                    ))
                frames.append(write_frame(directory, f"prop_{prop_id}_failed.png", powered_variant(damage_variant(base, 2), 0, True)))
            metadata = {
                "asset_id": f"prop.{prop_id}",
                "source_sheet": sheet_name,
                "source_cell": index,
                "canvas": list(size),
                "pivot": list(pivot),
                "frames": frames,
            }
            (directory / "prop-art.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="ascii")
            preview_frames.append((prop_id, base))
            totals["families"] += 1
            totals["frames"] += len(frames)
    contact_sheet(preview_frames)
    manifest = ROOT / "manifests/prop-runtime-metadata.json"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps({"sheets": SHEETS, "totals": totals}, indent=2) + "\n", encoding="ascii")
    print(json.dumps(totals, indent=2))


if __name__ == "__main__":
    main()
