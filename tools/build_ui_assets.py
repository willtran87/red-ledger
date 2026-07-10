"""Build deterministic pixel UI, icons, and original bitmap font atlases."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


COLORS = {
    "void": "#08090A",
    "black": "#111214",
    "charcoal": "#34383D",
    "steel": "#646A70",
    "light": "#B7B8B4",
    "paper": "#F4F1EA",
    "white": "#FFFDF7",
    "deep_red": "#7A1018",
    "red": "#D9232E",
    "yellow": "#E2B93B",
    "green": "#477066",
    "cyan": "#47BCD1",
}


GLYPHS = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
    ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
    ",": ["00000", "00000", "00000", "00000", "00110", "00110", "00100"],
    ":": ["00000", "00110", "00110", "00000", "00110", "00110", "00000"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
    "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
    "%": ["11001", "11010", "00100", "01000", "10110", "00110", "00000"],
    "'": ["00100", "00100", "00000", "00000", "00000", "00000", "00000"],
    "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
    ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
    " ": ["00000"] * 7,
}


def save(image: Image.Image, path: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target)


def status_bar() -> None:
    image = Image.new("RGBA", (320, 32), COLORS["charcoal"])
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 319, 1), fill=COLORS["light"])
    draw.rectangle((0, 30, 319, 31), fill=COLORS["black"])
    for x in (54, 106, 142, 177, 229, 275):
        draw.line((x, 3, x, 28), fill=COLORS["black"])
        draw.line((x + 1, 3, x + 1, 28), fill=COLORS["steel"])
    draw.rectangle((145, 2, 174, 31), fill=COLORS["black"])
    draw.rectangle((146, 3, 173, 30), outline=COLORS["light"])
    draw.rectangle((5, 6, 48, 25), fill=COLORS["black"])
    draw.rectangle((233, 6, 270, 25), fill=COLORS["black"])
    draw.rectangle((280, 6, 314, 25), fill=COLORS["black"])
    draw.rectangle((108, 7, 137, 24), fill=COLORS["deep_red"])
    save(image, "assets/public_runtime/ui/status-bar.png")


def credential_icons() -> None:
    for name, color, shape in (
        ("red", COLORS["red"], "card"),
        ("cyan", COLORS["cyan"], "octagon"),
        ("yellow", COLORS["yellow"], "seal"),
    ):
        image = Image.new("RGBA", (12, 10), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        if shape == "card":
            draw.rectangle((1, 2, 10, 8), fill=color, outline=COLORS["black"])
        elif shape == "octagon":
            draw.polygon(((3, 1), (8, 1), (10, 3), (10, 7), (8, 9), (3, 9), (1, 7), (1, 3)), fill=color)
        else:
            draw.ellipse((1, 0, 10, 9), fill=color, outline=COLORS["black"])
        draw.rectangle((4, 3, 7, 6), fill=COLORS["paper"])
        save(image, f"assets/public_runtime/ui/icons/credential-{name}.png")


def crosshairs() -> None:
    patterns = ("cross", "gap", "dot", "corners", "ring", "brackets")
    for pattern in patterns:
        image = Image.new("RGBA", (9, 9), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        c = COLORS["paper"]
        if pattern == "cross":
            draw.line((4, 0, 4, 8), fill=c)
            draw.line((0, 4, 8, 4), fill=c)
        elif pattern == "gap":
            draw.line((4, 0, 4, 2), fill=c); draw.line((4, 6, 4, 8), fill=c)
            draw.line((0, 4, 2, 4), fill=c); draw.line((6, 4, 8, 4), fill=c)
        elif pattern == "dot":
            draw.rectangle((3, 3, 5, 5), fill=c)
        elif pattern == "corners":
            draw.line((0, 0, 2, 0), fill=c); draw.line((0, 0, 0, 2), fill=c)
            draw.line((6, 0, 8, 0), fill=c); draw.line((8, 0, 8, 2), fill=c)
            draw.line((0, 8, 2, 8), fill=c); draw.line((0, 6, 0, 8), fill=c)
            draw.line((6, 8, 8, 8), fill=c); draw.line((8, 6, 8, 8), fill=c)
        elif pattern == "ring":
            draw.ellipse((1, 1, 7, 7), outline=c)
        else:
            draw.line((0, 2, 0, 6), fill=c); draw.line((0, 2, 2, 2), fill=c); draw.line((0, 6, 2, 6), fill=c)
            draw.line((8, 2, 8, 6), fill=c); draw.line((6, 2, 8, 2), fill=c); draw.line((6, 6, 8, 6), fill=c)
        save(image, f"assets/public_runtime/ui/crosshairs/crosshair-{pattern}.png")


def controls() -> None:
    for state, active in (("off", False), ("on", True), ("focus", True), ("disabled", False)):
        image = Image.new("RGBA", (18, 10), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        rail = COLORS["steel"] if state != "disabled" else COLORS["charcoal"]
        draw.rectangle((1, 2, 16, 7), fill=COLORS["black"], outline=rail)
        x = 10 if active else 2
        color = COLORS["red"] if state == "focus" else COLORS["paper"] if active else COLORS["steel"]
        draw.rectangle((x, 1, x + 5, 8), fill=color)
        save(image, f"assets/public_runtime/ui/controls/toggle-{state}.png")
    rail = Image.new("RGBA", (48, 8), (0, 0, 0, 0))
    draw = ImageDraw.Draw(rail)
    draw.rectangle((1, 3, 46, 4), fill=COLORS["steel"])
    save(rail, "assets/public_runtime/ui/controls/slider-rail.png")
    knob = Image.new("RGBA", (7, 8), (0, 0, 0, 0))
    ImageDraw.Draw(knob).rectangle((1, 0, 5, 7), fill=COLORS["red"], outline=COLORS["paper"])
    save(knob, "assets/public_runtime/ui/controls/slider-knob.png")

    for frame in range(4):
        selector = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        draw = ImageDraw.Draw(selector)
        offset = frame % 2
        draw.polygon(((1 + offset, 3), (10 + offset, 8), (1 + offset, 13)), fill=COLORS["red"], outline=COLORS["paper"])
        save(selector, f"assets/public_runtime/ui/controls/selector-{frame}.png")

    frame = Image.new("RGBA", (96, 60), COLORS["black"])
    draw = ImageDraw.Draw(frame)
    draw.rectangle((0, 0, 95, 59), outline=COLORS["steel"])
    draw.rectangle((2, 2, 93, 57), outline=COLORS["charcoal"])
    draw.rectangle((5, 5, 90, 48), outline=COLORS["deep_red"])
    save(frame, "assets/public_runtime/ui/controls/save-thumbnail-frame.png")


def weapon_and_ammo_icons() -> None:
    weapon_shapes = (
        ((2, 5), (13, 5), (13, 7), (2, 7)),
        ((2, 4), (12, 4), (15, 6), (12, 7), (2, 7)),
        ((1, 4), (14, 4), (14, 6), (8, 6), (8, 8), (4, 8), (4, 6), (1, 6)),
        ((1, 4), (12, 4), (15, 5), (12, 7), (1, 7)),
        ((1, 4), (10, 4), (15, 6), (10, 8), (1, 8)),
        ((2, 3), (12, 3), (15, 6), (12, 8), (4, 8), (4, 6), (2, 6)),
        ((1, 3), (14, 3), (14, 8), (9, 8), (9, 6), (5, 6), (5, 8), (1, 8)),
        ((1, 6), (5, 2), (8, 4), (14, 1), (15, 3), (9, 7), (6, 9)),
    )
    for index, points in enumerate(weapon_shapes):
        icon = Image.new("RGBA", (16, 10), (0, 0, 0, 0))
        draw = ImageDraw.Draw(icon)
        draw.polygon(points, fill=COLORS["light"], outline=COLORS["black"])
        draw.point((2 + index % 5, 5), fill=COLORS["red"])
        save(icon, f"assets/public_runtime/ui/icons/weapon-{index + 1}.png")

    for name, color, kind in (
        ("staples", COLORS["paper"], "box"),
        ("fasteners", COLORS["red"], "strip"),
        ("canisters", COLORS["yellow"], "cylinder"),
        ("toner", COLORS["cyan"], "cell"),
    ):
        icon = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
        draw = ImageDraw.Draw(icon)
        if kind == "box":
            draw.rectangle((1, 2, 8, 8), fill=color, outline=COLORS["black"])
            draw.line((2, 4, 7, 4), fill=COLORS["steel"])
        elif kind == "strip":
            draw.rectangle((0, 4, 9, 7), fill=color, outline=COLORS["black"])
            for x in range(2, 9, 2):
                draw.point((x, 5), fill=COLORS["paper"])
        else:
            draw.rectangle((3, 1, 7, 8), fill=color, outline=COLORS["black"])
            draw.line((3, 3, 7, 3), fill=COLORS["paper"])
        save(icon, f"assets/public_runtime/ui/icons/ammo-{name}.png")


def navigation_icons() -> None:
    names = (
        "health", "armor", "ammo", "credential", "objective", "secret", "exit", "hazard",
        "terminal", "pump", "elevator", "vault", "boss", "player", "checkpoint", "alert",
    )
    for index, name in enumerate(names):
        icon = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
        draw = ImageDraw.Draw(icon)
        color = (COLORS["red"], COLORS["cyan"], COLORS["yellow"], COLORS["paper"])[index % 4]
        mode = index % 5
        if mode == 0:
            draw.rectangle((3, 1, 6, 8), fill=color); draw.rectangle((1, 3, 8, 6), fill=color)
        elif mode == 1:
            draw.polygon(((5, 0), (9, 3), (8, 8), (5, 9), (2, 8), (1, 3)), fill=color)
        elif mode == 2:
            draw.rectangle((1, 2, 8, 7), outline=color); draw.rectangle((3, 4, 6, 5), fill=color)
        elif mode == 3:
            draw.ellipse((1, 1, 8, 8), outline=color); draw.point((5, 4), fill=color)
        else:
            draw.polygon(((5, 0), (9, 8), (1, 8)), outline=color); draw.line((5, 3, 5, 6), fill=color)
        save(icon, f"assets/public_runtime/ui/icons/minimal-{name}.png")

    map_names = ("player", "start", "exit", "locked-red", "locked-cyan", "locked-yellow", "secret", "objective", "hazard", "terminal", "lift", "boss")
    for index, name in enumerate(map_names):
        icon = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
        draw = ImageDraw.Draw(icon)
        color = (COLORS["paper"], COLORS["red"], COLORS["cyan"], COLORS["yellow"])[index % 4]
        if index % 3 == 0:
            draw.polygon(((4, 0), (7, 7), (4, 5), (1, 7)), fill=color)
        elif index % 3 == 1:
            draw.rectangle((1, 1, 6, 6), outline=color); draw.rectangle((3, 3, 4, 4), fill=color)
        else:
            draw.ellipse((1, 1, 6, 6), outline=color); draw.line((4, 2, 4, 5), fill=color)
        save(icon, f"assets/public_runtime/ui/icons/automap-{name}.png")


def menu_panels() -> None:
    pause = Image.new("RGBA", (128, 24), COLORS["black"])
    draw = ImageDraw.Draw(pause)
    draw.rectangle((0, 0, 127, 23), outline=COLORS["steel"])
    draw.rectangle((3, 3, 124, 20), outline=COLORS["deep_red"])
    for x in (47, 55, 72, 80):
        draw.rectangle((x, 7, x + 3, 16), fill=COLORS["paper"])
    draw.rectangle((61, 7, 66, 16), outline=COLORS["red"])
    save(pause, "assets/public_runtime/ui/pause-plaque.png")

    for index in range(5):
        icon = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        draw = ImageDraw.Draw(icon)
        color = (COLORS["green"], COLORS["paper"], COLORS["yellow"], COLORS["red"], COLORS["deep_red"])[index]
        radius = 8 + index * 2
        draw.ellipse((16 - radius, 16 - radius, 16 + radius - 1, 16 + radius - 1), fill=COLORS["black"], outline=color, width=2)
        for spoke in range(index + 1):
            x = 8 + spoke * max(1, 16 // (index + 1))
            draw.line((16, 16, x, 5), fill=color)
        save(icon, f"assets/public_runtime/ui/icons/difficulty-{index + 1}.png")

    tally = Image.new("RGBA", (320, 200), COLORS["void"])
    draw = ImageDraw.Draw(tally)
    draw.rectangle((24, 20, 295, 179), fill=COLORS["black"], outline=COLORS["steel"])
    draw.rectangle((30, 26, 289, 173), outline=COLORS["deep_red"])
    for y in (62, 94, 126, 158):
        draw.line((42, y, 278, y), fill=COLORS["charcoal"])
    for x, color in ((60, COLORS["red"]), (128, COLORS["cyan"]), (196, COLORS["yellow"]), (264, COLORS["paper"])):
        draw.rectangle((x - 4, 40, x + 4, 48), fill=color)
    save(tally, "assets/public_runtime/ui/end-map-tally.png")

    illustration_root = Path("assets/public_runtime/ui/illustrations")
    for episode in range(1, 4):
        source = illustration_root / f"episode-{episode}-intro.png"
        if not source.exists():
            continue
        thumb = Image.open(source).convert("RGBA").resize((120, 72), Image.Resampling.NEAREST)
        card = Image.new("RGBA", (128, 80), COLORS["black"])
        card.alpha_composite(thumb, (4, 4))
        ImageDraw.Draw(card).rectangle((0, 0, 127, 79), outline=COLORS["red"] if episode == 1 else COLORS["steel"])
        save(card, f"assets/public_runtime/ui/episode-select-{episode}.png")


def font_atlas(name: str, chars: str, scale: int, cell: tuple[int, int]) -> None:
    cols = 16
    rows = (len(chars) + cols - 1) // cols
    atlas = Image.new("RGBA", (cols * cell[0], rows * cell[1]), (0, 0, 0, 0))
    draw = ImageDraw.Draw(atlas)
    metadata = {"cell": list(cell), "line_height": cell[1], "glyphs": {}}
    for index, char in enumerate(chars):
        col, row = index % cols, index // cols
        x, y = col * cell[0], row * cell[1]
        pattern = GLYPHS.get(char.upper(), GLYPHS["?"])
        width = 5 * scale
        height = 7 * scale
        ox = x + max(0, (cell[0] - width) // 2)
        oy = y + max(0, (cell[1] - height) // 2)
        for py, line in enumerate(pattern):
            for px, bit in enumerate(line):
                if bit == "1":
                    draw.rectangle((ox + px * scale, oy + py * scale, ox + (px + 1) * scale - 1, oy + (py + 1) * scale - 1), fill=COLORS["paper"])
        metadata["glyphs"][char] = {"x": x, "y": y, "w": cell[0], "h": cell[1], "advance": cell[0]}
    root = Path("assets/public_runtime/fonts")
    root.mkdir(parents=True, exist_ok=True)
    atlas.save(root / f"{name}.png")
    (root / f"{name}.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def main() -> None:
    status_bar()
    credential_icons()
    crosshairs()
    controls()
    weapon_and_ammo_icons()
    navigation_icons()
    menu_panels()
    small_chars = "".join(chr(code) for code in range(32, 127))
    font_atlas("ledger-small", small_chars, 1, (6, 8))
    font_atlas("ledger-numeric", "0123456789%+-/", 2, (12, 18))
    font_atlas("ledger-title", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-:!?", 3, (18, 24))


if __name__ == "__main__":
    main()
