# Door, Switch, and Sky Generation Brief

## Shared discrete-sheet lock

- Built-in image generation, faithful early-1990s pre-rendered pixel art.
- Limited charcoal, gray, cream, red, cyan, and brass production palette.
- Orthographic front elevation; fixed housing, scale, baseline, and frontal light across states.
- One horizontal row of equal-width cells with broad, uniform gutters.
- Perfectly flat solid `#00FF00` background; no green within subjects.
- No text, digits, logos, watermark, floor, scenery, cast shadow, gradient, crop, or overlap.
- State order is locked to `tools/build_door_switch_sky_assets.py`.

## Discrete sheets

| Source | Cells | Identity |
|---|---:|---|
| `door_office-standard_v01.png` | 4 | Gray commercial laminate slider |
| `door_catastrophe-cyan_v01.png` | 4 | Flood-control gunmetal and cyan access |
| `door_executive-yellow_v01.png` | 4 | Charcoal, cream, brass, and yellow access |
| `door_fire-shutter_v01.png` | 4 | Ribbed steel roll-up shutter and red warning lamp |
| `door_loading-bay_v01.png` | 3 | Wide industrial shutter and safety stripes |
| `door_elevator_v01.png` | 3 | Brushed steel commercial elevator portal |
| `door_vault_v01.png` | 3 | Wide radial treaty-vault mechanism |
| `door_wax-gate_v01.png` | 6 | Blackened brass frame with progressive red-wax melt |
| `switch_pump_v01.png` | 3 | Pump lever, pressure dial, cyan/red lamps |
| `switch_archive_v01.png` | 2 | Archive routing lever, paper slot, red lamp |
| `switch_executive_v01.png` | 3 | Brass-trim authorization lever and light bank |
| `switch_actuarial_v01.png` | 6 | Brass calculator console with cyan/red/cream pulse |

## Panorama lock

- Horizontally wrapping, level-horizon sky at `1024x128` runtime size.
- Original 1990s pixel-art treatment and the same locked production palette.
- No text, logos, people, foreground objects, transparency, or modern lens effects.
- `sky_catastrophe-city`: flooded industrial skyline, red-black storm shelf, cyan response lights.
- `sky_actuarial-void`: cream probability void, black abyss, brass calculators, red wax monoliths, cyan arcs.

The builder performs a deterministic edge-band blend so the first and last panorama columns match after quantization.
