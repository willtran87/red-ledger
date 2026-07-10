"""Validate runtime art, alpha extraction, chroma keys, and sheet spacing."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean

from PIL import Image

from prepare_runtime_image import PALETTE_HEX


PALETTE = {tuple(bytes.fromhex(value)) for value in PALETTE_HEX}
KEYS = {"green": (0, 255, 0), "magenta": (255, 0, 255)}
SHEET_COUNTS = {
    "enemy_returned-mail_anchor-v01.png": 5,
    "enemy_desk-warden_anchor-v01.png": 8,
    "enemy_ember-clerk_anchor-v01.png": 5,
    "enemy_exposure-hound_anchor-v01.png": 5,
    "enemy_coverage-drone_anchor-v01.png": 5,
    "enemy_liability-mass_anchor-v01.png": 5,
    "boss_regional-director_anchor-v01.png": 5,
    "boss_regional-director_canister-master-v01.png": 8,
    "boss_regional-director_collapse-v01.png": 6,
    "boss_regional-director_walk-master-v01.png": 8,
    "enemy_denial-officer_anchor-v01.png": 8,
    "enemy_subrogator_anchor-v01.png": 8,
    "enemy_reserve-eater_anchor-v01.png": 8,
    "enemy_fraud-apparition_anchor-v02.png": 8,
    "enemy_cat-model_anchor-v01.png": 5,
    "enemy_bad-faith-counsel_anchor-v01.png": 5,
    "boss_aggregate_anchor-v01.png": 5,
    "boss_chief-actuary_anchor-v01.png": 5,
    "boss_uninsurable_states-v01.png": 6,
    "enemy_coverage-drone_attack-master-v01.png": 8,
    "enemy_coverage-drone_death-v01.png": 6,
    "enemy_coverage-drone_walk-master-v01.png": 8,
    "enemy_exposure-hound_attack-master-v01.png": 8,
    "enemy_exposure-hound_death-v01.png": 6,
    "enemy_exposure-hound_gib-v01.png": 6,
    "enemy_exposure-hound_pain-master-v01.png": 8,
    "enemy_exposure-hound_walk-master-v01.png": 8,
    "enemy_liability-mass_attack-master-v01.png": 8,
    "enemy_liability-mass_death-v01.png": 6,
    "enemy_liability-mass_gib-v01.png": 6,
    "enemy_liability-mass_walk-master-v01.png": 8,
    "weapon_staple-driver_states_v01.png": 6,
    "weapon_twin-bore-riveter_states_v01.png": 7,
    "weapon_audit-repeater_states_v01.png": 7,
    "weapon_catastrophe-launcher_states_v01.png": 7,
    "weapon_claim-stamp_states_v01.png": 6,
    "weapon_plasma-copier_states_v01.png": 7,
    "weapon_binding-engine_idle-states_v01.png": 3,
    "weapon_binding-engine_fire-states_v01.png": 6,
    "weapon_umbra-saw_idle-states_v01.png": 2,
    "weapon_umbra-saw_fire-states_v01.png": 6,
    "pickup_ammo-lineup_v01.png": 8,
    "pickup_recovery-lineup_v01.png": 6,
    "pickup_credentials-powerups-lineup_v01.png": 7,
    "pickup_weapon-lineup_v01.png": 4,
    "pickup_weapon-lineup-late_v01.png": 4,
    "prop_office-lineup_v01.png": 6,
    "prop_archive-lineup_v01.png": 6,
    "prop_flood-lineup_v01.png": 6,
    "prop_industrial-lineup_v01.png": 6,
    "prop_hotel-data-lineup_v01.png": 6,
    "prop_train-salvage-lineup_v01.png": 6,
    "prop_court-actuarial-lineup_v01.png": 6,
    "prop_paper-desk-hvac-lineup_v01.png": 6,
    "pickup_missing-lineup_v01.png": 6,
    "fx_projectile-lineup_v01.png": 8,
    "fx_impact-lineup_v01.png": 6,
    "fx_canister-explosion_v01.png": 8,
    "fx_support-debris-lineup_v01.png": 6,
    "fx_hit-ink-large_v01.png": 6,
    "fx_teleport-approval-ring_v01.png": 8,
    "ui_portrait_damage-0_states_v01.png": 6,
    "ui_portrait_damage-1_states_v01.png": 6,
    "ui_portrait_damage-2_states_v01.png": 6,
    "ui_portrait_damage-3_states_v01.png": 6,
    "ui_portrait_damage-4_states_v01.png": 6,
    "ui_portrait_global_states_v01.png": 4,
    "door_office-standard_v01.png": 4,
    "door_catastrophe-cyan_v01.png": 4,
    "door_executive-yellow_v01.png": 4,
    "door_fire-shutter_v01.png": 4,
    "door_loading-bay_v01.png": 3,
    "door_elevator_v01.png": 3,
    "door_vault_v01.png": 3,
    "door_wax-gate_v01.png": 6,
    "switch_pump_v01.png": 3,
    "switch_archive_v01.png": 2,
    "switch_executive_v01.png": 3,
    "switch_actuarial_v01.png": 6,
}
GRID_SHEETS = {
    "decal_environment-grid_v01.png": (6, 4),
    "overlay_environment-grid_v01.png": (4, 1),
}

# Explicit singles keep the registry exhaustive without sending them through
# the equal-cell baseline normalizer used by multi-subject strips.
SINGLE_SHEETS = {
    "door_archive-red_v01.png",
    "guide_adjuster-hand_anchor_v01.png",
    "prop_copier-bank_v01.png",
    "prop_suppression-cylinder_v01.png",
    "switch_wall-basic_v01.png",
    "ui_adjuster-portrait_anchor_v01.png",
}
REGISTERED_SHEETS = set(SHEET_COUNTS) | set(GRID_SHEETS) | SINGLE_SHEETS


def flattened(image: Image.Image):
    return image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()


def key_distance(pixel: tuple[int, int, int], key: tuple[int, int, int]) -> int:
    return sum((pixel[index] - key[index]) ** 2 for index in range(3))


def classify_border(image: Image.Image) -> dict:
    rgb = image.convert("RGB")
    border = []
    for x in range(rgb.width):
        border.extend((rgb.getpixel((x, 0)), rgb.getpixel((x, rgb.height - 1))))
    for y in range(1, rgb.height - 1):
        border.extend((rgb.getpixel((0, y)), rgb.getpixel((rgb.width - 1, y))))
    average = tuple(round(mean(pixel[channel] for pixel in border)) for channel in range(3))
    nearest = min(KEYS, key=lambda name: key_distance(average, KEYS[name]))
    distances = [key_distance(pixel, KEYS[nearest]) ** 0.5 for pixel in border]
    return {
        "key": nearest,
        "border_average": list(average),
        "border_mean_distance": round(mean(distances), 2),
        "border_max_distance": round(max(distances), 2),
        # Normalized keyed sheets are rebuilt locally, so every border pixel
        # must be the exact selected key, not merely close on average.
        "passed": max(distances) <= 0.5,
    }


def alpha_sheet_spacing(path: Path, count: int) -> dict:
    image = Image.open(path).convert("RGBA")
    cells = []
    divisible_width = image.width % count == 0
    cell_width = image.width // count
    for index in range(count):
        left = index * cell_width
        right = (index + 1) * cell_width
        cell = image.crop((left, 0, right, image.height))
        bbox = cell.getchannel("A").point(lambda value: 255 if value > 24 else 0).getbbox()
        if bbox is None:
            cells.append({"index": index, "passed": False, "reason": "empty"})
            continue
        left_gap = bbox[0]
        right_gap = cell.width - bbox[2]
        top_gap = bbox[1]
        bottom_gap = cell.height - bbox[3]
        minimum_horizontal = max(1, round(cell.width * 0.08))
        minimum_vertical = max(1, round(cell.height * 0.08))
        cells.append({
            "index": index,
            "bbox": list(bbox),
            "gaps": [left_gap, top_gap, right_gap, bottom_gap],
            "center_offset": left_gap - right_gap,
            "passed": (
                left_gap >= minimum_horizontal
                and right_gap >= minimum_horizontal
                and top_gap >= minimum_vertical
                and bottom_gap >= minimum_vertical
                and abs(left_gap - right_gap) <= 2
            ),
        })
    bottom_gaps = [cell["gaps"][3] for cell in cells if "gaps" in cell]
    baseline_spread = max(bottom_gaps) - min(bottom_gaps) if bottom_gaps else None
    return {
        "file": path.as_posix(),
        "count": count,
        "cell_width": cell_width,
        "divisible_width": divisible_width,
        "baseline_spread": baseline_spread,
        "cells": cells,
        "passed": (
            divisible_width
            and baseline_spread is not None
            and baseline_spread <= 2
            and all(cell["passed"] for cell in cells)
        ),
    }


def alpha_grid_spacing(path: Path, columns: int, rows: int) -> dict:
    image = Image.open(path).convert("RGBA")
    divisible = image.width % columns == 0 and image.height % rows == 0
    cell_width = image.width // columns
    cell_height = image.height // rows
    cells = []
    for row in range(rows):
        for column in range(columns):
            cell = image.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height))
            bbox = cell.getchannel("A").point(lambda value: 255 if value > 24 else 0).getbbox()
            if bbox is None:
                cells.append({"column": column, "row": row, "passed": False, "reason": "empty"})
                continue
            gaps = [bbox[0], bbox[1], cell_width - bbox[2], cell_height - bbox[3]]
            cells.append({
                "column": column,
                "row": row,
                "bbox": list(bbox),
                "gaps": gaps,
                "center_offset": [gaps[0] - gaps[2], gaps[1] - gaps[3]],
                "passed": (
                    min(gaps) >= max(1, round(min(cell_width, cell_height) * 0.08))
                    and abs(gaps[0] - gaps[2]) <= 2
                    and abs(gaps[1] - gaps[3]) <= 2
                ),
            })
    return {
        "file": path.as_posix(),
        "grid": [columns, rows],
        "cell_size": [cell_width, cell_height],
        "divisible": divisible,
        "cells": cells,
        "passed": divisible and all(cell["passed"] for cell in cells),
    }


def alpha_extraction(path: Path) -> dict:
    source = Image.open(path)
    image = source.convert("RGBA")
    visible = 0
    key_like = 0
    for pixel in flattened(image):
        if pixel[3] > 32:
            visible += 1
            if min(key_distance(pixel[:3], key) for key in KEYS.values()) <= 12 * 12:
                key_like += 1
    alpha = image.getchannel("A")
    border = []
    for x in range(image.width):
        border.extend((alpha.getpixel((x, 0)), alpha.getpixel((x, image.height - 1))))
    for y in range(1, image.height - 1):
        border.extend((alpha.getpixel((0, y)), alpha.getpixel((image.width - 1, y))))
    corners = [alpha.getpixel(point) for point in ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1))]
    return {
        "file": path.as_posix(),
        "size": list(image.size),
        "mode_ok": source.mode == "RGBA",
        "visible_coverage": round(visible / (image.width * image.height), 4),
        "transparent_corners": corners,
        "border_max_alpha": max(border),
        "key_like_visible_pixels": key_like,
        "passed": source.mode == "RGBA" and max(corners) == 0 and max(border) == 0 and key_like == 0,
    }


def sheet_inventory(root: Path) -> dict:
    directories = {
        "source_alpha": root / "art/source/alpha",
        "source_keyed": root / "art/source/keyed",
        "normalized_alpha": root / "art/source/alpha/normalized",
        "normalized_keyed": root / "art/source/keyed/normalized",
    }
    names = {
        label: {path.name for path in directory.glob("*.png")}
        for label, directory in directories.items()
    }
    canonical = names["source_alpha"]
    missing = {
        label: sorted(canonical - files)
        for label, files in names.items()
        if label != "source_alpha" and canonical - files
    }
    unexpected = {
        label: sorted(files - canonical)
        for label, files in names.items()
        if label != "source_alpha" and files - canonical
    }
    unregistered = sorted(canonical - REGISTERED_SHEETS)
    registered_not_present = sorted(REGISTERED_SHEETS - canonical)
    return {
        "counts": {label: len(files) for label, files in names.items()},
        "registered": len(REGISTERED_SHEETS),
        "missing_pairs": missing,
        "unexpected_pairs": unexpected,
        "unregistered": unregistered,
        "registered_not_present": registered_not_present,
        "passed": not missing and not unexpected and not unregistered,
    }


def runtime_png(path: Path, expected_size: tuple[int, int] | None = None, require_transparent_corners: bool = False) -> dict:
    source = Image.open(path)
    image = source.convert("RGBA")
    rgba = flattened(image)
    opaque = [pixel for pixel in rgba if pixel[3] > 24]
    nonpalette = sum(1 for pixel in opaque if pixel[:3] not in PALETTE)
    key_like = sum(
        1 for pixel in opaque
        if min(key_distance(pixel[:3], key) for key in KEYS.values()) <= 12 * 12
    )
    corners = [image.getpixel(point)[3] for point in ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1))]
    return {
        "file": path.as_posix(),
        "size": list(image.size),
        "size_ok": expected_size is None or image.size == expected_size,
        "mode_ok": source.mode == "RGBA",
        "transparent_corners": corners,
        "key_like_opaque_pixels": key_like,
        "nonpalette_opaque_pixels": nonpalette,
        "passed": (
            (expected_size is None or image.size == expected_size)
            and source.mode == "RGBA"
            and key_like == 0
            and nonpalette == 0
            and (not require_transparent_corners or max(corners) == 0)
        ),
    }


def actor_family(directory: Path) -> dict:
    metadata_path = directory / "actor-art.json"
    if not metadata_path.exists():
        metadata_path = directory / "actor.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    expected_size = tuple(metadata["canvas"])
    listed = {frame["file"] for frame in metadata["frames"]}
    actual = {path.name for path in directory.glob("*.png")}
    validations = [runtime_png(directory / name, expected_size, True) for name in sorted(listed & actual)]
    return {
        "asset_id": metadata["asset_id"],
        "canvas": list(expected_size),
        "pivot": metadata["pivot"],
        "listed": len(listed),
        "actual": len(actual),
        "missing": sorted(listed - actual),
        "unlisted": sorted(actual - listed),
        "frames_passed": sum(item["passed"] for item in validations),
        "failed_frames": [item for item in validations if not item["passed"]],
        "passed": not (listed - actual) and not (actual - listed) and all(item["passed"] for item in validations),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--out", type=Path, default=Path("manifests/art-library-validation.json"))
    args = parser.parse_args()
    root = args.root.resolve()
    inventory = sheet_inventory(root)

    actor_dirs = []
    for parent in (root / "assets/public_runtime/enemies", root / "assets/public_runtime/bosses"):
        actor_dirs.extend(path.parent for path in parent.rglob("actor*.json"))
    actors = [actor_family(path) for path in sorted(set(actor_dirs))]

    chroma = []
    keyed_root = root / "art/source/keyed/normalized"
    for path in sorted(keyed_root.glob("*.png")):
        item = classify_border(Image.open(path))
        item["file"] = path.relative_to(root).as_posix()
        chroma.append(item)

    alpha_sources = []
    alpha_root = root / "art/source/alpha/normalized"
    for path in sorted(alpha_root.glob("*.png")):
        item = alpha_extraction(path)
        item["file"] = path.relative_to(root).as_posix()
        alpha_sources.append(item)

    spacing = []
    for name, count in SHEET_COUNTS.items():
        path = alpha_root / name
        if path.exists():
            item = alpha_sheet_spacing(path, count)
            item["file"] = path.relative_to(root).as_posix()
            spacing.append(item)
    for name, (columns, rows) in GRID_SHEETS.items():
        path = alpha_root / name
        if path.exists():
            item = alpha_grid_spacing(path, columns, rows)
            item["file"] = path.relative_to(root).as_posix()
            spacing.append(item)

    runtime = []
    actor_roots = (root / "assets/public_runtime/enemies", root / "assets/public_runtime/bosses")
    for path in sorted((root / "assets/public_runtime").rglob("*.png")):
        if any(parent in path.parents for parent in actor_roots):
            continue
        item = runtime_png(path)
        item["file"] = path.relative_to(root).as_posix()
        runtime.append(item)

    report = {
        "sheet_inventory": inventory,
        "actors": actors,
        "chroma_sources": chroma,
        "alpha_sources": alpha_sources,
        "spaced_alpha_sheets": spacing,
        "other_runtime_pngs": {
            "count": len(runtime),
            "passed": sum(item["passed"] for item in runtime),
            "failed": [item for item in runtime if not item["passed"]],
        },
    }
    report["passed"] = (
        inventory["passed"]
        and all(item["passed"] for item in actors)
        and all(item["passed"] for item in chroma)
        and all(item["passed"] for item in alpha_sources)
        and all(item["passed"] for item in spacing)
        and not report["other_runtime_pngs"]["failed"]
    )
    output = root / args.out
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="ascii")
    print(json.dumps({
        "sheet_inventory": inventory,
        "actors": len(actors),
        "actors_passed": sum(item["passed"] for item in actors),
        "chroma": len(chroma),
        "chroma_passed": sum(item["passed"] for item in chroma),
        "alpha": len(alpha_sources),
        "alpha_passed": sum(item["passed"] for item in alpha_sources),
        "spaced_sheets": len(spacing),
        "spaced_sheets_passed": sum(item["passed"] for item in spacing),
        "other_runtime_pngs": len(runtime),
        "other_runtime_passed": sum(item["passed"] for item in runtime),
        "passed": report["passed"],
        "report": output.relative_to(root).as_posix(),
    }, indent=2))


if __name__ == "__main__":
    main()
