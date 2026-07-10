from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

from PIL import Image


TEXT_SUFFIXES = {
    ".html",
    ".css",
    ".js",
    ".json",
    ".md",
    ".txt",
    ".py",
}


def git_files() -> list[Path]:
    output = subprocess.check_output(["git", "ls-files"], text=True)
    return [Path(line.strip()) for line in output.splitlines() if line.strip()]


def converted_mapping_from_worktree(tracked: list[Path]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for path in tracked:
        if path.suffix.lower() != ".png" or path.exists():
            continue
        webp = path.with_suffix(".webp")
        if webp.exists():
            mapping[path.as_posix()] = webp.as_posix()
    return mapping


def visible_pixels_equal(original: Image.Image, converted: Image.Image) -> bool:
    left = original.convert("RGBA")
    right = converted.convert("RGBA")
    if left.size != right.size:
        return False
    return left.tobytes() == right.tobytes()


def archive_original(path: Path, archive_root: Path | None) -> None:
    if not path.exists():
        return
    if not archive_root:
        path.unlink()
        return
    destination = archive_root / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        destination.unlink()
    shutil.move(str(path), str(destination))


def convert_one(
    path: Path,
    min_savings_ratio: float,
    min_savings_bytes: int,
    dry_run: bool,
    archive_root: Path | None = None,
) -> tuple[bool, int]:
    out_path = path.with_suffix(".webp")
    original_size = path.stat().st_size
    with Image.open(path) as img:
        rgba = img.convert("RGBA")
        if not dry_run:
            rgba.save(out_path, "WEBP", lossless=True, quality=100, method=6, exact=True)
    if dry_run:
        return False, 0
    converted_size = out_path.stat().st_size
    savings = original_size - converted_size
    if savings < min_savings_bytes or converted_size >= original_size * (1 - min_savings_ratio):
        out_path.unlink(missing_ok=True)
        return False, 0
    with Image.open(out_path) as converted:
        if not visible_pixels_equal(rgba, converted):
            out_path.unlink(missing_ok=True)
            return False, 0
    archive_original(path, archive_root)
    return True, savings


def rewrite_references(mapping: dict[str, str], files: list[Path]) -> int:
    changed = 0
    for path in files:
        if path.suffix.lower() not in TEXT_SUFFIXES or not path.exists():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        updated = text
        for old, new in mapping.items():
            old_windows = old.replace("/", "\\")
            new_windows = new.replace("/", "\\")
            updated = updated.replace(old, new)
            updated = updated.replace(old_windows, new_windows)
            updated = updated.replace(f"../{old}", f"../{new}")
            updated = updated.replace(f"..\\{old_windows}", f"..\\{new_windows}")
        if updated != text:
            path.write_text(updated, encoding="utf-8", newline="")
            changed += 1
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description="Losslessly convert tracked PNG assets to smaller WebP files.")
    parser.add_argument("--root", default="assets", help="Root directory to scan.")
    parser.add_argument("--min-savings-ratio", type=float, default=0.08)
    parser.add_argument("--min-savings-bytes", type=int, default=512)
    parser.add_argument("--min-size-bytes", type=int, default=0)
    parser.add_argument("--max-count", type=int, default=0)
    parser.add_argument("--rewrite-existing", action="store_true")
    parser.add_argument("--archive-originals-root", default="", help="Move converted PNG originals under this root instead of deleting them.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    tracked = git_files()
    root = Path(args.root)
    if args.rewrite_existing:
        mapping = converted_mapping_from_worktree(tracked)
        rewritten = 0 if args.dry_run else rewrite_references(mapping, tracked + [Path("README.md"), Path("ART_DIRECTION.md")])
        print(f"Existing converted paths: {len(mapping)}")
        print(f"Reference files changed: {rewritten}")
        return

    pngs = [
        path
        for path in tracked
        if path.suffix.lower() == ".png"
        and root in path.parents
        and path.exists()
        and path.stat().st_size >= args.min_size_bytes
    ]
    pngs.sort(key=lambda path: path.stat().st_size, reverse=True)
    if args.max_count > 0:
        pngs = pngs[: args.max_count]
    mapping: dict[str, str] = {}
    total_savings = 0
    converted_count = 0
    skipped_count = 0
    archive_root = Path(args.archive_originals_root) if args.archive_originals_root else None
    for path in pngs:
        converted, savings = convert_one(path, args.min_savings_ratio, args.min_savings_bytes, args.dry_run, archive_root)
        if converted:
            converted_count += 1
            total_savings += savings
            old = path.as_posix()
            mapping[old] = path.with_suffix(".webp").as_posix()
        else:
            skipped_count += 1
    rewritten = 0 if args.dry_run else rewrite_references(mapping, tracked + [Path("README.md"), Path("ART_DIRECTION.md")])
    print(f"Scanned PNGs: {len(pngs)}")
    print(f"Converted: {converted_count}")
    print(f"Skipped: {skipped_count}")
    print(f"Reference files changed: {rewritten}")
    print(f"Estimated byte savings: {total_savings}")
    print(f"Estimated MB savings: {total_savings / (1024 * 1024):.2f}")


if __name__ == "__main__":
    main()
