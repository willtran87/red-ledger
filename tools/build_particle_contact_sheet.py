"""Build the native-scale particle approval sheet over four contrast grounds."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
FAMILIES = (
    "weapon-feedback",
    "world-feedback",
    "death-feedback",
    "environment-material-feedback",
    "status-feedback",
)
BACKGROUNDS = ((255, 253, 247, 255), (217, 35, 46, 255), (8, 9, 10, 255), (40, 80, 70, 255))
CELL_WIDTH = 176
CELL_HEIGHT = 184
SWATCH = 80


def main() -> None:
    sheet = Image.new("RGBA", (CELL_WIDTH * 8, CELL_HEIGHT * len(FAMILIES)), (17, 18, 20, 255))
    draw = ImageDraw.Draw(sheet)
    for row, family in enumerate(FAMILIES):
        for column in range(8):
            frame_number = column + 1
            path = ROOT / "assets/public_runtime/effects" / f"particle-{family}" / f"fx_particle-{family}_F_{frame_number:02d}.png"
            frame = Image.open(path).convert("RGBA")
            if frame.size != (32, 32):
                raise ValueError(f"{path} is {frame.size}, expected 32x32")
            origin_x = column * CELL_WIDTH + 8
            origin_y = row * CELL_HEIGHT + 8
            for index, background in enumerate(BACKGROUNDS):
                swatch_x = origin_x + (index % 2) * SWATCH
                swatch_y = origin_y + (index // 2) * SWATCH
                draw.rectangle((swatch_x, swatch_y, swatch_x + SWATCH - 1, swatch_y + SWATCH - 1), fill=background)
                sheet.alpha_composite(frame, (swatch_x + (SWATCH - 32) // 2, swatch_y + (SWATCH - 32) // 2))
            draw.text((origin_x, origin_y + SWATCH * 2 + 3), f"{family} {frame_number:02d}", fill=(244, 241, 234, 255))
    output = ROOT / "art/approval/particle_seed_contact-v01.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, optimize=True)
    print(f"Wrote {output.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()
