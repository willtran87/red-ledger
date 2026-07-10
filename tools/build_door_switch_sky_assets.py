"""Build door, switch, and sky runtime assets from approved imagegen sources."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageOps

from prepare_runtime_image import PALETTE_HEX, quantize_rgba


ROOT = Path(__file__).resolve().parents[1]
ALPHA = ROOT / "art/source/alpha/normalized"
IMAGEGEN = ROOT / "art/source/imagegen"
RUNTIME = ROOT / "assets/public_runtime"
APPROVAL = ROOT / "art/approval"
MANIFEST = ROOT / "manifests/door-switch-sky-runtime-metadata.json"

PALETTE = [tuple(bytes.fromhex(value)) for value in PALETTE_HEX]

FAMILIES = {
    "door_office-standard_v01.png": {
        "kind": "door", "slug": "office-standard", "size": (64, 128),
        "states": ["closed", "opening", "open-edge", "damaged"],
    },
    "door_catastrophe-cyan_v01.png": {
        "kind": "door", "slug": "catastrophe-cyan", "size": (64, 128),
        "states": ["locked", "unlocked", "opening", "open-edge"],
    },
    "door_executive-yellow_v01.png": {
        "kind": "door", "slug": "executive-yellow", "size": (64, 128),
        "states": ["locked", "unlocked", "opening", "open-edge"],
    },
    "door_fire-shutter_v01.png": {
        "kind": "door", "slug": "fire-shutter", "size": (64, 128),
        "states": ["closed", "warning", "moving", "bent"],
    },
    "door_loading-bay_v01.png": {
        "kind": "door", "slug": "loading-bay", "size": (128, 128),
        "states": ["closed", "moving", "damaged"],
    },
    "door_elevator_v01.png": {
        "kind": "door", "slug": "elevator", "size": (64, 128),
        "states": ["closed", "split-open", "failed"],
    },
    "door_vault_v01.png": {
        "kind": "door", "slug": "vault", "size": (128, 128),
        "states": ["sealed", "unlocked", "open-edge"],
    },
    "door_wax-gate_v01.png": {
        "kind": "door", "slug": "wax-gate", "size": (128, 128),
        "states": ["sealed", "melting-01", "melting-02", "melting-03", "melting-04", "open"],
    },
    "switch_pump_v01.png": {
        "kind": "switch", "slug": "pump", "size": (64, 64),
        "states": ["off", "active", "overload"],
    },
    "switch_archive_v01.png": {
        "kind": "switch", "slug": "archive", "size": (64, 64),
        "states": ["off", "active"],
    },
    "switch_executive_v01.png": {
        "kind": "switch", "slug": "executive", "size": (64, 64),
        "states": ["locked", "ready", "active"],
    },
    "switch_actuarial_v01.png": {
        "kind": "switch", "slug": "actuarial", "size": (64, 64),
        "states": ["idle", "calculating-01", "calculating-02", "calculating-03", "calculating-04", "complete"],
    },
}

SKIES = {
    "sky_catastrophe-city_v01.png": "sky_catastrophe-city.png",
    "sky_actuarial-void_v01.png": "sky_actuarial-void.png",
}


def visible_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").point(lambda value: 255 if value > 24 else 0).getbbox()
    if bbox is None:
        raise ValueError("empty generated sheet cell")
    return bbox


def fit_cell(cell: Image.Image, size: tuple[int, int]) -> Image.Image:
    subject = cell.crop(visible_bbox(cell))
    target_width, target_height = size
    contained = ImageOps.contain(
        subject,
        (target_width, max(1, round(target_height * 0.96))),
        method=Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (target_width - contained.width) // 2
    y = target_height - contained.height
    canvas.alpha_composite(contained, (x, y))
    return quantize_rgba(canvas)


def build_family(source_name: str, spec: dict) -> dict:
    source = Image.open(ALPHA / source_name).convert("RGBA")
    states = spec["states"]
    if source.width % len(states):
        raise ValueError(f"{source_name}: width is not divisible by {len(states)}")
    cell_width = source.width // len(states)
    directory = RUNTIME / "textures/doors" / spec["slug"]
    directory.mkdir(parents=True, exist_ok=True)
    prefix = "door" if spec["kind"] == "door" else "switch"
    outputs = []
    previews = []
    for index, state in enumerate(states):
        cell = source.crop((index * cell_width, 0, (index + 1) * cell_width, source.height))
        runtime = fit_cell(cell, spec["size"])
        output = directory / f"{prefix}_{spec['slug']}_{state}.png"
        runtime.save(output, optimize=True)
        outputs.append(output.relative_to(ROOT).as_posix())
        previews.append(runtime)

    cell_preview = (spec["size"][0] * 4, spec["size"][1] * 4)
    sheet = Image.new("RGB", (cell_preview[0] * len(previews), cell_preview[1]), PALETTE[1])
    for index, preview in enumerate(previews):
        checker = Image.new("RGB", cell_preview, PALETTE[10] if index % 2 else PALETTE[2])
        enlarged = preview.resize(cell_preview, Image.Resampling.NEAREST)
        checker.paste(enlarged, (0, 0), enlarged)
        sheet.paste(checker, (index * cell_preview[0], 0))
    approval = APPROVAL / f"{prefix}_{spec['slug']}_preview.png"
    approval.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(approval, optimize=True)
    return {
        "source": f"art/source/imagegen/{source_name}",
        "normalized_alpha": f"art/source/alpha/normalized/{source_name}",
        "kind": spec["kind"],
        "slug": spec["slug"],
        "size": list(spec["size"]),
        "states": states,
        "outputs": outputs,
        "approval": approval.relative_to(ROOT).as_posix(),
    }


def make_horizontal_seam(image: Image.Image, band: int = 32) -> Image.Image:
    """Blend both panorama edges to one shared boundary without moving the horizon."""
    result = image.convert("RGBA")
    left = result.crop((0, 0, band, result.height))
    right = result.crop((result.width - band, 0, result.width, result.height))
    for x in range(band):
        edge_weight = 1.0 - x / max(1, band - 1)
        blend = Image.blend(left.crop((x, 0, x + 1, result.height)), right.crop((band - 1 - x, 0, band - x, result.height)), 0.5)
        original_left = result.crop((x, 0, x + 1, result.height))
        original_right = result.crop((result.width - 1 - x, 0, result.width - x, result.height))
        result.paste(Image.blend(original_left, blend, edge_weight), (x, 0))
        result.paste(Image.blend(original_right, blend, edge_weight), (result.width - 1 - x, 0))
    return result


def build_sky(source_name: str, output_name: str) -> dict:
    source = Image.open(IMAGEGEN / source_name).convert("RGBA")
    runtime = source.resize((1024, 128), Image.Resampling.LANCZOS)
    runtime = quantize_rgba(make_horizontal_seam(runtime))
    output = RUNTIME / "skies" / output_name
    output.parent.mkdir(parents=True, exist_ok=True)
    runtime.save(output, optimize=True)
    preview = APPROVAL / output_name.replace(".png", "_preview.png")
    runtime.resize((2048, 256), Image.Resampling.NEAREST).save(preview, optimize=True)
    return {
        "source": f"art/source/imagegen/{source_name}",
        "size": [1024, 128],
        "horizontal_wrap": True,
        "output": output.relative_to(ROOT).as_posix(),
        "approval": preview.relative_to(ROOT).as_posix(),
    }


def main() -> None:
    families = [build_family(name, spec) for name, spec in FAMILIES.items()]
    skies = [build_sky(name, output) for name, output in SKIES.items()]
    payload = {
        "pipeline": "imagegen -> exact chroma source -> alpha -> normalized equal cells -> locked runtime palette",
        "chroma_key": "#00FF00",
        "palette": list(PALETTE_HEX),
        "families": families,
        "skies": skies,
        "runtime_image_count": sum(len(family["outputs"]) for family in families) + len(skies),
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(payload, indent=2) + "\n", encoding="ascii")
    print(f"Built {payload['runtime_image_count']} door/switch/sky runtime images")


if __name__ == "__main__":
    main()
