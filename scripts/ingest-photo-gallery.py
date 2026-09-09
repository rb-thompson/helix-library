#!/usr/bin/env python3
"""Copy images from a local photo-gallery folder into archive/images with hash dedupe.

Defaults:
  SRC = $HELIX_PHOTO_GALLERY_SRC or ~/Desktop/photo-gallery
  DST = <repo>/archive/images
"""
from __future__ import annotations
import hashlib, json, os, shutil
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SRC = Path(os.environ.get("HELIX_PHOTO_GALLERY_SRC", Path.home() / "Desktop" / "photo-gallery"))
DST = REPO / "archive" / "images"
IMG_EXT = {".jpg",".jpeg",".png",".webp",".gif",".heic",".avif",".tif",".tiff",".bmp"}

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    existing_by_hash: dict[str, str] = {}
    existing_names: set[str] = set()
    for p in DST.iterdir():
        if p.is_file() and p.suffix.lower() in IMG_EXT:
            existing_names.add(p.name.lower())
            try:
                existing_by_hash[sha256(p)] = p.name
            except OSError as e:
                print(f"hash fail {p}: {e}")
    copied, skipped_hash, renamed, errors = [], [], [], []
    if not SRC.is_dir():
        print(json.dumps({"error": f"SRC missing: {SRC}", "hint": "set HELIX_PHOTO_GALLERY_SRC"}, indent=2))
        return
    src_files = sorted(p for p in SRC.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXT)
    for p in src_files:
        try:
            digest = sha256(p)
        except OSError as e:
            errors.append((p.name, str(e)))
            continue
        if digest in existing_by_hash:
            skipped_hash.append((p.name, existing_by_hash[digest]))
            continue
        name = p.name
        if name.lower() in existing_names:
            stem, ext = p.stem, p.suffix
            i = 2
            while f"{stem}-{i}{ext}".lower() in existing_names:
                i += 1
            name = f"{stem}-{i}{ext}"
            renamed.append((p.name, name))
        shutil.copy2(p, DST / name)
        existing_names.add(name.lower())
        existing_by_hash[digest] = name
        copied.append(name)
    print(json.dumps({
        "src": str(SRC),
        "dst": str(DST),
        "src_count": len(src_files),
        "copied": len(copied),
        "skipped_dup_hash": len(skipped_hash),
        "renamed": renamed,
        "errors": errors,
        "archive_images_now": sum(1 for p in DST.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXT),
        "copied_sample": copied[:20],
        "dup_sample": skipped_hash[:15],
    }, indent=2))

if __name__ == "__main__":
    main()
