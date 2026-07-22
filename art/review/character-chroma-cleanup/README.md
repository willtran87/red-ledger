# Character Chroma Cleanup Review

This folder preserves non-destructive transparent-alpha extractions of the
latest built-in image-generation character previews for edge review. The
original keyed outputs remain in the built-in generation store and are not
duplicated in this repository. These review files are not referenced by the
shipping runtime.

## Source mapping

| Alpha review | Built-in generation output | Chroma key |
|---|---|---|
| `alpha/adjuster-brown-hair-turnaround-alpha.png` | `call_zH4eH3nIOqoab8xxpqiU6hQI.png` | magenta |
| `alpha/agent-silver-hair-turnaround-alpha.png` | `call_Nnkw3AwSqDtC5MlB6AcLdp6G.png` | green |
| `alpha/counsel-dark-hair-turnaround-alpha.png` | `call_vWHxcq6j68zDDaFePgbrrDa4.png` | green |
| `alpha/counsel-dark-hair-back-alpha.png` | `call_2UF8X3q7eSyOgqLvGopnDjwP.png` | green |
| `alpha/counsel-dark-hair-side-alpha.png` | `call_EbqyJ4bLWUuQQqOpuz1oqtBD.png` | green |

## Extraction settings

All five alpha files use the installed image-generation skill's
`remove_chroma_key.py` helper with border auto-key sampling, soft matte,
transparent threshold `12`, opaque threshold `220`, and despill. The
magenta-backed turnaround uses a two-pixel edge contraction; the four
green-backed sources use a one-pixel contraction.

`adjuster-edge-review.png` composites the corrected magenta-backed turnaround
over paper white, charcoal, cyan, and signal red. Automated review found zero
broadly magenta visible pixels, zero magenta edge pixels, and transparent
corners in every alpha output.

Run the reproducible check from the repository root:

```powershell
python art/review/character-chroma-cleanup/validate.py
```
