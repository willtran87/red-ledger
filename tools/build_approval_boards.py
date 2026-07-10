"""Assemble non-shipping comparison boards from approved runtime assets."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "assets/public_runtime"
OUTPUT = ROOT / "art/approval"
BG = (29, 32, 35)
ALT = (183, 184, 180)
RED = (217, 35, 46)


def checker(width: int, height: int, cell: int = 8) -> Image.Image:
    image = Image.new("RGBA", (width, height), BG + (255,))
    draw = ImageDraw.Draw(image)
    for y in range(0, height, cell):
        for x in range(0, width, cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=ALT + (255,))
    return image


def fit(image: Image.Image, width: int, height: int, upscale: bool = False) -> Image.Image:
    scale = min(width / image.width, height / image.height)
    if not upscale:
        scale = min(scale, 1.0)
    return image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.NEAREST)


def board(paths: list[Path], output: Path, cell_size: tuple[int, int], columns: int, labels: bool = True) -> None:
    label_height = 14 if labels else 0
    rows = (len(paths) + columns - 1) // columns
    canvas = Image.new("RGBA", (cell_size[0] * columns, (cell_size[1] + label_height) * rows), BG + (255,))
    draw = ImageDraw.Draw(canvas)
    for index, path in enumerate(paths):
        col, row = index % columns, index // columns
        x = col * cell_size[0]
        y = row * (cell_size[1] + label_height)
        cell = checker(*cell_size)
        image = fit(Image.open(path).convert("RGBA"), cell_size[0] - 8, cell_size[1] - 8)
        cell.alpha_composite(image, ((cell.width - image.width) // 2, cell.height - image.height - 4))
        canvas.alpha_composite(cell, (x, y))
        if labels:
            draw.rectangle((x, y + cell_size[1], x + cell_size[0] - 1, y + cell_size[1] + label_height - 1), fill=(8, 9, 10, 255))
            draw.text((x + 3, y + cell_size[1] + 2), path.parent.name[:20], fill=(244, 241, 234, 255))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, optimize=True)


def actor_paths() -> list[Path]:
    paths = []
    for parent in (RUNTIME / "enemies", RUNTIME / "bosses"):
        for metadata_path in sorted(parent.glob("*/actor*.json")):
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            preferred = next((frame["file"] for frame in metadata["frames"] if frame.get("state") == "idle" and frame.get("angle") == "F"), None)
            if preferred is None:
                preferred = metadata["frames"][0]["file"]
            paths.append(metadata_path.parent / preferred)
    return paths


def representative(directory: Path, pattern: str = "*.png") -> list[Path]:
    paths = []
    for family in sorted(path for path in directory.iterdir() if path.is_dir()):
        candidates = sorted(family.glob(pattern)) or sorted(family.glob("*.png"))
        if candidates:
            paths.append(candidates[0])
    return paths


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    board(actor_paths(), OUTPUT / "guide.scale-lineup.png", (128, 144), 8)
    board(representative(RUNTIME / "weapons/view", "*idle*"), OUTPUT / "guide.weapon-lineup.png", (320, 168), 4)

    pickups = sorted((RUNTIME / "pickups").glob("*_idle_F_00.png"))
    pickups.extend(representative(RUNTIME / "pickups", "base.png"))
    weapon_pickups = representative(RUNTIME / "weapons/pickups", "*pickup*F_00.png")
    board(pickups + weapon_pickups, OUTPUT / "guide.pickup-lineup.png", (80, 80), 8)

    textures = []
    for category in ("walls", "flats", "doors"):
        textures.extend(representative(RUNTIME / f"textures/{category}", "*clean*.png"))
    board(textures, OUTPUT / "guide.material-board.png", (144, 144), 8)
    effects = representative(RUNTIME / "effects")
    effects.extend(representative(RUNTIME / "effects/overlays"))
    board(effects, OUTPUT / "guide.effect-board.png", (96, 96), 8)
    decals = sorted((RUNTIME / "textures/decals").glob("*_neutral.png"))
    board(decals, OUTPUT / "guide.decal-board.png", (80, 80), 8, labels=False)

    ui_paths = [
        RUNTIME / "ui/title-screen.png",
        RUNTIME / "ui/menu-background.png",
        RUNTIME / "ui/status-bar.png",
        RUNTIME / "ui/end-map-tally.png",
        RUNTIME / "ui/episode-select-1.png",
        RUNTIME / "ui/episode-select-2.png",
        RUNTIME / "ui/episode-select-3.png",
        RUNTIME / "ui/illustrations/intermission-episode-1.png",
        RUNTIME / "ui/illustrations/intermission-episode-2.png",
        RUNTIME / "ui/illustrations/intermission-episode-3.png",
    ]
    board([path for path in ui_paths if path.exists()], OUTPUT / "guide.ui-board.png", (320, 200), 3, labels=False)
    print("Built seven approval comparison boards")


if __name__ == "__main__":
    main()
