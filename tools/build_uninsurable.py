"""Build the staged Uninsurable world-construction boss art."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

from build_enemy_set_a import quantize_rgba
from finalize_sheet_frames import fit_frame


ROOT = Path(__file__).resolve().parents[1]
CANVAS = (192, 176)
PIVOT = (96, 168)


def dither_alpha(image: Image.Image, visibility: float, phase: int) -> Image.Image:
    output = image.copy()
    alpha = output.getchannel("A")
    pixels = alpha.load()
    bayer = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))
    threshold = round(max(0.0, min(1.0, visibility)) * 16)
    for y in range(output.height):
        for x in range(output.width):
            if pixels[x, y] and bayer[(y + phase) % 4][(x + phase) % 4] >= threshold:
                pixels[x, y] = 0
    output.putalpha(alpha)
    return quantize_rgba(output)


def save_frame(image: Image.Image, output: Path, state: str, index: int) -> str:
    name = f"boss_uninsurable_{state}_F_{index:02d}_v01.png"
    image = quantize_rgba(image)
    alpha = image.getchannel("A")
    ImageDraw.Draw(alpha).rectangle((0, 0, image.width - 1, image.height - 1), outline=0, width=1)
    image.putalpha(alpha)
    image.save(output / name, optimize=True)
    return name


def main() -> None:
    source = Image.open(ROOT / "art/source/alpha/normalized/boss_uninsurable_states-v01.png").convert("RGBA")
    stages = []
    for index in range(6):
        left = round(index * source.width / 6)
        right = round((index + 1) * source.width / 6)
        stages.append(fit_frame(source.crop((left, 0, right, source.height)), CANVAS, "bottom", 2, 12, 0.94, 0.94))

    output = ROOT / "assets/public_runtime/bosses/uninsurable"
    output.mkdir(parents=True, exist_ok=True)
    records = []

    groups: list[tuple[str, list[Image.Image]]] = [
        ("sealed", [stages[0]]),
        ("gate-open", [stages[1], Image.blend(stages[1], stages[2], 0.5), stages[2]]),
        ("core", [stages[2], stages[3], Image.blend(stages[2], stages[3], 0.7), stages[3]]),
        ("damage", [stages[4], Image.blend(stages[4], stages[5], 0.25), Image.blend(stages[4], stages[5], 0.45)]),
    ]
    destroy = []
    for index in range(16):
        progress = index / 15
        frame = Image.blend(stages[4], stages[5], progress)
        if 3 <= index <= 11:
            draw = ImageDraw.Draw(frame)
            radius = 2 + min(index - 3, 6)
            draw.rectangle((PIVOT[0] - radius, 72 - radius, PIVOT[0] + radius, 72 + radius), fill="#FFFDF7")
            draw.line((PIVOT[0] - radius * 2, 72, PIVOT[0] + radius * 2, 72), fill="#D9232E", width=2)
        destroy.append(frame)
    groups.append(("destroy", destroy))
    groups.append(("debris", [dither_alpha(stages[5], 1.0 - index * 0.09, index) for index in range(8)]))

    previews = []
    for state, frames in groups:
        for index, frame in enumerate(frames, 1):
            name = save_frame(frame, output, state, index)
            records.append({"file": name, "state": state, "angle": "F", "frame": index})
            previews.append(frame)

    metadata = {
        "asset_id": "boss.uninsurable", "canvas": list(CANVAS), "pivot": list(PIVOT),
        "authored_angles": ["F"], "palette": "red-ledger-master-40", "frames": records,
    }
    (output / "actor-art.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="ascii")

    columns = 6
    rows = (len(previews) + columns - 1) // columns
    contact = Image.new("RGBA", (CANVAS[0] * columns, CANVAS[1] * rows), "#34383D")
    for index, frame in enumerate(previews):
        contact.alpha_composite(frame, ((index % columns) * CANVAS[0], (index // columns) * CANVAS[1]))
    contact.resize((contact.width * 2, contact.height * 2), Image.Resampling.NEAREST).save(
        ROOT / "art/approval/boss_uninsurable_contact-v01.png"
    )
    print(f"Built {len(records)} Uninsurable frames")


if __name__ == "__main__":
    main()
